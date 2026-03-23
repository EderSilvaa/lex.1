import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { createEvent } from '../calendar-client';

export const gcalCriar: Skill = {
    nome: 'gcal_criar',
    descricao: 'Cria evento no Google Calendar. Use para agendar audiências, reuniões, prazos processuais.',
    categoria: 'gcalendar',
    parametros: {
        summary: { tipo: 'string', descricao: 'Título do evento', obrigatorio: true },
        start: { tipo: 'string', descricao: 'Data/hora início (ex: "2026-03-20T14:00:00")', obrigatorio: true },
        end: { tipo: 'string', descricao: 'Data/hora fim (default: 1h após início)', obrigatorio: false },
        description: { tipo: 'string', descricao: 'Descrição/notas do evento', obrigatorio: false },
        location: { tipo: 'string', descricao: 'Local (ex: "TRT8 - 1ª Vara")', obrigatorio: false },
        attendees: { tipo: 'string', descricao: 'Emails dos convidados separados por vírgula', obrigatorio: false },
    },
    retorno: 'Evento criado com ID e link.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const summary = String(params['summary'] || '').trim();
        const start = String(params['start'] || '').trim();
        if (!summary) return { sucesso: false, erro: 'Título (summary) obrigatório' };
        if (!start) return { sucesso: false, erro: 'Data/hora início (start) obrigatória' };

        try {
            const attendees = params['attendees']
                ? String(params['attendees']).split(',').map((e: string) => e.trim()).filter(Boolean)
                : undefined;

            const event = await createEvent({
                summary,
                start,
                end: params['end'],
                description: params['description'],
                location: params['location'],
                attendees,
            });

            const startFormatted = new Date(event.start).toLocaleString('pt-BR');
            return {
                sucesso: true,
                dados: event,
                mensagem: `Evento criado: **${event.summary}** em ${startFormatted}${event.location ? ` (${event.location})` : ''}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message, mensagem: `Erro ao criar evento: ${err.message}` };
        }
    },
};
