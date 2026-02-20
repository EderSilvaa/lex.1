/**
 * Retry com Exponential Backoff (C3)
 *
 * Wrapper para chamadas de rede com retry automático.
 * Suporta jitter para evitar thundering herd.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    retryableStatuses: number[];
    retryableErrors: string[];
    onRetry?: (attempt: number, error: any, delayMs: number) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    retryableStatuses: [429, 500, 502, 503, 504],
    retryableErrors: ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'fetch failed']
};

// ============================================================================
// CORE
// ============================================================================

/**
 * Executa uma função com retry automático e exponential backoff.
 *
 * @example
 * const result = await withRetry(() => fetch('https://api.example.com/data'), {
 *     maxRetries: 3,
 *     onRetry: (attempt, err, delay) => console.log(`Retry ${attempt} em ${delay}ms`)
 * });
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
): Promise<T> {
    const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: any;

    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            // Última tentativa — não faz retry
            if (attempt === cfg.maxRetries) {
                break;
            }

            // Verificar se o erro é retryable
            if (!isRetryable(error, cfg)) {
                break;
            }

            // Calcular delay com exponential backoff + jitter
            const exponentialDelay = cfg.baseDelayMs * Math.pow(2, attempt);
            const jitter = Math.random() * cfg.baseDelayMs * 0.5; // até 50% de jitter
            const delay = Math.min(exponentialDelay + jitter, cfg.maxDelayMs);

            console.log(`[Retry] Tentativa ${attempt + 1}/${cfg.maxRetries} falhou: ${error.message || error}`);
            console.log(`[Retry] Próxima tentativa em ${Math.round(delay)}ms`);

            if (cfg.onRetry) {
                cfg.onRetry(attempt + 1, error, delay);
            }

            await sleep(delay);
        }
    }

    throw lastError;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Verifica se um erro é retryable
 */
function isRetryable(error: any, cfg: RetryConfig): boolean {
    // Verificar status HTTP (ex: 429 Too Many Requests)
    const status = error.status || error.statusCode || error.response?.status;
    if (status && cfg.retryableStatuses.includes(status)) {
        return true;
    }

    // Verificar código de erro de rede
    const code = error.code || '';
    if (cfg.retryableErrors.some(e => code.includes(e))) {
        return true;
    }

    // Verificar mensagem de erro
    const message = (error.message || '').toLowerCase();
    if (cfg.retryableErrors.some(e => message.includes(e.toLowerCase()))) {
        return true;
    }

    // Verificar se é rate limit com Retry-After header
    if (status === 429 || message.includes('rate limit') || message.includes('quota')) {
        return true;
    }

    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// SPECIALIZED WRAPPERS
// ============================================================================

/**
 * Wrapper para chamadas de API de IA (retry configurado para rate limits)
 */
export async function withAIRetry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 2000, // APIs de IA costumam pedir espera mais longa
        maxDelayMs: 60000,
        onRetry: (attempt, error, delay) => {
            console.log(`[AI Retry] Tentativa ${attempt}: ${error.message} — aguardando ${Math.round(delay / 1000)}s`);
        }
    });
}

/**
 * Wrapper para automação PJe (retry para erros de navegação)
 */
export async function withPJeRetry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 1500,
        maxDelayMs: 10000,
        retryableErrors: [
            ...DEFAULT_RETRY_CONFIG.retryableErrors,
            'Navigation timeout', 'Target closed', 'Session closed',
            'Execution context was destroyed', 'frame was detached'
        ],
        onRetry: (attempt, error, delay) => {
            console.log(`[PJe Retry] Tentativa ${attempt}: ${error.message} — aguardando ${Math.round(delay / 1000)}s`);
        }
    });
}
