import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { updateEvent } from '../calendar-client';

export const gcalAtualizar: Skill = {
    nome: 'gcal_atualizar',
    descricao: 'Atualiza evento existente no Google Calendar. Use para remarcar audiências ou alterar detalhes.',
    categoria: 'gcalendar',
    parametros: {
        eventId: { tipo: 'string', descricao: 'ID do evento (obtido de gcal_listar ou gcal_buscar)', obrigatorio: true },
        summary: { tipo: 'string', descricao: 'Novo título', obrigatorio: false },
        start: { tipo: 'string', descricao: 'Nova data/hora início', obrigatorio: false },
        end: { tipo: 'string', descricao: 'Nova data/hora fim', obrigatorio: false },
        description: { tipo: 'string', descricao: 'Nova descrição', obrigatorio: false },
        location: { tipo: 'string', descricao: 'Novo local', obrigatorio: false },
    },
    retorno: 'Evento atualizado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const eventId = String(params['eventId'] || '').trim();
        if (!eventId) return { sucesso: false, erro: 'eventId obrigatório' };

        try {
            const event = await updateEvent(eventId, {
                summary: params['summary'],
                start: params['start'],
                end: params['end'],
                description: params['description'],
                location: params['location'],
            });

            return {
                sucesso: true,
                dados: event,
                mensagem: `Evento atualizado: **${event.summary}** — ${new Date(event.start).toLocaleString('pt-BR')}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
