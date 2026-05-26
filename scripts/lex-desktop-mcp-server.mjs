#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const bridgeUrl = (process.env.LEX_DESKTOP_BRIDGE_URL || 'http://127.0.0.1:32179').replace(/\/+$/, '');
const bridgeDefaultTimeoutMs = boundedNumber(process.env.LEX_DESKTOP_MCP_TIMEOUT_MS, 30000, 5000, 300000);
const bridgeLongTimeoutMs = boundedNumber(process.env.LEX_DESKTOP_MCP_LONG_TIMEOUT_MS, 120000, 10000, 300000);
const payloadShadowEnabled = !['0', 'false', 'off', 'no', 'nao'].includes(
  String(process.env.LEX_MCP_PAYLOAD_SHADOW || '1').trim().toLowerCase()
);
const payloadShadowWarnChars = boundedNumber(process.env.LEX_MCP_PAYLOAD_WARN_CHARS, 12000, 1000, 1000000);
const payloadShadowLogAllToStderr = boolParam(process.env.LEX_MCP_PAYLOAD_LOG_STDERR, false);
const intentToolsEnabled = boolParam(process.env.LEX_MCP_ENABLE_INTENT_TOOLS, false);
const legacyConfirmEnabled = boolParam(process.env.LEX_MCP_ENABLE_LEGACY_CONFIRM, false);
const internalHitlCapabilityArg = '_lexHitlCapability';
const payloadShadowLogPath = process.env.LEX_MCP_PAYLOAD_LOG
  || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Lex', 'logs', 'mcp-payload-shadow.jsonl');
let payloadShadowFileDisabled = false;
const brainNodeTypes = [
  'processo',
  'tese',
  'parte',
  'aprendizado',
  'tribunal',
  'selector',
  'prazo',
  'decisao',
  'page_state',
  'action',
  'flow',
];
const observationStateSchema = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
  domHash: z.string().optional(),
  tribunal: z.string().optional(),
  pjeContext: z.string().optional(),
  canonicalUrl: z.string().optional(),
  canonicalContext: z.string().optional(),
  canonicalStateKey: z.string().optional(),
  profileKind: z.string().optional(),
  authState: z.string().optional(),
  surfaceKind: z.string().optional(),
  screenFamily: z.string().optional(),
  areaLabel: z.string().optional(),
  affordances: z.array(z.string()).optional(),
  canonicalEnvironmentKey: z.string().optional(),
  environment: z.object({
    isPje: z.boolean().optional(),
    tribunal: z.string().optional(),
    pjeContext: z.string().optional(),
    canonicalContext: z.string().optional(),
    profileKind: z.string().optional(),
    authState: z.string().optional(),
    surfaceKind: z.string().optional(),
    screenFamily: z.string().optional(),
    areaLabel: z.string().optional(),
    affordances: z.array(z.string()).optional(),
    canonicalEnvironmentKey: z.string().optional(),
    contextSummary: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

const longBridgePaths = new Set([
  '/pje/abrir-consulta',
  '/pje/ler-autos',
  '/pje/baixar-documento-atual',
  '/pje/analisar-documento-baixado',
]);

const bridgePathTimeoutMs = new Map([
  ['/pje/status', 20000],
  ['/pje/preencher-numero', 15000],
  ['/pje/clicar-consultar', 20000],
  ['/pje/ler-resultados', 15000],
  ['/pje/inspecionar-contexto', 20000],
  ['/pje/explorar-intencao', 15000],
  ['/pje/executar-candidato-intencao', 25000],
  ['/pje/executar-intencao-incremental', 25000],
  ['/pje/abrir-resultado', 45000],
  ['/confirm', 180000],
]);

function asInputRecord(value) {
  return value && typeof value === 'object' ? value : {};
}

function boolParam(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['false', '0', 'nao', 'no'].includes(text)) return false;
  if (['true', '1', 'sim', 'yes'].includes(text)) return true;
  return defaultValue;
}

function boundedNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function extractHitlAuthorization(input) {
  const record = asInputRecord(input);
  const capability = typeof record[internalHitlCapabilityArg] === 'string'
    ? record[internalHitlCapabilityArg].trim()
    : '';
  const { [internalHitlCapabilityArg]: _ignored, ...payload } = record;
  return {
    capability,
    payload,
    headers: capability ? { 'x-lex-hitl-capability': capability } : {},
  };
}

function getBridgeTimeoutMs(pathname) {
  const pathTimeout = bridgePathTimeoutMs.get(pathname);
  if (pathTimeout) return pathTimeout;
  return longBridgePaths.has(pathname) ? bridgeLongTimeoutMs : bridgeDefaultTimeoutMs;
}

async function fetchBridge(pathname, options = {}) {
  const timeoutMs = getBridgeTimeoutMs(pathname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${bridgeUrl}${pathname}`, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error(`Lex Desktop bridge timeout after ${Math.round(timeoutMs / 1000)}s on ${pathname}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function wantsFullPayload(input) {
  const record = asInputRecord(input);
  return boolParam(record.includeRaw, false) || boolParam(record.includeDebug, false);
}

function truncateText(value, max = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return Array.from(new Set(asArray(values).map((value) => String(value || '').trim()).filter(Boolean)));
}

function compactTextList(values, limit = 5, max = 120) {
  return asArray(values).slice(0, limit).map((value) => truncateText(value, max)).filter(Boolean);
}

function compactPageSummary(page) {
  if (!page || typeof page !== 'object') return null;
  const environment = compactEnvironment(page.environment || page);
  return {
    pageId: page.pageId,
    pageIndex: page.pageIndex,
    active: page.active,
    isPje: page.isPje,
    tribunal: page.tribunal || null,
    pjeContext: page.pjeContext || page.canonicalContext || null,
    url: truncateText(page.url, 180),
    title: truncateText(page.title, 140),
    frameCount: page.frameCount,
    interactiveElementCount: page.interactiveElementCount,
    contextSummary: truncateText(page.contextSummary || environment?.contextSummary, 160) || null,
    environment,
  };
}

function compactEnvironment(value) {
  if (!value || typeof value !== 'object') return null;
  const environment = {
    isPje: value.isPje === true,
    tribunal: truncateText(value.tribunal, 40) || undefined,
    pjeContext: truncateText(value.pjeContext || value.canonicalContext, 120) || undefined,
    canonicalContext: truncateText(value.canonicalContext, 120) || undefined,
    profileKind: truncateText(value.profileKind, 40) || undefined,
    authState: truncateText(value.authState, 40) || undefined,
    surfaceKind: truncateText(value.surfaceKind, 80) || undefined,
    screenFamily: truncateText(value.screenFamily, 80) || undefined,
    areaLabel: truncateText(value.areaLabel, 120) || undefined,
    affordances: uniqueStrings(value.affordances || []).slice(0, 8),
    canonicalEnvironmentKey: truncateText(value.canonicalEnvironmentKey, 220) || undefined,
    contextSummary: truncateText(value.contextSummary, 180) || undefined,
  };
  return Object.values(environment).some((entry) => entry !== undefined && entry !== false && !(Array.isArray(entry) && entry.length === 0))
    ? environment
    : null;
}

function compactCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    ref: candidate.ref,
    kind: candidate.kind,
    candidateKinds: compactTextList(candidate.candidateKinds, 4, 80),
    label: truncateText(candidate.label, 120),
    id: truncateText(candidate.id, 100),
    name: truncateText(candidate.name, 100),
    placeholder: truncateText(candidate.placeholder, 100),
    selectorHints: compactTextList(candidate.selectorHints, 2, 140),
  };
}

function compactWorldtreeNode(node) {
  if (!node || typeof node !== 'object') return null;
  return {
    ref: node.ref,
    frameId: node.frameId,
    framePath: compactTextList(node.framePath, 4, 80),
    kind: node.kind,
    tag: node.tag,
    type: node.type,
    label: truncateText(node.label, 120),
    id: truncateText(node.id, 100),
    formId: truncateText(node.formId, 100),
    sectionPath: compactTextList(node.sectionPath, 4, 100),
    candidateKinds: compactTextList(node.candidateKinds, 6, 80),
    interactionHints: compactTextList(node.interactionHints, 6, 80),
    jsfHints: compactTextList(node.jsfHints, 6, 80),
    ajaxHints: compactTextList(node.ajaxHints, 6, 80),
    selectorHints: compactTextList(node.selectorHints, 3, 140),
    disabled: !!node.disabled,
    inViewport: !!node.inViewport,
  };
}

function compactWorldtreeFrame(frame) {
  if (!frame || typeof frame !== 'object') return null;
  return {
    frameId: frame.frameId,
    frameIndex: frame.frameIndex,
    parentFrameIndex: frame.parentFrameIndex,
    depth: frame.depth,
    title: truncateText(frame.title, 120),
    url: truncateText(frame.url, 180),
    sectionHints: compactTextList(frame.sectionHints, 6, 100),
    jsfHints: compactTextList(frame.jsfHints, 6, 80),
    ajaxHints: compactTextList(frame.ajaxHints, 6, 80),
    interactiveElementCount: frame.interactiveElementCount,
  };
}

function compactAction(action) {
  if (!action || typeof action !== 'object') return null;
  return {
    actionIndex: action.actionIndex,
    tag: action.tag,
    type: action.type,
    label: truncateText(action.label, 140),
    title: truncateText(action.title, 120),
    href: truncateText(action.href, 180),
    score: action.score,
    signals: compactTextList(action.signals, 6, 80),
  };
}

function compactResultCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    resultNumber: candidate.resultNumber,
    frameIndex: candidate.frameIndex,
    tableIndex: candidate.tableIndex,
    rowIndex: candidate.rowIndex,
    processNumber: candidate.processNumber || null,
    score: candidate.score,
    signals: compactTextList(candidate.signals, 6, 80),
    cellsPreview: compactTextList(candidate.cells, 5, 140),
    selectedAction: compactAction(candidate.selectedAction),
    actionCount: asArray(candidate.actions).length,
  };
}

function compactAccessWarning(warning) {
  if (!warning || typeof warning !== 'object') return null;
  return {
    frameIndex: warning.frameIndex,
    dialogIndex: warning.dialogIndex,
    score: warning.score,
    signals: compactTextList(warning.signals, 6, 80),
    text: truncateText(warning.text, 260),
    selectedAcceptAction: compactAction(warning.selectedAcceptAction),
    actionCount: asArray(warning.actions).length,
  };
}

function compactClickResult(click) {
  if (!click || typeof click !== 'object') return null;
  return {
    ok: click.ok,
    clicked: click.clicked,
    method: click.method,
    actionIndex: click.actionIndex,
    label: truncateText(click.label, 140),
    title: truncateText(click.title, 120),
    href: truncateText(click.href, 180),
    score: click.score,
    error: click.error,
    message: truncateText(click.message, 220),
    newPageOpened: click.newPageOpened,
    activePage: compactPageSummary(click.activePage),
  };
}

function compactRecord(record) {
  if (!record || typeof record !== 'object') return {};
  const entries = Object.entries(record);
  const selected = entries.filter(([key]) => {
    const normalizedKey = String(key)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return /(processo|numero|classe|orgao|polo|parte|assunto|autuado|ultima|movimenta|data)/.test(normalizedKey);
  });
  const source = selected.length ? selected : entries.slice(0, 6);
  return Object.fromEntries(source.slice(0, 8).map(([key, value]) => [truncateText(key, 80), truncateText(value, 180)]));
}

function compactSearchResultRow(row, index) {
  if (!row || typeof row !== 'object') return null;
  return {
    resultadoIndex: index + 1,
    rowIndex: row.rowIndex,
    processNumber: row.processNumber || null,
    record: compactRecord(row.record),
    cellsPreview: compactTextList(row.cells, 5, 140),
    linkCount: asArray(row.links).length,
    actionCount: asArray(row.actions).length,
  };
}

function compactFillField(field) {
  if (!field || typeof field !== 'object') return null;
  return {
    key: field.key,
    label: truncateText(field.label, 80),
    found: !!field.found,
    filled: !!field.filled,
    selector: truncateText(field.selector, 180),
    frameUrl: truncateText(field.frameUrl, 160),
    error: truncateText(field.error, 120),
  };
}

function compactSearchCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    ref: candidate.ref,
    frameIndex: candidate.frameIndex,
    tag: candidate.tag,
    type: candidate.type,
    label: truncateText(candidate.label, 120),
    id: truncateText(candidate.id, 120),
    name: truncateText(candidate.name, 120),
    selector: truncateText(candidate.selector, 180),
    score: candidate.score,
    reason: compactTextList(candidate.reason, 6, 80),
  };
}

function compactSearchCriterion(criterion) {
  if (!criterion || typeof criterion !== 'object') return null;
  return {
    frameIndex: criterion.frameIndex,
    tag: criterion.tag,
    type: criterion.type,
    label: truncateText(criterion.label, 100),
    id: truncateText(criterion.id, 120),
    name: truncateText(criterion.name, 120),
    countsAsSearchCriterion: !!criterion.countsAsSearchCriterion,
    valuePresent: !!truncateText(criterion.value, 20),
  };
}

function compactNextActions(nextActions, fallback = []) {
  const actions = asArray(nextActions).length ? nextActions : fallback;
  return compactTextList(actions, 5, 120);
}

function discoveryActionForMode(mode) {
  switch (mode) {
    case 'read_only_search_results':
      return 'reexecutar_pje_ler_resultados_com_includeRaw_true';
    case 'open_search_result':
      return 'reexecutar_pje_inspecionar_contexto_com_includeRaw_true_antes_de_novo_clique';
    case 'read_only_inspection':
    default:
      return 'reexecutar_pje_inspecionar_contexto_com_includeRaw_true_e_limites_maiores';
  }
}

function compactNextActionsWithDiscovery(nextActions, fallback, discoveryRecommended, discoveryAction) {
  const base = compactNextActions(nextActions, fallback);
  if (!discoveryRecommended) return base;
  return compactTextList(uniqueStrings([discoveryAction, ...base]), 6, 120);
}

function shouldRecommendDiscoveryForError(error) {
  return !['no_active_page', 'not_pje_page', 'browser_context_unavailable'].includes(error);
}

function inferTribunalFromUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const compact = host.replace(/[-.]/g, '');
    const match = compact.match(/(tj[a-z]{2}|trt\d{1,2}|trf\d|tre[a-z]{2}|tst|stj|stf)/i);
    if (match?.[1]) return match[1].toUpperCase();
    if (host.includes('tjpa.jus.br')) return 'TJPA';
  } catch {
    // Ignore malformed page URLs from browser snapshots.
  }
  return null;
}

function inferPjeContextFromPage(page) {
  const haystack = `${page?.url || ''} ${page?.title || ''}`.toLowerCase();
  if (/consulta|consultaprocesso|processo/.test(haystack)) return 'consulta';
  if (/login|logon|sso|autentic/.test(haystack)) return 'login';
  if (/painel|dashboard|mesa/.test(haystack)) return 'painel';
  if (/portal-pje|portalexterno|apresentacao|pje/.test(haystack)) return 'portal_pje';
  return null;
}

function observationStateFromPage(page) {
  if (!page || typeof page !== 'object') return null;
  const url = truncateText(page.url, 800);
  const title = truncateText(page.title, 300);
  if (!url && !title) return null;
  const tribunal = truncateText(page.tribunal, 40) || inferTribunalFromUrl(url);
  const environment = compactEnvironment(page.environment || page);
  const pjeContext = truncateText(page.pjeContext || page.canonicalContext || environment?.pjeContext, 120)
    || inferPjeContextFromPage({ url, title });
  return {
    url,
    title,
    tribunal: tribunal || undefined,
    pjeContext: pjeContext || undefined,
    canonicalContext: pjeContext || undefined,
    ...(environment?.profileKind ? { profileKind: environment.profileKind } : {}),
    ...(environment?.authState ? { authState: environment.authState } : {}),
    ...(environment?.surfaceKind ? { surfaceKind: environment.surfaceKind } : {}),
    ...(environment?.screenFamily ? { screenFamily: environment.screenFamily } : {}),
    ...(environment?.areaLabel ? { areaLabel: environment.areaLabel } : {}),
    ...(environment?.affordances?.length ? { affordances: environment.affordances } : {}),
    ...(environment?.canonicalEnvironmentKey ? { canonicalEnvironmentKey: environment.canonicalEnvironmentKey } : {}),
    ...(environment ? { environment } : {}),
  };
}

function activePageFromInspection(result) {
  const pages = asArray(result?.pages);
  return pages.find((page) => page?.active) || pages[0] || null;
}

function pageForKnownFlowLookup(result) {
  return activePageFromInspection(result)
    || result?.pageAfter
    || result?.openClick?.activePage
    || result?.pageBefore
    || result?.page
    || null;
}

function selectorsForObservation(toolName, result) {
  const selectors = [];
  if (toolName === 'pje_preencher_numero') {
    for (const field of asArray(result?.fields)) {
      if ((field?.filled || result?.dryRun) && typeof field?.selector === 'string') {
        selectors.push(field.selector);
      }
    }
  }
  if (result?.selectedCandidate?.selector) selectors.push(result.selectedCandidate.selector);
  if (result?.click?.selector) selectors.push(result.click.selector);
  return uniqueStrings(selectors).slice(0, 12);
}

function processNumberFromResult(input, result) {
  const candidates = [
    input?.numero,
    result?.numero,
    result?.requestedNumber,
    result?.selectedCandidate?.processNumber,
    result?.results?.[0]?.processNumber,
  ];
  for (const candidate of candidates) {
    const text = truncateText(candidate, 80);
    if (text) return text;
  }
  return '';
}

function buildObservationInput(toolName, input, result) {
  const record = { ...asInputRecord(input) };
  delete record.includeRaw;
  delete record.includeDebug;
  delete record.includeRawText;
  delete record.includeScreenshot;
  delete record.fullPageScreenshot;

  const selectors = selectorsForObservation(toolName, result);
  if (selectors.length > 0) {
    record.selectors = selectors;
    if (!record.selector) record.selector = selectors[0];
  }

  const numero = processNumberFromResult(record, result);
  if (numero) record.numero = numero;
  if (result?.resultadoIndex !== undefined) record.resultadoIndex = result.resultadoIndex;
  if (result?.mode) record.mode = result.mode;
  return record;
}

function buildObservationStates(result) {
  const beforePage = result?.pageBefore || result?.page || result?.openClick?.activePage || result?.activePage || null;
  const afterPage = result?.pageAfter || result?.openClick?.activePage || result?.activePage || result?.page || result?.pageBefore || null;
  return {
    before: observationStateFromPage(beforePage),
    after: observationStateFromPage(afterPage),
  };
}

function shouldRecordPjeObservation(toolName, input, result) {
  if (!['pje_preencher_numero', 'pje_clicar_consultar', 'pje_ler_resultados', 'pje_abrir_resultado', 'pje_ler_autos', 'pje_baixar_documento_atual', 'pje_analisar_documento_baixado'].includes(toolName)) {
    return false;
  }
  if (result?.dryRun === true) return false;
  const { before, after } = buildObservationStates(result);
  return !!before || !!after;
}

function summarizeObservationOutput(result) {
  return JSON.stringify({
    ok: result?.ok !== false,
    mode: result?.mode,
    error: result?.error,
    resultCount: result?.resultCount,
    reportedResultCount: result?.reportedResultCount,
    numero: result?.numero || result?.requestedNumber,
    browserAutomationExecuted: !!result?.browserAutomationExecuted,
    openedAutos: !!result?.openedAutos,
    warningDetected: !!(result?.warning || result?.existingWarning),
    nextActions: compactNextActions(result?.nextActions, []),
  });
}

function compactBrainRecordResult(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    recorded: result?.ok !== false,
    traceId: result?.traceId,
    recordedTool: result?.recorded?.tool,
    hasBefore: !!result?.recorded?.hasBefore,
    hasAfter: !!result?.recorded?.hasAfter,
    flowReport: result?.flowReport ? {
      flowsCreated: result.flowReport.flowsCreated,
      flowsUpdated: result.flowReport.flowsUpdated,
      detected: asArray(result.flowReport.detected).slice(0, 3).map((flow) => ({
        flowLabel: flow.flowLabel,
        instances: flow.instances,
        averageScore: flow.averageScore,
      })),
    } : null,
  };
}

async function recordPjeObservation(toolName, input, result, durationMs = 0) {
  if (!shouldRecordPjeObservation(toolName, input, result)) return null;
  const states = buildObservationStates(result);
  try {
    const recorded = await bridgePost('/brain/record-observation', {
      tool: toolName,
      server: 'lex-desktop-mcp',
      input: buildObservationInput(toolName, input, result),
      outputPreview: summarizeObservationOutput(result),
      success: result?.ok !== false,
      error: result?.ok === false ? (result?.error || 'pje_tool_failed') : undefined,
      durationMs,
      before: states.before || undefined,
      after: states.after || states.before || undefined,
      detectFlows: true,
      flowOptions: {
        minActions: 1,
        minInstances: 1,
        minEdgeWeight: 1,
      },
    });
    return compactBrainRecordResult(recorded);
  } catch (error) {
    return {
      recorded: false,
      error: truncateText(error?.message || String(error), 180),
    };
  }
}

async function getKnownFlowsForPage(page, limit = 3) {
  const state = observationStateFromPage(page);
  if (!state?.tribunal && !state?.pjeContext) return null;
  try {
    const result = await bridgePost('/brain/flows', { limit: 20 });
    const flows = asArray(result?.flows).filter((flow) => {
      const sameTribunal = !state.tribunal || String(flow?.tribunal || '').toUpperCase() === state.tribunal;
      const contexts = [flow?.pjeContext, flow?.canonicalContext].map((value) => String(value || '')).filter(Boolean);
      const sameContext = !state.pjeContext || contexts.includes(state.pjeContext);
      const sameProfile = !state.profileKind || !flow?.profileKind || String(flow.profileKind) === state.profileKind;
      const sameSurface = !state.surfaceKind || !flow?.surfaceKind || String(flow.surfaceKind) === state.surfaceKind;
      const sameScreenFamily = !state.screenFamily || !flow?.screenFamily || String(flow.screenFamily) === state.screenFamily;
      const sameArea = !state.areaLabel || !flow?.areaLabel || String(flow.areaLabel) === state.areaLabel;
      const sameEnvironment = !state.canonicalEnvironmentKey || !flow?.canonicalEnvironmentKey
        || String(flow.canonicalEnvironmentKey) === state.canonicalEnvironmentKey;
      return sameTribunal && sameContext && sameProfile && sameSurface && sameScreenFamily && sameArea && sameEnvironment;
    });
    if (flows.length === 0) return { count: 0, flows: [] };
    return {
      count: flows.length,
      flows: flows.slice(0, limit).map((flow) => ({
        flowId: flow.flowId,
        label: flow.label,
        tribunal: flow.tribunal,
        context: flow.canonicalContext || flow.pjeContext,
        profileKind: flow.profileKind,
        surfaceKind: flow.surfaceKind,
        screenFamily: flow.screenFamily,
        areaLabel: flow.areaLabel,
        canonicalEnvironmentKey: flow.canonicalEnvironmentKey,
        tools: compactTextList(flow.tools, 8, 80),
        instances: flow.instances,
        confidence: flow.confidence,
        flowKind: flow.flowKind,
      })),
    };
  } catch {
    return null;
  }
}

function compactPjeEconomyPolicy(knownFlows) {
  const hasKnownFlows = Number(knownFlows?.count || 0) > 0;
  return {
    knownFlowsFirst: hasKnownFlows ? 'use_brain_knownFlows_before_discovery' : 'check_brain_flows_when_context_known',
    includeRawGate: 'only_when_discoveryRecommended_or_confidence_low_or_user_asks_debug',
    fallback: 'if_known_flow_fails_then_compact_inspection_then_includeRaw',
    hitl: 'confirm_before_access_warning_autos_download_or_petition',
  };
}

function attachBrainInfo(payload, brainInfo) {
  if (!brainInfo) return payload;
  const knownFlows = brainInfo.knownFlows;
  const hasKnownFlows = Number(knownFlows?.count || 0) > 0;
  return {
    ...payload,
    nextActions: hasKnownFlows
      ? compactTextList(uniqueStrings(['usar_brain_knownFlows_antes_de_includeRaw', ...asArray(payload.nextActions)]), 6, 120)
      : payload.nextActions,
    economyPolicy: compactPjeEconomyPolicy(knownFlows),
    brain: {
      ...(payload.brain || {}),
      ...brainInfo,
    },
  };
}

function safeNextActionsForError(error) {
  switch (error) {
    case 'no_active_page':
      return ['verificar_pje_status', 'abrir_ou_focar_pje_no_chrome_controlado'];
    case 'not_pje_page':
      return ['focar_aba_pje_correta', 'executar_pje_status_antes_de_repetir'];
    case 'process_result_link_not_found':
      return ['executar_pje_ler_resultados', 'conferir_numero_ou_resultadoIndex'];
    case 'access_warning_not_found':
    case 'access_warning_accept_action_not_found':
      return ['revisar_tela_no_chrome', 'nao_clicar_aceitar_sem_confirmacao_humana'];
    default:
      return ['reinspecionar_contexto_com_waitMs_curto', 'evitar_repetir_tool_grande_sem_nova_evidencia'];
  }
}

function compactFailure(result, input, modeFallback) {
  const error = result?.error || 'unknown_error';
  const mode = result?.mode || modeFallback;
  const discoveryRecommended = !wantsFullPayload(input) && shouldRecommendDiscoveryForError(error);
  return withOptionalRaw(input, {
    ok: false,
    mode,
    confidence: 'low',
    discoveryRecommended,
    state: {
      error,
      browserAutomationExecuted: !!result?.browserAutomationExecuted,
      page: compactPageSummary(result?.page || result?.pageBefore || result?.pageAfter),
    },
    resumo: truncateText(result?.message || `Falha: ${error}`, 260),
    warnings: uniqueStrings([error, discoveryRecommended ? 'discovery_recommended' : '', ...asArray(result?.warnings)]),
    nextActions: compactNextActionsWithDiscovery(
      result?.nextActions,
      safeNextActionsForError(error),
      discoveryRecommended,
      discoveryActionForMode(mode)
    ),
  }, result);
}

function withOptionalRaw(input, compactPayload, rawResult) {
  const includeFull = wantsFullPayload(input);
  const payload = {
    ...compactPayload,
    compactMode: !includeFull,
    rawIncluded: includeFull,
  };
  if (includeFull) payload.raw = rawResult;
  return payload;
}

function textToolResult(payload) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload),
      },
    ],
  };
}

function registerLexTool(server, name, config, handler) {
  return server.registerTool(name, config, instrumentToolHandler(name, handler));
}

function instrumentToolHandler(toolName, handler) {
  return async (input, extra) => {
    const startedAt = Date.now();
    try {
      const result = await handler(input, extra);
      observeMcpToolResult(toolName, result, Date.now() - startedAt);
      return result;
    } catch (error) {
      observeMcpToolError(toolName, error, Date.now() - startedAt);
      throw error;
    }
  };
}

function observeMcpToolResult(toolName, result, durationMs) {
  if (!payloadShadowEnabled) return;
  const metrics = buildMcpPayloadMetrics(toolName, result, durationMs);
  writePayloadShadowMetric(metrics);
}

function observeMcpToolError(toolName, error, durationMs) {
  if (!payloadShadowEnabled) return;
  writePayloadShadowMetric({
    ts: new Date().toISOString(),
    mode: 'shadow',
    tool: toolName,
    ok: false,
    durationMs,
    errorChars: String(error?.message || error || '').length,
    error: truncateText(error?.message || String(error), 300),
  });
}

function buildMcpPayloadMetrics(toolName, result, durationMs) {
  const content = asArray(result?.content);
  const textParts = content
    .filter((part) => part?.type === 'text')
    .map((part) => String(part?.text ?? ''));
  const parsedPayloads = textParts.map((text, index) => parseJsonPayload(text, index)).filter(Boolean);
  const primaryPayload = parsedPayloads[0]?.value;
  const primaryPayloadRecord = primaryPayload && typeof primaryPayload === 'object' && !Array.isArray(primaryPayload)
    ? primaryPayload
    : {};
  const textChars = textParts.reduce((sum, text) => sum + text.length, 0);
  return stripUndefined({
    ts: new Date().toISOString(),
    mode: 'shadow',
    tool: toolName,
    ok: primaryPayloadRecord.ok !== false,
    durationMs,
    textChars,
    resultEnvelopeChars: safeJsonChars(result),
    textPartCount: textParts.length,
    parsedJsonTextParts: parsedPayloads.length,
    contentTypes: uniqueStrings(content.map((part) => part?.type)),
    compactMode: primaryPayloadRecord.compactMode,
    rawIncluded: primaryPayloadRecord.rawIncluded,
    confidence: primaryPayloadRecord.confidence,
    discoveryRecommended: primaryPayloadRecord.discoveryRecommended,
    largestFields: primaryPayload
      ? largestJsonFields(primaryPayload, 8)
      : [],
  });
}

function parseJsonPayload(text, index) {
  try {
    return { index, value: JSON.parse(text) };
  } catch {
    return null;
  }
}

function largestJsonFields(value, limit = 8) {
  const fields = [];
  collectJsonFieldSizes(value, '', fields, 0, new Set());
  return fields
    .sort((a, b) => b.chars - a.chars)
    .slice(0, limit);
}

function collectJsonFieldSizes(value, prefix, fields, depth, seen) {
  if (!value || typeof value !== 'object' || depth > 3 || seen.has(value) || fields.length > 240) return;
  seen.add(value);
  const entries = Array.isArray(value)
    ? value.slice(0, 30).map((item, index) => [String(index), item])
    : Object.entries(value).slice(0, 80);

  for (const [key, child] of entries) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const chars = safeJsonChars(child);
    fields.push({
      path: truncateText(fieldPath, 160),
      chars,
      type: jsonValueType(child),
    });
    if (child && typeof child === 'object' && chars > 1000) {
      collectJsonFieldSizes(child, fieldPath, fields, depth + 1, seen);
    }
  }
}

function safeJsonChars(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value ?? '').length;
  }
}

function jsonValueType(value) {
  if (Array.isArray(value)) return `array:${value.length}`;
  if (value === null) return 'null';
  return typeof value;
}

function stripUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function writePayloadShadowMetric(metrics) {
  const line = `${JSON.stringify(metrics)}\n`;
  if (!payloadShadowFileDisabled) {
    try {
      fs.mkdirSync(path.dirname(payloadShadowLogPath), { recursive: true });
      fs.appendFileSync(payloadShadowLogPath, line, 'utf8');
    } catch (error) {
      payloadShadowFileDisabled = true;
      console.error(`[lex-mcp payload shadow] log file disabled: ${error?.message || String(error)}`);
    }
  }

  if (payloadShadowLogAllToStderr || Number(metrics.textChars || 0) >= payloadShadowWarnChars) {
    const largest = asArray(metrics.largestFields)
      .slice(0, 3)
      .map((field) => `${field.path}:${field.chars}`)
      .join(', ') || 'n/a';
    console.error(`[lex-mcp payload shadow] ${metrics.tool}: ${metrics.textChars || 0} chars; largest=${largest}; log=${payloadShadowLogPath}`);
  }
}

function prepareCompactInspectionInput(input) {
  const record = asInputRecord(input);
  if (wantsFullPayload(record)) return { ...record };
  return {
    ...record,
    maxPages: boundedNumber(record.maxPages, 4, 1, 4),
    maxElementsPerFrame: boundedNumber(record.maxElementsPerFrame, 24, 1, 40),
    maxTextSnippetsPerFrame: boundedNumber(record.maxTextSnippetsPerFrame, 4, 0, 8),
    includeScreenshot: false,
    fullPageScreenshot: false,
  };
}

function prepareCompactSearchResultsInput(input) {
  const record = asInputRecord(input);
  if (wantsFullPayload(record)) return { ...record };
  return {
    ...record,
    maxRows: boundedNumber(record.maxRows, 8, 1, 10),
    includeRawText: false,
  };
}

function compactPjeInspection(result, input) {
  if (result?.ok === false) return compactFailure(result, input, 'read_only_inspection');
  const pages = asArray(result?.pages);
  const activePage = pages.find((page) => page?.active) || pages[0] || null;
  const candidates = result?.candidates || {};
  const processNumberFields = asArray(candidates.processNumberFields).slice(0, 6).map(compactCandidate).filter(Boolean);
  const searchActions = asArray(candidates.searchActions).slice(0, 6).map(compactCandidate).filter(Boolean);
  const certificateOrSigner = asArray(candidates.certificateOrSigner).slice(0, 3).map(compactCandidate).filter(Boolean);
  const loginActions = asArray(candidates.loginActions).slice(0, 3).map(compactCandidate).filter(Boolean);
  const activeIsPje = !!activePage?.isPje;
  const hasKnownCandidate = processNumberFields.length > 0
    || searchActions.length > 0
    || certificateOrSigner.length > 0
    || loginActions.length > 0;
  const incompleteInspection = Number(result?.pageCount || 0) > Number(result?.inspectedPageCount || pages.length);
  const discoveryRecommended = !wantsFullPayload(input) && activeIsPje && (!hasKnownCandidate || incompleteInspection);
  const confidence = !activePage || !activeIsPje || discoveryRecommended
    ? 'low'
    : (!processNumberFields.length || !searchActions.length ? 'medium' : 'normal');
  const warnings = uniqueStrings([
    ...asArray(result?.warnings),
    !activeIsPje ? 'active_page_not_pje' : '',
    discoveryRecommended ? 'discovery_recommended' : '',
    boolParam(asInputRecord(input).includeScreenshot, false) && !wantsFullPayload(input) ? 'screenshot_omitted_in_compact_mode' : '',
    incompleteInspection ? 'not_all_pages_inspected' : '',
  ]);
  const activeSummary = compactPageSummary(activePage);
  const worldtree = result?.worldtree || activePage?.worldtree || null;
  const worldtreeSummary = worldtree?.summary || null;
  return withOptionalRaw(input, {
    ok: true,
    mode: result?.mode || 'read_only_inspection',
    confidence,
    discoveryRecommended,
    state: {
      pageCount: result?.pageCount,
      inspectedPageCount: result?.inspectedPageCount,
      activePageIndex: result?.activePageIndex,
      activePage: activeSummary,
      environment: compactEnvironment(result?.environment || activePage?.environment || activePage),
      candidateCounts: {
        processNumberFields: asArray(candidates.processNumberFields).length,
        searchActions: asArray(candidates.searchActions).length,
        certificateOrSigner: asArray(candidates.certificateOrSigner).length,
        loginActions: asArray(candidates.loginActions).length,
      },
      worldtree: worldtreeSummary ? {
        frameCount: worldtreeSummary.frameCount,
        actionableNodeCount: worldtreeSummary.actionableNodeCount,
        expansionCandidateCount: worldtreeSummary.expansionCandidateCount,
        downloadCandidateCount: worldtreeSummary.downloadCandidateCount,
        frameDepthMax: worldtreeSummary.frameDepthMax,
      } : null,
      browserAutomationExecuted: false,
    },
    resumo: `Aba ativa ${activeSummary?.tribunal || (activeSummary?.isPje ? 'PJe' : 'nao PJe')}: ${activeSummary?.title || activeSummary?.url || 'sem titulo'}. Contexto: ${truncateText(result?.contextSummary || activeSummary?.contextSummary || 'desconhecido', 120)}. Campos de numero: ${processNumberFields.length}; acoes de consulta: ${searchActions.length}.`,
    pages: pages.slice(0, 4).map(compactPageSummary).filter(Boolean),
    environment: compactEnvironment(result?.environment || activePage?.environment || activePage),
    worldtree: worldtree ? {
      summary: worldtreeSummary ? {
        frameCount: worldtreeSummary.frameCount,
        actionableNodeCount: worldtreeSummary.actionableNodeCount,
        expansionCandidateCount: worldtreeSummary.expansionCandidateCount,
        downloadCandidateCount: worldtreeSummary.downloadCandidateCount,
        frameDepthMax: worldtreeSummary.frameDepthMax,
      } : null,
      frameTree: asArray(worldtree.frameTree).slice(0, 6).map(compactWorldtreeFrame).filter(Boolean),
      expansionCandidates: asArray(worldtree.expansionCandidates).slice(0, 8).map(compactWorldtreeNode).filter(Boolean),
      downloadCandidates: asArray(worldtree.downloadCandidates).slice(0, 8).map(compactWorldtreeNode).filter(Boolean),
    } : null,
    candidates: {
      processNumberFields,
      searchActions,
      certificateOrSigner,
      loginActions,
    },
    warnings,
    nextActions: compactNextActionsWithDiscovery(
      result?.nextActions,
      ['usar_tool_especifica_para_proximo_passo', 'pedir_includeRaw_apenas_para_diagnostico'],
      discoveryRecommended,
      discoveryActionForMode('read_only_inspection')
    ),
  }, result);
}

function compactPjeStatus(result, input) {
  if (result?.ok === false) return compactFailure(result, input, 'read_only_status');
  const status = result?.status || {};
  const environment = compactEnvironment(status?.environment);
  const authState = environment?.authState || null;
  const surfaceKind = environment?.surfaceKind || null;
  const needsAuthentication = authState === 'nao_logado' || surfaceKind === 'login';
  const needsNavigation = !!status?.isPje && surfaceKind !== 'consulta';
  const resumo = needsAuthentication
    ? 'A Lex detectou PJe sem autenticacao valida para consulta. Faca login e volte para a tela estruturada de consulta.'
    : (needsNavigation
      ? 'A Lex detectou PJe aberto, mas fora da tela estruturada de consulta. Use pje_abrir_consulta antes de preencher ou consultar.'
      : `Status do PJe: ${truncateText(status?.contextSummary || 'sem resumo', 180)}`);
  return withOptionalRaw(input, {
    ok: true,
    mode: result?.mode || 'read_only_status',
    confidence: environment ? 'normal' : 'medium',
    discoveryRecommended: false,
    state: {
      connected: !!status?.connected,
      isPje: !!status?.isPje,
      url: truncateText(status?.url, 180) || null,
      tribunalAtivo: truncateText(status?.tribunalAtivo, 40) || null,
      tribunalPreferido: truncateText(status?.tribunalPreferido, 40) || null,
      environment,
      needsAuthentication,
      needsNavigation,
      browserAutomationExecuted: false,
    },
    resumo,
    nextActions: compactNextActions(
      result?.nextActions,
      needsAuthentication
        ? ['autenticar_no_pje', 'executar_pje_abrir_consulta']
        : (needsNavigation ? ['executar_pje_abrir_consulta', 'reinspecionar_contexto'] : ['seguir_com_tool_especifica'])
    ),
  }, result);
}

function compactPjeConsultaPlan(result, input, modeFallback = 'read_only_plan') {
  if (result?.ok === false) return compactFailure(result, input, modeFallback);
  const status = result?.pje?.status || result?.status || {};
  const environment = compactEnvironment(status?.environment);
  const pje = result?.pje || {};
  const needsAuthentication = !!pje?.needsAuthentication || environment?.authState === 'nao_logado' || environment?.surfaceKind === 'login';
  const needsNavigation = !!pje?.needsNavigation;
  const resumo = needsAuthentication
    ? `Plano pronto para ${result?.numero || 'o processo'}, mas a sessao do PJe ainda precisa de autenticacao antes da consulta.`
    : (needsNavigation
      ? `Plano pronto para ${result?.numero || 'o processo'}, mas a Lex ainda precisa abrir a tela estruturada de consulta do ${result?.tribunal?.selected || 'tribunal alvo'}.`
      : `Plano pronto para consultar ${result?.numero || 'o processo'} no ${result?.tribunal?.selected || 'tribunal alvo'}.`);
  return withOptionalRaw(input, {
    ok: true,
    mode: result?.mode || modeFallback,
    confidence: 'normal',
    discoveryRecommended: false,
    state: {
      numero: result?.numero || null,
      tribunal: result?.tribunal ? {
        selected: result.tribunal.selected || null,
        active: result.tribunal.active || null,
        inferredFromCnj: result.tribunal.inferredFromCnj || null,
      } : null,
      routes: result?.routes ? {
        consultaUrl: truncateText(result.routes.consultaUrl, 180) || null,
        loginUrl: truncateText(result.routes.loginUrl, 180) || null,
      } : null,
      environment,
      connected: !!pje?.connected,
      isPje: !!pje?.isPje,
      activeMatchesTarget: !!pje?.activeMatchesTarget,
      needsBrowser: !!pje?.needsBrowser,
      needsNavigation,
      needsAuthentication,
      browserAutomationExecuted: !!pje?.browserAutomationExecuted,
    },
    resumo,
    warnings: uniqueStrings([
      needsAuthentication ? 'authentication_required_before_search' : '',
      needsNavigation ? 'consulta_screen_not_ready' : '',
    ]),
    nextActions: compactNextActions(
      result?.nextActions,
      needsAuthentication
        ? ['autenticar_no_pje_antes_de_consultar', 'executar_pje_abrir_consulta']
        : (needsNavigation ? ['executar_pje_abrir_consulta', 'executar_pje_preencher_numero'] : ['executar_pje_preencher_numero', 'executar_pje_clicar_consultar'])
    ),
  }, result);
}

function compactPjeFillNumber(result, input) {
  const fields = asArray(result?.fields);
  const compactFields = fields.map(compactFillField).filter(Boolean);
  const foundCount = fields.filter((field) => field?.found).length;
  const filledCount = fields.filter((field) => field?.filled).length;
  const missingFields = compactTextList(result?.missingFields, 8, 80);
  const failedFields = compactTextList(result?.failedFields, 8, 80);
  const error = result?.error || null;
  const discoveryRecommended = !wantsFullPayload(input) && (
    error === 'field_not_found'
    || missingFields.length > 0
    || failedFields.length > 0
  );
  const confidence = error || missingFields.length > 0 || failedFields.length > 0
    ? 'low'
    : (foundCount < 6 ? 'medium' : 'normal');
  const validation = result?.validation || {};
  const warnings = uniqueStrings([
    ...asArray(validation?.warnings),
    ...missingFields.map((field) => `missing_field:${field}`),
    ...failedFields.map((field) => `failed_field:${field}`),
    error || '',
    discoveryRecommended ? 'discovery_recommended' : '',
  ]);
  const page = compactPageSummary(result?.page);
  let resumo = 'Numero do processo avaliado para preenchimento.';
  if (error) resumo = truncateText(result?.message || `Falha em pje_preencher_numero: ${error}`, 240);
  else if (result?.dryRun) resumo = `Dry run: ${foundCount}/${fields.length || 6} campo(s) do numero localizados; nenhum preenchimento executado.`;
  else resumo = `Preenchimento seguro executado: ${filledCount}/${fields.length || 6} campo(s) confirmados.`;
  return withOptionalRaw(input, {
    ok: result?.ok !== false,
    mode: result?.mode || 'fill_process_number',
    confidence,
    discoveryRecommended,
    state: {
      page,
      dryRun: !!result?.dryRun,
      numero: result?.numero || null,
      tribunal: validation?.tribunal ? {
        requested: validation.tribunal.requested ?? null,
        inferred: validation.tribunal.inferred ?? null,
        mismatch: !!validation.tribunal.mismatch,
      } : null,
      fieldCounts: {
        total: fields.length,
        found: foundCount,
        filled: filledCount,
        missing: missingFields.length,
        failed: failedFields.length,
      },
      missingFields,
      failedFields,
      browserAutomationExecuted: !!result?.browserAutomationExecuted,
    },
    resumo,
    fields: compactFields.slice(0, 6),
    warnings,
    nextActions: compactNextActionsWithDiscovery(
      result?.nextActions,
      result?.dryRun
        ? ['executar_pje_preencher_numero_com_dryRun_false', 'conferir_campos_antes_de_clicar_consultar']
        : ['conferir_campos_antes_de_clicar_consultar'],
      discoveryRecommended,
      discoveryActionForMode('read_only_inspection')
    ),
  }, result);
}

function compactPjeClickSearch(result, input) {
  const candidates = asArray(result?.candidates);
  const criteria = asArray(result?.criteria);
  const effectiveCriteria = asArray(result?.effectiveCriteria);
  const selectedCandidate = compactSearchCandidate(result?.selectedCandidate);
  const error = result?.error || null;
  const discoveryRecommended = !wantsFullPayload(input) && (
    error === 'search_action_not_found'
    || error === 'requested_candidate_not_found'
    || (!selectedCandidate && result?.ok === false)
  );
  const confidence = error || !selectedCandidate
    ? 'low'
    : (Number(result?.selectedCandidate?.score || 0) < 70 ? 'medium' : 'normal');
  const warnings = uniqueStrings([
    error || '',
    discoveryRecommended ? 'discovery_recommended' : '',
    error === 'empty_search_blocked' ? 'consulta_vazia_bloqueada' : '',
    candidates.length > 5 ? `candidatos_omitidos_no_resumo:${candidates.length - 5}` : '',
  ]);
  const page = compactPageSummary(result?.page || result?.pageBefore || result?.pageAfter);
  let resumo = 'Botao de consulta avaliado.';
  if (error) resumo = truncateText(result?.message || `Falha em pje_clicar_consultar: ${error}`, 240);
  else if (result?.dryRun) resumo = selectedCandidate
    ? `Dry run: botao selecionado (${selectedCandidate.label || selectedCandidate.ref}); nenhum clique executado.`
    : 'Dry run: nenhum botao seguro de consulta selecionado.';
  else resumo = result?.click?.clicked
    ? 'Clique seguro de consulta executado uma vez.'
    : 'Clique de consulta nao foi executado com sucesso.';
  return withOptionalRaw(input, {
    ok: result?.ok !== false,
    mode: result?.mode || 'click_search',
    confidence,
    discoveryRecommended,
    state: {
      page,
      dryRun: !!result?.dryRun,
      criteriaCount: criteria.length,
      effectiveCriteriaCount: effectiveCriteria.length,
      candidateCount: candidates.length,
      selectedCandidate,
      click: result?.click ? {
        clicked: !!result.click.clicked,
        error: truncateText(result.click.error, 180),
      } : null,
      waitAfterMs: result?.waitAfterMs,
      browserAutomationExecuted: !!result?.browserAutomationExecuted,
    },
    resumo,
    effectiveCriteria: effectiveCriteria.slice(0, 6).map(compactSearchCriterion).filter(Boolean),
    topCandidates: candidates.slice(0, 5).map(compactSearchCandidate).filter(Boolean),
    warnings,
    nextActions: compactNextActionsWithDiscovery(
      result?.nextActions,
      result?.dryRun
        ? ['executar_pje_clicar_consultar_com_dryRun_false', 'ler_resultados_da_consulta']
        : ['ler_resultados_da_consulta', 'registrar_resultado_no_brain'],
      discoveryRecommended,
      discoveryActionForMode('read_only_inspection')
    ),
  }, result);
}

function compactPjeSearchResults(result, input) {
  if (result?.ok === false) return compactFailure(result, input, 'read_only_search_results');
  const rows = asArray(result?.results).map(compactSearchResultRow).filter(Boolean);
  const returnedRows = rows.slice(0, 8);
  const omittedRows = Math.max(0, rows.length - returnedRows.length);
  const originalWarnings = asArray(result?.warnings);
  const tableMissing = !result?.primaryTable || originalWarnings.includes('result_table_not_identified');
  const rowCountMismatch = originalWarnings.includes('visible_rows_count_differs_from_reported_count');
  const discoveryRecommended = !wantsFullPayload(input) && (tableMissing || returnedRows.length === 0 || rowCountMismatch);
  const movementVisible = returnedRows.some((row) => /ultima|movimenta|decorrido prazo/i.test(JSON.stringify(row)));
  const confidence = tableMissing || returnedRows.length === 0
    ? 'low'
    : (rowCountMismatch || omittedRows > 0 ? 'medium' : 'normal');
  const warnings = uniqueStrings([
    ...originalWarnings,
    discoveryRecommended ? 'discovery_recommended' : '',
    omittedRows > 0 ? `resultados_omitidos_no_resumo:${omittedRows}` : '',
  ]);
  const page = compactPageSummary(result?.page);
  return withOptionalRaw(input, {
    ok: result?.ok !== false,
    mode: result?.mode || 'read_only_search_results',
    confidence,
    discoveryRecommended,
    state: {
      page,
      waitMs: result?.waitMs,
      reportedResultCount: result?.reportedResultCount ?? null,
      reportedResultCountText: truncateText(result?.reportedResultCountText, 120),
      resultCount: result?.resultCount ?? rows.length,
      returnedResultCount: returnedRows.length,
      primaryTable: result?.primaryTable ? {
        frameIndex: result.primaryTable.frameIndex,
        tableIndex: result.primaryTable.tableIndex,
        score: result.primaryTable.score,
        headers: compactTextList(result.primaryTable.headers, 8, 80),
        signals: compactTextList(result.primaryTable.signals, 6, 80),
      } : null,
      rankedTables: asArray(result?.rankedTables).slice(0, 3).map((table) => ({
        frameIndex: table.frameIndex,
        tableIndex: table.tableIndex,
        rowCount: table.rowCount,
        score: table.score,
        signals: compactTextList(table.signals, 5, 80),
      })),
      browserAutomationExecuted: false,
    },
    resumo: returnedRows.length > 0
      ? `${returnedRows.length} resultado(s) visivel(is) resumido(s); total lido: ${result?.resultCount ?? rows.length}; reportado pelo PJe: ${result?.reportedResultCount ?? 'nao informado'}.`
      : 'Nenhum resultado visivel foi extraido com seguranca.',
    pedidoPodeSerAtendidoSemAutos: movementVisible,
    orientacaoDeFluxo: movementVisible
      ? 'Se o pedido for sobre a ultima movimentacao visivel, responda agora e apenas ofereca abrir os autos se o usuario solicitar.'
      : undefined,
    results: returnedRows,
    warnings,
    nextActions: movementVisible
      ? ['responder_com_dados_visiveis', 'oferecer_abertura_dos_autos_apenas_se_usuario_pedir']
      : compactNextActionsWithDiscovery(
        result?.nextActions,
        ['registrar_resultado_no_brain', 'nao_abrir_processo_sem_confirmacao'],
        discoveryRecommended,
        discoveryActionForMode('read_only_search_results')
      ),
  }, result);
}

function compactPjeOpenResult(result, input) {
  if (result?.ok === false && !result?.selectedCandidate && !result?.warning && !result?.existingWarning) {
    return compactFailure(result, input, 'open_search_result');
  }
  const warning = compactAccessWarning(result?.warning || result?.existingWarning);
  const selectedResult = compactResultCandidate(result?.selectedCandidate);
  const discoveryRecommended = !wantsFullPayload(input) && (
    !!result?.error
    || (!!result?.dryRun && !selectedResult && !warning)
    || (!!result?.browserAutomationExecuted && !warning && !result?.openedAutos)
  );
  const confidence = result?.error || (!!result?.dryRun && !selectedResult && !warning)
    ? 'low'
    : (discoveryRecommended ? 'medium' : 'normal');
  const warnings = uniqueStrings([
    ...asArray(result?.warnings),
    result?.error || '',
    discoveryRecommended ? 'discovery_recommended' : '',
    warning && !result?.acceptedAccessWarning && !result?.openedAutos ? 'aviso_detectado_requer_confirmacao_humana' : '',
    result?.aceitarAviso ? 'aceitar_aviso_e_abrir_autos_exige_confirmacao_forte' : '',
  ]);
  const page = compactPageSummary(result?.page || result?.pageBefore || result?.pageAfter || result?.openClick?.activePage);
  let resumo = 'Resultado de consulta avaliado.';
  if (result?.error) resumo = `Falha em pje_abrir_resultado: ${result.error}. ${truncateText(result.message, 160)}`;
  else if (result?.dryRun) resumo = selectedResult
    ? `Dry run: resultado ${selectedResult.resultNumber || result?.resultadoIndex || 1} selecionado; nenhum clique executado.`
    : 'Dry run: nenhum link de resultado foi selecionado com seguranca.';
  else if (result?.openedAutos) resumo = 'Autos abertos apos confirmacao humana forte.';
  else if (warning) resumo = 'Aviso/modal de entrada detectado; a Lex nao aceitou nem abriu autos sem autorizacao.';
  else if (result?.browserAutomationExecuted) resumo = 'Link do processo acionado; contexto deve ser reinspecionado antes de novo clique.';
  return withOptionalRaw(input, {
    ok: result?.ok !== false,
    mode: result?.mode || 'open_search_result',
    confidence,
    discoveryRecommended,
    state: {
      page,
      dryRun: !!result?.dryRun,
      aceitarAviso: !!result?.aceitarAviso,
      requestedNumber: result?.requestedNumber || null,
      resultadoIndex: result?.resultadoIndex ?? null,
      selectedResult,
      warningDetected: !!warning,
      requiresHumanConfirmation: !!result?.requiresHumanConfirmation || (!!warning && !result?.acceptedAccessWarning),
      acceptedAccessWarning: !!result?.acceptedAccessWarning,
      openedAutos: !!result?.openedAutos,
      browserAutomationExecuted: !!result?.browserAutomationExecuted,
    },
    resumo,
    warning,
    openClick: compactClickResult(result?.openClick),
    acceptClick: compactClickResult(result?.acceptClick),
    warnings,
    nextActions: compactNextActionsWithDiscovery(
      result?.nextActions,
      ['reinspecionar_contexto_antes_de_novo_clique', 'nao_baixar_documento_nem_peticionar_sem_confirmacao'],
      discoveryRecommended,
      discoveryActionForMode('open_search_result')
    ),
  }, result);
}

function compactAutosDanger(control) {
  if (!control || typeof control !== 'object') return null;
  return {
    label: truncateText(control.label || control.title || control.id || control.selector, 140),
    tag: control.tag,
    id: truncateText(control.id, 120),
    selector: truncateText(control.selector, 160),
    dangerKinds: compactTextList(control.dangerKinds, 5, 80),
  };
}

function compactPjeAutos(result, input) {
  if (result?.ok === false) return compactFailure(result, input, 'read_only_autos');
  const movements = asArray(result?.movements).slice(0, 10).map((movement, index) => ({
    index: index + 1,
    text: truncateText(movement?.text || movement, 260),
  })).filter((movement) => movement.text);
  const dangerous = asArray(result?.controls?.dangerous).slice(0, 8).map(compactAutosDanger).filter(Boolean);
  const document = result?.document || {};
  const warnings = uniqueStrings([
    ...asArray(result?.warnings),
    dangerous.length > 0 ? 'acoes_perigosas_visiveis_nao_executar_sem_confirmacao' : '',
  ]);
  const confidence = !result?.isAutosPage || !document?.title || movements.length === 0
    ? 'medium'
    : 'normal';
  return withOptionalRaw(input, {
    ok: result?.ok !== false,
    mode: result?.mode || 'read_only_autos',
    confidence,
    readOnly: true,
    state: {
      page: compactPageSummary(result?.page),
      isAutosPage: !!result?.isAutosPage,
      processNumber: result?.processNumber || null,
      movementCount: movements.length,
      dangerousActionCount: asArray(result?.controls?.dangerous).length,
      totalInteractiveControls: result?.controls?.total ?? null,
      browserAutomationExecuted: false,
    },
    resumo: document?.title
      ? `Autos lidos em modo read-only. Documento atual: ${truncateText(document.title, 120)}. Movimentos visiveis: ${movements.length}.`
      : `Autos lidos em modo read-only. Documento atual nao identificado com seguranca. Movimentos visiveis: ${movements.length}.`,
    processo: {
      numero: result?.processNumber || null,
      headerTexts: compactTextList(result?.headerTexts, 5, 160),
    },
    documentoAtual: {
      titulo: truncateText(document?.title, 180),
      meta: truncateText(document?.meta, 220),
      pagina: truncateText(document?.pageIndicator, 80),
      preview: compactTextList(document?.textPreview, 8, 260),
    },
    movimentacoesVisiveis: movements,
    acoesPerigosasVisiveis: dangerous,
    warnings,
    nextActions: compactNextActions(
      result?.nextActions,
      ['resumir_movimentacoes_visiveis', 'nao_baixar_documentos_sem_confirmacao']
    ),
  }, result);
}

function compactPjeIntentExploration(result, input) {
  if (result?.ok === false) return compactFailure(result, input, 'intent_exploration_preview');
  const guidance = result?.guidance || {};
  const policy = guidance?.policy || {};
  const explorationPlan = guidance?.explorationPlan || {};
  const worldtreeTargets = asArray(explorationPlan?.worldtreeTargets).slice(0, 6).map((item) => truncateText(item, 220));
  const domCandidates = asArray(explorationPlan?.domCandidates).slice(0, 8).map((item) => ({
    source: item?.source || null,
    role: truncateText(item?.role, 80),
    suggestedAction: item?.suggestedAction || null,
    ref: truncateText(item?.ref, 80),
    label: truncateText(item?.label, 140),
    sectionPath: compactTextList(item?.sectionPath, 4, 80),
    framePath: compactTextList(item?.framePath, 4, 80),
    selectorHints: compactTextList(item?.selectorHints, 4, 100),
    interactionHints: compactTextList(item?.interactionHints, 4, 80),
    candidateKinds: compactTextList(item?.candidateKinds, 6, 80),
    reason: truncateText(item?.reason, 220),
  }));
  const interactionSequence = asArray(explorationPlan?.interactionSequence).slice(0, 6).map((item) => truncateText(item, 220));
  const toolPlan = asArray(explorationPlan?.toolPlan).slice(0, 6).map((item) => truncateText(item, 220));
  const actionableTargets = asArray(explorationPlan?.actionableTargets).slice(0, 6).map((item) => truncateText(item, 220));
  const affordances = compactTextList(guidance?.affordances, 12, 80);
  const nextActions = compactTextList(guidance?.nextActions, 10, 80);
  const confidence = worldtreeTargets.length > 0 || actionableTargets.length > 0
    || domCandidates.length > 0
    ? 'normal'
    : (affordances.length > 0 ? 'medium' : 'low');
  const discoveryRecommended = worldtreeTargets.length === 0 && actionableTargets.length === 0 && domCandidates.length === 0;
  const resumo = worldtreeTargets.length > 0
    ? `Intencao ${policy?.intent || 'geral'} mapeada com ${worldtreeTargets.length} candidato(s) DOM prioritario(s) para exploracao segura.`
    : `Intencao ${policy?.intent || 'geral'} mapeada sem candidato DOM forte; a Lex deve explorar com cautela e admitir limite se nao encontrar rota confiavel.`;

  return withOptionalRaw(input, {
    ok: true,
    mode: result?.mode || 'intent_exploration_preview',
    confidence,
    discoveryRecommended,
    readOnly: true,
    state: {
      task: truncateText(result?.task, 220),
      intent: policy?.intent || null,
      replayContext: result?.replayContext || null,
      contextSummary: truncateText(guidance?.contextSummary, 220),
      shouldNavigateFirst: !!policy?.shouldNavigateFirst,
      affordanceCount: affordances.length,
      worldtreeCandidateCount: worldtreeTargets.length,
      domCandidateCount: domCandidates.length,
      actionableTargetCount: actionableTargets.length,
      browserAutomationExecuted: false,
    },
    resumo,
    guidance: {
      contextSummary: truncateText(guidance?.contextSummary, 220),
      executionBrief: truncateText(result?.executionBrief, 1800),
      affordances,
      nextActions,
      policyLines: compactTextList(policy?.policyLines, 6, 220),
      warnings: compactTextList(policy?.warnings, 6, 220),
      domCandidates,
      worldtreeTargets,
      actionableTargets,
      interactionSequence,
      toolPlan,
      avoidSteps: compactTextList(explorationPlan?.avoidSteps, 6, 220),
    },
    nextActions: compactNextActionsWithDiscovery(
      nextActions,
      ['explorar_candidatos_dom_em_passos_pequenos', 'reinspecionar_apos_cada_expansao', 'declarar_limite_se_nao_houver_rota_confiavel'],
      discoveryRecommended,
      discoveryActionForMode('intent_exploration_preview')
    ),
  }, result);
}

function compactPjeExecuteIntentCandidate(result, input) {
  if (result?.ok === false) return compactFailure(result, input, 'execute_intent_candidate');
  const candidate = result?.candidate || result?.preview?.candidate || {};
  const afterInspection = result?.inspectionAfter || result?.result?.inspectionAfter || null;
  const afterSummary = truncateText(afterInspection?.contextSummary, 220);
  return withOptionalRaw(input, {
    ok: result?.ok !== false,
    mode: result?.mode || 'execute_intent_candidate',
    confidence: result?.click?.clicked ? 'normal' : 'medium',
    state: {
      dryRun: !!result?.dryRun,
      accepted: result?.accepted ?? null,
      candidateRef: truncateText(candidate?.ref, 80),
      candidateLabel: truncateText(candidate?.label, 160),
      suggestedAction: candidate?.suggestedAction || null,
      framePath: compactTextList(candidate?.framePath, 4, 80),
      sectionPath: compactTextList(candidate?.sectionPath, 4, 80),
      selectorHints: compactTextList(candidate?.selectorHints, 5, 100),
      browserAutomationExecuted: !!result?.browserAutomationExecuted,
      clicked: !!result?.click?.clicked,
      selectorUsed: truncateText(result?.click?.selectorUsed, 160),
      afterContextSummary: afterSummary || null,
    },
    resumo: result?.dryRun
      ? `Dry run: candidato ${truncateText(candidate?.ref, 80)} pronto para execucao controlada.`
      : (result?.click?.clicked
        ? `Candidato ${truncateText(candidate?.ref, 80)} executado com sucesso. Novo contexto: ${afterSummary || 'reinspecao concluida'}.`
        : `A execucao do candidato ${truncateText(candidate?.ref, 80)} nao concluiu clique seguro.`),
    candidate: {
      ref: truncateText(candidate?.ref, 80),
      label: truncateText(candidate?.label, 160),
      role: truncateText(candidate?.role, 80),
      suggestedAction: candidate?.suggestedAction || null,
      reason: truncateText(candidate?.reason, 220),
    },
    nextActions: compactNextActions(
      result?.nextActions,
      result?.click?.clicked
        ? ['reavaliar_contexto', 'escolher_proximo_candidato_se_necessario']
        : ['tentar_outro_candidato', 'reinspecionar_contexto']
    ),
  }, result);
}

function compactPjeExecuteIntentIncremental(result, input) {
  if (result?.ok === false) return compactFailure(result, input, 'incremental_intent_execution');
  const steps = asArray(result?.steps).slice(0, 6).map((step) => ({
    stepNumber: step?.stepNumber ?? null,
    phase: step?.phase || null,
    ok: step?.ok !== false,
    accepted: step?.accepted ?? null,
    candidate: step?.candidate ? {
      ref: truncateText(step.candidate.ref, 80),
      label: truncateText(step.candidate.label, 160),
      role: truncateText(step.candidate.role, 80),
      suggestedAction: step.candidate.suggestedAction || null,
      reason: truncateText(step.candidate.reason, 180),
    } : null,
    execution: step?.execution ? {
      clicked: !!step.execution?.click?.clicked,
      selectorUsed: truncateText(step.execution?.click?.selectorUsed, 160),
      afterContextSummary: truncateText(step.execution?.inspectionAfter?.contextSummary, 220),
    } : null,
    message: truncateText(step?.message, 220),
  }));
  const lastExploration = result?.lastExploration || {};
  const lastCandidates = asArray(lastExploration?.guidance?.explorationPlan?.domCandidates).slice(0, 4).map((candidate) => ({
    ref: truncateText(candidate?.ref, 80),
    role: truncateText(candidate?.role, 80),
    suggestedAction: candidate?.suggestedAction || null,
    label: truncateText(candidate?.label, 140),
    reason: truncateText(candidate?.reason, 180),
  }));

  return withOptionalRaw(input, {
    ok: true,
    mode: result?.mode || 'incremental_intent_execution',
    confidence: steps.some((step) => step?.execution?.clicked) ? 'normal' : 'medium',
    state: {
      dryRun: !!result?.dryRun,
      task: truncateText(result?.task, 220),
      maxSteps: result?.maxSteps ?? null,
      executedSteps: result?.executedSteps ?? steps.length,
      stopReason: result?.stopReason || null,
      browserAutomationExecuted: steps.some((step) => step?.execution?.clicked),
    },
    resumo: result?.dryRun
      ? `Dry run incremental pronto para ${result?.maxSteps || 0} passo(s).`
      : `Execucao incremental da intencao terminou com motivo: ${result?.stopReason || 'desconhecido'}. Passos registrados: ${steps.length}.`,
    steps,
    lastExploration: {
      intent: lastExploration?.guidance?.policy?.intent || null,
      contextSummary: truncateText(lastExploration?.guidance?.contextSummary, 220),
      domCandidates: lastCandidates,
    },
    nextActions: compactNextActions(
      result?.nextActions,
      ['reavaliar_contexto_atual', 'continuar_exploracao_se_fizer_sentido', 'parar_honestamente_se_nao_houver_progresso_claro']
    ),
  }, result);
}

function compactPjeDownloadCurrentDocument(result, input) {
  if (result?.ok === false) return compactFailure(result, input, 'download_current_document');
  const inspection = result?.inspection || result?.preview?.inspection || {};
  const document = inspection?.document || {};
  const dryRun = !!result?.dryRun;
  return withOptionalRaw(input, {
    ok: result?.ok !== false,
    mode: result?.mode || 'download_current_document',
    confidence: inspection?.downloadAction && document?.title ? 'normal' : 'medium',
    state: {
      dryRun,
      accepted: result?.accepted ?? null,
      processNumber: inspection?.processNumber || null,
      documentTitle: truncateText(document?.title, 180),
      downloadAction: inspection?.downloadAction ? {
        label: truncateText(inspection.downloadAction.label || inspection.downloadAction.title, 120),
        selector: truncateText(inspection.downloadAction.selector, 160),
      } : null,
      downloadDir: truncateText(result?.downloadDir || result?.preview?.downloadDir, 220),
      filePath: truncateText(result?.filePath, 260),
      bytes: result?.bytes ?? null,
      savedFromOpenedPdf: !!result?.savedFromOpenedPdf,
      contentType: truncateText(result?.contentType, 80),
      nativeDialog: result?.nativeDialog ? {
        type: result.nativeDialog.type,
        handledAction: result.nativeDialog.handledAction,
        handled: !!result.nativeDialog.handled,
        message: truncateText(result.nativeDialog.message, 220),
      } : null,
      newPageOpened: !!result?.newPageOpened,
      openedPage: result?.openedPage ? {
        url: truncateText(result.openedPage.url, 220),
        title: truncateText(result.openedPage.title, 160),
      } : null,
      browserAutomationExecuted: !!result?.browserAutomationExecuted,
    },
    resumo: dryRun
      ? `Dry run: documento atual identificado para download: ${truncateText(document?.title, 140)}. Nenhum download executado.`
      : result?.filePath
        ? `Documento baixado: ${truncateText(result.filePath, 220)}.`
        : (result?.accepted === false ? 'Download cancelado pelo usuario.' : 'Resultado de download do documento atual recebido.'),
    documentoAtual: {
      titulo: truncateText(document?.title, 180),
      meta: truncateText(document?.meta, 220),
      pagina: truncateText(document?.pageIndicator, 80),
    },
    arquivo: result?.filePath ? {
      path: result.filePath,
      suggestedFilename: truncateText(result?.suggestedFilename, 180),
      bytes: result?.bytes ?? null,
    } : null,
    warnings: uniqueStrings([
      result?.accepted === false ? 'download_cancelado_pelo_usuario' : '',
      !dryRun && result?.browserAutomationExecuted ? 'download_executado' : '',
    ]),
    nextActions: compactNextActions(
      result?.nextActions,
      ['analisar_documento_baixado_se_usuario_pedir', 'nao_baixar_outros_documentos_sem_confirmacao']
    ),
  }, result);
}

function compactPjeAnalyzeDownloadedDocument(result, input) {
  if (result?.ok === false) return compactFailure(result, input, 'analyze_downloaded_document');
  const file = result?.file || {};
  const pdf = result?.pdf || {};
  const signals = result?.sinaisLocais || {};
  const text = result?.textoParaAnalise || {};
  const fullRequested = boolParam(asInputRecord(input).includeFullText, false);
  return withOptionalRaw(input, {
    ok: result?.ok !== false,
    mode: result?.mode || 'analyze_downloaded_document',
    confidence: pdf?.textChars > 1000 ? 'normal' : 'medium',
    readOnly: true,
    resumo: `Documento extraido localmente: ${truncateText(file.fileName, 180)} (${pdf?.pages || '?'} paginas, ${pdf?.textChars || 0} caracteres). Tipo provavel: ${signals?.tipoProvavel || 'documento_pdf'}.`,
    arquivo: {
      path: file.filePath,
      name: truncateText(file.fileName, 180),
      bytes: file.bytes ?? null,
      modifiedAt: file.modifiedAt || null,
    },
    pdf: {
      pages: pdf.pages ?? null,
      textChars: pdf.textChars ?? null,
      parser: pdf.parser || null,
    },
    sinaisLocais: {
      tipoProvavel: signals?.tipoProvavel || null,
      resultadoProvavel: signals?.resultadoProvavel || null,
      numerosProcesso: compactTextList(signals?.numerosProcesso, 5, 80),
      datasEncontradas: compactTextList(signals?.datasEncontradas, 12, 40),
      valoresEncontrados: compactTextList(signals?.valoresEncontrados, 12, 80),
      temasProvaveis: compactTextList(signals?.temasProvaveis, 12, 80),
    },
    textoParaAnalise: {
      inicio: truncateText(text?.inicio, 5000),
      trechoDecisorio: truncateText(text?.trechoDecisorio, 7000),
      fim: truncateText(text?.fim, 5000),
    },
    textoCompleto: fullRequested ? result?.textoCompleto : undefined,
    nextActions: compactNextActions(
      result?.nextActions,
      ['resumir_documento', 'identificar_fundamentos_e_dispositivo', 'extrair_prazos_e_riscos']
    ),
    warnings: uniqueStrings([
      pdf?.textChars < 1000 ? 'texto_extraido_curto_verificar_se_pdf_e_imagem' : '',
      fullRequested ? 'texto_completo_incluido_pode_consumir_mais_tokens' : '',
    ]),
  }, result);
}

async function bridgeGet(pathname) {
  const response = await fetchBridge(pathname, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, raw: text };
  }

  if (!response.ok) {
    if (json && typeof json === 'object') {
      return json;
    }
    throw new Error(`Lex Desktop bridge ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function bridgePost(pathname, payload, additionalHeaders = {}) {
  const response = await fetchBridge(pathname, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...additionalHeaders,
    },
    body: JSON.stringify(payload || {}),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, raw: text };
  }

  if (!response.ok) {
    if (json && typeof json === 'object') {
      return json;
    }
    throw new Error(`Lex Desktop bridge ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function healthTool() {
  const health = await bridgeGet('/health');
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(health, null, 2),
      },
    ],
  };
}

async function pjeStatusTool() {
  const status = await bridgeGet('/pje/status');
  return textToolResult(compactPjeStatus(status, {}));
}

async function pjeConsultarProcessoTool(input) {
  const result = await bridgePost('/pje/consultar-processo', input);
  return textToolResult(compactPjeConsultaPlan(result, input, 'read_only_plan'));
}

async function pjeAbrirConsultaTool(input) {
  const result = await bridgePost('/pje/abrir-consulta', input);
  return textToolResult(compactPjeConsultaPlan(result, input, 'open_consulta'));
}

async function pjeInspecionarContextoTool(input) {
  const request = prepareCompactInspectionInput(input);
  const result = await bridgePost('/pje/inspecionar-contexto', request);
  const knownFlows = await getKnownFlowsForPage(pageForKnownFlowLookup(result));
  return textToolResult(attachBrainInfo(compactPjeInspection(result, input), { knownFlows }));
}

async function pjeExplorarIntencaoTool(input) {
  const result = await bridgePost('/pje/explorar-intencao', input);
  return textToolResult(compactPjeIntentExploration(result, input));
}

async function pjeExecutarCandidatoIntencaoTool(input) {
  const result = await bridgePost('/pje/executar-candidato-intencao', input);
  return textToolResult(compactPjeExecuteIntentCandidate(result, input));
}

async function pjeExecutarIntencaoIncrementalTool(input) {
  const result = await bridgePost('/pje/executar-intencao-incremental', input);
  return textToolResult(compactPjeExecuteIntentIncremental(result, input));
}

async function pjePreencherNumeroTool(input) {
  const startedAt = Date.now();
  const result = await bridgePost('/pje/preencher-numero', input);
  const observation = await recordPjeObservation('pje_preencher_numero', input, result, Date.now() - startedAt);
  return textToolResult(attachBrainInfo(compactPjeFillNumber(result, input), { observation }));
}

async function pjeClicarConsultarTool(input) {
  const startedAt = Date.now();
  const result = await bridgePost('/pje/clicar-consultar', input);
  const observation = await recordPjeObservation('pje_clicar_consultar', input, result, Date.now() - startedAt);
  return textToolResult(attachBrainInfo(compactPjeClickSearch(result, input), { observation }));
}

async function pjeLerResultadosTool(input) {
  const startedAt = Date.now();
  const request = prepareCompactSearchResultsInput(input);
  const result = await bridgePost('/pje/ler-resultados', request);
  const observation = await recordPjeObservation('pje_ler_resultados', request, result, Date.now() - startedAt);
  return textToolResult(attachBrainInfo(compactPjeSearchResults(result, input), { observation }));
}

async function pjeLerAutosTool(input) {
  const startedAt = Date.now();
  const result = await bridgePost('/pje/ler-autos', input);
  const observation = await recordPjeObservation('pje_ler_autos', input, result, Date.now() - startedAt);
  return textToolResult(attachBrainInfo(compactPjeAutos(result, input), { observation }));
}

async function pjeBaixarDocumentoAtualTool(input) {
  const authorization = extractHitlAuthorization(input);
  const startedAt = Date.now();
  const result = await bridgePost('/pje/baixar-documento-atual', authorization.payload, authorization.headers);
  const observation = await recordPjeObservation('pje_baixar_documento_atual', authorization.payload, result, Date.now() - startedAt);
  return textToolResult(attachBrainInfo(compactPjeDownloadCurrentDocument(result, authorization.payload), { observation }));
}

async function pjeAnalisarDocumentoBaixadoTool(input) {
  const startedAt = Date.now();
  const result = await bridgePost('/pje/analisar-documento-baixado', input);
  const observation = await recordPjeObservation('pje_analisar_documento_baixado', input, result, Date.now() - startedAt);
  return textToolResult(attachBrainInfo(compactPjeAnalyzeDownloadedDocument(result, input), { observation }));
}

async function pjeAbrirResultadoTool(input) {
  const authorization = extractHitlAuthorization(input);
  const startedAt = Date.now();
  const result = await bridgePost('/pje/abrir-resultado', authorization.payload, authorization.headers);
  const observation = await recordPjeObservation('pje_abrir_resultado', authorization.payload, result, Date.now() - startedAt);
  return textToolResult(attachBrainInfo(compactPjeOpenResult(result, authorization.payload), { observation }));
}

async function confirmTool(input) {
  const result = await bridgePost('/confirm', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function brainSearchTool(input) {
  const result = await bridgePost('/brain/search', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function brainFlowsTool(input) {
  const result = await bridgePost('/brain/flows', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function brainGetFlowTool(input) {
  const result = await bridgePost('/brain/flow', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function brainRecordObservationTool(input) {
  const result = await bridgePost('/brain/record-observation', input);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

if (process.argv.includes('--self-test')) {
  healthTool()
    .then((result) => {
      console.log(result.content[0].text);
    })
    .catch((error) => {
      console.error(error?.message || String(error));
      process.exit(1);
    });
} else {
  const server = new McpServer({
    name: 'lex-desktop',
    version: '0.1.0',
  });

  registerLexTool(server, 'lex_health', {
    title: 'Lex Desktop Health',
    description: 'Retorna status local do Lex Desktop, bridge e Lex Engine.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, healthTool);

  if (legacyConfirmEnabled) registerLexTool(server, 'lex_confirm', {
    title: 'Lex Desktop Confirm',
    description: 'Abre uma confirmacao no Lex Desktop e retorna se o usuario aceitou.',
    inputSchema: {
      message: z.string().min(1).describe('Mensagem objetiva para o usuario confirmar.'),
      title: z.string().optional().describe('Titulo curto da janela de confirmacao.'),
      detail: z.string().optional().describe('Detalhes adicionais, riscos ou contexto da acao.'),
      level: z.enum(['info', 'warning', 'danger']).optional().describe('Nivel visual da confirmacao.'),
      confirmLabel: z.string().optional().describe('Texto do botao de aceite.'),
      cancelLabel: z.string().optional().describe('Texto do botao de cancelamento.'),
      requestId: z.string().optional().describe('Identificador opcional para correlacao/auditoria.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, confirmTool);

  registerLexTool(server, 'pje_status', {
    title: 'Lex PJe Status',
    description: 'Retorna status read-only do navegador/PJe na Lex Desktop, sem abrir navegador nem executar acoes.',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, pjeStatusTool);

  registerLexTool(server, 'pje_consultar_processo', {
    title: 'Lex PJe Consultar Processo',
    description: 'Prepara uma consulta read-only de processo por numero CNJ: valida o numero, infere tribunal, resolve URLs do PJe e retorna readiness. Nao automatiza o browser; se includeDataJud=true, tenta consultar a API DataJud configurada na Lex Desktop.',
    inputSchema: {
      numero: z.string().min(1).describe('Numero do processo em formato CNJ. Ex: 0801234-56.2024.8.14.0301.'),
      tribunal: z.string().optional().describe('Tribunal opcional. Ex: TJPA, TRT8, TRF1. Se ausente, a Lex tenta inferir pelo CNJ.'),
      includeDataJud: z.boolean().optional().describe('Quando true, tenta consulta DataJud pela Lex Desktop se a chave estiver configurada. Pode acessar API externa do CNJ.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  }, pjeConsultarProcessoTool);

  registerLexTool(server, 'pje_abrir_consulta', {
    title: 'Lex PJe Abrir Consulta',
    description: 'Abre ou navega diretamente o Chrome controlado da Lex para a tela estruturada de consulta do PJe. Nao exige numero CNJ, nao preenche campos e nao pratica atos processuais. Use quando o usuario pedir para abrir o PJe/tribunal e tambem para voltar do painel ou login antes de preencher um processo. Em tarefas PJe, permaneca neste fluxo do Desktop em vez de usar navegacao generica.',
    inputSchema: {
      numero: z.string().optional().describe('Numero do processo em formato CNJ, opcional, usado apenas para confirmar/inferir o tribunal quando fornecido.'),
      tribunal: z.string().optional().describe('Tribunal opcional. Ex: TJPA, TRT8, TRF1. Se ausente e nao houver numero, a Lex usa TJPA como padrao do Desktop.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
    },
  }, pjeAbrirConsultaTool);

  registerLexTool(server, 'pje_inspecionar_contexto', {
    title: 'Lex PJe Inspecionar Contexto',
    description: 'Inspeciona de forma read-only o browser controlado da Lex. Politica economica: se retornar brain.knownFlows, prefira o fluxo conhecido antes de pedir includeRaw/includeDebug. Use includeRaw/includeDebug apenas quando discoveryRecommended=true, confidence=low, tela nova, erro ou diagnostico solicitado. Nao clica, nao preenche e nao navega.',
    inputSchema: {
      waitMs: z.number().int().min(0).max(5000).optional().describe('Espera passiva antes da leitura, util para PJe/JSF terminar de renderizar. Maximo 5000 ms.'),
      maxPages: z.number().int().min(1).max(20).optional().describe('Maximo de abas/popups a inspecionar. Padrao: 8.'),
      maxElementsPerFrame: z.number().int().min(1).max(150).optional().describe('Maximo de elementos interativos por iframe. Padrao: 60.'),
      maxTextSnippetsPerFrame: z.number().int().min(0).max(60).optional().describe('Maximo de trechos de texto visivel por iframe. Padrao: 16.'),
      includeScreenshot: z.boolean().optional().describe('Quando true, inclui screenshot JPEG base64 da aba ativa. Pode aumentar bastante a resposta.'),
      fullPageScreenshot: z.boolean().optional().describe('Quando includeScreenshot=true, captura a pagina inteira em vez da viewport atual.'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, pjeInspecionarContextoTool);

  // Ferramentas exploratorias ficam fora do caminho do MVP; habilite apenas para desenvolvimento.
  if (intentToolsEnabled) {
  registerLexTool(server, 'pje_explorar_intencao', {
    title: 'Lex PJe Explorar Intencao',
    description: 'Traduz um pedido livre do usuario para uma intencao operacional do PJe, cruza isso com a worldtree/DOM atual e retorna um plano read-only de exploracao incremental. Nao clica, nao navega e nao pratica atos. Nao use para consulta simples por numero CNJ: nesse caso use pje_abrir_consulta -> pje_preencher_numero(dryRun=false) -> pje_clicar_consultar(dryRun=false) -> pje_ler_resultados. Use esta tool apenas para objetivos adjacentes ou novos, como exportar processo, baixar autos completos ou revelar menus relevantes.',
    inputSchema: {
      task: z.string().min(1).describe('Pedido em linguagem natural. Ex: "baixar o processo inteiro", "exportar os autos completos", "achar onde baixa o PDF integral".'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, pjeExplorarIntencaoTool);

  registerLexTool(server, 'pje_executar_candidato_intencao', {
    title: 'Lex PJe Executar Candidato de Intencao',
    description: 'Executa um unico candidato levantado pela exploracao por intencao, com dryRun por padrao e confirmacao visual no Electron quando dryRun=false. Apos agir, reinspeciona o contexto atual. Nao continua automaticamente para outros passos. Nao use para consulta simples por numero CNJ; use as tools fixas de consulta do PJe.',
    inputSchema: {
      candidateRef: z.string().min(1).describe('Ref do candidato retornado por pje_explorar_intencao.'),
      task: z.string().optional().describe('Pedido original em linguagem natural, usado apenas para contexto/auditoria.'),
      suggestedAction: z.enum(['fill', 'click', 'expand', 'download', 'inspect']).optional().describe('Acao sugerida do candidato. Hoje a execucao efetiva cobre principalmente click/expand/download via clique unico.'),
      selectorHints: z.array(z.string()).optional().describe('Fallback opcional de selectorHints, caso queira reenviar junto com o candidato.'),
      dryRun: z.boolean().optional().describe('Padrao true. Quando true, apenas valida e prepara a execucao do candidato. Quando false, pede confirmacao e executa um unico passo.'),
      waitAfterMs: z.number().int().min(500).max(10000).optional().describe('Espera apos a execucao do candidato para o PJe atualizar a tela. Padrao: 2500 ms.'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, pjeExecutarCandidatoIntencaoTool);

  registerLexTool(server, 'pje_executar_intencao_incremental', {
    title: 'Lex PJe Executar Intencao Incremental',
    description: 'Executa um loop curto e seguro de exploracao por intencao no PJe: levanta candidatos, confirma o melhor candidato do passo, executa um unico passo, reinspeciona e decide se vale mais um passo. Nao use para consulta simples por numero CNJ ou para clicar em Pesquisar; use pje_abrir_consulta -> pje_preencher_numero(dryRun=false) -> pje_clicar_consultar(dryRun=false) -> pje_ler_resultados. Use esta tool apenas para objetivos adjacentes como exportar processo, revelar menu ou buscar autos completos sem criar fluxo fixo.',
    inputSchema: {
      task: z.string().min(1).describe('Pedido em linguagem natural. Ex: "baixar o processo inteiro", "achar onde exporta os autos completos".'),
      maxSteps: z.number().int().min(1).max(3).optional().describe('Maximo de passos incrementais a tentar. Padrao: 2.'),
      dryRun: z.boolean().optional().describe('Padrao true. Quando true, nao executa nada e apenas prepara o primeiro estado de exploracao. Quando false, pede confirmacao em cada passo antes de agir.'),
      waitAfterMs: z.number().int().min(500).max(10000).optional().describe('Espera apos cada passo executado para o PJe atualizar a tela. Padrao: 2500 ms.'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, pjeExecutarIntencaoIncrementalTool);
  }

  registerLexTool(server, 'pje_preencher_numero', {
    title: 'Lex PJe Preencher Numero',
    description: 'Valida e normaliza um numero CNJ, confere possivel divergencia de tribunal e preenche diretamente os campos segmentados do numero do processo no PJe. Para pedido direto do usuario para pesquisar um processo, use dryRun=false no fluxo conhecido. Por padrao retorna resumo compacto e roda em dryRun=true. Com dryRun=false, executa o preenchimento seguro e nao clica em Consultar/Pesquisar. Se retornar erro de tela/login/navegacao, siga nextActions e volte com pje_abrir_consulta antes de preencher novamente; nao tente descobrir outra rota. Use includeRaw/includeDebug apenas para diagnostico.',
    inputSchema: {
      numero: z.string().min(1).describe('Numero do processo CNJ, com ou sem mascara. Ex: 0886971-84.2025.8.14.0301 ou 08869718420258140301.'),
      tribunal: z.string().optional().describe('Tribunal esperado, ex: TJPA. Se divergir do CNJ, a Lex bloqueia salvo allowTribunalMismatch=true.'),
      dryRun: z.boolean().optional().describe('Padrao true. Quando true, valida e mostra o plano sem alterar campos. Quando false, executa diretamente o preenchimento seguro.'),
      allowTribunalMismatch: z.boolean().optional().describe('Permite preencher mesmo quando o tribunal inferido pelo CNJ diverge do tribunal informado. Use apenas com confirmacao humana.'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, pjePreencherNumeroTool);

  registerLexTool(server, 'pje_clicar_consultar', {
    title: 'Lex PJe Clicar Consultar',
    description: 'Encontra um botao seguro de Pesquisar/Consultar na tela atual do PJe e clica uma unica vez. Para pedido direto do usuario apos pje_preencher_numero bem-sucedido, use dryRun=false. Retorna resumo compacto por padrao. Antes de explorar tela desconhecida, prefira fluxos/seletores conhecidos do Brain quando disponiveis. Por padrao roda em dryRun=true. Com dryRun=false, executa diretamente a consulta segura, sem abrir resultado, baixar documentos ou protocolar. Bloqueia consulta vazia salvo allowEmptySearch=true. Se retornar empty_search_blocked, volte para pje_preencher_numero(dryRun=false) ou pje_abrir_consulta; nao tente descobrir outra rota. Use includeRaw/includeDebug apenas para diagnostico.',
    inputSchema: {
      dryRun: z.boolean().optional().describe('Padrao true. Quando true, identifica candidatos e criterios sem clicar. Quando false, executa diretamente o clique seguro de consulta.'),
      waitAfterMs: z.number().int().min(500).max(10000).optional().describe('Espera apos o clique para o PJe atualizar a tela. Padrao: 2500 ms.'),
      allowEmptySearch: z.boolean().optional().describe('Padrao false. Quando false, bloqueia clique se nao houver criterio de busca preenchido.'),
      candidateRef: z.string().optional().describe('Ref opcional retornada pelo dry run para forcar um botao especifico, ex: search:0:12.'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, pjeClicarConsultarTool);

  registerLexTool(server, 'pje_ler_resultados', {
    title: 'Lex PJe Ler Resultados',
    description: 'Le de forma read-only os resultados visiveis da consulta atual do PJe. Por padrao retorna resumo compacto de linhas, estado, avisos e proximas acoes. Se o usuario pedir ultima movimentacao e ela estiver visivel nos resultados, responda com esses dados sem abrir autos. Politica economica: nao chame includeRaw/includeDebug em loop; use apenas quando discoveryRecommended=true, confidence=low, tabela ambigua ou diagnostico solicitado. Nao clica, nao abre processo, nao baixa documentos e nao navega.',
    inputSchema: {
      waitMs: z.number().int().min(0).max(10000).optional().describe('Espera passiva antes da leitura, util para o PJe terminar AJAX/JSF. Padrao: 1000 ms.'),
      maxRows: z.number().int().min(1).max(100).optional().describe('Maximo de linhas de resultado a retornar. Padrao: 20.'),
      includeRawText: z.boolean().optional().describe('Quando true, inclui um preview textual bruto da pagina para diagnostico. Padrao false.'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, pjeLerResultadosTool);

  registerLexTool(server, 'pje_ler_autos', {
    title: 'Lex PJe Ler Autos',
    description: 'Le de forma read-only a aba de autos ja aberta no PJe: numero, cabecalho, documento atual, movimentos visiveis na timeline e acoes perigosas visiveis. Nao clica, nao baixa documento, nao peticiona e nao aceita avisos. Use antes de pedir includeRaw em pje_inspecionar_contexto.',
    inputSchema: {
      waitMs: z.number().int().min(0).max(10000).optional().describe('Espera passiva antes da leitura, util para o viewer/timeline terminar de renderizar. Padrao: 1000 ms.'),
      maxMovements: z.number().int().min(1).max(30).optional().describe('Maximo de movimentacoes visiveis a retornar. Padrao: 8.'),
      maxDocumentLines: z.number().int().min(0).max(40).optional().describe('Maximo de linhas de preview do documento atual. Padrao: 12.'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, pjeLerAutosTool);

  registerLexTool(server, 'pje_baixar_documento_atual', {
    title: 'Lex PJe Baixar Documento Atual',
    description: 'Baixa somente o documento atualmente aberto no visualizador dos autos do PJe, com travas HITL. Por padrao dryRun=true apenas identifica documento e botao. Com dryRun=false, a propria chamada exibe a aprovacao na Console Lex; nao chame lex_confirm separadamente. Nao baixa autos completos, nao peticiona e nao executa outros atos.',
    inputSchema: {
      dryRun: z.boolean().optional().describe('Padrao true. Quando true, identifica documento e botao sem baixar. Quando false, abre HITL na Console Lex e baixa apenas se o usuario aceitar.'),
      [internalHitlCapabilityArg]: z.string().optional().describe('Campo interno de autorizacao; nao deve ser enviado pelo modelo.'),
      waitAfterMs: z.number().int().min(1000).max(30000).optional().describe('Tempo maximo para aguardar o evento de download. Padrao: 10000 ms.'),
      downloadDir: z.string().optional().describe('Pasta destino opcional. Padrao: Downloads/Lex PJe.'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, pjeBaixarDocumentoAtualTool);

  registerLexTool(server, 'pje_analisar_documento_baixado', {
    title: 'Lex PJe Analisar Documento Baixado',
    description: 'Analisa localmente um PDF ja baixado do PJe, sem clicar no browser: encontra o arquivo, extrai texto com pdf-parse, detecta tipo provavel, processo, datas, valores e trechos relevantes para analise juridica. Por padrao usa o PDF mais recente em Downloads/Lex PJe. Use includeFullText apenas quando precisar do texto integral, pois pode gastar mais tokens.',
    inputSchema: {
      filePath: z.string().optional().describe('Caminho local do PDF. Se ausente, usa o PDF mais recente em Downloads/Lex PJe.'),
      downloadDir: z.string().optional().describe('Pasta onde procurar o PDF mais recente. Padrao: Downloads/Lex PJe.'),
      maxChars: z.number().int().min(1000).max(60000).optional().describe('Tamanho maximo dos trechos retornados para analise. Padrao: 12000.'),
      includeFullText: z.boolean().optional().describe('Padrao false. Quando true, inclui o texto completo extraido; use com cuidado para economizar tokens.'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, pjeAnalisarDocumentoBaixadoTool);

  registerLexTool(server, 'pje_abrir_resultado', {
    title: 'Lex PJe Abrir Resultado',
    description: 'Seleciona um resultado visivel da consulta do PJe e prepara a abertura dos autos com travas. Nao use se pje_ler_resultados ja respondeu ao pedido do usuario, como ultima movimentacao visivel: responda e apenas ofereca autos. Use apenas quando o usuario pedir abrir autos, documento, capa, movimentos internos ou quando os resultados nao bastarem. Por padrao retorna resumo compacto. dryRun=true nao clica. dryRun=false e aceitarAviso=false abre apenas o link/aviso/modal e para sem aceitar aviso. Quando o usuario pedir entrada nos autos, chame esta tool com aceitarAviso=true: a propria chamada exibe HITL na Console Lex; nao chame lex_confirm separadamente. Nao baixa documentos e nao peticiona.',
    inputSchema: {
      numero: z.string().optional().describe('Numero CNJ esperado para selecionar a linha correta. Se ausente, usa resultadoIndex.'),
      resultadoIndex: z.number().int().min(1).max(100).optional().describe('Indice humano do resultado visivel, comecando em 1. Padrao: 1.'),
      dryRun: z.boolean().optional().describe('Padrao true. Quando true, escolhe a linha/link e mostra o plano sem clicar.'),
      aceitarAviso: z.boolean().optional().describe('Padrao false. Quando false, abre apenas o aviso/modal. Quando true, exibe HITL na Console Lex e so aceita/continua para os autos apos aprovacao.'),
      [internalHitlCapabilityArg]: z.string().optional().describe('Campo interno de autorizacao; nao deve ser enviado pelo modelo.'),
      waitAfterMs: z.number().int().min(500).max(15000).optional().describe('Espera apos clique para modal/aba carregar. Padrao: 3000 ms.'),
      includeRaw: z.boolean().optional().describe('Quando true, inclui o JSON completo retornado pelo bridge. Use somente para diagnostico.'),
      includeDebug: z.boolean().optional().describe('Alias diagnostico para incluir o JSON completo retornado pelo bridge.'),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, pjeAbrirResultadoTool);

  registerLexTool(server, 'brain_search', {
    title: 'Lex Brain Search',
    description: 'Busca read-only no Brain local da Lex por processos, teses, aprendizados e fluxos.',
    inputSchema: {
      query: z.string().min(1).describe('Termo de busca no Brain local.'),
      types: z.array(z.enum(brainNodeTypes)).optional().describe('Tipos opcionais de nodes para filtrar.'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximo de resultados, de 1 a 20.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, brainSearchTool);

  registerLexTool(server, 'brain_flows', {
    title: 'Lex Brain Flows',
    description: 'Lista fluxos operacionais aprendidos no Brain local da Lex, sem executar acoes. Para PJe em modo economico, consulte/reuse flows conhecidos antes de pedir includeRaw/includeDebug ou redescobrir a tela.',
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional().describe('Maximo de flows retornados, de 1 a 50.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, brainFlowsTool);

  registerLexTool(server, 'brain_get_flow', {
    title: 'Lex Brain Get Flow',
    description: 'Carrega detalhes read-only de um flow operacional do Brain local da Lex. Use para recuperar passos salvos e evitar reexplorar telas PJe conhecidas; se o flow falhar, volte para inspeção compacta e so então discovery bruto.',
    inputSchema: {
      flowId: z.string().optional().describe('ID do node flow no Brain.'),
      label: z.string().optional().describe('Label exata do flow no Brain, usado se flowId nao for informado.'),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, brainGetFlowTool);

  registerLexTool(server, 'brain_record_observation', {
    title: 'Lex Brain Record Observation',
    description: 'Registra uma observacao operacional controlada no Brain local da Lex para aprendizado de fluxos.',
    inputSchema: {
      tool: z.string().min(1).describe('Nome da acao observada, por exemplo browser_click ou pje_consultar_processo.'),
      server: z.string().optional().describe('Origem logica da observacao. Padrao: lex-desktop-mcp.'),
      input: z.record(z.string(), z.unknown()).optional().describe('Entrada sanitizada da acao observada.'),
      outputPreview: z.string().optional().describe('Resumo curto do resultado observado.'),
      output: z.string().optional().describe('Resultado textual usado apenas para hash/preview, limitado pela Lex Desktop.'),
      success: z.boolean().optional().describe('Se a acao observada teve sucesso. Padrao: true.'),
      error: z.string().optional().describe('Erro observado quando success=false.'),
      durationMs: z.number().int().min(0).optional().describe('Duracao aproximada da acao em milissegundos.'),
      before: observationStateSchema.optional().describe('Estado da tela antes da acao.'),
      after: observationStateSchema.optional().describe('Estado da tela depois da acao.'),
      traceId: z.string().optional().describe('ID opcional para agrupar observacoes do mesmo fluxo.'),
      detectFlows: z.boolean().optional().describe('Quando true, tenta detectar flows apos gravar. Use com parcimonia.'),
      flowOptions: z.object({
        minActions: z.number().int().min(1).max(12).optional(),
        minInstances: z.number().int().min(1).max(20).optional(),
        minEdgeWeight: z.number().int().min(1).max(20).optional(),
      }).optional(),
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
    },
  }, brainRecordObservationTool);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error) => {
    console.error('Lex Desktop MCP server failed:', error);
    process.exit(1);
  });
}
