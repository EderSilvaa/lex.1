import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { getPageContent } from '../notion-client';
export const notionLer: Skill = {
    nome: 'notion_ler', descricao: 'Lê conteúdo de uma página Notion pelo ID.', categoria: 'notion',
    parametros: { pageId: { tipo: 'string', descricao: 'ID da página', obrigatorio: true } },
    retorno: 'Conteúdo textual da página.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const pageId = String(params['pageId'] || '').trim();
        if (!pageId) return { sucesso: false, erro: 'pageId obrigatório' };
        try {
            const content = await getPageContent(pageId);
            return { sucesso: true, dados: { pageId, content }, mensagem: content || '(página vazia)' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
