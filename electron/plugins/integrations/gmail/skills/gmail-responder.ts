import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { replyToMessage } from '../gmail-client';

export const gmailResponder: Skill = {
    nome: 'gmail_responder',
    descricao: 'Responde a um email existente (thread). Envia reply mantendo o contexto da conversa.',
    categoria: 'gmail',
    parametros: {
        messageId: { tipo: 'string', descricao: 'ID da mensagem original (obtido de gmail_listar ou gmail_buscar)', obrigatorio: true },
        body: { tipo: 'string', descricao: 'Texto da resposta', obrigatorio: true },
    },
    retorno: 'Confirmação do reply com ID da mensagem.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const messageId = String(params['messageId'] || '').trim();
        const body = String(params['body'] || '').trim();

        if (!messageId) return { sucesso: false, erro: 'messageId obrigatório' };
        if (!body) return { sucesso: false, erro: 'Texto da resposta (body) obrigatório' };

        try {
            const replyId = await replyToMessage(messageId, body);
            return {
                sucesso: true,
                dados: { replyId, originalMessageId: messageId },
                mensagem: `Resposta enviada com sucesso (ID: ${replyId})`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message, mensagem: `Erro ao responder: ${err.message}` };
        }
    },
};
