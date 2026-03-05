/**
 * Lex Agent Think
 *
 * MÃ³dulo de raciocÃ­nio - usa LLM para decidir prÃ³ximo passo.
 * Inspirado no OpenClaw, integrado com Prompt-Layer.
 */

import { AgentState, ThinkDecision, AgentConfig } from './types';
import { getSkillsForPrompt } from './executor';
import { buildPromptLayerSystem } from './prompt-layer';

/**
 * Decide prÃ³ximo passo baseado no estado atual
 */
export async function think(
    state: AgentState,
    config: AgentConfig
): Promise<ThinkDecision> {
    // Monta system prompt (Prompt-Layer + Skills + Contexto)
    const systemPrompt = buildSystemPrompt(state);

    // Monta user prompt (objetivo + histÃ³rico)
    const userPrompt = buildUserPrompt(state);

    // Chama LLM
    const response = await callLLM(systemPrompt, userPrompt, config);

    // Parse resposta
    return parseThinkResponse(response);
}

/**
 * Monta o system prompt completo
 */
function buildSystemPrompt(state: AgentState): string {
    const parts: string[] = [];

    // 1. Prompt-Layer (personalidade do tenant)
    if (state.contexto.tenantConfig) {
        parts.push(buildPromptLayerSystem(state.contexto.tenantConfig));
    } else {
        parts.push(getDefaultPersonality());
    }

    // 2. Comportamento do agente
    parts.push(getAgentBehavior());

    // 3. Skills disponÃ­veis
    parts.push(getSkillsForPrompt());

    // 4. Contexto atual
    parts.push(buildContextSection(state));

    // 5. Formato de resposta
    parts.push(getResponseFormat());

    return parts.join('\n\n---\n\n');
}

/**
 * Personalidade padrÃ£o (quando nÃ£o tem tenant config)
 */
function getDefaultPersonality(): string {
    return `# Lex - Assistente JurÃ­dica

VocÃª Ã© **Lex**, uma assistente jurÃ­dica inteligente especializada no sistema judicial brasileiro, especialmente no PJe (Processo Judicial EletrÃ´nico).

## Sua Identidade
- Profissional, precisa e proativa
- Especialista em direito brasileiro
- Foco em produtividade do advogado

## PrincÃ­pios
- NUNCA invente informaÃ§Ãµes - se nÃ£o sabe, diga
- Seja concisa - advogados sÃ£o ocupados
- Antecipe problemas e prazos
- O advogado tem a decisÃ£o final`;
}

/**
 * Comportamento do agente no loop
 */
function getAgentBehavior(): string {
    return `# Comportamento do Agente

VocÃª opera em um loop de **Think â†’ Critic â†’ Act â†’ Observe** atÃ© completar o objetivo.

## A cada iteraÃ§Ã£o, vocÃª deve:

1. **ANALISAR** o objetivo e o histÃ³rico
2. **DECIDIR** uma das trÃªs opÃ§Ãµes:
   - **skill**: executar uma ferramenta
   - **resposta**: objetivo alcanÃ§ado, fornecer resposta final
   - **pergunta**: precisa de mais informaÃ§Ã£o do usuÃ¡rio
3. **ASSUMIR** que a decisÃ£o passarÃ¡ por um Critic antes da execuÃ§Ã£o da skill

## Regras

### Quando usar Skills
- Para obter informaÃ§Ãµes que vocÃª nÃ£o tem
- Para executar aÃ§Ãµes no PJe ou gerar documentos
- Combine mÃºltiplas skills quando necessÃ¡rio
- Se o usuario der comando operacional no PJe (ex: "vai", "abra", "entre", "clique", "navegue"), prefira tipo=skill.
- Para navegar, clicar ou preencher campos no PJe, use pje_agir com o objetivo em linguagem natural.
- Se o usuario pedir "ir para", "abrir aba", "menu", "peticionamento", "novo processo", "preencher campo" ou comandos equivalentes, use pje_agir.
- NUNCA responda apenas com instrucoes textuais quando ha uma skill que executa a acao.

### Quando Responder
- Quando tiver informaÃ§Ã£o suficiente para atender o objetivo
- Quando todas as aÃ§Ãµes necessÃ¡rias foram completadas
- Quando o objetivo for uma pergunta simples que vocÃª sabe responder

### Quando Perguntar
- Quando o objetivo for ambÃ­guo
- Quando precisar de confirmaÃ§Ã£o antes de aÃ§Ã£o importante
- Quando houver mÃºltiplas opÃ§Ãµes vÃ¡lidas

## EstratÃ©gias Comuns

### Apenas abrir/login no PJe
1. Use \`pje_abrir\`
2. Oriente o usuÃ¡rio a autenticar com certificado digital
3. Aguarde o prÃ³ximo comando do usuÃ¡rio

### Consultar Processo
1. Use \`pje_consultar\` com o numero do processo
2. Analise os dados retornados
3. Para movimentacoes ou documentos, use \`pje_movimentacoes\` ou \`pje_documentos\`

### Navegar/Clicar/Preencher dentro do PJe
1. Use \`pje_agir\` com o objetivo em linguagem natural
2. pje_agir executa um loop visual inteligente — se adapta a qualquer tela e tribunal
3. Exemplos de objetivo: "ir para peticionamento novo processo", "preencher Jurisdicao com Belem", "clicar em Pesquisar"
4. Inclua sempre o parametro tribunal se o usuario mencionou

### Ver movimentacoes ou documentos
1. Use \`pje_movimentacoes\` ou \`pje_documentos\` apos o processo estar aberto na tela

### Criar Documento
1. Certifique-se de ter os dados do processo
2. Identifique o tipo de documento
3. Use \`doc_gerar\` com contexto completo

### Pesquisar JurisprudÃªncia
1. Identifique os termos relevantes
2. Use \`pesquisa_jurisprudencia\`
3. Sintetize os resultados`;
}

/**
 * Monta seÃ§Ã£o de contexto
 */
function buildContextSection(state: AgentState): string {
    const parts: string[] = ['# Contexto Atual'];

    // Processo
    if (state.contexto.processo) {
        const p = state.contexto.processo;
        parts.push(`## Processo Carregado
- NÃºmero: ${p.numero}
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

    // Resultados anteriores
    if (state.contexto.resultados.size > 0) {
        const resultados: string[] = [];
        state.contexto.resultados.forEach((valor, skill) => {
            const resumo = typeof valor === 'object'
                ? JSON.stringify(valor).substring(0, 200)
                : String(valor);
            resultados.push(`- ${skill}: ${resumo}`);
        });
        parts.push(`## Resultados de Skills Anteriores\n${resultados.join('\n')}`);
    }

    // MemÃ³ria persistente
    if (state.contexto.memoria) {
        const mem = state.contexto.memoria;
        const memParts: string[] = ['## MemÃ³ria Persistente'];

        if (mem.processosRecentes && mem.processosRecentes.length > 0) {
            memParts.push(`Processos recentes: ${mem.processosRecentes.slice(0, 5).join(', ')}`);
        }

        if (mem.aprendizados && mem.aprendizados.length > 0) {
            memParts.push(`Aprendizados: ${mem.aprendizados.slice(-3).join('; ')}`);
        }

        if (memParts.length > 1) {
            parts.push(memParts.join('\n'));
        }
    }

    const chatHistory = (state.contexto as any).chatHistory as string | undefined;
    if (chatHistory) {
        parts.push(`## Historico Recente da Conversa\n${chatHistory}`);
    }

    return parts.join('\n\n');
}

/**
 * Formato de resposta esperado
 */
function getResponseFormat(): string {
    return `# Formato de Resposta

Responda APENAS com JSON vÃ¡lido no seguinte formato:

\`\`\`json
{
    "pensamento": "Seu raciocÃ­nio passo a passo aqui",
    "tipo": "skill" | "resposta" | "pergunta",
    "skill": "nome_da_skill (apenas se tipo=skill)",
    "parametros": { ... (apenas se tipo=skill) },
    "resposta": "Resposta final ao usuÃ¡rio (apenas se tipo=resposta)",
    "pergunta": "Pergunta ao usuÃ¡rio (apenas se tipo=pergunta)",
    "opcoes": ["opÃ§Ã£o 1", "opÃ§Ã£o 2"] (opcional, se tipo=pergunta)
}
\`\`\`

IMPORTANTE:
- Responda SOMENTE o JSON, sem texto adicional
- Use apenas skills que existem na lista
- Se nÃ£o tem certeza, pergunte ao usuÃ¡rio
- Se jÃ¡ tem informaÃ§Ã£o suficiente, responda`;
}

/**
 * Monta user prompt com objetivo e histÃ³rico
 */
function buildUserPrompt(state: AgentState): string {
    const parts: string[] = [];

    // Objetivo
    parts.push(`## Objetivo do UsuÃ¡rio
"${state.objetivo}"`);

    // IteraÃ§Ã£o
    parts.push(`## IteraÃ§Ã£o Atual: ${state.iteracao}`);

    // HistÃ³rico
    if (state.passos.length > 0) {
        const historico = state.passos.map(passo => {
            switch (passo.tipo) {
                case 'think':
                    return `[THINK] ${passo.pensamento?.substring(0, 100)}...`;
                case 'critic':
                    return `[CRITIC] ${passo.critic?.approved ? 'Aprovado' : 'Bloqueado'} (${passo.critic?.riskLevel || 'medium'}) - ${passo.critic?.reason || 'Sem justificativa'}`;
                case 'act':
                    return `[ACT] ${passo.skill}(${JSON.stringify(passo.parametros || {})})`;
                case 'observe':
                    const res = passo.resultado;
                    if (res?.sucesso) {
                        const dados = typeof res.dados === 'object'
                            ? JSON.stringify(res.dados).substring(0, 300)
                            : res.dados;
                        return `[OBSERVE] Sucesso: ${dados}`;
                    } else {
                        return `[OBSERVE] Erro: ${res?.erro}`;
                    }
                default:
                    return '';
            }
        }).filter(Boolean).join('\n');

        parts.push(`## HistÃ³rico de Passos\n${historico}`);
    } else {
        parts.push('## HistÃ³rico\nPrimeira iteraÃ§Ã£o - nenhum passo executado ainda.');
    }

    // InstruÃ§Ã£o final
    parts.push(`## Sua Tarefa

Analise o objetivo e o contexto. Decida o prÃ³ximo passo e responda em JSON.`);

    return parts.join('\n\n');
}

/**
 * Chama LLM (integraÃ§Ã£o com o handler existente)
 */
async function callLLM(
    systemPrompt: string,
    userPrompt: string,
    config: AgentConfig
): Promise<string> {
    // Importa dinamicamente para evitar dependÃªncia circular
    const { callAI } = await import('../ai-handler');

    try {
        const response = await callAI({
            system: systemPrompt,
            user: userPrompt,
            temperature: config.temperature ?? 0.3, // Mais determinÃ­stico
            ...(config.model ? { model: config.model } : {})
        });

        return response;
    } catch (error: any) {
        console.error('[Think] Erro ao chamar LLM:', error);
        throw new Error(`Falha ao processar raciocÃ­nio: ${error.message}`);
    }
}

/**
 * Parse da resposta do LLM
 */
function parseThinkResponse(response: string): ThinkDecision {
    try {
        // Tenta extrair JSON da resposta
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
            || response.match(/```\s*([\s\S]*?)\s*```/)
            || response.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            throw new Error('Resposta nÃ£o contÃ©m JSON vÃ¡lido');
        }

        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const decisao: ThinkDecision = JSON.parse(jsonStr);

        // ValidaÃ§Ã£o bÃ¡sica
        if (!decisao.tipo) {
            throw new Error('Campo "tipo" ausente');
        }

        if (!decisao.pensamento) {
            decisao.pensamento = 'Processando...';
        }

        // ValidaÃ§Ã£o por tipo
        switch (decisao.tipo) {
            case 'skill':
                if (!decisao.skill) {
                    throw new Error('Campo "skill" ausente para tipo=skill');
                }
                break;
            case 'resposta':
                if (!decisao.resposta) {
                    throw new Error('Campo "resposta" ausente para tipo=resposta');
                }
                break;
            case 'pergunta':
                if (!decisao.pergunta) {
                    throw new Error('Campo "pergunta" ausente para tipo=pergunta');
                }
                break;
            default:
                throw new Error(`Tipo invÃ¡lido: ${decisao.tipo}`);
        }

        return decisao;

    } catch (error: any) {
        console.error('[Think] Erro ao parsear resposta:', error);
        console.error('[Think] Resposta raw:', response.substring(0, 500));

        // Fallback: tenta responder algo Ãºtil
        return {
            tipo: 'pergunta',
            pensamento: 'Erro ao processar raciocÃ­nio, solicitando clarificaÃ§Ã£o',
            pergunta: 'Desculpe, nÃ£o entendi completamente. Pode reformular sua solicitaÃ§Ã£o?'
        };
    }
}

