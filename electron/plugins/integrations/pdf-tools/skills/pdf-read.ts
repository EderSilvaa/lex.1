import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { extractText } from '../pdf-client';

export const pdfLer: Skill = {
    nome: 'pdf_ler',
    descricao: 'Extrai o texto de um arquivo PDF. Opcionalmente filtra por páginas específicas.',
    categoria: 'pdf',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do arquivo PDF', obrigatorio: true },
        paginas: { tipo: 'string', descricao: 'Páginas a extrair (ex: "1-5"). Vazio = todas.', obrigatorio: false },
    },
    retorno: 'Texto extraído do PDF.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };

        try {
            const paginas = params['paginas'] ? String(params['paginas']).trim() : undefined;
            const text = await extractText(arquivo, paginas);

            if (!text || text.trim().length === 0) {
                return {
                    sucesso: true,
                    dados: { texto: '', caracteres: 0 },
                    mensagem: 'O PDF não contém texto extraível (pode ser um PDF escaneado/imagem).',
                };
            }

            const truncated = text.length > 50000;
            const finalText = truncated ? text.substring(0, 50000) + '\n\n[... texto truncado em 50.000 caracteres]' : text;

            return {
                sucesso: true,
                dados: { texto: finalText, caracteres: text.length, truncado: truncated },
                mensagem: finalText,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
