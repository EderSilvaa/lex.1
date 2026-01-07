"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('lexApi', {
    saveHistory: (mensagens) => electron_1.ipcRenderer.invoke('save-history', mensagens),
    getHistory: () => electron_1.ipcRenderer.invoke('get-history'),
    savePreferences: (prefs) => electron_1.ipcRenderer.invoke('save-preferences', prefs),
    checkPje: () => electron_1.ipcRenderer.invoke('check-pje')
});
//# sourceMappingURL=preload.js.map