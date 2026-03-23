import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listTeams, listChannels } from '../teams-client';

export const teamsListarCanais: Skill = {
    nome: 'teams_listar_canais',
    descricao: 'Lista times e canais do Microsoft Teams.',
    categoria: 'teams',
    parametros: {
        teamId: { tipo: 'string', descricao: 'ID do time (lista canais desse time)', obrigatorio: false },
    },
    retorno: 'Lista de times ou canais.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const teamId = params['teamId'] ? String(params['teamId']) : '';
            if (teamId) {
                const channels = await listChannels(teamId);
                const formatted = channels.map((c: any) => `• ${c['displayName']} (${c['id']})`).join('\n');
                return { sucesso: true, dados: { canais: channels }, mensagem: `${channels.length} canal(is):\n${formatted}` };
            } else {
                const teams = await listTeams();
                const formatted = teams.map((t: any) => `• ${t['displayName']} (${t['id']})`).join('\n');
                return { sucesso: true, dados: { times: teams }, mensagem: `${teams.length} time(s):\n${formatted}` };
            }
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
