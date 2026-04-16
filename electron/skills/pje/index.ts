/**
 * Skills PJe - Exports & Registration
 *
 * Roteamento automático:
 *   - Provider Anthropic + MCP com server "browser" → registra `pje_browser_use` (canônica)
 *   - Qualquer outro cenário → registra skills Playwright legadas (fallback)
 *
 * Skills utilitárias (token-check, pedir-codigo) são registradas sempre.
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

// Skills Playwright legadas (deprecated quando MCP browser-use está ativo)
const LEGACY_PJE_SKILLS = [
    pjeAbrir,
    pjeAgir,
    pjeConsultar,
    pjeMovimentacoes,
    pjeDocumentos,
    pjeNavegar,
    pjePreencher,
    pjeBulkColetar,
];

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

/**
 * Registra skills PJe com roteamento automático.
 */
export function registerPJeSkills(): void {
    // Skills utilitárias — sempre disponíveis (não dependem de browser)
    registerSkill(pjeVerificarToken);
    registerSkill(pedirCodigoTotp);

    if (hasMcpBrowser()) {
        // MCP browser-use disponível → skill canônica
        registerSkill(pjeBrowserUse);

        // Marca as legadas como deprecated (disponíveis via import, mas não registradas)
        for (const skill of LEGACY_PJE_SKILLS) {
            skill.deprecated = true;
        }

        console.log(
            '[Skills:PJe] Modo MCP browser-use ativo. ' +
            'Skill canônica: pje_browser_use | ' +
            `${LEGACY_PJE_SKILLS.length} skills legadas marcadas deprecated (não registradas).`,
        );
    } else {
        // Sem MCP browser → registra skills Playwright legadas
        for (const skill of LEGACY_PJE_SKILLS) {
            registerSkill(skill);
        }

        console.log(
            `[Skills:PJe] Modo Playwright ativo. ` +
            `${LEGACY_PJE_SKILLS.length} skills legadas + 2 utilitárias registradas.`,
        );
    }
}
