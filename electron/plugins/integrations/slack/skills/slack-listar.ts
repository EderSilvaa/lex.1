import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listChannels } from '../slack-client';

export const slackListarCanais: Skill = {
    nome: 'slack_listar_canais',
    descricao: 'Lista canais do Slack.',
    categoria: 'slack',
    parametros: { limite: { tipo: 'number', descricao: 'Máximo de canais', obrigatorio: false, default: 100 } },
    retorno: 'Lista de canais.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const limite = Number(params['limite']) || 100;
            const channels = await listChannels(limite);
            const formatted = channels.map((c: any) => `• #${c['name']} (${c['num_members'] || 0} membros)`).join('\n');
            return { sucesso: true, dados: { total: channels.length, canais: channels }, mensagem: `${channels.length} canal(is):\n${formatted}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
