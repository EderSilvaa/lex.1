/**
 * Skill: doc_gerar
 *
 * Gera documento jurídico completo via LLM, salva como HTML
 * e abre no programa padrão (Word abre HTML nativamente).
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
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

            const conteudoHTML = await callAI({
                system: `Você é um especialista em redação jurídica brasileira com vasta experiência em documentos processuais.

Gere um documento jurídico completo do tipo "${tipoFormatado}" seguindo as normas processuais brasileiras.

ESTRUTURA OBRIGATÓRIA (use exatamente estas seções):
1. Cabeçalho — destinatário (Juízo/Tribunal competente com dados do processo)
2. Qualificação das partes — autor e réu com dados fornecidos
3. DOS FATOS — narrativa factual clara e cronológica
4. DO DIREITO — fundamentos jurídicos sólidos com artigos de lei e jurisprudência real (STJ/STF/TRT)
5. DOS PEDIDOS — numerados, específicos e fundamentados
6. Encerramento — local, data por extenso e linha de assinatura do advogado

REGRAS:
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

            // Abre no programa padrão (Windows abre HTML no Word ou browser)
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { shell } = require('electron');
                await shell.openPath(caminhoArquivo);
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
