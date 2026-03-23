import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { searchMessages } from '../outlook-client';

export const outlookBuscar: Skill = {
    nome: 'outlook_buscar',
    descricao: 'Busca emails no Outlook por texto.',
    categoria: 'outlook',
    parametros: {
        query: { tipo: 'string', descricao: 'Texto de busca', obrigatorio: true },
        maxResults: { tipo: 'number', descricao: 'Máximo de resultados', obrigatorio: false, default: 10 },
    },
    retorno: 'Emails encontrados.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const query = String(params['query'] || '').trim();
        if (!query) return { sucesso: false, erro: 'Query obrigatória' };
        try {
            const messages = await searchMessages(query, params['maxResults'] || 10);
            const formatted = messages.map((m, i) =>
                `${i + 1}. **${m.subject}**\n   De: ${m.from} | ${m.receivedDateTime}\n   ${m.bodyPreview}`
            ).join('\n\n');
            return {
                sucesso: true,
                dados: { count: messages.length, messages },
                mensagem: messages.length > 0 ? `${messages.length} resultado(s):\n\n${formatted}` : `Nenhum email para "${query}".`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
