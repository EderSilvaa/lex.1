/**
 * Session Manager (Premium)
 *
 * Gerencia sessões de chat multi-turn com:
 * - Session Facts: extração automática de entidades (processos, partes, teses, prazos)
 * - Sumarização estruturada: em vez de resumo genérico, extrai fatos pesquisáveis
 * - Context Budget: adapta histórico/truncagem ao modelo ativo
 * - Cross-session promotion: fatos importantes persistem na Memory
 *
 * Persiste em disco: %APPDATA%/lex-test1/sessions.json (criptografado).
 */

import { randomUUID } from 'crypto';
import * as path from 'path';
import * as os from 'os';
import { saveEncrypted, loadEncrypted } from '../privacy/encrypted-storage';
import { getContextBudget } from './context-budget';
import type { SessionFacts, ProcessoFact, PrazoFact, StructuredSummary, SessionMeta, CrossSessionFact } from './types';
import type { Memory } from './memory';

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
    // Legacy summarization
    historySummary?: string;
    summarizedUpTo?: number;
    // Premium: Session Facts
    facts?: SessionFacts;
    // Premium: Structured Summary
    structuredSummary?: StructuredSummary;
    structuredSummarizedUpTo?: number;
    // Premium: Session Metadata
    sessionMeta?: SessionMeta;
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
    /** Timestamp da última extração semântica LLM (debounce 30s entre chamadas) */
    private lastSemanticExtraction = 0;
    private static readonly SEMANTIC_DEBOUNCE_MS = 30_000;

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

        this.scheduleSave();
    }

    getHistory(sessionId: string, limit = 10): ChatMessage[] {
        const session = this.sessions.get(sessionId);
        if (!session || session.messages.length === 0) return [];
        return session.messages.slice(-limit);
    }

    // ========================================================================
    // HISTORY FORMATTING (Budget-Aware)
    // ========================================================================

    formatHistoryForPrompt(sessionId: string, limit?: number): string {
        const budget = getContextBudget();
        const effectiveLimit = limit ?? budget.maxHistoryMessages;
        const history = this.getHistory(sessionId, effectiveLimit);
        if (history.length === 0) return '';

        const session = this.sessions.get(sessionId);

        let formatted = '\n--- HISTÓRICO DA CONVERSA (CONTINUAÇÃO) ---\n';
        formatted += 'IMPORTANTE: Esta é uma conversa em andamento. Use TODOS os fatos abaixo como referência.\n\n';

        // Session facts (sempre incluídos, alta prioridade)
        if (session?.facts) {
            formatted += this.formatFactsForPrompt(session.facts);
        }

        for (const msg of history) {
            const roleLabel = msg.role === 'user' ? 'Usuário' : 'Assistente';
            const maxLen = msg.role === 'user' ? budget.maxUserTruncation : budget.maxAssistantTruncation;
            const truncated = msg.content.length > maxLen
                ? msg.content.substring(0, maxLen) + '...'
                : msg.content;
            formatted += `[${roleLabel}]: ${truncated}\n\n`;
        }
        formatted += '--- FIM DO HISTÓRICO ---\n';
        formatted += 'REGRA: Use os FATOS DA SESSÃO acima como referência. NÃO peça dados que já foram fornecidos.\n';
        return formatted;
    }

    // ========================================================================
    // SUMMARIZATION (Structured)
    // ========================================================================

    private static readonly SUMMARY_THRESHOLD = 8000;

    async formatHistoryWithSummary(sessionId: string): Promise<string> {
        const session = this.sessions.get(sessionId);
        if (!session || session.messages.length === 0) return '';

        const budget = getContextBudget();
        const totalChars = session.messages.reduce((s, m) => s + m.content.length, 0);

        // Sessões curtas: formato simples com budget
        if (totalChars <= SessionManager.SUMMARY_THRESHOLD
            || session.messages.length <= budget.maxHistoryMessages) {
            return this.formatHistoryForPrompt(sessionId, budget.maxHistoryMessages);
        }

        const recentCount = Math.min(budget.maxHistoryMessages, session.messages.length);
        const older = session.messages.slice(0, -recentCount);
        const recent = session.messages.slice(-recentCount);

        // Sumarização estruturada com cache
        let structuredSummary = session.structuredSummary;
        if (!structuredSummary || (session.structuredSummarizedUpTo ?? 0) < older.length) {
            structuredSummary = await this.summarizeMessagesStructured(older);
            session.structuredSummary = structuredSummary;
            session.structuredSummarizedUpTo = older.length;
            this.scheduleSave();
        }

        let out = '\n--- HISTÓRICO DA CONVERSA (CONTINUAÇÃO) ---\n';
        out += 'IMPORTANTE: Esta é uma conversa em andamento. Use TODOS os fatos abaixo.\n\n';

        // Seção 1: Session facts (SEMPRE incluídos, prioridade máxima)
        if (session.facts) {
            out += this.formatFactsForPrompt(session.facts);
        }

        // Seção 2: Resumo estruturado das mensagens antigas
        out += this.formatStructuredSummary(structuredSummary, older.length);

        // Seção 3: Mensagens recentes verbatim (truncagem budget-aware)
        for (const msg of recent) {
            const role = msg.role === 'user' ? 'Usuário' : 'Assistente';
            const maxLen = msg.role === 'user' ? budget.maxUserTruncation : budget.maxAssistantTruncation;
            const text = msg.content.length > maxLen ? msg.content.substring(0, maxLen) + '...' : msg.content;
            out += `[${role}]: ${text}\n\n`;
        }

        out += '--- FIM DO HISTÓRICO ---\n';
        out += 'REGRA: Use os FATOS DA SESSÃO acima como referência. NÃO peça dados que já foram fornecidos.\n';

        // Enforce budget total
        if (out.length > budget.maxHistoryChars) {
            out = out.substring(0, budget.maxHistoryChars) + '\n...[truncado por limite de contexto]\n';
        }

        return out;
    }

    private async summarizeMessagesStructured(messages: ChatMessage[]): Promise<StructuredSummary> {
        const budget = getContextBudget();

        try {
            const { callAI } = await import('../ai-handler');
            const text = messages.map(m => {
                const r = m.role === 'user' ? 'U' : 'A';
                return `[${r}]: ${m.content.substring(0, 800)}`;
            }).join('\n');

            const result = await callAI({
                system: `Sumarize esta conversa jurídica de forma estruturada. Retorne JSON:
{
  "processos": ["processo X: trabalhista, autor João vs Empresa Y, horas extras"],
  "analises": ["risco médio de procedência por falta de controle de ponto"],
  "acoesTomadas": ["consultou processo no PJe", "gerou petição inicial"],
  "pendencias": ["aguardando documentos do cliente"],
  "fatosChave": ["cliente trabalhou 2019-2024", "demissão sem justa causa"]
}
Capture TODOS os detalhes relevantes (nomes, números, datas, valores). Não generalize.`,
                user: text,
                temperature: 0.1,
                maxTokens: budget.maxSummaryTokens,
            });

            const parsed = JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}');
            return {
                processos: parsed.processos || [],
                analises: parsed.analises || [],
                acoesTomadas: parsed.acoesTomadas || [],
                pendencias: parsed.pendencias || [],
                fatosChave: parsed.fatosChave || [],
            };
        } catch (e: any) {
            console.warn('[Session] Sumarização estruturada falhou:', e.message);
            // Fallback: sumarização simples
            const fallback = await this.summarizeMessagesLegacy(messages);
            return {
                processos: [],
                analises: [fallback],
                acoesTomadas: [],
                pendencias: [],
                fatosChave: [],
            };
        }
    }

    /** Fallback de sumarização legado */
    private async summarizeMessagesLegacy(messages: ChatMessage[]): Promise<string> {
        try {
            const { callAI } = await import('../ai-handler');
            const text = messages.map(m => {
                const r = m.role === 'user' ? 'U' : 'A';
                return `[${r}]: ${m.content.substring(0, 500)}`;
            }).join('\n');

            return (await callAI({
                system: 'Resuma a conversa abaixo em 3-5 frases em português. Capture: processos discutidos (com número), partes envolvidas, ações tomadas, pendências. Seja específico.',
                user: text,
                temperature: 0.1,
                maxTokens: 300,
            })).trim();
        } catch (e: any) {
            console.warn('[Session] Falha ao sumarizar (legado):', e.message);
            return messages.map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.content.substring(0, 80)}`).join(' | ');
        }
    }

    // ========================================================================
    // SESSION FACTS EXTRACTION
    // ========================================================================

    /**
     * Extrai fatos estruturados da última troca (user + assistant).
     * Roda async após cada resposta — NÃO bloqueia a UI.
     */
    async extractAndStoreFacts(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session || session.messages.length < 2) return;

        // Pega a última troca
        const recent = session.messages.slice(-2);
        const userMsg = recent.find(m => m.role === 'user');
        const assistantMsg = recent.find(m => m.role === 'assistant');
        if (!userMsg || !assistantMsg) return;

        // Inicializa facts se necessário
        if (!session.facts) {
            session.facts = {
                processos: [],
                partes: [],
                teses: [],
                decisoes: [],
                pendencias: [],
                prazos: [],
                skillsExecutadas: [],
                topicos: [],
                updatedAt: Date.now()
            };
        }

        // Step 1: Regex extraction (zero cost, always runs)
        this.extractFactsFromText(session, userMsg.content);
        this.extractFactsFromText(session, assistantMsg.content);

        // Step 2: Track skills do metadata
        if (assistantMsg.skillsUsed) {
            for (const skill of assistantMsg.skillsUsed) {
                if (!session.facts.skillsExecutadas.includes(skill)) {
                    session.facts.skillsExecutadas.push(skill);
                }
            }
        }

        // Step 3: LLM semantic extraction (debounced — max 1 call per 30s)
        const now = Date.now();
        if (now - this.lastSemanticExtraction >= SessionManager.SEMANTIC_DEBOUNCE_MS) {
            this.lastSemanticExtraction = now;
            try {
                await this.extractSemanticFacts(session, userMsg.content, assistantMsg.content);
            } catch (e: any) {
                console.warn('[Session] Extração semântica falhou:', e.message);
            }
        }

        session.facts.updatedAt = Date.now();
        this.updateSessionMeta(session);
        this.scheduleSave();
    }

    /**
     * Extração por regex — zero cost, captura entidades estruturadas.
     */
    private extractFactsFromText(session: ChatSession, text: string): void {
        const facts = session.facts!;

        // Números de processo: 0001234-56.2025.5.01.0001
        const processRegex = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
        const processMatches = text.match(processRegex) || [];
        for (const num of processMatches) {
            if (!facts.processos.some(p => p.numero === num)) {
                facts.processos.push({ numero: num });
            }
        }

        // Códigos de tribunal
        const tribunalRegex = /\b(TRT|TJ|TRF|TST|STJ|STF)\s*[-/]?\s*(\d{1,2})?/gi;
        const tribMatches = text.match(tribunalRegex);
        if (tribMatches && !facts.tribunal) {
            facts.tribunal = tribMatches[0].toUpperCase().replace(/\s+/g, '');
        }

        // Prazos: "prazo de X dias"
        const prazoRegex = /prazo\s+(?:de\s+)?(\d+)\s+dias?/gi;
        let prazoMatch;
        while ((prazoMatch = prazoRegex.exec(text)) !== null) {
            const desc = prazoMatch[0];
            if (!facts.prazos.some(p => p.descricao === desc)) {
                facts.prazos.push({ descricao: desc });
            }
        }

        // Datas de vencimento: "até DD/MM/YYYY" ou "vence em DD/MM/YYYY"
        const dateRegex = /(?:até|vence|vencimento)\s+(\d{2}\/\d{2}\/\d{4})/gi;
        let dateMatch;
        while ((dateMatch = dateRegex.exec(text)) !== null) {
            const desc = dateMatch[0];
            if (!facts.prazos.some(p => p.descricao === desc)) {
                facts.prazos.push({ descricao: desc, data: dateMatch[1] });
            }
        }

        // Artigos de lei: "art. X" ou "artigo X"
        // (não armazena como fact separado, mas útil para futuro)
    }

    /**
     * Extração semântica via LLM — captura partes, teses, decisões, pendências.
     * Skip em modelos pequenos (tier small).
     */
    private async extractSemanticFacts(
        session: ChatSession,
        userContent: string,
        assistantContent: string
    ): Promise<void> {
        const budget = getContextBudget();

        // Modelos pequenos: skip LLM extraction (regex já captura o essencial)
        if (budget.tier === 'small') return;

        const { callAI } = await import('../ai-handler');

        const exchange = `[Usuário]: ${userContent.substring(0, 2000)}\n[Assistente]: ${assistantContent.substring(0, 2000)}`;

        const result = await callAI({
            system: `Extraia fatos estruturados desta conversa jurídica. Retorne APENAS JSON:
{
  "partes": ["nomes de clientes ou partes mencionados"],
  "teses": ["teses jurídicas, argumentos, estratégias discutidos"],
  "decisoes": ["decisões ou conclusões tomadas"],
  "pendencias": ["ações pendentes ou próximos passos"],
  "topicos": ["áreas do direito: trabalhista, cível, previdenciário, etc."]
}
Retorne APENAS campos com valores. Omita campos vazios. Se não há fatos relevantes, retorne {}.`,
            user: exchange,
            temperature: 0.0,
            maxTokens: 300,
        });

        try {
            const parsed = JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}');
            const facts = session.facts!;

            if (parsed.partes) {
                for (const p of parsed.partes) {
                    if (p && !facts.partes.includes(p)) facts.partes.push(p);
                }
            }
            if (parsed.teses) {
                for (const t of parsed.teses) {
                    if (t && !facts.teses.includes(t)) facts.teses.push(t);
                }
            }
            if (parsed.decisoes) {
                for (const d of parsed.decisoes) {
                    if (d && !facts.decisoes.includes(d)) facts.decisoes.push(d);
                }
            }
            if (parsed.pendencias) {
                // Pendências são efêmeras — substituir
                facts.pendencias = parsed.pendencias.filter(Boolean);
            }
            if (parsed.topicos) {
                for (const t of parsed.topicos) {
                    if (t && !facts.topicos.includes(t)) facts.topicos.push(t);
                }
            }
        } catch {
            // Parse falhou — regex facts ainda foram capturados
        }
    }

    // ========================================================================
    // FACTS FORMATTING (for prompt injection)
    // ========================================================================

    private formatFactsForPrompt(facts: SessionFacts): string {
        const lines: string[] = ['## Fatos desta Sessão (REFERÊNCIA OBRIGATÓRIA)\n'];
        let hasContent = false;

        if (facts.processos.length > 0) {
            hasContent = true;
            lines.push('**Processos:**');
            for (const p of facts.processos) {
                let desc = `- ${p.numero}`;
                if (p.classe) desc += ` (${p.classe})`;
                if (p.partes?.autor) desc += ` — Autor: ${p.partes.autor.join(', ')}`;
                if (p.partes?.reu) desc += ` vs Réu: ${p.partes.reu.join(', ')}`;
                if (p.tribunal) desc += ` [${p.tribunal}]`;
                if (p.status) desc += ` [${p.status}]`;
                lines.push(desc);
            }
        }

        if (facts.partes.length > 0) {
            hasContent = true;
            lines.push(`**Partes/Clientes:** ${facts.partes.join(', ')}`);
        }

        if (facts.teses.length > 0) {
            hasContent = true;
            lines.push(`**Teses/Argumentos:** ${facts.teses.join('; ')}`);
        }

        if (facts.decisoes.length > 0) {
            hasContent = true;
            lines.push(`**Decisões tomadas:** ${facts.decisoes.join('; ')}`);
        }

        if (facts.prazos.length > 0) {
            hasContent = true;
            lines.push('**Prazos:**');
            for (const p of facts.prazos) {
                lines.push(`- ${p.descricao}${p.data ? ` (${p.data})` : ''}`);
            }
        }

        if (facts.pendencias.length > 0) {
            hasContent = true;
            lines.push(`**Pendências:** ${facts.pendencias.join('; ')}`);
        }

        if (facts.skillsExecutadas.length > 0) {
            hasContent = true;
            lines.push(`**Skills já executadas nesta conversa:** ${facts.skillsExecutadas.join(', ')}`);
        }

        if (facts.tribunal) {
            hasContent = true;
            lines.push(`**Tribunal:** ${facts.tribunal}`);
        }

        if (!hasContent) return '';
        return lines.join('\n') + '\n\n';
    }

    private formatStructuredSummary(summary: StructuredSummary, messageCount: number): string {
        const lines: string[] = [`[Resumo estruturado de ${messageCount} mensagens anteriores]:\n`];
        let hasContent = false;

        if (summary.processos.length > 0) {
            hasContent = true;
            lines.push(`Processos discutidos: ${summary.processos.join('; ')}`);
        }
        if (summary.analises.length > 0) {
            hasContent = true;
            lines.push(`Análises feitas: ${summary.analises.join('; ')}`);
        }
        if (summary.acoesTomadas.length > 0) {
            hasContent = true;
            lines.push(`Ações tomadas: ${summary.acoesTomadas.join('; ')}`);
        }
        if (summary.pendencias.length > 0) {
            hasContent = true;
            lines.push(`Pendências: ${summary.pendencias.join('; ')}`);
        }
        if (summary.fatosChave.length > 0) {
            hasContent = true;
            lines.push(`Fatos-chave: ${summary.fatosChave.join('; ')}`);
        }

        if (!hasContent) return '';
        return lines.join('\n') + '\n\n';
    }

    // ========================================================================
    // SESSION METADATA
    // ========================================================================

    private updateSessionMeta(session: ChatSession): void {
        const facts = session.facts;
        if (!facts) return;

        session.sessionMeta = {
            tribunal: facts.tribunal,
            processNumbers: facts.processos.map(p => p.numero),
            topics: facts.topicos,
            stage: this.inferStage(session),
            totalSkillsUsed: facts.skillsExecutadas.length
        };
    }

    private inferStage(session: ChatSession): 'initial' | 'analysis' | 'action' | 'follow_up' {
        const msgCount = session.messages.length;
        const hasSkills = (session.facts?.skillsExecutadas.length || 0) > 0;

        if (msgCount <= 2) return 'initial';
        if (hasSkills) return 'action';
        if (msgCount <= 6) return 'analysis';
        return 'follow_up';
    }

    // ========================================================================
    // CROSS-SESSION PROMOTION
    // ========================================================================

    /**
     * Promove fatos-chave da sessão para a memória persistente.
     * Fatos de processos sobrevivem entre sessões.
     */
    async promoteCrossSessionFacts(sessionId: string, memory: Memory): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session?.facts) return;

        const facts = session.facts;

        // Promove cada processo para memória persistente
        for (const processo of facts.processos) {
            await memory.addOrUpdateFact({
                processoNumero: processo.numero,
                lastSessionId: sessionId,
                lastUpdated: Date.now(),
                partes: processo.partes,
                classe: processo.classe,
                tribunal: processo.tribunal || facts.tribunal,
                tesesDiscutidas: facts.teses,
                decisoes: facts.decisoes,
                status: processo.status,
            });
        }

        // Teses sem processo associado → aprendizados gerais
        if (facts.processos.length === 0 && facts.teses.length > 0) {
            for (const tese of facts.teses.slice(0, 3)) {
                await memory.addAprendizado(tese);
            }
        }
    }

    // ========================================================================
    // BASIC CRUD
    // ========================================================================

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
