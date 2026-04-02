/**
 * LEX Brain — Markdown File Watcher
 *
 * Monitora ~/.lex/brain/ para edições externas (Obsidian, VSCode, editor de texto).
 * Quando um arquivo .md é modificado, faz parse e sincroniza de volta ao SQLite.
 *
 * Formatos suportados (gerados por brain-renderer.ts):
 *   - processo-<numero>.md → upsertProcesso()
 *   - aprendizados.md     → addAprendizado() para novas entradas
 *
 * Loop prevention: renderBrainMarkdown() chama suppressWatcher() antes de escrever.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BrainStore } from './brain-store';

const BRAIN_DIR = path.join(os.homedir(), '.lex', 'brain');
const DEBOUNCE_MS = 1500;

// ============================================================================
// MODULE STATE
// ============================================================================

let _watcher: fs.FSWatcher | null = null;
let _brain: BrainStore | null = null;
let _suppressUntil = 0;
const _timers = new Map<string, ReturnType<typeof setTimeout>>();

// ============================================================================
// PUBLIC API
// ============================================================================

/** Chama antes de renderizar para evitar feedback loop */
export function suppressWatcher(ms = 5000): void {
    _suppressUntil = Date.now() + ms;
}

export function initBrainWatcher(brain: BrainStore): void {
    if (_watcher) return;
    _brain = brain;

    if (!fs.existsSync(BRAIN_DIR)) return; // dir criado pelo renderer na primeira run

    try {
        _watcher = fs.watch(BRAIN_DIR, { persistent: false }, (_event, filename) => {
            if (!filename || !filename.endsWith('.md')) return;
            if (filename === 'INDEX.md') return;

            const fullPath = path.join(BRAIN_DIR, filename);
            scheduleSync(filename, fullPath);
        });
        console.log('[BrainWatcher] Monitorando ~/.lex/brain/');
    } catch (err: any) {
        console.warn('[BrainWatcher] Não foi possível iniciar watcher:', err.message);
    }
}

export function stopBrainWatcher(): void {
    if (_watcher) {
        _watcher.close();
        _watcher = null;
    }
    for (const t of _timers.values()) clearTimeout(t);
    _timers.clear();
    _brain = null;
}

// ============================================================================
// INTERNALS
// ============================================================================

function scheduleSync(filename: string, fullPath: string): void {
    const existing = _timers.get(filename);
    if (existing) clearTimeout(existing);

    const t = setTimeout(() => {
        _timers.delete(filename);
        if (Date.now() < _suppressUntil) return; // renderer escrevendo agora
        syncFile(filename, fullPath);
    }, DEBOUNCE_MS);

    _timers.set(filename, t);
}

function syncFile(filename: string, fullPath: string): void {
    if (!_brain || !fs.existsSync(fullPath)) return;

    try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (filename === 'aprendizados.md') {
            syncAprendizados(content);
        } else if (filename.startsWith('processo-')) {
            syncProcesso(content);
        }
    } catch (err: any) {
        console.warn(`[BrainWatcher] Erro ao sincronizar ${filename}:`, err.message);
    }
}

// ============================================================================
// PARSERS
// ============================================================================

function parseSection(lines: string[], heading: string): string[] {
    const items: string[] = [];
    let inside = false;
    for (const line of lines) {
        if (line.startsWith(`## ${heading}`)) { inside = true; continue; }
        if (inside) {
            if (line.startsWith('## ') || line.startsWith('# ')) break;
            if (line.startsWith('- ')) {
                const text = line.slice(2).replace(/\[\[|\]\]/g, '').trim();
                if (text) items.push(text);
            }
        }
    }
    return items;
}

function parseField(content: string, fieldName: string): string | undefined {
    const re = new RegExp(`^\\*\\*${fieldName}:\\*\\*\\s+(.+)$`, 'm');
    const m = content.match(re);
    return m ? m[1]!.replace(/\[\[|\]\]/g, '').trim() : undefined;
}

function syncProcesso(content: string): void {
    if (!_brain) return;

    const h1 = content.match(/^# Processo (.+)$/m);
    if (!h1) return;
    const numero = h1[1]!.trim();

    const lines = content.split('\n');
    const data: Parameters<BrainStore['upsertProcesso']>[1] = { processoNumero: numero };

    const classe = parseField(content, 'Classe');
    if (classe) data.classe = classe;

    const tribunal = parseField(content, 'Tribunal');
    if (tribunal) data.tribunal = tribunal;

    const status = parseField(content, 'Status');
    if (status) data.status = status;

    const autorStr = parseField(content, 'Autor');
    const reuStr   = parseField(content, 'Réu');
    if (autorStr || reuStr) {
        data.partes = {
            autor: autorStr ? autorStr.split(',').map(s => s.trim()) : [],
            reu:   reuStr   ? reuStr.split(',').map(s => s.trim())   : [],
        };
    }

    const teses = parseSection(lines, 'Teses');
    if (teses.length) data.tesesDiscutidas = teses;

    const decisoes = parseSection(lines, 'Decisões');
    if (decisoes.length) data.decisoes = decisoes;

    _brain.upsertProcesso(numero, data);
    console.log(`[BrainWatcher] Processo ${numero} sincronizado do Markdown`);
}

function syncAprendizados(content: string): void {
    if (!_brain) return;

    // Formato: - **dd/mm/yyyy**: texto  OU  - texto simples (sem data)
    const lines = content.split('\n');
    let added = 0;

    for (const line of lines) {
        if (!line.startsWith('- ')) continue;

        const withDate = line.match(/^- \*\*[^*]+\*\*:\s+(.+)$/);
        const text = withDate ? withDate[1]!.trim() : line.slice(2).trim();
        if (!text) continue;

        const existing = _brain.getNodeByTypeAndLabel('aprendizado', text);
        if (!existing) {
            _brain.addAprendizado(text);
            added++;
        }
    }

    if (added > 0) {
        console.log(`[BrainWatcher] ${added} novo(s) aprendizado(s) sincronizado(s) do Markdown`);
    }
}
