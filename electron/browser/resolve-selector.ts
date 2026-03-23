/**
 * Resolve Selector — waterfall de 3 tiers para encontrar elementos.
 *
 * Tier 1: Learned (selector-memory) — seletores que já funcionaram neste tribunal
 * Tier 2: Hardcoded (array da skill) — seletores estáticos do código
 * Tier 3: Discovery (heurística) — scoring sem LLM
 *
 * Iframe-aware: tenta main frame e depois cada iframe.
 */

import type { Page, ElementHandle, Frame } from 'playwright-core';
import { lookupSelectors, recordSuccess, recordFailure } from './selector-memory';
import { discoverSelector } from './selector-discovery';

// ── Types ──────────────────────────────────────────────────────────

export interface ResolvedSelector {
    selector: string;
    source: 'learned' | 'hardcoded' | 'discovered';
}

// ── Helpers ────────────────────────────────────────────────────────

/** Tenta encontrar um elemento por seletor em todos os frames */
async function findInFrames(page: Page, selector: string): Promise<boolean> {
    // Main frame
    try {
        const el = await page.$(selector);
        if (el) return true;
    } catch { /* ignora */ }

    // Iframes
    for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        try {
            const el = await frame.$(selector);
            if (el) return true;
        } catch { /* ignora */ }
    }

    return false;
}

// ── Main ───────────────────────────────────────────────────────────

/**
 * Resolve um seletor usando waterfall de 3 tiers.
 *
 * @param page - Página Playwright
 * @param tribunal - ID do tribunal (ex: "tjpa", "trt8")
 * @param context - Contexto semântico (ex: "campo_numero_processo", "aba_movimentacoes")
 * @param hardcodedSelectors - Array de seletores estáticos da skill
 * @param targetText - Texto alvo para discovery (ex: "Movimentações")
 * @param targetRole - Role alvo para discovery (ex: "input", "button", "tab")
 * @returns ResolvedSelector ou null se nenhum seletor funcionou
 */
export async function resolveSelector(
    page: Page,
    tribunal: string,
    context: string,
    hardcodedSelectors: string[],
    targetText?: string,
    targetRole?: string
): Promise<ResolvedSelector | null> {
    // ── Tier 1: Learned ──
    const learned = lookupSelectors(tribunal, context);
    for (const sel of learned) {
        const found = await findInFrames(page, sel);
        if (found) {
            recordSuccess(tribunal, context, sel);
            console.log(`[ResolveSelector] Tier 1 (learned): "${context}" → ${sel}`);
            return { selector: sel, source: 'learned' };
        }
        recordFailure(tribunal, context, sel);
    }

    // ── Tier 2: Hardcoded ──
    for (const sel of hardcodedSelectors) {
        const found = await findInFrames(page, sel);
        if (found) {
            // Promove para learned
            recordSuccess(tribunal, context, sel);
            console.log(`[ResolveSelector] Tier 2 (hardcoded): "${context}" → ${sel}`);
            return { selector: sel, source: 'hardcoded' };
        }
    }

    // ── Tier 3: Discovery ──
    const candidates = await discoverSelector(page, context, targetText, targetRole);
    for (const candidate of candidates) {
        const found = await findInFrames(page, candidate.selector);
        if (found) {
            // NÃO faz recordSuccess aqui — espera a skill confirmar que deu certo
            console.log(`[ResolveSelector] Tier 3 (discovered): "${context}" → ${candidate.selector} (score: ${candidate.score}, ${candidate.reason})`);
            return { selector: candidate.selector, source: 'discovered' };
        }
    }

    console.log(`[ResolveSelector] Nenhum seletor encontrado para "${context}" (tribunal: ${tribunal})`);
    return null;
}

/**
 * Confirma que um seletor resolvido realmente funcionou na skill.
 * Promove selectors descobertos (Tier 3) para learned, com flag de promoção para analytics.
 * Uso: chamar após a skill confirmar sucesso com o seletor.
 */
export function confirmResolved(tribunal: string, context: string, resolved: ResolvedSelector | null): void {
    if (!resolved) return;
    if (resolved.source === 'discovered') {
        recordSuccess(tribunal, context, resolved.selector, true);
    }
}
