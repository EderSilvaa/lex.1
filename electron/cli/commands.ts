/**
 * CLI REPL — Comandos especiais com prefixo /
 *
 * Comandos de configuração aplicam mudanças imediatamente no backend,
 * sem precisar sair do REPL.
 */

import { renderInfo, renderError } from './output';
import { rpcCall, syncConfigToBackend } from '../backend-client';
import {
    setActiveConfig,
    getActiveConfig,
    PROVIDER_PRESETS,
    type ProviderId,
} from '../provider-config';
import { initCryptoStoreSalt, encryptApiKey } from '../crypto-store';
import * as fs from 'fs';
import * as path from 'path';

export type CommandAction =
    | { type: 'noop' }
    | { type: 'clear' }
    | { type: 'exit' }
    | { type: 'new-session' };

export interface CommandContext {
    sessionId: string;
    userDataDir: string;
}

// ── Helpers de config ─────────────────────────────────────────────────────────

function readCliConfig(userDataDir: string): any {
    try {
        return JSON.parse(fs.readFileSync(path.join(userDataDir, 'cli-config.json'), 'utf8'));
    } catch { return {}; }
}

function writeCliConfig(userDataDir: string, cfg: any): void {
    fs.writeFileSync(path.join(userDataDir, 'cli-config.json'), JSON.stringify(cfg, null, 2), 'utf8');
}

async function applyAndSync(userDataDir: string, patch: Partial<ReturnType<typeof getActiveConfig>>): Promise<void> {
    const current = getActiveConfig();
    const updated = { ...current, ...patch };
    setActiveConfig(updated);

    // Persiste no cli-config.json
    const saved = readCliConfig(userDataDir);
    if (patch.providerId)  saved.providerId  = patch.providerId;
    if (patch.agentModel)  saved.agentModel  = patch.agentModel;
    if (patch.visionModel) saved.visionModel = patch.visionModel;
    writeCliConfig(userDataDir, saved);

    // Aplica no backend imediatamente
    await syncConfigToBackend(updated);
}

// ── Registry de comandos ──────────────────────────────────────────────────────

const COMMANDS: Record<string, {
    descricao: string;
    uso?: string;
    handle: (args: string, ctx: CommandContext) => Promise<CommandAction>;
}> = {

    // ── Navegação ──────────────────────────────────────────────────────────────
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
    nova: {
        descricao: 'Nova sessão (esquece contexto)',
        handle: async () => {
            renderInfo('nova sessão iniciada');
            return { type: 'new-session' };
        },
    },
    sessao: {
        descricao: 'Mostra o ID da sessão atual',
        handle: async (_args, ctx) => {
            renderInfo(`sessão: ${ctx.sessionId}`);
            return { type: 'noop' };
        },
    },

    // ── Configuração ───────────────────────────────────────────────────────────
    config: {
        descricao: 'Mostra configuração ativa',
        handle: async () => {
            try {
                const cfg = await rpcCall('get-config', {});
                renderInfo(`provider: ${cfg?.providerId ?? '?'}`);
                renderInfo(`modelo:   ${cfg?.agentModel ?? '?'}`);
                renderInfo(`visão:    ${cfg?.visionModel ?? '?'}`);
                renderInfo(`key:      ${cfg?.apiKey ? '(configurada)' : '(não configurada)'}`);
            } catch (err: any) {
                renderInfo(`erro: ${err?.message}`);
            }
            return { type: 'noop' };
        },
    },

    model: {
        descricao: 'Troca o modelo do agente',
        uso: '/model <id>',
        handle: async (args, ctx) => {
            const modelId = args.trim();
            if (!modelId) {
                // Lista modelos do provider atual
                const { providerId } = getActiveConfig();
                const preset = PROVIDER_PRESETS[providerId as ProviderId];
                if (preset?.models?.length) {
                    renderInfo(`modelos disponíveis para ${providerId}:`);
                    preset.models.forEach(m => renderInfo(`  ${m.id}`));
                } else {
                    renderError('uso: /model <id>');
                }
                return { type: 'noop' };
            }
            await applyAndSync(ctx.userDataDir, { agentModel: modelId, visionModel: modelId });
            renderInfo(`modelo → ${modelId}`);
            return { type: 'noop' };
        },
    },
    modelo: {
        descricao: 'Troca o modelo do agente',
        uso: '/modelo <id>',
        handle: async (args, ctx) => COMMANDS['model']!.handle(args, ctx),
    },

    provider: {
        descricao: 'Troca o provider de IA',
        uso: '/provider <id>',
        handle: async (args, ctx) => {
            const id = args.trim() as ProviderId;
            if (!id) {
                renderInfo('providers: ' + Object.keys(PROVIDER_PRESETS).join(', '));
                return { type: 'noop' };
            }
            if (!PROVIDER_PRESETS[id]) {
                renderError(`provider desconhecido: ${id}`);
                renderInfo('disponíveis: ' + Object.keys(PROVIDER_PRESETS).join(', '));
                return { type: 'noop' };
            }
            const preset = PROVIDER_PRESETS[id]!;
            await applyAndSync(ctx.userDataDir, {
                providerId:   id,
                agentModel:   preset.defaultAgentModel,
                visionModel:  preset.defaultVisionModel,
            });
            renderInfo(`provider → ${id}  (modelo: ${preset.defaultAgentModel})`);
            return { type: 'noop' };
        },
    },

    key: {
        descricao: 'Salva API key do provider atual (ou de outro)',
        uso: '/key <apiKey>  ou  /key <providerId> <apiKey>',
        handle: async (args, ctx) => {
            const parts = args.trim().split(/\s+/);
            let providerId: string;
            let apiKey: string;

            if (parts.length >= 2 && PROVIDER_PRESETS[parts[0] as ProviderId]) {
                // /key openrouter sk-or-...
                providerId = parts[0]!;
                apiKey     = parts.slice(1).join(' ');
            } else {
                // /key sk-or-...  (usa provider atual)
                providerId = getActiveConfig().providerId;
                apiKey     = args.trim();
            }

            if (!apiKey) {
                renderError('uso: /key <apiKey>  ou  /key <providerId> <apiKey>');
                return { type: 'noop' };
            }

            // Persiste criptografado
            initCryptoStoreSalt(ctx.userDataDir);
            const saved = readCliConfig(ctx.userDataDir);
            saved.keys = saved.keys ?? {};
            saved.keys[providerId] = encryptApiKey(apiKey);
            writeCliConfig(ctx.userDataDir, saved);

            // Aplica no runtime se for o provider atual
            if (providerId === getActiveConfig().providerId) {
                await applyAndSync(ctx.userDataDir, { apiKey });
                renderInfo(`chave do ${providerId} salva e aplicada`);
            } else {
                renderInfo(`chave do ${providerId} salva`);
            }
            return { type: 'noop' };
        },
    },

    // ── Ajuda ──────────────────────────────────────────────────────────────────
    help: {
        descricao: 'Lista os comandos disponíveis',
        handle: async () => {
            const shown = new Set<string>();
            for (const [name, cmd] of Object.entries(COMMANDS)) {
                const canonical = cmd.uso?.split(' ')[0]?.replace(/^\//, '') ?? name;
                if (shown.has(canonical)) continue;
                shown.add(canonical);
                // uso já pode começar com /model — não adicionar / extra
                const label = cmd.uso
                    ? (cmd.uso.startsWith('/') ? cmd.uso : '/' + cmd.uso)
                    : '/' + name;
                renderInfo(`  ${label.padEnd(30)} ${cmd.descricao}`);
            }
            return { type: 'noop' };
        },
    },
    ajuda: {
        descricao: 'Lista os comandos disponíveis',
        handle: async (args, ctx) => COMMANDS['help']!.handle(args, ctx),
    },
};

// ── Runner ────────────────────────────────────────────────────────────────────

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
