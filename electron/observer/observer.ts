/**
 * Observer — Singleton
 *
 * API pública:
 *   initObserver(config?)  — boot, inicia worker
 *   getObserver()          — instância
 *   shutdownObserver()     — flush final, para worker
 *
 * O Observer NÃO lê o McpManager diretamente. O hook é feito em `index.ts`
 * (attachToMcpManager) — separação clara: observer é "sink", mcp-manager é "source".
 */

import { createHash } from 'crypto';
import { getBrainSafe } from '../brain';
import { ObservationQueue } from './queue';
import { writeBatchToBrain } from './writer-brain';
import { sanitizeInput, sanitizeOutputPreview } from './privacy';
import { currentTraceId } from './trace-context';

/** A cada N observações gravadas, dispara detectFlows() em background. */
const DETECT_FLOWS_EVERY = 50;
/** Throttle mínimo entre duas execuções automáticas (5 minutos). */
const DETECT_FLOWS_MIN_INTERVAL_MS = 5 * 60 * 1000;
import type {
    Enricher, Observation, ObserverConfig, ObserverMode,
} from './types';
import { DEFAULT_CONFIG } from './types';

function sha256(s: string): string {
    return createHash('sha256').update(s).digest('hex');
}

function resolveModeFromEnv(): ObserverMode {
    const raw = (process.env['LEX_OBSERVER_MODE'] || '').toLowerCase();
    if (raw === 'off' || raw === 'sample' || raw === 'full') return raw;
    return 'full';
}

class Observer {
    private config: ObserverConfig;
    private queue: ObservationQueue;
    private enrichers = new Map<string, Enricher>();
    private started = false;
    private lastBrainWarn = 0;
    private droppedForBrain = 0;
    private observationCount = 0;
    private lastDetectTriggered = 0;

    private warnBrainUnavailable(n: number): void {
        this.droppedForBrain += n;
        const now = Date.now();
        if (now - this.lastBrainWarn > 10_000) {
            this.lastBrainWarn = now;
            console.warn(`[Observer] Brain indisponível — descartado ${this.droppedForBrain} observação(ões).`);
        }
    }

    constructor(config?: Partial<ObserverConfig>) {
        this.config = {
            ...DEFAULT_CONFIG,
            mode: resolveModeFromEnv(),
            ...config,
        };
        this.queue = new ObservationQueue(this.config, (batch) => {
            const brain = getBrainSafe();
            if (!brain) {
                // Durante shutdown ou race no boot: loga (throttled) e descarta.
                this.warnBrainUnavailable(batch.length);
                return;
            }
            writeBatchToBrain(brain, batch);
        });
    }

    start(): void {
        if (this.started) return;
        if (this.config.mode === 'off') {
            console.log('[Observer] Modo OFF — não grava observações');
            return;
        }
        this.queue.start();
        this.started = true;
        console.log(
            `[Observer] Iniciado (mode=${this.config.mode}, sampleRate=${this.config.sampleRate}, queueCap=${this.config.queueCap})`,
        );
    }

    async shutdown(): Promise<void> {
        if (!this.started) return;
        await this.queue.shutdown();
        this.started = false;
    }

    registerEnricher(serverId: string, enricher: Enricher): void {
        this.enrichers.set(serverId, enricher);
    }

    getEnricher(serverId: string | null): Enricher | undefined {
        if (!serverId) return undefined;
        return this.enrichers.get(serverId);
    }

    getMode(): ObserverMode {
        return this.config.mode;
    }

    /**
     * Decide se grava essa observação baseado no modo.
     * Centraliza a política de sampling.
     */
    shouldSample(): boolean {
        if (this.config.mode === 'off') return false;
        if (this.config.mode === 'full') return true;
        return Math.random() < this.config.sampleRate;
    }

    /**
     * Grava uma observação. Fire-and-forget: encoda input, hash do output,
     * enqueue. Não bloqueia.
     */
    record(input: {
        server: string;
        tool: string;
        inputArgs: Record<string, unknown>;
        output: string;
        durationMs: number;
        success: boolean;
        error: string | null;
        before: Observation['before'];
        after: Observation['after'];
    }): void {
        if (!this.started) return;
        if (!this.shouldSample()) return;

        const outputStr = input.output ?? '';
        const sanitizedInput = sanitizeInput(input.inputArgs) as Record<string, unknown>;
        const preview = sanitizeOutputPreview(outputStr.slice(0, 500));
        const obs: Observation = {
            ts: Date.now(),
            server: input.server,
            tool: input.tool,
            input: sanitizedInput,
            outputPreview: preview,
            outputHash: outputStr ? sha256(outputStr) : '',
            outputSize: outputStr.length,
            durationMs: input.durationMs,
            success: input.success,
            error: input.error,
            before: input.before,
            after: input.after,
            traceId: currentTraceId(),
        };

        this.queue.enqueue(obs);
        this.observationCount += 1;
        this.maybeTriggerDetectFlows();
    }

    /**
     * Se acumulou DETECT_FLOWS_EVERY observações desde a última detecção E
     * passou tempo mínimo desde o último trigger, dispara detectFlows em
     * background. Fire-and-forget — não bloqueia a gravação.
     */
    private maybeTriggerDetectFlows(): void {
        if (this.observationCount % DETECT_FLOWS_EVERY !== 0) return;
        const now = Date.now();
        if (now - this.lastDetectTriggered < DETECT_FLOWS_MIN_INTERVAL_MS) return;
        this.lastDetectTriggered = now;

        // Delay pequeno: deixa o batch atual drenar antes de varrer o grafo.
        setTimeout(() => {
            void this.runBackgroundDetect();
        }, 2000);
    }

    private async runBackgroundDetect(): Promise<void> {
        try {
            const brain = getBrainSafe();
            if (!brain) return;
            const { detectFlows } = await import('../brain/flow-detector');
            const report = detectFlows(brain);
            if (report.flowsCreated > 0 || report.flowsUpdated > 0) {
                console.log(
                    `[Observer] Auto-detect flows: ${report.flowsCreated} novos, ${report.flowsUpdated} atualizados`,
                );
            }
        } catch (err: any) {
            console.warn('[Observer] detectFlows falhou:', err?.message || err);
        }
    }

    stats(): { queueSize: number; dropped: number; mode: ObserverMode } {
        return {
            queueSize: this.queue.size(),
            dropped: this.queue.droppedCount(),
            mode: this.config.mode,
        };
    }
}

let singleton: Observer | null = null;

export function initObserver(config?: Partial<ObserverConfig>): Observer {
    if (singleton) return singleton;
    singleton = new Observer(config);
    singleton.start();
    return singleton;
}

export function getObserver(): Observer | null {
    return singleton;
}

export async function shutdownObserver(): Promise<void> {
    if (!singleton) return;
    await singleton.shutdown();
    singleton = null;
}
