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
    scheduleFile?: string;
    noAttach: boolean;
    inElectron: boolean;
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
        inElectron: process.env['LEX_IN_ELECTRON'] === '1',
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
        if (a === '--schedule-file') {
            const v = argv[++i];
            if (v) {
                out.mode = 'one-shot';
                out.scheduleFile = v;
            }
            continue;
        }
        if (a.startsWith('--schedule-file=')) {
            out.mode = 'one-shot';
            out.scheduleFile = a.slice('--schedule-file='.length);
            continue;
        }
        if (a === '--no-attach') {
            out.noAttach = true;
            continue;
        }
        if (a === '--in-electron') {
            out.inElectron = true;
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
  lex config                     Gerencia provider, modelo e API key
  lex --version                  Mostra a versão
  lex --help                     Mostra esta ajuda

Opções:
  --user-data-dir <path>         Diretório de dados (default: %APPDATA%/lex-test1)
  --no-attach                    Não tenta attachar a backend existente; sobe um próprio

Configuração (primeira vez):
  1. lex config list-providers                    Lista os providers disponíveis
  2. lex config set provider <id>                 Ex: anthropic, openai, groq
  3. lex config set key <id> <sua-chave>          Salva a API key (criptografada)
  4. lex "<objetivo>"                             Pronto para usar

Subcomandos config:
  lex config get                                  Mostra provider/modelo/key atuais
  lex config set provider <id>                    Troca o provider ativo
  lex config set model <id>                       Troca o modelo
  lex config set key <providerId> <apiKey>        Salva a API key
  lex config list-providers                       Lista providers e modelos

Exemplos:
  lex config set provider anthropic
  lex config set key anthropic sk-ant-...
  lex "liste os 3 últimos processos do TJSP"
  lex --user-data-dir ./cliente-silva "consulte o processo 1234567"
`.trimStart();
