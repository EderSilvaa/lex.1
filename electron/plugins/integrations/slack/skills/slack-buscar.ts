import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { searchMessages } from '../slack-client';

export const slackBuscar: Skill = {
    nome: 'slack_buscar',
    descricao: 'Busca mensagens no Slack.',
    categoria: 'slack',
    parametros: { consulta: { tipo: 'string', descricao: 'Termo de busca', obrigatorio: true } },
    retorno: 'Mensagens encontradas.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const consulta = String(params['consulta'] || '').trim();
        if (!consulta) return { sucesso: false, erro: 'Parâmetro "consulta" é obrigatório.' };
        try {
            const matches = await searchMessages(consulta);
            const formatted = matches.map((m: any, i: number) => `${i + 1}. #${m['channel']?.['name'] || '?'}: ${(m['text'] || '').slice(0, 100)}`).join('\n');
            return { sucesso: true, dados: { total: matches.length, mensagens: matches }, mensagem: matches.length ? `${matches.length} resultado(s):\n${formatted}` : 'Nenhuma mensagem encontrada.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
