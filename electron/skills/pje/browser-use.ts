/**
 * Skill: pje_browser_use (canônica)
 *
 * Dispara um sub-loop agêntico MCP que usa as tools `browser__*` do server
 * browser-use (configurado em ~/.lex/mcp.json) para navegar no PJe.
 *
 * Fluxo:
 *   1. Garante Chrome ativo na porta 19222 (CDP).
 *   2. Invoca runAnthropicWithMcp com a task do usuário — o LLM decide cada
 *      ação (click, navigate, fill, etc) via tools MCP.
 *   3. Retorna o resultado final extraído ao think loop da Lex.
 *
 * Pré-requisitos:
 *   - Provider ativo = anthropic
 *   - ~/.lex/mcp.json com server `browser` (browser-use --mcp --cdp-url ...)
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser } from '../../browser-manager';
import { resolveTribunalRoutes } from '../../pje/tribunal-urls';
import { getActiveConfig } from '../../provider-config';
import { runAnthropicWithMcp, McpRunnerEvent } from '../../anthropic-mcp-runner';
import { agentEmitter } from '../../agent/loop';
import { getMcpManager } from '../../mcp-manager';
import { tryReplay, type ReplayEvent } from '../../brain/replay-executor';
import { browserEnricher } from '../../observer/enrichers/browser';
import { withTrace } from '../../observer/trace-context';
import { getBrainSafe } from '../../brain';

/**
 * Infere o "pjeContext" a partir da task em português. Mesma heurística do
 * browser enricher — manter sincronizadas é o que garante replay hit.
 */
function inferPjeContextFromTask(task: string): string | undefined {
    const t = task.toLowerCase();
    if (/consult|pesquis|buscar processo|número do processo/.test(t)) return 'consulta';
    if (/login|acessar|entrar/.test(t)) return 'login';
    if (/painel|dashboard|início/.test(t)) return 'painel';
    if (/movimenta|andamento|últim/.test(t)) return 'consulta';
    if (/document|peça|anexo|baixar/.test(t)) return 'consulta';
    if (/preench|formul/.test(t)) return 'preenchimento';
    return undefined;
}

function describeReplayEvent(evt: ReplayEvent): string | null {
    switch (evt.type) {
        case 'plan_found':
            return `[Replay] plano encontrado: ${evt.plan.summary} (confidence ${evt.plan.confidence.toFixed(2)})`;
        case 'plan_missing':
            return `[Replay] sem plano confiável — caindo em vision`;
        case 'step_start':
            return `[Replay] step ${evt.index + 1} → ${evt.step.tool}`;
        case 'step_waitfor':
            return `[Replay] step ${evt.index + 1} aguarda ${evt.selector} (${evt.timeoutMs}ms)`;
        case 'step_retry':
            return `[Replay] step ${evt.index + 1} tentando alternate: ${evt.selector}`;
        case 'slots_unresolved':
            return `[Replay] step ${evt.index + 1} ⚠ slots sem valor: ${evt.labels.join(', ')}`;
        case 'step_end':
            return `[Replay] step ${evt.index + 1} ✓ ${evt.durationMs}ms`;
        case 'step_mismatch':
            return `[Replay] step ${evt.index + 1} ✗ domHash esperado ${evt.expected} != ${evt.actual} (layout mudou?)`;
        case 'step_error':
            return `[Replay] step ${evt.index + 1} ✗ ${evt.error}`;
        case 'screenshot':
            return `[Replay] screenshot de falha: ${evt.filePath}`;
        case 'done':
            return `[Replay] ${evt.success ? 'SUCESSO' : 'FALHOU'}: ${evt.summary}`;
        default:
            return null;
    }
}

function summarizeInput(input: Record<string, unknown>): string {
    try {
        const json = JSON.stringify(input);
        return json.length > 120 ? json.slice(0, 117) + '...' : json;
    } catch {
        return '[input não serializável]';
    }
}

function describeEvent(evt: McpRunnerEvent): string | null {
    switch (evt.type) {
        case 'step_start':
            return `[MCP] step ${evt.step} iniciado`;
        case 'tool_start':
            return `[MCP] step ${evt.step} → ${evt.tool}(${summarizeInput(evt.input)})`;
        case 'tool_end':
            return `[MCP] step ${evt.step} ← ${evt.tool} (${evt.durationMs}ms)`;
        case 'tool_error':
            return `[MCP] step ${evt.step} ✗ ${evt.tool} FALHOU: ${evt.error}`;
        case 'text':
            return evt.text.trim() ? `[MCP] ${evt.text.slice(0, 200)}` : null;
        case 'done':
            return `[MCP] concluído em ${evt.durationMs}ms (${evt.reason}, ${evt.steps} passos máx)`;
        default:
            return null;
    }
}

const SYSTEM_PROMPT = `Você é o agente de automação do PJe (sistema judicial brasileiro) da LEX.

Você tem acesso a ferramentas MCP com prefixo browser__ para controlar o Chrome via CDP:
- Navegar entre URLs
- Clicar em elementos
- Preencher formulários
- Ler DOM e screenshots
- Trocar de aba

Diretrizes:
1. Use as tools para completar a task do usuário.
2. Para o PJe, espere carregamentos: páginas legadas são lentas.
3. Se aparecer CAPTCHA ou token, pare e reporte — não tente burlar.
4. Se um clique abrir nova aba, troque para ela antes de continuar.
5. No final, retorne um resumo objetivo do que foi encontrado/feito.
6. NUNCA invente dados. Se não encontrou, diga "não encontrado".`;

function extractFromXmlWrapper(text: string): string {
    const match = text.match(/<resposta>([\s\S]*?)<\/resposta>/i);
    return match && match[1] ? match[1].trim() : text.trim();
}

export const pjeBrowserUse: Skill = {
    nome: 'pje_browser_use',
    descricao:
        'Navega no PJe via agente autônomo com tools MCP browser-use. ' +
        'Recebe uma descrição em linguagem natural da task (consultar processo, ' +
        'baixar documentos, ler movimentações, etc) e executa no Chrome. ' +
        'USE ESTA SKILL para QUALQUER operação no PJe: consulta, navegação, ' +
        'preenchimento, extração de dados.',
    categoria: 'pje',

    parametros: {
        task: {
            tipo: 'string',
            descricao:
                'Descrição detalhada do que fazer no PJe, em português. ' +
                'Ex: "Consultar o processo 0001234-56.2024.8.14.0000 no TJPA e listar as últimas movimentações".',
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
            descricao: 'Número máximo de rodadas tool_use do LLM (default 15).',
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
            descricao: 'Pula modal de confirmação de replay (usado pela UI após user confirmar).',
            obrigatorio: false,
            default: false,
        },
    },

    retorno: 'Resumo em linguagem natural do que foi executado e os dados extraídos.',

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
                erro: 'Parâmetro "task" é obrigatório. Descreva o que fazer no PJe em linguagem natural.',
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
            return { sucesso: false, erro: 'API key Anthropic não configurada.' };
        }

        const routes = resolveTribunalRoutes(tribunal);
        const enrichedTask = tribunal
            ? `${task}\n\nURL inicial do tribunal ${tribunal}: ${routes.loginUrl}`
            : task;

        try {
            await ensureBrowser();
        } catch (err: any) {
            return {
                sucesso: false,
                erro: `pje_browser_use falhou ao inicializar browser: ${err?.message || String(err)}`,
            };
        }

        // Lê preferências do Brain — controlam se replay roda e se pede confirmação.
        const brain = getBrainSafe();
        const replayEnabled = brain?.getPreference<boolean>('replay.enabled', true) ?? true;
        const confirmBeforeExecute = brain?.getPreference<boolean>('replay.confirmBeforeExecute', false) ?? false;
        const forceVision = Boolean(params['forceVision']);
        const skipConfirm = Boolean(params['skipConfirm']);

        // Envolve toda a execução numa trace: Observer grava traceId em
        // cada Observation, edges ganham traceId, permite reconstruir
        // "todas as ações deste goal" depois.
        return withTrace({ goal: task }, async () => {
        try {
            // ── Tentativa de replay determinístico (exploit) ────────────────
            // Antes de pagar o custo do sub-loop agêntico, consulta o grafo.
            // Se há flow confiável para (tribunal, pjeContext), executa direto.
            const pjeContext = inferPjeContextFromTask(task);

            // Se user desligou replay OU forçou vision → pula direto pro vision.
            const shouldTryReplay = replayEnabled && !forceVision;

            if (shouldTryReplay) {
                // Preview mode: confirmação é exigida pelas prefs E não foi já skipConfirm.
                const wantsPreview = confirmBeforeExecute && !skipConfirm;

                const replayResult = await tryReplay(
                    getMcpManager(),
                    {
                        tribunal: tribunal || undefined,
                        pjeContext,
                        goal: task,
                        dryRun: wantsPreview,
                        onEvent: (evt) => {
                            const msg = describeReplayEvent(evt);
                            if (msg) agentEmitter.emit('agent-event', { type: 'thinking', pensamento: msg });
                        },
                    },
                    browserEnricher,
                );

                // Preview: encontrou plano, retorna para UI confirmar.
                if (wantsPreview && replayResult.tried && replayResult.plan) {
                    return {
                        sucesso: true,
                        mensagem: `Plano de replay encontrado. Confirme para executar.`,
                        dados: {
                            tribunal,
                            loginUrl: routes.loginUrl,
                            preview: {
                                task,
                                flow: replayResult.plan.flowLabel,
                                confidence: replayResult.plan.confidence,
                                summary: replayResult.plan.summary,
                                steps: replayResult.plan.steps.map((s, i) => ({
                                    index: i,
                                    tool: s.tool,
                                    selector: s.primarySelector,
                                    alternates: s.alternateSelectors || [],
                                    inputPreview: summarizeInput(s.input),
                                    expected: s.expectedNextLabel,
                                    observedCount: s.observedCount,
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
                    pensamento: `[pje_browser_use] forceVision=true — pulando replay`,
                });
            }

            // Replay falhou ou inexistente → fallback para vision.
            agentEmitter.emit('agent-event', {
                type: 'thinking',
                pensamento: `[pje_browser_use] Iniciando sub-loop MCP (max ${maxSteps} passos, tool timeout ${toolTimeoutMs}ms, total ${totalTimeoutMs}ms)`,
            });

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
                user: enrichedTask,
                maxSteps,
                temperature: 0.2,
                maxTokens: 8000,
                toolTimeoutMs,
                totalTimeoutMs,
                onEvent,
            });

            const clean = extractFromXmlWrapper(finalText);

            return {
                sucesso: true,
                mensagem: clean,
                dados: {
                    tribunal,
                    loginUrl: routes.loginUrl,
                    rawOutput: finalText,
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
