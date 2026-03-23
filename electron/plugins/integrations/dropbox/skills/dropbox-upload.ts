import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { uploadFile } from '../dropbox-client';
import * as fs from 'fs/promises';
import * as path from 'path';

export const dropboxUpload: Skill = {
    nome: 'dropbox_upload',
    descricao: 'Faz upload de arquivo local para o Dropbox.',
    categoria: 'dropbox',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do arquivo local', obrigatorio: true },
        destino: { tipo: 'string', descricao: 'Caminho no Dropbox', obrigatorio: false },
    },
    retorno: 'Metadados do arquivo enviado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };
        try { await fs.access(arquivo); } catch { return { sucesso: false, erro: `Arquivo não encontrado: ${arquivo}` }; }

        try {
            const destino = params['destino'] ? String(params['destino']) : '/' + path.basename(arquivo);
            const result = await uploadFile(arquivo, destino);
            return { sucesso: true, dados: { path: result['path_display'], size: result['size'] }, mensagem: `Upload: ${result['path_display']}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
