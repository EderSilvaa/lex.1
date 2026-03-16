/**
 * Usage Tracker (B4)
 *
 * Rastreia uso de tokens e custo estimado.
 * Persiste no electron-store para histórico.
 */

// ============================================================================
// TYPES
// ============================================================================

interface UsageEntry {
    timestamp: number;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    context: string;  // 'think' | 'critic' | 'chat' | 'vision'
}

interface UsageSummary {
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalEstimatedCost: number;
    byContext: Record<string, { calls: number; cost: number }>;
    byModel: Record<string, { calls: number; cost: number }>;
}

// Custos por 1M tokens (input/output) — mantém todos os providers do BYOK
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
    // Anthropic
    'claude-opus-4-6': { input: 15.0, output: 75.0 },
    'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
    'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
    'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
    'claude-3-5-haiku-20241022': { input: 0.25, output: 1.25 },
    // OpenAI
    'gpt-4.1': { input: 2.0, output: 8.0 },
    'gpt-4.1-mini': { input: 0.40, output: 1.60 },
    'o4-mini': { input: 1.10, output: 4.40 },
    'gpt-4o': { input: 2.5, output: 10.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    // Google
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-2.5-flash-preview-04-17': { input: 0.15, output: 0.60 },
    'gemini-2.5-pro-preview-03-25': { input: 1.25, output: 10.0 },
    // Groq
    'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
    'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.11, output: 0.34 },
    // OpenRouter gratuitos (custo zero pro usuário)
    'qwen/qwen3-235b-a22b:free': { input: 0, output: 0 },
    'qwen/qwen3-30b-a3b:free': { input: 0, output: 0 },
    'qwen/qwen2.5-vl-32b-instruct:free': { input: 0, output: 0 },
    'deepseek/deepseek-v3-0324:free': { input: 0, output: 0 },
    'deepseek/deepseek-r1-0528:free': { input: 0, output: 0 },
    'meta-llama/llama-3.3-70b-instruct:free': { input: 0, output: 0 },
    'meta-llama/llama-4-maverick:free': { input: 0, output: 0 },
    'google/gemma-3-27b-it:free': { input: 0, output: 0 },
    'mistralai/mistral-small-3.1-24b-instruct:free': { input: 0, output: 0 },
    'microsoft/phi-4-multimodal-instruct:free': { input: 0, output: 0 },
    // OpenRouter pagos (preços OpenRouter)
    'anthropic/claude-sonnet-4-6': { input: 3.0, output: 15.0 },
    'anthropic/claude-haiku-4-5': { input: 0.80, output: 4.0 },
    'openai/gpt-4.1-mini': { input: 0.40, output: 1.60 },
    'openai/gpt-4.1': { input: 2.0, output: 8.0 },
};

// ============================================================================
// TRACKER CLASS
// ============================================================================

export class UsageTracker {
    private entries: UsageEntry[] = [];
    private sessionStart: number;
    private store: any = null;

    constructor() {
        this.sessionStart = Date.now();
        this.tryLoadStore();
    }

    private async tryLoadStore(): Promise<void> {
        try {
            const Store = (await import('electron-store')).default;
            this.store = new Store({ name: 'lex-usage' });
            // Carrega histórico do dia atual
            const today = new Date().toISOString().split('T')[0];
            this.entries = this.store.get(`usage.${today}`, []);
        } catch {
            // Fora do Electron, usa apenas memória
        }
    }

    /**
     * Registra uso da API
     */
    track(params: {
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        context: string;
    }): void {
        const model = params.model || 'unknown';
        // Fallback conservador: se modelo desconhecido, assume custo baixo (não inflar estimativas)
        const costs = MODEL_COSTS[model] ?? { input: 0.50, output: 2.0 };

        const estimatedCost =
            (params.inputTokens / 1_000_000) * costs.input +
            (params.outputTokens / 1_000_000) * costs.output;

        const entry: UsageEntry = {
            timestamp: Date.now(),
            provider: params.provider,
            model,
            inputTokens: params.inputTokens,
            outputTokens: params.outputTokens,
            estimatedCost,
            context: params.context
        };

        this.entries.push(entry);

        // Log simplificado
        console.log(`[Usage] ${params.context} | ${model} | in:${params.inputTokens} out:${params.outputTokens} | ~$${estimatedCost.toFixed(4)}`);

        // Persiste
        this.persist();
    }

    /**
     * Estima tokens a partir de texto (approximação: 1 token ≈ 4 chars)
     */
    estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Resumo da sessão atual
     */
    getSessionSummary(): UsageSummary {
        return this.buildSummary(
            this.entries.filter(e => e.timestamp >= this.sessionStart)
        );
    }

    /**
     * Resumo do dia inteiro
     */
    getDailySummary(): UsageSummary {
        return this.buildSummary(this.entries);
    }

    /**
     * Resumo formatado para exibição
     */
    getFormattedSummary(): string {
        const session = this.getSessionSummary();
        const daily = this.getDailySummary();

        let text = `📊 Uso de Tokens\n`;
        text += `Sessão: ${session.totalCalls} chamadas | ~$${session.totalEstimatedCost.toFixed(3)}\n`;
        text += `Hoje: ${daily.totalCalls} chamadas | ~$${daily.totalEstimatedCost.toFixed(3)}\n`;

        if (Object.keys(session.byContext).length > 0) {
            text += `\nPor contexto (sessão):\n`;
            for (const [ctx, data] of Object.entries(session.byContext)) {
                text += `  ${ctx}: ${data.calls}x | ~$${data.cost.toFixed(4)}\n`;
            }
        }

        return text;
    }

    // ========================================================================
    // PRIVATE
    // ========================================================================

    private buildSummary(entries: UsageEntry[]): UsageSummary {
        const summary: UsageSummary = {
            totalCalls: entries.length,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalEstimatedCost: 0,
            byContext: {},
            byModel: {}
        };

        for (const entry of entries) {
            summary.totalInputTokens += entry.inputTokens;
            summary.totalOutputTokens += entry.outputTokens;
            summary.totalEstimatedCost += entry.estimatedCost;

            // By context
            if (!summary.byContext[entry.context]) {
                summary.byContext[entry.context] = { calls: 0, cost: 0 };
            }
            const ctxEntry = summary.byContext[entry.context]!;
            ctxEntry.calls++;
            ctxEntry.cost += entry.estimatedCost;

            // By model
            if (!summary.byModel[entry.model]) {
                summary.byModel[entry.model] = { calls: 0, cost: 0 };
            }
            const modelEntry = summary.byModel[entry.model]!;
            modelEntry.calls++;
            modelEntry.cost += entry.estimatedCost;
        }

        return summary;
    }

    private persist(): void {
        if (!this.store) return;
        try {
            const today = new Date().toISOString().split('T')[0];
            this.store.set(`usage.${today}`, this.entries);
        } catch {
            // Silently fail persistence
        }
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let trackerInstance: UsageTracker | null = null;

export function getUsageTracker(): UsageTracker {
    if (!trackerInstance) {
        trackerInstance = new UsageTracker();
    }
    return trackerInstance;
}
