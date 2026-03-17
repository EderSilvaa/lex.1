/**
 * Consent Manager — Controle de Consentimento de Privacidade
 *
 * Gerencia os níveis de consentimento do usuário para envio de dados a LLMs.
 * Persiste config em disco (criptografada).
 *
 * Níveis:
 *   0 = Modelo local (Ollama) — nada sai da máquina
 *   1 = Anonimizado completo (padrão) — PII Vault masca tudo
 *   2 = Anonimizado parcial — nomes mantidos, docs anonimizados
 *   3 = Sem anonimização (opt-in explícito)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// TYPES
// ============================================================================

export type ConsentLevel = 0 | 1 | 2 | 3;

export interface ProviderConsent {
    consented: boolean;
    level: ConsentLevel;
    consentedAt: string;       // ISO date
    consentVersion: string;    // versão do termo aceito
}

export interface DataTypeConsent {
    nomes: boolean;            // nomes de partes
    documentos: boolean;       // conteúdo de documentos
    cpf_cnpj: boolean;         // documentos de identidade
    valores: boolean;          // valores monetários
    historico: boolean;        // histórico de conversas
}

export interface ConsentConfig {
    /** Nível padrão de anonimização */
    defaultLevel: ConsentLevel;

    /** Consentimento por provider */
    providers: Record<string, ProviderConsent>;

    /** Consentimento por tipo de dado */
    dataTypes: DataTypeConsent;

    /** Se consent negado, usar Ollama como fallback? */
    fallbackToLocal: boolean;

    /** Usuário completou o first-run dialog? */
    onboardingCompleted: boolean;

    /** Versão do termo de consentimento atual */
    currentVersion: string;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const CONSENT_VERSION = '1.0.0';

const DEFAULT_CONFIG: ConsentConfig = {
    defaultLevel: 1,   // Anonimizado completo é o padrão
    providers: {},
    dataTypes: {
        nomes: false,       // mascarar por padrão
        documentos: false,
        cpf_cnpj: false,
        valores: false,
        historico: false
    },
    fallbackToLocal: false,
    onboardingCompleted: false,
    currentVersion: CONSENT_VERSION
};

// ============================================================================
// CONSENT MANAGER
// ============================================================================

let config: ConsentConfig | null = null;
let configFile: string | null = null;

/**
 * Inicializa o consent manager. Deve ser chamado no boot do app.
 */
export function initConsentManager(userDataDir?: string): void {
    const dir = userDataDir || getDefaultDir();
    configFile = path.join(dir, 'consent-config.json');
    config = loadConfig();
}

/**
 * Retorna a config atual de consentimento.
 */
export function getConsentConfig(): ConsentConfig {
    if (!config) {
        config = loadConfig();
    }
    return { ...config };
}

/**
 * Retorna o nível efetivo de consentimento para um provider.
 * Considera: config do provider > config padrão > fallback
 */
export function getEffectiveLevel(providerId?: string): ConsentLevel {
    const cfg = getConsentConfig();

    if (providerId && cfg.providers[providerId]) {
        const providerConsent = cfg.providers[providerId];
        if (!providerConsent.consented) {
            return cfg.fallbackToLocal ? 0 : cfg.defaultLevel;
        }
        return providerConsent.level;
    }

    return cfg.defaultLevel;
}

/**
 * Verifica se o nível efetivo requer mascaramento de PII.
 */
export function shouldMaskPII(providerId?: string): boolean {
    const level = getEffectiveLevel(providerId);
    return level === 1 || level === 2;
}

/**
 * Verifica se deve usar modelo local (nível 0).
 */
export function shouldUseLocalModel(providerId?: string): boolean {
    return getEffectiveLevel(providerId) === 0;
}

/**
 * Verifica quais tipos de PII devem ser mascarados no nível atual.
 * Nível 1: mascara TUDO
 * Nível 2: mantém nomes, mascara o resto
 * Nível 3: não mascara nada
 * Nível 0: irrelevante (usa modelo local)
 */
export function getMaskingRules(providerId?: string): {
    maskNames: boolean;
    maskDocuments: boolean;
    maskCpfCnpj: boolean;
    maskValues: boolean;
    maskContacts: boolean;
} {
    const level = getEffectiveLevel(providerId);

    switch (level) {
        case 0: // Local — não precisa mascarar
        case 3: // Sem anonimização
            return {
                maskNames: false,
                maskDocuments: false,
                maskCpfCnpj: false,
                maskValues: false,
                maskContacts: false
            };
        case 2: // Parcial — mantém nomes
            return {
                maskNames: false,
                maskDocuments: true,
                maskCpfCnpj: true,
                maskValues: true,
                maskContacts: true
            };
        case 1: // Completo
        default:
            return {
                maskNames: true,
                maskDocuments: true,
                maskCpfCnpj: true,
                maskValues: true,
                maskContacts: true
            };
    }
}

/**
 * Atualiza o nível padrão de consentimento.
 */
export function setDefaultLevel(level: ConsentLevel): void {
    const cfg = getConsentConfig();
    cfg.defaultLevel = level;
    saveConfig(cfg);
}

/**
 * Registra consentimento para um provider específico.
 */
export function setProviderConsent(providerId: string, level: ConsentLevel, consented: boolean): void {
    const cfg = getConsentConfig();
    cfg.providers[providerId] = {
        consented,
        level,
        consentedAt: new Date().toISOString(),
        consentVersion: CONSENT_VERSION
    };
    saveConfig(cfg);
}

/**
 * Marca o onboarding como completado.
 */
export function completeOnboarding(level: ConsentLevel): void {
    const cfg = getConsentConfig();
    cfg.defaultLevel = level;
    cfg.onboardingCompleted = true;
    saveConfig(cfg);
}

/**
 * Verifica se o onboarding foi completado.
 */
export function isOnboardingCompleted(): boolean {
    return getConsentConfig().onboardingCompleted;
}

/**
 * Reseta todo o consentimento (LGPD — direito de revogação).
 */
export function revokeAllConsent(): void {
    const cfg = { ...DEFAULT_CONFIG };
    cfg.onboardingCompleted = false;
    saveConfig(cfg);
}

// ============================================================================
// PERSISTENCE
// ============================================================================

function getDefaultDir(): string {
    const appData = process.env['APPDATA'] || os.homedir();
    return path.join(appData, 'lex-test1');
}

function loadConfig(): ConsentConfig {
    try {
        const file = configFile || path.join(getDefaultDir(), 'consent-config.json');
        if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG };

        const raw = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(raw);

        // Merge com defaults para campos novos
        return {
            ...DEFAULT_CONFIG,
            ...parsed,
            dataTypes: { ...DEFAULT_CONFIG.dataTypes, ...(parsed.dataTypes || {}) }
        };
    } catch (e: any) {
        console.warn('[ConsentManager] Falha ao carregar config:', e.message);
        return { ...DEFAULT_CONFIG };
    }
}

function saveConfig(cfg: ConsentConfig): void {
    config = cfg;
    try {
        const file = configFile || path.join(getDefaultDir(), 'consent-config.json');
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch (e: any) {
        console.warn('[ConsentManager] Falha ao salvar config:', e.message);
    }
}
