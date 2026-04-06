/**
 * PII Vault — Máscara Reversível de Dados Sensíveis
 *
 * Detecta e substitui PII (Personally Identifiable Information) por tokens
 * opacos antes de enviar para LLMs externos. O mapa token<->valor real
 * fica APENAS em memória e nunca sai da máquina.
 *
 * Fluxo: dados brutos → mask() → LLM processa tokens → unmask() → dados reais
 */

import { ProcessoContext } from '../agent/types';

// ============================================================================
// TYPES
// ============================================================================

export type PIICategory =
    | 'parte_autora' | 'parte_re' | 'magistrado' | 'advogado'
    | 'cpf' | 'cnpj' | 'oab' | 'email' | 'telefone'
    | 'valor' | 'endereco' | 'rg' | 'processo_cnj';

export interface PIIVault {
    /** token → valor real */
    entries: Map<string, string>;
    /** valor real (lowercase) → token */
    reverse: Map<string, string>;
    /** Contadores por categoria para gerar tokens únicos */
    counters: Record<PIICategory, number>;
    /** Estatísticas de mascaramento */
    stats: PIIStats;
}

export interface PIIStats {
    totalMasked: number;
    byCategory: Record<PIICategory, number>;
}

// ============================================================================
// REGEX PATTERNS (formato brasileiro)
// ============================================================================

const PII_PATTERNS: Array<{ category: PIICategory; pattern: RegExp }> = [
    // CPF: 123.456.789-00
    { category: 'cpf', pattern: /\d{3}\.\d{3}\.\d{3}-\d{2}/g },

    // CNPJ: 12.345.678/0001-90
    { category: 'cnpj', pattern: /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g },

    // OAB: OAB 12345/SP, OAB/SP 12345, OAB-SP 12345
    { category: 'oab', pattern: /OAB\s*[\/\-]?\s*\d{3,6}\s*[\/\-]?\s*[A-Z]{2}/gi },

    // Número de processo CNJ: NÃO mascarar — o LLM precisa ver o número
    // para executar pje_consultar corretamente.
    // { category: 'processo_cnj', pattern: /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g },

    // Email
    { category: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },

    // Telefone: (91) 98765-4321 ou 91987654321
    { category: 'telefone', pattern: /\(?\d{2}\)?\s*\d{4,5}-?\d{4}/g },

    // Valores monetários: R$ 1.234,56
    { category: 'valor', pattern: /R\$\s*[\d.,]+(?:,\d{2})?/g },
];

// Títulos que precedem nomes de pessoas
const TITLE_PATTERN = /(?:Dr\.?a?|Juiz(?:a)?|Des(?:embargador)?a?|Min(?:istro)?a?|Adv\.?a?)\s+([A-Z][a-záàâãéèêíïóôõöúüç]+(?:\s+(?:de|da|do|dos|das|e)\s+)?(?:[A-Z][a-záàâãéèêíïóôõöúüç]+\s*)+)/g;

// ============================================================================
// VAULT LIFECYCLE
// ============================================================================

/**
 * Cria um vault vazio para um run do agent loop.
 * O vault vive apenas em memória durante o run.
 */
export function createVault(): PIIVault {
    const categories: PIICategory[] = [
        'parte_autora', 'parte_re', 'magistrado', 'advogado',
        'cpf', 'cnpj', 'oab', 'email', 'telefone',
        'valor', 'endereco', 'rg'
    ];

    const counters = {} as Record<PIICategory, number>;
    const byCategory = {} as Record<PIICategory, number>;
    for (const cat of categories) {
        counters[cat] = 0;
        byCategory[cat] = 0;
    }

    return {
        entries: new Map(),
        reverse: new Map(),
        counters,
        stats: { totalMasked: 0, byCategory }
    };
}

/**
 * Limpa o vault — zera mapas e contadores.
 */
export function clearVault(vault: PIIVault): void {
    vault.entries.clear();
    vault.reverse.clear();
    for (const key of Object.keys(vault.counters) as PIICategory[]) {
        vault.counters[key] = 0;
    }
    vault.stats.totalMasked = 0;
    for (const key of Object.keys(vault.stats.byCategory) as PIICategory[]) {
        vault.stats.byCategory[key] = 0;
    }
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Busca token existente ou cria novo para um valor.
 */
function getOrCreateToken(vault: PIIVault, category: PIICategory, value: string): string {
    const key = value.toLowerCase().trim();
    if (!key) return value;

    const existing = vault.reverse.get(key);
    if (existing) return existing;

    vault.counters[category]++;
    const index = vault.counters[category];
    const token = `[${category.toUpperCase()}_${index}]`;

    vault.entries.set(token, value);
    vault.reverse.set(key, token);
    vault.stats.totalMasked++;
    vault.stats.byCategory[category]++;

    return token;
}

// ============================================================================
// MASK (anonimizar)
// ============================================================================

/**
 * Mascara PII conhecida do processo (partes, juiz, advogados).
 * Esses dados vêm estruturados do PJe — 100% confiáveis.
 */
export function maskKnownEntities(vault: PIIVault, text: string, processo?: ProcessoContext): string {
    if (!processo || !text) return text;

    // Partes autoras
    for (const autor of processo.partes?.autor ?? []) {
        if (autor.length >= 3) {
            text = replaceAllInsensitive(text, autor, getOrCreateToken(vault, 'parte_autora', autor));
        }
    }

    // Partes rés
    for (const reu of processo.partes?.reu ?? []) {
        if (reu.length >= 3) {
            text = replaceAllInsensitive(text, reu, getOrCreateToken(vault, 'parte_re', reu));
        }
    }

    // Juiz
    if (processo.juiz && processo.juiz.length >= 3) {
        text = replaceAllInsensitive(text, processo.juiz, getOrCreateToken(vault, 'magistrado', processo.juiz));
    }

    return text;
}

/**
 * Mascara PII via regex patterns (CPF, CNPJ, OAB, email, telefone, valores).
 */
export function maskPatterns(vault: PIIVault, text: string): string {
    if (!text) return text;

    for (const { category, pattern } of PII_PATTERNS) {
        // Reset lastIndex para patterns com flag /g
        pattern.lastIndex = 0;
        text = text.replace(pattern, (match) => {
            return getOrCreateToken(vault, category, match);
        });
    }

    return text;
}

/**
 * Mascara nomes desconhecidos baseado em heurísticas de títulos.
 * Menos confiável — segunda passada após maskKnownEntities.
 */
export function maskUnknownNames(vault: PIIVault, text: string): string {
    if (!text) return text;

    TITLE_PATTERN.lastIndex = 0;
    text = text.replace(TITLE_PATTERN, (fullMatch, name: string) => {
        const trimmedName = name.trim();
        if (trimmedName.length < 5) return fullMatch;

        // Verifica se já foi mascarado
        const key = trimmedName.toLowerCase();
        if (vault.reverse.has(key)) {
            const token = vault.reverse.get(key)!;
            return fullMatch.replace(trimmedName, token);
        }

        const token = getOrCreateToken(vault, 'magistrado', trimmedName);
        return fullMatch.replace(trimmedName, token);
    });

    return text;
}

/**
 * Máscara completa: entidades conhecidas + patterns + nomes desconhecidos.
 * Ordem importa: primeiro nomes longos (para não serem "cortados" por patterns curtos).
 */
export function mask(vault: PIIVault, text: string, processo?: ProcessoContext): string {
    if (!text) return text;

    // 1. Nomes conhecidos do processo (mais confiável — primeiro)
    text = maskKnownEntities(vault, text, processo);

    // 2. Patterns regex (CPF, CNPJ, OAB, email, etc.)
    text = maskPatterns(vault, text);

    // 3. Nomes desconhecidos por heurística de títulos (menos confiável — por último)
    text = maskUnknownNames(vault, text);

    return text;
}

/**
 * Mascara um objeto recursivamente (para mascarar state.contexto inteiro).
 */
export function maskObject(vault: PIIVault, obj: any, processo?: ProcessoContext): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
        return mask(vault, obj, processo);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => maskObject(vault, item, processo));
    }

    if (typeof obj === 'object') {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = maskObject(vault, value, processo);
        }
        return result;
    }

    return obj;
}

// ============================================================================
// UNMASK (re-hidratar)
// ============================================================================

/**
 * Substitui tokens pelos valores reais na resposta do LLM.
 */
export function unmask(vault: PIIVault, text: string): string {
    if (!text || vault.entries.size === 0) return text;

    // Substitui todos os tokens encontrados no texto
    // Ordena por tamanho decrescente para evitar substituição parcial
    const tokens = Array.from(vault.entries.keys())
        .sort((a, b) => b.length - a.length);

    for (const token of tokens) {
        const realValue = vault.entries.get(token)!;
        text = replaceAll(text, token, realValue);
    }

    return text;
}

/**
 * Re-hidrata objeto recursivamente.
 */
export function unmaskObject(vault: PIIVault, obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
        return unmask(vault, obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => unmaskObject(vault, item));
    }

    if (typeof obj === 'object') {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = unmaskObject(vault, value);
        }
        return result;
    }

    return obj;
}

// ============================================================================
// STATS
// ============================================================================

/**
 * Retorna estatísticas do vault para o badge de privacidade na UI.
 */
export function getVaultStats(vault: PIIVault): PIIStats {
    return { ...vault.stats };
}

/**
 * Retorna lista de categorias mascaradas com contagem.
 */
export function getVaultSummary(vault: PIIVault): Array<{ category: string; count: number }> {
    return Object.entries(vault.stats.byCategory)
        .filter(([_, count]) => count > 0)
        .map(([category, count]) => ({ category, count }));
}

// ============================================================================
// HELPERS
// ============================================================================

function replaceAll(text: string, search: string, replacement: string): string {
    if (!search) return text;
    // Escapa caracteres especiais de regex
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'g'), replacement);
}

function replaceAllInsensitive(text: string, search: string, replacement: string): string {
    if (!search) return text;
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), replacement);
}
