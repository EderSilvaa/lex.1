/**
 * Provider Config — Lex BYOK
 *
 * Registro central de provedores de IA e configuração ativa em runtime.
 * Suporta: Anthropic, OpenAI, OpenRouter, Google AI, Groq.
 */

export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'groq';

export interface ModelInfo {
    id: string;
    name: string;
    vision: boolean;  // suporta análise de imagem/screenshot
}

export interface ProviderPreset {
    id: ProviderId;
    name: string;
    baseUrl: string;
    apiKeyUrl: string;           // link para o usuário obter a chave
    defaultAgentModel: string;   // modelo para think/critic (texto)
    defaultVisionModel: string;  // modelo para Stagehand (deve ter vision)
    models: ModelInfo[];
}

export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        baseUrl: 'https://api.anthropic.com',
        apiKeyUrl: 'https://console.anthropic.com/settings/keys',
        defaultAgentModel: 'claude-haiku-4-5-20251001',
        defaultVisionModel: 'claude-haiku-4-5-20251001',
        models: [
            { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (rápido)', vision: true },
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (melhor)', vision: true },
            { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (máximo)', vision: true },
        ],
    },
    openai: {
        id: 'openai',
        name: 'OpenAI (GPT)',
        baseUrl: 'https://api.openai.com',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        defaultAgentModel: 'gpt-4o-mini',
        defaultVisionModel: 'gpt-4o-mini',
        models: [
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini (rápido)', vision: true },
            { id: 'gpt-4o', name: 'GPT-4o (melhor)', vision: true },
            { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', vision: true },
        ],
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter (multi-modelo)',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKeyUrl: 'https://openrouter.ai/keys',
        defaultAgentModel: 'qwen/qwen3-30b-a3b:free',
        defaultVisionModel: 'qwen/qwen2.5-vl-32b-instruct:free',
        models: [
            // Vision (para browser/Stagehand)
            { id: 'qwen/qwen2.5-vl-32b-instruct:free', name: 'Qwen2.5-VL 32B (grátis, vision)', vision: true },
            { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B (grátis, vision)', vision: true },
            { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick (grátis, vision)', vision: true },
            // Texto (para agente)
            { id: 'qwen/qwen3-30b-a3b:free', name: 'Qwen3 30B (grátis, texto)', vision: false },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (grátis, texto)', vision: false },
            { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1 (grátis, raciocínio)', vision: false },
            // Pagos
            { id: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5 (pago)', vision: true },
            { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (pago)', vision: true },
        ],
    },
    google: {
        id: 'google',
        name: 'Google AI (Gemini)',
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKeyUrl: 'https://aistudio.google.com/app/apikey',
        defaultAgentModel: 'gemini-2.0-flash',
        defaultVisionModel: 'gemini-2.0-flash',
        models: [
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (rápido)', vision: true },
            { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash (melhor)', vision: true },
            { id: 'gemini-2.5-pro-preview-03-25', name: 'Gemini 2.5 Pro (máximo)', vision: true },
        ],
    },
    groq: {
        id: 'groq',
        name: 'Groq (ultra-rápido)',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKeyUrl: 'https://console.groq.com/keys',
        defaultAgentModel: 'llama-3.3-70b-versatile',
        defaultVisionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
        models: [
            { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout (vision)', vision: true },
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (texto)', vision: false },
            { id: 'llama3-70b-8192', name: 'Llama3 70B (texto, contexto longo)', vision: false },
        ],
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Config ativa em runtime
// ─────────────────────────────────────────────────────────────────────────────

export interface ActiveProviderConfig {
    providerId: ProviderId;
    apiKey: string;
    agentModel: string;   // modelo para think/critic
    visionModel: string;  // modelo para Stagehand (browser)
}

let activeConfig: ActiveProviderConfig = {
    providerId: 'anthropic',
    apiKey: '',
    agentModel: PROVIDER_PRESETS.anthropic.defaultAgentModel,
    visionModel: PROVIDER_PRESETS.anthropic.defaultVisionModel,
};

export function setActiveConfig(config: ActiveProviderConfig): void {
    activeConfig = { ...config };
    console.log(`[Provider] Ativo: ${config.providerId} | agent=${config.agentModel} | vision=${config.visionModel}`);
}

export function getActiveConfig(): ActiveProviderConfig {
    return activeConfig;
}

/**
 * Retorna a configuração de modelo para o Stagehand.
 * Stagehand usa o formato "provider/model" via Vercel AI SDK.
 * OpenRouter e Groq são OpenAI-compatíveis com baseURL diferente.
 */
export function getStagehandModelConfig(): {
    modelName: string;
    apiKey: string;
    baseURL?: string;
} {
    const cfg = activeConfig;
    const preset = PROVIDER_PRESETS[cfg.providerId];

    switch (cfg.providerId) {
        case 'anthropic':
            return {
                modelName: `anthropic/${cfg.visionModel}`,
                apiKey: cfg.apiKey,
            };
        case 'openai':
            return {
                modelName: `openai/${cfg.visionModel}`,
                apiKey: cfg.apiKey,
            };
        case 'openrouter':
            // OpenRouter usa pacote @openrouter/ai-sdk-provider via Vercel AI SDK
            return {
                modelName: `openrouter/${cfg.visionModel}`,
                apiKey: cfg.apiKey,
                baseURL: preset.baseUrl,
            };
        case 'google':
            return {
                modelName: `google/${cfg.visionModel}`,
                apiKey: cfg.apiKey,
            };
        case 'groq':
            // Groq é OpenAI-compatible com baseURL customizada
            return {
                modelName: `openai/${cfg.visionModel}`,
                apiKey: cfg.apiKey,
                baseURL: preset.baseUrl,
            };
        default:
            return {
                modelName: `anthropic/${cfg.visionModel}`,
                apiKey: cfg.apiKey,
            };
    }
}
