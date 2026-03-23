/**
 * Notion API Client (Phase 3 AIOS)
 */
import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

async function headers(): Promise<Record<string, string>> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('notion');
    return { 'Authorization': `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json', 'Notion-Version': NOTION_VERSION };
}

export interface NotionPage { id: string; title: string; url: string; lastEdited: string; }

export async function searchPages(query: string): Promise<NotionPage[]> {
    const h = await headers();
    const res = await fetch(`${BASE}/search`, { method: 'POST', headers: h, body: JSON.stringify({ query, filter: { property: 'object', value: 'page' }, page_size: 20 }) });
    if (!res.ok) throw new Error(`Notion search falhou: ${res.status}`);
    const data = await res.json() as any;
    return (data.results || []).map(parsePage);
}

export async function getPageContent(pageId: string): Promise<string> {
    const h = await headers();
    const res = await fetch(`${BASE}/blocks/${pageId}/children?page_size=100`, { headers: h });
    if (!res.ok) throw new Error(`Notion blocks falhou: ${res.status}`);
    const data = await res.json() as any;
    return (data.results || []).map(blockToText).filter(Boolean).join('\n');
}

export async function createPage(parentId: string, title: string, content?: string): Promise<NotionPage> {
    const h = await headers();
    const children: any[] = content ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content } }] } }] : [];
    const body: any = {
        parent: { page_id: parentId },
        properties: { title: { title: [{ text: { content: title } }] } },
        children,
    };
    const res = await fetch(`${BASE}/pages`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Notion create falhou: ${res.status} ${await res.text()}`);
    return parsePage(await res.json() as any);
}

export async function appendBlocks(pageId: string, text: string): Promise<void> {
    const h = await headers();
    const res = await fetch(`${BASE}/blocks/${pageId}/children`, {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text } }] } }] }),
    });
    if (!res.ok) throw new Error(`Notion append falhou: ${res.status}`);
}

export async function listRecentPages(): Promise<NotionPage[]> {
    const h = await headers();
    const res = await fetch(`${BASE}/search`, { method: 'POST', headers: h, body: JSON.stringify({ filter: { property: 'object', value: 'page' }, sort: { direction: 'descending', timestamp: 'last_edited_time' }, page_size: 20 }) });
    if (!res.ok) throw new Error(`Notion list falhou: ${res.status}`);
    const data = await res.json() as any;
    return (data.results || []).map(parsePage);
}

function parsePage(raw: any): NotionPage {
    const titleProp = raw.properties?.title || raw.properties?.Name;
    const titleText = titleProp?.title?.[0]?.plain_text || titleProp?.title?.[0]?.text?.content || '(sem título)';
    return { id: raw.id, title: titleText, url: raw.url || '', lastEdited: raw.last_edited_time || '' };
}

function blockToText(block: any): string {
    const richText = block[block.type]?.rich_text;
    if (!richText) return '';
    return richText.map((t: any) => t.plain_text || '').join('');
}
