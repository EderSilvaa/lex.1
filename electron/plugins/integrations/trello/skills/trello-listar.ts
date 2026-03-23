import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listCards, listLists } from '../trello-client';
export const trelloListar: Skill = {
    nome: 'trello_listar', descricao: 'Lista cards de uma lista ou quadro do Trello.', categoria: 'trello',
    parametros: {
        listId: { tipo: 'string', descricao: 'ID da lista (obtido via trello_boards)', obrigatorio: false },
        boardId: { tipo: 'string', descricao: 'ID do quadro (lista todas as listas e cards)', obrigatorio: false },
    },
    retorno: 'Cards encontrados.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            if (params['listId']) {
                const cards = await listCards(params['listId']);
                const formatted = cards.map((c, i) => `${i + 1}. **${c.name}**${c.due ? ` (prazo: ${c.due})` : ''}\n   ${c.desc || ''}`).join('\n\n');
                return { sucesso: true, dados: cards, mensagem: cards.length > 0 ? `${cards.length} card(s):\n\n${formatted}` : 'Lista vazia.' };
            }
            if (params['boardId']) {
                const lists = await listLists(params['boardId']);
                const result: any[] = [];
                for (const list of lists) {
                    const cards = await listCards(list.id);
                    result.push({ list: list.name, listId: list.id, cards });
                }
                const formatted = result.map(r => `**${r.list}** (${r.cards.length} cards):\n${r.cards.map((c: any) => `  - ${c.name}`).join('\n')}`).join('\n\n');
                return { sucesso: true, dados: result, mensagem: formatted || 'Quadro vazio.' };
            }
            return { sucesso: false, erro: 'Informe listId ou boardId' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
