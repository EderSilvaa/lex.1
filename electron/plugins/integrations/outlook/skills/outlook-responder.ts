import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { replyToMessage } from '../outlook-client';

export const outlookResponder: Skill = {
    nome: 'outlook_responder',
    descricao: 'Responde a um email existente no Outlook.',
    categoria: 'outlook',
    parametros: {
        messageId: { tipo: 'string', descricao: 'ID da mensagem original', obrigatorio: true },
        body: { tipo: 'string', descricao: 'Texto da resposta', obrigatorio: true },
    },
    retorno: 'Confirmação do reply.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const messageId = String(params['messageId'] || '').trim();
        const body = String(params['body'] || '').trim();
        if (!messageId) return { sucesso: false, erro: 'messageId obrigatório' };
        if (!body) return { sucesso: false, erro: 'Texto da resposta obrigatório' };
        try {
            await replyToMessage(messageId, body);
            return { sucesso: true, dados: { messageId }, mensagem: 'Resposta enviada com sucesso.' };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
