/**
 * Document Schema Registry — Singleton para schemas de documentos jurídicos
 *
 * Segue padrão do legal-store.ts: JSON em ~/.lex/legal/ + cache em memória.
 * Schemas builtin (seed) + schemas do usuário + backward compat com PetitionTemplate.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { DocumentSchema, DocumentCategory } from './doc-schemas';
import { CATEGORY_LABELS } from './doc-schemas';

// ── Paths ────────────────────────────────────────────────────────────

const LEGAL_DIR = path.join(os.homedir(), '.lex', 'legal');
const SCHEMAS_FILE = path.join(LEGAL_DIR, 'schemas.json');

// ── State ────────────────────────────────────────────────────────────

let _schemas: DocumentSchema[] = [];
let _initialized = false;

// ── Init ─────────────────────────────────────────────────────────────

/** Inicializa o registry. Aplica seed se primeiro uso. */
export function initDocSchemaRegistry(): void {
    if (_initialized) return;

    fs.mkdirSync(LEGAL_DIR, { recursive: true });

    const needsSeed = !fs.existsSync(SCHEMAS_FILE);

    if (needsSeed) {
        console.log('[DocSchemaRegistry] Primeiro uso — aplicando seed...');
        try {
            const { SEED_SCHEMAS } = require('./doc-schema-seed');
            _schemas = SEED_SCHEMAS;
            _flush();
            console.log(`[DocSchemaRegistry] Seed aplicado: ${_schemas.length} schemas`);
        } catch (err: any) {
            console.warn('[DocSchemaRegistry] Seed falhou:', err.message);
            _schemas = [];
        }
    } else {
        try {
            const raw = fs.readFileSync(SCHEMAS_FILE, 'utf-8');
            _schemas = JSON.parse(raw);
            console.log(`[DocSchemaRegistry] Carregado: ${_schemas.length} schemas`);
        } catch {
            _schemas = [];
        }
    }

    _initialized = true;
}

function _flush(): void {
    fs.writeFileSync(SCHEMAS_FILE, JSON.stringify(_schemas, null, 2));
}

function _ensureInit(): void {
    if (!_initialized) initDocSchemaRegistry();
}

// ── CRUD ─────────────────────────────────────────────────────────────

/** Busca schema por ID exato */
export function getSchema(id: string): DocumentSchema | null {
    _ensureInit();
    return _schemas.find(s => s.id === id) ?? null;
}

/** Lista schemas por categoria */
export function getSchemasByCategory(categoria: DocumentCategory): DocumentSchema[] {
    _ensureInit();
    return _schemas.filter(s => s.categoria === categoria);
}

/** Lista todas as categorias que têm schemas */
export function listCategories(): { id: DocumentCategory; label: string; count: number }[] {
    _ensureInit();
    const counts = new Map<DocumentCategory, number>();
    for (const s of _schemas) {
        counts.set(s.categoria, (counts.get(s.categoria) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([id, count]) => ({
        id,
        label: CATEGORY_LABELS[id] ?? id,
        count,
    }));
}

/** Busca schemas por texto (nome, área, subcategoria) */
export function searchSchemas(query: string, limit = 10): DocumentSchema[] {
    _ensureInit();
    if (!query || query.length < 2) return [];

    const lower = query.toLowerCase();
    const terms = lower.split(/\s+/);

    const scored = _schemas.map(s => {
        let score = 0;
        const searchable = [
            s.nome, s.id, s.subcategoria ?? '',
            ...s.areas,
            CATEGORY_LABELS[s.categoria] ?? '',
            ...(s.fundamentosComuns ?? []),
        ].join(' ').toLowerCase();

        for (const term of terms) {
            if (searchable.includes(term)) score += 2;
            if (s.nome.toLowerCase().includes(term)) score += 5;
            if (s.id.includes(term)) score += 3;
        }

        return { schema: s, score };
    });

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.schema);
}

/** Adiciona ou atualiza um schema */
export function addSchema(schema: DocumentSchema): void {
    _ensureInit();
    const idx = _schemas.findIndex(s => s.id === schema.id);
    if (idx >= 0) {
        _schemas[idx] = schema;
    } else {
        _schemas.push(schema);
    }
    _flush();
}

/** Remove um schema pelo ID */
export function removeSchema(id: string): boolean {
    _ensureInit();
    const before = _schemas.length;
    _schemas = _schemas.filter(s => s.id !== id);
    if (_schemas.length < before) {
        _flush();
        return true;
    }
    return false;
}

/** Retorna todos os schemas */
export function getAllSchemas(): DocumentSchema[] {
    _ensureInit();
    return [..._schemas];
}

/** Busca schema que mapeia para um legacyTemplateId */
export function getSchemaForLegacyTemplate(tipoPeticao: string): DocumentSchema | null {
    _ensureInit();
    // Primeiro tenta legacyTemplateId
    const byLegacy = _schemas.find(s => s.legacyTemplateId === tipoPeticao);
    if (byLegacy) return byLegacy;
    // Fallback: tenta pelo ID direto
    return _schemas.find(s => s.id === tipoPeticao) ?? null;
}

/** Busca schemas por área jurídica */
export function getSchemasByArea(area: string): DocumentSchema[] {
    _ensureInit();
    return _schemas.filter(s => s.areas.includes(area));
}

/** Estatísticas do registry */
export function getSchemaStats(): { total: number; byCategory: Record<string, number>; byFonte: Record<string, number> } {
    _ensureInit();
    const byCategory: Record<string, number> = {};
    const byFonte: Record<string, number> = {};
    for (const s of _schemas) {
        byCategory[s.categoria] = (byCategory[s.categoria] ?? 0) + 1;
        byFonte[s.fonte] = (byFonte[s.fonte] ?? 0) + 1;
    }
    return { total: _schemas.length, byCategory, byFonte };
}
