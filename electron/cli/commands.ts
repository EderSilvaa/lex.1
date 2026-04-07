/**
 * CLI REPL — Comandos especiais com prefixo /
 *
 * Cada comando recebe o contexto da sessão e pode imprimir output,
 * alterar estado, ou sinalizar uma ação especial ao REPL.
 */

import { renderInfo } from './output';
import { rpcCall } from '../backend-client';

export type CommandAction =
    | { type: 'noop' }
    | { type: 'clear' }
    | { type: 'exit' }
    | { type: 'new-session' };

export interface CommandContext {
    sessionId: string;
    userDataDir: string;
}

const COMMANDS: Record<string, {
    descricao: string;
    handle: (args: string, ctx: CommandContext) => Promise<CommandAction>;
}> = {
    sair: {
        descricao: 'Encerra o REPL',
        handle: async () => ({ type: 'exit' }),
    },
    exit: {
        descricao: 'Encerra o REPL',
        handle: async () => ({ type: 'exit' }),
    },
    clear: {
        descricao: 'Limpa a tela',
        handle: async () => ({ type: 'clear' }),
    },
    limpar: {
        descricao: 'Limpa a tela',
        handle: async () => ({ type: 'clear' }),
    },
    sessao: {
        descricao: 'Mostra o ID da sessão atual',
        handle: async (_args, ctx) => {
            renderInfo(`sessão: ${ctx.sessionId}`);
            return { type: 'noop' };
        },
    },
    nova: {
        descricao: 'Inicia uma nova sessão (esquece contexto anterior)',
        handle: async () => {
            renderInfo('nova sessão iniciada');
            return { type: 'new-session' };
        },
    },
    config: {
        descricao: 'Mostra configuração ativa do provider',
        handle: async () => {
            try {
                const cfg = await rpcCall('get-config', {});
                renderInfo(`provider: ${cfg?.providerId ?? '?'}`);
                renderInfo(`modelo:   ${cfg?.agentModel ?? '?'}`);
            } catch (err: any) {
                renderInfo(`erro ao ler config: ${err?.message}`);
            }
            return { type: 'noop' };
        },
    },
    help: {
        descricao: 'Lista os comandos disponíveis',
        handle: async () => {
            const lines = Object.entries(COMMANDS).map(
                ([name, cmd]) => `  /${name.padEnd(10)} ${cmd.descricao}`,
            );
            lines.forEach(renderInfo);
            return { type: 'noop' };
        },
    },
    ajuda: {
        descricao: 'Lista os comandos disponíveis',
        handle: async (_args, ctx) => COMMANDS['help']!.handle(_args, ctx),
    },
};

/**
 * Tenta executar uma linha como comando slash.
 * Retorna null se a linha não for um comando (não começa com /).
 */
export async function tryRunCommand(
    line: string,
    ctx: CommandContext,
): Promise<CommandAction | null> {
    if (!line.startsWith('/')) return null;

    const [rawName, ...rest] = line.slice(1).trim().split(/\s+/);
    const name = (rawName ?? '').toLowerCase();
    const args = rest.join(' ');

    const cmd = COMMANDS[name];
    if (!cmd) {
        renderInfo(`comando desconhecido: /${name} — tente /help`);
        return { type: 'noop' };
    }

    return cmd.handle(args, ctx);
}
