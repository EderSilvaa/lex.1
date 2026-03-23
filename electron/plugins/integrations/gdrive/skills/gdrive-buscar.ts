import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { searchFiles } from '../gdrive-client';

export const gdriveBuscar: Skill = {
    nome: 'gdrive_buscar',
    descricao: 'Busca arquivos no Google Drive por nome.',
    categoria: 'gdrive',
    parametros: {
        query: { tipo: 'string', descricao: 'Texto de busca', obrigatorio: true },
    },
    retorno: 'Arquivos encontrados.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const query = String(params['query'] || '').trim();
        if (!query) return { sucesso: false, erro: 'Query obrigatória' };
        try {
            const files = await searchFiles(query);
            const formatted = files.map((f, i) => `${i + 1}. **${f.name}** (${f.mimeType}) — ID: ${f.id}`).join('\n');
            return { sucesso: true, dados: { count: files.length, files }, mensagem: files.length > 0 ? `${files.length} resultado(s):\n\n${formatted}` : `Nenhum arquivo para "${query}".` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
