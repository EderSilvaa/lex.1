import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { createWorkbook } from '../excel-client';

export const excelCriar: Skill = {
    nome: 'excel_criar',
    descricao: 'Cria um novo arquivo Excel (.xlsx) com colunas e dados especificados.',
    categoria: 'excel',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do arquivo .xlsx a criar', obrigatorio: true },
        planilha: { tipo: 'string', descricao: 'Nome da planilha', obrigatorio: false, default: 'Planilha1' },
        colunas: { tipo: 'string', descricao: 'Cabeçalhos separados por ";"  (ex: "Nome;CPF;Valor")', obrigatorio: true },
        dados: { tipo: 'string', descricao: 'Linhas separadas por "\\n", colunas por ";" (ex: "João;123;100\\nMaria;456;200")', obrigatorio: true },
    },
    retorno: 'Caminho do arquivo criado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };

        const colunasRaw = String(params['colunas'] || '').trim();
        if (!colunasRaw) return { sucesso: false, erro: 'Parâmetro "colunas" é obrigatório.' };

        const dadosRaw = String(params['dados'] || '').trim();
        if (!dadosRaw) return { sucesso: false, erro: 'Parâmetro "dados" é obrigatório.' };

        const sheetName = String(params['planilha'] || 'Planilha1').trim();

        try {
            const headers = colunasRaw.split(';').map((h) => h.trim());
            const rows = dadosRaw.split('\n').map((line) =>
                line.split(';').map((cell) => {
                    const trimmed = cell.trim();
                    // Tentar converter números
                    const num = Number(trimmed);
                    return !isNaN(num) && trimmed !== '' ? num : trimmed;
                })
            );

            const filePath = await createWorkbook(arquivo, sheetName, headers, rows);
            return {
                sucesso: true,
                dados: { filePath, sheetName, columns: headers.length, rows: rows.length },
                mensagem: `Arquivo criado: ${filePath} — planilha "${sheetName}" com ${headers.length} colunas e ${rows.length} linhas.`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
