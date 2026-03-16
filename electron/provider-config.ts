/**
 * Provider Config — Lex BYOK
 *
 * Registro central de provedores de IA e configuração ativa em runtime.
 * Suporta: Anthropic, OpenAI, OpenRouter, Google AI, Groq.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

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
    defaultVisionModel: string;  // modelo para browser automation (deve ter vision)
    models: ModelInfo[];
}

export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        baseUrl: 'https://api.anthropic.com',
        apiKeyUrl: 'https://console.anthropic.com/settings/keys',
        defaultAgentModel: 'claude-haiku-4-5-20251001',
        // Claude 3.5 Sonnet é estável para browser automation via Playwright CDP.
        defaultVisionModel: 'claude-3-5-sonnet-20241022',
        models: [
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (browser)', vision: true },
            { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (browser, rápido)', vision: true },
            { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (agente)', vision: true },
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (melhor)', vision: true },
            { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (máximo)', vision: true },
        ],
    },
    openai: {
        id: 'openai',
        name: 'OpenAI (GPT)',
        baseUrl: 'https://api.openai.com',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        defaultAgentModel: 'gpt-4.1-mini',
        defaultVisionModel: 'gpt-4.1-mini',
        models: [
            { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini (rápido)', vision: true },
            { id: 'gpt-4.1', name: 'GPT-4.1 (melhor)', vision: true },
            { id: 'o4-mini', name: 'o4-mini (raciocínio)', vision: true },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini (legado)', vision: true },
            { id: 'gpt-4o', name: 'GPT-4o (legado)', vision: true },
        ],
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter (multi-modelo)',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKeyUrl: 'https://openrouter.ai/keys',
        defaultAgentModel: 'qwen/qwen3-235b-a22b:free',
        defaultVisionModel: 'qwen/qwen2.5-vl-32b-instruct:free',
        models: [
            // ── Gratuitos — Vision ──
            { id: 'qwen/qwen2.5-vl-32b-instruct:free', name: 'Qwen2.5-VL 32B (grátis, vision)', vision: true },
            { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick (grátis, vision)', vision: true },
            { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B (grátis, vision)', vision: true },
            { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 (grátis, vision)', vision: true },
            { id: 'microsoft/phi-4-multimodal-instruct:free', name: 'Phi-4 Multimodal (grátis, vision)', vision: true },
            // ── Gratuitos — Texto ──
            { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B (grátis, melhor texto)', vision: false },
            { id: 'qwen/qwen3-30b-a3b:free', name: 'Qwen3 30B (grátis, rápido)', vision: false },
            { id: 'deepseek/deepseek-v3-0324:free', name: 'DeepSeek V3 (grátis, coding)', vision: false },
            { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1 (grátis, raciocínio)', vision: false },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (grátis, texto)', vision: false },
            // ── Pagos ──
            { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (pago)', vision: true },
            { id: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5 (pago)', vision: true },
            { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini (pago)', vision: true },
            { id: 'openai/gpt-4.1', name: 'GPT-4.1 (pago)', vision: true },
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
    visionModel: string;  // modelo para browser automation (vision)
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
 * Retorna um LanguageModel do Vercel AI SDK para o provider/model ativo.
 * @param modelId — override do agentModel (ex: criticModel)
 */
export function getActiveModel(modelId?: string): LanguageModel {
    const cfg = activeConfig;
    const name = modelId ?? cfg.agentModel;

    switch (cfg.providerId) {
        case 'anthropic':
            return createAnthropic({ apiKey: cfg.apiKey })(name);
        case 'openai':
            return createOpenAI({ apiKey: cfg.apiKey })(name);
        case 'openrouter':
            return createOpenRouter({ apiKey: cfg.apiKey }).chat(name);
        case 'google':
            return createGoogleGenerativeAI({ apiKey: cfg.apiKey })(name);
        case 'groq':
            return createGroq({ apiKey: cfg.apiKey })(name);
        default:
            return createAnthropic({ apiKey: cfg.apiKey })(name);
    }
}

/**
 * Retorna um LanguageModel para o visionModel ativo (usado em callAIWithVision).
 */
export function getActiveVisionModel(): LanguageModel {
    const cfg = activeConfig;
    const name = cfg.visionModel;

    switch (cfg.providerId) {
        case 'anthropic':
            return createAnthropic({ apiKey: cfg.apiKey })(name);
        case 'openai':
            return createOpenAI({ apiKey: cfg.apiKey })(name);
        case 'openrouter':
            return createOpenRouter({ apiKey: cfg.apiKey }).chat(name);
        case 'google':
            return createGoogleGenerativeAI({ apiKey: cfg.apiKey })(name);
        case 'groq':
            return createGroq({ apiKey: cfg.apiKey })(name);
        default:
            return createAnthropic({ apiKey: cfg.apiKey })(name);
    }
}

