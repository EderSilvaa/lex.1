/**
 * Skills PJe - Exports
 *
 * Skills reais para automação do PJe.
 */

import { pjeConsultar } from './consultar';
import { registerSkill } from '../../agent/executor';

// Export individual skills
export { pjeConsultar } from './consultar';

/**
 * Registra todas as skills do PJe no Agent Loop
 */
export function registerPJeSkills(): void {
    console.log('[Skills:PJe] Registrando skills...');

    registerSkill(pjeConsultar);

    console.log('[Skills:PJe] Skills registradas');
}
