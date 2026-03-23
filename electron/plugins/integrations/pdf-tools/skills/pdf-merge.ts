import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { mergePdfs } from '../pdf-client';
import * as fs from 'fs/promises';
import * as path from 'path';

export const pdfMerge: Skill = {
    nome: 'pdf_merge',
    descricao: 'Junta (merge) vários arquivos PDF em um único arquivo.',
    categoria: 'pdf',
    parametros: {
        arquivos: { tipo: 'string', descricao: 'Caminhos dos PDFs separados por ";" (ex: "c:/doc1.pdf;c:/doc2.pdf")', obrigatorio: true },
        saida: { tipo: 'string', descricao: 'Caminho completo do arquivo de saída (ex: "c:/resultado.pdf")', obrigatorio: true },
    },
    retorno: 'Caminho do PDF unificado e número de páginas.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivosStr = String(params['arquivos'] || '').trim();
        const saida = String(params['saida'] || '').trim();

        if (!arquivosStr) return { sucesso: false, erro: 'Parâmetro "arquivos" é obrigatório.' };
        if (!saida) return { sucesso: false, erro: 'Parâmetro "saida" é obrigatório.' };

        const filePaths = arquivosStr.split(';').map(s => s.trim()).filter(Boolean);
        if (filePaths.length < 2) return { sucesso: false, erro: 'É necessário pelo menos 2 arquivos para juntar.' };

        try {
            // Validate all files exist
            for (const fp of filePaths) {
                await fs.access(fp);
            }

            const buffer = await mergePdfs(filePaths);

            // Ensure output directory exists
            const outDir = path.dirname(saida);
            await fs.mkdir(outDir, { recursive: true });
            await fs.writeFile(saida, buffer);

            const { PDFDocument } = await import('pdf-lib');
            const doc = await PDFDocument.load(buffer);
            const totalPages = doc.getPageCount();

            return {
                sucesso: true,
                dados: { caminho: saida, paginas: totalPages, arquivosJuntados: filePaths.length },
                mensagem: `PDF unificado salvo em ${saida} — ${totalPages} página(s) de ${filePaths.length} arquivo(s).`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
