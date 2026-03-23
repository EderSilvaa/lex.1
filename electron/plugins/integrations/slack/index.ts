import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { slackEnviar } from './skills/slack-enviar';
import { slackListarCanais } from './skills/slack-listar';
import { slackBuscar } from './skills/slack-buscar';
import { slackLerCanal } from './skills/slack-ler';

const manifest: LexPluginManifest = {
    id: 'slack',
    name: 'Slack',
    description: 'Comunicação e mensagens via Slack',
    version: '1.0.0',
    author: 'LEX',
    providerGroup: 'slack',
    skillCategory: 'slack',
    auth: {
        type: 'oauth2',
        oauth2: {
            authorizationUrl: 'https://slack.com/oauth/v2/authorize',
            tokenUrl: 'https://slack.com/api/oauth.v2.access',
            scopes: ['chat:write', 'channels:read', 'channels:history', 'search:read', 'users:read'],
        },
    },
};

export class SlackPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] {
        return [slackEnviar, slackListarCanais, slackBuscar, slackLerCanal];
    }
}

export default new SlackPlugin();
