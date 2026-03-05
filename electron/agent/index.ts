/**
 * Lex Agent - Exports
 *
 * Ponto de entrada do módulo de agente.
 */

// Core
export { runAgentLoop, cancelAgentLoop, getAgentState, listActiveRuns, agentEmitter } from './loop';
export { think } from './think';
export { critic } from './critic';
export {
    executeSkill,
    registerSkill,
    registerSkills,
    listSkills,
    getSkill,
    getSkillsForPrompt,
    loadSkillsFromDir
} from './executor';

// Prompt-Layer
export {
    buildPromptLayerSystem,
    loadTenantConfig,
    getDefaultTenantConfig
} from './prompt-layer';

// Memory
export { Memory, getMemory } from './memory';

// Cache (B1)
export { ResponseCache, getResponseCache } from './cache';

// Retry (C3)
export { withRetry, withAIRetry, withPJeRetry } from './retry';

// Usage Tracker (B4)
export { UsageTracker, getUsageTracker } from './usage-tracker';

// Session Manager (A2)
export { SessionManager, getSessionManager } from './session';

// Action Queue (C2)
export { ActionQueue, getActionQueue } from './action-queue';

// Types
export * from './types';

// Skills (carrega automaticamente)
import { loadMockSkills } from '../skills/mock';
import { loadSkillsFromDir } from './executor';
import { registerPJeSkills } from '../skills/pje';

// Inicialização
let initialized = false;

export async function initializeAgent(): Promise<void> {
    if (initialized) return;

    console.log('[Agent] Inicializando...');

    // Carrega skills mock (para desenvolvimento/teste)
    loadMockSkills();

    // Garante registro imediato das skills reais de PJe em runtime.
    // Isso evita cair em respostas de "skill nao disponivel" quando o loader dinamico falha.
    registerPJeSkills();

    // C1: Carregar skills reais (substituem mocks de mesmo nome)
    try {
        await loadSkillsFromDir('skills/pje');
    } catch (e: any) {
        console.warn('[Agent] Erro ao carregar skills PJe:', e.message);
    }

    // Futuro: mais diretórios de skills
    // await loadSkillsFromDir('skills/documentos');
    // await loadSkillsFromDir('skills/pesquisa');

    initialized = true;
    console.log('[Agent] Inicializado com sucesso');
}
