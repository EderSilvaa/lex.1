/**
 * CLI — Resolução de userDataDir
 *
 * Ordem de prioridade:
 *  1. Flag --user-data-dir
 *  2. Env var LEX_USER_DATA
 *  3. APPDATA/lex-test1 (Windows) — mesmo path do Electron, compartilha brain/sessions
 *  4. ~/.lex (cross-platform fallback)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export function resolveUserDataDir(flagValue?: string): string {
    const candidate =
        flagValue?.trim() ||
        process.env['LEX_USER_DATA']?.trim() ||
        defaultUserDataDir();

    try {
        fs.mkdirSync(candidate, { recursive: true });
    } catch {
        /* tolerante: erro de criação será reportado quando algo tentar escrever */
    }
    return candidate;
}

function defaultUserDataDir(): string {
    if (process.platform === 'win32') {
        const appData = process.env['APPDATA'];
        if (appData) {
            return path.join(appData, 'lex-test1');
        }
    }
    return path.join(os.homedir(), '.lex');
}
