import { app } from 'electron';
import * as http from 'http';
import * as path from 'path';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { rpcCall } from './backend-client';
import { getLexEngineStatus } from './lex-engine';
import { inferTribunalFromCNJ } from './datajud/datajud-client';
import { normalizeTribunalCode, resolveTribunalRoutes } from './pje/tribunal-urls';
import { requestUserInput } from './user-input';

export interface LexDesktopBridgeState {
    running: boolean;
    port: number;
    url: string;
}

const DEFAULT_PORT = Number(process.env['LEX_DESKTOP_BRIDGE_PORT'] || 32179);
const MAX_JSON_BODY_BYTES = 64 * 1024;
const HITL_CAPABILITY_HEADER = 'x-lex-hitl-capability';
const hitlCapability = randomBytes(32).toString('hex');

type ConfirmationLevel = 'info' | 'warning' | 'danger';
type TerminalConfirmationChoice = 'accept' | 'deny' | 'always';

let server: http.Server | null = null;
let state: LexDesktopBridgeState = {
    running: false,
    port: DEFAULT_PORT,
    url: `http://127.0.0.1:${DEFAULT_PORT}`,
};
const terminalConfirmationAlwaysAllow = new Set<string>();

export function getLexDesktopHitlCapability(): string {
    return hitlCapability;
}

function hasValidHermesHitlCapability(req: http.IncomingMessage): boolean {
    const provided = String(req.headers[HITL_CAPABILITY_HEADER] || '').trim();
    if (!provided || provided.length !== hitlCapability.length) return false;
    return timingSafeEqual(Buffer.from(provided), Buffer.from(hitlCapability));
}

function sendNativeHitlRequired(res: http.ServerResponse): void {
    sendJson(res, 403, {
        ok: false,
        error: 'human_approval_required',
        message: 'Esta acao sensivel exige aprovacao na Console Lex antes da execucao.',
    });
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
    const body = JSON.stringify(payload, null, 2);
    res.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(body);
}

function notFound(res: http.ServerResponse): void {
    sendJson(res, 404, { ok: false, error: 'not_found' });
}

function asText(value: unknown, fallback: string, maxLength: number): string {
    const text = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function optionalText(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeStringList(value: unknown, maxItems = 8): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const items = value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, maxItems);
    return items.length ? items : undefined;
}

function isRecoverableBrowserError(error: any): boolean {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('connectovercdp')
        || message.includes('browser-check-pje')
        || message.includes('cdp')
        || message.includes('timeout');
}

function asLevel(value: unknown): ConfirmationLevel {
    if (value === 'danger' || value === 'warning' || value === 'info') return value;
    return 'warning';
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let done = false;

        const fail = (err: Error) => {
            if (done) return;
            done = true;
            reject(err);
        };

        req.on('data', (chunk) => {
            const buffer = Buffer.from(chunk);
            total += buffer.length;

            if (total > MAX_JSON_BODY_BYTES) {
                fail(new Error('request_body_too_large'));
                req.destroy();
                return;
            }

            chunks.push(buffer);
        });

        req.on('end', () => {
            if (done) return;
            done = true;

            const raw = Buffer.concat(chunks).toString('utf8').trim();
            if (!raw) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error('invalid_json_body'));
            }
        });

        req.on('error', fail);
    });
}

function buildConfirmationKey(title: string, message: string, detail: string): string {
    return createHash('sha256')
        .update(`${title}\n${message}\n${detail}`)
        .digest('hex');
}

function normalizeConfirmationAnswer(answer: string): TerminalConfirmationChoice | null {
    const value = String(answer || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (['1', 's', 'sim', 'aceitar', 'aceito', 'aprovar', 'ok', 'confirmar'].includes(value)) return 'accept';
    if (['2', 'n', 'nao', 'negar', 'negado', 'cancelar', 'cancela', 'recusar'].includes(value)) return 'deny';
    if (['3', 'sempre', 'aceitar sempre', 'aprovar sempre', 'sempre aceitar'].includes(value)) return 'always';
    return null;
}

async function requestTerminalConfirmation(params: {
    title: string;
    message: string;
    detail: string;
    confirmLabel?: string;
    cancelLabel?: string;
    allowAlways?: boolean;
    level?: ConfirmationLevel;
}): Promise<{ accepted: boolean; choice: TerminalConfirmationChoice; always: boolean; fromAlwaysAllow?: boolean }> {
    const title = asText(params.title, 'Confirmar acao da Lex', 120);
    const message = asText(params.message, 'O Lex Engine solicitou uma confirmacao.', 2000);
    const detail = asText(params.detail, 'Confirme apenas se voce reconhece esta acao.', 3000);
    const confirmLabel = asText(params.confirmLabel, 'Aceitar', 60);
    const cancelLabel = asText(params.cancelLabel, 'Negar', 60);
    const allowAlways = params.allowAlways !== false && params.level !== 'danger';
    const key = buildConfirmationKey(title, message, detail);

    if (allowAlways && terminalConfirmationAlwaysAllow.has(key)) {
        return { accepted: true, choice: 'always', always: true, fromAlwaysAllow: true };
    }

    const choices = [
        `1. ${confirmLabel}`,
        `2. ${cancelLabel}`,
        allowAlways ? '3. Aceitar sempre esta mesma acao' : '',
    ].filter(Boolean);
    const prompt = [
        `Confirmacao Lex: ${title}`,
        message,
        detail,
        '',
        choices.join('\n'),
        '',
        'Digite 1, 2 ou 3 e pressione Enter.',
    ].join('\n');

    let choice: TerminalConfirmationChoice | null = null;
    for (let attempt = 0; attempt < 2 && !choice; attempt += 1) {
        const answer = await requestUserInput(
            attempt === 0 ? prompt : `${prompt}\n\nResposta nao reconhecida. Use 1, 2 ou 3.`,
            3 * 60 * 1000,
        );
        choice = normalizeConfirmationAnswer(answer);
        if (choice === 'always' && !allowAlways) choice = 'accept';
    }

    if (choice === 'always') {
        terminalConfirmationAlwaysAllow.add(key);
        return { accepted: true, choice, always: true };
    }

    if (choice === 'accept') return { accepted: true, choice, always: false };
    return { accepted: false, choice: 'deny', always: false };
}

function compactData(data: unknown): unknown {
    const raw = JSON.stringify(data ?? {});
    if (raw.length <= 1800) return data ?? {};
    return {
        truncated: true,
        preview: raw.slice(0, 1800),
    };
}

function compactBrainResults(results: any[]): any[] {
    return (Array.isArray(results) ? results : []).map((item) => {
        const node = item?.node || {};
        return {
            rank: item?.rank,
            node: {
                id: node.id,
                type: node.type,
                label: node.label,
                confidence: node.confidence,
                source: node.source,
                updatedAt: node.updatedAt,
                data: compactData(node.data),
            },
        };
    });
}

function normalizeCnj(raw: unknown): string | null {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length !== 20) return null;
    return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

function compactDataJudProcesso(processo: any): any {
    if (!processo || typeof processo !== 'object') return null;
    const partes = Array.isArray(processo.partes) ? processo.partes.slice(0, 12) : [];
    const movimentacoes = Array.isArray(processo.movimentacoes) ? processo.movimentacoes.slice(0, 10) : [];
    return {
        numero: processo.numero,
        tribunal: processo.tribunal,
        classe: processo.classe,
        assunto: processo.assunto,
        orgaoJulgador: processo.orgaoJulgador,
        dataAjuizamento: processo.dataAjuizamento,
        grau: processo.grau,
        nivelSigilo: processo.nivelSigilo,
        partes,
        movimentacoes,
        fetchedAt: processo._fetchedAt,
    };
}

function normalizeTribunal(value: unknown): string | null {
    const code = normalizeTribunalCode(value);
    return code && code.trim() ? code.trim().toUpperCase() : null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(fallback), timeoutMs);
        promise
            .then((value) => resolve(value))
            .catch(() => resolve(fallback))
            .finally(() => clearTimeout(timer));
    });
}

async function handleHealth(res: http.ServerResponse): Promise<void> {
    const engine: unknown = await withTimeout<unknown>(
        getLexEngineStatus(),
        4000,
        { ok: false, error: 'engine_status_timeout' },
    );

    sendJson(res, 200, {
        ok: true,
        service: 'lex-desktop',
        version: app.getVersion(),
        pid: process.pid,
        bridge: state,
        engine,
    });
}

async function handleBrainSearch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const query = optionalText(payload?.query, 500);
    if (!query) {
        sendJson(res, 400, { ok: false, error: 'query_required' });
        return;
    }

    const limit = boundedNumber(payload?.limit, 10, 1, 20);
    const types = normalizeStringList(payload?.types);
    const results = await rpcCall('brain-search', { query, types, limit }, { timeoutMs: 15000 });
    const compactResults = compactBrainResults(results);

    sendJson(res, 200, {
        ok: true,
        query,
        count: compactResults.length,
        results: compactResults,
    });
}

async function handleBrainFlows(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const limit = boundedNumber(payload?.limit, 10, 1, 50);
    const result = await rpcCall('brain-flows', { limit }, { timeoutMs: 15000 });
    sendJson(res, 200, result);
}

async function handleBrainGetFlow(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const flowId = optionalText(payload?.flowId, 300);
    const label = optionalText(payload?.label, 500);
    if (!flowId && !label) {
        sendJson(res, 400, { ok: false, error: 'flow_id_or_label_required' });
        return;
    }

    const result = await rpcCall('brain-get-flow', { flowId, label }, { timeoutMs: 15000 });
    sendJson(res, 200, result);
}

async function handleBrainRecordObservation(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const result = await rpcCall('brain-record-observation', payload, { timeoutMs: 20000 });
    sendJson(res, result?.ok === false ? 400 : 200, result);
}

async function handlePjeStatus(res: http.ServerResponse): Promise<void> {
    const status = await getPjeStatusSafe(5000);
    sendJson(res, 200, {
        ok: true,
        mode: 'read_only',
        status,
    });
}

async function getPjeStatusSafe(timeoutMs = 5000): Promise<any> {
    try {
        return await rpcCall('browser-check-pje', {}, { timeoutMs });
    } catch (err: any) {
        return {
            connected: false,
            isPje: false,
            url: null,
            tribunalAtivo: null,
            tribunalPreferido: null,
            error: err?.message || String(err),
        };
    }
}

async function handleBrowserFocus(res: http.ServerResponse): Promise<void> {
    const result = await rpcCall('browser-focus', {}, { timeoutMs: 15000 });
    sendJson(res, result?.ok === false ? 400 : 200, result);
}

async function buildPjeConsultaPlan(payload: any): Promise<any> {
    const numero = normalizeCnj(payload?.numero);
    if (!numero) {
        const err = new Error('invalid_cnj');
        (err as any).statusCode = 400;
        throw err;
    }

    const status = await getPjeStatusSafe(5000);
    const requestedTribunal = normalizeTribunal(payload?.tribunal);
    const inferredTribunal = normalizeTribunal(inferTribunalFromCNJ(numero));
    const activeTribunal = normalizeTribunal(status?.tribunalAtivo);
    const preferredTribunal = normalizeTribunal(status?.tribunalPreferido);
    const tribunal = requestedTribunal || inferredTribunal || activeTribunal || preferredTribunal || 'TJPA';
    const routes = resolveTribunalRoutes(tribunal);
    const activeMatchesTarget = !!activeTribunal && activeTribunal === tribunal;
    const authState = String(status?.environment?.authState || '').trim().toLowerCase();
    const surfaceKind = String(status?.environment?.surfaceKind || '').trim().toLowerCase();
    const needsAuthentication = authState === 'nao_logado' || surfaceKind === 'login';
    const includeDataJud = Boolean(payload?.includeDataJud);

    const dataJud: any = {
        attempted: false,
        configured: false,
        found: false,
        processo: null,
        error: null,
    };

    if (includeDataJud) {
        dataJud.attempted = true;
        try {
            const datajud = await import('./datajud');
            dataJud.configured = await datajud.hasDataJudApiKey();
            const engine = datajud.getSyncEngine();
            if (!dataJud.configured) {
                dataJud.error = 'datajud_api_key_not_configured';
            } else if (!engine) {
                dataJud.error = 'datajud_pipeline_not_ready';
            } else {
                const processo = await engine.queryCold(numero, tribunal);
                dataJud.found = !!processo;
                dataJud.processo = compactDataJudProcesso(processo);
            }
        } catch (err: any) {
            dataJud.error = err?.message || String(err);
        }
    }

    return {
        ok: true,
        mode: 'read_only_plan',
        dryRun: true,
        numero,
        tribunal: {
            selected: tribunal,
            requested: requestedTribunal,
            inferredFromCnj: inferredTribunal,
            active: activeTribunal,
            preferred: preferredTribunal,
        },
        routes: {
            loginUrl: routes.loginUrl,
            consultaUrl: routes.consultaUrl,
        },
        pje: {
            status,
            connected: !!status?.connected,
            isPje: !!status?.isPje,
            activeMatchesTarget,
            needsBrowser: !status?.connected,
            needsNavigation: !status?.isPje || !activeMatchesTarget,
            needsAuthentication,
            authState: authState || null,
            surfaceKind: surfaceKind || null,
            browserAutomationExecuted: false,
        },
        dataJud,
        nextActions: [
            dataJud.found ? 'usar_dados_datajud' : 'se_necessario_consultar_pje',
            !status?.connected ? 'abrir_browser_pje_no_electron' : 'manter_browser_atual',
            !status?.isPje || !activeMatchesTarget ? `navegar_para_consulta:${routes.consultaUrl}` : 'usar_pje_aberto',
            needsAuthentication ? 'autenticar_no_pje_antes_de_consultar' : 'seguir_para_consulta_estruturada',
            'pedir_confirmacao_antes_de_automatizar_browser',
            'registrar_resultado_no_brain',
        ],
    };
}

async function handlePjeConsultarProcesso(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    try {
        const plan = await buildPjeConsultaPlan(payload);
        sendJson(res, 200, plan);
    } catch (err: any) {
        if (err?.message === 'invalid_cnj') {
            sendJson(res, 400, {
                ok: false,
                error: 'invalid_cnj',
                message: 'Informe um numero CNJ valido, ex: 0801234-56.2024.8.14.0301.',
            });
            return;
        }
        throw err;
    }
}

async function handlePjeAbrirConsulta(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const numero = normalizeCnj(payload?.numero);
    const status = await getPjeStatusSafe(5000);
    const requestedTribunal = normalizeTribunal(payload?.tribunal);
    const inferredTribunal = numero ? normalizeTribunal(inferTribunalFromCNJ(numero)) : '';
    const activeTribunal = normalizeTribunal(status?.tribunalAtivo);
    const preferredTribunal = normalizeTribunal(status?.tribunalPreferido);
    const tribunal = requestedTribunal || inferredTribunal || activeTribunal || preferredTribunal || 'TJPA';
    const routes = resolveTribunalRoutes(tribunal);
    const plan = numero
        ? await buildPjeConsultaPlan({ ...payload, numero, tribunal, includeDataJud: false })
        : {
            ok: true,
            mode: 'open_consulta_plan',
            dryRun: true,
            numero: null,
            tribunal: {
                selected: tribunal,
                requested: requestedTribunal,
                inferredFromCnj: inferredTribunal,
                active: activeTribunal,
                preferred: preferredTribunal,
            },
            routes,
            pje: {
                status,
                connected: !!status?.connected,
                isPje: !!status?.isPje,
                activeMatchesTarget: !!activeTribunal && activeTribunal === tribunal,
                needsBrowser: !status?.connected,
                needsNavigation: !status?.isPje || activeTribunal !== tribunal,
                needsAuthentication: false,
                authState: status?.environment?.authState || null,
                surfaceKind: status?.environment?.surfaceKind || null,
                browserAutomationExecuted: false,
            },
            nextActions: ['abrir_tela_consulta_pje', 'aguardar_numero_cnj_para_preencher'],
        };

    const confirmation = {
        accepted: true,
        choice: 'accept' as TerminalConfirmationChoice,
        always: false,
        autoApproved: true,
        reason: 'Navegacao segura: abrir tela de consulta sem preencher campos ou praticar ato.',
    };

    let navigation: any;
    try {
        navigation = await rpcCall('pje-open-url', { url: routes.consultaUrl }, { timeoutMs: 60000 });
    } catch (err: any) {
        if (!isRecoverableBrowserError(err)) throw err;
        await rpcCall('browser-reinit', {}, { timeoutMs: 20000 }).catch(() => undefined);
        navigation = await rpcCall('pje-open-url', { url: routes.consultaUrl }, { timeoutMs: 60000 });
    }
    sendJson(res, navigation?.ok === false ? 500 : 200, {
        ok: navigation?.ok !== false,
        accepted: true,
        confirmation,
        plan: {
            ...plan,
            pje: {
                ...plan.pje,
                browserAutomationExecuted: true,
            },
        },
        navigation,
    });
}

async function handlePjeInspecionarContexto(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const result = await rpcCall('pje-inspect-context', payload, { timeoutMs: 30000 });
    sendJson(res, 200, result);
}

async function handlePjeExplorarIntencao(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const task = optionalText(payload?.task, 2000);
    if (!task) {
        sendJson(res, 400, { ok: false, error: 'task_required', message: 'Informe a intencao/tarefa a explorar no PJe.' });
        return;
    }
    const result = await rpcCall('pje-explore-intent', { ...payload, task }, { timeoutMs: 30000 });
    sendJson(res, result?.ok === false ? 400 : 200, result);
}

async function handlePjeExecutarCandidatoIntencao(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const candidateRef = optionalText(payload?.candidateRef, 200);
    if (!candidateRef) {
        sendJson(res, 400, { ok: false, error: 'candidate_ref_required', message: 'Informe candidateRef para executar um candidato.' });
        return;
    }

    const dryRun = payload?.dryRun !== false;
    if (dryRun) {
        const result = await rpcCall('pje-execute-intent-candidate', { ...payload, candidateRef, dryRun: true }, { timeoutMs: 30000 });
        sendJson(res, result?.ok === false ? 400 : 200, result);
        return;
    }

    const preview = await rpcCall('pje-execute-intent-candidate', { ...payload, candidateRef, dryRun: true }, { timeoutMs: 30000 });
    if (preview?.ok === false) {
        sendJson(res, 400, preview);
        return;
    }

    const candidate = preview?.candidate || {};
    const confirmation = await requestTerminalConfirmation({
        title: 'Executar candidato de exploracao PJe',
        message: `Executar o candidato ${candidateRef}?`,
        detail: `Acao sugerida: ${candidate?.suggestedAction || 'click'}\nLabel: ${candidate?.label || '(sem label)'}\nSecao: ${Array.isArray(candidate?.sectionPath) ? candidate.sectionPath.join(' > ') : '(nao informada)'}\n\nA Lex vai executar apenas este passo pequeno e reinspecionar a tela depois. Ela nao vai seguir automaticamente com outros cliques, downloads ou atos.`,
        confirmLabel: 'Executar candidato',
        cancelLabel: 'Negar',
        level: 'warning',
    });

    if (!confirmation.accepted) {
        sendJson(res, 200, {
            ok: true,
            accepted: false,
            confirmation,
            dryRun: false,
            preview,
            result: null,
        });
        return;
    }

    const result = await rpcCall('pje-execute-intent-candidate', {
        ...payload,
        candidateRef,
        dryRun: false,
    }, { timeoutMs: 45000 });

    sendJson(res, result?.ok === false ? 500 : 200, {
        ...result,
        accepted: true,
        confirmation,
        preview,
    });
}

function scoreIntentCandidate(candidate: any): number {
    const role = String(candidate?.role || '').trim();
    const action = String(candidate?.suggestedAction || '').trim();
    const label = String(candidate?.label || '').toLowerCase();
    let score = 0;

    if (role === 'autos_download_detected') score += 200;
    if (role === 'primary_export_candidate') score += 120;
    if (role === 'secondary_export_candidate') score += 90;

    if (action === 'expand') score += 80;
    if (action === 'download') score += 70;
    if (action === 'click') score += 40;

    if (/autos do processo|autos completos|processo inteiro|processo completo|download autos/i.test(label)) score += 120;
    if (/download|baixar|exportar|imprimir|pdf/i.test(label)) score += 35;
    if (/menu|outras acoes|mais opcoes|mostrar|expandir/i.test(label)) score += 25;

    return score;
}

function pickBestIntentCandidate(exploration: any, usedRefs = new Set<string>()): any | null {
    const domCandidates = Array.isArray(exploration?.guidance?.explorationPlan?.domCandidates)
        ? exploration.guidance.explorationPlan.domCandidates
        : [];
    const best = [...domCandidates]
        .filter((candidate: any) => {
        const ref = typeof candidate?.ref === 'string' ? candidate.ref.trim() : '';
        return ref && !usedRefs.has(ref);
        })
        .sort((a: any, b: any) => scoreIntentCandidate(b) - scoreIntentCandidate(a))[0];
    return best || null;
}

async function confirmIntentCandidateStep(stepNumber: number, totalSteps: number, task: string, candidate: any): Promise<boolean> {
    const confirmation = await requestTerminalConfirmation({
        title: 'Executar passo de exploracao PJe',
        message: `Executar o passo ${stepNumber} de ${totalSteps}?`,
        detail: `Objetivo: ${task}\nCandidato: ${candidate?.ref || '(sem ref)'}\nAcao sugerida: ${candidate?.suggestedAction || 'click'}\nLabel: ${candidate?.label || '(sem label)'}\nMotivo: ${candidate?.reason || '(nao informado)'}\n\nA Lex vai executar apenas este passo e reinspecionar a tela depois. Ela nao vai continuar automaticamente sem nova confirmacao.`,
        confirmLabel: 'Executar este passo',
        cancelLabel: 'Negar',
        level: 'warning',
    });
    return confirmation.accepted;
}

async function handlePjeExecutarIntencaoIncremental(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const task = optionalText(payload?.task, 2000);
    if (!task) {
        sendJson(res, 400, { ok: false, error: 'task_required', message: 'Informe a intencao/tarefa a executar incrementalmente no PJe.' });
        return;
    }

    const dryRun = payload?.dryRun !== false;
    const maxSteps = boundedNumber(payload?.maxSteps, 2, 1, 3);

    if (dryRun) {
        const preview = await rpcCall('pje-explore-intent', { ...payload, task }, { timeoutMs: 30000 });
        sendJson(res, preview?.ok === false ? 400 : 200, {
            ok: preview?.ok !== false,
            mode: 'dry_run_incremental_intent_execution',
            dryRun: true,
            task,
            maxSteps,
            preview,
        });
        return;
    }

    const steps: any[] = [];
    const usedRefs = new Set<string>();
    let lastExploration: any = null;
    let stopReason = 'max_steps_reached';

    for (let stepNumber = 1; stepNumber <= maxSteps; stepNumber += 1) {
        const exploration = await rpcCall('pje-explore-intent', { ...payload, task }, { timeoutMs: 30000 });
        lastExploration = exploration;
        if (exploration?.ok === false) {
            stopReason = 'exploration_failed';
            steps.push({
                stepNumber,
                ok: false,
                phase: 'exploration',
                error: exploration?.error || 'exploration_failed',
                message: exploration?.message || null,
            });
            break;
        }

        const candidate = pickBestIntentCandidate(exploration, usedRefs);
        if (!candidate) {
            stopReason = 'no_fresh_candidate';
            steps.push({
                stepNumber,
                ok: true,
                phase: 'selection',
                candidate: null,
                message: 'Nenhum candidato novo e confiavel foi encontrado para continuar a exploracao incremental.',
            });
            break;
        }

        const accepted = await confirmIntentCandidateStep(stepNumber, maxSteps, task, candidate);
        if (!accepted) {
            stopReason = 'user_cancelled_step';
            steps.push({
                stepNumber,
                ok: true,
                phase: 'confirmation',
                candidate,
                accepted: false,
                message: 'Usuario cancelou a execucao deste passo incremental.',
            });
            break;
        }

        usedRefs.add(String(candidate.ref || '').trim());
        const execution = await rpcCall('pje-execute-intent-candidate', {
            task,
            candidateRef: candidate.ref,
            selectorHints: candidate.selectorHints,
            suggestedAction: candidate.suggestedAction,
            dryRun: false,
            waitAfterMs: payload?.waitAfterMs,
        }, { timeoutMs: 45000 });

        steps.push({
            stepNumber,
            ok: execution?.ok !== false,
            phase: 'execution',
            candidate,
            execution,
        });

        if (execution?.ok === false || execution?.click?.clicked !== true) {
            stopReason = 'candidate_execution_failed';
            break;
        }

        stopReason = stepNumber === maxSteps ? 'max_steps_reached' : 'ready_for_reinspection';
    }

    sendJson(res, 200, {
        ok: true,
        mode: 'incremental_intent_execution',
        dryRun: false,
        task,
        maxSteps,
        executedSteps: steps.length,
        stopReason,
        lastExploration,
        steps,
    });
}

async function handlePjePreencherNumero(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const dryRun = payload?.dryRun !== false;

    if (dryRun) {
        const result = await rpcCall('pje-fill-process-number', { ...payload, dryRun: true }, { timeoutMs: 30000 });
        sendJson(res, result?.ok === false ? 400 : 200, result);
        return;
    }

    const preview = await rpcCall('pje-fill-process-number', { ...payload, dryRun: true }, { timeoutMs: 30000 });
    if (preview?.ok === false) {
        sendJson(res, 400, preview);
        return;
    }

    const confirmation = {
        accepted: true,
        choice: 'accept' as TerminalConfirmationChoice,
        always: false,
        autoApproved: true,
        reason: 'Consulta segura: preencher apenas o numero do processo, sem praticar ato processual.',
    };

    const fill = await rpcCall('pje-fill-process-number', { ...payload, dryRun: false }, { timeoutMs: 30000 });
    sendJson(res, fill?.ok === false ? 500 : 200, {
        ...fill,
        accepted: true,
        confirmation,
        preview,
    });
}

async function handlePjeClicarConsultar(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const dryRun = payload?.dryRun !== false;

    if (dryRun) {
        const result = await rpcCall('pje-click-search', { ...payload, dryRun: true }, { timeoutMs: 30000 });
        sendJson(res, result?.ok === false ? 400 : 200, result);
        return;
    }

    const preview = await rpcCall('pje-click-search', { ...payload, dryRun: true }, { timeoutMs: 30000 });
    if (preview?.ok === false) {
        sendJson(res, 400, preview);
        return;
    }

    const candidate = preview?.selectedCandidate || {};
    const confirmation = {
        accepted: true,
        choice: 'accept' as TerminalConfirmationChoice,
        always: false,
        autoApproved: true,
        reason: 'Consulta segura: clicar apenas no botao Pesquisar/Consultar, sem abrir autos ou praticar ato processual.',
    };

    const click = await rpcCall('pje-click-search', {
        ...payload,
        candidateRef: payload?.candidateRef || candidate?.ref,
        dryRun: false,
    }, { timeoutMs: 45000 });

    sendJson(res, click?.ok === false ? 500 : 200, {
        ...click,
        accepted: true,
        confirmation,
        preview,
    });
}

async function handlePjeLerResultados(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const result = await rpcCall('pje-read-search-results', payload, { timeoutMs: 30000 });
    sendJson(res, result?.ok === false ? 400 : 200, result);
}

async function handlePjeLerAutos(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const result = await rpcCall('pje-read-autos', payload, { timeoutMs: 30000 });
    sendJson(res, result?.ok === false ? 400 : 200, result);
}

async function handlePjeBaixarDocumentoAtual(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const dryRun = payload?.dryRun !== false;
    const downloadDir = typeof payload?.downloadDir === 'string' && payload.downloadDir.trim()
        ? payload.downloadDir.trim()
        : path.join(app.getPath('downloads'), 'Lex PJe');

    if (dryRun) {
        const result = await rpcCall('pje-download-current-document', { ...payload, dryRun: true, downloadDir }, { timeoutMs: 30000 });
        sendJson(res, result?.ok === false ? 400 : 200, result);
        return;
    }

    if (!hasValidHermesHitlCapability(req)) {
        sendNativeHitlRequired(res);
        return;
    }

    const preview = await rpcCall('pje-download-current-document', { ...payload, dryRun: true, downloadDir }, { timeoutMs: 30000 });
    if (preview?.ok === false) {
        sendJson(res, 400, preview);
        return;
    }

    const confirmation = {
        accepted: true,
        choice: 'accept' as TerminalConfirmationChoice,
        via: 'hermes_tui',
    };

    const result = await rpcCall('pje-download-current-document', {
        ...payload,
        dryRun: false,
        downloadDir,
    }, { timeoutMs: 60000 });

    sendJson(res, 200, {
        ...result,
        accepted: true,
        confirmation,
        preview,
    });
}

async function handlePjeAnalisarDocumentoBaixado(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const downloadDir = typeof payload?.downloadDir === 'string' && payload.downloadDir.trim()
        ? payload.downloadDir.trim()
        : path.join(app.getPath('downloads'), 'Lex PJe');
    const result = await rpcCall('pje-analyze-downloaded-document', {
        ...payload,
        downloadDir,
    }, { timeoutMs: 45000 });
    sendJson(res, result?.ok === false ? 400 : 200, result);
}

async function handlePjeAbrirResultado(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const dryRun = payload?.dryRun !== false;

    if (dryRun) {
        const result = await rpcCall('pje-open-search-result', { ...payload, dryRun: true }, { timeoutMs: 30000 });
        sendJson(res, 200, result);
        return;
    }

    const preview = await rpcCall('pje-open-search-result', { ...payload, dryRun: true }, { timeoutMs: 30000 });
    if (preview?.ok === false) {
        sendJson(res, 200, preview);
        return;
    }

    const aceitarAviso = payload?.aceitarAviso === true;
    const candidate = preview?.selectedCandidate || {};
    const warning = preview?.existingWarning || {};
    const numero = String(payload?.numero || candidate?.processNumber || preview?.requestedNumber || 'resultado selecionado').trim();
    const actionLabel = String(candidate?.selectedAction?.label || candidate?.selectedAction?.title || 'link do processo').trim();
    const warningPreview = String(warning?.text || '').trim();

    if (aceitarAviso && !hasValidHermesHitlCapability(req)) {
        sendNativeHitlRequired(res);
        return;
    }

    const confirmation = aceitarAviso
        ? {
            accepted: true,
            choice: 'accept' as TerminalConfirmationChoice,
            via: 'hermes_tui',
            action: `abrir_autos:${numero}`,
            warningDetected: Boolean(warningPreview),
        }
        : {
            accepted: true,
            choice: 'always' as TerminalConfirmationChoice,
            always: true,
            fromAlwaysAllow: true,
            autoApproved: true,
            reason: `Abrir apenas o link/aviso do processo ${numero}; nao aceitar aviso, nao baixar documentos e nao praticar ato.`,
        };

    if (!confirmation.accepted) {
        sendJson(res, 200, {
            ok: true,
            accepted: false,
            confirmation,
            dryRun: false,
            aceitarAviso,
            preview,
            result: null,
        });
        return;
    }

    const result = await rpcCall('pje-open-search-result', {
        ...payload,
        dryRun: false,
        aceitarAviso,
    }, { timeoutMs: 60000 });

    sendJson(res, 200, {
        ...result,
        accepted: true,
        confirmation,
        preview,
    });
}

async function handleConfirm(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const payload = await readJsonBody(req);
    const level = asLevel(payload?.level);
    const title = asText(payload?.title, 'Confirmar acao da Lex', 120);
    const message = asText(payload?.message, 'O Lex Engine solicitou uma confirmacao.', 2000);
    const detail = asText(payload?.detail, 'Confirme apenas se voce reconhece esta acao.', 3000);
    const confirmLabel = asText(payload?.confirmLabel, 'Confirmar', 60);
    const cancelLabel = asText(payload?.cancelLabel, 'Cancelar', 60);
    const requestId = typeof payload?.requestId === 'string' ? payload.requestId : undefined;

    const confirmation = await requestTerminalConfirmation({
        title,
        message,
        detail,
        confirmLabel,
        cancelLabel,
        level,
        allowAlways: level !== 'danger',
    });

    sendJson(res, 200, {
        ok: true,
        accepted: confirmation.accepted,
        response: confirmation.accepted ? 1 : 0,
        confirmation,
        requestId,
    });
}

export function getLexDesktopBridgeState(): LexDesktopBridgeState {
    return { ...state };
}

export function startLexDesktopBridge(): LexDesktopBridgeState {
    if (server) return getLexDesktopBridgeState();

    server = http.createServer((req, res) => {
        const method = req.method || 'GET';
        const url = new URL(req.url || '/', state.url);

        if (method === 'GET' && url.pathname === '/health') {
            handleHealth(res).catch((err) => {
                sendJson(res, 500, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'GET' && url.pathname === '/pje/status') {
            handlePjeStatus(res).catch((err) => {
                sendJson(res, 500, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if ((method === 'GET' || method === 'POST') && url.pathname === '/browser/focus') {
            handleBrowserFocus(res).catch((err) => {
                sendJson(res, 500, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/consultar-processo') {
            handlePjeConsultarProcesso(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/abrir-consulta') {
            handlePjeAbrirConsulta(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/inspecionar-contexto') {
            handlePjeInspecionarContexto(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/explorar-intencao') {
            handlePjeExplorarIntencao(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/executar-candidato-intencao') {
            handlePjeExecutarCandidatoIntencao(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/executar-intencao-incremental') {
            handlePjeExecutarIntencaoIncremental(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/preencher-numero') {
            handlePjePreencherNumero(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/clicar-consultar') {
            handlePjeClicarConsultar(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/ler-resultados') {
            handlePjeLerResultados(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/ler-autos') {
            handlePjeLerAutos(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/baixar-documento-atual') {
            handlePjeBaixarDocumentoAtual(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/analisar-documento-baixado') {
            handlePjeAnalisarDocumentoBaixado(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/pje/abrir-resultado') {
            handlePjeAbrirResultado(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/confirm') {
            handleConfirm(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/brain/search') {
            handleBrainSearch(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/brain/flows') {
            handleBrainFlows(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/brain/flow') {
            handleBrainGetFlow(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        if (method === 'POST' && url.pathname === '/brain/record-observation') {
            handleBrainRecordObservation(req, res).catch((err) => {
                const code = err?.message === 'invalid_json_body' ? 400 : 500;
                sendJson(res, code, { ok: false, error: err?.message || String(err) });
            });
            return;
        }

        notFound(res);
    });

    server.on('error', (err) => {
        state = { ...state, running: false };
        console.warn('[LexDesktopBridge] Falha:', (err as Error).message);
    });

    server.listen(DEFAULT_PORT, '127.0.0.1', () => {
        state = {
            running: true,
            port: DEFAULT_PORT,
            url: `http://127.0.0.1:${DEFAULT_PORT}`,
        };
        console.log(`[LexDesktopBridge] Ouvindo em ${state.url}`);
    });

    return getLexDesktopBridgeState();
}

export function stopLexDesktopBridge(): void {
    if (!server) return;
    const current = server;
    server = null;
    current.close();
    state = { ...state, running: false };
}
