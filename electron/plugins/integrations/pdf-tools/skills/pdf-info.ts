import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { getPdfInfo } from '../pdf-client';
import * as fs from 'fs/promises';

export const pdfInfo: Skill = {
    nome: 'pdf_info',
    descricao: 'Retorna metadados de um arquivo PDF: número de páginas, título, autor e tamanho.',
    categoria: 'pdf',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do arquivo PDF', obrigatorio: true },
    },
    retorno: 'Metadados do PDF (páginas, título, autor, tamanho).',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };

        try {
            const info = await getPdfInfo(arquivo);
            const stat = await fs.stat(arquivo);
            const sizeKb = (stat.size / 1024).toFixed(1);
            const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
            const sizeStr = stat.size > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

            const lines: string[] = [
                `**Arquivo:** ${arquivo}`,
                `**Páginas:** ${info.pages}`,
                `**Tamanho:** ${sizeStr}`,
            ];
            if (info.title) lines.push(`**Título:** ${info.title}`);
            if (info.author) lines.push(`**Autor:** ${info.author}`);

            return {
                sucesso: true,
                dados: { ...info, tamanho: stat.size, tamanhoFormatado: sizeStr },
                mensagem: lines.join('\n'),
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
