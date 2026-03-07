/**
 * Skill: doc_analisar
 *
 * Analisa um documento jurídico real (PDF, DOCX, TXT) usando LLM.
 * Extrai: tipo, resumo, teses, riscos, pedidos, partes e prazos.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';

const docAnalisar: Skill = {
    nome: 'doc_analisar',
    descricao: 'Analisa um documento jurídico (PDF, DOCX, TXT) e extrai: tipo, resumo, teses, riscos e pedidos',
    categoria: 'documentos',
    parametros: {
        caminho: {
            tipo: 'string',
            descricao: 'Caminho completo do arquivo (.pdf, .docx, .txt)',
            obrigatorio: false
        },
        texto: {
            tipo: 'string',
            descricao: 'Texto do documento para análise direta (alternativa ao caminho)',
            obrigatorio: false
        }
    },
    retorno: 'JSON com tipo_detectado, resumo, pontos_principais, teses, riscos, pedidos e prazo_identificado',
    exemplos: [
        '{ "skill": "doc_analisar", "parametros": { "caminho": "C:/Users/advogado/Downloads/contestacao.pdf" } }'
    ],
    execute: async (params: Record<string, any>, _context: AgentContext): Promise<SkillResult> => {
        const { caminho, texto } = params;

        // Validação: precisa de caminho ou texto
        if (!caminho && !texto) {
            return {
                sucesso: false,
                erro: 'Informe "caminho" (arquivo) ou "texto" para análise',
                mensagem: '❌ Parâmetro obrigatório ausente: informe o caminho do arquivo ou o texto.'
            };
        }

        // Lê o arquivo se caminho fornecido
        let conteudo: string;
        if (caminho) {
            try {
                const { lerArquivo } = await import('../../tools/os-tools');
                conteudo = await lerArquivo(caminho);
            } catch (err: any) {
                return {
                    sucesso: false,
                    erro: err.message,
                    mensagem: `❌ Não foi possível ler o arquivo: ${err.message}`
                };
            }
        } else {
            conteudo = texto as string;
        }

        // Limita para não estourar contexto do LLM (~20k chars ≈ 5k tokens)
        const textoAnalise = conteudo.length > 20000
            ? conteudo.substring(0, 20000) + '\n\n[... documento truncado ...]'
            : conteudo;

        try {
            const { callAI } = await import('../../ai-handler');

            const resposta = await callAI({
                system: `Você é um especialista jurídico brasileiro com amplo conhecimento em direito processual civil, trabalhista e previdenciário.

Analise o documento fornecido e retorne SOMENTE um JSON válido com esta estrutura exata:
{
  "tipo_detectado": "tipo do documento (ex: Petição Inicial, Contestação, Apelação...)",
  "resumo": "resumo claro em 2-3 frases",
  "pontos_principais": ["ponto 1", "ponto 2"],
  "teses": ["tese jurídica 1 com fundamento legal", "tese jurídica 2"],
  "riscos": [{"risco": "descrição do risco", "nivel": "baixo|medio|alto"}],
  "pedidos": ["pedido 1", "pedido 2"],
  "prazo_identificado": "descrição do prazo ou null",
  "partes": {"autor": "nome ou null", "reu": "nome ou null"}
}

Seja preciso e técnico. Identifique os fundamentos legais reais mencionados no documento.`,
                user: `Analise este documento:\n\n${textoAnalise}`,
                temperature: 0.1,
                maxTokens: 2000
            });

            // Extrai JSON da resposta
            let analise: any;
            try {
                const jsonMatch = resposta.match(/\{[\s\S]*\}/);
                analise = JSON.parse(jsonMatch ? jsonMatch[0] : resposta);
            } catch {
                return {
                    sucesso: false,
                    erro: 'Falha ao interpretar análise do LLM',
                    mensagem: '❌ Não foi possível estruturar a análise. Tente novamente.'
                };
            }

            // Formata mensagem legível
            const riscos = (analise.riscos || [])
                .map((r: any) => `  • ${r.risco} [${r.nivel}]`)
                .join('\n') || '  Nenhum identificado';

            const pedidos = (analise.pedidos || [])
                .map((p: string) => `  • ${p}`)
                .join('\n') || '  Não identificados';

            const pontos = (analise.pontos_principais || [])
                .map((p: string) => `  • ${p}`)
                .join('\n');

            const teses = (analise.teses || [])
                .map((t: string) => `  • ${t}`)
                .join('\n');

            const partes = analise.partes?.autor || analise.partes?.reu
                ? `\n**Partes:** ${analise.partes?.autor || '?'} x ${analise.partes?.reu || '?'}`
                : '';

            const prazo = analise.prazo_identificado
                ? `\n\n⏰ **Prazo:** ${analise.prazo_identificado}`
                : '';

            const mensagem = [
                `📄 **${analise.tipo_detectado || 'Documento'}**${partes}`,
                ``,
                `**Resumo:** ${analise.resumo}`,
                ``,
                `**Pontos principais:**\n${pontos}`,
                ``,
                `**Teses jurídicas:**\n${teses}`,
                ``,
                `**Pedidos:**\n${pedidos}`,
                ``,
                `**Riscos:**\n${riscos}`,
                prazo
            ].filter(l => l !== undefined).join('\n');

            return {
                sucesso: true,
                dados: analise,
                mensagem
            };

        } catch (err: any) {
            return {
                sucesso: false,
                erro: err.message,
                mensagem: `❌ Erro ao analisar documento: ${err.message}`
            };
        }
    }
};

export default docAnalisar;
export { docAnalisar };
