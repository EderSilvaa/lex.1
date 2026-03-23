import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { searchFiles } from '../onedrive-client';

export const onedriveBuscar: Skill = {
    nome: 'onedrive_buscar',
    descricao: 'Busca arquivos no OneDrive.',
    categoria: 'onedrive',
    parametros: { consulta: { tipo: 'string', descricao: 'Termo de busca', obrigatorio: true } },
    retorno: 'Arquivos encontrados.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const consulta = String(params['consulta'] || '').trim();
        if (!consulta) return { sucesso: false, erro: 'Parâmetro "consulta" é obrigatório.' };
        try {
            const results = await searchFiles(consulta);
            const formatted = results.map((r: any) => `• ${r['name']}`).join('\n');
            return { sucesso: true, dados: { total: results.length, arquivos: results }, mensagem: results.length ? `${results.length} resultado(s):\n${formatted}` : 'Nenhum arquivo encontrado.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
