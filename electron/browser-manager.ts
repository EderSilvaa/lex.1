import path from 'path'
import fs from 'fs'
import http from 'http'
import { spawn, ChildProcess } from 'child_process'
import { chromium, Browser, BrowserContext, Page } from 'playwright-core'
import { normalizeText } from './text-normalize'

// Porta 9222 é interceptada pelo Comet/Perplexity — usar porta alternativa
const CDP_PORT = 19222

// ── userDataDir injetado pelo main.ts (ou backend) — sem dependência do Electron ──
let _userDataDir: string | null = null

/** Deve ser chamado uma vez no boot (main.ts ou backend/server.ts) */
export function setUserDataDir(dir: string): void {
  _userDataDir = dir
}

function getUserDataDir(): string {
  if (!_userDataDir) throw new Error('[Browser] userDataDir não configurado — chame setUserDataDir() antes de initBrowser()')
  return _userDataDir
}

/** Detecta se estamos rodando dentro do Electron (vs Node.js puro no backend) */
function isElectronProcess(): boolean {
  return !!(process.versions as any).electron
}

/** Cria env limpo para child Chromium — remove variáveis do Electron que causam crash */
function cleanEnvForChromium(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  // CHROME_CRASHPAD_PIPE_NAME faz child Chromium tentar usar o crash handler do Electron → STATUS_BREAKPOINT
  delete env['CHROME_CRASHPAD_PIPE_NAME']
  delete env['ELECTRON_RUN_AS_NODE']
  delete env['ELECTRON_NO_ATTACH_CONSOLE']
  // Remove qualquer variável CRASHPAD/BREAKPAD que possa interferir
  for (const key of Object.keys(env)) {
    if (key.startsWith('CRASHPAD_') || key.startsWith('BREAKPAD_')) delete env[key]
  }
  return env
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

let bridgeProc: ChildProcess | null = null
let bridgePort: number | null = null
let bridgeDied = false  // P2.3: flag para recovery sem matar Chrome

/** Inicia o CDP bridge + Chrome como processo Node.js separado (não Electron)
 *  Chrome é spawnado DENTRO do bridge para evitar herança de handles do Electron */
async function startCdpBridge(chromePath: string, userDataDir: string, cdpPort: number): Promise<number> {
  // Mata bridge anterior
  if (bridgeProc && !bridgeProc.killed) {
    try { bridgeProc.kill() } catch { /* ok */ }
    bridgeProc = null
    bridgePort = null
  }

  // Escreve o script do bridge no diretório do código compilado
  const bridgePath = path.join(__dirname, 'cdp-bridge.js')
  fs.writeFileSync(bridgePath, CDP_BRIDGE_CODE)

  return new Promise<number>((resolve, reject) => {
    // Bridge recebe: chromePath, userDataDir, cdpPort (ou 'PROXY_ONLY', cdpPort)
    const bridgeArgs = chromePath === 'PROXY_ONLY'
      ? [bridgePath, 'PROXY_ONLY', String(cdpPort)]
      : [bridgePath, chromePath, userDataDir, String(cdpPort)]
    bridgeProc = spawn('node', bridgeArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: cleanEnvForChromium(), // env limpo sem CHROME_CRASHPAD_PIPE_NAME etc.
    })

    let output = ''
    let resolved = false
    bridgeProc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      const match = output.match(/BRIDGE:(\d+)/)
      if (match && !resolved) {
        resolved = true
        bridgePort = parseInt(match[1]!)
        console.log('[CDP Bridge] Pronto na porta', bridgePort)
        resolve(bridgePort!)
      }
    })

    bridgeProc.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim()
      if (line.startsWith('CHROME_PID:')) {
        const pid = parseInt(line.split(':')[1]!)
        console.log('[Browser] Chromium PID:', pid, '(via bridge)')
        // Salva PID para killPreviousChrome
        try { fs.writeFileSync(path.join(userDataDir, 'chrome.pid'), String(pid)) } catch {}
      } else if (line.startsWith('CHROME_EXIT:')) {
        console.warn('[Browser] Chromium saiu com código:', line.split(':')[1])
      } else if (line) {
        console.log('[CDP Bridge]', line.slice(0, 300))
      }
    })

    bridgeProc.on('exit', code => {
      console.warn('[CDP Bridge] Saiu com código:', code)
      if (!resolved) reject(new Error(`Bridge saiu com código ${code}`))
      bridgeProc = null
      bridgePort = null
      // P2.3: marca bridge como morto para recovery sem matar Chrome
      if (resolved) bridgeDied = true
    })

    setTimeout(() => { if (!resolved) reject(new Error('CDP bridge timeout (30s)')) }, 30000)
  })
}

/** Spawna Chrome + proxy via bridge Node.js e conecta Playwright */
async function connectViaBridge(chromePath: string, userDataDir: string, cdpPort: number): Promise<Browser> {
  const port = await startCdpBridge(chromePath, userDataDir, cdpPort)
  return chromium.connectOverCDP(`http://127.0.0.1:${port}`)
}

/** Proxy-only bridge (Chrome já está rodando) */
async function connectViaBridgeProxyOnly(cdpPort: number): Promise<Browser> {
  const port = await startCdpBridge('PROXY_ONLY', '', cdpPort)
  return chromium.connectOverCDP(`http://127.0.0.1:${port}`)
}

/** Launch direto: spawna Chrome sem bridge (para backend Node.js puro — sem env vars do Electron) */
async function launchDirectCDP(chromePath: string, userDataDir: string, cdpPort: number): Promise<Browser> {
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
  ]

  const proc = spawn(chromePath, chromeArgs, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  proc.unref()

  if (proc.pid) {
    fs.writeFileSync(path.join(userDataDir, 'chrome.pid'), String(proc.pid))
    console.log('[Browser] Chrome PID:', proc.pid, '(launch direto)')
  }

  proc.on('exit', code => console.warn('[Browser] Chrome saiu:', code))

  // Espera Chrome ficar pronto no CDP
  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 20000
    const check = () => {
      if (Date.now() > deadline) return reject(new Error('Chrome timeout'))
      if (proc.exitCode !== null) return reject(new Error(`Chrome crashed: ${proc.exitCode}`))
      const req = http.get(`http://127.0.0.1:${cdpPort}/json/version`, res => {
        res.statusCode === 200 ? resolve() : setTimeout(check, 400)
        res.resume()
      })
      req.on('error', () => setTimeout(check, 400))
      req.setTimeout(1000, () => { req.destroy(); setTimeout(check, 400) })
    }
    check()
  })

  // Estabilização
  await new Promise(r => setTimeout(r, 1500))

  return chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
}

/** Conecta ao Chrome rodando via CDP (direto, sem bridge) */
async function connectDirectCDP(cdpPort: number): Promise<Browser> {
  return chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
}

// Chromium do Playwright (sem singleton issues do Google Chrome)
// Fallback para caminhos conhecidos se chromium.executablePath() não existir
function findPlaywrightChromium(): string | undefined {
  const primary = chromium.executablePath()
  if (fs.existsSync(primary)) return primary
  const msBase = path.join(process.env['LOCALAPPDATA'] ?? '', 'ms-playwright')
  if (!fs.existsSync(msBase)) return undefined
  const dirs = fs.readdirSync(msBase)
    .filter(d => d.startsWith('chromium-'))
    .sort()
    .reverse()
  for (const dir of dirs) {
    for (const sub of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
      const p = path.join(msBase, dir, sub)
      if (fs.existsSync(p)) return p
    }
  }
  return undefined
}

let cdpBrowser: Browser | null = null
let context: BrowserContext | null = null
let chromeProc: ChildProcess | null = null
let initPromise: Promise<void> | null = null
let heartbeatTimer: NodeJS.Timeout | null = null
let activePageIndex = 0

export async function initBrowser(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = _doInit().finally(() => { initPromise = null })
  return initPromise
}

export async function reInitBrowser(): Promise<void> {
  await closeBrowser()
  await initBrowser()
}

async function _doInit(): Promise<void> {
  const userDataDir = path.join(getUserDataDir(), 'chrome-profile')
  fs.mkdirSync(userDataDir, { recursive: true })

  const useDirectLaunch = !isElectronProcess()

  // ── 1. Tenta reconectar SOMENTE se temos um chrome.pid próprio vivo ──
  // (evita conectar ao Comet/Perplexity ou outro Chrome de terceiros na porta)
  const ownChromeUp = await isOwnChromeUp(userDataDir)
  if (ownChromeUp) {
    console.log('[Browser] Chrome próprio já rodando na porta', CDP_PORT, '— reconectando...')
    cdpBrowser = useDirectLaunch
      ? await connectDirectCDP(CDP_PORT)
      : await connectViaBridgeProxyOnly(CDP_PORT)
    const contexts = cdpBrowser.contexts()
    context = contexts[0] ?? await cdpBrowser.newContext()
    if (context.pages().length === 0) await context.newPage()
    activePageIndex = 0
    setupPageListeners()
    console.log('[Browser] Reconectado ao Chrome existente')
    startHeartbeat()
    return
  }

  // ── 2. Prefere Google Chrome do sistema (sem banner "Chrome for Testing") ────
  try {
    await launchWithGoogleChrome(userDataDir)
    return
  } catch (e: any) {
    console.log('[Browser] Google Chrome não disponível:', e.message)
  }

  // ── 3. Fallback: Playwright Chromium (mostra banner "Chrome for Testing") ────
  const executablePath = findPlaywrightChromium()
  if (executablePath) {
    console.log('[Browser] Usando Playwright Chromium (fallback):', executablePath)
    await launchWithPlaywright(userDataDir, executablePath)
    return
  }

  throw new Error('Chrome/Chromium não encontrado — instale Google Chrome ou execute: npx playwright install chromium')
}

// No backend (Node.js puro): Chrome spawna direto — sem bridge.
// No Electron: usa bridge para evitar herança de handles/Job Objects.
async function launchWithPlaywright(userDataDir: string, executablePath: string): Promise<void> {
  await killPreviousChrome(userDataDir)

  for (const lockFile of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile', 'LOCK']) {
    for (const dir of [userDataDir, path.join(userDataDir, 'Default')]) {
      try { fs.unlinkSync(path.join(dir, lockFile)) } catch { /* ok */ }
    }
  }

  await new Promise(r => setTimeout(r, 1000))

  if (isElectronProcess()) {
    console.log('[Browser] Launching Chromium via CDP bridge (Electron)...')
    cdpBrowser = await connectViaBridge(executablePath, userDataDir, CDP_PORT)
  } else {
    console.log('[Browser] Launching Chromium direto (Node.js puro)...')
    cdpBrowser = await launchDirectCDP(executablePath, userDataDir, CDP_PORT)
  }

  const contexts = cdpBrowser.contexts()
  context = contexts[0] ?? await cdpBrowser.newContext()

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  if (context.pages().length === 0) await context.newPage()
  activePageIndex = 0
  setupPageListeners()

  console.log('[Browser] Playwright Chromium conectado')
  startHeartbeat()
}

async function launchWithGoogleChrome(userDataDir: string): Promise<void> {
  await killPreviousChrome(userDataDir)

  for (const lockFile of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile', 'LOCK']) {
    for (const dir of [userDataDir, path.join(userDataDir, 'Default')]) {
      try { fs.unlinkSync(path.join(dir, lockFile)) } catch { /* ok */ }
    }
  }

  await new Promise(r => setTimeout(r, 1500))

  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
  ]
  const executablePath = chromePaths.find(p => { try { fs.accessSync(p); return true } catch { return false } })
  if (!executablePath) throw new Error('Chrome/Chromium não encontrado — instale Google Chrome ou execute: npx playwright install chromium')

  if (isElectronProcess()) {
    console.log('[Browser] Launching Google Chrome via CDP bridge (Electron)...', executablePath)
    cdpBrowser = await connectViaBridge(executablePath, userDataDir, CDP_PORT)
  } else {
    console.log('[Browser] Launching Google Chrome direto (Node.js puro)...', executablePath)
    cdpBrowser = await launchDirectCDP(executablePath, userDataDir, CDP_PORT)
  }
  const contexts = cdpBrowser.contexts()
  context = contexts[0] ?? await cdpBrowser.newContext()

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  if (context.pages().length === 0) await context.newPage()
  activePageIndex = 0
  setupPageListeners()

  console.log('[Browser] Google Chrome conectado via CDP bridge')
  startHeartbeat()
}

/** Verifica se o Chrome que lançamos (via chrome.pid) ainda está vivo e respondendo no CDP_PORT */
async function isOwnChromeUp(userDataDir: string): Promise<boolean> {
  const pidFile = path.join(userDataDir, 'chrome.pid')
  try {
    if (!fs.existsSync(pidFile)) return false
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10)
    if (!pid || isNaN(pid)) return false
    // Verifica se o processo ainda existe
    try { process.kill(pid, 0) } catch { return false }
    // Verifica se responde no CDP
    await new Promise<void>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, res => {
        res.statusCode === 200 ? resolve() : reject()
        res.resume()
      })
      req.on('error', reject)
      req.setTimeout(1000, () => { req.destroy(); reject() })
    })
    return true
  } catch { return false }
}


export function getBrowserContext(): BrowserContext {
  if (!context) throw new Error('[Browser] Não inicializado — chame initBrowser() primeiro')
  return context
}

/** Retorna a Page ativa (rastreia aba ativa por índice) */
export function getActivePage(): Page | null {
  if (!context) return null
  const pages = context.pages()
  if (pages.length === 0) return null
  // Garante que o índice é válido
  if (activePageIndex >= pages.length) activePageIndex = pages.length - 1
  if (activePageIndex < 0) activePageIndex = 0
  return pages[activePageIndex] ?? pages[0] ?? null
}

/** Define qual aba é a ativa por índice */
export function setActivePage(index: number): void {
  activePageIndex = Math.max(0, index)
}

/** Retorna o índice da aba ativa */
export function getActivePageIndex(): number {
  return activePageIndex
}

/** Garante que o browser está inicializado e a conexão está viva.
 *  Auto-recupera se o Chrome morreu ou a conexão CDP caiu. */
/** Registra listeners de novas abas/popups no contexto */
function setupPageListeners(): void {
  if (!context) return
  context.on('page', (newPage) => {
    const pages = context!.pages()
    const newIndex = pages.indexOf(newPage)
    console.log(`[Browser] Nova aba detectada: [${newIndex}] ${newPage.url()}`)
    // Auto-switch para a nova aba (PJe abre docs/popups em abas novas)
    if (newIndex >= 0) {
      activePageIndex = newIndex
      console.log(`[Browser] Aba ativa atualizada para [${newIndex}]`)
    }
  })
  context.on('close', () => {
    console.log('[Browser] Contexto fechado')
    context = null
    activePageIndex = 0
  })
}

export async function ensureBrowser(): Promise<void> {
  if (!context) {
    console.log('[Browser] Não estava inicializado — inicializando agora...')
    await initBrowser()
    return
  }

  // P2.3: Se o bridge morreu mas Chrome pode estar vivo, tenta reconectar via proxy-only
  if (bridgeDied && isElectronProcess()) {
    console.log('[Browser] Bridge morreu — tentando reconectar sem matar Chrome...')
    bridgeDied = false
    try {
      cdpBrowser = await connectViaBridgeProxyOnly(CDP_PORT)
      const contexts = cdpBrowser.contexts()
      context = contexts[0] ?? await cdpBrowser.newContext()
      if (context.pages().length === 0) await context.newPage()
      activePageIndex = 0
      setupPageListeners()
      startHeartbeat()
      console.log('[Browser] Reconectado ao Chrome via novo bridge (recovery)')
      return
    } catch (e: any) {
      console.warn('[Browser] Recovery do bridge falhou, reinit completo:', e.message)
      context = null
      cdpBrowser = null
      activePageIndex = 0
      await initBrowser()
      return
    }
  }

  // Health check: testa se a conexão CDP está realmente viva
  try {
    const pages = context.pages()
    if (pages.length > 0) {
      await pages[0]!.evaluate(() => true)
    } else {
      await context.newPage()
    }
  } catch (e: any) {
    console.warn('[Browser] Conexão morta detectada — reinicializando...', e.message)
    context = null
    cdpBrowser = null
    activePageIndex = 0
    await initBrowser()
  }
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
`.replace(/\n\s+/g, '')

export function injectOverlay(text: string, done = false): void {
  void _injectOverlay(text, done)
}

async function _injectOverlay(text: string, done: boolean): Promise<void> {
  try {
    const page = getActivePage()
    if (!page) return
    await page.evaluate(
      ({ text, done, css }: { text: string; done: boolean; css: string }) => {
        const ID = '__lex_overlay__'
        let el = document.getElementById(ID) as HTMLDivElement | null
        if (!el) {
          el = document.createElement('div')
          el.id = ID
          el.setAttribute('style', css)
          document.body?.appendChild(el)
        }
        if (done) {
          el.style.borderColor = 'rgba(52,211,153,0.6)'
          el.innerHTML = `<span style="color:#34d399;margin-right:7px;font-size:14px">✓</span>${text}`
          setTimeout(() => { document.getElementById('__lex_overlay__')?.remove() }, 2500)
        } else {
          el.style.borderColor = 'rgba(96,165,250,0.4)'
          el.innerHTML = `<span style="color:#60a5fa;margin-right:7px;font-size:14px;display:inline-block;animation:__lex_spin 1s linear infinite">⟳</span>${text}`
          if (!document.getElementById('__lex_style__')) {
            const s = document.createElement('style')
            s.id = '__lex_style__'
            s.textContent = `@keyframes __lex_spin{to{transform:rotate(360deg)}} @keyframes __lex_ripple{0%{transform:scale(0.3);opacity:0.9}100%{transform:scale(2.5);opacity:0}}`
            document.head?.appendChild(s)
          }
        }
      },
      { text, done, css: OVERLAY_CSS }
    )
  } catch { /* page navegou — ignorar */ }
}

export function showCursorAt(x: number, y: number): void {
  void _showCursorAt(x, y)
}

async function _showCursorAt(x: number, y: number): Promise<void> {
  try {
    const page = getActivePage()
    if (!page) return
    await page.evaluate(
      ({ x, y }: { x: number; y: number }) => {
        if (!document.getElementById('__lex_style__')) {
          const s = document.createElement('style')
          s.id = '__lex_style__'
          s.textContent = `@keyframes __lex_spin{to{transform:rotate(360deg)}} @keyframes __lex_ripple{0%{transform:scale(0.3);opacity:0.9}100%{transform:scale(2.5);opacity:0}}`
          document.head?.appendChild(s)
        }
        const dot = document.createElement('div')
        dot.setAttribute('style', `position:fixed;left:${x - 6}px;top:${y - 6}px;width:12px;height:12px;border-radius:50%;background:#60a5fa;pointer-events:none;z-index:2147483646;box-shadow:0 0 8px rgba(96,165,250,0.9);`)
        const ring = document.createElement('div')
        ring.setAttribute('style', `position:fixed;left:${x - 20}px;top:${y - 20}px;width:40px;height:40px;border-radius:50%;border:2px solid rgba(96,165,250,0.8);pointer-events:none;z-index:2147483646;animation:__lex_ripple 0.7s ease-out forwards;`)
        document.body?.appendChild(dot)
        document.body?.appendChild(ring)
        setTimeout(() => { dot.remove(); ring.remove() }, 750)
      },
      { x, y }
    )
  } catch { /* ignorar */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Element Refs — sistema de referência por número para LLMs fracos
// ─────────────────────────────────────────────────────────────────────────────

export interface ElementRef {
  ref: number
  selector: string       // CSS selector construído
  tag: string
  type: string
  text: string           // texto visível (label, textContent, placeholder)
  role: string           // semantic role (input, button, link, tab, select)
}

let elementRefMap: ElementRef[] = []
let elementRefUrl: string = ''

/** Armazena refs coletados pelo browser_get_state */
export function storeElementRefs(refs: ElementRef[], url: string): void {
  elementRefMap = refs
  elementRefUrl = url
}

/** Resolve ref numérico para ElementRef */
export function resolveElementRef(ref: number): ElementRef | null {
  return elementRefMap[ref] ?? null
}

/** Verifica se os refs estão potencialmente stale (URL mudou) */
export function isRefMapStale(currentUrl: string): boolean {
  return elementRefUrl !== '' && elementRefUrl !== currentUrl
}

/**
 * Encontra elemento pelo texto visível (case-insensitive, accent-insensitive).
 * Retorna o melhor match dos refs armazenados, ou constrói seletor text-based.
 */
export function findElementByText(texto: string): { selector: string; source: 'ref' | 'constructed' } | null {
  const normTexto = normalizeText(texto)

  // 1. Busca exata nos refs armazenados
  for (const ref of elementRefMap) {
    if (normalizeText(ref.text) === normTexto) {
      return { selector: ref.selector, source: 'ref' }
    }
  }

  // 2. Busca parcial (contains)
  for (const ref of elementRefMap) {
    const normRef = normalizeText(ref.text)
    if (normRef && normTexto && (normRef.includes(normTexto) || normTexto.includes(normRef))) {
      return { selector: ref.selector, source: 'ref' }
    }
  }

  // 3. Constrói seletor text-based (funciona mesmo sem get_state prévio)
  const escaped = texto.replace(/"/g, '\\"')
  return { selector: `text="${escaped}"`, source: 'constructed' }
}

// ── resolveTarget — unifica ref/elemento/seletor ──

export interface ResolveTargetResult {
  selector: string
  source: 'ref' | 'elemento' | 'seletor'
  refInfo?: ElementRef
}

/**
 * Resolve target de elemento: ref → elemento → seletor.
 * Usado por todas as skills de ação browser (click, fill, type).
 */
export function resolveTarget(params: {
  ref?: number
  elemento?: string
  seletor?: string
}): ResolveTargetResult | null {
  // 1. Ref numérico
  if (params.ref !== undefined && params.ref >= 0) {
    const refInfo = resolveElementRef(params.ref)
    if (refInfo) {
      // Warning se stale (não bloqueia)
      try {
        const page = getActivePage()
        if (page && isRefMapStale(page.url())) {
          console.log(`[ElementRef] Warning: refs podem estar stale (URL mudou desde get_state)`)
        }
      } catch {}
      console.log(`[ResolveTarget] ref:${params.ref} → ${refInfo.selector} ("${refInfo.text}")`)
      return { selector: refInfo.selector, source: 'ref', refInfo }
    }
    console.log(`[ResolveTarget] ref:${params.ref} não encontrado (${elementRefMap.length} refs armazenados)`)
  }

  // 2. Texto visível do elemento
  if (params.elemento && params.elemento.trim()) {
    const found = findElementByText(params.elemento)
    if (found) {
      console.log(`[ResolveTarget] elemento:"${params.elemento}" → ${found.selector} (${found.source})`)
      return { selector: found.selector, source: 'elemento' }
    }
  }

  // 3. CSS selector direto
  if (params.seletor && params.seletor.trim()) {
    return { selector: params.seletor, source: 'seletor' }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de ação com iframe awareness
// ─────────────────────────────────────────────────────────────────────────────

/** Tenta fill no main frame e depois em todos os iframes */
export async function fillInFrames(page: Page, selector: string, value: string): Promise<void> {
  try { await page.fill(selector, value, { timeout: 3000 }); return } catch {}
  for (const frame of page.frames()) {
    try { await frame.fill(selector, value, { timeout: 3000 }); return } catch {}
  }
  throw new Error(`fill: elemento não encontrado — ${selector}`)
}

/** Tenta click no main frame e depois em todos os iframes */
export async function clickInFrames(page: Page, selector: string): Promise<void> {
  try { await page.click(selector, { timeout: 3000 }); return } catch {}
  for (const frame of page.frames()) {
    try { await frame.click(selector, { timeout: 3000 }); return } catch {}
  }
  throw new Error(`click: elemento não encontrado — ${selector}`)
}

/** Tenta type no main frame: foca o elemento e digita keystroke-by-keystroke */
export async function typeInFrames(page: Page, selector: string, text: string, options?: { delay?: number }): Promise<void> {
  const delay = options?.delay ?? 30
  try { await page.click(selector, { timeout: 3000 }); await page.keyboard.type(text, { delay }); return } catch {}
  for (const frame of page.frames()) {
    try { await frame.click(selector, { timeout: 3000 }); await page.keyboard.type(text, { delay }); return } catch {}
  }
  throw new Error(`type: elemento não encontrado — ${selector}`)
}

/** Tenta waitForSelector no main frame e depois em todos os iframes */
export async function waitForSelectorInFrames(page: Page, selector: string, options?: { timeout?: number; state?: 'attached' | 'visible' | 'hidden' }): Promise<void> {
  const timeout = options?.timeout ?? 10000
  const state = options?.state ?? 'visible'
  try { await page.waitForSelector(selector, { timeout, state }); return } catch {}
  for (const frame of page.frames()) {
    try { await frame.waitForSelector(selector, { timeout: Math.min(timeout, 3000), state }); return } catch {}
  }
  throw new Error(`wait: elemento não apareceu — ${selector} (timeout: ${timeout}ms)`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart Click — retry com estratégias alternativas
// ─────────────────────────────────────────────────────────────────────────────

export interface SmartClickResult {
  success: boolean
  strategy: 'selector' | 'retry' | 'text' | 'coordinates' | 'none'
  selector?: string
  coordinates?: { x: number; y: number }
  error?: string
}

/**
 * Click inteligente com waterfall de estratégias:
 * 1. Seletor CSS direto (iframe-aware)
 * 2. Wait 500ms + retry seletor (DOM pode estar carregando)
 * 3. Busca por texto visível do elemento (fallback text-based)
 * 4. Localiza bounding box e clica por coordenadas
 */
export async function smartClick(
  page: Page,
  selector: string,
  options?: { duplo?: boolean; timeout?: number }
): Promise<SmartClickResult> {
  const duplo = options?.duplo ?? false
  const timeout = options?.timeout ?? 3000

  const doClick = async (target: Page | import('playwright-core').Frame, sel: string) => {
    if (duplo) await target.dblclick(sel, { timeout })
    else await target.click(sel, { timeout })
  }

  // ── Strategy 1: Seletor direto (iframe-aware) ──
  try {
    await doClick(page, selector)
    return { success: true, strategy: 'selector', selector }
  } catch {}
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    try {
      await doClick(frame, selector)
      return { success: true, strategy: 'selector', selector }
    } catch {}
  }

  // ── Strategy 2: Wait 500ms + retry (DOM loading) ──
  await page.waitForTimeout(500)
  try {
    await doClick(page, selector)
    return { success: true, strategy: 'retry', selector }
  } catch {}
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    try {
      await doClick(frame, selector)
      return { success: true, strategy: 'retry', selector }
    } catch {}
  }

  // ── Strategy 3: Texto visível (extrai texto do seletor e busca) ──
  // Se o seletor contém texto (ex: has-text, value=, etc), tenta variantes
  const textMatch = selector.match(/has-text\("([^"]+)"\)/) ||
                    selector.match(/value[*]?="([^"]+)"/) ||
                    selector.match(/placeholder[*]?="([^"]+)"/)
  if (textMatch) {
    const text = textMatch[1]
    const textSelectors = [
      `text="${text}"`,
      `*:has-text("${text}"):visible`,
      `button:has-text("${text}")`,
      `a:has-text("${text}")`,
      `input[value*="${text}"]`,
    ]
    for (const textSel of textSelectors) {
      try {
        await doClick(page, textSel)
        return { success: true, strategy: 'text', selector: textSel }
      } catch {}
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue
        try {
          await doClick(frame, textSel)
          return { success: true, strategy: 'text', selector: textSel }
        } catch {}
      }
    }
  }

  // ── Strategy 4: Bounding box → coordenadas ──
  // Tenta localizar o elemento (pode existir mas não ser clickable) e pegar centro
  for (const target of [page as Page | import('playwright-core').Frame, ...page.frames()]) {
    try {
      const el = await target.$(selector)
      if (!el) continue
      const box = await el.boundingBox()
      if (box && box.width > 0 && box.height > 0) {
        const x = Math.round(box.x + box.width / 2)
        const y = Math.round(box.y + box.height / 2)
        showCursorAt(x, y)
        if (duplo) await page.mouse.dblclick(x, y)
        else await page.mouse.click(x, y)
        return { success: true, strategy: 'coordinates', selector, coordinates: { x, y } }
      }
    } catch {}
  }

  return {
    success: false,
    strategy: 'none',
    error: `Todas as estratégias falharam para: ${selector}`
  }
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
}`

export async function runBrowserTask(
  instruction: string,
  maxSteps = 10,
  onStep?: (step: string) => void
): Promise<string> {
  await ensureBrowser()

  const { callAIWithVision } = await import('./ai-handler')
  const { getActiveConfig } = await import('./provider-config')
  const history: string[] = []

  for (let step = 0; step < maxSteps; step++) {
    const page = getActivePage()
    if (!page) throw new Error('Browser page not available')

    // Captura screenshot
    let base64: string
    try {
      const buf: Buffer = await page.screenshot({ type: 'jpeg', quality: 70 })
      base64 = buf.toString('base64')
    } catch {
      await new Promise(r => setTimeout(r, 1000))
      continue
    }

    // URL atual
    let currentUrl = ''
    try { currentUrl = page.url() } catch { /* ignorar */ }

    // Extrai elementos DOM de TODOS os frames (main + iframes do PJe)
    let domSummary = ''
    try {
      const allFrameElements = await Promise.all(
        page.frames().map(frame =>
          frame.evaluate((frameUrl: string) => {
            const results: any[] = []
            document.querySelectorAll('input, textarea, select, button, [role="button"], [role="searchbox"]').forEach((el: any) => {
              const rect = el.getBoundingClientRect()
              if (rect.width === 0 || rect.height === 0) return
              const entry: any = {
                tag: el.tagName.toLowerCase(),
                type: el.type || '',
                id: el.id || '',
                name: el.name || '',
                placeholder: el.placeholder || '',
                text: (el.textContent || el.value || '').trim().slice(0, 60),
                x: Math.round(rect.x + rect.width / 2),
                y: Math.round(rect.y + rect.height / 2),
                frame: frameUrl !== window.location.href ? frameUrl.split('/').pop() : '',
              }
              entry.sel = el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : ''
              results.push(entry)
            })
            return results
          }, frame.url()).catch(() => [] as any[])
        )
      )
      const elements = allFrameElements.flat().slice(0, 25)
      if (elements.length > 0) {
        domSummary = '\nElementos DOM interativos (todos os frames):\n' + elements
          .map(e => `  [${e.tag}${e.type ? '/' + e.type : ''}${e.frame ? ' @iframe:' + e.frame : ''}] sel="${e.sel || '?'}" placeholder="${e.placeholder}" text="${e.text}" @(${e.x},${e.y})`)
          .join('\n')
      }
    } catch { /* ignorar */ }

    const context = [
      history.length > 0 ? `Ações anteriores: ${history.slice(-4).join(' → ')}` : '',
      currentUrl ? `URL atual: ${currentUrl}` : '',
    ].filter(Boolean).join('\n') + domSummary

    // Pergunta ao LLM o que fazer
    let response: string
    try {
      response = await callAIWithVision({
        system: VISION_AGENT_SYSTEM,
        user: `Tarefa: ${instruction}\nPasso: ${step + 1}/${maxSteps}${context ? '\n' + context : ''}\n\nQual é a próxima ação?`,
        imageBase64: base64,
        mediaType: 'image/jpeg',
        maxTokens: 400,
        model: getActiveConfig().agentModel,
      })
    } catch (e: any) {
      throw new Error(`Vision LLM falhou: ${e.message}`)
    }

    // Extrai JSON da resposta
    let action: any
    try {
      const match = response.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('sem JSON na resposta')
      action = JSON.parse(match[0])
    } catch {
      history.push(`[erro parse: ${response.slice(0, 60)}]`)
      continue
    }

    const desc = String(action.description || action.action || 'ação')
    onStep?.(desc)
    injectOverlay(desc)
    history.push(desc)

    // Executa ação (com iframe awareness no fill e click_sel)
    try {
      switch (String(action.action)) {
        case 'done': {
          const msg = String(action.text || 'Tarefa concluída')
          injectOverlay(msg.slice(0, 80), true)
          return msg
        }
        case 'goto':
          await page.goto(String(action.url), { waitUntil: 'domcontentloaded', timeout: 15000 })
          break
        case 'fill':
          await fillInFrames(page, String(action.selector), String(action.text ?? ''))
          break
        case 'click_sel':
          await clickInFrames(page, String(action.selector))
          break
        case 'click':
          showCursorAt(Number(action.x), Number(action.y))
          await page.mouse.click(Number(action.x), Number(action.y))
          break
        case 'type':
          await page.keyboard.type(String(action.text ?? ''), { delay: 40 })
          break
        case 'press':
          await page.keyboard.press(String(action.key ?? 'Enter'))
          break
        case 'wait':
          await new Promise(r => setTimeout(r, Number(action.ms ?? 1000)))
          break
        case 'scroll': {
          const dir = String(action.direction ?? 'down')
          const delta = dir === 'up' ? -400 : 400
          await page.evaluate((dy: number) => window.scrollBy(0, dy), delta)
          break
        }
      }
    } catch (e: any) {
      history.push(`[erro ação: ${e.message}]`)
    }

    await new Promise(r => setTimeout(r, 600))
  }

  injectOverlay('Max steps atingido', true)
  return 'Tarefa executada no browser'
}

// ─────────────────────────────────────────────────────────────────────────────
// Heartbeat — mantém sessão PJe viva a cada 6h
// ─────────────────────────────────────────────────────────────────────────────

const HEARTBEAT_TIMEOUT = 30_000 // 30s — evita travar em CDP hang

function startHeartbeat(): void {
  stopHeartbeat()
  heartbeatTimer = setInterval(async () => {
    try {
      const page = getActivePage()
      if (!page) return
      const url: string = page.url()
      if (!url.includes('.jus.br') && !url.includes('pje')) return
      await Promise.race([
        page.evaluate(async (u: string) => {
          try { await fetch(u, { method: 'GET', credentials: 'include', cache: 'no-cache' }) } catch { /* ignora */ }
        }, url),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('heartbeat timeout')), HEARTBEAT_TIMEOUT))
      ])
      console.log('[Browser] Heartbeat PJe —', new Date().toLocaleTimeString('pt-BR'))
    } catch (err: any) {
      console.warn('[Browser] Heartbeat falhou:', err?.message || err)
    }
  }, 6 * 60 * 60 * 1000)
}

function stopHeartbeat(): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
}

export async function closeBrowser(): Promise<void> {
  stopHeartbeat()
  // Caso launchPersistentContext: fecha o context (fecha o browser junto)
  if (context && !cdpBrowser) {
    try { await context.close() } catch { /* ignorar */ }
    context = null
  }
  // Caso CDP: fecha conexão CDP e mata processo
  if (cdpBrowser) {
    try { await cdpBrowser.close() } catch { /* ignorar */ }
    cdpBrowser = null
    context = null
  }
  // Mata o CDP bridge
  if (bridgeProc && !bridgeProc.killed) {
    try { bridgeProc.kill() } catch { /* ignorar */ }
    bridgeProc = null
    bridgePort = null
  }
  if (chromeProc && !chromeProc.killed) {
    try {
      if (process.platform === 'win32') {
        const { exec } = await import('child_process')
        exec(`taskkill /PID ${chromeProc.pid} /F /T`)
      } else {
        chromeProc.kill('SIGTERM')
      }
    } catch { /* ignorar */ }
    chromeProc = null
  }
  activePageIndex = 0
  console.log('[Browser] Chromium encerrado')
}

// ─────────────────────────────────────────────────────────────────────────────
// killPreviousChrome — encerra Chrome anterior graciosamente (salva sessão/cookies)
// ─────────────────────────────────────────────────────────────────────────────

async function killPreviousChrome(userDataDir: string): Promise<void> {
  // 1. Kill by PID file
  const pidFile = path.join(userDataDir, 'chrome.pid')
  try {
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10)
      if (pid && !isNaN(pid)) {
        try {
          process.kill(pid, 0) // check if alive
          process.kill(pid, 'SIGKILL')
          console.log('[Browser] Chrome anterior encerrado (PID:', pid, ')')
        } catch { /* already dead */ }
      }
      try { fs.unlinkSync(pidFile) } catch { /* ok */ }
    }
  } catch { /* ignorar */ }

  // 2. Kill whatever is listening on CDP_PORT (orphan Chrome from previous session)
  await killProcessOnPort(CDP_PORT)

  await new Promise(r => setTimeout(r, 1500))
}

/** Encontra e mata o processo escutando na porta CDP (orphan Chrome) */
async function killProcessOnPort(port: number): Promise<void> {
  try {
    // Check if anything is listening
    await new Promise<void>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/json/version`, res => {
        res.resume()
        resolve()
      })
      req.on('error', reject)
      req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')) })
    })

    // Something is on this port — find PID via netstat
    const { execSync } = await import('child_process')
    try {
      const out = execSync('netstat -aon', { encoding: 'utf8', timeout: 5000 })
      const line = out.split('\n').find(l => l.includes(`:${port}`) && l.includes('LISTEN'))
      const match = line?.match(/\s(\d+)\s*$/)
      if (match) {
        const pid = parseInt(match[1]!)
        try {
          process.kill(pid, 'SIGKILL')
          console.log('[Browser] Orphan Chrome morto na porta', port, '(PID:', pid, ')')
          await new Promise(r => setTimeout(r, 1000))
        } catch { /* already dead */ }
      }
    } catch { /* netstat failed */ }
  } catch {
    // Nothing on port — good
  }
}
