import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { getMessage } from '../gmail-client';

export const gmailLer: Skill = {
    nome: 'gmail_ler',
    descricao: 'Lê o conteúdo completo de um email pelo ID. Use após gmail_listar para ver o corpo de uma mensagem.',
    categoria: 'gmail',
    parametros: {
        messageId: { tipo: 'string', descricao: 'ID da mensagem (obtido de gmail_listar)', obrigatorio: true },
    },
    retorno: 'Conteúdo completo do email: remetente, assunto, data e corpo.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const id = String(params['messageId'] || '');
        if (!id) return { sucesso: false, erro: 'messageId obrigatório' };

        try {
            const msg = await getMessage(id, 'full');
            if (!msg) return { sucesso: false, erro: 'Mensagem não encontrada' };

            return {
                sucesso: true,
                dados: msg,
                mensagem: `**${msg.subject}**\nDe: ${msg.from}\nPara: ${msg.to}\nData: ${msg.date}\n\n${msg.body || msg.snippet}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
