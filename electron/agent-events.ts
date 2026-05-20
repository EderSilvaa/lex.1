/**
 * Event bus compartilhado por skills ativas (browser, pc, pje) para
 * sinalizar progresso/intermediarios.
 *
 * Antes vivia em `electron/agent/loop.ts`. Foi extraido daqui porque o
 * loop legado foi removido, mas o emitter continua util para o caminho
 * ativo (skills chamadas via lex-desktop bridge).
 */

import { EventEmitter } from 'events';

export const agentEmitter = new EventEmitter();
