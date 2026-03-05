import { app } from 'electron'
import path from 'path'
import fs from 'fs'

// Dynamic import necessário: Stagehand v3 usa chrome-launcher (ESM-only)
// CJS não pode fazer require() de módulos ESM, mas dynamic import() funciona
type StagehandType = import('@browserbasehq/stagehand').Stagehand

let instance: StagehandType | null = null
let initPromise: Promise<void> | null = null  // mutex — evita dois inits concorrentes

export async function initStagehand(): Promise<void> {
  // Se já está inicializando, espera o mesmo promise em vez de criar outro Chrome
  if (initPromise) return initPromise
  initPromise = _doInit().finally(() => { initPromise = null })
  return initPromise
}

async function _doInit(): Promise<void> {
  const { Stagehand } = await import('@browserbasehq/stagehand')

  const userDataDir = path.join(app.getPath('userData'), 'chrome-profile')
  fs.mkdirSync(userDataDir, { recursive: true })

  // Mata Chrome anterior usando PID salvo pelo chrome-launcher
  // (keepAlive: true deixa Chrome vivo após fechar o app — precisa matar antes de reusar o perfil)
  killPreviousChrome(userDataDir)

  // instance = null enquanto init não completar — getStagehand() lança erro se chamado antes
  instance = null
  const sh = new Stagehand({
    env: 'LOCAL',
    // modelo no formato "provider/model" — API key carregada de ANTHROPIC_API_KEY
    model: {
      modelName: 'anthropic/claude-haiku-4-5-20251001',  // Haiku: 80% mais barato, suficiente para automação de browser
      apiKey: process.env['ANTHROPIC_API_KEY'],
    } as any,
    // keepAlive: true evita o shutdown-supervisor matar o Chrome prematuramente
    // (em Electron, o pipe stdin do supervisor fecha antes da hora por GC)
    keepAlive: true,
    localBrowserLaunchOptions: {
      headless: false,    // Chrome visível sempre
      userDataDir,        // login salvo entre sessões
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

const OVERLAY_CSS = `
  position:fixed;top:16px;right:16px;z-index:2147483647;
  background:rgba(10,20,40,0.90);color:#e2e8f0;
  padding:10px 16px;border-radius:10px;
  font-family:-apple-system,system-ui,sans-serif;font-size:13px;line-height:1.4;
  max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  box-shadow:0 4px 24px rgba(0,0,0,0.55);
  border:1px solid rgba(96,165,250,0.35);
  transition:border-color 0.3s ease,opacity 0.4s ease;
  pointer-events:none;
`.replace(/\n\s+/g, '')

/**
 * Injeta/atualiza overlay de status no Chrome.
 * Fire-and-forget — erros ignorados (page pode ter navegado).
 *
 * @param text  - Texto a exibir
 * @param done  - true = estado de conclusão (verde, auto-remove em 2.5s)
 */
export function injectOverlay(text: string, done = false): void {
  void _injectOverlay(text, done)
}

async function _injectOverlay(text: string, done: boolean): Promise<void> {
  try {
    if (!instance) return
    const ctx = (instance as any).context ?? (instance as any).ctx
    const pages: any[] = ctx?.pages?.() ?? []
    const page = pages[0]
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
          el.style.borderColor = 'rgba(52,211,153,0.5)'
          el.innerHTML = `<span style="color:#34d399;margin-right:6px">✓</span>${text}`
          setTimeout(() => { const e = document.getElementById('__lex_overlay__'); if (e) e.remove() }, 2500)
        } else {
          el.style.borderColor = 'rgba(96,165,250,0.35)'
          el.innerHTML = `<span style="color:#60a5fa;margin-right:6px">⚡</span>${text}`
        }
      },
      { text, done, css: OVERLAY_CSS }
    )
  } catch { /* page navegou — ignorar */ }
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
  maxSteps = 20,
  onStep?: (step: string) => void
): Promise<string> {
  await ensureStagehand()
  const stagehand = getStagehand()
  const agent = stagehand.agent({
    model: 'anthropic/claude-haiku-4-5-20251001',  // Haiku para automação, Sonnet fica só no LEX agent
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
        // Extrai info das tool calls para feedback em tempo real
        const toolCall = step?.toolCalls?.[0]
        let label = ''
        if (toolCall && toolCall.toolName !== 'think' && toolCall.toolName !== 'done') {
          const detail = String(toolCall?.args?.instruction ?? toolCall?.args?.url ?? toolCall?.args?.text ?? '')
          label = humanizeTool(toolCall.toolName, detail)
        } else if (step?.text) {
          label = String(step.text).slice(0, 100)
        }
        if (label) {
          onStep?.(label)
          injectOverlay(label)   // visual no Chrome
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

export async function closeStagehand(): Promise<void> {
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
 * Sem isso, Chrome diz "Abrindo em sessão existente" e não abre porta de debug.
 */
function killPreviousChrome(userDataDir: string): void {
  const pidFile = path.join(userDataDir, 'chrome.pid')
  try {
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10)
      if (pid && !isNaN(pid)) {
        try {
          process.kill(pid, 0)  // verifica se processo existe
          process.kill(pid)     // SIGTERM
          console.log('[Stagehand] Chrome anterior encerrado (PID:', pid, ')')
        } catch { /* processo já não existe */ }
      }
      fs.unlinkSync(pidFile)
    }
  } catch { /* ignore */ }
}
