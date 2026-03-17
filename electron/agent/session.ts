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

        let formatted = '\n--- HISTÓRICO DA CONVERSA ---\n';
        for (const msg of history) {
            const roleLabel = msg.role === 'user' ? 'Usuário' : 'Assistente';
            const truncated = msg.content.length > 1000
                ? msg.content.substring(0, 1000) + '...'
                : msg.content;
            formatted += `[${roleLabel}]: ${truncated}\n`;
        }
        formatted += '--- FIM DO HISTÓRICO ---\n';
        formatted += 'Use o histórico acima como contexto. A mensagem atual do usuário é o objetivo principal.\n';
        return formatted;
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
