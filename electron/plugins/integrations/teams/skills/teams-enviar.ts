import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { sendChannelMessage, sendChat } from '../teams-client';

export const teamsEnviar: Skill = {
    nome: 'teams_enviar',
    descricao: 'Envia mensagem em canal ou chat do Microsoft Teams.',
    categoria: 'teams',
    parametros: {
        mensagem: { tipo: 'string', descricao: 'Conteúdo da mensagem', obrigatorio: true },
        teamId: { tipo: 'string', descricao: 'ID do time (para enviar em canal)', obrigatorio: false },
        canalId: { tipo: 'string', descricao: 'ID do canal', obrigatorio: false },
        chatId: { tipo: 'string', descricao: 'ID do chat (para mensagem direta)', obrigatorio: false },
    },
    retorno: 'Confirmação de envio.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const mensagem = String(params['mensagem'] || '').trim();
        if (!mensagem) return { sucesso: false, erro: 'Parâmetro "mensagem" é obrigatório.' };

        const teamId = params['teamId'] ? String(params['teamId']) : '';
        const canalId = params['canalId'] ? String(params['canalId']) : '';
        const chatId = params['chatId'] ? String(params['chatId']) : '';

        if (!chatId && (!teamId || !canalId)) {
            return { sucesso: false, erro: 'Informe "chatId" para DM ou "teamId" + "canalId" para canal.' };
        }

        try {
            if (chatId) {
                await sendChat(chatId, mensagem);
                return { sucesso: true, mensagem: `Mensagem enviada no chat.` };
            } else {
                await sendChannelMessage(teamId, canalId, mensagem);
                return { sucesso: true, mensagem: `Mensagem enviada no canal.` };
            }
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
