import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { sendEnvelope } from '../docusign-client';
import * as fs from 'fs/promises';

export const docusignEnviarEnvelope: Skill = {
    nome: 'docusign_enviar_envelope',
    descricao: 'Envia documento para assinatura eletrônica via DocuSign.',
    categoria: 'docusign',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do documento a assinar', obrigatorio: true },
        signatarios: { tipo: 'string', descricao: 'Signatários "Nome:email" separados por ;', obrigatorio: true },
        assunto: { tipo: 'string', descricao: 'Assunto do email', obrigatorio: false },
        mensagem: { tipo: 'string', descricao: 'Mensagem no corpo do email', obrigatorio: false },
    },
    retorno: 'ID do envelope criado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        const signatariosStr = String(params['signatarios'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };
        if (!signatariosStr) return { sucesso: false, erro: 'Parâmetro "signatarios" é obrigatório.' };

        try { await fs.access(arquivo); } catch { return { sucesso: false, erro: `Arquivo não encontrado: ${arquivo}` }; }

        const signatarios = signatariosStr.split(';').map(s => {
            const [nome, email] = s.trim().split(':');
            return { nome: (nome || '').trim(), email: (email || '').trim() };
        }).filter(s => s.nome && s.email);

        if (!signatarios.length) return { sucesso: false, erro: 'Formato: "Nome:email" separados por ;' };

        try {
            const result = await sendEnvelope({
                arquivo, signatarios,
                assunto: params['assunto'] ? String(params['assunto']) : undefined,
                mensagem: params['mensagem'] ? String(params['mensagem']) : undefined,
            });
            return {
                sucesso: true, dados: { envelopeId: result['envelopeId'] },
                mensagem: `Envelope enviado! ID: ${result['envelopeId']}`,
            };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
