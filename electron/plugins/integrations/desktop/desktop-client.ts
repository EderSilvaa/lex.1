/**
 * Desktop Client — Windows 11 (Phase 3 AIOS)
 *
 * Utility functions for app launching and window management.
 * Uses child_process + PowerShell — zero external dependencies.
 */

import { exec } from 'child_process';

// ---------------------------------------------------------------------------
// PowerShell helper
// ---------------------------------------------------------------------------

function runPowerShell(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(
            `powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`,
            { encoding: 'utf-8' },
            (err, stdout, stderr) => {
                if (err) reject(new Error(stderr || err.message));
                else resolve(stdout.trim());
            },
        );
    });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WindowInfo {
    title: string;
    pid: number;
    processName: string;
}

export interface ProcessInfo {
    name: string;
    pid: number;
    memory: number; // bytes
}

export interface LaunchResult {
    pid: number;
    name: string;
}

// ---------------------------------------------------------------------------
// launchApp
// ---------------------------------------------------------------------------

export async function launchApp(appNameOrPath: string): Promise<LaunchResult> {
    return new Promise((resolve, reject) => {
        // Use `start "" "path"` for Windows — the empty title is required
        const cmd = `start "" "${appNameOrPath}"`;
        exec(cmd, { shell: 'cmd.exe' }, (err) => {
            if (err) {
                reject(new Error(`Falha ao abrir "${appNameOrPath}": ${err.message}`));
                return;
            }
            // Give the process a moment to appear, then grab its PID
            setTimeout(async () => {
                try {
                    // Extract the base name without extension/path for matching
                    const baseName = appNameOrPath
                        .replace(/\\/g, '/')
                        .split('/')
                        .pop()!
                        .replace(/\.exe$/i, '');

                    const ps = `Get-Process | Where-Object { $_.ProcessName -like '*${baseName}*' } | Sort-Object StartTime -Descending | Select-Object -First 1 -Property Id, ProcessName | ConvertTo-Json`;
                    const raw = await runPowerShell(ps);
                    if (!raw) {
                        resolve({ pid: 0, name: baseName });
                        return;
                    }
                    const proc = JSON.parse(raw);
                    resolve({ pid: proc.Id ?? 0, name: proc.ProcessName ?? baseName });
                } catch {
                    // App launched but we couldn't grab the PID — still a success
                    resolve({ pid: 0, name: appNameOrPath });
                }
            }, 1500);
        });
    });
}

// ---------------------------------------------------------------------------
// listWindows
// ---------------------------------------------------------------------------

export async function listWindows(): Promise<WindowInfo[]> {
    const ps = `Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress`;
    const raw = await runPowerShell(ps);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const items: any[] = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((p) => ({
        title: p.MainWindowTitle ?? '',
        pid: p.Id ?? 0,
        processName: p.ProcessName ?? '',
    }));
}

// ---------------------------------------------------------------------------
// focusWindow
// ---------------------------------------------------------------------------

export async function focusWindow(titleOrPid: string | number): Promise<boolean> {
    const isNumber = typeof titleOrPid === 'number' || /^\d+$/.test(String(titleOrPid));

    let ps: string;
    if (isNumber) {
        const pid = Number(titleOrPid);
        ps = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@
$proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
    [Win32Focus]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
    [Win32Focus]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Write-Output 'OK'
} else { Write-Output 'NOT_FOUND' }
`;
    } else {
        const escaped = String(titleOrPid).replace(/'/g, "''");
        ps = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@
$proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*${escaped}*' } | Select-Object -First 1
if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
    [Win32Focus]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
    [Win32Focus]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Write-Output 'OK'
} else { Write-Output 'NOT_FOUND' }
`;
    }

    const out = await runPowerShell(ps);
    return out.includes('OK');
}

// ---------------------------------------------------------------------------
// closeWindow
// ---------------------------------------------------------------------------

export async function closeWindow(titleOrPid: string | number): Promise<boolean> {
    const isNumber = typeof titleOrPid === 'number' || /^\d+$/.test(String(titleOrPid));

    let ps: string;
    if (isNumber) {
        ps = `Stop-Process -Id ${Number(titleOrPid)} -ErrorAction SilentlyContinue; Write-Output 'OK'`;
    } else {
        const escaped = String(titleOrPid).replace(/'/g, "''");
        ps = `Get-Process | Where-Object { $_.MainWindowTitle -like '*${escaped}*' } | Stop-Process -ErrorAction SilentlyContinue; Write-Output 'OK'`;
    }

    const out = await runPowerShell(ps);
    return out.includes('OK');
}

// ---------------------------------------------------------------------------
// listRunningApps
// ---------------------------------------------------------------------------

export async function listRunningApps(filter?: string): Promise<ProcessInfo[]> {
    const where = filter
        ? `| Where-Object { $_.ProcessName -like '*${filter.replace(/'/g, "''")}*' }`
        : '';
    const ps = `Get-Process ${where} | Sort-Object WorkingSet64 -Descending | Select-Object -First 50 -Property Id, ProcessName, WorkingSet64 | ConvertTo-Json -Compress`;
    const raw = await runPowerShell(ps);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const items: any[] = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((p) => ({
        name: p.ProcessName ?? '',
        pid: p.Id ?? 0,
        memory: p.WorkingSet64 ?? 0,
    }));
}
