/**
 * Skills OS - Exports
 *
 * Skills de acesso ao sistema operacional e sistema de arquivos.
 */

import { osListar } from './listar';
import { osArquivos } from './arquivos';
import { osEscrever } from './escrever';
import { osMover } from './mover';
import { osDeletar } from './deletar';
import { osBuscar } from './buscar';
import { osTamanho } from './tamanho';
import { osSistema } from './sistema';
import { osClipboard } from './clipboard';
import { osFetch } from './fetch';
import { osTerminal } from './terminal';
import { registerSkill } from '../../agent/executor';

export { osListar } from './listar';
export { osArquivos } from './arquivos';
export { osEscrever } from './escrever';
export { osMover } from './mover';
export { osDeletar } from './deletar';
export { osBuscar } from './buscar';
export { osTamanho } from './tamanho';
export { osSistema } from './sistema';
export { osClipboard } from './clipboard';
export { osFetch } from './fetch';
export { osTerminal } from './terminal';

/**
 * Registra todas as skills de OS no Agent Loop
 */
export function registerOsSkills(): void {
    console.log('[Skills:OS] Registrando skills...');

    registerSkill(osListar);
    registerSkill(osArquivos);
    registerSkill(osEscrever);
    registerSkill(osMover);
    registerSkill(osDeletar);
    registerSkill(osBuscar);
    registerSkill(osTamanho);
    registerSkill(osSistema);
    registerSkill(osClipboard);
    registerSkill(osFetch);
    registerSkill(osTerminal);

    console.log('[Skills:OS] Skills registradas: os_listar, os_arquivos, os_escrever, os_mover, os_deletar, os_buscar, os_tamanho, os_sistema, os_clipboard, os_fetch, terminal_executar');
}
