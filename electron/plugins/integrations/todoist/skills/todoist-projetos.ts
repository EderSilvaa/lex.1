import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listProjects } from '../todoist-client';
export const todoistProjetos: Skill = {
    nome: 'todoist_projetos', descricao: 'Lista projetos do Todoist.', categoria: 'todoist',
    parametros: {}, retorno: 'Projetos disponíveis.',
    async execute(_p: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const projects = await listProjects();
            const formatted = projects.map((p, i) => `${i + 1}. **${p.name}** — ID: ${p.id}`).join('\n');
            return { sucesso: true, dados: projects, mensagem: projects.length > 0 ? `${projects.length} projeto(s):\n\n${formatted}` : 'Nenhum projeto.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
