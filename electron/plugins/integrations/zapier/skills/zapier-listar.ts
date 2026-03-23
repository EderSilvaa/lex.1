import type { Skill, SkillResult, AgentContext } from '../../../../agent/types';
import { listWebhooks } from '../zapier-client';

export const zapierListar: Skill = {
    nome: 'zapier_listar', descricao: 'Lista webhooks Zapier configurados.', categoria: 'zapier',
    parametros: {},
    retorno: 'Lista de webhooks salvos.',
    async execute(_params: Record<string, any>, _ctx: AgentContext): Promise<SkillResult> {
        const webhooks = listWebhooks();
        if (webhooks.length === 0) return { sucesso: true, dados: [], mensagem: 'Nenhum webhook salvo. Use zapier_salvar_webhook para configurar.' };
        const formatted = webhooks.map((w, i) => `${i + 1}. **${w.name}** — ${w.description}\n   URL: ${w.url}`).join('\n\n');
        return { sucesso: true, dados: webhooks, mensagem: `${webhooks.length} webhook(s):\n\n${formatted}` };
    },
};
