import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { dropboxListar } from './skills/dropbox-listar';
import { dropboxUpload } from './skills/dropbox-upload';
import { dropboxDownload } from './skills/dropbox-download';
import { dropboxBuscar } from './skills/dropbox-buscar';
import { dropboxCompartilhar } from './skills/dropbox-compartilhar';

const manifest: LexPluginManifest = {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Armazenamento e compartilhamento de arquivos via Dropbox',
    version: '1.0.0',
    author: 'LEX',
    providerGroup: 'dropbox',
    skillCategory: 'dropbox',
    auth: {
        type: 'oauth2',
        oauth2: {
            authorizationUrl: 'https://www.dropbox.com/oauth2/authorize',
            tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
            scopes: ['files.content.read', 'files.content.write', 'sharing.write'],
        },
    },
};

export class DropboxPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] {
        return [dropboxListar, dropboxUpload, dropboxDownload, dropboxBuscar, dropboxCompartilhar];
    }
}

export default new DropboxPlugin();
