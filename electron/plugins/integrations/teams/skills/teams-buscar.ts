import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { searchMessages } from '../teams-client';

export const teamsBuscar: Skill = {
    nome: 'teams_buscar',
    descricao: 'Busca mensagens no Microsoft Teams.',
    categoria: 'teams',
    parametros: {
        consulta: { tipo: 'string', descricao: 'Termo de busca', obrigatorio: true },
    },
    retorno: 'Mensagens encontradas.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const consulta = String(params['consulta'] || '').trim();
        if (!consulta) return { sucesso: false, erro: 'Parâmetro "consulta" é obrigatório.' };

        try {
            const hits = await searchMessages(consulta);
            const formatted = hits.map((h: any, i: number) => {
                const summary = h['summary'] || h['resource']?.['bodyPreview'] || '(sem preview)';
                return `${i + 1}. ${summary}`;
            }).join('\n');
            return {
                sucesso: true, dados: { total: hits.length, resultados: hits },
                mensagem: hits.length ? `${hits.length} resultado(s):\n${formatted}` : 'Nenhuma mensagem encontrada.',
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
