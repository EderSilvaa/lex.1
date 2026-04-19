/**
 * MCP Manager — carrega e multiplexa servers MCP do ecossistema.
 *
 * Lê `~/.lex/mcp.json`, spawna cada server stdio declarado, e expõe:
 *   - listTools()       — agrega tools de todos os servers (para passar ao LLM)
 *   - callTool(name)    — roteia a chamada para o server correto
 *
 * Convenção de nomes: tools ficam prefixadas com o nome do server para evitar
 * colisão (ex: `filesystem__read_file`, `browser__navigate`). O prefixo é
 * removido antes de encaminhar ao server.
 *
 * Obs: usado pelo fork Anthropic+MCP no ai-handler. Providers não-Anthropic
 * continuam ignorando MCP (fallback nas skills nativas do LEX).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

export interface McpConfigFile {
    mcpServers?: Record<string, McpServerConfig>;
}

export interface McpTool {
    name: string;                  // prefixado (ex: filesystem__read_file)
    description: string;
    input_schema: Record<string, unknown>;
}

interface ConnectedServer {
    id: string;
    client: Client;
    transport: StdioClientTransport;
    tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
}

const TOOL_NAME_SEPARATOR = '__';

class McpManager {
    private servers = new Map<string, ConnectedServer>();
    private restartingPromises = new Map<string, Promise<void>>();
    private initialized = false;
    private configPath: string;

    constructor() {
        this.configPath = path.join(os.homedir(), '.lex', 'mcp.json');
    }

    /** Extrai o serverId de uma tool prefixada. null se não tiver prefixo. */
    getServerIdFromToolName(prefixedName: string): string | null {
        const idx = prefixedName.indexOf(TOOL_NAME_SEPARATOR);
        return idx === -1 ? null : prefixedName.slice(0, idx);
    }

    /**
     * Fecha e re-spawna um server MCP pelo id. Usado quando uma tool trava
     * — o processo filho (ex: browser-use Python) pode estar pendurado em I/O
     * e uma chamada nova enfileiraria atrás da antiga. Restart limpa estado.
     *
     * Idempotente: chamadas concorrentes compartilham a mesma Promise.
     */
    async restartServer(id: string): Promise<void> {
        const existing = this.restartingPromises.get(id);
        if (existing) return existing;

        const promise = this._doRestart(id);
        this.restartingPromises.set(id, promise);
        try {
            await promise;
        } finally {
            this.restartingPromises.delete(id);
        }
    }

    private async _doRestart(id: string): Promise<void> {
        const srv = this.servers.get(id);
        if (srv) {
            console.log(`[MCP] Reiniciando server "${id}"...`);
            try {
                // close() do Client dispara close() do Transport que mata o child.
                // Promise.race protege caso o close também pendure.
                await Promise.race([
                    srv.client.close(),
                    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
                ]);
            } catch { /* ignore */ }
            this.servers.delete(id);
        }

        const cfg = this.loadConfig();
        const spec = cfg.mcpServers?.[id];
        if (!spec) {
            console.warn(`[MCP] Não posso reiniciar "${id}" — ausente no config`);
            return;
        }
        await this.connectServer(id, spec);
        console.log(`[MCP] Server "${id}" reiniciado (${this.servers.get(id)?.tools.length || 0} tools).`);
    }

    /** Caminho do arquivo de config (para UI/diagnóstico). */
    getConfigPath(): string {
        return this.configPath;
    }

    /** Lê config do disco; retorna `{}` se arquivo não existe. */
    loadConfig(): McpConfigFile {
        try {
            if (!fs.existsSync(this.configPath)) return {};
            const raw = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(raw) as McpConfigFile;
        } catch (err: any) {
            console.warn(`[MCP] Falha ao ler ${this.configPath}: ${err?.message}`);
            return {};
        }
    }

    /** Garante que o arquivo de config existe (cria template + sidecar de exemplo). */
    ensureConfigTemplate(): void {
        const dir = path.dirname(this.configPath);
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch { /* ignore */ }

        // Template principal (JSON válido, vazio).
        if (!fs.existsSync(this.configPath)) {
            try {
                const template: McpConfigFile = { mcpServers: {} };
                fs.writeFileSync(this.configPath, JSON.stringify(template, null, 2), 'utf8');
            } catch (err: any) {
                console.warn(`[MCP] Falha ao criar template: ${err?.message}`);
            }
        }

        // Sidecar com exemplos (filesystem + browser-use).
        const examplePath = path.join(dir, 'mcp.example.json');
        if (!fs.existsSync(examplePath)) {
            try {
                const example = {
                    mcpServers: {
                        filesystem: {
                            command: 'npx',
                            args: [
                                '-y', '@modelcontextprotocol/server-filesystem',
                                path.join(os.homedir(), 'Documents'),
                                path.join(os.homedir(), 'Downloads'),
                                path.join(os.homedir(), 'Desktop'),
                                os.homedir(),
                            ],
                        },
                        browser: {
                            command: 'uvx',
                            args: ['browser-use-mcp-server', '--mcp', '--cdp-url', 'http://localhost:19222'],
                        },
                    },
                };
                fs.writeFileSync(examplePath, JSON.stringify(example, null, 2), 'utf8');
            } catch (err: any) {
                console.warn(`[MCP] Falha ao criar mcp.example.json: ${err?.message}`);
            }
        }
    }

    /** Há pelo menos um server configurado? */
    hasServers(): boolean {
        const cfg = this.loadConfig();
        return !!cfg.mcpServers && Object.keys(cfg.mcpServers).length > 0;
    }

    /**
     * Conecta todos os servers declarados no mcp.json (idempotente).
     * Servers que falham no handshake são logados mas não travam os demais.
     */
    async init(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        const cfg = this.loadConfig();
        const servers = cfg.mcpServers || {};
        const ids = Object.keys(servers);
        if (ids.length === 0) return;

        console.log(`[MCP] Conectando ${ids.length} server(s)…`);

        await Promise.all(ids.map(async (id) => {
            const spec = servers[id]!;
            try {
                await this.connectServer(id, spec);
            } catch (err: any) {
                console.warn(`[MCP] Falha em "${id}": ${err?.message || String(err)}`);
            }
        }));

        const total = [...this.servers.values()].reduce((n, s) => n + s.tools.length, 0);
        console.log(`[MCP] Pronto: ${this.servers.size} server(s), ${total} tool(s).`);
    }

    private async connectServer(id: string, spec: McpServerConfig): Promise<void> {
        const transport = new StdioClientTransport({
            command: spec.command,
            args: spec.args || [],
            env: { ...process.env, ...(spec.env || {}) } as Record<string, string>,
        });

        const client = new Client({ name: 'lex-cli', version: '1.0.0' });
        await client.connect(transport);

        const { tools } = await client.listTools();
        this.servers.set(id, {
            id,
            client,
            transport,
            tools: tools.map((t) => ({
                name: t.name,
                description: t.description || '',
                inputSchema: (t.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
            })),
        });
    }

    /** Lista agregada de tools, prefixada com `<server>__`. */
    listTools(): McpTool[] {
        const out: McpTool[] = [];
        for (const srv of this.servers.values()) {
            for (const t of srv.tools) {
                out.push({
                    name: `${srv.id}${TOOL_NAME_SEPARATOR}${t.name}`,
                    description: t.description,
                    input_schema: t.inputSchema,
                });
            }
        }
        return out;
    }

    /**
     * Roteia a chamada para o server correto.
     * Retorna o bloco de content no formato Anthropic (lista de {type,text}).
     */
    async callTool(prefixedName: string, args: Record<string, unknown>): Promise<string> {
        const idx = prefixedName.indexOf(TOOL_NAME_SEPARATOR);
        if (idx === -1) throw new Error(`Tool sem prefixo de server: ${prefixedName}`);
        const serverId = prefixedName.slice(0, idx);
        const toolName = prefixedName.slice(idx + TOOL_NAME_SEPARATOR.length);

        const srv = this.servers.get(serverId);
        if (!srv) throw new Error(`Server MCP não conectado: ${serverId}`);

        const result = await srv.client.callTool({ name: toolName, arguments: args });
        // result.content é array de content blocks (text, image, etc.). Concatena text.
        const content = (result as any).content;
        if (Array.isArray(content)) {
            return content
                .map((c: any) => (c.type === 'text' ? String(c.text) : `[${c.type}]`))
                .join('\n');
        }
        return typeof content === 'string' ? content : JSON.stringify(result);
    }

    /** Fecha todos os clients (ao encerrar o processo). */
    async close(): Promise<void> {
        for (const srv of this.servers.values()) {
            try { await srv.client.close(); } catch { /* ignore */ }
        }
        this.servers.clear();
        this.initialized = false;
    }
}

let singleton: McpManager | null = null;

export function getMcpManager(): McpManager {
    if (!singleton) singleton = new McpManager();
    return singleton;
}
