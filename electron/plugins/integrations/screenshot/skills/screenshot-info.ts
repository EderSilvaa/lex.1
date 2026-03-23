import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { getScreenInfo } from '../screenshot-client';

export const screenshotInfo: Skill = {
    nome: 'screenshot_info',
    descricao: 'Retorna informacoes sobre a tela principal (resolucao, dimensoes).',
    categoria: 'screenshot',
    parametros: {},
    retorno: 'Resolucao e dimensoes da tela.',

    async execute(_params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const info = getScreenInfo();
            return {
                sucesso: true,
                dados: info,
                mensagem: `Tela principal: ${info.width}x${info.height} pixels.`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
