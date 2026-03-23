/**
 * Microsoft Teams Client (Phase 3 AIOS — Plugins)
 *
 * REST wrapper for Microsoft Graph API — Teams endpoints.
 * Tokens obtidos via PluginManager.getValidToken('teams').
 */

import { getPluginManager } from '../../plugin-manager';

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function headers(): Promise<Record<string, string>> {
    const tokens = await getPluginManager().getValidToken('teams');
    return { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' };
}

export async function listTeams() {
    const res = await fetch(`${GRAPH}/me/joinedTeams`, { headers: await headers() });
    if (!res.ok) throw new Error(`Teams listTeams ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data['value'] || [];
}

export async function listChannels(teamId: string) {
    const res = await fetch(`${GRAPH}/teams/${teamId}/channels`, { headers: await headers() });
    if (!res.ok) throw new Error(`Teams listChannels ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data['value'] || [];
}

export async function sendChannelMessage(teamId: string, channelId: string, content: string) {
    const res = await fetch(`${GRAPH}/teams/${teamId}/channels/${channelId}/messages`, {
        method: 'POST', headers: await headers(), body: JSON.stringify({ body: { content } }),
    });
    if (!res.ok) throw new Error(`Teams sendChannelMessage ${res.status}: ${await res.text()}`);
    return res.json();
}

export async function sendChat(chatId: string, content: string) {
    const res = await fetch(`${GRAPH}/chats/${chatId}/messages`, {
        method: 'POST', headers: await headers(), body: JSON.stringify({ body: { content } }),
    });
    if (!res.ok) throw new Error(`Teams sendChat ${res.status}: ${await res.text()}`);
    return res.json();
}

export async function searchMessages(query: string) {
    const res = await fetch(`${GRAPH}/search/query`, {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({ requests: [{ entityTypes: ['chatMessage'], query: { queryString: query }, from: 0, size: 25 }] }),
    });
    if (!res.ok) throw new Error(`Teams search ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data['value']?.[0]?.['hitsContainers']?.[0]?.['hits'] || [];
}

export async function createOnlineMeeting(subject: string, startTime: string, endTime: string, attendees?: string[]) {
    const body: any = { subject, startDateTime: startTime, endDateTime: endTime };
    if (attendees?.length) {
        body['participants'] = { attendees: attendees.map(email => ({ upn: email, role: 'attendee' })) };
    }
    const res = await fetch(`${GRAPH}/me/onlineMeetings`, {
        method: 'POST', headers: await headers(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Teams createMeeting ${res.status}: ${await res.text()}`);
    return res.json();
}
