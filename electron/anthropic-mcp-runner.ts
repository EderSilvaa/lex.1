/**
 * Anthropic + MCP Runner
 *
 * Wraps @anthropic-ai/sdk em um agentic loop que expõe tools MCP como
 * `tools: [...]` nativas. Usado pelo `callAI()` quando:
 *   provider === 'anthropic' AND getMcpManager().hasServers()
 *
 * Loop: sample → se `tool_use`, executa via McpManager, adiciona `tool_result`,
 * resample. Termina quando a resposta é `end_turn` (sem mais tool calls) ou
 * quando o limite de steps é atingido.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getMcpManager } from './mcp-manager';
import { ensureBrowser } from './browser-manager';

const BROWSER_TOOL_PREFIXES = ['browser__', 'browseruse__', 'browser-use__'];

function isBrowserTool(name: string): boolean {
    return BROWSER_TOOL_PREFIXES.some((p) => name.startsWith(p));
}

export type McpRunnerEvent =
    | { type: 'step_start'; step: number }
    | { type: 'text'; step: number; text: string }
    | { type: 'tool_start'; step: number; tool: string; input: Record<string, unknown> }
    | { type: 'tool_end'; step: number; tool: string; preview: string; durationMs: number }
    | { type: 'tool_error'; step: number; tool: string; error: string; durationMs: number }
    | { type: 'step_end'; step: number; toolsUsed: number }
    | { type: 'done'; steps: number; durationMs: number; reason: 'end_turn' | 'max_steps' | 'no_tools' };

export interface RunOptions {
    apiKey: string;
    model: string;
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    maxSteps?: number;               // limite de rodadas com tool_use (default 10)
    onToken?: (token: string) => void; // stream dos tokens de texto (apenas da rodada final)
    onEvent?: (evt: McpRunnerEvent) => void; // eventos granulares (step/tool)
    toolTimeoutMs?: number;          // timeout por tool call (default 90_000)
    totalTimeoutMs?: number;         // timeout total do loop (default 600_000)
}

const MAX_STEPS_DEFAULT = 10;
const TOOL_TIMEOUT_DEFAULT = 90_000;
const TOTAL_TIMEOUT_DEFAULT = 600_000;

/**
 * Sanitiza input_schema para a API Anthropic:
 * - Remove `oneOf`, `allOf`, `anyOf` no top-level (não suportados).
 * - Garante `type: "object"` no root.
 */
function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const clean = { ...schema };

    // Se top-level usa oneOf/anyOf/allOf, flatten para o primeiro branch válido
    for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
        if (Array.isArray(clean[key])) {
            const branches = clean[key] as Record<string, unknown>[];
            const obj = branches.find((b) => b['type'] === 'object') || branches[0];
            if (obj && typeof obj === 'object') {
                delete clean[key];
                // Merge as properties do branch no schema root
                Object.assign(clean, obj);
            }
        }
    }

    if (!clean['type']) clean['type'] = 'object';
    if (!clean['properties']) clean['properties'] = {};
    return clean;
}

/**
 * Executa uma Promise com timeout. Se estourar, rejeita com erro claro.
 * A promise original continua rodando (orphan) — o caller deve tratar cleanup.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label} excedeu timeout de ${ms}ms`)),
            ms,
        );
    });
    return Promise.race([p, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

/**
 * Executa o loop agêntico e retorna o texto final concatenado das respostas.
 */
export async function runAnthropicWithMcp(opts: RunOptions): Promise<string> {
    const toolTimeoutMs = opts.toolTimeoutMs ?? TOOL_TIMEOUT_DEFAULT;
    const totalTimeoutMs = opts.totalTimeoutMs ?? TOTAL_TIMEOUT_DEFAULT;
    const maxSteps = opts.maxSteps ?? MAX_STEPS_DEFAULT;
    const emit = opts.onEvent ?? (() => { /* noop */ });
    const startedAt = Date.now();

    // Rastreia qual server está com uma tool em curso. Se o timeout TOTAL
    // estourar enquanto uma tool está pendente, esse é o server a reiniciar.
    const state: { activeServerId: string | null } = { activeServerId: null };

    const loop = async (): Promise<string> => {
        const mcp = getMcpManager();
        await mcp.init();                // idempotente

        const tools = mcp.listTools().map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: sanitizeSchema(t.input_schema as Record<string, unknown>) as any,
        }));

        const client = new Anthropic({ apiKey: opts.apiKey });

        const messages: Array<Anthropic.MessageParam> = [
            { role: 'user', content: opts.user },
        ];

        let finalText = '';
        let doneReason: 'end_turn' | 'max_steps' | 'no_tools' = 'max_steps';

        for (let step = 0; step < maxSteps; step++) {
            const stepNum = step + 1;
            const isLastPossibleStep = step === maxSteps - 1;
            emit({ type: 'step_start', step: stepNum });

            const response = await client.messages.create({
                model: opts.model,
                max_tokens: opts.maxTokens ?? 8000,
                temperature: opts.temperature ?? 0.3,
                system: opts.system,
                tools: tools.length > 0 ? (tools as any) : undefined,
                messages,
            });

            // Coleta texto desta rodada
            const textBlocks: string[] = [];
            const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
            for (const block of response.content) {
                if (block.type === 'text') {
                    textBlocks.push(block.text);
                } else if (block.type === 'tool_use') {
                    toolUses.push({
                        id: block.id,
                        name: block.name,
                        input: (block.input as Record<string, unknown>) || {},
                    });
                }
            }

            const roundText = textBlocks.join('');
            finalText += roundText;

            if (roundText) {
                emit({ type: 'text', step: stepNum, text: roundText });
                if (opts.onToken) opts.onToken(roundText);
            }

            // Nenhuma tool chamada OU já estourou o limite → fim.
            if (toolUses.length === 0) {
                doneReason = 'no_tools';
                emit({ type: 'step_end', step: stepNum, toolsUsed: 0 });
                break;
            }
            if (response.stop_reason !== 'tool_use') {
                doneReason = 'end_turn';
                emit({ type: 'step_end', step: stepNum, toolsUsed: toolUses.length });
                break;
            }
            if (isLastPossibleStep) {
                doneReason = 'max_steps';
                emit({ type: 'step_end', step: stepNum, toolsUsed: toolUses.length });
                break;
            }

            // Adiciona a resposta do assistente e os tool_results como próxima mensagem user.
            messages.push({ role: 'assistant', content: response.content as any });

            // Se alguma tool é do server browser-use, garante que o Chrome está no 19222
            // antes de despachar (o browser-use MCP conecta via CDP nessa porta).
            if (toolUses.some((tu) => isBrowserTool(tu.name))) {
                try { await ensureBrowser(); } catch (err: any) {
                    console.warn(`[MCP] ensureBrowser falhou: ${err?.message}`);
                }
            }

            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const tu of toolUses) {
                emit({ type: 'tool_start', step: stepNum, tool: tu.name, input: tu.input });
                const toolStart = Date.now();
                state.activeServerId = mcp.getServerIdFromToolName(tu.name);
                try {
                    const out = await withTimeout(
                        mcp.callTool(tu.name, tu.input),
                        toolTimeoutMs,
                        `Tool ${tu.name}`,
                    );
                    const durationMs = Date.now() - toolStart;
                    emit({
                        type: 'tool_end',
                        step: stepNum,
                        tool: tu.name,
                        preview: String(out).slice(0, 200),
                        durationMs,
                    });
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: tu.id,
                        content: [{ type: 'text', text: out }],
                    });
                } catch (err: any) {
                    const durationMs = Date.now() - toolStart;
                    const message = err?.message || String(err);
                    emit({
                        type: 'tool_error',
                        step: stepNum,
                        tool: tu.name,
                        error: message,
                        durationMs,
                    });
                    // Se foi timeout, o processo do MCP server pode estar
                    // pendurado. Restart fecha + re-spawna, liberando a orfã.
                    if (message.includes('excedeu timeout')) {
                        const serverId = mcp.getServerIdFromToolName(tu.name);
                        if (serverId) {
                            try {
                                await mcp.restartServer(serverId);
                            } catch (restartErr: any) {
                                console.error(
                                    `[MCP] Falha ao reiniciar server "${serverId}":`,
                                    restartErr?.message || restartErr,
                                );
                            }
                        }
                        throw err;
                    }
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: tu.id,
                        content: [{ type: 'text', text: `[ERRO] ${message}` }],
                        is_error: true,
                    });
                } finally {
                    state.activeServerId = null;
                }
            }

            emit({ type: 'step_end', step: stepNum, toolsUsed: toolUses.length });
            messages.push({ role: 'user', content: toolResults });
        }

        emit({
            type: 'done',
            steps: maxSteps,
            durationMs: Date.now() - startedAt,
            reason: doneReason,
        });

        if (!finalText) throw new Error('Resposta vazia do LLM (MCP)');

        // Envolve em tags XML esperadas pelo parseThinkResponse do think.ts.
        // Sem isso, a heurística de "skill em texto puro" pode falsar match com
        // nomes tipo `os_listar` mencionados na saída do MCP e disparar nova iteração.
        return `<pensamento>MCP tools executadas</pensamento>\n<tipo>resposta</tipo>\n<resposta>\n${finalText}\n</resposta>`;
    };

    try {
        return await withTimeout(loop(), totalTimeoutMs, 'Loop MCP total');
    } catch (err: any) {
        const msg = err?.message || String(err);
        // Se estourou o timeout TOTAL com uma tool em curso, reinicia o server
        // pra não deixar o processo filho pendurado bloqueando próximas runs.
        if (msg.includes('Loop MCP total') && state.activeServerId) {
            const sid = state.activeServerId;
            console.warn(`[MCP] Timeout total com tool pendente em "${sid}" — reiniciando server`);
            try {
                await getMcpManager().restartServer(sid);
            } catch (restartErr: any) {
                console.error(`[MCP] Falha ao reiniciar "${sid}":`, restartErr?.message || restartErr);
            }
        }
        throw err;
    }
}
