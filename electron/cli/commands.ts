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
import { promptSelect } from './prompt-select';

function formatAge(ts: number): string {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60)   return 'agora';
    if (secs < 3600) return `${Math.floor(secs / 60)}min atrás`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h atrás`;
    return `${Math.floor(secs / 86400)}d atrás`;
}

export type CommandAction =
    | { type: 'noop' }
    | { type: 'clear' }
    | { type: 'exit' }
    | { type: 'new-session' }
    | { type: 'load-session'; sessionId: string }
    | { type: 'run-goal'; objetivo: string };

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

// ── Brain graph HTML builder ──────────────────────────────────────────────────

function buildGraphHtml(
    graph: { nodes: any[]; edges: any[] },
    userDataDir: string,
): string {
    const TYPE_COLORS: Record<string, string> = {
        processo: '#4fc3f7',
        tese: '#aed581',
        parte: '#ffb74d',
        decisao: '#ef5350',
        aprendizado: '#ce93d8',
        tribunal: '#90a4ae',
        legislacao: '#fff176',
    };

    const visNodes = graph.nodes.map((n: any) => ({
        id: n.id,
        label: n.label?.length > 40 ? n.label.slice(0, 40) + '…' : n.label,
        title: `[${n.type}] ${n.label}`,
        color: TYPE_COLORS[n.type] || '#b0bec5',
        shape: n.type === 'processo' ? 'box' : 'ellipse',
        font: { size: n.type === 'processo' ? 14 : 12 },
    }));

    const visEdges = graph.edges.map((e: any) => ({
        from: e.sourceId,
        to: e.targetId,
        label: e.relation?.replace(/_/g, ' ') || '',
        arrows: 'to',
        color: { color: '#666', opacity: 0.6 },
        font: { size: 9, color: '#999' },
    }));

    const legend = Object.entries(TYPE_COLORS)
        .map(([type, color]) => `<span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:2px;margin-right:4px"></span>${type}`)
        .join('&nbsp;&nbsp;');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>LEX Brain — Grafo de Conhecimento</title>
<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #1a1a2e; color: #eee; }
  #header { padding: 12px 20px; background: #16213e; display: flex; align-items: center; gap: 16px; }
  #header h1 { font-size: 18px; color: #4fc3f7; }
  #legend { font-size: 12px; color: #aaa; }
  #stats { margin-left: auto; font-size: 12px; color: #888; }
  #graph { width: 100vw; height: calc(100vh - 48px); }
</style>
</head>
<body>
<div id="header">
  <h1>LEX Brain</h1>
  <div id="legend">${legend}</div>
  <div id="stats">${visNodes.length} nós · ${visEdges.length} arestas</div>
</div>
<div id="graph"></div>
<script>
  var nodes = new vis.DataSet(${JSON.stringify(visNodes)});
  var edges = new vis.DataSet(${JSON.stringify(visEdges)});
  var container = document.getElementById('graph');
  var network = new vis.Network(container, { nodes: nodes, edges: edges }, {
    physics: { barnesHut: { gravitationalConstant: -3000, springLength: 120 } },
    interaction: { hover: true, tooltipDelay: 100 },
    layout: { improvedLayout: true },
  });
</script>
</body>
</html>`;

    const outDir = path.join(userDataDir, 'brain-viz');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'graph.html');
    fs.writeFileSync(outPath, html, 'utf8');
    return outPath;
}

// ── Registry de comandos ──────────────────────────────────────────────────────

const COMMANDS: Record<string, {
    descricao: string;
    uso?: string;
    subs?: string[];   // subcomandos, exibidos no /help e quando chamado sem args
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

    sessions: {
        descricao: 'Lista sessões recentes (setas para navegar)',
        handle: async () => {
            let previews: Array<{ id: string; messageCount: number; updatedAt: number; preview: string }>;
            try {
                previews = await rpcCall('session-list', {});
            } catch (err: any) {
                renderError(`erro ao listar sessões: ${err?.message}`);
                return { type: 'noop' };
            }
            if (!previews?.length) {
                renderInfo('nenhuma sessão salva');
                return { type: 'noop' };
            }
            const selected = await promptSelect(
                previews,
                (s) => {
                    const age  = formatAge(s.updatedAt).padEnd(10);
                    const msgs = `${s.messageCount}msg`.padEnd(6);
                    const prev = s.preview ? `"${s.preview.slice(0, 45)}${s.preview.length > 45 ? '…' : ''}"` : '';
                    return `${s.id.slice(0, 8)}  ${age}  ${msgs}  ${prev}`;
                },
                'Sessões recentes',
            );
            if (!selected) return { type: 'noop' };
            renderInfo(`sessão carregada: ${selected.id.slice(0, 8)}`);
            return { type: 'load-session', sessionId: selected.id };
        },
    },

    load: {
        descricao: 'Carrega uma sessão anterior',
        uso: '/load <id>',
        handle: async (args) => {
            const prefix = args.trim();
            if (!prefix) {
                renderError('uso: /load <id>  (primeiros 8 chars bastam)');
                return { type: 'noop' };
            }
            let previews: Array<{ id: string }>;
            try {
                previews = await rpcCall('session-list', {});
            } catch (err: any) {
                renderError(`erro: ${err?.message}`);
                return { type: 'noop' };
            }
            const match = previews?.find(s => s.id.startsWith(prefix));
            if (!match) {
                renderError(`sessão não encontrada: ${prefix}`);
                return { type: 'noop' };
            }
            renderInfo(`sessão carregada: ${match.id.slice(0, 8)}`);
            return { type: 'load-session', sessionId: match.id };
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
                const { providerId } = getActiveConfig();
                const preset = PROVIDER_PRESETS[providerId as ProviderId];
                if (!preset?.models?.length) {
                    renderError('uso: /model <id>');
                    return { type: 'noop' };
                }
                const selected = await promptSelect(
                    preset.models,
                    (m) => m.id,
                    `Modelos — ${providerId}`,
                );
                if (!selected) return { type: 'noop' };
                await applyAndSync(ctx.userDataDir, { agentModel: selected.id, visionModel: selected.id });
                renderInfo(`modelo → ${selected.id}`);
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
                const providerIds = Object.keys(PROVIDER_PRESETS);
                const selected = await promptSelect(
                    providerIds,
                    (p) => {
                        const preset = PROVIDER_PRESETS[p as ProviderId]!;
                        return `${p.padEnd(14)}  ${preset.defaultAgentModel}`;
                    },
                    'Providers',
                );
                if (!selected) return { type: 'noop' };
                const preset = PROVIDER_PRESETS[selected as ProviderId]!;
                await applyAndSync(ctx.userDataDir, {
                    providerId:  selected as ProviderId,
                    agentModel:  preset.defaultAgentModel,
                    visionModel: preset.defaultVisionModel,
                });
                renderInfo(`provider → ${selected}  (modelo: ${preset.defaultAgentModel})`);
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

    // ── Scheduler ──────────────────────────────────────────────────────────────
    schedule: {
        descricao: 'Agendamento automático de goals',
        uso: '/schedule <sub> [args]',
        subs: ['list', 'add <cron> <goal>', 'remove <id>', 'run <id>', 'logs <id>'],
        handle: async (args, ctx) => {
            const { addSchedule, removeSchedule, listSchedules, getScheduleLogPath, describeCron } =
                await import('./schedule');

            const tokens = args.trim().split(/\s+/);
            const sub = (tokens[0] || 'list').toLowerCase();
            const rest = tokens.slice(1).join(' ');

            switch (sub) {
                case 'add': {
                    // /schedule add <5 cron fields> <goal...>
                    const parts = rest.trim().split(/\s+/);
                    if (parts.length < 6) {
                        renderInfo('uso: /schedule add <cron 5 campos> <goal>');
                        renderInfo('  ex: /schedule add 0 8 * * * verifica movimentações no PJe');
                        renderInfo('  ex: /schedule add */30 * * * * monitora processo 0001234-56');
                        return { type: 'noop' };
                    }
                    const cronFields = parts.slice(0, 5);
                    const valid = cronFields.every(f => /^[0-9,\-\*\/]+$/.test(f));
                    if (!valid) {
                        renderError('cron inválido — campos aceitos: *, */N, N, N-M, N,M');
                        return { type: 'noop' };
                    }
                    const cron = cronFields.join(' ');
                    const goal = parts.slice(5).join(' ');
                    const { schedule, error } = addSchedule(ctx.userDataDir, goal, cron);
                    if (error || !schedule) {
                        renderError(error || 'falha ao criar task do sistema operacional');
                        return { type: 'noop' };
                    }
                    renderInfo(`agendado: ${schedule.id}  ${describeCron(cron)}`);
                    renderInfo(`  goal: "${schedule.name}"`);
                    renderInfo(`  task OS criada: ${schedule.osTaskName}`);
                    return { type: 'noop' };
                }

                case 'list': {
                    const schedules = listSchedules(ctx.userDataDir);
                    if (!schedules.length) {
                        renderInfo('nenhum agendamento');
                        return { type: 'noop' };
                    }
                    renderInfo(`${schedules.length} agendamento(s):\n`);
                    for (const s of schedules) {
                        const age  = formatAge(s.createdAt);
                        const desc = describeCron(s.cron);
                        renderInfo(`  ${s.id}  ${desc.padEnd(20)}  ${s.name}`);
                        renderInfo(`         criado ${age}  task: ${s.osTaskName}`);
                    }
                    return { type: 'noop' };
                }

                case 'remove':
                case 'rm': {
                    if (!rest.trim()) {
                        renderError('uso: /schedule remove <id>');
                        return { type: 'noop' };
                    }
                    const removed = removeSchedule(ctx.userDataDir, rest.trim());
                    if (!removed) {
                        renderError(`schedule não encontrado: ${rest.trim()}`);
                    } else {
                        renderInfo(`removido: ${removed.id} — "${removed.name}"`);
                    }
                    return { type: 'noop' };
                }

                case 'run': {
                    if (!rest.trim()) {
                        renderError('uso: /schedule run <id>');
                        return { type: 'noop' };
                    }
                    const schedules = listSchedules(ctx.userDataDir);
                    const match = schedules.find(s => s.id.startsWith(rest.trim()));
                    if (!match) {
                        renderError(`schedule não encontrado: ${rest.trim()}`);
                        return { type: 'noop' };
                    }
                    renderInfo(`executando: "${match.name}"…`);
                    return { type: 'run-goal', objetivo: match.goal };
                }

                case 'logs':
                case 'log': {
                    if (!rest.trim()) {
                        renderError('uso: /schedule logs <id>');
                        return { type: 'noop' };
                    }
                    const logPath = getScheduleLogPath(ctx.userDataDir, rest.trim());
                    if (!logPath) {
                        renderError(`schedule não encontrado: ${rest.trim()}`);
                        return { type: 'noop' };
                    }
                    try {
                        const content = require('fs').readFileSync(logPath, 'utf8');
                        const lines = content.split('\n').slice(-30);
                        renderInfo(`últimas 30 linhas de ${logPath}:\n`);
                        for (const l of lines) renderInfo(l);
                    } catch {
                        renderInfo('sem logs ainda');
                    }
                    return { type: 'noop' };
                }

                default:
                    renderError(`subcomando desconhecido: ${sub}`);
                    renderInfo('uso: /schedule add|list|remove|run|logs');
                    return { type: 'noop' };
            }
        },
    },

    agendar: {
        descricao: 'Alias para /schedule',
        uso: '/agendar <sub> [args]',
        handle: async (args, ctx) => COMMANDS['schedule']!.handle(args, ctx),
    },

    // ── Telegram ──────────────────────────────────────────────────────────────
    telegram: {
        descricao: 'Notificações via Telegram',
        uso: '/telegram <sub> [args]',
        subs: ['status', 'config <token> <userId>', 'test'],
        handle: async (args, ctx) => {
            const tokens = args.trim().split(/\s+/);
            const sub = (tokens[0] || 'status').toLowerCase();
            const rest = tokens.slice(1).join(' ');

            initCryptoStoreSalt(ctx.userDataDir);
            const cfg = readCliConfig(ctx.userDataDir);

            switch (sub) {
                case 'config': {
                    // /telegram config <token> <userId>
                    const parts = rest.trim().split(/\s+/);
                    if (parts.length < 2) {
                        renderInfo('uso: /telegram config <bot-token> <user-id>');
                        renderInfo('  1. Crie um bot em @BotFather e copie o token');
                        renderInfo('  2. Mande /start pro bot e descubra seu user ID em @userinfobot');
                        return { type: 'noop' };
                    }
                    const token  = parts[0]!;
                    const userId = parseInt(parts[1]!, 10);
                    if (!userId) {
                        renderError('user ID deve ser numérico');
                        return { type: 'noop' };
                    }
                    cfg.telegramToken  = encryptApiKey(token);
                    cfg.telegramUserId = userId;
                    writeCliConfig(ctx.userDataDir, cfg);
                    renderInfo(`telegram configurado (userId: ${userId})`);
                    return { type: 'noop' };
                }

                case 'status': {
                    const hasToken = !!cfg.telegramToken;
                    const userId   = cfg.telegramUserId || 0;
                    renderInfo(`token:   ${hasToken ? '(configurado)' : '(não configurado)'}`);
                    renderInfo(`userId:  ${userId || '(não configurado)'}`);
                    if (!hasToken) renderInfo('use /telegram config <token> <userId>');
                    return { type: 'noop' };
                }

                case 'test': {
                    if (!cfg.telegramToken || !cfg.telegramUserId) {
                        renderError('telegram não configurado — use /telegram config');
                        return { type: 'noop' };
                    }
                    const { decryptApiKey } = await import('../crypto-store');
                    const token  = decryptApiKey(cfg.telegramToken);
                    const userId = cfg.telegramUserId;
                    try {
                        const url = `https://api.telegram.org/bot${token}/sendMessage`;
                        const res = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: userId,
                                text: '✅ LEX CLI conectado — notificações ativas.',
                            }),
                        });
                        if (!res.ok) {
                            const body = await res.text();
                            renderError(`telegram API erro ${res.status}: ${body.slice(0, 100)}`);
                        } else {
                            renderInfo('mensagem de teste enviada com sucesso');
                        }
                    } catch (err: any) {
                        renderError(`falha: ${err?.message}`);
                    }
                    return { type: 'noop' };
                }

                default:
                    renderError(`subcomando desconhecido: ${sub}`);
                    renderInfo('uso: /telegram config|status|test');
                    return { type: 'noop' };
            }
        },
    },

    // ── Brain ─────────────────────────────────────────────────────────────────
    brain: {
        descricao: 'Base de conhecimento jurídico do LEX',
        uso: '/brain <sub> [args]',
        subs: ['stats', 'search <query>', 'graph', 'export'],
        handle: async (args, ctx) => {
            const tokens = args.trim().split(/\s+/);
            const sub = (tokens[0] || '').toLowerCase();
            const rest = tokens.slice(1).join(' ');

            switch (sub) {
                case '':
                case 'help':
                case 'ajuda':
                    renderInfo('subcomandos disponíveis:');
                    renderInfo('  /brain stats            nós e arestas do conhecimento');
                    renderInfo('  /brain search <query>   busca no conhecimento');
                    renderInfo('  /brain graph            abre grafo visual no browser');
                    renderInfo('  /brain export           exporta para Markdown (Obsidian)');
                    return { type: 'noop' };

                case 'search':
                case 'buscar': {
                    if (!rest.trim()) {
                        renderError('uso: /brain search <query>');
                        return { type: 'noop' };
                    }
                    try {
                        const results = await rpcCall('brain-search', { query: rest.trim(), limit: 10 });
                        if (!results?.length) {
                            renderInfo('nenhum resultado');
                            return { type: 'noop' };
                        }
                        renderInfo(`${results.length} resultado(s):\n`);
                        for (const r of results) {
                            const n = r.node;
                            const score = r.score != null ? ` (${r.score.toFixed(2)})` : '';
                            renderInfo(`  [${n.type}] ${n.label}${score}`);
                            if (n.data) {
                                const extras: string[] = [];
                                if (n.data.classe) extras.push(n.data.classe);
                                if (n.data.tribunal) extras.push(n.data.tribunal);
                                if (n.data.status) extras.push(n.data.status);
                                if (extras.length) renderInfo(`         ${extras.join(' · ')}`);
                            }
                        }
                    } catch (err: any) {
                        renderError(`erro: ${err?.message}`);
                    }
                    return { type: 'noop' };
                }

                case 'stats': {
                    try {
                        const stats = await rpcCall('brain-stats', {});
                        renderInfo(`nós:     ${stats.nodeCount}`);
                        renderInfo(`arestas: ${stats.edgeCount}`);
                        if (stats.byType && Object.keys(stats.byType).length) {
                            renderInfo('por tipo:');
                            for (const [type, count] of Object.entries(stats.byType)) {
                                renderInfo(`  ${type.padEnd(20)} ${count}`);
                            }
                        }
                    } catch (err: any) {
                        renderError(`erro: ${err?.message}`);
                    }
                    return { type: 'noop' };
                }

                case 'graph':
                case 'grafo': {
                    try {
                        const { spawn } = require('child_process') as typeof import('child_process');
                        const launcherPath = require('path').join(__dirname, '../../scripts/launch-electron.js');
                        spawn(process.execPath, [launcherPath, '--view=brain'], {
                            detached: true,
                            stdio: 'ignore',
                        }).unref();
                        renderInfo('abrindo LEX Brain…');
                    } catch (err: any) {
                        renderError(`erro: ${err?.message}`);
                    }
                    return { type: 'noop' };
                }

                case 'export':
                case 'exportar': {
                    try {
                        renderInfo('exportando brain para Markdown…');
                        const result = await rpcCall('brain-export', {});
                        if (result?.error) {
                            renderError(result.error);
                        } else {
                            renderInfo(`${result.fileCount} arquivos gerados em:`);
                            renderInfo(`  ${result.dir}`);
                            renderInfo('compatível com Obsidian (wikilinks)');
                        }
                    } catch (err: any) {
                        renderError(`erro: ${err?.message}`);
                    }
                    return { type: 'noop' };
                }

                default:
                    renderError(`subcomando desconhecido: ${sub}`);
                    renderInfo('uso: /brain search|stats|export');
                    return { type: 'noop' };
            }
        },
    },

    // ── Ollama ────────────────────────────────────────────────────────────────
    ollama: {
        descricao: 'Status e modelos locais do Ollama',
        uso: '/ollama [status|models]',
        subs: ['status', 'models'],
        handle: async (args) => {
            const sub = (args.trim().split(/\s+/)[0] || 'status').toLowerCase();

            switch (sub) {
                case 'status': {
                    try {
                        const st = await rpcCall('ollama-status', {});
                        renderInfo(`rodando: ${st.running ? 'sim' : 'não'}`);
                        if (st.running && st.models?.length) {
                            renderInfo(`modelos: ${st.models.length}`);
                            for (const m of st.models) {
                                const size = m.size ? ` (${(m.size / 1e9).toFixed(1)}GB)` : '';
                                renderInfo(`  ${m.name}${size}`);
                            }
                        } else if (st.running) {
                            renderInfo('nenhum modelo instalado');
                        } else {
                            renderInfo('instale em https://ollama.com');
                        }
                    } catch (err: any) {
                        renderError(`erro: ${err?.message}`);
                    }
                    return { type: 'noop' };
                }

                case 'models':
                case 'modelos': {
                    try {
                        const models = await rpcCall('ollama-list-models', {});
                        if (!models?.length) {
                            renderInfo('nenhum modelo instalado');
                            return { type: 'noop' };
                        }
                        renderInfo(`${models.length} modelo(s):\n`);
                        for (const m of models) {
                            const size = m.size ? ` ${(m.size / 1e9).toFixed(1)}GB` : '';
                            const modified = m.modified_at
                                ? `  ${formatAge(new Date(m.modified_at).getTime())}`
                                : '';
                            renderInfo(`  ${m.name.padEnd(30)}${size}${modified}`);
                        }
                    } catch (err: any) {
                        renderError(`erro: ${err?.message}`);
                    }
                    return { type: 'noop' };
                }

                default:
                    renderError(`subcomando desconhecido: ${sub}`);
                    renderInfo('uso: /ollama status|models');
                    return { type: 'noop' };
            }
        },
    },

    // ── Browser ───────────────────────────────────────────────────────────────
    browser: {
        descricao: 'Status e controle do Chrome/PJe',
        uso: '/browser [status|reinit|focus]',
        subs: ['status', 'reinit', 'focus'],
        handle: async (args) => {
            const sub = (args.trim().split(/\s+/)[0] || 'status').toLowerCase();

            switch (sub) {
                case 'status': {
                    try {
                        const st = await rpcCall('browser-check-pje', {});
                        renderInfo(`conectado:  ${st.connected ? 'sim' : 'não'}`);
                        if (st.connected) {
                            renderInfo(`PJe:        ${st.isPje ? 'sim' : 'não'}`);
                            renderInfo(`URL:        ${st.url || '—'}`);
                            if (st.tribunalAtivo)     renderInfo(`tribunal:   ${st.tribunalAtivo}`);
                            if (st.tribunalPreferido) renderInfo(`preferido:  ${st.tribunalPreferido}`);
                        }
                    } catch (err: any) {
                        renderError(`erro: ${err?.message}`);
                    }
                    return { type: 'noop' };
                }

                case 'reinit': {
                    try {
                        renderInfo('reiniciando browser…');
                        await rpcCall('browser-reinit', {});
                        renderInfo('browser reiniciado');
                    } catch (err: any) {
                        renderError(`erro: ${err?.message}`);
                    }
                    return { type: 'noop' };
                }

                case 'focus': {
                    try {
                        const result = await rpcCall('browser-focus', {});
                        if (result?.ok) {
                            renderInfo('aba do Chrome focada');
                        } else {
                            renderError(result?.error === 'no_active_page' ? 'nenhuma aba ativa' : 'falha ao focar');
                        }
                    } catch (err: any) {
                        renderError(`erro: ${err?.message}`);
                    }
                    return { type: 'noop' };
                }

                default:
                    renderError(`subcomando desconhecido: ${sub}`);
                    renderInfo('uso: /browser status|reinit|focus');
                    return { type: 'noop' };
            }
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
                if (cmd.subs?.length) {
                    for (const sub of cmd.subs) {
                        renderInfo(`    ${'·'.padEnd(2)} /${name} ${sub}`);
                    }
                }
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
