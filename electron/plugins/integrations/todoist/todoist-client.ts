/**
 * Todoist REST API v2 Client (Phase 3 AIOS)
 */
import { getPluginManager } from '../../plugin-manager';

const BASE = 'https://api.todoist.com/rest/v2';

async function headers(): Promise<Record<string, string>> {
    const pm = getPluginManager();
    const tokens = await pm.getValidToken('todoist');
    return { 'Authorization': `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' };
}

export interface TodoistTask { id: string; content: string; description: string; due?: { date: string; string: string }; priority: number; labels: string[]; projectId: string; url: string; }
export interface TodoistProject { id: string; name: string; color: string; }

export async function listTasks(opts?: { projectId?: string; filter?: string }): Promise<TodoistTask[]> {
    const h = await headers();
    const params = new URLSearchParams();
    if (opts?.projectId) params.set('project_id', opts.projectId);
    if (opts?.filter) params.set('filter', opts.filter);
    const res = await fetch(`${BASE}/tasks?${params}`, { headers: h });
    if (!res.ok) throw new Error(`Todoist list falhou: ${res.status}`);
    return (await res.json() as any[]).map(parseTask);
}

export async function createTask(content: string, opts?: { description?: string; dueString?: string; priority?: number; projectId?: string; labels?: string[] }): Promise<TodoistTask> {
    const h = await headers();
    const body: any = { content };
    if (opts?.description) body.description = opts.description;
    if (opts?.dueString) body.due_string = opts.dueString;
    if (opts?.priority) body.priority = opts.priority;
    if (opts?.projectId) body.project_id = opts.projectId;
    if (opts?.labels?.length) body.labels = opts.labels;
    const res = await fetch(`${BASE}/tasks`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Todoist create falhou: ${res.status}`);
    return parseTask(await res.json() as any);
}

export async function completeTask(taskId: string): Promise<void> {
    const h = await headers();
    const res = await fetch(`${BASE}/tasks/${taskId}/close`, { method: 'POST', headers: h });
    if (!res.ok) throw new Error(`Todoist complete falhou: ${res.status}`);
}

export async function updateTask(taskId: string, updates: { content?: string; description?: string; dueString?: string; priority?: number }): Promise<TodoistTask> {
    const h = await headers();
    const body: any = {};
    if (updates.content) body.content = updates.content;
    if (updates.description) body.description = updates.description;
    if (updates.dueString) body.due_string = updates.dueString;
    if (updates.priority) body.priority = updates.priority;
    const res = await fetch(`${BASE}/tasks/${taskId}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Todoist update falhou: ${res.status}`);
    return parseTask(await res.json() as any);
}

export async function listProjects(): Promise<TodoistProject[]> {
    const h = await headers();
    const res = await fetch(`${BASE}/projects`, { headers: h });
    if (!res.ok) throw new Error(`Todoist projects falhou: ${res.status}`);
    return await res.json() as TodoistProject[];
}

function parseTask(raw: any): TodoistTask {
    return { id: raw.id, content: raw.content, description: raw.description || '', due: raw.due, priority: raw.priority, labels: raw.labels || [], projectId: raw.project_id, url: raw.url };
}
