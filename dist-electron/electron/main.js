"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Initialize store (wrapping in async IIFE if needed or top level if supported)
// Note: electron-store is ESM. We might need to handle this.
// For now, let's assume we can use it or we'll fix it if we get an error.
// A safe bet is using a dynamic import or require if it was CJS, but it is ESM.
// We will try dynamic import in initialization if top level fails, but TS might complain.
// Actually, let's use a simple file based storage for now if store is complex, OR just standard approach.
// Let's try standard import. passing 'module': 'commonjs' in tsconfig might cause issue with 'import Store'.
// We will simply use `const Store = require('electron-store');` if it was CJS, but it's not.
// We'll write it as standard import and rely on a possibly adapted environment or just fix it later.
let mainWindow = null;
let store;
function initStore() {
    return __awaiter(this, void 0, void 0, function* () {
        // @ts-ignore
        const { default: Store } = yield Promise.resolve().then(() => __importStar(require('electron-store')));
        store = new Store();
    });
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
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
    if (!electron_1.app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }
    // Inject scripts on load
    mainWindow.webContents.on('did-finish-load', () => {
        injectLexScripts(mainWindow);
    });
}
// Register protocol
electron_1.app.whenReady().then(() => {
    const { protocol } = require('electron');
    protocol.registerFileProtocol('lex-extension', (request, callback) => {
        const url = request.url.replace('lex-extension://', '');
        // We assume files are in the root directory or subdirectories
        // Caution: security risk if not sanitized, but for local app it's acceptable for now
        const filePath = path.join(__dirname, '..', url); // __dirname is electron/ or dist-electron/, parent is root
        callback({ path: filePath });
    });
});
function injectLexScripts(win) {
    return __awaiter(this, void 0, void 0, function* () {
        const currentUrl = win.webContents.getURL();
        console.log('Checking injection for:', currentUrl);
        // Inject Polyfill FIRST
        try {
            const polyfillPath = path.join(__dirname, 'polyfill.js');
            if (fs.existsSync(polyfillPath)) {
                const polyfillContent = fs.readFileSync(polyfillPath, 'utf8');
                yield win.webContents.executeJavaScript(polyfillContent);
            }
            else {
                // If running from dist-electron, polyfill might be in ../electron/polyfill.js or we need to copy it
                // Let's try to resolve it. If __dirname is dist-electron, polyfill.js might not be there unless copied.
                // We should check ../electron/polyfill.js too
                const polyfillSrcPath = path.join(__dirname, '../electron/polyfill.js');
                if (fs.existsSync(polyfillSrcPath)) {
                    const polyfillContent = fs.readFileSync(polyfillSrcPath, 'utf8');
                    yield win.webContents.executeJavaScript(polyfillContent);
                }
            }
        }
        catch (e) {
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
                const matches = script.matches.some((pattern) => {
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
                                    yield win.webContents.executeJavaScript(jsContent);
                                    console.log('Injected JS:', jsFile);
                                }
                                catch (e) {
                                    console.error('Error injecting ' + jsFile, e);
                                }
                            }
                            else {
                                console.error('File not found:', jsPath);
                            }
                        }
                    }
                }
            }
        }
        catch (err) {
            console.error('Error reading manifest or injecting scripts:', err);
        }
    });
}
electron_1.app.whenReady().then(() => __awaiter(void 0, void 0, void 0, function* () {
    yield initStore();
    createWindow();
    electron_1.app.on('activate', function () {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
}));
electron_1.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// IPC Handlers
electron_1.ipcMain.handle('save-history', (_event, messages) => __awaiter(void 0, void 0, void 0, function* () {
    if (store)
        store.set('chatHistory', messages);
    return { success: true };
}));
electron_1.ipcMain.handle('get-history', () => __awaiter(void 0, void 0, void 0, function* () {
    return store ? store.get('chatHistory', []) : [];
}));
electron_1.ipcMain.handle('save-preferences', (_event, prefs) => __awaiter(void 0, void 0, void 0, function* () {
    if (store)
        store.set('userPreferences', prefs);
    return { success: true };
}));
electron_1.ipcMain.handle('check-pje', (event) => {
    // Check if the current window (or sender) is PJe
    // Logic can be improved, for now return true if the URL matches
    const sender = event.sender;
    const url = sender.getURL();
    const isPje = url.includes('pje.jus.br') || url.includes('tjsp.jus.br');
    return { isPje };
});
//# sourceMappingURL=main.js.map