import type { Frame, Page } from 'playwright-core';
import { getActivePage } from '../browser-manager';
import { checkTribunalMismatch, parseCnjInput, type ParsedCnjParts } from './cnj';

interface FillProcessNumberParams {
  numero?: unknown;
  tribunal?: unknown;
  dryRun?: unknown;
  allowTribunalMismatch?: unknown;
}

interface FieldSpec {
  key: keyof ParsedCnjParts;
  label: string;
  id: string;
}

interface FieldPlan {
  key: keyof ParsedCnjParts;
  label: string;
  id: string;
  selector: string;
  value: string;
}

interface FieldFillResult extends FieldPlan {
  found: boolean;
  filled: boolean;
  frameUrl?: string;
  before?: string;
  after?: string;
  error?: string;
}

const PROCESS_NUMBER_FIELDS: FieldSpec[] = [
  { key: 'sequencial', label: 'sequencial', id: 'fPP:numeroProcesso:numeroSequencial' },
  { key: 'digito', label: 'digito verificador', id: 'fPP:numeroProcesso:numeroDigitoVerificador' },
  { key: 'ano', label: 'ano', id: 'fPP:numeroProcesso:ano' },
  { key: 'ramo', label: 'ramo da justica', id: 'fPP:numeroProcesso:ramoJustica' },
  { key: 'tribunal', label: 'tribunal', id: 'fPP:numeroProcesso:respectivoTribunal' },
  { key: 'orgao', label: 'orgao de justica', id: 'fPP:numeroProcesso:numeroOrgaoJustica' },
];

function boolParam(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['false', '0', 'nao', 'não', 'no'].includes(text)) return false;
  if (['true', '1', 'sim', 'yes'].includes(text)) return true;
  return defaultValue;
}

function selectorForId(id: string): string {
  return `input[id="${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

function buildFieldPlan(parts: ParsedCnjParts): FieldPlan[] {
  return PROCESS_NUMBER_FIELDS.map((field) => ({
    ...field,
    selector: selectorForId(field.id),
    value: parts[field.key],
  }));
}

function framesFor(page: Page): Frame[] {
  const main = page.mainFrame();
  const frames = page.frames();
  return [main, ...frames.filter((frame) => frame !== main)];
}

async function findField(page: Page, selector: string): Promise<{
  frame: Frame;
  before: string;
} | null> {
  for (const frame of framesFor(page)) {
    try {
      const locator = frame.locator(selector).first();
      const count = await locator.count();
      if (count < 1) continue;
      await locator.waitFor({ state: 'visible', timeout: 1000 }).catch(() => undefined);
      const before = await locator.inputValue({ timeout: 1000 }).catch(() => '');
      return { frame, before };
    } catch {
      // Try next frame.
    }
  }
  return null;
}

async function fillField(page: Page, plan: FieldPlan, dryRun: boolean): Promise<FieldFillResult> {
  const match = await findField(page, plan.selector);
  if (!match) {
    return {
      ...plan,
      found: false,
      filled: false,
      error: 'field_not_found',
    };
  }

  if (dryRun) {
    return {
      ...plan,
      found: true,
      filled: false,
      frameUrl: match.frame.url(),
      before: match.before,
    };
  }

  try {
    const locator = match.frame.locator(plan.selector).first();
    await locator.fill(plan.value, { timeout: 3000 });
    const after = await locator.inputValue({ timeout: 1000 }).catch(() => '');
    return {
      ...plan,
      found: true,
      filled: after === plan.value,
      frameUrl: match.frame.url(),
      before: match.before,
      after,
      error: after === plan.value ? undefined : 'value_after_fill_mismatch',
    };
  } catch (err: any) {
    return {
      ...plan,
      found: true,
      filled: false,
      frameUrl: match.frame.url(),
      before: match.before,
      error: err?.message || String(err),
    };
  }
}

export async function fillPjeProcessNumber(paramsRaw: FillProcessNumberParams = {}): Promise<any> {
  const params = paramsRaw || {};
  const parsed = parseCnjInput(params.numero);
  if (!parsed.ok) {
    return {
      ok: false,
      mode: 'fill_process_number',
      error: parsed.error,
      message: parsed.message,
      validation: parsed,
      browserAutomationExecuted: false,
    };
  }

  const tribunalCheck = checkTribunalMismatch(parsed.cnj, params.tribunal);
  const allowTribunalMismatch = boolParam(params.allowTribunalMismatch, false);
  if (tribunalCheck.mismatch && !allowTribunalMismatch) {
    return {
      ok: false,
      mode: 'fill_process_number',
      error: 'tribunal_mismatch',
      message: `O numero parece ser do ${tribunalCheck.inferred}, mas foi solicitado ${tribunalCheck.requested}. Confirme antes de preencher o PJe.`,
      validation: {
        cnj: parsed.cnj,
        tribunal: tribunalCheck,
      },
      browserAutomationExecuted: false,
    };
  }

  const dryRun = boolParam(params.dryRun, true);
  const page = getActivePage();
  if (!page) {
    return {
      ok: false,
      mode: dryRun ? 'dry_run_fill_process_number' : 'fill_process_number',
      error: 'no_active_page',
      message: 'Browser controlado ainda nao possui pagina ativa.',
      validation: {
        cnj: parsed.cnj,
        tribunal: tribunalCheck,
      },
      browserAutomationExecuted: false,
    };
  }

  const pageInfo = {
    url: page.url(),
    title: await page.title().catch(() => ''),
    isPje: page.url().includes('pje.'),
  };
  const plan = buildFieldPlan(parsed.cnj.parts);
  const fields: FieldFillResult[] = [];

  for (const fieldPlan of plan) {
    fields.push(await fillField(page, fieldPlan, dryRun));
  }

  const missing = fields.filter((field) => !field.found);
  const failed = fields.filter((field) => field.found && !field.filled && !dryRun);

  return {
    ok: missing.length === 0 && failed.length === 0,
    mode: dryRun ? 'dry_run_fill_process_number' : 'fill_process_number',
    dryRun,
    numero: parsed.cnj.formatted,
    validation: {
      cnj: parsed.cnj,
      tribunal: tribunalCheck,
      warnings: parsed.warnings,
    },
    page: pageInfo,
    fields,
    missingFields: missing.map((field) => field.key),
    failedFields: failed.map((field) => field.key),
    browserAutomationExecuted: !dryRun,
    nextActions: dryRun
      ? ['confirmar_preenchimento', 'executar_pje_preencher_numero_com_dryRun_false', 'reinspecionar_contexto']
      : ['reinspecionar_contexto', 'conferir_campos_antes_de_clicar_consultar'],
  };
}
