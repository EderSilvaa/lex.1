import type { Frame, Page } from 'playwright-core';
import { getActivePage } from '../browser-manager';

interface ReadSearchResultsParams {
  waitMs?: unknown;
  maxRows?: unknown;
  includeRawText?: unknown;
}

interface PageSummary {
  url: string;
  title: string;
}

interface RowActionCandidate {
  tag: string;
  type: string;
  id: string;
  name: string;
  label: string;
  href: string;
  selector: string;
}

interface SearchResultRow {
  rowIndex: number;
  cells: string[];
  record: Record<string, string>;
  processNumber: string | null;
  links: RowActionCandidate[];
  actions: RowActionCandidate[];
}

interface SearchResultTable {
  frameIndex: number;
  frameUrl: string;
  tableIndex: number;
  headers: string[];
  rowCount: number;
  rows: SearchResultRow[];
  score: number;
  signals: string[];
}

interface FrameReadResult {
  frameIndex: number;
  frameUrl: string;
  accessible: boolean;
  title: string;
  readyState: string;
  resultCountText: string | null;
  resultCount: number | null;
  tables: SearchResultTable[];
  textPreview?: string;
  error?: string;
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
  if (['false', '0', 'nao', 'n\u00e3o', 'no'].includes(text)) return false;
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

function scoreTable(headers: string[], rows: SearchResultRow[]): { score: number; signals: string[] } {
  const haystack = normalizeText([
    headers.join(' '),
    rows.slice(0, 5).map((row) => row.cells.join(' ')).join(' '),
  ].join(' '));
  const signals: string[] = [];
  let score = 0;

  const addSignal = (term: string, points: number, signal: string) => {
    if (haystack.includes(term)) {
      score += points;
      signals.push(signal);
    }
  };

  addSignal('processo', 45, 'has_processo');
  addSignal('polo ativo', 30, 'has_polo_ativo');
  addSignal('polo passivo', 30, 'has_polo_passivo');
  addSignal('classe judicial', 25, 'has_classe_judicial');
  addSignal('orgao julgador', 25, 'has_orgao_julgador');
  addSignal('autuado em', 20, 'has_autuado_em');
  addSignal('ultima moviment', 20, 'has_ultima_movimentacao');

  const processRows = rows.filter((row) => !!row.processNumber).length;
  if (processRows > 0) {
    score += 60 + Math.min(processRows, 5) * 10;
    signals.push('has_process_number_rows');
  }

  if (rows.length > 0) {
    score += Math.min(rows.length, 10) * 2;
    signals.push('has_rows');
  }

  return { score, signals };
}

function pickBestTables(frames: FrameReadResult[]): SearchResultTable[] {
  return frames
    .flatMap((frame) => frame.tables)
    .filter((table) => table.score > 0 && table.rows.length > 0)
    .sort((a, b) => b.score - a.score);
}

function extractPrimaryRows(table: SearchResultTable | null, maxRows: number): SearchResultRow[] {
  if (!table) return [];
  return table.rows
    .filter((row) => {
      const text = normalizeText(row.cells.join(' '));
      if (!text || text.length < 4) return false;
      if (/^[<>\s]+$/.test(text)) return false;
      return !!row.processNumber || table.score >= 60;
    })
    .slice(0, maxRows);
}

async function inspectFrameForResults(frame: Frame, frameIndex: number, maxRows: number, includeRawText: boolean): Promise<FrameReadResult> {
  try {
    const raw = await frame.evaluate((limits: { maxRows: number; includeRawText: boolean }) => {
      const clean = (value: unknown, max = 500): string => {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 3)}...` : text;
      };
      const cssEscape = (value: string): string => {
        const css = (window as any).CSS;
        if (css && typeof css.escape === 'function') return css.escape(value);
        return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
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
      const selectorFor = (node: Element): string => {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const id = clean(el.id, 160);
        const name = clean(el.getAttribute('name'), 160);
        const href = tag === 'a' ? clean((el as HTMLAnchorElement).getAttribute('href'), 220) : '';
        const title = clean(el.getAttribute('title'), 160);
        const text = clean(el.textContent, 80);
        if (id) return `#${cssEscape(id)}`;
        if (name) return `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
        if (href) return `${tag}[href="${href.replace(/"/g, '\\"')}"]`;
        if (title) return `${tag}[title="${title.replace(/"/g, '\\"')}"]`;
        if (text) return `${tag}:text("${text.replace(/"/g, '\\"')}")`;
        return tag;
      };
      const cellsFor = (row: HTMLTableRowElement): string[] => Array.from(row.children)
        .filter((child) => ['TD', 'TH'].includes(child.tagName))
        .map((cell) => clean(cell.textContent, 700));
      const textForControl = (node: Element): string => {
        const el = node as HTMLElement;
        const input = node as HTMLInputElement;
        return clean(el.textContent || input.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.id || el.getAttribute('name'), 180);
      };
      const actionFor = (node: Element) => {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const input = node as HTMLInputElement;
        return {
          tag,
          type: tag === 'input' ? clean(input.type, 40).toLowerCase() : '',
          id: clean(el.id, 160),
          name: clean(el.getAttribute('name'), 160),
          label: textForControl(node),
          href: tag === 'a' ? clean((el as HTMLAnchorElement).href, 400) : '',
          selector: selectorFor(node),
        };
      };
      const normalizeHeader = (value: string, index: number): string => {
        const header = clean(value, 120) || `coluna_${index + 1}`;
        return header;
      };
      const processMatch = (text: string): string | null => {
        const match = text.match(/\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/);
        if (!match) return null;
        const digits = match[0].replace(/\D/g, '');
        if (digits.length !== 20) return match[0];
        return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
      };

      const bodyText = clean(document.body?.innerText || '', 20000);
      const countMatch = bodyText.match(/(\d+)\s+resultado[s]?\s+encontrado[s]?/i);
      const tables = Array.from(document.querySelectorAll('table'))
        .map((table, tableIndex) => {
          if (!visible(table)) return null;
          const rowNodes = Array.from(table.querySelectorAll('tr'))
            .filter((row) => visible(row));
          if (rowNodes.length === 0) return null;

          let headerIndex = rowNodes.findIndex((row) => row.querySelectorAll('th').length > 0);
          if (headerIndex < 0) {
            headerIndex = rowNodes.findIndex((row) => {
              const text = clean(row.textContent).toLowerCase();
              return text.includes('processo') && (text.includes('polo') || text.includes('classe') || text.includes('orgao'));
            });
          }

          const headerCells = headerIndex >= 0 ? cellsFor(rowNodes[headerIndex] as HTMLTableRowElement) : [];
          const rowsToRead = rowNodes
            .filter((_, index) => headerIndex < 0 || index > headerIndex)
            .slice(0, limits.maxRows);

          const inferredHeaders = headerCells.length > 0
            ? headerCells.map(normalizeHeader)
            : [];

          const rows = rowsToRead.map((rowNode, rowIndex) => {
            const row = rowNode as HTMLTableRowElement;
            const cells = cellsFor(row);
            const headers = inferredHeaders.length >= cells.length
              ? inferredHeaders
              : cells.map((_, index) => inferredHeaders[index] || `coluna_${index + 1}`);
            const record: Record<string, string> = {};
            cells.forEach((cell, index) => {
              const key = headers[index] || `coluna_${index + 1}`;
              record[key] = cell;
            });
            const controls = Array.from(row.querySelectorAll('a[href], button, input[type="button"], input[type="submit"], [role="button"], [role="link"]'))
              .filter((node) => visible(node));
            const actions = controls.map(actionFor);
            const links = actions.filter((action) => action.tag === 'a' && action.href);
            return {
              rowIndex,
              cells,
              record,
              processNumber: processMatch(cells.join(' ')),
              links,
              actions,
            };
          }).filter((row) => row.cells.some((cell) => !!cell));

          return {
            tableIndex,
            headers: inferredHeaders,
            rowCount: rows.length,
            rows,
          };
        })
        .filter(Boolean);

      return {
        title: clean(document.title, 240),
        readyState: document.readyState,
        resultCountText: countMatch ? countMatch[0] : null,
        resultCount: countMatch ? Number(countMatch[1]) : null,
        tables,
        textPreview: limits.includeRawText ? bodyText.slice(0, 5000) : undefined,
      };
    }, { maxRows, includeRawText }) as {
      title: string;
      readyState: string;
      resultCountText: string | null;
      resultCount: number | null;
      tables: Array<{
        tableIndex: number;
        headers: string[];
        rowCount: number;
        rows: SearchResultRow[];
      }>;
      textPreview?: string;
    };

    const tables: SearchResultTable[] = raw.tables.map((table) => {
      const scored = scoreTable(table.headers, table.rows);
      return {
        frameIndex,
        frameUrl: frame.url(),
        tableIndex: table.tableIndex,
        headers: table.headers,
        rowCount: table.rowCount,
        rows: table.rows,
        score: scored.score,
        signals: scored.signals,
      };
    });

    return {
      frameIndex,
      frameUrl: frame.url(),
      accessible: true,
      title: raw.title,
      readyState: raw.readyState,
      resultCountText: raw.resultCountText,
      resultCount: raw.resultCount,
      tables,
      textPreview: raw.textPreview,
    };
  } catch (err: any) {
    return {
      frameIndex,
      frameUrl: frame.url(),
      accessible: false,
      title: '',
      readyState: '',
      resultCountText: null,
      resultCount: null,
      tables: [],
      error: err?.message || String(err),
    };
  }
}

export async function readPjeSearchResults(paramsRaw: ReadSearchResultsParams = {}): Promise<any> {
  const params = paramsRaw || {};
  const waitMs = boundedNumber(params.waitMs, 1000, 0, 10000);
  const maxRows = boundedNumber(params.maxRows, 20, 1, 100);
  const includeRawText = boolParam(params.includeRawText, false);

  const page = getActivePage();
  if (!page) {
    return {
      ok: false,
      mode: 'read_only_search_results',
      error: 'no_active_page',
      message: 'Browser controlado ainda nao possui pagina ativa.',
      browserAutomationExecuted: false,
    };
  }

  if (waitMs > 0) {
    await page.waitForTimeout(waitMs);
  }

  const pageSummary = await summarizePage(page);
  if (!pageSummary.url.includes('pje.')) {
    return {
      ok: false,
      mode: 'read_only_search_results',
      error: 'not_pje_page',
      message: 'A aba ativa nao parece ser uma pagina do PJe.',
      page: pageSummary,
      browserAutomationExecuted: false,
    };
  }

  const frames = framesFor(page);
  const frameResults: FrameReadResult[] = [];
  for (const [frameIndex, frame] of frames.entries()) {
    frameResults.push(await inspectFrameForResults(frame, frameIndex, maxRows, includeRawText));
  }

  const rankedTables = pickBestTables(frameResults);
  const primaryTable = rankedTables[0] || null;
  const results = extractPrimaryRows(primaryTable, maxRows);
  const resultCountFrame = frameResults.find((frame) => frame.resultCount !== null);
  const warnings: string[] = [];

  if (!primaryTable) warnings.push('result_table_not_identified');
  if (resultCountFrame?.resultCount !== null && resultCountFrame?.resultCount !== undefined && results.length !== resultCountFrame.resultCount) {
    warnings.push('visible_rows_count_differs_from_reported_count');
  }

  return {
    ok: !!primaryTable || results.length > 0 || !!resultCountFrame,
    mode: 'read_only_search_results',
    browserAutomationExecuted: false,
    page: pageSummary,
    waitMs,
    reportedResultCount: resultCountFrame?.resultCount ?? null,
    reportedResultCountText: resultCountFrame?.resultCountText ?? null,
    resultCount: results.length,
    results,
    primaryTable: primaryTable
      ? {
          frameIndex: primaryTable.frameIndex,
          tableIndex: primaryTable.tableIndex,
          headers: primaryTable.headers,
          score: primaryTable.score,
          signals: primaryTable.signals,
        }
      : null,
    rankedTables: rankedTables.slice(0, 5).map((table) => ({
      frameIndex: table.frameIndex,
      tableIndex: table.tableIndex,
      headers: table.headers,
      rowCount: table.rowCount,
      score: table.score,
      signals: table.signals,
    })),
    frames: frameResults.map((frame) => ({
      frameIndex: frame.frameIndex,
      frameUrl: frame.frameUrl,
      accessible: frame.accessible,
      title: frame.title,
      readyState: frame.readyState,
      resultCountText: frame.resultCountText,
      resultCount: frame.resultCount,
      tableCount: frame.tables.length,
      textPreview: frame.textPreview,
      error: frame.error,
    })),
    warnings,
    nextActions: [
      results.length > 0 ? 'resultado_consulta_lido' : 'resultado_consulta_nao_lido',
      'registrar_resultado_no_brain',
      'nao_abrir_processo_sem_confirmacao',
    ],
  };
}
