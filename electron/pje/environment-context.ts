export type PjeProfileKind = 'advogado' | 'servidor' | 'gabinete' | 'externo' | 'desconhecido';
export type PjeAuthState = 'fora_do_pje' | 'nao_logado' | 'logado' | 'parcial' | 'desconhecido';
export type PjeSurfaceKind =
    | 'fora_do_pje'
    | 'login'
    | 'consulta'
    | 'resultado_consulta'
    | 'painel'
    | 'mural'
    | 'autos'
    | 'documento'
    | 'portal_pje'
    | 'desconhecido';

export interface PjeEnvironmentContext {
    isPje: boolean;
    tribunal?: string;
    pjeContext?: string;
    canonicalContext?: string;
    profileKind?: PjeProfileKind;
    authState?: PjeAuthState;
    surfaceKind?: PjeSurfaceKind;
    screenFamily?: string;
    areaLabel?: string;
    affordances?: string[];
    canonicalEnvironmentKey?: string;
    contextSummary?: string;
}

export interface PjeEnvironmentMatch {
    tribunal?: string;
    pjeContext?: string;
    canonicalContext?: string;
    profileKind?: PjeProfileKind;
    authState?: PjeAuthState;
    surfaceKind?: PjeSurfaceKind;
    screenFamily?: string;
    areaLabel?: string;
    canonicalEnvironmentKey?: string;
}

interface InferPjeEnvironmentInput {
    url?: string;
    title?: string;
    tribunal?: string;
    pjeContext?: string;
    textSnippets?: unknown;
    candidateKinds?: unknown;
    environment?: Partial<PjeEnvironmentContext> | Record<string, unknown> | null;
}

const PROFILE_VALUES: ReadonlySet<string> = new Set(['advogado', 'servidor', 'gabinete', 'externo', 'desconhecido']);
const AUTH_VALUES: ReadonlySet<string> = new Set(['fora_do_pje', 'nao_logado', 'logado', 'parcial', 'desconhecido']);
const SURFACE_VALUES: ReadonlySet<string> = new Set([
    'fora_do_pje',
    'login',
    'consulta',
    'resultado_consulta',
    'painel',
    'mural',
    'autos',
    'documento',
    'portal_pje',
    'desconhecido',
]);

function normalizeText(value: unknown): string {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanText(value: unknown, maxChars = 180): string {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function slugify(value: unknown, maxChars = 80): string {
    const text = normalizeText(value)
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function uniqueStrings(values: unknown, maxItems = 10, maxChars = 120): string[] {
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of values) {
        const text = slugify(item, maxChars);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push(text);
        if (out.length >= maxItems) break;
    }
    return out;
}

function includesAny(text: string, terms: string[]): boolean {
    return terms.some((term) => text.includes(term));
}

function normalizeTribunal(value: unknown): string | undefined {
    const text = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return text || undefined;
}

function inferTribunalFromUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const host = new URL(url).hostname.toLowerCase();
        const compact = host.replace(/[-.]/g, '');
        const match = compact.match(/(tj[a-z]{2}|trt\d{1,2}|trf\d|tre[a-z]{2}|tst|stj|stf)/i);
        if (match?.[1]) return match[1].toUpperCase();
    } catch {
        return undefined;
    }
    return undefined;
}

function extractSignals(input: InferPjeEnvironmentInput): { text: string; isPje: boolean; tribunal?: string } {
    const title = cleanText(input.title, 220);
    const url = cleanText(input.url, 300);
    const snippets = Array.isArray(input.textSnippets)
        ? input.textSnippets.slice(0, 16).map((item) => cleanText(item, 220)).filter(Boolean)
        : [];
    const pjeContext = cleanText(input.pjeContext, 120);
    const candidateKinds = uniqueStrings(input.candidateKinds, 12, 80);
    const signalText = normalizeText([url, title, pjeContext, ...snippets, ...candidateKinds].join(' '));
    const isPje = url.includes('pje.') || signalText.includes(' portal pje') || signalText.startsWith('pje ') || signalText.includes(' pje ');
    return {
        text: signalText,
        isPje,
        tribunal: normalizeTribunal(input.tribunal) || inferTribunalFromUrl(input.url),
    };
}

function inferSurfaceKind(text: string, isPje: boolean, candidateKinds: string[]): PjeSurfaceKind {
    if (!isPje) return 'fora_do_pje';
    if (
        includesAny(text, ['login', 'autentic', 'certificado', 'gov.br', 'smartcard', 'assinador', 'token'])
        || candidateKinds.includes('login_action')
        || candidateKinds.includes('certificate_or_signer')
    ) {
        return 'login';
    }
    if (includesAny(text, ['documento', 'pdf', 'anexo', 'visualizador do documento', 'arquivo']) || /\.pdf(\?|$)/i.test(text)) {
        return 'documento';
    }
    if (includesAny(text, ['autos', 'movimentac', 'detalhes do processo', 'dados do processo', 'partes do processo', 'expedientes do processo'])) {
        return 'autos';
    }
    if (includesAny(text, ['resultado da consulta', 'resultado da pesquisa', 'processos encontrados', 'resultado(s) encontrado'])) {
        return 'resultado_consulta';
    }
    if (
        includesAny(text, ['consulta processual', 'consultar processo', 'pesquisar processo', 'numero do processo', 'consulta de processo'])
        || candidateKinds.includes('process_number_field')
        || candidateKinds.includes('search_or_consult_action')
    ) {
        return 'consulta';
    }
    if (includesAny(text, ['mural', 'pastas', 'caixa de entrada', 'minhas tarefas', 'fila de trabalho', 'conclusos'])) {
        return 'mural';
    }
    if (includesAny(text, ['painel', 'dashboard', 'mesa', 'home'])) {
        return 'painel';
    }
    if (includesAny(text, ['portal pje', 'portal-pje', 'portal externo'])) {
        return 'portal_pje';
    }
    return 'desconhecido';
}

function inferProfileKind(text: string, surfaceKind: PjeSurfaceKind, isPje: boolean): PjeProfileKind {
    if (!isPje) return 'desconhecido';
    if (includesAny(text, ['gabinete', 'assessor', 'minutar', 'concluso ao gabinete'])) return 'gabinete';
    if (
        surfaceKind === 'mural'
        || includesAny(text, ['servidor', 'secretaria', 'fila de trabalho', 'tarefas', 'pastas', 'cumprimento'])
    ) {
        return 'servidor';
    }
    if (
        includesAny(text, ['advogado', 'peticionar', 'minhas peticoes', 'intimacoes', 'comunicacoes processuais', 'protocolo'])
    ) {
        return 'advogado';
    }
    if (surfaceKind === 'consulta' || surfaceKind === 'portal_pje') return 'externo';
    return 'desconhecido';
}

function inferAuthState(text: string, isPje: boolean, surfaceKind: PjeSurfaceKind): PjeAuthState {
    if (!isPje) return 'fora_do_pje';
    if (surfaceKind === 'login') return 'nao_logado';
    if (['mural', 'painel', 'autos', 'documento', 'resultado_consulta'].includes(surfaceKind)) return 'logado';
    if (includesAny(text, ['sair', 'logout', 'usuario logado', 'perfil', 'tarefas'])) return 'logado';
    if (surfaceKind === 'portal_pje' || surfaceKind === 'consulta') return 'parcial';
    return 'desconhecido';
}

function inferPjeContext(surfaceKind: PjeSurfaceKind, current: string | undefined): string | undefined {
    if (surfaceKind === 'fora_do_pje') return undefined;
    const normalizedCurrent = slugify(current, 120);
    if (normalizedCurrent) return normalizedCurrent;
    switch (surfaceKind) {
        case 'login':
            return 'login';
        case 'consulta':
            return 'consulta';
        case 'resultado_consulta':
            return 'consulta_resultados';
        case 'painel':
            return 'painel';
        case 'mural':
            return 'mural';
        case 'autos':
            return 'autos';
        case 'documento':
            return 'documento';
        case 'portal_pje':
            return 'portal_pje';
        default:
            return undefined;
    }
}

function inferAreaLabel(text: string, surfaceKind: PjeSurfaceKind, profileKind: PjeProfileKind): string | undefined {
    const rules = [
        { label: 'mural_do_servidor', terms: ['mural do servidor'] },
        { label: 'painel_do_advogado', terms: ['painel do advogado', 'area do advogado'] },
        { label: 'consulta_processual', terms: ['consulta processual', 'consulta de processo'] },
        { label: 'resultados_da_consulta', terms: ['resultado da consulta', 'resultado da pesquisa'] },
        { label: 'autos_do_processo', terms: ['autos do processo', 'detalhes do processo'] },
        { label: 'documento_processual', terms: ['documento processual', 'visualizador do documento'] },
        { label: 'portal_pje', terms: ['portal pje', 'portal-pje'] },
        { label: 'login_pje', terms: ['login pje', 'autenticacao pje'] },
    ];
    const match = rules.find((rule) => includesAny(text, rule.terms));
    if (match) return match.label;
    if (surfaceKind === 'desconhecido' && profileKind === 'desconhecido') return undefined;
    const base = [profileKind !== 'desconhecido' ? profileKind : '', surfaceKind !== 'desconhecido' ? surfaceKind : '']
        .filter(Boolean)
        .join('_');
    return base || undefined;
}

function inferAffordances(
    surfaceKind: PjeSurfaceKind,
    profileKind: PjeProfileKind,
    candidateKinds: string[],
    text: string,
): string[] {
    const affordances = new Set<string>();
    if (surfaceKind === 'login' || candidateKinds.includes('login_action')) affordances.add('autenticar');
    if (candidateKinds.includes('certificate_or_signer')) affordances.add('usar_certificado');
    if (candidateKinds.includes('process_number_field')) affordances.add('informar_numero_processo');
    if (candidateKinds.includes('search_or_consult_action') || ['consulta', 'resultado_consulta'].includes(surfaceKind)) {
        affordances.add('consultar_processo');
    }
    if (surfaceKind === 'resultado_consulta') affordances.add('abrir_resultado_consulta');
    if (surfaceKind === 'mural' || profileKind === 'servidor' || includesAny(text, ['pastas', 'fila de trabalho'])) {
        affordances.add('acessar_pastas');
    }
    if (surfaceKind === 'autos') affordances.add('ler_autos');
    if (surfaceKind === 'documento') {
        affordances.add('ler_documento');
        affordances.add('baixar_documento');
    }
    if (profileKind === 'advogado' || includesAny(text, ['peticionar', 'protocolo'])) affordances.add('peticionar');
    return Array.from(affordances).slice(0, 8);
}

function buildScreenFamily(profileKind: PjeProfileKind, surfaceKind: PjeSurfaceKind): string | undefined {
    if (surfaceKind === 'fora_do_pje') return 'fora_do_pje';
    if (surfaceKind === 'desconhecido') return profileKind !== 'desconhecido' ? profileKind : undefined;
    if (profileKind === 'desconhecido' || profileKind === 'externo') return surfaceKind;
    return `${profileKind}_${surfaceKind}`;
}

function buildCanonicalEnvironmentKey(context: {
    tribunal?: string;
    profileKind?: PjeProfileKind;
    surfaceKind?: PjeSurfaceKind;
    authState?: PjeAuthState;
    areaLabel?: string;
}): string | undefined {
    const parts = [
        context.tribunal || 'unknown',
        context.profileKind || 'desconhecido',
        context.surfaceKind || 'desconhecido',
        context.authState || 'desconhecido',
        context.areaLabel || 'area',
    ];
    return parts.join('|');
}

export function summarizePjeEnvironmentContext(context: Partial<PjeEnvironmentContext> | null | undefined): string | undefined {
    if (!context) return undefined;
    if (context.isPje === false) return 'fora_do_pje';
    const parts = [
        context.tribunal,
        context.profileKind && context.profileKind !== 'desconhecido' ? context.profileKind : '',
        context.surfaceKind && context.surfaceKind !== 'desconhecido' ? context.surfaceKind : '',
        context.authState && context.authState !== 'desconhecido' ? context.authState : '',
    ].filter(Boolean);
    if (context.areaLabel && context.areaLabel !== context.surfaceKind) parts.push(context.areaLabel);
    const affordances = Array.isArray(context.affordances) ? context.affordances.slice(0, 3) : [];
    if (affordances.length) parts.push(`acoes:${affordances.join(',')}`);
    return parts.join(' | ') || undefined;
}

export function normalizePjeEnvironmentContext(value: unknown): PjeEnvironmentContext | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const raw = value as Record<string, unknown>;
    const profileKind = slugify(raw['profileKind'], 30);
    const authState = slugify(raw['authState'], 30);
    const surfaceKind = slugify(raw['surfaceKind'], 40);
    const normalized: PjeEnvironmentContext = {
        isPje: raw['isPje'] === true,
        ...(normalizeTribunal(raw['tribunal']) ? { tribunal: normalizeTribunal(raw['tribunal']) } : {}),
        ...(slugify(raw['pjeContext'], 120) ? { pjeContext: slugify(raw['pjeContext'], 120) } : {}),
        ...(slugify(raw['canonicalContext'], 120) ? { canonicalContext: slugify(raw['canonicalContext'], 120) } : {}),
        ...(PROFILE_VALUES.has(profileKind) ? { profileKind: profileKind as PjeProfileKind } : {}),
        ...(AUTH_VALUES.has(authState) ? { authState: authState as PjeAuthState } : {}),
        ...(SURFACE_VALUES.has(surfaceKind) ? { surfaceKind: surfaceKind as PjeSurfaceKind } : {}),
        ...(slugify(raw['screenFamily'], 80) ? { screenFamily: slugify(raw['screenFamily'], 80) } : {}),
        ...(slugify(raw['areaLabel'], 80) ? { areaLabel: slugify(raw['areaLabel'], 80) } : {}),
        ...(uniqueStrings(raw['affordances'], 8, 80).length ? { affordances: uniqueStrings(raw['affordances'], 8, 80) } : {}),
        ...(cleanText(raw['canonicalEnvironmentKey'], 220) ? { canonicalEnvironmentKey: cleanText(raw['canonicalEnvironmentKey'], 220) } : {}),
        ...(cleanText(raw['contextSummary'], 220) ? { contextSummary: cleanText(raw['contextSummary'], 220) } : {}),
    };
    return normalized;
}

export function extractPjeEnvironmentMatch(value: unknown): PjeEnvironmentMatch | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const raw = value as Record<string, unknown>;
    const environment = normalizePjeEnvironmentContext(raw['environment']) || normalizePjeEnvironmentContext(raw);
    const tribunal = normalizeTribunal(raw['tribunal']) || environment?.tribunal;
    const pjeContext = slugify(raw['pjeContext'], 120) || environment?.pjeContext;
    const canonicalContext = slugify(raw['canonicalContext'], 120) || environment?.canonicalContext || pjeContext;
    const canonicalEnvironmentKey = cleanText(raw['canonicalEnvironmentKey'], 220) || environment?.canonicalEnvironmentKey;
    const match: PjeEnvironmentMatch = {
        ...(tribunal ? { tribunal } : {}),
        ...(pjeContext ? { pjeContext } : {}),
        ...(canonicalContext ? { canonicalContext } : {}),
        ...(environment?.profileKind ? { profileKind: environment.profileKind } : {}),
        ...(environment?.authState ? { authState: environment.authState } : {}),
        ...(environment?.surfaceKind ? { surfaceKind: environment.surfaceKind } : {}),
        ...(environment?.screenFamily ? { screenFamily: environment.screenFamily } : {}),
        ...(environment?.areaLabel ? { areaLabel: environment.areaLabel } : {}),
        ...(canonicalEnvironmentKey ? { canonicalEnvironmentKey } : {}),
    };
    return Object.keys(match).length > 0 ? match : undefined;
}

export function buildPjeEnvironmentLookupKey(value: unknown): string | undefined {
    const match = extractPjeEnvironmentMatch(value);
    if (!match) return undefined;
    const raw = match.canonicalEnvironmentKey
        || [
            match.profileKind,
            match.surfaceKind,
            match.screenFamily,
            match.canonicalContext || match.pjeContext,
            match.areaLabel,
        ].filter(Boolean).join('|');
    const normalized = slugify(raw, 160);
    return normalized || undefined;
}

export function getPjeEnvironmentSpecificity(value: unknown): number {
    const match = extractPjeEnvironmentMatch(value);
    if (!match) return 0;
    let score = 0;
    if (match.canonicalEnvironmentKey) score += 5;
    if (match.profileKind) score += 2;
    if (match.surfaceKind) score += 3;
    if (match.screenFamily) score += 2;
    if (match.areaLabel) score += 2;
    if (match.authState) score += 1;
    if (match.canonicalContext || match.pjeContext) score += 2;
    return score;
}

export function scorePjeEnvironmentCompatibility(expectedValue: unknown, candidateValue: unknown): number {
    const expected = extractPjeEnvironmentMatch(expectedValue);
    const candidate = extractPjeEnvironmentMatch(candidateValue);
    if (!expected) return 0;
    if (!candidate) return 0;

    if (expected.canonicalEnvironmentKey && candidate.canonicalEnvironmentKey) {
        return expected.canonicalEnvironmentKey === candidate.canonicalEnvironmentKey ? 1 : -1;
    }

    const expectedContext = expected.canonicalContext || expected.pjeContext;
    const candidateContext = candidate.canonicalContext || candidate.pjeContext;
    const fields: Array<{ expected?: string; candidate?: string; weight: number; hard: boolean }> = [
        { expected: expectedContext, candidate: candidateContext, weight: 0.28, hard: true },
        { expected: expected.profileKind, candidate: candidate.profileKind, weight: 0.22, hard: true },
        { expected: expected.surfaceKind, candidate: candidate.surfaceKind, weight: 0.28, hard: true },
        { expected: expected.screenFamily, candidate: candidate.screenFamily, weight: 0.18, hard: true },
        { expected: expected.areaLabel, candidate: candidate.areaLabel, weight: 0.2, hard: true },
        { expected: expected.authState, candidate: candidate.authState, weight: 0.08, hard: true },
        { expected: expected.tribunal, candidate: candidate.tribunal, weight: 0.08, hard: false },
    ];

    let score = 0;
    for (const field of fields) {
        if (!field.expected) continue;
        if (field.candidate && field.expected !== field.candidate) {
            return field.hard ? -1 : score;
        }
        if (field.candidate && field.expected === field.candidate) {
            score += field.weight;
        }
    }
    return score;
}

export function arePjeEnvironmentsCompatible(expectedValue: unknown, candidateValue: unknown): boolean {
    return scorePjeEnvironmentCompatibility(expectedValue, candidateValue) >= 0;
}

export function inferPjeEnvironmentContext(input: InferPjeEnvironmentInput): PjeEnvironmentContext {
    const existing = normalizePjeEnvironmentContext(input.environment) || { isPje: false };
    const candidateKinds = uniqueStrings(input.candidateKinds, 12, 80);
    const signals = extractSignals(input);
    const surfaceKind = existing.surfaceKind || inferSurfaceKind(signals.text, signals.isPje, candidateKinds);
    const profileKind = existing.profileKind || inferProfileKind(signals.text, surfaceKind, signals.isPje);
    const authState = existing.authState || inferAuthState(signals.text, signals.isPje, surfaceKind);
    const tribunal = existing.tribunal || signals.tribunal;
    const pjeContext = existing.pjeContext || inferPjeContext(surfaceKind, input.pjeContext);
    const canonicalContext = existing.canonicalContext || pjeContext;
    const areaLabel = existing.areaLabel || inferAreaLabel(signals.text, surfaceKind, profileKind);
    const affordances = (existing.affordances && existing.affordances.length)
        ? existing.affordances
        : inferAffordances(surfaceKind, profileKind, candidateKinds, signals.text);
    const screenFamily = existing.screenFamily || buildScreenFamily(profileKind, surfaceKind);
    const canonicalEnvironmentKey = existing.canonicalEnvironmentKey
        || buildCanonicalEnvironmentKey({ tribunal, profileKind, surfaceKind, authState, areaLabel });

    const context: PjeEnvironmentContext = {
        isPje: existing.isPje || signals.isPje,
        ...(tribunal ? { tribunal } : {}),
        ...(pjeContext ? { pjeContext } : {}),
        ...(canonicalContext ? { canonicalContext } : {}),
        ...(profileKind ? { profileKind } : {}),
        ...(authState ? { authState } : {}),
        ...(surfaceKind ? { surfaceKind } : {}),
        ...(screenFamily ? { screenFamily } : {}),
        ...(areaLabel ? { areaLabel } : {}),
        ...(affordances.length ? { affordances } : {}),
        ...(canonicalEnvironmentKey ? { canonicalEnvironmentKey } : {}),
    };
    const shouldKeep = context.isPje
        || !!context.tribunal
        || !!context.pjeContext
        || (context.surfaceKind && context.surfaceKind !== 'fora_do_pje' && context.surfaceKind !== 'desconhecido')
        || (context.profileKind && context.profileKind !== 'desconhecido')
        || (context.authState && context.authState !== 'fora_do_pje' && context.authState !== 'desconhecido');
    if (!shouldKeep) return { isPje: false };
    const contextSummary = summarizePjeEnvironmentContext(context);
    if (contextSummary) context.contextSummary = contextSummary;
    return context;
}
