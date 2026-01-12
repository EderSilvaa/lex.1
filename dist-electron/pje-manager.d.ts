import { BrowserWindow, WebContents } from 'electron';
export declare class PJeManager {
    private mainWindow;
    private pjeView;
    initialized: boolean;
    currentUrl: string | null;
    constructor(mainWindow: BrowserWindow);
    initialize(): Promise<boolean>;
    private setupEventListeners;
    updateBounds(): void;
    navigateTo(url: string): Promise<void>;
    executeScript(script: string): Promise<any>;
    show(): void;
    hide(): void;
    get webContents(): WebContents | undefined;
    getPageData(): Promise<any>;
}
//# sourceMappingURL=pje-manager.d.ts.map