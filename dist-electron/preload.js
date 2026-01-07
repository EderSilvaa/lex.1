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
    checkPje: () => electron_1.ipcRenderer.invoke('check-pje')
});
//# sourceMappingURL=preload.js.map