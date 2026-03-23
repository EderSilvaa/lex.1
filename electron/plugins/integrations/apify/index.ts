import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { apifyListar } from './skills/apify-listar';
import { apifyExecutar } from './skills/apify-executar';
import { apifyResultado } from './skills/apify-resultado';
import { apifyBuscar } from './skills/apify-buscar';

const manifest: LexPluginManifest = {
    id: 'apify', name: 'Apify', description: 'Web scraping e automação com actors Apify.',
    version: '1.0.0', author: 'LEX', skillCategory: 'apify',
    agentType: { typeId: 'apify', displayName: 'Agente Apify', allowedSkillCategories: ['apify'],
        systemPromptExtra: 'Você é um agente de web scraping via Apify. Use apify_buscar para encontrar scrapers, apify_executar para rodar, apify_resultado para ver dados e apify_listar para ver seus actors.' },
    auth: { type: 'api_key', apiKey: { instructions: 'Obtenha o API token em console.apify.com → Settings → Integrations', url: 'https://console.apify.com' } },
};

export class ApifyPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [apifyListar, apifyExecutar, apifyResultado, apifyBuscar]; }
}
export default new ApifyPlugin();
