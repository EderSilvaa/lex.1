import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { deleteEvent } from '../calendar-client';

export const gcalDeletar: Skill = {
    nome: 'gcal_deletar',
    descricao: 'Remove evento do Google Calendar. Use com cuidado — a exclusão é permanente.',
    categoria: 'gcalendar',
    parametros: {
        eventId: { tipo: 'string', descricao: 'ID do evento a deletar', obrigatorio: true },
    },
    retorno: 'Confirmação de exclusão.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const eventId = String(params['eventId'] || '').trim();
        if (!eventId) return { sucesso: false, erro: 'eventId obrigatório' };

        try {
            await deleteEvent(eventId);
            return {
                sucesso: true,
                dados: { eventId },
                mensagem: `Evento ${eventId} removido com sucesso.`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message, mensagem: `Erro ao deletar evento: ${err.message}` };
        }
    },
};
