import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { focusWindow } from '../desktop-client';

export const desktopFocar: Skill = {
    nome: 'desktop_focar',
    descricao: 'Traz uma janela ao foco/primeiro plano. Aceita título parcial ou PID.',
    categoria: 'desktop',
    parametros: {
        janela: { tipo: 'string', descricao: 'Título parcial da janela ou PID do processo', obrigatorio: true },
    },
    retorno: 'Confirmação se a janela foi focada.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const janela = String(params['janela'] || '').trim();
        if (!janela) return { sucesso: false, erro: 'Parâmetro "janela" é obrigatório.' };
        try {
            const ok = await focusWindow(janela);
            return ok
                ? { sucesso: true, mensagem: `Janela "${janela}" trazida ao foco.` }
                : { sucesso: false, erro: `Janela "${janela}" não encontrada ou sem handle visível.` };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
