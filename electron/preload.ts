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
    signInWithGoogle: () => ipcRenderer.invoke('auth-google'),
    signOut: () => ipcRenderer.invoke('auth-sign-out'),
    checkLicense: () => ipcRenderer.invoke('auth-check-license'),
    refreshLicense: () => ipcRenderer.invoke('auth-refresh-license'),
    getProfile: () => ipcRenderer.invoke('auth-get-profile'),
});

contextBridge.exposeInMainWorld('schedulerApi', {
    listGoals: () => ipcRenderer.invoke('scheduler-list-goals'),
    addGoal: (goal: any) => ipcRenderer.invoke('scheduler-add-goal', goal),
    updateGoal: (id: string, updates: any) => ipcRenderer.invoke('scheduler-update-goal', { id, updates }),
    removeGoal: (id: string) => ipcRenderer.invoke('scheduler-remove-goal', id),
    pauseGoal: (id: string) => ipcRenderer.invoke('scheduler-pause-goal', id),
    resumeGoal: (id: string) => ipcRenderer.invoke('scheduler-resume-goal', id),
    runNow: (id: string) => ipcRenderer.invoke('scheduler-run-now', id),
    getRuns: (goalId: string, limit?: number) => ipcRenderer.invoke('scheduler-get-runs', { goalId, limit }),
    getStatus: () => ipcRenderer.invoke('scheduler-get-status'),
    setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('scheduler-set-auto-launch', enabled),
    getAutoLaunch: () => ipcRenderer.invoke('scheduler-get-auto-launch'),
    onSchedulerEvent: (cb: (event: any) => void) => ipcRenderer.on('scheduler-event', (_, e) => cb(e)),
    offSchedulerEvent: () => ipcRenderer.removeAllListeners('scheduler-event'),
    onNotificationBadge: (cb: (data: any) => void) => ipcRenderer.on('notification-badge', (_, d) => cb(d)),
    offNotificationBadge: () => ipcRenderer.removeAllListeners('notification-badge'),
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

contextBridge.exposeInMainWorld('updaterApi', {
    onUpdateAvailable:  (cb: () => void) => ipcRenderer.on('update-available',  () => cb()),
    onUpdateDownloaded: (cb: () => void) => ipcRenderer.on('update-downloaded', () => cb()),
    installNow: () => ipcRenderer.invoke('update-install-now'),
});
