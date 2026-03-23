import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listTasks } from '../todoist-client';
export const todoistListar: Skill = {
    nome: 'todoist_listar', descricao: 'Lista tarefas do Todoist.', categoria: 'todoist',
    parametros: {
        projectId: { tipo: 'string', descricao: 'ID do projeto (opcional)', obrigatorio: false },
        filter: { tipo: 'string', descricao: 'Filtro Todoist (ex: "today", "overdue")', obrigatorio: false },
    },
    retorno: 'Tarefas encontradas.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const tasks = await listTasks({ projectId: params['projectId'], filter: params['filter'] });
            const formatted = tasks.map((t, i) => `${i + 1}. **${t.content}**${t.due ? ` (${t.due.string || t.due.date})` : ''} [P${t.priority}]`).join('\n');
            return { sucesso: true, dados: tasks, mensagem: tasks.length > 0 ? `${tasks.length} tarefa(s):\n\n${formatted}` : 'Nenhuma tarefa.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
