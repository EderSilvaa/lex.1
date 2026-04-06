import { BrowserContext, Page } from 'playwright-core';
/** Deve ser chamado uma vez no boot (main.ts ou backend/server.ts) */
export declare function setUserDataDir(dir: string): void;
export declare function initBrowser(): Promise<void>;
export declare function reInitBrowser(): Promise<void>;
export declare function getBrowserContext(): BrowserContext;
/** Retorna a Page ativa (rastreia aba ativa por índice) */
export declare function getActivePage(): Page | null;
/** Define qual aba é a ativa por índice */
export declare function setActivePage(index: number): void;
/** Retorna o índice da aba ativa */
export declare function getActivePageIndex(): number;
export declare function ensureBrowser(): Promise<void>;
export declare function injectOverlay(text: string, done?: boolean): void;
export declare function showCursorAt(x: number, y: number): void;
export interface ElementRef {
    ref: number;
    selector: string;
    tag: string;
    type: string;
    text: string;
    role: string;
}
/** Armazena refs coletados pelo browser_get_state */
export declare function storeElementRefs(refs: ElementRef[], url: string): void;
/** Resolve ref numérico para ElementRef */
export declare function resolveElementRef(ref: number): ElementRef | null;
/** Verifica se os refs estão potencialmente stale (URL mudou) */
export declare function isRefMapStale(currentUrl: string): boolean;
/**
 * Encontra elemento pelo texto visível (case-insensitive, accent-insensitive).
 * Retorna o melhor match dos refs armazenados, ou constrói seletor text-based.
 */
export declare function findElementByText(texto: string): {
    selector: string;
    source: 'ref' | 'constructed';
} | null;
export interface ResolveTargetResult {
    selector: string;
    source: 'ref' | 'elemento' | 'seletor';
    refInfo?: ElementRef;
}
/**
 * Resolve target de elemento: ref → elemento → seletor.
 * Usado por todas as skills de ação browser (click, fill, type).
 */
export declare function resolveTarget(params: {
    ref?: number;
    elemento?: string;
    seletor?: string;
}): ResolveTargetResult | null;
/** Tenta fill no main frame e depois em todos os iframes */
export declare function fillInFrames(page: Page, selector: string, value: string): Promise<void>;
/** Tenta click no main frame e depois em todos os iframes */
export declare function clickInFrames(page: Page, selector: string): Promise<void>;
/** Tenta type no main frame: foca o elemento e digita keystroke-by-keystroke */
export declare function typeInFrames(page: Page, selector: string, text: string, options?: {
    delay?: number;
}): Promise<void>;
/** Tenta waitForSelector no main frame e depois em todos os iframes */
export declare function waitForSelectorInFrames(page: Page, selector: string, options?: {
    timeout?: number;
    state?: 'attached' | 'visible' | 'hidden';
}): Promise<void>;
export interface SmartClickResult {
    success: boolean;
    strategy: 'selector' | 'retry' | 'text' | 'coordinates' | 'none';
    selector?: string;
    coordinates?: {
        x: number;
        y: number;
    };
    error?: string;
}
/**
 * Click inteligente com waterfall de estratégias:
 * 1. Seletor CSS direto (iframe-aware)
 * 2. Wait 500ms + retry seletor (DOM pode estar carregando)
 * 3. Busca por texto visível do elemento (fallback text-based)
 * 4. Localiza bounding box e clica por coordenadas
 */
export declare function smartClick(page: Page, selector: string, options?: {
    duplo?: boolean;
    timeout?: number;
}): Promise<SmartClickResult>;
export declare function runBrowserTask(instruction: string, maxSteps?: number, onStep?: (step: string) => void): Promise<string>;
export declare function closeBrowser(): Promise<void>;
/**
 * Desconecta Playwright do CDP sem matar Chrome nem bridge.
 * Usado pelo BrowserLock para liberar a porta CDP para browser-use.
 */
export declare function disconnectPlaywright(): Promise<void>;
/**
 * Reconecta Playwright ao Chrome via bridge proxy-only.
 * Reutiliza a lógica de recovery do bridgeDied.
 * Usado pelo BrowserLock após browser-use terminar.
 */
export declare function reconnectPlaywright(): Promise<void>;
//# sourceMappingURL=browser-manager.d.ts.map