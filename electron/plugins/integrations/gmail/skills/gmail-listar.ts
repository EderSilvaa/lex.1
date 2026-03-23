import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listMessages } from '../gmail-client';

export const gmailListar: Skill = {
    nome: 'gmail_listar',
    descricao: 'Lista emails da caixa de entrada do Gmail. Use para ver emails recentes, filtrar por label ou buscar por query.',
    categoria: 'gmail',
    parametros: {
        label: { tipo: 'string', descricao: 'Label a filtrar (ex: INBOX, SENT, STARRED)', obrigatorio: false, default: 'INBOX' },
        query: { tipo: 'string', descricao: 'Query de busca Gmail (ex: "from:joao subject:processo")', obrigatorio: false },
        maxResults: { tipo: 'number', descricao: 'Número máximo de emails', obrigatorio: false, default: 10 },
    },
    retorno: 'Lista de emails com remetente, assunto, data e resumo.',
    exemplos: ['{ "skill": "gmail_listar", "parametros": { "label": "INBOX", "maxResults": 5 } }'],

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const messages = await listMessages({
                label: params['label'] || 'INBOX',
                query: params['query'],
                maxResults: params['maxResults'] || 10,
            });

            const formatted = messages.map((m, i) =>
                `${i + 1}. **${m.subject}**\n   De: ${m.from}\n   Data: ${m.date}\n   ${m.snippet}`
            ).join('\n\n');

            return {
                sucesso: true,
                dados: { count: messages.length, messages },
                mensagem: messages.length > 0
                    ? `${messages.length} email(s) encontrado(s):\n\n${formatted}`
                    : 'Nenhum email encontrado.',
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message, mensagem: `Erro ao listar emails: ${err.message}` };
        }
    },
};
