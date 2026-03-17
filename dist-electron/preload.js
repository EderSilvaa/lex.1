"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
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
    // Vision AI debug stream (reservado para uso futuro)
    onVisionDebug: (cb) => electron_1.ipcRenderer.on('vision-debug', (_, val) => cb(val)),
    // Multi-conversation persistence
    listConversations: () => electron_1.ipcRenderer.invoke('conversations-list'),
    loadConversation: (id) => electron_1.ipcRenderer.invoke('conversations-load', id),
    saveConversation: (conv) => electron_1.ipcRenderer.invoke('conversations-save', conv),
    deleteConversation: (id) => electron_1.ipcRenderer.invoke('conversations-delete', id),
    seedSession: (sessionId, messages) => electron_1.ipcRenderer.invoke('session-seed', sessionId, messages),
    // Analytics
    getAnalyticsSummary: () => electron_1.ipcRenderer.invoke('analytics-summary'),
    trackMessage: () => electron_1.ipcRenderer.invoke('analytics-track-message'),
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
    // Ollama (Modelo Local)
    ollamaStatus: () => electron_1.ipcRenderer.invoke('ollama-status'),
    ollamaListModels: () => electron_1.ipcRenderer.invoke('ollama-list-models'),
    ollamaRecommended: () => electron_1.ipcRenderer.invoke('ollama-recommended'),
    ollamaPull: (model) => electron_1.ipcRenderer.invoke('ollama-pull', model),
    ollamaDelete: (model) => electron_1.ipcRenderer.invoke('ollama-delete', model),
    ollamaGetRecommendedList: () => electron_1.ipcRenderer.invoke('ollama-get-recommended-list'),
    ollamaIsRunning: () => electron_1.ipcRenderer.invoke('ollama-is-running'),
    ollamaDownloadInstaller: () => electron_1.ipcRenderer.invoke('ollama-download-installer'),
    onOllamaInstallProgress: (cb) => electron_1.ipcRenderer.on('ollama-install-progress', (_, d) => cb(d)),
    offOllamaInstallProgress: () => electron_1.ipcRenderer.removeAllListeners('ollama-install-progress'),
    onOllamaPullProgress: (cb) => electron_1.ipcRenderer.on('ollama-pull-progress', (_, d) => cb(d)),
    onOllamaPullComplete: (cb) => electron_1.ipcRenderer.on('ollama-pull-complete', (_, d) => cb(d)),
    onOllamaPullError: (cb) => electron_1.ipcRenderer.on('ollama-pull-error', (_, d) => cb(d)),
    offOllamaPullEvents: () => {
        electron_1.ipcRenderer.removeAllListeners('ollama-pull-progress');
        electron_1.ipcRenderer.removeAllListeners('ollama-pull-complete');
        electron_1.ipcRenderer.removeAllListeners('ollama-pull-error');
    },
    // Privacidade / Consent
    privacyGetConfig: () => electron_1.ipcRenderer.invoke('privacy-get-config'),
    privacySetLevel: (level) => electron_1.ipcRenderer.invoke('privacy-set-level', level),
    privacySetProviderConsent: (cfg) => electron_1.ipcRenderer.invoke('privacy-set-provider-consent', cfg),
    privacyCompleteOnboarding: (level) => electron_1.ipcRenderer.invoke('privacy-complete-onboarding', level),
    privacyIsOnboardingCompleted: () => electron_1.ipcRenderer.invoke('privacy-is-onboarding-completed'),
    privacyRevokeAll: () => electron_1.ipcRenderer.invoke('privacy-revoke-all'),
    privacyGetEffectiveLevel: (providerId) => electron_1.ipcRenderer.invoke('privacy-get-effective-level', providerId),
    privacyGetAuditSummary: (days) => electron_1.ipcRenderer.invoke('privacy-get-audit-summary', days),
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