/**
 * Estrategista — Agent Pai
 *
 * Analisa o input do usuário (planilha, PDF, lista) e gera um StrategyPacket
 * com a tese, persona, fundamentos, variáveis e regras de estilo.
 *
 * Enriquece a análise com:
 * 1. RAG interno (documentos do usuário indexados)
 * 2. Contexto dos dados fornecidos (partes, valores, tribunal)
 *
 * Roda 1 vez por lote.
 */

import type { StrategyPacket, ProcessoInput } from './types';
import { DEFAULT_WAVE_SIZE, MIN_WAVE_SIZE, MAX_WAVE_SIZE } from './types';

/**
 * Analisa o input e propõe uma estratégia jurídica para o lote.
 *
 * @param rawInput - Dados brutos (CSV, semicolon, texto livre, ou texto de PDF)
 * @param userInstructions - Instruções adicionais do usuário (tese, tom, restrições)
 * @returns StrategyPacket pronto pra aprovação HITL
 */
export interface EstrategistaInput {
    tipoPeticao?: string;
    tese?: string;
    tribunal?: string;
    tom?: string;
    userInstructions?: string;
}

export async function analyzeAndPropose(
    rawInput: string,
    structured?: EstrategistaInput,
): Promise<StrategyPacket> {
    const { callAI } = await import('../ai-handler');

    // 1. Enriquecer com RAG — buscar documentos relevantes do usuário
    let ragContext = '';
    try {
        const { getDocIndex } = await import('../agent/doc-index');
        const docIndex = getDocIndex();

        // Buscar por termos-chave do input + dados estruturados
        const query = extractKeyTerms(rawInput, structured);
        const results = docIndex.buscarContexto(query, 5);

        if (results.length > 0) {
            ragContext = results.map(r => `[${r.arquivo}] ${r.trecho}`).join('\n\n');
            console.log(`[Estrategista] RAG: ${results.length} chunks relevantes encontrados`);
        }
    } catch {
        // RAG não disponível — prosseguir sem
        console.log('[Estrategista] RAG não disponível — prosseguindo sem contexto documental');
    }

    const systemPrompt = buildSystemPrompt(structured);
    const userPrompt = buildUserPrompt(rawInput, structured, ragContext);

    console.log('[Estrategista] Analisando input para estratégia...');

    const response = await callAI({
        system: systemPrompt,
        user: userPrompt,
        temperature: 0.2,
        maxTokens: 4000,
    });

    return parseStrategy(response, rawInput);
}

/**
 * Extrai termos-chave do input para consulta RAG.
 */
function extractKeyTerms(rawInput: string, structured?: EstrategistaInput): string {
    const parts: string[] = [];

    // Tipo de petição estruturado
    if (structured?.tipoPeticao) {
        parts.push(structured.tipoPeticao.replace(/_/g, ' '));
    }

    // Tese do usuário — melhor fonte de busca RAG
    if (structured?.tese) {
        parts.push(structured.tese.substring(0, 300));
    }

    // Tipo de petição mencionado no input livre?
    const tiposComuns = ['recurso', 'apelação', 'contestação', 'embargos', 'petição inicial',
        'mandado de segurança', 'agravo', 'habeas corpus', 'ação', 'reclamação',
        'recurso ordinário', 'recurso de revista', 'petição', 'inicial'];
    const inputLower = (rawInput + ' ' + (structured?.userInstructions || '')).toLowerCase();
    for (const tipo of tiposComuns) {
        if (inputLower.includes(tipo)) {
            parts.push(tipo);
        }
    }

    // Palavras-chave do input (excluindo números de processo)
    const words = rawInput
        .replace(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g, '') // Remove CNJ
        .replace(/[^\w\sáàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);

    if (words.length > 0) {
        parts.push(...words.slice(0, 20));
    }

    if (structured?.userInstructions) {
        parts.push(structured.userInstructions.substring(0, 200));
    }

    return parts.join(' ');
}

function buildSystemPrompt(structured?: EstrategistaInput): string {
    // Se o usuário já forneceu tipo e tese, o estrategista REFINA, não inventa
    const hasStructuredData = structured?.tipoPeticao && structured?.tese;

    return `# Estrategista LEX — Planejador de Produção em Lote

Você é o módulo estratégico da LEX, assistente jurídica agentica.
Seu papel é analisar uma lista de processos e definir a estratégia de produção em lote.

## CONTEXTO
${hasStructuredData
    ? `O advogado JÁ DEFINIU o tipo de petição e a tese. Seu papel é REFINAR e COMPLEMENTAR:
- Tipo: ${structured!.tipoPeticao!.replace(/_/g, ' ')}
- Tese/Contexto fornecido: "${structured!.tese}"
${structured!.tribunal ? `- Tribunal: ${structured!.tribunal}` : ''}
${structured!.tom ? `- Tom desejado: ${structured!.tom}` : ''}

Respeite essas escolhas do advogado. Seu trabalho é enriquecer com fundamentos legais concretos, organizar os processos, e definir regras de estilo.`
    : `O advogado não especificou tipo/tese. Você deve inferir do contexto e gerar uma estratégia completa.`}

## Sua Tarefa
1. Identificar os processos no input (número CNJ, partes, tribunal, valor)
2. ${hasStructuredData ? 'REFINAR a tese fornecida e adicionar fundamentos legais (artigos, súmulas, jurisprudência)' : 'Definir a tese jurídica mestra e fundamentos'}
3. Estabelecer persona, tom e estilo da escrita
4. Listar o que varia por processo (para individualização)
5. Criar restrições anti-robô (para que as petições não pareçam geradas por IA)

## Sobre a Tese e Fundamentos
- A tese mestra deve ser um argumento jurídico CONCRETO e ESPECÍFICO, não genérico
- Os fundamentos devem incluir artigos de lei, súmulas e jurisprudência REAIS
- Se houver contexto RAG de documentos do usuário, PRIORIZE a jurisprudência e teses ali encontradas
- O advogado confia que você vai sugerir fundamentos sólidos — ele revisará depois

## Formato de Resposta (JSON)
\`\`\`json
{
    "persona": {
        "papel": "Advogado sênior especialista em [área]",
        "tom": "${structured?.tom || 'formal e direto'}",
        "tribunalAlvo": "${structured?.tribunal || 'TRT-2'}"
    },
    "teseMestra": "Argumento jurídico central e específico...",
    "fundamentos": ["Art. 927 CC", "Súmula 392 TST", "STJ REsp 1.234.567/SP"],
    "variaveis": ["fatos específicos", "valores", "nomes das partes", "datas"],
    "manualDoNunca": [
        "Nunca comece 2 petições com a mesma frase de abertura",
        "Nunca use bullet points em excesso",
        "Nunca repita citações de jurisprudência na mesma ordem"
    ],
    "styleGuide": {
        "aberturaVariavel": true,
        "objetividade": "Vá direto ao ponto. Argumentos de impacto."
    },
    "processos": [
        { "numero": "0001234-56.2024.5.02.0001", "partes": { "autor": "Maria", "reu": "Empresa X" }, "tribunal": "${structured?.tribunal || 'TRT-2'}", "valor": "25000" }
    ],
    "tipoPeticao": "${structured?.tipoPeticao || 'peticao'}",
    "waveSize": 10
}
\`\`\`

## Regras
- Extraia TODOS os processos do input, mesmo que o formato não seja padrão
- Se o número CNJ estiver parcial ou malformado, preserve como está
- Se as partes não forem informadas, omita o campo partes (NÃO coloque null)
- waveSize: ${DEFAULT_WAVE_SIZE} por padrão, mín ${MIN_WAVE_SIZE}, máx ${MAX_WAVE_SIZE}
- manualDoNunca deve ter pelo menos 5 restrições de variabilidade
${hasStructuredData ? `- tipoPeticao DEVE ser "${structured!.tipoPeticao}" (definido pelo advogado)` : '- tipoPeticao: use o nome exato (peticao_inicial, recurso_ordinario, apelacao, contestacao, embargos, etc.)'}
${structured?.tom ? `- O tom DEVE ser "${structured.tom}" (definido pelo advogado)` : ''}

IMPORTANTE: Responda SOMENTE o JSON, sem texto adicional.`;
}

function buildUserPrompt(rawInput: string, structured?: EstrategistaInput, ragContext?: string): string {
    let prompt = `## Dados dos Processos\n\n${rawInput.substring(0, 10000)}`;

    // Adicionar tese do usuário como contexto principal
    if (structured?.tese) {
        prompt += `\n\n## Tese / Contexto Jurídico (fornecido pelo advogado)\n\n${structured.tese}`;
    }

    if (structured?.userInstructions) {
        prompt += `\n\n## Instruções Adicionais do Advogado\n\n${structured.userInstructions}`;
    }

    if (ragContext) {
        prompt += `\n\n## Documentos do Escritório (RAG)\nUse estes trechos dos documentos do usuário para enriquecer a estratégia com jurisprudência, teses e fundamentos já utilizados pelo escritório:\n\n${ragContext.substring(0, 5000)}`;
    }

    prompt += '\n\nAnalise e gere o StrategyPacket em JSON. A tese deve ser CONCRETA e os fundamentos devem citar artigos de lei e jurisprudência REAIS.';
    return prompt;
}

async function parseStrategy(response: string, rawInput: string): Promise<StrategyPacket> {
    try {
        // Extrai JSON
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
            || response.match(/```\s*([\s\S]*?)\s*```/)
            || response.match(/\{[\s\S]*\}/);

        if (!jsonMatch) throw new Error('Resposta do estrategista não contém JSON');

        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        // Valida campos obrigatórios
        if (!parsed.processos || !Array.isArray(parsed.processos) || parsed.processos.length === 0) {
            throw new Error('Nenhum processo identificado');
        }

        // Normaliza processos
        const processos: ProcessoInput[] = parsed.processos.map((p: any, i: number) => ({
            numero: String(p.numero || p.num || `processo-${i + 1}`),
            partes: p.partes && p.partes.autor ? p.partes : undefined,
            tribunal: p.tribunal || parsed.persona?.tribunalAlvo || undefined,
            vara: p.vara || undefined,
            valor: p.valor ? String(p.valor) : undefined,
            observacao: p.observacao || undefined,
        }));

        // Clamp waveSize
        const waveSize = Math.min(
            MAX_WAVE_SIZE,
            Math.max(MIN_WAVE_SIZE, parsed.waveSize || DEFAULT_WAVE_SIZE)
        );

        const strategy: StrategyPacket = {
            persona: {
                papel: parsed.persona?.papel || 'Advogado especialista',
                tom: parsed.persona?.tom || 'formal e direto',
                tribunalAlvo: parsed.persona?.tribunalAlvo || '',
            },
            teseMestra: parsed.teseMestra || 'Elaborar tese adequada ao tipo de petição e dados disponíveis',
            fundamentos: Array.isArray(parsed.fundamentos) && parsed.fundamentos.length > 0
                ? parsed.fundamentos
                : ['Selecionar fundamentos legais adequados'],
            variaveis: Array.isArray(parsed.variaveis) ? parsed.variaveis : ['fatos', 'valores', 'partes'],
            manualDoNunca: Array.isArray(parsed.manualDoNunca) && parsed.manualDoNunca.length >= 3
                ? parsed.manualDoNunca
                : [
                    'Nunca comece 2 petições com a mesma frase de abertura',
                    'Nunca use listas com mais de 5 itens seguidos',
                    'Nunca repita jurisprudência na mesma ordem',
                    'Nunca use as mesmas transições entre seções',
                    'Nunca abra o "DOS FATOS" da mesma forma',
                ],
            styleGuide: {
                aberturaVariavel: parsed.styleGuide?.aberturaVariavel ?? true,
                objetividade: parsed.styleGuide?.objetividade || 'Direto ao ponto, sem academicismo.',
            },
            processos,
            tipoPeticao: parsed.tipoPeticao || 'peticao',
            waveSize,
        };

        console.log(`[Estrategista] Estratégia montada: ${processos.length} processos, tipo=${strategy.tipoPeticao}, tese="${strategy.teseMestra.substring(0, 80)}...", wave=${waveSize}`);
        return strategy;

    } catch (error: any) {
        console.error('[Estrategista] Erro ao parsear estratégia:', error.message);

        // Fallback: tenta extrair processos por regex do input original
        const processos = extractProcessosFromRaw(rawInput);

        if (processos.length === 0) {
            throw new Error(`Não foi possível identificar processos no input: ${error.message}`);
        }

        console.log(`[Estrategista] Fallback: ${processos.length} processos extraídos por regex`);

        return {
            persona: { papel: 'Advogado', tom: 'formal', tribunalAlvo: '' },
            teseMestra: 'Elaborar tese adequada ao tipo de petição e dados disponíveis',
            fundamentos: ['Selecionar fundamentos legais adequados'],
            variaveis: ['fatos', 'valores', 'partes'],
            manualDoNunca: [
                'Nunca comece 2 petições com a mesma frase',
                'Nunca use listas com mais de 5 itens',
                'Nunca repita jurisprudência na mesma ordem',
                'Nunca use as mesmas transições entre seções',
                'Nunca abra o "DOS FATOS" da mesma forma',
            ],
            styleGuide: { aberturaVariavel: true, objetividade: 'Direto ao ponto.' },
            processos,
            tipoPeticao: 'peticao',
            waveSize: DEFAULT_WAVE_SIZE,
        };
    }
}

/**
 * Fallback: extrai números de processo CNJ do texto via regex.
 */
function extractProcessosFromRaw(text: string): ProcessoInput[] {
    const cnj = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
    const matches = text.match(cnj) || [];
    const unique = [...new Set(matches)];
    return unique.map(numero => ({ numero }));
}
