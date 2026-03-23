import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { searchActors } from '../apify-client';

export const apifyBuscar: Skill = {
    nome: 'apify_buscar', descricao: 'Busca actors públicos no Apify Store.', categoria: 'apify',
    parametros: { query: { tipo: 'string', descricao: 'Texto de busca (ex: "web scraper", "google search")', obrigatorio: true } },
    retorno: 'Actors encontrados no store.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const query = String(params['query'] || '').trim();
        if (!query) return { sucesso: false, erro: 'Query obrigatória' };
        try {
            const actors = await searchActors(query);
            const formatted = actors.map((a, i) => `${i + 1}. **${a.name}** (${a.username || a.id})\n   ${a.description || ''}`).join('\n\n');
            return { sucesso: true, dados: actors, mensagem: actors.length > 0 ? `${actors.length} actor(s):\n\n${formatted}` : `Nenhum actor para "${query}".` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
