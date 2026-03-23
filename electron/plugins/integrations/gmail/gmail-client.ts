/**
 * Gmail REST API Client (Phase 3 AIOS)
 *
 * Wrapper minimalista para Gmail API v1 via fetch (sem SDK).
 * Tokens obtidos via PluginManager.getValidToken('gmail').
 */

import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function headers(): Promise<Record<string, string>> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('gmail');
    return {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
    };
}

export interface GmailMessage {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    snippet: string;
    body?: string;
}

/** Lista mensagens (inbox por default) */
export async function listMessages(opts: { query?: string; label?: string; maxResults?: number } = {}): Promise<GmailMessage[]> {
    const params = new URLSearchParams();
    if (opts.maxResults) params.set('maxResults', String(opts.maxResults));

    const parts: string[] = [];
    if (opts.query) parts.push(opts.query);
    if (opts.label) parts.push(`label:${opts.label}`);
    if (parts.length > 0) params.set('q', parts.join(' '));

    const h = await headers();
    const res = await fetch(`${BASE}/messages?${params}`, { headers: h });
    if (!res.ok) throw new Error(`Gmail list falhou: ${res.status}`);

    const data = await res.json() as any;
    const messageIds: string[] = (data.messages || []).map((m: any) => m.id);

    // Busca detalhes de cada mensagem (metadata only para listar)
    const messages: GmailMessage[] = [];
    for (const id of messageIds.slice(0, opts.maxResults || 10)) {
        const msg = await getMessage(id, 'metadata');
        if (msg) messages.push(msg);
    }

    return messages;
}

/** Lê uma mensagem completa */
export async function getMessage(id: string, format: 'full' | 'metadata' = 'full'): Promise<GmailMessage | null> {
    const h = await headers();
    const res = await fetch(`${BASE}/messages/${id}?format=${format}`, { headers: h });
    if (!res.ok) return null;

    const data = await res.json() as any;
    return parseMessage(data, format === 'full');
}

/** Envia email */
export async function sendMessage(to: string, subject: string, body: string, opts?: { cc?: string; bcc?: string }): Promise<string> {
    const mime = buildMime(to, subject, body, opts?.cc, opts?.bcc);
    const encoded = Buffer.from(mime).toString('base64url');

    const h = await headers();
    const res = await fetch(`${BASE}/messages/send`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ raw: encoded }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gmail send falhou: ${res.status} ${text}`);
    }

    const data = await res.json() as any;
    return data.id;
}

/** Responde a um thread */
export async function replyToMessage(messageId: string, body: string): Promise<string> {
    // Busca mensagem original para thread e headers
    const original = await getMessage(messageId, 'metadata');
    if (!original) throw new Error('Mensagem original não encontrada');

    const h = await headers();
    // Busca threadId
    const metaRes = await fetch(`${BASE}/messages/${messageId}?format=minimal`, { headers: h });
    const meta = await metaRes.json() as any;
    const threadId = meta.threadId;

    const subject = original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`;
    const mime = buildMime(original.from, subject, body);
    const encoded = Buffer.from(mime).toString('base64url');

    const res = await fetch(`${BASE}/messages/send`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ raw: encoded, threadId }),
    });

    if (!res.ok) throw new Error(`Gmail reply falhou: ${res.status}`);
    const data = await res.json() as any;
    return data.id;
}

// ============================================================================
// INTERNALS
// ============================================================================

function parseMessage(data: any, includeBody: boolean): GmailMessage {
    const hdrs = data.payload?.headers || [];
    const getHeader = (name: string) => hdrs.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    let body = '';
    if (includeBody && data.payload) {
        body = extractBody(data.payload);
    }

    return {
        id: data.id,
        threadId: data.threadId,
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To'),
        date: getHeader('Date'),
        snippet: data.snippet || '',
        body: body || undefined,
    };
}

function extractBody(payload: any): string {
    // Tenta text/plain primeiro
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
        return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    // Procura em parts
    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                return Buffer.from(part.body.data, 'base64url').toString('utf-8');
            }
        }
        // Fallback: text/html stripped
        for (const part of payload.parts) {
            if (part.mimeType === 'text/html' && part.body?.data) {
                const html = Buffer.from(part.body.data, 'base64url').toString('utf-8');
                return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }
        }
    }

    return '';
}

function buildMime(to: string, subject: string, body: string, cc?: string, bcc?: string): string {
    const lines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
    ];
    if (cc) lines.push(`Cc: ${cc}`);
    if (bcc) lines.push(`Bcc: ${bcc}`);
    lines.push('', body);
    return lines.join('\r\n');
}
