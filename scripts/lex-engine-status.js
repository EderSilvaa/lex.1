#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const WSL_TIMEOUT_MS = 20000;
const importedEngine = path.join(root, 'engine', 'lex-engine');
const home = process.env.USERPROFILE || process.env.HOME || '';
const externalWindowsEngine = process.env.LEX_ENGINE_WINDOWS_PATH || path.join(home, 'lex_engine');
const distro = process.env.LEX_ENGINE_WSL_DISTRO || 'Ubuntu';
const externalWslEngine = process.env.LEX_ENGINE_WSL_PATH || `/home/${path.basename(home || 'eder').toLowerCase()}/lex_engine`;
const requestedMode = process.env.LEX_ENGINE_MODE || 'repo-wsl';
const activeMode = ['external-wsl', 'repo-wsl', 'repo-windows'].includes(requestedMode) ? requestedMode : 'external-wsl';

function windowsPathToWslPath(windowsPath) {
    const normalized = path.resolve(windowsPath).replace(/\\/g, '/');
    const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
    if (!match) return normalized;
    return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

const repoWslEngine = process.env.LEX_ENGINE_REPO_WSL_PATH || windowsPathToWslPath(importedEngine);
const activeWindowsEngine = activeMode === 'external-wsl' ? externalWindowsEngine : importedEngine;
const activeWslEngine = activeMode === 'external-wsl' ? externalWslEngine : repoWslEngine;
const repoPython = process.env.LEX_ENGINE_REPO_PYTHON || process.env.LEX_ENGINE_WSL_PYTHON || `${externalWslEngine}/venv/bin/python`;
const activeCommand = activeMode === 'repo-wsl' ? `${repoPython} hermes` : 'hermes';

function exists(target) {
    try {
        return fs.existsSync(target);
    } catch {
        return false;
    }
}

function run(file, args, timeout = 5000) {
    try {
        return {
            ok: true,
            output: execFileSync(file, args, {
                encoding: 'utf8',
                timeout,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            }).trim(),
        };
    } catch (err) {
        return {
            ok: false,
            output: String(err.stderr || err.message || err).trim(),
        };
    }
}

function print(label, ok, value) {
    const mark = ok ? 'OK ' : 'ERR';
    console.log(`${mark} ${label}${value ? `: ${value}` : ''}`);
}

console.log('Lex Engine status');
console.log('');

print('Repo engine', exists(importedEngine), importedEngine);
print('Repo engine manifest', exists(path.join(importedEngine, 'LEX_ENGINE_IMPORT.md')), 'engine/lex-engine/LEX_ENGINE_IMPORT.md');
print('External Windows engine', exists(externalWindowsEngine), externalWindowsEngine);
print('Active mode', activeMode !== 'repo-windows', activeMode);
print('Active Windows engine', exists(activeWindowsEngine), activeWindowsEngine);

if (process.platform === 'win32') {
    const wslEcho = run('wsl.exe', ['-d', distro, '--', 'echo', 'WSL_OK'], WSL_TIMEOUT_MS);
    print(`WSL distro ${distro}`, wslEcho.ok && wslEcho.output.includes('WSL_OK'), wslEcho.ok ? 'available' : wslEcho.output);

    const wslPath = run('wsl.exe', ['-d', distro, '--', 'test', '-d', externalWslEngine], WSL_TIMEOUT_MS);
    print('External WSL engine', wslPath.ok, externalWslEngine);

    const repoWslPath = run('wsl.exe', ['-d', distro, '--', 'test', '-d', repoWslEngine], WSL_TIMEOUT_MS);
    print('Repo WSL engine', repoWslPath.ok, repoWslEngine);

    const activeWslPath = run('wsl.exe', ['-d', distro, '--', 'test', '-d', activeWslEngine], WSL_TIMEOUT_MS);
    print('Active WSL engine', activeMode !== 'repo-windows' && activeWslPath.ok, activeMode === 'repo-windows' ? 'repo-windows ainda nao e runtime suportado' : activeWslEngine);

    const hermes = run('wsl.exe', ['-d', distro, '--', 'bash', '-lc', 'command -v hermes'], WSL_TIMEOUT_MS);
    print('Engine command', hermes.ok && Boolean(hermes.output), hermes.output || 'hermes not found');

    if (activeMode === 'repo-wsl') {
        const repoLauncher = run('wsl.exe', ['-d', distro, '--', 'bash', '-lc', `cd "${activeWslEngine}" && "${repoPython}" hermes version`], WSL_TIMEOUT_MS);
        print('Repo launcher', repoLauncher.ok, repoLauncher.output);
    }
} else {
    const hermes = run('bash', ['-lc', 'command -v hermes'], 5000);
    print('Engine command', hermes.ok && Boolean(hermes.output), hermes.output || 'hermes not found');
}

console.log('');
console.log(`Active default mode: ${activeMode}`);
console.log(`Active command: ${activeCommand}`);
