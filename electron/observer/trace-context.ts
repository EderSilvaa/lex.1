/**
 * Observer — Trace Context
 *
 * AsyncLocalStorage que propaga `traceId` por toda a cadeia async sem precisar
 * passar parâmetros explicitamente. Uso:
 *
 *   await withTrace({ traceId: randomId(), goal: 'consultar processo X' }, async () => {
 *       // qualquer mcp.callTool aqui dentro grava Observation com esse traceId,
 *       // mesmo que chame outros módulos, promises, etc.
 *   });
 *
 * AsyncLocalStorage é feature nativa do Node (desde v13) — preserva contexto
 * através de await/promises sem monkey-patching. A aderência é implícita.
 *
 * Quem inicia uma trace: agent/loop.ts (por run do agente), Orchestrator
 * (por goal), ou o pje_browser_use (por task). Chamadas fora de escopo
 * têm traceId=null (aceitável — a correlação é best-effort).
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface TraceContext {
    /** UUID curto. Vai em Observation.traceId e em edges.data.traceId. */
    traceId: string;
    /** Descrição livre do que originou a trace (ex: task do usuário). */
    goal: string;
    /** Epoch ms de quando a trace começou. */
    startedAt: number;
    /** Opcional — id de sessão do agente, se aplicável. */
    sessionId?: string;
}

const storage = new AsyncLocalStorage<TraceContext>();

/** Retorna a trace ativa no escopo atual, ou null. */
export function currentTrace(): TraceContext | null {
    return storage.getStore() || null;
}

/** Retorna só o traceId ativo, ou null. Atalho pros consumidores. */
export function currentTraceId(): string | null {
    return storage.getStore()?.traceId || null;
}

/**
 * Cria uma nova trace e executa fn dentro do escopo. Toda Observation
 * gerada por chamadas MCP dentro de fn (inclusive em promises filhas)
 * herda o traceId automaticamente.
 *
 * Se já houver trace ativa, cria uma sub-trace (novo id mas mantém goal pai).
 */
export async function withTrace<T>(
    init: Partial<TraceContext> & { goal: string },
    fn: () => Promise<T>,
): Promise<T> {
    const ctx: TraceContext = {
        traceId: init.traceId || randomUUID(),
        goal: init.goal,
        startedAt: init.startedAt || Date.now(),
        sessionId: init.sessionId,
    };
    return storage.run(ctx, fn);
}

/**
 * Variante síncrona — raro, mas útil em init code. Para uso assíncrono
 * prefira `withTrace`.
 */
export function withTraceSync<T>(
    init: Partial<TraceContext> & { goal: string },
    fn: () => T,
): T {
    const ctx: TraceContext = {
        traceId: init.traceId || randomUUID(),
        goal: init.goal,
        startedAt: init.startedAt || Date.now(),
        sessionId: init.sessionId,
    };
    return storage.run(ctx, fn);
}
