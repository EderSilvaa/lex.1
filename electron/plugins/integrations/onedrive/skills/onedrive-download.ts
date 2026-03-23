import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { downloadFile } from '../onedrive-client';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export const onedriveDownload: Skill = {
    nome: 'onedrive_download',
    descricao: 'Baixa arquivo do OneDrive.',
    categoria: 'onedrive',
    parametros: {
        itemId: { tipo: 'string', descricao: 'ID do item no OneDrive', obrigatorio: true },
        saida: { tipo: 'string', descricao: 'Caminho local para salvar', obrigatorio: false },
    },
    retorno: 'Caminho do arquivo baixado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const itemId = String(params['itemId'] || '').trim();
        if (!itemId) return { sucesso: false, erro: 'Parâmetro "itemId" é obrigatório.' };
        try {
            const buffer = await downloadFile(itemId);
            const saida = params['saida'] ? String(params['saida']) : path.join(os.tmpdir(), `onedrive_${itemId}`);
            await fs.mkdir(path.dirname(saida), { recursive: true });
            await fs.writeFile(saida, buffer);
            return { sucesso: true, dados: { arquivo: saida, tamanho: buffer.length }, mensagem: `Baixado: ${saida} (${(buffer.length / 1024).toFixed(1)} KB)` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
