/**
 * Scheduler Types (Phase 2 AIOS — Autonomia)
 *
 * Tipos para Goal Store, Scheduler, Triggers e Job Runner.
 */

export type GoalId = string;
export type JobRunId = string;

export type ScheduleType = 'cron' | 'once' | 'interval' | 'trigger';
export type TriggerType = 'file_change' | 'pje_movimentacao' | 'webhook' | 'manual';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'error';
export type JobRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScheduleConfig {
    type: ScheduleType;
    /** Para 'cron': expressão 5-field (min hora dia mês diasem) */
    cron?: string;
    /** Para 'once': ISO timestamp */
    runAt?: string;
    /** Para 'interval': milissegundos */
    intervalMs?: number;
    /** Para 'trigger': configuração do trigger */
    trigger?: TriggerConfig;
}

export interface TriggerConfig {
    type: TriggerType;
    /** file_change: caminho a monitorar */
    watchPath?: string;
    watchExtensions?: string[];
    /** pje_movimentacao: número do processo */
    processoNumero?: string;
    tribunal?: string;
    /** Intervalo de check para triggers que fazem polling (ms, default 30min) */
    pollIntervalMs?: number;
    /** webhook: rota (stub para futuro) */
    webhookPath?: string;
}

export interface ScheduledGoal {
    id: GoalId;
    /** Label legível */
    name: string;
    /** Texto do objetivo para o Orchestrator */
    goal: string;
    schedule: ScheduleConfig;
    status: GoalStatus;
    createdAt: string;
    lastRunAt?: string;
    lastRunStatus?: JobRunStatus;
    /** Próxima execução (computado) */
    nextRunAt?: string;
    runCount: number;
    /** Parar após N execuções (opcional) */
    maxRuns?: number;
    notifyOnComplete: boolean;
    notifyOnError: boolean;
    tags?: string[];
    /** Metadata livre (ex: hash de último resultado PJe para detectar mudanças) */
    metadata?: Record<string, any>;
}

export interface JobRun {
    id: JobRunId;
    goalId: GoalId;
    status: JobRunStatus;
    startedAt: string;
    completedAt?: string;
    result?: string;
    error?: string;
    durationMs?: number;
}

export interface NotificationPayload {
    title: string;
    body: string;
    goalId?: GoalId;
    urgency: 'low' | 'normal' | 'high';
    channels: Array<'toast' | 'telegram' | 'badge'>;
}

/** Handle retornado por triggers para cleanup */
export interface TriggerHandle {
    goalId: GoalId;
    type: TriggerType;
    dispose: () => void;
}
