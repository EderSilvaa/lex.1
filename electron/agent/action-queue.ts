/**
 * Action Queue (C2)
 *
 * Fila de ações com prioridade para automação PJe.
 * Processa ações sequencialmente (PJe requer uma ação por vez)
 * com suporte a retry automático e cancelamento.
 */

import { randomUUID } from 'crypto';
import { withPJeRetry } from './retry';

// ============================================================================
// TYPES
// ============================================================================

export type ActionPriority = 'high' | 'normal' | 'low';
export type ActionStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface QueuedAction {
    id: string;
    skill: string;
    params: Record<string, any>;
    priority: ActionPriority;
    status: ActionStatus;
    retries: number;
    maxRetries: number;
    result?: any;
    error?: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
}

export interface QueueStats {
    pending: number;
    running: number;
    done: number;
    failed: number;
    total: number;
}

type ActionExecutor = (skill: string, params: Record<string, any>) => Promise<any>;

// ============================================================================
// ACTION QUEUE
// ============================================================================

export class ActionQueue {
    private queue: QueuedAction[] = [];
    private isProcessing = false;
    private executor: ActionExecutor | null = null;
    private onActionUpdate?: (action: QueuedAction) => void;

    /**
     * Define a função executora de skills
     */
    setExecutor(executor: ActionExecutor): void {
        this.executor = executor;
    }

    /**
     * Define callback para atualizações de ações
     */
    onUpdate(callback: (action: QueuedAction) => void): void {
        this.onActionUpdate = callback;
    }

    /**
     * Enfileira uma ação
     */
    enqueue(params: {
        skill: string;
        params: Record<string, any>;
        priority?: ActionPriority;
        maxRetries?: number;
    }): string {
        const action: QueuedAction = {
            id: randomUUID(),
            skill: params.skill,
            params: params.params,
            priority: params.priority || 'normal',
            status: 'pending',
            retries: 0,
            maxRetries: params.maxRetries ?? 2,
            createdAt: Date.now()
        };

        // Inserir na posição correta baseado em prioridade
        const insertIndex = this.findInsertIndex(action.priority);
        this.queue.splice(insertIndex, 0, action);

        console.log(`[Queue] Enqueued: ${action.skill} (${action.priority}) — ID: ${action.id}`);
        this.notifyUpdate(action);

        // Auto-start processamento se não estiver rodando
        if (!this.isProcessing) {
            this.process();
        }

        return action.id;
    }

    /**
     * Processa a fila
     */
    async process(): Promise<void> {
        if (this.isProcessing || !this.executor) return;
        this.isProcessing = true;

        console.log('[Queue] Iniciando processamento...');

        while (this.queue.length > 0) {
            // Pegar próxima ação pendente
            const actionIndex = this.queue.findIndex(a => a.status === 'pending');
            if (actionIndex === -1) break;

            const action = this.queue[actionIndex]!;
            action.status = 'running';
            action.startedAt = Date.now();
            this.notifyUpdate(action);

            console.log(`[Queue] Executando: ${action.skill} (tentativa ${action.retries + 1})`);

            try {
                // Executa com retry automático via withPJeRetry
                action.result = await withPJeRetry(() =>
                    this.executor!(action.skill, action.params)
                );

                action.status = 'done';
                action.completedAt = Date.now();
                const elapsed = action.completedAt - (action.startedAt || action.completedAt);
                console.log(`[Queue] Concluído: ${action.skill} em ${elapsed}ms`);
            } catch (error: any) {
                action.retries++;
                action.error = error.message;

                if (action.retries >= action.maxRetries) {
                    action.status = 'failed';
                    action.completedAt = Date.now();
                    console.error(`[Queue] Falhou após ${action.retries} tentativas: ${action.skill} — ${error.message}`);
                } else {
                    // Re-enfileira para retry
                    action.status = 'pending';
                    console.warn(`[Queue] Retry ${action.retries}/${action.maxRetries}: ${action.skill}`);
                }
            }

            this.notifyUpdate(action);

            // Remover ações concluídas/falhadas (mantém as últimas 20 para histórico)
            this.cleanup();
        }

        this.isProcessing = false;
        console.log('[Queue] Processamento concluído');
    }

    /**
     * Cancela uma ação pendente
     */
    cancel(actionId: string): boolean {
        const action = this.queue.find(a => a.id === actionId);
        if (!action || action.status !== 'pending') return false;

        action.status = 'cancelled';
        action.completedAt = Date.now();
        this.notifyUpdate(action);
        console.log(`[Queue] Cancelado: ${action.skill}`);
        return true;
    }

    /**
     * Cancela todas as ações pendentes
     */
    cancelAll(): number {
        let count = 0;
        for (const action of this.queue) {
            if (action.status === 'pending') {
                action.status = 'cancelled';
                action.completedAt = Date.now();
                count++;
            }
        }
        console.log(`[Queue] ${count} ações canceladas`);
        return count;
    }

    /**
     * Retorna status atual da fila
     */
    getStats(): QueueStats {
        return {
            pending: this.queue.filter(a => a.status === 'pending').length,
            running: this.queue.filter(a => a.status === 'running').length,
            done: this.queue.filter(a => a.status === 'done').length,
            failed: this.queue.filter(a => a.status === 'failed').length,
            total: this.queue.length
        };
    }

    /**
     * Retorna todas as ações na fila
     */
    getAll(): QueuedAction[] {
        return [...this.queue];
    }

    /**
     * Verifica se a fila está processando
     */
    get processing(): boolean {
        return this.isProcessing;
    }

    // ========================================================================
    // PRIVATE
    // ========================================================================

    private findInsertIndex(priority: ActionPriority): number {
        const priorityOrder: Record<ActionPriority, number> = {
            high: 0,
            normal: 1,
            low: 2
        };

        const targetOrder = priorityOrder[priority];

        // Encontrar a posição correta: depois de itens de mesma/maior prioridade
        for (let i = 0; i < this.queue.length; i++) {
            const item = this.queue[i]!;
            if (item.status !== 'pending') continue;
            if (priorityOrder[item.priority] > targetOrder) {
                return i;
            }
        }

        return this.queue.length;
    }

    private cleanup(): void {
        const completed = this.queue.filter(
            a => a.status === 'done' || a.status === 'failed' || a.status === 'cancelled'
        );
        if (completed.length > 20) {
            const toRemove = completed.slice(0, completed.length - 20);
            for (const action of toRemove) {
                const idx = this.queue.indexOf(action);
                if (idx !== -1) this.queue.splice(idx, 1);
            }
        }
    }

    private notifyUpdate(action: QueuedAction): void {
        if (this.onActionUpdate) {
            this.onActionUpdate({ ...action });
        }
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let queueInstance: ActionQueue | null = null;

export function getActionQueue(): ActionQueue {
    if (!queueInstance) {
        queueInstance = new ActionQueue();
    }
    return queueInstance;
}
