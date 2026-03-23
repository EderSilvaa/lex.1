import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { zapierTrigger } from './skills/zapier-trigger';
import { zapierListar } from './skills/zapier-listar';
import { zapierSalvar } from './skills/zapier-salvar';

const manifest: LexPluginManifest = {
    id: 'zapier', name: 'Zapier', description: 'Conecta LEX a 5000+ apps via webhooks Zapier.',
    version: '1.0.0', author: 'LEX', skillCategory: 'zapier',
    agentType: { typeId: 'zapier', displayName: 'Agente Zapier', allowedSkillCategories: ['zapier'],
        systemPromptExtra: 'Você conecta LEX com outros apps via Zapier. Use zapier_trigger para disparar automações, zapier_listar para ver webhooks e zapier_salvar_webhook para configurar novos.' },
    auth: null, // Zapier webhooks não precisam de auth — a URL já contém o token
};

export class ZapierPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [zapierTrigger, zapierListar, zapierSalvar]; }
}
export default new ZapierPlugin();
