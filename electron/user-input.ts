/**
 * User Input — canal assíncrono para o agente pedir dados ao usuário em tempo real.
 *
 * Usado para TOTP do Google Authenticator, PIN do token, etc.
 * O agente chama requestUserInput() que suspende a skill até o usuário responder.
 * A resposta chega via Telegram (ou UI) e é entregue via resolveUserInput().
 */

type NotifyFn = (prompt: string) => void | Promise<void>

let notifyFn: NotifyFn | null = null
let pendingResolve: ((value: string) => void) | null = null
let pendingReject: ((reason: any) => void) | null = null
let pendingTimeout: NodeJS.Timeout | null = null

/** Define como notificar o usuário (Telegram, UI, etc.) */
export function setNotifyFn(fn: NotifyFn): void {
    notifyFn = fn
}

/** Verifica se há um input pendente aguardando resposta do usuário */
export function hasPendingInput(): boolean {
    return pendingResolve !== null
}

/**
 * Suspende a execução e aguarda input do usuário.
 * Notifica o usuário via notifyFn (Telegram ou UI) e retorna a resposta.
 * @param prompt - Mensagem a enviar ao usuário
 * @param timeoutMs - Tempo máximo de espera (default: 3 minutos)
 */
export function requestUserInput(prompt: string, timeoutMs = 3 * 60 * 1000): Promise<string> {
    // Cancela request anterior se houver
    if (pendingResolve) {
        pendingReject?.(new Error('Novo request substituiu o anterior'))
        clearPending()
    }

    return new Promise((resolve, reject) => {
        pendingResolve = resolve
        pendingReject = reject

        pendingTimeout = setTimeout(() => {
            clearPending()
            reject(new Error('Timeout: usuário não respondeu em 3 minutos'))
        }, timeoutMs)

        // Notifica usuário (fire-and-forget)
        try { void (notifyFn?.(prompt)) } catch { /* ignora */ }

        console.log('[UserInput] Aguardando input do usuário...')
    })
}

/**
 * Entrega a resposta do usuário para o request pendente.
 * Chamado pelo Telegram bot ou pela UI quando o usuário responde.
 * @returns true se havia um request pendente e foi resolvido
 */
export function resolveUserInput(answer: string): boolean {
    if (!pendingResolve) return false

    const resolve = pendingResolve
    clearPending()
    resolve(answer)
    console.log('[UserInput] Input recebido e entregue ao agente.')
    return true
}

function clearPending(): void {
    if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null }
    pendingResolve = null
    pendingReject = null
}
