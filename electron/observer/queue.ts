/**
 * Observer — Fila assíncrona
 *
 * record() é fire-and-forget: empilha em buffer em memória e retorna.
 * Worker drena a fila periodicamente em batches, evitando fsync por evento.
 * Em caso de overflow (queueCap), descarta os MAIS ANTIGOS e emite warning —
 * nunca bloqueia o caller.
 */

import type { Observation, ObserverConfig } from './types';

export type FlushFn = (batch: Observation[]) => Promise<void> | void;

export class ObservationQueue {
    private buffer: Observation[] = [];
    private timer: NodeJS.Timeout | null = null;
    private flushing = false;
    private shuttingDown = false;
    private droppedTotal = 0;
    private lastDropWarn = 0;

    constructor(private cfg: ObserverConfig, private flushFn: FlushFn) { }

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => {
            // Não aguarda — flush assíncrono em background.
            void this.flush();
        }, this.cfg.flushIntervalMs);
    }

    enqueue(obs: Observation): void {
        if (this.shuttingDown) return;

        if (this.buffer.length >= this.cfg.queueCap) {
            // Descarta o mais antigo para dar lugar ao mais novo.
            this.buffer.shift();
            this.droppedTotal += 1;
            const now = Date.now();
            if (now - this.lastDropWarn > 10_000) {
                this.lastDropWarn = now;
                console.warn(
                    `[Observer] Fila cheia (${this.cfg.queueCap}) — descartando eventos antigos. Total descartado: ${this.droppedTotal}`,
                );
            }
        }
        this.buffer.push(obs);
    }

    size(): number {
        return this.buffer.length;
    }

    droppedCount(): number {
        return this.droppedTotal;
    }

    /** Dreno manual — útil no shutdown. Resolve quando buffer vazio. */
    async flush(): Promise<void> {
        if (this.flushing) return;
        if (this.buffer.length === 0) return;
        this.flushing = true;
        try {
            while (this.buffer.length > 0) {
                const batch = this.buffer.splice(0, this.cfg.flushBatchSize);
                try {
                    await this.flushFn(batch);
                } catch (err: any) {
                    // Falha do flush não deve derrubar o worker.
                    console.error('[Observer] Erro no flush:', err?.message || err);
                }
            }
        } finally {
            this.flushing = false;
        }
    }

    async shutdown(): Promise<void> {
        this.shuttingDown = true;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        await this.flush();
    }
}
