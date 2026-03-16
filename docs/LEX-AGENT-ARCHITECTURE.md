# Lex Agent Architecture

> Arquitetura do agente autônomo do Lex, inspirada no OpenClaw, especializada em Direito brasileiro.
> **v5.0** — BYOK multi-provider: Anthropic, OpenAI, OpenRouter, Google AI, Groq.

---

## 1. Visão Geral

### De onde vem a inspiração

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   OPENCLAW                          LEX                     │
│   ────────                          ───                     │
│                                                             │
│   Agente genérico         →         Agente jurídico        │
│   Qualquer tarefa         →         Especialista em PJe    │
│   Multi-canal             →         Desktop-first          │
│   Puppeteer               →         Playwright/Stagehand   │
│   Provider fixo           →         BYOK multi-provider    │
│   MIT License ✓           →         Podemos usar ✓         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### O que torna um agente "inteligente"

```
CHATBOT TRADICIONAL:
────────────────────
Pergunta → Resposta → FIM

AGENTE AUTÔNOMO:
────────────────
Objetivo → LOOP(Pensar → Agir → Observar) → Resposta

A diferença está no LOOP - o agente continua
até resolver o problema, não apenas responder.
```

---

## 2. Arquitetura do Agent Loop

### Diagrama Principal

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LEX AGENT LOOP                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│    ┌──────────────┐                                                     │
│    │   USUÁRIO    │                                                     │
│    │  "Prepare    │                                                     │
│    │   recurso    │                                                     │
│    │   processo   │                                                     │
│    │   123"       │                                                     │
│    └──────┬───────┘                                                     │
│           │                                                             │
│           ▼                                                             │
│    ┌──────────────┐                                                     │
│    │   OBJETIVO   │                                                     │
│    │   PARSER     │  Extrai: ação=recurso, processo=123                │
│    └──────┬───────┘                                                     │
│           │                                                             │
│           ▼                                                             │
│    ╔══════════════════════════════════════════════════════════════╗    │
│    ║                      AGENT LOOP                               ║    │
│    ║                                                               ║    │
│    ║   ┌──────────────┐      ┌──────────────┐      ┌───────────┐  ║    │
│    ║   │              │      │              │      │           │  ║    │
│    ║   │    THINK     │─────▶│     ACT      │─────▶│  OBSERVE  │  ║    │
│    ║   │    (LLM)     │      │   (Skills)   │      │ (Resultado)│  ║    │
│    ║   │              │      │              │      │           │  ║    │
│    ║   └──────────────┘      └──────────────┘      └─────┬─────┘  ║    │
│    ║          ▲                                          │        ║    │
│    ║          │                                          │        ║    │
│    ║          │         ┌──────────────┐                │        ║    │
│    ║          │         │   OBJETIVO   │                │        ║    │
│    ║          └─────────│   COMPLETO?  │◀───────────────┘        ║    │
│    ║                    └──────┬───────┘                         ║    │
│    ║                           │                                  ║    │
│    ║                      NÃO  │  SIM                             ║    │
│    ║                           │                                  ║    │
│    ╚═══════════════════════════╪══════════════════════════════════╝    │
│                                │                                        │
│                                ▼                                        │
│                         ┌──────────────┐                               │
│                         │   RESPOSTA   │                               │
│                         │   FINAL      │                               │
│                         └──────────────┘                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Fluxo Detalhado

```
ITERAÇÃO 1:
───────────
[THINK]   "Preciso consultar o processo 123 para ver a sentença"
[ACT]     skill: pje_consultar_processo({ numero: "123" })
[OBSERVE] { processo: {...}, documentos: [...], sentenca: "..." }

ITERAÇÃO 2:
───────────
[THINK]   "Tenho a sentença. Preciso analisar os fundamentos"
[ACT]     skill: doc_analisar({ texto: sentenca })
[OBSERVE] { pontos_fracos: [...], pontos_fortes: [...] }

ITERAÇÃO 3:
───────────
[THINK]   "Identifiquei 3 pontos recorríveis. Preciso buscar jurisprudência"
[ACT]     skill: pesquisa_jurisprudencia({ termo: "..." })
[OBSERVE] { resultados: [...] }

ITERAÇÃO 4:
───────────
[THINK]   "Tenho tudo. Vou gerar o recurso"
[ACT]     skill: doc_gerar({ tipo: "apelacao", contexto: {...} })
[OBSERVE] { arquivo: "apelacao_123.docx" }

ITERAÇÃO 5:
───────────
[THINK]   "Recurso gerado. Objetivo completo!"
[RESPOSTA] "Preparei o recurso de apelação. O documento está no Word..."
```

---

## 3. Estrutura de Arquivos

```
electron/
│
├── agent/                          # Core do agente
│   ├── index.ts                    # Exports
│   ├── loop.ts                     # Agent loop principal
│   ├── think.ts                    # Módulo de raciocínio (LLM)
│   ├── executor.ts                 # Executor de skills
│   ├── memory.ts                   # Memória persistente
│   ├── context.ts                  # Gerenciamento de contexto
│   └── types.ts                    # Tipos TypeScript
│
├── skills/                         # Skills modulares
│   ├── index.ts                    # Registry de skills
│   ├── types.ts                    # Interface base de skill
│   │
│   ├── pje/                        # Skills do PJe
│   │   ├── consultar.ts            # Consultar processo
│   │   ├── movimentacoes.ts        # Listar movimentações
│   │   ├── documentos.ts           # Listar/baixar documentos
│   │   ├── protocolar.ts           # Protocolar petição
│   │   └── monitorar.ts            # Monitorar processo
│   │
│   ├── documentos/                 # Skills de documentos
│   │   ├── gerar.ts                # Gerar documento (Word)
│   │   ├── analisar.ts             # Analisar documento
│   │   ├── resumir.ts              # Resumir documento
│   │   └── comparar.ts             # Comparar documentos
│   │
│   ├── pesquisa/                   # Skills de pesquisa
│   │   ├── jurisprudencia.ts       # Buscar jurisprudência
│   │   └── legislacao.ts           # Buscar legislação
│   │
│   └── utils/                      # Skills utilitárias
│       ├── calcular_prazo.ts       # Calcular prazos
│       └── formatar.ts             # Formatação
│
├── prompts/                        # Prompts do agente
│   ├── SOUL.md                     # Personalidade
│   ├── AGENT.md                    # Comportamento
│   ├── TOOLS.md                    # Ferramentas
│   └── JURIDICO.md                 # Conhecimento jurídico
│
├── pje/                            # Playwright (automação)
│   ├── agent.ts
│   ├── actions.ts
│   ├── selectors.ts
│   └── session.ts
│
└── ai/                             # Integração com LLM
    ├── chat-handler.ts
    └── prompt-engine.ts
```

---

## 4. Implementação Core

### 4.1 `agent/types.ts`

```typescript
/**
 * Tipos do Agent Loop
 */

// Estado do agente durante execução
export interface AgentState {
    id: string;                      // ID único da execução
    objetivo: string;                // Objetivo do usuário
    contexto: AgentContext;          // Contexto acumulado
    passos: AgentStep[];             // Histórico de passos
    status: 'running' | 'completed' | 'error' | 'waiting_user';
    iteracao: number;
    startTime: number;
}

// Contexto disponível para o agente
export interface AgentContext {
    processo?: ProcessoContext;      // Dados do processo atual
    documentos?: DocumentoContext[]; // Documentos carregados
    memoria: MemoriaContext;         // Memória de longo prazo
    usuario: UsuarioContext;         // Preferências do usuário
}

// Um passo de execução
export interface AgentStep {
    iteracao: number;
    timestamp: string;
    tipo: 'think' | 'act' | 'observe';

    // Se tipo = think
    pensamento?: string;
    decisao?: ThinkDecision;

    // Se tipo = act
    skill?: string;
    parametros?: any;

    // Se tipo = observe
    resultado?: any;
    observacao?: string;
}

// Decisão do módulo Think
export interface ThinkDecision {
    tipo: 'skill' | 'resposta' | 'pergunta';
    pensamento: string;

    // Se tipo = skill
    skill?: string;
    parametros?: any;

    // Se tipo = resposta
    resposta?: string;

    // Se tipo = pergunta
    pergunta?: string;
}

// Contexto do processo
export interface ProcessoContext {
    numero: string;
    tribunal: string;
    classe: string;
    assunto: string;
    partes: {
        autor: string[];
        reu: string[];
    };
    status: string;
    ultimaMovimentacao?: string;
}

// Contexto de documento
export interface DocumentoContext {
    id: string;
    nome: string;
    tipo: string;
    resumo?: string;
    textoCompleto?: string;
}

// Memória de longo prazo
export interface MemoriaContext {
    processosRecentes: string[];
    preferencias: Record<string, any>;
    aprendizados: string[];
}

// Preferências do usuário
export interface UsuarioContext {
    nome?: string;
    oab?: string;
    tribunal_principal?: string;
    estilo_escrita?: 'formal' | 'tecnico' | 'acessivel';
}

// Configuração do loop
export interface LoopConfig {
    maxIterations: number;           // Limite de iterações (default: 15)
    timeout: number;                 // Timeout em ms (default: 300000 = 5min)
    verbose: boolean;                // Log detalhado
    allowUserInterrupt: boolean;     // Permite interromper
}

// Eventos emitidos pelo agente
export type AgentEvent =
    | { type: 'thinking'; pensamento: string }
    | { type: 'acting'; skill: string; parametros: any }
    | { type: 'observing'; resultado: any }
    | { type: 'completed'; resposta: string }
    | { type: 'error'; erro: string }
    | { type: 'waiting_user'; pergunta: string };
```

### 4.2 `agent/loop.ts`

```typescript
/**
 * Agent Loop - Núcleo do agente autônomo
 *
 * Inspirado no OpenClaw, adaptado para domínio jurídico.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import { think } from './think';
import { executeSkill } from './executor';
import { Memory } from './memory';
import {
    AgentState,
    AgentStep,
    LoopConfig,
    AgentEvent,
    ThinkDecision
} from './types';

// Configuração padrão
const DEFAULT_CONFIG: LoopConfig = {
    maxIterations: 15,
    timeout: 5 * 60 * 1000, // 5 minutos
    verbose: true,
    allowUserInterrupt: true
};

// Event emitter para comunicação com UI
export const agentEvents = new EventEmitter();

/**
 * Executa o loop do agente até completar o objetivo
 */
export async function runAgentLoop(
    objetivo: string,
    config: Partial<LoopConfig> = {}
): Promise<string> {

    const cfg = { ...DEFAULT_CONFIG, ...config };
    const memory = Memory.getInstance();

    // Inicializa estado
    const state: AgentState = {
        id: uuidv4(),
        objetivo,
        contexto: {
            memoria: await memory.carregar(),
            usuario: await memory.getUsuario()
        },
        passos: [],
        status: 'running',
        iteracao: 0,
        startTime: Date.now()
    };

    log(cfg.verbose, `[Agent] Iniciando loop para: "${objetivo}"`);
    log(cfg.verbose, `[Agent] ID: ${state.id}`);

    try {
        while (state.status === 'running') {
            // Verificar limites
            if (state.iteracao >= cfg.maxIterations) {
                return handleMaxIterations(state);
            }

            if (Date.now() - state.startTime > cfg.timeout) {
                return handleTimeout(state);
            }

            state.iteracao++;
            log(cfg.verbose, `\n[Agent] ═══ Iteração ${state.iteracao} ═══`);

            // ══════════════════════════════════════════════
            // FASE 1: THINK (Raciocínio)
            // ══════════════════════════════════════════════

            log(cfg.verbose, `[Agent] 🧠 Pensando...`);

            const decisao = await think(state);

            // Registra passo
            state.passos.push({
                iteracao: state.iteracao,
                timestamp: new Date().toISOString(),
                tipo: 'think',
                pensamento: decisao.pensamento,
                decisao
            });

            // Emite evento para UI
            emit({ type: 'thinking', pensamento: decisao.pensamento });

            log(cfg.verbose, `[Agent] 💭 Pensamento: ${decisao.pensamento}`);
            log(cfg.verbose, `[Agent] 📋 Decisão: ${decisao.tipo}`);

            // ══════════════════════════════════════════════
            // FASE 2: PROCESSAR DECISÃO
            // ══════════════════════════════════════════════

            switch (decisao.tipo) {

                // ─────────────────────────────────────────
                // RESPOSTA FINAL
                // ─────────────────────────────────────────
                case 'resposta':
                    state.status = 'completed';

                    // Salva na memória
                    await memory.salvarInteracao({
                        objetivo,
                        resposta: decisao.resposta!,
                        passos: state.passos.length,
                        duracao: Date.now() - state.startTime
                    });

                    emit({ type: 'completed', resposta: decisao.resposta! });
                    log(cfg.verbose, `[Agent] ✅ Objetivo completo!`);

                    return decisao.resposta!;

                // ─────────────────────────────────────────
                // PERGUNTA AO USUÁRIO
                // ─────────────────────────────────────────
                case 'pergunta':
                    state.status = 'waiting_user';

                    emit({ type: 'waiting_user', pergunta: decisao.pergunta! });
                    log(cfg.verbose, `[Agent] ❓ Aguardando usuário...`);

                    return `❓ ${decisao.pergunta}`;

                // ─────────────────────────────────────────
                // EXECUTAR SKILL
                // ─────────────────────────────────────────
                case 'skill':
                    log(cfg.verbose, `[Agent] 🔧 Executando: ${decisao.skill}`);

                    // Registra ação
                    state.passos.push({
                        iteracao: state.iteracao,
                        timestamp: new Date().toISOString(),
                        tipo: 'act',
                        skill: decisao.skill,
                        parametros: decisao.parametros
                    });

                    emit({
                        type: 'acting',
                        skill: decisao.skill!,
                        parametros: decisao.parametros
                    });

                    // ══════════════════════════════════════
                    // FASE 3: ACT (Execução)
                    // ══════════════════════════════════════

                    const resultado = await executeSkill(
                        decisao.skill!,
                        decisao.parametros
                    );

                    // ══════════════════════════════════════
                    // FASE 4: OBSERVE (Observação)
                    // ══════════════════════════════════════

                    state.passos.push({
                        iteracao: state.iteracao,
                        timestamp: new Date().toISOString(),
                        tipo: 'observe',
                        resultado
                    });

                    emit({ type: 'observing', resultado });

                    log(cfg.verbose, `[Agent] 👁️ Resultado obtido`);

                    // Atualiza contexto com resultado
                    await updateContext(state, decisao.skill!, resultado);

                    break;
            }
        }

        // Não deveria chegar aqui
        return "Loop encerrado inesperadamente.";

    } catch (error: any) {
        state.status = 'error';
        emit({ type: 'error', erro: error.message });
        log(true, `[Agent] ❌ Erro: ${error.message}`);

        return `Desculpe, ocorreu um erro: ${error.message}`;
    }
}

/**
 * Atualiza contexto baseado no resultado da skill
 */
async function updateContext(
    state: AgentState,
    skill: string,
    resultado: any
): Promise<void> {

    // Atualiza contexto baseado no tipo de skill
    if (skill.startsWith('pje_') && resultado.processo) {
        state.contexto.processo = resultado.processo;
    }

    if (skill.includes('documento') && resultado.documento) {
        if (!state.contexto.documentos) {
            state.contexto.documentos = [];
        }
        state.contexto.documentos.push(resultado.documento);
    }
}

/**
 * Handlers de limite
 */
function handleMaxIterations(state: AgentState): string {
    const resumo = state.passos
        .filter(p => p.tipo === 'act')
        .map(p => `• ${p.skill}`)
        .join('\n');

    return `Atingi o limite de ${state.iteracao} passos. Aqui está o que consegui fazer:\n\n${resumo}\n\nPosso continuar de onde parei?`;
}

function handleTimeout(state: AgentState): string {
    return `O processamento excedeu o tempo limite. Consegui completar ${state.iteracao} passos. Deseja que eu continue?`;
}

/**
 * Utilitários
 */
function emit(event: AgentEvent): void {
    agentEvents.emit('agent', event);
}

function log(verbose: boolean, message: string): void {
    if (verbose) {
        console.log(message);
    }
}

/**
 * Continua execução de um loop pausado
 */
export async function continueAgentLoop(
    stateId: string,
    userInput: string
): Promise<string> {
    // TODO: Implementar continuação de loops pausados
    throw new Error('Not implemented');
}

/**
 * Cancela um loop em execução
 */
export function cancelAgentLoop(stateId: string): boolean {
    // TODO: Implementar cancelamento
    return false;
}
```

### 4.3 `agent/think.ts`

```typescript
/**
 * Módulo Think - Raciocínio do agente
 *
 * Usa LLM para decidir próximo passo baseado no contexto.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentState, ThinkDecision } from './types';
import { callLLM } from '../ai/chat-handler';

// Cache de prompts
let promptsCache: {
    SOUL: string;
    AGENT: string;
    TOOLS: string;
    JURIDICO: string;
} | null = null;

/**
 * Carrega prompts do disco
 */
async function loadPrompts(): Promise<typeof promptsCache> {
    if (promptsCache) return promptsCache;

    const promptsDir = path.join(__dirname, '../prompts');

    promptsCache = {
        SOUL: fs.readFileSync(path.join(promptsDir, 'SOUL.md'), 'utf-8'),
        AGENT: fs.readFileSync(path.join(promptsDir, 'AGENT.md'), 'utf-8'),
        TOOLS: fs.readFileSync(path.join(promptsDir, 'TOOLS.md'), 'utf-8'),
        JURIDICO: fs.readFileSync(path.join(promptsDir, 'JURIDICO.md'), 'utf-8')
    };

    return promptsCache;
}

/**
 * Decide próximo passo baseado no estado atual
 */
export async function think(state: AgentState): Promise<ThinkDecision> {
    const prompts = await loadPrompts();

    // ══════════════════════════════════════════════════════════
    // MONTA SYSTEM PROMPT
    // ══════════════════════════════════════════════════════════

    const systemPrompt = `
${prompts!.SOUL}

---

${prompts!.AGENT}

---

## Ferramentas Disponíveis

${prompts!.TOOLS}

---

## Conhecimento Jurídico

${prompts!.JURIDICO}

---

## Contexto Atual

### Processo (se houver)
${state.contexto.processo ? JSON.stringify(state.contexto.processo, null, 2) : 'Nenhum processo carregado'}

### Documentos Carregados
${state.contexto.documentos?.length
    ? state.contexto.documentos.map(d => `- ${d.nome}: ${d.resumo || 'Sem resumo'}`).join('\n')
    : 'Nenhum documento carregado'}

### Memória Relevante
${formatMemoria(state.contexto.memoria)}

### Preferências do Usuário
${JSON.stringify(state.contexto.usuario, null, 2)}
`;

    // ══════════════════════════════════════════════════════════
    // MONTA USER PROMPT
    // ══════════════════════════════════════════════════════════

    const userPrompt = `
## Objetivo do Usuário
"${state.objetivo}"

## Iteração Atual: ${state.iteracao}

## Histórico de Passos
${formatHistorico(state.passos)}

---

## Sua Tarefa

Analise o objetivo e o histórico. Decida:

1. **O objetivo foi alcançado?** Se sim, forneça resposta final.
2. **Precisa de mais informação do usuário?** Se sim, faça uma pergunta clara.
3. **Precisa executar uma skill?** Se sim, escolha a skill e parâmetros.

---

## Formato de Resposta

Responda APENAS com JSON válido:

\`\`\`json
{
    "pensamento": "Seu raciocínio passo a passo aqui",
    "tipo": "skill" | "resposta" | "pergunta",
    "skill": "nome_da_skill (apenas se tipo=skill)",
    "parametros": { ... (apenas se tipo=skill) },
    "resposta": "Resposta final ao usuário (apenas se tipo=resposta)",
    "pergunta": "Pergunta ao usuário (apenas se tipo=pergunta)"
}
\`\`\`

IMPORTANTE:
- Seja conciso no pensamento
- Use skills disponíveis, não invente
- Se não tem certeza, pergunte ao usuário
- Se já tem informação suficiente, responda
`;

    // ══════════════════════════════════════════════════════════
    // CHAMA LLM
    // ══════════════════════════════════════════════════════════

    const response = await callLLM(systemPrompt, userPrompt);

    // ══════════════════════════════════════════════════════════
    // PARSE RESPOSTA
    // ══════════════════════════════════════════════════════════

    try {
        // Extrai JSON da resposta (pode vir com markdown)
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
                       || response.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            throw new Error('Resposta não contém JSON válido');
        }

        const json = jsonMatch[1] || jsonMatch[0];
        const decisao: ThinkDecision = JSON.parse(json);

        // Validação básica
        if (!decisao.tipo || !decisao.pensamento) {
            throw new Error('Decisão incompleta');
        }

        return decisao;

    } catch (error: any) {
        console.error('[Think] Erro ao parsear resposta:', error);
        console.error('[Think] Resposta raw:', response);

        // Fallback: tenta extrair algo útil
        return {
            tipo: 'resposta',
            pensamento: 'Erro ao processar raciocínio',
            resposta: 'Desculpe, tive dificuldade em processar sua solicitação. Pode reformular?'
        };
    }
}

/**
 * Formata histórico de passos para o prompt
 */
function formatHistorico(passos: any[]): string {
    if (passos.length === 0) {
        return 'Nenhum passo executado ainda.';
    }

    return passos.map(passo => {
        switch (passo.tipo) {
            case 'think':
                return `[Pensamento] ${passo.pensamento}`;
            case 'act':
                return `[Ação] ${passo.skill}(${JSON.stringify(passo.parametros)})`;
            case 'observe':
                const resultado = typeof passo.resultado === 'object'
                    ? JSON.stringify(passo.resultado).substring(0, 500)
                    : passo.resultado;
                return `[Resultado] ${resultado}`;
            default:
                return '';
        }
    }).filter(Boolean).join('\n');
}

/**
 * Formata memória para o prompt
 */
function formatMemoria(memoria: any): string {
    if (!memoria) return 'Sem memória prévia';

    const partes = [];

    if (memoria.processosRecentes?.length) {
        partes.push(`Processos recentes: ${memoria.processosRecentes.join(', ')}`);
    }

    if (memoria.aprendizados?.length) {
        partes.push(`Aprendizados: ${memoria.aprendizados.slice(-5).join('; ')}`);
    }

    return partes.join('\n') || 'Sem memória relevante';
}
```

### 4.4 `agent/executor.ts`

```typescript
/**
 * Executor de Skills
 *
 * Executa skills registradas com tratamento de erro.
 */

import { skills } from '../skills';

export interface SkillResult {
    sucesso: boolean;
    dados?: any;
    erro?: string;
}

/**
 * Executa uma skill pelo nome
 */
export async function executeSkill(
    skillName: string,
    parametros: any
): Promise<SkillResult> {

    console.log(`[Executor] Executando: ${skillName}`);
    console.log(`[Executor] Parâmetros:`, parametros);

    // Busca skill no registry
    const skill = skills[skillName];

    if (!skill) {
        console.error(`[Executor] Skill não encontrada: ${skillName}`);
        return {
            sucesso: false,
            erro: `Skill "${skillName}" não existe. Skills disponíveis: ${Object.keys(skills).join(', ')}`
        };
    }

    // Valida parâmetros
    const validacao = validateParametros(skill, parametros);
    if (!validacao.valido) {
        return {
            sucesso: false,
            erro: `Parâmetros inválidos: ${validacao.erro}`
        };
    }

    // Executa skill
    try {
        const startTime = Date.now();
        const resultado = await skill.execute(parametros);
        const duration = Date.now() - startTime;

        console.log(`[Executor] Skill ${skillName} completada em ${duration}ms`);

        return {
            sucesso: true,
            dados: resultado
        };

    } catch (error: any) {
        console.error(`[Executor] Erro na skill ${skillName}:`, error);

        return {
            sucesso: false,
            erro: error.message
        };
    }
}

/**
 * Valida parâmetros contra schema da skill
 */
function validateParametros(
    skill: any,
    parametros: any
): { valido: boolean; erro?: string } {

    const schema = skill.parametros;

    if (!schema) {
        return { valido: true };
    }

    for (const [nome, config] of Object.entries(schema) as any) {
        if (config.obrigatorio && !(nome in parametros)) {
            return {
                valido: false,
                erro: `Parâmetro obrigatório ausente: ${nome}`
            };
        }

        if (nome in parametros && config.tipo) {
            const tipo = typeof parametros[nome];
            if (tipo !== config.tipo) {
                return {
                    valido: false,
                    erro: `Parâmetro ${nome} deve ser ${config.tipo}, recebeu ${tipo}`
                };
            }
        }
    }

    return { valido: true };
}

/**
 * Lista skills disponíveis
 */
export function listSkills(): string[] {
    return Object.keys(skills);
}

/**
 * Retorna descrição de uma skill
 */
export function describeSkill(skillName: string): any {
    const skill = skills[skillName];

    if (!skill) return null;

    return {
        nome: skill.nome,
        descricao: skill.descricao,
        parametros: skill.parametros
    };
}
```

### 4.5 `agent/memory.ts`

```typescript
/**
 * Sistema de Memória Persistente
 *
 * Armazena contexto entre sessões usando electron-store.
 */

import Store from 'electron-store';

interface MemoriaData {
    processosRecentes: string[];
    interacoes: InteracaoSalva[];
    aprendizados: string[];
    preferencias: Record<string, any>;
    usuario: UsuarioData;
}

interface InteracaoSalva {
    timestamp: string;
    objetivo: string;
    resposta: string;
    passos: number;
    duracao: number;
}

interface UsuarioData {
    nome?: string;
    oab?: string;
    tribunal_principal?: string;
    estilo_escrita?: string;
}

export class Memory {
    private static instance: Memory;
    private store: Store<MemoriaData>;

    private constructor() {
        this.store = new Store<MemoriaData>({
            name: 'lex-agent-memory',
            defaults: {
                processosRecentes: [],
                interacoes: [],
                aprendizados: [],
                preferencias: {},
                usuario: {}
            }
        });
    }

    static getInstance(): Memory {
        if (!Memory.instance) {
            Memory.instance = new Memory();
        }
        return Memory.instance;
    }

    /**
     * Carrega memória completa
     */
    async carregar(): Promise<any> {
        return {
            processosRecentes: this.store.get('processosRecentes', []),
            aprendizados: this.store.get('aprendizados', []),
            preferencias: this.store.get('preferencias', {})
        };
    }

    /**
     * Retorna dados do usuário
     */
    async getUsuario(): Promise<UsuarioData> {
        return this.store.get('usuario', {});
    }

    /**
     * Salva dados do usuário
     */
    async setUsuario(dados: Partial<UsuarioData>): Promise<void> {
        const atual = this.store.get('usuario', {});
        this.store.set('usuario', { ...atual, ...dados });
    }

    /**
     * Registra processo acessado
     */
    async registrarProcesso(numero: string): Promise<void> {
        const recentes = this.store.get('processosRecentes', []);

        // Remove duplicatas e adiciona no início
        const novos = [numero, ...recentes.filter(p => p !== numero)].slice(0, 20);

        this.store.set('processosRecentes', novos);
    }

    /**
     * Salva interação completa
     */
    async salvarInteracao(interacao: Omit<InteracaoSalva, 'timestamp'>): Promise<void> {
        const interacoes = this.store.get('interacoes', []);

        interacoes.push({
            ...interacao,
            timestamp: new Date().toISOString()
        });

        // Mantém últimas 100 interações
        this.store.set('interacoes', interacoes.slice(-100));
    }

    /**
     * Adiciona aprendizado
     */
    async addAprendizado(aprendizado: string): Promise<void> {
        const aprendizados = this.store.get('aprendizados', []);

        if (!aprendizados.includes(aprendizado)) {
            aprendizados.push(aprendizado);
            this.store.set('aprendizados', aprendizados.slice(-50));
        }
    }

    /**
     * Busca interações similares
     */
    async buscarSimilares(objetivo: string): Promise<InteracaoSalva[]> {
        const interacoes = this.store.get('interacoes', []);

        // Busca simples por palavras-chave
        const palavras = objetivo.toLowerCase().split(' ');

        return interacoes
            .filter(i => {
                const texto = i.objetivo.toLowerCase();
                return palavras.some(p => texto.includes(p));
            })
            .slice(-5);
    }

    /**
     * Retorna contexto relevante para um objetivo
     */
    async getRelevante(objetivo: string): Promise<string> {
        const similares = await this.buscarSimilares(objetivo);
        const recentes = this.store.get('processosRecentes', []).slice(0, 5);
        const aprendizados = this.store.get('aprendizados', []).slice(-5);

        const partes = [];

        if (recentes.length) {
            partes.push(`Processos recentes: ${recentes.join(', ')}`);
        }

        if (similares.length) {
            partes.push(`Interações similares anteriores: ${similares.length} encontradas`);
        }

        if (aprendizados.length) {
            partes.push(`Aprendizados: ${aprendizados.join('; ')}`);
        }

        return partes.join('\n') || 'Sem contexto prévio relevante';
    }

    /**
     * Limpa toda a memória
     */
    async limpar(): Promise<void> {
        this.store.clear();
    }
}
```

---

## 5. Skills

### 5.1 `skills/types.ts`

```typescript
/**
 * Interface base para todas as skills
 */

export interface Skill {
    // Identificação
    nome: string;
    descricao: string;
    categoria: 'pje' | 'documentos' | 'pesquisa' | 'utils';

    // Schema de parâmetros
    parametros: {
        [nome: string]: {
            tipo: 'string' | 'number' | 'boolean' | 'object' | 'array';
            descricao: string;
            obrigatorio?: boolean;
            default?: any;
        };
    };

    // Execução
    execute: (params: any) => Promise<any>;
}

export interface SkillRegistry {
    [nome: string]: Skill;
}
```

### 5.2 `skills/index.ts`

```typescript
/**
 * Registry de Skills
 */

import { SkillRegistry } from './types';

// PJe Skills
import { consultarProcesso } from './pje/consultar';
import { listarMovimentacoes } from './pje/movimentacoes';
import { listarDocumentos, baixarDocumento } from './pje/documentos';
import { protocolarPeticao } from './pje/protocolar';

// Documento Skills
import { gerarDocumento } from './documentos/gerar';
import { analisarDocumento } from './documentos/analisar';
import { resumirDocumento } from './documentos/resumir';

// Pesquisa Skills
import { pesquisarJurisprudencia } from './pesquisa/jurisprudencia';

// Utils Skills
import { calcularPrazo } from './utils/calcular_prazo';

export const skills: SkillRegistry = {
    // PJe
    pje_consultar_processo: consultarProcesso,
    pje_listar_movimentacoes: listarMovimentacoes,
    pje_listar_documentos: listarDocumentos,
    pje_baixar_documento: baixarDocumento,
    pje_protocolar_peticao: protocolarPeticao,

    // Documentos
    doc_gerar: gerarDocumento,
    doc_analisar: analisarDocumento,
    doc_resumir: resumirDocumento,

    // Pesquisa
    pesquisa_jurisprudencia: pesquisarJurisprudencia,

    // Utils
    util_calcular_prazo: calcularPrazo
};
```

### 5.3 `skills/pje/consultar.ts`

```typescript
/**
 * Skill: Consultar Processo no PJe
 */

import { Skill } from '../types';
import { PJeAgent } from '../../pje/agent';
import { PJeActions } from '../../pje/actions';
import { Memory } from '../../agent/memory';

export const consultarProcesso: Skill = {
    nome: 'pje_consultar_processo',
    descricao: 'Consulta um processo no PJe e retorna dados completos incluindo partes, documentos e movimentações recentes.',
    categoria: 'pje',

    parametros: {
        numero: {
            tipo: 'string',
            descricao: 'Número do processo (formato: NNNNNNN-DD.AAAA.J.TR.OOOO)',
            obrigatorio: true
        },
        incluir_documentos: {
            tipo: 'boolean',
            descricao: 'Se deve incluir lista de documentos',
            default: true
        },
        incluir_movimentacoes: {
            tipo: 'boolean',
            descricao: 'Se deve incluir movimentações recentes',
            default: true
        }
    },

    async execute(params) {
        const { numero, incluir_documentos = true, incluir_movimentacoes = true } = params;

        // Obtém instância do agente PJe
        const pjeAgent = await PJeAgent.getInstance();
        const actions = new PJeActions(pjeAgent);

        // Consulta processo
        const pagina = await actions.consultarProcesso(numero);

        // Extrai dados básicos
        const dados = await actions.extrairDadosProcesso(pagina);

        // Resultado base
        const resultado: any = {
            processo: dados
        };

        // Documentos (se solicitado)
        if (incluir_documentos) {
            resultado.documentos = await actions.listarDocumentos(pagina);
            resultado.total_documentos = resultado.documentos.length;
        }

        // Movimentações (se solicitado)
        if (incluir_movimentacoes) {
            resultado.movimentacoes = await actions.listarMovimentacoes(pagina);
            resultado.ultima_movimentacao = resultado.movimentacoes[0] || null;
        }

        // Registra na memória
        const memory = Memory.getInstance();
        await memory.registrarProcesso(numero);

        // Gera resumo
        resultado.resumo = gerarResumo(resultado);

        return resultado;
    }
};

function gerarResumo(dados: any): string {
    const p = dados.processo;
    const linhas = [
        `Processo: ${p.numero}`,
        `Classe: ${p.classe}`,
        `Assunto: ${p.assunto}`,
        `Partes: ${p.partes?.autor?.join(', ')} vs ${p.partes?.reu?.join(', ')}`,
    ];

    if (dados.documentos) {
        linhas.push(`Documentos: ${dados.total_documentos} anexados`);
    }

    if (dados.ultima_movimentacao) {
        linhas.push(`Última movimentação: ${dados.ultima_movimentacao.data} - ${dados.ultima_movimentacao.descricao}`);
    }

    return linhas.join('\n');
}
```

### 5.4 `skills/documentos/gerar.ts`

```typescript
/**
 * Skill: Gerar Documento Jurídico
 */

import { Skill } from '../types';
import { sendToWordAddin } from '../../services/word-integration';

export const gerarDocumento: Skill = {
    nome: 'doc_gerar',
    descricao: 'Gera um documento jurídico (contestação, recurso, petição) e abre no Word.',
    categoria: 'documentos',

    parametros: {
        tipo: {
            tipo: 'string',
            descricao: 'Tipo de documento: contestacao, apelacao, agravo, peticao, parecer',
            obrigatorio: true
        },
        processo: {
            tipo: 'object',
            descricao: 'Dados do processo (numero, partes, classe, etc)',
            obrigatorio: true
        },
        contexto: {
            tipo: 'object',
            descricao: 'Contexto adicional (petição inicial, sentença, etc)',
            obrigatorio: false
        },
        instrucoes: {
            tipo: 'string',
            descricao: 'Instruções específicas do advogado',
            obrigatorio: false
        }
    },

    async execute(params) {
        const { tipo, processo, contexto, instrucoes } = params;

        // Monta request para Word Add-in
        const request = {
            documento: { tipo },
            processo: {
                numero: processo.numero,
                tribunal: processo.tribunal || 'TJPA',
                classe: processo.classe,
                assunto: processo.assunto,
                vara: processo.vara || ''
            },
            partes: {
                autor: processo.partes?.autor || [],
                reu: processo.partes?.reu || []
            },
            contexto: contexto || {},
            instrucoes: instrucoes ? { texto: instrucoes } : undefined,
            config: {
                idioma: 'pt-BR',
                formatacao: 'tribunal',
                incluirJurisprudencia: true
            }
        };

        // Envia para Word Add-in
        const response = await sendToWordAddin(request);

        return {
            sucesso: response.status === 'success',
            arquivo: response.documento?.path,
            mensagem: response.mensagem,
            acaoSugerida: response.acaoSugerida
        };
    }
};
```

---

## 6. Prompts

### 6.1 `prompts/SOUL.md`

```markdown
# Lex - Assistente Jurídica Inteligente

Você é **Lex**, uma assistente jurídica especializada no sistema judicial brasileiro, especialmente no PJe (Processo Judicial Eletrônico).

## Sua Identidade

- **Nome**: Lex
- **Especialidade**: Direito brasileiro, processos judiciais, PJe
- **Personalidade**: Profissional, precisa, prestativa, proativa

## Seus Princípios

### 1. Precisão Acima de Tudo
- NUNCA invente informações ou dados
- Se não tem certeza, diga claramente
- Sempre cite fontes (artigos de lei, jurisprudência)

### 2. Proatividade Responsável
- Antecipe problemas e prazos
- Sugira melhorias quando apropriado
- Alerte sobre riscos processuais

### 3. Clareza na Comunicação
- Use linguagem jurídica quando necessário
- Mas explique termos técnicos para leigos
- Seja concisa - advogados são ocupados

### 4. Respeito ao Usuário
- O advogado sempre tem a decisão final
- Você sugere, ele decide
- Nunca execute ações irreversíveis sem confirmação

## Seu Tom de Voz

- Profissional mas acessível
- Direta e objetiva
- Confiante mas não arrogante
- Empática com as pressões do advogado

## Exemplos de Como Falar

**BOM:**
"Analisei o processo. A sentença tem 3 pontos vulneráveis para recurso. O prazo vence em 5 dias. Quer que eu prepare a apelação?"

**RUIM:**
"Olá! Como posso ajudar? Estou aqui para auxiliá-lo em suas necessidades jurídicas!"

**BOM:**
"Não encontrei jurisprudência favorável no STJ. Sugiro focar nos tribunais estaduais ou reformular a tese."

**RUIM:**
"Encontrei várias decisões que podem ajudar!" (sem especificar quais)
```

### 6.2 `prompts/AGENT.md`

```markdown
# Comportamento do Agente

Você opera em um loop de raciocínio-ação-observação até completar o objetivo.

## Ciclo de Decisão

A cada iteração, você deve:

1. **ANALISAR** o objetivo e o histórico de passos
2. **DECIDIR** se:
   - O objetivo foi alcançado → forneça resposta final
   - Precisa de mais informação do usuário → faça pergunta clara
   - Precisa executar uma ação → escolha a skill apropriada
3. **EXECUTAR** ou **RESPONDER**

## Regras de Execução

### Quando usar Skills
- Use skills para obter informações que você não tem
- Use skills para executar ações no PJe ou Word
- Combine múltiplas skills quando necessário

### Quando Responder
- Quando tiver informação suficiente para atender o objetivo
- Quando o objetivo for uma pergunta simples
- Quando todas as ações necessárias foram completadas

### Quando Perguntar
- Quando o objetivo for ambíguo
- Quando precisar de confirmação antes de ação importante
- Quando houver múltiplas opções válidas

## Estratégias

### Para Consultas de Processo
1. Use `pje_consultar_processo` primeiro
2. Analise os dados retornados
3. Se precisar de mais detalhes, use skills específicas

### Para Criação de Documentos
1. Certifique-se de ter os dados do processo
2. Identifique o tipo de documento
3. Use `doc_gerar` com contexto completo
4. Informe que o documento está no Word

### Para Pesquisa
1. Identifique os termos relevantes
2. Use `pesquisa_jurisprudencia`
3. Sintetize os resultados relevantes

## Limites

- Máximo de 15 iterações por objetivo
- Não execute ações destrutivas sem confirmação
- Se atingir o limite, resuma o que conseguiu fazer
```

### 6.3 `prompts/TOOLS.md`

```markdown
# Ferramentas Disponíveis

## PJe - Processo Judicial Eletrônico

### pje_consultar_processo
Consulta um processo e retorna dados completos.

**Parâmetros:**
- `numero` (string, obrigatório): Número do processo
- `incluir_documentos` (boolean): Incluir lista de documentos (default: true)
- `incluir_movimentacoes` (boolean): Incluir movimentações (default: true)

**Retorna:** Dados do processo, partes, documentos, movimentações, resumo

---

### pje_listar_movimentacoes
Lista movimentações de um processo.

**Parâmetros:**
- `numero` (string, obrigatório): Número do processo
- `limite` (number): Quantidade máxima (default: 20)

**Retorna:** Lista de movimentações com data e descrição

---

### pje_listar_documentos
Lista documentos anexados a um processo.

**Parâmetros:**
- `numero` (string, obrigatório): Número do processo

**Retorna:** Lista de documentos com nome, tipo e data

---

### pje_baixar_documento
Faz download de um documento específico.

**Parâmetros:**
- `numero` (string, obrigatório): Número do processo
- `documento_id` (string, obrigatório): ID do documento

**Retorna:** Caminho do arquivo baixado

---

### pje_protocolar_peticao
Protocola uma petição no processo.

**Parâmetros:**
- `numero` (string, obrigatório): Número do processo
- `arquivo` (string, obrigatório): Caminho do arquivo
- `tipo` (string): Tipo da petição

**Retorna:** Confirmação e número do protocolo

---

## Documentos

### doc_gerar
Gera um documento jurídico e abre no Word.

**Parâmetros:**
- `tipo` (string, obrigatório): contestacao, apelacao, agravo, peticao, parecer
- `processo` (object, obrigatório): Dados do processo
- `contexto` (object): Documentos de referência
- `instrucoes` (string): Instruções específicas

**Retorna:** Caminho do arquivo gerado

---

### doc_analisar
Analisa um documento e extrai informações.

**Parâmetros:**
- `caminho` (string): Caminho do arquivo
- `texto` (string): Ou texto direto

**Retorna:** Resumo, pontos principais, tipo de documento

---

### doc_resumir
Gera resumo de um documento.

**Parâmetros:**
- `caminho` (string): Caminho do arquivo
- `texto` (string): Ou texto direto
- `tamanho` (string): curto, medio, longo

**Retorna:** Resumo do documento

---

## Pesquisa

### pesquisa_jurisprudencia
Busca jurisprudência nos tribunais.

**Parâmetros:**
- `termo` (string, obrigatório): Termo de busca
- `tribunais` (array): Lista de tribunais (default: todos)
- `limite` (number): Quantidade máxima (default: 10)

**Retorna:** Lista de decisões com ementa e link

---

## Utilitários

### util_calcular_prazo
Calcula prazo processual.

**Parâmetros:**
- `data_inicial` (string, obrigatório): Data de início
- `dias` (number, obrigatório): Quantidade de dias
- `tipo` (string): uteis ou corridos (default: uteis)

**Retorna:** Data final do prazo
```

### 6.4 `prompts/JURIDICO.md`

```markdown
# Conhecimento Jurídico

## Prazos Processuais Comuns

| Ato | Prazo | Fundamento |
|-----|-------|------------|
| Contestação | 15 dias | Art. 335, CPC |
| Réplica | 15 dias | Art. 351, CPC |
| Apelação | 15 dias | Art. 1.003, §5º, CPC |
| Agravo de Instrumento | 15 dias | Art. 1.003, §5º, CPC |
| Embargos de Declaração | 5 dias | Art. 1.023, CPC |
| Recurso Especial | 15 dias | Art. 1.003, §5º, CPC |
| Recurso Extraordinário | 15 dias | Art. 1.003, §5º, CPC |

## Classes Processuais

### Conhecimento
- Procedimento Comum
- Procedimento Sumário (revogado)
- Procedimentos Especiais

### Execução
- Execução de Título Extrajudicial
- Cumprimento de Sentença

### Cautelar (integrado)
- Tutela de Urgência
- Tutela de Evidência

## Tipos de Decisão

- **Despacho**: Ato sem conteúdo decisório
- **Decisão Interlocutória**: Resolve questão incidental
- **Sentença**: Resolve o mérito ou extingue o processo
- **Acórdão**: Decisão colegiada de tribunal

## Recursos Cabíveis

| Decisão | Recurso |
|---------|---------|
| Decisão Interlocutória | Agravo de Instrumento (hipóteses do art. 1.015) |
| Sentença | Apelação |
| Acórdão | REsp, RE, Embargos |
| Qualquer decisão | Embargos de Declaração |

## Tribunais do PJe

- **TJPA**: Tribunal de Justiça do Pará
- **TRF1**: Tribunal Regional Federal da 1ª Região
- **TRT8**: Tribunal Regional do Trabalho da 8ª Região
- **STF**: Supremo Tribunal Federal
- **STJ**: Superior Tribunal de Justiça
- **TST**: Tribunal Superior do Trabalho
```

---

## 7. Integração com UI

### `core/ipc-handlers.ts` (adições)

```typescript
import { ipcMain } from 'electron';
import { runAgentLoop, agentEvents } from '../agent/loop';

export function registerAgentHandlers(mainWindow: BrowserWindow) {

    // Executa objetivo
    ipcMain.handle('agent-run', async (_, objetivo: string) => {
        // Forward eventos para UI
        const handler = (event: any) => {
            mainWindow.webContents.send('agent-event', event);
        };
        agentEvents.on('agent', handler);

        try {
            const resposta = await runAgentLoop(objetivo);
            return { sucesso: true, resposta };
        } catch (error: any) {
            return { sucesso: false, erro: error.message };
        } finally {
            agentEvents.off('agent', handler);
        }
    });

    // Cancela execução
    ipcMain.handle('agent-cancel', async (_, stateId: string) => {
        // TODO: implementar cancelamento
    });
}
```

### UI (Renderer)

```javascript
// Escuta eventos do agente
window.lexApi.onAgentEvent((event) => {
    switch (event.type) {
        case 'thinking':
            showThinking(event.pensamento);
            break;
        case 'acting':
            showAction(event.skill);
            break;
        case 'completed':
            showResponse(event.resposta);
            break;
        case 'error':
            showError(event.erro);
            break;
    }
});
```

---

## 8. Cronograma de Implementação

| Fase | Tarefa | Tempo | Dependências |
|------|--------|-------|--------------|
| 1 | Estrutura de pastas e tipos | 1h | - |
| 2 | `agent/loop.ts` | 3h | Fase 1 |
| 3 | `agent/think.ts` | 2h | Fase 2 |
| 4 | `agent/executor.ts` | 1h | Fase 2 |
| 5 | `agent/memory.ts` | 2h | Fase 1 |
| 6 | Prompts (SOUL, AGENT, TOOLS, JURIDICO) | 2h | - |
| 7 | Skills básicas (consultar, listar) | 3h | Playwright |
| 8 | Skills documentos (gerar) | 2h | Word Integration |
| 9 | Skills pesquisa | 1h | Crawler |
| 10 | Integração IPC | 1h | Fase 2 |
| 11 | Integração UI | 2h | Fase 10 |
| 12 | Testes E2E | 3h | Todas |

**Total: ~23 horas**

---

## 9. BYOK — Camada Multi-Provider (v5.0)

### Motivação

O Lex é vendido como **infraestrutura jurídica**. O usuário traz sua própria chave de IA — não depende de conta Anthropic exclusiva.

### Providers suportados

| Provider | Endpoint | Vision | Stagehand |
|---|---|---|---|
| Anthropic | `api.anthropic.com` | ✅ nativo | ✅ `anthropic/model` |
| OpenAI | `api.openai.com` | ✅ `image_url` | ✅ `openai/model` |
| OpenRouter | `openrouter.ai/api/v1` | ✅ `image_url` | ✅ `openrouter/model` |
| Google AI | `generativelanguage.googleapis.com` | ✅ `inline_data` | ✅ `google/model` |
| Groq | `api.groq.com/openai/v1` | ✅ `image_url` | ✅ via OpenAI compat |

### Arquivos centrais

```
electron/provider-config.ts   ← registro de presets + ActiveProviderConfig
electron/ai-handler.ts        ← roteador callAI() + callAIWithVision()
electron/browser-manager.ts   ← Chrome externo via Playwright CDP
electron/main.ts              ← store multi-key + IPC: store-set-provider, store-set-api-key
electron/preload.ts           ← bridge: setProvider(), setApiKey(), getProviderPresets()
src/renderer/js/app.js        ← loadProviderSettings(), saveProviderSettings()
```

### Fluxo de dados

```
App start
  initStore()
    → store.get('aiProvider')        # provider + modelos salvos
    → store.get('apiKeys')[provider] # chave encriptada AES-256-GCM
    → setActiveConfig()              # singleton runtime
    → ensureBrowser()               # Chrome externo via Playwright CDP

Settings change
  UI → setApiKey(providerId, key)   → store encriptado
  UI → setProvider({ providerId })  → setActiveConfig() + reInitBrowser()

callAI() / callAIWithVision()
  → getActiveConfig().providerId
  → switch: callAnthropic / callOpenAICompat / callGoogle
  (OpenRouter e Groq reusam callOpenAICompat com baseUrl diferente)
```

### Modelos gratuitos recomendados (OpenRouter)

| Uso | Modelo | Vision |
|---|---|---|
| Browser/PJe | `qwen/qwen2.5-vl-32b-instruct:free` | ✅ |
| Browser/PJe | `meta-llama/llama-4-maverick:free` | ✅ |
| Agente texto | `qwen/qwen3-235b-a22b:free` | ❌ |
| Agente texto | `deepseek/deepseek-r1-0528:free` | ❌ |
| Coding | `deepseek/deepseek-v3-0324:free` | ❌ |

Guia completo de modelos: `docs/MODEL-GUIDE.md`

---

## 10. Referências

- [ReAct Pattern Paper](https://arxiv.org/abs/2210.03629)
- [Playwright CDP Docs](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
- [OpenRouter Free Models](https://openrouter.ai/collections/free-models)

---

*Documento criado em: Janeiro 2026*
*Versão: 5.1 — março 2026 (browser-manager Playwright CDP, modelos atualizados)*
