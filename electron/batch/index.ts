/**
 * Batch Module — Entry Point
 *
 * Registry de pipelines ativos + exports públicos.
 */

import type { LoteId } from './types';
import { BatchPipeline } from './pipeline';

export { BatchPipeline, createBatchLote } from './pipeline';
export { getLoteStore } from './lote-store';
export * from './types';

// ─── Active Pipelines Registry ─────────────────────────────────────

const activePipelines = new Map<LoteId, BatchPipeline>();

export function getActivePipeline(loteId: LoteId): BatchPipeline | undefined {
    return activePipelines.get(loteId);
}

export function registerPipeline(loteId: LoteId, pipeline: BatchPipeline): void {
    activePipelines.set(loteId, pipeline);

    // Cleanup automático quando pipeline completa/cancela/erro
    pipeline.on('event', (event) => {
        if (['lote_completed', 'lote_cancelled', 'lote_error'].includes(event.type)) {
            // Delay para dar tempo do evento ser processado
            setTimeout(() => activePipelines.delete(loteId), 5000);
        }
    });
}

export function unregisterPipeline(loteId: LoteId): void {
    activePipelines.delete(loteId);
}

export function getActivePipelineCount(): number {
    return activePipelines.size;
}

export function getAllActivePipelineIds(): LoteId[] {
    return Array.from(activePipelines.keys());
}
