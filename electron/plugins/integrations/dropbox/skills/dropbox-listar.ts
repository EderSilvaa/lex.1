import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listFolder } from '../dropbox-client';

export const dropboxListar: Skill = {
    nome: 'dropbox_listar',
    descricao: 'Lista arquivos e pastas no Dropbox.',
    categoria: 'dropbox',
    parametros: {
        pasta: { tipo: 'string', descricao: 'Caminho da pasta (default: raiz)', obrigatorio: false, default: '' },
    },
    retorno: 'Lista de arquivos com nome, tipo e tamanho.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const pasta = params['pasta'] ? String(params['pasta']) : '';
            const entries = await listFolder(pasta);
            const formatted = entries.map((e: any) => {
                const icon = e['.tag'] === 'folder' ? '📁' : '📄';
                const size = e['size'] ? ` (${(e['size'] / 1024).toFixed(1)} KB)` : '';
                return `${icon} ${e['name']}${size}`;
            }).join('\n');
            return { sucesso: true, dados: { total: entries.length, arquivos: entries }, mensagem: entries.length ? `${entries.length} item(ns):\n${formatted}` : 'Pasta vazia.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
