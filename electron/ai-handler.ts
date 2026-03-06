/**
 * AI Handler — Lex BYOK
 *
 * Roteador de chamadas de IA para múltiplos providers.
 * Providers suportados: Anthropic, OpenAI, OpenRouter, Google AI, Groq.
 */

import { withAIRetry } from './agent/retry';
import { getActiveConfig, setActiveConfig, PROVIDER_PRESETS, type ActiveProviderConfig, type ProviderId } from './provider-config';

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces públicas
// ─────────────────────────────────────────────────────────────────────────────

export interface CallAIOptions {
    system: string;
    user: string;
    temperature?: number;
    model?: string;        // override do agentModel da config ativa
    maxTokens?: number;
    onToken?: (token: string) => void;
}

export interface CallAIWithVisionOptions {
    system: string;
    user: string;
    imageBase64: string;
    mediaType?: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    temperature?: number;
    maxTokens?: number;
}

// Interface legada mantida para retrocompat com main.ts
interface LegacyAIConfig {
    provider?: ProviderId | 'supabase';
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Init (aceita chamada legada e nova)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa/atualiza a configuração de IA.
 * Aceita formato legado ({ provider, apiKey }) ou ActiveProviderConfig completo.
 */
export function initAI(config: LegacyAIConfig | ActiveProviderConfig): void {
    if ('providerId' in config) {
        // Novo formato
        setActiveConfig(config as ActiveProviderConfig);
        return;
    }

    // Formato legado: mapeia para ActiveProviderConfig
    const providerId = (config.provider === 'supabase' ? 'anthropic' : config.provider) as ProviderId ?? 'anthropic';
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
// ─────────────────────────────────────────────────────────────────────────────

export async function callAI(options: CallAIOptions): Promise<string> {
    const cfg = getActiveConfig();
    const model = options.model ?? cfg.agentModel;

    return withAIRetry(async () => {
        switch (cfg.providerId) {
            case 'anthropic':
                return callAnthropic(cfg.apiKey, model, options, options.onToken);
            case 'openai':
                return callOpenAICompat('https://api.openai.com', cfg.apiKey, model, options);
            case 'openrouter':
                return callOpenAICompat('https://openrouter.ai/api/v1', cfg.apiKey, model, options, {
                    'HTTP-Referer': 'https://lexjuridico.app',
                    'X-Title': 'Lex Jurídico',
                });
            case 'google':
                return callGoogle(cfg.apiKey, model, options);
            case 'groq':
                return callOpenAICompat('https://api.groq.com/openai/v1', cfg.apiKey, model, options);
            default:
                return callAnthropic(cfg.apiKey, model, options, options.onToken);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// callAIWithVision — análise de screenshot/imagem
// ─────────────────────────────────────────────────────────────────────────────

export async function callAIWithVision(options: CallAIWithVisionOptions): Promise<string> {
    const cfg = getActiveConfig();
    const model = cfg.visionModel;

    if (!cfg.apiKey) {
        throw new Error(`Chave API não configurada para ${cfg.providerId}. Configure em Configurações.`);
    }

    return withAIRetry(async () => {
        switch (cfg.providerId) {
            case 'anthropic':
                return callAnthropicVision(cfg.apiKey, model, options);
            case 'openai':
                return callOpenAIVision('https://api.openai.com', cfg.apiKey, model, options);
            case 'openrouter':
                return callOpenAIVision('https://openrouter.ai/api/v1', cfg.apiKey, model, options, {
                    'HTTP-Referer': 'https://lexjuridico.app',
                    'X-Title': 'Lex Jurídico',
                });
            case 'google':
                return callGoogleVision(cfg.apiKey, model, options);
            case 'groq':
                return callOpenAIVision('https://api.groq.com/openai/v1', cfg.apiKey, model, options);
            default:
                return callAnthropicVision(cfg.apiKey, model, options);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementações por provider
// ─────────────────────────────────────────────────────────────────────────────

/** Anthropic Claude — streaming SSE */
async function callAnthropic(
    apiKey: string,
    model: string,
    options: CallAIOptions,
    onToken?: (token: string) => void
): Promise<string> {
    if (!apiKey) throw new Error('Anthropic API key não configurada. Configure em Configurações.');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            system: options.system,
            messages: [{ role: 'user', content: options.user }],
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 4000,
            stream: true,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    return readAnthropicSSE(response, onToken);
}

/** Anthropic Vision */
async function callAnthropicVision(
    apiKey: string,
    model: string,
    options: CallAIWithVisionOptions
): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            system: options.system,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: options.mediaType || 'image/png', data: options.imageBase64 } },
                    { type: 'text', text: options.user },
                ],
            }],
            temperature: options.temperature ?? 0.1,
            max_tokens: options.maxTokens || 1000,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic Vision error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    const text = data.content?.[0]?.text;
    if (!text) throw new Error('Resposta vazia do Claude Vision');
    return text;
}

/** OpenAI-compatible (OpenAI, OpenRouter, Groq) — com streaming */
async function callOpenAICompat(
    baseUrl: string,
    apiKey: string,
    model: string,
    options: CallAIOptions,
    extraHeaders?: Record<string, string>
): Promise<string> {
    if (!apiKey) throw new Error(`API key não configurada. Configure em Configurações.`);

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...extraHeaders,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: options.system },
                { role: 'user', content: options.user },
            ],
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 4000,
            stream: !!options.onToken,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error (${baseUrl}): ${response.status} - ${error}`);
    }

    if (options.onToken) {
        return readOpenAISSE(response, options.onToken);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Resposta vazia da API');
    return content;
}

/** OpenAI-compatible Vision (OpenAI, OpenRouter, Groq) */
async function callOpenAIVision(
    baseUrl: string,
    apiKey: string,
    model: string,
    options: CallAIWithVisionOptions,
    extraHeaders?: Record<string, string>
): Promise<string> {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...extraHeaders,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: options.system },
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: `data:${options.mediaType || 'image/png'};base64,${options.imageBase64}` } },
                        { type: 'text', text: options.user },
                    ],
                },
            ],
            temperature: options.temperature ?? 0.1,
            max_tokens: options.maxTokens || 1000,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Vision API error (${baseUrl}): ${response.status} - ${error}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Resposta vazia da Vision API');
    return content;
}

/** Google Gemini — REST API */
async function callGoogle(
    apiKey: string,
    model: string,
    options: CallAIOptions
): Promise<string> {
    if (!apiKey) throw new Error('Google AI API key não configurada. Configure em Configurações.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: options.system }] },
            contents: [{ role: 'user', parts: [{ text: options.user }] }],
            generationConfig: {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens: options.maxTokens || 4000,
            },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google AI error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Resposta vazia do Gemini');
    return text;
}

/** Google Gemini Vision */
async function callGoogleVision(
    apiKey: string,
    model: string,
    options: CallAIWithVisionOptions
): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: options.system }] },
            contents: [{
                role: 'user',
                parts: [
                    { inline_data: { mime_type: options.mediaType || 'image/png', data: options.imageBase64 } },
                    { text: options.user },
                ],
            }],
            generationConfig: {
                temperature: options.temperature ?? 0.1,
                maxOutputTokens: options.maxTokens || 1000,
            },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google Vision error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Resposta vazia do Gemini Vision');
    return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitores de stream SSE
// ─────────────────────────────────────────────────────────────────────────────

async function readAnthropicSSE(response: Response, onToken?: (t: string) => void): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is null');

    const decoder = new TextDecoder();
    let fullText = '';
    let done = false;

    while (!done) {
        const { value, done: isDone } = await reader.read();
        done = isDone;
        if (value) {
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
                if (!line.startsWith('data: ')) continue;
                const dataVal = line.slice(6).trim();
                if (!dataVal || dataVal === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(dataVal);
                    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                        fullText += parsed.delta.text;
                        onToken?.(parsed.delta.text);
                    }
                } catch { /* ignora linhas não-JSON */ }
            }
        }
    }

    if (!fullText) throw new Error('Resposta vazia do Claude');
    return fullText;
}

async function readOpenAISSE(response: Response, onToken: (t: string) => void): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is null');

    const decoder = new TextDecoder();
    let fullText = '';
    let done = false;

    while (!done) {
        const { value, done: isDone } = await reader.read();
        done = isDone;
        if (value) {
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
                if (!line.startsWith('data: ')) continue;
                const dataVal = line.slice(6).trim();
                if (!dataVal || dataVal === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(dataVal);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullText += delta;
                        onToken(delta);
                    }
                } catch { /* ignora */ }
            }
        }
    }

    if (!fullText) throw new Error('Resposta vazia da API');
    return fullText;
}
