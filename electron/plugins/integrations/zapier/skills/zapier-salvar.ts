import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { saveWebhook } from '../zapier-client';

export const zapierSalvar: Skill = {
    nome: 'zapier_salvar_webhook', descricao: 'Salva URL de webhook Zapier para uso futuro.', categoria: 'zapier',
    parametros: {
        name: { tipo: 'string', descricao: 'Nome curto para o webhook', obrigatorio: true },
        url: { tipo: 'string', descricao: 'URL do catch hook do Zapier', obrigatorio: true },
        description: { tipo: 'string', descricao: 'Descrição do que o webhook faz', obrigatorio: false, default: '' },
    },
    retorno: 'Confirmação.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const name = String(params['name'] || '').trim();
        const url = String(params['url'] || '').trim();
        if (!name || !url) return { sucesso: false, erro: 'name e url obrigatórios' };
        saveWebhook(name, url, params['description'] || '');
        return { sucesso: true, dados: { name, url }, mensagem: `Webhook "${name}" salvo.` };
    },
};
