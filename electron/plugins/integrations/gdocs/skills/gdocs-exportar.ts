import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { exportDocument } from '../gdocs-client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

export const gdocsExportar: Skill = {
    nome: 'gdocs_exportar', descricao: 'Exporta Google Doc como PDF ou DOCX.', categoria: 'gdocs',
    parametros: {
        docId: { tipo: 'string', descricao: 'ID do documento', obrigatorio: true },
        format: { tipo: 'string', descricao: 'Formato: pdf ou docx', obrigatorio: false, default: 'pdf', enum: ['pdf', 'docx'] },
        fileName: { tipo: 'string', descricao: 'Nome do arquivo (ex: peticao.pdf)', obrigatorio: true },
    },
    retorno: 'Caminho do arquivo exportado.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const docId = String(params['docId'] || '').trim();
        const fileName = String(params['fileName'] || '').trim();
        if (!docId) return { sucesso: false, erro: 'docId obrigatório' };
        if (!fileName) return { sucesso: false, erro: 'fileName obrigatório' };
        const mimeMap: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
        const format = params['format'] === 'docx' ? 'docx' : 'pdf';
        try {
            const buffer = await exportDocument(docId, mimeMap[format]);
            const filePath = path.join(app.getPath('downloads'), fileName);
            await fs.writeFile(filePath, buffer);
            return { sucesso: true, dados: { filePath, size: buffer.length }, mensagem: `Exportado: ${filePath} (${buffer.length} bytes)` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
