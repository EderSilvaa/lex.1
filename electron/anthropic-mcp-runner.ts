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

export interface RunOptions {
    apiKey: string;
    model: string;
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    maxSteps?: number;               // limite de rodadas com tool_use (default 10)
    onToken?: (token: string) => void; // stream dos tokens de texto (apenas da rodada final)
}

const MAX_STEPS_DEFAULT = 10;

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
 * Executa o loop agêntico e retorna o texto final concatenado das respostas.
 */
export async function runAnthropicWithMcp(opts: RunOptions): Promise<string> {
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

    const maxSteps = opts.maxSteps ?? MAX_STEPS_DEFAULT;
    let finalText = '';

    for (let step = 0; step < maxSteps; step++) {
        const isLastPossibleStep = step === maxSteps - 1;

        // Streaming apenas na rodada final (quando provavelmente não vai ter tool_use).
        // Para rodadas intermediárias, usa modo não-streaming que é mais simples.
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

        // Emite tokens do texto desta rodada (um chunk só — não é streaming real,
        // mas preserva a API de onToken para não quebrar chamadores existentes).
        if (opts.onToken && roundText) opts.onToken(roundText);

        // Nenhuma tool chamada OU já estourou o limite → fim.
        if (toolUses.length === 0 || response.stop_reason !== 'tool_use' || isLastPossibleStep) {
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
            try {
                const out = await mcp.callTool(tu.name, tu.input);
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: tu.id,
                    content: [{ type: 'text', text: out }],
                });
            } catch (err: any) {
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: tu.id,
                    content: [{ type: 'text', text: `[ERRO] ${err?.message || String(err)}` }],
                    is_error: true,
                });
            }
        }

        messages.push({ role: 'user', content: toolResults });
    }

    if (!finalText) throw new Error('Resposta vazia do LLM (MCP)');

    // Envolve em tags XML esperadas pelo parseThinkResponse do think.ts.
    // Sem isso, a heurística de "skill em texto puro" pode falsar match com
    // nomes tipo `os_listar` mencionados na saída do MCP e disparar nova iteração.
    return `<pensamento>MCP tools executadas</pensamento>\n<tipo>resposta</tipo>\n<resposta>\n${finalText}\n</resposta>`;
}
