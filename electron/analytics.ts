/**
 * Analytics — LEX
 *
 * Rastreia métricas de uso do app: sessões, mensagens, skills, tempo ativo.
 * Tudo persiste localmente em electron-store. Nenhum dado sai da máquina
 * sem consentimento explícito do usuário.
 */

// ============================================================================
// TYPES
// ============================================================================

interface SessionRecord {
    id: string;
    startedAt: number;
    endedAt?: number;
    messages: number;
    skills: Record<string, number>;
}

interface DailyStats {
    date: string;                    // YYYY-MM-DD
    sessions: number;
    messages: number;
    skills: Record<string, number>;
    activeMinutes: number;
    providers: Record<string, number>;  // provider → calls
    models: Record<string, number>;     // model → calls
    errors: Record<string, number>;     // skill → error count
}

export interface AnalyticsSummary {
    // Lifetime
    firstSeen: string;               // ISO date
    totalSessions: number;
    totalMessages: number;
    totalSkillCalls: number;
    daysActive: number;
    // Today
    todaySessions: number;
    todayMessages: number;
    todayActiveMinutes: number;
    todaySkills: Record<string, number>;
    todayErrors: Record<string, number>;
    // Current session
    currentSessionMinutes: number;
    currentSessionMessages: number;
    // Top stats
    topSkills: Array<{ skill: string; count: number }>;
    topModels: Array<{ model: string; count: number }>;
    mostActiveProvider: string;
    // Conversations
    totalConversations: number;
}

// ============================================================================
// ANALYTICS CLASS
// ============================================================================

export class Analytics {
    private store: any = null;
    private currentSession: SessionRecord | null = null;
    private focusStart: number = 0;
    private todayKey: string = '';
    private storeReady = false;

    constructor() {
        this.todayKey = this.dateKey();
        this.tryLoadStore();
    }

    private async tryLoadStore(): Promise<void> {
        try {
            const Store = (await import('electron-store')).default;
            this.store = new Store({ name: 'lex-analytics' });

            // First seen
            if (!this.store.get('firstSeen')) {
                this.store.set('firstSeen', new Date().toISOString().split('T')[0]);
            }

            this.storeReady = true;
        } catch {
            // Fora do Electron — silently degrade
        }
    }

    // ========================================================================
    // SESSION LIFECYCLE
    // ========================================================================

    startSession(): void {
        this.currentSession = {
            id: `s_${Date.now()}`,
            startedAt: Date.now(),
            messages: 0,
            skills: {},
        };
        this.focusStart = Date.now();

        // Increment sessions
        this.incrementDaily('sessions', 1);
        this.incrementLifetime('totalSessions', 1);

        // Track days active
        this.trackDayActive();
    }

    endSession(): void {
        if (!this.currentSession) return;
        this.currentSession.endedAt = Date.now();
        this.trackFocusTime(); // flush remaining focus time
        this.currentSession = null;
    }

    // ========================================================================
    // EVENT TRACKING
    // ========================================================================

    trackMessage(): void {
        if (this.currentSession) {
            this.currentSession.messages++;
        }
        this.incrementDaily('messages', 1);
        this.incrementLifetime('totalMessages', 1);
    }

    trackSkill(skillName: string, success: boolean): void {
        if (this.currentSession) {
            this.currentSession.skills[skillName] = (this.currentSession.skills[skillName] || 0) + 1;
        }

        // Daily skill counter
        const today = this.getToday();
        today.skills[skillName] = (today.skills[skillName] || 0) + 1;
        if (!success) {
            today.errors[skillName] = (today.errors[skillName] || 0) + 1;
        }
        this.saveToday(today);

        this.incrementLifetime('totalSkillCalls', 1);
    }

    trackProvider(providerId: string, modelId: string): void {
        const today = this.getToday();
        today.providers[providerId] = (today.providers[providerId] || 0) + 1;
        today.models[modelId] = (today.models[modelId] || 0) + 1;
        this.saveToday(today);
    }

    trackFocus(): void {
        this.focusStart = Date.now();
    }

    trackBlur(): void {
        this.trackFocusTime();
    }

    // ========================================================================
    // SUMMARY
    // ========================================================================

    async getSummary(): Promise<AnalyticsSummary> {
        if (!this.storeReady) {
            return this.emptySummary();
        }

        const today = this.getToday();
        const lifetime = this.getLifetime();
        const allDays = this.getAllDays();

        // Top skills (all time)
        const skillTotals: Record<string, number> = {};
        const modelTotals: Record<string, number> = {};
        const providerTotals: Record<string, number> = {};

        for (const day of allDays) {
            for (const [skill, count] of Object.entries(day.skills)) {
                skillTotals[skill] = (skillTotals[skill] || 0) + count;
            }
            for (const [model, count] of Object.entries(day.models)) {
                modelTotals[model] = (modelTotals[model] || 0) + count;
            }
            for (const [provider, count] of Object.entries(day.providers)) {
                providerTotals[provider] = (providerTotals[provider] || 0) + count;
            }
        }

        const topSkills = Object.entries(skillTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([skill, count]) => ({ skill, count }));

        const topModels = Object.entries(modelTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([model, count]) => ({ model, count }));

        const mostActiveProvider = Object.entries(providerTotals)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'nenhum';

        // Session duration
        const sessionMinutes = this.currentSession
            ? Math.round((Date.now() - this.currentSession.startedAt) / 60_000)
            : 0;

        // Count conversations
        let totalConversations = 0;
        try {
            const convDir = this.store?.get('_conversationCount');
            totalConversations = typeof convDir === 'number' ? convDir : 0;
        } catch { /* ignore */ }

        return {
            firstSeen: this.store?.get('firstSeen', '') || '',
            totalSessions: lifetime.totalSessions,
            totalMessages: lifetime.totalMessages,
            totalSkillCalls: lifetime.totalSkillCalls,
            daysActive: lifetime.daysActive,
            todaySessions: today.sessions,
            todayMessages: today.messages,
            todayActiveMinutes: today.activeMinutes,
            todaySkills: today.skills,
            todayErrors: today.errors,
            currentSessionMinutes: sessionMinutes,
            currentSessionMessages: this.currentSession?.messages || 0,
            topSkills,
            topModels,
            mostActiveProvider,
            totalConversations,
        };
    }

    /** Incrementa contador de conversas (chamado ao salvar conversa) */
    trackConversation(): void {
        if (!this.storeReady) return;
        const current = this.store.get('_conversationCount', 0) as number;
        this.store.set('_conversationCount', current + 1);
    }

    /** Inicializa contador de conversas a partir do store principal (chamado uma vez no boot) */
    syncConversationCount(mainStore: any): void {
        if (!this.storeReady || !mainStore) return;
        // Só sincroniza se ainda não foi inicializado
        if (this.store.get('_conversationCount') !== undefined) return;
        try {
            const convs = mainStore.get('conversations', {}) as Record<string, any>;
            this.store.set('_conversationCount', Object.keys(convs).length);
        } catch { /* ignore */ }
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    private dateKey(date?: Date): string {
        return (date || new Date()).toISOString().split('T')[0]!;
    }

    private getToday(): DailyStats {
        const key = this.dateKey();
        if (!this.storeReady) return this.emptyDay(key);
        return this.store.get(`days.${key}`, this.emptyDay(key)) as DailyStats;
    }

    private saveToday(stats: DailyStats): void {
        if (!this.storeReady) return;
        this.store.set(`days.${stats.date}`, stats);
    }

    private getAllDays(): DailyStats[] {
        if (!this.storeReady) return [];
        const days = this.store.get('days', {}) as Record<string, DailyStats>;
        return Object.values(days);
    }

    private getLifetime(): { totalSessions: number; totalMessages: number; totalSkillCalls: number; daysActive: number } {
        if (!this.storeReady) return { totalSessions: 0, totalMessages: 0, totalSkillCalls: 0, daysActive: 0 };
        return {
            totalSessions: this.store.get('lifetime.totalSessions', 0) as number,
            totalMessages: this.store.get('lifetime.totalMessages', 0) as number,
            totalSkillCalls: this.store.get('lifetime.totalSkillCalls', 0) as number,
            daysActive: this.store.get('lifetime.daysActive', 0) as number,
        };
    }

    private incrementDaily(field: 'sessions' | 'messages', amount: number): void {
        const today = this.getToday();
        (today as any)[field] = ((today as any)[field] || 0) + amount;
        this.saveToday(today);
    }

    private incrementLifetime(field: string, amount: number): void {
        if (!this.storeReady) return;
        const current = (this.store.get(`lifetime.${field}`, 0) as number);
        this.store.set(`lifetime.${field}`, current + amount);
    }

    private trackDayActive(): void {
        if (!this.storeReady) return;
        const today = this.dateKey();
        const lastActiveDay = this.store.get('_lastActiveDay', '') as string;
        if (lastActiveDay !== today) {
            this.store.set('_lastActiveDay', today);
            this.incrementLifetime('daysActive', 1);
        }
    }

    private trackFocusTime(): void {
        if (!this.focusStart) return;
        const minutes = Math.round((Date.now() - this.focusStart) / 60_000);
        if (minutes > 0 && minutes < 480) { // max 8h sanity check
            const today = this.getToday();
            today.activeMinutes += minutes;
            this.saveToday(today);
        }
        this.focusStart = Date.now();
    }

    private emptyDay(date: string): DailyStats {
        return { date, sessions: 0, messages: 0, skills: {}, activeMinutes: 0, providers: {}, models: {}, errors: {} };
    }

    private emptySummary(): AnalyticsSummary {
        return {
            firstSeen: '', totalSessions: 0, totalMessages: 0, totalSkillCalls: 0,
            daysActive: 0, todaySessions: 0, todayMessages: 0, todayActiveMinutes: 0,
            todaySkills: {}, todayErrors: {}, currentSessionMinutes: 0,
            currentSessionMessages: 0, topSkills: [], topModels: [],
            mostActiveProvider: 'nenhum', totalConversations: 0,
        };
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: Analytics | null = null;

export function getAnalytics(): Analytics {
    if (!instance) {
        instance = new Analytics();
    }
    return instance;
}
