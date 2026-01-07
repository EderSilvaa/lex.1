import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dashboardApi', {
    setMode: (mode: 'home' | 'pje') => ipcRenderer.invoke('dashboard-set-mode', mode),
});

contextBridge.exposeInMainWorld('filesApi', {
    selectFolder: () => ipcRenderer.invoke('files-select-folder'),
    listFiles: (path: string) => ipcRenderer.invoke('files-list', path),
});

contextBridge.exposeInMainWorld('workspacesApi', {
    get: () => ipcRenderer.invoke('workspace-get'),
    add: (path: string) => ipcRenderer.invoke('workspace-add', path),
    remove: (path: string) => ipcRenderer.invoke('workspace-remove', path),
});

contextBridge.exposeInMainWorld('lexApi', {
    saveHistory: (mensagens: any) => ipcRenderer.invoke('save-history', mensagens),
    getHistory: () => ipcRenderer.invoke('get-history'),
    sendChat: (message: string, context?: any) => ipcRenderer.invoke('ai-chat-send', { message, context }),
    savePreferences: (prefs: any) => ipcRenderer.invoke('save-preferences', prefs),
    checkPje: () => ipcRenderer.invoke('check-pje')
});
