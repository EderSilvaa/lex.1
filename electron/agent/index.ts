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
import { loadSkillsFromDir } from './executor';
import { registerPJeSkills } from '../skills/pje';
import { registerOsSkills } from '../skills/os';
import { registerPcSkills } from '../skills/pc';
import { registerDocumentosSkills } from '../skills/documentos';
import { registerPesquisaSkills } from '../skills/pesquisa';
import { registerBrowserSkills } from '../skills/browser';

// Inicialização
let initialized = false;

export async function initializeAgent(): Promise<void> {
    if (initialized) return;

    console.log('[Agent] Inicializando...');

    // Registra skills reais
    registerPJeSkills();
    registerOsSkills();
    registerPcSkills();
    registerDocumentosSkills();
    registerPesquisaSkills();
    registerBrowserSkills();

    // C1: Carregar skills reais (substituem mocks de mesmo nome)
    try {
        await loadSkillsFromDir('skills/pje');
    } catch (e: any) {
        console.warn('[Agent] Erro ao carregar skills PJe:', e.message);
    }

    try {
        await loadSkillsFromDir('skills/os');
    } catch (e: any) {
        console.warn('[Agent] Erro ao carregar skills OS:', e.message);
    }

    try {
        await loadSkillsFromDir('skills/pc');
    } catch (e: any) {
        console.warn('[Agent] Erro ao carregar skills PC:', e.message);
    }

    try {
        await loadSkillsFromDir('skills/documentos');
    } catch (e: any) {
        console.warn('[Agent] Erro ao carregar skills Documentos:', e.message);
    }

    try {
        await loadSkillsFromDir('skills/pesquisa');
    } catch (e: any) {
        console.warn('[Agent] Erro ao carregar skills Pesquisa:', e.message);
    }

    try {
        await loadSkillsFromDir('skills/browser');
    } catch (e: any) {
        console.warn('[Agent] Erro ao carregar skills Browser:', e.message);
    }

    initialized = true;
    console.log('[Agent] Inicializado com sucesso');
}
