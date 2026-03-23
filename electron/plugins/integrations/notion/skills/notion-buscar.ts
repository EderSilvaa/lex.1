import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { searchPages } from '../notion-client';
export const notionBuscar: Skill = {
    nome: 'notion_buscar', descricao: 'Busca páginas no Notion por texto.', categoria: 'notion',
    parametros: { query: { tipo: 'string', descricao: 'Texto de busca', obrigatorio: true } },
    retorno: 'Páginas encontradas.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const query = String(params['query'] || '').trim();
        if (!query) return { sucesso: false, erro: 'Query obrigatória' };
        try {
            const pages = await searchPages(query);
            const formatted = pages.map((p, i) => `${i + 1}. **${p.title}** — ${p.lastEdited}\n   ID: ${p.id}`).join('\n\n');
            return { sucesso: true, dados: pages, mensagem: pages.length > 0 ? `${pages.length} página(s):\n\n${formatted}` : 'Nenhuma página encontrada.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
