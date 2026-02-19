import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dashboardApi', {
    setMode: (mode: 'home' | 'pje') => ipcRenderer.invoke('dashboard-set-mode', mode),
});

contextBridge.exposeInMainWorld('filesApi', {
    selectFolder: () => ipcRenderer.invoke('files-select-folder'),
    listFiles: (path: string) => ipcRenderer.invoke('files-list', path),
    readFile: (path: string) => ipcRenderer.invoke('files-read', path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke('files-write', { path, content }),
    saveDocument: (name: string, content: string) => ipcRenderer.invoke('files-save-document', { name, content }),
    selectFile: (filters?: any[]) => ipcRenderer.invoke('files-select-file', filters),
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
    checkPje: () => ipcRenderer.invoke('check-pje'),
    executePlan: (plan: any) => ipcRenderer.invoke('ai-plan-execute', plan),
    searchJurisprudence: (query: string) => ipcRenderer.invoke('crawler-search', query),

    // Agent Loop API
    runAgent: (objetivo: string) => ipcRenderer.invoke('agent-run', objetivo),
    cancelAgent: () => ipcRenderer.invoke('agent-cancel'),
    onAgentEvent: (cb: (event: { type: string; data: any }) => void) => {
        ipcRenderer.on('agent-event', (_, event) => cb(event));
    },
    offAgentEvent: () => {
        ipcRenderer.removeAllListeners('agent-event');
    },

    // Browser (PJe) Automation & Tabs
    updateBrowserLayout: (bounds: any) => ipcRenderer.invoke('browser-layout-update', bounds),
    newTab: (url?: string) => ipcRenderer.invoke('browser-tab-new', url),
    switchTab: (tabId: number) => ipcRenderer.invoke('browser-tab-switch', tabId),
    closeTab: (tabId: number) => ipcRenderer.invoke('browser-tab-close', tabId),

    // Legacy Hooks (mapped to active tab)
    pjeNavigate: (url: string) => ipcRenderer.invoke('pje-navigate', url),

    // Events
    onBrowserTabCreated: (cb: any) => ipcRenderer.on('browser-tab-created', (_, val) => cb(val)),
    onBrowserTabActive: (cb: any) => ipcRenderer.on('browser-tab-active', (_, val) => cb(val)),
    onBrowserTabClosed: (cb: any) => ipcRenderer.on('browser-tab-closed', (_, val) => cb(val)),
    onBrowserUpdateUrl: (cb: any) => ipcRenderer.on('browser-update-url', (_, val) => cb(val)),
    onBrowserUpdateTitle: (cb: any) => ipcRenderer.on('browser-update-title', (_, val) => cb(val)),
});
