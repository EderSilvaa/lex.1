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

export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'groq' | 'ollama';

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
        defaultAgentModel: 'qwen/qwen3.6-plus:free',
        defaultVisionModel: 'qwen/qwen3.6-plus:free',
        models: [
            // ── Gratuitos — Vision ──
            { id: 'qwen/qwen3.6-plus:free', name: 'Qwen 3.6 Plus (grátis, vision+texto, 1M ctx)', vision: true },
            { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron Nano 12B VL (grátis, vision)', vision: true },
            { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B (grátis, vision)', vision: true },
            { id: 'google/gemma-3-12b-it:free', name: 'Gemma 3 12B (grátis, vision, leve)', vision: true },
            { id: 'google/gemma-3-4b-it:free', name: 'Gemma 3 4B (grátis, vision, ultra-leve)', vision: true },
            // ── Gratuitos — Texto ──
            { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (grátis, melhor texto)', vision: false },
            { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B (grátis, texto)', vision: false },
            { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder 480B (grátis, coding)', vision: false },
            { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B (grátis, texto)', vision: false },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (grátis, texto)', vision: false },
            { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron Nano 9B (grátis, leve)', vision: false },
            { id: 'stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash (grátis, rápido)', vision: false },
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
    ollama: {
        id: 'ollama',
        name: 'Modelo Local (Ollama)',
        baseUrl: 'http://localhost:11434',
        apiKeyUrl: '',   // não precisa de chave
        defaultAgentModel: 'llama3.1:8b',
        defaultVisionModel: 'llava:13b',
        models: [
            // Preenchido dinamicamente via ollama-manager.ts (listModels)
            // Fallbacks estáticos para quando Ollama não estiver rodando
            { id: 'llama3.1:8b', name: 'Llama 3.1 8B (leve)', vision: false },
            { id: 'qwen2.5:14b', name: 'Qwen 2.5 14B', vision: false },
            { id: 'deepseek-r1:14b', name: 'DeepSeek R1 14B', vision: false },
            { id: 'gemma4:27b', name: 'Gemma 4 27B', vision: false },
            { id: 'llama3.1:70b', name: 'Llama 3.1 70B (pesado)', vision: false },
            { id: 'llava:13b', name: 'LLaVA 13B (vision)', vision: true },
            { id: 'llava:34b', name: 'LLaVA 34B (vision)', vision: true },
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
        case 'ollama':
            return createOpenAI({
                baseURL: 'http://localhost:11434/v1',
                apiKey: 'ollama',  // Ollama aceita qualquer string
            })(name);
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
        case 'ollama':
            return createOpenAI({
                baseURL: 'http://localhost:11434/v1',
                apiKey: 'ollama',
            })(name);
        default:
            return createAnthropic({ apiKey: cfg.apiKey })(name);
    }
}
