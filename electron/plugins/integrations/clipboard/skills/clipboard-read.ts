import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { readText, readHTML, readRTF, readImage, getFormats } from '../clipboard-client';

export const clipboardLer: Skill = {
    nome: 'clipboard_ler',
    descricao: 'Lê o conteúdo do clipboard do sistema. Suporta texto, HTML, RTF e imagem.',
    categoria: 'clipboard',
    parametros: {
        formato: {
            tipo: 'string',
            descricao: 'Formato para ler: texto, html, rtf ou imagem',
            obrigatorio: false,
            default: 'texto',
            enum: ['texto', 'html', 'rtf', 'imagem'],
        },
    },
    retorno: 'Conteúdo do clipboard no formato solicitado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const formato = String(params['formato'] || 'texto').toLowerCase();
            const formats = getFormats();

            switch (formato) {
                case 'texto': {
                    const text = readText();
                    if (!text) {
                        return { sucesso: true, dados: { conteudo: '', formatos: formats }, mensagem: 'Clipboard vazio (sem texto).' };
                    }
                    return {
                        sucesso: true,
                        dados: { conteudo: text, tamanho: text.length, formatos: formats },
                        mensagem: `Texto lido do clipboard (${text.length} caracteres):\n\n${text}`,
                    };
                }

                case 'html': {
                    const html = readHTML();
                    if (!html) {
                        return { sucesso: true, dados: { conteudo: '', formatos: formats }, mensagem: 'Clipboard vazio (sem HTML).' };
                    }
                    return {
                        sucesso: true,
                        dados: { conteudo: html, tamanho: html.length, formatos: formats },
                        mensagem: `HTML lido do clipboard (${html.length} caracteres):\n\n${html}`,
                    };
                }

                case 'rtf': {
                    const rtf = readRTF();
                    if (!rtf) {
                        return { sucesso: true, dados: { conteudo: '', formatos: formats }, mensagem: 'Clipboard vazio (sem RTF).' };
                    }
                    return {
                        sucesso: true,
                        dados: { conteudo: rtf, tamanho: rtf.length, formatos: formats },
                        mensagem: `RTF lido do clipboard (${rtf.length} caracteres).`,
                    };
                }

                case 'imagem': {
                    const img = readImage();
                    if (!img) {
                        return { sucesso: true, dados: { conteudo: null, formatos: formats }, mensagem: 'Clipboard vazio (sem imagem).' };
                    }
                    return {
                        sucesso: true,
                        dados: { base64: img.base64, width: img.width, height: img.height, formatos: formats },
                        mensagem: `Imagem lida do clipboard: ${img.width}x${img.height} px.`,
                    };
                }

                default:
                    return { sucesso: false, erro: `Formato desconhecido: '${formato}'. Use: texto, html, rtf ou imagem.` };
            }
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
