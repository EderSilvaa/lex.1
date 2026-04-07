/**
 * CLI — Parser cru de process.argv
 *
 * Sem dependência externa. Suporta:
 *   lex                              → REPL
 *   lex "objetivo"                   → one-shot
 *   lex --version | -v
 *   lex --help    | -h
 *   lex --user-data-dir <path>
 *   lex --no-attach                  → força spawn próprio do backend (debug)
 */

export interface ParsedArgs {
    mode: 'one-shot' | 'repl' | 'version' | 'help';
    objetivo?: string;
    userDataDir?: string;
    noAttach: boolean;
}

/**
 * Parseia um URL lex:// disparado pelo browser via URL scheme.
 *
 * Formatos aceitos:
 *   lex://run?goal=analisa+processo+123
 *   lex://run?goal=analisa%20processo%20123
 *   lex://run/analisa processo 123          (path como fallback)
 *
 * Retorna null se a string não for um lex:// URL.
 */
export function parseLexUrl(raw: string): string | null {
    if (!raw.startsWith('lex://')) return null;

    try {
        // URL() não entende lex:// diretamente no Node < 20 — subsitui por https:// só para parsear
        const normalized = raw.replace(/^lex:\/\//, 'https://lex-placeholder/');
        const url = new URL(normalized);

        // Prioridade 1: query param ?goal=
        const goal = url.searchParams.get('goal');
        if (goal?.trim()) return decodeURIComponent(goal.trim());

        // Prioridade 2: pathname (ex: lex://run/analisa processo)
        // Remove segmento de comando "run" do início — só aceita o que vier depois
        const pathname = decodeURIComponent(url.pathname)
            .replace(/^\/+/, '')
            .replace(/^run(\/+|$)/, '')
            .trim();
        if (pathname) return pathname;
    } catch {
        // Fallback: extrai tudo depois de lex://run? manualmente
        const match = raw.match(/[?&]goal=([^&]*)/);
        if (match?.[1]) return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
    }

    return null;
}

export function parseArgs(argv: string[]): ParsedArgs {
    // argv vem como process.argv.slice(2) — só os args reais, sem node + script.
    const out: ParsedArgs = {
        mode: 'repl',
        noAttach: false,
    };

    const positional: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a) continue;

        if (a === '--version' || a === '-v') {
            out.mode = 'version';
            return out;
        }
        if (a === '--help' || a === '-h') {
            out.mode = 'help';
            return out;
        }
        if (a === '--user-data-dir') {
            const v = argv[++i];
            if (v) out.userDataDir = v;
            continue;
        }
        if (a.startsWith('--user-data-dir=')) {
            out.userDataDir = a.slice('--user-data-dir='.length);
            continue;
        }
        if (a === '--no-attach') {
            out.noAttach = true;
            continue;
        }

        // Não é flag conhecida — trata como positional (objetivo).
        positional.push(a);
    }

    if (positional.length > 0) {
        out.mode = 'one-shot';
        out.objetivo = positional.join(' ').trim();
    }

    return out;
}

export const HELP_TEXT = `
LEX Jurídico — CLI

Uso:
  lex                            Inicia sessão interativa (REPL)
  lex "<objetivo>"               Executa o agente uma vez e sai
  lex --version                  Mostra a versão
  lex --help                     Mostra esta ajuda

Opções:
  --user-data-dir <path>         Diretório de dados (default: %APPDATA%/lex-test1)
  --no-attach                    Não tenta attachar a backend existente; sobe um próprio

Exemplos:
  lex "liste os 3 últimos processos do TJSP"
  lex --user-data-dir ./meu-escritorio
`.trimStart();
