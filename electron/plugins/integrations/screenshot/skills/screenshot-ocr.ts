import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import * as fs from 'fs';
import { captureScreen, saveScreenshot } from '../screenshot-client';

export const screenshotOcr: Skill = {
    nome: 'screenshot_ocr',
    descricao: 'Captura a tela (ou usa imagem existente) e retorna base64 para o modelo de visao extrair texto.',
    categoria: 'screenshot',
    parametros: {
        arquivo: {
            tipo: 'string',
            descricao: 'Caminho de imagem existente. Se nao fornecido, captura a tela automaticamente.',
            obrigatorio: false,
        },
    },
    retorno: 'Imagem em base64 para analise pelo modelo de visao.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            let buffer: Buffer;
            let imagePath: string;

            if (params['arquivo']) {
                // Usa imagem existente
                imagePath = params['arquivo'];
                buffer = await fs.promises.readFile(imagePath);
            } else {
                // Captura a tela
                buffer = await captureScreen();
                imagePath = await saveScreenshot(buffer);
            }

            const base64 = buffer.toString('base64');

            return {
                sucesso: true,
                dados: { imagePath, base64 },
                mensagem: 'Screenshot capturada. Analise a imagem para extrair o texto.',
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
