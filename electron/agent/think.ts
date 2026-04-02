/**
 * Lex Agent Think
 *
 * Módulo de raciocínio - usa LLM para decidir próximo passo.
 * Inspirado no OpenClaw, integrado com Prompt-Layer.
 */

import { AgentState, AgentStep, ThinkDecision, AgentConfig, AgentSpec } from './types';
import { getSkillsForPrompt } from './executor';
import { buildPromptLayerSystem, getDefaultTenantConfig } from './prompt-layer';
import { getContextBudget } from './context-budget';
import { mask } from '../privacy/pii-vault';
import { logLLMCall } from '../privacy/audit-log';
import { getEffectiveLevel } from '../privacy/consent-manager';
import { getVaultStats } from '../privacy/pii-vault';

/**
 * Decide próximo passo baseado no estado atual.
 * onToken: callback chamado para cada token do campo "resposta" no JSON gerado.
 */
export async function think(
    state: AgentState,
    config: AgentConfig,
    onToken?: (token: string) => void,
    agentSpec?: AgentSpec
): Promise<ThinkDecision> {
    const systemPrompt = buildSystemPrompt(state, agentSpec);
    const userPrompt = buildUserPrompt(state);
    const response = await callLLM(systemPrompt, userPrompt, config, onToken);

    // Audit log: registra chamada LLM com stats de privacidade
    try {
        const vault = state.piiVault;
        const stats = vault ? getVaultStats(vault) : null;
        const { getActiveConfig } = await import('../provider-config');
        const providerCfg = getActiveConfig();
        logLLMCall({
            provider: providerCfg.providerId,
            model: config.model || providerCfg.agentModel,
            piiMasked: stats?.totalMasked ?? 0,
            piiTypes: stats ? Object.entries(stats.byCategory)
                .filter(([_, count]) => count > 0)
                .map(([cat]) => cat as any) : [],
            consentLevel: getEffectiveLevel(providerCfg.providerId),
            dataSize: systemPrompt.length + userPrompt.length,
            runId: state.id
        });
    } catch { /* audit log is best-effort */ }

    return parseThinkResponse(response);
}

// ============================================================================
// SYSTEM PROMPT CACHE (per-run)
// ============================================================================

/**
 * Cache de seções estáticas do system prompt, indexado por runId.
 * Seções que não mudam entre iterações são calculadas uma vez e reusadas,
 * economizando ~40-60% do processamento de prompt por iteração.
 */
interface PromptCache {
    /** Seções 100% estáticas: prompt-layer, agentSpec extra, response format */
    staticPrefix: string;
    /** Response format (estático, fica no final) */
    responseFormat: string;
    /** Flag: objetivo é análise (para controlar skipGreeting/forceCompact) */
    isAnalysis: boolean;
    /** Behavior "full" (estabiliza na iter 1+) */
    behaviorFull?: string;
    /** Skills "full" (estabiliza na iter 2+) */
    skillsFull?: string;
    /** Allowed skill categories do agentSpec */
    allowedCategories?: Array<string> | undefined;
}
const promptCache = new Map<string, PromptCache>();

/** Limpa cache de um run encerrado */
export function clearPromptCache(runId: string): void {
    promptCache.delete(runId);
}

/** Calcula e armazena o cache de seções estáticas para um run */
function initPromptCache(runId: string, state: AgentState, agentSpec?: AgentSpec): PromptCache {
    const staticSections: string[] = [];

    // 1. Prompt-Layer (personalidade do tenant — fixo por run)
    const tenantConfig = state.contexto.tenantConfig || getDefaultTenantConfig();
    const isAnalysis = detectAnalysisIntent(state.objetivo);
    staticSections.push(buildPromptLayerSystem(tenantConfig, { skipGreeting: isAnalysis }));

    // 1.5. Prompt extra do AgentSpec (fixo por run)
    if (agentSpec?.systemPromptExtra) {
        staticSections.push(agentSpec.systemPromptExtra);
    }

    const cache: PromptCache = {
        staticPrefix: staticSections.join('\n\n---\n\n'),
        responseFormat: getResponseFormat(),
        isAnalysis,
        allowedCategories: agentSpec?.allowedSkillCategories,
    };
    promptCache.set(runId, cache);
    return cache;
}

/**
 * Monta o system prompt completo.
 * Seções estáticas são cacheadas por run (state.id).
 */
function buildSystemPrompt(state: AgentState, agentSpec?: AgentSpec): string {
    const cache = promptCache.get(state.id) ?? initPromptCache(state.id, state, agentSpec);

    const parts: string[] = [cache.staticPrefix];

    // 2. Behavior: compacto na iter 0, full a partir da iter 1 (cacheado)
    const needsFull = state.iteracao > 0 || state.passos.some(p => p.tipo === 'act');
    if (needsFull) {
        if (!cache.behaviorFull) {
            cache.behaviorFull = getAgentBehavior(true);
        }
        parts.push(cache.behaviorFull);
    } else {
        parts.push(getAgentBehavior(false));
    }

    // 3. Skills: compacto na iter 0 para análise, full a partir da iter 1 (cacheado)
    const forceCompact = cache.isAnalysis && state.iteracao === 0;
    if (!forceCompact && state.iteracao > 1) {
        if (!cache.skillsFull) {
            cache.skillsFull = getSkillsForPrompt(state.iteracao, cache.allowedCategories, false);
        }
        parts.push(cache.skillsFull);
    } else {
        parts.push(getSkillsForPrompt(state.iteracao, cache.allowedCategories, forceCompact));
    }

    // 4. Contexto atual (SEMPRE dinâmico — muda a cada iteração)
    parts.push(buildContextSection(state));

    // 5. Response format (estático, cacheado)
    parts.push(cache.responseFormat);

    return parts.join('\n\n---\n\n');
}

/**
 * Comportamento do agente no loop.
 * Compacto na 1ª iteração (prioriza análise), completo após skills.
 */
function getAgentBehavior(fullBehavior: boolean): string {
    return fullBehavior ? getAgentBehaviorFull() : getAgentBehaviorCompact();
}

/**
 * Versão compacta: regras essenciais + quando usar skill/resposta/pergunta.
 * Usada na 1ª iteração — prioriza qualidade de análise sobre detalhes de skills.
 */
function getAgentBehaviorCompact(): string {
    return `# Comportamento do Agente

Você opera em um loop de **Think → Act → Observe** até completar o objetivo.

## Decisão a cada iteração:
- **resposta**: você já sabe responder → resposta final completa e profunda
- **skill**: precisa executar uma ferramenta (PJe, browser, documento, pesquisa, OS)
- **pergunta**: objetivo ambíguo, precisa de clarificação

## Regras de decisão
- Se o objetivo é uma **pergunta jurídica, análise de caso ou consulta conceitual** → tipo=resposta com análise profunda
- Se o objetivo pede **ação** no PJe, browser ou sistema → tipo=skill
- Para executar comandos do terminal (python, pip, git, npm) → skill terminal_executar
- Se ambíguo ("pastas", "arquivos", "documentos" sem contexto PJe/PC) → tipo=pergunta
- NUNCA responda com instruções textuais quando há skill que executa a ação
- Para comandos PJe (abrir, consultar, navegar), use skills pje_* ou browser_*

## Alerta de Prazo
Quando observar resultado de pje_consultar com 'ultima_movimentacao':
- >30 dias sem movimentação: alerte ⚠️
- Processo recente (<15 dias) sem movimentação: alerte sobre prazo de resposta`;
}

/**
 * Versão completa: inclui estratégias detalhadas de browser/PJe/OS.
 * Usada a partir da 2ª iteração ou quando skills já foram executadas.
 */
function getAgentBehaviorFull(): string {
    return `# Comportamento do Agente

Você opera em um loop de **Think → Critic → Act → Observe** até completar o objetivo.

## A cada iteração, você deve:

1. **ANALISAR** o objetivo e o histórico
2. **DECIDIR** uma das três opções:
   - **skill**: executar uma ferramenta
   - **resposta**: objetivo alcançado, fornecer resposta final
   - **pergunta**: precisa de mais informação do usuário
3. **ASSUMIR** que a decisão passará por um Critic antes da execução da skill

## Regras

### Quando usar Skills
- Para obter informações que você não tem
- Para executar ações no PJe ou gerar documentos
- Combine múltiplas skills quando necessário
- Se o usuario der comando operacional no PJe (ex: "vai", "abra", "entre", "clique", "navegue"), prefira tipo=skill.
- Para navegar, clicar ou preencher campos no browser, prefira skills atomicas (browser_click, browser_fill, browser_type, browser_press). Use browser_get_state primeiro para ver seletores.
- NUNCA responda apenas com instrucoes textuais quando ha uma skill que executa a acao.
- EXCECAO CRITICA - TERMOS AMBIGUOS: As palavras "pastas", "arquivos", "documentos" podem referir-se ao PC Windows OU ao PJe. Se o usuario nao mencionar explicitamente PJe, tribunal, processo ou numero de processo, use tipo=pergunta ANTES de qualquer skill.

### Quando Responder
- Quando tiver informação suficiente para atender o objetivo
- Quando todas as ações necessárias foram completadas
- Quando o objetivo for uma pergunta simples que você sabe responder

### Quando Perguntar
- Quando o objetivo for ambíguo
- Quando precisar de confirmação antes de ação importante

## Estratégias de Skills

### PJe
- \`pje_abrir\`: abre PJe + orienta login com certificado
- \`pje_consultar\`: consulta processo por número → analise dados → use pje_movimentacoes/pje_documentos se preciso
- \`pje_navegar\`: navegar menus do PJe
- \`pje_preencher\`: preencher campos no PJe

### Browser (preferir skills atômicas)
1. \`browser_get_state\` → ver refs numerados na página
2. \`browser_click { ref: N }\` / \`browser_fill { ref: N, valor: "texto" }\`
3. \`browser_type\`: digitação tecla a tecla (autocomplete)
4. \`browser_navigate\`: ir a URL
5. \`browser_wait\`: aguardar elemento
6. \`browser_auto_task\` / \`pje_agir\`: APENAS se atômicas falharem (LENTO, usa Vision)
- **Referência**: ref (número) > elemento (texto visível) > seletor (CSS)
- Se PJe abriu aba nova: \`browser_list_tabs\` + \`browser_switch_tab\`

### Terminal e Comandos do Sistema
- \`terminal_executar\`: executar comandos shell com saída em tempo real (python, pip, git, npm, etc). Preferir sobre os_sistema para execução de comandos.
- \`os_sistema\`: informações do SO, pastas conhecidas, abrir programas, listar/encerrar processos

### Documentos e Pesquisa
- \`doc_gerar\`: gerar documento com contexto completo
- \`pesquisa_jurisprudencia\`: busca termos relevantes
- \`os_arquivos\`: ler arquivo (PDF, DOCX, XLSX → texto automático)
- \`os_clipboard\`: copiar texto para Ctrl+V

### CAPTCHA
- PJe: tipo=pergunta, peça ao usuário resolver
- Site de pesquisa (auto-solve OK): continue
- Auto-solve falhou: tente via browser, senão peça ajuda

## Desambiguação: PC vs PJe
- Contexto PJe claro (processo, tribunal, petição) → skill pje_*
- Contexto PC claro (C:, Downloads, .pdf) → skill os_*
- Sem contexto → OBRIGATÓRIO tipo=pergunta

## Alerta de Prazo
Quando observar resultado de pje_consultar com 'ultima_movimentacao':
- >30 dias sem movimentação → ⚠️ alerte
- Processo recente (<15 dias) sem movimentação → ⚠️ prazo de resposta`;
}

/**
 * Detecta se o objetivo do usuário é uma análise de caso jurídico
 * (vs comando operacional ou pergunta simples).
 * Usado para reforçar instruções de profundidade em modelos menores.
 */
function detectAnalysisIntent(objetivo: string): boolean {
    const lower = objetivo.toLowerCase();
    const len = objetivo.length;

    // Texto longo (>200 chars) com termos jurídicos = provável caso para análise
    if (len > 200) {
        const legalTerms = /contrato|rescis|indeniza|dano|processo|ação|petição|sentença|recurso|prazo|cláusula|artigo|lei |código|responsabilidade|inadimpl|litígio|acordo|conflito|disputa|alegaç|defesa|autor|réu|obrigaç/i;
        if (legalTerms.test(objetivo)) return true;
    }

    // Pedidos explícitos de análise
    if (/analis|me ajud[ea] (com|nesse|neste) caso|parecer|avaliar|examinar|estud[ae]r? (o |esse |este )?caso/i.test(lower)) return true;

    // Perguntas sobre estratégia/recomendação com contexto jurídico
    if (/o que (eu )?fa[çz]o|como proceder|qual .*estratégia|chances de|viabilidade|fundament/i.test(lower) && len > 100) return true;

    return false;
}

/**
 * Retorna info enriquecida do browser: URL, número de abas.
 * Retorna null se o browser não estiver ativo.
 * (título é async — o agente pode usar browser_get_state para obtê-lo)
 */
function getActiveBrowserInfo(): { url: string; title: string; tabCount: number } | null {
    try {
        const { getActivePage, getBrowserContext } = require('../browser-manager');
        const page = getActivePage();
        const url = page?.url();
        if (!url || url === 'about:blank') return null;

        let tabCount = 1;
        try {
            const ctx = getBrowserContext();
            tabCount = ctx.pages().length;
        } catch { /* ok */ }

        return { url, title: '', tabCount };
    } catch {
        return null;
    }
}

/**
 * Monta seção de contexto
 */
function buildContextSection(state: AgentState): string {
    const budget = getContextBudget();
    const parts: string[] = ['# Contexto Atual'];

    // Data e hora atual
    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString('pt-BR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    parts.push(`## Data/Hora\n${dataFormatada}, ${horaFormatada}`);

    // Dados do usuário (advogado)
    const usr = state.contexto.usuario;
    if (usr && (usr.nome || usr.oab || usr.escritorio || usr.tribunal_preferido)) {
        const linhas: string[] = [];
        if (usr.nome)              linhas.push(`Nome: ${usr.nome}`);
        if (usr.oab)               linhas.push(`OAB: ${usr.oab}`);
        if (usr.escritorio)        linhas.push(`Escritório: ${usr.escritorio}`);
        if (usr.tribunal_preferido) linhas.push(`Tribunal preferido: ${usr.tribunal_preferido}`);
        if (usr.estilo_escrita)    linhas.push(`Estilo de escrita: ${usr.estilo_escrita}`);
        parts.push(`## Usuário\n${linhas.join('\n')}`);
    } else {
        // Fallback: mostra pelo menos o tribunal preferido se disponível
        const tribunalPreferido = state.contexto.memoria?.preferencias?.['tribunal_preferido'];
        if (tribunalPreferido) {
            parts.push(`## Tribunal Preferido do Usuário\n${tribunalPreferido}`);
        }
    }

    // Estado do navegador (enriquecido: URL + título + abas)
    const browserInfo = getActiveBrowserInfo();
    if (browserInfo) {
        const lines = [`Ativo — URL atual: ${browserInfo.url}`];
        if (browserInfo.title) lines.push(`Título: ${browserInfo.title}`);
        if (browserInfo.tabCount > 1) lines.push(`Abas abertas: ${browserInfo.tabCount}`);
        parts.push(`## Navegador (Chrome)\n${lines.join('\n')}`);
    } else {
        parts.push(`## Navegador (Chrome)\nFechado ou não iniciado. Use pje_abrir para abrir.`);
    }

    // Processo
    if (state.contexto.processo) {
        const p = state.contexto.processo;
        parts.push(`## Processo Carregado
- Número: ${p.numero}
- Classe: ${p.classe}
- Assunto: ${p.assunto}
- Partes: ${p.partes.autor.join(', ')} vs ${p.partes.reu.join(', ')}
- Status: ${p.status}`);
    } else {
        parts.push('## Processo\nNenhum processo carregado ainda.');
    }

    // Documentos
    if (state.contexto.documentos.length > 0) {
        const docs = state.contexto.documentos
            .map(d => `- ${d.nome} (${d.tipo})${d.resumo ? ': ' + d.resumo : ''}`)
            .join('\n');
        parts.push(`## Documentos Carregados\n${docs}`);
    }

    // Resultados anteriores (budget-aware)
    const resultadoKeys = Object.keys(state.contexto.resultados);
    if (resultadoKeys.length > 0) {
        const resultados: string[] = [];
        for (const [skill, valor] of Object.entries(state.contexto.resultados)) {
            const resumo = typeof valor === 'object'
                ? JSON.stringify(valor).substring(0, budget.maxSkillResultsChars)
                : String(valor).substring(0, budget.maxSkillResultsChars);
            resultados.push(`- ${skill}: ${resumo}`);
        }
        parts.push(`## Resultados de Skills Anteriores\n${resultados.join('\n')}`);
    }

    // Interações passadas similares (TF-IDF)
    const similares = state.contexto.memoria?.interacoesSimilares;
    if (similares && similares.length > 0) {
        const linhas = similares.map(s =>
            `- "${s.objetivo.substring(0, 80)}" → ${s.sucesso ? '✓ Sucesso' : '✗ Falhou'}`
        );
        parts.push(`## Tarefas Similares Anteriores\n${linhas.join('\n')}`);
    }

    // Brain context (FTS5 + grafo) — prioridade sobre memória legada
    if (state.contexto.brainContext) {
        let brainSection = `## Memória (Brain)\n${state.contexto.brainContext}`;
        if (brainSection.length > budget.maxMemoryChars) {
            brainSection = brainSection.substring(0, budget.maxMemoryChars) + '...';
        }
        parts.push(brainSection);
    } else if (state.contexto.memoria) {
        // Fallback: memória legada (budget-aware)
        const mem = state.contexto.memoria;
        const memParts: string[] = ['## Memória Persistente'];

        if (mem.processosRecentes && mem.processosRecentes.length > 0) {
            memParts.push(`Processos recentes: ${mem.processosRecentes.slice(0, 5).join(', ')}`);
        }

        if (mem.aprendizados && mem.aprendizados.length > 0) {
            memParts.push(`Aprendizados: ${mem.aprendizados.slice(-3).join('; ')}`);
        }

        // Cross-session facts
        if (mem.fatos && mem.fatos.length > 0) {
            const factsLines = mem.fatos.slice(0, 5).map(f => {
                let line = `- ${f.processoNumero}`;
                if (f.classe) line += ` (${f.classe})`;
                if (f.tesesDiscutidas.length) line += `: ${f.tesesDiscutidas.slice(0, 2).join(', ')}`;
                return line;
            });
            memParts.push(`Processos com contexto de sessões anteriores:\n${factsLines.join('\n')}`);
        }

        if (memParts.length > 1) {
            let memSection = memParts.join('\n');
            if (memSection.length > budget.maxMemoryChars) {
                memSection = memSection.substring(0, budget.maxMemoryChars) + '...';
            }
            parts.push(memSection);
        }
    }

    // RAG: chunks relevantes dos documentos do escritório (budget-aware)
    if (state.contexto.ragContexto && state.contexto.ragContexto.length > 0) {
        let totalRagChars = 0;
        const limitedChunks: string[] = [];
        for (const c of state.contexto.ragContexto) {
            const chunk = `### [doc: ${c.arquivo}]\n${c.trecho}`;
            if (totalRagChars + chunk.length > budget.maxRAGChars) break;
            limitedChunks.push(chunk);
            totalRagChars += chunk.length;
        }
        if (limitedChunks.length > 0) {
            parts.push(`## Documentos do Escritório (RAG)\nTrechos relevantes encontrados nos documentos indexados. Cite a fonte ao usar.\n\n${limitedChunks.join('\n\n')}`);
        }
    }

    const chatHistory = state.contexto.chatHistory;
    if (chatHistory) {
        // Histórico logo após o header — prioridade alta para continuidade
        parts.splice(1, 0, `## Histórico Recente da Conversa\n${chatHistory}`);
    }

    // Legal Language Engine — vocabulário contextual
    try {
        const { buildLegalContextBlock, detectLegalArea } = require('../legal');
        const areas = detectLegalArea(state.objetivo);
        if (areas.length > 0) {
            const legalBlock = buildLegalContextBlock(state.objetivo, areas, undefined, 'large');
            if (legalBlock) parts.push(legalBlock);
        }
    } catch { /* legal module optional */ }

    let context = parts.join('\n\n');

    // PII Vault: mascara dados sensíveis antes de enviar pro LLM
    const vault = state.piiVault;
    if (vault) {
        context = mask(vault, context, state.contexto.processo);
    }

    return context;
}

/**
 * Formato de resposta esperado
 */
function getResponseFormat(): string {
    return `# Formato de Resposta

Responda usando tags XML. NÃO use JSON. Sempre inclua <pensamento> e <tipo>.

## Se tipo = resposta:

<pensamento>
Raciocine aqui ANTES de responder (o usuário NÃO vê esta tag).
Para análise de caso, estruture seu raciocínio:
- Quais são os eixos do conflito?
- Para cada eixo: fundamento legal + risco probatório + argumento do lado oposto
- Qual lado tem posição mais forte e por quê?
Pense profundamente — a qualidade da resposta depende da qualidade do raciocínio aqui.
</pensamento>
<tipo>resposta</tipo>
<resposta>Markdown livre — siga as regras de profundidade e estilo do system prompt</resposta>

## Se tipo = skill:

<pensamento>Preciso consultar o processo...</pensamento>
<tipo>skill</tipo>
<skill>nome_da_skill</skill>
<parametros>{"chave": "valor"}</parametros>

## Se tipo = pergunta:

<pensamento>Preciso saber se é PJe ou PC...</pensamento>
<tipo>pergunta</tipo>
<pergunta>Sua pergunta aqui</pergunta>
<opcoes>["opção 1", "opção 2"]</opcoes>

REGRAS:
- Responda SOMENTE com as tags acima, sem texto fora delas
- <parametros> e <opcoes> usam JSON dentro da tag
- Use apenas skills que existem na lista
- Se não tem certeza, pergunte ao usuário
- Se já tem informação suficiente, responda
- Dentro de <resposta>, escreva markdown livre — NÃO escape caracteres`;
}

/**
 * Monta user prompt com objetivo e histórico
 */
function buildUserPrompt(state: AgentState): string {
    const parts: string[] = [];

    // Objetivo
    parts.push(`## Objetivo do Usuário
"${state.objetivo}"`);

    // Iteração
    parts.push(`## Iteração Atual: ${state.iteracao}`);

    // Histórico (P0 Fix 3: comprime passos antigos para economizar tokens)
    if (state.passos.length > 0) {
        const RECENT_STEPS = 3;

        if (state.passos.length <= RECENT_STEPS) {
            parts.push(`## Histórico de Passos\n${formatSteps(state.passos)}`);
        } else {
            const older = state.passos.slice(0, -RECENT_STEPS);
            const recent = state.passos.slice(-RECENT_STEPS);

            // Compacta passos antigos: skill() → ✓/✗
            const compact = older
                .filter(p => p.tipo === 'act' || p.tipo === 'observe')
                .map(p => {
                    if (p.tipo === 'act') return `${p.skill}()`;
                    if (p.tipo === 'observe') return p.resultado?.sucesso ? '✓' : `✗ ${(p.resultado?.erro || '').substring(0, 50)}`;
                    return '';
                })
                .filter(Boolean)
                .join(' → ');

            parts.push(`## Histórico de Passos\n[Anteriores]: ${compact}\n\n[Últimos ${RECENT_STEPS} passos]:\n${formatSteps(recent)}`);
        }
    } else {
        parts.push('## Histórico\nPrimeira iteração - nenhum passo executado ainda.');
    }

    // Instrução final (reforço dinâmico para análise de caso)
    const isAnalysis = detectAnalysisIntent(state.objetivo);
    const analysisBoost = isAnalysis
        ? `\n\nIMPORTANTE: Este é um caso para análise profunda. Aplique as regras de "Análise de caso/processo" da Profundidade Adaptativa. Use <pensamento> para raciocinar por eixos antes de responder.`
        : '';

    parts.push(`## Sua Tarefa

Analise o objetivo e o contexto. Decida o próximo passo usando o formato de tags XML definido no system prompt.${analysisBoost}`);

    let prompt = parts.join('\n\n');

    // PII Vault: mascara objetivo e histórico
    const vault = state.piiVault;
    if (vault) {
        prompt = mask(vault, prompt, state.contexto.processo);
    }

    return prompt;
}

/**
 * Formata passos do agente para o prompt (P0 Fix 3)
 */
function formatSteps(steps: AgentStep[]): string {
    return steps.map(passo => {
        switch (passo.tipo) {
            case 'think':
                return `[THINK] ${passo.pensamento?.substring(0, 300)}`;
            case 'critic':
                return `[CRITIC] ${passo.critic?.approved ? 'Aprovado' : 'Bloqueado'} (${passo.critic?.riskLevel || 'medium'}) - ${passo.critic?.reason || 'Sem justificativa'}`;
            case 'act':
                return `[ACT] ${passo.skill}(${JSON.stringify(passo.parametros || {})})`;
            case 'observe':
                const res = passo.resultado;
                if (res?.sucesso) {
                    const info = res.mensagem
                        ? res.mensagem.substring(0, 2000)
                        : (typeof res.dados === 'object'
                            ? JSON.stringify(res.dados).substring(0, 500)
                            : String(res.dados || ''));
                    return `[OBSERVE] Sucesso: ${info}`;
                } else {
                    return `[OBSERVE] Erro: ${res?.erro}`;
                }
            default:
                return '';
        }
    }).filter(Boolean).join('\n');
}

/**
 * Chama LLM (integração com o handler existente)
 */
async function callLLM(
    systemPrompt: string,
    userPrompt: string,
    config: AgentConfig,
    onToken?: (token: string) => void
): Promise<string> {
    const { callAI } = await import('../ai-handler');

    try {
        const response = await callAI({
            system: systemPrompt,
            user: userPrompt,
            temperature: config.temperature ?? 0.3,
            ...(config.model ? { model: config.model } : {}),
            // Filtra tokens: só emite o conteúdo dentro de <resposta>...</resposta>
            ...(onToken ? { onToken: createRespostaExtractor(onToken) } : {})
        });

        return response;
    } catch (error: any) {
        console.error('[Think] Erro ao chamar LLM:', error);
        throw new Error(`Falha ao processar raciocínio: ${error.message}`);
    }
}

/**
 * State machine que filtra o stream de tags XML e emite apenas o conteúdo
 * dentro de <resposta>...</resposta>.
 *
 * Estados:
 *   SCANNING     → procura pela tag <resposta> no buffer acumulado
 *   IN_VALUE     → emite texto raw (markdown) até encontrar </resposta>
 *   DONE         → ignora o resto
 *
 * Sem necessidade de unescape — o conteúdo é markdown puro, não JSON.
 */
function createRespostaExtractor(onToken: (token: string) => void): (token: string) => void {
    type State = 'SCANNING' | 'IN_VALUE' | 'DONE';
    let state: State = 'SCANNING';
    let buffer = '';

    const OPEN_TAG = '<resposta>';
    const CLOSE_TAG = '</resposta>';

    return function extractor(token: string): void {
        if (state === 'DONE') return;

        if (state === 'SCANNING') {
            buffer += token;
            const idx = buffer.indexOf(OPEN_TAG);
            if (idx !== -1) {
                state = 'IN_VALUE';
                // Emite o que já veio após a tag de abertura
                const after = buffer.slice(idx + OPEN_TAG.length);
                buffer = '';
                if (after.length > 0) processInValue(after);
            } else {
                // Mantém apenas os últimos chars suficientes para detectar tag cross-token
                if (buffer.length > OPEN_TAG.length + 10) {
                    buffer = buffer.slice(-(OPEN_TAG.length + 10));
                }
            }
            return;
        }

        if (state === 'IN_VALUE') {
            processInValue(token);
        }
    };

    function processInValue(text: string): void {
        buffer += text;

        // Verifica se a closing tag aparece no buffer
        const closeIdx = buffer.indexOf(CLOSE_TAG);
        if (closeIdx !== -1) {
            // Emite tudo antes da closing tag
            const content = buffer.slice(0, closeIdx);
            if (content.length > 0) onToken(content);
            state = 'DONE';
            buffer = '';
            return;
        }

        // A closing tag pode estar parcialmente no final do buffer
        // Mantém os últimos chars que podem ser prefixo de </resposta>
        const safeLen = buffer.length - (CLOSE_TAG.length - 1);
        if (safeLen > 0) {
            onToken(buffer.slice(0, safeLen));
            buffer = buffer.slice(safeLen);
        }
    }
}

/**
 * Extrai conteúdo de uma tag XML. Retorna undefined se não encontrada.
 * Suporta whitespace ao redor e conteúdo multiline.
 */
function extractTag(text: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
    const match = text.match(regex);
    return match ? match[1]!.trim() : undefined;
}

/**
 * Parse da resposta do LLM (formato tags XML)
 *
 * Aceita tanto formato de tags (novo) quanto JSON (fallback para compatibilidade).
 */
function parseThinkResponse(response: string): ThinkDecision {
    try {
        // ── Tenta parse por tags (formato primário) ──
        const tipo = extractTag(response, 'tipo') as ThinkDecision['tipo'] | undefined;

        if (tipo) {
            const pensamento = extractTag(response, 'pensamento') || 'Processando...';

            switch (tipo) {
                case 'resposta': {
                    const resposta = extractTag(response, 'resposta');
                    if (!resposta) throw new Error('Tag <resposta> ausente para tipo=resposta');
                    return { tipo, pensamento, resposta };
                }
                case 'skill': {
                    const skill = extractTag(response, 'skill');
                    if (!skill) throw new Error('Tag <skill> ausente para tipo=skill');
                    const paramsRaw = extractTag(response, 'parametros');
                    let parametros: Record<string, any> = {};
                    if (paramsRaw) {
                        try {
                            parametros = JSON.parse(paramsRaw);
                        } catch {
                            // Tenta extrair JSON de dentro de backticks
                            const jsonInner = paramsRaw.match(/\{[\s\S]*\}/);
                            if (jsonInner) parametros = JSON.parse(jsonInner[0]);
                        }
                    }
                    return { tipo, pensamento, skill: skill.trim(), parametros };
                }
                case 'pergunta': {
                    const pergunta = extractTag(response, 'pergunta');
                    if (!pergunta) throw new Error('Tag <pergunta> ausente para tipo=pergunta');
                    const opcoesRaw = extractTag(response, 'opcoes');
                    let opcoes: string[] | undefined;
                    if (opcoesRaw) {
                        try { opcoes = JSON.parse(opcoesRaw); } catch { /* ignora */ }
                    }
                    return { tipo, pensamento, pergunta, ...(opcoes ? { opcoes } : {}) };
                }
                default:
                    throw new Error(`Tipo inválido: ${tipo}`);
            }
        }

        // ── Fallback: tenta JSON (compatibilidade com modelos que ignoram instruções) ──
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
            || response.match(/```\s*([\s\S]*?)\s*```/)
            || response.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            const decisao: ThinkDecision = JSON.parse(jsonStr);

            if (!decisao.tipo) throw new Error('Campo "tipo" ausente no JSON');
            if (!decisao.pensamento) decisao.pensamento = 'Processando...';

            switch (decisao.tipo) {
                case 'skill':
                    if (!decisao.skill) throw new Error('Campo "skill" ausente');
                    break;
                case 'resposta':
                    if (!decisao.resposta) throw new Error('Campo "resposta" ausente');
                    break;
                case 'pergunta':
                    if (!decisao.pergunta) throw new Error('Campo "pergunta" ausente');
                    break;
                default:
                    throw new Error(`Tipo inválido: ${(decisao as any).tipo}`);
            }
            return decisao;
        }

        throw new Error('Resposta não contém tags XML nem JSON válido');

    } catch (error: any) {
        console.error('[Think] Erro ao parsear resposta:', error);
        console.error('[Think] Resposta raw:', response.substring(0, 500));

        // Fallback: tenta responder algo útil
        return {
            tipo: 'pergunta',
            pensamento: 'Erro ao processar raciocínio, solicitando clarificação',
            pergunta: 'Desculpe, não entendi completamente. Pode reformular sua solicitação?'
        };
    }
}
