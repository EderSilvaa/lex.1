import type { Frame, Page } from 'playwright-core';
import { getActivePage, setActivePage } from '../browser-manager';

interface OpenSearchResultParams {
  numero?: unknown;
  resultadoIndex?: unknown;
  dryRun?: unknown;
  aceitarAviso?: unknown;
  waitAfterMs?: unknown;
}

interface PageSummary {
  url: string;
  title: string;
}

interface ResultActionCandidate {
  actionIndex: number;
  tag: string;
  type: string;
  label: string;
  title: string;
  href: string;
  score: number;
  signals: string[];
}

interface SearchResultCandidate {
  frameIndex: number;
  frameUrl: string;
  tableIndex: number;
  rowIndex: number;
  resultNumber: number;
  cells: string[];
  processNumber: string | null;
  actions: ResultActionCandidate[];
  selectedAction: ResultActionCandidate | null;
  score: number;
  signals: string[];
}

interface AccessWarningAction {
  actionIndex: number;
  label: string;
  tag: string;
  type: string;
  score: number;
  signals: string[];
}

interface AccessWarningCandidate {
  frameIndex: number;
  frameUrl: string;
  dialogIndex: number;
  text: string;
  score: number;
  signals: string[];
  actions: AccessWarningAction[];
  selectedAcceptAction: AccessWarningAction | null;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function boolParam(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['false', '0', 'nao', 'não', 'no'].includes(text)) return false;
  if (['true', '1', 'sim', 'yes'].includes(text)) return true;
  return defaultValue;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeProcessNumber(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 20) return String(value || '').trim();
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

function processDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function framesFor(page: Page): Frame[] {
  const main = page.mainFrame();
  const frames = page.frames();
  return [main, ...frames.filter((frame) => frame !== main)];
}

async function summarizePage(page: Page): Promise<PageSummary> {
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
  };
}

function scoreOpenAction(action: Omit<ResultActionCandidate, 'score' | 'signals'>, processNumber: string | null): { score: number; signals: string[] } {
  const haystack = normalizeText([action.label, action.title, action.href].join(' '));
  const digits = processDigits([action.label, action.title, action.href].join(' '));
  const targetDigits = processDigits(processNumber);
  const signals: string[] = [];
  let score = 0;

  if (action.tag === 'a') {
    score += 20;
    signals.push('is_link');
  }

  if (targetDigits && digits.includes(targetDigits)) {
    score += 120;
    signals.push('mentions_process_number');
  }

  if (haystack.includes('processo')) {
    score += 35;
    signals.push('mentions_processo');
  }

  if (haystack.includes('detalhe') || haystack.includes('visualizar') || haystack.includes('autos')) {
    score += 25;
    signals.push('looks_like_open_process');
  }

  if (haystack.includes('peticionar') || haystack.includes('peticao')) {
    score -= 250;
    signals.push('blocked_peticionar');
  }

  if (haystack.includes('download') || haystack.includes('baixar') || haystack.includes('documento')) {
    score -= 180;
    signals.push('blocked_download_document');
  }

  return { score, signals };
}

function scoreResult(candidate: Omit<SearchResultCandidate, 'score' | 'signals' | 'selectedAction'>, targetDigits: string): { score: number; signals: string[] } {
  const rowDigits = processDigits(candidate.cells.join(' '));
  const text = normalizeText(candidate.cells.join(' '));
  const signals: string[] = [];
  let score = 0;

  if (candidate.processNumber) {
    score += 80;
    signals.push('has_process_number');
  }

  if (targetDigits && rowDigits.includes(targetDigits)) {
    score += 160;
    signals.push('matches_requested_number');
  }

  if (text.includes('polo ativo') || text.includes('polo passivo') || text.includes('classe judicial')) {
    score += 20;
    signals.push('looks_like_result_row');
  }

  return { score, signals };
}

function pickResultCandidate(candidates: SearchResultCandidate[], targetDigits: string, resultadoIndex: number): SearchResultCandidate | null {
  const valid = candidates
    .map((candidate) => {
      const actionScores = candidate.actions.map((action) => {
        const scored = scoreOpenAction(action, candidate.processNumber);
        return { ...action, score: scored.score, signals: scored.signals };
      });
      const selectedAction = actionScores
        .filter((action) => action.score > 0)
        .sort((a, b) => b.score - a.score)[0] || null;
      const scored = scoreResult(candidate, targetDigits);
      return {
        ...candidate,
        actions: actionScores,
        selectedAction,
        score: scored.score + (selectedAction?.score || 0),
        signals: [...scored.signals, ...(selectedAction?.signals || [])],
      };
    })
    .filter((candidate) => candidate.selectedAction)
    .map((candidate, index) => ({
      ...candidate,
      resultNumber: index + 1,
    }));

  if (targetDigits) {
    const exact = valid
      .filter((candidate) => processDigits(candidate.processNumber || candidate.cells.join(' ')).includes(targetDigits))
      .sort((a, b) => b.score - a.score)[0];
    if (exact) return exact;
  }

  const byIndex = valid.find((candidate) => candidate.resultNumber === resultadoIndex);
  if (byIndex) return byIndex;

  return valid.sort((a, b) => b.score - a.score)[0] || null;
}

async function collectSearchResultCandidates(page: Page, maxRows: number): Promise<SearchResultCandidate[]> {
  const frames = framesFor(page);
  const all: SearchResultCandidate[] = [];

  for (const [frameIndex, frame] of frames.entries()) {
    try {
      const rows = await frame.evaluate((limits: { frameIndex: number; maxRows: number }) => {
        const clean = (value: unknown, max = 500): string => {
          const text = String(value || '').replace(/\s+/g, ' ').trim();
          return text.length > max ? `${text.slice(0, max - 3)}...` : text;
        };
        const visible = (node: Element): boolean => {
          const el = node as HTMLElement;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0
            && rect.height > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden';
        };
        const textForControl = (node: Element): string => {
          const el = node as HTMLElement;
          const input = node as HTMLInputElement;
          return clean(el.textContent || input.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.id || el.getAttribute('name'), 240);
        };
        const processMatch = (text: string): string | null => {
          const match = text.match(/\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/);
          if (!match) return null;
          const digits = match[0].replace(/\D/g, '');
          if (digits.length !== 20) return match[0];
          return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
        };
        const cellsFor = (row: HTMLTableRowElement): string[] => Array.from(row.children)
          .filter((child) => ['TD', 'TH'].includes(child.tagName))
          .map((cell) => clean(cell.textContent, 700));

        const resultRows: any[] = [];
        Array.from(document.querySelectorAll('table')).forEach((table, tableIndex) => {
          if (!visible(table)) return;
          const rowNodes = Array.from(table.querySelectorAll('tr')).filter((row) => visible(row));
          let headerIndex = rowNodes.findIndex((row) => row.querySelectorAll('th').length > 0);
          if (headerIndex < 0) {
            headerIndex = rowNodes.findIndex((row) => {
              const text = clean(row.textContent).toLowerCase();
              return text.includes('processo') && (text.includes('polo') || text.includes('classe') || text.includes('orgao'));
            });
          }
          rowNodes
            .filter((_, index) => headerIndex < 0 || index > headerIndex)
            .slice(0, limits.maxRows)
            .forEach((rowNode, rowIndex) => {
              const row = rowNode as HTMLTableRowElement;
              const cells = cellsFor(row);
              const joined = cells.join(' ');
              const processNumber = processMatch(joined);
              if (!processNumber && !joined.toLowerCase().includes('processo')) return;
              const controls = Array.from(row.querySelectorAll('a[href], a, button, input[type="button"], input[type="submit"], [role="button"], [role="link"]'))
                .filter((node) => visible(node));
              const actions = controls.map((node, actionIndex) => {
                const el = node as HTMLElement;
                const input = node as HTMLInputElement;
                return {
                  actionIndex,
                  tag: el.tagName.toLowerCase(),
                  type: el.tagName.toLowerCase() === 'input' ? clean(input.type, 40).toLowerCase() : '',
                  label: textForControl(node),
                  title: clean(el.getAttribute('title'), 240),
                  href: el.tagName.toLowerCase() === 'a' ? clean((node as HTMLAnchorElement).href, 700) : '',
                };
              });
              resultRows.push({
                frameIndex: limits.frameIndex,
                frameUrl: window.location.href,
                tableIndex,
                rowIndex,
                resultNumber: resultRows.length + 1,
                cells,
                processNumber,
                actions,
              });
            });
        });
        return resultRows;
      }, { frameIndex, maxRows }) as Array<Omit<SearchResultCandidate, 'score' | 'signals' | 'selectedAction'>>;

      all.push(...rows.map((row) => ({
        ...row,
        score: 0,
        signals: [],
        selectedAction: null,
      })));
    } catch {
      // Frame inacessivel; ignora e segue.
    }
  }

  return all.map((candidate, index) => ({
    ...candidate,
    resultNumber: index + 1,
  }));
}

async function clickSelectedResult(page: Page, target: SearchResultCandidate): Promise<any> {
  const frame = framesFor(page)[target.frameIndex];
  if (!frame) return { ok: false, error: 'target_frame_not_found' };

  const processText = target.processNumber || normalizeProcessNumber(target.cells.join(' '));
  const selectedAction = target.selectedAction;
  const controlsSelector = 'a[href], a, button, input[type="button"], input[type="submit"], [role="button"], [role="link"]';

  try {
    await page.bringToFront().catch(() => undefined);

    let row = processText
      ? frame.locator('tr', { hasText: processText }).first()
      : frame.locator('tr').nth(target.rowIndex);

    if (await row.count() === 0 && target.cells.length > 0) {
      const rowNeedle = target.cells.find((cell) => cell && cell.length > 6) || target.cells.join(' ').slice(0, 80);
      row = frame.locator('tr', { hasText: rowNeedle }).first();
    }

    if (await row.count() === 0) {
      return { ok: false, error: 'target_row_not_found' };
    }

    await row.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined);

    let action = processText
      ? row.locator('a', { hasText: processText }).first()
      : row.locator(controlsSelector).nth(selectedAction?.actionIndex || 0);

    if (await action.count() === 0 && selectedAction?.label) {
      action = row.locator(controlsSelector, { hasText: selectedAction.label }).first();
    }

    if (await action.count() === 0) {
      action = row.locator(controlsSelector).nth(selectedAction?.actionIndex || 0);
    }

    if (await action.count() === 0) {
      return { ok: false, error: 'open_process_link_not_found' };
    }

    await action.click({ timeout: 10000 });

    return {
      ok: true,
      clicked: true,
      method: 'playwright_locator_click',
      actionIndex: selectedAction?.actionIndex ?? null,
      label: selectedAction?.label || processText || 'link do processo',
      title: selectedAction?.title || '',
      href: selectedAction?.href || '',
      score: selectedAction?.score ?? null,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: 'open_process_click_failed',
      message: err?.message || String(err),
      method: 'playwright_locator_click',
    };
  }
}

function scoreWarningAction(action: Omit<AccessWarningAction, 'score' | 'signals'>): { score: number; signals: string[] } {
  const label = normalizeText(action.label);
  const signals: string[] = [];
  let score = 0;

  for (const term of ['continuar', 'aceitar', 'prosseguir', 'confirmar', 'ciente', 'entrar', 'visualizar']) {
    if (label.includes(term)) {
      score += 50;
      signals.push(`accept_${term}`);
    }
  }

  if (label.includes('cancelar') || label.includes('fechar') || label.includes('voltar') || label.includes('nao')) {
    score -= 120;
    signals.push('reject_or_cancel');
  }

  return { score, signals };
}

function pickWarning(candidates: AccessWarningCandidate[]): AccessWarningCandidate | null {
  return candidates
    .map((candidate) => {
      const scoredActions = candidate.actions.map((action) => {
        const scored = scoreWarningAction(action);
        return { ...action, score: scored.score, signals: scored.signals };
      });
      const selectedAcceptAction = scoredActions
        .filter((action) => action.score > 0)
        .sort((a, b) => b.score - a.score)[0] || null;
      return {
        ...candidate,
        actions: scoredActions,
        selectedAcceptAction,
        score: candidate.score + (selectedAcceptAction?.score || 0),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0] || null;
}

async function inspectAccessWarning(page: Page): Promise<AccessWarningCandidate | null> {
  const frames = framesFor(page);
  const candidates: AccessWarningCandidate[] = [];

  for (const [frameIndex, frame] of frames.entries()) {
    try {
      const raw = await frame.evaluate((input: { frameIndex: number }) => {
        const clean = (value: unknown, max = 1200): string => {
          const text = String(value || '').replace(/\s+/g, ' ').trim();
          return text.length > max ? `${text.slice(0, max - 3)}...` : text;
        };
        const visible = (node: Element): boolean => {
          const el = node as HTMLElement;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0
            && rect.height > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden';
        };
        const normalize = (value: unknown): string => String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
        const textForControl = (node: Element): string => {
          const el = node as HTMLElement;
          const inputNode = node as HTMLInputElement;
          return clean(el.textContent || inputNode.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.id || el.getAttribute('name'), 220);
        };
        const dialogSelectors = [
          '[role="dialog"]',
          '.modal',
          '.modal-dialog',
          '.ui-dialog',
          '.bootbox',
          '.rf-pp',
          '.rf-pp-cntr',
          '.rich-mpnl-panel',
          '[id*="modal" i]',
          '[class*="modal" i]',
          '[id*="popup" i]',
          '[class*="popup" i]',
          '[id*="confirm" i]',
          '[class*="confirm" i]',
        ];
        const seen = new Set<Element>();
        const dialogs = dialogSelectors
          .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
          .filter((node) => {
            if (seen.has(node) || !visible(node)) return false;
            seen.add(node);
            return true;
          })
          .map((node, dialogIndex) => {
            const text = clean((node as HTMLElement).innerText || node.textContent, 2200);
            const normalized = normalize(text);
            let score = 0;
            const signals: string[] = [];
            for (const [term, points] of [
              ['acesso', 35],
              ['consulta', 20],
              ['processo', 25],
              ['advogado', 25],
              ['registro', 25],
              ['constar', 25],
              ['visualizacao', 20],
              ['continuar', 25],
              ['ciente', 20],
            ] as Array<[string, number]>) {
              if (normalized.includes(term)) {
                score += points;
                signals.push(`text_${term}`);
              }
            }
            const actions = Array.from(node.querySelectorAll('button, input[type="button"], input[type="submit"], a, [role="button"]'))
              .filter((control) => visible(control))
              .map((control, actionIndex) => {
                const el = control as HTMLElement;
                const inputControl = control as HTMLInputElement;
                return {
                  actionIndex,
                  label: textForControl(control),
                  tag: el.tagName.toLowerCase(),
                  type: el.tagName.toLowerCase() === 'input' ? clean(inputControl.type, 40).toLowerCase() : '',
                };
              });
            return {
              frameIndex: input.frameIndex,
              frameUrl: window.location.href,
              dialogIndex,
              text,
              score,
              signals,
              actions,
            };
          });
        return dialogs;
      }, { frameIndex }) as Array<Omit<AccessWarningCandidate, 'selectedAcceptAction'>>;

      candidates.push(...raw.map((item) => ({
        ...item,
        selectedAcceptAction: null,
      })));
    } catch {
      // Frame inacessivel; ignora e segue.
    }
  }

  return pickWarning(candidates);
}

async function clickAccessWarningAccept(page: Page, warning: AccessWarningCandidate, waitAfterMs: number): Promise<any> {
  const frame = framesFor(page)[warning.frameIndex];
  if (!frame) return { ok: false, error: 'warning_frame_not_found' };

  const context = page.context();
  const newPagePromise = context.waitForEvent('page', { timeout: waitAfterMs }).catch(() => null);

  const click = await frame.evaluate(() => {
    const clean = (value: unknown, max = 1200): string => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 3)}...` : text;
    };
    const visible = (node: Element): boolean => {
      const el = node as HTMLElement;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden';
    };
    const normalize = (value: unknown): string => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const textForControl = (node: Element): string => {
      const el = node as HTMLElement;
      const inputNode = node as HTMLInputElement;
      return clean(el.textContent || inputNode.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.id || el.getAttribute('name'), 220);
    };
    const score = (node: Element): number => {
      const label = normalize(textForControl(node));
      let value = 0;
      for (const term of ['continuar', 'aceitar', 'prosseguir', 'confirmar', 'ciente', 'entrar', 'visualizar']) {
        if (label.includes(term)) value += 50;
      }
      if (label.includes('cancelar') || label.includes('fechar') || label.includes('voltar') || label.includes('nao')) value -= 120;
      return value;
    };
    const dialogSelectors = [
      '[role="dialog"]',
      '.modal',
      '.modal-dialog',
      '.ui-dialog',
      '.bootbox',
      '.rf-pp',
      '.rf-pp-cntr',
      '.rich-mpnl-panel',
      '[id*="modal" i]',
      '[class*="modal" i]',
      '[id*="popup" i]',
      '[class*="popup" i]',
      '[id*="confirm" i]',
      '[class*="confirm" i]',
    ];
    const controls = dialogSelectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((node) => visible(node))
      .flatMap((dialog) => Array.from(dialog.querySelectorAll('button, input[type="button"], input[type="submit"], a, [role="button"]')))
      .filter((control) => visible(control))
      .map((control) => ({ control, label: textForControl(control), score: score(control) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    const selected = controls[0];
    if (!selected) return { ok: false, error: 'accept_action_not_found' };
    (selected.control as HTMLElement).click();
    return {
      ok: true,
      clicked: true,
      label: selected.label,
      score: selected.score,
    };
  });

  const newPage = await newPagePromise;
  if (newPage) {
    await newPage.waitForLoadState('domcontentloaded', { timeout: waitAfterMs }).catch(() => undefined);
    await newPage.bringToFront().catch(() => undefined);
    const pages = context.pages();
    const index = pages.indexOf(newPage);
    if (index >= 0) setActivePage(index);
  } else {
    await page.waitForTimeout(Math.min(waitAfterMs, 5000));
  }

  const active = newPage || getActivePage() || page;
  return {
    ...click,
    newPageOpened: !!newPage,
    activePage: await summarizePage(active),
  };
}

async function clickResultAndWait(page: Page, target: SearchResultCandidate, waitAfterMs: number): Promise<any> {
  const context = page.context();
  const newPagePromise = context.waitForEvent('page', { timeout: waitAfterMs }).catch(() => null);
  const click = await clickSelectedResult(page, target);
  const newPage = await newPagePromise;
  if (newPage) {
    await newPage.waitForLoadState('domcontentloaded', { timeout: waitAfterMs }).catch(() => undefined);
    await newPage.bringToFront().catch(() => undefined);
    const pages = context.pages();
    const index = pages.indexOf(newPage);
    if (index >= 0) setActivePage(index);
  } else {
    await page.waitForTimeout(Math.min(waitAfterMs, 5000));
  }
  return {
    ...click,
    newPageOpened: !!newPage,
    activePage: await summarizePage(newPage || page),
  };
}

export async function openPjeSearchResult(paramsRaw: OpenSearchResultParams = {}): Promise<any> {
  const params = paramsRaw || {};
  const dryRun = boolParam(params.dryRun, true);
  const aceitarAviso = boolParam(params.aceitarAviso, false);
  const waitAfterMs = boundedNumber(params.waitAfterMs, 3000, 500, 15000);
  const resultadoIndex = boundedNumber(params.resultadoIndex, 1, 1, 100);
  const requestedNumber = normalizeProcessNumber(params.numero);
  const targetDigits = processDigits(requestedNumber);

  const page = getActivePage();
  if (!page) {
    return {
      ok: false,
      mode: 'open_search_result',
      error: 'no_active_page',
      message: 'Browser controlado ainda nao possui pagina ativa.',
      browserAutomationExecuted: false,
    };
  }

  const pageBefore = await summarizePage(page);
  if (!pageBefore.url.includes('pje.')) {
    return {
      ok: false,
      mode: 'open_search_result',
      error: 'not_pje_page',
      message: 'A aba ativa nao parece ser uma pagina do PJe.',
      page: pageBefore,
      browserAutomationExecuted: false,
    };
  }

  const existingWarning = await inspectAccessWarning(page);
  const candidates = await collectSearchResultCandidates(page, 100);
  const selectedCandidate = pickResultCandidate(candidates, targetDigits, resultadoIndex);

  if (dryRun) {
    return {
      ok: !!selectedCandidate || !!existingWarning,
      mode: 'open_search_result',
      dryRun: true,
      browserAutomationExecuted: false,
      page: pageBefore,
      requestedNumber: requestedNumber || null,
      resultadoIndex,
      aceitarAviso,
      selectedCandidate,
      existingWarning,
      warnings: [
        !selectedCandidate && !existingWarning ? 'process_result_link_not_found' : null,
        aceitarAviso && !existingWarning ? 'accept_warning_requested_but_no_warning_visible_yet' : null,
      ].filter(Boolean),
      nextActions: aceitarAviso
        ? ['confirmar_entrada_autos_no_electron', 'executar_pje_abrir_resultado_com_dryRun_false_e_aceitarAviso_true']
        : ['confirmar_abertura_do_aviso_no_electron', 'executar_pje_abrir_resultado_com_dryRun_false_e_aceitarAviso_false'],
    };
  }

  if (aceitarAviso) {
    let warning = existingWarning;
    let openClick: any = null;

    if (!warning) {
      if (!selectedCandidate) {
        return {
          ok: false,
          mode: 'open_search_result',
          dryRun: false,
          aceitarAviso,
          error: 'process_result_link_not_found',
          page: pageBefore,
          browserAutomationExecuted: false,
        };
      }
      openClick = await clickResultAndWait(page, selectedCandidate, waitAfterMs);
      warning = await inspectAccessWarning(getActivePage() || page);
    }

    if (!warning) {
      return {
        ok: false,
        mode: 'open_search_result',
        dryRun: false,
        aceitarAviso,
        error: 'access_warning_not_found',
        message: 'A Lex abriu o link do processo, mas nao encontrou modal/aviso de entrada para aceitar com seguranca.',
        openClick,
        pageBefore,
        pageAfter: await summarizePage(getActivePage() || page),
        browserAutomationExecuted: !!openClick,
      };
    }

    if (!warning.selectedAcceptAction) {
      return {
        ok: false,
        mode: 'open_search_result',
        dryRun: false,
        aceitarAviso,
        error: 'access_warning_accept_action_not_found',
        message: 'O aviso de entrada foi encontrado, mas a Lex nao achou um botao seguro de Continuar/Aceitar.',
        warning,
        openClick,
        browserAutomationExecuted: !!openClick,
      };
    }

    const acceptClick = await clickAccessWarningAccept(getActivePage() || page, warning, waitAfterMs);
    return {
      ok: acceptClick?.ok !== false,
      mode: 'open_search_result',
      dryRun: false,
      aceitarAviso,
      browserAutomationExecuted: true,
      pageBefore,
      selectedCandidate,
      warning,
      openClick,
      acceptClick,
      openedAutos: acceptClick?.ok !== false,
      nextActions: ['inspecionar_contexto_dos_autos', 'ler_capa_ou_movimentacoes_somente_read_only'],
    };
  }

  if (!selectedCandidate) {
    return {
      ok: false,
      mode: 'open_search_result',
      dryRun: false,
      aceitarAviso,
      error: 'process_result_link_not_found',
      page: pageBefore,
      browserAutomationExecuted: false,
    };
  }

  const openClick = await clickResultAndWait(page, selectedCandidate, waitAfterMs);
  const warning = await inspectAccessWarning(getActivePage() || page);
  return {
    ok: openClick?.ok !== false,
    mode: 'open_search_result',
    dryRun: false,
    aceitarAviso,
    browserAutomationExecuted: true,
    pageBefore,
    selectedCandidate,
    openClick,
    warning,
    acceptedAccessWarning: false,
    openedAutos: false,
    requiresHumanConfirmation: !!warning,
    message: warning
      ? 'Aviso/modal de entrada detectado. A Lex nao clicou em Continuar/Aceitar.'
      : 'Link do processo acionado, mas nenhum aviso/modal foi detectado.',
    nextActions: warning
      ? ['revisar_aviso_no_chrome', 'executar_pje_abrir_resultado_com_aceitarAviso_true_se_o_usuario_autorizar']
      : ['inspecionar_contexto_antes_de_qualquer_novo_clique'],
  };
}
