/**
 * Microsoft Outlook REST API Client (Phase 3 AIOS)
 *
 * Wrapper para Microsoft Graph API v1.0 via fetch.
 */

import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://graph.microsoft.com/v1.0/me';

async function headers(): Promise<Record<string, string>> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('outlook');
    return {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
    };
}

export interface OutlookMessage {
    id: string;
    subject: string;
    from: string;
    fromEmail: string;
    toRecipients: string[];
    receivedDateTime: string;
    bodyPreview: string;
    body?: string;
}

/** Lista mensagens */
export async function listMessages(opts: { folder?: string; query?: string; maxResults?: number } = {}): Promise<OutlookMessage[]> {
    const folder = opts.folder || 'inbox';
    const top = opts.maxResults || 10;
    let url = `${BASE}/mailFolders/${folder}/messages?$top=${top}&$orderby=receivedDateTime desc`;

    if (opts.query) {
        url += `&$search="${encodeURIComponent(opts.query)}"`;
    }

    const h = await headers();
    const res = await fetch(url, { headers: h });
    if (!res.ok) throw new Error(`Outlook list falhou: ${res.status}`);

    const data = await res.json() as any;
    return (data.value || []).map(parseMessage);
}

/** Lê mensagem completa */
export async function getMessage(id: string): Promise<OutlookMessage | null> {
    const h = await headers();
    const res = await fetch(`${BASE}/messages/${id}`, { headers: h });
    if (!res.ok) return null;

    const data = await res.json() as any;
    return parseMessage(data, true);
}

/** Envia email */
export async function sendMessage(to: string, subject: string, body: string, opts?: { cc?: string; bcc?: string }): Promise<string> {
    const message: any = {
        subject,
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: to } }],
    };
    if (opts?.cc) message.ccRecipients = [{ emailAddress: { address: opts.cc } }];
    if (opts?.bcc) message.bccRecipients = [{ emailAddress: { address: opts.bcc } }];

    const h = await headers();
    const res = await fetch(`${BASE}/sendMail`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ message, saveToSentItems: true }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Outlook send falhou: ${res.status} ${text}`);
    }
    return 'sent';
}

/** Responde a email */
export async function replyToMessage(messageId: string, body: string): Promise<void> {
    const h = await headers();
    const res = await fetch(`${BASE}/messages/${messageId}/reply`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ comment: body }),
    });
    if (!res.ok) throw new Error(`Outlook reply falhou: ${res.status}`);
}

/** Busca emails */
export async function searchMessages(query: string, maxResults = 10): Promise<OutlookMessage[]> {
    return listMessages({ query, maxResults });
}

function parseMessage(raw: any, includeBody = false): OutlookMessage {
    return {
        id: raw.id,
        subject: raw.subject || '(sem assunto)',
        from: raw.from?.emailAddress?.name || raw.from?.emailAddress?.address || '',
        fromEmail: raw.from?.emailAddress?.address || '',
        toRecipients: (raw.toRecipients || []).map((r: any) => r.emailAddress?.address),
        receivedDateTime: raw.receivedDateTime || '',
        bodyPreview: raw.bodyPreview || '',
        body: includeBody ? (raw.body?.content || '') : undefined,
    };
}
