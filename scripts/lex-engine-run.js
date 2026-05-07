#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const importedEngine = path.join(root, 'engine', 'lex-engine');
const home = process.env.USERPROFILE || process.env.HOME || '';
const distro = process.env.LEX_ENGINE_WSL_DISTRO || 'Ubuntu';
const externalWindowsEngine = process.env.LEX_ENGINE_WINDOWS_PATH || path.join(home, 'lex_engine');
const externalWslEngine = process.env.LEX_ENGINE_WSL_PATH || `/home/${path.basename(home || 'eder').toLowerCase()}/lex_engine`;
const requestedMode = process.env.LEX_ENGINE_MODE || 'repo-wsl';
const mode = ['external-wsl', 'repo-wsl', 'repo-windows'].includes(requestedMode) ? requestedMode : 'external-wsl';

function windowsPathToWslPath(windowsPath) {
    const normalized = path.resolve(windowsPath).replace(/\\/g, '/');
    const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
    if (!match) return normalized;
    return `/mnt/${match[1].toLowerCase()}/${match[2] || ''}`;
}

function bashQuote(value) {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`;
}

function resolveRuntime() {
    if (mode === 'repo-windows') {
        throw new Error('LEX_ENGINE_MODE=repo-windows ainda nao e runtime suportado. Use external-wsl ou repo-wsl.');
    }

    if (mode === 'repo-wsl') {
        const repoWslEngine = process.env.LEX_ENGINE_REPO_WSL_PATH || windowsPathToWslPath(importedEngine);
        const repoPython = process.env.LEX_ENGINE_REPO_PYTHON || process.env.LEX_ENGINE_WSL_PYTHON || `${externalWslEngine}/venv/bin/python`;
        return {
            windowsPath: importedEngine,
            wslPath: repoWslEngine,
            command: `${bashQuote(repoPython)} hermes`,
        };
    }

    return {
        windowsPath: externalWindowsEngine,
        wslPath: externalWslEngine,
        command: 'hermes',
    };
}

function main() {
    const runtime = resolveRuntime();
    if (!fs.existsSync(runtime.windowsPath)) {
        throw new Error(`Pasta do Engine nao encontrada: ${runtime.windowsPath}`);
    }

    if (process.platform !== 'win32') {
        throw new Error('Este script de desenvolvimento esta preparado para o Desktop Windows chamando WSL.');
    }

    const hermesArgs = process.argv.slice(2).map(bashQuote).join(' ');
    const command = `cd ${bashQuote(runtime.wslPath)} && ${runtime.command}${hermesArgs ? ` ${hermesArgs}` : ''}`;
    const child = spawn('wsl.exe', ['-d', distro, '--', 'bash', '-lc', command], {
        stdio: 'inherit',
        windowsHide: false,
        env: {
            ...process.env,
            LEX_ENGINE_MODE: mode,
        },
    });

    child.on('exit', (code) => process.exit(code || 0));
}

try {
    main();
} catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
}
