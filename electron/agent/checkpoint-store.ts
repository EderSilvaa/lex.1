/**
 * Checkpoint Store (P3a AIOS — padrão LangGraph)
 *
 * Persiste estado de Plans em disco para que execuções interrompidas
 * possam ser retomadas de onde pararam.
 *
 * Fluxo:
 *   Orchestrator.execute() → save() a cada batch completado
 *   Se app reinicia → load() verifica checkpoint → retoma do batch seguinte
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { Plan, SubTask } from './types';

// ─────────────────────────────────────────────────────────────────────────────

export interface Checkpoint {
    planId: string;
    goal: string;
    subtasks: CheckpointSubTask[];
    /** Índice do próximo batch a executar (batches anteriores já completaram) */
    nextBatchIndex: number;
    /** Resultados já coletados (blackboard snapshot) */
    results: Record<string, string>;
    createdAt: number;
    updatedAt: number;
}

/** Versão serializada de SubTask (sem funções) */
interface CheckpointSubTask {
    id: string;
    description: string;
    agentType: string;
    dependsOn: string[];
    status: SubTask['status'];
    result?: string;
    error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

const CHECKPOINTS_DIR = () =>
    path.join(app.getPath('userData'), 'checkpoints');

const MAX_CHECKPOINTS = 20;

function ensureDir(): void {
    const dir = CHECKPOINTS_DIR();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function filePath(planId: string): string {
    // Sanitiza ID para nome de arquivo seguro
    const safe = planId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(CHECKPOINTS_DIR(), `${safe}.json`);
}

// ─────────────────────────────────────────────────────────────────────────────
// API Pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Salva checkpoint após um batch completar.
 * Chamado pelo Orchestrator a cada iteração do DAG.
 */
export function saveCheckpoint(
    plan: Plan,
    nextBatchIndex: number,
    results: Record<string, string>
): void {
    ensureDir();

    const checkpoint: Checkpoint = {
        planId: plan.id,
        goal: plan.goal,
        subtasks: plan.subtasks.map(t => ({
            id: t.id,
            description: t.description,
            agentType: t.agentType,
            dependsOn: t.dependsOn,
            status: t.status,
            result: t.result,
            error: t.error,
        })),
        nextBatchIndex,
        results,
        createdAt: plan.createdAt,
        updatedAt: Date.now(),
    };

    try {
        fs.writeFileSync(filePath(plan.id), JSON.stringify(checkpoint, null, 2), 'utf-8');
        console.log(`[Checkpoint] Salvo: plan=${plan.id}, batch=${nextBatchIndex}`);
    } catch (err: any) {
        console.error(`[Checkpoint] Erro ao salvar: ${err.message}`);
    }

    // Limpa checkpoints antigos
    pruneOldCheckpoints();
}

/**
 * Carrega checkpoint de um plano (se existir).
 * Retorna null se não há checkpoint ou se está corrompido.
 */
export function loadCheckpoint(planId: string): Checkpoint | null {
    const fp = filePath(planId);
    if (!fs.existsSync(fp)) return null;

    try {
        const raw = fs.readFileSync(fp, 'utf-8');
        const checkpoint: Checkpoint = JSON.parse(raw);

        // Validação básica
        if (!checkpoint.planId || !checkpoint.subtasks || !Array.isArray(checkpoint.subtasks)) {
            console.warn(`[Checkpoint] Corrompido: ${fp}`);
            removeCheckpoint(planId);
            return null;
        }

        return checkpoint;
    } catch (err: any) {
        console.error(`[Checkpoint] Erro ao ler: ${err.message}`);
        return null;
    }
}

/**
 * Busca checkpoint pelo goal (para retomada sem saber o planId).
 * Retorna o checkpoint mais recente que corresponde ao goal.
 */
export function findCheckpointByGoal(goal: string): Checkpoint | null {
    ensureDir();
    const dir = CHECKPOINTS_DIR();

    try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

        let best: Checkpoint | null = null;
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
                const cp: Checkpoint = JSON.parse(raw);
                if (cp.goal === goal && cp.subtasks.some(t => t.status === 'pending')) {
                    if (!best || cp.updatedAt > best.updatedAt) {
                        best = cp;
                    }
                }
            } catch { /* ignora arquivos corrompidos */ }
        }

        return best;
    } catch {
        return null;
    }
}

/**
 * Remove checkpoint (chamado quando plano completa com sucesso).
 */
export function removeCheckpoint(planId: string): void {
    const fp = filePath(planId);
    try {
        if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
            console.log(`[Checkpoint] Removido: ${planId}`);
        }
    } catch (err: any) {
        console.error(`[Checkpoint] Erro ao remover: ${err.message}`);
    }
}

/**
 * Lista todos os checkpoints pendentes (para UI de retomada).
 */
export function listPendingCheckpoints(): Checkpoint[] {
    ensureDir();
    const dir = CHECKPOINTS_DIR();

    try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        const checkpoints: Checkpoint[] = [];

        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
                const cp: Checkpoint = JSON.parse(raw);
                // Só retorna se tem subtasks pendentes
                if (cp.subtasks.some(t => t.status === 'pending')) {
                    checkpoints.push(cp);
                }
            } catch { /* ignora corrompidos */ }
        }

        return checkpoints.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
        return [];
    }
}

/**
 * Restaura um Plan a partir de um Checkpoint.
 * Subtasks já completadas mantêm seus resultados.
 * Subtasks pendentes/failed ficam prontas para re-execução.
 */
export function restorePlanFromCheckpoint(checkpoint: Checkpoint): Plan {
    return {
        id: checkpoint.planId,
        goal: checkpoint.goal,
        subtasks: checkpoint.subtasks.map(t => ({
            id: t.id,
            description: t.description,
            agentType: t.agentType,
            dependsOn: t.dependsOn,
            status: t.status === 'failed' ? 'pending' as const : t.status,
            result: t.result,
            error: undefined, // Limpa erros para retry
        })),
        createdAt: checkpoint.createdAt,
        status: 'executing',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interno
// ─────────────────────────────────────────────────────────────────────────────

function pruneOldCheckpoints(): void {
    const dir = CHECKPOINTS_DIR();
    try {
        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                name: f,
                mtime: fs.statSync(path.join(dir, f)).mtimeMs,
            }))
            .sort((a, b) => b.mtime - a.mtime);

        // Remove os mais antigos se exceder o limite
        for (const file of files.slice(MAX_CHECKPOINTS)) {
            fs.unlinkSync(path.join(dir, file.name));
        }
    } catch { /* best effort */ }
}
