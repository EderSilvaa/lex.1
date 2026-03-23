import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { downloadFile } from '../dropbox-client';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export const dropboxDownload: Skill = {
    nome: 'dropbox_download',
    descricao: 'Baixa arquivo do Dropbox para o computador.',
    categoria: 'dropbox',
    parametros: {
        arquivo: { tipo: 'string', descricao: 'Caminho do arquivo no Dropbox', obrigatorio: true },
        saida: { tipo: 'string', descricao: 'Caminho local para salvar', obrigatorio: false },
    },
    retorno: 'Caminho do arquivo baixado.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };

        try {
            const { buffer, metadata } = await downloadFile(arquivo);
            const saida = params['saida'] ? String(params['saida']) : path.join(os.tmpdir(), metadata['name'] || path.basename(arquivo));
            await fs.mkdir(path.dirname(saida), { recursive: true });
            await fs.writeFile(saida, buffer);
            return { sucesso: true, dados: { arquivo: saida, tamanho: buffer.length }, mensagem: `Baixado: ${saida} (${(buffer.length / 1024).toFixed(1)} KB)` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
