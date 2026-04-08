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
    focusBrowser: () => electron_1.ipcRenderer.invoke('browser-focus'),
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
    // Training (PJe-Model dataset)
    trainingStats: () => electron_1.ipcRenderer.invoke('training-stats'),
    trainingExport: (options) => electron_1.ipcRenderer.invoke('training-export', options),
});
electron_1.contextBridge.exposeInMainWorld('authApi', {
    signIn: (email, password) => electron_1.ipcRenderer.invoke('auth-sign-in', { email, password }),
    signUp: (email, password) => electron_1.ipcRenderer.invoke('auth-sign-up', { email, password }),
    signInWithGoogle: () => electron_1.ipcRenderer.invoke('auth-google'),
    signOut: () => electron_1.ipcRenderer.invoke('auth-sign-out'),
    checkLicense: () => electron_1.ipcRenderer.invoke('auth-check-license'),
    refreshLicense: () => electron_1.ipcRenderer.invoke('auth-refresh-license'),
    getProfile: () => electron_1.ipcRenderer.invoke('auth-get-profile'),
});
electron_1.contextBridge.exposeInMainWorld('orchestratorApi', {
    /** Retorna snapshot do plano ativo (subtasks + status). Null se nenhum plano rodando. */
    getState: () => electron_1.ipcRenderer.invoke('orchestrator-get-state'),
    /** Cancela o plano em execução. Progresso é salvo em checkpoint. */
    cancel: () => electron_1.ipcRenderer.invoke('orchestrator-cancel'),
    /** Pausa a execução (agentes em andamento terminam; novos não iniciam). */
    pause: () => electron_1.ipcRenderer.invoke('orchestrator-pause'),
    /** Retoma execução pausada. */
    resume: () => electron_1.ipcRenderer.invoke('orchestrator-resume'),
    /** Retorna se o plano está pausado. */
    isPaused: () => electron_1.ipcRenderer.invoke('orchestrator-is-paused'),
    /** Escuta eventos de orquestração (plan_created, subtask_started, etc.) */
    onEvent: (cb) => electron_1.ipcRenderer.on('agent-event', (_, e) => { if (e.type === 'orchestrator')
        cb(e.data); }),
    offEvent: () => electron_1.ipcRenderer.removeAllListeners('agent-event'),
});
electron_1.contextBridge.exposeInMainWorld('checkpointApi', {
    listPending: () => electron_1.ipcRenderer.invoke('checkpoint-list-pending'),
    resume: (planId) => electron_1.ipcRenderer.invoke('checkpoint-resume', { planId }),
    remove: (planId) => electron_1.ipcRenderer.invoke('checkpoint-remove', { planId }),
});
electron_1.contextBridge.exposeInMainWorld('schedulerApi', {
    listGoals: () => electron_1.ipcRenderer.invoke('scheduler-list-goals'),
    addGoal: (goal) => electron_1.ipcRenderer.invoke('scheduler-add-goal', goal),
    updateGoal: (id, updates) => electron_1.ipcRenderer.invoke('scheduler-update-goal', { id, updates }),
    removeGoal: (id) => electron_1.ipcRenderer.invoke('scheduler-remove-goal', id),
    pauseGoal: (id) => electron_1.ipcRenderer.invoke('scheduler-pause-goal', id),
    resumeGoal: (id) => electron_1.ipcRenderer.invoke('scheduler-resume-goal', id),
    runNow: (id) => electron_1.ipcRenderer.invoke('scheduler-run-now', id),
    getRuns: (goalId, limit) => electron_1.ipcRenderer.invoke('scheduler-get-runs', { goalId, limit }),
    getStatus: () => electron_1.ipcRenderer.invoke('scheduler-get-status'),
    setAutoLaunch: (enabled) => electron_1.ipcRenderer.invoke('scheduler-set-auto-launch', enabled),
    getAutoLaunch: () => electron_1.ipcRenderer.invoke('scheduler-get-auto-launch'),
    onSchedulerEvent: (cb) => electron_1.ipcRenderer.on('scheduler-event', (_, e) => cb(e)),
    offSchedulerEvent: () => electron_1.ipcRenderer.removeAllListeners('scheduler-event'),
    onNotificationBadge: (cb) => electron_1.ipcRenderer.on('notification-badge', (_, d) => cb(d)),
    offNotificationBadge: () => electron_1.ipcRenderer.removeAllListeners('notification-badge'),
});
electron_1.contextBridge.exposeInMainWorld('brainApi', {
    getGraph: () => electron_1.ipcRenderer.invoke('brain-get-graph'),
    getSubgraph: (nodeId, depth) => electron_1.ipcRenderer.invoke('brain-get-subgraph', { nodeId, depth }),
    search: (query, types, limit) => electron_1.ipcRenderer.invoke('brain-search', { query, types, limit }),
    getStats: () => electron_1.ipcRenderer.invoke('brain-get-stats'),
    getNode: (nodeId) => electron_1.ipcRenderer.invoke('brain-get-node', nodeId),
    runDream: () => electron_1.ipcRenderer.invoke('brain-run-dream'),
    exportBrain: () => electron_1.ipcRenderer.invoke('brain-export'),
    importBrain: (zipPath) => electron_1.ipcRenderer.invoke('brain-import', zipPath),
    renderMarkdown: () => electron_1.ipcRenderer.invoke('brain-render-markdown'),
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
electron_1.contextBridge.exposeInMainWorld('pluginsApi', {
    list: () => electron_1.ipcRenderer.invoke('plugins-list'),
    getStatus: (pluginId) => electron_1.ipcRenderer.invoke('plugins-get-status', pluginId),
    getAuthConfig: (pluginId) => electron_1.ipcRenderer.invoke('plugins-get-auth-config', pluginId),
    startOAuth: (pluginId, apiKey) => electron_1.ipcRenderer.invoke('plugins-start-oauth', { pluginId, apiKey }),
    disconnect: (pluginId) => electron_1.ipcRenderer.invoke('plugins-disconnect', pluginId),
    onReady: (cb) => electron_1.ipcRenderer.on('plugins-ready', () => cb()),
});
electron_1.contextBridge.exposeInMainWorld('batchApi', {
    // Lote CRUD
    listLotes: () => electron_1.ipcRenderer.invoke('batch-list-lotes'),
    getLote: (id) => electron_1.ipcRenderer.invoke('batch-get-lote', id),
    removeLote: (id) => electron_1.ipcRenderer.invoke('batch-remove-lote', id),
    // Pipeline initiation
    createLote: (input) => electron_1.ipcRenderer.invoke('batch-create-lote', input),
    // HITL approvals
    approveStrategy: (loteId) => electron_1.ipcRenderer.invoke('batch-approve-strategy', loteId),
    approveWave: (loteId, waveIndex, redraftIds) => electron_1.ipcRenderer.invoke('batch-approve-wave', { loteId, waveIndex, redraftIds }),
    approveProtocol: (loteId) => electron_1.ipcRenderer.invoke('batch-approve-protocol', loteId),
    // Controls
    pauseLote: (loteId) => electron_1.ipcRenderer.invoke('batch-pause', loteId),
    resumeLote: (loteId) => electron_1.ipcRenderer.invoke('batch-resume', loteId),
    cancelLote: (loteId) => electron_1.ipcRenderer.invoke('batch-cancel', loteId),
    // Petição editor
    readPeticao: (filePath) => electron_1.ipcRenderer.invoke('batch-read-peticao', filePath),
    savePeticao: (filePath, content) => electron_1.ipcRenderer.invoke('batch-save-peticao', { filePath, content }),
    openFolder: (folderPath) => electron_1.ipcRenderer.invoke('batch-open-folder', folderPath),
    // Export
    exportDocx: (filePath) => electron_1.ipcRenderer.invoke('batch-export-docx', filePath),
    exportPdf: (filePath) => electron_1.ipcRenderer.invoke('batch-export-pdf', filePath),
    // Events
    onBatchEvent: (cb) => electron_1.ipcRenderer.on('batch-event', (_, e) => cb(e)),
    offBatchEvent: () => electron_1.ipcRenderer.removeAllListeners('batch-event'),
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
    create: (sessionId, opts) => electron_1.ipcRenderer.invoke('terminal-create', Object.assign({ sessionId }, opts)),
    write: (sessionId, data) => electron_1.ipcRenderer.invoke('terminal-write', { sessionId, data }),
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
electron_1.contextBridge.exposeInMainWorld('updaterApi', {
    onUpdateAvailable: (cb) => electron_1.ipcRenderer.on('update-available', () => cb()),
    onUpdateDownloaded: (cb) => electron_1.ipcRenderer.on('update-downloaded', () => cb()),
    installNow: () => electron_1.ipcRenderer.invoke('update-install-now'),
});
//# sourceMappingURL=preload.js.map