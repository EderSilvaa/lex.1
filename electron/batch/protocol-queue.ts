/**
 * Protocol Queue — Fila Serial de Protocolo no PJe
 *
 * Protocola petições uma por uma (browser mutex).
 * Delay entre items para evitar rate limiting do PJe.
 *
 * Verifica se o browser PJe está conectado antes de iniciar.
 */

import type { WorkerResult, StrategyPacket, ProtocolResult } from './types';
import { PROTOCOL_DELAY_MS } from './types';

/**
 * Protocola todas as petições aprovadas, uma por vez.
 * Falha graciosamente se o browser/skills não estiverem disponíveis.
 */
export async function protocolAll(
    items: WorkerResult[],
    strategy: StrategyPacket,
    onProgress: (result: ProtocolResult) => void,
    abortSignal?: AbortSignal,
): Promise<ProtocolResult[]> {
    const results: ProtocolResult[] = [];

    // Verificar se skills PJe estão disponíveis
    const available = await checkPJeSkillsAvailable();
    if (!available) {
        console.error('[ProtocolQueue] Skills PJe não disponíveis — browser não conectado');
        // Retornar todos como falha com mensagem clara
        for (const item of items) {
            const result: ProtocolResult = {
                processoId: item.processoId,
                numero: item.numero,
                success: false,
                error: 'Browser PJe não conectado. Conecte o browser e tente novamente.',
                timestamp: new Date().toISOString(),
            };
            results.push(result);
            onProgress(result);
        }
        return results;
    }

    console.log(`[ProtocolQueue] Iniciando protocolo de ${items.length} petições`);

    for (let i = 0; i < items.length; i++) {
        if (abortSignal?.aborted) {
            console.log('[ProtocolQueue] Cancelado');
            break;
        }

        const item = items[i]!;
        console.log(`[ProtocolQueue] Protocolando ${i + 1}/${items.length}: ${item.numero}`);

        const result = await protocolSingle(item, strategy);
        results.push(result);
        onProgress(result);

        // Delay entre protocolo (exceto no último)
        if (i < items.length - 1 && !abortSignal?.aborted) {
            await sleep(PROTOCOL_DELAY_MS);
        }
    }

    const ok = results.filter(r => r.success).length;
    console.log(`[ProtocolQueue] Concluído: ${ok}/${results.length} protocoladas`);
    return results;
}

/**
 * Verifica se as skills PJe estão registradas e o browser está conectado.
 */
async function checkPJeSkillsAvailable(): Promise<boolean> {
    try {
        const { listSkills } = await import('../agent/executor');
        const skills = listSkills();
        return skills.includes('pje_agir');
    } catch {
        return false;
    }
}

async function protocolSingle(
    item: WorkerResult,
    strategy: StrategyPacket,
): Promise<ProtocolResult> {
    const timestamp = new Date().toISOString();

    try {
        const { executeSkill } = await import('../agent/executor');

        const objetivo = [
            `Protocolar petição de ${strategy.tipoPeticao} no processo ${item.numero}`,
            strategy.persona.tribunalAlvo ? `no ${strategy.persona.tribunalAlvo}` : '',
            `Upload do arquivo: ${item.arquivo}`,
            `Tipo de petição: ${strategy.tipoPeticao}`,
        ].filter(Boolean).join('. ');

        const result = await executeSkill(
            'pje_agir',
            { objetivo, tribunal: strategy.persona.tribunalAlvo },
            { documentos: [], resultados: {} } as any,
        );

        return {
            processoId: item.processoId,
            numero: item.numero,
            success: result.sucesso,
            protocolNumber: result.dados?.protocolo || undefined,
            error: result.erro || undefined,
            timestamp,
        };
    } catch (error: any) {
        return {
            processoId: item.processoId,
            numero: item.numero,
            success: false,
            error: error.message,
            timestamp,
        };
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
