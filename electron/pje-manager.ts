import { BrowserView, BrowserWindow, session, WebContents } from 'electron';

export class PJeManager {
    private mainWindow: BrowserWindow;
    private pjeView: BrowserView | null = null;
    public initialized: boolean = false;
    public currentUrl: string | null = null;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    async initialize(): Promise<boolean> {
        console.log('🌐 PJeManager: Initializing PJe BrowserView...');

        if (this.pjeView) {
            console.log('🌐 PJeManager: Already initialized.');
            return true;
        }

        // Create BrowserView
        this.pjeView = new BrowserView({
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
    }

    private setupEventListeners() {
        if (!this.pjeView) return;

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
        if (!this.pjeView) return;

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

    async navigateTo(url: string) {
        if (!this.pjeView) await this.initialize();
        console.log(`🧭 PJeManager: Navigating to ${url}`);
        await this.pjeView?.webContents.loadURL(url);
    }

    async executeScript(script: string): Promise<any> {
        if (!this.pjeView) throw new Error('PJe View not initialized');
        return await this.pjeView.webContents.executeJavaScript(script);
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

    get webContents(): WebContents | undefined {
        return this.pjeView?.webContents;
    }

    async getPageData() {
        if (!this.pjeView) return null;

        return await this.executeScript(`
            ({
                url: window.location.href,
                title: document.title,
                innerText: document.body.innerText.substring(0, 500) // Sample
            })
        `);
    }
}
