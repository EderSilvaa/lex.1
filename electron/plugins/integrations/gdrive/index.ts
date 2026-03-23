import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { gdriveListar } from './skills/gdrive-listar';
import { gdriveBaixar } from './skills/gdrive-baixar';
import { gdriveUpload } from './skills/gdrive-upload';
import { gdriveBuscar } from './skills/gdrive-buscar';
import { gdriveCompartilhar } from './skills/gdrive-compartilhar';

const manifest: LexPluginManifest = {
    id: 'gdrive',
    name: 'Google Drive',
    description: 'Upload, download, busca e compartilhamento de arquivos no Google Drive.',
    version: '1.0.0',
    author: 'LEX',
    providerGroup: 'google',
    skillCategory: 'gdrive',
    agentType: {
        typeId: 'gdrive',
        displayName: 'Agente Google Drive',
        allowedSkillCategories: ['gdrive'],
        systemPromptExtra: `Você é um agente para Google Drive. Use gdrive_listar para ver arquivos, gdrive_buscar para encontrar, gdrive_baixar para download, gdrive_upload para enviar e gdrive_compartilhar para compartilhar.`,
    },
    auth: {
        type: 'oauth2',
        oauth2: {
            authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.readonly'],
            pkce: true,
        },
    },
};

export class GoogleDrivePlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [gdriveListar, gdriveBaixar, gdriveUpload, gdriveBuscar, gdriveCompartilhar]; }
}
export default new GoogleDrivePlugin();
