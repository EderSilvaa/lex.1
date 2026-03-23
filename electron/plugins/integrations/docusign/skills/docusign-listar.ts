import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listEnvelopes } from '../docusign-client';

export const docusignListar: Skill = {
    nome: 'docusign_listar',
    descricao: 'Lista envelopes (documentos) no DocuSign.',
    categoria: 'docusign',
    parametros: {
        status: { tipo: 'string', descricao: 'Filtrar por status (sent/delivered/completed/declined)', obrigatorio: false },
        dias: { tipo: 'number', descricao: 'Últimos N dias (default 30)', obrigatorio: false, default: 30 },
    },
    retorno: 'Lista de envelopes com status.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const dias = Number(params['dias']) || 30;
            const fromDate = new Date(Date.now() - dias * 86400000).toISOString();
            const status = params['status'] ? String(params['status']) : undefined;
            const envelopes = await listEnvelopes(fromDate, status);

            const formatted = envelopes.map((e: any) =>
                `• ${e['emailSubject'] || '(sem assunto)'} — ${e['status']} (${e['envelopeId']})`
            ).join('\n');

            return {
                sucesso: true, dados: { total: envelopes.length, envelopes },
                mensagem: envelopes.length ? `${envelopes.length} envelope(s):\n${formatted}` : 'Nenhum envelope encontrado.',
            };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
