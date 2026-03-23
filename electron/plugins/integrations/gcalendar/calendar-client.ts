/**
 * Google Calendar REST API Client (Phase 3 AIOS)
 *
 * Wrapper para Calendar API v3 via fetch.
 */

import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary';

async function headers(): Promise<Record<string, string>> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('gcalendar');
    return {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
    };
}

export interface CalendarEvent {
    id: string;
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    attendees?: string[];
    htmlLink?: string;
}

/** Lista eventos futuros */
export async function listEvents(opts: { daysAhead?: number; maxResults?: number } = {}): Promise<CalendarEvent[]> {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + (opts.daysAhead || 7) * 86400000).toISOString();

    const params = new URLSearchParams({
        timeMin,
        timeMax,
        maxResults: String(opts.maxResults || 20),
        singleEvents: 'true',
        orderBy: 'startTime',
    });

    const h = await headers();
    const res = await fetch(`${BASE}/events?${params}`, { headers: h });
    if (!res.ok) throw new Error(`Calendar list falhou: ${res.status}`);

    const data = await res.json() as any;
    return (data.items || []).map(parseEvent);
}

/** Busca eventos por texto/data */
export async function searchEvents(query: string, opts?: { timeMin?: string; timeMax?: string }): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
        q: query,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '20',
    });
    if (opts?.timeMin) params.set('timeMin', new Date(opts.timeMin).toISOString());
    if (opts?.timeMax) params.set('timeMax', new Date(opts.timeMax).toISOString());

    const h = await headers();
    const res = await fetch(`${BASE}/events?${params}`, { headers: h });
    if (!res.ok) throw new Error(`Calendar search falhou: ${res.status}`);

    const data = await res.json() as any;
    return (data.items || []).map(parseEvent);
}

/** Cria evento */
export async function createEvent(event: {
    summary: string;
    start: string;
    end?: string;
    description?: string;
    location?: string;
    attendees?: string[];
}): Promise<CalendarEvent> {
    const startDate = new Date(event.start);
    const endDate = event.end ? new Date(event.end) : new Date(startDate.getTime() + 3600000); // default 1h

    const body: any = {
        summary: event.summary,
        start: { dateTime: startDate.toISOString() },
        end: { dateTime: endDate.toISOString() },
    };
    if (event.description) body.description = event.description;
    if (event.location) body.location = event.location;
    if (event.attendees?.length) {
        body.attendees = event.attendees.map(email => ({ email }));
    }

    const h = await headers();
    const res = await fetch(`${BASE}/events`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Calendar create falhou: ${res.status} ${text}`);
    }

    const data = await res.json() as any;
    return parseEvent(data);
}

/** Atualiza evento */
export async function updateEvent(eventId: string, updates: {
    summary?: string;
    start?: string;
    end?: string;
    description?: string;
    location?: string;
}): Promise<CalendarEvent> {
    const body: any = {};
    if (updates.summary) body.summary = updates.summary;
    if (updates.description) body.description = updates.description;
    if (updates.location) body.location = updates.location;
    if (updates.start) body.start = { dateTime: new Date(updates.start).toISOString() };
    if (updates.end) body.end = { dateTime: new Date(updates.end).toISOString() };

    const h = await headers();
    const res = await fetch(`${BASE}/events/${eventId}`, {
        method: 'PATCH',
        headers: h,
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Calendar update falhou: ${res.status}`);
    const data = await res.json() as any;
    return parseEvent(data);
}

/** Deleta evento */
export async function deleteEvent(eventId: string): Promise<void> {
    const h = await headers();
    const res = await fetch(`${BASE}/events/${eventId}`, { method: 'DELETE', headers: h });
    if (!res.ok && res.status !== 204) throw new Error(`Calendar delete falhou: ${res.status}`);
}

// ============================================================================

function parseEvent(raw: any): CalendarEvent {
    return {
        id: raw.id,
        summary: raw.summary || '(sem título)',
        description: raw.description,
        location: raw.location,
        start: raw.start?.dateTime || raw.start?.date || '',
        end: raw.end?.dateTime || raw.end?.date || '',
        attendees: raw.attendees?.map((a: any) => a.email),
        htmlLink: raw.htmlLink,
    };
}
