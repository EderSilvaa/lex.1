import { inspectActivePjePageContext } from './context-inspector';

type CandidateItem = {
    ref?: string;
    label?: string;
    kind?: string;
    candidateKinds?: string[];
    selectorHints?: string[];
};

type GuidanceInspection = {
    ok?: boolean;
    environment?: Record<string, unknown> | null;
    contextSummary?: string | null;
    candidates?: {
        processNumberFields?: CandidateItem[];
        searchActions?: CandidateItem[];
        certificateOrSigner?: CandidateItem[];
        loginActions?: CandidateItem[];
    };
    nextActions?: string[];
};

export interface PjeActionGuidance {
    environment?: Record<string, unknown>;
    contextSummary?: string;
    affordances: string[];
    nextActions: string[];
    guidanceText?: string;
}

function inferIntent(task: string): 'consultar' | 'autenticar' | 'abrir_resultado' | 'ler_autos' | 'ler_documento' | 'acessar_pastas' | 'peticionar' | 'geral' {
    const text = task.toLowerCase();
    if (/login|entrar|acessar com certificado|token|autentica/.test(text)) return 'autenticar';
    if (/consult|pesquis|buscar processo|numero do processo|n[uú]mero do processo/.test(text)) return 'consultar';
    if (/abrir resultado|abrir processo|abrir autos a partir da consulta/.test(text)) return 'abrir_resultado';
    if (/autos|movimenta|andamento|capa do processo/.test(text)) return 'ler_autos';
    if (/documento|pe[cç]a|anexo|pdf|baixar/.test(text)) return 'ler_documento';
    if (/pasta|fila|mural|caixa/.test(text)) return 'acessar_pastas';
    if (/peticionar|protocolo|juntar peti[cç][aã]o/.test(text)) return 'peticionar';
    return 'geral';
}

function summarizeCandidate(item: CandidateItem | undefined): string | null {
    if (!item) return null;
    const label = String(item.label || '').trim();
    const ref = String(item.ref || '').trim();
    const hint = Array.isArray(item.selectorHints) && item.selectorHints.length > 0
        ? String(item.selectorHints[0] || '').trim()
        : '';
    if (!label && !ref && !hint) return null;
    const parts = [
        label || '(sem label)',
        ref ? `ref=${ref}` : '',
        hint ? `hint=${hint}` : '',
    ].filter(Boolean);
    return parts.join(' | ');
}

function buildGuidanceText(task: string, inspected: GuidanceInspection): string | undefined {
    const environment = inspected.environment && typeof inspected.environment === 'object' ? inspected.environment : undefined;
    const affordances = Array.isArray(environment?.['affordances'])
        ? environment['affordances'].map((item) => String(item)).filter(Boolean).slice(0, 8)
        : [];
    const nextActions = Array.isArray(inspected.nextActions)
        ? inspected.nextActions.map((item) => String(item)).filter(Boolean).slice(0, 6)
        : [];
    const intent = inferIntent(task);
    const candidates = inspected.candidates || {};

    const relevantCandidates: string[] = [];
    if (intent === 'consultar') {
        const field = summarizeCandidate(candidates.processNumberFields?.[0]);
        const action = summarizeCandidate(candidates.searchActions?.[0]);
        if (field) relevantCandidates.push(`Campo provavel para numero do processo: ${field}`);
        if (action) relevantCandidates.push(`Acao provavel de consulta: ${action}`);
    } else if (intent === 'autenticar') {
        const login = summarizeCandidate(candidates.loginActions?.[0]);
        const certificate = summarizeCandidate(candidates.certificateOrSigner?.[0]);
        if (login) relevantCandidates.push(`Acao provavel de login: ${login}`);
        if (certificate) relevantCandidates.push(`Elemento de certificado/assinatura: ${certificate}`);
    } else if (intent === 'acessar_pastas') {
        const action = summarizeCandidate(candidates.searchActions?.[0]);
        if (action) relevantCandidates.push(`Acao interativa visivel relevante: ${action}`);
    } else {
        const field = summarizeCandidate(candidates.processNumberFields?.[0]);
        const action = summarizeCandidate(candidates.searchActions?.[0]);
        if (field) relevantCandidates.push(`Elemento promissor: ${field}`);
        if (action) relevantCandidates.push(`Acao promissora: ${action}`);
    }

    const lines = [
        inspected.contextSummary ? `Contexto atual do PJe: ${inspected.contextSummary}` : '',
        affordances.length > 0 ? `Affordances detectadas: ${affordances.join(', ')}` : '',
        nextActions.length > 0 ? `Sugestoes de proximo passo: ${nextActions.join(', ')}` : '',
        ...relevantCandidates,
        'Se a tela atual nao suportar o objetivo, navegue para a area correta antes de insistir.',
        'Prefira os elementos sugeridos acima quando eles forem compativeis com o objetivo real.',
    ].filter(Boolean);

    return lines.length > 0 ? `${task}\n\nLeitura operacional da tela atual:\n- ${lines.join('\n- ')}` : undefined;
}

export async function buildPjeActionGuidance(task: string): Promise<PjeActionGuidance> {
    try {
        const inspected = await inspectActivePjePageContext({
            maxElementsPerFrame: 40,
            maxTextSnippetsPerFrame: 12,
            includeScreenshot: false,
        }) as GuidanceInspection;
        const environment = inspected.ok && inspected.environment && typeof inspected.environment === 'object'
            ? inspected.environment
            : undefined;
        const affordances = Array.isArray(environment?.['affordances'])
            ? environment['affordances'].map((item) => String(item)).filter(Boolean).slice(0, 8)
            : [];
        const nextActions = Array.isArray(inspected.nextActions)
            ? inspected.nextActions.map((item) => String(item)).filter(Boolean).slice(0, 6)
            : [];
        return {
            environment,
            contextSummary: inspected.contextSummary || undefined,
            affordances,
            nextActions,
            guidanceText: buildGuidanceText(task, inspected),
        };
    } catch {
        return {
            affordances: [],
            nextActions: [],
        };
    }
}
