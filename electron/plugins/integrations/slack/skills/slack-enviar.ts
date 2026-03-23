import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { sendMessage } from '../slack-client';

export const slackEnviar: Skill = {
    nome: 'slack_enviar',
    descricao: 'Envia mensagem em canal ou DM do Slack.',
    categoria: 'slack',
    parametros: {
        canal: { tipo: 'string', descricao: 'Nome do canal ou ID', obrigatorio: true },
        mensagem: { tipo: 'string', descricao: 'Conteúdo da mensagem', obrigatorio: true },
    },
    retorno: 'Confirmação de envio.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const canal = String(params['canal'] || '').trim();
        const mensagem = String(params['mensagem'] || '').trim();
        if (!canal) return { sucesso: false, erro: 'Parâmetro "canal" é obrigatório.' };
        if (!mensagem) return { sucesso: false, erro: 'Parâmetro "mensagem" é obrigatório.' };
        try {
            await sendMessage(canal, mensagem);
            return { sucesso: true, mensagem: `Mensagem enviada no canal ${canal}.` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
