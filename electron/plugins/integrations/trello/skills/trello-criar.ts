import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { createCard } from '../trello-client';
export const trelloCriar: Skill = {
    nome: 'trello_criar', descricao: 'Cria card no Trello (prazo processual, tarefa).', categoria: 'trello',
    parametros: {
        listId: { tipo: 'string', descricao: 'ID da lista onde criar', obrigatorio: true },
        name: { tipo: 'string', descricao: 'Título do card', obrigatorio: true },
        desc: { tipo: 'string', descricao: 'Descrição', obrigatorio: false },
        due: { tipo: 'string', descricao: 'Prazo (ISO date)', obrigatorio: false },
    },
    retorno: 'Card criado.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const listId = String(params['listId'] || '').trim();
        const name = String(params['name'] || '').trim();
        if (!listId || !name) return { sucesso: false, erro: 'listId e name obrigatórios' };
        try {
            const card = await createCard(listId, name, params['desc'], params['due']);
            return { sucesso: true, dados: card, mensagem: `Card criado: **${card.name}**${card.due ? ` (prazo: ${card.due})` : ''}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
