/**
 * Filesystem enricher — adiciona contexto a tools do server `filesystem`
 * (ex: `filesystem__read_file`, `filesystem__write_file`).
 *
 * Não faz I/O extra: só inspeciona os args da tool pra extrair pistas
 * semânticas — cwd, fileType, operation. Custo desprezível.
 *
 * Objetivo: quando o replay ligar em flows de filesystem ("organizar peças
 * baixadas em pasta"), o grafo já terá contexto suficiente pra distinguir
 * "leitura de PDF em Downloads" vs "escrita de .txt em Documents".
 */

import * as path from 'path';
import type { Enricher, ObservationBefore, ObservationAfter } from '../types';

function detectFileType(p: string | undefined): string | undefined {
    if (!p) return undefined;
    const ext = path.extname(p).toLowerCase().replace(/^\./, '');
    return ext || undefined;
}

function detectOperation(tool: string): string | undefined {
    const t = tool.toLowerCase();
    if (/read/.test(t)) return 'read';
    if (/write|create/.test(t)) return 'write';
    if (/list|directory|dir/.test(t)) return 'list';
    if (/delete|remove|unlink/.test(t)) return 'delete';
    if (/move|rename/.test(t)) return 'move';
    if (/copy/.test(t)) return 'copy';
    if (/search|grep|find/.test(t)) return 'search';
    return undefined;
}

function extractPath(args: Record<string, unknown>): string | undefined {
    const keys = ['path', 'file', 'filename', 'target', 'source', 'directory', 'dir'];
    for (const k of keys) {
        const v = args[k];
        if (typeof v === 'string' && v.length > 0) return v;
    }
    return undefined;
}

export const filesystemEnricher: Enricher = {
    async before(ctx): Promise<ObservationBefore | null> {
        const p = extractPath(ctx.args);
        const fileType = detectFileType(p);
        const operation = detectOperation(ctx.tool);

        if (!p && !operation) return null;

        // Reutilizamos os campos do shape existente: pjeContext guarda a
        // "operação" (read/write/list), tribunal guarda o dir pai (contexto
        // de workspace). Semântica livre — o schema do grafo é genérico.
        return {
            ...(p ? { title: path.basename(p) } : {}),
            ...(operation ? { pjeContext: `fs:${operation}${fileType ? `:${fileType}` : ''}` } : {}),
            ...(p ? { tribunal: path.dirname(p).split(path.sep).slice(-2).join('/') } : {}),
        };
    },

    async after(ctx): Promise<ObservationAfter | null> {
        // output é a saída agregada (já concatenada pelo runner MCP).
        // Para filesystem não há "state after" real — mas podemos gravar
        // o tamanho do output como proxy de "quantidade lida/escrita".
        if (!ctx.success) return null;
        return { title: `${ctx.output?.length || 0} bytes` };
    },
};
