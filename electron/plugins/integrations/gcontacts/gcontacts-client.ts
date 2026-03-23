/**
 * Google Contacts Client (Phase 3 AIOS — Plugins)
 *
 * REST wrapper for Google People API.
 * Tokens obtidos via PluginManager.getValidToken('gcontacts').
 */

import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://people.googleapis.com/v1';
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations';

async function headers(): Promise<Record<string, string>> {
    const tokens = await getPluginManager().getValidToken('gcontacts');
    return { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' };
}

export async function listContacts(maxResults = 50) {
    const url = `${BASE}/people/me/connections?personFields=${PERSON_FIELDS}&pageSize=${maxResults}&sortOrder=LAST_MODIFIED_DESCENDING`;
    const res = await fetch(url, { headers: await headers() });
    if (!res.ok) throw new Error(`Google Contacts list ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data['connections'] || [];
}

export async function searchContacts(query: string) {
    const url = `${BASE}/people:searchContacts?query=${encodeURIComponent(query)}&readMask=${PERSON_FIELDS}&pageSize=30`;
    const res = await fetch(url, { headers: await headers() });
    if (!res.ok) throw new Error(`Google Contacts search ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data['results'] || []).map((r: any) => r['person']);
}

export async function createContact(opts: { nome: string; email?: string; telefone?: string; empresa?: string }) {
    const body: any = { names: [{ givenName: opts.nome }] };
    if (opts.email) body['emailAddresses'] = [{ value: opts.email }];
    if (opts.telefone) body['phoneNumbers'] = [{ value: opts.telefone }];
    if (opts.empresa) body['organizations'] = [{ name: opts.empresa }];

    const res = await fetch(`${BASE}/people:createContact`, {
        method: 'POST', headers: await headers(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google Contacts create ${res.status}: ${await res.text()}`);
    return res.json();
}

export async function updateContact(
    resourceName: string,
    data: { nome?: string; email?: string; telefone?: string; empresa?: string },
    etag: string
) {
    const body: any = { etag };
    const fields: string[] = [];
    if (data.nome) { body['names'] = [{ givenName: data.nome }]; fields.push('names'); }
    if (data.email) { body['emailAddresses'] = [{ value: data.email }]; fields.push('emailAddresses'); }
    if (data.telefone) { body['phoneNumbers'] = [{ value: data.telefone }]; fields.push('phoneNumbers'); }
    if (data.empresa) { body['organizations'] = [{ name: data.empresa }]; fields.push('organizations'); }

    const url = `${BASE}/${resourceName}:updateContact?updatePersonFields=${fields.join(',')}`;
    const res = await fetch(url, { method: 'PATCH', headers: await headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Google Contacts update ${res.status}: ${await res.text()}`);
    return res.json();
}

export async function getContact(resourceName: string) {
    const url = `${BASE}/${resourceName}?personFields=${PERSON_FIELDS}`;
    const res = await fetch(url, { headers: await headers() });
    if (!res.ok) throw new Error(`Google Contacts get ${res.status}: ${await res.text()}`);
    return res.json();
}
