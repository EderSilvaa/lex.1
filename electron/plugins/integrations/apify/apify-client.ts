/**
 * Apify REST API Client (Phase 3 AIOS)
 */
import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://api.apify.com/v2';

async function headers(): Promise<Record<string, string>> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('apify');
    return { 'Authorization': `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' };
}

export interface ApifyActor { id: string; name: string; description?: string; username?: string; }
export interface ApifyRun { id: string; actId: string; status: string; startedAt: string; defaultDatasetId: string; }

export async function listActors(limit = 20): Promise<ApifyActor[]> {
    const h = await headers();
    const res = await fetch(`${BASE}/acts?limit=${limit}`, { headers: h });
    if (!res.ok) throw new Error(`Apify list falhou: ${res.status}`);
    const data = await res.json() as any;
    return (data.data?.items || []).map((a: any) => ({ id: a.id, name: a.name, description: a.description }));
}

export async function runActor(actorId: string, input: Record<string, any>): Promise<ApifyRun> {
    const h = await headers();
    const res = await fetch(`${BASE}/acts/${actorId}/runs`, {
        method: 'POST', headers: h, body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Apify run falhou: ${res.status}`);
    const data = await res.json() as any;
    return { id: data.data.id, actId: data.data.actId, status: data.data.status, startedAt: data.data.startedAt, defaultDatasetId: data.data.defaultDatasetId };
}

export async function getRunStatus(runId: string): Promise<ApifyRun> {
    const h = await headers();
    const res = await fetch(`${BASE}/actor-runs/${runId}`, { headers: h });
    if (!res.ok) throw new Error(`Apify status falhou: ${res.status}`);
    const data = await res.json() as any;
    return { id: data.data.id, actId: data.data.actId, status: data.data.status, startedAt: data.data.startedAt, defaultDatasetId: data.data.defaultDatasetId };
}

export async function getDatasetItems(datasetId: string, limit = 50): Promise<any[]> {
    const h = await headers();
    const res = await fetch(`${BASE}/datasets/${datasetId}/items?limit=${limit}`, { headers: h });
    if (!res.ok) throw new Error(`Apify dataset falhou: ${res.status}`);
    return await res.json() as any[];
}

export async function searchActors(query: string): Promise<ApifyActor[]> {
    const h = await headers();
    const res = await fetch(`${BASE}/store?search=${encodeURIComponent(query)}&limit=10`, { headers: h });
    if (!res.ok) throw new Error(`Apify search falhou: ${res.status}`);
    const data = await res.json() as any;
    return (data.data?.items || []).map((a: any) => ({ id: a.id || a.slug, name: a.title || a.name, description: a.description, username: a.username }));
}
