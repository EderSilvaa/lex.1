import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { moveCard } from '../trello-client';
export const trelloMover: Skill = {
    nome: 'trello_mover', descricao: 'Move card entre listas no Trello (ex: "A Fazer" → "Concluído").', categoria: 'trello',
    parametros: {
        cardId: { tipo: 'string', descricao: 'ID do card', obrigatorio: true },
        targetListId: { tipo: 'string', descricao: 'ID da lista destino', obrigatorio: true },
    },
    retorno: 'Card movido.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const cardId = String(params['cardId'] || '').trim();
        const targetListId = String(params['targetListId'] || '').trim();
        if (!cardId || !targetListId) return { sucesso: false, erro: 'cardId e targetListId obrigatórios' };
        try {
            const card = await moveCard(cardId, targetListId);
            return { sucesso: true, dados: card, mensagem: `Card **${card.name}** movido.` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
