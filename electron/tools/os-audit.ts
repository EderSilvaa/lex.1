import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export type OsAuditEvent = {
    ts?: string;
    skill?: string;
    operacao: string;
    sucesso: boolean;
    origem?: string;
    destino?: string;
    alvos?: string[];
    codigo?: string;
    erro?: string;
    dados?: any;
};

export function getOsAuditLogPath(): string {
    const explicit = process.env['LEX_OS_AUDIT_LOG']?.trim();
    if (explicit) return explicit;

    const base = process.env['LEX_USER_DATA']?.trim()
        || (process.platform === 'win32' && process.env['APPDATA']
            ? path.join(process.env['APPDATA'], 'lex-test1')
            : path.join(os.homedir(), '.lex'));

    return path.join(base, 'os-audit.jsonl');
}

export async function registrarAuditoriaOs(event: OsAuditEvent): Promise<void> {
    try {
        const logPath = getOsAuditLogPath();
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        const { ts, ...rest } = event;
        const linha = JSON.stringify({
            ts: ts || new Date().toISOString(),
            skill: event.skill || 'os',
            ...rest
        });
        await fs.appendFile(logPath, linha + '\n', 'utf8');
    } catch {
        // Auditoria nao pode bloquear a operacao principal.
    }
}
