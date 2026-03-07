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
 * Decide próximo passo baseado no estado atual.
 * onToken: callback chamado para cada token do campo "resposta" no JSON gerado.
 */
export async function think(
    state: AgentState,
    config: AgentConfig,
    onToken?: (token: string) => void
): Promise<ThinkDecision> {
    const systemPrompt = buildSystemPrompt(state);
    const userPrompt = buildUserPrompt(state);
    const response = await callLLM(systemPrompt, userPrompt, config, onToken);
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

    // 3. Skills disponíveis (compacto a partir da 2ª iteração para economizar tokens)
    parts.push(getSkillsForPrompt(state.iteracao));

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
- Para navegar, clicar ou preencher campos no PJe, use pje_agir com o objetivo em linguagem natural.
- Se o usuario pedir "ir para", "abrir aba", "menu", "peticionamento", "novo processo", "preencher campo" ou comandos equivalentes, use pje_agir.
- NUNCA responda apenas com instrucoes textuais quando ha uma skill que executa a acao.
- EXCECAO CRITICA - TERMOS AMBIGUOS: As palavras "pastas", "arquivos", "documentos" podem referir-se ao PC Windows OU ao PJe. Se o usuario nao mencionar explicitamente PJe, tribunal, processo ou numero de processo, use tipo=pergunta ANTES de qualquer skill. Exemplo: "pode acessar minhas pastas?" -> tipo=pergunta perguntando se e PC ou PJe.

### Quando Responder
- Quando tiver informação suficiente para atender o objetivo
- Quando todas as ações necessárias foram completadas
- Quando o objetivo for uma pergunta simples que você sabe responder

### Quando Perguntar
- Quando o objetivo for ambíguo
- Quando precisar de confirmação antes de ação importante
- Quando houver múltiplas opções válidas

## Estratégias Comuns

### Apenas abrir/login no PJe
1. Use \`pje_abrir\`
2. Oriente o usuário a autenticar com certificado digital
3. Aguarde o próximo comando do usuário

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

### Pesquisar Jurisprudência
1. Identifique os termos relevantes
2. Use \`pesquisa_jurisprudencia\`
3. Sintetize os resultados

### Ler arquivo do computador (txt, PDF, DOCX, XLSX)
1. Use \`os_arquivos\` com operacao="ler" e o caminho do arquivo
2. PDFs, Word e planilhas Excel sao convertidos para texto automaticamente

### Buscar texto dentro de arquivos (grep)
1. Use \`os_arquivos\` com operacao="grep", caminho da pasta, padrao=texto a buscar
2. Filtre por extensoes se necessario: ".pdf,.docx"

### Copiar texto para o usuario colar
1. Gere o texto necessario
2. Use \`os_clipboard\` com operacao="escrever" para colocar no clipboard
3. Informe o usuario que pode colar com Ctrl+V

### Buscar pagina web / portal publico
1. Use \`os_fetch\` com a URL completa
2. Para portais que exigem login, use \`pje_agir\` no lugar

### Ver processos ou fechar programa
1. \`os_sistema\` operacao="processos" para listar o que esta aberto
2. \`os_sistema\` operacao="encerrar" com nome/PID (pede confirmacao automaticamente)

---

## Proatividade

Quando decidir tipo=resposta, SEMPRE finalize com 1-2 sugestões de próximos passos relevantes ao contexto. Exemplos:
- Após consultar processo: "Quer que eu verifique as movimentações recentes ou os documentos?"
- Após abrir PJe: "Deseja consultar um processo ou navegar para o peticionamento?"
- Após ler arquivo: "Quer buscar outros arquivos relacionados ou copiar algum trecho?"
- Após criar documento: "Posso protocolar este documento no PJe se quiser."
Use frases curtas no final da resposta, separadas por linha em branco.

## Alerta de Prazo

Quando observar resultado de pje_consultar com campo 'ultima_movimentacao':
- Calcule quantos dias se passaram com base na Data/Hora atual do contexto
- Se mais de 30 dias sem movimentação, inclua na resposta: "⚠️ Última movimentação há X dias — verifique se há prazos em aberto."
- Se 'data_distribuicao' for recente (menos de 15 dias) e não houver movimentações, alerte: "⚠️ Processo distribuído recentemente — fique atento ao prazo de resposta."

---

## Desambiguacao: PC vs PJe

Alguns termos sao ambiguos entre o sistema de arquivos do computador e o PJe.
Quando nao houver contexto claro, use tipo=pergunta ANTES de agir.

### Termos ambiguos
- "pastas" -> pode ser pastas do PC (os_listar) ou pastas/expedientes no PJe (pje_agir)
- "arquivos" -> pode ser arquivos do Windows (os_arquivos) ou arquivos de processo no PJe
- "documentos" -> pode ser pasta Documentos do Windows ou documentos do processo judicial
- "abrir" -> abrir arquivo no PC (os_arquivos) ou abrir no PJe (pje_agir)
- "acessar" + "pastas/arquivos" sem contexto -> ambiguo, perguntar antes de agir

### Regras

**Contexto PJe claro** (usuario menciona numero de processo, tribunal, peticao, despacho, publicacao, audiencia, expediente):
-> use skill pje_* diretamente

**Contexto PC claro** (usuario menciona caminho tipo C:, Downloads, Desktop, extensao .pdf .docx .xlsx, "meu computador"):
-> use skill os_* diretamente

**Sem contexto claro** -> OBRIGATORIO usar tipo=pergunta antes de executar qualquer skill.
Exemplo de resposta correta:
{ "tipo": "pergunta", "pergunta": "Voce quer acessar pastas do seu computador (Downloads, Desktop...) ou pastas de expedientes no PJe?", "opcoes": ["Pastas do meu computador", "Expedientes no PJe"] }`;
}

/**
 * Tenta obter a URL ativa no Chrome (Stagehand). Retorna null se não disponível.
 */
function getActiveBrowserUrl(): string | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getStagehand } = require('../stagehand-manager');
        const sh = getStagehand();
        const page = sh?.context?.pages()?.[0];
        const url = page?.url();
        // Ignora about:blank
        return url && url !== 'about:blank' ? url : null;
    } catch {
        return null;
    }
}

/**
 * Monta seção de contexto
 */
function buildContextSection(state: AgentState): string {
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

    // Estado do navegador
    const browserUrl = getActiveBrowserUrl();
    if (browserUrl) {
        parts.push(`## Navegador (Chrome)\nAtivo — URL atual: ${browserUrl}`);
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

    // Resultados anteriores (aumentado de 500 para 1000 chars)
    if (state.contexto.resultados.size > 0) {
        const resultados: string[] = [];
        state.contexto.resultados.forEach((valor, skill) => {
            const resumo = typeof valor === 'object'
                ? JSON.stringify(valor).substring(0, 1000)
                : String(valor);
            resultados.push(`- ${skill}: ${resumo}`);
        });
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

    const chatHistory = (state.contexto as any).chatHistory as string | undefined;
    if (chatHistory) {
        parts.push(`## Histórico Recente da Conversa\n${chatHistory}`);
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
                    // Aumentado de 100 para 300 chars para preservar mais contexto do raciocínio
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
            // Filtra tokens: só emite o conteúdo do campo "resposta" do JSON
            ...(onToken ? { onToken: createRespostaExtractor(onToken) } : {})
        });

        return response;
    } catch (error: any) {
        console.error('[Think] Erro ao chamar LLM:', error);
        throw new Error(`Falha ao processar raciocínio: ${error.message}`);
    }
}

/**
 * State machine que filtra o stream JSON e emite apenas os tokens
 * dentro do campo "resposta": "...".
 *
 * Estados:
 *   SCANNING     → procura pela chave "resposta" no buffer acumulado
 *   IN_VALUE     → emite cada char (desescapando JSON) até fechar as aspas
 *   DONE         → ignora o resto
 */
function createRespostaExtractor(onToken: (token: string) => void): (token: string) => void {
    type State = 'SCANNING' | 'IN_VALUE' | 'DONE';
    let state: State = 'SCANNING';
    let buffer = '';      // buffer para detecção da chave
    let prevChar = '';    // para detectar escape (\")

    return function extractor(token: string): void {
        if (state === 'DONE') return;

        if (state === 'SCANNING') {
            buffer += token;
            // Procura por: "resposta"\s*:\s*" (com aspas de abertura do valor)
            const match = buffer.match(/"resposta"\s*:\s*"([\s\S]*)$/);
            if (match) {
                state = 'IN_VALUE';
                // Emite o que já veio após a aspas de abertura
                const partial = match[1] ?? '';
                buffer = '';
                emitChars(partial);
            } else {
                // Mantém apenas os últimos 40 chars para detecção cross-token
                if (buffer.length > 40) buffer = buffer.slice(-40);
            }
            return;
        }

        if (state === 'IN_VALUE') {
            emitChars(token);
        }
    };

    function emitChars(text: string): void {
        let i = 0;
        while (i < text.length) {
            const ch = text[i]!;

            if (prevChar === '\\') {
                // Caractere escapado
                switch (ch) {
                    case 'n':  onToken('\n'); break;
                    case 't':  onToken('\t'); break;
                    case '"':  onToken('"'); break;
                    case '\\': onToken('\\'); break;
                    case 'r':  break; // ignora \r
                    default:   onToken(ch);
                }
                prevChar = ch === '\\' ? '' : ch;
                i++;
                continue;
            }

            if (ch === '\\') {
                prevChar = '\\';
                i++;
                continue;
            }

            // Aspas não-escapadas fecham o valor
            if (ch === '"') {
                state = 'DONE';
                return;
            }

            onToken(ch);
            prevChar = ch;
            i++;
        }
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
                throw new Error(`Tipo inválido: ${(decisao as any).tipo}`);
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
