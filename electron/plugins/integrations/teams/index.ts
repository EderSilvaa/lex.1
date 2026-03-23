import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { teamsEnviar } from './skills/teams-enviar';
import { teamsListarCanais } from './skills/teams-listar';
import { teamsBuscar } from './skills/teams-buscar';
import { teamsAgendarReuniao } from './skills/teams-reuniao';

const manifest: LexPluginManifest = {
    id: 'teams',
    name: 'Microsoft Teams',
    description: 'Comunicação e reuniões via Microsoft Teams',
    version: '1.0.0',
    author: 'LEX',
    providerGroup: 'microsoft',
    skillCategory: 'teams',
    auth: {
        type: 'oauth2',
        oauth2: {
            authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            scopes: ['Chat.ReadWrite', 'Channel.ReadBasic.All', 'ChannelMessage.Send', 'OnlineMeetings.ReadWrite', 'Team.ReadBasic.All'],
        },
    },
};

export class TeamsPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] {
        return [teamsEnviar, teamsListarCanais, teamsBuscar, teamsAgendarReuniao];
    }
}

export default new TeamsPlugin();
