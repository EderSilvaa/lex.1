/**
 * Skill: doc_gerar
 *
 * Gera documento jurídico completo via LLM, salva como HTML
 * e abre no programa padrão (Word abre HTML nativamente).
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getEnrichedFormattingBlock } from '../../batch/legal-templates';
import { getFullStyleBlock } from '../../legal/style-rules';
import { detectLegalArea } from '../../legal/legal-language-engine';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TIPOS: Record<string, string> = {
    peticao:       'Petição Inicial',
    contestacao:   'Contestação',
    apelacao:      'Apelação',
    agravo:        'Agravo de Instrumento',
    embargos:      'Embargos de Declaração',
    parecer:       'Parecer Jurídico',
    recurso:       'Recurso Ordinário',
    contrarrazoes: 'Contrarrazões'
};

const docGerar: Skill = {
    nome: 'doc_gerar',
    descricao: 'Gera documento jurídico completo (petição, contestação, recurso, etc.) com LLM e abre no Word',
    categoria: 'documentos',
    parametros: {
        tipo: {
            tipo: 'string',
            descricao: 'Tipo do documento',
            obrigatorio: true,
            enum: Object.keys(TIPOS)
        },
        processo: {
            tipo: 'object',
            descricao: 'Dados do processo: numero, partes (autor/reu), classe, assunto, vara, juiz',
            obrigatorio: false
        },
        instrucoes: {
            tipo: 'string',
            descricao: 'Instruções específicas para o conteúdo (teses, argumentos, pedidos)',
            obrigatorio: false
        },
        estilo: {
            tipo: 'string',
            descricao: 'Estilo de escrita: formal (padrão) ou semiformal',
            obrigatorio: false,
            default: 'formal'
        }
    },
    retorno: 'Caminho do arquivo HTML gerado (abre no Word) e preview do conteúdo',
    exemplos: [
        '{ "skill": "doc_gerar", "parametros": { "tipo": "contestacao", "processo": { "numero": "0001234-56.2024.5.08.0001", "partes": { "autor": "Maria Silva", "reu": "Empresa XYZ Ltda" } }, "instrucoes": "Alegar prescrição e impugnar os valores pleiteados" } }'
    ],
    execute: async (params: Record<string, any>, context: AgentContext): Promise<SkillResult> => {
        const tipo: string = params['tipo'];
        const instrucoes: string = params['instrucoes'] || '';
        const estilo: string = params['estilo'] || 'formal';

        // Usa processo dos params ou do contexto do agente
        const dadosProcesso = params['processo'] || context.processo;
        const tipoFormatado = TIPOS[tipo] || tipo;

        // Informações do advogado do perfil do usuário
        const usr = context.usuario;
        const advogado = usr?.nome
            ? `${usr.nome}${usr.oab ? ` — OAB ${usr.oab}` : ''}${usr.escritorio ? ` — ${usr.escritorio}` : ''}`
            : '[NOME DO ADVOGADO] — OAB [NÚMERO]/[ESTADO]';

        const processoTexto = dadosProcesso
            ? JSON.stringify(dadosProcesso, null, 2)
            : 'Processo não informado — use campos genéricos [CAMPO] para preenchimento posterior.';

        try {
            const { callAI } = await import('../../ai-handler');

            // Monta system prompt enriquecido com templates + estilo jurídico
            const areas = detectLegalArea(instrucoes || tipoFormatado);
            const primaryArea = areas[0] || 'civil';
            const formattingBlock = getEnrichedFormattingBlock(tipo, { area: primaryArea });
            const styleBlock = getFullStyleBlock(primaryArea, tipo);

            // Súmulas e artigos relevantes do store dinâmico
            let legalRefBlock = '';
            try {
                const { searchSumulas, searchArticles } = await import('../../legal/legal-store');
                const queryText = instrucoes || tipoFormatado;
                const sumulasRel = searchSumulas(queryText, 5);
                const artigosRel = searchArticles(queryText, 5);

                if (sumulasRel.length > 0) {
                    legalRefBlock += '\nSÚMULAS VERIFICADAS (use na fundamentação):\n';
                    legalRefBlock += sumulasRel.map(s =>
                        `- Súmula ${s.numero} do ${s.tribunal}: ${s.texto.substring(0, 200)}`
                    ).join('\n');
                }
                if (artigosRel.length > 0) {
                    legalRefBlock += '\n\nARTIGOS COM TEXTO OFICIAL (cite com precisão):\n';
                    legalRefBlock += artigosRel.map(a =>
                        `- ${a.artigo} da ${a.lei}: ${a.texto.substring(0, 200)}`
                    ).join('\n');
                }
            } catch { /* legal store not available */ }

            const conteudoHTML = await callAI({
                system: `Você é um especialista em redação jurídica brasileira com vasta experiência em documentos processuais.

Gere um documento jurídico completo do tipo "${tipoFormatado}" seguindo as normas processuais brasileiras.

${formattingBlock}

${styleBlock}
${legalRefBlock}

REGRAS ADICIONAIS:
- Linguagem ${estilo === 'formal' ? 'formal e técnica, própria do foro' : 'clara, objetiva e respeitosa'}
- Cite pelo menos 2 decisões jurisprudenciais reais e relevantes
- Use [CAMPO] para dados não fornecidos que devem ser preenchidos
- Retorne APENAS o HTML do corpo do documento (sem <!DOCTYPE>, <html>, <head> ou <body>)
- Tags HTML a usar: <h1> para título, <h2> para seções, <p> para parágrafos, <strong> para destaques, <ol>/<li> para listas numeradas`,
                user: `Gere um(a) ${tipoFormatado} com as seguintes informações:

DADOS DO PROCESSO:
${processoTexto}

ADVOGADO RESPONSÁVEL:
${advogado}

INSTRUÇÕES ESPECÍFICAS:
${instrucoes || `Siga a estrutura padrão para ${tipoFormatado}, com argumentação completa e pedidos adequados ao tipo de ação.`}`,
                temperature: 0.4,
                maxTokens: 4000
            });

            // Monta o HTML final com estilo de documento jurídico
            const hoje = new Date().toLocaleDateString('pt-BR', {
                day: 'numeric', month: 'long', year: 'numeric'
            });

            const htmlFinal = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${tipoFormatado}</title>
  <style>
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      margin: 3cm 2.5cm;
      color: #000;
      line-height: 1.5;
    }
    h1 {
      text-align: center;
      font-size: 13pt;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 30px;
    }
    h2 {
      font-size: 12pt;
      text-transform: uppercase;
      text-decoration: underline;
      margin-top: 25px;
      margin-bottom: 10px;
    }
    p {
      text-align: justify;
      margin-bottom: 10px;
    }
    ol { margin-left: 20px; }
    li { margin-bottom: 5px; }
    .rodape {
      margin-top: 60px;
      text-align: center;
    }
    /* Metadados para impressão */
    @media print {
      body { margin: 2.5cm; }
    }
  </style>
</head>
<body>
<!-- Gerado por LEX em ${hoje} -->
${conteudoHTML}
</body>
</html>`;

            // Salva na pasta Documents/Lex
            const pastaLex = path.join(os.homedir(), 'Documents', 'Lex');
            if (!fs.existsSync(pastaLex)) {
                fs.mkdirSync(pastaLex, { recursive: true });
            }

            const nomeArquivo = `${tipo}_${Date.now()}.html`;
            const caminhoArquivo = path.join(pastaLex, nomeArquivo);
            fs.writeFileSync(caminhoArquivo, htmlFinal, 'utf-8');

            // Abre no programa padrão (sem dependência do Electron)
            try {
                const { exec } = await import('child_process');
                if (process.platform === 'win32') {
                    exec(`start "" "${caminhoArquivo}"`);
                } else if (process.platform === 'darwin') {
                    exec(`open "${caminhoArquivo}"`);
                } else {
                    exec(`xdg-open "${caminhoArquivo}"`);
                }
            } catch {
                // Se não conseguir abrir, não é erro crítico — o arquivo está salvo
            }

            // Preview sem tags HTML
            const preview = conteudoHTML
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 400);

            return {
                sucesso: true,
                dados: {
                    arquivo: nomeArquivo,
                    caminho: caminhoArquivo,
                    tipo,
                    preview
                },
                mensagem: [
                    `✅ **${tipoFormatado} gerado com sucesso!**`,
                    ``,
                    `📁 Arquivo: \`${caminhoArquivo}\``,
                    ``,
                    `O documento foi aberto para revisão. Edite os campos [CAMPO] e verifique os dados antes de protocolar.`
                ].join('\n')
            };

        } catch (err: any) {
            return {
                sucesso: false,
                erro: err.message,
                mensagem: `❌ Erro ao gerar documento: ${err.message}`
            };
        }
    }
};

export default docGerar;
export { docGerar };
