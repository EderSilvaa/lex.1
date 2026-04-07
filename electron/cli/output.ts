/**
 * CLI — Renderer dos eventos do agente para o terminal
 *
 * Consome AgentEvent (ver electron/agent/types.ts) e formata para stdout
 * com cores ANSI inline (sem dependência externa).
 */

import type { AgentEvent } from '../agent/types';

const ANSI = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    gray: '\x1b[90m',
};

const supportsColor =
    process.stdout.isTTY && process.env['NO_COLOR'] === undefined;

function c(color: keyof typeof ANSI, text: string): string {
    if (!supportsColor) return text;
    return `${ANSI[color]}${text}${ANSI.reset}`;
}

function write(text: string): void {
    process.stdout.write(text);
}

function writeln(text: string): void {
    process.stdout.write(text + '\n');
}

let streaming = false;

export function renderEvent(event: AgentEvent): void {
    switch (event.type) {
        case 'started':
            writeln('');
            writeln(c('cyan', '⟳ ') + c('bold', event.objetivo));
            writeln(c('gray', `  run ${event.runId.slice(0, 8)}`));
            break;

        case 'thinking':
            if (streaming) {
                writeln('');
                streaming = false;
            }
            writeln(c('blue', '◆ pensando') + c('gray', ` (iteração ${event.iteracao})`));
            if (event.pensamento) {
                const preview = event.pensamento.length > 200
                    ? event.pensamento.slice(0, 200) + '…'
                    : event.pensamento;
                writeln(c('dim', '  ' + preview.replace(/\n/g, '\n  ')));
            }
            break;

        case 'criticizing':
            writeln(c('magenta', '◇ avaliando'));
            break;

        case 'acting':
            writeln(c('yellow', '▶ ') + c('bold', event.skill));
            if (event.parametros && Object.keys(event.parametros).length > 0) {
                const params = JSON.stringify(event.parametros);
                const preview = params.length > 160 ? params.slice(0, 160) + '…' : params;
                writeln(c('gray', '  ' + preview));
            }
            break;

        case 'tool_result': {
            const sucesso = event.resultado?.sucesso !== false;
            if (sucesso) {
                writeln(c('green', '✓ ') + c('gray', event.skill));
            } else {
                writeln(c('red', '✗ ') + c('gray', event.skill));
                if (event.resultado?.erro) {
                    writeln(c('red', '  ' + event.resultado.erro));
                }
            }
            break;
        }

        case 'observing':
            // ruído baixo — só mostra preview curto
            if (event.observacao) {
                const preview = event.observacao.length > 120
                    ? event.observacao.slice(0, 120) + '…'
                    : event.observacao;
                writeln(c('dim', '  ' + preview.replace(/\n/g, ' ')));
            }
            break;

        case 'streaming_start':
            writeln('');
            writeln(c('cyan', '─── resposta ───'));
            streaming = true;
            break;

        case 'token':
            if (event.token) write(event.token);
            break;

        case 'completed':
            if (streaming) {
                writeln('');
                streaming = false;
            } else {
                writeln('');
                writeln(c('cyan', '─── resposta ───'));
                writeln(event.resposta || '');
            }
            writeln('');
            writeln(
                c('gray',
                    `${event.passos} passo(s) • ${(event.duracao / 1000).toFixed(1)}s`,
                ),
            );
            break;

        case 'error':
            if (streaming) {
                writeln('');
                streaming = false;
            }
            writeln(c('red', '✗ erro: ') + event.erro);
            break;

        case 'cancelled':
            if (streaming) {
                writeln('');
                streaming = false;
            }
            writeln(c('yellow', '⊘ cancelado'));
            break;

        case 'timeout':
            if (streaming) {
                writeln('');
                streaming = false;
            }
            writeln(c('yellow', '⊘ timeout'));
            break;

        case 'waiting_user':
            writeln(c('yellow', '? ') + event.pergunta);
            if (event.opcoes && event.opcoes.length > 0) {
                for (const op of event.opcoes) writeln(c('gray', '  • ' + op));
            }
            break;

        case 'privacy_stats':
            // silencioso — info técnica
            break;

        default:
            // tipo desconhecido — log discreto
            writeln(c('gray', `[evento] ${(event as any).type}`));
    }
}

export function renderInfo(text: string): void {
    writeln(c('gray', text));
}

export function renderError(text: string): void {
    writeln(c('red', '✗ ' + text));
}

export function resetStreamingState(): void {
    streaming = false;
}
