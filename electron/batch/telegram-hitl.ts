/**
 * Telegram HITL — Aprovação via Telegram com Inline Keyboard
 *
 * Envia mensagens com botões de aprovação para o Telegram do advogado.
 * Callback handlers recebem respostas e roteiam para o pipeline correto.
 */

import type { HITLCheckpoint, LoteId, AuditReport, StrategyPacket } from './types';

// Pending HITL requests aguardando callback
const pendingCallbacks = new Map<string, {
    loteId: LoteId;
    checkpoint: HITLCheckpoint;
    resolve: (action: string) => void;
}>();

/**
 * Envia uma solicitação HITL via Telegram com inline keyboard.
 */
export async function sendHITLRequest(
    checkpoint: HITLCheckpoint,
    loteId: LoteId,
    payload: any,
    requestId: string,
): Promise<void> {
    const { getBotInstance, getTelegramUserId } = await import('../telegram-bot');
    const bot = getBotInstance();
    const userId = getTelegramUserId();

    if (!bot || !userId) {
        console.log('[TelegramHITL] Bot não configurado — pulando');
        return;
    }

    const { text, buttons } = formatHITLMessage(checkpoint, loteId, payload, requestId);

    try {
        await bot.telegram.sendMessage(userId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: buttons,
            },
        });
        console.log(`[TelegramHITL] HITL enviado: ${checkpoint} (${requestId})`);
    } catch (error: any) {
        console.error(`[TelegramHITL] Erro ao enviar: ${error.message}`);
    }

    // Registra callback pendente
    return new Promise<void>((resolve) => {
        pendingCallbacks.set(requestId, { loteId, checkpoint, resolve: () => resolve() });

        // Timeout: 24h — remove se não respondido
        setTimeout(() => {
            if (pendingCallbacks.has(requestId)) {
                pendingCallbacks.delete(requestId);
                resolve();
            }
        }, 24 * 60 * 60 * 1000);
    });
}

/**
 * Handler para callback_query do Telegram.
 * Chamado pelo telegram-bot.ts quando recebe callback com prefixo 'hitl:'.
 */
export async function handleTelegramHITL(requestId: string, action: string): Promise<void> {
    const pending = pendingCallbacks.get(requestId);
    if (!pending) {
        console.log(`[TelegramHITL] Callback não encontrado: ${requestId}`);
        return;
    }

    console.log(`[TelegramHITL] Callback recebido: ${pending.checkpoint} → ${action} (lote ${pending.loteId.substring(0, 8)})`);

    // Rotear para o pipeline
    const { getActivePipeline } = await import('./index');
    const pipeline = getActivePipeline(pending.loteId);

    if (!pipeline) {
        console.error(`[TelegramHITL] Pipeline não encontrado para lote ${pending.loteId}`);
        pendingCallbacks.delete(requestId);
        return;
    }

    switch (pending.checkpoint) {
        case 'strategy':
            if (action === 'approve') {
                await pipeline.approveStrategy('telegram');
            } else if (action === 'reject') {
                await pipeline.cancel();
            }
            break;

        case 'wave_audit':
            if (action === 'approve') {
                // Descobrir wave index do lote atual
                const { getLoteStore } = await import('./lote-store');
                const lote = getLoteStore().getLote(pending.loteId);
                if (lote) {
                    await pipeline.approveWave(lote.currentWave, 'telegram');
                }
            } else if (action === 'pause') {
                await pipeline.pause('Pausado via Telegram');
            }
            break;

        case 'protocol':
            if (action === 'confirm') {
                await pipeline.approveProtocol('telegram');
            } else if (action === 'cancel') {
                await pipeline.cancel();
            }
            break;
    }

    pendingCallbacks.delete(requestId);
    pending.resolve(action);
}

// ─── Message Formatting ────────────────────────────────────────────

function formatHITLMessage(
    checkpoint: HITLCheckpoint,
    loteId: LoteId,
    payload: any,
    requestId: string,
): { text: string; buttons: Array<Array<{ text: string; callback_data: string }>> } {
    const shortId = loteId.substring(0, 8);

    switch (checkpoint) {
        case 'strategy': {
            const s = payload as StrategyPacket;
            const text = [
                `🧠 *Estratégia Proposta* (${shortId})`,
                '',
                `📋 Tipo: ${s.tipoPeticao}`,
                `📊 Processos: ${s.processos.length}`,
                `⚖️ Tese: ${s.teseMestra.substring(0, 100)}`,
                `🏛️ Tribunal: ${s.persona.tribunalAlvo}`,
                `🎯 Tom: ${s.persona.tom}`,
                `📦 Waves de ${s.waveSize}`,
                '',
                'Aprovar esta estratégia?',
            ].join('\n');

            return {
                text,
                buttons: [[
                    { text: '✅ Aprovar', callback_data: `hitl:${requestId}:approve` },
                    { text: '❌ Cancelar', callback_data: `hitl:${requestId}:reject` },
                ]],
            };
        }

        case 'wave_audit': {
            const a = payload as AuditReport;
            const text = [
                `📊 *Auditoria Wave ${a.waveIndex}* (${shortId})`,
                '',
                `✅ ${a.completedCount} concluídas`,
                a.failedCount > 0 ? `❌ ${a.failedCount} falhas` : null,
                a.needsRedraftCount > 0 ? `⚠️ ${a.needsRedraftCount} baixa diferenciação` : null,
                `📈 Diferenciação média: ${a.avgDiffScore}%`,
                '',
                a.warnings.length > 0 ? `Alertas:\n${a.warnings.slice(0, 3).map(w => `• ${w}`).join('\n')}` : 'Sem alertas.',
            ].filter(Boolean).join('\n');

            return {
                text,
                buttons: [[
                    { text: '✅ Aprovar', callback_data: `hitl:${requestId}:approve` },
                    { text: '⏸ Pausar', callback_data: `hitl:${requestId}:pause` },
                ]],
            };
        }

        case 'protocol': {
            const text = [
                `📤 *Protocolar Petições?* (${shortId})`,
                '',
                `${payload.totalItems} petições prontas para protocolo no PJe.`,
                '',
                '⚠️ Esta ação é irreversível.',
            ].join('\n');

            return {
                text,
                buttons: [[
                    { text: '📤 Confirmar', callback_data: `hitl:${requestId}:confirm` },
                    { text: '❌ Cancelar', callback_data: `hitl:${requestId}:cancel` },
                ]],
            };
        }
    }
}
