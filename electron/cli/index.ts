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
import { runReplSimple } from './repl-simple';
import { runConfigCommand, bootstrapConfig, checkProviderReady } from './config';
import { renderError } from './output';
import * as fs from 'fs';
import * as path from 'path';

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
        // Preflight só no one-shot — no REPL o usuário configura via /provider e /key
        const configError = checkProviderReady();
        if (configError) {
            renderError(configError);
            return 1;
        }
        if (args.scheduleFile) {
            const schedulePath = path.resolve(args.scheduleFile);
            try {
                const payload = JSON.parse(fs.readFileSync(schedulePath, 'utf8')) as { goal?: string };
                const objetivo = String(payload.goal || '').trim();
                if (!objetivo) {
                    renderError(`payload de agendamento sem goal: ${schedulePath}`);
                    return 1;
                }
                return runOneShot({ objetivo, userDataDir });
            } catch (err: any) {
                renderError(`falha ao ler payload do agendamento: ${err?.message || String(err)}`);
                return 1;
            }
        }
        if (!args.objetivo) {
            renderError('objetivo vazio');
            return 1;
        }
        return runOneShot({ objetivo: args.objetivo, userDataDir });
    }

    if (args.simple) {
        return runReplSimple({ userDataDir, inElectron: true });
    }

    return runRepl({ userDataDir, inElectron: args.inElectron });
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        renderError(err?.message || String(err));
        process.exit(1);
    });
