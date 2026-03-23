import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { createSharedLink } from '../dropbox-client';

export const dropboxCompartilhar: Skill = {
    nome: 'dropbox_compartilhar',
    descricao: 'Cria link de compartilhamento para arquivo no Dropbox.',
    categoria: 'dropbox',
    parametros: { arquivo: { tipo: 'string', descricao: 'Caminho do arquivo no Dropbox', obrigatorio: true } },
    retorno: 'Link de compartilhamento.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const arquivo = String(params['arquivo'] || '').trim();
        if (!arquivo) return { sucesso: false, erro: 'Parâmetro "arquivo" é obrigatório.' };
        try {
            const result = await createSharedLink(arquivo);
            return { sucesso: true, dados: { url: result['url'] }, mensagem: `Link: ${result['url']}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
