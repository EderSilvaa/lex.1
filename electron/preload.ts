import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('filesApi', {
    selectFolder: () => ipcRenderer.invoke('files-select-folder'),
    listFiles: (path: string) => ipcRenderer.invoke('files-list', path),
    readFile: (path: string) => ipcRenderer.invoke('files-read', path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke('files-write', { path, content }),
    saveDocument: (name: string, content: string) => ipcRenderer.invoke('files-save-document', { name, content }),
    selectFile: (filters?: any[]) => ipcRenderer.invoke('files-select-file', filters),
    getFileUrl: (path: string) => ipcRenderer.invoke('files-get-url', path),
});

contextBridge.exposeInMainWorld('workspacesApi', {
    get: () => ipcRenderer.invoke('workspace-get'),
    add: (path: string) => ipcRenderer.invoke('workspace-add', path),
    remove: (path: string) => ipcRenderer.invoke('workspace-remove', path),
});

contextBridge.exposeInMainWorld('lexEngineApi', {
    getStatus: () => ipcRenderer.invoke('lex-engine-status'),
    ask: (prompt: string) => ipcRenderer.invoke('lex-engine-ask', { prompt }),
});

contextBridge.exposeInMainWorld('lexApi', {
    saveHistory: (mensagens: any) => ipcRenderer.invoke('save-history', mensagens),
    getHistory: () => ipcRenderer.invoke('get-history'),
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
    testApiKey: (providerId: string, key: string) =>
        ipcRenderer.invoke('store-test-api-key', { providerId, key }),
    getProviderPresets: () => ipcRenderer.invoke('store-get-provider-presets'),
    getLexEngineProviderState: () => ipcRenderer.invoke('lex-engine-provider-snapshot'),
    // Aliases legados (retrocompat)
    setAnthropicKey: (key: string) => ipcRenderer.invoke('store-set-anthropic-key', key),
    getAnthropicKeyStatus: () => ipcRenderer.invoke('store-get-anthropic-key-status'),
    checkPje: () => ipcRenderer.invoke('check-pje'),
    focusBrowser: () => ipcRenderer.invoke('browser-focus'),
    searchJurisprudence: (query: string) => ipcRenderer.invoke('crawler-search', query),

    onBackendLog: (cb: (entry: any) => void) => {
        ipcRenderer.on('backend-log', (_, entry) => cb(entry));
    },
    offBackendLog: () => {
        ipcRenderer.removeAllListeners('backend-log');
    },
    onBackendStatus: (cb: (status: any) => void) => {
        ipcRenderer.on('backend-status', (_, status) => cb(status));
    },
    offBackendStatus: () => {
        ipcRenderer.removeAllListeners('backend-status');
    },

    // Vision AI debug stream (reservado para uso futuro)
    onVisionDebug: (cb: (data: any) => void) => ipcRenderer.on('vision-debug', (_, val) => cb(val)),

    // Multi-conversation persistence
    listConversations: () => ipcRenderer.invoke('conversations-list'),
    loadConversation: (id: string) => ipcRenderer.invoke('conversations-load', id),
    saveConversation: (conv: any) => ipcRenderer.invoke('conversations-save', conv),
    deleteConversation: (id: string) => ipcRenderer.invoke('conversations-delete', id),
    onConversationsUpdated: (cb: (summary: any) => void) => {
        ipcRenderer.on('conversations-updated', (_, summary) => cb(summary));
    },
    offConversationsUpdated: () => {
        ipcRenderer.removeAllListeners('conversations-updated');
    },

    // Analytics
    getAnalyticsSummary: () => ipcRenderer.invoke('analytics-summary'),
    trackMessage: () => ipcRenderer.invoke('analytics-track-message'),

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

    // Ollama (Modelo Local)
    ollamaStatus: () => ipcRenderer.invoke('ollama-status'),
    ollamaListModels: () => ipcRenderer.invoke('ollama-list-models'),
    ollamaRecommended: () => ipcRenderer.invoke('ollama-recommended'),
    ollamaPull: (model: string) => ipcRenderer.invoke('ollama-pull', model),
    ollamaDelete: (model: string) => ipcRenderer.invoke('ollama-delete', model),
    ollamaGetRecommendedList: () => ipcRenderer.invoke('ollama-get-recommended-list'),
    ollamaIsRunning: () => ipcRenderer.invoke('ollama-is-running'),
    ollamaDownloadInstaller: () => ipcRenderer.invoke('ollama-download-installer'),
    onOllamaInstallProgress: (cb: (data: any) => void) => ipcRenderer.on('ollama-install-progress', (_, d) => cb(d)),
    offOllamaInstallProgress: () => ipcRenderer.removeAllListeners('ollama-install-progress'),
    onOllamaPullProgress: (cb: (data: any) => void) => ipcRenderer.on('ollama-pull-progress', (_, d) => cb(d)),
    onOllamaPullComplete: (cb: (data: any) => void) => ipcRenderer.on('ollama-pull-complete', (_, d) => cb(d)),
    onOllamaPullError: (cb: (data: any) => void) => ipcRenderer.on('ollama-pull-error', (_, d) => cb(d)),
    offOllamaPullEvents: () => {
        ipcRenderer.removeAllListeners('ollama-pull-progress');
        ipcRenderer.removeAllListeners('ollama-pull-complete');
        ipcRenderer.removeAllListeners('ollama-pull-error');
    },

    // Privacidade / Consent
    privacyGetConfig: () => ipcRenderer.invoke('privacy-get-config'),
    privacySetLevel: (level: 0 | 1 | 2 | 3) => ipcRenderer.invoke('privacy-set-level', level),
    privacySetProviderConsent: (cfg: { providerId: string; level: 0 | 1 | 2 | 3; consented: boolean }) =>
        ipcRenderer.invoke('privacy-set-provider-consent', cfg),
    privacyCompleteOnboarding: (level: 0 | 1 | 2 | 3) => ipcRenderer.invoke('privacy-complete-onboarding', level),
    privacyIsOnboardingCompleted: () => ipcRenderer.invoke('privacy-is-onboarding-completed'),
    privacyRevokeAll: () => ipcRenderer.invoke('privacy-revoke-all'),
    privacyGetEffectiveLevel: (providerId?: string) => ipcRenderer.invoke('privacy-get-effective-level', providerId),
    privacyGetAuditSummary: (days?: number) => ipcRenderer.invoke('privacy-get-audit-summary', days),

});

contextBridge.exposeInMainWorld('authApi', {
    signIn: (email: string, password: string) => ipcRenderer.invoke('auth-sign-in', { email, password }),
    signUp: (email: string, password: string) => ipcRenderer.invoke('auth-sign-up', { email, password }),
    signInWithGoogle: (opts?: { mode?: 'system' | 'embedded' }) => ipcRenderer.invoke('auth-google', opts || {}),
    signOut: () => ipcRenderer.invoke('auth-sign-out'),
    checkLicense: () => ipcRenderer.invoke('auth-check-license'),
    refreshLicense: () => ipcRenderer.invoke('auth-refresh-license'),
    getProfile: () => ipcRenderer.invoke('auth-get-profile'),
});

contextBridge.exposeInMainWorld('brainApi', {
    getGraph: () => ipcRenderer.invoke('brain-get-graph'),
    getSubgraph: (nodeId: string, depth?: number) => ipcRenderer.invoke('brain-get-subgraph', { nodeId, depth }),
    search: (query: string, types?: string[], limit?: number) => ipcRenderer.invoke('brain-search', { query, types, limit }),
    getStats: () => ipcRenderer.invoke('brain-get-stats'),
    getNode: (nodeId: string) => ipcRenderer.invoke('brain-get-node', nodeId),
    runDream: (opts?: any) => ipcRenderer.invoke('brain-run-dream', opts),
    getDreamHistory: () => ipcRenderer.invoke('brain-dream-history'),
    restoreDreamSnapshot: (snapshotPath: string) => ipcRenderer.invoke('brain-restore-dream-snapshot', snapshotPath),
    exportBrain: () => ipcRenderer.invoke('brain-export'),
    exportPatterns: () => ipcRenderer.invoke('brain-export-patterns'),
    importBrain: (zipPath: string) => ipcRenderer.invoke('brain-import', zipPath),
    renderMarkdown: () => ipcRenderer.invoke('brain-render-markdown'),
    // Observer dashboard & aprendizado
    getDashboard: (opts?: { windowDays?: number; topFlowsLimit?: number }) =>
        ipcRenderer.invoke('brain-dashboard', opts),
    getPromotionPreview: (flowId: string, target?: 'nota' | 'playbook' | 'skill') =>
        ipcRenderer.invoke('brain-promotion-preview', { flowId, target }),
    savePromotionDraft: (flowId: string, target?: 'nota' | 'playbook' | 'skill') =>
        ipcRenderer.invoke('brain-promotion-save-draft', { flowId, target }),
    curatePromotion: (flowId: string, action: 'nota' | 'playbook' | 'brain_only' | 'discarded') =>
        ipcRenderer.invoke('brain-promotion-curate', { flowId, action }),
    getTrace: (traceId: string) => ipcRenderer.invoke('brain-trace', traceId),
    detectFlows: () => ipcRenderer.invoke('brain-detect-flows'),
    getPreference: (key: string, fallback?: any) => ipcRenderer.invoke('brain-get-preference', key, fallback),
    setPreference: (key: string, value: any) => ipcRenderer.invoke('brain-set-preference', key, value),
});

contextBridge.exposeInMainWorld('datajudApi', {
    // Profile
    getProfile: () => ipcRenderer.invoke('datajud-get-profile'),
    saveProfile: (profile: any) => ipcRenderer.invoke('datajud-save-profile', profile),
    // API Key
    setApiKey: (key: string) => ipcRenderer.invoke('datajud-set-api-key', key),
    hasApiKey: () => ipcRenderer.invoke('datajud-has-api-key'),
    // Processos monitorados
    addProcesso: (processo: any) => ipcRenderer.invoke('datajud-add-processo', processo),
    removeProcesso: (numero: string) => ipcRenderer.invoke('datajud-remove-processo', numero),
    listProcessos: () => ipcRenderer.invoke('datajud-list-processos'),
    // Search (COLD)
    searchProcesso: (numero: string, tribunal?: string) =>
        ipcRenderer.invoke('datajud-search', { numero, tribunal }),
    // Sync
    triggerHotSync: () => ipcRenderer.invoke('datajud-trigger-hot'),
    triggerWarmSync: () => ipcRenderer.invoke('datajud-trigger-warm'),
    getSyncState: () => ipcRenderer.invoke('datajud-get-sync-state'),
    getStats: () => ipcRenderer.invoke('datajud-get-stats'),
    // Events
    onSyncEvent: (cb: (event: any) => void) => ipcRenderer.on('datajud-sync-event', (_, e) => cb(e)),
    offSyncEvent: () => ipcRenderer.removeAllListeners('datajud-sync-event'),
});

contextBridge.exposeInMainWorld('pluginsApi', {
    list: () => ipcRenderer.invoke('plugins-list'),
    getStatus: (pluginId: string) => ipcRenderer.invoke('plugins-get-status', pluginId),
    getAuthConfig: (pluginId: string) => ipcRenderer.invoke('plugins-get-auth-config', pluginId),
    startOAuth: (pluginId: string, apiKey?: string) =>
        ipcRenderer.invoke('plugins-start-oauth', { pluginId, apiKey }),
    disconnect: (pluginId: string) => ipcRenderer.invoke('plugins-disconnect', pluginId),
    onReady: (cb: () => void) => ipcRenderer.on('plugins-ready', () => cb()),
});

contextBridge.exposeInMainWorld('skillsApi', {
    listCatalog: () => ipcRenderer.invoke('skills-catalog-list'),
    getRuntimeSnapshot: () => ipcRenderer.invoke('skills-runtime-snapshot'),
    getConnectorsSnapshot: () => ipcRenderer.invoke('skills-connectors-snapshot'),
    readSkillFile: (skillPath: string) => ipcRenderer.invoke('skills-read-file', skillPath),
});

contextBridge.exposeInMainWorld('agoraApi', {
    listCards: () => ipcRenderer.invoke('agora-list-cards'),
    getCard: (id: string) => ipcRenderer.invoke('agora-get-card', id),
    createCard: (input: any) => ipcRenderer.invoke('agora-create-card', input),
    updateCard: (id: string, updates: any) => ipcRenderer.invoke('agora-update-card', { id, updates }),
    moveCard: (id: string, direction: number) => ipcRenderer.invoke('agora-move-card', { id, direction }),
    removeCard: (id: string) => ipcRenderer.invoke('agora-remove-card', id),
    commentCard: (id: string, body: string, author?: string) =>
        ipcRenderer.invoke('agora-comment-card', { id, body, author }),
    getRuns: (id: string) => ipcRenderer.invoke('agora-get-runs', id),
    onAgoraEvent: (cb: (event: any) => void) => ipcRenderer.on('agora-event', (_, e) => cb(e)),
    offAgoraEvent: () => ipcRenderer.removeAllListeners('agora-event'),
});

contextBridge.exposeInMainWorld('docKnowledgeApi', {
    // Schemas
    listSchemas: () => ipcRenderer.invoke('doc-kb-list-schemas'),
    getSchema: (id: string) => ipcRenderer.invoke('doc-kb-get-schema', id),
    searchSchemas: (query: string) => ipcRenderer.invoke('doc-kb-search-schemas', query),
    getCategories: () => ipcRenderer.invoke('doc-kb-get-categories'),
    getSchemasByCategory: (cat: string) => ipcRenderer.invoke('doc-kb-schemas-by-category', cat),

    // Examples
    getExamples: (schemaId: string, limit?: number) =>
        ipcRenderer.invoke('doc-kb-get-examples', { schemaId, limit }),
    searchExamples: (query: string, limit?: number) =>
        ipcRenderer.invoke('doc-kb-search-examples', { query, limit }),
    getStats: () => ipcRenderer.invoke('doc-kb-get-stats'),

    // Import
    importFolder: (folderPath: string) => ipcRenderer.invoke('doc-kb-import-folder', folderPath),
    importFile: (filePath: string) => ipcRenderer.invoke('doc-kb-import-file', filePath),
    selectAndImport: () => ipcRenderer.invoke('doc-kb-select-and-import'),

    // Events
    onImportProgress: (cb: (data: any) => void) => ipcRenderer.on('doc-kb-import-progress', (_, d) => cb(d)),
    offImportProgress: () => ipcRenderer.removeAllListeners('doc-kb-import-progress'),
});

contextBridge.exposeInMainWorld('terminalApi', {
    create: (sessionId: string, opts?: { shell?: string; cwd?: string; cols?: number; rows?: number }) =>
        ipcRenderer.invoke('terminal-create', { sessionId, ...opts }),
    createEngine: (sessionId: string, opts?: { cols?: number; rows?: number }) =>
        ipcRenderer.invoke('terminal-create-engine', { sessionId, ...opts }),
    write: (sessionId: string, data: string, opts?: { paste?: boolean }) =>
        ipcRenderer.invoke('terminal-write', { sessionId, data, ...opts }),
    resize: (sessionId: string, cols: number, rows: number) =>
        ipcRenderer.invoke('terminal-resize', { sessionId, cols, rows }),
    kill: (sessionId: string) =>
        ipcRenderer.invoke('terminal-kill', sessionId),
    listSessions: () =>
        ipcRenderer.invoke('terminal-list-sessions'),
    onData: (cb: (payload: { sessionId: string; data: string }) => void) =>
        ipcRenderer.on('terminal-data', (_, d) => cb(d)),
    onExit: (cb: (payload: { sessionId: string; exitCode: number }) => void) =>
        ipcRenderer.on('terminal-exit', (_, d) => cb(d)),
    offEvents: () => {
        ipcRenderer.removeAllListeners('terminal-data');
        ipcRenderer.removeAllListeners('terminal-exit');
    },
});

contextBridge.exposeInMainWorld('userInputApi', {
    resolve: (answer: string) => ipcRenderer.invoke('user-input-resolve', { answer }),
    onRequested: (cb: (payload: { prompt: string; createdAt: number }) => void) =>
        ipcRenderer.on('user-input-requested', (_, payload) => cb(payload)),
    offRequested: () => {
        ipcRenderer.removeAllListeners('user-input-requested');
    },
});

contextBridge.exposeInMainWorld('updaterApi', {
    onUpdateAvailable:  (cb: () => void) => ipcRenderer.on('update-available',  () => cb()),
    onUpdateDownloaded: (cb: () => void) => ipcRenderer.on('update-downloaded', () => cb()),
    installNow: () => ipcRenderer.invoke('update-install-now'),
});

contextBridge.exposeInMainWorld('appNav', {
    onNavigateTo: (cb: (viewId: string) => void) =>
        ipcRenderer.on('navigate-to', (_, viewId) => cb(viewId)),
    onUiPayload: (cb: (payload: any) => void) =>
        ipcRenderer.on('ui-payload', (_, payload) => cb(payload)),
});
