/**
 * CLI Scheduler - OS-native scheduling (schtasks / crontab)
 *
 * Cada schedule cria uma task no sistema operacional que executa
 * `node bin/lex.js --schedule-file <payload>` como one-shot, com output em log.
 *
 * Persistencia: `userDataDir/cli-schedules.json` (plain JSON).
 * Logs: `userDataDir/logs/<id>.log`.
 * Batch (Windows): `userDataDir/schedules/<id>.bat`.
 * Payloads: `userDataDir/schedule-payloads/<id>.json`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';

export interface CliSchedule {
    id: string;
    goal: string;
    cron: string;
    name: string;
    createdAt: number;
    enabled: boolean;
    osTaskName: string;
}

interface ScheduleStoreData {
    schedules: CliSchedule[];
}

function schedulesFile(dir: string): string { return path.join(dir, 'cli-schedules.json'); }
function logsDir(dir: string): string { return path.join(dir, 'logs'); }
function batchDir(dir: string): string { return path.join(dir, 'schedules'); }
function payloadDir(dir: string): string { return path.join(dir, 'schedule-payloads'); }

function getLexBinPath(): string {
    return path.resolve(__dirname, '..', '..', 'bin', 'lex.js');
}

function getAbsoluteUserDataDir(userDataDir: string): string {
    return path.resolve(userDataDir);
}

function payloadPath(userDataDir: string, scheduleId: string): string {
    return path.join(payloadDir(userDataDir), `${scheduleId}.json`);
}

function loadStore(dir: string): ScheduleStoreData {
    try {
        return JSON.parse(fs.readFileSync(schedulesFile(dir), 'utf8'));
    } catch {
        return { schedules: [] };
    }
}

function saveStore(dir: string, store: ScheduleStoreData): void {
    fs.writeFileSync(schedulesFile(dir), JSON.stringify(store, null, 2), 'utf8');
}

function cronToSchtasksArgs(cron: string): string[] | null {
    const [min, hour, dom, month, dow] = cron.trim().split(/\s+/);
    if (!min || !hour || !dom || !month || !dow) return null;

    if (dom === '*' && month === '*' && dow === '*' && /^\d+$/.test(min) && /^\d+$/.test(hour)) {
        return ['/sc', 'DAILY', '/st', `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`];
    }

    if (dom === '*' && month === '*' && dow !== '*' && /^\d+$/.test(min) && /^\d+$/.test(hour)) {
        const dayMap: Record<string, string> = {
            '0': 'SUN', '1': 'MON', '2': 'TUE', '3': 'WED',
            '4': 'THU', '5': 'FRI', '6': 'SAT',
        };
        const days = dow.split(',').map(d => dayMap[d] || d).join(',');
        return ['/sc', 'WEEKLY', '/d', days, '/st', `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`];
    }

    if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
        return ['/sc', 'MINUTE', '/mo', min.slice(2)];
    }

    if (min === '0' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
        return ['/sc', 'HOURLY', '/mo', hour.slice(2)];
    }

    return null;
}

function cleanupScheduleArtifacts(userDataDir: string, scheduleId: string): void {
    try { fs.unlinkSync(path.join(batchDir(userDataDir), `${scheduleId}.bat`)); } catch { /* ok */ }
    try { fs.unlinkSync(payloadPath(userDataDir, scheduleId)); } catch { /* ok */ }
}

function createOsTask(schedule: CliSchedule, userDataDir: string): string | null {
    const absUserDataDir = getAbsoluteUserDataDir(userDataDir);
    const nodePath = process.execPath;
    const lexPath = getLexBinPath();
    const logPath = path.join(logsDir(absUserDataDir), `${schedule.id}.log`);
    const schedulePayload = payloadPath(absUserDataDir, schedule.id);

    fs.mkdirSync(logsDir(absUserDataDir), { recursive: true });
    fs.mkdirSync(payloadDir(absUserDataDir), { recursive: true });
    fs.writeFileSync(schedulePayload, JSON.stringify({ goal: schedule.goal }, null, 2), 'utf8');

    if (process.platform === 'win32') {
        const args = cronToSchtasksArgs(schedule.cron);
        if (!args) {
            cleanupScheduleArtifacts(absUserDataDir, schedule.id);
            return `cron "${schedule.cron}" não suportado pelo Task Scheduler. ` +
                   `Padrões aceitos: "M H * * *" (diário), "*/N * * * *" (a cada N min), ` +
                   `"0 */N * * *" (a cada N horas), "M H * * DOW" (semanal)`;
        }

        fs.mkdirSync(batchDir(absUserDataDir), { recursive: true });
        const batPath = path.join(batchDir(absUserDataDir), `${schedule.id}.bat`);
        const bat = `@echo off\r\n"${nodePath}" "${lexPath}" --user-data-dir "${absUserDataDir}" --schedule-file "${schedulePayload}" >> "${logPath}" 2>&1\r\n`;
        fs.writeFileSync(batPath, bat, 'utf8');

        try {
            execSync(
                `schtasks /create /tn "${schedule.osTaskName}" /tr "${batPath}" ${args.join(' ')} /f`,
                { timeout: 10000, encoding: 'utf8', stdio: 'pipe' },
            );
            return null;
        } catch (err: any) {
            cleanupScheduleArtifacts(absUserDataDir, schedule.id);
            return `schtasks falhou: ${(err?.stderr || err?.message || '').toString().trim().split('\n')[0]}`;
        }
    }

    const cmd = `"${nodePath}" "${lexPath}" --user-data-dir "${absUserDataDir}" --schedule-file "${schedulePayload}" >> "${logPath}" 2>&1`;
    const marker = `# ${schedule.osTaskName}`;
    const cronLine = `${schedule.cron} ${cmd} ${marker}`;

    try {
        const existing = (() => {
            try { return execSync('crontab -l 2>/dev/null', { encoding: 'utf8' }); }
            catch { return ''; }
        })();
        const filtered = existing.split('\n').filter(l => !l.includes(marker));
        filtered.push(cronLine);
        const tmp = path.join(absUserDataDir, '.crontab-tmp');
        fs.writeFileSync(tmp, filtered.join('\n') + '\n', 'utf8');
        execSync(`crontab "${tmp}"`, { timeout: 5000 });
        fs.unlinkSync(tmp);
        return null;
    } catch (err: any) {
        cleanupScheduleArtifacts(absUserDataDir, schedule.id);
        return `crontab falhou: ${err?.message || err}`;
    }
}

function removeOsTask(schedule: CliSchedule, userDataDir: string): void {
    const absUserDataDir = getAbsoluteUserDataDir(userDataDir);
    if (process.platform === 'win32') {
        try {
            execSync(`schtasks /delete /tn "${schedule.osTaskName}" /f`, {
                timeout: 5000,
                stdio: 'pipe',
            });
        } catch { /* task pode não existir */ }
        cleanupScheduleArtifacts(absUserDataDir, schedule.id);
        return;
    }

    try {
        const existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
        const filtered = existing.split('\n').filter(l => !l.includes(schedule.osTaskName));
        const tmp = path.join(absUserDataDir, '.crontab-tmp');
        fs.writeFileSync(tmp, filtered.join('\n') + '\n', 'utf8');
        execSync(`crontab "${tmp}"`, { timeout: 5000 });
        fs.unlinkSync(tmp);
    } catch { /* ok */ }
    cleanupScheduleArtifacts(absUserDataDir, schedule.id);
}

export function addSchedule(
    userDataDir: string, goal: string, cron: string,
): { schedule?: CliSchedule; error?: string } {
    const id = randomUUID().slice(0, 8);
    const schedule: CliSchedule = {
        id,
        goal,
        cron,
        name: goal.slice(0, 60),
        createdAt: Date.now(),
        enabled: true,
        osTaskName: `LEX_${id}`,
    };

    const error = createOsTask(schedule, userDataDir) ?? undefined;
    if (error) {
        return { error };
    }

    const store = loadStore(userDataDir);
    store.schedules.push(schedule);
    saveStore(userDataDir, store);

    return { schedule };
}

export function removeSchedule(userDataDir: string, idPrefix: string): CliSchedule | null {
    const store = loadStore(userDataDir);
    const idx = store.schedules.findIndex(s => s.id.startsWith(idPrefix));
    if (idx < 0) return null;

    const schedule = store.schedules[idx]!;
    removeOsTask(schedule, userDataDir);
    store.schedules.splice(idx, 1);
    saveStore(userDataDir, store);

    return schedule;
}

export function listSchedules(userDataDir: string): CliSchedule[] {
    return loadStore(userDataDir).schedules;
}

export function getScheduleLogPath(userDataDir: string, idPrefix: string): string | null {
    const store = loadStore(userDataDir);
    const s = store.schedules.find(sc => sc.id.startsWith(idPrefix));
    if (!s) return null;
    return path.join(getAbsoluteUserDataDir(userDataDir), 'logs', `${s.id}.log`);
}

export function describeCron(cron: string): string {
    const [min, hour, , , dow] = cron.trim().split(/\s+/);
    if (!min || !hour) return cron;

    if (dow === '*' && /^\d+$/.test(min) && /^\d+$/.test(hour)) {
        return `diário às ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    }
    if (min.startsWith('*/') && hour === '*') {
        return `a cada ${min.slice(2)} min`;
    }
    if (min === '0' && hour.startsWith('*/')) {
        return `a cada ${hour.slice(2)}h`;
    }
    if (dow !== '*' && /^\d+$/.test(min) && /^\d+$/.test(hour)) {
        const dayMap: Record<string, string> = {
            '0': 'dom', '1': 'seg', '2': 'ter', '3': 'qua',
            '4': 'qui', '5': 'sex', '6': 'sáb',
        };
        const days = (dow || '').split(',').map(d => dayMap[d] || d).join(',');
        return `${days} às ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    }
    return cron;
}
