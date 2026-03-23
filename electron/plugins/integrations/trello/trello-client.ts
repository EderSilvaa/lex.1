/**
 * Trello REST API Client (Phase 3 AIOS)
 * Auth: API Key + Token (stored as "key:token" in accessToken)
 */
import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://api.trello.com/1';

async function authParams(): Promise<string> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('trello');
    const [key, token] = tokens.accessToken.split(':');
    return `key=${key}&token=${token}`;
}

export interface TrelloBoard { id: string; name: string; url: string; }
export interface TrelloList { id: string; name: string; }
export interface TrelloCard { id: string; name: string; desc: string; due: string | null; labels: string[]; url: string; }

export async function listBoards(): Promise<TrelloBoard[]> {
    const auth = await authParams();
    const res = await fetch(`${BASE}/members/me/boards?${auth}&fields=id,name,url`);
    if (!res.ok) throw new Error(`Trello boards falhou: ${res.status}`);
    return await res.json() as TrelloBoard[];
}

export async function listLists(boardId: string): Promise<TrelloList[]> {
    const auth = await authParams();
    const res = await fetch(`${BASE}/boards/${boardId}/lists?${auth}&fields=id,name`);
    if (!res.ok) throw new Error(`Trello lists falhou: ${res.status}`);
    return await res.json() as TrelloList[];
}

export async function listCards(listId: string): Promise<TrelloCard[]> {
    const auth = await authParams();
    const res = await fetch(`${BASE}/lists/${listId}/cards?${auth}&fields=id,name,desc,due,labels,url`);
    if (!res.ok) throw new Error(`Trello cards falhou: ${res.status}`);
    return (await res.json() as any[]).map(c => ({ ...c, labels: c.labels?.map((l: any) => l.name) || [] }));
}

export async function createCard(listId: string, name: string, desc?: string, due?: string): Promise<TrelloCard> {
    const auth = await authParams();
    const params = new URLSearchParams({ name });
    if (desc) params.set('desc', desc);
    if (due) params.set('due', due);
    const res = await fetch(`${BASE}/cards?${auth}&idList=${listId}&${params}`, { method: 'POST' });
    if (!res.ok) throw new Error(`Trello create falhou: ${res.status}`);
    return await res.json() as TrelloCard;
}

export async function moveCard(cardId: string, targetListId: string): Promise<TrelloCard> {
    const auth = await authParams();
    const res = await fetch(`${BASE}/cards/${cardId}?${auth}&idList=${targetListId}`, { method: 'PUT' });
    if (!res.ok) throw new Error(`Trello move falhou: ${res.status}`);
    return await res.json() as TrelloCard;
}

export async function updateCard(cardId: string, updates: { name?: string; desc?: string; due?: string }): Promise<TrelloCard> {
    const auth = await authParams();
    const params = new URLSearchParams();
    if (updates.name) params.set('name', updates.name);
    if (updates.desc) params.set('desc', updates.desc);
    if (updates.due) params.set('due', updates.due);
    const res = await fetch(`${BASE}/cards/${cardId}?${auth}&${params}`, { method: 'PUT' });
    if (!res.ok) throw new Error(`Trello update falhou: ${res.status}`);
    return await res.json() as TrelloCard;
}
