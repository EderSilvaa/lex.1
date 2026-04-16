/**
 * AI Handler — Lex BYOK
 *
 * Roteador de chamadas de IA para múltiplos providers.
 * Usa Vercel AI SDK para normalização entre providers.
 * Providers suportados: Anthropic, OpenAI, OpenRouter, Google AI, Groq, Ollama.
 *
 * MCP: quando ~/.lex/mcp.json tem servers configurados, tools MCP são
 * injetadas via Vercel AI SDK `tools` + `maxSteps` — funciona com QUALQUER
 * provider que suporte tool-calling. Provider-agnóstico.
 */

import { generateText, streamText, jsonSchema } from 'ai';
import { withAIRetry } from './agent/retry';
import {
    getActiveConfig,
    getActiveModel,
    getActiveVisionModel,
    setActiveConfig,
    PROVIDER_PRESETS,
    type ActiveProviderConfig,
    type ProviderId
} from './provider-config';
import { getMcpManager } from './mcp-manager';
import { ensureBrowser } from './browser-manager';

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces públicas (mantidas para compatibilidade com think.ts, critic.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface CallAIOptions {
    system: string;
    user: string;
    temperature?: number;
    model?: string;        // override do agentModel da config ativa
    maxTokens?: number;
    onToken?: (token: string) => void;
    useMcpTools?: boolean; // default false — ativa tools MCP via Vercel AI SDK multi-step
}

export interface CallAIWithVisionOptions {
    system: string;
    user: string;
    imageBase64: string;
    mediaType?: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    temperature?: number;
    maxTokens?: number;
    model?: string;  // override — usa agentModel quando visionModel não tem acesso
}

// Interface legada mantida para retrocompat com main.ts
interface LegacyAIConfig {
    provider?: ProviderId;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tools — provider-agnóstico
// ─────────────────────────────────────────────────────────────────────────────

const BROWSER_TOOL_PREFIXES = ['browser__', 'browseruse__', 'browser-use__'];

function isBrowserTool(name: string): boolean {
    return BROWSER_TOOL_PREFIXES.some((p) => name.startsWith(p));
}

/**
 * Sanitiza input_schema para APIs de LLM:
 * - Remove `oneOf`, `allOf`, `anyOf` no top-level (Anthropic não suporta).
 * - Garante `type: "object"` no root.
 */
function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const clean = { ...schema };
    for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
        if (Array.isArray(clean[key])) {
            const branches = clean[key] as Record<string, unknown>[];
            const obj = branches.find((b) => b['type'] === 'object') || branches[0];
            if (obj && typeof obj === 'object') {
                delete clean[key];
                Object.assign(clean, obj);
            }
        }
    }
    if (!clean['type']) clean['type'] = 'object';
    if (!clean['properties']) clean['properties'] = {};
    return clean;
}

/** Envolve resposta MCP em XML para parseThinkResponse do think.ts. */
function wrapMcpResponse(text: string): string {
    return `<pensamento>MCP tools executadas</pensamento>\n<tipo>resposta</tipo>\n<resposta>\n${text}\n</resposta>`;
}

/** Detecta se algum server MCP configurado é de browser */
function hasBrowserServer(): boolean {
    const cfg = getMcpManager().loadConfig();
    const servers = cfg.mcpServers;
    if (!servers) return false;
    return Object.keys(servers).some((id) => /browser/i.test(id));
}

/**
 * Converte tools MCP em tools Vercel AI SDK.
 * Funciona com qualquer provider — Anthropic, OpenAI, Google, Groq, etc.
 *
 * @param onToolCall — callback para feedback no terminal (ex: "● browser__navigate…")
 */
async function buildMcpTools(onToolCall?: (msg: string) => void): Promise<Record<string, any>> {
    // Se há server de browser, garante Chrome na 19222 ANTES de spawnar servers MCP.
    // browser-use --cdp-url conecta nessa porta; se Chrome não estiver up, falha.
    if (hasBrowserServer()) {
        try {
            await ensureBrowser();
            console.log('[MCP] Chrome pronto na 19222 — spawning MCP servers…');
        } catch (err: any) {
            console.warn(`[MCP] ensureBrowser pré-init falhou: ${err?.message}`);
        }
    }

    const mcp = getMcpManager();
    await mcp.init(); // idempotente — spawna servers stdio

    const mcpTools = mcp.listTools();
    const aiTools: Record<string, any> = {};

    for (const t of mcpTools) {
        const toolName = t.name;
        // Nome legível: remove prefixo do server (browser__navigate → navigate)
        const shortName = toolName.includes('__') ? toolName.split('__').slice(1).join('__') : toolName;

        aiTools[toolName] = {
            description: t.description,
            parameters: jsonSchema<Record<string, unknown>>(
                sanitizeSchema(t.input_schema as Record<string, unknown>),
            ),
            execute: async (params: Record<string, unknown>) => {
                // Feedback no terminal
                if (onToolCall) onToolCall(`● ${shortName}…`);

                // Se é tool de browser, garante Chrome (safety net — pode ter morrido)
                if (isBrowserTool(toolName)) {
                    try { await ensureBrowser(); } catch (err: any) {
                        console.warn(`[MCP] ensureBrowser falhou: ${err?.message}`);
                    }
                }
                const result = await mcp.callTool(toolName, params);
                if (onToolCall) onToolCall(`  ✓ ${shortName}`);
                return result;
            },
        };
    }

    return aiTools;
}

const MCP_MAX_STEPS = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Init (aceita chamada legada e nova)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa/atualiza a configuração de IA.
 * Aceita formato legado ({ provider, apiKey }) ou ActiveProviderConfig completo.
 */
export function initAI(config: LegacyAIConfig | ActiveProviderConfig): void {
    if ('providerId' in config) {
        setActiveConfig(config as ActiveProviderConfig);
        return;
    }

    const providerId = (config.provider ?? 'anthropic') as ProviderId;
    const preset = PROVIDER_PRESETS[providerId];
    const existing = getActiveConfig();

    setActiveConfig({
        providerId,
        apiKey: config.apiKey ?? existing.apiKey,
        agentModel: config.model ?? preset.defaultAgentModel,
        visionModel: existing.visionModel !== '' ? existing.visionModel : preset.defaultVisionModel,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// callAI — texto (think loop, critic, chat)
// Se onToken é fornecido, usa streamText para streaming real token a token.
// Caso contrário, usa generateText para máxima eficiência.
//
// MCP: quando ~/.lex/mcp.json tem servers, tools MCP são injetadas via
// Vercel AI SDK `tools` + `maxSteps`. Funciona com QUALQUER provider.
// ─────────────────────────────────────────────────────────────────────────────

export async function callAI(options: CallAIOptions): Promise<string> {
    const wantMcp = options.useMcpTools === true;
    const mcpMgr = getMcpManager();
    const hasMcp = wantMcp && mcpMgr.hasServers();

    // MCP tools só são injetados quando explicitamente solicitado (useMcpTools: true).
    // O think loop NÃO usa — ele tem seu próprio sistema de skills via executor.
    const rawMcpTools = hasMcp ? await buildMcpTools(options.onToken) : undefined;
    // Empty {} é truthy — só passa se tem tools reais
    const mcpTools = rawMcpTools && Object.keys(rawMcpTools).length > 0 ? rawMcpTools : undefined;
    const model = getActiveModel(options.model);

    // Streaming real: usa streamText quando onToken é fornecido
    if (options.onToken) {
        const onToken = options.onToken;
        return withAIRetry(async () => {
            const result = streamText({
                model,
                system: options.system,
                messages: [{ role: 'user', content: options.user }],
                temperature: options.temperature ?? 0.3,
                maxOutputTokens: options.maxTokens ?? 8000,
                ...(mcpTools ? { tools: mcpTools, maxSteps: MCP_MAX_STEPS } : {}),
            });

            let fullText = '';
            for await (const chunk of result.textStream) {
                fullText += chunk;
                onToken(chunk);
            }

            if (!fullText) throw new Error('Resposta vazia do LLM');
            return hasMcp ? wrapMcpResponse(fullText) : fullText;
        });
    }

    // Sem streaming: generateText é mais eficiente
    return withAIRetry(async () => {
        const { text } = await generateText({
            model,
            system: options.system,
            messages: [{ role: 'user', content: options.user }],
            temperature: options.temperature ?? 0.3,
            maxOutputTokens: options.maxTokens ?? 8000,
            ...(mcpTools ? { tools: mcpTools, maxSteps: MCP_MAX_STEPS } : {}),
        });

        if (!text) throw new Error('Resposta vazia do LLM');
        return hasMcp ? wrapMcpResponse(text) : text;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// callAIWithVision — análise de screenshot/imagem
// ─────────────────────────────────────────────────────────────────────────────

export async function callAIWithVision(options: CallAIWithVisionOptions): Promise<string> {
    const cfg = getActiveConfig();
    if (!cfg.apiKey) {
        throw new Error(`Chave API não configurada para ${cfg.providerId}. Configure em Configurações.`);
    }

    const model = options.model ? getActiveModel(options.model) : getActiveVisionModel();

    return withAIRetry(async () => {
        const { text } = await generateText({
            model,
            system: options.system,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        image: Buffer.from(options.imageBase64, 'base64'),
                        mediaType: options.mediaType || 'image/png',
                    },
                    {
                        type: 'text',
                        text: options.user,
                    },
                ],
            }],
            temperature: options.temperature ?? 0.1,
            maxOutputTokens: options.maxTokens ?? 1000,
        });

        if (!text) throw new Error('Resposta vazia da API de visão');
        return text;
    });
}
