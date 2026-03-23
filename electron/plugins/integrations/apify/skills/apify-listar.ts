import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listActors } from '../apify-client';

export const apifyListar: Skill = {
    nome: 'apify_listar', descricao: 'Lista seus actors (scrapers) no Apify.', categoria: 'apify',
    parametros: { limit: { tipo: 'number', descricao: 'Máximo', obrigatorio: false, default: 20 } },
    retorno: 'Lista de actors.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const actors = await listActors(params['limit'] || 20);
            const formatted = actors.map((a, i) => `${i + 1}. **${a.name}** — ${a.description || 'sem descrição'}`).join('\n');
            return { sucesso: true, dados: actors, mensagem: actors.length > 0 ? `${actors.length} actor(s):\n\n${formatted}` : 'Nenhum actor encontrado.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
