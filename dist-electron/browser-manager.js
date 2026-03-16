"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUserDataDir = setUserDataDir;
exports.initBrowser = initBrowser;
exports.reInitBrowser = reInitBrowser;
exports.getBrowserContext = getBrowserContext;
exports.getActivePage = getActivePage;
exports.ensureBrowser = ensureBrowser;
exports.injectOverlay = injectOverlay;
exports.showCursorAt = showCursorAt;
exports.runBrowserTask = runBrowserTask;
exports.closeBrowser = closeBrowser;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const child_process_1 = require("child_process");
const playwright_core_1 = require("playwright-core");
// Porta 9222 é interceptada pelo Comet/Perplexity — usar porta alternativa
const CDP_PORT = 19222;
// ── userDataDir injetado pelo main.ts (ou backend) — sem dependência do Electron ──
let _userDataDir = null;
/** Deve ser chamado uma vez no boot (main.ts ou backend/server.ts) */
function setUserDataDir(dir) {
    _userDataDir = dir;
}
function getUserDataDir() {
    if (!_userDataDir)
        throw new Error('[Browser] userDataDir não configurado — chame setUserDataDir() antes de initBrowser()');
    return _userDataDir;
}
/** Detecta se estamos rodando dentro do Electron (vs Node.js puro no backend) */
function isElectronProcess() {
    return !!process.versions.electron;
}
/** Cria env limpo para child Chromium — remove variáveis do Electron que causam crash */
function cleanEnvForChromium() {
    const env = Object.assign({}, process.env);
    // CHROME_CRASHPAD_PIPE_NAME faz child Chromium tentar usar o crash handler do Electron → STATUS_BREAKPOINT
    delete env['CHROME_CRASHPAD_PIPE_NAME'];
    delete env['ELECTRON_RUN_AS_NODE'];
    delete env['ELECTRON_NO_ATTACH_CONSOLE'];
    // Remove qualquer variável CRASHPAD/BREAKPAD que possa interferir
    for (const key of Object.keys(env)) {
        if (key.startsWith('CRASHPAD_') || key.startsWith('BREAKPAD_'))
            delete env[key];
    }
    return env;
}
// ─────────────────────────────────────────────────────────────────────────────
// CDP Bridge: Node.js subprocess que spawna Chrome + faz proxy do WebSocket CDP
// Chrome é spawnado DENTRO do bridge (Node.js puro) para evitar herança de
// handles/Job Objects do Electron que causam STATUS_BREAKPOINT no Windows
// ─────────────────────────────────────────────────────────────────────────────
const CDP_BRIDGE_CODE = `'use strict';
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROXY_ONLY = process.argv[2] === 'PROXY_ONLY';
const CHROME_PATH = PROXY_ONLY ? null : process.argv[2];
const USER_DATA_DIR = PROXY_ONLY ? null : process.argv[3];
const CDP_PORT = parseInt(process.argv[PROXY_ONLY ? 3 : 4]);
let BRIDGE_PORT = 0;

// ── Spawn Chrome de dentro do Node.js (não do Electron) ──
let chromeProc = null;
const chromeArgs = [
  '--user-data-dir=' + USER_DATA_DIR,
  '--remote-debugging-port=' + CDP_PORT,
  '--remote-debugging-address=127.0.0.1',
  '--remote-allow-origins=*',
  '--no-first-run', '--no-default-browser-check',
  '--no-sandbox', '--disable-setuid-sandbox',
  '--disable-extensions', '--disable-gpu',
  '--disable-crash-reporter', '--disable-breakpad',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=RendererCodeIntegrity,ChromeWhatsNewUI,Translate',
  'about:blank',
];

if (!PROXY_ONLY && CHROME_PATH && USER_DATA_DIR) {
  chromeProc = spawn(CHROME_PATH, chromeArgs, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  chromeProc.unref();

  if (chromeProc.pid) {
    fs.writeFileSync(path.join(USER_DATA_DIR, 'chrome.pid'), String(chromeProc.pid));
    process.stderr.write('CHROME_PID:' + chromeProc.pid + '\\n');
  }

  chromeProc.stderr.on('data', d => {
    process.stderr.write('[Chrome] ' + d.toString().trim().slice(0, 300) + '\\n');
  });

  chromeProc.on('exit', code => {
    process.stderr.write('CHROME_EXIT:' + code + '\\n');
  });
}

// ── Wait for Chrome CDP to be ready ──
function waitForChrome(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (Date.now() > deadline) return reject(new Error('Chrome timeout'));
      if (chromeProc && chromeProc.exitCode !== null) return reject(new Error('Chrome crashed: ' + chromeProc.exitCode));
      const req = http.get('http://127.0.0.1:' + port + '/json/version', res => {
        if (res.statusCode === 200) resolve();
        else setTimeout(check, 400);
        res.resume();
      });
      req.on('error', () => setTimeout(check, 400));
      req.setTimeout(1000, () => { req.destroy(); setTimeout(check, 400); });
    };
    check();
  });
}

// ── HTTP + WebSocket proxy ──
const server = http.createServer((req, res) => {
  const opts = { hostname: '127.0.0.1', port: CDP_PORT, path: req.url, method: req.method, headers: req.headers };
  const proxy = http.request(opts, pRes => {
    const ct = pRes.headers['content-type'] || '';
    if (ct.includes('json')) {
      let body = '';
      pRes.on('data', c => body += c);
      pRes.on('end', () => {
        body = body.replace(new RegExp('127\\\\.0\\\\.0\\\\.1:' + CDP_PORT, 'g'), '127.0.0.1:' + BRIDGE_PORT);
        const h = Object.assign({}, pRes.headers);
        h['content-length'] = String(Buffer.byteLength(body));
        res.writeHead(pRes.statusCode, h);
        res.end(body);
      });
    } else {
      res.writeHead(pRes.statusCode, pRes.headers);
      pRes.pipe(res);
    }
  });
  proxy.on('error', e => { res.writeHead(502); res.end(e.message); });
  req.pipe(proxy);
});

const wss = new WebSocket.Server({ server });
wss.on('connection', (client, req) => {
  const target = 'ws://127.0.0.1:' + CDP_PORT + req.url;
  const chrome = new WebSocket(target, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  const buf = [];
  client.on('message', d => chrome.readyState === 1 ? chrome.send(d) : buf.push(d));
  chrome.on('open', () => { buf.forEach(m => chrome.send(m)); buf.length = 0; });
  chrome.on('message', d => { if (client.readyState === 1) client.send(d); });
  const cleanup = () => { try { chrome.close(); } catch {} try { client.close(); } catch {} };
  chrome.on('close', cleanup); client.on('close', cleanup);
  chrome.on('error', cleanup); client.on('error', cleanup);
});

async function main() {
  await waitForChrome(CDP_PORT, 20000);
  // Estabilização: aguarda renderer/GPU iniciarem
  await new Promise(r => setTimeout(r, 2000));
  if (chromeProc && chromeProc.exitCode !== null) {
    process.stderr.write('CHROME_CRASHED_AFTER_READY:' + chromeProc.exitCode + '\\n');
    process.exit(1);
  }
  server.listen(0, '127.0.0.1', () => {
    BRIDGE_PORT = server.address().port;
    process.stdout.write('BRIDGE:' + BRIDGE_PORT + '\\n');
  });
}

main().catch(err => {
  process.stderr.write('BRIDGE_ERROR:' + err.message + '\\n');
  process.exit(1);
});

process.on('SIGTERM', () => { try { chromeProc.kill(); } catch {} process.exit(0); });
process.on('disconnect', () => { try { chromeProc.kill(); } catch {} process.exit(0); });
`;
let bridgeProc = null;
let bridgePort = null;
/** Inicia o CDP bridge + Chrome como processo Node.js separado (não Electron)
 *  Chrome é spawnado DENTRO do bridge para evitar herança de handles do Electron */
function startCdpBridge(chromePath, userDataDir, cdpPort) {
    return __awaiter(this, void 0, void 0, function* () {
        // Mata bridge anterior
        if (bridgeProc && !bridgeProc.killed) {
            try {
                bridgeProc.kill();
            }
            catch ( /* ok */_a) { /* ok */ }
            bridgeProc = null;
            bridgePort = null;
        }
        // Escreve o script do bridge no diretório do código compilado
        const bridgePath = path_1.default.join(__dirname, 'cdp-bridge.js');
        fs_1.default.writeFileSync(bridgePath, CDP_BRIDGE_CODE);
        return new Promise((resolve, reject) => {
            var _a, _b;
            // Bridge recebe: chromePath, userDataDir, cdpPort (ou 'PROXY_ONLY', cdpPort)
            const bridgeArgs = chromePath === 'PROXY_ONLY'
                ? [bridgePath, 'PROXY_ONLY', String(cdpPort)]
                : [bridgePath, chromePath, userDataDir, String(cdpPort)];
            bridgeProc = (0, child_process_1.spawn)('node', bridgeArgs, {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: cleanEnvForChromium(), // env limpo sem CHROME_CRASHPAD_PIPE_NAME etc.
            });
            let output = '';
            let resolved = false;
            (_a = bridgeProc.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (chunk) => {
                output += chunk.toString();
                const match = output.match(/BRIDGE:(\d+)/);
                if (match && !resolved) {
                    resolved = true;
                    bridgePort = parseInt(match[1]);
                    console.log('[CDP Bridge] Pronto na porta', bridgePort);
                    resolve(bridgePort);
                }
            });
            (_b = bridgeProc.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (d) => {
                const line = d.toString().trim();
                if (line.startsWith('CHROME_PID:')) {
                    const pid = parseInt(line.split(':')[1]);
                    console.log('[Browser] Chromium PID:', pid, '(via bridge)');
                    // Salva PID para killPreviousChrome
                    try {
                        fs_1.default.writeFileSync(path_1.default.join(userDataDir, 'chrome.pid'), String(pid));
                    }
                    catch (_a) { }
                }
                else if (line.startsWith('CHROME_EXIT:')) {
                    console.warn('[Browser] Chromium saiu com código:', line.split(':')[1]);
                }
                else if (line) {
                    console.log('[CDP Bridge]', line.slice(0, 300));
                }
            });
            bridgeProc.on('exit', code => {
                console.warn('[CDP Bridge] Saiu com código:', code);
                if (!resolved)
                    reject(new Error(`Bridge saiu com código ${code}`));
                bridgeProc = null;
                bridgePort = null;
            });
            setTimeout(() => { if (!resolved)
                reject(new Error('CDP bridge timeout (30s)')); }, 30000);
        });
    });
}
/** Spawna Chrome + proxy via bridge Node.js e conecta Playwright */
function connectViaBridge(chromePath, userDataDir, cdpPort) {
    return __awaiter(this, void 0, void 0, function* () {
        const port = yield startCdpBridge(chromePath, userDataDir, cdpPort);
        return playwright_core_1.chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    });
}
/** Proxy-only bridge (Chrome já está rodando) */
function connectViaBridgeProxyOnly(cdpPort) {
    return __awaiter(this, void 0, void 0, function* () {
        const port = yield startCdpBridge('PROXY_ONLY', '', cdpPort);
        return playwright_core_1.chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    });
}
/** Launch direto: spawna Chrome sem bridge (para backend Node.js puro — sem env vars do Electron) */
function launchDirectCDP(chromePath, userDataDir, cdpPort) {
    return __awaiter(this, void 0, void 0, function* () {
        const chromeArgs = [
            `--user-data-dir=${userDataDir}`,
            `--remote-debugging-port=${cdpPort}`,
            '--remote-debugging-address=127.0.0.1',
            '--remote-allow-origins=*',
            '--no-first-run', '--no-default-browser-check',
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-extensions', '--disable-gpu',
            '--disable-crash-reporter', '--disable-breakpad',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=RendererCodeIntegrity,ChromeWhatsNewUI,Translate',
            'about:blank',
        ];
        const proc = (0, child_process_1.spawn)(chromePath, chromeArgs, {
            detached: true,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        proc.unref();
        if (proc.pid) {
            fs_1.default.writeFileSync(path_1.default.join(userDataDir, 'chrome.pid'), String(proc.pid));
            console.log('[Browser] Chrome PID:', proc.pid, '(launch direto)');
        }
        proc.on('exit', code => console.warn('[Browser] Chrome saiu:', code));
        // Espera Chrome ficar pronto no CDP
        yield new Promise((resolve, reject) => {
            const deadline = Date.now() + 20000;
            const check = () => {
                if (Date.now() > deadline)
                    return reject(new Error('Chrome timeout'));
                if (proc.exitCode !== null)
                    return reject(new Error(`Chrome crashed: ${proc.exitCode}`));
                const req = http_1.default.get(`http://127.0.0.1:${cdpPort}/json/version`, res => {
                    res.statusCode === 200 ? resolve() : setTimeout(check, 400);
                    res.resume();
                });
                req.on('error', () => setTimeout(check, 400));
                req.setTimeout(1000, () => { req.destroy(); setTimeout(check, 400); });
            };
            check();
        });
        // Estabilização
        yield new Promise(r => setTimeout(r, 1500));
        return playwright_core_1.chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    });
}
/** Conecta ao Chrome rodando via CDP (direto, sem bridge) */
function connectDirectCDP(cdpPort) {
    return __awaiter(this, void 0, void 0, function* () {
        return playwright_core_1.chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    });
}
// Chromium do Playwright (sem singleton issues do Google Chrome)
// Fallback para caminhos conhecidos se chromium.executablePath() não existir
function findPlaywrightChromium() {
    var _a;
    const primary = playwright_core_1.chromium.executablePath();
    if (fs_1.default.existsSync(primary))
        return primary;
    const msBase = path_1.default.join((_a = process.env['LOCALAPPDATA']) !== null && _a !== void 0 ? _a : '', 'ms-playwright');
    if (!fs_1.default.existsSync(msBase))
        return undefined;
    const dirs = fs_1.default.readdirSync(msBase)
        .filter(d => d.startsWith('chromium-'))
        .sort()
        .reverse();
    for (const dir of dirs) {
        for (const sub of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
            const p = path_1.default.join(msBase, dir, sub);
            if (fs_1.default.existsSync(p))
                return p;
        }
    }
    return undefined;
}
let cdpBrowser = null;
let context = null;
let chromeProc = null;
let initPromise = null;
let heartbeatTimer = null;
function initBrowser() {
    return __awaiter(this, void 0, void 0, function* () {
        if (initPromise)
            return initPromise;
        initPromise = _doInit().finally(() => { initPromise = null; });
        return initPromise;
    });
}
function reInitBrowser() {
    return __awaiter(this, void 0, void 0, function* () {
        yield closeBrowser();
        yield initBrowser();
    });
}
function _doInit() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const userDataDir = path_1.default.join(getUserDataDir(), 'chrome-profile');
        fs_1.default.mkdirSync(userDataDir, { recursive: true });
        const useDirectLaunch = !isElectronProcess();
        // ── 1. Tenta reconectar SOMENTE se temos um chrome.pid próprio vivo ──
        // (evita conectar ao Comet/Perplexity ou outro Chrome de terceiros na porta)
        const ownChromeUp = yield isOwnChromeUp(userDataDir);
        if (ownChromeUp) {
            console.log('[Browser] Chrome próprio já rodando na porta', CDP_PORT, '— reconectando...');
            cdpBrowser = useDirectLaunch
                ? yield connectDirectCDP(CDP_PORT)
                : yield connectViaBridgeProxyOnly(CDP_PORT);
            const contexts = cdpBrowser.contexts();
            context = (_a = contexts[0]) !== null && _a !== void 0 ? _a : yield cdpBrowser.newContext();
            if (context.pages().length === 0)
                yield context.newPage();
            console.log('[Browser] Reconectado ao Chrome existente');
            startHeartbeat();
            return;
        }
        // ── 2. Prefere Google Chrome do sistema (sem banner "Chrome for Testing") ────
        try {
            yield launchWithGoogleChrome(userDataDir);
            return;
        }
        catch (e) {
            console.log('[Browser] Google Chrome não disponível:', e.message);
        }
        // ── 3. Fallback: Playwright Chromium (mostra banner "Chrome for Testing") ────
        const executablePath = findPlaywrightChromium();
        if (executablePath) {
            console.log('[Browser] Usando Playwright Chromium (fallback):', executablePath);
            yield launchWithPlaywright(userDataDir, executablePath);
            return;
        }
        throw new Error('Chrome/Chromium não encontrado — instale Google Chrome ou execute: npx playwright install chromium');
    });
}
// No backend (Node.js puro): Chrome spawna direto — sem bridge.
// No Electron: usa bridge para evitar herança de handles/Job Objects.
function launchWithPlaywright(userDataDir, executablePath) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        yield killPreviousChrome(userDataDir);
        for (const lockFile of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile', 'LOCK']) {
            for (const dir of [userDataDir, path_1.default.join(userDataDir, 'Default')]) {
                try {
                    fs_1.default.unlinkSync(path_1.default.join(dir, lockFile));
                }
                catch ( /* ok */_b) { /* ok */ }
            }
        }
        yield new Promise(r => setTimeout(r, 1000));
        if (isElectronProcess()) {
            console.log('[Browser] Launching Chromium via CDP bridge (Electron)...');
            cdpBrowser = yield connectViaBridge(executablePath, userDataDir, CDP_PORT);
        }
        else {
            console.log('[Browser] Launching Chromium direto (Node.js puro)...');
            cdpBrowser = yield launchDirectCDP(executablePath, userDataDir, CDP_PORT);
        }
        const contexts = cdpBrowser.contexts();
        context = (_a = contexts[0]) !== null && _a !== void 0 ? _a : yield cdpBrowser.newContext();
        yield context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        if (context.pages().length === 0)
            yield context.newPage();
        console.log('[Browser] Playwright Chromium conectado');
        startHeartbeat();
    });
}
function launchWithGoogleChrome(userDataDir) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        yield killPreviousChrome(userDataDir);
        for (const lockFile of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile', 'LOCK']) {
            for (const dir of [userDataDir, path_1.default.join(userDataDir, 'Default')]) {
                try {
                    fs_1.default.unlinkSync(path_1.default.join(dir, lockFile));
                }
                catch ( /* ok */_b) { /* ok */ }
            }
        }
        yield new Promise(r => setTimeout(r, 1500));
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
        ];
        const executablePath = chromePaths.find(p => { try {
            fs_1.default.accessSync(p);
            return true;
        }
        catch (_a) {
            return false;
        } });
        if (!executablePath)
            throw new Error('Chrome/Chromium não encontrado — instale Google Chrome ou execute: npx playwright install chromium');
        if (isElectronProcess()) {
            console.log('[Browser] Launching Google Chrome via CDP bridge (Electron)...', executablePath);
            cdpBrowser = yield connectViaBridge(executablePath, userDataDir, CDP_PORT);
        }
        else {
            console.log('[Browser] Launching Google Chrome direto (Node.js puro)...', executablePath);
            cdpBrowser = yield launchDirectCDP(executablePath, userDataDir, CDP_PORT);
        }
        const contexts = cdpBrowser.contexts();
        context = (_a = contexts[0]) !== null && _a !== void 0 ? _a : yield cdpBrowser.newContext();
        yield context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        if (context.pages().length === 0)
            yield context.newPage();
        console.log('[Browser] Google Chrome conectado via CDP bridge');
        startHeartbeat();
    });
}
/** Verifica se o Chrome que lançamos (via chrome.pid) ainda está vivo e respondendo no CDP_PORT */
function isOwnChromeUp(userDataDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const pidFile = path_1.default.join(userDataDir, 'chrome.pid');
        try {
            if (!fs_1.default.existsSync(pidFile))
                return false;
            const pid = parseInt(fs_1.default.readFileSync(pidFile, 'utf8').trim(), 10);
            if (!pid || isNaN(pid))
                return false;
            // Verifica se o processo ainda existe
            try {
                process.kill(pid, 0);
            }
            catch (_a) {
                return false;
            }
            // Verifica se responde no CDP
            yield new Promise((resolve, reject) => {
                const req = http_1.default.get(`http://127.0.0.1:${CDP_PORT}/json/version`, res => {
                    res.statusCode === 200 ? resolve() : reject();
                    res.resume();
                });
                req.on('error', reject);
                req.setTimeout(1000, () => { req.destroy(); reject(); });
            });
            return true;
        }
        catch (_b) {
            return false;
        }
    });
}
function getBrowserContext() {
    if (!context)
        throw new Error('[Browser] Não inicializado — chame initBrowser() primeiro');
    return context;
}
/** Retorna a Page ativa (primeira aba aberta) */
function getActivePage() {
    var _a;
    if (!context)
        return null;
    const pages = context.pages();
    return (_a = pages[0]) !== null && _a !== void 0 ? _a : null;
}
/** Garante que o browser está inicializado e a conexão está viva.
 *  Auto-recupera se o Chrome morreu ou a conexão CDP caiu. */
function ensureBrowser() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!context) {
            console.log('[Browser] Não estava inicializado — inicializando agora...');
            yield initBrowser();
            return;
        }
        // Health check: tenta acessar as pages — se a conexão morreu, lança
        try {
            const pages = context.pages();
            // Testa se a conexão CDP está realmente viva (não só o objeto JS)
            if (pages.length > 0) {
                yield pages[0].evaluate(() => true);
            }
            else {
                yield context.newPage();
            }
        }
        catch (e) {
            console.warn('[Browser] Conexão morta detectada — reinicializando...', e.message);
            // Limpa estado stale
            context = null;
            cdpBrowser = null;
            yield initBrowser();
        }
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Overlay visual no Chrome
// ─────────────────────────────────────────────────────────────────────────────
const OVERLAY_CSS = `
  position:fixed;top:16px;right:16px;z-index:2147483647;
  background:rgba(8,15,30,0.93);color:#e2e8f0;
  padding:10px 16px;border-radius:12px;
  font-family:-apple-system,system-ui,sans-serif;font-size:13px;line-height:1.5;
  max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  box-shadow:0 8px 32px rgba(0,0,0,0.7),0 0 0 1px rgba(96,165,250,0.2);
  border:1px solid rgba(96,165,250,0.35);
  transition:border-color 0.25s ease;
  pointer-events:none;backdrop-filter:blur(8px);
`.replace(/\n\s+/g, '');
function injectOverlay(text, done = false) {
    void _injectOverlay(text, done);
}
function _injectOverlay(text, done) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const page = getActivePage();
            if (!page)
                return;
            yield page.evaluate(({ text, done, css }) => {
                var _a, _b;
                const ID = '__lex_overlay__';
                let el = document.getElementById(ID);
                if (!el) {
                    el = document.createElement('div');
                    el.id = ID;
                    el.setAttribute('style', css);
                    (_a = document.body) === null || _a === void 0 ? void 0 : _a.appendChild(el);
                }
                if (done) {
                    el.style.borderColor = 'rgba(52,211,153,0.6)';
                    el.innerHTML = `<span style="color:#34d399;margin-right:7px;font-size:14px">✓</span>${text}`;
                    setTimeout(() => { var _a; (_a = document.getElementById('__lex_overlay__')) === null || _a === void 0 ? void 0 : _a.remove(); }, 2500);
                }
                else {
                    el.style.borderColor = 'rgba(96,165,250,0.4)';
                    el.innerHTML = `<span style="color:#60a5fa;margin-right:7px;font-size:14px;display:inline-block;animation:__lex_spin 1s linear infinite">⟳</span>${text}`;
                    if (!document.getElementById('__lex_style__')) {
                        const s = document.createElement('style');
                        s.id = '__lex_style__';
                        s.textContent = `@keyframes __lex_spin{to{transform:rotate(360deg)}} @keyframes __lex_ripple{0%{transform:scale(0.3);opacity:0.9}100%{transform:scale(2.5);opacity:0}}`;
                        (_b = document.head) === null || _b === void 0 ? void 0 : _b.appendChild(s);
                    }
                }
            }, { text, done, css: OVERLAY_CSS });
        }
        catch ( /* page navegou — ignorar */_a) { /* page navegou — ignorar */ }
    });
}
function showCursorAt(x, y) {
    void _showCursorAt(x, y);
}
function _showCursorAt(x, y) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const page = getActivePage();
            if (!page)
                return;
            yield page.evaluate(({ x, y }) => {
                var _a, _b, _c;
                if (!document.getElementById('__lex_style__')) {
                    const s = document.createElement('style');
                    s.id = '__lex_style__';
                    s.textContent = `@keyframes __lex_spin{to{transform:rotate(360deg)}} @keyframes __lex_ripple{0%{transform:scale(0.3);opacity:0.9}100%{transform:scale(2.5);opacity:0}}`;
                    (_a = document.head) === null || _a === void 0 ? void 0 : _a.appendChild(s);
                }
                const dot = document.createElement('div');
                dot.setAttribute('style', `position:fixed;left:${x - 6}px;top:${y - 6}px;width:12px;height:12px;border-radius:50%;background:#60a5fa;pointer-events:none;z-index:2147483646;box-shadow:0 0 8px rgba(96,165,250,0.9);`);
                const ring = document.createElement('div');
                ring.setAttribute('style', `position:fixed;left:${x - 20}px;top:${y - 20}px;width:40px;height:40px;border-radius:50%;border:2px solid rgba(96,165,250,0.8);pointer-events:none;z-index:2147483646;animation:__lex_ripple 0.7s ease-out forwards;`);
                (_b = document.body) === null || _b === void 0 ? void 0 : _b.appendChild(dot);
                (_c = document.body) === null || _c === void 0 ? void 0 : _c.appendChild(ring);
                setTimeout(() => { dot.remove(); ring.remove(); }, 750);
            }, { x, y });
        }
        catch ( /* ignorar */_a) { /* ignorar */ }
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers de ação com iframe awareness
// ─────────────────────────────────────────────────────────────────────────────
/** Tenta fill no main frame e depois em todos os iframes */
function fillInFrames(page, selector, value) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield page.fill(selector, value, { timeout: 3000 });
            return;
        }
        catch (_a) { }
        for (const frame of page.frames()) {
            try {
                yield frame.fill(selector, value, { timeout: 3000 });
                return;
            }
            catch (_b) { }
        }
        throw new Error(`fill: elemento não encontrado — ${selector}`);
    });
}
/** Tenta click no main frame e depois em todos os iframes */
function clickInFrames(page, selector) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield page.click(selector, { timeout: 3000 });
            return;
        }
        catch (_a) { }
        for (const frame of page.frames()) {
            try {
                yield frame.click(selector, { timeout: 3000 });
                return;
            }
            catch (_b) { }
        }
        throw new Error(`click: elemento não encontrado — ${selector}`);
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// runBrowserTask — loop de visão + DOM (iframe-aware)
// ─────────────────────────────────────────────────────────────────────────────
const VISION_AGENT_SYSTEM = `Você é um agente de automação de browser para sistemas judiciais brasileiros (PJe).
Você recebe: URL atual, lista de elementos DOM interativos (incluindo iframes) e screenshot da página.

REGRAS CRÍTICAS:
- PREFIRA sempre "fill" e "click_sel" usando os seletores da lista DOM — muito mais confiável que coordenadas.
- Use "goto" para navegar diretamente por URL.
- Use "click" com coordenadas APENAS se o elemento não aparecer na lista DOM.
- Use "scroll" para carregar mais elementos na lista DOM.
- Após preencher um campo de busca, use "press" com key "Enter" ou "click_sel" no botão de pesquisa.
- Quando a tarefa estiver COMPLETAMENTE concluída (dados extraídos), retorne "done".
- Não repita ações que já fez e falharam.

Responda SOMENTE com um objeto JSON (sem markdown, sem explicação):
{
  "action": "goto" | "fill" | "click_sel" | "click" | "press" | "wait" | "scroll" | "done",
  "url": "https://...",
  "selector": "#id ou [name='x'] ou .classe",
  "text": "texto a digitar ou resultado final",
  "x": 0, "y": 0,
  "key": "Enter",
  "ms": 1000,
  "direction": "down",
  "description": "descrição curta do que está fazendo"
}`;
function runBrowserTask(instruction_1) {
    return __awaiter(this, arguments, void 0, function* (instruction, maxSteps = 10, onStep) {
        var _a, _b, _c, _d;
        yield ensureBrowser();
        const { callAIWithVision } = yield Promise.resolve().then(() => __importStar(require('./ai-handler')));
        const { getActiveConfig } = yield Promise.resolve().then(() => __importStar(require('./provider-config')));
        const history = [];
        for (let step = 0; step < maxSteps; step++) {
            const page = getActivePage();
            if (!page)
                throw new Error('Browser page not available');
            // Captura screenshot
            let base64;
            try {
                const buf = yield page.screenshot({ type: 'jpeg', quality: 70 });
                base64 = buf.toString('base64');
            }
            catch (_e) {
                yield new Promise(r => setTimeout(r, 1000));
                continue;
            }
            // URL atual
            let currentUrl = '';
            try {
                currentUrl = page.url();
            }
            catch ( /* ignorar */_f) { /* ignorar */ }
            // Extrai elementos DOM de TODOS os frames (main + iframes do PJe)
            let domSummary = '';
            try {
                const allFrameElements = yield Promise.all(page.frames().map(frame => frame.evaluate((frameUrl) => {
                    const results = [];
                    document.querySelectorAll('input, textarea, select, button, [role="button"], [role="searchbox"]').forEach((el) => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0)
                            return;
                        const entry = {
                            tag: el.tagName.toLowerCase(),
                            type: el.type || '',
                            id: el.id || '',
                            name: el.name || '',
                            placeholder: el.placeholder || '',
                            text: (el.textContent || el.value || '').trim().slice(0, 60),
                            x: Math.round(rect.x + rect.width / 2),
                            y: Math.round(rect.y + rect.height / 2),
                            frame: frameUrl !== window.location.href ? frameUrl.split('/').pop() : '',
                        };
                        entry.sel = el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : '';
                        results.push(entry);
                    });
                    return results;
                }, frame.url()).catch(() => [])));
                const elements = allFrameElements.flat().slice(0, 25);
                if (elements.length > 0) {
                    domSummary = '\nElementos DOM interativos (todos os frames):\n' + elements
                        .map(e => `  [${e.tag}${e.type ? '/' + e.type : ''}${e.frame ? ' @iframe:' + e.frame : ''}] sel="${e.sel || '?'}" placeholder="${e.placeholder}" text="${e.text}" @(${e.x},${e.y})`)
                        .join('\n');
                }
            }
            catch ( /* ignorar */_g) { /* ignorar */ }
            const context = [
                history.length > 0 ? `Ações anteriores: ${history.slice(-4).join(' → ')}` : '',
                currentUrl ? `URL atual: ${currentUrl}` : '',
            ].filter(Boolean).join('\n') + domSummary;
            // Pergunta ao LLM o que fazer
            let response;
            try {
                response = yield callAIWithVision({
                    system: VISION_AGENT_SYSTEM,
                    user: `Tarefa: ${instruction}\nPasso: ${step + 1}/${maxSteps}${context ? '\n' + context : ''}\n\nQual é a próxima ação?`,
                    imageBase64: base64,
                    mediaType: 'image/jpeg',
                    maxTokens: 400,
                    model: getActiveConfig().agentModel,
                });
            }
            catch (e) {
                throw new Error(`Vision LLM falhou: ${e.message}`);
            }
            // Extrai JSON da resposta
            let action;
            try {
                const match = response.match(/\{[\s\S]*\}/);
                if (!match)
                    throw new Error('sem JSON na resposta');
                action = JSON.parse(match[0]);
            }
            catch (_h) {
                history.push(`[erro parse: ${response.slice(0, 60)}]`);
                continue;
            }
            const desc = String(action.description || action.action || 'ação');
            onStep === null || onStep === void 0 ? void 0 : onStep(desc);
            injectOverlay(desc);
            history.push(desc);
            // Executa ação (com iframe awareness no fill e click_sel)
            try {
                switch (String(action.action)) {
                    case 'done': {
                        const msg = String(action.text || 'Tarefa concluída');
                        injectOverlay(msg.slice(0, 80), true);
                        return msg;
                    }
                    case 'goto':
                        yield page.goto(String(action.url), { waitUntil: 'domcontentloaded', timeout: 15000 });
                        break;
                    case 'fill':
                        yield fillInFrames(page, String(action.selector), String((_a = action.text) !== null && _a !== void 0 ? _a : ''));
                        break;
                    case 'click_sel':
                        yield clickInFrames(page, String(action.selector));
                        break;
                    case 'click':
                        showCursorAt(Number(action.x), Number(action.y));
                        yield page.mouse.click(Number(action.x), Number(action.y));
                        break;
                    case 'type':
                        yield page.keyboard.type(String((_b = action.text) !== null && _b !== void 0 ? _b : ''), { delay: 40 });
                        break;
                    case 'press':
                        yield page.keyboard.press(String((_c = action.key) !== null && _c !== void 0 ? _c : 'Enter'));
                        break;
                    case 'wait':
                        yield new Promise(r => { var _a; return setTimeout(r, Number((_a = action.ms) !== null && _a !== void 0 ? _a : 1000)); });
                        break;
                    case 'scroll': {
                        const dir = String((_d = action.direction) !== null && _d !== void 0 ? _d : 'down');
                        const delta = dir === 'up' ? -400 : 400;
                        yield page.evaluate((dy) => window.scrollBy(0, dy), delta);
                        break;
                    }
                }
            }
            catch (e) {
                history.push(`[erro ação: ${e.message}]`);
            }
            yield new Promise(r => setTimeout(r, 600));
        }
        injectOverlay('Max steps atingido', true);
        return 'Tarefa executada no browser';
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Heartbeat — mantém sessão PJe viva a cada 6h
// ─────────────────────────────────────────────────────────────────────────────
function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => __awaiter(this, void 0, void 0, function* () {
        try {
            const page = getActivePage();
            if (!page)
                return;
            const url = page.url();
            if (!url.includes('.jus.br') && !url.includes('pje'))
                return;
            yield page.evaluate((u) => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield fetch(u, { method: 'GET', credentials: 'include', cache: 'no-cache' });
                }
                catch ( /* ignora */_a) { /* ignora */ }
            }), url);
            console.log('[Browser] Heartbeat PJe —', new Date().toLocaleTimeString('pt-BR'));
        }
        catch ( /* ignorar */_a) { /* ignorar */ }
    }), 6 * 60 * 60 * 1000);
}
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}
function closeBrowser() {
    return __awaiter(this, void 0, void 0, function* () {
        stopHeartbeat();
        // Caso launchPersistentContext: fecha o context (fecha o browser junto)
        if (context && !cdpBrowser) {
            try {
                yield context.close();
            }
            catch ( /* ignorar */_a) { /* ignorar */ }
            context = null;
        }
        // Caso CDP: fecha conexão CDP e mata processo
        if (cdpBrowser) {
            try {
                yield cdpBrowser.close();
            }
            catch ( /* ignorar */_b) { /* ignorar */ }
            cdpBrowser = null;
            context = null;
        }
        // Mata o CDP bridge
        if (bridgeProc && !bridgeProc.killed) {
            try {
                bridgeProc.kill();
            }
            catch ( /* ignorar */_c) { /* ignorar */ }
            bridgeProc = null;
            bridgePort = null;
        }
        if (chromeProc && !chromeProc.killed) {
            try {
                if (process.platform === 'win32') {
                    const { exec } = yield Promise.resolve().then(() => __importStar(require('child_process')));
                    exec(`taskkill /PID ${chromeProc.pid} /F /T`);
                }
                else {
                    chromeProc.kill('SIGTERM');
                }
            }
            catch ( /* ignorar */_d) { /* ignorar */ }
            chromeProc = null;
        }
        console.log('[Browser] Chromium encerrado');
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// killPreviousChrome — encerra Chrome anterior graciosamente (salva sessão/cookies)
// ─────────────────────────────────────────────────────────────────────────────
function killPreviousChrome(userDataDir) {
    return __awaiter(this, void 0, void 0, function* () {
        // 1. Kill by PID file
        const pidFile = path_1.default.join(userDataDir, 'chrome.pid');
        try {
            if (fs_1.default.existsSync(pidFile)) {
                const pid = parseInt(fs_1.default.readFileSync(pidFile, 'utf8').trim(), 10);
                if (pid && !isNaN(pid)) {
                    try {
                        process.kill(pid, 0); // check if alive
                        process.kill(pid, 'SIGKILL');
                        console.log('[Browser] Chrome anterior encerrado (PID:', pid, ')');
                    }
                    catch ( /* already dead */_a) { /* already dead */ }
                }
                try {
                    fs_1.default.unlinkSync(pidFile);
                }
                catch ( /* ok */_b) { /* ok */ }
            }
        }
        catch ( /* ignorar */_c) { /* ignorar */ }
        // 2. Kill whatever is listening on CDP_PORT (orphan Chrome from previous session)
        yield killProcessOnPort(CDP_PORT);
        yield new Promise(r => setTimeout(r, 1500));
    });
}
/** Encontra e mata o processo escutando na porta CDP (orphan Chrome) */
function killProcessOnPort(port) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Check if anything is listening
            yield new Promise((resolve, reject) => {
                const req = http_1.default.get(`http://127.0.0.1:${port}/json/version`, res => {
                    res.resume();
                    resolve();
                });
                req.on('error', reject);
                req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
            });
            // Something is on this port — find PID via netstat
            const { execSync } = yield Promise.resolve().then(() => __importStar(require('child_process')));
            try {
                const out = execSync('netstat -aon', { encoding: 'utf8', timeout: 5000 });
                const line = out.split('\n').find(l => l.includes(`:${port}`) && l.includes('LISTEN'));
                const match = line === null || line === void 0 ? void 0 : line.match(/\s(\d+)\s*$/);
                if (match) {
                    const pid = parseInt(match[1]);
                    try {
                        process.kill(pid, 'SIGKILL');
                        console.log('[Browser] Orphan Chrome morto na porta', port, '(PID:', pid, ')');
                        yield new Promise(r => setTimeout(r, 1000));
                    }
                    catch ( /* already dead */_a) { /* already dead */ }
                }
            }
            catch ( /* netstat failed */_b) { /* netstat failed */ }
        }
        catch (_c) {
            // Nothing on port — good
        }
    });
}
//# sourceMappingURL=browser-manager.js.map