import type { Frame, Page } from 'playwright-core';
import { getActivePage, getActivePageIndex, getBrowserContext } from '../browser-manager';

type RawInspectInput = Record<string, unknown>;

interface RawElementSnapshot {
  localIndex: number;
  tag: string;
  type: string;
  id: string;
  name: string;
  role: string;
  text: string;
  label: string;
  placeholder: string;
  ariaLabel: string;
  title: string;
  href: string;
  selectorHints: string[];
  valuePresent: boolean;
  disabled: boolean;
  bbox: { x: number; y: number; width: number; height: number } | null;
  inViewport: boolean;
}

interface FrameSnapshot {
  frameId: string;
  frameIndex: number;
  parentFrameIndex: number | null;
  name: string;
  url: string;
  depth: number;
  accessible: boolean;
  title: string;
  readyState: string;
  iframeCount: number;
  textSnippets: string[];
  elements: InspectElement[];
  error?: string;
}

interface InspectElement extends RawElementSnapshot {
  ref: string;
  pageId: string;
  pageIndex: number;
  frameId: string;
  frameIndex: number;
  kind: 'field' | 'button' | 'link' | 'select' | 'other';
  candidateKinds: string[];
}

interface CandidateSummary {
  ref: string;
  pageId: string;
  frameId: string;
  kind: InspectElement['kind'];
  candidateKinds: string[];
  tag: string;
  type: string;
  label: string;
  id: string;
  name: string;
  placeholder: string;
  selectorHints: string[];
}

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'input',
  'textarea',
  'select',
  'button',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="searchbox"]',
  '[contenteditable="true"]',
].join(',');

function asRecord(value: unknown): RawInspectInput {
  return value && typeof value === 'object' ? value as RawInspectInput : {};
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
    .toLowerCase();
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function classifyKind(el: RawElementSnapshot): InspectElement['kind'] {
  const tag = el.tag.toLowerCase();
  const role = el.role.toLowerCase();
  const type = el.type.toLowerCase();

  if (tag === 'select') return 'select';
  if (tag === 'textarea' || tag === 'input' || role === 'searchbox') {
    if (['button', 'submit', 'reset'].includes(type)) return 'button';
    return 'field';
  }
  if (tag === 'button' || role === 'button') return 'button';
  if (tag === 'a' || role === 'link') return 'link';
  return 'other';
}

function classifyCandidate(el: RawElementSnapshot, kind: InspectElement['kind']): string[] {
  const haystack = normalizeText([
    el.id,
    el.name,
    el.role,
    el.text,
    el.label,
    el.placeholder,
    el.ariaLabel,
    el.title,
    el.href,
  ].join(' '));

  const candidates: string[] = [];
  if (
    (kind === 'field' || kind === 'select') &&
    includesAny(haystack, [
      'processo',
      'numero do processo',
      'numero processo',
      'numeroprocesso',
      'numprocesso',
      'nrprocesso',
      'cnj',
    ])
  ) {
    candidates.push('process_number_field');
  }

  if (
    (kind === 'button' || kind === 'link') &&
    includesAny(haystack, ['consultar', 'pesquisar', 'buscar', 'localizar', 'procurar'])
  ) {
    candidates.push('search_or_consult_action');
  }

  if (includesAny(haystack, ['certificado', 'assinador', 'token', 'smartcard', 'pki'])) {
    candidates.push('certificate_or_signer');
  }

  if (
    (kind === 'button' || kind === 'link') &&
    includesAny(haystack, ['entrar', 'login', 'logar', 'acessar', 'gov.br', 'jus.br'])
  ) {
    candidates.push('login_action');
  }

  return candidates;
}

function toCandidateSummary(el: InspectElement): CandidateSummary {
  return {
    ref: el.ref,
    pageId: el.pageId,
    frameId: el.frameId,
    kind: el.kind,
    candidateKinds: el.candidateKinds,
    tag: el.tag,
    type: el.type,
    label: el.label,
    id: el.id,
    name: el.name,
    placeholder: el.placeholder,
    selectorHints: el.selectorHints,
  };
}

async function inspectFrame(input: {
  pageId: string;
  pageIndex: number;
  frame: Frame;
  frameIndex: number;
  parentFrameIndex: number | null;
  depth: number;
  maxElements: number;
  maxTextSnippets: number;
}): Promise<FrameSnapshot> {
  const frameId = `${input.pageId}:f${input.frameIndex}`;

  try {
    const raw = await input.frame.evaluate(
      (limits: { selector: string; maxElements: number; maxTextSnippets: number }) => {
        const cssEscape = (value: string): string => {
          const css = (window as any).CSS;
          if (css && typeof css.escape === 'function') return css.escape(value);
          return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        };

        const clean = (value: unknown, max = 160): string => {
          const text = String(value || '').replace(/\s+/g, ' ').trim();
          return text.length > max ? `${text.slice(0, max - 3)}...` : text;
        };

        const labelFor = (id: string): string => {
          if (!id) return '';
          const labels = document.querySelectorAll('label');
          for (let i = 0; i < labels.length; i += 1) {
            const label = labels.item(i);
            if (label && label.getAttribute('for') === id) {
              return clean(label.textContent || '');
            }
          }
          return '';
        };

        const rawTextSnippets = clean(document.body?.innerText || '', 5000).split(/\n| {3,}/);
        const textSnippets: string[] = [];
        for (let i = 0; i < rawTextSnippets.length && textSnippets.length < limits.maxTextSnippets; i += 1) {
          const line = clean(rawTextSnippets[i], 220);
          if (line) textSnippets.push(line);
        }

        const elements: RawElementSnapshot[] = [];
        const nodes = document.querySelectorAll(limits.selector);

        for (let localIndex = 0; localIndex < nodes.length; localIndex += 1) {
          if (elements.length >= limits.maxElements) break;

          const node = nodes.item(localIndex);
          if (!node) continue;

          const el = node as HTMLElement;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const visible = rect.width > 0 && rect.height > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden';
          if (!visible) continue;

          const inputLike = el as HTMLInputElement;
          const tag = el.tagName.toLowerCase();
          const type = clean(inputLike.type || '', 40);
          const id = clean(el.id || '', 140);
          const name = clean(inputLike.name || el.getAttribute('name') || '', 140);
          const role = clean(el.getAttribute('role') || '', 80);
          const placeholder = clean(inputLike.placeholder || el.getAttribute('placeholder') || '', 160);
          const ariaLabel = clean(el.getAttribute('aria-label') || '', 160);
          const title = clean(el.getAttribute('title') || '', 160);
          const href = tag === 'a' ? clean((el as HTMLAnchorElement).href || '', 240) : '';
          const ownText = clean(el.textContent || '', 180);
          const closestLabel = clean(el.closest('label')?.textContent || '', 180);
          const label = ownText
            || placeholder
            || ariaLabel
            || labelFor(id)
            || closestLabel
            || name
            || id
            || title
            || '(sem label)';

          const selectorHints: string[] = [];
          if (id) selectorHints.push(`#${cssEscape(id)}`);
          if (name) selectorHints.push(`${tag}[name="${name.replace(/"/g, '\\"')}"]`);
          if (placeholder) selectorHints.push(`${tag}[placeholder="${placeholder.replace(/"/g, '\\"')}"]`);
          if (ariaLabel) selectorHints.push(`${tag}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`);

          const disabled = Boolean(
            inputLike.disabled ||
            el.getAttribute('aria-disabled') === 'true' ||
            el.getAttribute('disabled') !== null
          );

          elements.push({
            localIndex,
            tag,
            type,
            id,
            name,
            role,
            text: ownText,
            label,
            placeholder,
            ariaLabel,
            title,
            href,
            selectorHints,
            valuePresent: Boolean(inputLike.value && inputLike.type !== 'password'),
            disabled,
            bbox: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            inViewport: rect.bottom >= 0
              && rect.right >= 0
              && rect.top <= window.innerHeight
              && rect.left <= window.innerWidth,
          });
        }

        return {
          title: clean(document.title || '', 200),
          readyState: document.readyState,
          iframeCount: document.querySelectorAll('iframe, frame').length,
          textSnippets,
          elements,
        };
      },
      {
        selector: INTERACTIVE_SELECTOR,
        maxElements: input.maxElements,
        maxTextSnippets: input.maxTextSnippets,
      }
    ) as {
      title: string;
      readyState: string;
      iframeCount: number;
      textSnippets: string[];
      elements: RawElementSnapshot[];
    };

    const elements = raw.elements.map((el, elementIndex) => {
      const kind = classifyKind(el);
      const ref = `${frameId}:e${elementIndex}`;
      return {
        ...el,
        ref,
        pageId: input.pageId,
        pageIndex: input.pageIndex,
        frameId,
        frameIndex: input.frameIndex,
        kind,
        candidateKinds: classifyCandidate(el, kind),
      };
    });

    return {
      frameId,
      frameIndex: input.frameIndex,
      parentFrameIndex: input.parentFrameIndex,
      name: input.frame.name(),
      url: input.frame.url(),
      depth: input.depth,
      accessible: true,
      title: raw.title,
      readyState: raw.readyState,
      iframeCount: raw.iframeCount,
      textSnippets: raw.textSnippets,
      elements,
    };
  } catch (err: any) {
    return {
      frameId,
      frameIndex: input.frameIndex,
      parentFrameIndex: input.parentFrameIndex,
      name: input.frame.name(),
      url: input.frame.url(),
      depth: input.depth,
      accessible: false,
      title: '',
      readyState: 'unknown',
      iframeCount: 0,
      textSnippets: [],
      elements: [],
      error: err?.message || String(err),
    };
  }
}

function frameDepth(frame: Frame): number {
  let depth = 0;
  let current = frame.parentFrame();
  while (current) {
    depth += 1;
    current = current.parentFrame();
  }
  return depth;
}

async function inspectPage(input: {
  page: Page;
  pageIndex: number;
  active: boolean;
  maxElementsPerFrame: number;
  maxTextSnippetsPerFrame: number;
  includeScreenshot: boolean;
  fullPageScreenshot: boolean;
}): Promise<any> {
  const pageId = `page-${input.pageIndex}`;
  const frames = input.page.frames();
  const frameIndexByFrame = new Map<Frame, number>();
  frames.forEach((frame, index) => frameIndexByFrame.set(frame, index));

  const [title, opener] = await Promise.all([
    input.page.title().catch(() => ''),
    input.page.opener().catch(() => null),
  ]);

  const inspectedFrames: FrameSnapshot[] = [];
  for (const [frameIndex, frame] of frames.entries()) {
    const parent = frame.parentFrame();
    const parentFrameIndex = parent ? frameIndexByFrame.get(parent) ?? null : null;
    inspectedFrames.push(await inspectFrame({
      pageId,
      pageIndex: input.pageIndex,
      frame,
      frameIndex,
      parentFrameIndex,
      depth: frameDepth(frame),
      maxElements: input.maxElementsPerFrame,
      maxTextSnippets: input.maxTextSnippetsPerFrame,
    }));
  }

  let screenshot: any = null;
  if (input.includeScreenshot && input.active) {
    try {
      const buffer = await input.page.screenshot({
        type: 'jpeg',
        quality: 60,
        fullPage: input.fullPageScreenshot,
      });
      screenshot = {
        format: 'image/jpeg',
        sizeKB: Math.round(buffer.length / 1024),
        base64: buffer.toString('base64'),
      };
    } catch (err: any) {
      screenshot = {
        error: err?.message || String(err),
      };
    }
  }

  const allElements = inspectedFrames.flatMap((frame) => frame.elements);

  return {
    pageId,
    pageIndex: input.pageIndex,
    active: input.active,
    hasOpener: !!opener,
    url: input.page.url(),
    title,
    isPje: input.page.url().includes('pje.'),
    tribunal: detectTribunalFromUrl(input.page.url()),
    frameCount: frames.length,
    interactiveElementCount: allElements.length,
    frames: inspectedFrames,
    screenshot,
  };
}

function detectTribunalFromUrl(url: string): string | null {
  const match = url.match(/pje\.([a-z0-9]+)\.jus\.br/i);
  return match?.[1] ? match[1].toUpperCase() : null;
}

export async function inspectPjeContext(params: unknown = {}): Promise<any> {
  const input = asRecord(params);
  const activePage = getActivePage();
  if (!activePage) {
    return {
      ok: false,
      error: 'no_active_page',
      mode: 'read_only_inspection',
      message: 'Browser controlado ainda nao esta aberto ou nao possui aba ativa.',
    };
  }

  const waitMs = boundedNumber(input['waitMs'], 0, 0, 5000);
  if (waitMs > 0) {
    await activePage.waitForTimeout(waitMs).catch(() => undefined);
  }

  let context;
  try {
    context = getBrowserContext();
  } catch (err: any) {
    return {
      ok: false,
      error: 'browser_context_unavailable',
      mode: 'read_only_inspection',
      message: err?.message || String(err),
    };
  }

  const allPages = context.pages();
  const activeIndex = getActivePageIndex();
  const maxPages = boundedNumber(input['maxPages'], 8, 1, 20);
  const maxElementsPerFrame = boundedNumber(input['maxElementsPerFrame'], 60, 1, 150);
  const maxTextSnippetsPerFrame = boundedNumber(input['maxTextSnippetsPerFrame'], 16, 0, 60);
  const includeScreenshot = input['includeScreenshot'] === true;
  const fullPageScreenshot = input['fullPageScreenshot'] === true;

  const selectedPageIndexes = new Set<number>();
  for (let index = 0; index < allPages.length && selectedPageIndexes.size < maxPages; index += 1) {
    selectedPageIndexes.add(index);
  }
  const actualActiveIndex = allPages.indexOf(activePage);
  if (actualActiveIndex >= 0) {
    selectedPageIndexes.add(actualActiveIndex);
  }

  const pages = [];
  for (const pageIndex of Array.from(selectedPageIndexes).sort((a, b) => a - b)) {
    const page = allPages[pageIndex];
    if (!page || page.isClosed()) continue;
    pages.push(await inspectPage({
      page,
      pageIndex,
      active: page === activePage || pageIndex === activeIndex,
      maxElementsPerFrame,
      maxTextSnippetsPerFrame,
      includeScreenshot,
      fullPageScreenshot,
    }));
  }

  const allElements = pages.flatMap((page) =>
    page.frames.flatMap((frame: FrameSnapshot) => frame.elements)
  ) as InspectElement[];

  const processNumberFields = allElements
    .filter((el) => el.candidateKinds.includes('process_number_field'))
    .slice(0, 20)
    .map(toCandidateSummary);
  const searchActions = allElements
    .filter((el) => el.candidateKinds.includes('search_or_consult_action'))
    .slice(0, 20)
    .map(toCandidateSummary);
  const certificateOrSigner = allElements
    .filter((el) => el.candidateKinds.includes('certificate_or_signer'))
    .slice(0, 20)
    .map(toCandidateSummary);
  const loginActions = allElements
    .filter((el) => el.candidateKinds.includes('login_action'))
    .slice(0, 20)
    .map(toCandidateSummary);

  return {
    ok: true,
    mode: 'read_only_inspection',
    browserAutomationExecuted: false,
    pageCount: allPages.length,
    inspectedPageCount: pages.length,
    activePageIndex: activeIndex,
    inspectedAt: new Date().toISOString(),
    pages,
    candidates: {
      processNumberFields,
      searchActions,
      certificateOrSigner,
      loginActions,
    },
    nextActions: [
      processNumberFields.length > 0
        ? 'campo_numero_processo_identificado'
        : 'campo_numero_processo_nao_identificado',
      searchActions.length > 0
        ? 'acao_consulta_identificada'
        : 'acao_consulta_nao_identificada',
      'usar_refs_retornadas_apenas_apos_confirmacao_ou_em_ferramenta_especifica',
    ],
  };
}
