/**
 * LEX Brain — Store
 *
 * CRUD sobre grafo de conhecimento (nodes/edges), busca FTS5,
 * selectors, interactions, preferences. API sincrona (better-sqlite3).
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { applySchema, runMigrations } from './schema';
import type {
    BrainNode, BrainEdge, BrainNodeType, BrainEdgeRelation,
    BrainSearchResult, BrainGraphData, BrainContextResult,
    InteractionRow, SelectorAnalytics,
} from './types';

export class BrainStore {
    readonly db: Database.Database;

    constructor(dbPath: string) {
        this.db = new Database(dbPath);
        applySchema(this.db);
        runMigrations(this.db);
    }

    close(): void {
        if (this.db.open) this.db.close();
    }

    // ================================================================
    // NODES
    // ================================================================

    addNode(
        type: BrainNodeType,
        label: string,
        data: Record<string, any> = {},
        opts: { confidence?: number; source?: string } = {},
    ): BrainNode {
        const now = Date.now();
        const node: BrainNode = {
            id: randomUUID(),
            type,
            label,
            data,
            confidence: opts.confidence ?? 0.5,
            source: opts.source ?? 'agent',
            createdAt: now,
            updatedAt: now,
            accessedAt: now,
        };
        this.db.prepare(`
            INSERT INTO nodes (id, type, label, data, confidence, source, created_at, updated_at, accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(node.id, node.type, node.label, JSON.stringify(node.data), node.confidence, node.source, now, now, now);
        return node;
    }

    getNode(id: string): BrainNode | null {
        const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as any;
        return row ? this._mapNode(row) : null;
    }

    getNodeByTypeAndLabel(type: BrainNodeType, label: string): BrainNode | null {
        const row = this.db.prepare('SELECT * FROM nodes WHERE type = ? AND label = ?').get(type, label) as any;
        return row ? this._mapNode(row) : null;
    }

    updateNode(id: string, updates: Partial<Pick<BrainNode, 'label' | 'data' | 'confidence'>>): void {
        const sets: string[] = ['updated_at = ?'];
        const vals: any[] = [Date.now()];
        if (updates.label !== undefined) { sets.push('label = ?'); vals.push(updates.label); }
        if (updates.data !== undefined) { sets.push('data = ?'); vals.push(JSON.stringify(updates.data)); }
        if (updates.confidence !== undefined) { sets.push('confidence = ?'); vals.push(updates.confidence); }
        vals.push(id);
        this.db.prepare(`UPDATE nodes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }

    touchNode(id: string): void {
        this.db.prepare('UPDATE nodes SET accessed_at = ? WHERE id = ?').run(Date.now(), id);
    }

    deleteNode(id: string): void {
        this.db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
    }

    deleteNodes(ids: string[]): void {
        const del = this.db.prepare('DELETE FROM nodes WHERE id = ?');
        const tx = this.db.transaction(() => { for (const id of ids) del.run(id); });
        tx();
    }

    getNodesByType(type: BrainNodeType, limit = 100): BrainNode[] {
        const rows = this.db.prepare('SELECT * FROM nodes WHERE type = ? ORDER BY updated_at DESC LIMIT ?').all(type, limit) as any[];
        return rows.map(r => this._mapNode(r));
    }

    // ================================================================
    // EDGES
    // ================================================================

    addEdge(
        sourceId: string,
        targetId: string,
        relation: BrainEdgeRelation,
        data: Record<string, any> = {},
    ): BrainEdge {
        const now = Date.now();
        const edge: BrainEdge = {
            id: randomUUID(),
            sourceId,
            targetId,
            relation,
            weight: 1.0,
            data,
            createdAt: now,
            updatedAt: now,
        };
        this.db.prepare(`
            INSERT OR IGNORE INTO edges (id, source_id, target_id, relation, weight, data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(edge.id, sourceId, targetId, relation, 1.0, JSON.stringify(data), now, now);
        return edge;
    }

    getEdgesFrom(nodeId: string, relation?: BrainEdgeRelation): BrainEdge[] {
        const sql = relation
            ? 'SELECT * FROM edges WHERE source_id = ? AND relation = ?'
            : 'SELECT * FROM edges WHERE source_id = ?';
        const rows = (relation
            ? this.db.prepare(sql).all(nodeId, relation)
            : this.db.prepare(sql).all(nodeId)) as any[];
        return rows.map(r => this._mapEdge(r));
    }

    getEdgesTo(nodeId: string, relation?: BrainEdgeRelation): BrainEdge[] {
        const sql = relation
            ? 'SELECT * FROM edges WHERE target_id = ? AND relation = ?'
            : 'SELECT * FROM edges WHERE target_id = ?';
        const rows = (relation
            ? this.db.prepare(sql).all(nodeId, relation)
            : this.db.prepare(sql).all(nodeId)) as any[];
        return rows.map(r => this._mapEdge(r));
    }

    boostEdge(sourceId: string, targetId: string, relation: BrainEdgeRelation, amount: number): void {
        this.db.prepare(`
            UPDATE edges SET weight = weight + ?, updated_at = ?
            WHERE source_id = ? AND target_id = ? AND relation = ?
        `).run(amount, Date.now(), sourceId, targetId, relation);
    }

    // ================================================================
    // GRAPH QUERIES
    // ================================================================

    getFullGraph(): BrainGraphData {
        const nodes = (this.db.prepare('SELECT * FROM nodes ORDER BY updated_at DESC LIMIT 500').all() as any[]).map(r => this._mapNode(r));
        const nodeIds = new Set(nodes.map(n => n.id));
        const allEdges = (this.db.prepare('SELECT * FROM edges').all() as any[]).map(r => this._mapEdge(r));
        const edges = allEdges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));
        return { nodes, edges };
    }

    getSubgraph(nodeId: string, depth = 1): BrainGraphData {
        const visited = new Set<string>();
        const queue: Array<{ id: string; d: number }> = [{ id: nodeId, d: 0 }];
        const nodeRows: any[] = [];
        const edgeRows: any[] = [];

        while (queue.length > 0) {
            const { id, d } = queue.shift()!;
            if (visited.has(id)) continue;
            visited.add(id);

            const node = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as any;
            if (!node) continue;
            nodeRows.push(node);

            if (d < depth) {
                const outEdges = this.db.prepare('SELECT * FROM edges WHERE source_id = ?').all(id) as any[];
                const inEdges = this.db.prepare('SELECT * FROM edges WHERE target_id = ?').all(id) as any[];
                for (const e of [...outEdges, ...inEdges]) {
                    edgeRows.push(e);
                    const neighbor = e.source_id === id ? e.target_id : e.source_id;
                    if (!visited.has(neighbor)) queue.push({ id: neighbor, d: d + 1 });
                }
            }
        }

        return {
            nodes: nodeRows.map(r => this._mapNode(r)),
            edges: this._dedupeEdges(edgeRows).map(r => this._mapEdge(r)),
        };
    }

    getProcessoGraph(numero: string): BrainGraphData {
        const node = this.getNodeByTypeAndLabel('processo', numero);
        if (!node) return { nodes: [], edges: [] };
        this.touchNode(node.id);
        return this.getSubgraph(node.id, 1);
    }

    // ================================================================
    // FTS5 SEARCH
    // ================================================================

    search(query: string, opts: { types?: BrainNodeType[]; limit?: number } = {}): BrainSearchResult[] {
        const limit = opts.limit ?? 20;
        const ftsQuery = this._buildFtsQuery(query);
        if (!ftsQuery) return [];

        let sql = `
            SELECT n.*, fts.rank
            FROM nodes_fts fts
            JOIN nodes n ON n.rowid = fts.rowid
            WHERE nodes_fts MATCH ?
        `;
        const params: any[] = [ftsQuery];

        if (opts.types && opts.types.length > 0) {
            sql += ` AND n.type IN (${opts.types.map(() => '?').join(',')})`;
            params.push(...opts.types);
        }

        sql += ` ORDER BY fts.rank LIMIT ?`;
        params.push(limit);

        const rows = this.db.prepare(sql).all(...params) as any[];
        return rows.map(r => ({
            node: this._mapNode(r),
            rank: r.rank,
        }));
    }

    searchInteractions(query: string, limit = 5): InteractionRow[] {
        const ftsQuery = this._buildFtsQuery(query);
        if (!ftsQuery) return [];

        const rows = this.db.prepare(`
            SELECT i.*, fts.rank
            FROM interactions_fts fts
            JOIN interactions i ON i.rowid = fts.rowid
            WHERE interactions_fts MATCH ?
            ORDER BY fts.rank
            LIMIT ?
        `).all(ftsQuery, limit) as any[];

        return rows.map(r => ({
            id: r.id,
            objetivo: r.objetivo,
            resposta: r.resposta,
            passos: r.passos,
            duracao: r.duracao,
            sucesso: r.sucesso,
            createdAt: r.created_at,
        }));
    }

    // ================================================================
    // CONTEXT FOR PROMPTS (replaces Memory.getRelevante)
    // ================================================================

    getContext(objetivo: string, budget: { maxMemoryChars: number }): BrainContextResult {
        const parts: string[] = [];
        const nodeIds: string[] = [];
        let charCount = 0;
        const maxChars = budget.maxMemoryChars;

        const addPart = (text: string): boolean => {
            if (charCount + text.length > maxChars) return false;
            parts.push(text);
            charCount += text.length;
            return true;
        };

        // 1. Processos recentes
        const recentProcessos = this.getRecentProcessos(5);
        if (recentProcessos.length > 0) {
            const lines = recentProcessos.map(n => {
                nodeIds.push(n.id);
                const d = n.data;
                let line = `- ${n.label}`;
                if (d['classe']) line += ` (${d['classe']})`;
                if (d['tribunal']) line += ` [${d['tribunal']}]`;
                return line;
            });
            addPart(`Processos recentes:\n${lines.join('\n')}`);
        }

        // 2. FTS5 search — nos relevantes ao objetivo
        const relevant = this.search(objetivo, { limit: 8 });
        if (relevant.length > 0) {
            const lines = relevant
                .filter(r => !nodeIds.includes(r.node.id))
                .slice(0, 5)
                .map(r => {
                    nodeIds.push(r.node.id);
                    return `- [${r.node.type}] ${r.node.label}`;
                });
            if (lines.length > 0) {
                addPart(`\nContexto relevante do Brain:\n${lines.join('\n')}`);
            }
        }

        // 3. Cross-session facts expandidos (processos com teses/decisoes)
        const processoNodes = this.search(objetivo, { types: ['processo'], limit: 3 });
        for (const pResult of processoNodes) {
            const p = pResult.node;
            if (nodeIds.includes(p.id)) continue;
            nodeIds.push(p.id);

            const teses = this.getEdgesFrom(p.id, 'has_tese')
                .map(e => this.getNode(e.targetId))
                .filter(Boolean)
                .map(n => n!.label);
            const decisoes = this.getEdgesFrom(p.id, 'has_decisao')
                .map(e => this.getNode(e.targetId))
                .filter(Boolean)
                .map(n => n!.label);

            let factText = `- ${p.label}`;
            if (teses.length > 0) factText += `: ${teses.slice(0, 2).join(', ')}`;
            if (decisoes.length > 0) factText += ` | Decisao: ${decisoes.slice(0, 1).join(', ')}`;
            if (!addPart(factText)) break;
        }

        // 4. Aprendizados recentes
        const aprendizados = this.getAprendizados(3);
        if (aprendizados.length > 0) {
            const lines = aprendizados.map(n => `- ${n.label}`);
            addPart(`\nAprendizados:\n${lines.join('\n')}`);
        }

        // 5. Interacoes similares
        const similares = this.searchInteractions(objetivo, 3);
        if (similares.length > 0) {
            const lines = similares.map(i =>
                `- "${i.objetivo.substring(0, 60)}..." → ${i.sucesso ? 'sucesso' : 'falha'}`
            );
            addPart(`\nTarefas similares anteriores:\n${lines.join('\n')}`);
        }

        return { text: parts.join('\n'), charCount, nodeIds };
    }

    // ================================================================
    // PROCESSO LIFECYCLE
    // ================================================================

    upsertProcesso(numero: string, data: {
        processoNumero: string;
        lastSessionId?: string;
        lastUpdated?: number;
        partes?: { autor?: string[]; reu?: string[] };
        classe?: string;
        tribunal?: string;
        tesesDiscutidas?: string[];
        decisoes?: string[];
        status?: string;
    }): BrainNode {
        const existing = this.getNodeByTypeAndLabel('processo', numero);
        const now = Date.now();

        if (existing) {
            // Merge data
            const merged = { ...existing.data, ...data, lastUpdated: now };
            this.updateNode(existing.id, { data: merged, confidence: Math.min(1.0, existing.confidence + 0.05) });
            this.touchNode(existing.id);
            this._syncProcessoEdges(existing.id, data);
            return { ...existing, data: merged, updatedAt: now, accessedAt: now };
        }

        // Create new
        const node = this.addNode('processo', numero, { ...data, lastUpdated: now }, { confidence: 0.6 });

        // Tribunal edge
        if (data.tribunal) {
            const tribunal = this._getOrCreateNode('tribunal', data.tribunal);
            this.addEdge(node.id, tribunal.id, 'from_tribunal');
        }

        this._syncProcessoEdges(node.id, data);
        return node;
    }

    registerProcessoAccess(numero: string): void {
        const node = this.getNodeByTypeAndLabel('processo', numero);
        if (node) {
            this.touchNode(node.id);
        } else {
            this.addNode('processo', numero, {}, { confidence: 0.3 });
        }
    }

    getRecentProcessos(limit = 10): BrainNode[] {
        const rows = this.db.prepare(
            'SELECT * FROM nodes WHERE type = ? ORDER BY accessed_at DESC LIMIT ?'
        ).all('processo', limit) as any[];
        return rows.map(r => this._mapNode(r));
    }

    // ================================================================
    // APRENDIZADOS
    // ================================================================

    addAprendizado(text: string): BrainNode {
        // Evita duplicatas exatas
        const existing = this.getNodeByTypeAndLabel('aprendizado', text);
        if (existing) {
            this.updateNode(existing.id, { confidence: Math.min(1.0, existing.confidence + 0.1) });
            this.touchNode(existing.id);
            return existing;
        }
        return this.addNode('aprendizado', text, {}, { confidence: 0.5 });
    }

    getAprendizados(limit = 10): BrainNode[] {
        const rows = this.db.prepare(
            'SELECT * FROM nodes WHERE type = ? ORDER BY created_at DESC LIMIT ?'
        ).all('aprendizado', limit) as any[];
        return rows.map(r => this._mapNode(r));
    }

    // ================================================================
    // INTERACTIONS
    // ================================================================

    saveInteraction(data: { objetivo: string; resposta: string; passos: number; duracao: number; sucesso: boolean }): void {
        this.db.prepare(`
            INSERT INTO interactions (id, objetivo, resposta, passos, duracao, sucesso, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), data.objetivo, data.resposta, data.passos, data.duracao, data.sucesso ? 1 : 0, Date.now());

        // Eviction: max 200 interactions
        this.db.prepare(`
            DELETE FROM interactions WHERE id IN (
                SELECT id FROM interactions ORDER BY created_at DESC LIMIT -1 OFFSET 200
            )
        `).run();
    }

    // ================================================================
    // SELECTORS
    // ================================================================

    lookupSelectors(tribunal: string, context: string): string[] {
        const rows = this.db.prepare(`
            SELECT selector_css FROM selectors
            WHERE tribunal = ? AND context = ?
            ORDER BY success_count DESC, last_used DESC
        `).all(tribunal, context) as any[];
        return rows.map(r => r.selector_css);
    }

    recordSelectorSuccess(tribunal: string, context: string, selector: string): void {
        this.db.prepare(`
            INSERT INTO selectors (id, tribunal, context, selector_css, success_count, failure_count, last_used, last_successful)
            VALUES (?, ?, ?, ?, 1, 0, ?, ?)
            ON CONFLICT(tribunal, context, selector_css) DO UPDATE SET
                success_count = success_count + 1,
                last_used = excluded.last_used,
                last_successful = excluded.last_successful
        `).run(randomUUID(), tribunal, context, selector, Date.now(), selector);
    }

    recordSelectorFailure(tribunal: string, context: string, selector: string): void {
        this.db.prepare(`
            INSERT INTO selectors (id, tribunal, context, selector_css, success_count, failure_count, last_used)
            VALUES (?, ?, ?, ?, 0, 1, ?)
            ON CONFLICT(tribunal, context, selector_css) DO UPDATE SET
                failure_count = failure_count + 1,
                last_used = excluded.last_used
        `).run(randomUUID(), tribunal, context, selector, Date.now());
    }

    getSelectorStats(): SelectorAnalytics {
        const total = (this.db.prepare('SELECT COUNT(*) as c FROM selectors').get() as any).c;
        const byTribunal: Record<string, { entries: number; avgSuccess: number }> = {};
        const tribunals = this.db.prepare(
            'SELECT tribunal, COUNT(*) as cnt, AVG(success_count) as avg_s FROM selectors GROUP BY tribunal'
        ).all() as any[];
        for (const t of tribunals) {
            byTribunal[t.tribunal] = { entries: t.cnt, avgSuccess: t.avg_s };
        }
        return { totalEntries: total, totalLookups: 0, totalHits: 0, totalMisses: 0, byTribunal };
    }

    // ================================================================
    // PREFERENCES
    // ================================================================

    setPreference(key: string, value: any): void {
        this.db.prepare('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
    }

    getPreference<T>(key: string, fallback?: T): T | undefined {
        const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as { value: string } | undefined;
        if (!row) return fallback;
        try { return JSON.parse(row.value) as T; } catch { return fallback; }
    }

    // ================================================================
    // DREAM HELPERS
    // ================================================================

    getStaleNodes(olderThanMs: number, maxConfidence: number): BrainNode[] {
        const cutoff = Date.now() - olderThanMs;
        const rows = this.db.prepare(
            'SELECT * FROM nodes WHERE updated_at < ? AND confidence < ? AND type NOT IN (?, ?)'
        ).all(cutoff, maxConfidence, 'processo', 'parte') as any[];
        return rows.map(r => this._mapNode(r));
    }

    getOrphanNodes(): BrainNode[] {
        const rows = this.db.prepare(`
            SELECT n.* FROM nodes n
            LEFT JOIN edges e1 ON e1.source_id = n.id
            LEFT JOIN edges e2 ON e2.target_id = n.id
            WHERE e1.id IS NULL AND e2.id IS NULL
            AND n.type NOT IN ('processo', 'parte', 'aprendizado')
        `).all() as any[];
        return rows.map(r => this._mapNode(r));
    }

    mergeNodes(keepId: string, removeId: string): void {
        // Reaponta edges do removeId para keepId
        this.db.prepare('UPDATE OR IGNORE edges SET source_id = ? WHERE source_id = ?').run(keepId, removeId);
        this.db.prepare('UPDATE OR IGNORE edges SET target_id = ? WHERE target_id = ?').run(keepId, removeId);
        // Remove edges duplicadas que ficaram
        this.db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(removeId, removeId);
        this.deleteNode(removeId);
    }

    // ================================================================
    // STATS
    // ================================================================

    getStats(): { nodeCount: number; edgeCount: number; byType: Record<string, number> } {
        const nodeCount = (this.db.prepare('SELECT COUNT(*) as c FROM nodes').get() as any).c;
        const edgeCount = (this.db.prepare('SELECT COUNT(*) as c FROM edges').get() as any).c;
        const byType: Record<string, number> = {};
        const types = this.db.prepare('SELECT type, COUNT(*) as c FROM nodes GROUP BY type').all() as any[];
        for (const t of types) byType[t.type] = t.c;
        return { nodeCount, edgeCount, byType };
    }

    // ================================================================
    // METADATA
    // ================================================================

    getMetadata(key: string): string | null {
        const row = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as { value: string } | undefined;
        return row?.value ?? null;
    }

    setMetadata(key: string, value: string): void {
        this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(key, value);
    }

    incrementDreamSessionCount(): number {
        this.db.prepare("UPDATE metadata SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'dream_session_count'").run();
        return parseInt(this.getMetadata('dream_session_count') || '0', 10);
    }

    // ================================================================
    // PRIVATE HELPERS
    // ================================================================

    private _mapNode(row: any): BrainNode {
        return {
            id: row.id,
            type: row.type,
            label: row.label,
            data: JSON.parse(row.data || '{}'),
            confidence: row.confidence,
            source: row.source,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            accessedAt: row.accessed_at,
        };
    }

    private _mapEdge(row: any): BrainEdge {
        return {
            id: row.id,
            sourceId: row.source_id,
            targetId: row.target_id,
            relation: row.relation,
            weight: row.weight,
            data: JSON.parse(row.data || '{}'),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private _dedupeEdges(rows: any[]): any[] {
        const seen = new Set<string>();
        return rows.filter(r => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
        });
    }

    private _buildFtsQuery(query: string): string | null {
        // Limpa e tokeniza para FTS5
        const tokens = query
            .replace(/[^\w\sàáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 2)
            .slice(0, 10);
        if (tokens.length === 0) return null;
        // Usa OR para matching amplo
        return tokens.map(t => `"${t}"`).join(' OR ');
    }

    private _getOrCreateNode(type: BrainNodeType, label: string): BrainNode {
        const existing = this.getNodeByTypeAndLabel(type, label);
        if (existing) return existing;
        return this.addNode(type, label, {}, { confidence: 0.5 });
    }

    private _syncProcessoEdges(processoId: string, data: {
        tesesDiscutidas?: string[];
        decisoes?: string[];
        partes?: { autor?: string[]; reu?: string[] };
    }): void {
        // Teses
        if (data.tesesDiscutidas) {
            for (const tese of data.tesesDiscutidas) {
                if (!tese) continue;
                const teseNode = this._getOrCreateNode('tese', tese);
                this.addEdge(processoId, teseNode.id, 'has_tese');
            }
        }
        // Decisoes
        if (data.decisoes) {
            for (const dec of data.decisoes) {
                if (!dec) continue;
                const decNode = this._getOrCreateNode('decisao', dec);
                this.addEdge(processoId, decNode.id, 'has_decisao');
            }
        }
        // Partes
        if (data.partes) {
            const allPartes = [...(data.partes.autor || []), ...(data.partes.reu || [])];
            for (const parte of allPartes) {
                if (!parte) continue;
                const parteNode = this._getOrCreateNode('parte', parte);
                this.addEdge(processoId, parteNode.id, 'has_parte');
            }
        }
    }
}
