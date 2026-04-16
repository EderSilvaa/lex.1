#!/usr/bin/env node
/**
 * LEX MCP dependencies setup.
 *
 * Instala as dependências Python necessárias para os MCP servers built-in:
 *   - uv (gerenciador Python moderno)
 *   - browser-use (CLI com modo `--mcp` como stdio server)
 *
 * Executado como postinstall. Idempotente: silencia se já instalados.
 * Falha soft — não trava a instalação se Python não existir; só loga aviso.
 *
 * O caminho absoluto do browser-use.exe é gravado em `~/.lex/mcp.example.json`
 * pois ele raramente está no PATH após `pip install --user`.
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';

function log(msg) { console.log(`[LEX Setup] ${msg}`); }
function warn(msg) { console.warn(`[LEX Setup] ${msg}`); }

// shell:true no Windows mangle `-c "python code"` com aspas. Resolver cmd.exe via PATHEXT
// chamando spawnSync direto (sem shell).
function resolveWinCmd(cmd) {
    if (!IS_WIN) return cmd;
    // Procura cmd.exe / cmd.cmd / cmd.bat no PATH
    const exts = ['.exe', '.cmd', '.bat', ''];
    const dirs = (process.env['PATH'] || '').split(path.delimiter);
    for (const dir of dirs) {
        for (const ext of exts) {
            const full = path.join(dir, cmd + ext);
            try { if (fs.existsSync(full)) return full; } catch { /* ignore */ }
        }
    }
    return cmd;
}

function hasCmd(cmd, args = ['--version']) {
    try {
        const r = spawnSync(resolveWinCmd(cmd), args, { stdio: 'ignore' });
        return r.status === 0;
    } catch { return false; }
}

function runCapture(cmd, args) {
    const r = spawnSync(resolveWinCmd(cmd), args, { encoding: 'utf8' });
    return { status: r.status ?? -1, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function findPython() {
    for (const c of ['python', 'python3', 'py']) {
        if (hasCmd(c, ['--version'])) return c;
    }
    return null;
}

function getPythonUserBase(py) {
    const r = runCapture(py, ['-c', 'import site; print(site.USER_BASE)']);
    return r.status === 0 ? r.stdout : null;
}

function getPythonVersion(py) {
    const r = runCapture(py, ['-c', 'import sys; print(sys.version_info.major, sys.version_info.minor)']);
    if (r.status !== 0) return null;
    const parts = r.stdout.split(/\s+/);
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
}

function scriptsDirFor(userBase, pyVer) {
    // Windows:  <USER_BASE>\Python<MajorMinor>\Scripts
    // POSIX:    <USER_BASE>/bin
    if (!IS_WIN) return path.join(userBase, 'bin');
    const majMin = (pyVer || '').replace('.', '');
    return path.join(userBase, `Python${majMin}`, 'Scripts');
}

function pipInstallUser(py, packages) {
    log(`pip install --user ${packages.join(' ')}…`);
    const r = spawnSync(resolveWinCmd(py), ['-m', 'pip', 'install', '--user', '--quiet', ...packages], {
        stdio: 'inherit',
    });
    return r.status === 0;
}

function ensureExampleConfig(browserUseExe) {
    const dir = path.join(os.homedir(), '.lex');
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    const examplePath = path.join(dir, 'mcp.example.json');
    const example = {
        mcpServers: {
            filesystem: {
                command: 'npx',
                args: [
                    '-y', '@modelcontextprotocol/server-filesystem',
                    path.join(os.homedir(), 'Documents'),
                    path.join(os.homedir(), 'Downloads'),
                    path.join(os.homedir(), 'Desktop'),
                    os.homedir(),
                ],
            },
            browser: {
                command: browserUseExe || `browser-use${EXE}`,
                args: ['--mcp', '--cdp-url', 'http://localhost:19222'],
            },
        },
    };
    fs.writeFileSync(examplePath, JSON.stringify(example, null, 2), 'utf8');
    log(`mcp.example.json atualizado: ${examplePath}`);
}

(function main() {
    const py = findPython();
    if (!py) {
        warn('Python não encontrado no PATH. Pule browser-use MCP ou instale Python 3.10+.');
        ensureExampleConfig(null);
        return;
    }
    log(`Python: ${py}`);

    const userBase = getPythonUserBase(py);
    const pyVer = getPythonVersion(py);
    const scriptsDir = userBase ? scriptsDirFor(userBase, pyVer) : null;

    // Se browser-use.exe já existe, pula instalação (idempotente).
    const browserUseExe = scriptsDir ? path.join(scriptsDir, `browser-use${EXE}`) : null;
    const uvExe = scriptsDir ? path.join(scriptsDir, `uv${EXE}`) : null;
    const alreadyHaveBrowser = browserUseExe && fs.existsSync(browserUseExe);
    const alreadyHaveUv = uvExe && fs.existsSync(uvExe);

    const need = [];
    if (!alreadyHaveUv) need.push('uv');
    if (!alreadyHaveBrowser) need.push('browser-use');

    if (need.length === 0) {
        log('uv + browser-use já instalados. Nada a fazer.');
    } else {
        const ok = pipInstallUser(py, need);
        if (!ok) {
            warn(`Falha ao instalar ${need.join(', ')}. MCP browser-use indisponível até resolver manualmente.`);
        }
    }

    ensureExampleConfig(browserUseExe && fs.existsSync(browserUseExe) ? browserUseExe : null);
})();
