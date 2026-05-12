/**
 * Selector Memory - aprende e persiste seletores CSS por tribunal/contexto,
 * agora com fallback contextual por ambiente PJe.
 *
 * Persiste em: userData/pje-selector-memory.json (criptografado)
 * Chave legacy: "tribunal:context"
 * Chave contextual: "tribunal:environment:context"
 */

import path from 'path';
import { saveEncrypted, loadEncrypted } from '../privacy/encrypted-storage';
import { normalizeForKey } from '../text-normalize';
import { buildPjeEnvironmentLookupKey } from '../pje/environment-context';

interface SelectorEntry {
    selectors: string[];
    successCount: Record<string, number>;
    lastSuccessful: string;
    lastUsed: number;
}

interface SelectorStore {
    version: 1;
    entries: Record<string, SelectorEntry>;
    stats?: SelectorStats;
}

interface SelectorStats {
    lookups: number;
    hits: number;
    misses: number;
    promotions: number;
    byTribunal: Record<string, { lookups: number; hits: number; misses: number }>;
}

export interface SelectorAnalytics {
    totalEntries: number;
    totalLookups: number;
    hitRate: number;
    totalPromotions: number;
    byTribunal: Array<{
        tribunal: string;
        lookups: number;
        hits: number;
        misses: number;
        hitRate: number;
        learnedSelectors: number;
    }>;
    topContexts: Array<{ context: string; successCount: number; selectorCount: number }>;
}

export interface SelectorLookupOptions {
    environment?: unknown;
}

let storePath: string | null = null;
let store: SelectorStore = { version: 1, entries: {} };
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function initSelectorMemory(userDataDir: string): void {
    storePath = path.join(userDataDir, 'pje-selector-memory.json');
    const parsed = loadEncrypted<SelectorStore>(storePath, { version: 1, entries: {} });
    if (parsed?.version === 1 && parsed.entries) {
        store = parsed;
        const count = Object.keys(store.entries).length;
        if (count > 0) console.log(`[SelectorMemory] Carregado ${count} entradas (criptografado)`);
    }
}

function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 2000);
}

export function flush(): void {
    if (!dirty || !storePath) return;
    try {
        saveEncrypted(storePath, store);
        dirty = false;
    } catch (err) {
        console.error('[SelectorMemory] Erro ao salvar:', err);
    }
}

function makeKey(tribunal: string, context: string, opts: SelectorLookupOptions = {}): string {
    const tribunalKey = normalizeForKey(tribunal || 'default');
    const contextKey = normalizeForKey(context);
    const environmentKey = buildPjeEnvironmentLookupKey(opts.environment);
    return environmentKey
        ? `${tribunalKey}:${environmentKey}:${contextKey}`
        : `${tribunalKey}:${contextKey}`;
}

function ensureStats(): SelectorStats {
    if (!store.stats) {
        store.stats = { lookups: 0, hits: 0, misses: 0, promotions: 0, byTribunal: {} };
    }
    return store.stats;
}

function lookupEntrySet(tribunal: string, context: string, opts: SelectorLookupOptions = {}): {
    key: string;
    entry?: SelectorEntry;
    legacyKey: string;
    legacyEntry?: SelectorEntry;
} {
    const key = makeKey(tribunal, context, opts);
    const legacyKey = makeKey(tribunal, context);
    return {
        key,
        entry: store.entries[key],
        legacyKey,
        legacyEntry: legacyKey !== key ? store.entries[legacyKey] : undefined,
    };
}

export function lookupSelectors(tribunal: string, context: string, opts: SelectorLookupOptions = {}): string[] {
    const { key, entry, legacyKey, legacyEntry } = lookupEntrySet(tribunal, context, opts);
    const stats = ensureStats();
    const tribunalKey = normalizeForKey(tribunal || 'default');
    if (!stats.byTribunal[tribunalKey]) stats.byTribunal[tribunalKey] = { lookups: 0, hits: 0, misses: 0 };

    stats.lookups++;
    stats.byTribunal[tribunalKey].lookups++;

    const selectors = Array.from(new Set([
        ...(entry?.selectors || []),
        ...(legacyEntry?.selectors || []),
    ]));

    if (selectors.length === 0) {
        stats.misses++;
        stats.byTribunal[tribunalKey].misses++;
        dirty = true;
        scheduleSave();
        return [];
    }

    stats.hits++;
    stats.byTribunal[tribunalKey].hits++;
    dirty = true;
    scheduleSave();

    if (entry && legacyEntry) {
        console.log(`[SelectorMemory] Hit contextual + legacy: "${key}" (${entry.selectors.length}) + "${legacyKey}" (${legacyEntry.selectors.length})`);
    } else if (entry) {
        console.log(`[SelectorMemory] Hit: "${key}" -> ${entry.selectors.length} seletor(es), ultimo: ${entry.lastSuccessful}`);
    } else if (legacyEntry) {
        console.log(`[SelectorMemory] Legacy hit: "${legacyKey}" para "${context}"`);
    }

    return selectors;
}

export function recordSuccess(
    tribunal: string,
    context: string,
    selector: string,
    isPromotion = false,
    opts: SelectorLookupOptions = {},
): void {
    const key = makeKey(tribunal, context, opts);
    let entry = store.entries[key];

    if (!entry) {
        entry = { selectors: [], successCount: {}, lastSuccessful: '', lastUsed: 0 };
        store.entries[key] = entry;
    }

    entry.successCount[selector] = (entry.successCount[selector] || 0) + 1;
    entry.lastSuccessful = selector;
    entry.lastUsed = Date.now();

    if (!entry.selectors.includes(selector)) {
        entry.selectors.push(selector);
    }

    entry.selectors.sort((a, b) => (entry!.successCount[b] || 0) - (entry!.successCount[a] || 0));

    if (isPromotion) {
        ensureStats().promotions++;
    }

    dirty = true;
    scheduleSave();
    console.log(`[SelectorMemory] Success: "${key}" -> ${selector} (${entry.successCount[selector]}x)${isPromotion ? ' [promoted]' : ''}`);
}

export function getStats(): SelectorAnalytics {
    const stats = ensureStats();
    const totalEntries = Object.keys(store.entries).length;
    const tribunalMap = new Map<string, { lookups: number; hits: number; misses: number; selectors: number }>();

    for (const [tribunal, values] of Object.entries(stats.byTribunal)) {
        tribunalMap.set(tribunal, { ...values, selectors: 0 });
    }

    for (const [key, entry] of Object.entries(store.entries)) {
        const tribunal = key.split(':')[0] || 'default';
        const existing = tribunalMap.get(tribunal) || { lookups: 0, hits: 0, misses: 0, selectors: 0 };
        existing.selectors += entry.selectors.length;
        tribunalMap.set(tribunal, existing);
    }

    const byTribunal = Array.from(tribunalMap.entries())
        .map(([tribunal, data]) => ({
            tribunal,
            lookups: data.lookups,
            hits: data.hits,
            misses: data.misses,
            hitRate: data.lookups > 0 ? data.hits / data.lookups : 0,
            learnedSelectors: data.selectors,
        }))
        .sort((a, b) => b.lookups - a.lookups);

    const topContexts = Object.entries(store.entries)
        .map(([key, entry]) => ({
            context: key,
            successCount: Object.values(entry.successCount).reduce((acc, count) => acc + count, 0),
            selectorCount: entry.selectors.length,
        }))
        .sort((a, b) => b.successCount - a.successCount)
        .slice(0, 10);

    return {
        totalEntries,
        totalLookups: stats.lookups,
        hitRate: stats.lookups > 0 ? stats.hits / stats.lookups : 0,
        totalPromotions: stats.promotions,
        byTribunal,
        topContexts,
    };
}

export function recordFailure(
    tribunal: string,
    context: string,
    selector: string,
    opts: SelectorLookupOptions = {},
): void {
    const key = makeKey(tribunal, context, opts);
    const entry = store.entries[key];
    if (!entry) return;

    const current = entry.successCount[selector] || 0;
    if (current <= 1) {
        delete entry.successCount[selector];
        entry.selectors = entry.selectors.filter((item) => item !== selector);
    } else {
        entry.successCount[selector] = current - 1;
    }

    if (entry.selectors.length === 0) {
        delete store.entries[key];
    }

    dirty = true;
    scheduleSave();
}
