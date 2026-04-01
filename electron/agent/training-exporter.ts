/**
 * Training Exporter — Gera dataset para fine-tune do PJe-Model
 *
 * Lê os exemplos coletados pelo training-collector (criptografados),
 * filtra, deduplica e formata no chat template para unsloth/LoRA.
 *
 * Output: userData/training/export/training-ready.jsonl
 * Formato: ShareGPT (conversations: [system, user, assistant])
 * Compatível com: unsloth, axolotl, LLaMA-Factory
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadEncrypted } from '../privacy/encrypted-storage';
import type { TrainingExample } from './training-collector';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportOptions {
    /** Confidence mínima para incluir (default: medium+high) */
    minConfidence?: 'medium' | 'high';
    /** Filtrar apenas um sistema específico (ex: 'pje') */
    sistema?: string;
    /** Filtrar apenas um tribunal (ex: 'TRT8') */
    tribunal?: string;
    /** Limite máximo de exemplos (default: todos) */
    maxExamples?: number;
}

export interface ExportResult {
    success: boolean;
    outputPath: string;
    stats: {
        totalLidos: number;
        filtrados: number;
        exportados: number;
        duplicatasRemovidas: number;
        bySistema: Record<string, number>;
        byTribunal: Record<string, number>;
        bySkill: Record<string, number>;
    };
    error?: string;
}

/** Formato ShareGPT para unsloth/axolotl */
interface ShareGPTExample {
    conversations: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    metadata?: {
        tribunal?: string;
        sistema: string;
        skill: string;
        confidence: string;
    };
}

// ── Prompt template ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é um agente especializado em navegar sistemas judiciais brasileiros (PJe, eSAJ, eProc, Gov.br).
Receba o estado atual da página (URL, sistema e DOM compacto) e o objetivo em linguagem natural.
Retorne APENAS um objeto JSON com a próxima ação a executar.

Formato de resposta:
{"action": "fill|click|navigate|press|scroll", "selector": "#css-selector", "value": "texto opcional", "url": "https://... (apenas para navigate)"}

Regras:
- Prefira seletores por id (#id) ou name ([name="x"]) — mais estáveis no PJe
- Para fill: use o seletor exato do campo e o valor a preencher
- Para click: use o seletor exato do botão/link
- Para navigate: use a URL completa
- Nunca invente seletores — use apenas os presentes no DOM fornecido`;

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Exporta o dataset para fine-tune.
 * Chamado via IPC 'training:export' ou diretamente.
 */
export async function exportForFineTune(
    trainingDir: string,
    options: ExportOptions = {}
): Promise<ExportResult> {
    const { minConfidence = 'medium', sistema, tribunal, maxExamples } = options;

    const stats: ExportResult['stats'] = {
        totalLidos: 0,
        filtrados: 0,
        exportados: 0,
        duplicatasRemovidas: 0,
        bySistema: {},
        byTribunal: {},
        bySkill: {},
    };

    try {
        // 1. Lê todos os arquivos de training
        const files = fs.readdirSync(trainingDir)
            .filter(f => f.startsWith('training-') && f.endsWith('.json') && !f.includes('export'))
            .sort();

        if (files.length === 0) {
            return {
                success: false,
                outputPath: '',
                stats,
                error: 'Nenhum arquivo de treino encontrado. Execute algumas ações no PJe primeiro.',
            };
        }

        const allExamples: TrainingExample[] = [];
        for (const file of files) {
            const filePath = path.join(trainingDir, file);
            const examples = loadEncrypted<TrainingExample[]>(filePath, []);
            allExamples.push(...examples);
        }
        stats.totalLidos = allExamples.length;

        // 2. Filtra
        const filtered = allExamples.filter(ex => {
            if (ex.resultado !== 'success') return false;
            if (minConfidence === 'high' && ex.confidence !== 'high') return false;
            if (minConfidence === 'medium' && ex.confidence === 'low') return false;
            if (sistema && ex.sistema !== sistema) return false;
            if (tribunal && ex.tribunal !== tribunal) return false;
            if (!ex.domCompacto || !ex.instrucao) return false;
            return true;
        });
        stats.filtrados = filtered.length;

        // 3. Remove duplicatas (mesmo url + instrucao + acao.type + acao.selector)
        const seen = new Set<string>();
        const deduped: TrainingExample[] = [];
        for (const ex of filtered) {
            const key = `${ex.url}|${ex.instrucao}|${ex.acao.type}|${ex.acao.selector ?? ''}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(ex);
            }
        }
        stats.duplicatasRemovidas = filtered.length - deduped.length;

        // 4. Aplica limite
        const final = maxExamples ? deduped.slice(0, maxExamples) : deduped;
        stats.exportados = final.length;

        // 5. Conta por sistema/tribunal/skill
        for (const ex of final) {
            stats.bySistema[ex.sistema] = (stats.bySistema[ex.sistema] || 0) + 1;
            if (ex.tribunal) {
                stats.byTribunal[ex.tribunal] = (stats.byTribunal[ex.tribunal] || 0) + 1;
            }
            stats.bySkill[ex.skillName] = (stats.bySkill[ex.skillName] || 0) + 1;
        }

        if (final.length === 0) {
            return {
                success: false,
                outputPath: '',
                stats,
                error: `Nenhum exemplo passou pelos filtros. Total lido: ${stats.totalLidos}, filtrados: ${stats.filtrados}.`,
            };
        }

        // 6. Formata como ShareGPT (chat template para unsloth)
        const formatted: ShareGPTExample[] = final.map(ex => formatExample(ex));

        // 7. Salva em JSONL (sem criptografia — pronto para upload no Colab)
        const exportDir = path.join(trainingDir, 'export');
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

        const outputPath = path.join(exportDir, 'training-ready.jsonl');
        const lines = formatted.map(ex => JSON.stringify(ex)).join('\n');
        fs.writeFileSync(outputPath, lines, 'utf-8');

        // Salva também um resumo legível
        const summaryPath = path.join(exportDir, 'export-summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify({
            exportedAt: new Date().toISOString(),
            totalExemplos: stats.exportados,
            stats,
        }, null, 2), 'utf-8');

        console.log(`[TrainingExporter] Exportados ${stats.exportados} exemplos → ${outputPath}`);

        return { success: true, outputPath, stats };

    } catch (err: any) {
        console.error('[TrainingExporter] Erro:', err.message);
        return {
            success: false,
            outputPath: '',
            stats,
            error: err.message,
        };
    }
}

// ── Format ───────────────────────────────────────────────────────────────────

function formatExample(ex: TrainingExample): ShareGPTExample {
    // Monta contexto do usuário
    const userContent = [
        `Sistema: ${ex.sistema}`,
        `URL: ${ex.url}`,
        ex.tribunal ? `Tribunal: ${ex.tribunal}` : null,
        `\nDOM:\n${ex.domCompacto.slice(0, 8000)}`,
        `\nObjetivo: ${ex.instrucao}`,
    ].filter(Boolean).join('\n');

    // Monta ação esperada (ground truth)
    const actionObj: Record<string, string> = { action: ex.acao.type };
    if (ex.acao.selector) actionObj['selector'] = ex.acao.selector;
    if (ex.acao.value) actionObj['value'] = ex.acao.value;
    const assistantContent = JSON.stringify(actionObj);

    return {
        conversations: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
            { role: 'assistant', content: assistantContent },
        ],
        metadata: {
            tribunal: ex.tribunal || undefined,
            sistema: ex.sistema,
            skill: ex.skillName,
            confidence: ex.confidence,
        },
    };
}
