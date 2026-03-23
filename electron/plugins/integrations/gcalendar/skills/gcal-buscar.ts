import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { searchEvents } from '../calendar-client';

export const gcalBuscar: Skill = {
    nome: 'gcal_buscar',
    descricao: 'Busca eventos no Google Calendar por texto. Use para encontrar audiências, reuniões ou prazos.',
    categoria: 'gcalendar',
    parametros: {
        query: { tipo: 'string', descricao: 'Texto de busca (ex: "audiência", "prazo recurso")', obrigatorio: true },
        timeMin: { tipo: 'string', descricao: 'Data mínima (ex: "2026-03-01")', obrigatorio: false },
        timeMax: { tipo: 'string', descricao: 'Data máxima (ex: "2026-04-01")', obrigatorio: false },
    },
    retorno: 'Eventos encontrados com detalhes.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const query = String(params['query'] || '').trim();
        if (!query) return { sucesso: false, erro: 'Query de busca obrigatória' };

        try {
            const events = await searchEvents(query, {
                timeMin: params['timeMin'],
                timeMax: params['timeMax'],
            });

            const formatted = events.map((e, i) => {
                const start = new Date(e.start).toLocaleString('pt-BR');
                return `${i + 1}. **${e.summary}** — ${start}${e.location ? ` | ${e.location}` : ''}`;
            }).join('\n');

            return {
                sucesso: true,
                dados: { count: events.length, events },
                mensagem: events.length > 0
                    ? `${events.length} evento(s) para "${query}":\n\n${formatted}`
                    : `Nenhum evento encontrado para "${query}".`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
