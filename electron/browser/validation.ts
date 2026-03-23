/**
 * Post-Action Validation — snapshot DOM antes/depois de ações browser.
 *
 * Zero LLM, <50ms. Detecta mudanças de URL, DOM, e erros novos.
 * Integrado no executor.ts para wrapar skills de ação automaticamente.
 */

import type { Page } from 'playwright-core';

// ── Types ──────────────────────────────────────────────────────────

export interface DOMSnapshot {
    url: string;
    elementCount: number;
    elementHash: string;
    errorElements: number;
    errorTexts: string[];
    timestamp: number;
}

export interface ValidationResult {
    urlChanged: boolean;
    urlBefore: string;
    urlAfter: string;
    domChanged: boolean;
    elementCountDelta: number;
    errorDetected: boolean;
    errorText: string;
    confidence: 'high' | 'medium' | 'low';
    summary: string;
}

// ── Snapshot ────────────────────────────────────────────────────────

/** Captura snapshot leve do DOM (main frame + iframes) */
export async function captureDOMSnapshot(page: Page): Promise<DOMSnapshot> {
    const url = page.url();

    const frameResults = await Promise.all(
        page.frames().map(async (frame) => {
            try {
                return await frame.evaluate(() => {
                    const interactiveSel = 'input,textarea,select,button,[role="button"],a[href]';
                    const interactives = document.querySelectorAll(interactiveSel);

                    let count = 0;
                    const ids: string[] = [];
                    interactives.forEach((el) => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            count++;
                            const id = (el as HTMLElement).id || (el as HTMLInputElement).name || '';
                            if (id) ids.push(id);
                        }
                    });

                    // Erros visíveis
                    const errorSels = '.alert-danger, .alert-error, .error, .mensagem-erro, [class*="erro"], [class*="error"], .ui-messages-error, .ui-growl-message, [id*="mensagem"][class*="erro"]';
                    const errors = document.querySelectorAll(errorSels);
                    let errorCount = 0;
                    const errorTexts: string[] = [];
                    errors.forEach((el) => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            errorCount++;
                            const text = (el.textContent || '').trim().slice(0, 150);
                            if (text) errorTexts.push(text);
                        }
                    });

                    return { count, ids, errorCount, errorTexts };
                });
            } catch {
                return { count: 0, ids: [] as string[], errorCount: 0, errorTexts: [] as string[] };
            }
        })
    );

    let totalCount = 0;
    const allIds: string[] = [];
    let totalErrors = 0;
    const allErrorTexts: string[] = [];

    for (const r of frameResults) {
        totalCount += r.count;
        allIds.push(...r.ids);
        totalErrors += r.errorCount;
        allErrorTexts.push(...r.errorTexts);
    }

    // Hash rápido: soma de charCodes dos IDs concatenados
    const idString = allIds.sort().join('|');
    let hash = 0;
    for (let i = 0; i < idString.length; i++) {
        hash = ((hash << 5) - hash + idString.charCodeAt(i)) | 0;
    }

    return {
        url,
        elementCount: totalCount,
        elementHash: hash.toString(36),
        errorElements: totalErrors,
        errorTexts: allErrorTexts.slice(0, 5),
        timestamp: Date.now(),
    };
}

// ── Validation ─────────────────────────────────────────────────────

/** Compara dois snapshots e gera resultado de validação */
export function computeValidation(
    before: DOMSnapshot,
    after: DOMSnapshot,
    _skillName: string,
    _params: Record<string, any>
): ValidationResult {
    const urlChanged = before.url !== after.url;
    const domChanged = before.elementHash !== after.elementHash;
    const delta = after.elementCount - before.elementCount;
    const newErrors = after.errorElements > before.errorElements;
    const errorText = newErrors
        ? after.errorTexts.filter((t) => !before.errorTexts.includes(t)).join('; ').slice(0, 300)
        : '';

    // Confidence
    let confidence: 'high' | 'medium' | 'low';
    if (urlChanged || Math.abs(delta) >= 3 || newErrors) {
        confidence = 'high';
    } else if (domChanged || Math.abs(delta) >= 1) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    // Summary one-liner
    const parts: string[] = [];
    if (urlChanged) parts.push('URL changed');
    if (domChanged) parts.push(`DOM changed (${delta >= 0 ? '+' : ''}${delta} elements)`);
    if (newErrors) parts.push(`ERROR: ${errorText.slice(0, 100)}`);
    if (parts.length === 0) parts.push('no visible changes');

    return {
        urlChanged,
        urlBefore: before.url,
        urlAfter: after.url,
        domChanged,
        elementCountDelta: delta,
        errorDetected: newErrors,
        errorText,
        confidence,
        summary: `${parts.join(', ')} [confidence: ${confidence}]`,
    };
}

