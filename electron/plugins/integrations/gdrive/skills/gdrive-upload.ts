import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { uploadFile } from '../gdrive-client';
import * as fs from 'fs/promises';
import * as path from 'path';
const MIME_MAP: Record<string, string> = {
    '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json', '.xml': 'application/xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.zip': 'application/zip', '.html': 'text/html', '.odt': 'application/vnd.oasis.opendocument.text',
};

export const gdriveUpload: Skill = {
    nome: 'gdrive_upload',
    descricao: 'Faz upload de arquivo local para o Google Drive.',
    categoria: 'gdrive',
    parametros: {
        filePath: { tipo: 'string', descricao: 'Caminho do arquivo local', obrigatorio: true },
        folderId: { tipo: 'string', descricao: 'ID da pasta destino no Drive (vazio = raiz)', obrigatorio: false },
    },
    retorno: 'Metadados do arquivo no Drive.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const filePath = String(params['filePath'] || '').trim();
        if (!filePath) return { sucesso: false, erro: 'filePath obrigatório' };
        try {
            const content = await fs.readFile(filePath);
            const name = path.basename(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mimeType = MIME_MAP[ext] || 'application/octet-stream';
            const file = await uploadFile(name, content, mimeType, params['folderId']);
            return { sucesso: true, dados: file, mensagem: `Upload concluído: **${file.name}** (ID: ${file.id})` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
