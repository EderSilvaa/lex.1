/**
 * Document Seed Pipeline — Converte docs do drive em StoredDocExample
 *
 * Lê os ~280 arquivos .txt de batch/modelos/drive/, categoriza por pasta,
 * detecta schema via regex, computa quality score e salva no doc-examples store.
 * Roda automaticamente no primeiro boot se o store estiver vazio.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StoredDocExample } from './doc-schemas';
import { computeQualityScore, addExamples, hasExamples } from './doc-examples';

// ── Mapeamento pasta → metadata ──────────────────────────────────────

interface FolderMeta {
    area: string[];
    defaultSchemaId: string;
}

const FOLDER_MAP: Record<string, FolderMeta> = {
    ADMINISTRATIVO:     { area: ['administrativo'],         defaultSchemaId: 'requerimento_administrativo' },
    AMBIENTAL:          { area: ['ambiental'],              defaultSchemaId: 'peticao_inicial' },
    BANCARIO:           { area: ['bancário', 'consumidor'], defaultSchemaId: 'peticao_inicial' },
    CIVEL_SUCESSOES:    { area: ['civil', 'sucessões'],     defaultSchemaId: 'peticao_inicial' },
    CONSUMIDOR:         { area: ['consumidor'],             defaultSchemaId: 'peticao_inicial' },
    CONTRATOS:          { area: ['civil', 'contratos'],     defaultSchemaId: 'contrato_prestacao_servicos' },
    FAMILIA:            { area: ['familia'],                defaultSchemaId: 'peticao_inicial' },
    IMOBILIARIO:        { area: ['imobiliário'],            defaultSchemaId: 'peticao_inicial' },
    MATERIAL_BASE:      { area: ['geral'],                  defaultSchemaId: 'peticao_simples' },
    PENAL:              { area: ['penal'],                  defaultSchemaId: 'peticao_inicial' },
    PETICOES_DIVERSAS:  { area: ['civil'],                  defaultSchemaId: 'peticao_inicial' },
    PLANO_SAUDE:        { area: ['consumidor', 'saúde'],    defaultSchemaId: 'peticao_inicial' },
    PREVIDENCIARIO:     { area: ['previdenciário'],         defaultSchemaId: 'peticao_inicial' },
    RECURSOS_DIVERSOS:  { area: ['civil'],                  defaultSchemaId: 'apelacao' },
    TRABALHISTA:        { area: ['trabalhista'],            defaultSchemaId: 'reclamacao_trabalhista' },
    TRANSITO:           { area: ['trânsito', 'administrativo'], defaultSchemaId: 'peticao_inicial' },
    TRIBUTARIO:         { area: ['tributário'],             defaultSchemaId: 'peticao_inicial' },
};

// ── Schema detection por regex no conteúdo ───────────────────────────

const SCHEMA_PATTERNS: [RegExp, string][] = [
    [/peti[çc][ãa]o\s+inicial/i,                        'peticao_inicial'],
    [/reclama[çc][ãa]o\s+trabalhista/i,                 'reclamacao_trabalhista'],
    [/contesta[çc][ãa]o/i,                              'contestacao'],
    [/apela[çc][ãa]o/i,                                 'apelacao'],
    [/recurso\s+ordin[aá]rio/i,                         'recurso_ordinario'],
    [/embargos\s+de\s+declara[çc][ãa]o/i,               'embargos_declaracao'],
    [/agravo\s+de\s+instrumento/i,                      'agravo_instrumento'],
    [/agravo\s+interno/i,                               'agravo_interno'],
    [/agravo\s+regimental/i,                            'agravo_interno'],
    [/mandado\s+de\s+seguran[çc]a/i,                    'mandado_seguranca'],
    [/habeas\s+corpus/i,                                'habeas_corpus'],
    [/reconven[çc][ãa]o/i,                              'reconvencao'],
    [/r[eé]plica|impugna[çc][ãa]o\s+[àa]\s+contesta/i, 'replica'],
    [/cumprimento\s+de\s+senten[çc]a/i,                 'cumprimento_sentenca'],
    [/execu[çc][ãa]o\s+de\s+t[ií]tulo/i,               'execucao_titulo_extrajudicial'],
    [/embargos\s+[àa]\s+execu[çc][ãa]o/i,              'embargos_execucao'],
    [/tutela\s+antecipada/i,                            'tutela_antecipada'],
    [/tutela\s+cautelar/i,                              'tutela_cautelar'],
    [/notifica[çc][ãa]o\s+extrajudicial/i,              'notificacao_extrajudicial'],
    [/acordo\s+extrajudicial/i,                         'acordo_extrajudicial'],
    [/contrato\s+de\s+presta[çc][ãa]o\s+de\s+servi/i,  'contrato_prestacao_servicos'],
    [/contrato\s+de\s+honor[aá]rios/i,                  'contrato_honorarios'],
    [/contrato\s+de\s+loca[çc][ãa]o/i,                  'contrato_locacao'],
    [/contrato\s+(?:de\s+)?compra\s+e\s+venda/i,        'contrato_compra_venda'],
    [/contrato\s+social/i,                              'contrato_social'],
    [/procura[çc][ãa]o/i,                               'procuracao_ad_judicia'],
    [/parecer\s+jur[ií]dico/i,                          'parecer_juridico'],
    [/of[ií]cio/i,                                      'oficio'],
    [/recurso\s+especial/i,                             'recurso_especial'],
    [/recurso\s+extraordin[aá]rio/i,                    'recurso_extraordinario'],
];

function detectSchema(text: string, fileName: string): string | null {
    // Tenta pelo nome do arquivo primeiro (mais confiável)
    for (const [pattern, schemaId] of SCHEMA_PATTERNS) {
        if (pattern.test(fileName)) return schemaId;
    }
    // Tenta pelo conteúdo (primeiros 2000 chars)
    const header = text.substring(0, 2000);
    for (const [pattern, schemaId] of SCHEMA_PATTERNS) {
        if (pattern.test(header)) return schemaId;
    }
    return null;
}

// ── Keyword extraction simples ───────────────────────────────────────

const STOPWORDS = new Set([
    'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
    'por', 'para', 'com', 'sem', 'sobre', 'entre', 'que', 'se', 'ou',
    'um', 'uma', 'uns', 'umas', 'ao', 'aos', 'à', 'às', 'e', 'o', 'a',
    'os', 'as', 'não', 'mais', 'foi', 'ser', 'ter', 'está', 'são',
    'como', 'mas', 'pelo', 'pela', 'este', 'esta', 'esse', 'essa',
    'isso', 'isto', 'quando', 'já', 'também', 'só', 'seu', 'sua',
]);

function extractKeywords(text: string, maxKeywords = 15): string[] {
    const words = text
        .toLowerCase()
        .replace(/[^a-záàâãéèêíïóôõúüç\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !STOPWORDS.has(w));

    // Contagem de frequência
    const freq = new Map<string, number>();
    for (const w of words) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
    }

    return Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxKeywords)
        .map(([word]) => word);
}

// ── Pipeline principal ───────────────────────────────────────────────

export interface SeedPipelineResult {
    total: number;
    imported: number;
    skipped: number;
    errors: string[];
}

/**
 * Roda o seed pipeline: lê docs do drive, categoriza, computa qualidade, salva.
 * Retorna resultado com contadores.
 */
export function runSeedPipeline(driveDir?: string): SeedPipelineResult {
    const result: SeedPipelineResult = { total: 0, imported: 0, skipped: 0, errors: [] };

    // Encontra diretório de modelos
    const candidatePaths = driveDir ? [driveDir] : [
        path.join(__dirname, '..', 'batch', 'modelos', 'drive'),
        path.join(__dirname, 'batch', 'modelos', 'drive'),
        path.join(__dirname, '..', '..', 'electron', 'batch', 'modelos', 'drive'),
    ];

    let baseDir: string | null = null;
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) { baseDir = p; break; }
    }

    if (!baseDir) {
        console.warn('[SeedPipeline] Diretório de modelos não encontrado');
        return result;
    }

    const hoje = new Date().toISOString();
    const examples: StoredDocExample[] = [];

    // Itera sobre subpastas
    const folders = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);

    for (const folder of folders) {
        const meta = FOLDER_MAP[folder];
        if (!meta) {
            // Pastas sem mapeamento (DICIONARIO_JURIDICO, DOCUMENTOS_ADVOGADO)
            continue;
        }

        const folderPath = path.join(baseDir, folder);
        let files: string[];
        try {
            files = fs.readdirSync(folderPath).filter(f => f.endsWith('.txt'));
        } catch {
            continue;
        }

        for (const file of files) {
            result.total++;

            // Ignora arquivos de metadata do Google Drive
            if (file.startsWith('Size_') || file === 'Compartilhado.txt') {
                result.skipped++;
                continue;
            }

            const filePath = path.join(folderPath, file);
            let content: string;
            try {
                content = fs.readFileSync(filePath, 'utf-8').trim();
            } catch (err: any) {
                result.errors.push(`${file}: ${err.message}`);
                continue;
            }

            // Ignora arquivos muito curtos
            if (content.length < 100) {
                result.skipped++;
                continue;
            }

            const schemaId = detectSchema(content, file) ?? meta.defaultSchemaId;
            const titulo = file.replace('.txt', '').replace(/[_-]/g, ' ').trim();
            const keywords = extractKeywords(content);
            const qualidade = computeQualityScore(content, 'seed');

            const id = `seed:${folder}:${file.replace('.txt', '')}`.toLowerCase().replace(/\s+/g, '_');

            examples.push({
                id,
                schemaId,
                titulo,
                conteudo: content,
                area: meta.area,
                keywords,
                qualidade,
                fonte: 'seed',
                origemArquivo: `drive/${folder}/${file}`,
                dataImportacao: hoje,
                vezesUsado: 0,
            });
        }
    }

    // Salva todos de uma vez
    if (examples.length > 0) {
        const added = addExamples(examples);
        result.imported = added;
        console.log(`[SeedPipeline] ${added} exemplos importados de ${result.total} arquivos (${result.skipped} pulados)`);
    }

    return result;
}

/**
 * Roda seed pipeline se o store estiver vazio.
 * Chamado no boot do app.
 */
export function seedIfEmpty(): SeedPipelineResult | null {
    if (hasExamples()) return null;
    console.log('[SeedPipeline] Store vazio — rodando seed...');
    return runSeedPipeline();
}
