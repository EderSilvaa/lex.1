/**
 * Plugin Manager (Phase 3 AIOS — Plugins)
 *
 * Registro, lifecycle, OAuth tokens e integração com skill/agent registries.
 * Singleton — mesma pattern de analytics.ts e goal-store.ts.
 */

import type { PluginId, PluginStatus, PluginTokens, PluginState, LexPlugin } from './types';
import { registerSkill, unregisterSkill } from '../agent/executor';
import { registerAgentType, unregisterAgentType } from '../agent/agent-types';
import { encryptApiKey, safeDecrypt } from '../crypto-store';

export class PluginManager {
    private store: any = null;
    private storeReady = false;
    private plugins = new Map<PluginId, LexPlugin>();
    private refreshLocks = new Map<PluginId, Promise<PluginTokens>>();
    private refreshCooldowns = new Map<PluginId, number>();  // timestamp até quando esperar

    constructor() {
        this.tryLoadStore();
    }

    private async tryLoadStore(): Promise<void> {
        try {
            const Store = (await import('electron-store')).default;
            this.store = new Store({ name: 'lex-plugins' });
            this.storeReady = true;
        } catch { /* fora do Electron */ }
    }

    private async ensureStore(): Promise<boolean> {
        if (this.storeReady) return true;
        await this.tryLoadStore();
        return this.storeReady;
    }

    // ========================================================================
    // REGISTRO DE PLUGINS
    // ========================================================================

    /** Registra um plugin (chamado no boot) */
    registerPlugin(plugin: LexPlugin): void {
        this.plugins.set(plugin.manifest.id, plugin);
        console.log(`[Plugins] Registrado: ${plugin.manifest.name} (${plugin.manifest.id})`);
    }

    /** Carrega e inicializa todos os plugins registrados */
    async loadAll(): Promise<void> {
        // Garante que o store está pronto antes de ler estados
        await this.ensureStore();

        for (const [id, plugin] of this.plugins) {
            try {
                const state = this.getState(id);
                const tokens = state?.connected ? this.loadTokens(id) : null;
                await plugin.initialize(tokens);

                if (state?.connected && tokens) {
                    this.registerPluginSkills(plugin);
                    this.registerPluginAgentType(plugin);
                }
            } catch (err: any) {
                console.error(`[Plugins] Erro ao carregar ${id}:`, err.message);
                this.updateState(id, { error: err.message });
            }
        }
    }

    // ========================================================================
    // CONNECT / DISCONNECT
    // ========================================================================

    /** Conecta um plugin (OAuth flow ou API key) */
    async connectPlugin(pluginId: PluginId, tokens: PluginTokens, clientId?: string, clientSecret?: string): Promise<void> {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) throw new Error(`Plugin não encontrado: ${pluginId}`);

        // Persiste tokens criptografados
        this.storeTokens(pluginId, tokens);

        const stateUpdate: Partial<PluginState> = {
            installed: true,
            connected: true,
            connectedAt: new Date().toISOString(),
            error: undefined,
        };
        if (clientId) stateUpdate.clientId = clientId;
        if (clientSecret) stateUpdate.clientSecret = encryptApiKey(clientSecret);

        this.updateState(pluginId, stateUpdate);

        // Inicializa com tokens e registra skills/agent
        await plugin.initialize(tokens);
        this.registerPluginSkills(plugin);
        this.registerPluginAgentType(plugin);

        console.log(`[Plugins] Conectado: ${plugin.manifest.name}`);
    }

    /** Desconecta um plugin */
    async disconnectPlugin(pluginId: PluginId): Promise<void> {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) return;

        this.unregisterPluginSkills(plugin);
        this.unregisterPluginAgentType(plugin);

        if (plugin.dispose) {
            await plugin.dispose();
        }

        this.updateState(pluginId, {
            connected: false,
            tokens: undefined,
            error: undefined,
        });

        console.log(`[Plugins] Desconectado: ${plugin.manifest.name}`);
    }

    // ========================================================================
    // TOKEN MANAGEMENT
    // ========================================================================

    /** Retorna token válido (refresh se expirado) */
    async getValidToken(pluginId: PluginId): Promise<PluginTokens> {
        const tokens = this.loadTokens(pluginId);
        if (!tokens) throw new Error(`Sem tokens para plugin: ${pluginId}`);

        // Token ainda válido (5min de margem)
        if (!tokens.expiresAt || tokens.expiresAt > Date.now() + 5 * 60 * 1000) {
            return tokens;
        }

        // Refresh necessário — usa lock para evitar race condition
        if (this.refreshLocks.has(pluginId)) {
            return this.refreshLocks.get(pluginId)!;
        }

        // Cooldown após falha — evita loop de tentativas
        const cooldownUntil = this.refreshCooldowns.get(pluginId);
        if (cooldownUntil && Date.now() < cooldownUntil) {
            throw new Error(`Token refresh para ${pluginId} em cooldown. Tente novamente em ${Math.ceil((cooldownUntil - Date.now()) / 1000)}s.`);
        }

        const refreshPromise = this.refreshToken(pluginId, tokens);
        this.refreshLocks.set(pluginId, refreshPromise);

        try {
            const result = await refreshPromise;
            this.refreshCooldowns.delete(pluginId);  // sucesso: limpa cooldown
            return result;
        } catch (err) {
            this.refreshCooldowns.set(pluginId, Date.now() + 30_000);  // falha: 30s cooldown
            throw err;
        } finally {
            this.refreshLocks.delete(pluginId);
        }
    }

    private async refreshToken(pluginId: PluginId, current: PluginTokens): Promise<PluginTokens> {
        if (!current.refreshToken) {
            throw new Error(`Sem refresh token para ${pluginId}. Reconecte o plugin.`);
        }

        const plugin = this.plugins.get(pluginId);
        if (!plugin?.manifest.auth?.oauth2) {
            throw new Error(`Plugin ${pluginId} não suporta OAuth refresh`);
        }

        const { refreshOAuthToken } = await import('./oauth-flow');
        const { getEmbeddedCredentials } = await import('./credentials');
        const oauth = plugin.manifest.auth.oauth2;
        const state = this.getState(pluginId);
        const group = plugin.manifest.providerGroup;
        const embedded = group ? getEmbeddedCredentials(group) : null;

        const newTokens = await refreshOAuthToken(
            oauth.tokenUrl,
            current.refreshToken,
            state?.clientId || embedded?.clientId || oauth.clientId || '',
            state?.clientSecret ? safeDecrypt(state.clientSecret) : embedded?.clientSecret
        );

        // Preserva refresh token se novo não veio
        if (!newTokens.refreshToken) {
            newTokens.refreshToken = current.refreshToken;
        }

        this.storeTokens(pluginId, newTokens);

        // Notifica plugin
        if (plugin.onTokenRefresh) {
            plugin.onTokenRefresh(newTokens);
        }

        return newTokens;
    }

    // ========================================================================
    // STATE / QUERY
    // ========================================================================

    getPluginStatus(pluginId: PluginId): PluginStatus {
        const state = this.getState(pluginId);
        if (!state || !state.installed) return 'not_installed';
        if (state.error) return 'error';
        if (state.connected) return 'connected';
        return 'installed';
    }

    isConnected(pluginId: PluginId): boolean {
        return this.getPluginStatus(pluginId) === 'connected';
    }

    listPlugins(): Array<{ id: string; name: string; description: string; status: PluginStatus; icon?: string; providerGroup?: string; authType?: string }> {
        const result: Array<{ id: string; name: string; description: string; status: PluginStatus; icon?: string; providerGroup?: string; authType?: string }> = [];
        for (const [id, plugin] of this.plugins) {
            result.push({
                id,
                name: plugin.manifest.name,
                description: plugin.manifest.description,
                status: this.getPluginStatus(id),
                icon: plugin.manifest.icon,
                providerGroup: plugin.manifest.providerGroup,
                authType: plugin.manifest.auth?.type,
            });
        }
        return result;
    }

    getPlugin(pluginId: PluginId): LexPlugin | undefined {
        return this.plugins.get(pluginId);
    }

    getPluginAuthConfig(pluginId: PluginId) {
        const plugin = this.plugins.get(pluginId);
        const group = plugin?.manifest.providerGroup;

        // Verifica credenciais embarcadas
        let embedded = false;
        try {
            const { hasEmbeddedCredentials } = require('./credentials');
            embedded = !!(group && hasEmbeddedCredentials(group));
        } catch { /* fallback */ }

        return {
            auth: plugin?.manifest.auth || null,
            providerGroup: group || null,
            embedded,
        };
    }


    // ========================================================================
    // INTERNALS — SKILLS & AGENT TYPES
    // ========================================================================

    private registerPluginSkills(plugin: LexPlugin): void {
        const skills = plugin.getSkills();
        for (const skill of skills) {
            registerSkill(skill);
        }
    }

    private unregisterPluginSkills(plugin: LexPlugin): void {
        const skills = plugin.getSkills();
        for (const skill of skills) {
            unregisterSkill(skill.nome);
        }
    }

    private registerPluginAgentType(plugin: LexPlugin): void {
        const at = plugin.manifest.agentType;
        if (!at) return;
        registerAgentType({
            typeId: at.typeId,
            displayName: at.displayName,
            allowedSkillCategories: at.allowedSkillCategories,
            systemPromptExtra: at.systemPromptExtra,
            configOverrides: at.configOverrides,
        });
    }

    private unregisterPluginAgentType(plugin: LexPlugin): void {
        const at = plugin.manifest.agentType;
        if (!at) return;
        unregisterAgentType(at.typeId);
    }

    // ========================================================================
    // INTERNALS — PERSISTENCE
    // ========================================================================

    private getState(pluginId: PluginId): PluginState | null {
        if (!this.storeReady) return null;
        const plugins = this.store.get('plugins', {}) as Record<string, PluginState>;
        return plugins[pluginId] || null;
    }

    private updateState(pluginId: PluginId, updates: Partial<PluginState>): void {
        if (!this.storeReady) return;
        const plugins = this.store.get('plugins', {}) as Record<string, PluginState>;
        plugins[pluginId] = { ...(plugins[pluginId] || { installed: true, connected: false }), ...updates };
        this.store.set('plugins', plugins);
    }

    private storeTokens(pluginId: PluginId, tokens: PluginTokens): void {
        const encrypted = encryptApiKey(JSON.stringify(tokens));
        this.updateState(pluginId, { tokens: encrypted });
    }

    private loadTokens(pluginId: PluginId): PluginTokens | null {
        const state = this.getState(pluginId);
        if (!state?.tokens) return null;
        try {
            const json = safeDecrypt(state.tokens);
            return JSON.parse(json) as PluginTokens;
        } catch {
            return null;
        }
    }
}

// Singleton
let instance: PluginManager | null = null;
export function getPluginManager(): PluginManager {
    if (!instance) instance = new PluginManager();
    return instance;
}
