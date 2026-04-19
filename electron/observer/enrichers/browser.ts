/**
 * Browser enricher — captura URL + dom_hash_estrutural antes/depois
 * de cada tool `browser__*`.
 *
 * O hash estrutural ignora textos dinâmicos, atributos voláteis e valores —
 * mantém só a árvore de tags + classes. Assim dois loads da mesma página
 * resultam no mesmo hash (dedupe estável no grafo do Brain).
 *
 * Overhead por tool: ~50-200ms (DOM walk via Playwright evaluate).
 * Se o browser não estiver inicializado, retorna null sem erro.
 */

import { createHash } from 'crypto';
import type { Page } from 'playwright';
import { getActivePage } from '../../browser-manager';
import { normalizePageState } from '../../brain/normalizer';
import type { Enricher, ObservationBefore, ObservationAfter } from '../types';

/**
 * Script que roda no contexto da página. Serializa a estrutura DOM
 * ignorando texto e atributos dinâmicos.
 */
const DOM_STRUCTURE_SCRIPT = `
(function structuralDom() {
    const IGNORE_ATTRS = new Set([
        'id', 'data-timestamp', 'data-nonce', 'data-csrf',
        'data-reactid', 'data-react-checksum', 'nonce',
    ]);
    const KEEP_ATTRS = ['class', 'role', 'type', 'name'];
    function visit(el) {
        if (!el || el.nodeType !== 1) return '';
        const tag = el.tagName.toLowerCase();
        const attrs = KEEP_ATTRS
            .map(a => el.hasAttribute(a) && !IGNORE_ATTRS.has(a)
                ? a + '=' + (el.getAttribute(a) || '').trim().slice(0, 60)
                : '')
            .filter(Boolean)
            .join(' ');
        const head = attrs ? tag + ' ' + attrs : tag;
        const children = Array.from(el.children).map(visit).join('');
        return '<' + head + '>' + children + '</' + tag + '>';
    }
    return visit(document.body || document.documentElement);
})()
`;

function sha256(s: string): string {
    return createHash('sha256').update(s).digest('hex');
}

function tribunalFromUrl(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        const match = host.match(/([tT]jp[a-z]{2}|tr[tf]\d+|trt-?\d+|trf-?\d+|tj[a-z]{2})/i);
        if (match && match[1]) return match[1].toUpperCase().replace('-', '');
        const parts = host.split('.');
        const pje = parts.find(p => p.includes('pje'));
        if (pje) return (parts[1] || 'unknown').toUpperCase();
        return undefined;
    } catch {
        return undefined;
    }
}

async function snapshot(page: Page): Promise<{
    url: string;
    title: string;
    domHash: string;
}> {
    const [url, title, domStruct] = await Promise.all([
        Promise.resolve(page.url()),
        page.title().catch(() => ''),
        page.evaluate(DOM_STRUCTURE_SCRIPT).catch(() => ''),
    ]);
    return {
        url,
        title,
        domHash: typeof domStruct === 'string' && domStruct.length > 0
            ? sha256(domStruct).slice(0, 32)
            : '',
    };
}

function tabsSnapshot(page: Page): Array<{ id: string; url: string }> {
    try {
        const context = page.context();
        return context.pages().map((p, idx) => ({ id: String(idx), url: p.url() }));
    } catch {
        return [];
    }
}

function inferPjeContext(url: string, toolName: string): string | undefined {
    const t = toolName.toLowerCase();
    if (url.includes('ConsultaProcesso') || url.includes('consulta')) return 'consulta';
    if (url.includes('login') || url.includes('Login')) return 'login';
    if (url.includes('painel') || url.includes('Painel')) return 'painel';
    if (t.includes('navigate')) return 'navegacao';
    if (t.includes('click')) return 'interacao';
    if (t.includes('fill') || t.includes('type')) return 'preenchimento';
    return undefined;
}

export const browserEnricher: Enricher = {
    async before(ctx): Promise<ObservationBefore | null> {
        const page = getActivePage();
        if (!page) return null;

        try {
            const snap = await snapshot(page);
            const tribunal = tribunalFromUrl(snap.url);
            const pjeContext = inferPjeContext(snap.url, ctx.tool);
            const normalized = normalizePageState({ url: snap.url, title: snap.title, tribunal, pjeContext });
            return {
                url: snap.url,
                title: snap.title,
                domHash: snap.domHash,
                ...(normalized.tribunal || tribunal ? { tribunal: normalized.tribunal || tribunal } : {}),
                ...(pjeContext ? { pjeContext } : {}),
                ...(normalized.canonicalUrl ? { canonicalUrl: normalized.canonicalUrl } : {}),
                ...(normalized.canonicalContext ? { canonicalContext: normalized.canonicalContext } : {}),
                ...(normalized.canonicalStateKey ? { canonicalStateKey: normalized.canonicalStateKey } : {}),
            };
        } catch (err: any) {
            console.warn('[Observer/browser] before falhou:', err?.message);
            return null;
        }
    },

    async after(ctx): Promise<ObservationAfter | null> {
        const page = getActivePage();
        if (!page) return null;

        try {
            const snap = await snapshot(page);
            const tribunal = tribunalFromUrl(snap.url);
            const pjeContext = inferPjeContext(snap.url, ctx.tool);
            const normalized = normalizePageState({ url: snap.url, title: snap.title, tribunal, pjeContext });
            return {
                url: snap.url,
                title: snap.title,
                domHash: snap.domHash,
                ...(normalized.tribunal || tribunal ? { tribunal: normalized.tribunal || tribunal } : {}),
                ...(pjeContext ? { pjeContext } : {}),
                ...(normalized.canonicalUrl ? { canonicalUrl: normalized.canonicalUrl } : {}),
                ...(normalized.canonicalContext ? { canonicalContext: normalized.canonicalContext } : {}),
                ...(normalized.canonicalStateKey ? { canonicalStateKey: normalized.canonicalStateKey } : {}),
                newTabs: tabsSnapshot(page),
            };
        } catch (err: any) {
            console.warn('[Observer/browser] after falhou:', err?.message);
            return null;
        }
    },
};
