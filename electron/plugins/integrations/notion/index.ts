import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { notionBuscar } from './skills/notion-buscar';
import { notionLer } from './skills/notion-ler';
import { notionCriar } from './skills/notion-criar';
import { notionEscrever } from './skills/notion-escrever';
import { notionListar } from './skills/notion-listar';

const manifest: LexPluginManifest = {
    id: 'notion', name: 'Notion', description: 'Criar, ler e organizar páginas no Notion.',
    version: '1.0.0', author: 'LEX', providerGroup: 'notion', skillCategory: 'notion',
    agentType: { typeId: 'notion', displayName: 'Agente Notion', allowedSkillCategories: ['notion'],
        systemPromptExtra: 'Você é um agente Notion. Use notion_buscar para encontrar, notion_ler para ver conteúdo, notion_criar para nova página, notion_escrever para adicionar texto e notion_listar para recentes.' },
    auth: { type: 'oauth2', oauth2: { authorizationUrl: 'https://api.notion.com/v1/oauth/authorize', tokenUrl: 'https://api.notion.com/v1/oauth/token',
        scopes: [], pkce: false, additionalParams: { owner: 'user' } } },
};

export class NotionPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [notionBuscar, notionLer, notionCriar, notionEscrever, notionListar]; }
}
export default new NotionPlugin();
