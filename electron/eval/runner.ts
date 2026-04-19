/**
 * Eval Runner
 *
 * Executa um array de EvalTask, gera EvalRunMetrics por task, salva um
 * EvalSnapshot em `~/.lex/evals/<timestamp>.json`. Pensado pra rodar local
 * (CLI) ou em CI — não depende de UI.
 *
 * Como mede replay hit: após cada task, olha as observations recém-gravadas
 * no Brain com o traceId do run. Se alguma action tem `data.replay === true`
 * ou o output do agent contém "[Replay] SUCESSO", conta como hit.
 *
 * Não paraleliza (runs ficam interferindo — stateful PJe). Serial.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { getBrainSafe } from '../brain';
import { withTrace, currentTraceId } from '../observer/trace-context';
import { getTrace } from '../brain/trace-query';
import type { EvalRunMetrics, EvalSnapshot, EvalTask } from './types';

const EVAL_DIR = path.join(os.homedir(), '.lex', 'evals');

export interface RunGoalFn {
    (goal: string, opts: { tribunal?: string; timeoutMs?: number }): Promise<{
        output: string;
        toolCalls: number;
        replayHit: boolean;
        replayFlow?: string;
        replayConfidence?: number;
        errors: string[];
    }>;
}

export interface RunEvalOptions {
    tasks: EvalTask[];
    runGoal: RunGoalFn;
    /** Filtra por tag. Se vazio, roda tudo. */
    includeTags?: string[];
    /** Callback de progresso (UI / log). */
    onProgress?: (done: number, total: number, task: EvalTask) => void;
}

export async function runEvalSuite(opts: RunEvalOptions): Promise<EvalSnapshot> {
    const tasks = filterByTags(opts.tasks, opts.includeTags);
    const runs: EvalRunMetrics[] = [];

    let done = 0;
    for (const task of tasks) {
        opts.onProgress?.(done, tasks.length, task);
        const metric = await runSingle(task, opts.runGoal);
        runs.push(metric);
        done += 1;
    }

    const snapshot: EvalSnapshot = {
        at: new Date().toISOString(),
        commit: tryGetCommit(),
        env: captureEnv(),
        runs,
        summary: summarize(runs),
    };

    persistSnapshot(snapshot);
    return snapshot;
}

async function runSingle(task: EvalTask, runGoal: RunGoalFn): Promise<EvalRunMetrics> {
    const started = Date.now();
    let result: Awaited<ReturnType<RunGoalFn>> = {
        output: '', toolCalls: 0, replayHit: false, errors: [],
    };
    let traceId: string | null = null;

    try {
        await withTrace({ goal: task.goal }, async () => {
            traceId = currentTraceId();
            result = await runGoal(task.goal, {
                tribunal: task.tribunal,
                timeoutMs: task.timeoutMs ?? 300_000,
            });
        });
    } catch (err: any) {
        result.errors.push(err?.message ? String(err.message) : String(err));
    }

    const durationMs = Date.now() - started;
    const success = evaluateExpectations(result.output, task, result.errors);

    // Se traceId gerou observations, podemos enriquecer toolCalls com a
    // contagem real lida do grafo (mais precisa que a reportada).
    if (traceId) {
        const brain = getBrainSafe();
        if (brain) {
            const trace = getTrace(brain, traceId);
            if (trace && trace.steps.length > 0) {
                result.toolCalls = Math.max(result.toolCalls, trace.steps.length);
            }
        }
    }

    return {
        taskId: task.id,
        runAt: new Date().toISOString(),
        durationMs,
        success,
        toolCalls: result.toolCalls,
        replayHit: result.replayHit,
        replayFlow: result.replayFlow,
        replayConfidence: result.replayConfidence,
        errors: result.errors,
        output: truncate(result.output, 1000),
        traceId: traceId || undefined,
    };
}

function evaluateExpectations(output: string, task: EvalTask, errors: string[]): boolean {
    if (errors.length > 0 && !task.expect) return false;
    const expect = task.expect;
    if (!expect) return errors.length === 0;

    if (expect.outputContains) {
        for (const s of expect.outputContains) {
            if (!output.includes(s)) return false;
        }
    }
    if (expect.outputMatches) {
        try {
            if (!new RegExp(expect.outputMatches, 'i').test(output)) return false;
        } catch {
            return false;
        }
    }
    if (typeof expect.minOutputLength === 'number') {
        if (output.length < expect.minOutputLength) return false;
    }
    return true;
}

function summarize(runs: EvalRunMetrics[]): EvalSnapshot['summary'] {
    if (runs.length === 0) {
        return {
            totalRuns: 0, successRate: 0, avgDurationMs: 0,
            avgToolCalls: 0, replayHitRate: 0,
        };
    }
    const successes = runs.filter(r => r.success).length;
    const totalDuration = runs.reduce((s, r) => s + r.durationMs, 0);
    const totalToolCalls = runs.reduce((s, r) => s + r.toolCalls, 0);
    const replayHits = runs.filter(r => r.replayHit).length;
    return {
        totalRuns: runs.length,
        successRate: successes / runs.length,
        avgDurationMs: Math.round(totalDuration / runs.length),
        avgToolCalls: +(totalToolCalls / runs.length).toFixed(2),
        replayHitRate: replayHits / runs.length,
    };
}

function persistSnapshot(snap: EvalSnapshot): void {
    try {
        fs.mkdirSync(EVAL_DIR, { recursive: true });
    } catch { /* ignore */ }
    const safeStamp = snap.at.replace(/[:.]/g, '-');
    const file = path.join(EVAL_DIR, `snapshot-${safeStamp}.json`);
    fs.writeFileSync(file, JSON.stringify(snap, null, 2), 'utf8');
    console.log(`[Eval] Snapshot salvo: ${file}`);
}

function captureEnv(): Record<string, string> {
    return {
        node: process.version,
        platform: process.platform,
        observerMode: process.env['LEX_OBSERVER_MODE'] || 'full',
    };
}

function tryGetCommit(): string | undefined {
    try {
        return execSync('git rev-parse --short HEAD', { stdio: ['pipe', 'pipe', 'ignore'] })
            .toString().trim();
    } catch {
        return undefined;
    }
}

function filterByTags(tasks: EvalTask[], include?: string[]): EvalTask[] {
    if (!include || include.length === 0) return tasks;
    const want = new Set(include);
    return tasks.filter(t => (t.tags || []).some(tag => want.has(tag)));
}

function truncate(s: string, n: number): string {
    return s.length <= n ? s : s.slice(0, n) + '…';
}

// ── Comparação entre snapshots ───────────────────────────────────────────────

export interface SnapshotDiff {
    fromAt: string;
    toAt: string;
    successRateDelta: number;
    avgDurationDelta: number;
    avgToolCallsDelta: number;
    replayHitRateDelta: number;
    perTask: Array<{
        taskId: string;
        deltaDurationMs: number;
        deltaToolCalls: number;
        successChanged: 'improved' | 'regressed' | 'same';
    }>;
}

/** Compara dois snapshots — dashboard de "estamos melhorando ou piorando?". */
export function diffSnapshots(a: EvalSnapshot, b: EvalSnapshot): SnapshotDiff {
    const byTaskA = new Map(a.runs.map(r => [r.taskId, r]));
    const perTask: SnapshotDiff['perTask'] = [];

    for (const bRun of b.runs) {
        const aRun = byTaskA.get(bRun.taskId);
        if (!aRun) continue;
        let changed: 'improved' | 'regressed' | 'same' = 'same';
        if (aRun.success !== bRun.success) {
            changed = bRun.success ? 'improved' : 'regressed';
        }
        perTask.push({
            taskId: bRun.taskId,
            deltaDurationMs: bRun.durationMs - aRun.durationMs,
            deltaToolCalls: bRun.toolCalls - aRun.toolCalls,
            successChanged: changed,
        });
    }

    return {
        fromAt: a.at,
        toAt: b.at,
        successRateDelta: b.summary.successRate - a.summary.successRate,
        avgDurationDelta: b.summary.avgDurationMs - a.summary.avgDurationMs,
        avgToolCallsDelta: b.summary.avgToolCalls - a.summary.avgToolCalls,
        replayHitRateDelta: b.summary.replayHitRate - a.summary.replayHitRate,
        perTask,
    };
}

/** Lê todos os snapshots em disco, ordenados do mais antigo ao mais novo. */
export function loadSnapshots(): EvalSnapshot[] {
    if (!fs.existsSync(EVAL_DIR)) return [];
    const files = fs.readdirSync(EVAL_DIR).filter(f => f.endsWith('.json'));
    const snaps: EvalSnapshot[] = [];
    for (const f of files) {
        try {
            snaps.push(JSON.parse(fs.readFileSync(path.join(EVAL_DIR, f), 'utf8')));
        } catch { /* skip invalid */ }
    }
    snaps.sort((x, y) => x.at.localeCompare(y.at));
    return snaps;
}
