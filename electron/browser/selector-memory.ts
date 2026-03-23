/**
 * Selector Memory — aprende e persiste seletores CSS que funcionaram por tribunal.
 *
 * Persiste em: userData/pje-selector-memory.json (criptografado)
 * Chave: "tribunal:context"  ex: "tjpa:campo_numero_processo"
 *
 * Pattern clonado de electron/pje/route-memory.ts
 */

import path from 'path';
import { saveEncrypted, loadEncrypted } from '../privacy/encrypted-storage';
import { normalizeForKey } from '../text-normalize';

// ── Types ──────────────────────────────────────────────────────────

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
    promotions: number;   // discovered → learned
    byTribunal: Record<string, { lookups: number; hits: number; misses: number }>;
}

export interface SelectorAnalytics {
    totalEntries: number;
    totalLookups: number;
    hitRate: number;          // 0-1
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

// ── State ──────────────────────────────────────────────────────────

let storePath: string | null = null;
let store: SelectorStore = { version: 1, entries: {} };
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// ── Init / Persist ─────────────────────────────────────────────────

/** Inicializa a memória de seletores. Recebe userDataDir do main.ts. */
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

// ── Normalization ──────────────────────────────────────────────────

function makeKey(tribunal: string, context: string): string {
    const t = normalizeForKey(tribunal || 'default');
    const c = normalizeForKey(context);
    return `${t}:${c}`;
}

// ── Lookup ─────────────────────────────────────────────────────────

/** Retorna seletores aprendidos ordenados por sucesso. Retorna [] se nada aprendido. */
export function lookupSelectors(tribunal: string, context: string): string[] {
    const key = makeKey(tribunal, context);
    const entry = store.entries[key];

    // Analytics: track lookup
    const stats = ensureStats();
    stats.lookups++;
    const t = normalizeForKey(tribunal || 'default');
    if (!stats.byTribunal[t]) stats.byTribunal[t] = { lookups: 0, hits: 0, misses: 0 };
    stats.byTribunal[t].lookups++;

    if (!entry || entry.selectors.length === 0) {
        stats.misses++;
        stats.byTribunal[t].misses++;
        dirty = true;
        scheduleSave();
        return [];
    }

    stats.hits++;
    stats.byTribunal[t].hits++;
    dirty = true;
    scheduleSave();
    console.log(`[SelectorMemory] Hit: "${key}" → ${entry.selectors.length} seletor(es), último: ${entry.lastSuccessful}`);
    return [...entry.selectors];
}

// ── Record ─────────────────────────────────────────────────────────

/** Registra um seletor que funcionou. Incrementa count, reordena, salva. */
export function recordSuccess(tribunal: string, context: string, selector: string, isPromotion = false): void {
    const key = makeKey(tribunal, context);
    let entry = store.entries[key];

    if (!entry) {
        entry = { selectors: [], successCount: {}, lastSuccessful: '', lastUsed: 0 };
        store.entries[key] = entry;
    }

    entry.successCount[selector] = (entry.successCount[selector] || 0) + 1;
    entry.lastSuccessful = selector;
    entry.lastUsed = Date.now();

    // Garante que o seletor está na lista
    if (!entry.selectors.includes(selector)) {
        entry.selectors.push(selector);
    }

    // Reordena por successCount desc
    entry.selectors.sort((a, b) => (entry.successCount[b] || 0) - (entry.successCount[a] || 0));

    // Analytics: track promotion (discovered → learned)
    if (isPromotion) {
        ensureStats().promotions++;
    }

    dirty = true;
    scheduleSave();
    console.log(`[SelectorMemory] Success: "${key}" → ${selector} (${entry.successCount[selector]}x)${isPromotion ? ' [promoted]' : ''}`);
}

// ── Stats ─────────────────────────────────────────────────────────

function ensureStats(): SelectorStats {
    if (!store.stats) {
        store.stats = { lookups: 0, hits: 0, misses: 0, promotions: 0, byTribunal: {} };
    }
    return store.stats;
}

/** Retorna analytics agregadas da selector memory */
export function getStats(): SelectorAnalytics {
    const stats = ensureStats();
    const totalEntries = Object.keys(store.entries).length;

    // By tribunal: merge entry data + stats
    const tribunalMap = new Map<string, { lookups: number; hits: number; misses: number; selectors: number }>();

    // From stats tracking
    for (const [t, s] of Object.entries(stats.byTribunal)) {
        tribunalMap.set(t, { ...s, selectors: 0 });
    }

    // Count learned selectors per tribunal from entries
    for (const key of Object.keys(store.entries)) {
        const tribunal = key.split(':')[0] || 'default';
        const entry = store.entries[key]!;
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

    // Top contexts by total success count
    const topContexts = Object.entries(store.entries)
        .map(([key, entry]) => {
            const totalSuccess = Object.values(entry.successCount).reduce((a, b) => a + b, 0);
            return { context: key, successCount: totalSuccess, selectorCount: entry.selectors.length };
        })
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

/** Registra falha de um seletor. Decrementa count, remove se zerou. */
export function recordFailure(tribunal: string, context: string, selector: string): void {
    const key = makeKey(tribunal, context);
    const entry = store.entries[key];
    if (!entry) return;

    const current = entry.successCount[selector] || 0;
    if (current <= 1) {
        delete entry.successCount[selector];
        entry.selectors = entry.selectors.filter((s) => s !== selector);
    } else {
        entry.successCount[selector] = current - 1;
    }

    // Remove a entrada inteira se ficou vazia
    if (entry.selectors.length === 0) {
        delete store.entries[key];
    }

    dirty = true;
    scheduleSave();
}
