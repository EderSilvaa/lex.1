import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { createDocument } from '../gdocs-client';

export const gdocsCriar: Skill = {
    nome: 'gdocs_criar', descricao: 'Cria novo Google Doc com título e conteúdo opcional.', categoria: 'gdocs',
    parametros: {
        title: { tipo: 'string', descricao: 'Título do documento', obrigatorio: true },
        content: { tipo: 'string', descricao: 'Conteúdo inicial (opcional)', obrigatorio: false },
    },
    retorno: 'Documento criado com ID.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const title = String(params['title'] || '').trim();
        if (!title) return { sucesso: false, erro: 'Título obrigatório' };
        try {
            const doc = await createDocument(title, params['content']);
            return { sucesso: true, dados: doc, mensagem: `Documento criado: **${doc.title}** (ID: ${doc.id})` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
