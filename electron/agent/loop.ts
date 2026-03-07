/**
 * Lex Agent Loop
 *
 * Núcleo do agente autônomo.
 * Padrão: Objetivo → LOOP(Think → Act → Observe) → Resposta
 *
 * Inspirado no OpenClaw, simplificado para o contexto jurídico.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
    AgentState,
    AgentContext,
    AgentStep,
    AgentConfig,
    AgentEvent,
    ThinkDecision,
    SkillResult,
    DEFAULT_CONFIG,
    TenantConfig
} from './types';
import { think } from './think';
import { critic } from './critic';
import { executeSkill, getSkillsForPrompt } from './executor';
import { getMemory } from './memory';
import { getResponseCache } from './cache';
import { getSessionManager } from './session';
import { getStagehand } from '../stagehand-manager';

// Event emitter global para comunicação com UI
export const agentEmitter = new EventEmitter();

// A3: Registry de runs ativos para cancel/state
const activeRuns = new Map<string, { state: AgentState; abort: AbortController }>();

/**
 * Emite evento para a UI
 */
function emit(event: AgentEvent): void {
    agentEmitter.emit('agent-event', event);
    if (event.type === 'error') {
        console.error('[Agent]', event.erro);
    }
}

/**
 * Log condicional
 */
function log(verbose: boolean, ...args: any[]): void {
    if (verbose) {
        console.log('[Agent]', ...args);
    }
}

/**
 * Executa o Agent Loop
 *
 * @param objetivo - O que o usuário quer fazer
 * @param config - Configurações do loop
 * @param tenantConfig - Config do tenant (Prompt-Layer)
 * @returns Resposta final do agente
 */
export async function runAgentLoop(
    objetivo: string,
    config: Partial<AgentConfig> = {},
    tenantConfig?: TenantConfig,
    sessionId?: string   // A2: ID da sessão para multi-turn
): Promise<string> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const runId = randomUUID();
    const abort = new AbortController();

    // Carrega memória persistente em paralelo
    const memory = getMemory();
    const [memoriaData, usuarioData, interacoesSimilares] = await Promise.all([
        memory.carregar(),
        memory.getUsuario(),
        memory.buscarSimilares(objetivo, 3)
    ]);
    const preferredTribunal = normalizeTribunalCode(
        memoriaData.preferencias?.['tribunal_preferido'] || usuarioData.tribunal_preferido
    );

    // Inicializa estado
    const state: AgentState = {
        id: runId,
        objetivo,
        status: 'running',
        contexto: {
            documentos: [],
            resultados: new Map(),
            usuario: {
                ...usuarioData,
                ...(preferredTribunal ? { tribunal_preferido: preferredTribunal } : {})
            },
            ...(tenantConfig ? { tenantConfig } : {}),
            memoria: {
                ...memoriaData,
                interacoesSimilares: interacoesSimilares.map(i => ({
                    objetivo: i.objetivo,
                    sucesso: i.sucesso
                }))
            }
        },
        passos: [],
        iteracao: 0,
        startTime: Date.now()
    };

    // A3: Registra no registry
    activeRuns.set(runId, { state, abort });

    // A2: Carregar histórico da sessão (se houver)
    const sessionManager = getSessionManager();
    let activeSessionId: string | undefined;
    if (sessionId) {
        activeSessionId = sessionId;
        const session = sessionManager.getOrCreate(sessionId);
        const historyPrompt = sessionManager.formatHistoryForPrompt(sessionId);
        if (historyPrompt) {
            // Injeta histórico no contexto para uso pelo think.ts
            (state.contexto as any).chatHistory = historyPrompt;
        }
        // Registra mensagem do usuário na sessão
        sessionManager.addMessage(sessionId, 'user', objetivo);
    }

    log(cfg.verbose, `═══════════════════════════════════════════`);
    log(cfg.verbose, `Iniciando Agent Loop`);
    log(cfg.verbose, `Run ID: ${runId}`);
    log(cfg.verbose, `Objetivo: "${objetivo}"`);
    log(cfg.verbose, `Max iterações: ${cfg.maxIterations}`);
    log(cfg.verbose, `═══════════════════════════════════════════`);

    emit({ type: 'started', runId, objetivo });

    // B1: Verificar cache antes de entrar no loop
    const cache = getResponseCache();
    if (cache.shouldCache(objetivo)) {
        const cached = cache.get(objetivo);
        if (cached) {
            log(cfg.verbose, `✅ Resposta encontrada no cache!`);
            state.status = 'completed';
            state.endTime = Date.now();
            emit({ type: 'completed', resposta: cached, passos: 0, duracao: Date.now() - state.startTime });
            activeRuns.delete(runId);
            return cached;
        }
    }

    // Hook: beforeStart
    if (cfg.hooks?.beforeStart) {
        await cfg.hooks.beforeStart(state);
    }

    try {
        // ════════════════════════════════════════════════════════════════
        // MAIN LOOP
        // ════════════════════════════════════════════════════════════════
        while (state.status === 'running') {
            // A3: Verificar cancelamento
            if (abort.signal.aborted) {
                state.status = 'cancelled';
                state.endTime = Date.now();
                log(cfg.verbose, `🚫 Cancelado pelo usuário`);
                emit({ type: 'cancelled' });
                activeRuns.delete(runId);
                return 'Operação cancelada pelo usuário.';
            }

            // Verificar limites
            if (state.iteracao >= cfg.maxIterations) {
                log(cfg.verbose, `⚠️ Atingiu limite de ${cfg.maxIterations} iterações`);
                state.status = 'timeout';
                emit({ type: 'timeout' });
                activeRuns.delete(runId);
                return formatTimeoutResponse(state);
            }

            if (Date.now() - state.startTime > cfg.timeoutMs) {
                log(cfg.verbose, `⚠️ Timeout: ${cfg.timeoutMs}ms`);
                state.status = 'timeout';
                emit({ type: 'timeout' });
                activeRuns.delete(runId);
                return formatTimeoutResponse(state);
            }

            state.iteracao++;
            log(cfg.verbose, ``);
            log(cfg.verbose, `──────── Iteração ${state.iteracao} ────────`);

            // ════════════════════════════════════════════════════════════
            // FASE 1: THINK (Raciocínio)
            // ════════════════════════════════════════════════════════════
            log(cfg.verbose, `🧠 Pensando...`);
            const thinkStart = Date.now();

            // Sinaliza UI para criar bubble vazia antes de receber tokens
            emit({ type: 'streaming_start' });

            // Callback de token: emitido apenas para tokens do campo "resposta" do JSON
            const onStreamToken = (token: string) => {
                emit({ type: 'token', token });
            };

            const decisao = await think(state, cfg, onStreamToken);

            const thinkDuration = Date.now() - thinkStart;

            // Registra passo
            const thinkStep: AgentStep = {
                iteracao: state.iteracao,
                timestamp: new Date().toISOString(),
                tipo: 'think',
                pensamento: decisao.pensamento,
                decisao,
                duracao: thinkDuration
            };
            state.passos.push(thinkStep);

            emit({ type: 'thinking', pensamento: decisao.pensamento, iteracao: state.iteracao });

            log(cfg.verbose, `💭 Pensamento: ${decisao.pensamento.substring(0, 100)}...`);
            log(cfg.verbose, `📋 Decisão: ${decisao.tipo}`);

            // Hook: afterThink
            if (cfg.hooks?.afterThink) {
                await cfg.hooks.afterThink(state, decisao);
            }

            // ════════════════════════════════════════════════════════════
            // FASE 2: PROCESSAR DECISÃO
            // ════════════════════════════════════════════════════════════
            switch (decisao.tipo) {
                // ────────────────────────────────────────────────────────
                // RESPOSTA FINAL
                // ────────────────────────────────────────────────────────
                case 'resposta': {
                    state.status = 'completed';
                    state.endTime = Date.now();
                    const duracao = state.endTime - state.startTime;

                    log(cfg.verbose, `✅ Objetivo completo em ${state.iteracao} passos (${duracao}ms)`);

                    // Salva interação na memória
                    await memory.salvarInteracao({
                        objetivo,
                        resposta: decisao.resposta!,
                        passos: state.iteracao,
                        duracao,
                        sucesso: true
                    });

                    // Registra aprendizado quando skills PJe foram usadas
                    const pjeSkills = state.passos
                        .filter(p => p.tipo === 'act' && p.skill?.startsWith('pje_'))
                        .map(p => p.skill!);
                    if (pjeSkills.length > 0) {
                        const tribunal = state.contexto.usuario?.tribunal_preferido || '';
                        const skills = [...new Set(pjeSkills)].join(', ');
                        const label = tribunal ? `[${tribunal}] ` : '';
                        memory.addAprendizado(
                            `${label}"${objetivo.substring(0, 60)}" → ${skills}`
                        ).catch(() => {});
                    }

                    emit({
                        type: 'completed',
                        resposta: decisao.resposta!,
                        passos: state.iteracao,
                        duracao
                    });

                    // Hook: onComplete
                    if (cfg.hooks?.onComplete) {
                        await cfg.hooks.onComplete(state, decisao.resposta!);
                    }

                    activeRuns.delete(runId);

                    // B1: Salvar no cache apenas se nenhuma skill foi executada
                    // (respostas após ações reais nunca devem ser cacheadas)
                    const skillsExecuted = state.passos.some(p => p.tipo === 'act');
                    if (!skillsExecuted && cache.shouldCache(objetivo)) {
                        cache.set(objetivo, decisao.resposta!);
                    }

                    // A2: Salvar resposta na sessão
                    if (activeSessionId) {
                        sessionManager.addMessage(activeSessionId, 'assistant', decisao.resposta!, {
                            runId,
                            skillsUsed: state.passos
                                .filter(p => p.tipo === 'act' && p.skill)
                                .map(p => p.skill!)
                        });
                    }

                    return decisao.resposta!;
                }

                // ────────────────────────────────────────────────────────
                // PERGUNTA AO USUÁRIO
                // ────────────────────────────────────────────────────────
                case 'pergunta': {
                    state.status = 'waiting_user';

                    log(cfg.verbose, `❓ Aguardando usuário: ${decisao.pergunta}`);

                    emit({
                        type: 'waiting_user',
                        pergunta: decisao.pergunta!,
                        ...(decisao.opcoes ? { opcoes: decisao.opcoes } : {})
                    });

                    if (activeSessionId) {
                        sessionManager.addMessage(activeSessionId, 'assistant', decisao.pergunta!);
                    }

                    // Retorna pergunta (UI deve lidar com continuação)
                    return `❓ ${decisao.pergunta}`;
                }

                // ────────────────────────────────────────────────────────
                // EXECUTAR SKILL
                // ────────────────────────────────────────────────────────
                case 'skill': {
                    let skillName = decisao.skill!;
                    let params = decisao.parametros || {};

                    // Guard: detecta loop infinito (mesma skill + mesmos params que o último ACT)
                    const lastAct = [...state.passos].reverse().find(p => p.tipo === 'act');
                    if (
                        lastAct &&
                        lastAct.skill === skillName &&
                        JSON.stringify(lastAct.parametros) === JSON.stringify(params)
                    ) {
                        state.status = 'waiting_user';
                        const question = `Detectei que estou repetindo a mesma ação ("${skillName}") com os mesmos parâmetros. Quer tentar uma abordagem diferente ou devo tentar novamente?`;
                        emit({ type: 'waiting_user', pergunta: question, opcoes: ['Tente novamente', 'Tente outra abordagem', 'Cancelar'] });
                        if (activeSessionId) {
                            sessionManager.addMessage(activeSessionId, 'assistant', question);
                        }
                        activeRuns.delete(runId);
                        return `❓ ${question}`;
                    }

                    if (cfg.enableCritic) {
                        log(cfg.verbose, 'Critic: revisando acao planejada...');
                        const criticStart = Date.now();
                        const criticDecision = await critic(state, { skill: skillName, parametros: params }, cfg);
                        const criticDuration = Date.now() - criticStart;

                        const criticStep: AgentStep = {
                            iteracao: state.iteracao,
                            timestamp: new Date().toISOString(),
                            tipo: 'critic',
                            critic: criticDecision,
                            duracao: criticDuration
                        };
                        state.passos.push(criticStep);

                        emit({ type: 'criticizing', decision: criticDecision, iteracao: state.iteracao });
                        emit({
                            type: 'thinking',
                            pensamento: `[Critic] ${criticDecision.reason}`,
                            iteracao: state.iteracao
                        });

                        if (cfg.hooks?.afterCritic) {
                            await cfg.hooks.afterCritic(state, criticDecision);
                        }

                        if (!criticDecision.approved || criticDecision.requiresUserConfirmation) {
                            state.status = 'waiting_user';
                            const question = criticDecision.suggestedQuestion
                                || `A ação "${skillName}" foi retida pelo critic: ${criticDecision.reason}`;
                            emit({
                                type: 'waiting_user',
                                pergunta: question,
                                opcoes: ['Sim, confirmar', 'Cancelar']
                            });
                            if (activeSessionId) {
                                sessionManager.addMessage(activeSessionId, 'assistant', question);
                            }
                            return `❓ ${question}`;
                        }

                        if (criticDecision.correctedDecision?.skill) {
                            skillName = criticDecision.correctedDecision.skill;
                            if (criticDecision.correctedDecision.parametros) {
                                params = criticDecision.correctedDecision.parametros;
                            }
                            log(cfg.verbose, `Critic: acao ajustada para ${skillName}`);
                        }
                    }

                    log(cfg.verbose, `🔧 Executando: ${skillName}`);

                    // Hook: beforeToolCall
                    if (cfg.hooks?.beforeToolCall) {
                        params = await cfg.hooks.beforeToolCall(skillName, params);
                    }
                    params = applyTribunalContinuity(state, skillName, params);

                    // Registra ação
                    const actStep: AgentStep = {
                        iteracao: state.iteracao,
                        timestamp: new Date().toISOString(),
                        tipo: 'act',
                        skill: skillName,
                        parametros: params
                    };
                    state.passos.push(actStep);

                    emit({ type: 'acting', skill: skillName, parametros: params });

                    // ════════════════════════════════════════════════════
                    // FASE 3: ACT (Execução)
                    // ════════════════════════════════════════════════════
                    const actStart = Date.now();
                    let resultado = await executeSkill(skillName, params, state.contexto);
                    const actDuration = Date.now() - actStart;

                    // Hook: afterToolCall
                    if (cfg.hooks?.afterToolCall) {
                        resultado = await cfg.hooks.afterToolCall(skillName, resultado);
                    }

                    emit({ type: 'tool_result', skill: skillName, resultado });

                    log(cfg.verbose, `${resultado.sucesso ? '✓' : '✗'} Resultado em ${actDuration}ms`);

                    // ════════════════════════════════════════════════════
                    // FASE 4: OBSERVE (Observação)
                    // ════════════════════════════════════════════════════
                    const observeStep: AgentStep = {
                        iteracao: state.iteracao,
                        timestamp: new Date().toISOString(),
                        tipo: 'observe',
                        resultado,
                        duracao: actDuration
                    };
                    state.passos.push(observeStep);

                    // Atualiza contexto com resultado
                    await updateContext(state, skillName, resultado);

                    const observacao = resultado.sucesso
                        ? `Skill ${skillName} executada com sucesso`
                        : `Skill ${skillName} falhou: ${resultado.erro}`;

                    emit({ type: 'observing', observacao });

                    log(cfg.verbose, `👁️ ${observacao}`);

                    if (shouldPauseForUserAction(resultado)) {
                        state.status = 'waiting_user';
                        const question = extractUserActionQuestion(resultado);
                        emit({ type: 'waiting_user', pergunta: question });
                        if (activeSessionId) {
                            sessionManager.addMessage(activeSessionId, 'assistant', question);
                        }
                        return `❓ ${question}`;
                    }

                    break;
                }
            }
        }

        // Não deveria chegar aqui
        return 'Loop encerrado inesperadamente.';

    } catch (error: any) {
        state.status = 'error';
        state.endTime = Date.now();

        log(true, `❌ Erro: ${error.message}`);
        emit({ type: 'error', erro: error.message, recuperavel: false });

        // Hook: onError
        if (cfg.hooks?.onError) {
            await cfg.hooks.onError(state, error);
        }

        activeRuns.delete(runId);
        return `Desculpe, ocorreu um erro: ${error.message}`;
    }
}

/**
 * Atualiza contexto com resultado da skill
 */
async function updateContext(state: AgentState, skill: string, resultado: SkillResult): Promise<void> {
    if (!resultado.sucesso || !resultado.dados) return;

    // Armazena resultado
    state.contexto.resultados.set(skill, resultado.dados);

    // Atualiza contexto específico baseado no tipo de skill
    if (skill.startsWith('pje_') && resultado.dados.processo) {
        state.contexto.processo = resultado.dados.processo;

        // Registra processo na memória persistente
        const numero = resultado.dados.processo?.numero;
        if (numero) {
            getMemory().registrarProcesso(numero).catch(() => {});
        }
    }

    if (skill.includes('documento') && resultado.dados.documento) {
        state.contexto.documentos.push(resultado.dados.documento);
    }

    if (skill.startsWith('pje_')) {
        const tribunal = extractTribunalFromData(resultado.dados);
        if (tribunal) {
            state.contexto.usuario = {
                ...(state.contexto.usuario || {}),
                tribunal_preferido: tribunal
            };

            if (state.contexto.memoria) {
                state.contexto.memoria.preferencias = {
                    ...(state.contexto.memoria.preferencias || {}),
                    tribunal_preferido: tribunal
                };
            }

            try {
                await getMemory().setPreferencia('tribunal_preferido', tribunal);
            } catch (error: any) {
                console.warn('[Agent] Falha ao persistir tribunal preferido:', error?.message || error);
            }
        }
    }
}

function applyTribunalContinuity(
    state: AgentState,
    skill: string,
    params: Record<string, any>
): Record<string, any> {
    const skillLower = String(skill || '').toLowerCase();
    if (!skillLower.startsWith('pje_')) {
        return params;
    }

    const explicitTribunal = normalizeTribunalCode(params['tribunal']);
    if (explicitTribunal) {
        return params;
    }

    const objectiveTribunal = inferTribunalFromText(state.objetivo);
    const contextualTribunal = inferTribunalFromContext(state);
    const resolvedTribunal = objectiveTribunal || contextualTribunal;

    if (!resolvedTribunal) {
        return params;
    }

    return {
        ...params,
        tribunal: resolvedTribunal
    };
}

function inferTribunalFromContext(state: AgentState): string | null {
    // Maior prioridade: URL ativa no Chrome (Stagehand)
    try {
        const page = getStagehand().context.pages()[0];
        const activeUrl = page?.url();
        if (activeUrl) {
            const fromActiveUrl = inferTribunalFromText(activeUrl);
            if (fromActiveUrl) return fromActiveUrl;
        }
    } catch { /* Stagehand pode não estar pronto ainda */ }

    const processTribunal = normalizeTribunalCode(state.contexto.processo?.tribunal);
    if (processTribunal) return processTribunal;

    const pjeAbrirResult = state.contexto.resultados.get('pje_abrir');
    const fromOpenSkill = extractTribunalFromData(pjeAbrirResult);
    if (fromOpenSkill) return fromOpenSkill;

    const pjeConsultarResult = state.contexto.resultados.get('pje_consultar');
    const fromConsultSkill = extractTribunalFromData(pjeConsultarResult);
    if (fromConsultSkill) return fromConsultSkill;

    const userPreferred = normalizeTribunalCode(state.contexto.usuario?.tribunal_preferido);
    if (userPreferred) return userPreferred;

    const memoryPreferred = normalizeTribunalCode(state.contexto.memoria?.preferencias?.['tribunal_preferido']);
    if (memoryPreferred) return memoryPreferred;

    return null;
}

function extractTribunalFromData(data: any): string | null {
    if (!data || typeof data !== 'object') return null;

    const directTribunal = normalizeTribunalCode(data.tribunal);
    if (directTribunal) return directTribunal;

    const processTribunal = normalizeTribunalCode(data?.processo?.tribunal);
    if (processTribunal) return processTribunal;

    const urlTribunal = inferTribunalFromText(String(data.url || ''));
    if (urlTribunal) return urlTribunal;

    return null;
}

function inferTribunalFromText(textRaw: string): string | null {
    const text = String(textRaw || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s\-_]+/g, '');

    if (!text) return null;
    if (text.includes('trt8') || text.includes('pje.trt8.jus.br')) return 'TRT8';
    if (text.includes('trf1') || text.includes('pje1g.trf1.jus.br')) return 'TRF1';
    if (text.includes('tjpa') || text.includes('pje.tjpa.jus.br')) return 'TJPA';

    const trtMatch = text.match(/trt\d{1,2}/);
    if (trtMatch && trtMatch[0]) return trtMatch[0].toUpperCase();

    const trfMatch = text.match(/trf\d/);
    if (trfMatch && trfMatch[0]) return trfMatch[0].toUpperCase();

    const tjMatch = text.match(/tj[a-z]{2}/);
    if (tjMatch && tjMatch[0]) return tjMatch[0].toUpperCase();

    const treMatch = text.match(/tre[a-z0-9]{1,2}/);
    if (treMatch && treMatch[0]) return treMatch[0].toUpperCase();

    return null;
}

function normalizeTribunalCode(value: unknown): string | null {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');

    if (!normalized) return null;
    if (normalized.includes('trt8')) return 'TRT8';
    if (normalized.includes('trf1')) return 'TRF1';
    if (normalized.includes('tjpa')) return 'TJPA';
    return normalized.toUpperCase();
}

/**
 * Formata resposta de timeout
 */
function formatTimeoutResponse(state: AgentState): string {
    const skillsExecutadas = state.passos
        .filter(p => p.tipo === 'act')
        .map(p => `• ${p.skill}`)
        .join('\n');

    return `Atingi o limite de ${state.iteracao} passos. Aqui está o que consegui fazer:\n\n${skillsExecutadas || '(nenhuma skill executada)'}\n\nPosso continuar de onde parei se você quiser.`;
}

/**
 * Cancela um loop em execução (A3)
 */
export function cancelAgentLoop(runId?: string): boolean {
    if (runId) {
        const run = activeRuns.get(runId);
        if (run) {
            run.abort.abort();
            log(true, `Cancelando run: ${runId}`);
            return true;
        }
        return false;
    }

    // Cancela todos os runs ativos
    if (activeRuns.size === 0) return false;
    activeRuns.forEach((run, id) => {
        run.abort.abort();
        log(true, `Cancelando run: ${id}`);
    });
    return true;
}

/**
 * Obtém estado atual de um loop (A3)
 */
export function getAgentState(runId: string): AgentState | null {
    return activeRuns.get(runId)?.state ?? null;
}

/**
 * Lista todos os runs ativos
 */
export function listActiveRuns(): Array<{ runId: string; objetivo: string; iteracao: number }> {
    const runs: Array<{ runId: string; objetivo: string; iteracao: number }> = [];
    activeRuns.forEach((run, id) => {
        runs.push({ runId: id, objetivo: run.state.objetivo, iteracao: run.state.iteracao });
    });
    return runs;
}

function shouldPauseForUserAction(resultado: SkillResult): boolean {
    if (!resultado || resultado.sucesso) return false;
    if (!resultado.dados || typeof resultado.dados !== 'object') return false;
    return Boolean((resultado.dados as any).requiresUserAction);
}

function extractUserActionQuestion(resultado: SkillResult): string {
    if (resultado.dados && typeof resultado.dados === 'object') {
        const dados = resultado.dados as any;
        const fromData = typeof dados.question === 'string' ? dados.question.trim() : '';
        if (fromData) return fromData;
    }

    if (typeof resultado.mensagem === 'string' && resultado.mensagem.trim()) {
        return resultado.mensagem.trim();
    }

    return 'Preciso de uma ação sua para continuar. Depois me responda "pronto".';
}
