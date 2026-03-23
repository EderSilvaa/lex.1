/**
 * Scheduler Engine (Phase 2 AIOS — Autonomia)
 *
 * Motor de agendamento: tick 60s para cron, timers para once/interval,
 * triggers para eventos. Integra com GoalStore, JobRunner e Triggers.
 *
 * Cron matcher inline (~60 linhas), sem dependência externa.
 */

import type { ScheduledGoal, GoalId, TriggerHandle } from './types';
import { getGoalStore } from './goal-store';
import { runGoal, isRunning } from './job-runner';
import { createTrigger } from './triggers';

const TICK_INTERVAL_MS = 60_000; // 60s — cron é por minuto

export class Scheduler {
    private tickTimer: NodeJS.Timeout | null = null;
    private activeTimers = new Map<GoalId, NodeJS.Timeout>();
    private activeTriggers = new Map<GoalId, TriggerHandle>();
    private lastTickMinute = -1;
    private running = false;

    /** Inicia o scheduler: carrega goals ativas e agenda todas */
    async start(): Promise<void> {
        if (this.running) return;
        this.running = true;

        const store = getGoalStore();
        const activeGoals = store.getActiveGoals();

        console.log(`[Scheduler] Iniciando com ${activeGoals.length} goals ativas`);

        for (const goal of activeGoals) {
            this.scheduleGoal(goal);
        }

        // Tick loop para cron
        this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);

        // Tick imediato para processar goals atrasadas (ex: PC dormiu)
        setTimeout(() => this.tick(), 2000);
    }

    /** Para o scheduler e limpa todos os timers/triggers */
    stop(): void {
        this.running = false;

        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }

        this.activeTimers.forEach((timer) => clearTimeout(timer));
        this.activeTimers.clear();

        this.activeTriggers.forEach((handle) => handle.dispose());
        this.activeTriggers.clear();

        console.log('[Scheduler] Parado');
    }

    /** Agenda um goal individual */
    scheduleGoal(goal: ScheduledGoal): void {
        // Limpa agendamento anterior se houver
        this.unscheduleGoal(goal.id);

        const { schedule } = goal;

        switch (schedule.type) {
            case 'cron':
                // Cron é processado no tick loop — só registra
                console.log(`[Scheduler] Cron registrado: ${goal.name} (${schedule.cron})`);
                break;

            case 'once': {
                if (!schedule.runAt) break;
                const runAt = new Date(schedule.runAt).getTime();
                const delay = runAt - Date.now();

                if (delay <= 0) {
                    // Já passou — executa imediatamente se nunca rodou
                    if (goal.runCount === 0) {
                        console.log(`[Scheduler] Once atrasado, executando: ${goal.name}`);
                        this.executeGoal(goal);
                    }
                } else {
                    const timer = setTimeout(() => {
                        this.activeTimers.delete(goal.id);
                        this.executeGoal(goal);
                    }, delay);
                    this.activeTimers.set(goal.id, timer);
                    console.log(`[Scheduler] Once agendado: ${goal.name} em ${Math.round(delay / 60000)}min`);
                }
                break;
            }

            case 'interval': {
                const ms = schedule.intervalMs || 3600_000;
                const timer = setInterval(() => this.executeGoal(goal), ms);
                this.activeTimers.set(goal.id, timer);
                console.log(`[Scheduler] Interval registrado: ${goal.name} a cada ${Math.round(ms / 60000)}min`);
                break;
            }

            case 'trigger': {
                if (!schedule.trigger) break;
                const handle = createTrigger(goal.id, schedule.trigger, () => {
                    this.executeGoal(goal);
                });
                if (handle) {
                    this.activeTriggers.set(goal.id, handle);
                }
                break;
            }
        }
    }

    /** Remove agendamento de um goal */
    unscheduleGoal(goalId: GoalId): void {
        const timer = this.activeTimers.get(goalId);
        if (timer) {
            clearTimeout(timer);
            clearInterval(timer);
            this.activeTimers.delete(goalId);
        }

        const trigger = this.activeTriggers.get(goalId);
        if (trigger) {
            trigger.dispose();
            this.activeTriggers.delete(goalId);
        }
    }

    /** Recarrega agendamento de um goal (após update) */
    async rescheduleGoal(goalId: GoalId): Promise<void> {
        const store = getGoalStore();
        const goal = store.getGoal(goalId);
        if (!goal || goal.status !== 'active') {
            this.unscheduleGoal(goalId);
            return;
        }
        this.scheduleGoal(goal);
    }

    /** Executa um goal imediatamente (manual ou triggered) */
    async runNow(goalId: GoalId): Promise<void> {
        const store = getGoalStore();
        const goal = store.getGoal(goalId);
        if (!goal) {
            console.warn(`[Scheduler] Goal não encontrada: ${goalId}`);
            return;
        }
        await this.executeGoal(goal);
    }

    /** Retorna status geral do scheduler */
    getStatus(): { running: boolean; activeGoals: number; runningJobs: number; nextRuns: Array<{ goalId: string; name: string; nextAt: string }> } {
        const store = getGoalStore();
        const active = store.getActiveGoals();

        const nextRuns = active
            .filter(g => g.schedule.type === 'cron' && g.schedule.cron)
            .map(g => ({
                goalId: g.id,
                name: g.name,
                nextAt: nextCronRun(g.schedule.cron!, new Date())?.toISOString() || 'desconhecido',
            }))
            .filter(n => n.nextAt !== 'desconhecido')
            .sort((a, b) => a.nextAt.localeCompare(b.nextAt))
            .slice(0, 10);

        return {
            running: this.running,
            activeGoals: active.length,
            runningJobs: 0, // imported separately to avoid circular
            nextRuns,
        };
    }

    // ========================================================================
    // TICK (cron matching)
    // ========================================================================

    private tick(): void {
        const now = new Date();
        const currentMinute = now.getFullYear() * 100000000 +
            (now.getMonth() + 1) * 1000000 +
            now.getDate() * 10000 +
            now.getHours() * 100 +
            now.getMinutes();

        // Evita executar 2x no mesmo minuto
        if (currentMinute === this.lastTickMinute) return;
        this.lastTickMinute = currentMinute;

        const store = getGoalStore();
        const cronGoals = store.getActiveGoals().filter(g => g.schedule.type === 'cron' && g.schedule.cron);

        for (const goal of cronGoals) {
            if (matchesCron(goal.schedule.cron!, now)) {
                this.executeGoal(goal);
            }
        }
    }

    private async executeGoal(goal: ScheduledGoal): Promise<void> {
        if (isRunning(goal.id)) {
            console.log(`[Scheduler] Goal ${goal.name} já em execução, pulando`);
            return;
        }

        // Fire and forget — JobRunner cuida de tudo
        runGoal(goal).catch(err => {
            console.error(`[Scheduler] Erro ao executar ${goal.name}:`, err.message);
        });
    }
}

// ============================================================================
// CRON MATCHER (inline, ~60 linhas)
// Formato: "min hora dia mês diasem" (5-field standard)
// Suporta: *, */N, N, N-M, N,M,O
// ============================================================================

export function matchesCron(expression: string, date: Date): boolean {
    const fields = expression.trim().split(/\s+/);
    if (fields.length !== 5) return false;

    const checks = [
        { value: date.getMinutes(), field: fields[0]!, min: 0, max: 59 },
        { value: date.getHours(), field: fields[1]!, min: 0, max: 23 },
        { value: date.getDate(), field: fields[2]!, min: 1, max: 31 },
        { value: date.getMonth() + 1, field: fields[3]!, min: 1, max: 12 },
        { value: date.getDay(), field: fields[4]!, min: 0, max: 6 },  // 0=dom
    ];

    return checks.every(({ value, field, min, max }) => matchField(field, value, min, max));
}

function matchField(field: string, value: number, min: number, max: number): boolean {
    if (field === '*') return true;

    // */N — step
    if (field.startsWith('*/')) {
        const step = parseInt(field.slice(2), 10);
        if (isNaN(step) || step <= 0) return false;
        return (value - min) % step === 0;
    }

    // Lista: N,M,O
    const parts = field.split(',');
    return parts.some(part => {
        // Range: N-M
        if (part.includes('-')) {
            const [startStr, endStr] = part.split('-');
            const start = parseInt(startStr!, 10);
            const end = parseInt(endStr!, 10);
            if (isNaN(start) || isNaN(end)) return false;
            return value >= start && value <= end;
        }
        // Valor exato
        return parseInt(part, 10) === value;
    });
}

/** Calcula a próxima execução de uma expressão cron após a data dada */
export function nextCronRun(expression: string, after: Date): Date | null {
    // Busca bruta: testa cada minuto nos próximos 7 dias
    const maxMs = 7 * 24 * 60 * 60 * 1000;
    const candidate = new Date(after);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1); // começa no próximo minuto

    const limit = after.getTime() + maxMs;

    while (candidate.getTime() < limit) {
        if (matchesCron(expression, candidate)) {
            return candidate;
        }
        candidate.setMinutes(candidate.getMinutes() + 1);
    }

    return null;
}

// Singleton
let instance: Scheduler | null = null;
export function getScheduler(): Scheduler {
    if (!instance) instance = new Scheduler();
    return instance;
}
