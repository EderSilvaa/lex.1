/**
 * Goal Store (Phase 2 AIOS — Autonomia)
 *
 * Persistência de ScheduledGoals e histórico de JobRuns via electron-store.
 * Padrão singleton igual ao analytics.ts.
 */

import { randomUUID } from 'crypto';
import type { GoalId, ScheduledGoal, JobRun, JobRunId, GoalStatus } from './types';

const MAX_RUNS_PER_GOAL = 20;

export class GoalStore {
    private store: any = null;
    private storeReady = false;

    constructor() {
        this.tryLoadStore();
    }

    private async tryLoadStore(): Promise<void> {
        try {
            const Store = (await import('electron-store')).default;
            this.store = new Store({ name: 'lex-scheduler' });
            this.storeReady = true;
        } catch {
            // Fora do Electron — silently degrade
        }
    }

    private async ensureStore(): Promise<boolean> {
        if (this.storeReady) return true;
        await this.tryLoadStore();
        return this.storeReady;
    }

    // ========================================================================
    // GOALS CRUD
    // ========================================================================

    async addGoal(input: Omit<ScheduledGoal, 'id' | 'createdAt' | 'runCount' | 'status'>): Promise<ScheduledGoal> {
        if (!await this.ensureStore()) throw new Error('Store não disponível');

        const goal: ScheduledGoal = {
            ...input,
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            runCount: 0,
            status: 'active',
            notifyOnComplete: input.notifyOnComplete ?? true,
            notifyOnError: input.notifyOnError ?? true,
        };

        const goals = this.getGoalsMap();
        goals[goal.id] = goal;
        this.store.set('goals', goals);

        console.log(`[GoalStore] Goal criado: ${goal.name} (${goal.id})`);
        return goal;
    }

    async updateGoal(id: GoalId, updates: Partial<ScheduledGoal>): Promise<ScheduledGoal | null> {
        if (!await this.ensureStore()) return null;

        const goals = this.getGoalsMap();
        if (!goals[id]) return null;

        goals[id] = { ...goals[id], ...updates, id }; // id nunca muda
        this.store.set('goals', goals);
        return goals[id];
    }

    async removeGoal(id: GoalId): Promise<boolean> {
        if (!await this.ensureStore()) return false;

        const goals = this.getGoalsMap();
        if (!goals[id]) return false;

        delete goals[id];
        this.store.set('goals', goals);

        // Remove histórico de runs
        const allRuns = this.store.get('runs', {}) as Record<GoalId, JobRun[]>;
        delete allRuns[id];
        this.store.set('runs', allRuns);

        console.log(`[GoalStore] Goal removido: ${id}`);
        return true;
    }

    getGoal(id: GoalId): ScheduledGoal | null {
        if (!this.storeReady) return null;
        const goals = this.getGoalsMap();
        return goals[id] || null;
    }

    getAllGoals(): ScheduledGoal[] {
        if (!this.storeReady) return [];
        return Object.values(this.getGoalsMap());
    }

    getActiveGoals(): ScheduledGoal[] {
        return this.getAllGoals().filter(g => g.status === 'active');
    }

    async setStatus(id: GoalId, status: GoalStatus): Promise<void> {
        await this.updateGoal(id, { status });
    }

    // ========================================================================
    // JOB RUNS
    // ========================================================================

    async addRun(goalId: GoalId, run: JobRun): Promise<void> {
        if (!await this.ensureStore()) return;

        const allRuns = this.store.get('runs', {}) as Record<GoalId, JobRun[]>;
        if (!allRuns[goalId]) allRuns[goalId] = [];
        allRuns[goalId].push(run);

        // Prune: mantém últimas MAX_RUNS_PER_GOAL
        if (allRuns[goalId].length > MAX_RUNS_PER_GOAL) {
            allRuns[goalId] = allRuns[goalId].slice(-MAX_RUNS_PER_GOAL);
        }

        this.store.set('runs', allRuns);

        // Não atualiza lastRunStatus aqui — só updateRun() faz isso
        // quando o status final (completed/failed) é conhecido.
        // Evita race condition: addRun("running") sobrescrevendo updateRun("completed").
        await this.updateGoal(goalId, {
            lastRunAt: run.startedAt,
        });
    }

    async updateRun(goalId: GoalId, runId: JobRunId, updates: Partial<JobRun>): Promise<void> {
        if (!await this.ensureStore()) return;

        const allRuns = this.store.get('runs', {}) as Record<GoalId, JobRun[]>;
        const runs = allRuns[goalId] || [];
        const idx = runs.findIndex(r => r.id === runId);
        if (idx < 0) return;

        const updated: JobRun = { ...runs[idx]!, ...updates };
        runs[idx] = updated;
        allRuns[goalId] = runs;
        this.store.set('runs', allRuns);

        // Atualiza status no goal
        await this.updateGoal(goalId, {
            lastRunStatus: updated.status,
        });
    }

    getRunsForGoal(goalId: GoalId, limit = 10): JobRun[] {
        if (!this.storeReady) return [];
        const allRuns = this.store.get('runs', {}) as Record<GoalId, JobRun[]>;
        const runs = allRuns[goalId] || [];
        return runs.slice(-limit);
    }

    getRecentRuns(limit = 20): JobRun[] {
        if (!this.storeReady) return [];
        const allRuns = this.store.get('runs', {}) as Record<GoalId, JobRun[]>;
        const flat: JobRun[] = [];
        for (const runs of Object.values(allRuns)) {
            flat.push(...runs);
        }
        flat.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        return flat.slice(0, limit);
    }

    // ========================================================================
    // INTERNALS
    // ========================================================================

    private getGoalsMap(): Record<GoalId, ScheduledGoal> {
        return this.store.get('goals', {}) as Record<GoalId, ScheduledGoal>;
    }
}

// Singleton
let instance: GoalStore | null = null;
export function getGoalStore(): GoalStore {
    if (!instance) instance = new GoalStore();
    return instance;
}
