/**
 * CLI Message Bus
 *
 * Canal de comunicação entre comandos slash (commands.ts) e o App Ink.
 * Permite que renderInfo / renderError emitam para a UI sem acoplamento direto.
 */

import { EventEmitter } from 'events';

export type BusMessage =
    | { kind: 'info';  text: string }
    | { kind: 'error'; text: string };

class MessageBus extends EventEmitter {}

export const messageBus = new MessageBus();

export function emitInfo(text: string): void {
    messageBus.emit('message', { kind: 'info', text } as BusMessage);
}

export function emitError(text: string): void {
    messageBus.emit('message', { kind: 'error', text } as BusMessage);
}
