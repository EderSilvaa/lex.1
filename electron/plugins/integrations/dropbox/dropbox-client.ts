/**
 * Dropbox Client (Phase 3 AIOS — Plugins)
 *
 * REST wrapper for Dropbox API v2.
 * Tokens obtidos via PluginManager.getValidToken('dropbox').
 */

import * as fs from 'fs/promises';
import { getPluginManager } from '../../plugin-manager';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

async function getToken(): Promise<string> {
    const tokens = await getPluginManager().getValidToken('dropbox');
    return tokens.accessToken;
}

export async function listFolder(folderPath = '') {
    const token = await getToken();
    const res = await fetch(`${API}/files/list_folder`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath || '', recursive: false, limit: 100 }),
    });
    if (!res.ok) throw new Error(`Dropbox listFolder ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data['entries'] || [];
}

export async function uploadFile(localPath: string, dropboxPath: string): Promise<any> {
    const token = await getToken();
    const fileData = await fs.readFile(localPath);
    const res = await fetch(`${CONTENT}/files/upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath, mode: 'add', autorename: true }),
        },
        body: fileData,
    });
    if (!res.ok) throw new Error(`Dropbox upload ${res.status}: ${await res.text()}`);
    return res.json();
}

export async function downloadFile(dropboxPath: string): Promise<{ buffer: Buffer; metadata: any }> {
    const token = await getToken();
    const res = await fetch(`${CONTENT}/files/download`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath }) },
    });
    if (!res.ok) throw new Error(`Dropbox download ${res.status}: ${await res.text()}`);
    const metadata = JSON.parse(res.headers.get('dropbox-api-result') || '{}');
    return { buffer: Buffer.from(await res.arrayBuffer()), metadata };
}

export async function searchFiles(query: string) {
    const token = await getToken();
    const res = await fetch(`${API}/files/search_v2`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, options: { max_results: 30 } }),
    });
    if (!res.ok) throw new Error(`Dropbox search ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data['matches'] || []).map((m: any) => m['metadata']?.['metadata'] || m['metadata']);
}

export async function createSharedLink(dropboxPath: string) {
    const token = await getToken();
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await fetch(`${API}/sharing/create_shared_link_with_settings`, {
        method: 'POST', headers: h, body: JSON.stringify({ path: dropboxPath, settings: { requested_visibility: 'public' } }),
    });
    if (!res.ok) {
        const text = await res.text();
        if (text.includes('shared_link_already_exists')) {
            const res2 = await fetch(`${API}/sharing/list_shared_links`, {
                method: 'POST', headers: h, body: JSON.stringify({ path: dropboxPath, direct_only: true }),
            });
            if (!res2.ok) throw new Error(`Dropbox listLinks ${res2.status}: ${await res2.text()}`);
            const data = await res2.json();
            return data['links']?.[0];
        }
        throw new Error(`Dropbox share ${res.status}: ${text}`);
    }
    return res.json();
}
