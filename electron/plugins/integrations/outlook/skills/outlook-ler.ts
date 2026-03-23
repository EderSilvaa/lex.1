import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { getMessage } from '../outlook-client';

export const outlookLer: Skill = {
    nome: 'outlook_ler',
    descricao: 'Lê o conteúdo completo de um email do Outlook pelo ID.',
    categoria: 'outlook',
    parametros: {
        messageId: { tipo: 'string', descricao: 'ID da mensagem', obrigatorio: true },
    },
    retorno: 'Conteúdo completo do email.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const id = String(params['messageId'] || '');
        if (!id) return { sucesso: false, erro: 'messageId obrigatório' };
        try {
            const msg = await getMessage(id);
            if (!msg) return { sucesso: false, erro: 'Mensagem não encontrada' };
            const bodyClean = msg.body ? msg.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : msg.bodyPreview;
            return {
                sucesso: true,
                dados: msg,
                mensagem: `**${msg.subject}**\nDe: ${msg.from}\nData: ${msg.receivedDateTime}\n\n${bodyClean}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
