/**
 * Auditor — Auditoria Pós-Wave
 *
 * Gera AuditReport com métricas de qualidade e diferenciação.
 * Opcionalmente chama LLM para summary qualitativo.
 */

import type { AuditReport, WorkerResult, StrategyPacket } from './types';
import { DIFF_SCORE_THRESHOLD } from './types';

/**
 * Audita os resultados de uma wave.
 */
export async function auditWave(
    waveIndex: number,
    results: WorkerResult[],
    strategy: StrategyPacket,
): Promise<AuditReport> {
    console.log(`[Auditor] Auditando wave ${waveIndex}: ${results.length} items`);

    const completed = results.filter(r => r.status === 'completed');
    const failed = results.filter(r => r.status === 'failed');
    const needsRedraft = results.filter(r => r.status === 'needs_redraft');

    // Métricas de diferenciação
    const diffScores = results
        .filter(r => r.status !== 'failed')
        .map(r => r.diffScore);

    const avgDiffScore = diffScores.length > 0
        ? Math.round(diffScores.reduce((a, b) => a + b, 0) / diffScores.length)
        : 0;

    const minDiffScore = diffScores.length > 0 ? Math.min(...diffScores) : 0;
    const maxDiffScore = diffScores.length > 0 ? Math.max(...diffScores) : 0;

    // Warnings
    const warnings: string[] = [];

    for (const r of results) {
        if (r.status === 'failed') {
            warnings.push(`#${r.processoId} ${r.numero}: FALHOU — ${r.error}`);
        } else if (r.diffScore < DIFF_SCORE_THRESHOLD) {
            warnings.push(`#${r.processoId} ${r.numero}: Diferenciação baixa (${r.diffScore}%) — re-redigir recomendado`);
        }
    }

    // Summary qualitativo
    const summary = await generateSummary(waveIndex, results, strategy, avgDiffScore, warnings);

    const report: AuditReport = {
        waveIndex,
        items: results,
        avgDiffScore,
        minDiffScore,
        maxDiffScore,
        completedCount: completed.length,
        failedCount: failed.length,
        needsRedraftCount: needsRedraft.length,
        warnings,
        summary,
    };

    console.log(`[Auditor] Wave ${waveIndex}: ${completed.length} ok, ${failed.length} falhas, ${needsRedraft.length} re-redigir, diff média=${avgDiffScore}%`);
    return report;
}

/**
 * Gera summary qualitativo.
 * Tenta LLM, fallback para summary mecânico.
 */
async function generateSummary(
    waveIndex: number,
    results: WorkerResult[],
    strategy: StrategyPacket,
    avgDiffScore: number,
    warnings: string[],
): Promise<string> {
    // Se poucos items ou modelo barato, summary mecânico
    if (results.length <= 3) {
        return buildMechanicalSummary(waveIndex, results, avgDiffScore, warnings);
    }

    try {
        const { callAI } = await import('../ai-handler');

        const itemsSummary = results.map(r =>
            `- ${r.numero}: status=${r.status}, diff=${r.diffScore}%, tese="${r.teseAplicada}"`
        ).join('\n');

        const response = await callAI({
            system: 'Você é um auditor jurídico. Avalie brevemente a qualidade e consistência das petições geradas. Responda em 2-3 frases em português, direto ao ponto.',
            user: `Wave ${waveIndex} — ${results.length} petições de "${strategy.tipoPeticao}"
Tese mestra: ${strategy.teseMestra}
Diferenciação média: ${avgDiffScore}%
${warnings.length > 0 ? `Alertas: ${warnings.join('; ')}` : 'Sem alertas.'}

Items:
${itemsSummary}

Avalie: qualidade geral, consistência com a tese, e diferenciação.`,
            temperature: 0.2,
            maxTokens: 300,
        });

        return response.trim();
    } catch {
        return buildMechanicalSummary(waveIndex, results, avgDiffScore, warnings);
    }
}

function buildMechanicalSummary(
    waveIndex: number,
    results: WorkerResult[],
    avgDiffScore: number,
    warnings: string[],
): string {
    const ok = results.filter(r => r.status === 'completed').length;
    const total = results.length;
    const qualidade = avgDiffScore >= 85 ? 'excelente' : avgDiffScore >= 70 ? 'boa' : 'insuficiente';

    let summary = `Wave ${waveIndex}: ${ok}/${total} petições concluídas com diferenciação ${qualidade} (média ${avgDiffScore}%).`;

    if (warnings.length > 0) {
        summary += ` ${warnings.length} alerta(s) requerem atenção.`;
    }

    return summary;
}
