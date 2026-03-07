/**
 * Skills PJe - Exports
 *
 * Skills reais para automação do PJe.
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
import { registerSkill } from '../../agent/executor';

export { pjeAbrir } from './abrir';
export { pjeAgir } from './agir';
export { pjeConsultar } from './consultar';
export { pjeMovimentacoes } from './movimentacoes';
export { pjeDocumentos } from './documentos';
export { pjeNavegar } from './navegar';
export { pjePreencher } from './preencher';
export { pjeVerificarToken } from './token-check';
export { pedirCodigoTotp } from './pedir-codigo';

/**
 * Registra todas as skills do PJe no Agent Loop
 */
export function registerPJeSkills(): void {
    console.log('[Skills:PJe] Registrando skills...');

    registerSkill(pjeAbrir);
    registerSkill(pjeAgir);
    registerSkill(pjeConsultar);
    registerSkill(pjeMovimentacoes);
    registerSkill(pjeDocumentos);
    registerSkill(pjeNavegar);
    registerSkill(pjePreencher);
    registerSkill(pjeVerificarToken);
    registerSkill(pedirCodigoTotp);

    console.log('[Skills:PJe] Skills registradas: pje_abrir, pje_agir, pje_consultar, pje_movimentacoes, pje_documentos, pje_navegar, pje_preencher, pje_verificar_token, pedir_codigo_totp');
}
