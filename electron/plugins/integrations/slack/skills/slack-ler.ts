import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { readChannel } from '../slack-client';

export const slackLerCanal: Skill = {
    nome: 'slack_ler_canal',
    descricao: 'Lê mensagens recentes de um canal do Slack.',
    categoria: 'slack',
    parametros: {
        canal: { tipo: 'string', descricao: 'ID do canal', obrigatorio: true },
        limite: { tipo: 'number', descricao: 'Número de mensagens', obrigatorio: false, default: 20 },
    },
    retorno: 'Mensagens recentes.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const canal = String(params['canal'] || '').trim();
        if (!canal) return { sucesso: false, erro: 'Parâmetro "canal" é obrigatório.' };
        try {
            const limite = Number(params['limite']) || 20;
            const messages = await readChannel(canal, limite);
            const formatted = messages.map((m: any) => {
                const time = m['ts'] ? new Date(Number(m['ts']) * 1000).toLocaleString('pt-BR') : '';
                return `[${time}] ${m['user'] || 'bot'}: ${(m['text'] || '').slice(0, 150)}`;
            }).join('\n');
            return { sucesso: true, dados: { total: messages.length, mensagens: messages }, mensagem: messages.length ? `${messages.length} mensagem(ns):\n${formatted}` : 'Canal vazio.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
