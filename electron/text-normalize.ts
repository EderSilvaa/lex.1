/**
 * Normalização de texto compartilhada.
 *
 * Todas as funções que geram chaves de lookup (selector-memory, route-memory,
 * tribunal-urls, browser-manager) devem usar estas funções para evitar
 * mismatch entre store e lookup.
 */

/**
 * Normalização padrão para chaves de lookup.
 * Resultado: lowercase, sem acentos, separadores viram underscore.
 *
 * Ex: "Número do Processo" → "numero_do_processo"
 */
export function normalizeForKey(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')     // remove acentos
        .replace(/[^a-z0-9]/g, ' ')          // não-alfanumérico → espaço
        .replace(/\s+/g, '_')                // espaços → underscore
        .replace(/^_+|_+$/g, '');            // trim underscores
}

/**
 * Normalização estrita para identificadores curtos (siglas de tribunal).
 * Remove TUDO que não é alfanumérico — sem separadores.
 *
 * Ex: "TRT-8" → "trt8", "TJ/PA" → "tjpa"
 */
export function normalizeId(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

/**
 * Normalização para comparação fuzzy de texto (sem acentos, lowercase).
 * Preserva espaços e pontuação — útil para matching de labels/placeholders.
 *
 * Ex: "Jurisdição" → "jurisdicao"
 */
export function normalizeText(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}
