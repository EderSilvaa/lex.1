/**
 * Lex Agent Think
 *
 * Módulo de raciocínio - usa LLM para decidir próximo passo.
 * Inspirado no OpenClaw, integrado com Prompt-Layer.
 */

import { AgentState, ThinkDecision, AgentConfig } from './types';
import { getSkillsForPrompt } from './executor';
import { buildPromptLayerSystem } from './prompt-layer';

/**
 * Decide próximo passo baseado no estado atual
 */
export async function think(
    state: AgentState,
    config: AgentConfig
): Promise<ThinkDecision> {
    // Monta system prompt (Prompt-Layer + Skills + Contexto)
    const systemPrompt = buildSystemPrompt(state);

    // Monta user prompt (objetivo + histórico)
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

    // 3. Skills disponíveis
    parts.push(getSkillsForPrompt());

    // 4. Contexto atual
    parts.push(buildContextSection(state));

    // 5. Formato de resposta
    parts.push(getResponseFormat());

    return parts.join('\n\n---\n\n');
}

/**
 * Personalidade padrão (quando não tem tenant config)
 */
function getDefaultPersonality(): string {
    return `# Lex - Assistente Jurídica

Você é **Lex**, uma assistente jurídica inteligente especializada no sistema judicial brasileiro, especialmente no PJe (Processo Judicial Eletrônico).

## Sua Identidade
- Profissional, precisa e proativa
- Especialista em direito brasileiro
- Foco em produtividade do advogado

## Princípios
- NUNCA invente informações - se não sabe, diga
- Seja concisa - advogados são ocupados
- Antecipe problemas e prazos
- O advogado tem a decisão final`;
}

/**
 * Comportamento do agente no loop
 */
function getAgentBehavior(): string {
    return `# Comportamento do Agente

Você opera em um loop de **Think → Act → Observe** até completar o objetivo.

## A cada iteração, você deve:

1. **ANALISAR** o objetivo e o histórico
2. **DECIDIR** uma das três opções:
   - **skill**: executar uma ferramenta
   - **resposta**: objetivo alcançado, fornecer resposta final
   - **pergunta**: precisa de mais informação do usuário

## Regras

### Quando usar Skills
- Para obter informações que você não tem
- Para executar ações no PJe ou gerar documentos
- Combine múltiplas skills quando necessário

### Quando Responder
- Quando tiver informação suficiente para atender o objetivo
- Quando todas as ações necessárias foram completadas
- Quando o objetivo for uma pergunta simples que você sabe responder

### Quando Perguntar
- Quando o objetivo for ambíguo
- Quando precisar de confirmação antes de ação importante
- Quando houver múltiplas opções válidas

## Estratégias Comuns

### Consultar Processo
1. Use \`pje_consultar\` primeiro
2. Analise os dados retornados
3. Se precisar de mais detalhes, use skills específicas

### Criar Documento
1. Certifique-se de ter os dados do processo
2. Identifique o tipo de documento
3. Use \`doc_gerar\` com contexto completo

### Pesquisar Jurisprudência
1. Identifique os termos relevantes
2. Use \`pesquisa_jurisprudencia\`
3. Sintetize os resultados`;
}

/**
 * Monta seção de contexto
 */
function buildContextSection(state: AgentState): string {
    const parts: string[] = ['# Contexto Atual'];

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

    // Memória persistente
    if (state.contexto.memoria) {
        const mem = state.contexto.memoria;
        const memParts: string[] = ['## Memória Persistente'];

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

    return parts.join('\n\n');
}

/**
 * Formato de resposta esperado
 */
function getResponseFormat(): string {
    return `# Formato de Resposta

Responda APENAS com JSON válido no seguinte formato:

\`\`\`json
{
    "pensamento": "Seu raciocínio passo a passo aqui",
    "tipo": "skill" | "resposta" | "pergunta",
    "skill": "nome_da_skill (apenas se tipo=skill)",
    "parametros": { ... (apenas se tipo=skill) },
    "resposta": "Resposta final ao usuário (apenas se tipo=resposta)",
    "pergunta": "Pergunta ao usuário (apenas se tipo=pergunta)",
    "opcoes": ["opção 1", "opção 2"] (opcional, se tipo=pergunta)
}
\`\`\`

IMPORTANTE:
- Responda SOMENTE o JSON, sem texto adicional
- Use apenas skills que existem na lista
- Se não tem certeza, pergunte ao usuário
- Se já tem informação suficiente, responda`;
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

    // Histórico
    if (state.passos.length > 0) {
        const historico = state.passos.map(passo => {
            switch (passo.tipo) {
                case 'think':
                    return `[THINK] ${passo.pensamento?.substring(0, 100)}...`;
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

        parts.push(`## Histórico de Passos\n${historico}`);
    } else {
        parts.push('## Histórico\nPrimeira iteração - nenhum passo executado ainda.');
    }

    // Instrução final
    parts.push(`## Sua Tarefa

Analise o objetivo e o contexto. Decida o próximo passo e responda em JSON.`);

    return parts.join('\n\n');
}

/**
 * Chama LLM (integração com o handler existente)
 */
async function callLLM(
    systemPrompt: string,
    userPrompt: string,
    config: AgentConfig
): Promise<string> {
    // Importa dinamicamente para evitar dependência circular
    const { callAI } = await import('../ai-handler');

    try {
        const response = await callAI({
            system: systemPrompt,
            user: userPrompt,
            temperature: config.temperature ?? 0.3, // Mais determinístico
            ...(config.model ? { model: config.model } : {})
        });

        return response;
    } catch (error: any) {
        console.error('[Think] Erro ao chamar LLM:', error);
        throw new Error(`Falha ao processar raciocínio: ${error.message}`);
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
            throw new Error('Resposta não contém JSON válido');
        }

        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const decisao: ThinkDecision = JSON.parse(jsonStr);

        // Validação básica
        if (!decisao.tipo) {
            throw new Error('Campo "tipo" ausente');
        }

        if (!decisao.pensamento) {
            decisao.pensamento = 'Processando...';
        }

        // Validação por tipo
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
                throw new Error(`Tipo inválido: ${decisao.tipo}`);
        }

        return decisao;

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
