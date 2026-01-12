"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserManager = void 0;
const electron_1 = require("electron");
class BrowserManager {
    constructor(mainWindow) {
        this.tabs = new Map();
        this.activeTabId = null;
        this.nextTabId = 1;
        this.bounds = { x: 0, y: 0, width: 800, height: 600 };
        this.mainWindow = mainWindow;
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            // Nothing to do immediately, wait for requests
        });
    }
    createTab(url, setActive = true) {
        const view = new electron_1.BrowserView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                // preload: path.join(__dirname, 'preload.js'), // Optional: Inject scripts
                javascript: true,
                webSecurity: true
            }
        });
        const tabId = this.nextTabId++;
        const tab = {
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
    setActiveTab(tabId) {
        if (!this.tabs.has(tabId))
            return;
        // Remove current view
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            this.mainWindow.removeBrowserView(this.tabs.get(this.activeTabId).view);
        }
        this.activeTabId = tabId;
        const newTab = this.tabs.get(tabId);
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
            const tab = this.tabs.get(this.activeTabId);
            this.mainWindow.setBrowserView(tab.view);
            this.updateViewBounds();
        }
    }
    closeTab(tabId) {
        if (!this.tabs.has(tabId))
            return;
        const tab = this.tabs.get(tabId);
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
        tab.view.webContents.destroy(); // Force release
        this.tabs.delete(tabId);
        this.mainWindow.webContents.send('browser-tab-closed', { tabId });
    }
    updateBounds(bounds) {
        this.bounds = bounds;
        this.updateViewBounds();
    }
    updateViewBounds() {
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            const view = this.tabs.get(this.activeTabId).view;
            view.setBounds(this.bounds);
            view.setAutoResize({ width: true, height: true }); // Adapts to window resize if bounds don't change logic
        }
    }
    get activeTab() {
        return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    }
    // Automation API proxies
    executeScript(script) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.activeTab) {
                return yield this.activeTab.view.webContents.executeJavaScript(script);
            }
        });
    }
    navigateTo(url) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.activeTab) {
                return yield this.activeTab.view.webContents.loadURL(url);
            }
            else {
                this.createTab(url, true);
            }
        });
    }
}
exports.BrowserManager = BrowserManager;
//# sourceMappingURL=browser-manager.js.map