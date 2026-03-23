/**
 * Plugins Entry Point (Phase 3 AIOS)
 *
 * Registra plugins built-in e inicializa o PluginManager.
 * Chamado no boot do app (main.ts).
 */

import { getPluginManager } from './plugin-manager';

// Built-in plugins
import gmailPlugin from './integrations/gmail';
import gcalendarPlugin from './integrations/gcalendar';
import outlookPlugin from './integrations/outlook';
import gdrivePlugin from './integrations/gdrive';
import gdocsPlugin from './integrations/gdocs';
import whatsappPlugin from './integrations/whatsapp';
import notionPlugin from './integrations/notion';
import trelloPlugin from './integrations/trello';
import todoistPlugin from './integrations/todoist';
import zapierPlugin from './integrations/zapier';
import apifyPlugin from './integrations/apify';

// Cloud plugins (batch 2)
import gcontactsPlugin from './integrations/gcontacts';
import teamsPlugin from './integrations/teams';
import docusignPlugin from './integrations/docusign';
import dropboxPlugin from './integrations/dropbox';
import onedrivePlugin from './integrations/onedrive';
import slackPlugin from './integrations/slack';

// Desktop plugins (local, sem auth)
import pdfToolsPlugin from './integrations/pdf-tools';
import screenshotPlugin from './integrations/screenshot';
import excelPlugin from './integrations/excel';
import desktopPlugin from './integrations/desktop';
import clipboardPlugin from './integrations/clipboard';

export { getPluginManager } from './plugin-manager';
export type { PluginId, PluginStatus, PluginTokens, LexPlugin, LexPluginManifest } from './types';

/**
 * Inicializa o sistema de plugins.
 * Registra plugins built-in e carrega estado persistido.
 */
export async function initPlugins(): Promise<void> {
    console.log('[Plugins] Inicializando 22 plugins...');
    const pm = getPluginManager();

    // Google
    pm.registerPlugin(gmailPlugin);
    pm.registerPlugin(gcalendarPlugin);
    pm.registerPlugin(gdrivePlugin);
    pm.registerPlugin(gdocsPlugin);
    pm.registerPlugin(gcontactsPlugin);

    // Microsoft
    pm.registerPlugin(outlookPlugin);
    pm.registerPlugin(teamsPlugin);
    pm.registerPlugin(onedrivePlugin);

    // Comunicação
    pm.registerPlugin(whatsappPlugin);
    pm.registerPlugin(slackPlugin);

    // Produtividade
    pm.registerPlugin(notionPlugin);
    pm.registerPlugin(trelloPlugin);
    pm.registerPlugin(todoistPlugin);

    // Assinatura Digital
    pm.registerPlugin(docusignPlugin);

    // Cloud Storage
    pm.registerPlugin(dropboxPlugin);

    // Automação
    pm.registerPlugin(zapierPlugin);
    pm.registerPlugin(apifyPlugin);

    // Desktop (local, sem auth)
    pm.registerPlugin(pdfToolsPlugin);
    pm.registerPlugin(screenshotPlugin);
    pm.registerPlugin(excelPlugin);
    pm.registerPlugin(desktopPlugin);
    pm.registerPlugin(clipboardPlugin);

    // Carrega estado e conecta plugins que já estavam autenticados
    await pm.loadAll();

    console.log('[Plugins] Inicialização completa.');
}
