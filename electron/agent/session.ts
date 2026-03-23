/**
 * Session Manager (A2)
 *
 * Gerencia sessões de chat multi-turn.
 * Mantém histórico de mensagens por sessão para dar contexto ao Agent Loop.
 * Persiste em disco: %APPDATA%/lex-test1/sessions.json (ou equivalente).
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { saveEncrypted, loadEncrypted } from '../privacy/encrypted-storage';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    runId?: string;
    skillsUsed?: string[];
}

export interface ChatSession {
    id: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
    metadata?: Record<string, any>;
    historySummary?: string;
    summarizedUpTo?: number;
}

// ============================================================================
// SESSION MANAGER
// ============================================================================

const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const MAX_STORED_SESSIONS = 50;

export class SessionManager {
    private sessions = new Map<string, ChatSession>();
    private maxMessagesPerSession: number;
    private maxSessions: number;
    private sessionsFile: string;
    private saveScheduled = false;

    constructor(maxMessages = 50, maxSessions = 20) {
        this.maxMessagesPerSession = maxMessages;
        this.maxSessions = maxSessions;
        this.sessionsFile = getSessionsFilePath();
        this.loadFromDisk();
    }

    getOrCreate(sessionId?: string): ChatSession {
        if (sessionId && this.sessions.has(sessionId)) {
            return this.sessions.get(sessionId)!;
        }

        const id = sessionId || randomUUID();
        const session: ChatSession = {
            id,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        if (this.sessions.size >= this.maxSessions) {
            this.evictOldest();
        }

        this.sessions.set(id, session);
        console.log(`[Session] Criada sessão: ${id}`);
        return session;
    }

    addMessage(
        sessionId: string,
        role: 'user' | 'assistant',
        content: string,
        meta?: { runId?: string; skillsUsed?: string[] }
    ): void {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const message: ChatMessage = {
            role,
            content,
            timestamp: Date.now(),
            ...(meta?.runId ? { runId: meta.runId } : {}),
            ...(meta?.skillsUsed ? { skillsUsed: meta.skillsUsed } : {})
        };
        session.messages.push(message);
        session.updatedAt = Date.now();

        if (session.messages.length > this.maxMessagesPerSession) {
            const excess = session.messages.length - this.maxMessagesPerSession;
            session.messages.splice(0, excess);
        }

        // Persiste de forma assíncrona com debounce (max 1x/s)
        this.scheduleSave();
    }

    getHistory(sessionId: string, limit = 10): ChatMessage[] {
        const session = this.sessions.get(sessionId);
        if (!session || session.messages.length === 0) return [];
        return session.messages.slice(-limit);
    }

    formatHistoryForPrompt(sessionId: string, limit = 8): string {
        const history = this.getHistory(sessionId, limit);
        if (history.length === 0) return '';

        let formatted = '\n--- HISTÓRICO DA CONVERSA (CONTINUAÇÃO) ---\n';
        formatted += 'IMPORTANTE: Esta é uma conversa em andamento. O usuário pode referenciar informações de turnos anteriores. Mantenha todo o contexto.\n\n';
        for (const msg of history) {
            const roleLabel = msg.role === 'user' ? 'Usuário' : 'Assistente';
            // Mensagens do usuário podem conter casos longos — preservar mais contexto
            const maxLen = msg.role === 'user' ? 4000 : 2000;
            const truncated = msg.content.length > maxLen
                ? msg.content.substring(0, maxLen) + '...'
                : msg.content;
            formatted += `[${roleLabel}]: ${truncated}\n\n`;
        }
        formatted += '--- FIM DO HISTÓRICO ---\n';
        formatted += 'REGRA: Quando o usuário pedir algo que depende de contexto anterior (ex: "faça um parecer", "analise isso", "continue"), use as informações do histórico acima. NÃO peça os dados novamente se já foram fornecidos.\n';
        return formatted;
    }

    // ========================================================================
    // P0 Fix 3: Summarization
    // ========================================================================

    private static readonly SUMMARY_THRESHOLD = 4000;
    private static readonly RECENT_KEPT = 5;

    async formatHistoryWithSummary(sessionId: string): Promise<string> {
        const session = this.sessions.get(sessionId);
        if (!session || session.messages.length === 0) return '';

        const totalChars = session.messages.reduce((s, m) => s + m.content.length, 0);

        // Se curto, usa formato simples existente
        if (totalChars <= SessionManager.SUMMARY_THRESHOLD
            || session.messages.length <= SessionManager.RECENT_KEPT) {
            return this.formatHistoryForPrompt(sessionId, 8);
        }

        const recentCount = SessionManager.RECENT_KEPT;
        const older = session.messages.slice(0, -recentCount);
        const recent = session.messages.slice(-recentCount);

        // Cache válido?
        let summary = session.historySummary;
        if (!summary || (session.summarizedUpTo ?? 0) < older.length) {
            summary = await this.summarizeMessages(older);
            session.historySummary = summary;
            session.summarizedUpTo = older.length;
            this.scheduleSave();
        }

        let out = '\n--- HISTÓRICO DA CONVERSA (CONTINUAÇÃO) ---\n';
        out += 'IMPORTANTE: Esta é uma conversa em andamento. O usuário pode referenciar informações de turnos anteriores. Mantenha todo o contexto.\n\n';
        out += `[Resumo de ${older.length} mensagens anteriores]: ${summary}\n\n`;
        for (const msg of recent) {
            const role = msg.role === 'user' ? 'Usuário' : 'Assistente';
            const maxLen = msg.role === 'user' ? 4000 : 2000;
            const text = msg.content.length > maxLen ? msg.content.substring(0, maxLen) + '...' : msg.content;
            out += `[${role}]: ${text}\n\n`;
        }
        out += '--- FIM DO HISTÓRICO ---\n';
        out += 'REGRA: Quando o usuário pedir algo que depende de contexto anterior (ex: "faça um parecer", "analise isso", "continue"), use as informações do histórico acima. NÃO peça os dados novamente se já foram fornecidos.\n';
        return out;
    }

    private async summarizeMessages(messages: ChatMessage[]): Promise<string> {
        try {
            const { callAI } = await import('../ai-handler');
            const text = messages.map(m => {
                const r = m.role === 'user' ? 'U' : 'A';
                return `[${r}]: ${m.content.substring(0, 500)}`;
            }).join('\n');

            return (await callAI({
                system: 'Resuma a conversa abaixo em 2-3 frases concisas em português. Capture: o que o usuário pediu, ações tomadas, resultado. Seja direto.',
                user: text,
                temperature: 0.1,
                maxTokens: 200,
            })).trim();
        } catch (e: any) {
            console.warn('[Session] Falha ao sumarizar:', e.message);
            // Fallback manual
            return messages.map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.content.substring(0, 80)}`).join(' | ');
        }
    }

    has(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    delete(sessionId: string): void {
        this.sessions.delete(sessionId);
        this.scheduleSave();
    }

    listSessions(): Array<{ id: string; messageCount: number; updatedAt: number }> {
        return Array.from(this.sessions.values()).map(s => ({
            id: s.id,
            messageCount: s.messages.length,
            updatedAt: s.updatedAt
        }));
    }

    /** Salva imediatamente — chamar no quit do app */
    async flush(): Promise<void> {
        await this.saveToDisk();
    }

    // ========================================================================
    // Persistência
    // ========================================================================

    private loadFromDisk(): void {
        try {
            const data = loadEncrypted<Record<string, ChatSession>>(this.sessionsFile, {});
            const now = Date.now();
            let loaded = 0;

            for (const session of Object.values(data)) {
                if (now - session.updatedAt > MAX_SESSION_AGE_MS) continue;
                if (!session.id || !Array.isArray(session.messages)) continue;
                this.sessions.set(session.id, session);
                loaded++;
                if (loaded >= MAX_STORED_SESSIONS) break;
            }

            if (loaded > 0) {
                console.log(`[Session] Carregadas ${loaded} sessões do disco (criptografado)`);
            }
        } catch (e: any) {
            console.warn('[Session] Não foi possível carregar sessões:', e.message);
        }
    }

    private async saveToDisk(): Promise<void> {
        try {
            const sorted = Array.from(this.sessions.values())
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, MAX_STORED_SESSIONS);

            const data: Record<string, ChatSession> = {};
            for (const s of sorted) data[s.id] = s;

            saveEncrypted(this.sessionsFile, data);
        } catch (e: any) {
            console.warn('[Session] Falha ao salvar sessões:', e.message);
        }
    }

    private scheduleSave(): void {
        if (this.saveScheduled) return;
        this.saveScheduled = true;
        setTimeout(() => {
            this.saveScheduled = false;
            this.saveToDisk().catch(() => {});
        }, 1000);
    }

    private evictOldest(): void {
        let oldestId: string | null = null;
        let oldestTime = Infinity;
        for (const [id, session] of this.sessions) {
            if (session.updatedAt < oldestTime) {
                oldestTime = session.updatedAt;
                oldestId = id;
            }
        }
        if (oldestId) {
            this.sessions.delete(oldestId);
            console.log(`[Session] Evicted sessão mais antiga: ${oldestId}`);
        }
    }
}

// ============================================================================
// Helpers
// ============================================================================

function getSessionsFilePath(): string {
    const appData = process.env['APPDATA'] || os.homedir();
    return path.join(appData, 'lex-test1', 'sessions.json');
}

// ============================================================================
// SINGLETON
// ============================================================================

let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
    if (!sessionManagerInstance) {
        sessionManagerInstance = new SessionManager();
    }
    return sessionManagerInstance;
}
