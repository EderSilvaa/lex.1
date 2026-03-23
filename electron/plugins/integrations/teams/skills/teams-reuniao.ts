import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { createOnlineMeeting } from '../teams-client';

export const teamsAgendarReuniao: Skill = {
    nome: 'teams_agendar_reuniao',
    descricao: 'Agenda uma reunião online no Microsoft Teams.',
    categoria: 'teams',
    parametros: {
        assunto: { tipo: 'string', descricao: 'Assunto da reunião', obrigatorio: true },
        inicio: { tipo: 'string', descricao: 'Data/hora de início (ISO 8601)', obrigatorio: true },
        fim: { tipo: 'string', descricao: 'Data/hora de fim (ISO 8601)', obrigatorio: true },
        participantes: { tipo: 'string', descricao: 'Emails separados por ;', obrigatorio: false },
    },
    retorno: 'Link da reunião criada.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const assunto = String(params['assunto'] || '').trim();
        const inicio = String(params['inicio'] || '').trim();
        const fim = String(params['fim'] || '').trim();
        if (!assunto || !inicio || !fim) return { sucesso: false, erro: 'Parâmetros "assunto", "inicio" e "fim" são obrigatórios.' };

        try {
            const attendees = params['participantes']
                ? String(params['participantes']).split(';').map(e => e.trim()).filter(Boolean)
                : undefined;
            const meeting = await createOnlineMeeting(assunto, inicio, fim, attendees);
            return {
                sucesso: true, dados: { id: meeting['id'], joinUrl: meeting['joinWebUrl'] },
                mensagem: `Reunião "${assunto}" criada.\nLink: ${meeting['joinWebUrl']}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
