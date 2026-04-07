/**
 * LEX CLI — Entry point
 *
 * Decide o modo de execução com base em process.argv:
 *   lex config <ação> [args]   → subcomando de configuração
 *   lex "objetivo"             → one-shot
 *   lex                        → REPL interativo
 *   lex --version | --help     → info e sai
 *
 * Compartilha userDataDir com o Electron quando rodado no mesmo PC,
 * mantendo brain/sessions/route-memory/selector-memory unificados.
 */

import { parseArgs, parseLexUrl, HELP_TEXT } from './args';
import { resolveUserDataDir } from './user-data';
import { runOneShot } from './one-shot';
import { runRepl } from './repl';
import { runConfigCommand, bootstrapConfig } from './config';
import { renderError } from './output';

function getVersion(): string {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require('../../package.json');
        return pkg?.version || '0.0.0';
    } catch {
        return '0.0.0';
    }
}

async function main(): Promise<number> {
    const rawArgv = process.argv.slice(2);

    // Intercepta URL scheme lex:// — disparado pelo browser quando usuário clica na landing page.
    // O Windows passa o URL como primeiro argumento: node bin/lex.js "lex://run?goal=..."
    if (rawArgv[0] && rawArgv[0].startsWith('lex://')) {
        const goal = parseLexUrl(rawArgv[0]);
        if (goal) {
            const userDataDir = resolveUserDataDir();
            bootstrapConfig(userDataDir);
            return runOneShot({ objetivo: goal, userDataDir });
        }
        renderError(`URL inválido: ${rawArgv[0]}`);
        return 1;
    }

    // Intercepta `lex config ...` antes do parser geral
    // (evita que "config" seja tratado como objetivo do agente)
    if (rawArgv[0] === 'config') {
        const userDataDir = resolveUserDataDir(
            rawArgv.includes('--user-data-dir')
                ? rawArgv[rawArgv.indexOf('--user-data-dir') + 1]
                : undefined,
        );
        const configArgv = rawArgv.slice(1).filter(
            (a, i, arr) => a !== '--user-data-dir' && arr[i - 1] !== '--user-data-dir',
        );
        return runConfigCommand(configArgv, userDataDir);
    }

    const args = parseArgs(rawArgv);

    if (args.mode === 'version') {
        process.stdout.write(`lex ${getVersion()}\n`);
        return 0;
    }

    if (args.mode === 'help') {
        process.stdout.write(HELP_TEXT + '\n');
        return 0;
    }

    const userDataDir = resolveUserDataDir(args.userDataDir);

    // Carrega config de provider (cli-config.json + env vars) antes de subir o backend
    bootstrapConfig(userDataDir);

    if (args.mode === 'one-shot') {
        if (!args.objetivo) {
            renderError('objetivo vazio');
            return 1;
        }
        return runOneShot({ objetivo: args.objetivo, userDataDir });
    }

    return runRepl({ userDataDir });
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        renderError(err?.message || String(err));
        process.exit(1);
    });
