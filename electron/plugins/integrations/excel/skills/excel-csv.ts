import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { toCSV } from '../excel-client';
import * as fs from 'fs/promises';

export const excelParaCsv: Skill = {
    nome: 'excel_para_csv',
    descricao: 'Converte uma planilha Excel (.xlsx) para CSV. Opcionalmente salva em arquivo.',
    categoria: 'excel',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do arquivo .xlsx de origem', obrigatorio: true },
        planilha: { tipo: 'string', descricao: 'Nome da planilha (vazio = primeira)', obrigatorio: false },
        saida: { tipo: 'string', descricao: 'Caminho para salvar o CSV (vazio = retorna como texto)', obrigatorio: false },
    },
    retorno: 'Conteúdo CSV como texto ou caminho do arquivo salvo.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };

        try {
            const csv = await toCSV(arquivo, params['planilha']);
            const lineCount = csv.split('\n').length - 1; // descontar header

            if (params['saida']) {
                const saida = String(params['saida']).trim();
                await fs.writeFile(saida, csv, 'utf-8');
                return {
                    sucesso: true,
                    dados: { filePath: saida, lines: lineCount },
                    mensagem: `CSV salvo em: ${saida} (${lineCount} linhas de dados).`,
                };
            }

            return {
                sucesso: true,
                dados: { csv, lines: lineCount },
                mensagem: `CSV gerado (${lineCount} linhas de dados):\n\n${csv}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
