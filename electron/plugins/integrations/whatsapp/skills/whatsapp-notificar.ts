import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { sendTextMessage } from '../whatsapp-client';

export const whatsappNotificar: Skill = {
    nome: 'whatsapp_notificar_cliente', descricao: 'Notifica cliente sobre andamento processual via WhatsApp.', categoria: 'whatsapp',
    parametros: {
        numero: { tipo: 'string', descricao: 'Número do cliente com DDI', obrigatorio: true },
        processo: { tipo: 'string', descricao: 'Número do processo', obrigatorio: true },
        mensagem: { tipo: 'string', descricao: 'Texto da notificação', obrigatorio: true },
        phoneNumberId: { tipo: 'string', descricao: 'ID do número remetente', obrigatorio: true },
    },
    retorno: 'Confirmação de envio.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const numero = String(params['numero'] || '').trim();
        const processo = String(params['processo'] || '').trim();
        const mensagem = String(params['mensagem'] || '').trim();
        const phoneNumberId = String(params['phoneNumberId'] || '').trim();
        if (!numero || !processo || !mensagem || !phoneNumberId) return { sucesso: false, erro: 'Todos os campos são obrigatórios' };
        const texto = `📋 *Atualização Processual*\n\nProcesso: ${processo}\n\n${mensagem}\n\n_Enviado via LEX_`;
        try {
            const msgId = await sendTextMessage(numero, texto, phoneNumberId);
            return { sucesso: true, dados: { msgId, numero, processo }, mensagem: `Notificação enviada para ${numero} sobre processo ${processo}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
