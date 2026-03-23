import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { docusignEnviarEnvelope } from './skills/docusign-enviar';
import { docusignListar } from './skills/docusign-listar';
import { docusignStatus } from './skills/docusign-status';
import { docusignBaixarAssinado } from './skills/docusign-baixar';

const manifest: LexPluginManifest = {
    id: 'docusign',
    name: 'DocuSign',
    description: 'Assinatura eletrônica de documentos via DocuSign',
    version: '1.0.0',
    author: 'LEX',
    providerGroup: 'docusign',
    skillCategory: 'docusign',
    auth: {
        type: 'oauth2',
        oauth2: {
            authorizationUrl: 'https://account-d.docusign.com/oauth/auth',
            tokenUrl: 'https://account-d.docusign.com/oauth/token',
            scopes: ['signature', 'impersonation'],
        },
    },
};

export class DocuSignPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] {
        return [docusignEnviarEnvelope, docusignListar, docusignStatus, docusignBaixarAssinado];
    }
}

export default new DocuSignPlugin();
