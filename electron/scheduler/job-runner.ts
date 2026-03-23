/**
 * Job Runner (Phase 2 AIOS — Autonomia)
 *
 * Executa ScheduledGoals via Orchestrator da Fase 1.
 * Gerencia concorrência (1 run por goal), histórico, notificações.
 */

import { randomUUID } from 'crypto';
import { BrowserWindow } from 'electron';
import type { ScheduledGoal, JobRun, GoalId, JobRunId } from './types';
import { getGoalStore } from './goal-store';
import { notify } from '../notifications';

// Referência à mainWindow para emitir eventos
let _mainWindow: BrowserWindow | null = null;
export function setJobRunnerWindow(win: BrowserWindow | null): void {
    _mainWindow = win;
}

// Jobs em execução (1 por goal, prevent overlap)
const runningJobs = new Map<GoalId, { runId: JobRunId; promise: Promise<void> }>();

/**
 * Executa um goal via Orchestrator.
 * Retorna o JobRun com resultado.
 * Não executa se já há um run ativo para o mesmo goal.
 */
export async function runGoal(goal: ScheduledGoal): Promise<JobRun | null> {
    // Prevent overlap
    if (runningJobs.has(goal.id)) {
        console.log(`[JobRunner] Goal ${goal.name} já em execução, pulando`);
        return null;
    }

    const runId = randomUUID();
    const run: JobRun = {
        id: runId,
        goalId: goal.id,
        status: 'running',
        startedAt: new Date().toISOString(),
    };

    const store = getGoalStore();
    await store.addRun(goal.id, run);

    // Emite evento para renderer
    emitSchedulerEvent('job_started', { goalId: goal.id, goalName: goal.name, runId });

    const jobPromise = (async () => {
        const startTime = Date.now();
        try {
            console.log(`[JobRunner] Executando: ${goal.name} → "${goal.goal.substring(0, 60)}"`);

            const { Orchestrator } = await import('../agent/orchestrator');
            const orchestrator = new Orchestrator(3);

            // Forward orchestrator events
            orchestrator.on('event', (evt: any) => {
                emitSchedulerEvent('orchestrator_event', { goalId: goal.id, runId, event: evt });
            });

            const result = await orchestrator.execute(goal.goal, `scheduler-${goal.id}`);

            // Atualiza run com sucesso
            const duration = Date.now() - startTime;
            run.status = 'completed';
            run.result = result;
            run.completedAt = new Date().toISOString();
            run.durationMs = duration;

            await store.updateRun(goal.id, runId, {
                status: 'completed',
                result,
                completedAt: run.completedAt,
                durationMs: duration,
            });

            // Incrementa runCount
            const currentGoal = store.getGoal(goal.id);
            if (currentGoal) {
                const newCount = currentGoal.runCount + 1;
                await store.updateGoal(goal.id, {
                    runCount: newCount,
                    lastRunAt: run.completedAt,
                    lastRunStatus: 'completed',
                });

                // Auto-complete se atingiu maxRuns
                if (currentGoal.maxRuns && newCount >= currentGoal.maxRuns) {
                    await store.setStatus(goal.id, 'completed');
                }
            }

            // Notificação de sucesso
            if (goal.notifyOnComplete) {
                await notify({
                    title: `✅ ${goal.name}`,
                    body: result.substring(0, 200),
                    goalId: goal.id,
                    urgency: 'normal',
                    channels: ['toast', 'telegram', 'badge'],
                });
            }

            // Analytics
            try {
                const { getAnalytics } = await import('../analytics');
                getAnalytics().trackSkill(`scheduler:${goal.name}`, true);
            } catch { /* ignore */ }

            console.log(`[JobRunner] Concluído: ${goal.name} em ${duration}ms`);
            emitSchedulerEvent('job_completed', { goalId: goal.id, runId, result: result.substring(0, 500), durationMs: duration });

        } catch (error: any) {
            const duration = Date.now() - startTime;
            run.status = 'failed';
            run.error = error.message;
            run.completedAt = new Date().toISOString();
            run.durationMs = duration;

            await store.updateRun(goal.id, runId, {
                status: 'failed',
                error: error.message,
                completedAt: run.completedAt,
                durationMs: duration,
            });

            await store.updateGoal(goal.id, {
                lastRunAt: run.completedAt,
                lastRunStatus: 'failed',
            });

            // Notificação de erro
            if (goal.notifyOnError) {
                await notify({
                    title: `❌ ${goal.name}`,
                    body: `Erro: ${error.message}`.substring(0, 200),
                    goalId: goal.id,
                    urgency: 'high',
                    channels: ['toast', 'telegram', 'badge'],
                });
            }

            try {
                const { getAnalytics } = await import('../analytics');
                getAnalytics().trackSkill(`scheduler:${goal.name}`, false);
            } catch { /* ignore */ }

            console.error(`[JobRunner] Erro em ${goal.name}:`, error.message);
            emitSchedulerEvent('job_failed', { goalId: goal.id, runId, error: error.message });
        }
    })();

    runningJobs.set(goal.id, { runId, promise: jobPromise });
    jobPromise.finally(() => runningJobs.delete(goal.id));

    // Fire-and-forget — retorna run imediatamente, job roda em background
    return run;
}

export function isRunning(goalId: GoalId): boolean {
    return runningJobs.has(goalId);
}

export function getRunningCount(): number {
    return runningJobs.size;
}

export function getRunningGoalIds(): GoalId[] {
    return [...runningJobs.keys()];
}

function emitSchedulerEvent(type: string, data: any): void {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('scheduler-event', { type, ...data });
    }
}
