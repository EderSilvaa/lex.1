/**
 * Brain — Slot Filler
 *
 * O Observer sanitiza PII irreversivelmente antes de gravar no grafo:
 *   Input original : { value: "000.123.456-78" }
 *   Gravado        : { value: "[CPF]" }
 *
 * Em replay, o template do grafo tem `[CPF]` — mas o replay precisa mandar
 * o CPF REAL do goal ATUAL pro MCP. Slot filler faz essa ponte:
 *
 *   1. extractSlots(goal) — varre o texto do goal extraindo valores por regex
 *      (mesmos patterns do privacy.ts) e devolve mapa { '[CPF]': [...], ... }.
 *   2. fillSlots(input, slots) — percorre o input recursivamente e substitui
 *      placeholders pelos valores extraídos. Se não tem valor disponível,
 *      deixa o placeholder (o chamador decide se aborta).
 *
 * Política de múltiplos valores: se o goal tem 2 CPFs e o template 2 slots
 * `[CPF]`, usa na ordem de ocorrência no goal. Primeira substituição consome
 * primeiro valor. Sem valor = deixa o placeholder.
 */

interface Pattern {
    label: string;
    regex: RegExp;
}

/**
 * MESMOS patterns do privacy.ts — se divergirem, slots não batem.
 * Mantido duplicado propositalmente para não criar acoplamento cíclico
 * (privacy é da camada observer; slot-filler é da camada brain).
 */
const PII_PATTERNS: Pattern[] = [
    { label: '[CPF]', regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
    { label: '[CNPJ]', regex: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g },
    { label: '[OAB]', regex: /OAB\s*[\/\-]?\s*\d{3,6}\s*[\/\-]?\s*[A-Z]{2}/gi },
    { label: '[EMAIL]', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    { label: '[TEL]', regex: /\(?\d{2}\)?\s*9?\d{4}-?\d{4}\b/g },
    { label: '[VALOR]', regex: /R\$\s*[\d.,]+(?:,\d{2})?/g },
    { label: '[KEY]', regex: /\b(?:sk|pk)-[A-Za-z0-9_-]{16,}\b/g },
    { label: '[BEARER]', regex: /Bearer\s+[A-Za-z0-9._-]+/gi },
];

/**
 * Pattern adicional específico pra contexto PJe: números de processo no
 * formato CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO). Não é PII strict, mas é o
 * valor mais comum que o usuário digita — precisa ser slot.
 */
const PROCESSO_CNJ = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;

export type SlotMap = Record<string, string[]>;

/** Varre o goal e devolve todos os valores por label. */
export function extractSlots(goal: string): SlotMap {
    const slots: SlotMap = {};
    for (const { label, regex } of PII_PATTERNS) {
        const matches = goal.match(regex);
        if (matches && matches.length > 0) slots[label] = matches;
    }
    // Número de processo vai em [VALOR] também — assim templates que
    // gravaram "[VALOR]" podem consumir tanto R$ quanto número CNJ.
    const cnj = goal.match(PROCESSO_CNJ);
    if (cnj && cnj.length > 0) {
        slots['[VALOR]'] = [...(slots['[VALOR]'] || []), ...cnj];
        slots['[PROCESSO]'] = cnj;
    }
    return slots;
}

/**
 * Consome-estado: cada label tem um cursor que avança a cada substituição.
 * Assim [CPF] consecutivos no template pegam CPFs diferentes do goal.
 */
class SlotCursor {
    private index = new Map<string, number>();
    constructor(private slots: SlotMap) { }

    next(label: string): string | null {
        const pool = this.slots[label];
        if (!pool || pool.length === 0) return null;
        const i = this.index.get(label) || 0;
        // Reusa o último se esgotar (comportamento razoável — ex: 3 slots de [CPF],
        // goal tem 1 → replica. Evita replay quebrar por desalinhamento menor).
        const val = i < pool.length ? pool[i] : pool[pool.length - 1];
        this.index.set(label, i + 1);
        return val ?? null;
    }
}

export interface FillResult<T> {
    filled: T;
    /** Labels que estavam no input mas não tinham valor no goal. */
    unresolved: string[];
}

/**
 * Percorre `input` recursivamente substituindo placeholders por valores.
 * Ignora chaves de credencial (`[REDACTED]` sinaliza que o valor nunca
 * saiu do vault reversível — não é papel do slot-filler buscar).
 */
export function fillSlots<T>(input: T, slots: SlotMap): FillResult<T> {
    const cursor = new SlotCursor(slots);
    const unresolved: string[] = [];

    const filled = walk(input, cursor, unresolved) as T;
    return { filled, unresolved: Array.from(new Set(unresolved)) };
}

function walk(value: unknown, cursor: SlotCursor, unresolved: string[]): unknown {
    if (value == null) return value;
    if (typeof value === 'string') return substituteInString(value, cursor, unresolved);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(v => walk(v, cursor, unresolved));
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = walk(v, cursor, unresolved);
        }
        return out;
    }
    return value;
}

/** Substitui todas as ocorrências de labels na string. */
function substituteInString(s: string, cursor: SlotCursor, unresolved: string[]): string {
    // Labels possíveis: [CPF], [CNPJ], etc. Regex cobre qualquer token no formato.
    return s.replace(/\[(?:CPF|CNPJ|OAB|EMAIL|TEL|VALOR|KEY|BEARER|PROCESSO)\]/g, (match) => {
        const val = cursor.next(match);
        if (val === null) {
            unresolved.push(match);
            return match; // deixa o placeholder; caller decide abortar ou seguir
        }
        return val;
    });
}

/** Conveniência: atalho goal→input sem expor SlotMap. */
export function fillFromGoal<T>(input: T, goal: string): FillResult<T> {
    return fillSlots(input, extractSlots(goal));
}
