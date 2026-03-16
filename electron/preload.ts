import { contextBridge, ipcRenderer } from 'electron';

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
    getPreferences: () => ipcRenderer.invoke('get-preferences'),
    // Provider / API Keys — BYOK multi-provider
    setProvider: (cfg: { providerId: string; agentModel: string; visionModel: string }) =>
        ipcRenderer.invoke('store-set-provider', cfg),
    getProvider: () => ipcRenderer.invoke('store-get-provider'),
    setApiKey: (providerId: string, key: string) =>
        ipcRenderer.invoke('store-set-api-key', { providerId, key }),
    getApiKeyStatus: (providerId: string) =>
        ipcRenderer.invoke('store-get-api-key-status', providerId),
    getProviderPresets: () => ipcRenderer.invoke('store-get-provider-presets'),
    // Aliases legados (retrocompat)
    setAnthropicKey: (key: string) => ipcRenderer.invoke('store-set-anthropic-key', key),
    getAnthropicKeyStatus: () => ipcRenderer.invoke('store-get-anthropic-key-status'),
    checkPje: () => ipcRenderer.invoke('check-pje'),
    executePlan: (plan: any) => ipcRenderer.invoke('ai-plan-execute', plan),
    searchJurisprudence: (query: string) => ipcRenderer.invoke('crawler-search', query),

    // Agent Loop API
    runAgent: (objetivo: string, config?: any, sessionId?: string) => ipcRenderer.invoke('agent-run', objetivo, config, sessionId),
    shouldUseAgent: (objetivo: string) => ipcRenderer.invoke('agent-should-handle', objetivo),
    cancelAgent: () => ipcRenderer.invoke('agent-cancel'),
    onAgentEvent: (cb: (event: { type: string; data: any }) => void) => {
        ipcRenderer.on('agent-event', (_, event) => cb(event));
    },
    offAgentEvent: () => {
        ipcRenderer.removeAllListeners('agent-event');
    },

    // Vision AI debug stream (reservado para uso futuro)
    onVisionDebug: (cb: (data: any) => void) => ipcRenderer.on('vision-debug', (_, val) => cb(val)),

    // Multi-conversation persistence
    listConversations: () => ipcRenderer.invoke('conversations-list'),
    loadConversation: (id: string) => ipcRenderer.invoke('conversations-load', id),
    saveConversation: (conv: any) => ipcRenderer.invoke('conversations-save', conv),
    deleteConversation: (id: string) => ipcRenderer.invoke('conversations-delete', id),
    seedSession: (sessionId: string, messages: any[]) => ipcRenderer.invoke('session-seed', sessionId, messages),

    // RAG — Indexação de documentos do workspace
    ragIndexWorkspace: () => ipcRenderer.invoke('rag-index-workspace'),
    ragStats: () => ipcRenderer.invoke('rag-stats'),

    // RAG — Legislação (baixa códigos do Planalto e indexa)
    ragDownloadLegislacao: (forcar?: boolean) => ipcRenderer.invoke('rag-download-legislacao', forcar ?? false),
    ragLegislacaoStats: () => ipcRenderer.invoke('rag-legislacao-stats'),
    onRagLegislacaoProgress: (cb: (msg: string) => void) => ipcRenderer.on('rag-legislacao-progress', (_, msg) => cb(msg)),
    offRagLegislacaoProgress: () => ipcRenderer.removeAllListeners('rag-legislacao-progress'),

    // Modo 24/7 — Telegram Bot
    telegramGetConfig: () => ipcRenderer.invoke('telegram-get-config'),
    telegramSetConfig: (cfg: { token: string; userId: number }) => ipcRenderer.invoke('telegram-set-config', cfg),
    telegramEnable: () => ipcRenderer.invoke('telegram-enable'),
    telegramDisable: () => ipcRenderer.invoke('telegram-disable'),
    telegramGetStatus: () => ipcRenderer.invoke('telegram-get-status'),
});

contextBridge.exposeInMainWorld('authApi', {
    signIn: (email: string, password: string) => ipcRenderer.invoke('auth-sign-in', { email, password }),
    signUp: (email: string, password: string) => ipcRenderer.invoke('auth-sign-up', { email, password }),
    signOut: () => ipcRenderer.invoke('auth-sign-out'),
    checkLicense: () => ipcRenderer.invoke('auth-check-license'),
    refreshLicense: () => ipcRenderer.invoke('auth-refresh-license'),
});

contextBridge.exposeInMainWorld('updaterApi', {
    onUpdateAvailable:  (cb: () => void) => ipcRenderer.on('update-available',  () => cb()),
    onUpdateDownloaded: (cb: () => void) => ipcRenderer.on('update-downloaded', () => cb()),
    installNow: () => ipcRenderer.invoke('update-install-now'),
});
