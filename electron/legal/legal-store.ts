/**
 * Legal Store — Base Jurídica Dinâmica
 *
 * CRUD persistente em JSON (~/.lex/legal/) para súmulas, artigos e teses.
 * Cresce organicamente: seed inicial + aprendizado do uso + sync com tribunais.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Tipos ───────────────────────────────────────────────────────────

export interface StoredSumula {
    id: string;
    tribunal: string;
    numero: number;
    texto: string;
    area: string[];
    keywords: string[];
    aplicacao: string;
    fonte: 'seed' | 'sync' | 'usuario';
    dataAtualizacao: string;
}

export interface StoredArticle {
    id: string;
    lei: string;
    leiCompleta: string;
    artigo: string;
    texto: string;
    area: string[];
    keywords: string[];
    uso: string;
    fonte: 'seed' | 'sync' | 'usuario';
    dataAtualizacao: string;
}

export interface StoredThesis {
    id: string;
    nome: string;
    area: string;
    descricao: string;
    fundamentoLegal: string[];
    argumentacao: string;
    quantumUsual?: string;
    keywords: string[];
    fonte: 'seed' | 'sync' | 'usuario';
    dataAtualizacao: string;
}

interface SyncLog {
    lastSeed: string | null;
    lastSync: string | null;
    sumulasCount: number;
    articlesCount: number;
    thesesCount: number;
}

// ── Store ────────────────────────────────────────────────────────────

const LEGAL_DIR = path.join(os.homedir(), '.lex', 'legal');

const FILES = {
    sumulas: path.join(LEGAL_DIR, 'sumulas.json'),
    articles: path.join(LEGAL_DIR, 'articles.json'),
    theses: path.join(LEGAL_DIR, 'theses.json'),
    syncLog: path.join(LEGAL_DIR, 'sync-log.json'),
};

// Cache em memória (carregado do disco no init)
let _sumulas: StoredSumula[] = [];
let _articles: StoredArticle[] = [];
let _theses: StoredThesis[] = [];
let _initialized = false;

// ── Init ─────────────────────────────────────────────────────────────

/** Inicializa o store. Cria diretório e seed se primeiro uso. */
export function initLegalStore(): void {
    if (_initialized) return;

    // Cria diretório
    fs.mkdirSync(LEGAL_DIR, { recursive: true });

    // Carrega ou seed
    const needsSeed = !fs.existsSync(FILES.sumulas);

    if (needsSeed) {
        console.log('[LegalStore] Primeiro uso — aplicando seed...');
        try {
            const { SEED_SUMULAS, SEED_ARTICLES, SEED_THESES } = require('./seed-data');
            _sumulas = SEED_SUMULAS;
            _articles = SEED_ARTICLES;
            _theses = SEED_THESES;
            _flush();

            const log: SyncLog = {
                lastSeed: new Date().toISOString(),
                lastSync: null,
                sumulasCount: _sumulas.length,
                articlesCount: _articles.length,
                thesesCount: _theses.length,
            };
            fs.writeFileSync(FILES.syncLog, JSON.stringify(log, null, 2));

            console.log(`[LegalStore] Seed aplicado: ${_sumulas.length} súmulas, ${_articles.length} artigos, ${_theses.length} teses`);
        } catch (err: any) {
            console.warn('[LegalStore] Seed falhou:', err.message);
            _sumulas = [];
            _articles = [];
            _theses = [];
        }
    } else {
        _sumulas = _loadJSON(FILES.sumulas, []);
        _articles = _loadJSON(FILES.articles, []);
        _theses = _loadJSON(FILES.theses, []);
        console.log(`[LegalStore] Carregado: ${_sumulas.length} súmulas, ${_articles.length} artigos, ${_theses.length} teses`);
    }

    _initialized = true;
}

// ── Helpers ──────────────────────────────────────────────────────────

function _loadJSON<T>(filePath: string, fallback: T): T {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function _flush(): void {
    fs.writeFileSync(FILES.sumulas, JSON.stringify(_sumulas, null, 2));
    fs.writeFileSync(FILES.articles, JSON.stringify(_articles, null, 2));
    fs.writeFileSync(FILES.theses, JSON.stringify(_theses, null, 2));
}

function _matchKeywords(text: string, keywords: string[]): number {
    const lower = text.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) score++;
    }
    return score;
}

// ── Súmulas API ─────────────────────────────────────────────────────

/** Busca súmulas por área */
export function getSumulas(area?: string, limit = 10): StoredSumula[] {
    if (!_initialized) initLegalStore();
    let results = _sumulas;
    if (area) {
        results = results.filter(s => s.area.includes(area));
    }
    return results.slice(0, limit);
}

/** Busca súmulas por texto (keywords matching) */
export function searchSumulas(text: string, limit = 5): StoredSumula[] {
    if (!_initialized) initLegalStore();
    if (!text || text.length < 3) return [];

    const scored = _sumulas.map(s => ({
        sumula: s,
        score: _matchKeywords(text, s.keywords) +
            _matchKeywords(text, [s.texto.substring(0, 100)]) +
            (text.toLowerCase().includes(String(s.numero)) ? 10 : 0),
    }));

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.sumula);
}

/** Adiciona ou atualiza uma súmula */
export function addSumula(sumula: StoredSumula): void {
    if (!_initialized) initLegalStore();
    const idx = _sumulas.findIndex(s => s.id === sumula.id);
    if (idx >= 0) {
        _sumulas[idx] = sumula;
    } else {
        _sumulas.push(sumula);
    }
    fs.writeFileSync(FILES.sumulas, JSON.stringify(_sumulas, null, 2));
}

/** Verifica se uma súmula existe */
export function hasSumula(tribunal: string, numero: number): boolean {
    if (!_initialized) initLegalStore();
    return _sumulas.some(s => s.tribunal === tribunal && s.numero === numero);
}

// ── Articles API ────────────────────────────────────────────────────

/** Busca artigos por área */
export function getArticles(area?: string, limit = 10): StoredArticle[] {
    if (!_initialized) initLegalStore();
    let results = _articles;
    if (area) {
        results = results.filter(a => a.area.includes(area));
    }
    return results.slice(0, limit);
}

/** Busca artigos por texto (keywords matching) */
export function searchArticles(text: string, limit = 5): StoredArticle[] {
    if (!_initialized) initLegalStore();
    if (!text || text.length < 3) return [];

    const scored = _articles.map(a => ({
        article: a,
        score: _matchKeywords(text, a.keywords) +
            _matchKeywords(text, [a.texto.substring(0, 100)]) +
            (text.toLowerCase().includes(a.artigo.toLowerCase()) ? 10 : 0),
    }));

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.article);
}

/** Adiciona ou atualiza um artigo */
export function addArticle(article: StoredArticle): void {
    if (!_initialized) initLegalStore();
    const idx = _articles.findIndex(a => a.id === article.id);
    if (idx >= 0) {
        _articles[idx] = article;
    } else {
        _articles.push(article);
    }
    fs.writeFileSync(FILES.articles, JSON.stringify(_articles, null, 2));
}

/** Verifica se um artigo existe */
export function hasArticle(lei: string, artigo: string): boolean {
    if (!_initialized) initLegalStore();
    return _articles.some(a => a.lei === lei && a.artigo === artigo);
}

// ── Theses API ──────────────────────────────────────────────────────

/** Busca teses por área */
export function getTheses(area?: string, limit = 10): StoredThesis[] {
    if (!_initialized) initLegalStore();
    let results = _theses;
    if (area) {
        results = results.filter(t => t.area === area);
    }
    return results.slice(0, limit);
}

/** Busca teses por texto */
export function searchTheses(text: string, limit = 3): StoredThesis[] {
    if (!_initialized) initLegalStore();
    if (!text || text.length < 3) return [];

    const scored = _theses.map(t => ({
        thesis: t,
        score: _matchKeywords(text, t.keywords) +
            _matchKeywords(text, [t.nome, t.descricao]),
    }));

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.thesis);
}

/** Adiciona ou atualiza uma tese */
export function addThesis(thesis: StoredThesis): void {
    if (!_initialized) initLegalStore();
    const idx = _theses.findIndex(t => t.id === thesis.id);
    if (idx >= 0) {
        _theses[idx] = thesis;
    } else {
        _theses.push(thesis);
    }
    fs.writeFileSync(FILES.theses, JSON.stringify(_theses, null, 2));
}

// ── Stats ───────────────────────────────────────────────────────────

/** Retorna estatísticas do store */
export function getStoreStats(): { sumulas: number; articles: number; theses: number; dir: string } {
    if (!_initialized) initLegalStore();
    return {
        sumulas: _sumulas.length,
        articles: _articles.length,
        theses: _theses.length,
        dir: LEGAL_DIR,
    };
}

/** Retorna log de sincronização */
export function getSyncLog(): SyncLog {
    return _loadJSON<SyncLog>(FILES.syncLog, {
        lastSeed: null, lastSync: null,
        sumulasCount: 0, articlesCount: 0, thesesCount: 0,
    });
}
