/**
 * Skills OS - Exports
 *
 * Skills de acesso ao sistema operacional e sistema de arquivos.
 */

import { osListar } from './listar';
import { osArquivos } from './arquivos';
import { osEscrever } from './escrever';
import { osSistema } from './sistema';
import { registerSkill } from '../../agent/executor';

export { osListar } from './listar';
export { osArquivos } from './arquivos';
export { osEscrever } from './escrever';
export { osSistema } from './sistema';

/**
 * Registra todas as skills de OS no Agent Loop
 */
export function registerOsSkills(): void {
    console.log('[Skills:OS] Registrando skills...');

    registerSkill(osListar);
    registerSkill(osArquivos);
    registerSkill(osEscrever);
    registerSkill(osSistema);

    console.log('[Skills:OS] Skills registradas: os_listar, os_arquivos, os_escrever, os_sistema');
}
