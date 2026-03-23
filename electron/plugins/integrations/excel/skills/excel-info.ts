import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { readWorkbook } from '../excel-client';

export const excelInfo: Skill = {
    nome: 'excel_info',
    descricao: 'Retorna metadados de um arquivo Excel (.xlsx): planilhas, quantidade de linhas e colunas.',
    categoria: 'excel',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do arquivo .xlsx', obrigatorio: true },
    },
    retorno: 'Metadados do workbook (planilhas, linhas, colunas).',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };

        try {
            const meta = await readWorkbook(arquivo);

            const formatted = meta.sheets.map((s, i) =>
                `${i + 1}. **${s.name}** — ${s.rowCount} linha(s), colunas: ${s.columns.length > 0 ? s.columns.join(', ') : '(vazio)'}`
            ).join('\n');

            return {
                sucesso: true,
                dados: meta,
                mensagem: `Arquivo com ${meta.sheets.length} planilha(s):\n\n${formatted}`,
            };
        } catch (err: any) {
            return { sucesso: false, erro: err.message };
        }
    },
};
