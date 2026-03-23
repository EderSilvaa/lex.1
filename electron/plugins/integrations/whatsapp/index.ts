import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { whatsappEnviar } from './skills/whatsapp-enviar';
import { whatsappTemplate } from './skills/whatsapp-template';
import { whatsappNotificar } from './skills/whatsapp-notificar';

const manifest: LexPluginManifest = {
    id: 'whatsapp', name: 'WhatsApp Business', description: 'Enviar mensagens e notificar clientes via WhatsApp Business.',
    version: '1.0.0', author: 'LEX', skillCategory: 'whatsapp',
    agentType: { typeId: 'whatsapp', displayName: 'Agente WhatsApp', allowedSkillCategories: ['whatsapp'],
        systemPromptExtra: 'Você é um agente para WhatsApp Business. Use whatsapp_enviar para mensagens diretas, whatsapp_template para templates aprovados e whatsapp_notificar_cliente para avisar clientes sobre processos.' },
    auth: { type: 'api_key', apiKey: { instructions: 'Obtenha o token da API em developers.facebook.com → WhatsApp → API Setup', url: 'https://developers.facebook.com' } },
};

export class WhatsAppPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [whatsappEnviar, whatsappTemplate, whatsappNotificar]; }
}
export default new WhatsAppPlugin();
