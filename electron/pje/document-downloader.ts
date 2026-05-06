import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Page } from 'playwright-core';
import { getActivePage, setActivePage } from '../browser-manager';

interface DownloadCurrentDocumentParams {
  dryRun?: unknown;
  waitAfterMs?: unknown;
  downloadDir?: unknown;
}

type NativeDialogPolicy = 'dismiss' | 'accept';

interface NativeDialogResult {
  type: string;
  message: string;
  defaultValue: string;
  handledAction: NativeDialogPolicy;
  handled: boolean;
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
  if (['false', '0', 'nao', 'não', 'no'].includes(text)) return false;
  if (['true', '1', 'sim', 'yes'].includes(text)) return true;
  return defaultValue;
}

function cleanText(value: unknown, max = 240): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function safeFilename(value: string): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'documento-pje').slice(0, 150);
}

function isLikelyPdfUrl(value: unknown): boolean {
  const url = String(value || '').toLowerCase();
  return url.includes('.pdf') || url.includes('pje-docs') || url.includes('/documento/');
}

function defaultDownloadDir(): string {
  return path.join(os.homedir(), 'Downloads', 'Lex PJe');
}

async function savePdfPageUrl(page: Page, input: {
  inspection: any;
  downloadDir: string;
  fallbackName: string;
}): Promise<any> {
  const url = page.url();
  if (!isLikelyPdfUrl(url)) {
    return {
      ok: false,
      error: 'opened_page_is_not_pdf_url',
      openedPage: {
        url,
        title: await page.title().catch(() => ''),
      },
    };
  }

  fs.mkdirSync(input.downloadDir, { recursive: true });
  const cookies = await page.context().cookies(url).catch(() => []);
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const headers: Record<string, string> = {
    accept: 'application/pdf,*/*',
    referer: input.inspection?.url || '',
  };
  if (cookieHeader) headers['cookie'] = cookieHeader;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    return {
      ok: false,
      error: 'pdf_url_fetch_failed',
      status: response.status,
      statusText: response.statusText,
      openedPage: {
        url,
        title: await page.title().catch(() => ''),
      },
    };
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  const urlName = (() => {
    try {
      return decodeURIComponent(path.basename(new URL(url).pathname));
    } catch {
      return '';
    }
  })();
  const ext = path.extname(urlName || '') || '.pdf';
  const filePath = path.join(input.downloadDir, `${safeFilename(input.fallbackName)}${ext}`);
  fs.writeFileSync(filePath, buffer);
  const stat = fs.statSync(filePath);

  return {
    ok: true,
    method: 'fetch_opened_pdf_url',
    openedPage: {
      url,
      title: await page.title().catch(() => ''),
    },
    contentType,
    filePath,
    bytes: stat.size,
  };
}

function resolveDownloadDir(value: unknown): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : defaultDownloadDir();
  return path.resolve(raw);
}

async function activeAutosPage(page: Page): Promise<Page> {
  const autosPage = page.context().pages().find((candidate) => (
    /\/Processo\/ConsultaProcesso\/Detalhe\/listProcessoCompleto/i.test(candidate.url())
  ));
  const target = autosPage || page;
  const index = page.context().pages().indexOf(target);
  if (index >= 0) setActivePage(index);
  await target.bringToFront().catch(() => undefined);
  return target;
}

async function inspectCurrentDocument(page: Page): Promise<any> {
  return page.evaluate(() => {
    const clean = (value: unknown, max = 240): string => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 3)}...` : text;
    };
    const visible = (node: Element | null): boolean => {
      if (!node) return false;
      const el = node as HTMLElement;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden';
    };
    const titleNode = document.querySelector('#detalheDocumento\\:j_id408, #detalheDocumento\\:tituloDocumento h3, #detalheDocumento\\:tituloDocumento a, #detalheDocumento\\:tituloDocumento span') as HTMLElement | null;
    const metaNode = document.querySelector('#detalheDocumento\\:j_id406') as HTMLElement | null;
    const pageNode = document.querySelector('.contador-paginas') as HTMLElement | null;
    const downloadNode = Array.from(document.querySelectorAll('a, button, [role="button"]'))
      .find((node) => {
        const el = node as HTMLElement;
        const haystack = clean([
          el.textContent,
          el.getAttribute('title'),
          el.getAttribute('aria-label'),
          el.id,
          el.getAttribute('name'),
        ].join(' '), 500).toLowerCase();
        return visible(node) && haystack.includes('download') && haystack.includes('documento');
      }) as HTMLElement | undefined;

    const processNumber = clean(document.title).match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/)?.[0]
      || clean(document.body?.innerText || '').match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/)?.[0]
      || null;
    const title = clean(titleNode?.textContent || '', 220);
    const meta = clean((metaNode?.innerText || '').replace(title, ''), 320);
    const pageIndicator = clean(pageNode?.textContent || '', 80);
    return {
      url: window.location.href,
      pageTitle: clean(document.title, 220),
      processNumber,
      document: {
        title: title || null,
        meta: meta || null,
        pageIndicator: pageIndicator || null,
      },
      downloadAction: downloadNode ? {
        label: clean(downloadNode.textContent || downloadNode.getAttribute('title') || 'Download do documento', 160),
        title: clean(downloadNode.getAttribute('title'), 160),
        id: clean(downloadNode.id, 160),
        selector: downloadNode.id
          ? `#${(window as any).CSS?.escape ? (window as any).CSS.escape(downloadNode.id) : downloadNode.id.replace(/[^a-zA-Z0-9_-]/g, '\\$&')}`
          : 'a[title*="Download do documento"]',
      } : null,
    };
  });
}

function waitForNativeDialog(page: Page, waitAfterMs: number, policy: NativeDialogPolicy): Promise<NativeDialogResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (value: NativeDialogResult | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      page.off('dialog', onDialog);
      resolve(value);
    };

    const onDialog = async (dialog: any) => {
      const result: NativeDialogResult = {
        type: String(dialog.type?.() || ''),
        message: String(dialog.message?.() || ''),
        defaultValue: String(dialog.defaultValue?.() || ''),
        handledAction: policy,
        handled: false,
      };

      try {
        if (policy === 'accept') {
          await dialog.accept();
        } else {
          await dialog.dismiss();
        }
        result.handled = true;
      } catch (err: any) {
        result.error = err?.message || String(err);
      }

      finish(result);
    };

    page.on('dialog', onDialog);
    timer = setTimeout(() => finish(null), Math.min(waitAfterMs, 5000));
  });
}

export async function downloadPjeCurrentDocument(paramsRaw: DownloadCurrentDocumentParams = {}): Promise<any> {
  const params = paramsRaw || {};
  const dryRun = boolParam(params.dryRun, true);
  const waitAfterMs = boundedNumber(params.waitAfterMs, 10000, 1000, 30000);
  const downloadDir = resolveDownloadDir(params.downloadDir);

  const active = getActivePage();
  if (!active) {
    return {
      ok: false,
      mode: 'download_current_document',
      error: 'no_active_page',
      browserAutomationExecuted: false,
    };
  }

  const page = await activeAutosPage(active);
  const inspection = await inspectCurrentDocument(page);
  const isAutosPage = /\/Processo\/ConsultaProcesso\/Detalhe\/listProcessoCompleto/i.test(inspection.url);
  if (!isAutosPage) {
    return {
      ok: false,
      mode: 'download_current_document',
      error: 'active_page_does_not_look_like_autos',
      inspection,
      browserAutomationExecuted: false,
    };
  }
  if (!inspection.downloadAction?.selector || !inspection.document?.title) {
    return {
      ok: false,
      mode: 'download_current_document',
      error: 'current_document_or_download_button_not_found',
      inspection,
      browserAutomationExecuted: false,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      mode: 'download_current_document',
      dryRun: true,
      browserAutomationExecuted: false,
      readOnly: true,
      inspection,
      downloadDir,
      nextActions: ['confirmar_download_documento_atual', 'executar_com_dryRun_false_se_usuario_autorizar'],
    };
  }

  fs.mkdirSync(downloadDir, { recursive: true });
  const selector = inspection.downloadAction.selector;
  const locator = page.locator(selector).first();
  const nativeDialogPromise = waitForNativeDialog(page, waitAfterMs, 'accept');
  const popupPromise = page.waitForEvent('popup', { timeout: waitAfterMs }).catch(() => null);
  const newPagePromise = page.context().waitForEvent('page', { timeout: waitAfterMs }).catch(() => null);
  const downloadPromise = page.waitForEvent('download', { timeout: waitAfterMs }).catch(() => null);
  await locator.click({ timeout: 10000 });
  const [nativeDialog, popupPage, contextPage, download] = await Promise.all([
    nativeDialogPromise,
    popupPromise,
    newPagePromise,
    downloadPromise,
  ]);
  const openedPage = popupPage || contextPage;
  if (openedPage) {
    await openedPage.waitForLoadState('domcontentloaded', { timeout: Math.min(waitAfterMs, 10000) }).catch(() => undefined);
    await openedPage.bringToFront().catch(() => undefined);
    const index = page.context().pages().indexOf(openedPage);
    if (index >= 0) setActivePage(index);
  }
  if (!download) {
    if (openedPage && isLikelyPdfUrl(openedPage.url())) {
      const saved = await savePdfPageUrl(openedPage, {
        inspection,
        downloadDir,
        fallbackName: [
          inspection.processNumber,
          inspection.document.title,
        ].filter(Boolean).join(' - '),
      });

      if (saved.ok) {
        return {
          ok: true,
          mode: 'download_current_document',
          dryRun: false,
          browserAutomationExecuted: true,
          inspection,
          nativeDialog,
          newPageOpened: true,
          openedPage: saved.openedPage,
          savedFromOpenedPdf: true,
          filePath: saved.filePath,
          bytes: saved.bytes,
          contentType: saved.contentType,
          nextActions: ['analisar_documento_baixado_se_usuario_pedir', 'nao_baixar_outros_documentos_sem_confirmacao'],
        };
      }

      return {
        ok: false,
        mode: 'download_current_document',
        dryRun: false,
        error: saved.error || 'opened_pdf_save_failed',
        message: 'O PJe abriu o PDF em nova aba, mas a Lex nao conseguiu salvar a URL do PDF automaticamente.',
        inspection,
        nativeDialog,
        newPageOpened: true,
        openedPage: saved.openedPage,
        saveAttempt: saved,
        browserAutomationExecuted: true,
      };
    }

    return {
      ok: false,
      mode: 'download_current_document',
      dryRun: false,
      error: 'download_event_not_detected',
      message: 'A Lex clicou no download do documento atual, mas o Chrome nao emitiu evento de download no prazo.',
      inspection,
      nativeDialog,
      newPageOpened: !!openedPage,
      openedPage: openedPage ? {
        url: openedPage.url(),
        title: await openedPage.title().catch(() => ''),
      } : null,
      browserAutomationExecuted: true,
    };
  }

  const suggested = download.suggestedFilename();
  const ext = path.extname(suggested || '') || '.pdf';
  const base = safeFilename([
    inspection.processNumber,
    inspection.document.title,
  ].filter(Boolean).join(' - '));
  const filePath = path.join(downloadDir, `${base}${ext}`);
  await download.saveAs(filePath);
  const failure = await download.failure().catch(() => null);
  if (failure) {
    return {
      ok: false,
      mode: 'download_current_document',
      dryRun: false,
      error: 'download_failed',
      message: cleanText(failure, 300),
      inspection,
      nativeDialog,
      suggestedFilename: suggested,
      browserAutomationExecuted: true,
    };
  }

  const stat = fs.statSync(filePath);
  return {
    ok: true,
    mode: 'download_current_document',
    dryRun: false,
    browserAutomationExecuted: true,
    inspection,
    nativeDialog,
    newPageOpened: !!openedPage,
    openedPage: openedPage ? {
      url: openedPage.url(),
      title: await openedPage.title().catch(() => ''),
    } : null,
    suggestedFilename: suggested,
    filePath,
    bytes: stat.size,
    nextActions: ['analisar_documento_baixado_se_usuario_pedir', 'nao_baixar_outros_documentos_sem_confirmacao'],
  };
}
