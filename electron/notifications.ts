/**
 * Notification Layer (Phase 2 AIOS — Autonomia)
 *
 * Despacho unificado de notificações: toast (Electron), Telegram, badge no renderer.
 */

import { Notification, BrowserWindow } from 'electron';
import * as path from 'path';
import type { NotificationPayload } from './scheduler/types';

// Referência à mainWindow — setada pelo main.ts
let _mainWindow: BrowserWindow | null = null;
let _telegramUserId: number = 0;

const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');

// Badge count acumulado
let _badgeCount = 0;

// ============================================================================
// SETUP
// ============================================================================

export function setNotificationWindow(win: BrowserWindow | null): void {
    _mainWindow = win;
}

export function setTelegramUserId(userId: number): void {
    _telegramUserId = userId;
}

// ============================================================================
// DISPATCH
// ============================================================================

export async function notify(payload: NotificationPayload): Promise<void> {
    for (const channel of payload.channels) {
        try {
            switch (channel) {
                case 'toast':
                    showToast(payload.title, payload.body);
                    break;
                case 'telegram':
                    await notifyTelegram(payload.title, payload.body);
                    break;
                case 'badge':
                    notifyBadge(payload);
                    break;
            }
        } catch (err: any) {
            console.warn(`[Notify] Falha no canal ${channel}:`, err.message);
        }
    }
}

/** Notificação toast do sistema operacional */
function showToast(title: string, body: string): void {
    if (!Notification.isSupported()) return;

    const notification = new Notification({
        title,
        body,
        icon: iconPath,
    });

    notification.on('click', () => {
        _mainWindow?.show();
        _mainWindow?.focus();
    });

    notification.show();
}

/** Envia via Telegram (se bot ativo) */
async function notifyTelegram(title: string, body: string): Promise<void> {
    if (!_telegramUserId) return;

    try {
        const { isBotRunning, sendMessage } = await import('./telegram-bot');
        if (!isBotRunning()) return;
        await sendMessage(_telegramUserId, `🔔 *${title}*\n${body}`);
    } catch {
        // Telegram pode não estar configurado
    }
}

/** Envia badge count + info para o renderer */
function notifyBadge(payload: NotificationPayload): void {
    if (!_mainWindow || _mainWindow.isDestroyed()) return;

    _badgeCount++;
    _mainWindow.webContents.send('notification-badge', {
        count: _badgeCount,
        latest: { title: payload.title, body: payload.body, goalId: payload.goalId },
    });
}

/** Reseta badge (chamado quando renderer abre/foca) */
export function resetBadge(): void {
    _badgeCount = 0;
    if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('notification-badge', { count: 0, latest: null });
    }
}

/** Retorna contagem atual de badges */
export function getBadgeCount(): number {
    return _badgeCount;
}
