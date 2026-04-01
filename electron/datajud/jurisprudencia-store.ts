/**
 * Jurisprudência Store — WARM Data
 *
 * Armazena decisões (acórdãos/ementas) coletadas automaticamente
 * dos tribunais. JSON em ~/.lex/datajud/decisoes.json.
 * Max 2000 decisões (LRU por fetchedAt).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StoredDecisao, MAX_WARM_DECISOES } from './types';

const DATAJUD_DIR = path.join(os.homedir(), '.lex', 'datajud');
const DECISOES_FILE = path.join(DATAJUD_DIR, 'decisoes.json');

let _decisoes: StoredDecisao[] = [];
let _initialized = false;

// ── Init ─────────────────────────────────────────────────────────────

export function initJurisprudenciaStore(): void {
    if (_initialized) return;

    fs.mkdirSync(DATAJUD_DIR, { recursive: true });

    if (fs.existsSync(DECISOES_FILE)) {
        try {
            const raw = fs.readFileSync(DECISOES_FILE, 'utf-8');
            _decisoes = JSON.parse(raw);
            console.log(`[JurisprudenciaStore] Carregado: ${_decisoes.length} decisões`);
        } catch {
            _decisoes = [];
            console.warn('[JurisprudenciaStore] Arquivo corrompido, reiniciando vazio.');
        }
    }

    _initialized = true;
}

// ── Helpers ──────────────────────────────────────────────────────────

function _flush(): void {
    fs.writeFileSync(DECISOES_FILE, JSON.stringify(_decisoes, null, 2));
}

function _ensureInit(): void {
    if (!_initialized) initJurisprudenciaStore();
}

function _enforceLimits(): void {
    if (_decisoes.length > MAX_WARM_DECISOES) {
        _decisoes.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
        _decisoes = _decisoes.slice(0, MAX_WARM_DECISOES);
    }
}

function _matchKeywords(text: string, keywords: string[]): number {
    const lower = text.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) score++;
    }
    return score;
}

// ── CRUD ─────────────────────────────────────────────────────────────

/** Batch upsert de decisões, deduplica por id */
export function addDecisoes(decisoes: StoredDecisao[]): number {
    _ensureInit();
    let added = 0;
    for (const d of decisoes) {
        const idx = _decisoes.findIndex(existing => existing.id === d.id);
        if (idx >= 0) {
            _decisoes[idx] = d; // atualiza
        } else {
            _decisoes.push(d);
            added++;
        }
    }
    _enforceLimits();
    _flush();
    return added;
}

/** Busca decisões por keywords no texto da ementa */
export function searchDecisoes(query: string, limit = 10): StoredDecisao[] {
    _ensureInit();
    if (!query || query.length < 3) return [];

    const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3);

    const scored = _decisoes.map(d => ({
        decisao: d,
        score: _matchKeywords(query, d.keywords) +
            _matchKeywords(query, [d.ementa.substring(0, 200)]) +
            (d.tribunal && query.toUpperCase().includes(d.tribunal) ? 5 : 0),
    }));

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.decisao);
}

/** Filtra decisões por área */
export function getDecisoesByArea(area: string, limit = 20): StoredDecisao[] {
    _ensureInit();
    return _decisoes
        .filter(d => d.area === area)
        .slice(0, limit);
}

/** Filtra decisões por tribunal */
export function getDecisoesByTribunal(tribunal: string, limit = 20): StoredDecisao[] {
    _ensureInit();
    return _decisoes
        .filter(d => d.tribunal === tribunal)
        .slice(0, limit);
}

/** Retorna todas as decisões */
export function getAllDecisoes(): StoredDecisao[] {
    _ensureInit();
    return [..._decisoes];
}

/** Estatísticas */
export function getJurisprudenciaStats(): {
    total: number;
    byTribunal: Record<string, number>;
    byArea: Record<string, number>;
    oldestFetch: string | null;
    newestFetch: string | null;
} {
    _ensureInit();

    const byTribunal: Record<string, number> = {};
    const byArea: Record<string, number> = {};
    let oldest: string | null = null;
    let newest: string | null = null;

    for (const d of _decisoes) {
        byTribunal[d.tribunal] = (byTribunal[d.tribunal] || 0) + 1;
        if (d.area) byArea[d.area] = (byArea[d.area] || 0) + 1;
        if (!oldest || d.fetchedAt < oldest) oldest = d.fetchedAt;
        if (!newest || d.fetchedAt > newest) newest = d.fetchedAt;
    }

    return { total: _decisoes.length, byTribunal, byArea, oldestFetch: oldest, newestFetch: newest };
}
