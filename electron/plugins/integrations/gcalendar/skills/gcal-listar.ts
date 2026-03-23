import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listEvents } from '../calendar-client';

export const gcalListar: Skill = {
    nome: 'gcal_listar',
    descricao: 'Lista eventos futuros do Google Calendar. Use para ver a agenda dos próximos dias.',
    categoria: 'gcalendar',
    parametros: {
        daysAhead: { tipo: 'number', descricao: 'Dias à frente para buscar (default: 7)', obrigatorio: false, default: 7 },
        maxResults: { tipo: 'number', descricao: 'Máximo de eventos', obrigatorio: false, default: 20 },
    },
    retorno: 'Lista de eventos com título, data/hora e local.',
    exemplos: ['{ "skill": "gcal_listar", "parametros": { "daysAhead": 3 } }'],

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const events = await listEvents({
                daysAhead: params['daysAhead'] || 7,
                maxResults: params['maxResults'] || 20,
            });

            const formatted = events.map((e, i) => {
                const start = new Date(e.start).toLocaleString('pt-BR');
                const end = new Date(e.end).toLocaleString('pt-BR');
                let line = `${i + 1}. **${e.summary}** — ${start} a ${end}`;
                if (e.location) line += `\n   📍 ${e.location}`;
                return line;
            }).join('\n\n');

            return {
                sucesso: true,
                dados: { count: events.length, events },
                mensagem: events.length > 0
                    ? `${events.length} evento(s) nos próximos ${params['daysAhead'] || 7} dias:\n\n${formatted}`
                    : 'Nenhum evento encontrado no período.',
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message, mensagem: `Erro ao listar eventos: ${err.message}` };
        }
    },
};
