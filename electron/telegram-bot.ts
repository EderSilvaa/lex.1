/**
 * LEX Telegram Bot
 *
 * Permite controlar o agente LEX remotamente via Telegram.
 * Só responde ao usuário autorizado (authorizedUserId).
 */

import { Telegraf } from 'telegraf';
import { hasPendingInput, resolveUserInput } from './user-input';
import { cancelAgentLoop } from './agent';

export interface TelegramConfig {
    token: string;
    authorizedUserId: number;
}

type AgentRunner = (text: string, sessionId: string) => Promise<string>;

let bot: Telegraf | null = null;
let isRunning = false;
let isBusy = false;
let _authorizedUserId: number | null = null;

export async function startBot(config: TelegramConfig, runAgent: AgentRunner): Promise<void> {
    if (isRunning) return;

    bot = new Telegraf(config.token);
    const authorizedId = config.authorizedUserId;
    _authorizedUserId = authorizedId;

    bot.start(async (ctx) => {
        if (ctx.from.id !== authorizedId) {
            await ctx.reply('⛔ Acesso não autorizado.');
            return;
        }
        await ctx.reply(
            '✅ *LEX está ativa!*\n\nMe mande uma instrução em linguagem natural.\n\nExemplos:\n• "abra o processo 0001234-56.2024.5.08.0001 no TRT8"\n• "quais são as movimentações do processo X?"\n• "liste os arquivos da pasta documentos"',
            { parse_mode: 'Markdown' }
        );
    });

    bot.command('status', async (ctx) => {
        if (ctx.from.id !== authorizedId) return;
        const status = isBusy ? '⏳ Processando uma tarefa...' : '✅ Pronta para receber instruções.';
        await ctx.reply(`LEX — ${status}`);
    });

    bot.command('cancelar', async (ctx) => {
        if (ctx.from.id !== authorizedId) return;
        const cancelou = cancelAgentLoop();
        if (cancelou) {
            isBusy = false;
            await ctx.reply('🛑 Tarefa cancelada.');
        } else {
            await ctx.reply('ℹ️ Nenhuma tarefa em andamento.');
        }
    });

    bot.on('message', async (ctx) => {
        if (!ctx.from || ctx.from.id !== authorizedId) {
            await ctx.reply('⛔ Acesso não autorizado.');
            return;
        }

        const text = 'text' in ctx.message ? ctx.message.text : null;
        if (!text) {
            await ctx.reply('ℹ️ Só aceito mensagens de texto no momento.');
            return;
        }

        // Ignora comandos (já tratados acima)
        if (text.startsWith('/')) return;

        // Se o agente está aguardando input (ex: TOTP), entrega a resposta e para
        if (hasPendingInput()) {
            resolveUserInput(text);
            await ctx.reply('✅ Código recebido. Continuando...');
            return;
        }

        if (isBusy) {
            await ctx.reply('⏳ Ainda processando uma tarefa. Aguarde...');
            return;
        }

        isBusy = true;
        let statusMsgId: number | null = null;

        try {
            const statusMsg = await ctx.reply('⏳ Processando...');
            statusMsgId = statusMsg.message_id;
        } catch { /* ignora falha no envio do status */ }

        // Usa o ID do usuário Telegram como session ID para manter histórico
        const sessionId = `telegram-${authorizedId}`;

        try {
            const result = await runAgent(text, sessionId);
            // Telegram limita mensagens a 4096 chars
            const safeResult = result.length > 4000
                ? result.substring(0, 4000) + '\n\n_[resposta truncada]_'
                : result;

            if (statusMsgId) {
                await ctx.telegram
                    .editMessageText(ctx.chat.id, statusMsgId, undefined, safeResult, { parse_mode: 'Markdown' })
                    .catch(() => ctx.reply(safeResult, { parse_mode: 'Markdown' }));
            } else {
                await ctx.reply(safeResult, { parse_mode: 'Markdown' });
            }
        } catch (error: any) {
            const errMsg = `❌ Erro: ${error.message}`;
            if (statusMsgId) {
                await ctx.telegram
                    .editMessageText(ctx.chat.id, statusMsgId, undefined, errMsg)
                    .catch(() => ctx.reply(errMsg));
            } else {
                await ctx.reply(errMsg);
            }
        } finally {
            isBusy = false;
        }
    });

    // Callback query handler para HITL (Batch Petitioning inline keyboards)
    bot.on('callback_query', async (ctx) => {
        if (!ctx.from || ctx.from.id !== authorizedId) return;
        const data = (ctx.callbackQuery as any).data as string | undefined;
        if (!data?.startsWith('hitl:')) return;

        const parts = data.split(':');
        if (parts.length < 3) return;

        const requestId = parts[1]!;
        const action = parts[2]!;

        try {
            const { handleTelegramHITL } = await import('./batch/telegram-hitl');
            await handleTelegramHITL(requestId, action);
            await ctx.answerCbQuery('Recebido!');
        } catch (error: any) {
            console.error('[Telegram] Erro no callback HITL:', error.message);
            await ctx.answerCbQuery('Erro ao processar');
        }
    });

    // Captura erros de polling sem derrubar o processo
    bot.catch((err: any) => {
        console.error('[Telegram] Erro no bot:', err?.message || err);
    });

    await bot.launch({ dropPendingUpdates: true });
    isRunning = true;
    console.log('[Telegram] Bot iniciado. Aguardando mensagens...');
}

export async function stopBot(): Promise<void> {
    if (bot && isRunning) {
        bot.stop('STOP');
        bot = null;
        isRunning = false;
        isBusy = false;
        console.log('[Telegram] Bot parado.');
    }
}

export function isBotRunning(): boolean {
    return isRunning;
}

/**
 * Envia mensagem proativa ao usuário autorizado (usado pelo user-input.ts para notificar TOTP etc.)
 */
export async function sendMessage(userId: number, text: string): Promise<void> {
    if (bot && isRunning) {
        try {
            await bot.telegram.sendMessage(userId, text, { parse_mode: 'Markdown' });
        } catch { /* ignora falha de envio */ }
    }
}

/** Retorna instância do bot para uso pelo telegram-hitl.ts */
export function getBotInstance(): Telegraf | null {
    return bot;
}

/** Retorna ID do usuário autorizado */
export function getTelegramUserId(): number | null {
    return _authorizedUserId;
}
