import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { sendTemplateMessage } from '../whatsapp-client';

export const whatsappTemplate: Skill = {
    nome: 'whatsapp_template', descricao: 'Envia mensagem de template do WhatsApp Business (para notificações aprovadas).', categoria: 'whatsapp',
    parametros: {
        to: { tipo: 'string', descricao: 'Número com DDI', obrigatorio: true },
        templateName: { tipo: 'string', descricao: 'Nome do template aprovado', obrigatorio: true },
        language: { tipo: 'string', descricao: 'Código do idioma (ex: pt_BR)', obrigatorio: false, default: 'pt_BR' },
        phoneNumberId: { tipo: 'string', descricao: 'ID do número remetente', obrigatorio: true },
    },
    retorno: 'ID da mensagem.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const to = String(params['to'] || '').trim();
        const templateName = String(params['templateName'] || '').trim();
        const phoneNumberId = String(params['phoneNumberId'] || '').trim();
        if (!to || !templateName || !phoneNumberId) return { sucesso: false, erro: 'to, templateName e phoneNumberId obrigatórios' };
        try {
            const msgId = await sendTemplateMessage(to, templateName, params['language'] || 'pt_BR', phoneNumberId);
            return { sucesso: true, dados: { msgId, to, templateName }, mensagem: `Template "${templateName}" enviado para ${to}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
