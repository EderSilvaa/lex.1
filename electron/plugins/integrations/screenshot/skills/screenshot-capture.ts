import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { captureScreen, saveScreenshot } from '../screenshot-client';

export const screenshotCapturar: Skill = {
    nome: 'screenshot_capturar',
    descricao: 'Captura a tela inteira e salva como imagem PNG. Retorna o caminho do arquivo.',
    categoria: 'screenshot',
    parametros: {
        saida: {
            tipo: 'string',
            descricao: 'Caminho de saida para o arquivo PNG (opcional, default: temp)',
            obrigatorio: false,
        },
    },
    retorno: 'Caminho do arquivo PNG salvo.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const buffer = await captureScreen();
            const filePath = await saveScreenshot(buffer, params['saida'] || undefined);
            return {
                sucesso: true,
                dados: { caminho: filePath, tamanho: buffer.length },
                mensagem: `Screenshot salva em: ${filePath}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
