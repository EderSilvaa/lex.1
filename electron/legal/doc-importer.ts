/**
 * Document Importer — Import de documentos do usuário
 *
 * Parseia .txt e .docx (via mammoth), classifica via heurística,
 * computa quality score e salva no doc-examples store.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StoredDocExample } from './doc-schemas';
import { computeQualityScore, addExample } from './doc-examples';
import { searchSchemas } from './doc-schema-registry';

// ── Types ────────────────────────────────────────────────────────────

export interface ImportResult {
    total: number;
    imported: number;
    skipped: number;
    errors: string[];
}

const SUPPORTED_EXTS = ['.txt', '.docx'];

// ── Schema classification via heurística ─────────────────────────────

const CLASSIFY_PATTERNS: [RegExp, string, string[]][] = [
    // [pattern, schemaId, areas]
    [/peti[çc][ãa]o\s+inicial/i,                        'peticao_inicial',           ['civil']],
    [/reclama[çc][ãa]o\s+trabalhista/i,                 'reclamacao_trabalhista',     ['trabalhista']],
    [/contesta[çc][ãa]o/i,                              'contestacao',               ['civil']],
    [/apela[çc][ãa]o/i,                                 'apelacao',                  ['civil']],
    [/recurso\s+ordin[aá]rio/i,                         'recurso_ordinario',         ['trabalhista']],
    [/embargos\s+de\s+declara[çc][ãa]o/i,               'embargos_declaracao',       ['civil']],
    [/agravo\s+de\s+instrumento/i,                      'agravo_instrumento',        ['civil']],
    [/mandado\s+de\s+seguran[çc]a/i,                    'mandado_seguranca',         ['administrativo']],
    [/habeas\s+corpus/i,                                'habeas_corpus',             ['penal']],
    [/cumprimento\s+de\s+senten[çc]a/i,                 'cumprimento_sentenca',      ['civil']],
    [/notifica[çc][ãa]o\s+extrajudicial/i,              'notificacao_extrajudicial', ['civil']],
    [/contrato\s+de\s+presta[çc][ãa]o/i,                'contrato_prestacao_servicos', ['civil']],
    [/contrato\s+de\s+honor[aá]rios/i,                  'contrato_honorarios',       ['civil']],
    [/contrato\s+de\s+loca[çc][ãa]o/i,                  'contrato_locacao',          ['imobiliário']],
    [/contrato\s+social/i,                              'contrato_social',           ['empresarial']],
    [/procura[çc][ãa]o/i,                               'procuracao_ad_judicia',     ['civil']],
    [/parecer/i,                                        'parecer_juridico',          ['civil']],
    [/of[ií]cio/i,                                      'oficio',                    ['administrativo']],
];

interface ClassifyResult {
    schemaId: string;
    areas: string[];
    confidence: number;
}

function classifyDocument(text: string, fileName: string): ClassifyResult {
    // Tenta pelo nome do arquivo
    for (const [pattern, schemaId, areas] of CLASSIFY_PATTERNS) {
        if (pattern.test(fileName)) {
            return { schemaId, areas, confidence: 0.8 };
        }
    }

    // Tenta pelo conteúdo (header)
    const header = text.substring(0, 3000);
    for (const [pattern, schemaId, areas] of CLASSIFY_PATTERNS) {
        if (pattern.test(header)) {
            return { schemaId, areas, confidence: 0.6 };
        }
    }

    // Fallback: tenta buscar schema por keywords do texto
    const schemas = searchSchemas(text.substring(0, 500), 1);
    if (schemas.length > 0) {
        return {
            schemaId: schemas[0]!.id,
            areas: schemas[0]!.areas,
            confidence: 0.3,
        };
    }

    return { schemaId: 'peticao_simples', areas: ['geral'], confidence: 0.1 };
}

// ── Keyword extraction ───────────────────────────────────────────────

const STOPWORDS = new Set([
    'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
    'por', 'para', 'com', 'sem', 'sobre', 'entre', 'que', 'se', 'ou',
    'um', 'uma', 'uns', 'umas', 'ao', 'aos', 'à', 'às', 'e', 'o', 'a',
    'os', 'as', 'não', 'mais', 'foi', 'ser', 'ter', 'está', 'são',
]);

function extractKeywords(text: string, max = 15): string[] {
    const words = text
        .toLowerCase()
        .replace(/[^a-záàâãéèêíïóôõúüç\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !STOPWORDS.has(w));

    const freq = new Map<string, number>();
    for (const w of words) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
    }

    return Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, max)
        .map(([word]) => word);
}

// ── File reading ─────────────────────────────────────────────────────

async function readFile(filePath: string): Promise<string | null> {
    const ext = path.extname(filePath).toLowerCase();
    try {
        if (ext === '.txt') {
            return fs.readFileSync(filePath, 'utf-8');
        }
        if (ext === '.docx') {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        }
        return null;
    } catch {
        return null;
    }
}

// ── Public API ───────────────────────────────────────────────────────

/** Importa um único arquivo */
export async function importFile(filePath: string): Promise<StoredDocExample | null> {
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTS.includes(ext)) return null;

    const content = await readFile(filePath);
    if (!content || content.trim().length < 100) return null;

    const fileName = path.basename(filePath, ext);
    const classification = classifyDocument(content, fileName);
    const keywords = extractKeywords(content);
    const qualidade = computeQualityScore(content, 'usuario');
    const hoje = new Date().toISOString();

    const id = `user:${Date.now()}:${fileName}`.toLowerCase().replace(/\s+/g, '_').substring(0, 100);

    const example: StoredDocExample = {
        id,
        schemaId: classification.schemaId,
        titulo: fileName.replace(/[_-]/g, ' ').trim(),
        conteudo: content.trim(),
        area: classification.areas,
        keywords,
        qualidade,
        fonte: 'usuario',
        origemArquivo: filePath,
        dataImportacao: hoje,
        vezesUsado: 0,
    };

    addExample(example);
    return example;
}

/** Importa todos os documentos de uma pasta (recursivo) */
export async function importFolder(
    folderPath: string,
    onProgress?: (msg: string) => void,
): Promise<ImportResult> {
    const result: ImportResult = { total: 0, imported: 0, skipped: 0, errors: [] };

    if (!fs.existsSync(folderPath)) {
        result.errors.push(`Pasta não encontrada: ${folderPath}`);
        return result;
    }

    const files = listFilesRecursive(folderPath);
    result.total = files.length;

    for (const file of files) {
        try {
            onProgress?.(`Importando ${path.basename(file)}...`);
            const example = await importFile(file);
            if (example) {
                result.imported++;
            } else {
                result.skipped++;
            }
        } catch (err: any) {
            result.errors.push(`${path.basename(file)}: ${err.message}`);
        }
    }

    onProgress?.(`Concluído: ${result.imported} importados, ${result.skipped} ignorados`);
    return result;
}

function listFilesRecursive(dir: string): string[] {
    const result: string[] = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            if (e.name.startsWith('.')) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                result.push(...listFilesRecursive(full));
            } else {
                const ext = path.extname(e.name).toLowerCase();
                if (SUPPORTED_EXTS.includes(ext)) {
                    result.push(full);
                }
            }
        }
    } catch { /* ignora erros de permissão */ }
    return result;
}
