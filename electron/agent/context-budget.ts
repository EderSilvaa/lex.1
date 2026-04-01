/**
 * Context Budget Manager
 *
 * Adapta dinamicamente quanto contexto (histórico, RAG, memória) enviar ao LLM
 * baseado no context window do modelo ativo.
 *
 * 3 tiers: large (≥100k), medium (≥32k), small (<32k)
 */

// ============================================================================
// CONTEXT WINDOW MAP (tokens)
// ============================================================================

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    // Anthropic
    'claude-sonnet-4-6': 200000,
    'claude-opus-4-6': 200000,
    'claude-haiku-4-5-20251001': 200000,
    'claude-3-5-sonnet-20241022': 200000,
    'claude-3-5-haiku-20241022': 200000,
    // OpenAI
    'gpt-4.1': 1048576,
    'gpt-4.1-mini': 1048576,
    'o4-mini': 200000,
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    // Google
    'gemini-2.0-flash': 1048576,
    'gemini-2.5-flash-preview-04-17': 1048576,
    'gemini-2.5-pro-preview-03-25': 2097152,
    // Groq
    'llama-3.3-70b-versatile': 32768,
    'meta-llama/llama-4-scout-17b-16e-instruct': 131072,
    // OpenRouter free — texto
    'qwen/qwen3-235b-a22b:free': 65536,
    'qwen/qwen3-30b-a3b:free': 65536,
    'deepseek/deepseek-v3-0324:free': 65536,
    'deepseek/deepseek-r1-0528:free': 65536,
    'meta-llama/llama-3.3-70b-instruct:free': 32768,
    // OpenRouter free — vision
    'qwen/qwen2.5-vl-32b-instruct:free': 32768,
    'meta-llama/llama-4-maverick:free': 131072,
    'google/gemma-3-27b-it:free': 8192,
    'mistralai/mistral-small-3.1-24b-instruct:free': 96000,
    'microsoft/phi-4-multimodal-instruct:free': 32768,
    // OpenRouter paid
    'anthropic/claude-sonnet-4-6': 200000,
    'anthropic/claude-haiku-4-5': 200000,
    'openai/gpt-4.1': 1048576,
    'openai/gpt-4.1-mini': 1048576,
    // Ollama (conservador)
    'llama3.1:8b': 8192,
    'qwen2.5:14b': 32768,
    'deepseek-r1:14b': 32768,
    'llama3.1:70b': 32768,
    'llava:13b': 4096,
};

const DEFAULT_CONTEXT_WINDOW = 32768;

// ============================================================================
// BUDGET ALLOCATION
// ============================================================================

export interface ContextBudgetAllocation {
    /** Max chars para seção de histórico de chat */
    maxHistoryChars: number;
    /** Número máximo de mensagens recentes a manter verbatim */
    maxHistoryMessages: number;
    /** Truncagem por mensagem do assistant */
    maxAssistantTruncation: number;
    /** Truncagem por mensagem do user */
    maxUserTruncation: number;
    /** Max chars para RAG chunks */
    maxRAGChars: number;
    /** Max tokens para chamada LLM de sumarização */
    maxSummaryTokens: number;
    /** Max chars para seção de session facts */
    maxFactsChars: number;
    /** Max chars para seção de memória persistente */
    maxMemoryChars: number;
    /** Truncagem por resultado de skill */
    maxSkillResultsChars: number;
    /** Tier do budget (para decisões condicionais) */
    tier: 'large' | 'medium' | 'small';
}

/**
 * Retorna o budget de contexto baseado no modelo ativo.
 * Pode receber modelId explícito ou usa o agentModel do provider config.
 */
export function getContextBudget(modelId?: string): ContextBudgetAllocation {
    let model = modelId;
    if (!model) {
        try {
            const { getActiveConfig } = require('../provider-config');
            model = getActiveConfig().agentModel;
        } catch {
            model = undefined;
        }
    }

    const windowTokens = (model && MODEL_CONTEXT_WINDOWS[model]) || DEFAULT_CONTEXT_WINDOW;

    if (windowTokens >= 100000) {
        // LARGE: Claude, GPT-4.1, Gemini, Llama 4 Maverick
        return {
            maxHistoryChars: 80000,
            maxHistoryMessages: 20,
            maxAssistantTruncation: 6000,
            maxUserTruncation: 8000,
            maxRAGChars: 12000,
            maxSummaryTokens: 500,
            maxFactsChars: 8000,
            maxMemoryChars: 4000,
            maxSkillResultsChars: 2000,
            tier: 'large',
        };
    }

    if (windowTokens >= 32000) {
        // MEDIUM: Qwen free, Llama 70B, DeepSeek, Mistral
        return {
            maxHistoryChars: 30000,
            maxHistoryMessages: 12,
            maxAssistantTruncation: 3000,
            maxUserTruncation: 5000,
            maxRAGChars: 6000,
            maxSummaryTokens: 300,
            maxFactsChars: 5000,
            maxMemoryChars: 2500,
            maxSkillResultsChars: 1200,
            tier: 'medium',
        };
    }

    // SMALL: Ollama local, modelos pequenos
    return {
        maxHistoryChars: 8000,
        maxHistoryMessages: 6,
        maxAssistantTruncation: 1500,
        maxUserTruncation: 2500,
        maxRAGChars: 2000,
        maxSummaryTokens: 150,
        maxFactsChars: 3000,  // facts são compactos, alto ROI
        maxMemoryChars: 1000,
        maxSkillResultsChars: 600,
        tier: 'small',
    };
}
