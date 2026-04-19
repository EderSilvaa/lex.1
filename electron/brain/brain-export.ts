/**
 * LEX Brain — Export / Import
 *
 * Exporta o grafo de conhecimento como bundle JSON (+ opcionalmente gz).
 * Permite compartilhar o Brain entre instalações do LEX.
 *
 * Formato: { manifest, nodes, edges, aprendizados, preferences }
 * Arquivo: ~/.lex/lex-brain-export-<date>.json
 *
 * Excluídos da exportação:
 *   - selectors (específicos por máquina)
 *   - interactions (logs de uso)
 *   - prazo (volátil)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type { BrainStore } from './brain-store';
import type { BrainExportManifest, BrainNodeType } from './types';
import {
    getLocalSourceIdentity, applyTrustOnMerge, boostFlowByTrust,
    type PatternsBundleMeta,
} from './federated-trust';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const LEX_DIR = path.join(os.homedir(), '.lex');
const EXCLUDED_TYPES: BrainNodeType[] = ['selector', 'prazo'];

/**
 * Modos de export:
 *   - 'full'     — tudo exceto selectors/prazo (comportamento legado)
 *   - 'patterns' — só conhecimento reutilizável (padrões de navegação,
 *                  ações, fluxos, seletores, tribunais). ZERO dado de
 *                  processo / parte / tese / decisão. Seguro para
 *                  compartilhar entre escritórios.
 */
export type ExportMode = 'full' | 'patterns';

// Tipos de nó que representam PADRÕES reutilizáveis (não dados de processo).
const PATTERN_TYPES: ReadonlySet<BrainNodeType> = new Set<BrainNodeType>([
    'page_state', 'action', 'flow', 'selector', 'tribunal',
]);

// ============================================================================
// EXPORT
// ============================================================================

export interface ExportResult {
    filePath: string;
    manifest: BrainExportManifest;
}

/**
 * Em modo 'patterns', escrubbing adicional dos `data` de cada nó: remove
 * campos que podem conter referências a processos/PII (url, title com número
 * de processo, etc). Mantém só o que é reutilizável (domHash, tribunal,
 * pjeContext, tool, outputHash, durationMs, success).
 */
const PATTERN_DATA_ALLOW: Record<string, ReadonlySet<string>> = {
    page_state: new Set(['domHash', 'tribunal', 'pjeContext']),
    action: new Set(['tool', 'server', 'outputHash', 'outputSize', 'durationMs', 'success']),
    flow: new Set(['name', 'description']),
    selector: new Set(['tribunal', 'context', 'selector', 'successCount', 'failureCount']),
    tribunal: new Set(['name', 'uf', 'instancia']),
};

function scrubPatternData(type: BrainNodeType, data: Record<string, any>): Record<string, any> {
    const allow = PATTERN_DATA_ALLOW[type];
    if (!allow) return {};
    const out: Record<string, any> = {};
    for (const key of allow) {
        if (data && key in data) out[key] = data[key];
    }
    return out;
}

/**
 * Exporta o Brain como arquivo .json.gz no diretório ~/.lex/.
 * Retorna o caminho do arquivo gerado.
 */
export async function exportBrain(
    brain: BrainStore,
    opts: { mode?: ExportMode } = {},
): Promise<ExportResult> {
    const mode: ExportMode = opts.mode ?? 'full';

    if (!fs.existsSync(LEX_DIR)) {
        fs.mkdirSync(LEX_DIR, { recursive: true });
    }

    const graph = brain.getFullGraph();

    let nodes = graph.nodes;
    let excludedTypes: BrainNodeType[];

    if (mode === 'patterns') {
        nodes = graph.nodes
            .filter(n => PATTERN_TYPES.has(n.type))
            .map(n => ({ ...n, data: scrubPatternData(n.type, n.data || {}) }));
        excludedTypes = (['processo', 'tese', 'parte', 'aprendizado', 'prazo', 'decisao'] as BrainNodeType[]);
    } else {
        const excludedSet = new Set<string>(EXCLUDED_TYPES);
        nodes = graph.nodes.filter(n => !excludedSet.has(n.type));
        excludedTypes = EXCLUDED_TYPES;
    }

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = graph.edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

    // Preferences: em 'patterns' não exporta nada; em 'full' segue o filtro antigo.
    const preferences: Record<string, any> = {};
    if (mode === 'full') {
        const prefKeys = brain.db.prepare('SELECT key, value FROM preferences').all() as any[];
        for (const row of prefKeys) {
            if (!row.key.includes('api_key') && !row.key.includes('token')) {
                try { preferences[row.key] = JSON.parse(row.value); }
                catch { preferences[row.key] = row.value; }
            }
        }
    }

    const manifest: BrainExportManifest = {
        version: 1,
        exportedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        edgeCount: edges.length,
        excludedTypes,
        ...(mode === 'patterns' ? { mode: 'patterns' } : {}),
    } as BrainExportManifest;

    // Em modo patterns, anexa identidade do source — habilita federated trust
    // no destino. Não vai em 'full' porque full só faz sentido como restore
    // de backup local.
    const patternsMeta: PatternsBundleMeta | undefined = mode === 'patterns'
        ? (() => {
            const id = getLocalSourceIdentity();
            return {
                sourceId: id.sourceId,
                sourceFingerprint: id.sourceFingerprint,
                exportedAt: manifest.exportedAt,
                version: 1,
            };
        })()
        : undefined;

    const bundle: Record<string, any> = { manifest, nodes, edges, preferences };
    if (patternsMeta) bundle['patternsMeta'] = patternsMeta;
    const json = JSON.stringify(bundle, null, 2);
    const compressed = await gzip(Buffer.from(json, 'utf-8'));

    const dateStr = new Date().toISOString().split('T')[0];
    const suffix = mode === 'patterns' ? '-patterns' : '';
    const fileName = `lex-brain-export${suffix}-${dateStr}.json.gz`;
    const filePath = path.join(LEX_DIR, fileName);

    fs.writeFileSync(filePath, compressed);
    console.log(`[BrainExport] Exportado (${mode}): ${filePath} (${nodes.length} nós, ${edges.length} arestas)`);

    return { filePath, manifest };
}

// ============================================================================
// IMPORT
// ============================================================================

export interface ImportResult {
    nodesImported: number;
    edgesImported: number;
    nodesMerged: number;
    errors: string[];
}

/**
 * Importa um bundle exportado (.json.gz ou .json) para o Brain atual.
 * Modo: merge — nós existentes são atualizados se a confiança for maior.
 * Nós novos são adicionados. Nenhum nó é deletado.
 */
export async function importBrain(brain: BrainStore, filePath: string): Promise<ImportResult> {
    const result: ImportResult = { nodesImported: 0, edgesImported: 0, nodesMerged: 0, errors: [] };

    if (!fs.existsSync(filePath)) {
        result.errors.push(`Arquivo não encontrado: ${filePath}`);
        return result;
    }

    let json: string;
    try {
        const raw = fs.readFileSync(filePath);
        if (filePath.endsWith('.gz')) {
            const decompressed = await gunzip(raw);
            json = decompressed.toString('utf-8');
        } else {
            json = raw.toString('utf-8');
        }
    } catch (err: any) {
        result.errors.push(`Falha ao ler arquivo: ${err.message}`);
        return result;
    }

    let bundle: any;
    try {
        bundle = JSON.parse(json);
    } catch (err: any) {
        result.errors.push(`JSON inválido: ${err.message}`);
        return result;
    }

    if (!bundle.manifest || !Array.isArray(bundle.nodes) || !Array.isArray(bundle.edges)) {
        result.errors.push('Bundle inválido: campos obrigatórios ausentes');
        return result;
    }

    const { nodes, edges, preferences } = bundle;
    const idMap = new Map<string, string>(); // oldId → newId

    // Federated trust: se bundle veio de export patterns, aplica o multiplier.
    const patternsMeta: PatternsBundleMeta | undefined = bundle.patternsMeta;
    const flowLabels: string[] = patternsMeta
        ? nodes.filter((n: any) => n.type === 'flow').map((n: any) => String(n.label))
        : [];
    const trustByLabel: Map<string, number> = patternsMeta
        ? applyTrustOnMerge(brain, { meta: patternsMeta, flowLabels })
        : new Map();

    // Import nodes
    const tx = brain.db.transaction(() => {
        for (const node of nodes) {
            try {
                const existing = brain.getNodeByTypeAndLabel(node.type, node.label);
                let localId: string;
                if (existing) {
                    // Merge: update se confiança maior
                    if (node.confidence > existing.confidence) {
                        brain.updateNode(existing.id, {
                            data: { ...existing.data, ...node.data },
                            confidence: node.confidence,
                        });
                        result.nodesMerged++;
                    }
                    idMap.set(node.id, existing.id);
                    localId = existing.id;
                } else {
                    // Insert new
                    const created = brain.addNode(node.type, node.label, node.data ?? {}, {
                        confidence: node.confidence ?? 0.5,
                        source: patternsMeta
                            ? `federated:${patternsMeta.sourceId.slice(0, 8)}`
                            : `import:${bundle.manifest.exportedAt?.split('T')[0] ?? 'unknown'}`,
                    });
                    idMap.set(node.id, created.id);
                    result.nodesImported++;
                    localId = created.id;
                }

                // Aplica trust boost em flow nodes federados.
                if (node.type === 'flow' && patternsMeta) {
                    const mult = trustByLabel.get(String(node.label)) ?? 1;
                    boostFlowByTrust(brain, localId, mult);
                }
            } catch (err: any) {
                result.errors.push(`Node "${node.label}": ${err.message}`);
            }
        }

        // Import edges (remapped IDs)
        for (const edge of edges) {
            const newSource = idMap.get(edge.sourceId);
            const newTarget = idMap.get(edge.targetId);
            if (!newSource || !newTarget) continue;

            try {
                brain.addEdge(newSource, newTarget, edge.relation, edge.data ?? {});
                result.edgesImported++;
            } catch {
                // INSERT OR IGNORE — duplicate edges are fine
            }
        }

        // Import preferences (merge, don't overwrite existing)
        if (preferences && typeof preferences === 'object') {
            for (const [key, value] of Object.entries(preferences)) {
                const existing = brain.getPreference(key);
                if (existing === undefined) {
                    brain.setPreference(key, value);
                }
            }
        }
    });

    try {
        tx();
    } catch (err: any) {
        result.errors.push(`Transação falhou: ${err.message}`);
    }

    console.log(`[BrainImport] ${result.nodesImported} nós importados, ${result.nodesMerged} merged, ${result.edgesImported} arestas`);
    return result;
}
