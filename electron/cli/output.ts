/**
 * CLI — Renderer dos eventos do agente
 *
 * Inspirado no estilo do Claude Code:
 *  - Tokens streamam diretamente sem separadores
 *  - Tool use: ● skill(params) / ⎿ resultado
 *  - Sem re-echo da pergunta, sem IDs internos
 *  - XML tags (<pensamento>, <resposta>) removidos da resposta final
 *  - Logs internos silenciados via bin/lex.js
 */

import type { AgentEvent } from '../agent/types';

// ── ANSI ──────────────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY && process.env['NO_COLOR'] === undefined;
const A = {
    reset:   isTTY ? '\x1b[0m'  : '',
    dim:     isTTY ? '\x1b[2m'  : '',
    bold:    isTTY ? '\x1b[1m'  : '',
    cyan:    isTTY ? '\x1b[36m' : '',
    green:   isTTY ? '\x1b[32m' : '',
    yellow:  isTTY ? '\x1b[33m' : '',
    red:     isTTY ? '\x1b[31m' : '',
    gray:    isTTY ? '\x1b[90m' : '',
    white:   isTTY ? '\x1b[97m' : '',
};

const c = (color: keyof typeof A, text: string) => `${A[color]}${text}${A.reset}`;

function write(text: string)   { process.stdout.write(text); }
function writeln(text: string) { process.stdout.write(text + '\n'); }

// ── Limpeza de XML do LLM ─────────────────────────────────────────────────────

/**
 * Remove tags XML que o LLM pode emitir (<pensamento>, <resposta>, etc.)
 * Extrai o conteúdo de <resposta> se presente; caso contrário, remove só
 * os blocos de pensamento e retorna o texto limpo.
 */
function cleanLLMOutput(text: string): string {
    if (!text) return '';

    // Extrai só o conteúdo de <resposta>...</resposta> se existir
    const respostaMatch = text.match(/<resposta>([\s\S]*?)<\/resposta>/i);
    if (respostaMatch) {
        return (respostaMatch[1] ?? '').trim();
    }

    // Remove blocos de pensamento interno
    let clean = text
        .replace(/<pensamento>[\s\S]*?<\/pensamento>/gi, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<raciocinio>[\s\S]*?<\/raciocinio>/gi, '');

    // Remove qualquer outra tag XML simples que sobrar
    clean = clean.replace(/<\/?[a-z_]+>/gi, '');

    return clean.trim();
}

// ── Estado de streaming ───────────────────────────────────────────────────────

let streaming = false;
let streamBuffer = ''; // acumula tokens para strip de tags no meio do stream

export function resetStreamingState(): void {
    streaming = false;
    streamBuffer = '';
}

// ── Tool use tracking ─────────────────────────────────────────────────────────

let lastSkill: string | null = null;

// ── Render principal ──────────────────────────────────────────────────────────

export function renderEvent(event: AgentEvent): void {
    switch (event.type) {

        // Silenciado — sem re-echo da pergunta nem ID de run
        case 'started':
            break;

        // Pensamento interno — apenas o spinner (gerenciado pelo repl.ts)
        // não imprime o conteúdo do raciocínio
        case 'thinking':
        case 'criticizing':
            break;

        // Tool use — estilo Claude Code: ● skill(params)
        case 'acting': {
            if (streaming) { writeln(''); streaming = false; }
            lastSkill = event.skill;
            const paramStr = formatParams(event.parametros);
            writeln(
                c('cyan', '●') + ' ' +
                c('bold', event.skill) +
                (paramStr ? c('gray', `(${paramStr})`) : '')
            );
            break;
        }

        // Resultado do tool — ⎿ preview do resultado
        case 'tool_result': {
            const ok = event.resultado?.sucesso !== false;
            const preview = formatResult(event.resultado);
            if (ok) {
                if (preview) {
                    writeln(c('gray', `  ⎿  ${preview}`));
                }
            } else {
                const err = event.resultado?.erro || 'falhou';
                writeln(c('gray', '  ⎿  ') + c('red', err));
            }
            lastSkill = null;
            break;
        }

        // Observação — silenciada (ruído interno)
        case 'observing':
            break;

        // Streaming começa — não imprime nada, só muda estado
        case 'streaming_start':
            streaming = true;
            streamBuffer = '';
            writeln('');
            break;

        // Token individual — imprime direto
        case 'token':
            if (event.token) {
                write(event.token);
                streamBuffer += event.token;
            }
            break;

        // Resposta completa
        case 'completed': {
            if (streaming) {
                // Já foi streamado — garante nova linha e mostra footer
                writeln('');
                streaming = false;
                streamBuffer = '';
            } else {
                // Resposta sem streaming — limpa e imprime
                const clean = cleanLLMOutput(event.resposta || '');
                if (clean) {
                    writeln('');
                    writeln(clean);
                }
            }
            // Footer discreto — só timing, sem "passo(s)"
            if (event.duracao > 0) {
                writeln('');
                writeln(c('gray', `  ${(event.duracao / 1000).toFixed(1)}s`));
            }
            break;
        }

        case 'error': {
            if (streaming) { writeln(''); streaming = false; }
            // Limpa erros de LLM que vêm com texto longo de stack
            const msg = (event.erro || 'erro desconhecido')
                .replace(/\n[\s\S]*/m, '') // só primeira linha
                .slice(0, 200);
            writeln('');
            writeln(c('red', `✗ ${msg}`));
            break;
        }

        case 'cancelled':
            if (streaming) { writeln(''); streaming = false; }
            writeln(c('yellow', '⊘ cancelado'));
            break;

        case 'timeout':
            if (streaming) { writeln(''); streaming = false; }
            writeln(c('yellow', '⊘ timeout'));
            break;

        case 'waiting_user':
            writeln('');
            writeln(c('yellow', '? ') + event.pergunta);
            if (event.opcoes?.length) {
                for (const op of event.opcoes) writeln(c('gray', `  • ${op}`));
            }
            break;

        case 'privacy_stats':
            break;

        default:
            // tipos futuros desconhecidos — silenciosos
            break;
    }
}

// ── Helpers de formatação ─────────────────────────────────────────────────────

function formatParams(params: Record<string, any> | undefined): string {
    if (!params || Object.keys(params).length === 0) return '';
    const entries = Object.entries(params)
        .map(([k, v]) => {
            const val = typeof v === 'string'
                ? (v.length > 60 ? v.slice(0, 60) + '…' : v)
                : JSON.stringify(v).slice(0, 60);
            return `${k}: "${val}"`;
        })
        .slice(0, 3); // máximo 3 params visíveis
    return entries.join(', ');
}

function formatResult(result: any): string {
    if (!result) return '';
    const data = result.dados ?? result.mensagem ?? result.erro ?? '';
    if (!data) return '';
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    // Pega só a primeira linha não-vazia
    const firstLine = str.split('\n').find(l => l.trim()) ?? '';
    return firstLine.length > 120 ? firstLine.slice(0, 120) + '…' : firstLine;
}

// ── Utilitários públicos ──────────────────────────────────────────────────────

export function renderInfo(text: string): void {
    writeln(c('gray', text));
}

export function renderError(text: string): void {
    writeln(c('red', `✗ ${text}`));
}
