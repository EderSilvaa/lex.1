/**
 * BrowserLock — Controle de acesso exclusivo ao Chrome CDP
 *
 * Garante que apenas UM cliente CDP (Playwright OU browser-use) controla o Chrome por vez.
 * Quando browser-use precisa do CDP, Playwright desconecta; quando browser-use termina,
 * Playwright reconecta.
 *
 * Estados:
 *   PLAYWRIGHT_ACTIVE  → Playwright conectado, browser-use bloqueado
 *   RELEASING          → Playwright desconectando
 *   EXTERNAL_ACTIVE    → browser-use rodando, Playwright desconectado
 *   RECLAIMING         → Playwright reconectando
 */

type LockState = 'PLAYWRIGHT_ACTIVE' | 'RELEASING' | 'EXTERNAL_ACTIVE' | 'RECLAIMING';

interface WaitEntry {
    owner: string;
    resolve: () => void;
}

let state: LockState = 'PLAYWRIGHT_ACTIVE';
let currentOwner: string | null = null;
const waitQueue: WaitEntry[] = [];

/** Retorna o estado atual do lock (para debug/logs) */
export function getLockState(): { state: LockState; owner: string | null } {
    return { state, owner: currentOwner };
}

/**
 * Adquire acesso exclusivo ao Chrome para um cliente externo (ex: browser-use).
 * Desconecta Playwright do CDP — Chrome e bridge continuam rodando.
 * Se outro owner já tem o lock, aguarda na fila.
 */
export async function acquireForExternal(owner: string): Promise<void> {
    // Se já está no estado EXTERNAL_ACTIVE com outro owner, espera
    if (state === 'EXTERNAL_ACTIVE' || state === 'RELEASING' || state === 'RECLAIMING') {
        console.log(`[BrowserLock] ${owner} aguardando lock (estado: ${state}, dono: ${currentOwner})`);
        await new Promise<void>(resolve => {
            waitQueue.push({ owner, resolve });
        });
    }

    if (state !== 'PLAYWRIGHT_ACTIVE') {
        // Segurança: se chegou aqui e não está PLAYWRIGHT_ACTIVE, algo errou
        console.warn(`[BrowserLock] Estado inesperado ao adquirir: ${state}. Forçando acquire.`);
    }

    state = 'RELEASING';
    currentOwner = owner;
    console.log(`[BrowserLock] Desconectando Playwright para ${owner}...`);

    try {
        const { disconnectPlaywright } = await import('../browser-manager');
        await disconnectPlaywright();
    } catch (err: any) {
        console.warn(`[BrowserLock] Erro ao desconectar Playwright: ${err.message}`);
        // Continua — Chrome pode já estar desconectado
    }

    state = 'EXTERNAL_ACTIVE';
    console.log(`[BrowserLock] Lock adquirido por ${owner}`);
}

/**
 * Libera o lock do cliente externo e reconecta Playwright.
 */
export async function releaseFromExternal(owner: string): Promise<void> {
    if (currentOwner !== owner) {
        console.warn(`[BrowserLock] ${owner} tentou liberar lock de ${currentOwner}. Ignorando.`);
        return;
    }

    state = 'RECLAIMING';
    console.log(`[BrowserLock] Reconectando Playwright (liberando ${owner})...`);

    try {
        const { reconnectPlaywright } = await import('../browser-manager');
        await reconnectPlaywright();
    } catch (err: any) {
        console.warn(`[BrowserLock] Erro ao reconectar Playwright: ${err.message}`);
        // Não falha — ensureBrowser() vai reconectar na próxima chamada
    }

    currentOwner = null;
    state = 'PLAYWRIGHT_ACTIVE';
    console.log(`[BrowserLock] Playwright reconectado. Lock liberado.`);

    // Notifica próximo da fila, se houver
    const next = waitQueue.shift();
    if (next) {
        next.resolve();
    }
}

/**
 * Executa uma função com acesso exclusivo ao Chrome.
 * Desconecta Playwright antes, reconecta depois (no finally).
 */
export async function withExternalLock<T>(owner: string, fn: () => Promise<T>): Promise<T> {
    await acquireForExternal(owner);
    try {
        return await fn();
    } finally {
        await releaseFromExternal(owner);
    }
}
