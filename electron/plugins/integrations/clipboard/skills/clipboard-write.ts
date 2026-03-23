import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { writeText, writeHTML } from '../clipboard-client';
import { clipboard } from 'electron';

export const clipboardEscrever: Skill = {
    nome: 'clipboard_escrever',
    descricao: 'Escreve conteúdo no clipboard do sistema. Suporta texto, HTML e RTF.',
    categoria: 'clipboard',
    parametros: {
        conteudo: {
            tipo: 'string',
            descricao: 'Conteúdo a ser copiado para o clipboard',
            obrigatorio: true,
        },
        formato: {
            tipo: 'string',
            descricao: 'Formato de escrita: texto, html ou rtf',
            obrigatorio: false,
            default: 'texto',
            enum: ['texto', 'html', 'rtf'],
        },
    },
    retorno: 'Confirmação de que o conteúdo foi copiado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const conteudo = params['conteudo'];
            if (conteudo == null || String(conteudo).length === 0) {
                return { sucesso: false, erro: 'Parâmetro "conteudo" é obrigatório e não pode ser vazio.' };
            }

            const texto = String(conteudo);
            const formato = String(params['formato'] || 'texto').toLowerCase();

            switch (formato) {
                case 'texto':
                    writeText(texto);
                    return {
                        sucesso: true,
                        dados: { formato: 'texto', tamanho: texto.length },
                        mensagem: `Texto copiado para o clipboard (${texto.length} caracteres).`,
                    };

                case 'html':
                    writeHTML(texto);
                    return {
                        sucesso: true,
                        dados: { formato: 'html', tamanho: texto.length },
                        mensagem: `HTML copiado para o clipboard (${texto.length} caracteres).`,
                    };

                case 'rtf':
                    clipboard.writeRTF(texto);
                    return {
                        sucesso: true,
                        dados: { formato: 'rtf', tamanho: texto.length },
                        mensagem: `RTF copiado para o clipboard (${texto.length} caracteres).`,
                    };

                default:
                    return { sucesso: false, erro: `Formato desconhecido: '${formato}'. Use: texto, html ou rtf.` };
            }
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
