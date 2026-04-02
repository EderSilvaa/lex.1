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
    AgentStep,
    AgentConfig,
    AgentEvent,
    AgentLoopOptions,
    SkillResult,
    DEFAULT_CONFIG,
} from './types';
import { think, clearPromptCache } from './think';
import { critic } from './critic';
import { requiresDualValidation, validateWithDualAgent, validationToCriticDecision } from './validator-agent';
import { executeSkill } from './executor';
import { getMemory } from './memory';
import { getBrainSafe } from '../brain';
import { getContextBudget } from './context-budget';
import { getResponseCache } from './cache';
import { getSessionManager } from './session';
import { getActivePage } from '../browser-manager';
import { getDocIndex } from './doc-index';
import { normalizeTribunalCode, inferTribunalKey } from '../pje/tribunal-urls';
import { getAnalytics } from '../analytics';
import { getActiveConfig, setActiveConfig, PROVIDER_PRESETS, type ActiveProviderConfig } from '../provider-config';
import {
    createVault, clearVault, unmask, getVaultStats, getVaultSummary,
    shouldMaskPII, shouldUseLocalModel,
} from '../privacy';
import type { PIIVault } from '../privacy';

// Event emitter global para comunicação com UI
export const agentEmitter = new EventEmitter();

// ============================================================================
// PRIVACY ROUTING
// ============================================================================

interface PrivacyContext {
    vault: PIIVault | undefined;
    /** Restaura provider original e limpa vault. Chamar no finally do run. */
    cleanup: () => void;
}

/**
 * Configura privacy para o run: cria PII vault e auto-redireciona
 * para Ollama (level 0) se necessário. Retorna cleanup para o finally.
 */
function setupPrivacy(): PrivacyContext {
    const activeProviderId = getActiveConfig().providerId;
    const privacyEnabled = shouldMaskPII(activeProviderId);
    const vault = privacyEnabled ? createVault() : undefined;

    // Privacy level 0: auto-route to Ollama (nothing leaves the machine)
    let prevConfig: ActiveProviderConfig | undefined;
    if (shouldUseLocalModel(activeProviderId) && activeProviderId !== 'ollama') {
        prevConfig = { ...getActiveConfig() };
        const ollPreset = PROVIDER_PRESETS.ollama;
        setActiveConfig({
            providerId: 'ollama',
            apiKey: 'ollama',
            agentModel: ollPreset.defaultAgentModel,
            visionModel: ollPreset.defaultVisionModel,
        });
        console.log('[Agent] Privacy level 0 → auto-routing to Ollama');
    }

    return {
        vault,
        cleanup() {
            if (vault) clearVault(vault);
            if (prevConfig) {
                setActiveConfig(prevConfig);
                console.log('[Agent] Provider restaurado para', prevConfig.providerId);
            }
        },
    };
}

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
export async function runAgentLoop(opts: AgentLoopOptions): Promise<string> {
    const { objetivo, config = {}, tenantConfig, sessionId, agentSpec, parentAbort } = opts;
    const cfg = { ...DEFAULT_CONFIG, ...config, ...(agentSpec?.configOverrides || {}) };
    const runId = randomUUID();
    const abort = new AbortController();

    // P0 Fix 4: Encadeia parent abort → child abort
    let parentCleanup: (() => void) | undefined;
    if (parentAbort) {
        if (parentAbort.aborted) return 'Operação cancelada.';
        const onParentAbort = () => abort.abort();
        parentAbort.addEventListener('abort', onParentAbort, { once: true });
        parentCleanup = () => parentAbort.removeEventListener('abort', onParentAbort);
    }

    // Carrega memória persistente e RAG em paralelo
    const memory = getMemory();
    const brain = getBrainSafe();
    const docIndex = getDocIndex();
    const [memoriaData, usuarioData, interacoesSimilares, ragResultados] = await Promise.all([
        memory.carregar(),
        memory.getUsuario(),
        memory.buscarSimilares(objetivo, 3),
        Promise.resolve(docIndex.buscarContexto(objetivo, 4))
    ]);
    const preferredTribunal = normalizeTribunalCode(
        memoriaData.preferencias?.['tribunal_preferido'] || usuarioData.tribunal_preferido
    );

    // Privacy: vault + auto-route to Ollama se level 0
    const privacy = setupPrivacy();
    const vault = privacy.vault;

    // Inicializa estado
    const state: AgentState = {
        id: runId,
        objetivo,
        status: 'running',
        piiVault: vault,
        contexto: {
            documentos: [],
            resultados: {},
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
            },
            ...(ragResultados.length > 0 ? { ragContexto: ragResultados } : {})
        },
        passos: [],
        iteracao: 0,
        startTime: Date.now()
    };

    // Brain context (FTS5) — prioridade sobre memória legada
    if (brain) {
        try {
            const brainCtx = brain.getContext(objetivo, getContextBudget());
            if (brainCtx.text) {
                state.contexto.brainContext = brainCtx.text;
            }
        } catch (err) {
            console.warn('[Agent] Brain getContext falhou, usando memória legada:', err);
        }
    }

    // A3: Registra no registry
    activeRuns.set(runId, { state, abort });

    // A2: Carregar histórico da sessão (se houver)
    const sessionManager = getSessionManager();
    let activeSessionId: string | undefined;
    if (sessionId) {
        activeSessionId = sessionId;
        const session = sessionManager.getOrCreate(sessionId);
        const historyPrompt = await sessionManager.formatHistoryWithSummary(sessionId);
        if (historyPrompt) {
            // Injeta histórico no contexto para uso pelo think.ts
            state.contexto.chatHistory = historyPrompt;
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

    // Analytics: rastreia mensagem e provider
    const analytics = getAnalytics();
    analytics.trackMessage();
    const providerCfg = getActiveConfig();
    analytics.trackProvider(providerCfg.providerId, providerCfg.agentModel);

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
            parentCleanup?.();
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
                const cancelMsg = 'Operação cancelada pelo usuário.';
                if (activeSessionId) sessionManager.addMessage(activeSessionId, 'assistant', cancelMsg);
                return cancelMsg;
            }

            // Verificar limites
            if (state.iteracao >= cfg.maxIterations) {
                log(cfg.verbose, `⚠️ Atingiu limite de ${cfg.maxIterations} iterações`);
                state.status = 'timeout';
                emit({ type: 'timeout' });
                activeRuns.delete(runId);
                const timeoutMsg = formatTimeoutResponse(state);
                if (activeSessionId) sessionManager.addMessage(activeSessionId, 'assistant', timeoutMsg);
                return timeoutMsg;
            }

            if (Date.now() - state.startTime > cfg.timeoutMs) {
                log(cfg.verbose, `⚠️ Timeout: ${cfg.timeoutMs}ms`);
                state.status = 'timeout';
                emit({ type: 'timeout' });
                activeRuns.delete(runId);
                const timeoutMsg = formatTimeoutResponse(state);
                if (activeSessionId) sessionManager.addMessage(activeSessionId, 'assistant', timeoutMsg);
                return timeoutMsg;
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
            // PII Vault: unmask tokens antes de emitir para a UI
            const onStreamToken = (token: string) => {
                const unmasked = vault ? unmask(vault, token) : token;
                emit({ type: 'token', token: unmasked });
            };

            const decisao = await think(state, cfg, onStreamToken, agentSpec);

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

                    // PII Vault: unmask resposta final antes de exibir ao usuário
                    if (vault && decisao.resposta) {
                        decisao.resposta = unmask(vault, decisao.resposta);
                    }

                    // Privacy: emitir stats de mascaramento
                    if (vault) {
                        const stats = getVaultStats(vault);
                        if (stats.totalMasked > 0) {
                            log(cfg.verbose, `🔒 PII mascaradas: ${stats.totalMasked} entidades`);
                            emit({
                                type: 'privacy_stats',
                                stats: getVaultSummary(vault)
                            });
                        }
                    }

                    log(cfg.verbose, `✅ Objetivo completo em ${state.iteracao} passos (${duracao}ms)`);

                    // Salva interação na memória (legacy + brain)
                    await memory.salvarInteracao({
                        objetivo,
                        resposta: decisao.resposta!,
                        passos: state.iteracao,
                        duracao,
                        sucesso: true
                    });
                    if (brain) {
                        try {
                            brain.saveInteraction({
                                objetivo,
                                resposta: decisao.resposta!,
                                passos: state.iteracao,
                                duracao,
                                sucesso: true,
                            });
                        } catch (e) { console.warn('[Agent] Brain saveInteraction falhou:', e); }
                    }

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
                        if (brain) {
                            try { brain.addAprendizado(`${label}"${objetivo.substring(0, 60)}" → ${skills}`); }
                            catch (e) { /* non-critical */ }
                        }
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

                        // Premium: extração de facts + promoção cross-session (async, non-blocking)
                        sessionManager.extractAndStoreFacts(activeSessionId).catch(e =>
                            console.warn('[Agent] Fact extraction failed:', e.message)
                        );
                        sessionManager.promoteCrossSessionFacts(activeSessionId, memory, brain ?? undefined).catch(e =>
                            console.warn('[Agent] Cross-session promotion failed:', e.message)
                        );
                    }

                    // Legal Extractor: extrai citações jurídicas e salva no store (async, non-blocking)
                    try {
                        const { extractAndSave } = require('../legal/legal-extractor');
                        extractAndSave(decisao.resposta!);
                    } catch { /* legal extractor optional */ }

                    // Brain: incrementa dream session count
                    if (brain) {
                        try { brain.incrementDreamSessionCount(); }
                        catch (e) { /* non-critical */ }
                    }

                    return decisao.resposta!;
                }

                // ────────────────────────────────────────────────────────
                // PERGUNTA AO USUÁRIO
                // ────────────────────────────────────────────────────────
                case 'pergunta': {
                    state.status = 'waiting_user';

                    // PII Vault: unmask pergunta antes de exibir
                    if (vault && decisao.pergunta) {
                        decisao.pergunta = unmask(vault, decisao.pergunta);
                    }

                    log(cfg.verbose, `❓ Aguardando usuário: ${decisao.pergunta}`);

                    emit({
                        type: 'waiting_user',
                        pergunta: decisao.pergunta!,
                        ...(decisao.opcoes ? { opcoes: decisao.opcoes } : {})
                    });

                    if (activeSessionId) {
                        sessionManager.addMessage(activeSessionId, 'assistant', decisao.pergunta!);

                        // Premium: extração de facts (async, non-blocking)
                        sessionManager.extractAndStoreFacts(activeSessionId).catch(e =>
                            console.warn('[Agent] Fact extraction failed:', e.message)
                        );
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

                    // Guard: detecta loop infinito (repetição ou ciclo nas últimas N ações)
                    const loopDetected = detectSkillLoop(state.passos, skillName, params);
                    if (loopDetected) {
                        state.status = 'waiting_user';
                        const question = `Detectei que estou repetindo ações (${loopDetected}). Quer tentar uma abordagem diferente ou devo tentar novamente?`;
                        emit({ type: 'waiting_user', pergunta: question, opcoes: ['Tente novamente', 'Tente outra abordagem', 'Cancelar'] });
                        if (activeSessionId) {
                            sessionManager.addMessage(activeSessionId, 'assistant', question);
                        }
                        activeRuns.delete(runId);
                        return `❓ ${question}`;
                    }

                    if (cfg.enableCritic) {
                        const criticResult = await applyCritic(state, skillName, params, cfg);

                        // Critic bloqueou → pergunta ao usuário
                        if (criticResult.blocked) {
                            state.status = 'waiting_user';
                            emit({
                                type: 'waiting_user',
                                pergunta: criticResult.blocked,
                                opcoes: ['Sim, confirmar', 'Cancelar']
                            });
                            if (activeSessionId) {
                                sessionManager.addMessage(activeSessionId, 'assistant', criticResult.blocked);
                            }
                            return `❓ ${criticResult.blocked}`;
                        }

                        // Critic pode ter corrigido skill/params
                        skillName = criticResult.skillName;
                        params = criticResult.params;
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
                    let resultado = await executeSkill(skillName, params, state.contexto, abort.signal);
                    const actDuration = Date.now() - actStart;

                    // Hook: afterToolCall
                    if (cfg.hooks?.afterToolCall) {
                        resultado = await cfg.hooks.afterToolCall(skillName, resultado);
                    }

                    emit({ type: 'tool_result', skill: skillName, resultado });

                    // Analytics: rastreia uso da skill
                    analytics.trackSkill(skillName, resultado.sucesso);

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
        const errorMsg = `Desculpe, ocorreu um erro: ${error.message}`;
        if (activeSessionId) sessionManager.addMessage(activeSessionId, 'assistant', errorMsg);
        return errorMsg;
    } finally {
        // Limpa cache de prompt estático deste run
        clearPromptCache(runId);
        // Garante que sessão é salva em disco independente do exit path
        if (activeSessionId) {
            try { await sessionManager.flush(); } catch { /* best-effort */ }
        }
        // P0 Fix 4: cleanup parent abort listener
        parentCleanup?.();
        // Privacy: limpa vault + restaura provider original
        privacy.cleanup();
        state.piiVault = undefined;
    }
}

/**
 * Atualiza contexto com resultado da skill
 */
async function updateContext(state: AgentState, skill: string, resultado: SkillResult): Promise<void> {
    if (!resultado.sucesso || !resultado.dados) return;

    // Armazena resultado
    state.contexto.resultados[skill] = resultado.dados;

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
    // Maior prioridade: URL ativa no Chrome (Playwright CDP)
    try {
        const page = getActivePage();
        const activeUrl = page?.url();
        if (activeUrl) {
            const fromActiveUrl = inferTribunalFromText(activeUrl);
            if (fromActiveUrl) return fromActiveUrl;
        }
    } catch { /* Browser pode não estar pronto ainda */ }

    const processTribunal = normalizeTribunalCode(state.contexto.processo?.tribunal);
    if (processTribunal) return processTribunal;

    const pjeAbrirResult = state.contexto.resultados['pje_abrir'];
    const fromOpenSkill = extractTribunalFromData(pjeAbrirResult);
    if (fromOpenSkill) return fromOpenSkill;

    const pjeConsultarResult = state.contexto.resultados['pje_consultar'];
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

// normalizeTribunalCode e inferTribunalKey importados de ../pje/tribunal-urls

function inferTribunalFromText(textRaw: string): string | null {
    const key = inferTribunalKey(textRaw);
    return key ? key.toUpperCase() : null;
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

// ============================================================================
// LOOP DETECTION
// ============================================================================

// ============================================================================
// CRITIC
// ============================================================================

interface CriticResult {
    skillName: string;
    params: Record<string, any>;
    /** Se definido, o critic bloqueou a ação — valor é a pergunta para o usuário */
    blocked?: string;
}

/**
 * Avalia a ação planejada via critic. Retorna skill/params (possivelmente corrigidos)
 * ou `blocked` com a pergunta para o usuário se o critic reprovou.
 */
async function applyCritic(
    state: AgentState,
    skillName: string,
    params: Record<string, any>,
    cfg: AgentConfig
): Promise<CriticResult> {
    log(cfg.verbose, 'Critic: revisando acao planejada...');
    const criticStart = Date.now();
    const criticDecision = await critic(state, { skill: skillName, parametros: params }, cfg);
    const criticDuration = Date.now() - criticStart;

    // Registra passo
    state.passos.push({
        iteracao: state.iteracao,
        timestamp: new Date().toISOString(),
        tipo: 'critic',
        critic: criticDecision,
        duracao: criticDuration
    });

    emit({ type: 'criticizing', decision: criticDecision, iteracao: state.iteracao });
    emit({
        type: 'thinking',
        pensamento: `[Critic] ${criticDecision.reason}`,
        iteracao: state.iteracao
    });

    // Hook
    if (cfg.hooks?.afterCritic) {
        await cfg.hooks.afterCritic(state, criticDecision);
    }

    // Bloqueado ou requer confirmação
    if (!criticDecision.approved || criticDecision.requiresUserConfirmation) {
        const question = criticDecision.suggestedQuestion
            || `A ação "${skillName}" foi retida pelo critic: ${criticDecision.reason}`;
        return { skillName, params, blocked: question };
    }

    // Correção de skill/params
    let finalSkill = skillName;
    let finalParams = params;
    if (criticDecision.correctedDecision?.skill) {
        finalSkill = criticDecision.correctedDecision.skill;
        if (criticDecision.correctedDecision.parametros) {
            finalParams = criticDecision.correctedDecision.parametros;
        }
        log(cfg.verbose, `Critic: acao ajustada para ${finalSkill}`);
    }

    // Dual-agent validation para ações de alto risco (P3c AIOS)
    const thinkDecision = { tipo: 'skill' as const, pensamento: '', skill: finalSkill, parametros: finalParams };
    if (requiresDualValidation(thinkDecision)) {
        log(cfg.verbose, `Dual-Agent: validando ação de alto risco "${finalSkill}"...`);
        emit({ type: 'thinking', pensamento: `[Dual-Agent] Validando ação de alto risco: ${finalSkill}`, iteracao: state.iteracao });

        try {
            const validation = await validateWithDualAgent({
                decision: thinkDecision,
                context: state.contexto,
                goal: state.objetivo,
            });

            if (!validation.approved) {
                const dualCritic = validationToCriticDecision(validation, thinkDecision);
                const question = dualCritic.suggestedQuestion
                    || `Validação dual-agent rejeitou "${finalSkill}": ${validation.reason}`;
                return { skillName: finalSkill, params: finalParams, blocked: question };
            }

            log(cfg.verbose, `Dual-Agent: aprovado (confiança ${(validation.confidence * 100).toFixed(0)}%)`);
        } catch (err: any) {
            // Se dual-agent falhar, bloqueia por precaução
            log(cfg.verbose, `Dual-Agent: erro na validação, bloqueando por precaução: ${err.message}`);
            return { skillName: finalSkill, params: finalParams, blocked: `Validação de segurança falhou para "${finalSkill}". Deseja prosseguir?` };
        }
    }

    return { skillName: finalSkill, params: finalParams };
}

// ============================================================================
// LOOP DETECTION
// ============================================================================

const LOOP_WINDOW = 6; // últimos N act steps a verificar

/**
 * Detecta loops nas ações do agente. Retorna descrição do loop ou null.
 *
 * Detecta 3 padrões:
 * 1. Repetição direta: A(p) → A(p) (mesma skill + mesmos params)
 * 2. Ciclo ping-pong: A → B → A → B (2 skills alternando)
 * 3. Skill sem progresso: mesma skill 3+ vezes (params diferentes mas sem avanço)
 */
function detectSkillLoop(
    passos: AgentStep[],
    nextSkill: string,
    nextParams: Record<string, any>
): string | null {
    const acts = passos.filter(p => p.tipo === 'act').slice(-LOOP_WINDOW);
    if (acts.length === 0) return null;

    const nextSig = `${nextSkill}:${JSON.stringify(nextParams)}`;

    // 1. Repetição direta: última ação é idêntica (skill + params)
    const last = acts[acts.length - 1]!;
    const lastSig = `${last.skill}:${JSON.stringify(last.parametros || {})}`;
    if (nextSig === lastSig) {
        return `"${nextSkill}" com mesmos parâmetros`;
    }

    // 2. Ciclo ping-pong: A→B→A→B (verificar se as últimas 3+ ações + próxima formam ciclo)
    if (acts.length >= 3) {
        const recentSkills = acts.slice(-3).map(a => a.skill);
        recentSkills.push(nextSkill);
        // Checa padrão A,B,A,B
        if (
            recentSkills[0] === recentSkills[2] &&
            recentSkills[1] === recentSkills[3] &&
            recentSkills[0] !== recentSkills[1]
        ) {
            return `ciclo "${recentSkills[0]}" ↔ "${recentSkills[1]}"`;
        }
    }

    // 3. Mesma skill 3+ vezes na janela (params podem variar)
    const skillCounts = new Map<string, number>();
    for (const act of acts) {
        skillCounts.set(act.skill!, (skillCounts.get(act.skill!) || 0) + 1);
    }
    const nextCount = (skillCounts.get(nextSkill) || 0) + 1;
    if (nextCount >= 3) {
        // Verifica se os observes dessa skill indicam sucesso — se sim, não é loop
        const observes = passos
            .filter(p => p.tipo === 'observe' && p.resultado)
            .slice(-LOOP_WINDOW);
        const relevantObserves = observes.filter(() => {
            return acts.some(a => a.skill === nextSkill);
        });
        const allFailed = relevantObserves.length > 0 &&
            relevantObserves.every(o => !o.resultado?.sucesso);
        if (allFailed) {
            return `"${nextSkill}" falhou ${nextCount - 1}x consecutivas`;
        }
    }

    return null;
}

function shouldPauseForUserAction(resultado: SkillResult): boolean {
    if (!resultado) return false;
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
