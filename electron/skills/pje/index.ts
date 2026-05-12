/**
 * Skills PJe - Exports & Registration
 *
 * Estrutura intencional:
 *   - Camada de orquestração local atual: `pje_browser_use`
 *   - Camada utilitária: token-check / pedir-codigo
 *   - Camada de compatibilidade: skills Playwright legadas
 *
 * Importante: as skills legadas existem apenas como fallback de compatibilidade.
 * O caminho padrão do produto é MCP/browser-use.
 */

import { pjeAbrir } from './abrir';
import { pjeAgir } from './agir';
import { pjeConsultar } from './consultar';
import { pjeMovimentacoes } from './movimentacoes';
import { pjeDocumentos } from './documentos';
import { pjeNavegar } from './navegar';
import { pjePreencher } from './preencher';
import { pjeVerificarToken } from './token-check';
import { pedirCodigoTotp } from './pedir-codigo';
import { pjeBulkColetar } from './bulk-coletar';
import { pjeBrowserUse } from './browser-use';
import { registerSkill } from '../../agent/executor';
import { getMcpManager } from '../../mcp-manager';

export { pjeAbrir } from './abrir';
export { pjeAgir } from './agir';
export { pjeConsultar } from './consultar';
export { pjeMovimentacoes } from './movimentacoes';
export { pjeDocumentos } from './documentos';
export { pjeNavegar } from './navegar';
export { pjePreencher } from './preencher';
export { pjeVerificarToken } from './token-check';
export { pedirCodigoTotp } from './pedir-codigo';
export { pjeBulkColetar } from './bulk-coletar';
export { pjeBrowserUse } from './browser-use';

const ALWAYS_ON_PJE_UTILS = [
    pjeVerificarToken,
    pedirCodigoTotp,
] as const;

const INTERNAL_PJE_ORCHESTRATION_SKILLS = [
    pjeBrowserUse,
] as const;

// Fallback de compatibilidade. Não expandir esta trilha no MVP.
const LEGACY_PJE_FALLBACK_SKILLS = [
    pjeAbrir,
    pjeAgir,
    pjeConsultar,
    pjeMovimentacoes,
    pjeDocumentos,
    pjeNavegar,
    pjePreencher,
    pjeBulkColetar,
] as const;

function markLegacyPjeFallbackAsDeprecated(): void {
    for (const skill of LEGACY_PJE_FALLBACK_SKILLS) {
        skill.deprecated = true;
    }
}

/**
 * Detecta se MCP browser-use está disponível:
 *   - Provider Anthropic
 *   - Pelo menos um server com "browser" no nome em ~/.lex/mcp.json
 */
function hasMcpBrowser(): boolean {
    try {
        const mcpMgr = getMcpManager();
        const mcpConfig = mcpMgr.loadConfig();
        const servers = mcpConfig.mcpServers;
        if (!servers) return false;

        return Object.keys(servers).some((id) => /browser/i.test(id));
    } catch {
        return false;
    }
}

function registerAlwaysOnPJeUtils(): void {
    for (const skill of ALWAYS_ON_PJE_UTILS) {
        registerSkill(skill);
    }
}

function registerInternalPJeOrchestrationSkills(): void {
    for (const skill of INTERNAL_PJE_ORCHESTRATION_SKILLS) {
        registerSkill(skill);
    }
}

function registerLegacyPJeFallbackSkills(): void {
    for (const skill of LEGACY_PJE_FALLBACK_SKILLS) {
        skill.deprecated = false;
        registerSkill(skill);
    }
}

/**
 * Registra skills PJe com roteamento automático.
 */
export function registerPJeSkills(): void {
    registerAlwaysOnPJeUtils();
    markLegacyPjeFallbackAsDeprecated();

    if (hasMcpBrowser()) {
        registerInternalPJeOrchestrationSkills();

        console.log(
            '[Skills:PJe] Modo MCP browser-use ativo. ' +
            'Skill interna de orquestracao/replay: pje_browser_use | ' +
            `${LEGACY_PJE_FALLBACK_SKILLS.length} skills legadas isoladas como fallback de compatibilidade (não registradas).`,
        );
    } else {
        registerLegacyPJeFallbackSkills();

        console.log(
            '[Skills:PJe] ATENCAO: modo de compatibilidade legado ativo. ' +
            `Fallback Playwright registrado com ${LEGACY_PJE_FALLBACK_SKILLS.length} skills legadas; ` +
            'o caminho canonico continua sendo MCP/browser-use.',
        );
    }
}
