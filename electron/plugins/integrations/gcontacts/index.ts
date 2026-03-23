import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { gcontactsListar } from './skills/gcontacts-listar';
import { gcontactsBuscar } from './skills/gcontacts-buscar';
import { gcontactsCriar } from './skills/gcontacts-criar';
import { gcontactsAtualizar } from './skills/gcontacts-atualizar';

const manifest: LexPluginManifest = {
    id: 'gcontacts',
    name: 'Google Contacts',
    description: 'Gerenciar contatos do Google',
    version: '1.0.0',
    author: 'LEX',
    providerGroup: 'google',
    skillCategory: 'gcontacts',
    auth: {
        type: 'oauth2',
        oauth2: {
            authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            scopes: ['https://www.googleapis.com/auth/contacts'],
            pkce: true,
        },
    },
};

export class GContactsPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] {
        return [gcontactsListar, gcontactsBuscar, gcontactsCriar, gcontactsAtualizar];
    }
}

export default new GContactsPlugin();
