import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { triggerWebhook, listWebhooks } from '../zapier-client';

export const zapierTrigger: Skill = {
    nome: 'zapier_trigger', descricao: 'Dispara webhook Zapier com dados JSON. Use para acionar automações externas.', categoria: 'zapier',
    parametros: {
        webhookUrl: { tipo: 'string', descricao: 'URL do webhook (ou nome de um salvo)', obrigatorio: true },
        data: { tipo: 'string', descricao: 'JSON com dados para enviar', obrigatorio: true },
    },
    retorno: 'Resposta do webhook.',
    async execute(params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        let url = String(params['webhookUrl'] || '').trim();
        const dataStr = String(params['data'] || '{}');
        if (!url) return { sucesso: false, erro: 'webhookUrl obrigatório' };
        // Resolve nome salvo
        if (!url.startsWith('http')) {
            const saved = listWebhooks().find(w => w.name === url);
            if (saved) url = saved.url;
            else return { sucesso: false, erro: `Webhook "${url}" não encontrado. Use zapier_listar para ver os salvos.` };
        }
        try {
            const data = JSON.parse(dataStr);
            const result = await triggerWebhook(url, data);
            return { sucesso: true, dados: result, mensagem: `Webhook disparado com sucesso.` };
        } catch (err: any) { return { sucesso: false, erro: err.message }; }
    },
};
