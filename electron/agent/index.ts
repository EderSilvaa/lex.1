/**
 * Lex Agent - Exports
 *
 * Ponto de entrada do módulo de agente.
 */

// Core
export { runAgentLoop, cancelAgentLoop, agentEmitter } from './loop';
export { think } from './think';
export {
    executeSkill,
    registerSkill,
    registerSkills,
    listSkills,
    getSkill,
    getSkillsForPrompt
} from './executor';

// Prompt-Layer
export {
    buildPromptLayerSystem,
    loadTenantConfig,
    getDefaultTenantConfig
} from './prompt-layer';

// Memory
export { Memory, getMemory } from './memory';

// Types
export * from './types';

// Skills (carrega automaticamente)
import { loadMockSkills } from '../skills/mock';

// Inicialização
let initialized = false;

export async function initializeAgent(): Promise<void> {
    if (initialized) return;

    console.log('[Agent] Inicializando...');

    // Carrega skills mock (para desenvolvimento/teste)
    loadMockSkills();

    // TODO: Carregar skills reais quando disponíveis
    // await loadSkillsFromDir('./skills/pje');
    // await loadSkillsFromDir('./skills/documentos');

    initialized = true;
    console.log('[Agent] Inicializado com sucesso');
}
