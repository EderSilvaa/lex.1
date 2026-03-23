/**
 * Scheduler Module (Phase 2 AIOS — Autonomia)
 *
 * Exports + initScheduler() chamado no boot do app.
 */

export type {
    GoalId, JobRunId, ScheduleType, TriggerType, GoalStatus, JobRunStatus,
    ScheduleConfig, TriggerConfig, ScheduledGoal, JobRun, NotificationPayload, TriggerHandle
} from './types';

export { GoalStore, getGoalStore } from './goal-store';
export { Scheduler, getScheduler, matchesCron, nextCronRun } from './scheduler';
export { runGoal, isRunning, getRunningCount, getRunningGoalIds, setJobRunnerWindow } from './job-runner';
export { createTrigger } from './triggers';

import { getScheduler } from './scheduler';

/**
 * Inicializa o scheduler no boot do app.
 * Chamado em main.ts após ensureAgentInitialized().
 */
export async function initScheduler(): Promise<void> {
    try {
        const scheduler = getScheduler();
        await scheduler.start();
        console.log('[Scheduler] Módulo inicializado');
    } catch (err: any) {
        console.error('[Scheduler] Falha na inicialização:', err.message);
    }
}

/**
 * Para o scheduler (chamado no app quit).
 */
export function stopScheduler(): void {
    try {
        getScheduler().stop();
    } catch { /* ignore */ }
}
