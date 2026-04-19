/**
 * LEX Brain - Dream Consolidator
 *
 * Maintenance cycle for the Brain graph. It is intentionally conservative:
 * the default run can mutate the graph, but every destructive step supports
 * dry-run reporting and graph-critical node types are protected from merges.
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import type { BrainStore } from './brain-store';
import type {
    BrainNode,
    DreamConfig,
    DreamEvaluation,
    DreamHistoryItem,
    DreamMetrics,
    DreamPhasePolicy,
    DreamReport,
    DreamRestoreResult,
    DreamRunReport,
} from './types';
import { DEFAULT_DREAM_CONFIG } from './types';
import { renderBrainMarkdown } from './brain-renderer';
import { detectFlows } from './flow-detector';
import { normalizeExistingPageStates } from './normalizer';
import { invalidatePageState } from './staleness';
import { compactBrain } from './compaction';

const DREAM_RUNNING_KEY = 'dream_running';
const DREAM_STARTED_AT_KEY = 'dream_started_at';
const DREAM_RUN_ID_KEY = 'dream_run_id';
const DREAM_LAST_REPORT_KEY = 'dream_last_report';
const DREAM_HISTORY_KEY = 'dream_history';
const DREAM_HISTORY_LIMIT = 20;

const MERGE_PROTECTED_TYPES = new Set([
    'processo',
    'parte',
    'action',
    'page_state',
    'flow',
    'selector',
]);

const PRUNE_PROTECTED_TYPES = new Set([
    'processo',
    'parte',
    'flow',
    'tribunal',
    'selector',
]);

/**
 * Run one Dream cycle. Returns a structured report suitable for UI/audit.
 */
export async function runDream(
    brain: BrainStore,
    config: Partial<DreamConfig> = {},
): Promise<DreamRunReport> {
    const cfg: DreamConfig = { ...DEFAULT_DREAM_CONFIG, ...config };
    const startedMs = Date.now();
    const runId = randomUUID();
    const startedAt = new Date(startedMs).toISOString();
    const policy = resolveDreamPolicy(cfg);

    const lock = acquireDreamLock(brain, runId, startedMs, cfg.lockTimeoutMs);
    if (!lock.acquired) {
        return {
            runId,
            dryRun: cfg.dryRun,
            startedAt,
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - startedMs,
            totalAffected: 0,
            skipped: true,
            reason: lock.reason,
            reports: [{
                phase: 'inventory',
                actions: [lock.reason || 'Dream already running'],
                nodesAffected: 0,
                skipped: true,
            }],
        };
    }

    let reports: DreamReport[] = [];
    const metricsBefore = collectDreamMetrics(brain);
    let snapshotPath: string | undefined;
    try {
        console.log(`[Dream] Starting ${cfg.dryRun ? 'dry-run' : 'run'} ${runId}`);
        reports.push(policyPhase(policy, cfg));

        if (!cfg.dryRun) {
            snapshotPath = createDreamSnapshot(brain, runId, metricsBefore);
            reports.push({
                phase: 'inventory',
                actions: [`Safety snapshot saved: ${snapshotPath}`],
                nodesAffected: 0,
            });
        }

        const { staleNodes, orphanNodes } = inventoryPhase(brain, cfg);
        reports.push({
            phase: 'inventory',
            actions: [
                `${staleNodes.length} stale nodes identified`,
                `${orphanNodes.length} orphan nodes identified`,
                cfg.dryRun ? 'Dry-run: no graph mutations will be applied' : 'Mutation mode: enabled',
            ],
            nodesAffected: staleNodes.length + orphanNodes.length,
            planned: cfg.dryRun,
        });

        reports.push(policy.normalize ? normalizePhase(brain, cfg) : skipped('normalize', 'Normalize disabled by Dream policy'));
        reports.push(policy.consolidate ? consolidatePhase(brain, cfg) : skipped('consolidate', 'Consolidate disabled by Dream policy'));
        reports.push(policy.staleness ? stalenessPhase(brain, cfg) : skipped('staleness', 'Staleness disabled by Dream policy'));
        reports.push(policy.flow ? flowDetectionPhase(brain, cfg) : skipped('flow', 'Flow detection disabled by Dream policy'));
        reports.push(policy.promote ? promotePhase(brain, cfg) : skipped('promote', 'Promote disabled by Dream policy'));
        reports.push(policy.prune ? prunePhase(brain, staleNodes, orphanNodes, cfg) : skipped('prune', 'Prune disabled by Dream policy'));
        reports.push(policy.compaction ? compactionPhase(brain, cfg) : skipped('compaction', 'Compaction disabled by Dream policy'));
        reports.push(policy.render ? await renderPhase(brain, cfg) : skipped('render', 'Render disabled by Dream policy'));

        if (!cfg.dryRun) {
            brain.setMetadata('dream_session_count', '0');
            brain.setMetadata('dream_last_run', new Date().toISOString());
        } else {
            brain.setMetadata('dream_last_preview', new Date().toISOString());
        }

        const metricsAfter = collectDreamMetrics(brain);
        const evaluation = evaluateDream(metricsBefore, metricsAfter, reports);
        reports.push(evaluationPhase(evaluation));

        if (!cfg.dryRun && cfg.autoRollbackOnDanger && evaluation.verdict === 'danger' && snapshotPath) {
            const restore = restoreDreamSnapshot(brain, snapshotPath);
            reports.push(restore.ok
                ? {
                    phase: 'rollback',
                    actions: [`Auto rollback restored ${restore.nodesRestored} nodes and ${restore.edgesRestored} edges`],
                    nodesAffected: restore.nodesRestored,
                }
                : failed('rollback', restore.error || 'Auto rollback failed'));
        }

        reports = annotateDreamReports(reports);
        const result = finishReport(runId, cfg, startedAt, startedMs, reports, {
            metricsBefore,
            metricsAfter: collectDreamMetrics(brain),
            evaluation,
            policy,
            snapshotPath,
        });
        brain.setMetadata(DREAM_LAST_REPORT_KEY, JSON.stringify(result));
        appendDreamHistory(brain, result);
        console.log(`[Dream] Complete ${runId}. ${result.totalAffected} node(s) affected.`);
        return result;
    } catch (err: any) {
        const message = err?.message || String(err);
        const report = failed('inventory', `Dream aborted: ${message}`);
        const annotatedReports = annotateDreamReports([...reports, report]);
        const result = finishReport(runId, cfg, startedAt, startedMs, annotatedReports, {
            metricsBefore,
            metricsAfter: collectDreamMetrics(brain),
            policy,
            snapshotPath,
            error: message,
        });
        brain.setMetadata(DREAM_LAST_REPORT_KEY, JSON.stringify(result));
        appendDreamHistory(brain, result);
        console.error(`[Dream] Aborted ${runId}:`, err);
        return result;
    } finally {
        releaseDreamLock(brain, runId);
    }
}

/**
 * Checks whether an automatic Dream should be scheduled.
 */
export function shouldRunDream(brain: BrainStore, triggerEveryN = 5): boolean {
    const count = parseInt(brain.getMetadata('dream_session_count') || '0', 10);
    return count >= triggerEveryN;
}

export function getDreamHistory(brain: BrainStore): DreamHistoryItem[] {
    const raw = brain.getMetadata(DREAM_HISTORY_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function restoreDreamSnapshot(brain: BrainStore, snapshotPath: string): DreamRestoreResult {
    const restoredAt = new Date().toISOString();
    const resolvedPath = path.resolve(snapshotPath);
    const snapshotDir = path.resolve(path.dirname(brain.dbPath), 'dream-snapshots');

    if (!resolvedPath.startsWith(snapshotDir + path.sep)) {
        return {
            ok: false,
            snapshotPath,
            restoredAt,
            nodesRestored: 0,
            edgesRestored: 0,
            error: 'Snapshot path is outside the Brain dream-snapshots directory',
        };
    }

    try {
        const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(resolvedPath)).toString('utf8'));
        const nodes = Array.isArray(payload?.tables?.nodes) ? payload.tables.nodes : [];
        const edges = Array.isArray(payload?.tables?.edges) ? payload.tables.edges : [];
        const metadata = payload?.tables?.metadata && typeof payload.tables.metadata === 'object'
            ? payload.tables.metadata
            : {};

        const tx = brain.db.transaction(() => {
            brain.db.prepare('DELETE FROM edges').run();
            brain.db.prepare('DELETE FROM nodes').run();
            brain.db.prepare('DELETE FROM metadata').run();

            const insertNode = brain.db.prepare(`
                INSERT INTO nodes (id, type, label, data, confidence, source, created_at, updated_at, accessed_at)
                VALUES (@id, @type, @label, @data, @confidence, @source, @created_at, @updated_at, @accessed_at)
            `);
            const insertEdge = brain.db.prepare(`
                INSERT INTO edges (id, source_id, target_id, relation, weight, data, created_at, updated_at)
                VALUES (@id, @source_id, @target_id, @relation, @weight, @data, @created_at, @updated_at)
            `);
            const insertMeta = brain.db.prepare('INSERT INTO metadata(key, value) VALUES (?, ?)');

            for (const node of nodes) insertNode.run(node);
            for (const edge of edges) insertEdge.run(edge);
            for (const [key, value] of Object.entries(metadata)) insertMeta.run(key, String(value));

            brain.setMetadata('dream_last_restore', restoredAt);
            brain.setMetadata('dream_last_restore_snapshot', resolvedPath);
        });
        tx();

        return {
            ok: true,
            snapshotPath: resolvedPath,
            restoredAt,
            nodesRestored: nodes.length,
            edgesRestored: edges.length,
        };
    } catch (err: any) {
        return {
            ok: false,
            snapshotPath,
            restoredAt,
            nodesRestored: 0,
            edgesRestored: 0,
            error: err?.message || String(err),
        };
    }
}

function appendDreamHistory(brain: BrainStore, result: DreamRunReport): void {
    const item: DreamHistoryItem = {
        runId: result.runId,
        dryRun: result.dryRun,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        durationMs: result.durationMs,
        totalAffected: result.totalAffected,
        snapshotPath: result.snapshotPath,
        verdict: result.evaluation?.verdict,
        errorCount: result.reports.filter(report => !!report.error).length + (result.error ? 1 : 0),
        skipped: result.skipped,
    };
    const history = [item, ...getDreamHistory(brain).filter(prev => prev.runId !== result.runId)]
        .slice(0, DREAM_HISTORY_LIMIT);
    brain.setMetadata(DREAM_HISTORY_KEY, JSON.stringify(history));
}

function collectDreamMetrics(brain: BrainStore): DreamMetrics {
    const stats = brain.getStats();
    const pageStates = brain.getNodesByType('page_state', 5000);
    const edgeRows = brain.db.prepare(`
        SELECT relation, COUNT(*) as c
        FROM edges
        WHERE relation IN ('performs', 'results_in', 'fails_to')
        GROUP BY relation
    `).all() as Array<{ relation: string; c: number }>;
    const edgeCounts = new Map(edgeRows.map(row => [row.relation, Number(row.c || 0)]));
    const avgRow = brain.db.prepare('SELECT AVG(confidence) as avgConfidence FROM nodes').get() as any;

    return {
        nodeCount: stats.nodeCount,
        edgeCount: stats.edgeCount,
        byType: stats.byType,
        pageStates: stats.byType['page_state'] || 0,
        actions: stats.byType['action'] || 0,
        flows: stats.byType['flow'] || 0,
        selectors: stats.byType['selector'] || 0,
        invalidatedPageStates: pageStates.filter(node => !!node.data?.['invalidated']).length,
        replayEdges: (edgeCounts.get('performs') || 0) + (edgeCounts.get('results_in') || 0),
        failedEdges: edgeCounts.get('fails_to') || 0,
        avgConfidence: Number((Number(avgRow?.avgConfidence || 0)).toFixed(3)),
    };
}

function resolveDreamPolicy(cfg: DreamConfig): DreamPhasePolicy {
    const explicit = cfg.phases || {};
    return {
        normalize: explicit.normalize ?? true,
        consolidate: explicit.consolidate ?? cfg.allowMerge,
        staleness: explicit.staleness ?? true,
        flow: explicit.flow ?? true,
        promote: explicit.promote ?? true,
        prune: explicit.prune ?? cfg.allowPrune,
        compaction: explicit.compaction ?? cfg.allowCompaction,
        render: explicit.render ?? cfg.renderMarkdown,
    };
}

function policyPhase(policy: DreamPhasePolicy, cfg: DreamConfig): DreamReport {
    const enabled = Object.entries(policy)
        .filter(([, value]) => value)
        .map(([key]) => key);
    const disabled = Object.entries(policy)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    return {
        phase: 'policy',
        actions: [
            `Mode: ${cfg.dryRun ? 'preview' : 'execute'}`,
            `Enabled phases: ${enabled.join(', ') || 'none'}`,
            disabled.length ? `Disabled phases: ${disabled.join(', ')}` : 'All optional phases enabled',
            cfg.autoRollbackOnDanger ? 'Auto rollback on danger: enabled' : 'Auto rollback on danger: disabled',
        ],
        nodesAffected: 0,
        planned: cfg.dryRun,
    };
}

function normalizePhase(brain: BrainStore, cfg: DreamConfig): DreamReport {
    try {
        const report = normalizeExistingPageStates(brain, { dryRun: cfg.dryRun });
        return {
            phase: 'normalize',
            actions: [
                `${report.scanned} page_state(s) scanned`,
                `${report.changed} page_state(s) ${cfg.dryRun ? 'would receive' : 'received'} canonical fields`,
                `${report.groups} canonical group(s), largest group ${report.largestGroup}`,
            ],
            nodesAffected: report.changed,
            planned: cfg.dryRun,
        };
    } catch (err: any) {
        return failed('normalize', `Normalize failed: ${err?.message || err}`);
    }
}

function evaluateDream(before: DreamMetrics, after: DreamMetrics, reports: DreamReport[]): DreamEvaluation {
    const deltas = {
        nodeCount: after.nodeCount - before.nodeCount,
        edgeCount: after.edgeCount - before.edgeCount,
        flows: after.flows - before.flows,
        pageStates: after.pageStates - before.pageStates,
        actions: after.actions - before.actions,
        invalidatedPageStates: after.invalidatedPageStates - before.invalidatedPageStates,
        replayEdges: after.replayEdges - before.replayEdges,
        failedEdges: after.failedEdges - before.failedEdges,
        avgConfidence: Number((after.avgConfidence - before.avgConfidence).toFixed(3)),
    };

    const errors = reports.filter(report => !!report.error);
    const reasons: string[] = [];
    let score = 0;

    if (deltas.flows > 0) {
        score += deltas.flows * 3;
        reasons.push(`created/updated flow capacity (+${deltas.flows})`);
    }
    if (deltas.replayEdges > 0) {
        score += deltas.replayEdges;
        reasons.push(`increased replay evidence (+${deltas.replayEdges})`);
    }
    if (deltas.avgConfidence > 0) {
        score += 1;
        reasons.push(`average confidence improved (+${deltas.avgConfidence})`);
    }
    if (deltas.invalidatedPageStates > 0) {
        score -= deltas.invalidatedPageStates * 2;
        reasons.push(`invalidated page states (+${deltas.invalidatedPageStates})`);
    }
    if (deltas.failedEdges > 0) {
        score -= deltas.failedEdges * 3;
        reasons.push(`new failure edges (+${deltas.failedEdges})`);
    }
    if (errors.length > 0) {
        score -= errors.length * 5;
        reasons.push(`${errors.length} phase error(s)`);
    }

    const nodeDropRatio = before.nodeCount > 0 ? Math.abs(Math.min(0, deltas.nodeCount)) / before.nodeCount : 0;
    const edgeDropRatio = before.edgeCount > 0 ? Math.abs(Math.min(0, deltas.edgeCount)) / before.edgeCount : 0;
    const dangerousDrop = nodeDropRatio > 0.25 || edgeDropRatio > 0.35;
    if (dangerousDrop) {
        reasons.push(`large graph reduction (nodes ${deltas.nodeCount}, edges ${deltas.edgeCount})`);
    }

    const verdict = dangerousDrop || errors.length > 1
        ? 'danger'
        : score > 1
            ? 'improved'
            : score < -1
                ? 'regressed'
                : 'neutral';

    if (reasons.length === 0) reasons.push('no material metric movement');

    return { verdict, score, reasons, deltas };
}

function evaluationPhase(evaluation: DreamEvaluation): DreamReport {
    return {
        phase: 'evaluate',
        actions: [
            `Verdict: ${evaluation.verdict}`,
            `Score: ${evaluation.score}`,
            ...evaluation.reasons.slice(0, 4),
        ],
        nodesAffected: 0,
        error: evaluation.verdict === 'danger' ? 'Evaluation marked this run as dangerous' : undefined,
    };
}

function annotateDreamReports(reports: DreamReport[]): DreamReport[] {
    return reports.map(report => ({
        ...report,
        risk: report.risk || assessPhaseRisk(report),
        explanations: report.explanations || explainPhase(report),
    }));
}

function assessPhaseRisk(report: DreamReport): DreamReport['risk'] {
    const reasons: string[] = [];
    let level: 'low' | 'medium' | 'high' = 'low';

    switch (report.phase) {
        case 'normalize':
        case 'flow':
        case 'promote':
        case 'render':
        case 'policy':
            level = 'low';
            reasons.push('non-destructive or metadata-oriented phase');
            break;
        case 'staleness':
        case 'consolidate':
            level = report.nodesAffected > 0 ? 'medium' : 'low';
            reasons.push(report.phase === 'staleness'
                ? 'can invalidate learned page states'
                : 'can merge graph nodes');
            break;
        case 'prune':
        case 'compaction':
        case 'rollback':
            level = report.nodesAffected > 0 ? 'high' : 'medium';
            reasons.push(report.phase === 'rollback'
                ? 'restores a previous graph snapshot'
                : 'can remove graph data');
            break;
        case 'evaluate':
            level = report.error ? 'high' : 'low';
            reasons.push(report.error ? 'evaluation flagged danger' : 'read-only metric assessment');
            break;
        default:
            level = 'medium';
            reasons.push('unknown phase risk');
    }

    if (report.error) {
        level = 'high';
        reasons.push('phase reported an error');
    }
    if (report.nodesAffected >= 25 && level !== 'high') {
        level = 'medium';
        reasons.push('large affected node count');
    }
    if (report.nodesAffected >= 100) {
        level = 'high';
        reasons.push('very large affected node count');
    }
    if (report.skipped) {
        reasons.push('phase skipped');
    }

    return { level, reasons };
}

function explainPhase(report: DreamReport): string[] {
    switch (report.phase) {
        case 'policy':
            return ['Policy decides which Dream phases are allowed before any graph mutation runs.'];
        case 'inventory':
            return ['Inventory identifies stale and orphan candidates used by later phases.'];
        case 'normalize':
            return ['Normalize adds canonical URL/context/state keys so redirects and dynamic URLs group together.'];
        case 'consolidate':
            return ['Consolidate only considers non-protected duplicate-looking nodes and skips legal/automation-critical types.'];
        case 'staleness':
            return ['Staleness invalidates older page states only when newer observations exist for the same tribunal/context.'];
        case 'flow':
            return ['Flow detection promotes repeated state-action patterns, including micro-flows when one action repeats enough.'];
        case 'promote':
            return ['Promote raises confidence for recently accessed nodes, making fresh knowledge easier to reuse.'];
        case 'prune':
            return ['Prune removes only stale orphan low-confidence nodes and keeps protected types.'];
        case 'compaction':
            return ['Compaction trims old automation noise while preserving nodes referenced by active flows.'];
        case 'render':
            return ['Render updates Markdown views of the Brain and does not alter graph topology.'];
        case 'evaluate':
            return ['Evaluate compares before/after metrics and marks the run improved, neutral, regressed, or dangerous.'];
        case 'rollback':
            return ['Rollback restores the graph from the safety snapshot captured before execution.'];
        default:
            return [];
    }
}

function createDreamSnapshot(brain: BrainStore, runId: string, metrics: DreamMetrics): string {
    const snapshotDir = path.join(path.dirname(brain.dbPath), 'dream-snapshots');
    fs.mkdirSync(snapshotDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(snapshotDir, `dream-${timestamp}-${runId.slice(0, 8)}.json.gz`);
    const metadataRows = brain.db.prepare('SELECT key, value FROM metadata').all() as Array<{ key: string; value: string }>;
    const metadata: Record<string, string> = {};
    for (const row of metadataRows) metadata[row.key] = row.value;

    const payload = {
        version: 1,
        createdAt: new Date().toISOString(),
        runId,
        metrics,
        tables: {
            nodes: brain.db.prepare('SELECT * FROM nodes').all(),
            edges: brain.db.prepare('SELECT * FROM edges').all(),
            metadata,
        },
    };

    const json = JSON.stringify(payload, null, 2);
    fs.writeFileSync(filePath, zlib.gzipSync(Buffer.from(json, 'utf8')));
    return filePath;
}

function finishReport(
    runId: string,
    cfg: DreamConfig,
    startedAt: string,
    startedMs: number,
    reports: DreamReport[],
    extras: {
        metricsBefore?: DreamMetrics;
        metricsAfter?: DreamMetrics;
        evaluation?: DreamEvaluation;
        policy?: DreamPhasePolicy;
        snapshotPath?: string;
        error?: string;
    } = {},
): DreamRunReport {
    const finishedAt = new Date().toISOString();
    return {
        runId,
        dryRun: cfg.dryRun,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedMs,
        totalAffected: reports.reduce((sum, report) => sum + report.nodesAffected, 0),
        metricsBefore: extras.metricsBefore,
        metricsAfter: extras.metricsAfter,
        evaluation: extras.evaluation,
        policy: extras.policy,
        snapshotPath: extras.snapshotPath,
        error: extras.error,
        reports,
    };
}

function acquireDreamLock(
    brain: BrainStore,
    runId: string,
    now: number,
    lockTimeoutMs: number,
): { acquired: boolean; reason?: string } {
    const tx = brain.db.transaction(() => {
        const running = brain.getMetadata(DREAM_RUNNING_KEY);
        const startedAt = Number(brain.getMetadata(DREAM_STARTED_AT_KEY) || 0);
        const stale = running === '1' && startedAt > 0 && now - startedAt > lockTimeoutMs;

        if (running === '1' && !stale) {
            return {
                acquired: false,
                reason: `Dream already running since ${new Date(startedAt).toLocaleString()}`,
            };
        }

        brain.setMetadata(DREAM_RUNNING_KEY, '1');
        brain.setMetadata(DREAM_STARTED_AT_KEY, String(now));
        brain.setMetadata(DREAM_RUN_ID_KEY, runId);
        return { acquired: true };
    });
    return tx();
}

function releaseDreamLock(brain: BrainStore, runId: string): void {
    try {
        const activeRunId = brain.getMetadata(DREAM_RUN_ID_KEY);
        if (activeRunId && activeRunId !== runId) return;
        brain.setMetadata(DREAM_RUNNING_KEY, '0');
        brain.setMetadata(DREAM_STARTED_AT_KEY, '0');
        brain.setMetadata(DREAM_RUN_ID_KEY, '');
    } catch {
        /* best-effort unlock */
    }
}

interface InventoryResult {
    staleNodes: BrainNode[];
    orphanNodes: BrainNode[];
}

function inventoryPhase(brain: BrainStore, cfg: DreamConfig): InventoryResult {
    const staleCutoffMs = cfg.staleThresholdDays * 24 * 60 * 60 * 1000;
    const staleNodes = brain.getStaleNodes(staleCutoffMs, cfg.minConfidenceForKeep);
    const orphanNodes = brain.getOrphanNodes();
    return { staleNodes, orphanNodes };
}

function consolidatePhase(brain: BrainStore, cfg: DreamConfig): DreamReport {
    if (!cfg.allowMerge) {
        return skipped('consolidate', 'Merge disabled by Dream policy');
    }

    const actions: string[] = [];
    let nodesAffected = 0;
    const allNodes = brain.getFullGraph().nodes;
    const groups = new Map<string, BrainNode[]>();
    let protectedSkipped = 0;

    for (const node of allNodes) {
        if (MERGE_PROTECTED_TYPES.has(node.type)) {
            protectedSkipped += 1;
            continue;
        }
        const key = `${node.type}::${normalizeLabel(node.label).substring(0, 30)}`;
        const group = groups.get(key) || [];
        group.push(node);
        groups.set(key, group);
    }

    for (const nodes of groups.values()) {
        if (nodes.length < 2) continue;

        const sorted = [...nodes].sort((a, b) => {
            const scoreA = a.confidence + (a.accessedAt / 1e13);
            const scoreB = b.confidence + (b.accessedAt / 1e13);
            return scoreB - scoreA;
        });

        const keep = sorted[0]!;
        for (const dup of sorted.slice(1)) {
            const action = `${cfg.dryRun ? 'Would merge' : 'Merged'}: "${dup.label}" -> "${keep.label}" [${keep.type}]`;
            actions.push(action);
            nodesAffected += 1;
            if (!cfg.dryRun) {
                try {
                    brain.mergeNodes(keep.id, dup.id);
                } catch (err: any) {
                    actions.push(`Merge skipped for "${dup.label}": ${err?.message || err}`);
                    nodesAffected -= 1;
                }
            }
        }
    }

    if (actions.length === 0) actions.push('No safe duplicate groups found');
    actions.push(`${protectedSkipped} protected automation/legal nodes skipped`);

    return {
        phase: 'consolidate',
        actions,
        nodesAffected,
        planned: cfg.dryRun,
    };
}

function stalenessPhase(brain: BrainStore, cfg: DreamConfig): DreamReport {
    try {
        const candidates = findStalePageStateCandidates(brain, 5);
        if (cfg.dryRun) {
            return {
                phase: 'staleness',
                actions: [`Would invalidate ${candidates.length} stale page_state(s)`],
                nodesAffected: candidates.length,
                planned: true,
            };
        }

        for (const id of candidates) invalidatePageState(brain, id);
        return {
            phase: 'staleness',
            actions: [`${candidates.length} page_state(s) invalidated after layout drift`],
            nodesAffected: candidates.length,
        };
    } catch (err: any) {
        return failed('staleness', `Staleness failed: ${err?.message || err}`);
    }
}

function flowDetectionPhase(brain: BrainStore, cfg: DreamConfig): DreamReport {
    if (cfg.dryRun) {
        const pageStates = brain.getNodesByType('page_state', 1000)
            .filter(node => !node.data?.['invalidated']).length;
        return {
            phase: 'flow',
            actions: [
                `Flow detection dry-run: ${pageStates} active page_state(s) available for scan`,
                'Run Dream to create/update flow nodes',
            ],
            nodesAffected: 0,
            planned: true,
        };
    }

    try {
        const flowReport = detectFlows(brain);
        return {
            phase: 'flow',
            actions: [
                `flows: ${flowReport.flowsCreated} created, ${flowReport.flowsUpdated} updated`,
                `walks generated: ${flowReport.walksGenerated}`,
            ],
            nodesAffected: flowReport.flowsCreated + flowReport.flowsUpdated,
        };
    } catch (err: any) {
        return failed('flow', `detectFlows failed: ${err?.message || err}`);
    }
}

function promotePhase(brain: BrainStore, cfg: DreamConfig): DreamReport {
    const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allNodes = brain.getFullGraph().nodes;
    let nodesAffected = 0;

    for (const node of allNodes) {
        if (node.accessedAt >= cutoff7d && node.confidence < 0.9) {
            nodesAffected += 1;
            if (!cfg.dryRun) {
                const newConf = Math.min(0.9, node.confidence + 0.1);
                brain.updateNode(node.id, { confidence: newConf });
            }
        }
    }

    return {
        phase: 'promote',
        actions: [`${cfg.dryRun ? 'Would promote' : 'Promoted'} ${nodesAffected} recently accessed node(s)`],
        nodesAffected,
        planned: cfg.dryRun,
    };
}

function prunePhase(
    brain: BrainStore,
    staleNodes: BrainNode[],
    orphanNodes: BrainNode[],
    cfg: DreamConfig,
): DreamReport {
    if (!cfg.allowPrune) {
        return skipped('prune', 'Prune disabled by Dream policy');
    }

    const staleIds = new Set(staleNodes.map(node => node.id));
    const toDelete: BrainNode[] = [];
    let protectedSkipped = 0;

    for (const candidate of orphanNodes) {
        const node = brain.getNode(candidate.id);
        if (!node) continue;
        if (PRUNE_PROTECTED_TYPES.has(node.type)) {
            protectedSkipped += 1;
            continue;
        }
        if (staleIds.has(node.id) && node.confidence < cfg.minConfidenceForKeep) {
            toDelete.push(node);
        }
    }

    const actions = toDelete.slice(0, 25).map(node =>
        `${cfg.dryRun ? 'Would prune' : 'Pruned'}: "${node.label}" [${node.type}] (conf=${node.confidence.toFixed(2)})`,
    );
    if (toDelete.length > 25) actions.push(`${toDelete.length - 25} additional prune candidate(s) omitted from report`);
    if (protectedSkipped > 0) actions.push(`${protectedSkipped} protected orphan node(s) skipped`);
    if (actions.length === 0) actions.push('No safe stale orphan nodes to prune');

    if (!cfg.dryRun && toDelete.length > 0) {
        brain.deleteNodes(toDelete.map(node => node.id));
    }

    return {
        phase: 'prune',
        actions,
        nodesAffected: toDelete.length,
        planned: cfg.dryRun,
    };
}

function compactionPhase(brain: BrainStore, cfg: DreamConfig): DreamReport {
    if (!cfg.allowCompaction) {
        return skipped('compaction', 'Compaction disabled by Dream policy');
    }

    try {
        const compReport = compactBrain(brain, {
            staleDays: 90,
            minScore: 0.15,
            dryRun: cfg.dryRun,
        });
        return {
            phase: 'compaction',
            actions: [
                `compaction: ${compReport.pageStatesRemoved} page_states, ${compReport.actionsRemoved} actions ${cfg.dryRun ? 'would be removed' : 'removed'}`,
                `edges ${cfg.dryRun ? 'would be removed' : 'removed'}: ${compReport.edgesRemoved}`,
                `preserved due to flow: ${compReport.preservedDueToFlow}`,
            ],
            nodesAffected: compReport.pageStatesRemoved + compReport.actionsRemoved,
            planned: cfg.dryRun,
        };
    } catch (err: any) {
        return failed('compaction', `Compaction failed: ${err?.message || err}`);
    }
}

async function renderPhase(brain: BrainStore, cfg: DreamConfig): Promise<DreamReport> {
    if (cfg.dryRun || !cfg.renderMarkdown) {
        return skipped('render', cfg.dryRun ? 'Render skipped in dry-run' : 'Render disabled by Dream policy');
    }

    try {
        const { fileCount } = await renderBrainMarkdown(brain);
        return {
            phase: 'render',
            actions: [`${fileCount} Markdown file(s) updated`],
            nodesAffected: 0,
        };
    } catch (err: any) {
        return failed('render', `Render failed: ${err?.message || err}`);
    }
}

function findStalePageStateCandidates(brain: BrainStore, minNewObservations: number): string[] {
    const invalidated: string[] = [];
    const allStates = brain.getNodesByType('page_state', 1000);
    const byKey = new Map<string, BrainNode[]>();

    for (const node of allStates) {
        const key = `${node.data?.['tribunal'] || '?'}::${node.data?.['pjeContext'] || '?'}`;
        const group = byKey.get(key) || [];
        group.push(node);
        byKey.set(key, group);
    }

    for (const group of byKey.values()) {
        if (group.length < 2) continue;
        const sorted = [...group].sort((a, b) => b.accessedAt - a.accessedAt);
        const newest = sorted[0]!;
        const incomingEdges = brain.getEdgesTo(newest.id);
        const newObs = incomingEdges.reduce((sum, edge) => sum + edge.weight, 0);
        if (newObs < minNewObservations) continue;

        for (const old of sorted.slice(1)) {
            if (!old.data?.['invalidated']) invalidated.push(old.id);
        }
    }

    return invalidated;
}

function skipped(phase: DreamReport['phase'], message: string): DreamReport {
    return { phase, actions: [message], nodesAffected: 0, skipped: true };
}

function failed(phase: DreamReport['phase'], message: string): DreamReport {
    return { phase, actions: [message], nodesAffected: 0, error: message };
}

function normalizeLabel(label: string): string {
    return label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
