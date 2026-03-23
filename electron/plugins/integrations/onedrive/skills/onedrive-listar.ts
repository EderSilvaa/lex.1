import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listFiles, listSiteFiles } from '../onedrive-client';

export const onedriveListar: Skill = {
    nome: 'onedrive_listar',
    descricao: 'Lista arquivos no OneDrive ou SharePoint.',
    categoria: 'onedrive',
    parametros: {
        pasta: { tipo: 'string', descricao: 'Caminho da pasta', obrigatorio: false },
        siteId: { tipo: 'string', descricao: 'ID do site SharePoint', obrigatorio: false },
    },
    retorno: 'Lista de arquivos.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const pasta = params['pasta'] ? String(params['pasta']) : undefined;
            const siteId = params['siteId'] ? String(params['siteId']) : '';
            const items = siteId ? await listSiteFiles(siteId, pasta) : await listFiles(pasta);
            const formatted = items.map((item: any) => {
                const icon = item['folder'] ? '📁' : '📄';
                const size = item['size'] ? ` (${(item['size'] / 1024).toFixed(1)} KB)` : '';
                return `${icon} ${item['name']}${size}`;
            }).join('\n');
            return { sucesso: true, dados: { total: items.length, arquivos: items }, mensagem: items.length ? `${items.length} item(ns):\n${formatted}` : 'Pasta vazia.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
