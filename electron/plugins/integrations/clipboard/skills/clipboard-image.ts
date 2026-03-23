import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { readImage, writeImage } from '../clipboard-client';
import * as fs from 'fs';
import * as path from 'path';

export const clipboardImagem: Skill = {
    nome: 'clipboard_imagem',
    descricao: 'Lê ou escreve imagens no clipboard. Pode salvar a imagem do clipboard em arquivo ou copiar um arquivo de imagem para o clipboard.',
    categoria: 'clipboard',
    parametros: {
        acao: {
            tipo: 'string',
            descricao: 'Ação: "ler" (clipboard -> arquivo) ou "escrever" (arquivo -> clipboard)',
            obrigatorio: true,
            enum: ['ler', 'escrever'],
        },
        arquivo: {
            tipo: 'string',
            descricao: 'Caminho do arquivo. Para "ler": onde salvar a imagem (opcional). Para "escrever": imagem a copiar (obrigatório).',
            obrigatorio: false,
        },
    },
    retorno: 'Resultado da operação com detalhes da imagem.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const acao = String(params['acao'] || '').toLowerCase();
            const arquivo = params['arquivo'] ? String(params['arquivo']).trim() : undefined;

            if (acao === 'ler') {
                const img = readImage();
                if (!img) {
                    return { sucesso: true, dados: { conteudo: null }, mensagem: 'Nenhuma imagem encontrada no clipboard.' };
                }

                // Optionally save to file
                if (arquivo) {
                    const resolved = path.resolve(arquivo);
                    const dir = path.dirname(resolved);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(resolved, Buffer.from(img.base64, 'base64'));
                    return {
                        sucesso: true,
                        dados: { arquivo: resolved, width: img.width, height: img.height },
                        mensagem: `Imagem do clipboard salva em: ${resolved} (${img.width}x${img.height} px).`,
                    };
                }

                return {
                    sucesso: true,
                    dados: { base64: img.base64, width: img.width, height: img.height },
                    mensagem: `Imagem lida do clipboard: ${img.width}x${img.height} px (base64 disponível em dados).`,
                };

            } else if (acao === 'escrever') {
                if (!arquivo) {
                    return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório para a ação "escrever".' };
                }

                writeImage(arquivo);
                const resolved = path.resolve(arquivo);
                return {
                    sucesso: true,
                    dados: { arquivo: resolved },
                    mensagem: `Imagem copiada para o clipboard: ${path.basename(resolved)}.`,
                };

            } else {
                return { sucesso: false, erro: `Ação desconhecida: '${acao}'. Use: ler ou escrever.` };
            }
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
