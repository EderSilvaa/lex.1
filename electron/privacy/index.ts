/**
 * Privacy Module — Barrel Export
 *
 * Camadas de segurança e privacidade do LEX:
 *   1. PII Vault — máscara reversível de dados sensíveis
 *   2. Consent Manager — controle de consentimento
 *   3. Audit Log — registro de envios
 *   4. Encrypted Storage — criptografia em repouso
 */

export {
    createVault,
    clearVault,
    mask,
    unmask,
    maskObject,
    unmaskObject,
    maskKnownEntities,
    maskPatterns,
    maskUnknownNames,
    getVaultStats,
    getVaultSummary,
    type PIIVault,
    type PIICategory,
    type PIIStats
} from './pii-vault';

export {
    initConsentManager,
    getConsentConfig,
    getEffectiveLevel,
    shouldMaskPII,
    shouldUseLocalModel,
    getMaskingRules,
    setDefaultLevel,
    setProviderConsent,
    completeOnboarding,
    isOnboardingCompleted,
    revokeAllConsent,
    type ConsentLevel,
    type ConsentConfig,
    type ProviderConsent
} from './consent-manager';

export {
    initAuditLog,
    logLLMCall,
    logConsentChange,
    logDataDelete,
    flushAuditLog,
    getEntriesForDate,
    getAuditSummary,
    type AuditEntry
} from './audit-log';

export {
    saveEncrypted,
    loadEncrypted,
    isFileEncrypted,
    secureDelete
} from './encrypted-storage';
