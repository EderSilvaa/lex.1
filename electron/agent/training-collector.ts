/**
 * Training Collector — Coleta automática de dados de treino
 *
 * Intercepta silenciosamente cada ação browser bem-sucedida no executor.ts
 * e salva um exemplo de treino (instrução → ação → resultado) em disco.
 *
 * 100% passivo: se falhar, o agente continua. Zero latência (fire-and-forget + debounce).
 *
 * Persistência: userData/training/training-YYYY-MM-DD.json (criptografado, AES-256-GCM)
 * Padrão seguido: electron/browser/selector-memory.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { saveEncrypted, loadEncrypted } from '../privacy/encrypted-storage';
import type { DOMSnapshot, ValidationResult } from '../browser/validation';
import type { AgentContext } from './types';
import type { Page } from 'playwright-core';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrainingExample {
    id: string;
    timestamp: number;
    tribunal: string;
    sistema: string;
    url: string;
    domCompacto: string;
    instrucao: string;
    skillName: string;
    acao: {
        type: string;
        selector?: string;
        value?: string;
    };
    resultado: 'success' | 'failure';
    validationBefore: DOMSnapshot;
    validationAfter: DOMSnapshot;
    confidence: 'high' | 'medium' | 'low';
    duration: number;
}

export interface TrainingStats {
    total: number;
    today: number;
    bySistema: Record<string, number>;
    byTribunal: Record<string, number>;
    bySkill: Record<string, number>;
    oldestDate: string;
    newestDate: string;
}

/** Dados brutos passados pelo executor ao collector */
export interface CollectInput {
    snapshot: DOMSnapshot;
    afterSnapshot: DOMSnapshot;
    validation: ValidationResult;
    skillName: string;
    params: Record<string, any>;
    context: AgentContext;
    duration: number;
    domCompacto: string;
}

// ── State ────────────────────────────────────────────────────────────────────

let trainingDir: string | null = null;
let buffer: TrainingExample[] = [];
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let todayCount = 0;
let totalCount = 0;

// ── Init ─────────────────────────────────────────────────────────────────────

export function initTrainingCollector(userDataDir: string): void {
    trainingDir = path.join(userDataDir, 'training');
    if (!fs.existsSync(trainingDir)) {
        fs.mkdirSync(trainingDir, { recursive: true });
    }
    // Conta total de exemplos existentes
    totalCount = countExistingExamples();
    console.log(`[TrainingCollector] Inicializado em ${trainingDir} (${totalCount} exemplos existentes)`);
}

// ── Detect Sistema ───────────────────────────────────────────────────────────

export function detectSistema(url: string): string {
    if (/pje.*\.jus\.br/i.test(url)) return 'pje';
    if (/esaj.*\.jus\.br/i.test(url)) return 'esaj';
    if (/eproc.*\.jus\.br/i.test(url)) return 'eproc';
    if (/receita\.fazenda/i.test(url)) return 'receita';
    if (/\.gov\.br/i.test(url)) return 'gov';
    return 'outro';
}

// ── Compact DOM ──────────────────────────────────────────────────────────────

const MAX_DOM_CHARS = 10_000;

const KEEP_TAGS = new Set([
    'form', 'input', 'textarea', 'select', 'option', 'button',
    'label', 'a', 'table', 'tr', 'td', 'th', 'thead', 'tbody',
    'fieldset', 'legend', 'div', 'span', 'h1', 'h2', 'h3', 'h4',
    'ul', 'ol', 'li', 'p', 'nav', 'header', 'main', 'section',
]);

const KEEP_ATTRS = new Set([
    'id', 'name', 'class', 'type', 'placeholder', 'value',
    'href', 'role', 'aria-label', 'for', 'action', 'method',
    'data-id', 'title', 'alt', 'selected', 'checked', 'disabled',
]);

/**
 * Captura DOM compacto de todos os frames (main + iframes do PJe).
 * Remove scripts, styles, SVGs. Mantém estrutura de formulários.
 * Trunca a MAX_DOM_CHARS.
 */
export async function compactDOM(page: Page): Promise<string> {
    try {
        const frameResults = await Promise.all(
            page.frames().map(frame =>
                frame.evaluate(({ keepTags, keepAttrs }: { keepTags: string[]; keepAttrs: string[] }) => {
                    const KEEP = new Set(keepTags);
                    const ATTR = new Set(keepAttrs);

                    function compact(el: Element, depth: number): string {
                        if (depth > 8) return '';
                        const tag = el.tagName.toLowerCase();

                        // Remove tags inúteis para treino
                        if (['script', 'style', 'svg', 'noscript', 'link', 'meta', 'iframe'].includes(tag)) return '';

                        // Monta atributos filtrados
                        let attrs = '';
                        for (const attr of Array.from(el.attributes)) {
                            if (ATTR.has(attr.name)) {
                                const val = attr.value.trim().slice(0, 100);
                                if (val) attrs += ` ${attr.name}="${val}"`;
                            }
                        }

                        // Elementos folha (input, etc) — self-closing
                        if (['input', 'br', 'hr', 'img'].includes(tag)) {
                            return KEEP.has(tag) ? `<${tag}${attrs}/>` : '';
                        }

                        // Recursivo nos filhos
                        const children = Array.from(el.children)
                            .map(c => compact(c, depth + 1))
                            .filter(Boolean)
                            .join('');

                        const text = el.children.length === 0
                            ? (el.textContent || '').trim().slice(0, 80)
                            : '';

                        // Se tag não é mantida, retorna só filhos
                        if (!KEEP.has(tag)) return children || text;

                        // Tag mantida — retorna com tag
                        const inner = children || text;
                        if (!inner && !attrs) return '';
                        return `<${tag}${attrs}>${inner}</${tag}>`;
                    }

                    return compact(document.documentElement, 0);
                }, { keepTags: [...KEEP_TAGS], keepAttrs: [...KEEP_ATTRS] }).catch(() => '')
            )
        );

        const combined = frameResults.filter(Boolean).join('\n<!-- iframe -->\n');
        return combined.slice(0, MAX_DOM_CHARS);
    } catch {
        return '';
    }
}

// ── Collect ──────────────────────────────────────────────────────────────────

/**
 * Coleta um exemplo de treino. Chamado fire-and-forget pelo executor.ts.
 * Sanitiza PII antes de salvar.
 */
export async function collectTrainingExample(input: CollectInput): Promise<void> {
    if (!trainingDir) return;

    const { sanitizeForTraining } = await import('./training-sanitizer');

    const tribunal = input.context.processo?.tribunal
        || input.context.usuario?.tribunal_preferido
        || '';

    const instrucao = input.params['objetivo']
        || input.params['destino']
        || input.params['instrucao']
        || input.skillName;

    // Extrai tipo de ação e selector dos params
    const acao: TrainingExample['acao'] = {
        type: input.skillName.replace('pje_', ''),
    };
    if (input.params['seletor']) acao.selector = input.params['seletor'];
    if (input.params['campos']) acao.value = JSON.stringify(input.params['campos']).slice(0, 200);

    const example: TrainingExample = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        tribunal,
        sistema: detectSistema(input.snapshot.url),
        url: input.snapshot.url,
        domCompacto: input.domCompacto,
        instrucao: String(instrucao),
        skillName: input.skillName,
        acao,
        resultado: 'success',
        validationBefore: input.snapshot,
        validationAfter: input.afterSnapshot,
        confidence: input.validation.confidence,
        duration: input.duration,
    };

    // Sanitiza PII
    const sanitized = sanitizeForTraining(example);

    buffer.push(sanitized);
    dirty = true;
    todayCount++;
    scheduleSave();
}

// ── Persist ──────────────────────────────────────────────────────────────────

function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 2000);
}

export function flush(): void {
    if (!dirty || !trainingDir || buffer.length === 0) return;

    try {
        const date = new Date().toISOString().split('T')![0]!;
        const filePath = path.join(trainingDir, `training-${date}.json`);

        // Carrega existentes e appenda novos
        const existing = loadEncrypted<TrainingExample[]>(filePath, []);
        const all = [...existing, ...buffer];

        saveEncrypted(filePath, all);
        totalCount += buffer.length;
        buffer = [];
        dirty = false;

        console.log(`[TrainingCollector] Flush: ${all.length} exemplos salvos em training-${date}.json`);
    } catch (err: any) {
        console.error('[TrainingCollector] Erro ao salvar:', err.message);
    }
}

// ── Stats ────────────────────────────────────────────────────────────────────

export function getStats(): TrainingStats {
    const stats: TrainingStats = {
        total: totalCount + buffer.length,
        today: todayCount,
        bySistema: {},
        byTribunal: {},
        bySkill: {},
        oldestDate: '',
        newestDate: '',
    };

    if (!trainingDir) return stats;

    try {
        const files = fs.readdirSync(trainingDir)
            .filter(f => f.startsWith('training-') && f.endsWith('.json'))
            .sort();

        if (files.length > 0) {
            stats.oldestDate = files[0]!.replace('training-', '').replace('.json', '');
            stats.newestDate = files[files.length - 1]!.replace('training-', '').replace('.json', '');
        }

        // Conta por sistema/tribunal/skill lendo cada arquivo
        for (const file of files) {
            const filePath = path.join(trainingDir, file);
            const examples = loadEncrypted<TrainingExample[]>(filePath, []);
            for (const ex of examples) {
                stats.bySistema[ex.sistema] = (stats.bySistema[ex.sistema] || 0) + 1;
                if (ex.tribunal) {
                    stats.byTribunal[ex.tribunal] = (stats.byTribunal[ex.tribunal] || 0) + 1;
                }
                stats.bySkill[ex.skillName] = (stats.bySkill[ex.skillName] || 0) + 1;
            }
        }

        // Inclui buffer não flushado
        for (const ex of buffer) {
            stats.bySistema[ex.sistema] = (stats.bySistema[ex.sistema] || 0) + 1;
            if (ex.tribunal) {
                stats.byTribunal[ex.tribunal] = (stats.byTribunal[ex.tribunal] || 0) + 1;
            }
            stats.bySkill[ex.skillName] = (stats.bySkill[ex.skillName] || 0) + 1;
        }
    } catch { /* stats não são críticos */ }

    return stats;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function countExistingExamples(): number {
    if (!trainingDir) return 0;
    try {
        const files = fs.readdirSync(trainingDir)
            .filter(f => f.startsWith('training-') && f.endsWith('.json'));
        let count = 0;
        for (const file of files) {
            const examples = loadEncrypted<TrainingExample[]>(path.join(trainingDir, file), []);
            count += examples.length;
        }
        return count;
    } catch { return 0; }
}
