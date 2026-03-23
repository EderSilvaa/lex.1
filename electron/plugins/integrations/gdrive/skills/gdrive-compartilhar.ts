import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { shareFile } from '../gdrive-client';

export const gdriveCompartilhar: Skill = {
    nome: 'gdrive_compartilhar',
    descricao: 'Compartilha arquivo do Google Drive com um email.',
    categoria: 'gdrive',
    parametros: {
        fileId: { tipo: 'string', descricao: 'ID do arquivo', obrigatorio: true },
        email: { tipo: 'string', descricao: 'Email do destinatário', obrigatorio: true },
        role: { tipo: 'string', descricao: 'Permissão: reader ou writer', obrigatorio: false, default: 'reader', enum: ['reader', 'writer'] },
    },
    retorno: 'Confirmação de compartilhamento.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const fileId = String(params['fileId'] || '').trim();
        const email = String(params['email'] || '').trim();
        if (!fileId) return { sucesso: false, erro: 'fileId obrigatório' };
        if (!email) return { sucesso: false, erro: 'email obrigatório' };
        try {
            const role = params['role'] === 'writer' ? 'writer' : 'reader';
            await shareFile(fileId, email, role);
            return { sucesso: true, dados: { fileId, email, role }, mensagem: `Arquivo compartilhado com ${email} (${role}).` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
