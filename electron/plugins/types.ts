/**
 * Plugin Types (Phase 3 AIOS — Plugins)
 *
 * Interface genérica para plugins de integração externa.
 * Cada plugin = manifest + skills + auth (OAuth ou API key).
 */

import type { Skill, AgentConfig } from '../agent/types';

export type PluginId = string;
export type PluginStatus = 'not_installed' | 'installed' | 'connected' | 'error';

export interface LexPluginManifest {
    id: PluginId;
    name: string;
    description: string;
    version: string;
    author: string;
    icon?: string;

    /** Categoria de skill que este plugin registra */
    skillCategory: string;

    /** Tipo de agente que este plugin registra (opcional) */
    agentType?: {
        typeId: string;
        displayName: string;
        systemPromptExtra: string;
        allowedSkillCategories: string[];
        configOverrides?: Partial<AgentConfig>;
    };

    /** Grupo de provedor OAuth (ex: 'google', 'microsoft') — compartilha Client ID */
    providerGroup?: string;

    /** Config de autenticação */
    auth: PluginAuthConfig | null;
}

export interface PluginAuthConfig {
    type: 'oauth2' | 'api_key' | 'token';

    oauth2?: {
        authorizationUrl: string;
        tokenUrl: string;
        scopes: string[];
        /** Client ID default (usuário pode overridar) */
        clientId?: string;
        pkce?: boolean;
        additionalParams?: Record<string, string>;
    };

    apiKey?: {
        instructions: string;
        url: string;
    };
}

export interface PluginTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    tokenType?: string;
    scope?: string;
}

export interface LexPlugin {
    manifest: LexPluginManifest;

    /** Inicializa o plugin com tokens (ou null se não conectado) */
    initialize(tokens: PluginTokens | null): Promise<void>;

    /** Retorna as skills que este plugin fornece */
    getSkills(): Skill[];

    /** Chamado quando tokens são refreshed */
    onTokenRefresh?(tokens: PluginTokens): void;

    /** Cleanup ao descarregar */
    dispose?(): Promise<void>;
}

/** Estado persistido de um plugin no store */
export interface PluginState {
    installed: boolean;
    connected: boolean;
    connectedAt?: string;
    clientId?: string;
    clientSecret?: string; // criptografado
    tokens?: string;       // PluginTokens JSON criptografado
    error?: string;
}
