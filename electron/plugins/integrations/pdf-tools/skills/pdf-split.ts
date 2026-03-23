import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { splitPdf } from '../pdf-client';
import * as fs from 'fs/promises';
import * as path from 'path';

export const pdfSplit: Skill = {
    nome: 'pdf_split',
    descricao: 'Divide um PDF em partes por intervalos de páginas. Cada intervalo gera um arquivo separado.',
    categoria: 'pdf',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do PDF a dividir', obrigatorio: true },
        paginas: { tipo: 'string', descricao: 'Intervalos de páginas (ex: "1-3,5,7-10"). Cada segmento separado por vírgula gera um PDF.', obrigatorio: true },
        pastaDestino: { tipo: 'string', descricao: 'Pasta onde salvar os PDFs resultantes', obrigatorio: true },
    },
    retorno: 'Lista dos arquivos gerados.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        const paginas = String(params['paginas'] || '').trim();
        const pastaDestino = String(params['pastaDestino'] || '').trim();

        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };
        if (!paginas) return { sucesso: false, erro: 'Parâmetro "paginas" é obrigatório.' };
        if (!pastaDestino) return { sucesso: false, erro: 'Parâmetro "pastaDestino" é obrigatório.' };

        try {
            await fs.access(arquivo);
            await fs.mkdir(pastaDestino, { recursive: true });

            const buffers = await splitPdf(arquivo, paginas);

            if (buffers.length === 0) {
                return { sucesso: false, erro: 'Nenhuma página válida nos intervalos informados.' };
            }

            const baseName = path.basename(arquivo, path.extname(arquivo));
            const savedFiles: string[] = [];

            for (let i = 0; i < buffers.length; i++) {
                const outName = `${baseName}_parte${i + 1}.pdf`;
                const outPath = path.join(pastaDestino, outName);
                await fs.writeFile(outPath, buffers[i]!);
                savedFiles.push(outPath);
            }

            const formatted = savedFiles.map((f, i) => `${i + 1}. ${f}`).join('\n');
            return {
                sucesso: true,
                dados: { arquivos: savedFiles, total: savedFiles.length },
                mensagem: `PDF dividido em ${savedFiles.length} parte(s):\n${formatted}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
