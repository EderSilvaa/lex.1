/**
 * Lex Agent Types
 *
 * Tipos do Agent Loop inspirados no OpenClaw, simplificados para o contexto jurídico.
 */

// ============================================================================
// AGENT STATE
// ============================================================================

export interface AgentState {
    id: string;
    objetivo: string;
    status: AgentStatus;
    contexto: AgentContext;
    passos: AgentStep[];
    iteracao: number;
    startTime: number;
    endTime?: number;
    /** PII Vault — vive apenas durante o run, nunca persiste */
    piiVault?: import('../privacy/pii-vault').PIIVault | undefined;
}

export type AgentStatus =
    | 'running'
    | 'completed'
    | 'error'
    | 'waiting_user'
    | 'cancelled'
    | 'timeout';

// ============================================================================
// CONTEXT
// ============================================================================

export interface AgentContext {
    // Processo atual (se houver)
    processo?: ProcessoContext;

    // Documentos carregados na sessão
    documentos: DocumentoContext[];

    // Resultados acumulados das skills
    resultados: Record<string, any>;

    // Config do tenant (Prompt-Layer)
    tenantConfig?: TenantConfig;

    // Preferências do usuário
    usuario?: UsuarioContext;

    // Memória persistente
    memoria?: MemoriaContext;

    // RAG: chunks relevantes buscados nos documentos do workspace
    ragContexto?: RagChunk[];

    // Histórico de chat injetado pela sessão multi-turn
    chatHistory?: string;
}

export interface RagChunk {
    arquivo: string;
    trecho: string;
    score: number;
}

// Contexto de memória persistente
export interface MemoriaContext {
    processosRecentes: string[];
    aprendizados: string[];
    preferencias: Record<string, any>;
    interacoesSimilares?: Array<{ objetivo: string; sucesso: boolean }>;
    /** Cross-session facts — contexto de processos de sessões anteriores */
    fatos?: CrossSessionFact[];
}

export interface ProcessoContext {
    numero: string;
    tribunal: string;
    classe: string;
    assunto: string;
    partes: {
        autor: string[];
        reu: string[];
    };
    vara?: string;
    juiz?: string;
    status: string;
    valor_causa?: number;
    data_distribuicao?: string;
    ultima_movimentacao?: string;
}

export interface DocumentoContext {
    id: string;
    nome: string;
    tipo: string;
    resumo?: string;
    caminho?: string;
    conteudo?: string;
}

export interface UsuarioContext {
    nome?: string;
    oab?: string;
    email?: string;
    tribunal_preferido?: string;
    escritorio?: string;
    estilo_escrita?: 'formal' | 'semiformal' | 'informal';
}

// ============================================================================
// STEPS (Think → Critic → Act → Observe)
// ============================================================================

export interface AgentStep {
    iteracao: number;
    timestamp: string;
    tipo: 'think' | 'critic' | 'act' | 'observe';
    duracao?: number;

    // Think
    pensamento?: string;
    decisao?: ThinkDecision;

    // Critic
    critic?: CriticDecision;

    // Act
    skill?: string;
    parametros?: Record<string, any>;

    // Observe
    resultado?: SkillResult;
}

export interface ThinkDecision {
    tipo: 'skill' | 'resposta' | 'pergunta';
    pensamento: string;
    confianca?: number; // 0-1

    // Se tipo = 'skill'
    skill?: string;
    parametros?: Record<string, any>;

    // Se tipo = 'resposta'
    resposta?: string;

    // Se tipo = 'pergunta'
    pergunta?: string;
    opcoes?: string[];
}

export interface CriticDecision {
    approved: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    reason: string;
    requiresUserConfirmation?: boolean;
    suggestedQuestion?: string;
    correctedDecision?: {
        skill: string;
        parametros?: Record<string, any>;
    };
}

// ============================================================================
// SKILLS
// ============================================================================

export interface Skill {
    nome: string;
    descricao: string;
    categoria: string;  // Core: 'pje'|'documentos'|'pesquisa'|'utils'|'os'|'pc'|'browser' + plugins adicionam novas

    // Schema de parâmetros
    parametros: Record<string, SkillParametro>;

    // Retorno esperado
    retorno: string;

    // Exemplos de uso (para o prompt)
    exemplos?: string[];

    // Timeout em ms para esta skill. Sobrescreve o default da categoria.
    timeoutMs?: number;

    // Execução
    execute: (params: Record<string, any>, context: AgentContext) => Promise<SkillResult>;
}

export interface SkillParametro {
    tipo: 'string' | 'number' | 'boolean' | 'object' | 'array';
    descricao: string;
    obrigatorio: boolean;
    default?: any;
    enum?: string[];
}

export interface SkillResult {
    sucesso: boolean;
    dados?: any;
    erro?: string;
    mensagem?: string;
}

export interface SkillRegistry {
    [nome: string]: Skill;
}

// ============================================================================
// EVENTS (para streaming UI)
// ============================================================================

export type AgentEvent =
    | { type: 'started'; runId: string; objetivo: string }
    | { type: 'thinking'; pensamento: string; iteracao: number }
    | { type: 'criticizing'; decision: CriticDecision; iteracao: number }
    | { type: 'acting'; skill: string; parametros: Record<string, any> }
    | { type: 'tool_result'; skill: string; resultado: SkillResult }
    | { type: 'observing'; observacao: string }
    | { type: 'completed'; resposta: string; passos: number; duracao: number }
    | { type: 'error'; erro: string; recuperavel: boolean }
    | { type: 'waiting_user'; pergunta: string; opcoes?: string[] }
    | { type: 'cancelled' }
    | { type: 'timeout' }
    | { type: 'streaming_start' }
    | { type: 'token'; token: string }
    | { type: 'privacy_stats'; stats: Array<{ category: string; count: number }> };

// ============================================================================
// PLANNING & ORCHESTRATION (Phase 1 AIOS)
// ============================================================================

export type AgentTypeId = string;  // Core: 'general'|'pje'|'document'|'research'|'browser'|'os' + plugins adicionam novos

export interface AgentSpec {
    typeId: AgentTypeId;
    displayName: string;
    /** Categorias de skills que este agente pode acessar */
    allowedSkillCategories: Array<Skill['categoria']>;
    /** Prompt extra injetado no system prompt do think.ts */
    systemPromptExtra?: string;
    /** Override de config para este tipo de agente */
    configOverrides?: Partial<AgentConfig>;
    /** Máximo de agentes deste tipo rodando em paralelo (default: ilimitado) */
    maxConcurrent?: number;
    /** Se true, requer browser (limita a 1 por vez no AgentPool) */
    requiresBrowser?: boolean;
}

export interface SubTask {
    id: string;
    description: string;
    agentType: AgentTypeId;
    /** Parâmetros opcionais para o agente */
    params?: Record<string, any>;
    /** IDs de subtasks que devem completar antes desta */
    dependsOn: string[];
    /** Preenchido pelo orchestrator após execução */
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    result?: string;
    error?: string;
    /** Timeout em ms para esta subtask. Sobrescreve configOverrides do AgentSpec. */
    timeoutMs?: number;
    /** Timestamp de início (preenchido ao marcar running) */
    startedAt?: number;
    /** Máximo de tentativas (default: 1 = sem retry) */
    maxRetries?: number;
    /** Tentativas já realizadas (gerenciado pelo orchestrator) */
    retryCount?: number;
}

export interface Plan {
    id: string;
    goal: string;
    subtasks: SubTask[];
    createdAt: number;
    status: 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';
    finalAnswer?: string;
}

export type OrchestratorEvent =
    | { type: 'plan_created'; plan: Plan }
    | { type: 'subtask_started'; subtaskId: string; agentType: AgentTypeId }
    | { type: 'subtask_completed'; subtaskId: string; result: string }
    | { type: 'subtask_failed'; subtaskId: string; error: string }
    | { type: 'subtask_retrying'; subtaskId: string; attempt: number; maxRetries: number }
    | { type: 'plan_completed'; finalAnswer: string }
    | { type: 'plan_failed'; error: string }
    | { type: 'checkpoint_resumed'; planId: string; fromBatch: number }
    | { type: 'dual_validation'; skill: string; approved: boolean; confidence: number }
    | { type: 'plan_state_snapshot'; state: OrchestratorState }
    | { type: 'plan_paused' }
    | { type: 'plan_resumed' };

/** Estado serializável do plano ativo — retornado por orchestrator-get-state */
export interface OrchestratorState {
    planId: string;
    goal: string;
    planStatus: Plan['status'];
    subtasks: Array<{
        id: string;
        description: string;
        agentType: AgentTypeId;
        status: SubTask['status'];
        error?: string;
        startedAt?: number;
    }>;
}

// ============================================================================
// AGENT LOOP OPTIONS
// ============================================================================

export interface AgentLoopOptions {
    objetivo: string;
    config?: Partial<AgentConfig>;
    tenantConfig?: TenantConfig;
    sessionId?: string;
    agentSpec?: AgentSpec;
    parentAbort?: AbortSignal;
}

// ============================================================================
// CONFIG
// ============================================================================

export interface AgentConfig {
    // Limites
    maxIterations: number;      // Padrão: 15
    timeoutMs: number;          // Padrão: 300000 (5 min)

    // Comportamento
    verbose: boolean;
    allowParallelSkills: boolean;
    enableCritic: boolean;

    // LLM
    model?: string;
    temperature?: number;
    criticModel?: string | undefined;
    criticTemperature?: number;

    // Hooks
    hooks?: AgentHooks;
}

export interface AgentHooks {
    beforeStart?: (state: AgentState) => Promise<void>;
    afterThink?: (state: AgentState, decision: ThinkDecision) => Promise<void>;
    afterCritic?: (state: AgentState, decision: CriticDecision) => Promise<void>;
    beforeToolCall?: (skill: string, params: Record<string, any>) => Promise<Record<string, any>>;
    afterToolCall?: (skill: string, result: SkillResult) => Promise<SkillResult>;
    onComplete?: (state: AgentState, resposta: string) => Promise<void>;
    onError?: (state: AgentState, error: Error) => Promise<void>;
}

export const DEFAULT_CONFIG: AgentConfig = {
    maxIterations: 15,
    timeoutMs: 5 * 60 * 1000, // 5 minutos
    verbose: true,
    allowParallelSkills: false,
    enableCritic: true,
    // criticModel usa o agentModel do provider ativo (definido em provider-config.ts)
    // Não hardcodar modelo específico — o usuário pode estar usando OpenAI, Groq, etc.
    criticModel: undefined,
    criticTemperature: 0.1
};

// ============================================================================
// TENANT CONFIG (integração com Prompt-Layer)
// ============================================================================

export interface TenantConfig {
    identity: {
        tenantId: string;
        agentName: string;
        firmName: string;
        greeting: string;
        /** Traços de personalidade e voz — injetados no system prompt */
        personality?: string;
    };
    behavior: {
        style: 'formal' | 'semiformal' | 'informal';
        techLevel: 'leigo' | 'basico' | 'tecnico' | 'avancado';
        tone: 'neutro' | 'empatico' | 'assertivo' | 'didatico';
        depth: 'resumido' | 'normal' | 'detalhado' | 'exaustivo';
        /** Regras de profundidade adaptativa por tipo de pergunta */
        adaptiveDepth?: string;
        /** Padrões de comunicação: o que evitar e o que preferir */
        communicationPatterns?: string;
    };
    specialization: {
        areas: string[];
        tribunals: string[];
    };
    policies: {
        preferSettlement: boolean;
        disclaimer?: string;
        forbiddenPhrases: string[];
    };
    features: {
        pjeAutomation: boolean;
        documentGeneration: boolean;
        jurisprudenceSearch: boolean;
    };
}

// ============================================================================
// SESSION FACTS (Premium Context System)
// ============================================================================

export interface SessionFacts {
    /** Processos discutidos (extraídos por regex + LLM) */
    processos: ProcessoFact[];
    /** Nomes de clientes/partes mencionados */
    partes: string[];
    /** Teses jurídicas, argumentos, estratégias */
    teses: string[];
    /** Decisões ou conclusões tomadas */
    decisoes: string[];
    /** Ações pendentes ou próximos passos */
    pendencias: string[];
    /** Prazos mencionados */
    prazos: PrazoFact[];
    /** Tribunal identificado */
    tribunal?: string;
    /** Skills executadas com sucesso nesta sessão */
    skillsExecutadas: string[];
    /** Tópicos/áreas do direito discutidos */
    topicos: string[];
    /** Timestamp da última atualização */
    updatedAt: number;
}

export interface ProcessoFact {
    numero: string;
    classe?: string;
    partes?: { autor?: string[]; reu?: string[] };
    tribunal?: string;
    status?: string;
}

export interface PrazoFact {
    descricao: string;
    data?: string | undefined;
    processo?: string | undefined;
}

export interface StructuredSummary {
    /** Processos discutidos com detalhes-chave */
    processos: string[];
    /** Análises e pareceres dados */
    analises: string[];
    /** Ações tomadas (skills executadas, resultados) */
    acoesTomadas: string[];
    /** Pendências */
    pendencias: string[];
    /** Fatos-chave do caso que importam para continuidade */
    fatosChave: string[];
}

export interface SessionMeta {
    tribunal?: string | undefined;
    processNumbers: string[];
    topics: string[];
    stage: 'initial' | 'analysis' | 'action' | 'follow_up';
    totalSkillsUsed: number;
}

// ============================================================================
// CROSS-SESSION FACTS (Persistent Memory)
// ============================================================================

export interface CrossSessionFact {
    processoNumero: string;
    lastSessionId: string;
    lastUpdated: number;
    partes?: { autor?: string[]; reu?: string[] } | undefined;
    classe?: string | undefined;
    tribunal?: string | undefined;
    tesesDiscutidas: string[];
    decisoes: string[];
    status?: string | undefined;
}
