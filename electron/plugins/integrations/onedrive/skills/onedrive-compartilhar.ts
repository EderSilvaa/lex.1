import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { shareFile } from '../onedrive-client';

export const onedriveCompartilhar: Skill = {
    nome: 'onedrive_compartilhar',
    descricao: 'Cria link de compartilhamento no OneDrive.',
    categoria: 'onedrive',
    parametros: {
        itemId: { tipo: 'string', descricao: 'ID do item', obrigatorio: true },
        tipo: { tipo: 'string', descricao: 'view ou edit', obrigatorio: false, default: 'view', enum: ['view', 'edit'] },
        escopo: { tipo: 'string', descricao: 'anonymous ou organization', obrigatorio: false, default: 'anonymous', enum: ['anonymous', 'organization'] },
    },
    retorno: 'Link de compartilhamento.',

    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const itemId = String(params['itemId'] || '').trim();
        if (!itemId) return { sucesso: false, erro: 'Parâmetro "itemId" é obrigatório.' };
        try {
            const tipo = params['tipo'] ? String(params['tipo']) : 'view';
            const escopo = params['escopo'] ? String(params['escopo']) : 'anonymous';
            const result = await shareFile(itemId, tipo, escopo);
            return { sucesso: true, dados: { url: result['link']?.['webUrl'] }, mensagem: `Link (${tipo}): ${result['link']?.['webUrl']}` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
