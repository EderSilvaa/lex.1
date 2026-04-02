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

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const LEX_DIR = path.join(os.homedir(), '.lex');
const EXCLUDED_TYPES: BrainNodeType[] = ['selector', 'prazo'];

// ============================================================================
// EXPORT
// ============================================================================

export interface ExportResult {
    filePath: string;
    manifest: BrainExportManifest;
}

/**
 * Exporta o Brain como arquivo .json.gz no diretório ~/.lex/.
 * Retorna o caminho do arquivo gerado.
 */
export async function exportBrain(brain: BrainStore): Promise<ExportResult> {
    if (!fs.existsSync(LEX_DIR)) {
        fs.mkdirSync(LEX_DIR, { recursive: true });
    }

    const graph = brain.getFullGraph();

    // Filtra nós excluídos
    const excludedSet = new Set<string>(EXCLUDED_TYPES);
    const nodes = graph.nodes.filter(n => !excludedSet.has(n.type));
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = graph.edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

    // Preferências (exceto campos sensíveis)
    const preferences: Record<string, any> = {};
    const prefKeys = brain.db.prepare('SELECT key, value FROM preferences').all() as any[];
    for (const row of prefKeys) {
        // Exclude API keys or sensitive fields
        if (!row.key.includes('api_key') && !row.key.includes('token')) {
            try { preferences[row.key] = JSON.parse(row.value); }
            catch { preferences[row.key] = row.value; }
        }
    }

    const manifest: BrainExportManifest = {
        version: 1,
        exportedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        edgeCount: edges.length,
        excludedTypes: EXCLUDED_TYPES,
    };

    const bundle = { manifest, nodes, edges, preferences };
    const json = JSON.stringify(bundle, null, 2);
    const compressed = await gzip(Buffer.from(json, 'utf-8'));

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `lex-brain-export-${dateStr}.json.gz`;
    const filePath = path.join(LEX_DIR, fileName);

    fs.writeFileSync(filePath, compressed);
    console.log(`[BrainExport] Exportado: ${filePath} (${nodes.length} nós, ${edges.length} arestas)`);

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

    // Import nodes
    const tx = brain.db.transaction(() => {
        for (const node of nodes) {
            try {
                const existing = brain.getNodeByTypeAndLabel(node.type, node.label);
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
                } else {
                    // Insert new
                    const created = brain.addNode(node.type, node.label, node.data ?? {}, {
                        confidence: node.confidence ?? 0.5,
                        source: `import:${bundle.manifest.exportedAt?.split('T')[0] ?? 'unknown'}`,
                    });
                    idMap.set(node.id, created.id);
                    result.nodesImported++;
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
