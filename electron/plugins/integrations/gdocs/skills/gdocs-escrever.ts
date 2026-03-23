import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { appendText } from '../gdocs-client';

export const gdocsEscrever: Skill = {
    nome: 'gdocs_escrever', descricao: 'Adiciona texto a um Google Doc existente.', categoria: 'gdocs',
    parametros: {
        docId: { tipo: 'string', descricao: 'ID do documento', obrigatorio: true },
        text: { tipo: 'string', descricao: 'Texto a adicionar', obrigatorio: true },
    },
    retorno: 'Confirmação.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const docId = String(params['docId'] || '').trim();
        const text = String(params['text'] || '');
        if (!docId) return { sucesso: false, erro: 'docId obrigatório' };
        if (!text) return { sucesso: false, erro: 'text obrigatório' };
        try {
            await appendText(docId, text);
            return { sucesso: true, mensagem: `Texto adicionado ao documento ${docId}.` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
