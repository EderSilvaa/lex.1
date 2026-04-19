/**
 * Observer — Privacy
 *
 * Sanitização IRREVERSÍVEL antes de gravar no Brain. Diferente do pii-vault
 * (que é reversível para LLM roundtrip), aqui queremos apagar PII de vez:
 * o Brain é persistido, backup-able e potencialmente compartilhado via export,
 * então nenhum dado sensível deve sobreviver à sanitização.
 *
 * Campos conhecidos de credenciais são redactados por NOME de chave;
 * valores PII (CPF, CNPJ, OAB, etc) são redactados por PATTERN.
 */

// Chaves sensíveis cujo VALOR inteiro deve ser redactado, qualquer tipo.
const SENSITIVE_KEYS = new Set([
    'senha', 'password', 'pwd', 'pass',
    'apikey', 'api_key', 'access_token', 'token', 'secret',
    'authorization', 'auth',
    'cookie', 'set-cookie',
    'cpf', 'cnpj', 'rg', 'oab',
    'credit_card', 'card_number', 'cvv',
]);

interface Pattern {
    label: string;
    regex: RegExp;
}

const PII_PATTERNS: Pattern[] = [
    { label: '[CPF]', regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
    { label: '[CNPJ]', regex: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g },
    { label: '[OAB]', regex: /OAB\s*[\/\-]?\s*\d{3,6}\s*[\/\-]?\s*[A-Z]{2}/gi },
    { label: '[EMAIL]', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    { label: '[TEL]', regex: /\(?\d{2}\)?\s*9?\d{4}-?\d{4}\b/g },
    { label: '[VALOR]', regex: /R\$\s*[\d.,]+(?:,\d{2})?/g },
    // Heurísticas de credenciais em strings livres
    { label: '[KEY]', regex: /\b(?:sk|pk)-[A-Za-z0-9_-]{16,}\b/g },
    { label: '[BEARER]', regex: /Bearer\s+[A-Za-z0-9._-]+/gi },
];

function isSensitiveKey(key: string): boolean {
    return SENSITIVE_KEYS.has(key.toLowerCase());
}

function sanitizeString(s: string): string {
    let out = s;
    for (const { label, regex } of PII_PATTERNS) {
        out = out.replace(regex, label);
    }
    return out;
}

/** Sanitiza valores de query string em URLs. Mantém path e keys. */
export function sanitizeUrl(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const u = new URL(url);
        for (const [key, value] of u.searchParams.entries()) {
            if (isSensitiveKey(key)) {
                u.searchParams.set(key, '[REDACTED]');
            } else {
                const sanitized = sanitizeString(value);
                if (sanitized !== value) u.searchParams.set(key, sanitized);
            }
        }
        return u.toString();
    } catch {
        return sanitizeString(url);
    }
}

/**
 * Sanitiza recursivamente um objeto. Strings passam por PATTERN. Chaves
 * sensíveis têm valor substituído por '[REDACTED]' (qualquer tipo).
 * Arrays/nested objects tratados recursivamente. Limita profundidade (10).
 */
export function sanitizeInput(
    value: unknown,
    depth = 0,
): unknown {
    if (depth > 10) return '[DEPTH_LIMIT]';
    if (value == null) return value;
    if (typeof value === 'string') return sanitizeString(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map((v) => sanitizeInput(v, depth + 1));
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (isSensitiveKey(k)) {
                out[k] = '[REDACTED]';
            } else if (typeof v === 'string' && (k.toLowerCase() === 'url' || k.toLowerCase() === 'href')) {
                out[k] = sanitizeUrl(v);
            } else {
                out[k] = sanitizeInput(v, depth + 1);
            }
        }
        return out;
    }
    return '[UNSUPPORTED]';
}

/** Aplica sanitização no output_preview (string plain). */
export function sanitizeOutputPreview(output: string): string {
    return sanitizeString(output);
}
