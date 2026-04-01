/**
 * Document Examples Store — Camada 2 da Knowledge Base
 *
 * Armazena exemplos reais de documentos jurídicos com quality scoring.
 * Segue padrão do legal-store.ts: JSON em ~/.lex/legal/ + cache em memória.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { StoredDocExample, QualityScore } from './doc-schemas';

// ── Paths ────────────────────────────────────────────────────────────

const LEGAL_DIR = path.join(os.homedir(), '.lex', 'legal');
const EXAMPLES_FILE = path.join(LEGAL_DIR, 'doc-examples.json');
const MAX_EXAMPLES = 5000;

// ── State ────────────────────────────────────────────────────────────

let _examples: StoredDocExample[] = [];
let _initialized = false;

// ── Init ─────────────────────────────────────────────────────────────

export function initDocExamples(): void {
    if (_initialized) return;

    fs.mkdirSync(LEGAL_DIR, { recursive: true });

    if (fs.existsSync(EXAMPLES_FILE)) {
        try {
            const raw = fs.readFileSync(EXAMPLES_FILE, 'utf-8');
            _examples = JSON.parse(raw);
            console.log(`[DocExamples] Carregado: ${_examples.length} exemplos`);
        } catch {
            _examples = [];
        }
    } else {
        _examples = [];
        console.log('[DocExamples] Nenhum exemplo encontrado — rode seed pipeline');
    }

    _initialized = true;
}

function _flush(): void {
    fs.writeFileSync(EXAMPLES_FILE, JSON.stringify(_examples, null, 2));
}

function _ensureInit(): void {
    if (!_initialized) initDocExamples();
}

// ── CRUD ─────────────────────────────────────────────────────────────

/** Adiciona um exemplo. Deduplica por ID. */
export function addExample(example: StoredDocExample): void {
    _ensureInit();
    const idx = _examples.findIndex(e => e.id === example.id);
    if (idx >= 0) {
        _examples[idx] = example;
    } else {
        _examples.push(example);
        // LRU eviction se exceder limite
        if (_examples.length > MAX_EXAMPLES) {
            _examples.sort((a, b) => a.dataImportacao.localeCompare(b.dataImportacao));
            _examples = _examples.slice(_examples.length - MAX_EXAMPLES);
        }
    }
    _flush();
}

/** Adiciona múltiplos exemplos em batch. Flush único no final. */
export function addExamples(examples: StoredDocExample[]): number {
    _ensureInit();
    let added = 0;
    for (const ex of examples) {
        const idx = _examples.findIndex(e => e.id === ex.id);
        if (idx >= 0) {
            _examples[idx] = ex;
        } else {
            _examples.push(ex);
            added++;
        }
    }
    // LRU eviction
    if (_examples.length > MAX_EXAMPLES) {
        _examples.sort((a, b) => a.dataImportacao.localeCompare(b.dataImportacao));
        _examples = _examples.slice(_examples.length - MAX_EXAMPLES);
    }
    _flush();
    return added;
}

/** Busca exemplos por schemaId */
export function getExamples(schemaId: string, limit = 10): StoredDocExample[] {
    _ensureInit();
    return _examples
        .filter(e => e.schemaId === schemaId)
        .sort((a, b) => b.qualidade.total - a.qualidade.total)
        .slice(0, limit);
}

/** Retorna os melhores exemplos para um schemaId (sorted by quality) */
export function getTopExamples(schemaId: string, limit = 3): StoredDocExample[] {
    return getExamples(schemaId, limit);
}

/** Busca exemplos por texto (keywords matching) */
export function searchExamples(query: string, limit = 10): StoredDocExample[] {
    _ensureInit();
    if (!query || query.length < 2) return [];

    const lower = query.toLowerCase();
    const terms = lower.split(/\s+/);

    const scored = _examples.map(ex => {
        let score = 0;
        const searchable = [
            ex.titulo, ex.schemaId,
            ...ex.area, ...ex.keywords,
        ].join(' ').toLowerCase();

        for (const term of terms) {
            if (searchable.includes(term)) score += 2;
            if (ex.titulo.toLowerCase().includes(term)) score += 5;
        }

        // Boost por qualidade
        score += ex.qualidade.total / 50;

        return { example: ex, score };
    });

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.example);
}

/** Busca exemplos por área jurídica */
export function getExamplesByArea(area: string, limit = 10): StoredDocExample[] {
    _ensureInit();
    return _examples
        .filter(e => e.area.includes(area))
        .sort((a, b) => b.qualidade.total - a.qualidade.total)
        .slice(0, limit);
}

/** Incrementa contador de uso */
export function incrementUsage(id: string): void {
    _ensureInit();
    const ex = _examples.find(e => e.id === id);
    if (ex) {
        ex.vezesUsado++;
        ex.ultimoUso = new Date().toISOString();
        _flush();
    }
}

/** Remove um exemplo pelo ID */
export function removeExample(id: string): boolean {
    _ensureInit();
    const before = _examples.length;
    _examples = _examples.filter(e => e.id !== id);
    if (_examples.length < before) {
        _flush();
        return true;
    }
    return false;
}

/** Retorna todos os exemplos */
export function getAllExamples(): StoredDocExample[] {
    _ensureInit();
    return [..._examples];
}

/** Verifica se já existem exemplos (para decidir se roda seed pipeline) */
export function hasExamples(): boolean {
    _ensureInit();
    return _examples.length > 0;
}

/** Estatísticas do store */
export function getExampleStats(): {
    total: number;
    bySchema: Record<string, number>;
    byArea: Record<string, number>;
    byFonte: Record<string, number>;
} {
    _ensureInit();
    const bySchema: Record<string, number> = {};
    const byArea: Record<string, number> = {};
    const byFonte: Record<string, number> = {};

    for (const ex of _examples) {
        bySchema[ex.schemaId] = (bySchema[ex.schemaId] ?? 0) + 1;
        byFonte[ex.fonte] = (byFonte[ex.fonte] ?? 0) + 1;
        for (const a of ex.area) {
            byArea[a] = (byArea[a] ?? 0) + 1;
        }
    }

    return { total: _examples.length, bySchema, byArea, byFonte };
}

// ── Quality Score Helpers ────────────────────────────────────────────

/** Computa QualityScore heurístico para um documento */
export function computeQualityScore(
    texto: string,
    fonte: 'seed' | 'usuario' | 'crawled',
): QualityScore {
    // Curadoria base por fonte
    const curadoria = fonte === 'seed' ? 70 : fonte === 'usuario' ? 60 : 40;

    // Completude: detecta seções típicas
    const secoesPadrao = [
        /dos?\s+fatos/i, /do\s+direito/i, /dos?\s+pedidos/i,
        /preliminar/i, /cl[aá]usula/i, /endere[çc]amento/i,
    ];
    const secoesEncontradas = secoesPadrao.filter(r => r.test(texto)).length;
    const completude = Math.min(100, Math.round((secoesEncontradas / 3) * 100));

    // Formalidade: presença de termos jurídicos
    const termosFormais = [
        'excelentíssimo', 'vossa excelência', 'nestes termos', 'pede deferimento',
        'data vênia', 'ad judicia', 'in fine', 'supracitado',
        'requer', 'pugna', 'postula', 'fundamento', 'art.',
    ];
    const termosPresentes = termosFormais.filter(t => texto.toLowerCase().includes(t)).length;
    const formalidade = Math.min(100, Math.round((termosPresentes / 5) * 100));

    // Atualidade: documentos recentes > antigos (default 70 para seed)
    const atualidade = 70;

    const total = Math.round(
        completude * 0.3 + formalidade * 0.2 + atualidade * 0.1 + curadoria * 0.4
    );

    return { total, completude, formalidade, atualidade, curadoria };
}
