/**
 * Agent Pool (Phase 1 AIOS)
 *
 * Gerencia execução concorrente de agentes especializados.
 * Controla: maxConcurrency global, mutex por tipo (ex: PJe = 1 por vez).
 */

import { SubTask, AgentSpec, AgentTypeId } from './types';
import { runAgentLoop } from './loop';
import { getAgentSpec } from './agent-types';
import { Blackboard } from './blackboard';

interface RunningAgent {
    subtaskId: string;
    promise: Promise<string>;
    spec: AgentSpec;
    abort: AbortController;
}

export class AgentPool {
    private running = new Map<string, RunningAgent>();
    private maxConcurrent: number;
    private poolAbort = new AbortController();

    constructor(maxConcurrent = 3) {
        this.maxConcurrent = maxConcurrent;
    }

    /** Verifica se um tipo de agente exige execução serial (via requiresBrowser ou maxConcurrent=1) */
    private isSerialType(agentType: AgentTypeId): boolean {
        const spec = getAgentSpec(agentType);
        return spec.requiresBrowser === true || spec.maxConcurrent === 1;
    }

    /** Spawna um agente para executar uma subtask */
    async spawn(
        subtask: SubTask,
        blackboard: Blackboard,
        sessionId?: string
    ): Promise<string> {
        const spec = getAgentSpec(subtask.agentType);
        const agentAbort = new AbortController();

        // Se pool já foi abortado (cancelAll em andamento), aborta imediatamente
        if (this.poolAbort.signal.aborted) {
            agentAbort.abort();
        }

        // Encadeia pool abort → agent abort
        const onPoolAbort = () => agentAbort.abort();
        this.poolAbort.signal.addEventListener('abort', onPoolAbort, { once: true });

        // Monta objetivo com contexto do blackboard
        const bbContext = blackboard.formatAsContext();
        const objetivo = bbContext
            ? `${subtask.description}\n\n## Contexto de subtasks anteriores:\n${bbContext}`
            : subtask.description;

        const promise = runAgentLoop({
            objetivo,
            config: { maxIterations: 10, timeoutMs: 120000 },
            sessionId,
            agentSpec: spec,
            parentAbort: agentAbort.signal,
        });

        this.running.set(subtask.id, { subtaskId: subtask.id, promise, spec, abort: agentAbort });

        try {
            const result = await promise;
            return result;
        } finally {
            this.poolAbort.signal.removeEventListener('abort', onPoolAbort);
            this.running.delete(subtask.id);
        }
    }

    /**
     * Executa subtasks independentes em paralelo, respeitando:
     * - maxConcurrent global
     * - serialTypes (PJe/browser rodam 1 por vez)
     */
    async runParallel(
        subtasks: SubTask[],
        blackboard: Blackboard,
        sessionId?: string
    ): Promise<Map<string, string>> {
        const results = new Map<string, string>();

        if (subtasks.length === 0) return results;
        if (subtasks.length === 1) {
            const task = subtasks[0]!;
            const result = await this.spawn(task, blackboard, sessionId);
            results.set(task.id, result);
            return results;
        }

        // Separa tasks seriais das paralelas (baseado no AgentSpec)
        const serialTasks = subtasks.filter(t => this.isSerialType(t.agentType));
        const parallelTasks = subtasks.filter(t => !this.isSerialType(t.agentType));

        // Executa paralelas com concurrency limit
        const parallelPromises = this.runWithConcurrencyLimit(
            parallelTasks,
            blackboard,
            sessionId,
            this.maxConcurrent
        );

        // Executa seriais sequencialmente
        const serialPromise = (async () => {
            const serialResults = new Map<string, string>();
            for (const task of serialTasks) {
                try {
                    const result = await this.spawn(task, blackboard, sessionId);
                    serialResults.set(task.id, result);
                    blackboard.set(`result:${task.id}`, result);
                } catch (error: any) {
                    serialResults.set(task.id, `ERRO: ${error.message}`);
                }
            }
            return serialResults;
        })();

        const [parallelResults, serialResults] = await Promise.all([parallelPromises, serialPromise]);

        // Merge results
        parallelResults.forEach((v, k) => results.set(k, v));
        serialResults.forEach((v, k) => results.set(k, v));

        return results;
    }

    private async runWithConcurrencyLimit(
        tasks: SubTask[],
        blackboard: Blackboard,
        sessionId: string | undefined,
        limit: number
    ): Promise<Map<string, string>> {
        const results = new Map<string, string>();
        const executing = new Set<Promise<void>>();

        for (const task of tasks) {
            const p = (async () => {
                try {
                    const result = await this.spawn(task, blackboard, sessionId);
                    results.set(task.id, result);
                    blackboard.set(`result:${task.id}`, result);
                } catch (error: any) {
                    results.set(task.id, `ERRO: ${error.message}`);
                }
            })();

            executing.add(p);
            p.finally(() => executing.delete(p));

            if (executing.size >= limit) {
                await Promise.race(executing);
            }
        }

        await Promise.all(executing);
        return results;
    }

    async cancelAll(): Promise<void> {
        // Sinaliza todos os agentes via pool abort
        this.poolAbort.abort();

        // Espera até 5s para pararem
        if (this.running.size > 0) {
            const promises = Array.from(this.running.values()).map(a => a.promise);
            await Promise.race([
                Promise.allSettled(promises),
                new Promise<void>(r => setTimeout(r, 5000))
            ]);
        }

        // Limpa e reseta
        this.running.clear();
        this.poolAbort = new AbortController();
    }

    get activeCount(): number {
        return this.running.size;
    }
}
