/**
 * Session Manager (A2)
 *
 * Gerencia sessões de chat multi-turn.
 * Mantém histórico de mensagens por sessão para dar contexto ao Agent Loop.
 */

import { randomUUID } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    runId?: string;       // ID do agent loop que gerou esta mensagem
    skillsUsed?: string[]; // Skills executadas nesta resposta
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

export class SessionManager {
    private sessions = new Map<string, ChatSession>();
    private maxMessagesPerSession: number;
    private maxSessions: number;

    /**
     * @param maxMessages - Máximo de mensagens por sessão (default: 50)
     * @param maxSessions - Máximo de sessões ativas (default: 20)
     */
    constructor(maxMessages: number = 50, maxSessions: number = 20) {
        this.maxMessagesPerSession = maxMessages;
        this.maxSessions = maxSessions;
    }

    /**
     * Obtém ou cria uma sessão
     */
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

        // Evict sessão mais antiga se necessário
        if (this.sessions.size >= this.maxSessions) {
            this.evictOldest();
        }

        this.sessions.set(id, session);
        console.log(`[Session] Criada sessão: ${id}`);
        return session;
    }

    /**
     * Adiciona mensagem a uma sessão
     */
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

        // Truncar se exceder limite (mantém as mais recentes)
        if (session.messages.length > this.maxMessagesPerSession) {
            const excess = session.messages.length - this.maxMessagesPerSession;
            session.messages.splice(0, excess);
        }
    }

    /**
     * Obtém histórico da sessão para injetar no prompt
     */
    getHistory(sessionId: string, limit: number = 10): ChatMessage[] {
        const session = this.sessions.get(sessionId);
        if (!session || session.messages.length === 0) return [];

        return session.messages.slice(-limit);
    }

    /**
     * Formata histórico como texto para injeção no prompt do Agent Loop
     */
    formatHistoryForPrompt(sessionId: string, limit: number = 8): string {
        const history = this.getHistory(sessionId, limit);
        if (history.length === 0) return '';

        let formatted = '\n--- HISTÓRICO DA CONVERSA ---\n';

        for (const msg of history) {
            const roleLabel = msg.role === 'user' ? 'Usuário' : 'Assistente';
            const truncated = msg.content.length > 500
                ? msg.content.substring(0, 500) + '...'
                : msg.content;
            formatted += `[${roleLabel}]: ${truncated}\n`;
        }

        formatted += '--- FIM DO HISTÓRICO ---\n';
        formatted += 'Use o histórico acima como contexto. A mensagem atual do usuário é o objetivo principal.\n';

        return formatted;
    }

    /**
     * Verifica se sessão existe
     */
    has(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    /**
     * Remove uma sessão
     */
    delete(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    /**
     * Lista sessões ativas
     */
    listSessions(): Array<{ id: string; messageCount: number; updatedAt: number }> {
        return Array.from(this.sessions.values()).map(s => ({
            id: s.id,
            messageCount: s.messages.length,
            updatedAt: s.updatedAt
        }));
    }

    // ========================================================================
    // PRIVATE
    // ========================================================================

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
// SINGLETON
// ============================================================================

let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
    if (!sessionManagerInstance) {
        sessionManagerInstance = new SessionManager();
    }
    return sessionManagerInstance;
}
