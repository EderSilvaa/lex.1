/**
 * AI Handler — Lex BYOK
 *
 * Roteador de chamadas de IA para múltiplos providers.
 * Usa Vercel AI SDK para normalização entre providers.
 * Providers suportados: Anthropic, OpenAI, OpenRouter, Google AI, Groq.
 */

import { generateText, streamText } from 'ai';
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
// ─────────────────────────────────────────────────────────────────────────────

export async function callAI(options: CallAIOptions): Promise<string> {
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
            });

            let fullText = '';
            for await (const chunk of result.textStream) {
                fullText += chunk;
                onToken(chunk);
            }

            if (!fullText) throw new Error('Resposta vazia do LLM');
            return fullText;
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
        });

        if (!text) throw new Error('Resposta vazia do LLM');
        return text;
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
