/**
 * Slack Client (Phase 3 AIOS — Plugins)
 *
 * REST wrapper for Slack Web API.
 * Tokens obtidos via PluginManager.getValidToken('slack').
 */

import { getPluginManager } from '../../plugin-manager';

const API = 'https://slack.com/api';

async function getToken(): Promise<string> {
    const tokens = await getPluginManager().getValidToken('slack');
    return tokens.accessToken;
}

async function slackPost(method: string, body?: Record<string, any>): Promise<any> {
    const token = await getToken();
    const res = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Slack ${method} HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data['ok']) throw new Error(`Slack ${method}: ${data['error'] || 'unknown error'}`);
    return data;
}

export async function listChannels(limit = 100) {
    const data = await slackPost('conversations.list', { types: 'public_channel,private_channel', limit, exclude_archived: true });
    return data['channels'] || [];
}

export async function sendMessage(channel: string, text: string) {
    return slackPost('chat.postMessage', { channel, text });
}

export async function searchMessages(query: string) {
    const token = await getToken();
    const res = await fetch(`${API}/search.messages?query=${encodeURIComponent(query)}&count=20`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Slack search HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data['ok']) throw new Error(`Slack search: ${data['error']}`);
    return data['messages']?.['matches'] || [];
}

export async function readChannel(channelId: string, limit = 20) {
    const data = await slackPost('conversations.history', { channel: channelId, limit });
    return data['messages'] || [];
}
