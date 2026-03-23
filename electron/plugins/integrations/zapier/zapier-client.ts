/**
 * Zapier Webhooks Client (Phase 3 AIOS)
 */

let webhookStore: Array<{ name: string; url: string; description: string }> = [];

export async function triggerWebhook(webhookUrl: string, data: Record<string, any>): Promise<any> {
    const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Zapier webhook falhou: ${res.status}`);
    try { return await res.json(); } catch { return { status: 'ok' }; }
}

export function listWebhooks(): Array<{ name: string; url: string; description: string }> {
    // Tenta carregar do electron-store
    try {
        const Store = require('electron-store');
        const store = new Store({ name: 'lex-plugins' });
        webhookStore = store.get('zapier-webhooks', []) as typeof webhookStore;
    } catch { /* fora do electron */ }
    return webhookStore;
}

export function saveWebhook(name: string, url: string, description: string): void {
    webhookStore = listWebhooks().filter(w => w.name !== name);
    webhookStore.push({ name, url, description });
    try {
        const Store = require('electron-store');
        const store = new Store({ name: 'lex-plugins' });
        store.set('zapier-webhooks', webhookStore);
    } catch { /* fora do electron */ }
}
