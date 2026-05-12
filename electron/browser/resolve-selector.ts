/**
 * Resolve Selector - waterfall de 3 tiers para encontrar elementos.
 *
 * Tier 1: learned (selector-memory)
 * Tier 2: hardcoded (skill/local code)
 * Tier 3: discovery (heuristica sem LLM)
 *
 * Iframe-aware: tenta main frame e depois iframes.
 */

import type { Page } from 'playwright-core';
import { lookupSelectors, recordSuccess, recordFailure, type SelectorLookupOptions } from './selector-memory';
import { discoverSelector } from './selector-discovery';

export interface ResolvedSelector {
    selector: string;
    source: 'learned' | 'hardcoded' | 'discovered';
}

export interface ResolveSelectorOptions extends SelectorLookupOptions {}

async function findInFrames(page: Page, selector: string): Promise<boolean> {
    try {
        const main = await page.$(selector);
        if (main) return true;
    } catch {
        // ignore
    }

    for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        try {
            const found = await frame.$(selector);
            if (found) return true;
        } catch {
            // ignore
        }
    }

    return false;
}

export async function resolveSelector(
    page: Page,
    tribunal: string,
    context: string,
    hardcodedSelectors: string[],
    targetText?: string,
    targetRole?: string,
    opts: ResolveSelectorOptions = {},
): Promise<ResolvedSelector | null> {
    const learned = lookupSelectors(tribunal, context, opts);
    for (const selector of learned) {
        const found = await findInFrames(page, selector);
        if (found) {
            recordSuccess(tribunal, context, selector, false, opts);
            console.log(`[ResolveSelector] Tier 1 (learned): "${context}" -> ${selector}`);
            return { selector, source: 'learned' };
        }
        recordFailure(tribunal, context, selector, opts);
    }

    for (const selector of hardcodedSelectors) {
        const found = await findInFrames(page, selector);
        if (found) {
            recordSuccess(tribunal, context, selector, false, opts);
            console.log(`[ResolveSelector] Tier 2 (hardcoded): "${context}" -> ${selector}`);
            return { selector, source: 'hardcoded' };
        }
    }

    const candidates = await discoverSelector(page, context, targetText, targetRole);
    for (const candidate of candidates) {
        const found = await findInFrames(page, candidate.selector);
        if (found) {
            console.log(`[ResolveSelector] Tier 3 (discovered): "${context}" -> ${candidate.selector} (score: ${candidate.score}, ${candidate.reason})`);
            return { selector: candidate.selector, source: 'discovered' };
        }
    }

    console.log(`[ResolveSelector] Nenhum seletor encontrado para "${context}" (tribunal: ${tribunal})`);
    return null;
}

export function confirmResolved(
    tribunal: string,
    context: string,
    resolved: ResolvedSelector | null,
    opts: ResolveSelectorOptions = {},
): void {
    if (!resolved) return;
    if (resolved.source === 'discovered') {
        recordSuccess(tribunal, context, resolved.selector, true, opts);
    }
}
