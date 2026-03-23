import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { downloadDocument } from '../docusign-client';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export const docusignBaixarAssinado: Skill = {
    nome: 'docusign_baixar_assinado',
    descricao: 'Baixa documento assinado do DocuSign.',
    categoria: 'docusign',
    parametros: {
        envelopeId: { tipo: 'string', descricao: 'ID do envelope', obrigatorio: true },
        saida: { tipo: 'string', descricao: 'Caminho para salvar', obrigatorio: false },
        documentId: { tipo: 'string', descricao: 'ID do documento (default: combined)', obrigatorio: false },
    },
    retorno: 'Caminho do arquivo baixado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const envelopeId = String(params['envelopeId'] || '').trim();
        if (!envelopeId) return { sucesso: false, erro: 'Parâmetro "envelopeId" é obrigatório.' };

        try {
            const documentId = params['documentId'] ? String(params['documentId']) : 'combined';
            const buffer = await downloadDocument(envelopeId, documentId);
            const saida = params['saida'] ? String(params['saida']) : path.join(os.tmpdir(), `docusign_${envelopeId}.pdf`);
            await fs.mkdir(path.dirname(saida), { recursive: true });
            await fs.writeFile(saida, buffer);
            return {
                sucesso: true, dados: { arquivo: saida, tamanho: buffer.length },
                mensagem: `Documento baixado: ${saida} (${(buffer.length / 1024).toFixed(1)} KB)`,
            };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
