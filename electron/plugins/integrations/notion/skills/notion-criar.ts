import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { createPage } from '../notion-client';
export const notionCriar: Skill = {
    nome: 'notion_criar', descricao: 'Cria nova página no Notion dentro de um parent.', categoria: 'notion',
    parametros: {
        parentId: { tipo: 'string', descricao: 'ID da página ou database pai', obrigatorio: true },
        title: { tipo: 'string', descricao: 'Título da página', obrigatorio: true },
        content: { tipo: 'string', descricao: 'Conteúdo inicial (opcional)', obrigatorio: false },
    },
    retorno: 'Página criada.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const parentId = String(params['parentId'] || '').trim();
        const title = String(params['title'] || '').trim();
        if (!parentId || !title) return { sucesso: false, erro: 'parentId e title obrigatórios' };
        try {
            const page = await createPage(parentId, title, params['content']);
            return { sucesso: true, dados: page, mensagem: `Página criada: **${page.title}** (ID: ${page.id})` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
