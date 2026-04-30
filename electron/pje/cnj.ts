import { inferTribunalFromCNJ } from '../datajud/datajud-client';
import { normalizeTribunalCode } from './tribunal-urls';

export interface ParsedCnjParts {
  sequencial: string;
  digito: string;
  ano: string;
  ramo: string;
  tribunal: string;
  orgao: string;
}

export interface ParsedCnj {
  raw: string;
  digits: string;
  formatted: string;
  parts: ParsedCnjParts;
  inferredTribunal: string | null;
  checkDigit: {
    expected: string;
    actual: string;
    valid: boolean;
  };
}

export type CnjParseResult =
  | { ok: true; cnj: ParsedCnj; warnings: string[] }
  | {
      ok: false;
      error: 'empty_cnj' | 'cnj_incomplete' | 'cnj_too_many_digits' | 'cnj_ambiguous' | 'cnj_invalid_check_digit';
      message: string;
      raw: string;
      digitCount: number;
      candidates?: string[];
    };

function digitsOnly(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function formatCnj(digits: string): string {
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

function splitCnj(digits: string): ParsedCnjParts {
  return {
    sequencial: digits.slice(0, 7),
    digito: digits.slice(7, 9),
    ano: digits.slice(9, 13),
    ramo: digits.slice(13, 14),
    tribunal: digits.slice(14, 16),
    orgao: digits.slice(16, 20),
  };
}

function expectedCheckDigits(parts: ParsedCnjParts): string {
  const base = `${parts.sequencial}${parts.ano}${parts.ramo}${parts.tribunal}${parts.orgao}00`;
  const mod = Number(BigInt(base) % 97n);
  return String(98 - mod).padStart(2, '0');
}

function extractCandidateDigits(raw: string): string[] {
  const candidates = new Set<string>();
  const relaxedCnjPattern = /\d{7}\D?\d{2}\D?\d{4}\D?\d\D?\d{2}\D?\d{4}/g;
  for (const match of raw.matchAll(relaxedCnjPattern)) {
    const candidate = digitsOnly(match[0]);
    if (candidate.length === 20) candidates.add(candidate);
  }
  return Array.from(candidates);
}

export function parseCnjInput(value: unknown): CnjParseResult {
  const raw = String(value || '').trim();
  const allDigits = digitsOnly(raw);

  if (!raw) {
    return {
      ok: false,
      error: 'empty_cnj',
      message: 'Informe o numero do processo.',
      raw,
      digitCount: 0,
    };
  }

  let digits = '';
  const candidates = extractCandidateDigits(raw);

  if (allDigits.length === 20) {
    digits = allDigits;
  } else if (candidates.length === 1) {
    digits = candidates[0] || '';
  } else if (candidates.length > 1) {
    return {
      ok: false,
      error: 'cnj_ambiguous',
      message: 'Encontrei mais de um numero CNJ no texto. Informe apenas um processo por vez.',
      raw,
      digitCount: allDigits.length,
      candidates: candidates.map(formatCnj),
    };
  } else if (allDigits.length < 20) {
    return {
      ok: false,
      error: 'cnj_incomplete',
      message: `Numero CNJ incompleto: encontrei ${allDigits.length} digitos, mas o padrao exige 20. Confirme o numero antes de preencher o PJe.`,
      raw,
      digitCount: allDigits.length,
    };
  } else {
    return {
      ok: false,
      error: 'cnj_too_many_digits',
      message: `Numero CNJ nao identificado com seguranca: encontrei ${allDigits.length} digitos no texto. Envie o processo no formato NNNNNNN-DD.AAAA.J.TR.OOOO.`,
      raw,
      digitCount: allDigits.length,
    };
  }

  const parts = splitCnj(digits);
  const formatted = formatCnj(digits);
  const expected = expectedCheckDigits(parts);
  const actual = parts.digito;

  if (expected !== actual) {
    return {
      ok: false,
      error: 'cnj_invalid_check_digit',
      message: `Digito verificador invalido para ${formatted}: esperado ${expected}, recebido ${actual}. Confirme o numero antes de preencher o PJe.`,
      raw,
      digitCount: digits.length,
      candidates: [formatted],
    };
  }

  return {
    ok: true,
    warnings: [],
    cnj: {
      raw,
      digits,
      formatted,
      parts,
      inferredTribunal: inferTribunalFromCNJ(formatted),
      checkDigit: {
        expected,
        actual,
        valid: true,
      },
    },
  };
}

export function checkTribunalMismatch(cnj: ParsedCnj, tribunal: unknown): {
  requested: string | null;
  inferred: string | null;
  mismatch: boolean;
} {
  const requested = normalizeTribunalCode(tribunal);
  const inferred = normalizeTribunalCode(cnj.inferredTribunal);
  return {
    requested,
    inferred,
    mismatch: !!requested && !!inferred && requested !== inferred,
  };
}
