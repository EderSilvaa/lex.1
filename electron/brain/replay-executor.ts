/**
 * Brain — Replay Executor
 *
 * Ponte entre o planner (`replay-engine`) e o McpManager. O skill
 * `pje_browser_use` chama `tryReplay()` ANTES de acionar o vision loop:
 *
 *   - achou plano confiável? executa cada step via mcp.callTool().
 *   - validou o domHash pós-ação? continua; não bateu? aborta e cai em vision.
 *   - final? retorna resumo estruturado e registra outcome no grafo.
 *
 * O executor não decide quando usar vision — isso é do skill. Ele só
 * responde "consegui? sim/não, e aqui está o resultado".
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getBrainSafe } from '.';
import type { BrainStore } from './brain-store';
import { recordReplayOutcome, findReplayPlan, type ReplayPlan, type ReplayStep } from './replay-engine';
import { EXPLOIT_THRESHOLD } from './scoring';
import { invalidatePageState } from './staleness';
import { fillFromGoal } from './slot-filler';

export interface TryReplayArgs {
    tribunal?: string;
    pjeContext?: string;
    environment?: unknown;
    /** Goal em linguagem natural — habilita fallback semântico no findReplayPlan. */
    goal?: string;
    /** Callback opcional para eventos de execução (UI). */
    onEvent?: (evt: ReplayEvent) => void;
    /** Threshold mínimo do plano. Default: EXPLOIT_THRESHOLD. */
    minConfidence?: number;
    /**
     * Se true, apenas ENCONTRA o plano e retorna sem executar nenhum step.
     * Usado pra preview/confirm antes da execução real.
     */
    dryRun?: boolean;
}

export type ReplayEvent =
    | { type: 'plan_found'; plan: ReplayPlan }
    | { type: 'plan_missing' }
    | { type: 'step_start'; index: number; step: ReplayStep }
    | { type: 'step_end'; index: number; durationMs: number; outputSize: number }
    | { type: 'step_mismatch'; index: number; expected: string; actual: string }
    | { type: 'step_error'; index: number; error: string }
    | { type: 'step_retry'; index: number; selector: string; attempt: number }
    | { type: 'step_waitfor'; index: number; selector: string; timeoutMs: number }
    | { type: 'slots_unresolved'; index: number; labels: string[] }
    | { type: 'screenshot'; index: number; filePath: string }
    | { type: 'done'; success: boolean; summary: string };

export interface TryReplayResult {
    /** false = não encontrou plano ou Brain não pronto; true = tentou executar. */
    tried: boolean;
    success: boolean;
    plan?: ReplayPlan;
    summary: string;
    /** Output agregado (concat dos outputs das tools). */
    aggregatedOutput: string;
    /** Índice do step onde falhou, se aplicável. */
    failedAtStep?: number;
    error?: string;
}

interface McpLike {
    callTool(name: string, args: Record<string, unknown>): Promise<string>;
}

interface EnricherLike {
    after?(ctx: { tool: string; server: string; args: Record<string, unknown>; output: string; success: boolean }): Promise<{ domHash?: string } | null>;
}

/**
 * Tenta executar o melhor plano de replay. Se não houver plano, retorna
 * `{ tried: false }` — caller deve cair em vision. Se há plano mas falha
 * durante execução, `tried: true, success: false` + marca page_state como
 * possivelmente obsoleto.
 */
export async function tryReplay(
    mcp: McpLike,
    args: TryReplayArgs,
    enricher?: EnricherLike,
): Promise<TryReplayResult> {
    const brain = getBrainSafe();
    if (!brain) {
        return skipped('brain não inicializado');
    }

    const plan = findReplayPlan(brain, {
        tribunal: args.tribunal,
        pjeContext: args.pjeContext,
        environment: args.environment,
        goal: args.goal,
        minConfidence: args.minConfidence ?? EXPLOIT_THRESHOLD,
    });

    if (!plan) {
        args.onEvent?.({ type: 'plan_missing' });
        return skipped('nenhum plano confiável encontrado');
    }

    args.onEvent?.({ type: 'plan_found', plan });

    // Dry-run: só preview. Caller decide se confirma pra re-chamar sem dryRun.
    if (args.dryRun) {
        return {
            tried: true,
            success: false,
            plan,
            summary: `preview: ${plan.summary}`,
            aggregatedOutput: '',
        };
    }

    const outputs: string[] = [];
    let failedAtStep: number | undefined;
    let errorMsg: string | undefined;
    const traceDir = ensureTraceDir();

    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]!;
        args.onEvent?.({ type: 'step_start', index: i, step });

        // 1) Slot-filling: o grafo guarda placeholders ([CPF], [VALOR], ...);
        // aqui substitui pelos valores do goal atual. Se algum slot não foi
        // resolvido, emite evento mas SEGUE — caller decide se é crítico.
        let filledInput: Record<string, unknown> = step.input;
        if (args.goal) {
            const { filled, unresolved } = fillFromGoal(step.input, args.goal);
            filledInput = filled;
            if (unresolved.length > 0) {
                args.onEvent?.({ type: 'slots_unresolved', index: i, labels: unresolved });
            }
        }

        // 2) waitFor: antes de click/fill, aguarda o seletor aparecer com
        // timeout adaptativo (p95 * 2, clamp 3-30s). Se o MCP não tiver
        // wait_for_selector, a chamada erra e só seguimos.
        const primarySel = step.primarySelector;
        if (primarySel && isInteractiveTool(step.tool)) {
            const waitTimeout = step.adaptiveTimeoutMs ?? 5000;
            args.onEvent?.({ type: 'step_waitfor', index: i, selector: primarySel, timeoutMs: waitTimeout });
            await safeWait(mcp, step.tool, primarySel, waitTimeout);
        }

        // 3) Tenta seletor primário; se falhar, itera alternativos (waterfall).
        const candidates = [primarySel, ...(step.alternateSelectors || [])]
            .filter((s): s is string => typeof s === 'string' && s.length > 0);
        const selectorsToTry = candidates.length > 0 ? candidates : [null];

        let output = '';
        let stepError: string | undefined;
        const t0 = Date.now();

        for (let attempt = 0; attempt < selectorsToTry.length; attempt++) {
            const sel = selectorsToTry[attempt]!;
            const tryInput = sel !== null
                ? applySelector(filledInput, sel)
                : filledInput;

            if (attempt > 0) {
                args.onEvent?.({ type: 'step_retry', index: i, selector: sel ?? '(noop)', attempt });
            }

            try {
                output = await mcp.callTool(step.tool, tryInput);
                stepError = undefined;
                // Reforça selector ao suceder no alternate (aprende qual funciona).
                if (sel && attempt > 0 && step.stateTribunal && step.stateContext) {
                    try { brain.recordSelectorSuccess(step.stateTribunal, step.stateContext, sel, { environment: step.stateEnvironment }); }
                    catch { /* ok */ }
                }
                break;
            } catch (err: any) {
                stepError = err?.message ? String(err.message) : String(err);
                if (sel && step.stateTribunal && step.stateContext) {
                    try { brain.recordSelectorFailure(step.stateTribunal, step.stateContext, sel, { environment: step.stateEnvironment }); }
                    catch { /* ok */ }
                }
                // tenta próximo alternate
            }
        }

        if (stepError) {
            errorMsg = stepError;
            failedAtStep = i;
            args.onEvent?.({ type: 'step_error', index: i, error: stepError });
            await captureScreenshotSafe(mcp, traceDir, i, args.onEvent);
            break;
        }

        const durationMs = Date.now() - t0;
        outputs.push(output);
        args.onEvent?.({ type: 'step_end', index: i, durationMs, outputSize: output.length });

        // 4) Valida domHash resultante. Labels canonicos (`TJPA:norm:*`) usam
        // hash de rota/contexto, entao a comparacao DOM precisa vir do data.
        if (step.expectedNextStateId && enricher?.after) {
            const observed = await safeAfter(enricher, {
                tool: step.tool,
                server: inferServer(step.tool),
                args: filledInput,
                output,
                success: true,
            });
            const expectedHash = extractExpectedDomHash(step);
            const actualHash = (observed?.domHash || '').slice(0, 12);
            if (expectedHash && actualHash && expectedHash !== actualHash) {
                errorMsg = `domHash esperado ${expectedHash} != ${actualHash}`;
                failedAtStep = i;
                args.onEvent?.({
                    type: 'step_mismatch',
                    index: i,
                    expected: expectedHash,
                    actual: actualHash,
                });
                await captureScreenshotSafe(mcp, traceDir, i, args.onEvent);
                markExpectedStateStale(brain, step.expectedNextStateId);
                break;
            }
        }
    }

    const success = failedAtStep === undefined;
    recordReplayOutcome(brain, plan, { success, failedAtStep });

    const aggregatedOutput = outputs.join('\n\n');
    const summary = success
        ? `${plan.summary} — OK em ${plan.steps.length} steps.`
        : `${plan.summary} — falhou no step ${(failedAtStep ?? 0) + 1}/${plan.steps.length}: ${errorMsg || 'unknown'}`;

    args.onEvent?.({ type: 'done', success, summary });

    return {
        tried: true,
        success,
        plan,
        summary,
        aggregatedOutput,
        failedAtStep,
        error: errorMsg,
    };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function skipped(reason: string): TryReplayResult {
    return {
        tried: false,
        success: false,
        summary: `replay pulado: ${reason}`,
        aggregatedOutput: '',
    };
}

function inferServer(toolName: string): string {
    const idx = toolName.indexOf('__');
    return idx === -1 ? 'unknown' : toolName.slice(0, idx);
}

function extractExpectedDomHash(step: ReplayStep): string | null {
    if (step.expectedNextDomHash) return String(step.expectedNextDomHash).slice(0, 12);
    const label = step.expectedNextLabel;
    if (!label || label.includes(':norm:')) return null;
    const parts = label.split(':');
    return parts.length >= 2 ? parts[parts.length - 1]!.slice(0, 12) : null;
}

async function safeAfter(
    enricher: EnricherLike,
    ctx: { tool: string; server: string; args: Record<string, unknown>; output: string; success: boolean },
): Promise<{ domHash?: string } | null> {
    try {
        const r = await enricher.after?.(ctx);
        return r || null;
    } catch {
        return null;
    }
}

function markExpectedStateStale(brain: BrainStore, stateId: string): void {
    try {
        invalidatePageState(brain, stateId);
    } catch {
        /* ignore — staleness é best-effort */
    }
}

// ── Heurísticas de tool ──────────────────────────────────────────────────────

/** Tools que operam em elemento específico — merecem waitFor antes de agir. */
function isInteractiveTool(tool: string): boolean {
    const t = tool.toLowerCase();
    return /click|fill|type|select|hover|check|press/.test(t);
}

/** Substitui o seletor em chaves comuns do input sem perder os demais campos. */
function applySelector(input: Record<string, unknown>, selector: string): Record<string, unknown> {
    const out: Record<string, unknown> = { ...input };
    const keys = ['selector', 'css', 'css_selector', 'target'];
    let replaced = false;
    for (const k of keys) {
        if (k in out) {
            out[k] = selector;
            replaced = true;
            break;
        }
    }
    // Se não tinha nenhuma chave conhecida, injeta em 'selector' como padrão.
    if (!replaced) out['selector'] = selector;
    return out;
}

/**
 * Tenta um wait_for_selector no mesmo server do tool. Best-effort: se o MCP
 * não expõe essa tool, o catch engole silenciosamente e o replay continua.
 */
async function safeWait(
    mcp: McpLike,
    referenceTool: string,
    selector: string,
    timeoutMs: number,
): Promise<void> {
    const server = inferServer(referenceTool);
    const candidates = [
        `${server}__wait_for_selector`,
        `${server}__wait_for`,
        `${server}__wait`,
    ];
    for (const toolName of candidates) {
        try {
            await mcp.callTool(toolName, { selector, timeout: timeoutMs });
            return;
        } catch {
            // próximo candidato / desiste silenciosamente
        }
    }
}

// ── Screenshot em falha ──────────────────────────────────────────────────────

function ensureTraceDir(): string {
    const dir = path.join(os.homedir(), '.lex', 'replay-screenshots', String(Date.now()));
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ok */ }
    return dir;
}

/**
 * Captura via Playwright direto (getActivePage), não via MCP. Mais confiável
 * pra debug e não depende do MCP server expor screenshot tool.
 */
async function captureScreenshotSafe(
    _mcp: McpLike,
    dir: string,
    stepIndex: number,
    onEvent?: (evt: ReplayEvent) => void,
): Promise<void> {
    try {
        const { getActivePage } = await import('../browser-manager');
        const page = getActivePage();
        if (!page) return;
        const file = path.join(dir, `step-${String(stepIndex).padStart(2, '0')}.png`);
        await page.screenshot({ path: file, fullPage: false });
        onEvent?.({ type: 'screenshot', index: stepIndex, filePath: file });
    } catch {
        /* screenshot é debug — falhas são silenciadas */
    }
}
