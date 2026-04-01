/**
 * Pipeline Controller — State Machine da Produção em Lote
 *
 * Coordena o fluxo completo:
 * CREATED → STRATEGY_PENDING → STRATEGY_APPROVED → PRODUCING → WAVE_REVIEW → PROTOCOL_PENDING → PROTOCOLING → COMPLETED
 *
 * Pausa em HITL checkpoints e resume via approveStrategy/approveWave/approveProtocol.
 * Cada transição persiste no LoteStore.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import type {
    LoteId, LoteStatus, BatchLote, BatchEvent, BatchEventType,
    Wave, WorkerResult, StrategyPacket, HITLSource, HITLCheckpoint,
    ProcessoInput,
} from './types';
import { MAX_CONCURRENT_WORKERS } from './types';
import { getLoteStore } from './lote-store';
import { analyzeAndPropose } from './estrategista';
import { runWorker } from './worker';
import { auditWave } from './auditor';

export class BatchPipeline extends EventEmitter {
    private loteId: LoteId;
    private abort = new AbortController();

    constructor(loteId: LoteId) {
        super();
        this.loteId = loteId;
    }

    // ════════════════════════════════════════════════════════════════
    // PUBLIC: Resume from current state
    // ════════════════════════════════════════════════════════════════

    async run(): Promise<void> {
        const lote = this.getLote();
        if (!lote) return this.emitError('Lote não encontrado');

        console.log(`[Pipeline ${this.loteId.substring(0, 8)}] run() — status: ${lote.status}`);

        try {
            switch (lote.status) {
                case 'created':
                    await this.runEstrategista(lote);
                    break;
                case 'strategy_approved':
                    await this.runNextWave();
                    break;
                case 'producing':
                    // Resume: se wave current estava rodando, re-roda
                    await this.runNextWave();
                    break;
                case 'wave_review':
                    // Esperando HITL #2 — não faz nada
                    break;
                case 'redrafting':
                    // Em redraft — não faz nada (redraft chama runNextWave ao terminar)
                    break;
                case 'protocol_pending':
                    // Esperando HITL #3 — não faz nada
                    break;
                case 'protocoling':
                    await this.runProtocol();
                    break;
                case 'strategy_pending':
                    // Esperando HITL #1
                    break;
                case 'paused':
                case 'completed':
                case 'cancelled':
                case 'error':
                    break;
            }
        } catch (error: any) {
            await this.transitionTo('error');
            await getLoteStore().updateLote(this.loteId, { error: error.message });
            this.emitEvent('lote_error', { error: error.message });
        }
    }

    // ════════════════════════════════════════════════════════════════
    // HITL APPROVALS
    // ════════════════════════════════════════════════════════════════

    async approveStrategy(source: HITLSource): Promise<void> {
        const lote = this.getLote();
        if (!lote || lote.status !== 'strategy_pending') return;

        console.log(`[Pipeline] Estratégia aprovada via ${source}`);
        await this.transitionTo('strategy_approved');
        this.emitEvent('strategy_approved', { source });

        // Cria waves
        await this.createWaves(lote.strategy);

        // Inicia produção
        await this.runNextWave();
    }

    async approveWave(waveIndex: number, source: HITLSource, redraftIds?: string[]): Promise<void> {
        const lote = this.getLote();
        if (!lote || lote.status !== 'wave_review') return;

        if (redraftIds && redraftIds.length > 0) {
            // Re-redigir items específicos
            await this.runRedrafts(waveIndex, redraftIds);
            return;
        }

        // Aprovar wave
        console.log(`[Pipeline] Wave ${waveIndex} aprovada via ${source}`);
        await getLoteStore().updateWave(this.loteId, waveIndex, {
            status: 'approved',
            approvedAt: new Date().toISOString(),
            approvedVia: source,
        });
        this.emitEvent('wave_approved', { waveIndex, source });

        // Próxima wave ou protocolo
        const updatedLote = this.getLote()!;
        const nextWaveIndex = waveIndex + 1;

        if (nextWaveIndex < updatedLote.waves.length) {
            await getLoteStore().updateLote(this.loteId, { currentWave: nextWaveIndex });
            await this.runNextWave();
        } else {
            // Todas as waves aprovadas → checkpoint protocolo
            await this.transitionTo('protocol_pending');
            this.emitEvent('protocol_pending', {});
            this.emitHITL('protocol', this.getProtocolSummary(updatedLote));
        }
    }

    async approveProtocol(source: HITLSource): Promise<void> {
        const lote = this.getLote();
        if (!lote || lote.status !== 'protocol_pending') return;

        console.log(`[Pipeline] Protocolo aprovado via ${source}`);
        await this.transitionTo('protocoling');
        this.emitEvent('protocol_started', { source });

        await this.runProtocol();
    }

    // ════════════════════════════════════════════════════════════════
    // CONTROLS
    // ════════════════════════════════════════════════════════════════

    async pause(reason?: string): Promise<void> {
        const lote = this.getLote();
        if (!lote) return;
        if (['completed', 'cancelled', 'error'].includes(lote.status)) return;

        this.abort.abort();
        await getLoteStore().updateLote(this.loteId, {
            status: 'paused',
            pausedAt: new Date().toISOString(),
            pauseReason: reason || '',
        });
        this.emitEvent('lote_paused', { reason });
    }

    async resume(): Promise<void> {
        const lote = this.getLote();
        if (!lote || lote.status !== 'paused') return;

        this.abort = new AbortController();

        // Voltar ao estado anterior ao pause
        // Determina o estado correto baseado no progresso
        const lastApprovedWave = lote.waves.findIndex(w => w.status !== 'approved');
        if (lastApprovedWave === -1 || lastApprovedWave >= lote.waves.length) {
            await this.transitionTo('protocol_pending');
        } else {
            const wave = lote.waves[lastApprovedWave];
            if (wave && wave.status === 'review') {
                await this.transitionTo('wave_review');
            } else {
                await getLoteStore().updateLote(this.loteId, { currentWave: lastApprovedWave });
                await this.transitionTo('strategy_approved');
            }
        }

        this.emitEvent('lote_resumed', {});
        await this.run();
    }

    async cancel(): Promise<void> {
        this.abort.abort();
        await this.transitionTo('cancelled');
        this.emitEvent('lote_cancelled', {});
    }

    // ════════════════════════════════════════════════════════════════
    // INTERNAL: Estrategista
    // ════════════════════════════════════════════════════════════════

    private async runEstrategista(lote: BatchLote): Promise<void> {
        this.emitEvent('lote_created', { nome: lote.nome });

        // rawInput está armazenado temporariamente no strategy.processos ou em metadata
        // O rawInput foi processado pelo handler no main.ts antes de criar o lote
        // A estratégia já foi gerada no handler; aqui só emitimos o HITL

        await this.transitionTo('strategy_pending');
        this.emitEvent('strategy_ready', { strategy: lote.strategy });
        this.emitHITL('strategy', lote.strategy);
    }

    // ════════════════════════════════════════════════════════════════
    // INTERNAL: Wave Execution
    // ════════════════════════════════════════════════════════════════

    private async createWaves(strategy: StrategyPacket): Promise<void> {
        const processos = strategy.processos;
        const waveSize = strategy.waveSize;
        const waves: Wave[] = [];

        for (let i = 0; i < processos.length; i += waveSize) {
            const slice = processos.slice(i, i + waveSize);
            waves.push({
                index: waves.length,
                processoIds: slice.map((_, j) => `p${i + j}`),
                items: [],
                status: 'pending',
            });
        }

        await getLoteStore().updateLote(this.loteId, {
            waves,
            currentWave: 0,
            totalProcessos: processos.length,
        });

        console.log(`[Pipeline] ${waves.length} waves criadas (${waveSize}/wave, ${processos.length} processos)`);
    }

    private async runNextWave(): Promise<void> {
        const lote = this.getLote();
        if (!lote) return;

        const waveIndex = lote.currentWave;
        const wave = lote.waves[waveIndex];
        if (!wave) return;

        await this.transitionTo('producing');
        await getLoteStore().updateWave(this.loteId, waveIndex, {
            status: 'running',
            startedAt: new Date().toISOString(),
        });
        this.emitEvent('wave_started', { waveIndex, total: wave.processoIds.length });

        // Garantir outputDir existe
        const outputDir = lote.outputDir;
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Coletar HTMLs de waves anteriores para anti-repetição
        const previousHtmls = this.collectPreviousHtmls(lote, waveIndex);

        // Processos desta wave
        const start = waveIndex * lote.strategy.waveSize;
        const processos = lote.strategy.processos.slice(start, start + wave.processoIds.length);

        // Executar workers com concurrency limit
        const results = await this.runWorkersParallel(
            processos, lote.strategy, previousHtmls, outputDir, start,
        );

        if (this.abort.signal.aborted) return;

        // Auditar wave
        const audit = await auditWave(waveIndex, results, lote.strategy);

        // Salvar resultados
        await getLoteStore().updateWave(this.loteId, waveIndex, {
            items: results,
            status: 'review',
            audit,
            completedAt: new Date().toISOString(),
        });

        // Transição para review
        await this.transitionTo('wave_review');
        this.emitEvent('wave_completed', { waveIndex });
        this.emitEvent('audit_ready', { waveIndex, audit });
        this.emitHITL('wave_audit', audit);
    }

    private async runWorkersParallel(
        processos: ProcessoInput[],
        strategy: StrategyPacket,
        previousHtmls: string[],
        outputDir: string,
        startIndex: number,
    ): Promise<WorkerResult[]> {
        const results: WorkerResult[] = [];
        const executing = new Set<Promise<void>>();
        const allPreviousHtmls = [...previousHtmls]; // Acumula durante a wave

        for (let i = 0; i < processos.length; i++) {
            if (this.abort.signal.aborted) break;

            const processo = processos[i]!;
            const workerIndex = startIndex + i;

            const p = (async () => {
                const result = await runWorker(
                    processo, strategy, allPreviousHtmls.slice(-3),
                    outputDir, workerIndex, this.abort.signal,
                    (step) => {
                        this.emitEvent('worker_reasoning_step', {
                            workerIndex, numero: processo.numero, step,
                        });
                    },
                );

                results.push(result);

                // Acumula HTML para diff das próximas
                if (result.status !== 'failed' && result.peticao) {
                    allPreviousHtmls.push(result.peticao);
                }

                this.emitEvent(
                    result.status === 'failed' ? 'worker_failed' : 'worker_completed',
                    { workerIndex, numero: processo.numero, diffScore: result.diffScore, status: result.status },
                );
            })();

            executing.add(p);
            p.finally(() => executing.delete(p));

            if (executing.size >= MAX_CONCURRENT_WORKERS) {
                await Promise.race(executing);
            }
        }

        await Promise.all(executing);
        return results;
    }

    // ════════════════════════════════════════════════════════════════
    // INTERNAL: Redraft
    // ════════════════════════════════════════════════════════════════

    private async runRedrafts(waveIndex: number, itemIds: string[]): Promise<void> {
        const lote = this.getLote();
        if (!lote) return;

        await this.transitionTo('redrafting');
        this.emitEvent('redraft_started', { waveIndex, itemIds });

        const wave = lote.waves[waveIndex];
        if (!wave) return;

        const previousHtmls = this.collectPreviousHtmls(lote, waveIndex + 1);

        for (const itemId of itemIds) {
            if (this.abort.signal.aborted) break;

            const itemIndex = wave.items.findIndex(r => r.processoId === itemId);
            if (itemIndex < 0) continue;

            const originalItem = wave.items[itemIndex]!;
            const processoIndex = parseInt(itemId.replace('p', ''), 10);
            const processo = lote.strategy.processos[processoIndex];
            if (!processo) continue;

            // Re-gerar com temperature mais alta
            const result = await runWorker(
                processo, lote.strategy, previousHtmls.slice(-3),
                lote.outputDir, processoIndex, this.abort.signal,
                (step) => {
                    this.emitEvent('worker_reasoning_step', {
                        workerIndex: processoIndex, numero: processo.numero, step,
                    });
                },
            );

            // Substituir no wave
            wave.items[itemIndex] = result;
            if (result.peticao) previousHtmls.push(result.peticao);
        }

        // Re-auditar
        const audit = await auditWave(waveIndex, wave.items, lote.strategy);
        await getLoteStore().updateWave(this.loteId, waveIndex, {
            items: wave.items,
            status: 'review',
            audit,
        });

        await this.transitionTo('wave_review');
        this.emitEvent('redraft_completed', { waveIndex });
        this.emitEvent('audit_ready', { waveIndex, audit });
        this.emitHITL('wave_audit', audit);
    }

    // ════════════════════════════════════════════════════════════════
    // INTERNAL: Protocol
    // ════════════════════════════════════════════════════════════════

    private async runProtocol(): Promise<void> {
        const lote = this.getLote();
        if (!lote) return;

        // Lazy import para evitar dependência circular
        const { protocolAll } = await import('./protocol-queue');

        const allItems = lote.waves
            .filter(w => w.status === 'approved')
            .flatMap(w => w.items)
            .filter(i => i.status === 'completed');

        const results = await protocolAll(
            allItems,
            lote.strategy,
            (result) => this.emitEvent('protocol_item', result),
            this.abort.signal,
        );

        await getLoteStore().updateLote(this.loteId, { protocolResults: results });
        await this.transitionTo('completed');
        this.emitEvent('protocol_completed', { results });
        this.emitEvent('lote_completed', { totalProtocoled: results.filter(r => r.success).length });

        // Notificar
        try {
            const { notify } = await import('../notifications');
            await notify({
                title: `Lote "${lote.nome}" concluído`,
                body: `${results.filter(r => r.success).length}/${results.length} protocoladas com sucesso.`,
                channels: ['toast', 'telegram', 'badge'],
                urgency: 'normal',
            });
        } catch { /* ignore */ }
    }

    // ════════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════════

    private getLote(): BatchLote | null {
        return getLoteStore().getLote(this.loteId);
    }

    private async transitionTo(status: LoteStatus): Promise<void> {
        await getLoteStore().setStatus(this.loteId, status);
        console.log(`[Pipeline ${this.loteId.substring(0, 8)}] → ${status}`);
    }

    private emitEvent(type: BatchEventType, data?: any): void {
        const event: BatchEvent = {
            type,
            loteId: this.loteId,
            data,
            timestamp: new Date().toISOString(),
        };
        this.emit('event', event);
    }

    private emitHITL(checkpoint: HITLCheckpoint, payload: any): void {
        const requestId = randomUUID().substring(0, 8);
        this.emitEvent('hitl_request', { checkpoint, requestId, payload });

        // Enviar pro Telegram também
        this.sendTelegramHITL(checkpoint, payload, requestId).catch(() => {});
    }

    private async sendTelegramHITL(checkpoint: HITLCheckpoint, payload: any, requestId: string): Promise<void> {
        try {
            const { sendHITLRequest } = await import('./telegram-hitl');
            await sendHITLRequest(checkpoint, this.loteId, payload, requestId);
        } catch {
            // Telegram não configurado — ok
        }
    }

    private emitError(message: string): void {
        this.emitEvent('lote_error', { error: message });
    }

    private collectPreviousHtmls(lote: BatchLote, upToWave: number): string[] {
        const htmls: string[] = [];
        for (let i = 0; i < upToWave && i < lote.waves.length; i++) {
            for (const item of lote.waves[i]!.items) {
                if (item.peticao) htmls.push(item.peticao);
            }
        }
        return htmls;
    }

    private getProtocolSummary(lote: BatchLote): any {
        const allItems = lote.waves
            .filter(w => w.status === 'approved')
            .flatMap(w => w.items)
            .filter(i => i.status === 'completed');

        return {
            totalItems: allItems.length,
            processos: allItems.map(i => ({ numero: i.numero, partes: i.partes })),
        };
    }
}

// ════════════════════════════════════════════════════════════════════
// Factory: Cria lote + pipeline
// ════════════════════════════════════════════════════════════════════

export interface CreateBatchParams {
    rawInput: string;
    nome: string;
    tipoPeticao?: string;
    tese?: string;
    tribunal?: string;
    tom?: string;
    userInstructions?: string;
}

export async function createBatchLote(
    params: CreateBatchParams,
): Promise<{ lote: BatchLote; pipeline: BatchPipeline }> {
    // 1. Estrategista analisa input (com dados estruturados do formulário)
    const strategy = await analyzeAndPropose(params.rawInput, {
        tipoPeticao: params.tipoPeticao,
        tese: params.tese,
        tribunal: params.tribunal,
        tom: params.tom,
        userInstructions: params.userInstructions,
    });

    // 2. Cria output dir
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const outputDir = path.join(
        os.homedir(), 'Documents', 'Lex', 'Lotes',
        `${strategy.tipoPeticao}_${timestamp}`
    );

    // 3. Persiste lote
    const lote = await getLoteStore().addLote({
        nome: params.nome,
        strategy,
        status: 'created',
        waves: [],
        currentWave: 0,
        totalProcessos: strategy.processos.length,
        outputDir,
    });

    // 4. Cria pipeline
    const pipeline = new BatchPipeline(lote.id);

    return { lote, pipeline };
}
