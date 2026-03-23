import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { updateTask } from '../todoist-client';
export const todoistAtualizar: Skill = {
    nome: 'todoist_atualizar', descricao: 'Atualiza tarefa do Todoist.', categoria: 'todoist',
    parametros: {
        taskId: { tipo: 'string', descricao: 'ID da tarefa', obrigatorio: true },
        content: { tipo: 'string', descricao: 'Novo título', obrigatorio: false },
        description: { tipo: 'string', descricao: 'Nova descrição', obrigatorio: false },
        dueString: { tipo: 'string', descricao: 'Novo prazo', obrigatorio: false },
        priority: { tipo: 'number', descricao: 'Nova prioridade 1-4', obrigatorio: false },
    },
    retorno: 'Tarefa atualizada.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const taskId = String(params['taskId'] || '').trim();
        if (!taskId) return { sucesso: false, erro: 'taskId obrigatório' };
        try {
            const task = await updateTask(taskId, { content: params['content'], description: params['description'], dueString: params['dueString'], priority: params['priority'] });
            return { sucesso: true, dados: task, mensagem: `Tarefa atualizada: **${task.content}**` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
