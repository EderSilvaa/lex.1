import { BrowserContext, Page } from 'playwright-core';
/** Deve ser chamado uma vez no boot (main.ts ou backend/server.ts) */
export declare function setUserDataDir(dir: string): void;
export declare function initBrowser(): Promise<void>;
export declare function reInitBrowser(): Promise<void>;
export declare function getBrowserContext(): BrowserContext;
/** Retorna a Page ativa (primeira aba aberta) */
export declare function getActivePage(): Page | null;
/** Garante que o browser está inicializado e a conexão está viva.
 *  Auto-recupera se o Chrome morreu ou a conexão CDP caiu. */
export declare function ensureBrowser(): Promise<void>;
export declare function injectOverlay(text: string, done?: boolean): void;
export declare function showCursorAt(x: number, y: number): void;
export declare function runBrowserTask(instruction: string, maxSteps?: number, onStep?: (step: string) => void): Promise<string>;
export declare function closeBrowser(): Promise<void>;
//# sourceMappingURL=browser-manager.d.ts.map