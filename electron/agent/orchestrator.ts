/**
 * Orchestrator (Phase 1 AIOS)
 *
 * Coordena a execução de um objetivo complexo:
 * 1. Planner decompõe goal → subtasks
 * 2. Executa subtasks respeitando DAG de dependências
 * 3. Agents especializados rodam via AgentPool
 * 4. Blackboard compartilha resultados entre agents
 * 5. Sintetiza resposta final
 */

import { EventEmitter } from 'events';
import { Plan, SubTask, OrchestratorEvent } from './types';
import { createPlan, shouldUsePlanner } from './planner';
import { AgentPool } from './agent-pool';
import { Blackboard } from './blackboard';
import { buildPromptLayerSystem, getDefaultTenantConfig } from './prompt-layer';

export class Orchestrator extends EventEmitter {
    private pool: AgentPool;
    private cancelled = false;

    constructor(maxConcurrent = 3) {
        super();
        this.pool = new AgentPool(maxConcurrent);
    }

    /** Executa um objetivo complexo end-to-end */
    async execute(goal: string, sessionId?: string): Promise<string> {
        this.cancelled = false;

        // 1. Cria plano via LLM
        console.log('[Orchestrator] Criando plano para:', goal.substring(0, 80));
        const plan = await createPlan(goal);
        plan.status = 'executing';
        this.emitEvent({ type: 'plan_created', plan });

        console.log(`[Orchestrator] Plano criado: ${plan.subtasks.length} subtasks`);
        for (const st of plan.subtasks) {
            console.log(`  [${st.id}] ${st.agentType}: ${st.description.substring(0, 60)} (deps: ${st.dependsOn.join(',')||'nenhuma'})`);
        }

        // 2. Cria blackboard para esta execução
        const blackboard = new Blackboard();

        // 3. Executa subtasks respeitando DAG de dependências
        try {
            const batches = topologicalBatches(plan.subtasks);

            for (const batch of batches) {
                if (this.cancelled) {
                    plan.status = 'cancelled';
                    return 'Execução cancelada.';
                }

                // Marca batch como running
                for (const task of batch) {
                    task.status = 'running';
                    this.emitEvent({ type: 'subtask_started', subtaskId: task.id, agentType: task.agentType });
                }

                // Executa batch (paralelo para tasks independentes)
                const results = await this.pool.runParallel(batch, blackboard, sessionId);

                // Processa resultados
                for (const task of batch) {
                    const result = results.get(task.id);
                    if (result && !result.startsWith('ERRO:')) {
                        task.status = 'completed';
                        task.result = result;
                        blackboard.set(`result:${task.id}`, result);
                        this.emitEvent({ type: 'subtask_completed', subtaskId: task.id, result });
                    } else {
                        task.status = 'failed';
                        task.error = result || 'Sem resultado';
                        this.emitEvent({ type: 'subtask_failed', subtaskId: task.id, error: task.error });

                        // Marca dependentes como skipped
                        this.skipDependents(plan.subtasks, task.id);
                    }
                }
            }

            // 4. Sintetiza resposta final
            const completedTasks = plan.subtasks.filter(t => t.status === 'completed');
            if (completedTasks.length === 0) {
                plan.status = 'failed';
                const errors = plan.subtasks.filter(t => t.error).map(t => t.error).join('; ');
                this.emitEvent({ type: 'plan_failed', error: errors });
                return `Não consegui completar o objetivo. Erros: ${errors}`;
            }

            const finalAnswer = await this.synthesizeFinalAnswer(goal, blackboard, plan);
            plan.finalAnswer = finalAnswer;
            plan.status = 'completed';
            this.emitEvent({ type: 'plan_completed', finalAnswer });

            return finalAnswer;

        } catch (error: any) {
            plan.status = 'failed';
            this.emitEvent({ type: 'plan_failed', error: error.message });
            return `Erro na orquestração: ${error.message}`;
        }
    }

    async cancel(): Promise<void> {
        this.cancelled = true;
        await this.pool.cancelAll();
    }

    private emitEvent(event: OrchestratorEvent): void {
        this.emit('event', event);
    }

    /** Marca subtasks dependentes de uma falha como skipped */
    private skipDependents(subtasks: SubTask[], failedId: string): void {
        for (const task of subtasks) {
            if (task.status === 'pending' && task.dependsOn.includes(failedId)) {
                task.status = 'skipped';
                // Propaga: dependentes de skipped também são skipped
                this.skipDependents(subtasks, task.id);
            }
        }
    }

    /** Sintetiza resposta final a partir dos resultados do blackboard */
    private async synthesizeFinalAnswer(goal: string, blackboard: Blackboard, plan: Plan): Promise<string> {
        // Se só teve 1 subtask, o resultado dela já é a resposta
        const completed = plan.subtasks.filter(t => t.status === 'completed');
        if (completed.length === 1 && plan.subtasks.length === 1) {
            return completed[0]!.result || '';
        }

        // Múltiplas subtasks: sintetiza via LLM
        const { callAI } = await import('../ai-handler');

        const resultsText = completed
            .map(t => `## ${t.description}\n${t.result?.substring(0, 2000) || '(sem resultado)'}`)
            .join('\n\n');

        const skipped = plan.subtasks.filter(t => t.status === 'skipped' || t.status === 'failed');
        const skippedText = skipped.length > 0
            ? `\n\n## Subtasks não completadas\n${skipped.map(t => `- ${t.description}: ${t.error || 'ignorada'}`).join('\n')}`
            : '';

        const personalidade = buildPromptLayerSystem(getDefaultTenantConfig());
        const synthesisInstructions = `Sintetize os resultados das subtasks em uma resposta coesa. Use markdown.
Comece pelo resultado principal, depois detalhe. Cite artigos de lei específicos quando relevante.
Se alguma subtask falhou, mencione brevemente mas foque no que foi alcançado.
Termine com um próximo passo concreto ("Quer que eu...").`;

        const response = await callAI({
            system: `${personalidade}\n\n---\n\n${synthesisInstructions}`,
            user: `## Objetivo Original\n"${goal}"\n\n## Resultados das Subtasks\n${resultsText}${skippedText}\n\nSintetize uma resposta final coesa.`,
            temperature: 0.3,
            maxTokens: 3000,
        });

        return response;
    }
}

/**
 * Agrupa subtasks em batches topológicos.
 * Cada batch contém tasks cujas dependências estão em batches anteriores.
 */
function topologicalBatches(subtasks: SubTask[]): SubTask[][] {
    const batches: SubTask[][] = [];
    const completed = new Set<string>();
    const remaining = [...subtasks.filter(t => t.status === 'pending')];

    let maxIterations = remaining.length + 1; // safety
    while (remaining.length > 0 && maxIterations-- > 0) {
        // Encontra tasks com todas as dependências satisfeitas
        const ready = remaining.filter(t =>
            t.dependsOn.every(dep => completed.has(dep))
        );

        if (ready.length === 0) {
            // Dependência circular ou irresolvível — executa tudo que resta
            console.warn('[Orchestrator] Dependências irresolvíveis, forçando execução');
            batches.push([...remaining]);
            break;
        }

        batches.push(ready);
        for (const task of ready) {
            completed.add(task.id);
            const idx = remaining.indexOf(task);
            if (idx >= 0) remaining.splice(idx, 1);
        }
    }

    return batches;
}

/** Exporta shouldUsePlanner para uso no main.ts */
export { shouldUsePlanner } from './planner';
