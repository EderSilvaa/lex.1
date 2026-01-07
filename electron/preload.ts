import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('lexApi', {
    saveHistory: (mensagens: any) => ipcRenderer.invoke('save-history', mensagens),
    getHistory: () => ipcRenderer.invoke('get-history'),
    savePreferences: (prefs: any) => ipcRenderer.invoke('save-preferences', prefs),
    checkPje: () => ipcRenderer.invoke('check-pje')
});
