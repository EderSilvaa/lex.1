/**
 * PTY Manager — Gerencia sessões de pseudo-terminal via node-pty.
 *
 * Dois modos de uso:
 *  1. Sessão interativa (UI do terminal) — createSession / write / resize / kill
 *  2. Execução one-shot (agent skill) — runCommand()
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import { isCommandBlocked } from './command-guard';

// node-pty é nativo; import dinâmico para evitar crash se rebuild falhar
let ptyModule: typeof import('node-pty') | null = null;

async function ensurePty(): Promise<typeof import('node-pty')> {
    if (!ptyModule) {
        ptyModule = await import('node-pty');
    }
    return ptyModule;
}

export interface PtySession {
    id: string;
    pty: import('node-pty').IPty;
    shell: string;
    cwd: string;
    createdAt: number;
}

export interface RunCommandResult {
    stdout: string;
    exitCode: number;
    killed: boolean;
}

export class PtyManager extends EventEmitter {
    private sessions = new Map<string, PtySession>();
    private dataBuffer = new Map<string, { chunks: string[]; timer: ReturnType<typeof setTimeout> | null }>();
    private readonly BATCH_INTERVAL = 16; // ~1 frame

    /** Retorna o shell padrão do sistema */
    private getDefaultShell(): string {
        if (process.platform === 'win32') {
            return process.env['COMSPEC'] || 'powershell.exe';
        }
        return process.env['SHELL'] || '/bin/bash';
    }

    /** Cria uma sessão interativa de terminal */
    async createSession(id: string, opts?: { shell?: string; cwd?: string; cols?: number; rows?: number }): Promise<void> {
        if (this.sessions.has(id)) {
            throw new Error(`Session "${id}" already exists`);
        }

        const pty = await ensurePty();
        const shell = opts?.shell || this.getDefaultShell();
        const cwd = opts?.cwd || os.homedir();
        const cols = opts?.cols || 120;
        const rows = opts?.rows || 30;

        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd,
            env: { ...process.env } as Record<string, string>,
        });

        const session: PtySession = {
            id,
            pty: ptyProcess,
            shell,
            cwd,
            createdAt: Date.now(),
        };

        this.sessions.set(id, session);
        this.dataBuffer.set(id, { chunks: [], timer: null });

        // Forward PTY data com batching
        ptyProcess.onData((data: string) => {
            const buf = this.dataBuffer.get(id);
            if (!buf) return;
            buf.chunks.push(data);
            if (!buf.timer) {
                buf.timer = setTimeout(() => {
                    const combined = buf.chunks.join('');
                    buf.chunks = [];
                    buf.timer = null;
                    this.emit('data', id, combined);
                }, this.BATCH_INTERVAL);
            }
        });

        ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
            // Flush remaining data
            const buf = this.dataBuffer.get(id);
            if (buf && buf.chunks.length > 0) {
                if (buf.timer) clearTimeout(buf.timer);
                this.emit('data', id, buf.chunks.join(''));
            }
            this.dataBuffer.delete(id);
            this.sessions.delete(id);
            this.emit('exit', id, exitCode);
        });

        console.log(`[Terminal] Session "${id}" created (shell: ${shell}, cwd: ${cwd})`);
    }

    /** Escreve dados no stdin da sessão */
    write(id: string, data: string): void {
        const session = this.sessions.get(id);
        if (!session) throw new Error(`Session "${id}" not found`);
        session.pty.write(data);
    }

    /** Redimensiona o PTY */
    resize(id: string, cols: number, rows: number): void {
        const session = this.sessions.get(id);
        if (!session) return;
        session.pty.resize(cols, rows);
    }

    /** Mata uma sessão */
    killSession(id: string): void {
        const session = this.sessions.get(id);
        if (!session) return;
        const buf = this.dataBuffer.get(id);
        if (buf?.timer) clearTimeout(buf.timer);
        this.dataBuffer.delete(id);
        session.pty.kill();
        this.sessions.delete(id);
        console.log(`[Terminal] Session "${id}" killed`);
    }

    /** Mata todas as sessões */
    killAll(): void {
        for (const id of [...this.sessions.keys()]) {
            this.killSession(id);
        }
    }

    /** Lista sessões ativas */
    listSessions(): Array<{ id: string; shell: string; cwd: string; createdAt: number }> {
        return [...this.sessions.values()].map(s => ({
            id: s.id,
            shell: s.shell,
            cwd: s.cwd,
            createdAt: s.createdAt,
        }));
    }

    /**
     * Executa um comando one-shot e retorna o output completo.
     * Usado pela agent skill `terminal_executar`.
     *
     * Spawna um PTY temporário que roda o comando diretamente (não dentro de um shell interativo).
     */
    async runCommand(command: string, cwd?: string, timeoutMs = 30_000): Promise<RunCommandResult> {
        // Verifica blocklist
        const check = isCommandBlocked(command);
        if (check.blocked) {
            return { stdout: `[BLOQUEADO] ${check.reason}: ${command}`, exitCode: -1, killed: false };
        }

        const pty = await ensurePty();
        const resolvedCwd = cwd || os.homedir();

        // No Windows, roda via cmd.exe /c (suporta && e é mais compatível)
        // No Unix, via bash -c
        const isWin = process.platform === 'win32';
        const shell = isWin ? 'cmd.exe' : '/bin/bash';
        const args = isWin ? ['/c', command] : ['-c', command];

        return new Promise<RunCommandResult>((resolve) => {
            const outputChunks: string[] = [];
            let resolved = false;

            const ptyProcess = pty.spawn(shell, args, {
                name: 'xterm-256color',
                cols: 200,
                rows: 50,
                cwd: resolvedCwd,
                env: { ...process.env } as Record<string, string>,
            });

            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    ptyProcess.kill();
                    resolve({
                        stdout: outputChunks.join('') + '\n[TIMEOUT após ' + (timeoutMs / 1000) + 's]',
                        exitCode: -1,
                        killed: true,
                    });
                }
            }, timeoutMs);

            ptyProcess.onData((data: string) => {
                outputChunks.push(data);
            });

            ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve({
                        stdout: outputChunks.join(''),
                        exitCode,
                        killed: false,
                    });
                }
            });
        });
    }

    /**
     * Executa um script Python via o Python embedded (ou sistema).
     * Atalho que resolve o caminho do Python automaticamente.
     */
    async runPython(script: string, args: string[] = [], cwd?: string, timeoutMs = 30_000): Promise<RunCommandResult> {
        let pythonPath: string | null = null;

        try {
            const { getPythonEnv } = await import('../python');
            const env = getPythonEnv();
            if (env.isReady()) {
                pythonPath = env.getPythonPath();
            }
        } catch { /* Python module não disponível */ }

        if (!pythonPath) {
            return {
                stdout: '[ERRO] Python não disponível. Nenhum Python embedded ou de sistema foi encontrado.',
                exitCode: -1,
                killed: false,
            };
        }

        // Monta comando: python -c "script" args...
        const escapedScript = script.replace(/"/g, '\\"');
        const argsStr = args.length > 0 ? ' ' + args.join(' ') : '';
        const command = `"${pythonPath}" -c "${escapedScript}"${argsStr}`;

        return this.runCommand(command, cwd, timeoutMs);
    }

    /** Verifica se há sessões ativas */
    hasActiveSessions(): boolean {
        return this.sessions.size > 0;
    }
}
