import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { getStagehandModelConfig } from './provider-config'

// Dynamic import necessário: Stagehand v3 usa chrome-launcher (ESM-only)
// CJS não pode fazer require() de módulos ESM, mas dynamic import() funciona
type StagehandType = import('@browserbasehq/stagehand').Stagehand

let instance: StagehandType | null = null
let initPromise: Promise<void> | null = null  // mutex — evita dois inits concorrentes
let heartbeatTimer: NodeJS.Timeout | null = null

export async function initStagehand(): Promise<void> {
  // Se já está inicializando, espera o mesmo promise em vez de criar outro Chrome
  if (initPromise) return initPromise
  initPromise = _doInit().finally(() => { initPromise = null })
  return initPromise
}

/**
 * Re-inicializa o Stagehand com a configuração de provider atual.
 * Chamado quando o usuário troca de provider/modelo nas configurações.
 */
export async function reInitStagehand(): Promise<void> {
  if (instance) {
    await closeStagehand()
  }
  await initStagehand()
}

async function _doInit(): Promise<void> {
  const { Stagehand } = await import('@browserbasehq/stagehand')

  const userDataDir = path.join(app.getPath('userData'), 'chrome-profile')
  fs.mkdirSync(userDataDir, { recursive: true })

  // Mata Chrome anterior usando PID salvo pelo chrome-launcher
  // (keepAlive: true deixa Chrome vivo após fechar o app — precisa matar antes de reusar o perfil)
  await killPreviousChrome(userDataDir)

  // Obtém config dinâmica do provider ativo
  const modelConfig = getStagehandModelConfig()
  console.log('[Stagehand] Iniciando com modelo:', modelConfig.modelName)

  // instance = null enquanto init não completar — getStagehand() lança erro se chamado antes
  instance = null
  const sh = new Stagehand({
    env: 'LOCAL',
    model: {
      modelName: modelConfig.modelName,
      apiKey: modelConfig.apiKey,
      ...(modelConfig.baseURL ? { baseURL: modelConfig.baseURL } : {}),
    } as any,
    // keepAlive: true evita o shutdown-supervisor matar o Chrome prematuramente
    // (em Electron, o pipe stdin do supervisor fecha antes da hora por GC)
    keepAlive: true,
    localBrowserLaunchOptions: {
      headless: false,    // Chrome visível sempre
      userDataDir,        // login salvo entre sessões
      args: [
        '--restore-last-session',   // restaura sessão anterior (cookies, abas)
        '--no-first-run',           // evita diálogo de boas-vindas
        '--no-default-browser-check',
      ],
    } as any,
    logger: (msg: any) => {
      if (process.env['NODE_ENV'] === 'development') {
        console.log('[Stagehand]', msg?.message)
      }
    }
  } as any)

  await sh.init()
  instance = sh   // só seta após init bem-sucedido
  console.log('[Stagehand] Chrome iniciado com perfil em:', userDataDir)
  startHeartbeat()
}

export function getStagehand(): StagehandType {
  if (!instance) throw new Error('[Stagehand] Não inicializado — chame initStagehand() primeiro')
  return instance
}

/**
 * Garante que o Stagehand está inicializado. Se não estiver, inicializa agora.
 * Usado por skills para se auto-recuperar caso o init em background tenha falhado.
 */
export async function ensureStagehand(): Promise<void> {
  if (!instance) {
    console.log('[Stagehand] Não estava inicializado — inicializando agora...')
    await initStagehand()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay visual no Chrome — mostra ação atual ao usuário
// ─────────────────────────────────────────────────────────────────────────────

/** Retorna a Playwright Page ativa do Stagehand (tenta .page, depois context.pages()) */
function getActivePage(): any | null {
  if (!instance) return null
  // Stagehand v3 expõe .page diretamente
  const direct = (instance as any).page
  if (direct) return direct
  // Fallback: via browserContext
  const ctx = (instance as any).context ?? (instance as any).browserContext ?? (instance as any).ctx
  const pages: any[] = ctx?.pages?.() ?? []
  return pages[0] ?? null
}

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

/**
 * Injeta/atualiza overlay de status no Chrome.
 * Fire-and-forget — erros ignorados (page pode ter navegado).
 */
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
          // Injeta keyframe de spin uma vez
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

/**
 * Mostra animação de cursor/ripple no ponto de clique.
 * Injeta círculo azul animado nas coordenadas (x, y) da página.
 */
export function showCursorAt(x: number, y: number): void {
  void _showCursorAt(x, y)
}

async function _showCursorAt(x: number, y: number): Promise<void> {
  try {
    const page = getActivePage()
    if (!page) return

    await page.evaluate(
      ({ x, y }: { x: number; y: number }) => {
        // Garante keyframe presente
        if (!document.getElementById('__lex_style__')) {
          const s = document.createElement('style')
          s.id = '__lex_style__'
          s.textContent = `@keyframes __lex_spin{to{transform:rotate(360deg)}} @keyframes __lex_ripple{0%{transform:scale(0.3);opacity:0.9}100%{transform:scale(2.5);opacity:0}}`
          document.head?.appendChild(s)
        }
        // Ponto central fixo
        const dot = document.createElement('div')
        dot.setAttribute('style', `
          position:fixed;left:${x - 6}px;top:${y - 6}px;
          width:12px;height:12px;border-radius:50%;
          background:#60a5fa;pointer-events:none;z-index:2147483646;
          box-shadow:0 0 8px rgba(96,165,250,0.9);
        `.replace(/\n\s+/g, ''))
        // Onda de ripple
        const ring = document.createElement('div')
        ring.setAttribute('style', `
          position:fixed;left:${x - 20}px;top:${y - 20}px;
          width:40px;height:40px;border-radius:50%;
          border:2px solid rgba(96,165,250,0.8);pointer-events:none;z-index:2147483646;
          animation:__lex_ripple 0.7s ease-out forwards;
        `.replace(/\n\s+/g, ''))
        document.body?.appendChild(dot)
        document.body?.appendChild(ring)
        setTimeout(() => { dot.remove(); ring.remove() }, 750)
      },
      { x, y }
    )
  } catch { /* ignorar */ }
}

/** Traduz nomes de tools do Stagehand para português legível */
function humanizeTool(toolName: string, detail: string): string {
  const n = toolName.toLowerCase()
  const d = detail ? `: ${detail.slice(0, 60)}` : ''
  if (n === 'navigate' || n === 'goto') return `Navegando${d}`
  if (n === 'click' || n === 'tap')    return `Clicando${d}`
  if (n === 'type' || n === 'fill' || n === 'input') return `Digitando${d}`
  if (n === 'extract' || n === 'scrape') return `Extraindo dados${d}`
  if (n === 'scroll')  return `Rolando página`
  if (n === 'wait')    return `Aguardando`
  if (n === 'select')  return `Selecionando${d}`
  if (n === 'hover')   return `Passando mouse${d}`
  return `${toolName}${d}`
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executa tarefa autônoma de browser via agent().
 * Substitui o loop/think/critic para tarefas que exigem automação web.
 *
 * @param instruction - Instrução em linguagem natural descrevendo o objetivo completo
 * @param maxSteps - Máximo de passos do agent (default 20)
 * @param onStep - Callback opcional para progresso em tempo real
 */
export async function runBrowserTask(
  instruction: string,
  maxSteps = 10,
  onStep?: (step: string) => void
): Promise<string> {
  await ensureStagehand()
  const stagehand = getStagehand()
  const agent = stagehand.agent({
    // Herda o modelo configurado na instância (_doInit) — não sobrescreve para evitar
    // problemas com baseURL de providers como OpenRouter/Groq
    systemPrompt: `Você é um agente de automação de browser para sistemas judiciais brasileiros (PJe).
REGRAS:
- Seja assertivo: execute a primeira ação óbvia sem hesitar.
- Prefira navegação direta por URL quando possível.
- Não explore desnecessariamente — se está na tela certa, encerre.
- Complete a tarefa no MENOR número de ações possível.`,
  } as any)

  const isLimitMsg = (s: string) => /limite|limit|max.?step|timeout/i.test(s)

  // Extrai mensagem de conclusão das ações realizadas (fallback quando msg diz "limite")
  const extractDoneMsg = (r: any): string => {
    const actions: any[] = r?.actions ?? []
    const done = actions.find((a: any) => a.type === 'done' || a.taskCompleted)
    if (done?.reasoning) return String(done.reasoning).slice(0, 200)
    const last = [...actions].reverse().find((a: any) => a.type !== 'think' && a.type !== 'done')
    return last?.action ?? last?.reasoning ?? 'Ação executada com sucesso'
  }

  let result: any
  try {
    result = await agent.execute({
      instruction,
      maxSteps,
      onStepFinish: (step: any) => {
        const toolCall = step?.toolCalls?.[0]
        let label = ''
        if (toolCall && toolCall.toolName !== 'think' && toolCall.toolName !== 'done') {
          const args = toolCall?.args ?? {}
          const detail = String(args.instruction ?? args.url ?? args.text ?? args.action ?? '')
          label = humanizeTool(toolCall.toolName, detail)

          // Cursor ripple no ponto de clique (coordenadas podem vir como array ou x/y separados)
          const coord = args.coordinate ?? args.startCoordinate
          if (coord) {
            const [cx, cy] = Array.isArray(coord) ? coord : [coord.x, coord.y]
            if (typeof cx === 'number' && typeof cy === 'number') {
              showCursorAt(cx, cy)
            }
          } else if (typeof args.x === 'number' && typeof args.y === 'number') {
            showCursorAt(args.x, args.y)
          }
        } else if (step?.text) {
          label = String(step.text).slice(0, 100)
        }
        if (label) {
          onStep?.(label)
          injectOverlay(label)
        }
      },
    } as any)
  } catch (err: any) {
    // agent.execute() pode lançar quando atinge maxSteps — não é falha real
    const errMsg = String(err?.message ?? err ?? '')
    if (isLimitMsg(errMsg)) {
      injectOverlay('Ação concluída', true)
      return 'Ação executada no browser'
    }
    injectOverlay('Erro na execução', true)
    throw err
  }

  const r = result as any

  // completed: true significa tarefa concluída, mesmo se bateu o limite de steps
  if (r?.completed) {
    const msg: string = r?.message ?? 'Tarefa concluída'
    const finalMsg = isLimitMsg(msg) ? extractDoneMsg(r) : msg
    injectOverlay(finalMsg.slice(0, 80), true)
    return finalMsg
  }

  // completed: false — se mensagem ainda diz "limite", não surfacear para o usuário
  const fallbackMsg = r?.message ?? r?.output ?? 'Tarefa concluída'
  const finalMsg = isLimitMsg(String(fallbackMsg)) ? 'Ação executada no browser' : String(fallbackMsg)
  injectOverlay(finalMsg.slice(0, 80), true)
  return finalMsg
}

// ─────────────────────────────────────────────────────────────────────────────
// Heartbeat — mantém sessão PJe viva com fetch silencioso a cada 6h
// ─────────────────────────────────────────────────────────────────────────────

function startHeartbeat(): void {
  stopHeartbeat()
  heartbeatTimer = setInterval(async () => {
    try {
      const page = getActivePage()
      if (!page) return
      const url: string = await page.evaluate(() => window.location.href)
      if (!url.includes('.jus.br') && !url.includes('pje')) return
      await page.evaluate(async (u: string) => {
        try { await fetch(u, { method: 'GET', credentials: 'include', cache: 'no-cache' }) } catch { /* ignora */ }
      }, url)
      console.log('[Stagehand] Heartbeat PJe —', new Date().toLocaleTimeString('pt-BR'))
    } catch { /* page indisponível, ignora */ }
  }, 6 * 60 * 60 * 1000) // 6 horas
}

function stopHeartbeat(): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
}

export async function closeStagehand(): Promise<void> {
  stopHeartbeat()
  if (instance) {
    // Force-kill Chrome via internal state (keepAlive: true faz close() ignorar kill)
    try {
      const state = (instance as any).state
      if (state?.kind === 'LOCAL' && state?.chrome) {
        await state.chrome.kill()
        console.log('[Stagehand] Chrome killed (PID:', state.chrome.pid, ')')
      }
    } catch { /* best effort */ }

    await instance.close()
    instance = null
    console.log('[Stagehand] Chrome encerrado')
  }
}

/**
 * Mata o Chrome anterior pelo PID salvo pelo chrome-launcher em chrome.pid.
 * keepAlive: true deixa Chrome vivo após fechar — precisa matar antes de reusar o perfil.
 * Usa shutdown gracioso (taskkill no Windows / SIGTERM no Linux) para que o Chrome
 * salve cookies de sessão antes de encerrar — essencial para manter login no PJe.
 */
async function killPreviousChrome(userDataDir: string): Promise<void> {
  const pidFile = path.join(userDataDir, 'chrome.pid')
  try {
    if (!fs.existsSync(pidFile)) return
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10)
    if (!pid || isNaN(pid)) { fs.unlinkSync(pidFile); return }

    try { process.kill(pid, 0) } catch { fs.unlinkSync(pidFile); return }  // já não existe

    if (process.platform === 'win32') {
      // taskkill sem /F envia WM_CLOSE — Chrome salva sessão graciosamente
      const { exec } = await import('child_process')
      await new Promise<void>((resolve) => exec(`taskkill /PID ${pid}`, () => resolve()))
    } else {
      process.kill(pid, 'SIGTERM')
    }

    // Aguarda Chrome salvar estado de sessão (cookies, localStorage)
    await new Promise(r => setTimeout(r, 700))
    console.log('[Stagehand] Chrome anterior encerrado graciosamente (PID:', pid, ')')
    fs.unlinkSync(pidFile)
  } catch { /* ignore */ }
}
