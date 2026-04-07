/**
 * CLI — Config de provider/modelo/API key
 *
 * Persiste em: {userDataDir}/cli-config.json
 * API keys são criptografadas via crypto-store (AES-256-GCM, mesmo mecanismo do Electron).
 *
 * Prioridade de configuração ao bootar:
 *   1. Flag inline (--provider, --model) — Fase 3.5 futura
 *   2. Env vars  LEX_ANTHROPIC_KEY, LEX_OPENAI_KEY, etc.
 *   3. cli-config.json
 *   4. Defaults do PROVIDER_PRESETS
 *
 * Subcomando: lex config <ação> [args]
 *   lex config get
 *   lex config set provider <id>
 *   lex config set model <id>
 *   lex config set key <providerId> <apiKey>
 *   lex config list-providers
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    PROVIDER_PRESETS,
    setActiveConfig,
    type ProviderId,
    type ActiveProviderConfig,
} from '../provider-config';
import {
    initCryptoStoreSalt,
    encryptApiKey,
    safeDecrypt,
} from '../crypto-store';
import { syncConfigToBackend, isBackendAlive } from '../backend-client';

// ── Estrutura persistida em cli-config.json ──────────────────────────────────

interface CliConfig {
    providerId?: ProviderId;
    agentModel?: string;
    visionModel?: string;
    /** Mapa providerId → apiKey criptografada */
    keys?: Record<string, string>;
}

function configPath(userDataDir: string): string {
    return path.join(userDataDir, 'cli-config.json');
}

function readConfig(userDataDir: string): CliConfig {
    try {
        const raw = fs.readFileSync(configPath(userDataDir), 'utf8');
        return JSON.parse(raw) as CliConfig;
    } catch {
        return {};
    }
}

function writeConfig(userDataDir: string, cfg: CliConfig): void {
    fs.writeFileSync(configPath(userDataDir), JSON.stringify(cfg, null, 2), 'utf8');
}

// ── Env var por provider ──────────────────────────────────────────────────────

const ENV_KEY_MAP: Record<string, string> = {
    anthropic:  'LEX_ANTHROPIC_KEY',
    openai:     'LEX_OPENAI_KEY',
    openrouter: 'LEX_OPENROUTER_KEY',
    google:     'LEX_GOOGLE_KEY',
    groq:       'LEX_GROQ_KEY',
    ollama:     '', // sem chave
};

function getEnvKey(providerId: string): string {
    const envVar = ENV_KEY_MAP[providerId];
    if (!envVar) return '';
    return process.env[envVar]?.trim() || '';
}

// ── Bootstrap: monta e aplica config ativa ───────────────────────────────────

export function bootstrapConfig(userDataDir: string): void {
    initCryptoStoreSalt(userDataDir);
    const saved = readConfig(userDataDir);

    const providerId: ProviderId =
        (saved.providerId as ProviderId) ?? 'anthropic';

    const preset = PROVIDER_PRESETS[providerId] ?? PROVIDER_PRESETS.anthropic;

    const agentModel  = saved.agentModel  ?? preset.defaultAgentModel;
    const visionModel = saved.visionModel ?? preset.defaultVisionModel;

    // Prioridade: env var > chave salva
    const envKey = getEnvKey(providerId);
    let apiKey = envKey;

    if (!apiKey) {
        const stored = saved.keys?.[providerId] ?? '';
        apiKey = safeDecrypt(stored);
    }

    const cfg: ActiveProviderConfig = { providerId, apiKey, agentModel, visionModel };
    setActiveConfig(cfg);
}

/**
 * Reaplica config ativa no backend (se estiver vivo).
 * Chamado após qualquer mudança de config em runtime.
 */
export async function applyConfigToBackend(): Promise<void> {
    if (!isBackendAlive()) return;
    const { getActiveConfig } = await import('../provider-config');
    await syncConfigToBackend(getActiveConfig());
}

// ── Subcomandos CLI ───────────────────────────────────────────────────────────

export async function runConfigCommand(
    argv: string[],
    userDataDir: string,
): Promise<number> {
    initCryptoStoreSalt(userDataDir);
    const [action, ...rest] = argv;

    if (!action || action === 'get') {
        return cmdGet(userDataDir);
    }
    if (action === 'set') {
        return cmdSet(rest, userDataDir);
    }
    if (action === 'list-providers') {
        return cmdListProviders();
    }

    process.stdout.write(`config: ação desconhecida "${action}"\n`);
    process.stdout.write('ações disponíveis: get, set, list-providers\n');
    return 1;
}

function cmdGet(userDataDir: string): number {
    const cfg = readConfig(userDataDir);
    const providerId = cfg.providerId ?? 'anthropic';
    const preset     = PROVIDER_PRESETS[providerId as ProviderId] ?? PROVIDER_PRESETS.anthropic;
    const agentModel = cfg.agentModel ?? preset.defaultAgentModel;
    const hasKey     = !!(cfg.keys?.[providerId]);
    const envKey     = getEnvKey(providerId);

    process.stdout.write(`provider:    ${providerId}\n`);
    process.stdout.write(`modelo:      ${agentModel}\n`);
    process.stdout.write(`api key:     ${envKey ? '(env var)' : hasKey ? '(salva)' : '(não configurada)'}\n`);
    process.stdout.write(`config file: ${path.join(userDataDir, 'cli-config.json')}\n`);
    return 0;
}

function cmdSet(args: string[], userDataDir: string): number {
    const [field, ...values] = args;

    if (field === 'provider') {
        const id = values[0];
        if (!id) { process.stdout.write('uso: lex config set provider <id>\n'); return 1; }
        if (!PROVIDER_PRESETS[id as ProviderId]) {
            process.stdout.write(`provider desconhecido: ${id}\n`);
            process.stdout.write(`disponíveis: ${Object.keys(PROVIDER_PRESETS).join(', ')}\n`);
            return 1;
        }
        const cfg = readConfig(userDataDir);
        const preset = PROVIDER_PRESETS[id as ProviderId]!;
        cfg.providerId  = id as ProviderId;
        cfg.agentModel  = preset.defaultAgentModel;
        cfg.visionModel = preset.defaultVisionModel;
        writeConfig(userDataDir, cfg);
        process.stdout.write(`provider → ${id} (modelo padrão: ${preset.defaultAgentModel})\n`);
        return 0;
    }

    if (field === 'model') {
        const model = values[0];
        if (!model) { process.stdout.write('uso: lex config set model <id>\n'); return 1; }
        const cfg = readConfig(userDataDir);
        cfg.agentModel = model;
        writeConfig(userDataDir, cfg);
        process.stdout.write(`modelo → ${model}\n`);
        return 0;
    }

    if (field === 'key') {
        const [providerId, apiKey] = values;
        if (!providerId || !apiKey) {
            process.stdout.write('uso: lex config set key <providerId> <apiKey>\n');
            return 1;
        }
        if (!PROVIDER_PRESETS[providerId as ProviderId]) {
            process.stdout.write(`provider desconhecido: ${providerId}\n`);
            return 1;
        }
        const cfg = readConfig(userDataDir);
        cfg.keys = cfg.keys ?? {};
        cfg.keys[providerId] = encryptApiKey(apiKey);
        writeConfig(userDataDir, cfg);
        process.stdout.write(`chave salva para ${providerId} (criptografada)\n`);
        return 0;
    }

    process.stdout.write(`set: campo desconhecido "${field}"\n`);
    process.stdout.write('campos disponíveis: provider, model, key\n');
    return 1;
}

function cmdListProviders(): number {
    process.stdout.write('providers disponíveis:\n');
    for (const [id, preset] of Object.entries(PROVIDER_PRESETS)) {
        process.stdout.write(`  ${id.padEnd(12)} ${preset.name}\n`);
        process.stdout.write(`               modelo padrão: ${preset.defaultAgentModel}\n`);
    }
    return 0;
}
