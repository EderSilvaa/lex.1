import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { runActor } from '../apify-client';

export const apifyExecutar: Skill = {
    nome: 'apify_executar', descricao: 'Executa um actor (scraper) no Apify com input JSON.', categoria: 'apify',
    parametros: {
        actorId: { tipo: 'string', descricao: 'ID ou nome do actor (ex: "apify/web-scraper")', obrigatorio: true },
        input: { tipo: 'string', descricao: 'JSON de input para o actor', obrigatorio: true },
    },
    retorno: 'Informações da execução (run ID, status).',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const actorId = String(params['actorId'] || '').trim();
        const inputStr = String(params['input'] || '{}');
        if (!actorId) return { sucesso: false, erro: 'actorId obrigatório' };
        try {
            const input = JSON.parse(inputStr);
            const run = await runActor(actorId, input);
            return { sucesso: true, dados: run, mensagem: `Actor iniciado! Run ID: ${run.id} | Status: ${run.status}\nUse apify_resultado com runId "${run.id}" para ver os dados.` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
