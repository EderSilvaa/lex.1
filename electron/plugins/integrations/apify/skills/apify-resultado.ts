import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { getRunStatus, getDatasetItems } from '../apify-client';

export const apifyResultado: Skill = {
    nome: 'apify_resultado', descricao: 'Busca resultados de uma execução Apify pelo run ID.', categoria: 'apify',
    parametros: {
        runId: { tipo: 'string', descricao: 'ID da execução (obtido de apify_executar)', obrigatorio: true },
        limit: { tipo: 'number', descricao: 'Máximo de itens', obrigatorio: false, default: 50 },
    },
    retorno: 'Status da execução e dados coletados.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const runId = String(params['runId'] || '').trim();
        if (!runId) return { sucesso: false, erro: 'runId obrigatório' };
        try {
            const run = await getRunStatus(runId);
            if (run.status !== 'SUCCEEDED') {
                return { sucesso: true, dados: { status: run.status }, mensagem: `Execução ${runId}: status **${run.status}**. Aguarde e tente novamente.` };
            }
            const items = await getDatasetItems(run.defaultDatasetId, params['limit'] || 50);
            return { sucesso: true, dados: { status: run.status, itemCount: items.length, items }, mensagem: `Execução concluída! ${items.length} item(ns) coletado(s).\n\n${JSON.stringify(items.slice(0, 3), null, 2)}${items.length > 3 ? '\n...' : ''}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
