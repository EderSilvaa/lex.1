import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { gdocsCriar } from './skills/gdocs-criar';
import { gdocsLer } from './skills/gdocs-ler';
import { gdocsEscrever } from './skills/gdocs-escrever';
import { gdocsExportar } from './skills/gdocs-exportar';

const manifest: LexPluginManifest = {
    id: 'gdocs', name: 'Google Docs', description: 'Criar, ler, editar e exportar documentos no Google Docs.',
    version: '1.0.0', author: 'LEX', providerGroup: 'google', skillCategory: 'gdocs',
    agentType: { typeId: 'gdocs', displayName: 'Agente Google Docs', allowedSkillCategories: ['gdocs'],
        systemPromptExtra: 'Você é um agente para Google Docs. Use gdocs_criar para novo doc, gdocs_ler para ler, gdocs_escrever para adicionar texto e gdocs_exportar para exportar como PDF/DOCX.' },
    auth: { type: 'oauth2', oauth2: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive.file'], pkce: true } },
};

export class GoogleDocsPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] { return [gdocsCriar, gdocsLer, gdocsEscrever, gdocsExportar]; }
}
export default new GoogleDocsPlugin();
