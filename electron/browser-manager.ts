import { BrowserView, BrowserWindow, WebContents, ipcMain } from 'electron';
import * as path from 'path';

interface Tab {
    id: number;
    view: BrowserView;
    title: string;
    url: string;
}

export class BrowserManager {
    private mainWindow: BrowserWindow;
    private tabs: Map<number, Tab> = new Map();
    private activeTabId: number | null = null;
    private nextTabId: number = 1;
    private bounds: Electron.Rectangle = { x: 0, y: 0, width: 800, height: 600 };

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    async initialize() {
        // Nothing to do immediately, wait for requests
    }

    createTab(url: string, setActive: boolean = true): number {
        const view = new BrowserView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                // preload: path.join(__dirname, 'preload.js'), // Optional: Inject scripts
                javascript: true,
                webSecurity: true
            }
        });

        const tabId = this.nextTabId++;
        const tab: Tab = {
            id: tabId,
            view: view,
            title: 'Nova Aba',
            url: url
        };

        this.tabs.set(tabId, tab);

        // Events
        view.webContents.on('did-start-loading', () => {
            this.mainWindow.webContents.send('browser-update-loading', { tabId, loading: true });
        });
        view.webContents.on('did-stop-loading', () => {
            this.mainWindow.webContents.send('browser-update-loading', { tabId, loading: false });
        });
        view.webContents.on('did-navigate', (_, navUrl) => {
            tab.url = navUrl;
            this.mainWindow.webContents.send('browser-update-url', { tabId, url: navUrl });
        });
        view.webContents.on('page-title-updated', (_, title) => {
            tab.title = title;
            this.mainWindow.webContents.send('browser-update-title', { tabId, title });
        });

        // Intercept Popups (The "Gold Rule")
        view.webContents.setWindowOpenHandler(({ url }) => {
            console.log(`[BrowserManager] Intercepted popup to: ${url}`);
            this.createTab(url, true); // Open in new internal tab
            return { action: 'deny' };
        });

        view.webContents.loadURL(url);

        if (setActive) {
            this.setActiveTab(tabId);
        }

        this.mainWindow.webContents.send('browser-tab-created', { tabId, url });

        return tabId;
    }

    setActiveTab(tabId: number) {
        if (!this.tabs.has(tabId)) return;

        // Remove current view
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            this.mainWindow.removeBrowserView(this.tabs.get(this.activeTabId)!.view);
        }

        this.activeTabId = tabId;
        const newTab = this.tabs.get(tabId)!;

        this.mainWindow.setBrowserView(newTab.view);
        this.updateViewBounds();

        this.mainWindow.webContents.send('browser-tab-active', { tabId });
    }

    hideView() {
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            // Just detach from window, don't close
            this.mainWindow.setBrowserView(null);
        }
    }

    showView() {
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            const tab = this.tabs.get(this.activeTabId)!;
            this.mainWindow.setBrowserView(tab.view);
            this.updateViewBounds();
        }
    }

    closeTab(tabId: number) {
        if (!this.tabs.has(tabId)) return;

        const tab = this.tabs.get(tabId)!;

        // If active, switch to another
        if (this.activeTabId === tabId) {
            this.mainWindow.removeBrowserView(tab.view);
            this.activeTabId = null;

            // Try to find previous tab (simple logic: last one)
            const remaining = Array.from(this.tabs.keys()).filter(id => id !== tabId);
            if (remaining.length > 0) {
                this.setActiveTab(remaining[remaining.length - 1]);
            }
        }

        // Destroy
        (tab.view.webContents as any).destroy(); // Force release
        this.tabs.delete(tabId);

        this.mainWindow.webContents.send('browser-tab-closed', { tabId });
    }

    updateBounds(bounds: Electron.Rectangle) {
        this.bounds = bounds;
        this.updateViewBounds();
    }

    private updateViewBounds() {
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            const view = this.tabs.get(this.activeTabId)!.view;
            view.setBounds(this.bounds);
            view.setAutoResize({ width: true, height: true }); // Adapts to window resize if bounds don't change logic
        }
    }

    get activeTab(): Tab | undefined {
        return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    }

    // Automation API proxies
    async executeScript(script: string) {
        if (this.activeTab) {
            return await this.activeTab.view.webContents.executeJavaScript(script);
        }
    }

    async navigateTo(url: string) {
        if (this.activeTab) {
            return await this.activeTab.view.webContents.loadURL(url);
        } else {
            this.createTab(url, true);
        }
    }
}
