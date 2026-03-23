/**
 * Credenciais OAuth2 embarcadas por providerGroup.
 *
 * O desenvolvedor configura os apps OAuth em cada provedor e coloca
 * as credenciais aqui. O usuário final só clica "Conectar" e loga.
 *
 * Para adicionar um novo provedor:
 *   1. Crie o app OAuth no console do provedor
 *   2. Adicione clientId + clientSecret abaixo
 *   3. O sistema usa automaticamente ao conectar qualquer plugin do grupo
 */

export interface EmbeddedCredentials {
    clientId: string;
    clientSecret: string;
}

/**
 * Mapa providerGroup → credenciais OAuth2 embarcadas.
 * Plugins do mesmo grupo compartilham as mesmas credenciais.
 */
const EMBEDDED_CREDENTIALS: Record<string, EmbeddedCredentials> = {
    google: {
        clientId: process.env['GOOGLE_CLIENT_ID'] || '',
        clientSecret: process.env['GOOGLE_CLIENT_SECRET'] || '',
    },

    // Microsoft (Azure AD) — criar em portal.azure.com → App registrations
    // microsoft: {
    //     clientId: '',
    //     clientSecret: '',
    // },

    // Slack — criar em api.slack.com/apps
    // slack: {
    //     clientId: '',
    //     clientSecret: '',
    // },

    // DocuSign — criar em admindemo.docusign.com → Integrations
    // docusign: {
    //     clientId: '',
    //     clientSecret: '',
    // },

    // Dropbox — criar em dropbox.com/developers/apps
    // dropbox: {
    //     clientId: '',
    //     clientSecret: '',
    // },

    // Notion — criar em notion.so/my-integrations (Public integration)
    // notion: {
    //     clientId: '',
    //     clientSecret: '',
    // },
};

/**
 * Retorna credenciais embarcadas para um providerGroup.
 * Retorna null se o grupo não tem credenciais configuradas.
 */
export function getEmbeddedCredentials(providerGroup: string): EmbeddedCredentials | null {
    return EMBEDDED_CREDENTIALS[providerGroup] || null;
}

/**
 * Verifica se um providerGroup tem credenciais embarcadas.
 */
export function hasEmbeddedCredentials(providerGroup: string): boolean {
    const creds = EMBEDDED_CREDENTIALS[providerGroup];
    return !!(creds?.clientId && creds?.clientSecret);
}