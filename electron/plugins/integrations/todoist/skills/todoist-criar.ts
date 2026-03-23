import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { createTask } from '../todoist-client';
export const todoistCriar: Skill = {
    nome: 'todoist_criar', descricao: 'Cria tarefa no Todoist com prazo e prioridade.', categoria: 'todoist',
    parametros: {
        content: { tipo: 'string', descricao: 'Título da tarefa', obrigatorio: true },
        description: { tipo: 'string', descricao: 'Descrição', obrigatorio: false },
        dueString: { tipo: 'string', descricao: 'Prazo em linguagem natural (ex: "amanhã", "sexta-feira")', obrigatorio: false },
        priority: { tipo: 'number', descricao: 'Prioridade 1-4 (4=urgente)', obrigatorio: false, default: 1 },
        projectId: { tipo: 'string', descricao: 'ID do projeto', obrigatorio: false },
    },
    retorno: 'Tarefa criada.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const content = String(params['content'] || '').trim();
        if (!content) return { sucesso: false, erro: 'content obrigatório' };
        try {
            const task = await createTask(content, { description: params['description'], dueString: params['dueString'], priority: params['priority'], projectId: params['projectId'] });
            return { sucesso: true, dados: task, mensagem: `Tarefa criada: **${task.content}**${task.due ? ` (${task.due.string || task.due.date})` : ''}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
