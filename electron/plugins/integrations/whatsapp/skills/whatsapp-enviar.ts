import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { sendTextMessage } from '../whatsapp-client';

export const whatsappEnviar: Skill = {
    nome: 'whatsapp_enviar', descricao: 'Envia mensagem de texto via WhatsApp Business.', categoria: 'whatsapp',
    parametros: {
        to: { tipo: 'string', descricao: 'Número com DDI (ex: 5591999999999)', obrigatorio: true },
        text: { tipo: 'string', descricao: 'Texto da mensagem', obrigatorio: true },
        phoneNumberId: { tipo: 'string', descricao: 'ID do número remetente (Meta Business)', obrigatorio: true },
    },
    retorno: 'ID da mensagem enviada.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const to = String(params['to'] || '').trim();
        const text = String(params['text'] || '').trim();
        const phoneNumberId = String(params['phoneNumberId'] || '').trim();
        if (!to || !text || !phoneNumberId) return { sucesso: false, erro: 'to, text e phoneNumberId são obrigatórios' };
        try {
            const msgId = await sendTextMessage(to, text, phoneNumberId);
            return { sucesso: true, dados: { msgId, to }, mensagem: `Mensagem enviada para ${to} (ID: ${msgId})` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
