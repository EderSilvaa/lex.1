import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { sendMessage } from '../outlook-client';

export const outlookEnviar: Skill = {
    nome: 'outlook_enviar',
    descricao: 'Envia email via Outlook/Office 365.',
    categoria: 'outlook',
    parametros: {
        to: { tipo: 'string', descricao: 'Email do destinatário', obrigatorio: true },
        subject: { tipo: 'string', descricao: 'Assunto', obrigatorio: true },
        body: { tipo: 'string', descricao: 'Corpo do email', obrigatorio: true },
        cc: { tipo: 'string', descricao: 'CC (opcional)', obrigatorio: false },
        bcc: { tipo: 'string', descricao: 'BCC (opcional)', obrigatorio: false },
    },
    retorno: 'Confirmação de envio.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const to = String(params['to'] || '').trim();
        const subject = String(params['subject'] || '').trim();
        const body = String(params['body'] || '').trim();
        if (!to) return { sucesso: false, erro: 'Destinatário (to) obrigatório' };
        if (!subject) return { sucesso: false, erro: 'Assunto obrigatório' };
        if (!body) return { sucesso: false, erro: 'Corpo obrigatório' };
        try {
            await sendMessage(to, subject, body, { cc: params['cc'], bcc: params['bcc'] });
            return { sucesso: true, dados: { to, subject }, mensagem: `Email enviado para ${to}: "${subject}"` };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
