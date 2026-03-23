import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { updateCard } from '../trello-client';
export const trelloAtualizar: Skill = {
    nome: 'trello_atualizar', descricao: 'Atualiza card do Trello (nome, descrição, prazo).', categoria: 'trello',
    parametros: {
        cardId: { tipo: 'string', descricao: 'ID do card', obrigatorio: true },
        name: { tipo: 'string', descricao: 'Novo nome', obrigatorio: false },
        desc: { tipo: 'string', descricao: 'Nova descrição', obrigatorio: false },
        due: { tipo: 'string', descricao: 'Novo prazo (ISO date)', obrigatorio: false },
    },
    retorno: 'Card atualizado.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const cardId = String(params['cardId'] || '').trim();
        if (!cardId) return { sucesso: false, erro: 'cardId obrigatório' };
        try {
            const card = await updateCard(cardId, { name: params['name'], desc: params['desc'], due: params['due'] });
            return { sucesso: true, dados: card, mensagem: `Card atualizado: **${card.name}**` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
