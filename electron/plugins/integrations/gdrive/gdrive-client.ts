/**
 * Google Drive REST API Client (Phase 3 AIOS)
 */

import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function headers(): Promise<Record<string, string>> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('gdrive');
    return { 'Authorization': `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' };
}

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    size?: string;
    webViewLink?: string;
}

export async function listFiles(opts: { query?: string; folderId?: string; maxResults?: number } = {}): Promise<DriveFile[]> {
    const parts: string[] = ['trashed=false'];
    if (opts.folderId) parts.push(`'${opts.folderId}' in parents`);
    if (opts.query) parts.push(`name contains '${opts.query}'`);

    const params = new URLSearchParams({
        q: parts.join(' and '),
        pageSize: String(opts.maxResults || 20),
        fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
        orderBy: 'modifiedTime desc',
    });

    const h = await headers();
    const res = await fetch(`${BASE}/files?${params}`, { headers: h });
    if (!res.ok) throw new Error(`Drive list falhou: ${res.status}`);
    const data = await res.json() as any;
    return data.files || [];
}

export async function downloadFile(fileId: string): Promise<Buffer> {
    const h = await headers();
    const res = await fetch(`${BASE}/files/${fileId}?alt=media`, { headers: h });
    if (!res.ok) throw new Error(`Drive download falhou: ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
}

export async function uploadFile(name: string, content: Buffer, mimeType: string, folderId?: string): Promise<DriveFile> {
    const metadata: any = { name, mimeType };
    if (folderId) metadata.parents = [folderId];

    const boundary = '----LexUploadBoundary';
    const body = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ].join('');

    const pm = getPluginManager();
    const tokens = await pm.getValidToken('gdrive');

    const bodyBuffer = Buffer.concat([
        Buffer.from(body, 'utf-8'),
        content,
        Buffer.from(`\r\n--${boundary}--`, 'utf-8'),
    ]);

    const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: bodyBuffer,
    });

    if (!res.ok) throw new Error(`Drive upload falhou: ${res.status}`);
    return await res.json() as DriveFile;
}

export async function searchFiles(query: string): Promise<DriveFile[]> {
    return listFiles({ query });
}

export async function shareFile(fileId: string, email: string, role: 'reader' | 'writer' = 'reader'): Promise<void> {
    const h = await headers();
    const res = await fetch(`${BASE}/files/${fileId}/permissions`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ type: 'user', role, emailAddress: email }),
    });
    if (!res.ok) throw new Error(`Drive share falhou: ${res.status}`);
}
