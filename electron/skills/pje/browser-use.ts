/**
 * Skill: pje_browser_use (orquestracao interna PJe com replay)
 *
 * Ponte local entre Brain replay e as tools `browser__*` do server
 * browser-use (configurado em ~/.lex/mcp.json) para navegar no PJe.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser } from '../../browser-manager';
import { resolveTribunalRoutes } from '../../pje/tribunal-urls';
import { getActiveConfig } from '../../provider-config';
import { runAnthropicWithMcp, McpRunnerEvent } from '../../anthropic-mcp-runner';
import { agentEmitter } from '../../agent-events';
import { getMcpManager } from '../../mcp-manager';
import { tryReplay, type ReplayEvent } from '../../brain/replay-executor';
import { findNextBestActionForContext, type ReplayStep } from '../../brain/replay-engine';
import { browserEnricher } from '../../observer/enrichers/browser';
import { withTrace } from '../../observer/trace-context';
import { getBrainSafe } from '../../brain';
import { inferCurrentPjeEnvironment } from '../../pje/active-environment';
import { buildPjeActionGuidance, buildPjeExecutionBrief, buildPjeExecutionStyleSignature, resolveGuidanceReplayContext } from '../../pje/action-guidance';
import { recordSuccessfulPjeExploration } from '../../pje/exploration-learning';

function describeReplayEvent(evt: ReplayEvent): string | null {
    switch (evt.type) {
        case 'plan_found':
            return `[PJe Replay] fluxo conhecido encontrado: ${evt.plan.summary} (confianca ${evt.plan.confidence.toFixed(2)})`;
        case 'plan_missing':
            return `[PJe Replay] sem fluxo confiavel aprendido; iniciando exploracao assistida`;
        case 'step_start':
            return `[PJe Replay] passo ${evt.index + 1}: ${evt.step.tool}`;
        case 'step_waitfor':
            return `[PJe Replay] passo ${evt.index + 1}: aguardando elemento ${evt.selector} (${evt.timeoutMs}ms)`;
        case 'step_retry':
            return `[PJe Replay] passo ${evt.index + 1}: tentando rota alternativa ${evt.selector}`;
        case 'slots_unresolved':
            return `[PJe Replay] passo ${evt.index + 1}: faltam valores para ${evt.labels.join(', ')}`;
        case 'step_end':
            return `[PJe Replay] passo ${evt.index + 1} concluido em ${evt.durationMs}ms`;
        case 'step_mismatch':
            return `[PJe Replay] passo ${evt.index + 1}: a tela mudou do esperado (${evt.expected} != ${evt.actual})`;
        case 'step_error':
            return `[PJe Replay] passo ${evt.index + 1}: falha ${evt.error}`;
        case 'screenshot':
            return `[PJe Replay] captura de falha salva em ${evt.filePath}`;
        case 'done':
            return `[PJe Replay] ${evt.success ? 'sucesso' : 'falhou'}: ${evt.summary}`;
        default:
            return null;
    }
}

function summarizeInput(input: Record<string, unknown>): string {
    try {
        const json = JSON.stringify(input);
        return json.length > 120 ? `${json.slice(0, 117)}...` : json;
    } catch {
        return '[input nao serializavel]';
    }
}

function describeEvent(evt: McpRunnerEvent): string | null {
    switch (evt.type) {
        case 'step_start':
            return `[PJe Exploracao] passo ${evt.step} iniciado`;
        case 'tool_start':
            return `[PJe Exploracao] passo ${evt.step}: ${evt.tool}(${summarizeInput(evt.input)})`;
        case 'tool_end':
            return `[PJe Exploracao] passo ${evt.step}: ${evt.tool} concluido (${evt.durationMs}ms)`;
        case 'tool_error':
            return `[PJe Exploracao] passo ${evt.step}: ${evt.tool} falhou: ${evt.error}`;
        case 'text':
            return evt.text.trim() ? `[PJe Exploracao] ${evt.text.slice(0, 200)}` : null;
        case 'done':
            return `[PJe Exploracao] concluido em ${evt.durationMs}ms (${evt.reason}, max ${evt.steps} passos)`;
        default:
            return null;
    }
}

function describeNextBestAction(step: ReplayStep): string {
    const selector = step.primarySelector ? ` selector=${step.primarySelector}` : '';
    const objective = typeof step.input?.['objective'] === 'string'
        ? ` objetivo=${String(step.input['objective'])}`
        : '';
    return `${step.tool}${objective}${selector}`.trim();
}

function buildNextBestActionHint(step: ReplayStep): string {
    const lines: string[] = [];
    lines.push(`Acao aprendida mais aderente nesta superficie: ${describeNextBestAction(step)}.`);
    if (typeof step.input?.['objective'] === 'string') {
        lines.push(`Objetivo aprendido desta acao: ${String(step.input['objective'])}.`);
    }
    if (step.primarySelector) {
        lines.push(`Se precisar agir em elemento, use como pista inicial o seletor ${step.primarySelector}.`);
    }
    if (step.expectedNextLabel) {
        lines.push(`Depois da acao, valide se a tela converge para ${step.expectedNextLabel}.`);
    }
    return lines.join('\n');
}

function buildExplorationCompassHint(
    guidance: Pick<ReturnType<typeof buildPjeActionGuidance> extends Promise<infer T> ? T : never, 'policy' | 'explorationPlan'>,
): string {
    const lines: string[] = [];
    const worldtreeTargets = guidance.explorationPlan.worldtreeTargets || [];
    const interactionSequence = guidance.explorationPlan.interactionSequence || [];
    const avoidSteps = guidance.explorationPlan.avoidSteps || [];
    lines.push('Use a intencao operacional como bussola de busca, nao como fluxo fixo predefinido.');
    lines.push('Leia o DOM e os frames atuais antes de improvisar cliques fora dos candidatos e affordances sugeridos.');
    if (worldtreeTargets.length > 0) {
        lines.push('Priorize primeiro os candidatos reais da worldtree abaixo antes de cair em tentativa generica ou snapshot:');
        worldtreeTargets.slice(0, 3).forEach((target, index) => {
            lines.push(`- Candidato DOM ${index + 1}: ${target}`);
        });
    }
    if (interactionSequence.length > 0) {
        lines.push('Siga exploracao incremental curta, com reinspecao apos cada expansao relevante:');
        interactionSequence.slice(0, 3).forEach((step, index) => {
            lines.push(`- Passo exploratorio ${index + 1}: ${step}`);
        });
    }
    if (avoidSteps.length > 0) {
        lines.push('Evite estes erros durante a exploracao:');
        avoidSteps.slice(0, 2).forEach((step) => {
            lines.push(`- ${step}`);
        });
    }
    lines.push('Se so houver caminho parcial ou ambiguidade real, diga isso explicitamente em vez de fingir que encontrou o fluxo completo.');
    return lines.join('\n');
}

const SYSTEM_PROMPT = `Voce e o agente de automacao do PJe (sistema judicial brasileiro) da LEX.

Voce tem acesso a ferramentas MCP com prefixo browser__ para controlar o Chrome via CDP:
- Navegar entre URLs
- Clicar em elementos
- Preencher formularios
- Ler DOM e screenshots
- Trocar de aba

Diretrizes:
1. Use as tools para completar a task do usuario.
2. Para o PJe, espere carregamentos: paginas legadas sao lentas.
3. Se aparecer CAPTCHA ou token, pare e reporte - nao tente burlar.
4. Se um clique abrir nova aba, troque para ela antes de continuar.
5. No final, retorne um resumo objetivo do que foi encontrado/feito.
6. NUNCA invente dados. Se nao encontrou, diga "nao encontrado".
7. Quando o brief operacional trouxer "Ferramenta sugerida", siga essa ordem preferencial antes de improvisar outra estrategia.
8. Trate a intencao operacional como uma bussola de busca no DOM, nao como prova de que um fluxo especifico ja existe.
9. Se precisar explorar menu, dropdown, tab ou iframe, faca isso em passos pequenos e reinspecione a superficie apos cada mudanca relevante.
10. Se o DOM so expuser uma acao parcial, nao a promova automaticamente para objetivo completo; declare a limitacao com honestidade.`;

function extractFromXmlWrapper(text: string): string {
    const match = text.match(/<resposta>([\s\S]*?)<\/resposta>/i);
    return match && match[1] ? match[1].trim() : text.trim();
}

export const pjeBrowserUse: Skill = {
    nome: 'pje_browser_use',
    descricao:
        'Skill interna de orquestracao do PJe com Brain replay + MCP browser-use. ' +
        'Recebe uma task ampla em linguagem natural, tenta replay de flow conhecido ' +
        'e cai para exploracao MCP no Chrome quando necessario. ' +
        'Use quando a operacao PJe ainda nao estiver coberta por tools segmentadas ' +
        'ou quando o replay aprendido for a melhor rota.',
    categoria: 'pje',

    parametros: {
        task: {
            tipo: 'string',
            descricao:
                'Descricao detalhada do que fazer no PJe, em portugues. ' +
                'Ex: "Consultar o processo 0001234-56.2024.8.14.0000 no TJPA e listar as ultimas movimentacoes".',
            obrigatorio: true,
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA, TRF1). Define a URL inicial.',
            obrigatorio: false,
            default: '',
        },
        maxSteps: {
            tipo: 'number',
            descricao: 'Numero maximo de rodadas tool_use do LLM (default 15).',
            obrigatorio: false,
            default: 15,
        },
        toolTimeoutMs: {
            tipo: 'number',
            descricao: 'Timeout por tool call em ms (default 90000).',
            obrigatorio: false,
            default: 90_000,
        },
        totalTimeoutMs: {
            tipo: 'number',
            descricao: 'Timeout total do loop em ms (default 600000).',
            obrigatorio: false,
            default: 600_000,
        },
        forceVision: {
            tipo: 'boolean',
            descricao: 'Ignora replay mesmo se houver flow aprendido.',
            obrigatorio: false,
            default: false,
        },
        skipConfirm: {
            tipo: 'boolean',
            descricao: 'Pula modal de confirmacao de replay (usado pela UI apos user confirmar).',
            obrigatorio: false,
            default: false,
        },
    },

    retorno: 'Resumo em linguagem natural do que foi executado e os dados extraidos.',

    exemplos: [
        '{ "skill": "pje_browser_use", "parametros": { "task": "Consultar processo 0001234-56.2024.8.14.0000 no TJPA", "tribunal": "TJPA" } }',
    ],

    async execute(
        params: Record<string, any>,
        _context: AgentContext,
    ): Promise<SkillResult> {
        const task = String(params['task'] || '').trim();
        const tribunal = String(params['tribunal'] || '');
        const maxSteps = Number(params['maxSteps'] || 15);
        const toolTimeoutMs = Number(params['toolTimeoutMs'] || 90_000);
        const totalTimeoutMs = Number(params['totalTimeoutMs'] || 600_000);

        if (!task) {
            return {
                sucesso: false,
                erro: 'Parametro "task" e obrigatorio. Descreva o que fazer no PJe em linguagem natural.',
            };
        }

        const cfg = getActiveConfig();
        if (cfg.providerId !== 'anthropic') {
            return {
                sucesso: false,
                erro: `pje_browser_use requer provider Anthropic (atual: ${cfg.providerId}).`,
            };
        }
        if (!cfg.apiKey) {
            return { sucesso: false, erro: 'API key Anthropic nao configurada.' };
        }

        const routes = resolveTribunalRoutes(tribunal);

        try {
            await ensureBrowser();
        } catch (err: any) {
            return {
                sucesso: false,
                erro: `pje_browser_use falhou ao inicializar browser: ${err?.message || String(err)}`,
            };
        }

        const brain = getBrainSafe();
        const replayEnabled = brain?.getPreference<boolean>('replay.enabled', true) ?? true;
        const confirmBeforeExecute = brain?.getPreference<boolean>('replay.confirmBeforeExecute', false) ?? false;
        const forceVision = Boolean(params['forceVision']);
        const skipConfirm = Boolean(params['skipConfirm']);

        return withTrace({ goal: task }, async () => {
            try {
                const guidance = await buildPjeActionGuidance(task);
                const currentEnvironment = guidance.environment || await inferCurrentPjeEnvironment(tribunal || undefined);
                const effectiveGuidance = currentEnvironment
                    ? { ...guidance, environment: currentEnvironment as unknown as Record<string, unknown> }
                    : guidance;
                const executionBrief = buildPjeExecutionBrief(task, effectiveGuidance);
                const enrichedTaskBase = guidance.guidanceText
                    ? `${executionBrief}\n\n${guidance.guidanceText}`
                    : `${executionBrief}\n\nLeitura operacional da tela atual indisponivel; explore de forma conservadora.`;
                const enrichedTask = tribunal
                    ? `${enrichedTaskBase}\n\nURL inicial do tribunal ${tribunal}: ${routes.loginUrl}`
                    : enrichedTaskBase;
                const replayContext = resolveGuidanceReplayContext(task, effectiveGuidance);
                const preferredExecutionStyle = buildPjeExecutionStyleSignature(effectiveGuidance.explorationPlan);
                const explorationCompassHint = buildExplorationCompassHint(effectiveGuidance);
                let explorationMemoryHint = '';

                if (guidance.policy.policyLines.length > 0) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `[PJe Guidance] ${guidance.policy.policyLines[0]}`,
                    });
                }
                if (guidance.policy.warnings.length > 0) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `[PJe Guidance] alerta: ${guidance.policy.warnings[0]}`,
                    });
                }
                if (guidance.policy.shouldNavigateFirst) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: '[PJe Guidance] a tela atual sugere navegar primeiro para a area correta antes de insistir na acao final',
                    });
                }
                if (guidance.explorationPlan.prioritySteps.length > 0) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `[PJe Guidance] prioridade inicial: ${guidance.explorationPlan.prioritySteps[0]}`,
                    });
                }
                if (guidance.explorationPlan.avoidSteps.length > 0) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `[PJe Guidance] evitar: ${guidance.explorationPlan.avoidSteps[0]}`,
                    });
                }
                if (guidance.explorationPlan.actionableTargets.length > 0) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `[PJe Guidance] alvo acionavel: ${guidance.explorationPlan.actionableTargets[0]}`,
                    });
                }
                if ((guidance.explorationPlan.worldtreeTargets || []).length > 0) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `[PJe Guidance] candidato DOM inicial: ${guidance.explorationPlan.worldtreeTargets?.[0]}`,
                    });
                }
                if ((guidance.explorationPlan.interactionSequence || []).length > 0) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `[PJe Guidance] interacao sugerida: ${guidance.explorationPlan.interactionSequence?.[0]}`,
                    });
                }
                if ((guidance.explorationPlan.toolPlan || []).length > 0) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `[PJe Guidance] ferramenta sugerida: ${guidance.explorationPlan.toolPlan?.[0]}`,
                    });
                }

                const shouldTryReplay = replayEnabled && !forceVision;

                if (shouldTryReplay) {
                    const wantsPreview = confirmBeforeExecute && !skipConfirm;
                    const replayResult = await tryReplay(
                        getMcpManager(),
                        {
                            tribunal: tribunal || undefined,
                            pjeContext: replayContext,
                            environment: currentEnvironment,
                            preferredExecutionStyle,
                            goal: task,
                            dryRun: wantsPreview,
                            onEvent: (evt) => {
                                const msg = describeReplayEvent(evt);
                                if (msg) agentEmitter.emit('agent-event', { type: 'thinking', pensamento: msg });
                            },
                        },
                        browserEnricher,
                    );

                    if (wantsPreview && replayResult.tried && replayResult.plan) {
                        return {
                            sucesso: true,
                            mensagem: 'Plano de replay encontrado. Confirme para executar.',
                            dados: {
                                tribunal,
                                loginUrl: routes.loginUrl,
                                preview: {
                                    task,
                                    flow: replayResult.plan.flowLabel,
                                    confidence: replayResult.plan.confidence,
                                    summary: replayResult.plan.summary,
                                    steps: replayResult.plan.steps.map((step, index) => ({
                                        index,
                                        tool: step.tool,
                                        selector: step.primarySelector,
                                        alternates: step.alternateSelectors || [],
                                        inputPreview: summarizeInput(step.input),
                                        expected: step.expectedNextLabel,
                                        observedCount: step.observedCount,
                                    })),
                                },
                            },
                        };
                    }

                    if (replayResult.tried && replayResult.success) {
                        return {
                            sucesso: true,
                            mensagem: replayResult.aggregatedOutput || replayResult.summary,
                            dados: {
                                tribunal,
                                loginUrl: routes.loginUrl,
                                replay: true,
                                flow: replayResult.plan?.flowLabel,
                                steps: replayResult.plan?.steps.length,
                                summary: replayResult.summary,
                            },
                        };
                    }
                } else if (forceVision) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: '[PJe Replay] replay ignorado porque forceVision=true',
                    });
                }

                const nextBestAction = brain
                    ? findNextBestActionForContext(brain, {
                        tribunal: tribunal || undefined,
                        pjeContext: replayContext,
                        environment: currentEnvironment,
                        preferredExecutionStyle,
                        goal: task,
                    })
                    : null;
                if (nextBestAction) {
                    explorationMemoryHint = buildNextBestActionHint(nextBestAction);
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `[PJe Memory] proxima acao aprendida aderente: ${describeNextBestAction(nextBestAction)}`,
                    });
                }

                agentEmitter.emit('agent-event', {
                    type: 'thinking',
                    pensamento: `[PJe Exploracao] iniciando exploracao assistida no browser (max ${maxSteps} passos, timeout por tool ${toolTimeoutMs}ms, total ${totalTimeoutMs}ms)`,
                });

                const explorationTool = 'pje_browser_use_exploration';
                const explorationArgs = {
                    task,
                    tribunal: tribunal || undefined,
                    replayContext,
                    intent: effectiveGuidance.policy.intent,
                };
                const explorationStartedAt = Date.now();
                const explorationBefore = await browserEnricher.before?.({
                    tool: explorationTool,
                    server: 'browser',
                    args: explorationArgs,
                }) || null;

                let iter = 0;
                const onEvent = (evt: McpRunnerEvent) => {
                    const msg = describeEvent(evt);
                    if (!msg) return;
                    if (evt.type === 'step_start') iter = evt.step;
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: msg,
                        iteracao: iter,
                    });
                };

                const finalText = await runAnthropicWithMcp({
                    apiKey: cfg.apiKey,
                    model: cfg.visionModel,
                    system: SYSTEM_PROMPT,
                    user: explorationMemoryHint
                        ? `${enrichedTask}\n\nBussola de exploracao por intencao:\n${explorationCompassHint}\n\nMemoria operacional parcial aderente desta superficie:\n${explorationMemoryHint}`
                        : `${enrichedTask}\n\nBussola de exploracao por intencao:\n${explorationCompassHint}`,
                    maxSteps,
                    temperature: 0.2,
                    maxTokens: 8000,
                    toolTimeoutMs,
                    totalTimeoutMs,
                    onEvent,
                });

                const clean = extractFromXmlWrapper(finalText);
                const explorationAfter = await browserEnricher.after?.({
                    tool: explorationTool,
                    server: 'browser',
                    args: explorationArgs,
                    output: clean,
                    success: true,
                }) || null;
                const explorationLearning = recordSuccessfulPjeExploration(brain, {
                    tribunal: tribunal || undefined,
                    task,
                    replayContext,
                    guidance: effectiveGuidance,
                    before: explorationBefore,
                    after: explorationAfter,
                    output: clean,
                    durationMs: Date.now() - explorationStartedAt,
                });
                if (explorationLearning.recorded) {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: '[PJe Learn] exploracao bem-sucedida registrada como variante contextual no Brain',
                    });
                }

                return {
                    sucesso: true,
                    mensagem: clean,
                    dados: {
                        tribunal,
                        loginUrl: routes.loginUrl,
                        rawOutput: finalText,
                        explorationLearned: explorationLearning.recorded,
                        explorationFlowReport: explorationLearning.flowReport
                            ? {
                                flowsCreated: explorationLearning.flowReport.flowsCreated,
                                flowsUpdated: explorationLearning.flowReport.flowsUpdated,
                            }
                            : null,
                    },
                };
            } catch (err: any) {
                return {
                    sucesso: false,
                    erro: `pje_browser_use falhou: ${err?.message || String(err)}`,
                };
            }
        });
    },
};

export default pjeBrowserUse;
