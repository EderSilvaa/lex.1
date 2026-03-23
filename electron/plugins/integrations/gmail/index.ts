/**
 * Gmail Plugin (Phase 3 AIOS)
 *
 * Integração com Gmail via REST API.
 * Skills: listar, ler, enviar, buscar, responder.
 */

import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { gmailListar } from './skills/gmail-listar';
import { gmailLer } from './skills/gmail-ler';
import { gmailEnviar } from './skills/gmail-enviar';
import { gmailBuscar } from './skills/gmail-buscar';
import { gmailResponder } from './skills/gmail-responder';

const manifest: LexPluginManifest = {
    id: 'gmail',
    name: 'Gmail',
    description: 'Ler, enviar e buscar emails via Gmail. Permite ao agente gerenciar a caixa de entrada.',
    version: '1.0.0',
    author: 'LEX',
    providerGroup: 'google',
    skillCategory: 'gmail',

    agentType: {
        typeId: 'gmail',
        displayName: 'Agente Gmail',
        allowedSkillCategories: ['gmail'],
        systemPromptExtra: `Você é um agente especializado em gerenciar emails via Gmail.
Use gmail_listar para ver a caixa de entrada, gmail_buscar para encontrar emails específicos,
gmail_ler para ler o conteúdo completo, gmail_enviar para enviar e gmail_responder para responder.
Ao enviar emails jurídicos, use linguagem formal e inclua identificação profissional.`,
    },

    auth: {
        type: 'oauth2',
        oauth2: {
            authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            scopes: [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.modify',
            ],
            pkce: true,
        },
    },
};

export class GmailPlugin implements LexPlugin {
    manifest = manifest;

    async initialize(_tokens: PluginTokens | null): Promise<void> {
        // Nada a inicializar — client busca tokens on-demand via PluginManager
    }

    getSkills(): Skill[] {
        return [gmailListar, gmailLer, gmailEnviar, gmailBuscar, gmailResponder];
    }

    onTokenRefresh?(_tokens: PluginTokens): void {
        // Tokens são buscados on-demand, nada a fazer aqui
    }
}

export default new GmailPlugin();
