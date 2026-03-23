import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { onedriveListar } from './skills/onedrive-listar';
import { onedriveUpload } from './skills/onedrive-upload';
import { onedriveDownload } from './skills/onedrive-download';
import { onedriveBuscar } from './skills/onedrive-buscar';
import { onedriveCompartilhar } from './skills/onedrive-compartilhar';

const manifest: LexPluginManifest = {
    id: 'onedrive',
    name: 'OneDrive / SharePoint',
    description: 'Armazenamento e compartilhamento via OneDrive e SharePoint',
    version: '1.0.0',
    author: 'LEX',
    providerGroup: 'microsoft',
    skillCategory: 'onedrive',
    auth: {
        type: 'oauth2',
        oauth2: {
            authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            scopes: ['Files.ReadWrite.All', 'Sites.Read.All'],
        },
    },
};

export class OneDrivePlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] {
        return [onedriveListar, onedriveUpload, onedriveDownload, onedriveBuscar, onedriveCompartilhar];
    }
}

export default new OneDrivePlugin();
