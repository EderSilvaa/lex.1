/**
 * Google Calendar Plugin (Phase 3 AIOS)
 *
 * Integração com Google Calendar via REST API.
 * Skills: listar, buscar, criar, atualizar, deletar.
 */

import type { LexPlugin, LexPluginManifest, PluginTokens } from '../../types';
import type { Skill } from '../../../agent/types';
import { gcalListar } from './skills/gcal-listar';
import { gcalBuscar } from './skills/gcal-buscar';
import { gcalCriar } from './skills/gcal-criar';
import { gcalAtualizar } from './skills/gcal-atualizar';
import { gcalDeletar } from './skills/gcal-deletar';

const manifest: LexPluginManifest = {
    id: 'gcalendar',
    name: 'Google Calendar',
    description: 'Gerenciar agenda: ver, criar, atualizar e remover eventos. Ideal para prazos e audiências.',
    version: '1.0.0',
    author: 'LEX',
    providerGroup: 'google',
    skillCategory: 'gcalendar',

    agentType: {
        typeId: 'gcalendar',
        displayName: 'Agente Agenda',
        allowedSkillCategories: ['gcalendar'],
        systemPromptExtra: `Você é um agente especializado em gerenciar a agenda via Google Calendar.
Use gcal_listar para ver compromissos, gcal_buscar para encontrar eventos específicos,
gcal_criar para agendar novos compromissos, gcal_atualizar para remarcar e gcal_deletar para cancelar.
Para prazos processuais, inclua o número do processo na descrição do evento.`,
    },

    auth: {
        type: 'oauth2',
        oauth2: {
            authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            scopes: [
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/calendar.events',
            ],
            pkce: true,
        },
    },
};

export class GoogleCalendarPlugin implements LexPlugin {
    manifest = manifest;

    async initialize(_tokens: PluginTokens | null): Promise<void> {
        // Client busca tokens on-demand via PluginManager
    }

    getSkills(): Skill[] {
        return [gcalListar, gcalBuscar, gcalCriar, gcalAtualizar, gcalDeletar];
    }
}

export default new GoogleCalendarPlugin();
