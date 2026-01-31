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
    resultados: Map<string, any>;

    // Config do tenant (Prompt-Layer)
    tenantConfig?: TenantConfig;

    // Preferências do usuário
    usuario?: UsuarioContext;

    // Memória persistente
    memoria?: MemoriaContext;
}

// Contexto de memória persistente
export interface MemoriaContext {
    processosRecentes: string[];
    aprendizados: string[];
    preferencias: Record<string, any>;
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
}

// ============================================================================
// STEPS (Think → Act → Observe)
// ============================================================================

export interface AgentStep {
    iteracao: number;
    timestamp: string;
    tipo: 'think' | 'act' | 'observe';
    duracao?: number;

    // Think
    pensamento?: string;
    decisao?: ThinkDecision;

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

// ============================================================================
// SKILLS
// ============================================================================

export interface Skill {
    nome: string;
    descricao: string;
    categoria: 'pje' | 'documentos' | 'pesquisa' | 'utils';

    // Schema de parâmetros
    parametros: Record<string, SkillParametro>;

    // Retorno esperado
    retorno: string;

    // Exemplos de uso (para o prompt)
    exemplos?: string[];

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
    | { type: 'acting'; skill: string; parametros: Record<string, any> }
    | { type: 'tool_result'; skill: string; resultado: SkillResult }
    | { type: 'observing'; observacao: string }
    | { type: 'completed'; resposta: string; passos: number; duracao: number }
    | { type: 'error'; erro: string; recuperavel: boolean }
    | { type: 'waiting_user'; pergunta: string; opcoes?: string[] }
    | { type: 'cancelled' }
    | { type: 'timeout' };

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

    // LLM
    model?: string;
    temperature?: number;

    // Hooks
    hooks?: AgentHooks;
}

export interface AgentHooks {
    beforeStart?: (state: AgentState) => Promise<void>;
    afterThink?: (state: AgentState, decision: ThinkDecision) => Promise<void>;
    beforeToolCall?: (skill: string, params: Record<string, any>) => Promise<Record<string, any>>;
    afterToolCall?: (skill: string, result: SkillResult) => Promise<SkillResult>;
    onComplete?: (state: AgentState, resposta: string) => Promise<void>;
    onError?: (state: AgentState, error: Error) => Promise<void>;
}

export const DEFAULT_CONFIG: AgentConfig = {
    maxIterations: 15,
    timeoutMs: 5 * 60 * 1000, // 5 minutos
    verbose: true,
    allowParallelSkills: false
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
    };
    behavior: {
        style: 'formal' | 'semiformal' | 'informal';
        techLevel: 'leigo' | 'basico' | 'tecnico' | 'avancado';
        tone: 'neutro' | 'empatico' | 'assertivo' | 'didatico';
        depth: 'resumido' | 'normal' | 'detalhado' | 'exaustivo';
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
