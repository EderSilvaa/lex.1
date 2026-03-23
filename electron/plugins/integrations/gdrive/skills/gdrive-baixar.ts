import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { downloadFile } from '../gdrive-client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

export const gdriveBaixar: Skill = {
    nome: 'gdrive_baixar',
    descricao: 'Baixa arquivo do Google Drive e salva no disco local.',
    categoria: 'gdrive',
    parametros: {
        fileId: { tipo: 'string', descricao: 'ID do arquivo no Drive', obrigatorio: true },
        fileName: { tipo: 'string', descricao: 'Nome para salvar (ex: "peticao.pdf")', obrigatorio: true },
        destDir: { tipo: 'string', descricao: 'Pasta destino (default: Downloads)', obrigatorio: false },
    },
    retorno: 'Caminho do arquivo salvo.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const fileId = String(params['fileId'] || '').trim();
        const fileName = String(params['fileName'] || '').trim();
        if (!fileId) return { sucesso: false, erro: 'fileId obrigatório' };
        if (!fileName) return { sucesso: false, erro: 'fileName obrigatório' };
        try {
            const buffer = await downloadFile(fileId);
            const destDir = params['destDir'] || app.getPath('downloads');
            const filePath = path.join(destDir, fileName);
            await fs.writeFile(filePath, buffer);
            return { sucesso: true, dados: { filePath, size: buffer.length }, mensagem: `Arquivo salvo: ${filePath} (${buffer.length} bytes)` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
