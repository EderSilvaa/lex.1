import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listFiles } from '../gdrive-client';

export const gdriveListar: Skill = {
    nome: 'gdrive_listar',
    descricao: 'Lista arquivos do Google Drive. Opcionalmente filtra por pasta.',
    categoria: 'gdrive',
    parametros: {
        folderId: { tipo: 'string', descricao: 'ID da pasta (vazio = raiz)', obrigatorio: false },
        maxResults: { tipo: 'number', descricao: 'Máximo de arquivos', obrigatorio: false, default: 20 },
    },
    retorno: 'Lista de arquivos com nome, tipo e data.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        try {
            const files = await listFiles({ folderId: params['folderId'], maxResults: params['maxResults'] || 20 });
            const formatted = files.map((f, i) => `${i + 1}. **${f.name}** (${f.mimeType}) — ${f.modifiedTime}`).join('\n');
            return { sucesso: true, dados: { count: files.length, files }, mensagem: files.length > 0 ? `${files.length} arquivo(s):\n\n${formatted}` : 'Nenhum arquivo encontrado.' };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
