import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { readSheet } from '../excel-client';

export const excelLer: Skill = {
    nome: 'excel_ler',
    descricao: 'Lê dados de uma planilha Excel (.xlsx) local. Retorna cabeçalhos e linhas formatados.',
    categoria: 'excel',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do arquivo .xlsx', obrigatorio: true },
        planilha: { tipo: 'string', descricao: 'Nome da planilha (vazio = primeira)', obrigatorio: false },
        maxLinhas: { tipo: 'number', descricao: 'Máximo de linhas a ler', obrigatorio: false, default: 100 },
    },
    retorno: 'Cabeçalhos e dados da planilha em formato texto.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };

        try {
            const maxLinhas = params['maxLinhas'] ?? 100;
            const { headers, rows } = await readSheet(arquivo, params['planilha'], maxLinhas);

            if (rows.length === 0) {
                return { sucesso: true, dados: { headers, rows: [] }, mensagem: `Planilha lida com sucesso, mas sem dados. Colunas: ${headers.join(', ')}` };
            }

            // Formatar como tabela texto
            const headerLine = headers.join(' | ');
            const separator = headers.map(() => '---').join(' | ');
            const dataLines = rows.map((row) => row.map((v: any) => String(v ?? '')).join(' | '));

            const table = [headerLine, separator, ...dataLines].join('\n');

            return {
                sucesso: true,
                dados: { headers, rows, totalRows: rows.length },
                mensagem: `${rows.length} linha(s) lida(s) da planilha:\n\n${table}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
