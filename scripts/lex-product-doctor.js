#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const WSL_TIMEOUT_MS = 20000;
const importedEngine = path.join(root, 'engine', 'lex-engine');
const home = process.env.USERPROFILE || process.env.HOME || '';
const externalWindowsEngine = process.env.LEX_ENGINE_WINDOWS_PATH || path.join(home, 'lex_engine');
const distro = process.env.LEX_ENGINE_WSL_DISTRO || 'Ubuntu';
const externalWslEngine = process.env.LEX_ENGINE_WSL_PATH || `/home/${path.basename(home || 'eder').toLowerCase()}/lex_engine`;
const bridgeUrl = process.env.LEX_DESKTOP_BRIDGE_URL || 'http://127.0.0.1:32179/health';
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

const checks = [];

function add(name, status, detail, next) {
    checks.push({ name, status, detail: detail || '', next: next || '' });
}

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

function readJson(url, timeout = 4000) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                try {
                    resolve({ ok: true, statusCode: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
                } catch (err) {
                    resolve({ ok: false, statusCode: res.statusCode, error: err.message });
                }
            });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, error: 'timeout' });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message }));
    });
}

function statusLabel(status) {
    if (status === 'ok') return 'OK ';
    if (status === 'warn') return 'WARN';
    return 'ERR';
}

async function main() {
    add('Node', 'ok', process.version);

    const npm = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], 5000);
    add('npm', npm.ok ? 'ok' : 'error', npm.output, npm.ok ? '' : 'Instale Node/npm ou verifique o PATH.');

    add('Desktop package', exists(path.join(root, 'package.json')) ? 'ok' : 'error', root);
    add('Imported Engine', exists(importedEngine) ? 'ok' : 'warn', importedEngine, 'Importe o Engine em engine/lex-engine.');
    add(
        'Engine import manifest',
        exists(path.join(importedEngine, 'LEX_ENGINE_IMPORT.md')) ? 'ok' : 'warn',
        'engine/lex-engine/LEX_ENGINE_IMPORT.md',
        'Crie o manifesto da importacao.',
    );
    add('External Windows Engine', exists(externalWindowsEngine) ? 'ok' : 'warn', externalWindowsEngine);
    add('Active Engine mode', activeMode === 'repo-windows' ? 'warn' : 'ok', activeMode, 'Use external-wsl ou repo-wsl nesta sprint.');
    add('Active Windows Engine', exists(activeWindowsEngine) ? 'ok' : 'error', activeWindowsEngine, 'Verifique LEX_ENGINE_MODE/LEX_ENGINE_REPO_PATH.');

    if (process.platform === 'win32') {
        const wslEcho = run('wsl.exe', ['-d', distro, '--', 'echo', 'WSL_OK'], WSL_TIMEOUT_MS);
        add(`WSL ${distro}`, wslEcho.ok && wslEcho.output.includes('WSL_OK') ? 'ok' : 'error', wslEcho.ok ? 'available' : wslEcho.output, 'Abra/instale o Ubuntu WSL.');

        const wslPath = run('wsl.exe', ['-d', distro, '--', 'test', '-d', externalWslEngine], WSL_TIMEOUT_MS);
        add('External WSL Engine', wslPath.ok ? 'ok' : 'error', externalWslEngine, 'Mantenha /home/eder/lex_engine como fallback.');

        const repoWslPath = run('wsl.exe', ['-d', distro, '--', 'test', '-d', repoWslEngine], WSL_TIMEOUT_MS);
        add('Repo WSL Engine', repoWslPath.ok ? 'ok' : 'warn', repoWslEngine, 'O Engine importado precisa estar acessivel pelo WSL.');

        const activeWslPath = run('wsl.exe', ['-d', distro, '--', 'test', '-d', activeWslEngine], WSL_TIMEOUT_MS);
        add('Active WSL Engine', activeMode !== 'repo-windows' && activeWslPath.ok ? 'ok' : 'error', activeMode === 'repo-windows' ? 'repo-windows nao suportado ainda' : activeWslEngine, 'Use external-wsl ou repo-wsl.');

        const hermes = run('wsl.exe', ['-d', distro, '--', 'bash', '-lc', 'command -v hermes'], WSL_TIMEOUT_MS);
        add('Engine command', hermes.ok && Boolean(hermes.output) ? 'ok' : 'error', hermes.output || 'hermes not found', 'Rode o setup do Lex Engine no WSL.');

        if (activeMode === 'repo-wsl') {
            const repoLauncher = run('wsl.exe', ['-d', distro, '--', 'bash', '-lc', `cd "${activeWslEngine}" && "${repoPython}" hermes version`], WSL_TIMEOUT_MS);
            add('Repo launcher', repoLauncher.ok ? 'ok' : 'error', repoLauncher.output, 'Configure LEX_ENGINE_REPO_PYTHON ou rode o setup do Engine importado.');
        }
    } else {
        const hermes = run('bash', ['-lc', 'command -v hermes'], 5000);
        add('Engine command', hermes.ok && Boolean(hermes.output) ? 'ok' : 'error', hermes.output || 'hermes not found');
    }

    const health = await readJson(bridgeUrl);
    if (health.ok && health.data && health.data.ok) {
        const engineOk = health.data.engine && health.data.engine.ok;
        add('Desktop bridge', 'ok', health.data.bridge ? health.data.bridge.url : bridgeUrl);
        add('Engine source', 'ok', health.data.engine?.engineMode || 'external-wsl');
        add('Runtime Engine', engineOk ? 'ok' : 'warn', health.data.engine ? (health.data.engine.wsl?.projectPath || health.data.engine.windowsPath || '') : '', 'Abra o Lex Desktop ou verifique Motor.');
    } else {
        add('Desktop bridge', 'warn', health.error || `HTTP ${health.statusCode || 'unknown'}`, 'Abra o Lex Desktop para iniciar a bridge.');
    }

    console.log('Lex product doctor');
    console.log('');
    for (const check of checks) {
        const line = `${statusLabel(check.status)} ${check.name}${check.detail ? `: ${check.detail}` : ''}`;
        console.log(line);
        if (check.status !== 'ok' && check.next) console.log(`     next: ${check.next}`);
    }

    const errors = checks.filter((check) => check.status === 'error').length;
    const warnings = checks.filter((check) => check.status === 'warn').length;
    console.log('');
    console.log(`Summary: ${errors} error(s), ${warnings} warning(s)`);
    process.exit(errors ? 1 : 0);
}

main().catch((err) => {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
});
