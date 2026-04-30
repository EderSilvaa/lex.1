import type { Frame, Page } from 'playwright-core';
import { getActivePage } from '../browser-manager';

interface ClickSearchParams {
  dryRun?: unknown;
  waitAfterMs?: unknown;
  allowEmptySearch?: unknown;
  candidateRef?: unknown;
}

interface PageSummary {
  url: string;
  title: string;
}

interface FilledCriterion {
  frameIndex: number;
  tag: string;
  type: string;
  id: string;
  name: string;
  label: string;
  value: string;
  countsAsSearchCriterion: boolean;
}

interface SearchActionCandidate {
  ref: string;
  frameIndex: number;
  localIndex: number;
  tag: string;
  type: string;
  id: string;
  name: string;
  role: string;
  label: string;
  selector: string;
  score: number;
  reason: string[];
  frameUrl?: string;
}

function boolParam(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['false', '0', 'nao', 'n\u00e3o', 'no'].includes(text)) return false;
  if (['true', '1', 'sim', 'yes'].includes(text)) return true;
  return defaultValue;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function attrSelector(name: string, value: string): string {
  return `[${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
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

function scoreCandidate(raw: Omit<SearchActionCandidate, 'score' | 'reason' | 'ref' | 'frameUrl'>): {
  score: number;
  reason: string[];
} {
  const haystack = normalizeText([
    raw.id,
    raw.name,
    raw.role,
    raw.label,
    raw.type,
  ].join(' '));
  const exactLabel = normalizeText(raw.label);
  const reasons: string[] = [];
  let score = 0;

  if (exactLabel === 'pesquisar') {
    score += 100;
    reasons.push('label_pesquisar');
  } else if (exactLabel === 'consultar') {
    score += 95;
    reasons.push('label_consultar');
  } else if (/\b(pesquisar|consultar|buscar|localizar|procurar)\b/.test(haystack)) {
    score += 55;
    reasons.push('search_terms');
  }

  if (/(search|pesquis|consult|consulta|buscar|localizar|procurar)/.test(haystack)) {
    score += 35;
    reasons.push('technical_search_hint');
  }

  if (raw.type === 'submit') {
    score += 12;
    reasons.push('submit_control');
  }

  if (raw.tag === 'button' || raw.tag === 'input') {
    score += 6;
    reasons.push('clickable_control');
  }

  if (/(limpar|reset|cancelar|voltar|novo|adicionar|remover|entrar|login|certificado|assinador|download|baixar|imprimir|visualizar|detalhes)/.test(haystack)) {
    score -= 120;
    reasons.push('negative_action_terms');
  }

  return { score, reason: reasons };
}

function criterionCountsForSearch(input: FilledCriterion): boolean {
  if (!input.value.trim()) return false;
  const haystack = normalizeText([input.id, input.name, input.label].join(' '));

  // PJe usually leaves justice branch/court code pre-filled. Those alone should
  // not authorize a search, otherwise an accidental empty search could happen.
  if (
    (haystack.includes('ramojustica') || haystack.includes('respectivotribunal')) &&
    ['8', '14'].includes(input.value.trim())
  ) {
    return false;
  }

  return true;
}

async function readFilledCriteria(page: Page): Promise<FilledCriterion[]> {
  const criteria: FilledCriterion[] = [];
  const frames = framesFor(page);

  for (const [frameIndex, frame] of frames.entries()) {
    try {
      const frameCriteria = await frame.evaluate(() => {
        const clean = (value: unknown, max = 180) => String(value || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, max);
        const attr = (el: Element, name: string) => clean(el.getAttribute(name));
        const labelFor = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string => {
          const id = el.id;
          if (id) {
            const label = document.querySelector(`label[for="${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
            if (label?.textContent) return clean(label.textContent);
          }
          const parentLabel = el.closest('label');
          if (parentLabel?.textContent) return clean(parentLabel.textContent);
          return clean(attr(el, 'aria-label') || attr(el, 'title') || attr(el, 'placeholder') || el.name || el.id);
        };

        return Array.from(document.querySelectorAll('input, textarea, select'))
          .map((node) => {
            const el = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            const tag = el.tagName.toLowerCase();
            const type = tag === 'input' ? clean((el as HTMLInputElement).type).toLowerCase() : tag;
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const hiddenType = ['hidden', 'button', 'submit', 'reset', 'image', 'file', 'password'].includes(type);
            const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            if (hiddenType || !visible || el.disabled) return null;
            const value = tag === 'select'
              ? clean((el as HTMLSelectElement).value)
              : clean((el as HTMLInputElement | HTMLTextAreaElement).value);
            if (!value) return null;
            return {
              tag,
              type,
              id: clean(el.id),
              name: clean(el.name),
              label: labelFor(el),
              value,
            };
          })
          .filter(Boolean);
      }) as Array<Omit<FilledCriterion, 'frameIndex' | 'countsAsSearchCriterion'>>;

      for (const item of frameCriteria) {
        const criterion: FilledCriterion = {
          frameIndex,
          ...item,
          countsAsSearchCriterion: false,
        };
        criterion.countsAsSearchCriterion = criterionCountsForSearch(criterion);
        criteria.push(criterion);
      }
    } catch {
      // Some PJe frames may be inaccessible during navigation. Ignore and keep scanning.
    }
  }

  return criteria;
}

async function findSearchCandidates(page: Page): Promise<SearchActionCandidate[]> {
  const candidates: SearchActionCandidate[] = [];
  const frames = framesFor(page);

  for (const [frameIndex, frame] of frames.entries()) {
    try {
      const rawCandidates = await frame.evaluate(() => {
        const clean = (value: unknown, max = 220) => String(value || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, max);
        const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const attrSelector = (name: string, value: string) => `[${name}="${esc(value)}"]`;
        const labelFor = (el: HTMLElement): string => {
          const id = el.id;
          if (id) {
            const label = document.querySelector(`label[for="${esc(id)}"]`);
            if (label?.textContent) return clean(label.textContent);
          }
          const value = (el as HTMLInputElement).value;
          return clean(el.textContent || value || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || el.id || el.getAttribute('name'));
        };
        const selectorFor = (el: HTMLElement): string => {
          if (el.id) return attrSelector('id', el.id);
          const name = el.getAttribute('name');
          if (name) return `${el.tagName.toLowerCase()}${attrSelector('name', name)}`;
          const value = (el as HTMLInputElement).value;
          if (value) return `${el.tagName.toLowerCase()}${attrSelector('value', value)}`;
          const aria = el.getAttribute('aria-label');
          if (aria) return `${el.tagName.toLowerCase()}${attrSelector('aria-label', aria)}`;
          return el.tagName.toLowerCase();
        };

        return Array.from(document.querySelectorAll('button, input, a[href], [role="button"], [role="link"]'))
          .map((node, localIndex) => {
            const el = node as HTMLElement;
            const tag = el.tagName.toLowerCase();
            const input = el as HTMLInputElement;
            const type = tag === 'input' ? clean(input.type).toLowerCase() : '';
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            const disabled = Boolean((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true');
            if (!visible || disabled) return null;
            if (tag === 'input' && !['button', 'submit', 'reset'].includes(type)) return null;
            return {
              localIndex,
              tag,
              type,
              id: clean(el.id),
              name: clean(el.getAttribute('name')),
              role: clean(el.getAttribute('role')),
              label: labelFor(el),
              selector: selectorFor(el),
            };
          })
          .filter(Boolean);
      }) as Array<Omit<SearchActionCandidate, 'score' | 'reason' | 'ref' | 'frameUrl'>>;

      for (const raw of rawCandidates) {
        const scored = scoreCandidate(raw);
        if (scored.score < 35) continue;
        candidates.push({
          ...raw,
          ref: `search:${frameIndex}:${raw.localIndex}`,
          frameIndex,
          score: scored.score,
          reason: scored.reason,
          frameUrl: frame.url(),
        });
      }
    } catch {
      // Try next frame.
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 12);
}

function chooseCandidate(candidates: SearchActionCandidate[], requestedRef: unknown): SearchActionCandidate | null {
  const ref = typeof requestedRef === 'string' ? requestedRef.trim() : '';
  if (ref) return candidates.find((candidate) => candidate.ref === ref) || null;
  return candidates[0] || null;
}

async function clickCandidate(page: Page, candidate: SearchActionCandidate, waitAfterMs: number): Promise<{
  clicked: boolean;
  error?: string;
}> {
  const frame = framesFor(page)[candidate.frameIndex];
  if (!frame) return { clicked: false, error: 'candidate_frame_not_found' };

  try {
    const locator = frame.locator(candidate.selector).first();
    const count = await locator.count();
    if (count < 1) return { clicked: false, error: 'candidate_selector_not_found' };

    await locator.click({ timeout: 8000 });
    await page.waitForTimeout(waitAfterMs);
    await page.waitForLoadState('domcontentloaded', { timeout: 1000 }).catch(() => undefined);
    return { clicked: true };
  } catch (err: any) {
    return { clicked: false, error: err?.message || String(err) };
  }
}

export async function clickPjeSearch(paramsRaw: ClickSearchParams = {}): Promise<any> {
  const params = paramsRaw || {};
  const dryRun = boolParam(params.dryRun, true);
  const allowEmptySearch = boolParam(params.allowEmptySearch, false);
  const waitAfterMs = boundedNumber(params.waitAfterMs, 2500, 500, 10000);

  const page = getActivePage();
  if (!page) {
    return {
      ok: false,
      mode: dryRun ? 'dry_run_click_search' : 'click_search',
      dryRun,
      error: 'no_active_page',
      message: 'Browser controlado ainda nao possui pagina ativa.',
      browserAutomationExecuted: false,
    };
  }

  const before = await summarizePage(page);
  const isPje = before.url.includes('pje.');
  if (!isPje) {
    return {
      ok: false,
      mode: dryRun ? 'dry_run_click_search' : 'click_search',
      dryRun,
      error: 'not_pje_page',
      message: 'A aba ativa nao parece ser uma pagina do PJe.',
      page: before,
      browserAutomationExecuted: false,
    };
  }

  const [criteria, candidates] = await Promise.all([
    readFilledCriteria(page),
    findSearchCandidates(page),
  ]);
  const effectiveCriteria = criteria.filter((criterion) => criterion.countsAsSearchCriterion);
  const selectedCandidate = chooseCandidate(candidates, params.candidateRef);

  if (!selectedCandidate) {
    return {
      ok: false,
      mode: dryRun ? 'dry_run_click_search' : 'click_search',
      dryRun,
      error: params.candidateRef ? 'requested_candidate_not_found' : 'search_action_not_found',
      message: params.candidateRef
        ? 'O botao solicitado nao foi encontrado na tela atual.'
        : 'Nao encontrei um botao seguro de Pesquisar/Consultar na tela atual.',
      page: before,
      criteria,
      candidates,
      browserAutomationExecuted: false,
    };
  }

  if (!allowEmptySearch && effectiveCriteria.length === 0) {
    return {
      ok: false,
      mode: dryRun ? 'dry_run_click_search' : 'click_search',
      dryRun,
      error: 'empty_search_blocked',
      message: 'Nao encontrei criterios de busca preenchidos. A Lex bloqueou o clique para evitar uma consulta vazia.',
      page: before,
      criteria,
      candidates,
      selectedCandidate,
      browserAutomationExecuted: false,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      mode: 'dry_run_click_search',
      dryRun: true,
      page: before,
      criteria,
      effectiveCriteria,
      candidates,
      selectedCandidate,
      browserAutomationExecuted: false,
      nextActions: ['confirmar_clique_consultar', 'executar_pje_clicar_consultar_com_dryRun_false'],
    };
  }

  const clickResult = await clickCandidate(page, selectedCandidate, waitAfterMs);
  const after = await summarizePage(page);

  return {
    ok: clickResult.clicked,
    mode: 'click_search',
    dryRun: false,
    pageBefore: before,
    pageAfter: after,
    criteria,
    effectiveCriteria,
    candidates,
    selectedCandidate,
    click: clickResult,
    waitAfterMs,
    browserAutomationExecuted: clickResult.clicked,
    nextActions: clickResult.clicked
      ? ['inspecionar_contexto', 'ler_resultados_da_consulta', 'registrar_resultado_no_brain']
      : ['reinspecionar_contexto', 'confirmar_se_botao_mudou'],
  };
}
