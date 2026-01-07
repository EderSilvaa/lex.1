import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Initialize store (wrapping in async IIFE if needed or top level if supported)
// Note: electron-store is ESM. We might need to handle this.
// For now, let's assume we can use it or we'll fix it if we get an error.
// A safe bet is using a dynamic import or require if it was CJS, but it is ESM.
// We will try dynamic import in initialization if top level fails, but TS might complain.
// Actually, let's use a simple file based storage for now if store is complex, OR just standard approach.
// Let's try standard import. passing 'module': 'commonjs' in tsconfig might cause issue with 'import Store'.
// We will simply use `const Store = require('electron-store');` if it was CJS, but it's not.
// We'll write it as standard import and rely on a possibly adapted environment or just fix it later.

let mainWindow: BrowserWindow | null = null;
let store: any;

async function initStore() {
    // @ts-ignore
    const { default: Store } = await import('electron-store');
    store = new Store();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false // sometimes needed for certain electron features
        }
    });

    // Default to a PJe page or a welcome page
    mainWindow.loadURL('https://pje.tjpa.jus.br/pje/login.seam');

    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }

    // Inject scripts on load
    mainWindow.webContents.on('did-finish-load', () => {
        injectLexScripts(mainWindow!);
    });
}

// Register protocol
app.whenReady().then(() => {
    const { protocol } = require('electron');
    protocol.registerFileProtocol('lex-extension', (request: any, callback: any) => {
        const url = request.url.replace('lex-extension://', '');
        // We assume files are in the root directory or subdirectories
        // Caution: security risk if not sanitized, but for local app it's acceptable for now
        const filePath = path.join(__dirname, '..', url); // __dirname is electron/ or dist-electron/, parent is root
        callback({ path: filePath });
    });
});

async function injectLexScripts(win: BrowserWindow) {
    const currentUrl = win.webContents.getURL();
    console.log('Checking injection for:', currentUrl);

    // Inject Polyfill FIRST
    try {
        const polyfillPath = path.join(__dirname, 'polyfill.js');
        if (fs.existsSync(polyfillPath)) {
            const polyfillContent = fs.readFileSync(polyfillPath, 'utf8');
            await win.webContents.executeJavaScript(polyfillContent);
        } else {
            // If running from dist-electron, polyfill might be in ../electron/polyfill.js or we need to copy it
            // Let's try to resolve it. If __dirname is dist-electron, polyfill.js might not be there unless copied.
            // We should check ../electron/polyfill.js too
            const polyfillSrcPath = path.join(__dirname, '../electron/polyfill.js');
            if (fs.existsSync(polyfillSrcPath)) {
                const polyfillContent = fs.readFileSync(polyfillSrcPath, 'utf8');
                await win.webContents.executeJavaScript(polyfillContent);
            }
        }
    } catch (e) {
        console.error('Error injecting polyfill:', e);
    }

    try {
        const manifestPath = path.join(__dirname, '../manifest.json');
        if (!fs.existsSync(manifestPath)) {
            console.error('Manifest not found at:', manifestPath);
            return;
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const contentScripts = manifest.content_scripts;

        for (const script of contentScripts) {
            // Simple match checking (glob pattern matching would be better, but simple verify for now)
            const matches = script.matches.some((pattern: string) => {
                const regexPattern = pattern
                    .replace(/\*/g, '.*')
                    .replace(/\//g, '\\/')
                    .replace(/\?/g, '\\?');
                return new RegExp(regexPattern).test(currentUrl);
            });

            if (matches) {
                console.log('Match found, injecting scripts...');

                // Inject CSS
                if (script.css) {
                    for (const cssFile of script.css) {
                        const cssPath = path.join(__dirname, '..', cssFile);
                        if (fs.existsSync(cssPath)) {
                            const cssContent = fs.readFileSync(cssPath, 'utf8');
                            win.webContents.insertCSS(cssContent);
                            console.log('Injected CSS:', cssFile);
                        }
                    }
                }

                // Inject JS
                if (script.js) {
                    for (const jsFile of script.js) {
                        const jsPath = path.join(__dirname, '..', jsFile);
                        if (fs.existsSync(jsPath)) {
                            const jsContent = fs.readFileSync(jsPath, 'utf8');
                            // Execute in the page
                            // using executeJavaScript with userGesture: false (default)
                            // We wrap in try/catch to prevent stopping on error
                            try {
                                await win.webContents.executeJavaScript(jsContent);
                                console.log('Injected JS:', jsFile);
                            } catch (e) {
                                console.error('Error injecting ' + jsFile, e);
                            }
                        } else {
                            console.error('File not found:', jsPath);
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error reading manifest or injecting scripts:', err);
    }
}

app.whenReady().then(async () => {
    await initStore();
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('save-history', async (_event, messages) => {
    if (store) store.set('chatHistory', messages);
    return { success: true };
});

ipcMain.handle('get-history', async () => {
    return store ? store.get('chatHistory', []) : [];
});

ipcMain.handle('save-preferences', async (_event, prefs) => {
    if (store) store.set('userPreferences', prefs);
    return { success: true };
});

ipcMain.handle('check-pje', (event) => {
    // Check if the current window (or sender) is PJe
    // Logic can be improved, for now return true if the URL matches
    const sender = event.sender;
    const url = sender.getURL();
    const isPje = url.includes('pje.jus.br') || url.includes('tjsp.jus.br');
    return { isPje };
});
