import fs from 'fs';
import os from 'os';
import path from 'path';

interface AnalyzeDownloadedDocumentParams {
  filePath?: unknown;
  downloadDir?: unknown;
  maxChars?: unknown;
  includeFullText?: unknown;
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

function cleanText(value: unknown, max = 1000): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalize(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function defaultDownloadDir(): string {
  return path.join(os.homedir(), 'Downloads', 'Lex PJe');
}

function resolveDownloadDir(value: unknown): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : defaultDownloadDir();
  return path.resolve(raw);
}

function findLatestPdf(downloadDir: string): string | null {
  if (!fs.existsSync(downloadDir)) return null;
  const candidates = fs.readdirSync(downloadDir)
    .filter((name) => name.toLowerCase().endsWith('.pdf'))
    .map((name) => {
      const filePath = path.join(downloadDir, name);
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs, size: stat.size };
    })
    .filter((item) => item.size > 0)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.filePath || null;
}

function resolveTargetFile(params: AnalyzeDownloadedDocumentParams): { filePath: string | null; downloadDir: string } {
  const downloadDir = resolveDownloadDir(params.downloadDir);
  const explicit = typeof params.filePath === 'string' && params.filePath.trim()
    ? path.resolve(params.filePath.trim())
    : '';
  return {
    filePath: explicit || findLatestPdf(downloadDir),
    downloadDir,
  };
}

function inferDocumentType(fileName: string, text: string): string {
  const haystack = normalize(`${fileName} ${text.slice(0, 8000)}`);
  if (haystack.includes('sentenca')) return 'sentenca';
  if (haystack.includes('acordao') || haystack.includes('acórdão')) return 'acordao';
  if (haystack.includes('decisao') || haystack.includes('decisão')) return 'decisao';
  if (haystack.includes('despacho')) return 'despacho';
  if (haystack.includes('mandado')) return 'mandado';
  if (haystack.includes('peticao') || haystack.includes('petição')) return 'peticao';
  if (haystack.includes('certidao') || haystack.includes('certidão')) return 'certidao';
  return 'documento_pdf';
}

function extractMatches(text: string, regex: RegExp, limit = 8): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(regex)) {
    const value = cleanText(match[0], 240);
    if (value && !found.includes(value)) found.push(value);
    if (found.length >= limit) break;
  }
  return found;
}

function extractSectionAround(text: string, markers: string[], maxChars: number): string {
  const normalizedText = normalize(text);
  let bestIndex = -1;
  for (const marker of markers) {
    const index = normalizedText.indexOf(normalize(marker));
    if (index >= 0 && (bestIndex < 0 || index < bestIndex)) bestIndex = index;
  }
  if (bestIndex < 0) return '';
  const start = Math.max(0, bestIndex - 700);
  return text.slice(start, start + maxChars).replace(/\s+/g, ' ').trim();
}

function splitPreview(text: string, maxChars: number): { inicio: string; trechoDecisorio: string; fim: string } {
  return {
    inicio: cleanText(text.slice(0, Math.min(maxChars, 5000)), Math.min(maxChars, 5000)),
    trechoDecisorio: cleanText(extractSectionAround(text, [
      'decido',
      'dispositivo',
      'julgo',
      'ante o exposto',
      'isto posto',
    ], Math.min(maxChars, 7000)), Math.min(maxChars, 7000)),
    fim: cleanText(text.slice(Math.max(0, text.length - Math.min(maxChars, 5000))), Math.min(maxChars, 5000)),
  };
}

function buildLocalLegalSignals(fileName: string, text: string): any {
  const type = inferDocumentType(fileName, text);
  const processNumbers = extractMatches(text, /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g, 5);
  const moneyValues = extractMatches(text, /R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g, 12);
  const dates = extractMatches(text, /\b\d{2}\/\d{2}\/\d{4}\b/g, 12);
  const norm = normalize(text);
  const likelyOutcome = (() => {
    if (norm.includes('julgo procedente em parte') || norm.includes('julgo parcialmente procedente')) return 'procedencia_parcial';
    if (norm.includes('julgo procedente')) return 'procedencia';
    if (norm.includes('julgo improcedente')) return 'improcedencia';
    if (norm.includes('homologo')) return 'homologacao';
    if (norm.includes('extingo o processo')) return 'extincao';
    return 'nao_identificado';
  })();
  const legalThemes = [
    ['fazenda_publica', ['fazenda publica', 'municipio', 'estado do para', 'ente publico']],
    ['servidor_publico', ['servidora publica', 'servidor publico', 'progressao funcional']],
    ['juizado_especial', ['juizado especial', 'lei 9.099', 'lei 12.153']],
    ['revelia', ['revelia', 'nao apresentou contestacao', 'não apresentou contestação']],
    ['honorarios', ['honorarios', 'honorários']],
    ['recurso', ['recurso inominado', 'apelacao', 'apelação', 'prazo recursal']],
  ]
    .filter(([, markers]) => (markers as string[]).some((marker) => norm.includes(normalize(marker))))
    .map(([name]) => name);

  return {
    tipoProvavel: type,
    resultadoProvavel: likelyOutcome,
    numerosProcesso: processNumbers,
    datasEncontradas: dates,
    valoresEncontrados: moneyValues,
    temasProvaveis: legalThemes,
  };
}

export async function analyzePjeDownloadedDocument(paramsRaw: AnalyzeDownloadedDocumentParams = {}): Promise<any> {
  const params = paramsRaw || {};
  const maxChars = boundedNumber(params.maxChars, 12000, 1000, 60000);
  const includeFullText = boolParam(params.includeFullText, false);
  const { filePath, downloadDir } = resolveTargetFile(params);

  if (!filePath) {
    return {
      ok: false,
      mode: 'analyze_downloaded_document',
      error: 'pdf_not_found',
      message: `Nao encontrei PDF para analisar em ${downloadDir}. Informe filePath ou baixe um documento primeiro.`,
      downloadDir,
    };
  }
  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      mode: 'analyze_downloaded_document',
      error: 'file_not_found',
      filePath,
      downloadDir,
    };
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.pdf') {
    return {
      ok: false,
      mode: 'analyze_downloaded_document',
      error: 'unsupported_file_type',
      message: 'Nesta primeira versao a Lex analisa apenas PDF baixado do PJe.',
      filePath,
      extension: ext,
    };
  }

  try {
    // pdf-parse usa export = (CJS), require e o caminho mais estavel no Electron CJS.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string; numpages: number; info?: any; metadata?: any }>;
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    const text = String(parsed.text || '').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const preview = splitPreview(text, maxChars);
    const signals = buildLocalLegalSignals(path.basename(filePath), text);

    return {
      ok: true,
      mode: 'analyze_downloaded_document',
      readOnly: true,
      browserAutomationExecuted: false,
      file: {
        filePath,
        fileName: path.basename(filePath),
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      },
      pdf: {
        pages: parsed.numpages || null,
        textChars: text.length,
        parser: 'pdf-parse',
      },
      sinaisLocais: signals,
      textoParaAnalise: preview,
      textoCompleto: includeFullText ? text : undefined,
      nextActions: [
        'resumir_documento',
        'identificar_fundamentos_e_dispositivo',
        'extrair_prazos_e_riscos',
        'comparar_com_estrategia_do_caso_se_houver_contexto',
      ],
    };
  } catch (error: any) {
    return {
      ok: false,
      mode: 'analyze_downloaded_document',
      error: 'pdf_parse_failed',
      message: cleanText(error?.message || String(error), 500),
      filePath,
      bytes: stat.size,
    };
  }
}
