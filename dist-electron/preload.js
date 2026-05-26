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
    getFileUrl: (path) => electron_1.ipcRenderer.invoke('files-get-url', path),
});
electron_1.contextBridge.exposeInMainWorld('workspacesApi', {
    get: () => electron_1.ipcRenderer.invoke('workspace-get'),
    add: (path) => electron_1.ipcRenderer.invoke('workspace-add', path),
    remove: (path) => electron_1.ipcRenderer.invoke('workspace-remove', path),
});
electron_1.contextBridge.exposeInMainWorld('lexEngineApi', {
    getStatus: () => electron_1.ipcRenderer.invoke('lex-engine-status'),
    ask: (prompt) => electron_1.ipcRenderer.invoke('lex-engine-ask', { prompt }),
});
electron_1.contextBridge.exposeInMainWorld('lexApi', {
    saveHistory: (mensagens) => electron_1.ipcRenderer.invoke('save-history', mensagens),
    getHistory: () => electron_1.ipcRenderer.invoke('get-history'),
    savePreferences: (prefs) => electron_1.ipcRenderer.invoke('save-preferences', prefs),
    getPreferences: () => electron_1.ipcRenderer.invoke('get-preferences'),
    // Provider / API Keys — BYOK multi-provider
    setProvider: (cfg) => electron_1.ipcRenderer.invoke('store-set-provider', cfg),
    getProvider: () => electron_1.ipcRenderer.invoke('store-get-provider'),
    setApiKey: (providerId, key) => electron_1.ipcRenderer.invoke('store-set-api-key', { providerId, key }),
    getApiKeyStatus: (providerId) => electron_1.ipcRenderer.invoke('store-get-api-key-status', providerId),
    testApiKey: (providerId, key) => electron_1.ipcRenderer.invoke('store-test-api-key', { providerId, key }),
    getProviderPresets: () => electron_1.ipcRenderer.invoke('store-get-provider-presets'),
    getLexEngineProviderState: () => electron_1.ipcRenderer.invoke('lex-engine-provider-snapshot'),
    // Aliases legados (retrocompat)
    setAnthropicKey: (key) => electron_1.ipcRenderer.invoke('store-set-anthropic-key', key),
    getAnthropicKeyStatus: () => electron_1.ipcRenderer.invoke('store-get-anthropic-key-status'),
    checkPje: () => electron_1.ipcRenderer.invoke('check-pje'),
    focusBrowser: () => electron_1.ipcRenderer.invoke('browser-focus'),
    searchJurisprudence: (query) => electron_1.ipcRenderer.invoke('crawler-search', query),
    onBackendLog: (cb) => {
        electron_1.ipcRenderer.on('backend-log', (_, entry) => cb(entry));
    },
    offBackendLog: () => {
        electron_1.ipcRenderer.removeAllListeners('backend-log');
    },
    onBackendStatus: (cb) => {
        electron_1.ipcRenderer.on('backend-status', (_, status) => cb(status));
    },
    offBackendStatus: () => {
        electron_1.ipcRenderer.removeAllListeners('backend-status');
    },
    // Vision AI debug stream (reservado para uso futuro)
    onVisionDebug: (cb) => electron_1.ipcRenderer.on('vision-debug', (_, val) => cb(val)),
    // Multi-conversation persistence
    listConversations: () => electron_1.ipcRenderer.invoke('conversations-list'),
    loadConversation: (id) => electron_1.ipcRenderer.invoke('conversations-load', id),
    saveConversation: (conv) => electron_1.ipcRenderer.invoke('conversations-save', conv),
    deleteConversation: (id) => electron_1.ipcRenderer.invoke('conversations-delete', id),
    onConversationsUpdated: (cb) => {
        electron_1.ipcRenderer.on('conversations-updated', (_, summary) => cb(summary));
    },
    offConversationsUpdated: () => {
        electron_1.ipcRenderer.removeAllListeners('conversations-updated');
    },
    // Analytics
    getAnalyticsSummary: () => electron_1.ipcRenderer.invoke('analytics-summary'),
    trackMessage: () => electron_1.ipcRenderer.invoke('analytics-track-message'),
    // RAG — Indexação de documentos do workspace
    ragIndexWorkspace: () => electron_1.ipcRenderer.invoke('rag-index-workspace'),
    ragStats: () => electron_1.ipcRenderer.invoke('rag-stats'),
    // RAG — Legislação (baixa códigos do Planalto e indexa)
    ragDownloadLegislacao: (forcar) => electron_1.ipcRenderer.invoke('rag-download-legislacao', forcar ?? false),
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
    signInWithGoogle: (opts) => electron_1.ipcRenderer.invoke('auth-google', opts || {}),
    signOut: () => electron_1.ipcRenderer.invoke('auth-sign-out'),
    checkLicense: () => electron_1.ipcRenderer.invoke('auth-check-license'),
    refreshLicense: () => electron_1.ipcRenderer.invoke('auth-refresh-license'),
    getProfile: () => electron_1.ipcRenderer.invoke('auth-get-profile'),
});
electron_1.contextBridge.exposeInMainWorld('brainApi', {
    getGraph: () => electron_1.ipcRenderer.invoke('brain-get-graph'),
    getSubgraph: (nodeId, depth) => electron_1.ipcRenderer.invoke('brain-get-subgraph', { nodeId, depth }),
    search: (query, types, limit) => electron_1.ipcRenderer.invoke('brain-search', { query, types, limit }),
    getStats: () => electron_1.ipcRenderer.invoke('brain-get-stats'),
    getNode: (nodeId) => electron_1.ipcRenderer.invoke('brain-get-node', nodeId),
    runDream: (opts) => electron_1.ipcRenderer.invoke('brain-run-dream', opts),
    getDreamHistory: () => electron_1.ipcRenderer.invoke('brain-dream-history'),
    restoreDreamSnapshot: (snapshotPath) => electron_1.ipcRenderer.invoke('brain-restore-dream-snapshot', snapshotPath),
    exportBrain: () => electron_1.ipcRenderer.invoke('brain-export'),
    exportPatterns: () => electron_1.ipcRenderer.invoke('brain-export-patterns'),
    importBrain: (zipPath) => electron_1.ipcRenderer.invoke('brain-import', zipPath),
    renderMarkdown: () => electron_1.ipcRenderer.invoke('brain-render-markdown'),
    // Observer dashboard & aprendizado
    getDashboard: (opts) => electron_1.ipcRenderer.invoke('brain-dashboard', opts),
    getPromotionPreview: (flowId, target) => electron_1.ipcRenderer.invoke('brain-promotion-preview', { flowId, target }),
    savePromotionDraft: (flowId, target) => electron_1.ipcRenderer.invoke('brain-promotion-save-draft', { flowId, target }),
    curatePromotion: (flowId, action) => electron_1.ipcRenderer.invoke('brain-promotion-curate', { flowId, action }),
    getTrace: (traceId) => electron_1.ipcRenderer.invoke('brain-trace', traceId),
    detectFlows: () => electron_1.ipcRenderer.invoke('brain-detect-flows'),
    getPreference: (key, fallback) => electron_1.ipcRenderer.invoke('brain-get-preference', key, fallback),
    setPreference: (key, value) => electron_1.ipcRenderer.invoke('brain-set-preference', key, value),
});
electron_1.contextBridge.exposeInMainWorld('datajudApi', {
    // Profile
    getProfile: () => electron_1.ipcRenderer.invoke('datajud-get-profile'),
    saveProfile: (profile) => electron_1.ipcRenderer.invoke('datajud-save-profile', profile),
    // API Key
    setApiKey: (key) => electron_1.ipcRenderer.invoke('datajud-set-api-key', key),
    hasApiKey: () => electron_1.ipcRenderer.invoke('datajud-has-api-key'),
    // Processos monitorados
    addProcesso: (processo) => electron_1.ipcRenderer.invoke('datajud-add-processo', processo),
    removeProcesso: (numero) => electron_1.ipcRenderer.invoke('datajud-remove-processo', numero),
    listProcessos: () => electron_1.ipcRenderer.invoke('datajud-list-processos'),
    // Search (COLD)
    searchProcesso: (numero, tribunal) => electron_1.ipcRenderer.invoke('datajud-search', { numero, tribunal }),
    // Sync
    triggerHotSync: () => electron_1.ipcRenderer.invoke('datajud-trigger-hot'),
    triggerWarmSync: () => electron_1.ipcRenderer.invoke('datajud-trigger-warm'),
    getSyncState: () => electron_1.ipcRenderer.invoke('datajud-get-sync-state'),
    getStats: () => electron_1.ipcRenderer.invoke('datajud-get-stats'),
    // Events
    onSyncEvent: (cb) => electron_1.ipcRenderer.on('datajud-sync-event', (_, e) => cb(e)),
    offSyncEvent: () => electron_1.ipcRenderer.removeAllListeners('datajud-sync-event'),
});
electron_1.contextBridge.exposeInMainWorld('skillsApi', {
    listCatalog: () => electron_1.ipcRenderer.invoke('skills-catalog-list'),
    getRuntimeSnapshot: () => electron_1.ipcRenderer.invoke('skills-runtime-snapshot'),
    getConnectorsSnapshot: () => electron_1.ipcRenderer.invoke('skills-connectors-snapshot'),
    readSkillFile: (skillPath) => electron_1.ipcRenderer.invoke('skills-read-file', skillPath),
});
electron_1.contextBridge.exposeInMainWorld('agoraApi', {
    listCards: () => electron_1.ipcRenderer.invoke('agora-list-cards'),
    getCard: (id) => electron_1.ipcRenderer.invoke('agora-get-card', id),
    createCard: (input) => electron_1.ipcRenderer.invoke('agora-create-card', input),
    updateCard: (id, updates) => electron_1.ipcRenderer.invoke('agora-update-card', { id, updates }),
    moveCard: (id, direction) => electron_1.ipcRenderer.invoke('agora-move-card', { id, direction }),
    removeCard: (id) => electron_1.ipcRenderer.invoke('agora-remove-card', id),
    commentCard: (id, body, author) => electron_1.ipcRenderer.invoke('agora-comment-card', { id, body, author }),
    getRuns: (id) => electron_1.ipcRenderer.invoke('agora-get-runs', id),
    onAgoraEvent: (cb) => electron_1.ipcRenderer.on('agora-event', (_, e) => cb(e)),
    offAgoraEvent: () => electron_1.ipcRenderer.removeAllListeners('agora-event'),
});
electron_1.contextBridge.exposeInMainWorld('docKnowledgeApi', {
    // Schemas
    listSchemas: () => electron_1.ipcRenderer.invoke('doc-kb-list-schemas'),
    getSchema: (id) => electron_1.ipcRenderer.invoke('doc-kb-get-schema', id),
    searchSchemas: (query) => electron_1.ipcRenderer.invoke('doc-kb-search-schemas', query),
    getCategories: () => electron_1.ipcRenderer.invoke('doc-kb-get-categories'),
    getSchemasByCategory: (cat) => electron_1.ipcRenderer.invoke('doc-kb-schemas-by-category', cat),
    // Examples
    getExamples: (schemaId, limit) => electron_1.ipcRenderer.invoke('doc-kb-get-examples', { schemaId, limit }),
    searchExamples: (query, limit) => electron_1.ipcRenderer.invoke('doc-kb-search-examples', { query, limit }),
    getStats: () => electron_1.ipcRenderer.invoke('doc-kb-get-stats'),
    // Import
    importFolder: (folderPath) => electron_1.ipcRenderer.invoke('doc-kb-import-folder', folderPath),
    importFile: (filePath) => electron_1.ipcRenderer.invoke('doc-kb-import-file', filePath),
    selectAndImport: () => electron_1.ipcRenderer.invoke('doc-kb-select-and-import'),
    // Events
    onImportProgress: (cb) => electron_1.ipcRenderer.on('doc-kb-import-progress', (_, d) => cb(d)),
    offImportProgress: () => electron_1.ipcRenderer.removeAllListeners('doc-kb-import-progress'),
});
electron_1.contextBridge.exposeInMainWorld('terminalApi', {
    create: (sessionId, opts) => electron_1.ipcRenderer.invoke('terminal-create', { sessionId, ...opts }),
    createEngine: (sessionId, opts) => electron_1.ipcRenderer.invoke('terminal-create-engine', { sessionId, ...opts }),
    write: (sessionId, data, opts) => electron_1.ipcRenderer.invoke('terminal-write', { sessionId, data, ...opts }),
    resize: (sessionId, cols, rows) => electron_1.ipcRenderer.invoke('terminal-resize', { sessionId, cols, rows }),
    kill: (sessionId) => electron_1.ipcRenderer.invoke('terminal-kill', sessionId),
    listSessions: () => electron_1.ipcRenderer.invoke('terminal-list-sessions'),
    onData: (cb) => electron_1.ipcRenderer.on('terminal-data', (_, d) => cb(d)),
    onExit: (cb) => electron_1.ipcRenderer.on('terminal-exit', (_, d) => cb(d)),
    offEvents: () => {
        electron_1.ipcRenderer.removeAllListeners('terminal-data');
        electron_1.ipcRenderer.removeAllListeners('terminal-exit');
    },
});
electron_1.contextBridge.exposeInMainWorld('userInputApi', {
    resolve: (answer) => electron_1.ipcRenderer.invoke('user-input-resolve', { answer }),
    onRequested: (cb) => electron_1.ipcRenderer.on('user-input-requested', (_, payload) => cb(payload)),
    offRequested: () => {
        electron_1.ipcRenderer.removeAllListeners('user-input-requested');
    },
});
electron_1.contextBridge.exposeInMainWorld('updaterApi', {
    onUpdateAvailable: (cb) => electron_1.ipcRenderer.on('update-available', () => cb()),
    onUpdateDownloaded: (cb) => electron_1.ipcRenderer.on('update-downloaded', () => cb()),
    installNow: () => electron_1.ipcRenderer.invoke('update-install-now'),
});
electron_1.contextBridge.exposeInMainWorld('appNav', {
    onNavigateTo: (cb) => electron_1.ipcRenderer.on('navigate-to', (_, viewId) => cb(viewId)),
    onUiPayload: (cb) => electron_1.ipcRenderer.on('ui-payload', (_, payload) => cb(payload)),
});
//# sourceMappingURL=preload.js.map