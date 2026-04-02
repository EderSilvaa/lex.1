/**
 * LEX Brain — Markdown Renderer
 *
 * Gera arquivos Markdown em ~/.lex/brain/ a partir do SQLite.
 * Um arquivo por processo, um índice geral, e um arquivo de aprendizados.
 * Compatível com Obsidian (wikilinks), mas sem dependência.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BrainStore } from './brain-store';
import type { BrainNode } from './types';

const BRAIN_DIR = path.join(os.homedir(), '.lex', 'brain');

/** Garante que o diretório existe */
function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/** Sanitiza string para nome de arquivo */
function sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim();
}

/**
 * Renderiza todo o Brain em Markdown.
 * Retorna path do diretório gerado.
 */
export async function renderBrainMarkdown(brain: BrainStore): Promise<{ dir: string; fileCount: number }> {
    ensureDir(BRAIN_DIR);
    let fileCount = 0;

    // 1. Processos — um arquivo por processo
    const processos = brain.getNodesByType('processo', 500);
    for (const proc of processos) {
        const content = renderProcesso(brain, proc);
        const filename = `processo-${sanitizeFilename(proc.label)}.md`;
        fs.writeFileSync(path.join(BRAIN_DIR, filename), content, 'utf-8');
        fileCount++;
    }

    // 2. Aprendizados — um arquivo consolidado
    const aprendizados = brain.getAprendizados(100);
    if (aprendizados.length > 0) {
        const content = renderAprendizados(aprendizados);
        fs.writeFileSync(path.join(BRAIN_DIR, 'aprendizados.md'), content, 'utf-8');
        fileCount++;
    }

    // 3. Índice geral
    const stats = brain.getStats();
    const indexContent = renderIndex(processos, aprendizados, stats);
    fs.writeFileSync(path.join(BRAIN_DIR, 'INDEX.md'), indexContent, 'utf-8');
    fileCount++;

    console.log(`[BrainRenderer] ${fileCount} arquivos gerados em ${BRAIN_DIR}`);
    return { dir: BRAIN_DIR, fileCount };
}

/** Renderiza Markdown de um processo com seu sub-grafo */
function renderProcesso(brain: BrainStore, proc: BrainNode): string {
    const d = proc.data || {};
    const lines: string[] = [
        `# Processo ${proc.label}`,
        '',
        `> Confiança: ${(proc.confidence * 100).toFixed(0)}% | Fonte: ${proc.source}`,
        `> Atualizado: ${new Date(proc.updatedAt).toLocaleDateString('pt-BR')}`,
        '',
    ];

    // Dados do processo
    if (d['classe']) lines.push(`**Classe:** ${d['classe']}`);
    if (d['tribunal']) lines.push(`**Tribunal:** ${d['tribunal']}`);
    if (d['status']) lines.push(`**Status:** ${d['status']}`);
    if (d['partes']) {
        if (d['partes'].autor?.length) lines.push(`**Autor:** ${d['partes'].autor.join(', ')}`);
        if (d['partes'].reu?.length) lines.push(`**Réu:** ${d['partes'].reu.join(', ')}`);
    }
    lines.push('');

    // Teses
    const teses = brain.getEdgesFrom(proc.id, 'has_tese')
        .map(e => brain.getNode(e.targetId))
        .filter(Boolean) as BrainNode[];
    if (teses.length > 0) {
        lines.push('## Teses');
        for (const t of teses) {
            lines.push(`- ${t.label}`);
        }
        lines.push('');
    }

    // Decisões
    const decisoes = brain.getEdgesFrom(proc.id, 'has_decisao')
        .map(e => brain.getNode(e.targetId))
        .filter(Boolean) as BrainNode[];
    if (decisoes.length > 0) {
        lines.push('## Decisões');
        for (const dec of decisoes) {
            lines.push(`- ${dec.label}`);
        }
        lines.push('');
    }

    // Partes (nós)
    const partes = brain.getEdgesFrom(proc.id, 'has_parte')
        .map(e => brain.getNode(e.targetId))
        .filter(Boolean) as BrainNode[];
    if (partes.length > 0) {
        lines.push('## Partes');
        for (const p of partes) {
            lines.push(`- [[${p.label}]]`);
        }
        lines.push('');
    }

    // Tribunal
    const tribunalEdges = brain.getEdgesFrom(proc.id, 'from_tribunal');
    if (tribunalEdges.length > 0) {
        const tribunal = brain.getNode(tribunalEdges[0]!.targetId);
        if (tribunal) {
            lines.push(`**Tribunal:** [[${tribunal.label}]]`);
            lines.push('');
        }
    }

    return lines.join('\n');
}

/** Renderiza Markdown de aprendizados */
function renderAprendizados(aprendizados: BrainNode[]): string {
    const lines: string[] = [
        '# Aprendizados',
        '',
        `> ${aprendizados.length} aprendizados registrados`,
        '',
    ];

    for (const a of aprendizados) {
        const date = new Date(a.createdAt).toLocaleDateString('pt-BR');
        lines.push(`- **${date}**: ${a.label}`);
    }

    return lines.join('\n');
}

/** Renderiza índice geral */
function renderIndex(
    processos: BrainNode[],
    aprendizados: BrainNode[],
    stats: { nodeCount: number; edgeCount: number; byType: Record<string, number> },
): string {
    const lines: string[] = [
        '# LEX Brain',
        '',
        `> Gerado em: ${new Date().toLocaleString('pt-BR')}`,
        '',
        '## Estatísticas',
        `- Nós: ${stats.nodeCount}`,
        `- Conexões: ${stats.edgeCount}`,
    ];

    for (const [type, count] of Object.entries(stats.byType)) {
        lines.push(`  - ${type}: ${count}`);
    }
    lines.push('');

    // Lista de processos
    if (processos.length > 0) {
        lines.push('## Processos');
        for (const proc of processos) {
            const filename = `processo-${sanitizeFilename(proc.label)}`;
            lines.push(`- [[${filename}|${proc.label}]]`);
        }
        lines.push('');
    }

    // Link para aprendizados
    if (aprendizados.length > 0) {
        lines.push(`## Aprendizados`);
        lines.push(`- [[aprendizados|${aprendizados.length} aprendizados]]`);
        lines.push('');
    }

    return lines.join('\n');
}
