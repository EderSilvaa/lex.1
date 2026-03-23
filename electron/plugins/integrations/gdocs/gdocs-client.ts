/**
 * Google Docs REST API Client (Phase 3 AIOS)
 */
import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://docs.googleapis.com/v1/documents';

async function headers(): Promise<Record<string, string>> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('gdocs');
    return { 'Authorization': `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' };
}

export interface GDoc { id: string; title: string; body?: string; revisionId?: string; }

export async function createDocument(title: string, content?: string): Promise<GDoc> {
    const h = await headers();
    const res = await fetch(BASE, { method: 'POST', headers: h, body: JSON.stringify({ title }) });
    if (!res.ok) throw new Error(`Docs create falhou: ${res.status}`);
    const doc = await res.json() as any;
    if (content) await appendText(doc.documentId, content);
    return { id: doc.documentId, title: doc.title };
}

export async function getDocument(docId: string): Promise<GDoc> {
    const h = await headers();
    const res = await fetch(`${BASE}/${docId}`, { headers: h });
    if (!res.ok) throw new Error(`Docs get falhou: ${res.status}`);
    const data = await res.json() as any;
    const body = extractText(data.body?.content || []);
    return { id: data.documentId, title: data.title, body };
}

export async function appendText(docId: string, text: string): Promise<void> {
    const h = await headers();
    const res = await fetch(`${BASE}/${docId}:batchUpdate`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text } }] }),
    });
    if (!res.ok) throw new Error(`Docs append falhou: ${res.status}`);
}

export async function exportDocument(docId: string, mimeType = 'application/pdf'): Promise<Buffer> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('gdocs');
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=${encodeURIComponent(mimeType)}`, {
        headers: { 'Authorization': `Bearer ${tokens.accessToken}` },
    });
    if (!res.ok) throw new Error(`Docs export falhou: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

function extractText(content: any[]): string {
    const parts: string[] = [];
    for (const el of content) {
        if (el.paragraph?.elements) {
            for (const e of el.paragraph.elements) {
                if (e.textRun?.content) parts.push(e.textRun.content);
            }
        }
    }
    return parts.join('');
}
