/**
 * Brain - Page state normalization
 *
 * Builds stable route/context fingerprints for dynamic PJe and tribunal pages.
 * The raw DOM hash is still kept, but flows can use canonical fields that are
 * less sensitive to redirects, session ids, query strings and random ids.
 */

import { createHash } from 'crypto';
import type { BrainStore } from './brain-store';
import {
    inferPjeEnvironmentContext,
    normalizePjeEnvironmentContext,
    type PjeEnvironmentContext,
} from '../pje/environment-context';

export interface NormalizedPageState {
    tribunal?: string;
    canonicalUrl?: string;
    canonicalContext?: string;
    canonicalRoute?: string;
    canonicalStateKey?: string;
    profileKind?: string;
    authState?: string;
    surfaceKind?: string;
    screenFamily?: string;
    areaLabel?: string;
    affordances?: string[];
    canonicalEnvironmentKey?: string;
    environment?: PjeEnvironmentContext;
}

export interface NormalizeReport {
    scanned: number;
    normalized: number;
    changed: number;
    groups: number;
    largestGroup: number;
    dryRun: boolean;
}

const DYNAMIC_SEGMENT = ':id';

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function hasMeaningfulEnvironment(environment: PjeEnvironmentContext | undefined): boolean {
    if (!environment) return false;
    return environment.isPje
        || !!environment.tribunal
        || !!environment.pjeContext
        || !!environment.profileKind
        || !!environment.surfaceKind
        || !!environment.authState
        || !!environment.screenFamily
        || !!environment.areaLabel
        || !!environment.canonicalEnvironmentKey
        || !!environment.contextSummary
        || !!environment.affordances?.length;
}

export function normalizeActionInput(tool: string, input: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...input };
    const lowerTool = tool.toLowerCase();
    const rawUrl = typeof input['url'] === 'string'
        ? input['url']
        : typeof input['href'] === 'string'
            ? input['href']
            : undefined;

    if (rawUrl && (lowerTool.includes('navigate') || lowerTool.includes('goto') || lowerTool.includes('open'))) {
        const page = normalizePageState({ url: rawUrl });
        normalized['url'] = page.canonicalRoute || page.canonicalUrl || rawUrl;
        normalized['canonicalContext'] = page.canonicalContext;
        normalized['canonicalRoute'] = page.canonicalRoute;
        normalized['canonicalStateKey'] = page.canonicalStateKey;
        if (!page.canonicalRoute && page.canonicalUrl) {
            normalized['canonicalUrl'] = page.canonicalUrl;
        }
    }

    for (const key of Object.keys(normalized)) {
        if (/(token|session|csrf|nonce|cid|jsessionid)/i.test(key)) {
            delete normalized[key];
        }
    }

    return sortObject(normalized);
}

export function normalizePageStateData(data: Record<string, any>): Record<string, any> {
    const normalized = normalizePageState({
        url: data['url'],
        title: data['title'],
        tribunal: data['tribunal'],
        pjeContext: data['pjeContext'],
        profileKind: data['profileKind'],
        authState: data['authState'],
        surfaceKind: data['surfaceKind'],
        screenFamily: data['screenFamily'],
        areaLabel: data['areaLabel'],
        affordances: data['affordances'],
        environment: asRecord(data['environment']),
    });
    const nextData: Record<string, any> = {
        ...data,
        ...(data['domHash'] ? { rawDomHash: data['domHash'] } : {}),
        ...(normalized.tribunal ? { tribunal: normalized.tribunal } : {}),
        ...(normalized.canonicalUrl ? { canonicalUrl: normalized.canonicalUrl } : {}),
        ...(normalized.canonicalContext ? { canonicalContext: normalized.canonicalContext } : {}),
        ...(normalized.canonicalRoute ? { canonicalRoute: normalized.canonicalRoute } : {}),
        ...(normalized.canonicalStateKey ? { canonicalStateKey: normalized.canonicalStateKey } : {}),
        ...(normalized.profileKind ? { profileKind: normalized.profileKind } : {}),
        ...(normalized.authState ? { authState: normalized.authState } : {}),
        ...(normalized.surfaceKind ? { surfaceKind: normalized.surfaceKind } : {}),
        ...(normalized.screenFamily ? { screenFamily: normalized.screenFamily } : {}),
        ...(normalized.areaLabel ? { areaLabel: normalized.areaLabel } : {}),
        ...(normalized.affordances?.length ? { affordances: normalized.affordances } : {}),
        ...(normalized.canonicalEnvironmentKey ? { canonicalEnvironmentKey: normalized.canonicalEnvironmentKey } : {}),
        ...(hasMeaningfulEnvironment(normalized.environment) ? { environment: normalized.environment } : {}),
    };

    if (!hasMeaningfulEnvironment(normalized.environment) && 'environment' in nextData) {
        delete nextData['environment'];
    }

    return nextData;
}

export function normalizePageState(input: {
    url?: string;
    title?: string;
    tribunal?: string;
    pjeContext?: string;
    profileKind?: string;
    authState?: string;
    surfaceKind?: string;
    screenFamily?: string;
    areaLabel?: string;
    affordances?: unknown;
    environment?: unknown;
}): NormalizedPageState {
    const canonicalUrl = canonicalizeUrl(input.url);
    const tribunal = normalizeTribunal(input.tribunal) || inferTribunal(input.url) || inferTribunal(canonicalUrl);
    const existingEnvironment = normalizePjeEnvironmentContext(input.environment);
    const environment = inferPjeEnvironmentContext({
        url: input.url,
        title: input.title,
        tribunal,
        pjeContext: input.pjeContext,
        candidateKinds: [],
        environment: {
            ...(existingEnvironment || {}),
            ...(input.profileKind ? { profileKind: String(input.profileKind) as any } : {}),
            ...(input.authState ? { authState: String(input.authState) as any } : {}),
            ...(input.surfaceKind ? { surfaceKind: String(input.surfaceKind) as any } : {}),
            ...(input.screenFamily ? { screenFamily: String(input.screenFamily) } : {}),
            ...(input.areaLabel ? { areaLabel: String(input.areaLabel) } : {}),
            ...(Array.isArray(input.affordances) ? { affordances: input.affordances } : {}),
        },
    });
    const canonicalContext = environment.canonicalContext || inferCanonicalContext(input.url, input.title, input.pjeContext);
    const canonicalRoute = canonicalizeRoute(input.url, tribunal, canonicalContext);
    const keyParts = [
        tribunal || 'unknown',
        canonicalContext || 'page',
        canonicalRoute || canonicalUrl || 'unknown',
    ];

    return {
        tribunal,
        canonicalUrl,
        canonicalContext,
        canonicalRoute,
        canonicalStateKey: keyParts.join('|'),
        ...(environment.profileKind ? { profileKind: environment.profileKind } : {}),
        ...(environment.authState ? { authState: environment.authState } : {}),
        ...(environment.surfaceKind ? { surfaceKind: environment.surfaceKind } : {}),
        ...(environment.screenFamily ? { screenFamily: environment.screenFamily } : {}),
        ...(environment.areaLabel ? { areaLabel: environment.areaLabel } : {}),
        ...(environment.affordances?.length ? { affordances: environment.affordances } : {}),
        ...(environment.canonicalEnvironmentKey ? { canonicalEnvironmentKey: environment.canonicalEnvironmentKey } : {}),
        ...(hasMeaningfulEnvironment(environment) ? { environment } : {}),
    };
}

export function canonicalStateLabel(data: Record<string, any>, fallbackDomHash?: string): string | null {
    const normalized = normalizePageStateData(data);
    const tribunal = normalized['tribunal'] || data['tribunal'] || 'unknown';
    const key = normalized['canonicalStateKey'];
    if (key) return `${tribunal}:norm:${shortHash(String(key), 10)}`;
    const domHash = fallbackDomHash || data['domHash'];
    if (!domHash) return null;
    return `${tribunal}:${String(domHash).slice(0, 12)}`;
}

export function normalizeExistingPageStates(
    brain: BrainStore,
    opts: { dryRun?: boolean } = {},
): NormalizeReport {
    const dryRun = !!opts.dryRun;
    const states = brain.getNodesByType('page_state', 5000);
    let normalized = 0;
    let changed = 0;
    const groups = new Map<string, number>();

    for (const state of states) {
        const nextData = normalizePageStateData(state.data || {});
        if (nextData['canonicalStateKey']) {
            normalized += 1;
            groups.set(nextData['canonicalStateKey'], (groups.get(nextData['canonicalStateKey']) || 0) + 1);
        }
        if (isMeaningfullyDifferent(state.data || {}, nextData)) {
            changed += 1;
            if (!dryRun) brain.updateNode(state.id, { data: nextData });
        }
    }

    return {
        scanned: states.length,
        normalized,
        changed,
        groups: groups.size,
        largestGroup: Math.max(0, ...groups.values()),
        dryRun,
    };
}

function canonicalizeUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        const path = normalizePath(u.pathname);
        return `${u.protocol}//${host}${path}`;
    } catch {
        return undefined;
    }
}

function canonicalizeRoute(url: string | undefined, tribunal?: string, context?: string): string | undefined {
    if (!url) return undefined;
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        if (tribunal && context === 'portal_pje' && (host.includes('pje.') || host.includes(`${tribunal.toLowerCase()}.jus.br`))) {
            return `${tribunal.toLowerCase()}/portal_pje`;
        }
        const path = normalizePath(u.pathname)
            .split('/')
            .filter(Boolean)
            .slice(0, 5)
            .join('/');
        return `${host}/${path}`;
    } catch {
        return undefined;
    }
}

function normalizePath(pathname: string): string {
    const path = pathname || '/';
    const segments = path
        .replace(/;jsessionid=[^/]+/ig, '')
        .split('/')
        .filter(Boolean)
        .map(segment => decodeURIComponentSafe(segment))
        .map(segment => {
            const s = segment.trim();
            if (/^\d{7,}$/.test(s)) return DYNAMIC_SEGMENT;
            if (/^[a-f0-9]{12,}$/i.test(s)) return DYNAMIC_SEGMENT;
            if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s)) return DYNAMIC_SEGMENT;
            if (/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(s)) return ':processo';
            return s;
        });
    return '/' + segments.join('/');
}

function inferTribunal(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const host = new URL(url).hostname.toLowerCase();
        const compact = host.replace(/[-.]/g, '');
        const match = compact.match(/(tj[a-z]{2}|trt\d{1,2}|trf\d|tre[a-z]{2}|tst|stj|stf)/i);
        if (match?.[1]) return match[1].toUpperCase();
        if (host.includes('tjpa.jus.br')) return 'TJPA';
        return undefined;
    } catch {
        return undefined;
    }
}

function normalizeTribunal(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function inferCanonicalContext(url: string | undefined, title: string | undefined, current: string | undefined): string | undefined {
    const hay = `${url || ''} ${title || ''} ${current || ''}`.toLowerCase();
    if (/consulta|consultaprocesso|processo/.test(hay)) return 'consulta';
    if (/login|logon|sso|autentic/.test(hay)) return 'login';
    if (/painel|dashboard|mesa/.test(hay)) return 'painel';
    if (/portal-pje|portalexterno|apresentacao|pje/.test(hay)) return 'portal_pje';
    if (current) return current.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return undefined;
}

function decodeURIComponentSafe(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function shortHash(value: string, n = 12): string {
    return createHash('sha256').update(value).digest('hex').slice(0, n);
}

function sortObject(value: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
        const v = value[key];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            out[key] = sortObject(v as Record<string, unknown>);
        } else {
            out[key] = v;
        }
    }
    return out;
}

function isMeaningfullyDifferent(a: Record<string, any>, b: Record<string, any>): boolean {
    for (const key of ['tribunal', 'canonicalUrl', 'canonicalContext', 'canonicalRoute', 'canonicalStateKey']) {
        if ((a[key] || '') !== (b[key] || '')) return true;
    }
    return false;
}
