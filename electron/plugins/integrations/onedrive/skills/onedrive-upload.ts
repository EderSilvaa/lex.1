import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { uploadFile } from '../onedrive-client';
import * as fs from 'fs/promises';
import * as path from 'path';

export const onedriveUpload: Skill = {
    nome: 'onedrive_upload',
    descricao: 'Faz upload de arquivo local para o OneDrive.',
    categoria: 'onedrive',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do arquivo local', obrigatorio: true },
        destino: { tipo: 'string', descricao: 'Caminho no OneDrive', obrigatorio: false },
    },
    retorno: 'Metadados do arquivo enviado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };
        try { await fs.access(arquivo); } catch { return { sucesso: false, erro: `Arquivo não encontrado: ${arquivo}` }; }

        try {
            const destino = params['destino'] ? String(params['destino']) : path.basename(arquivo);
            const result = await uploadFile(arquivo, destino);
            return { sucesso: true, dados: { id: result['id'], webUrl: result['webUrl'] }, mensagem: `Upload: ${result['name']}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
