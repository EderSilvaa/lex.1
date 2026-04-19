/**
 * Observer — API pública.
 *
 * Uso típico no boot do app:
 *   const observer = initObserver();
 *   attachToMcpManager(getMcpManager());
 *
 * E no shutdown:
 *   await shutdownObserver();
 *
 * O attach envolve o callTool do McpManager SEM tocar na classe:
 * intercepta input/output, roda enricher.before/after, aplica sanitização
 * e chama observer.record() de forma fire-and-forget. A chamada original
 * ao tool continua intocada — observação é um side-channel.
 */

import { browserEnricher } from './enrichers/browser';
import { defaultEnricher } from './enrichers/default';
import { filesystemEnricher } from './enrichers/filesystem';
import { getObserver, initObserver, shutdownObserver } from './observer';
import type { Enricher, EnricherContext } from './types';

export { initObserver, getObserver, shutdownObserver } from './observer';
export type {
    Enricher,
    EnricherContext,
    Observation,
    ObservationBefore,
    ObservationAfter,
    ObserverConfig,
    ObserverMode,
} from './types';

interface McpLike {
    callTool(name: string, args: Record<string, unknown>): Promise<string>;
    getServerIdFromToolName(prefixedName: string): string | null;
}

// Guarda o callTool original por instância para evitar double-wrap.
const attached = new WeakSet<object>();

/**
 * Registra os enrichers padrão. Pode ser chamado múltiplas vezes
 * (re-registra; último ganha).
 */
export function registerDefaultEnrichers(): void {
    const obs = getObserver();
    if (!obs) return;
    obs.registerEnricher('browser', browserEnricher);
    obs.registerEnricher('filesystem', filesystemEnricher);
    // Fallback default para qualquer server sem enricher específico —
    // o Observer chama getEnricher(serverId) e cai aqui se não registrar.
    void defaultEnricher; // evita warning de unused
}

/**
 * Envolve mcp.callTool para que cada chamada gere uma Observation.
 * Idempotente: chamadas repetidas no mesmo manager são no-op.
 */
export function attachToMcpManager(mcp: McpLike): void {
    if (attached.has(mcp as object)) return;
    attached.add(mcp as object);

    const original = mcp.callTool.bind(mcp);

    mcp.callTool = async function wrappedCallTool(
        name: string,
        args: Record<string, unknown>,
    ): Promise<string> {
        const observer = getObserver();
        // Sem observer: passa direto.
        if (!observer) return original(name, args);

        const serverId = mcp.getServerIdFromToolName(name) || 'unknown';
        const enricher = observer.getEnricher(serverId);
        const ctx: EnricherContext = { tool: name, server: serverId, args };

        // before() não pode travar o caller — tem timeout implícito pela
        // natureza do Playwright evaluate; ainda assim protegido por try.
        let before = null as Awaited<ReturnType<NonNullable<Enricher['before']>>> | null;
        if (enricher?.before) {
            try {
                before = await enricher.before(ctx);
            } catch {
                before = null;
            }
        }

        const started = Date.now();
        let output = '';
        let success = false;
        let error: string | null = null;
        try {
            output = await original(name, args);
            success = true;
        } catch (err: any) {
            error = err?.message ? String(err.message) : String(err);
            throw err;
        } finally {
            const durationMs = Date.now() - started;

            let after = null as Awaited<ReturnType<NonNullable<Enricher['after']>>> | null;
            if (enricher?.after) {
                try {
                    after = await enricher.after({ ...ctx, output, success });
                } catch {
                    after = null;
                }
            }

            try {
                observer.record({
                    server: serverId,
                    tool: name,
                    inputArgs: args || {},
                    output,
                    durationMs,
                    success,
                    error,
                    before,
                    after,
                });
            } catch (recErr: any) {
                console.warn('[Observer] record() falhou:', recErr?.message || recErr);
            }
        }

        return output;
    };
}
