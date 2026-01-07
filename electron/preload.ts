import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dashboardApi', {
    setMode: (mode: 'home' | 'pje') => ipcRenderer.invoke('dashboard-set-mode', mode),
});

contextBridge.exposeInMainWorld('lexApi', {
    saveHistory: (mensagens: any) => ipcRenderer.invoke('save-history', mensagens),
    getHistory: () => ipcRenderer.invoke('get-history'),
    savePreferences: (prefs: any) => ipcRenderer.invoke('save-preferences', prefs),
    checkPje: () => ipcRenderer.invoke('check-pje')
});
