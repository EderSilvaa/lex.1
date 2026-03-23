import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listMessages } from '../outlook-client';

export const outlookListar: Skill = {
    nome: 'outlook_listar',
    descricao: 'Lista emails da caixa de entrada do Outlook/Office 365.',
    categoria: 'outlook',
    parametros: {
        folder: { tipo: 'string', descricao: 'Pasta (inbox, sentitems, drafts)', obrigatorio: false, default: 'inbox' },
        maxResults: { tipo: 'number', descricao: 'Máximo de emails', obrigatorio: false, default: 10 },
    },
    retorno: 'Lista de emails com remetente, assunto, data e resumo.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const messages = await listMessages({
                folder: params['folder'] || 'inbox',
                maxResults: params['maxResults'] || 10,
            });
            const formatted = messages.map((m, i) =>
                `${i + 1}. **${m.subject}**\n   De: ${m.from}\n   Data: ${m.receivedDateTime}\n   ${m.bodyPreview}`
            ).join('\n\n');
            return {
                sucesso: true,
                dados: { count: messages.length, messages },
                mensagem: messages.length > 0 ? `${messages.length} email(s):\n\n${formatted}` : 'Nenhum email encontrado.',
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message, mensagem: `Erro ao listar: ${err.message}` };
        }
    },
};
