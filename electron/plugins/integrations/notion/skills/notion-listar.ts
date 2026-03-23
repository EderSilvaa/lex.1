import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listRecentPages } from '../notion-client';
export const notionListar: Skill = {
    nome: 'notion_listar', descricao: 'Lista páginas recentes no Notion.', categoria: 'notion',
    parametros: {},
    retorno: 'Páginas recentes.',
    async execute(_params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const pages = await listRecentPages();
            const formatted = pages.map((p, i) => `${i + 1}. **${p.title}** — ${p.lastEdited}`).join('\n');
            return { sucesso: true, dados: pages, mensagem: pages.length > 0 ? `${pages.length} página(s) recentes:\n\n${formatted}` : 'Nenhuma página.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
