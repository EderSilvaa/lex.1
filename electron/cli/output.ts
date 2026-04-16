/**
 * CLI — Renderer dos eventos do agente
 *
 * Estilo Claude Code:
 *   > \user input          ← re-echo (feito pelo repl.ts)
 *
 *   • resposta aqui        ← bullet prefix
 *
 *   ───────────────────    ← separador após cada troca
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
    let clean = m ? (m[1] ?? '') : text;

    // Remove blocos de pensamento
    clean = clean
        .replace(/<pensamento>[\s\S]*?<\/pensamento>/gi, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<raciocinio>[\s\S]*?<\/raciocinio>/gi, '')
        .replace(/<\/?[a-z_]+>/gi, '');

    // Converte markdown básico para texto simples (terminal não renderiza MD)
    clean = clean
        .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
        .replace(/\*(.+?)\*/g, '$1')        // *italic* → italic
        .replace(/`(.+?)`/g, '$1')          // `code` → code
        .replace(/^#{1,6}\s+/gm, '')        // # Heading → Heading
        .replace(/^\s*[-*]\s+/gm, '  • ');  // - item → • item

    return clean.trim();
}

// ── Estado ────────────────────────────────────────────────────────────────────

let streaming      = false;   // true enquanto tokens chegando
let bulletDone     = false;   // true após o • ter sido impresso
let thinkingDepth  = 0;       // >0 quando dentro de tag de pensamento
let tokenBuf       = '';      // buffer para detectar tags abertas no meio do stream

const THINKING_OPEN  = /^<(pensamento|thinking|raciocinio)>/i;
const THINKING_CLOSE = /^<\/(pensamento|thinking|raciocinio)>/i;

export function resetStreamingState(): void {
    streaming     = false;
    bulletDone    = false;
    thinkingDepth = 0;
    tokenBuf      = '';
}

// ── Re-echo do input ──────────────────────────────────────────────────────────

export function renderUserInput(line: string): void {
    writeln(c('bold', `> \\${line}`));
    writeln('');
}

// ── Render de eventos ─────────────────────────────────────────────────────────

export function renderEvent(event: AgentEvent): void {
    switch (event.type) {

        // ── Silenciados ────────────────────────────────────────────────────────
        case 'started':
        case 'thinking':
        case 'criticizing':
        case 'observing':
        case 'privacy_stats':
            break;

        // ── Tool use ───────────────────────────────────────────────────────────
        case 'acting': {
            const paramStr = formatParams(event.parametros);
            writeln(
                c('cyan', '●') + ' ' +
                c('dim', event.skill) +
                (paramStr ? c('gray', `(${paramStr})`) : '')
            );
            break;
        }

        case 'tool_result': {
            const ok  = event.resultado?.sucesso !== false;
            const msg = formatResult(event.resultado);
            if (ok) {
                if (msg) writeln(c('gray', `  ⎿  ${msg}`));
            } else {
                writeln(c('gray', '  ⎿  ') + c('red', event.resultado?.erro || 'falhou'));
            }
            break;
        }

        // ── Streaming ──────────────────────────────────────────────────────────
        case 'streaming_start':
            streaming     = true;
            bulletDone    = false;
            thinkingDepth = 0;
            tokenBuf      = '';
            if (isTTY) write('\r\x1b[2K'); // limpa qualquer echo residual do paste
            break;

        case 'token': {
            if (!event.token) break;

            // Filtra tags de pensamento no stream — acumula no buffer e só
            // emite quando confirma que não é uma tag de abertura/fechamento
            tokenBuf += event.token;

            // Drena o buffer enquanto há conteúdo processável
            while (tokenBuf.length > 0) {
                const openM  = tokenBuf.match(THINKING_OPEN);
                const closeM = tokenBuf.match(THINKING_CLOSE);

                if (openM) {
                    thinkingDepth++;
                    tokenBuf = tokenBuf.slice(openM[0].length);
                    continue;
                }
                if (closeM && thinkingDepth > 0) {
                    thinkingDepth--;
                    tokenBuf = tokenBuf.slice(closeM[0].length);
                    continue;
                }

                // Se está dentro de bloco de pensamento, descarta
                if (thinkingDepth > 0) { tokenBuf = ''; break; }

                // Possível início de tag — aguarda mais tokens
                if (tokenBuf.startsWith('<')) {
                    const closeAngle = tokenBuf.indexOf('>');
                    if (closeAngle === -1 && tokenBuf.length < 30) break; // aguarda
                }

                // Emite o primeiro caractere e continua
                const ch = tokenBuf[0]!;
                tokenBuf = tokenBuf.slice(1);

                if (!bulletDone) {
                    if (!ch.trim()) continue;
                    if (isTTY) write('\r\x1b[2K');
                    write(c('white', '• '));
                    bulletDone = true;
                }
                write(ch);
            }
            break;
        }

        // ── Resposta final ─────────────────────────────────────────────────────
        case 'completed': {
            if (streaming) {
                // Tokens já foram impressos com bullet — só fecha a linha
                writeln('');
                streaming  = false;
                bulletDone = false;
            } else {
                // Resposta sem streaming — imprime com bullet
                const clean = cleanLLMOutput(event.resposta || '');
                if (clean) {
                    const lines = clean.split('\n').filter(l => l.trim());
                    write(c('white', '• '));
                    writeln(lines[0] ?? '');
                    for (let i = 1; i < lines.length; i++) {
                        writeln('  ' + lines[i]);
                    }
                }
            }
            writeln('');
            writeln(SEPARATOR);
            writeln('');
            break;
        }

        // ── Erros e estados ────────────────────────────────────────────────────
        case 'error': {
            if (streaming) { writeln(''); streaming = false; bulletDone = false; }
            const msg = (event.erro || 'erro desconhecido')
                .replace(/\n[\s\S]*/m, '').slice(0, 200);
            writeln('\n' + c('red', `✗ ${msg}`));
            writeln('');
            writeln(SEPARATOR);
            writeln('');
            break;
        }

        case 'cancelled':
            if (streaming) { writeln(''); streaming = false; bulletDone = false; }
            writeln(c('yellow', '⊘ cancelado'));
            writeln('');
            writeln(SEPARATOR);
            writeln('');
            break;

        case 'timeout':
            if (streaming) { writeln(''); streaming = false; bulletDone = false; }
            writeln(c('yellow', '⊘ timeout'));
            writeln('');
            writeln(SEPARATOR);
            writeln('');
            break;

        case 'waiting_user':
            if (streaming) { writeln(''); streaming = false; bulletDone = false; }
            writeln('');
            writeln(c('yellow', '? ') + c('bold', event.pergunta));
            if (event.opcoes?.length) {
                for (const op of event.opcoes) writeln(c('gray', `  • ${op}`));
            }
            writeln('');
            writeln(SEPARATOR);
            writeln('');
            break;

        // ── Orchestrator (multi-agent) ─────────────────────────────────────────
        case 'orchestrator': {
            const evt = (event as any).data;
            switch (evt?.type) {
                case 'plan_created': {
                    const tasks: any[] = evt.plan?.subtasks ?? [];
                    writeln(c('cyan', `◈ Plano: ${tasks.length} subtasks`));
                    for (const t of tasks) {
                        writeln(c('gray', `  ◦ [${t.agentType}] ${t.description.slice(0, 80)}`));
                    }
                    writeln('');
                    break;
                }
                case 'checkpoint_resumed':
                    writeln(c('yellow', `⟳ Retomando checkpoint (batch ${evt.fromBatch})…`));
                    break;
                case 'subtask_started':
                    writeln(c('cyan', '●') + ' ' + c('dim', `${evt.agentType}`) + c('gray', ` subtask ${evt.subtaskId}`));
                    break;
                case 'subtask_completed': {
                    const cleaned = cleanLLMOutput(typeof evt.result === 'string' ? evt.result : '');
                    const preview = cleaned.split('\n').find((l: string) => l.trim()) ?? '';
                    writeln(c('gray', `  ⎿  `) + c('green', '✓') + (preview ? c('gray', `  ${preview.slice(0, 80)}`) : ''));
                    break;
                }
                case 'subtask_failed':
                    writeln(c('gray', '  ⎿  ') + c('red', `✗ ${evt.subtaskId}: ${String(evt.error).slice(0, 80)}`));
                    break;
                case 'subtask_retrying':
                    writeln(c('yellow', `  ↻ retry ${evt.attempt}/${evt.maxRetries} (${evt.subtaskId})`));
                    break;
                case 'plan_completed': {
                    if (streaming) { writeln(''); streaming = false; bulletDone = false; }
                    const clean = cleanLLMOutput(evt.finalAnswer || '');
                    if (clean) {
                        const lines = clean.split('\n').filter((l: string) => l.trim());
                        write(c('white', '• '));
                        writeln(lines[0] ?? '');
                        for (let i = 1; i < lines.length; i++) writeln('  ' + lines[i]);
                    }
                    writeln('');
                    writeln(SEPARATOR);
                    writeln('');
                    break;
                }
                case 'plan_failed':
                    writeln('\n' + c('red', `✗ plano falhou: ${String(evt.error).slice(0, 150)}`));
                    writeln('');
                    writeln(SEPARATOR);
                    writeln('');
                    break;
            }
            break;
        }

        default:
            break;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatParams(params: Record<string, any> | undefined): string {
    if (!params || !Object.keys(params).length) return '';
    return Object.entries(params).slice(0, 2).map(([k, v]) => {
        const val = typeof v === 'string'
            ? (v.length > 50 ? v.slice(0, 50) + '…' : v)
            : JSON.stringify(v).slice(0, 50);
        return `${k}: "${val}"`;
    }).join(', ');
}

function formatResult(result: any): string {
    if (!result) return '';
    const data = result.dados ?? result.mensagem ?? result.erro ?? '';
    if (!data) return '';
    const str  = typeof data === 'string' ? data : JSON.stringify(data);
    const line = str.split('\n').find((l: string) => l.trim()) ?? '';
    return line.length > 100 ? line.slice(0, 100) + '…' : line;
}

// ── Modo interativo (Ink) ─────────────────────────────────────────────────────

let _interactiveMode = false;

/** Ativa roteamento via message-bus (chamado antes de ink.render). */
export function setInteractiveMode(val: boolean): void {
    _interactiveMode = val;
}

export function renderInfo(text: string): void {
    if (_interactiveMode) {
        const { emitInfo } = require('./message-bus') as typeof import('./message-bus');
        emitInfo(text);
    } else {
        writeln(c('gray', text));
    }
}

export function renderError(text: string): void {
    if (_interactiveMode) {
        const { emitError } = require('./message-bus') as typeof import('./message-bus');
        emitError(text);
    } else {
        writeln(c('red', `✗ ${text}`));
    }
}
