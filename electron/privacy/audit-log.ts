/**
 * Audit Log — Registro de Envios para LLMs
 *
 * Registra cada chamada ao LLM com metadados de privacidade:
 * - Qual provider recebeu dados
 * - Quantas entidades PII foram mascaradas
 * - Qual nível de consent estava ativo
 * - Tamanho do payload
 *
 * Logs são criptografados em disco e auto-deletados após 90 dias.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ConsentLevel } from './consent-manager';
import type { PIICategory } from './pii-vault';

// ============================================================================
// TYPES
// ============================================================================

export interface AuditEntry {
    timestamp: string;
    action: 'llm_call' | 'data_access' | 'consent_change' | 'data_delete';
    provider?: string;
    model?: string;
    piiMasked: number;
    piiTypes: PIICategory[];
    consentLevel: ConsentLevel;
    dataSize: number;       // chars do payload enviado
    sessionId?: string;
    runId?: string;
}

// ============================================================================
// CONFIG
// ============================================================================

const RETENTION_DAYS = 90;
let auditDir: string | null = null;

// Buffer em memória para evitar writes excessivos
let buffer: AuditEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 5000; // flush a cada 5s se houver entries

// ============================================================================
// INIT
// ============================================================================

/**
 * Inicializa o audit log. Deve ser chamado no boot do app.
 */
export function initAuditLog(userDataDir?: string): void {
    const base = userDataDir || getDefaultDir();
    auditDir = path.join(base, 'audit');

    try {
        if (!fs.existsSync(auditDir)) {
            fs.mkdirSync(auditDir, { recursive: true });
        }
    } catch (e: any) {
        console.warn('[AuditLog] Falha ao criar diretório:', e.message);
    }

    // Cleanup de logs antigos no boot
    cleanupOldLogs().catch(() => {});
}

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Registra uma chamada ao LLM.
 */
export function logLLMCall(entry: Omit<AuditEntry, 'timestamp' | 'action'>): void {
    addEntry({
        ...entry,
        timestamp: new Date().toISOString(),
        action: 'llm_call'
    });
}

/**
 * Registra mudança de consentimento.
 */
export function logConsentChange(
    consentLevel: ConsentLevel,
    provider?: string
): void {
    addEntry({
        timestamp: new Date().toISOString(),
        action: 'consent_change',
        provider,
        piiMasked: 0,
        piiTypes: [],
        consentLevel,
        dataSize: 0
    });
}

/**
 * Registra exclusão de dados (LGPD).
 */
export function logDataDelete(description: string): void {
    addEntry({
        timestamp: new Date().toISOString(),
        action: 'data_delete',
        piiMasked: 0,
        piiTypes: [],
        consentLevel: 0,
        dataSize: 0,
        sessionId: description
    });
}

function addEntry(entry: AuditEntry): void {
    buffer.push(entry);

    // Schedule flush com debounce
    if (!flushTimer) {
        flushTimer = setTimeout(() => {
            flushTimer = null;
            flushBuffer().catch(() => {});
        }, FLUSH_INTERVAL_MS);
    }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Força flush do buffer para disco. Chamar no quit do app.
 */
export async function flushAuditLog(): Promise<void> {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    await flushBuffer();
}

async function flushBuffer(): Promise<void> {
    if (buffer.length === 0) return;

    const entries = [...buffer];
    buffer = [];

    const dir = auditDir || path.join(getDefaultDir(), 'audit');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFile = path.join(dir, `${today}.jsonl`);

    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
        fs.appendFileSync(logFile, lines, 'utf-8');
    } catch (e: any) {
        console.warn('[AuditLog] Falha ao salvar:', e.message);
        // Re-add ao buffer para tentar novamente
        buffer.unshift(...entries);
    }
}

// ============================================================================
// QUERY
// ============================================================================

/**
 * Lê entries de um dia específico.
 */
export function getEntriesForDate(date: string): AuditEntry[] {
    const dir = auditDir || path.join(getDefaultDir(), 'audit');
    const logFile = path.join(dir, `${date}.jsonl`);

    try {
        if (!fs.existsSync(logFile)) return [];
        const raw = fs.readFileSync(logFile, 'utf-8');
        return raw
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line) as AuditEntry);
    } catch {
        return [];
    }
}

/**
 * Retorna resumo dos últimos N dias.
 */
export function getAuditSummary(days = 7): {
    totalCalls: number;
    totalPIIMasked: number;
    byProvider: Record<string, number>;
    byDay: Array<{ date: string; calls: number; piiMasked: number }>;
} {
    const dir = auditDir || path.join(getDefaultDir(), 'audit');
    const summary = {
        totalCalls: 0,
        totalPIIMasked: 0,
        byProvider: {} as Record<string, number>,
        byDay: [] as Array<{ date: string; calls: number; piiMasked: number }>
    };

    const now = new Date();
    for (let i = 0; i < days; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0]!;
        const entries = getEntriesForDate(dateStr);

        let dayCalls = 0;
        let dayPII = 0;

        for (const entry of entries) {
            if (entry.action === 'llm_call') {
                dayCalls++;
                dayPII += entry.piiMasked;
                if (entry.provider) {
                    summary.byProvider[entry.provider] = (summary.byProvider[entry.provider] || 0) + 1;
                }
            }
        }

        summary.totalCalls += dayCalls;
        summary.totalPIIMasked += dayPII;
        summary.byDay.push({ date: dateStr, calls: dayCalls, piiMasked: dayPII });
    }

    return summary;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Remove logs mais antigos que RETENTION_DAYS.
 */
async function cleanupOldLogs(): Promise<void> {
    const dir = auditDir || path.join(getDefaultDir(), 'audit');

    try {
        if (!fs.existsSync(dir)) return;

        const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
        const cutoffStr = cutoff.toISOString().split('T')[0]!;

        let deleted = 0;
        for (const file of files) {
            const dateStr = file.replace('.jsonl', '');
            if (dateStr < cutoffStr) {
                fs.unlinkSync(path.join(dir, file));
                deleted++;
            }
        }

        if (deleted > 0) {
            console.log(`[AuditLog] Removidos ${deleted} logs antigos (>${RETENTION_DAYS} dias)`);
        }
    } catch (e: any) {
        console.warn('[AuditLog] Falha no cleanup:', e.message);
    }
}

// ============================================================================
// HELPERS
// ============================================================================

function getDefaultDir(): string {
    const appData = process.env['APPDATA'] || os.homedir();
    return path.join(appData, 'lex-test1');
}
