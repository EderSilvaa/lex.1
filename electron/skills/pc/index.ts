/**
 * Skills PC - Exports
 *
 * Skills de controle do PC via Vision AI + nut-js.
 */

import { pcAgir } from './agir';
import { registerSkill } from '../../agent/executor';

export { pcAgir } from './agir';

/**
 * Registra todas as skills de PC no Agent Loop
 */
export function registerPcSkills(): void {
    console.log('[Skills:PC] Registrando skills...');

    registerSkill(pcAgir);

    console.log('[Skills:PC] Skills registradas: pc_agir');
}
