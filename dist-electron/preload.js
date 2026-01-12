"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('dashboardApi', {
    setMode: (mode) => electron_1.ipcRenderer.invoke('dashboard-set-mode', mode),
});
electron_1.contextBridge.exposeInMainWorld('filesApi', {
    selectFolder: () => electron_1.ipcRenderer.invoke('files-select-folder'),
    listFiles: (path) => electron_1.ipcRenderer.invoke('files-list', path),
});
electron_1.contextBridge.exposeInMainWorld('workspacesApi', {
    get: () => electron_1.ipcRenderer.invoke('workspace-get'),
    add: (path) => electron_1.ipcRenderer.invoke('workspace-add', path),
    remove: (path) => electron_1.ipcRenderer.invoke('workspace-remove', path),
});
electron_1.contextBridge.exposeInMainWorld('lexApi', {
    saveHistory: (mensagens) => electron_1.ipcRenderer.invoke('save-history', mensagens),
    getHistory: () => electron_1.ipcRenderer.invoke('get-history'),
    sendChat: (message, context) => electron_1.ipcRenderer.invoke('ai-chat-send', { message, context }),
    savePreferences: (prefs) => electron_1.ipcRenderer.invoke('save-preferences', prefs),
    checkPje: () => electron_1.ipcRenderer.invoke('check-pje'),
    executePlan: (plan) => electron_1.ipcRenderer.invoke('ai-plan-execute', plan),
    searchJurisprudence: (query) => electron_1.ipcRenderer.invoke('crawler-search', query),
    // Browser (PJe) Automation & Tabs
    updateBrowserLayout: (bounds) => electron_1.ipcRenderer.invoke('browser-layout-update', bounds),
    newTab: (url) => electron_1.ipcRenderer.invoke('browser-tab-new', url),
    switchTab: (tabId) => electron_1.ipcRenderer.invoke('browser-tab-switch', tabId),
    closeTab: (tabId) => electron_1.ipcRenderer.invoke('browser-tab-close', tabId),
    // Legacy Hooks (mapped to active tab)
    pjeNavigate: (url) => electron_1.ipcRenderer.invoke('pje-navigate', url),
    pjeExecuteScript: (script) => electron_1.ipcRenderer.invoke('pje-execute-script', script),
    // Events
    onBrowserTabCreated: (cb) => electron_1.ipcRenderer.on('browser-tab-created', (_, val) => cb(val)),
    onBrowserTabActive: (cb) => electron_1.ipcRenderer.on('browser-tab-active', (_, val) => cb(val)),
    onBrowserTabClosed: (cb) => electron_1.ipcRenderer.on('browser-tab-closed', (_, val) => cb(val)),
    onBrowserUpdateUrl: (cb) => electron_1.ipcRenderer.on('browser-update-url', (_, val) => cb(val)),
    onBrowserUpdateTitle: (cb) => electron_1.ipcRenderer.on('browser-update-title', (_, val) => cb(val)),
});
//# sourceMappingURL=preload.js.map