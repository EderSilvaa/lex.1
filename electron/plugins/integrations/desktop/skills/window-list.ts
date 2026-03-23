import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listWindows } from '../desktop-client';

export const desktopJanelas: Skill = {
    nome: 'desktop_janelas',
    descricao: 'Lista todas as janelas visíveis do Windows com título, PID e nome do processo.',
    categoria: 'desktop',
    parametros: {},
    retorno: 'Lista de janelas abertas.',

    async execute(_params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const windows = await listWindows();
            if (windows.length === 0) {
                return { sucesso: true, dados: { count: 0, windows: [] }, mensagem: 'Nenhuma janela visível encontrada.' };
            }
            const formatted = windows
                .map((w, i) => `${i + 1}. **${w.title}** — ${w.processName} (PID: ${w.pid})`)
                .join('\n');
            return {
                sucesso: true,
                dados: { count: windows.length, windows },
                mensagem: `${windows.length} janela(s) aberta(s):\n\n${formatted}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
