import type { Page } from 'playwright-core';
import { getActivePage, setActivePage } from '../browser-manager';

interface ReadAutosParams {
  waitMs?: unknown;
  maxMovements?: unknown;
  maxDocumentLines?: unknown;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function summarizePage(page: Page): Promise<{ url: string; title: string }> {
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
  };
}

export async function readPjeAutos(paramsRaw: ReadAutosParams = {}): Promise<any> {
  const params = paramsRaw || {};
  const waitMs = boundedNumber(params.waitMs, 1000, 0, 10000);
  const maxMovements = boundedNumber(params.maxMovements, 8, 1, 30);
  const maxDocumentLines = boundedNumber(params.maxDocumentLines, 12, 0, 40);

  const page = getActivePage();
  if (!page) {
    return {
      ok: false,
      mode: 'read_only_autos',
      error: 'no_active_page',
      message: 'Browser controlado ainda nao possui pagina ativa.',
      browserAutomationExecuted: false,
    };
  }

  const autosPage = page.context().pages().find((candidate) => (
    /\/Processo\/ConsultaProcesso\/Detalhe\/listProcessoCompleto/i.test(candidate.url())
  ));
  const targetPage = autosPage || page;
  const targetIndex = page.context().pages().indexOf(targetPage);
  if (targetIndex >= 0) setActivePage(targetIndex);

  if (waitMs > 0) {
    await targetPage.waitForTimeout(waitMs);
  }

  const pageSummary = await summarizePage(targetPage);
  if (!pageSummary.url.includes('pje.')) {
    return {
      ok: false,
      mode: 'read_only_autos',
      error: 'not_pje_page',
      page: pageSummary,
      browserAutomationExecuted: false,
    };
  }

  const snapshot = await targetPage.evaluate((limits: { maxMovements: number; maxDocumentLines: number }) => {
    const clean = (value: unknown, max = 500): string => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 3)}...` : text;
    };
    const normalize = (value: unknown): string => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const visible = (node: Element): boolean => {
      const el = node as HTMLElement;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.bottom >= 0
        && rect.right >= 0
        && rect.top <= window.innerHeight
        && rect.left <= window.innerWidth;
    };
    const textForControl = (node: Element): string => {
      const el = node as HTMLElement;
      const input = node as HTMLInputElement;
      return clean(el.textContent || input.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.id || el.getAttribute('name'), 220);
    };
    const selectorFor = (node: Element): string => {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const id = clean(el.id, 180);
      if (id) {
        const css = (window as any).CSS;
        const escaped = css && typeof css.escape === 'function' ? css.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        return `#${escaped}`;
      }
      const title = clean(el.getAttribute('title'), 120);
      if (title) return `${tag}[title="${title.replace(/"/g, '\\"')}"]`;
      return tag;
    };

    const bodyText = clean(document.body?.innerText || '', 30000);
    const processNumber = bodyText.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/)?.[0] || null;
    const title = clean(document.title, 200);
    const detalheTitulo = document.getElementById('detalheDocumento:tituloDocumento') as HTMLElement | null;
    const detalheTituloBox = document.getElementById('detalheDocumento:j_id406') as HTMLElement | null;
    const specificDocumentTitle = clean(
      detalheTitulo?.querySelector('h1,h2,h3,h4,a,span')?.textContent
      || detalheTituloBox?.querySelector('h1,h2,h3,h4,a,span')?.textContent
      || '',
      220
    );
    const specificDocumentMeta = clean(
      detalheTituloBox?.innerText?.replace(specificDocumentTitle, '')
      || detalheTitulo?.innerText?.replace(specificDocumentTitle, '')
      || '',
      320
    );
    const specificPageIndicator = clean(document.querySelector('.contador-paginas')?.textContent || '', 80);
    const frameHtml = document.getElementById('frameHtml') as HTMLIFrameElement | null;
    const frameHtmlText = clean(frameHtml?.contentDocument?.body?.innerText || '', 12000);

    const allVisible = Array.from(document.querySelectorAll('body *'))
      .filter((node) => visible(node))
      .map((node, index) => {
        const el = node as HTMLElement;
        const rect = el.getBoundingClientRect();
        return {
          index,
          tag: el.tagName.toLowerCase(),
          id: clean(el.id, 140),
          className: clean(el.className, 180),
          text: clean(el.innerText || el.textContent, 1200),
          title: clean(el.getAttribute('title'), 180),
          ariaLabel: clean(el.getAttribute('aria-label'), 180),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((item) => item.text || item.title || item.ariaLabel);

    const headerCandidates = allVisible
      .filter((item) => item.y < 190 && item.text.length > 4)
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
      .map((item) => item.text);

    const documentHeader = allVisible
      .filter((item) => item.x > 430 && item.y < 280 && /^\d{4,}\s*-\s*/.test(item.text))
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))[0] || null;

    const documentMeta = allVisible
      .filter((item) => item.x > 430 && item.y < 300 && /juntad[oa]|magistrad|servidor|advogad|em \d{2}\/\d{2}\/\d{4}/i.test(item.text))
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))[0] || null;

    const pageIndicator = allVisible
      .filter((item) => item.x > 780 && item.y > 220 && item.y < 330 && /\b\d+\s+de\s+\d+\b/i.test(item.text))
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))[0] || null;

    const movementCards = allVisible
      .filter((item) => item.x < 520 && item.y > 230 && item.width > 150 && item.height > 35)
      .filter((item) => {
        const n = normalize(item.text);
        if (n.length < 12) return false;
        if (n.includes('filtros') || n.includes('pesquisar') || n.includes('menu')) return false;
        return /\b\d{2}\s+[a-z]{3}\s+\d{4}\b/i.test(item.text)
          || /\b\d{1,5}\s*-/.test(item.text)
          || n.includes('publicado')
          || n.includes('decorrido')
          || n.includes('juntad');
      })
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));

    const movements: any[] = [];
    for (const item of movementCards) {
      const previous = movements[movements.length - 1];
      const text = clean(item.text, 400);
      if (previous && previous.text === text) continue;
      if (movements.some((movement) => movement.text === text)) continue;
      movements.push({
        text,
        bbox: { x: item.x, y: item.y, width: item.width, height: item.height },
      });
      if (movements.length >= limits.maxMovements) break;
    }

    const rawDocumentTextLines = (frameHtmlText
      ? frameHtmlText.split(/\n+/).map((line) => clean(line, 320))
      : allVisible
      .filter((item) => item.x > 430 && item.y > 300 && item.text.length > 20)
      .filter((item) => {
        const n = normalize(item.text);
        if (n.includes('moviment') || n.includes('processo') || n.includes('pje')) return false;
        return item.width > 180 && item.height > 8;
      })
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
      .map((item) => clean(item.text, 320)));
    const seenDocumentLines = new Set<string>();
    const documentTextLines: string[] = [];
    for (const text of rawDocumentTextLines) {
      if (!text || seenDocumentLines.has(text)) continue;
      seenDocumentLines.add(text);
      documentTextLines.push(text);
      if (documentTextLines.length >= limits.maxDocumentLines) break;
    }

    const controls = Array.from(document.querySelectorAll('a[href], input, textarea, select, button, [role="button"], [role="link"]'))
      .filter((node) => visible(node))
      .map((node, index) => {
        const el = node as HTMLElement;
        const input = node as HTMLInputElement;
        const rect = el.getBoundingClientRect();
        const label = textForControl(node);
        const haystack = normalize([
          label,
          el.getAttribute('title'),
          el.getAttribute('aria-label'),
          el.id,
          el.getAttribute('name'),
          el.tagName.toLowerCase() === 'a' ? (el as HTMLAnchorElement).href : '',
        ].join(' '));
        const dangerKinds: string[] = [];
        if (/(peticionar|peticao|juntar|protocolar|novo documento|expediente)/.test(haystack)) dangerKinds.push('petition_or_file');
        if (/(assinar|assinador|certificado|token|pjeoffice)/.test(haystack)) dangerKinds.push('signature_or_certificate');
        if (/(download|baixar|imprimir|exportar)/.test(haystack)) dangerKinds.push('download_or_print');
        if (/(lixeira|excluir|remover|cancelar|deletar)/.test(haystack)) dangerKinds.push('destructive');
        return {
          index,
          tag: el.tagName.toLowerCase(),
          type: el.tagName.toLowerCase() === 'input' ? clean(input.type, 40).toLowerCase() : '',
          label,
          title: clean(el.getAttribute('title'), 160),
          id: clean(el.id, 160),
          name: clean(el.getAttribute('name'), 160),
          selector: selectorFor(node),
          dangerKinds,
          bbox: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        };
      });

    return {
      url: window.location.href,
      title,
      processNumber,
      headerTexts: Array.from(new Set(headerCandidates)).slice(0, 8),
      document: {
        title: specificDocumentTitle || documentHeader?.text || null,
        meta: specificDocumentMeta || documentMeta?.text || null,
        pageIndicator: specificPageIndicator || pageIndicator?.text || null,
        textPreview: documentTextLines,
      },
      movements,
      controls: {
        total: controls.length,
        dangerous: controls.filter((control) => control.dangerKinds.length > 0),
      },
    };
  }, { maxMovements, maxDocumentLines });

  const isAutosPage = /\/Processo\/ConsultaProcesso\/Detalhe\/listProcessoCompleto/i.test(pageSummary.url);

  return {
    ok: true,
    mode: 'read_only_autos',
    browserAutomationExecuted: false,
    readOnly: true,
    page: pageSummary,
    isAutosPage,
    waitMs,
    processNumber: snapshot.processNumber,
    headerTexts: snapshot.headerTexts,
    document: snapshot.document,
    movements: snapshot.movements,
    controls: snapshot.controls,
    warnings: [
      !isAutosPage ? 'active_page_does_not_look_like_autos' : null,
      !snapshot.document?.title ? 'current_document_not_detected' : null,
      snapshot.movements.length === 0 ? 'visible_movements_not_detected' : null,
      snapshot.controls.dangerous.length > 0 ? 'dangerous_actions_visible' : null,
    ].filter(Boolean),
    nextActions: ['resumir_movimentacoes_visiveis', 'ler_documento_atual_somente_read_only', 'nao_baixar_documentos_sem_confirmacao'],
  };
}
