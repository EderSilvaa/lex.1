"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('dashboardApi', {
    setMode: (mode) => electron_1.ipcRenderer.invoke('dashboard-set-mode', mode),
});
electron_1.contextBridge.exposeInMainWorld('filesApi', {
    selectFolder: () => electron_1.ipcRenderer.invoke('files-select-folder'),
    listFiles: (path) => electron_1.ipcRenderer.invoke('files-list', path),
    readFile: (path) => electron_1.ipcRenderer.invoke('files-read', path),
    writeFile: (path, content) => electron_1.ipcRenderer.invoke('files-write', { path, content }),
    saveDocument: (name, content) => electron_1.ipcRenderer.invoke('files-save-document', { name, content }),
    selectFile: (filters) => electron_1.ipcRenderer.invoke('files-select-file', filters),
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
    getPreferences: () => electron_1.ipcRenderer.invoke('get-preferences'),
    // Provider / API Keys — BYOK multi-provider
    setProvider: (cfg) => electron_1.ipcRenderer.invoke('store-set-provider', cfg),
    getProvider: () => electron_1.ipcRenderer.invoke('store-get-provider'),
    setApiKey: (providerId, key) => electron_1.ipcRenderer.invoke('store-set-api-key', { providerId, key }),
    getApiKeyStatus: (providerId) => electron_1.ipcRenderer.invoke('store-get-api-key-status', providerId),
    getProviderPresets: () => electron_1.ipcRenderer.invoke('store-get-provider-presets'),
    // Aliases legados (retrocompat)
    setAnthropicKey: (key) => electron_1.ipcRenderer.invoke('store-set-anthropic-key', key),
    getAnthropicKeyStatus: () => electron_1.ipcRenderer.invoke('store-get-anthropic-key-status'),
    checkPje: () => electron_1.ipcRenderer.invoke('check-pje'),
    executePlan: (plan) => electron_1.ipcRenderer.invoke('ai-plan-execute', plan),
    searchJurisprudence: (query) => electron_1.ipcRenderer.invoke('crawler-search', query),
    // Agent Loop API
    runAgent: (objetivo, config, sessionId) => electron_1.ipcRenderer.invoke('agent-run', objetivo, config, sessionId),
    shouldUseAgent: (objetivo) => electron_1.ipcRenderer.invoke('agent-should-handle', objetivo),
    cancelAgent: () => electron_1.ipcRenderer.invoke('agent-cancel'),
    onAgentEvent: (cb) => {
        electron_1.ipcRenderer.on('agent-event', (_, event) => cb(event));
    },
    offAgentEvent: () => {
        electron_1.ipcRenderer.removeAllListeners('agent-event');
    },
    // Browser (PJe) Automation & Tabs
    updateBrowserLayout: (bounds) => electron_1.ipcRenderer.invoke('browser-layout-update', bounds),
    expandBrowserToFill: (sidebarWidth) => electron_1.ipcRenderer.invoke('browser-expand-to-fill', sidebarWidth !== null && sidebarWidth !== void 0 ? sidebarWidth : 228),
    newTab: (url) => electron_1.ipcRenderer.invoke('browser-tab-new', url),
    switchTab: (tabId) => electron_1.ipcRenderer.invoke('browser-tab-switch', tabId),
    closeTab: (tabId) => electron_1.ipcRenderer.invoke('browser-tab-close', tabId),
    // Legacy Hooks (mapped to active tab)
    pjeNavigate: (url) => electron_1.ipcRenderer.invoke('pje-navigate', url),
    // Events
    onBrowserTabCreated: (cb) => electron_1.ipcRenderer.on('browser-tab-created', (_, val) => cb(val)),
    onBrowserTabActive: (cb) => electron_1.ipcRenderer.on('browser-tab-active', (_, val) => cb(val)),
    onBrowserTabClosed: (cb) => electron_1.ipcRenderer.on('browser-tab-closed', (_, val) => cb(val)),
    onBrowserUpdateUrl: (cb) => electron_1.ipcRenderer.on('browser-update-url', (_, val) => cb(val)),
    onBrowserUpdateTitle: (cb) => electron_1.ipcRenderer.on('browser-update-title', (_, val) => cb(val)),
    onBrowserLoadState: (cb) => electron_1.ipcRenderer.on('browser-load-state', (_, val) => cb(val)),
    // Vision AI debug stream
    onVisionDebug: (cb) => electron_1.ipcRenderer.on('vision-debug', (_, val) => cb(val)),
    // Multi-conversation persistence
    listConversations: () => electron_1.ipcRenderer.invoke('conversations-list'),
    loadConversation: (id) => electron_1.ipcRenderer.invoke('conversations-load', id),
    saveConversation: (conv) => electron_1.ipcRenderer.invoke('conversations-save', conv),
    deleteConversation: (id) => electron_1.ipcRenderer.invoke('conversations-delete', id),
    seedSession: (sessionId, messages) => electron_1.ipcRenderer.invoke('session-seed', sessionId, messages),
    // RAG — Indexação de documentos do workspace
    ragIndexWorkspace: () => electron_1.ipcRenderer.invoke('rag-index-workspace'),
    ragStats: () => electron_1.ipcRenderer.invoke('rag-stats'),
    // RAG — Legislação (baixa códigos do Planalto e indexa)
    ragDownloadLegislacao: (forcar) => electron_1.ipcRenderer.invoke('rag-download-legislacao', forcar !== null && forcar !== void 0 ? forcar : false),
    ragLegislacaoStats: () => electron_1.ipcRenderer.invoke('rag-legislacao-stats'),
    onRagLegislacaoProgress: (cb) => electron_1.ipcRenderer.on('rag-legislacao-progress', (_, msg) => cb(msg)),
    offRagLegislacaoProgress: () => electron_1.ipcRenderer.removeAllListeners('rag-legislacao-progress'),
    // Modo 24/7 — Telegram Bot
    telegramGetConfig: () => electron_1.ipcRenderer.invoke('telegram-get-config'),
    telegramSetConfig: (cfg) => electron_1.ipcRenderer.invoke('telegram-set-config', cfg),
    telegramEnable: () => electron_1.ipcRenderer.invoke('telegram-enable'),
    telegramDisable: () => electron_1.ipcRenderer.invoke('telegram-disable'),
    telegramGetStatus: () => electron_1.ipcRenderer.invoke('telegram-get-status'),
});
electron_1.contextBridge.exposeInMainWorld('authApi', {
    signIn: (email, password) => electron_1.ipcRenderer.invoke('auth-sign-in', { email, password }),
    signUp: (email, password) => electron_1.ipcRenderer.invoke('auth-sign-up', { email, password }),
    signOut: () => electron_1.ipcRenderer.invoke('auth-sign-out'),
    checkLicense: () => electron_1.ipcRenderer.invoke('auth-check-license'),
    refreshLicense: () => electron_1.ipcRenderer.invoke('auth-refresh-license'),
});
electron_1.contextBridge.exposeInMainWorld('updaterApi', {
    onUpdateAvailable: (cb) => electron_1.ipcRenderer.on('update-available', () => cb()),
    onUpdateDownloaded: (cb) => electron_1.ipcRenderer.on('update-downloaded', () => cb()),
    installNow: () => electron_1.ipcRenderer.invoke('update-install-now'),
});
//# sourceMappingURL=preload.js.map