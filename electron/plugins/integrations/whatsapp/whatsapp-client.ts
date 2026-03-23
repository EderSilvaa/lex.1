/**
 * WhatsApp Business Cloud API Client (Phase 3 AIOS)
 */
import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://graph.facebook.com/v18.0';

async function headers(): Promise<Record<string, string>> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('whatsapp');
    return { 'Authorization': `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' };
}

export async function sendTextMessage(to: string, text: string, phoneNumberId: string): Promise<string> {
    const h = await headers();
    const res = await fetch(`${BASE}/${phoneNumberId}/messages`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
    });
    if (!res.ok) throw new Error(`WhatsApp send falhou: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    return data.messages?.[0]?.id || 'sent';
}

export async function sendTemplateMessage(to: string, templateName: string, language: string, phoneNumberId: string, components?: any[]): Promise<string> {
    const h = await headers();
    const template: any = { name: templateName, language: { code: language } };
    if (components?.length) template.components = components;
    const res = await fetch(`${BASE}/${phoneNumberId}/messages`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template }),
    });
    if (!res.ok) throw new Error(`WhatsApp template falhou: ${res.status}`);
    const data = await res.json() as any;
    return data.messages?.[0]?.id || 'sent';
}
