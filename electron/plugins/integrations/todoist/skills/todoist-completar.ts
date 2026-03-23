import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { completeTask } from '../todoist-client';
export const todoistCompletar: Skill = {
    nome: 'todoist_completar', descricao: 'Marca tarefa do Todoist como concluída.', categoria: 'todoist',
    parametros: { taskId: { tipo: 'string', descricao: 'ID da tarefa', obrigatorio: true } },
    retorno: 'Confirmação.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const taskId = String(params['taskId'] || '').trim();
        if (!taskId) return { sucesso: false, erro: 'taskId obrigatório' };
        try { await completeTask(taskId); return { sucesso: true, mensagem: `Tarefa ${taskId} concluída.` }; }
        catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
