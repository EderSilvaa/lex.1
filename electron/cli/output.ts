/**
 * CLI — Renderer dos eventos do agente
 *
 * Estilo Claude Code:
 *   > \user input          ← re-echo do input (feito pelo repl.ts)
 *
 *   • resposta aqui        ← bullet prefix na resposta
 *
 *   ───────────────────    ← separador após cada troca
 *
 *   > |                    ← próximo prompt
 */

import type { AgentEvent } from '../agent/types';

// ── ANSI ──────────────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY && process.env['NO_COLOR'] === undefined;
const A = {
    reset:  isTTY ? '\x1b[0m'  : '',
    dim:    isTTY ? '\x1b[2m'  : '',
    bold:   isTTY ? '\x1b[1m'  : '',
    cyan:   isTTY ? '\x1b[36m' : '',
    green:  isTTY ? '\x1b[32m' : '',
    yellow: isTTY ? '\x1b[33m' : '',
    red:    isTTY ? '\x1b[31m' : '',
    gray:   isTTY ? '\x1b[90m' : '',
    white:  isTTY ? '\x1b[97m' : '',
};

const c = (color: keyof typeof A, text: string) => `${A[color]}${text}${A.reset}`;

const COLS = process.stdout.columns || 72;
const SEPARATOR = c('gray', '─'.repeat(Math.min(COLS - 2, 72)));

function write(text: string)   { process.stdout.write(text); }
function writeln(text: string) { process.stdout.write(text + '\n'); }

// ── XML cleaner ───────────────────────────────────────────────────────────────

function cleanLLMOutput(text: string): string {
    if (!text) return '';

    // Extrai conteúdo de <resposta> se presente
    const m = text.match(/<resposta>([\s\S]*?)<\/resposta>/i);
    if (m) return (m[1] ?? '').trim();

    // Remove blocos de pensamento
    let clean = text
        .replace(/<pensamento>[\s\S]*?<\/pensamento>/gi, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<raciocinio>[\s\S]*?<\/raciocinio>/gi, '');

    // Remove tags XML soltas
    clean = clean.replace(/<\/?[a-z_]+>/gi, '');
    return clean.trim();
}

// ── Estado ────────────────────────────────────────────────────────────────────

let streaming = false;

export function resetStreamingState(): void {
    streaming = false;
}

// ── Re-echo do input do usuário ───────────────────────────────────────────────

/**
 * Chamado pelo repl.ts logo após o usuário apertar Enter.
 * Mostra a mensagem estilizada como o Claude Code faz.
 */
export function renderUserInput(line: string): void {
    writeln('');
    writeln(c('bold', `> \\${line}`));
    writeln('');
}

// ── Render de eventos ─────────────────────────────────────────────────────────

export function renderEvent(event: AgentEvent): void {
    switch (event.type) {

        case 'started':
        case 'thinking':
        case 'criticizing':
        case 'observing':
        case 'privacy_stats':
            // Silenciados — spinner cuida do feedback visual
            break;

        // Tool use: ● skill(params)
        case 'acting': {
            if (streaming) { writeln(''); streaming = false; }
            const paramStr = formatParams(event.parametros);
            writeln(
                c('cyan', '●') + ' ' +
                c('dim', event.skill) +
                (paramStr ? c('gray', `(${paramStr})`) : '')
            );
            break;
        }

        // Resultado: ⎿ preview
        case 'tool_result': {
            const ok = event.resultado?.sucesso !== false;
            const preview = formatResult(event.resultado);
            if (ok) {
                if (preview) writeln(c('gray', `  ⎿  ${preview}`));
            } else {
                writeln(c('gray', '  ⎿  ') + c('red', event.resultado?.erro || 'falhou'));
            }
            break;
        }

        case 'streaming_start':
            streaming = true;
            // Não imprime nada — tokens vêm na sequência
            break;

        case 'token':
            if (event.token) {
                // Primeiro token: imprime bullet prefix antes de começar
                if (!streaming) {
                    write(c('white', '• '));
                    streaming = true;
                }
                write(event.token);
            }
            break;

        case 'completed': {
            if (streaming) {
                writeln('');
                streaming = false;
            } else {
                // Resposta sem streaming — imprime com bullet
                const clean = cleanLLMOutput(event.resposta || '');
                if (clean) {
                    writeln('');
                    // Adiciona bullet na primeira linha e indenta as demais
                    const lines = clean.split('\n');
                    writeln(c('white', '• ') + (lines[0] ?? ''));
                    for (let i = 1; i < lines.length; i++) {
                        writeln('  ' + (lines[i] ?? ''));
                    }
                }
            }
            // Separador entre trocas
            writeln('');
            writeln(SEPARATOR);
            writeln('');
            break;
        }

        case 'error': {
            if (streaming) { writeln(''); streaming = false; }
            const msg = (event.erro || 'erro desconhecido')
                .replace(/\n[\s\S]*/m, '')
                .slice(0, 200);
            writeln(c('red', `✗ ${msg}`));
            writeln('');
            writeln(SEPARATOR);
            writeln('');
            break;
        }

        case 'cancelled':
            if (streaming) { writeln(''); streaming = false; }
            writeln(c('yellow', '⊘ cancelado'));
            writeln('');
            writeln(SEPARATOR);
            writeln('');
            break;

        case 'timeout':
            if (streaming) { writeln(''); streaming = false; }
            writeln(c('yellow', '⊘ timeout'));
            writeln('');
            writeln(SEPARATOR);
            writeln('');
            break;

        case 'waiting_user':
            writeln('');
            writeln(c('yellow', '? ') + event.pergunta);
            if (event.opcoes?.length) {
                for (const op of event.opcoes) writeln(c('gray', `  • ${op}`));
            }
            break;

        default:
            break;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatParams(params: Record<string, any> | undefined): string {
    if (!params || Object.keys(params).length === 0) return '';
    return Object.entries(params)
        .slice(0, 2)
        .map(([k, v]) => {
            const val = typeof v === 'string'
                ? (v.length > 50 ? v.slice(0, 50) + '…' : v)
                : JSON.stringify(v).slice(0, 50);
            return `${k}: "${val}"`;
        })
        .join(', ');
}

function formatResult(result: any): string {
    if (!result) return '';
    const data = result.dados ?? result.mensagem ?? result.erro ?? '';
    if (!data) return '';
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    const first = str.split('\n').find((l: string) => l.trim()) ?? '';
    return first.length > 100 ? first.slice(0, 100) + '…' : first;
}

// ── Utilitários ───────────────────────────────────────────────────────────────

export function renderInfo(text: string): void {
    writeln(c('gray', text));
}

export function renderError(text: string): void {
    writeln(c('red', `✗ ${text}`));
}
