import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listMessages } from '../gmail-client';

export const gmailBuscar: Skill = {
    nome: 'gmail_buscar',
    descricao: 'Busca emails no Gmail usando query avançada. Suporta operadores: from:, to:, subject:, after:, before:, has:attachment.',
    categoria: 'gmail',
    parametros: {
        query: { tipo: 'string', descricao: 'Query de busca (ex: "from:juiz subject:despacho after:2026/03/01")', obrigatorio: true },
        maxResults: { tipo: 'number', descricao: 'Número máximo de resultados', obrigatorio: false, default: 10 },
    },
    retorno: 'Lista de emails que correspondem à busca.',
    exemplos: ['{ "skill": "gmail_buscar", "parametros": { "query": "from:tribunal subject:intimação", "maxResults": 5 } }'],

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const query = String(params['query'] || '').trim();
        if (!query) return { sucesso: false, erro: 'Query de busca obrigatória' };

        try {
            const messages = await listMessages({ query, maxResults: params['maxResults'] || 10 });

            const formatted = messages.map((m, i) =>
                `${i + 1}. **${m.subject}**\n   De: ${m.from} | ${m.date}\n   ${m.snippet}`
            ).join('\n\n');

            return {
                sucesso: true,
                dados: { count: messages.length, messages },
                mensagem: messages.length > 0
                    ? `${messages.length} resultado(s) para "${query}":\n\n${formatted}`
                    : `Nenhum email encontrado para "${query}".`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
