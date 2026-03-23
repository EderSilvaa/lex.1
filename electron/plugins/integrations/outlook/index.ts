/**
 * Microsoft Outlook Plugin (Phase 3 AIOS)
 *
 * Integração com Outlook via Microsoft Graph API.
 * Skills: listar, ler, enviar, buscar, responder.
 */

import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { outlookListar } from './skills/outlook-listar';
import { outlookLer } from './skills/outlook-ler';
import { outlookEnviar } from './skills/outlook-enviar';
import { outlookBuscar } from './skills/outlook-buscar';
import { outlookResponder } from './skills/outlook-responder';

const manifest: LexPluginManifest = {
    id: 'outlook',
    name: 'Microsoft Outlook',
    description: 'Ler, enviar e buscar emails via Outlook/Office 365.',
    version: '1.0.0',
    author: 'LEX',
    providerGroup: 'microsoft',
    skillCategory: 'outlook',

    agentType: {
        typeId: 'outlook',
        displayName: 'Agente Outlook',
        allowedSkillCategories: ['outlook'],
        systemPromptExtra: `Você é um agente especializado em gerenciar emails via Microsoft Outlook.
Use outlook_listar para ver a caixa de entrada, outlook_buscar para encontrar emails,
outlook_ler para ler completo, outlook_enviar para enviar e outlook_responder para responder.`,
    },

    auth: {
        type: 'oauth2',
        oauth2: {
            authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            scopes: ['Mail.Read', 'Mail.Send', 'Mail.ReadWrite', 'offline_access'],
            pkce: true,
        },
    },
};

export class OutlookPlugin implements LexPlugin {
    manifest = manifest;
    async initialize(_tokens: PluginTokens | null): Promise<void> {}
    getSkills(): Skill[] {
        return [outlookListar, outlookLer, outlookEnviar, outlookBuscar, outlookResponder];
    }
}

export default new OutlookPlugin();
