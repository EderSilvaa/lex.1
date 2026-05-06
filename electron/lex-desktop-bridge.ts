import { app, BrowserWindow, dialog } from 'electron';
import * as http from 'http';
import * as path from 'path';
import { rpcCall } from './backend-client';
import { getLexEngineStatus } from './lex-engine';
import { inferTribunalFromCNJ } from './datajud/datajud-client';
import { normalizeTribunalCode, resolveTribunalRoutes } from './pje/tribunal-urls';

export interface LexDesktopBridgeState {
    running: boolean;
    port: number;
    url: string;
}

const DEFAULT_PORT = Number(process.env['LEX_DESKTOP_BRIDGE_PORT'] || 32179);
const MAX_JSON_BODY_BYTES = 64 * 1024;

type ConfirmationLevel = 'info' | 'warning' | 'danger';

let server: http.Server | null = null;
let state: LexDesktopBridgeState = {
    running: false,
    port: DEFAULT_PORT,
    url: `http://127.0.0.1:${DEFAULT_PORT}`,
};

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

function asLevel(value: unknown): ConfirmationLevel {
    if (value === 'danger' || value === 'warning' || value === 'info') return value;
    return 'warning';
}

function dialogTypeFor(level: ConfirmationLevel): Electron.MessageBoxOptions['type'] {
    if (level === 'danger' || level === 'warning') return 'warning';
    return 'question';
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
    let status: any;
    try {
        status = await rpcCall('browser-check-pje', {}, { timeoutMs: 10000 });
    } catch (err: any) {
        status = {
            connected: false,
            isPje: false,
            url: null,
            tribunalAtivo: null,
            tribunalPreferido: null,
            error: err?.message || String(err),
        };
    }
    sendJson(res, 200, {
        ok: true,
        mode: 'read_only',
        status,
    });
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

    const status = await rpcCall('browser-check-pje', {}, { timeoutMs: 10000 });
    const requestedTribunal = normalizeTribunal(payload?.tribunal);
    const inferredTribunal = normalizeTribunal(inferTribunalFromCNJ(numero));
    const activeTribunal = normalizeTribunal(status?.tribunalAtivo);
    const preferredTribunal = normalizeTribunal(status?.tribunalPreferido);
    const tribunal = requestedTribunal || inferredTribunal || activeTribunal || preferredTribunal || 'TJPA';
    const routes = resolveTribunalRoutes(tribunal);
    const activeMatchesTarget = !!activeTribunal && activeTribunal === tribunal;
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
            browserAutomationExecuted: false,
        },
        dataJud,
        nextActions: [
            dataJud.found ? 'usar_dados_datajud' : 'se_necessario_consultar_pje',
            !status?.connected ? 'abrir_browser_pje_no_electron' : 'manter_browser_atual',
            !status?.isPje || !activeMatchesTarget ? `navegar_para_consulta:${routes.consultaUrl}` : 'usar_pje_aberto',
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
    let plan: any;
    try {
        plan = await buildPjeConsultaPlan({ ...payload, includeDataJud: false });
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

    const owner = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = owner
        ? await dialog.showMessageBox(owner, {
            type: 'question',
            title: 'Abrir consulta no PJe',
            message: `Abrir consulta do processo ${plan.numero}?`,
            detail: `Tribunal: ${plan.tribunal.selected}\nURL: ${plan.routes.consultaUrl}\n\nA Lex vai apenas abrir/navegar para a tela de consulta. Nenhum campo sera preenchido e nenhum ato sera praticado.`,
            buttons: ['Cancelar', 'Abrir consulta'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
            normalizeAccessKeys: true,
        })
        : await dialog.showMessageBox({
            type: 'question',
            title: 'Abrir consulta no PJe',
            message: `Abrir consulta do processo ${plan.numero}?`,
            detail: `Tribunal: ${plan.tribunal.selected}\nURL: ${plan.routes.consultaUrl}\n\nA Lex vai apenas abrir/navegar para a tela de consulta. Nenhum campo sera preenchido e nenhum ato sera praticado.`,
            buttons: ['Cancelar', 'Abrir consulta'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
            normalizeAccessKeys: true,
        });

    if (result.response !== 1) {
        sendJson(res, 200, {
            ok: true,
            accepted: false,
            plan,
            navigation: null,
        });
        return;
    }

    const navigation = await rpcCall('pje-open-url', { url: plan.routes.consultaUrl }, { timeoutMs: 60000 });
    sendJson(res, navigation?.ok === false ? 500 : 200, {
        ok: navigation?.ok !== false,
        accepted: true,
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

    const numero = preview?.numero || String(payload?.numero || '').trim();
    const fieldLines = Array.isArray(preview?.fields)
        ? preview.fields
            .map((field: any) => `${field.label || field.key}: ${field.value}`)
            .join('\n')
        : '';

    const owner = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const options: Electron.MessageBoxOptions = {
        type: 'question',
        title: 'Preencher numero do processo no PJe',
        message: `Preencher o numero ${numero}?`,
        detail: `A Lex vai preencher apenas os campos segmentados do numero do processo.\n\n${fieldLines}\n\nEla nao vai clicar em Consultar/Pesquisar e nao vai praticar ato processual.`,
        buttons: ['Cancelar', 'Preencher numero'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        normalizeAccessKeys: true,
    };

    const confirmation = owner
        ? await dialog.showMessageBox(owner, options)
        : await dialog.showMessageBox(options);

    if (confirmation.response !== 1) {
        sendJson(res, 200, {
            ok: true,
            accepted: false,
            dryRun: false,
            preview,
            fill: null,
        });
        return;
    }

    const fill = await rpcCall('pje-fill-process-number', { ...payload, dryRun: false }, { timeoutMs: 30000 });
    sendJson(res, fill?.ok === false ? 500 : 200, {
        ...fill,
        accepted: true,
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
    const candidateLabel = String(candidate?.label || candidate?.id || candidate?.name || 'Pesquisar/Consultar').trim();
    const criteriaLines = Array.isArray(preview?.effectiveCriteria)
        ? preview.effectiveCriteria
            .slice(0, 8)
            .map((criterion: any) => `${criterion.label || criterion.id || criterion.name || 'campo'}: ${criterion.value}`)
            .join('\n')
        : '';

    const owner = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const options: Electron.MessageBoxOptions = {
        type: 'warning',
        title: 'Consultar no PJe',
        message: `Clicar em "${candidateLabel}" no PJe?`,
        detail: `A Lex vai clicar uma vez no botao de consulta/pesquisa da tela atual.\n\nCriterios detectados:\n${criteriaLines || '(nenhum criterio detalhado)'}\n\nEla nao vai abrir resultado, baixar documentos, protocolar peticao ou praticar ato processual alem desta consulta.`,
        buttons: ['Cancelar', 'Clicar em consultar'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        normalizeAccessKeys: true,
    };

    const confirmation = owner
        ? await dialog.showMessageBox(owner, options)
        : await dialog.showMessageBox(options);

    if (confirmation.response !== 1) {
        sendJson(res, 200, {
            ok: true,
            accepted: false,
            dryRun: false,
            preview,
            click: null,
        });
        return;
    }

    const click = await rpcCall('pje-click-search', {
        ...payload,
        candidateRef: payload?.candidateRef || candidate?.ref,
        dryRun: false,
    }, { timeoutMs: 45000 });

    sendJson(res, click?.ok === false ? 500 : 200, {
        ...click,
        accepted: true,
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

    const preview = await rpcCall('pje-download-current-document', { ...payload, dryRun: true, downloadDir }, { timeoutMs: 30000 });
    if (preview?.ok === false) {
        sendJson(res, 400, preview);
        return;
    }

    const documentTitle = String(preview?.inspection?.document?.title || 'documento atual').trim();
    const processNumber = String(preview?.inspection?.processNumber || 'processo atual').trim();
    const owner = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const options: Electron.MessageBoxOptions = {
        type: 'warning',
        title: 'Baixar documento do PJe',
        message: `Baixar o documento atual "${documentTitle}"?`,
        detail: `Processo: ${processNumber}\nDestino: ${downloadDir}\n\nA Lex vai clicar apenas em "Download do documento" no visualizador atual. Ela NAO vai baixar autos completos, nao vai peticionar e nao vai executar outro ato.`,
        buttons: ['Cancelar', 'Baixar documento atual'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        normalizeAccessKeys: true,
    };

    const confirmation = owner
        ? await dialog.showMessageBox(owner, options)
        : await dialog.showMessageBox(options);

    if (confirmation.response !== 1) {
        sendJson(res, 200, {
            ok: true,
            accepted: false,
            dryRun: false,
            preview,
            result: null,
        });
        return;
    }

    const result = await rpcCall('pje-download-current-document', {
        ...payload,
        dryRun: false,
        downloadDir,
    }, { timeoutMs: 60000 });

    sendJson(res, 200, {
        ...result,
        accepted: true,
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

    const owner = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const options: Electron.MessageBoxOptions = aceitarAviso
        ? {
            type: 'warning',
            title: 'Entrar nos autos do PJe',
            message: `Aceitar o aviso e abrir os autos do processo ${numero}?`,
            detail: `A Lex vai clicar em Continuar/Aceitar no aviso do PJe para entrar nos autos.\n\nIsso pode ficar registrado no PJe como acesso/visualizacao do processo pelo usuario logado.\n\nAviso detectado:\n${warningPreview || '(a Lex tentara localizar o aviso apos clicar no link do processo)'}`,
            buttons: ['Cancelar', 'Aceitar aviso e abrir autos'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
            normalizeAccessKeys: true,
        }
        : {
            type: 'warning',
            title: 'Abrir aviso do processo no PJe',
            message: `Abrir o aviso/modal do processo ${numero}?`,
            detail: `A Lex vai clicar apenas no link do processo (${actionLabel}) e parar no aviso do PJe.\n\nEla NAO vai clicar em Continuar/Aceitar, nao vai baixar documentos, nao vai peticionar e nao vai praticar outro ato processual.`,
            buttons: ['Cancelar', 'Abrir apenas o aviso'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
            normalizeAccessKeys: true,
        };

    const confirmation = owner
        ? await dialog.showMessageBox(owner, options)
        : await dialog.showMessageBox(options);

    if (confirmation.response !== 1) {
        sendJson(res, 200, {
            ok: true,
            accepted: false,
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

    const options: Electron.MessageBoxOptions = {
        type: dialogTypeFor(level),
        title,
        message,
        detail,
        buttons: [cancelLabel, confirmLabel],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        normalizeAccessKeys: true,
    };

    const owner = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = owner
        ? await dialog.showMessageBox(owner, options)
        : await dialog.showMessageBox(options);

    sendJson(res, 200, {
        ok: true,
        accepted: result.response === 1,
        response: result.response,
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
