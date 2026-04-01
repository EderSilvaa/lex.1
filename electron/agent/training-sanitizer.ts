/**
 * Training Sanitizer — Remove PII dos exemplos de treino
 *
 * Compliance OAB/LGPD: dados pessoais nunca são persistidos no dataset de treino.
 * Substitui CPF, CNPJ, emails, telefones, nomes por tokens genéricos.
 * Mantém: números de processo (públicos), seletores CSS, ações, URLs.
 */

import type { TrainingExample } from './training-collector';

// ── Patterns ─────────────────────────────────────────────────────────────────

const PII_PATTERNS: Array<{ regex: RegExp; token: string }> = [
    // CPF: 123.456.789-01 ou 12345678901
    { regex: /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, token: '[CPF]' },
    // CNPJ: 12.345.678/0001-01 ou 12345678000101
    { regex: /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, token: '[CNPJ]' },
    // OAB: OAB/PA 12345 ou OAB-PA 12345
    { regex: /OAB[\s/\-]*[A-Z]{2}\s*\d{3,6}/gi, token: '[OAB]' },
    // Email
    { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, token: '[EMAIL]' },
    // Telefone: (91) 98765-4321, 91987654321, +55 91 98765-4321
    { regex: /(?:\+55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g, token: '[TELEFONE]' },
    // RG: 1.234.567 ou 1234567
    { regex: /\b\d{1,2}\.?\d{3}\.?\d{3}\b/g, token: '[RG]' },
    // CEP: 66000-000
    { regex: /\d{5}-\d{3}/g, token: '[CEP]' },
];

// Nomes de partes — heurística: palavras capitalizadas após marcadores processuais
const PARTE_MARKERS = /(?:Autor|Réu|Reu|Reclamante|Reclamado|Impetrante|Impetrado|Requerente|Requerido|Apelante|Apelado|Agravante|Agravado|Embargante|Embargado|Exequente|Executado|Representante|Advogado|Procurador)[:\s]*/gi;

/**
 * Remove PII de uma string.
 * Substitui padrões conhecidos por tokens genéricos.
 */
function sanitizeString(text: string): string {
    let result = text;

    // Padrões regex
    for (const { regex, token } of PII_PATTERNS) {
        result = result.replace(regex, token);
    }

    // Nomes após marcadores processuais: "Autor: JOÃO DA SILVA" → "Autor: [NOME]"
    result = result.replace(PARTE_MARKERS, (marker) => {
        return marker; // mantém o marker
    });

    // Nomes em uppercase após marcadores (PJe geralmente usa CAPS)
    result = result.replace(
        /(Autor|Réu|Reu|Reclamante|Reclamado|Impetrante|Impetrado|Requerente|Requerido|Apelante|Apelado|Agravante|Agravado|Embargante|Embargado|Exequente|Executado|Advogado|Procurador)[:\s]+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇa-záàâãéêíóôõúç\s.]{3,60})/gi,
        (_, role, _name) => `${role}: [NOME]`
    );

    return result;
}

/**
 * Sanitiza um TrainingExample completo.
 * Retorna cópia com PII removido de domCompacto, instrucao e acao.value.
 */
export function sanitizeForTraining(example: TrainingExample): TrainingExample {
    return {
        ...example,
        domCompacto: sanitizeString(example.domCompacto),
        instrucao: sanitizeString(example.instrucao),
        acao: {
            ...example.acao,
            value: example.acao.value ? sanitizeString(example.acao.value) : undefined,
        },
    };
}
