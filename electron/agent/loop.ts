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

    // Carrega memória persistente
    const memory = getMemory();
    const memoriaData = await memory.carregar();

    // Inicializa estado
    const state: AgentState = {
        id: runId,
        objetivo,
        status: 'running',
        contexto: {
            documentos: [],
            resultados: new Map(),
            ...(tenantConfig ? { tenantConfig } : {}),
            memoria: memoriaData
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

            const decisao = await think(state, cfg);

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

                    // B1: Salvar no cache (apenas respostas diretas)
                    if (cache.shouldCache(objetivo)) {
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

                    // Retorna pergunta (UI deve lidar com continuação)
                    return `❓ ${decisao.pergunta}`;
                }

                // ────────────────────────────────────────────────────────
                // EXECUTAR SKILL
                // ────────────────────────────────────────────────────────
                case 'skill': {
                    let skillName = decisao.skill!;
                    let params = decisao.parametros || {};

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
                                || `A acao "${skillName}" foi retida pelo critic: ${criticDecision.reason}`;
                            emit({ type: 'waiting_user', pergunta: question });
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
                    updateContext(state, skillName, resultado);

                    const observacao = resultado.sucesso
                        ? `Skill ${skillName} executada com sucesso`
                        : `Skill ${skillName} falhou: ${resultado.erro}`;

                    emit({ type: 'observing', observacao });

                    log(cfg.verbose, `👁️ ${observacao}`);

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
function updateContext(state: AgentState, skill: string, resultado: SkillResult): void {
    if (!resultado.sucesso || !resultado.dados) return;

    // Armazena resultado
    state.contexto.resultados.set(skill, resultado.dados);

    // Atualiza contexto específico baseado no tipo de skill
    if (skill.startsWith('pje_') && resultado.dados.processo) {
        state.contexto.processo = resultado.dados.processo;
    }

    if (skill.includes('documento') && resultado.dados.documento) {
        state.contexto.documentos.push(resultado.dados.documento);
    }
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
