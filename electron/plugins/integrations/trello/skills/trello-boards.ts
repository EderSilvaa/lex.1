import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listBoards } from '../trello-client';
export const trelloBoards: Skill = {
    nome: 'trello_boards', descricao: 'Lista quadros (boards) do Trello.', categoria: 'trello',
    parametros: {}, retorno: 'Quadros disponíveis.',
    async execute(_p: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const boards = await listBoards();
            const formatted = boards.map((b, i) => `${i + 1}. **${b.name}** — ID: ${b.id}`).join('\n');
            return { sucesso: true, dados: boards, mensagem: boards.length > 0 ? `${boards.length} quadro(s):\n\n${formatted}` : 'Nenhum quadro.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
