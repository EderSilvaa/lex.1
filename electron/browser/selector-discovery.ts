/**
 * Selector Discovery — heurística para encontrar elementos sem seletor conhecido.
 *
 * Roda DENTRO do browser via page.evaluate(), zero LLM.
 * Scoring: text match (0.40) + role match (0.20) + ID/name hint (0.25) + visibility (0.15)
 */

import type { Page } from 'playwright-core';

// ── Types ──────────────────────────────────────────────────────────

export interface DiscoveryCandidate {
    selector: string;
    score: number;
    reason: string;
}

// ── Keywords por context ───────────────────────────────────────────

const CONTEXT_KEYWORDS: Record<string, string[]> = {
    campo_numero_processo: ['processo', 'numero', 'numprocesso', 'nrprocesso'],
    botao_pesquisar: ['pesquisar', 'buscar', 'consultar', 'search'],
    aba_movimentacoes: ['movimentac', 'andamento', 'timeline'],
    aba_documentos: ['documento', 'peca', 'anexo'],
    container_movimentacoes: ['movimentac', 'andamento', 'timeline'],
    container_documentos: ['documento', 'peca', 'anexo'],
};

/** Retorna keywords para um context (suporta contexts dinâmicos como "campo_jurisdicao") */
function getKeywords(context: string): string[] {
    const normalized = context
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (CONTEXT_KEYWORDS[normalized]) return CONTEXT_KEYWORDS[normalized];

    // Context dinâmico: "campo_jurisdicao" → ["jurisdicao"]
    const parts = normalized.split('_').filter((p) => p.length > 2 && p !== 'campo' && p !== 'botao' && p !== 'aba' && p !== 'container');
    return parts.length > 0 ? parts : [normalized];
}

// ── Discovery ──────────────────────────────────────────────────────

/**
 * Descobre seletores candidatos via heurística (sem LLM).
 * Retorna top 3 candidatos com score >= 0.4.
 */
export async function discoverSelector(
    page: Page,
    context: string,
    targetText?: string,
    targetRole?: string
): Promise<DiscoveryCandidate[]> {
    const keywords = getKeywords(context);

    // Tenta em todos os frames (main + iframes)
    const allCandidates: DiscoveryCandidate[] = [];

    for (const frame of page.frames()) {
        try {
            const candidates = await frame.evaluate(
                ({
                    kw,
                    tText,
                    tRole,
                }: {
                    kw: string[];
                    tText: string | undefined;
                    tRole: string | undefined;
                }) => {
                    // Normaliza sem acentos (browser-side)
                    function norm(s: string): string {
                        return s
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '');
                    }

                    const interactiveSel = 'input,textarea,select,button,[role="button"],[role="tab"],a[href],li[role="tab"]';
                    const elements = document.querySelectorAll(interactiveSel);
                    const results: { selector: string; score: number; reason: string }[] = [];

                    elements.forEach((el) => {
                        const htmlEl = el as HTMLElement;
                        const rect = htmlEl.getBoundingClientRect();

                        // ── Visibility score (0.15) ──
                        let visScore = 0;
                        if (rect.width > 10 && rect.height > 10) {
                            visScore = 0.15;
                        } else if (rect.width > 0 && rect.height > 0) {
                            visScore = 0.07;
                        }

                        // ── Text match score (0.40) ──
                        let textScore = 0;
                        let textReason = '';
                        const textContent = norm(htmlEl.textContent || '');
                        const placeholder = norm((htmlEl as HTMLInputElement).placeholder || '');
                        const ariaLabel = norm(htmlEl.getAttribute('aria-label') || '');
                        const title = norm(htmlEl.getAttribute('title') || '');
                        const allText = [textContent, placeholder, ariaLabel, title].join(' ');

                        if (tText) {
                            const normTarget = norm(tText);
                            if (allText.includes(normTarget)) {
                                textScore = 0.40;
                                textReason = `text match: '${tText}'`;
                            } else {
                                // Partial: qualquer keyword do target
                                const targetWords = normTarget.split(/\s+/).filter((w) => w.length > 2);
                                const matched = targetWords.filter((w) => allText.includes(w));
                                if (matched.length > 0) {
                                    textScore = 0.20 * (matched.length / targetWords.length);
                                    textReason = `partial text: '${matched.join(', ')}'`;
                                }
                            }
                        }

                        // ── Role match score (0.20) ──
                        let roleScore = 0;
                        if (tRole) {
                            const tag = htmlEl.tagName.toLowerCase();
                            const type = (htmlEl as HTMLInputElement).type || '';
                            const role = htmlEl.getAttribute('role') || '';

                            const roleMap: Record<string, string[]> = {
                                input: ['input', 'textarea'],
                                button: ['button', 'input'],
                                tab: ['a', 'li', 'button'],
                                link: ['a'],
                            };

                            const expected = roleMap[tRole] || [tRole];
                            if (expected.includes(tag)) {
                                roleScore = 0.20;
                            } else if (role === tRole || (tRole === 'button' && type === 'submit')) {
                                roleScore = 0.20;
                            }
                        }

                        // ── ID/name hint score (0.25) ──
                        let idScore = 0;
                        let idReason = '';
                        const id = norm(htmlEl.id || '');
                        const name = norm((htmlEl as HTMLInputElement).name || '');
                        const idName = `${id} ${name}`;

                        for (const keyword of kw) {
                            if (idName.includes(norm(keyword))) {
                                idScore = 0.25;
                                idReason = `id/name hint: '${keyword}'`;
                                break;
                            }
                        }

                        // ── Total ──
                        const total = textScore + roleScore + idScore + visScore;
                        if (total < 0.4) return;

                        // Constrói seletor
                        const tagName = htmlEl.tagName.toLowerCase();
                        let selector: string;
                        if (htmlEl.id) {
                            selector = `#${CSS.escape(htmlEl.id)}`;
                        } else if ((htmlEl as HTMLInputElement).name) {
                            selector = `${tagName}[name="${(htmlEl as HTMLInputElement).name}"]`;
                        } else {
                            // Fallback: tag + texto
                            const shortText = (htmlEl.textContent || '').trim().slice(0, 30);
                            selector = shortText
                                ? `${tagName}:has-text("${shortText.replace(/"/g, '\\"')}")`
                                : tagName;
                        }

                        const reasons = [textReason, idReason].filter(Boolean).join(', ') || 'role+visibility';

                        results.push({ selector, score: Math.round(total * 100) / 100, reason: reasons });
                    });

                    // Top 3, score desc
                    return results.sort((a, b) => b.score - a.score).slice(0, 3);
                },
                { kw: keywords, tText: targetText, tRole: targetRole }
            );

            allCandidates.push(...candidates);
        } catch {
            // Frame inacessível — ignora
        }
    }

    // Deduplica e reordena
    const seen = new Set<string>();
    const unique: DiscoveryCandidate[] = [];
    for (const c of allCandidates.sort((a, b) => b.score - a.score)) {
        if (!seen.has(c.selector)) {
            seen.add(c.selector);
            unique.push(c);
        }
    }

    const top = unique.slice(0, 3);
    if (top.length > 0) {
        console.log(`[SelectorDiscovery] ${top.length} candidato(s) para "${context}": ${top.map((c) => `${c.selector} (${c.score})`).join(', ')}`);
    }
    return top;
}
