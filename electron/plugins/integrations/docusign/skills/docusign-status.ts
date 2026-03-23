import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { getEnvelopeStatus } from '../docusign-client';

export const docusignStatus: Skill = {
    nome: 'docusign_status',
    descricao: 'Consulta o status de um envelope no DocuSign.',
    categoria: 'docusign',
    parametros: {
        envelopeId: { tipo: 'string', descricao: 'ID do envelope', obrigatorio: true },
    },
    retorno: 'Status detalhado do envelope.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const envelopeId = String(params['envelopeId'] || '').trim();
        if (!envelopeId) return { sucesso: false, erro: 'Parâmetro "envelopeId" é obrigatório.' };

        try {
            const envelope = await getEnvelopeStatus(envelopeId);
            return {
                sucesso: true, dados: envelope,
                mensagem: `Envelope: ${envelope['emailSubject'] || '(sem assunto)'}\nStatus: ${envelope['status']}\nCriado: ${envelope['createdDateTime']}`,
            };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
