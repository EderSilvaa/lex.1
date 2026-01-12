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
exports.PJeManager = void 0;
const electron_1 = require("electron");
class PJeManager {
    constructor(mainWindow) {
        this.pjeView = null;
        this.initialized = false;
        this.currentUrl = null;
        this.mainWindow = mainWindow;
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('🌐 PJeManager: Initializing PJe BrowserView...');
            if (this.pjeView) {
                console.log('🌐 PJeManager: Already initialized.');
                return true;
            }
            // Create BrowserView
            this.pjeView = new electron_1.BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    javascript: true,
                    images: true,
                    webSecurity: true, // Important for official sites
                    // Preload can be added later if we need deep integration
                }
            });
            // Add to main window
            this.mainWindow.setBrowserView(this.pjeView);
            // Initial Layout (Example: Right half or full content area)
            // We will refine this based on the UI layout later
            this.updateBounds();
            // Auto-resize is tricky with BrowserView, we usually handle it manually on window resize events
            // But basic auto-resize can be set:
            this.pjeView.setAutoResize({
                width: true,
                height: true,
                horizontal: true,
                vertical: true
            });
            this.setupEventListeners();
            this.initialized = true;
            console.log('✅ PJeManager: Initialization complete.');
            return true;
        });
    }
    setupEventListeners() {
        if (!this.pjeView)
            return;
        const webContents = this.pjeView.webContents;
        webContents.on('did-start-loading', () => {
            this.mainWindow.webContents.send('pje-loading-start');
        });
        webContents.on('did-stop-loading', () => {
            this.mainWindow.webContents.send('pje-loading-stop');
        });
        webContents.on('did-navigate', (_event, url) => {
            this.currentUrl = url;
            this.mainWindow.webContents.send('pje-url-changed', url);
        });
        webContents.on('did-navigate-in-page', (_event, url) => {
            this.currentUrl = url;
            this.mainWindow.webContents.send('pje-url-changed', url);
        });
    }
    updateBounds() {
        if (!this.pjeView)
            return;
        // Based on the split layout or specific PJe tab
        const bounds = this.mainWindow.getBounds();
        // Example: If sidebar is ~60px (collapsed) or ~250px (expanded)
        // We need to know the state or just assume a standard layout for now.
        // Let's assume it fills the "main-content" area.
        // IMPORTANT: In a real app, we might need IPC to get exact layout dimensions from renderer.
        // For now, hardcoding a "safe" area avoiding the sidebar (approx 64px)
        this.pjeView.setBounds({
            x: 64, // Sidebar width
            y: 0,
            width: bounds.width - 64,
            height: bounds.height
        });
    }
    navigateTo(url) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.pjeView)
                yield this.initialize();
            console.log(`🧭 PJeManager: Navigating to ${url}`);
            yield ((_a = this.pjeView) === null || _a === void 0 ? void 0 : _a.webContents.loadURL(url));
        });
    }
    executeScript(script) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.pjeView)
                throw new Error('PJe View not initialized');
            return yield this.pjeView.webContents.executeJavaScript(script);
        });
    }
    show() {
        if (this.pjeView) {
            this.mainWindow.setBrowserView(this.pjeView);
            this.updateBounds();
        }
    }
    hide() {
        if (this.pjeView) {
            this.mainWindow.removeBrowserView(this.pjeView);
        }
    }
    get webContents() {
        var _a;
        return (_a = this.pjeView) === null || _a === void 0 ? void 0 : _a.webContents;
    }
    getPageData() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.pjeView)
                return null;
            return yield this.executeScript(`
            ({
                url: window.location.href,
                title: document.title,
                innerText: document.body.innerText.substring(0, 500) // Sample
            })
        `);
        });
    }
}
exports.PJeManager = PJeManager;
//# sourceMappingURL=pje-manager.js.map