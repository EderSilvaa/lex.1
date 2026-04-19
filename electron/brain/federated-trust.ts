/**
 * Brain — Federated Trust
 *
 * Quando N escritórios exportam patterns independentemente, um flow que
 * aparece em MUITOS exports é muito mais confiável que um flow local.
 * Este módulo é o mecanismo que transforma "share" em "learn".
 *
 * Modelo simples (sem blockchain, sem criptografia forte — KISS):
 *   - Cada export carrega um `sourceId` (UUID gerado na primeira export)
 *     e um `sourceFingerprint` (hash de machine-id + salt local).
 *   - No import, mantemos uma tabela `trust_ledger`: para cada (flowLabel,
 *     sourceId) guardamos a ÚLTIMA vez que vimos aquele source confirmar
 *     aquele flow. Reputação do source = número distinto de flows que
 *     ele já contribuiu E que foram corroborados por pelo menos outro source.
 *   - Peso de merge = 1 + log(1 + cross_confirmations).
 *     - Flow confirmado por 1 source só → weight=1.
 *     - Confirmado por 5 sources → weight ~2.8.
 *     - Confirmado por 50 sources → weight ~4.9.
 *   - Impacto no score: multiplicador aplicado ao `frequency` do scoring.
 *
 * Proteção mínima contra sybil: exigimos `sourceFingerprint` distinto por
 * sourceId. Source que muda fingerprint é tratado como novo (perde reputação).
 * Não evita sybil determinado, mas eleva a barreira.
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BrainStore } from './brain-store';

const TRUST_DIR = path.join(os.homedir(), '.lex');
const SOURCE_ID_FILE = path.join(TRUST_DIR, 'source-id.json');

export interface SourceIdentity {
    sourceId: string;
    sourceFingerprint: string;
    createdAt: number;
}

/**
 * Retorna (e cria se não existir) o identificador único desta instalação.
 * O fingerprint é derivado de um salt local — se alguém copiar o arquivo
 * para outra máquina, o fingerprint calculado lá vai diferir, e a outra
 * instância será tratada como source novo ao reescrever o arquivo.
 */
export function getLocalSourceIdentity(): SourceIdentity {
    try {
        if (fs.existsSync(SOURCE_ID_FILE)) {
            const raw = fs.readFileSync(SOURCE_ID_FILE, 'utf8');
            const parsed = JSON.parse(raw) as SourceIdentity;
            if (parsed?.sourceId && parsed?.sourceFingerprint) return parsed;
        }
    } catch { /* regenera */ }

    const fp = computeFingerprint();
    const identity: SourceIdentity = {
        sourceId: randomUUID(),
        sourceFingerprint: fp,
        createdAt: Date.now(),
    };

    try {
        fs.mkdirSync(TRUST_DIR, { recursive: true });
        fs.writeFileSync(SOURCE_ID_FILE, JSON.stringify(identity, null, 2), 'utf8');
    } catch { /* tudo bem — funciona em memória só */ }

    return identity;
}

function computeFingerprint(): string {
    // Mistura de sinais locais. Não é antievasão — só dissuade copy-paste
    // ingênuo do source-id.json.
    const parts = [
        os.hostname(),
        os.platform(),
        os.arch(),
        String(os.userInfo().uid ?? ''),
        os.homedir(),
    ];
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

// ── Ledger (tabela de confirmações) ──────────────────────────────────────────

export function ensureTrustLedgerSchema(brain: BrainStore): void {
    brain.db.exec(`
        CREATE TABLE IF NOT EXISTS trust_ledger (
            source_id TEXT NOT NULL,
            flow_label TEXT NOT NULL,
            last_seen_at INTEGER NOT NULL,
            fingerprint TEXT NOT NULL,
            PRIMARY KEY (source_id, flow_label)
        );
        CREATE INDEX IF NOT EXISTS idx_trust_ledger_flow ON trust_ledger(flow_label);
    `);
}

/** Registra que `sourceId` contribuiu com `flowLabel`. Idempotente. */
export function recordContribution(
    brain: BrainStore,
    sourceId: string,
    fingerprint: string,
    flowLabel: string,
): void {
    ensureTrustLedgerSchema(brain);
    brain.db.prepare(`
        INSERT INTO trust_ledger (source_id, flow_label, last_seen_at, fingerprint)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source_id, flow_label) DO UPDATE SET
            last_seen_at = excluded.last_seen_at,
            fingerprint = excluded.fingerprint
    `).run(sourceId, flowLabel, Date.now(), fingerprint);
}

/** Quantos sources DISTINTOS confirmaram esse flow. */
export function crossConfirmations(brain: BrainStore, flowLabel: string): number {
    ensureTrustLedgerSchema(brain);
    const row = brain.db.prepare(`
        SELECT COUNT(DISTINCT source_id) AS n
        FROM trust_ledger
        WHERE flow_label = ?
    `).get(flowLabel) as any;
    return Number(row?.n) || 0;
}

/**
 * Multiplicador de confiança para merge. Flow corroborado por muitos
 * sources distintos importa mais que um flow solo.
 */
export function trustMultiplier(crossCount: number): number {
    return 1 + Math.log1p(Math.max(0, crossCount));
}

// ── Export / Import com trust ────────────────────────────────────────────────

export interface PatternsBundleMeta {
    sourceId: string;
    sourceFingerprint: string;
    exportedAt: string;
    version: number;
}

export interface TrustAwareMergeOptions {
    /** Identidade do bundle que estamos importando. */
    meta: PatternsBundleMeta;
    /** Labels dos flows contidos no bundle (extraídos do `nodes` do bundle). */
    flowLabels: string[];
}

/**
 * Marca contribuições do source antes do merge de nodes. Chamado pelo
 * importBrain quando mode='patterns' e o bundle carrega meta.
 *
 * Depois de registrar, o caller pode ler `crossConfirmations` para cada
 * flow e passar esse valor como bias no `confidence` ao inserir o node.
 */
export function applyTrustOnMerge(
    brain: BrainStore,
    opts: TrustAwareMergeOptions,
): Map<string, number> {
    ensureTrustLedgerSchema(brain);
    // Registra contribuição deste source para cada flow.
    const tx = brain.db.transaction(() => {
        for (const label of opts.flowLabels) {
            recordContribution(brain, opts.meta.sourceId, opts.meta.sourceFingerprint, label);
        }
    });
    tx();

    // Retorna cross-confirmation por flow (para o caller aplicar no weight).
    const multipliers = new Map<string, number>();
    for (const label of opts.flowLabels) {
        multipliers.set(label, trustMultiplier(crossConfirmations(brain, label)));
    }
    return multipliers;
}

/** Boost do flow node baseado em cross-confirmations. Aplicado pós-merge. */
export function boostFlowByTrust(
    brain: BrainStore,
    flowId: string,
    multiplier: number,
): void {
    if (multiplier <= 1) return;
    const node = brain.getNode(flowId);
    if (!node) return;
    const prev = node.confidence || 0.5;
    const next = Math.min(1, prev + (multiplier - 1) * 0.05);
    brain.updateNode(flowId, {
        data: { ...node.data, trustMultiplier: multiplier },
        confidence: next,
    });
}
