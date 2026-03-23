import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { appendBlocks } from '../notion-client';
export const notionEscrever: Skill = {
    nome: 'notion_escrever', descricao: 'Adiciona conteúdo a página Notion existente.', categoria: 'notion',
    parametros: {
        pageId: { tipo: 'string', descricao: 'ID da página', obrigatorio: true },
        text: { tipo: 'string', descricao: 'Texto a adicionar', obrigatorio: true },
    },
    retorno: 'Confirmação.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const pageId = String(params['pageId'] || '').trim();
        const text = String(params['text'] || '');
        if (!pageId || !text) return { sucesso: false, erro: 'pageId e text obrigatórios' };
        try { await appendBlocks(pageId, text); return { sucesso: true, mensagem: `Texto adicionado à página ${pageId}.` }; }
        catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
