import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { sendMessage } from '../gmail-client';

export const gmailEnviar: Skill = {
    nome: 'gmail_enviar',
    descricao: 'Envia um email via Gmail. Informe destinatário, assunto e corpo. Opcionalmente CC e BCC.',
    categoria: 'gmail',
    parametros: {
        to: { tipo: 'string', descricao: 'Email do destinatário', obrigatorio: true },
        subject: { tipo: 'string', descricao: 'Assunto do email', obrigatorio: true },
        body: { tipo: 'string', descricao: 'Corpo do email (texto)', obrigatorio: true },
        cc: { tipo: 'string', descricao: 'CC (opcional)', obrigatorio: false },
        bcc: { tipo: 'string', descricao: 'BCC (opcional)', obrigatorio: false },
    },
    retorno: 'Confirmação de envio com ID da mensagem.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const to = String(params['to'] || '').trim();
        const subject = String(params['subject'] || '').trim();
        const body = String(params['body'] || '').trim();

        if (!to) return { sucesso: false, erro: 'Destinatário (to) obrigatório' };
        if (!subject) return { sucesso: false, erro: 'Assunto (subject) obrigatório' };
        if (!body) return { sucesso: false, erro: 'Corpo (body) obrigatório' };

        try {
            const msgId = await sendMessage(to, subject, body, {
                cc: params['cc'],
                bcc: params['bcc'],
            });

            return {
                sucesso: true,
                dados: { messageId: msgId, to, subject },
                mensagem: `Email enviado para ${to}: "${subject}" (ID: ${msgId})`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message, mensagem: `Erro ao enviar email: ${err.message}` };
        }
    },
};
