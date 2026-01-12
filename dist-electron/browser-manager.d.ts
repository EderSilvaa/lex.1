import { BrowserView, BrowserWindow } from 'electron';
interface Tab {
    id: number;
    view: BrowserView;
    title: string;
    url: string;
}
export declare class BrowserManager {
    private mainWindow;
    private tabs;
    private activeTabId;
    private nextTabId;
    private bounds;
    constructor(mainWindow: BrowserWindow);
    initialize(): Promise<void>;
    createTab(url: string, setActive?: boolean): number;
    setActiveTab(tabId: number): void;
    hideView(): void;
    showView(): void;
    closeTab(tabId: number): void;
    updateBounds(bounds: Electron.Rectangle): void;
    private updateViewBounds;
    get activeTab(): Tab | undefined;
    executeScript(script: string): Promise<any>;
    navigateTo(url: string): Promise<void>;
}
export {};
//# sourceMappingURL=browser-manager.d.ts.map