/**
 * Skills PJe - Exports & Registration
 *
 * Camadas ativas:
 *   - Utilitárias: token-check / pedir-codigo
 *   - Orquestração interna (chat-oculto / legado): pje_browser_use
 *
 * O caminho canônico de PJe em produção é Hermes → lex-desktop MCP →
 * bridge HTTP → backend RPC → electron/pje/*. As skills aqui só atendem
 * o agent loop TS, que hoje só seria invocado pelo chat oculto.
 */

import { pjeVerificarToken } from './token-check';
import { pedirCodigoTotp } from './pedir-codigo';
import { pjeBrowserUse } from './browser-use';
import { registerSkill } from '../../agent/executor';

export { pjeVerificarToken } from './token-check';
export { pedirCodigoTotp } from './pedir-codigo';
export { pjeBrowserUse } from './browser-use';

const ALWAYS_ON_PJE_UTILS = [
    pjeVerificarToken,
    pedirCodigoTotp,
] as const;

const INTERNAL_PJE_ORCHESTRATION_SKILLS = [
    pjeBrowserUse,
] as const;

export function registerPJeSkills(): void {
    for (const skill of ALWAYS_ON_PJE_UTILS) {
        registerSkill(skill);
    }
    for (const skill of INTERNAL_PJE_ORCHESTRATION_SKILLS) {
        registerSkill(skill);
    }

    console.log(
        '[Skills:PJe] Registrado: pje_browser_use (orquestracao interna) + utilitarios. ' +
        'Caminho canonico de PJe em producao: Hermes -> lex-desktop MCP -> bridge -> electron/pje/*.',
    );
}
