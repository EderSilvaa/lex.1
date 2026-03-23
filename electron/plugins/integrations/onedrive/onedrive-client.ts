/**
 * OneDrive / SharePoint Client (Phase 3 AIOS — Plugins)
 *
 * REST wrapper for Microsoft Graph API — Drive endpoints.
 * Tokens obtidos via PluginManager.getValidToken('onedrive').
 */

import * as fs from 'fs/promises';
import { getPluginManager } from '../../plugin-manager';

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function headers(): Promise<Record<string, string>> {
    const tokens = await getPluginManager().getValidToken('onedrive');
    return { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' };
}

export async function listFiles(folderPath?: string) {
    const url = folderPath
        ? `${GRAPH}/me/drive/root:/${encodeURIComponent(folderPath)}:/children`
        : `${GRAPH}/me/drive/root/children`;
    const res = await fetch(url, { headers: await headers() });
    if (!res.ok) throw new Error(`OneDrive listFiles ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data['value'] || [];
}

export async function uploadFile(localPath: string, remotePath: string): Promise<any> {
    const tokens = await getPluginManager().getValidToken('onedrive');
    const fileData = await fs.readFile(localPath);
    const res = await fetch(`${GRAPH}/me/drive/root:/${encodeURIComponent(remotePath)}:/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/octet-stream' },
        body: fileData,
    });
    if (!res.ok) throw new Error(`OneDrive upload ${res.status}: ${await res.text()}`);
    return res.json();
}

export async function downloadFile(itemId: string): Promise<Buffer> {
    const tokens = await getPluginManager().getValidToken('onedrive');
    const res = await fetch(`${GRAPH}/me/drive/items/${itemId}/content`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` }, redirect: 'follow',
    });
    if (!res.ok) throw new Error(`OneDrive download ${res.status}: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
}

export async function searchFiles(query: string) {
    const res = await fetch(`${GRAPH}/me/drive/root/search(q='${encodeURIComponent(query)}')`, { headers: await headers() });
    if (!res.ok) throw new Error(`OneDrive search ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data['value'] || [];
}

export async function shareFile(itemId: string, type = 'view', scope = 'anonymous') {
    const res = await fetch(`${GRAPH}/me/drive/items/${itemId}/createLink`, {
        method: 'POST', headers: await headers(), body: JSON.stringify({ type, scope }),
    });
    if (!res.ok) throw new Error(`OneDrive share ${res.status}: ${await res.text()}`);
    return res.json();
}

export async function listSiteFiles(siteId: string, folderPath?: string) {
    const url = folderPath
        ? `${GRAPH}/sites/${siteId}/drive/root:/${encodeURIComponent(folderPath)}:/children`
        : `${GRAPH}/sites/${siteId}/drive/root/children`;
    const res = await fetch(url, { headers: await headers() });
    if (!res.ok) throw new Error(`SharePoint listSiteFiles ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data['value'] || [];
}
