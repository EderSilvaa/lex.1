import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { getDocument } from '../gdocs-client';

export const gdocsLer: Skill = {
    nome: 'gdocs_ler', descricao: 'Lê conteúdo de um Google Doc pelo ID.', categoria: 'gdocs',
    parametros: { docId: { tipo: 'string', descricao: 'ID do documento', obrigatorio: true } },
    retorno: 'Conteúdo textual do documento.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const docId = String(params['docId'] || '').trim();
        if (!docId) return { sucesso: false, erro: 'docId obrigatório' };
        try {
            const doc = await getDocument(docId);
            return { sucesso: true, dados: doc, mensagem: `**${doc.title}**\n\n${doc.body || '(vazio)'}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
