/**
 * EventItem — renderiza um único evento do agente ou mensagem da UI
 *
 * Equivalente React do switch-case em output.ts,
 * mas declarativo e composto por componentes Ink.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { AgentEvent } from '../../agent/types';
import type { BusMessage } from '../message-bus';

// ── Helpers ──────────────────────────────────────────────────────────────────

function cleanLLMOutput(text: string): string {
    if (!text) return '';
    const m = text.match(/<resposta>([\s\S]*?)<\/resposta>/i);
    let clean = m ? (m[1] ?? '') : text;
    clean = clean
        .replace(/<pensamento>[\s\S]*?<\/pensamento>/gi, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<raciocinio>[\s\S]*?<\/raciocinio>/gi, '')
        .replace(/<\/?[a-z_]+>/gi, '');
    clean = clean
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*]\s+/gm, '  • ');
    return clean.trim();
}

function formatParams(params: Record<string, unknown> | undefined): string {
    if (!params || !Object.keys(params).length) return '';
    return Object.entries(params).slice(0, 2).map(([k, v]) => {
        const val = typeof v === 'string'
            ? (v.length > 50 ? v.slice(0, 50) + '…' : v)
            : JSON.stringify(v).slice(0, 50);
        return `${k}: "${val}"`;
    }).join(', ');
}

function formatResult(result: any): string {
    if (!result) return '';
    const data = result.dados ?? result.mensagem ?? result.erro ?? '';
    if (!data) return '';
    const str  = typeof data === 'string' ? data : JSON.stringify(data);
    const line = str.split('\n').find((l: string) => l.trim()) ?? '';
    return line.length > 100 ? line.slice(0, 100) + '…' : line;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageEntry =
    | { id: string; kind: 'bus'; msg: BusMessage }
    | { id: string; kind: 'event'; event: AgentEvent }
    | { id: string; kind: 'user'; text: string }
    | { id: string; kind: 'stream_done'; text: string };

// ── Component ─────────────────────────────────────────────────────────────────

const SEPARATOR = '─'.repeat(50);

const EventItem: React.FC<{ entry: MessageEntry }> = ({ entry }) => {
    if (entry.kind === 'user') {
        return (
            <Box marginTop={1}>
                <Text color="white" backgroundColor="gray" bold>
                    {`  › ${entry.text}  `}
                </Text>
            </Box>
        );
    }

    if (entry.kind === 'bus') {
        const { msg } = entry;
        if (msg.kind === 'error') {
            return <Text color="red">{`✗ ${msg.text}`}</Text>;
        }
        return <Text dimColor>{msg.text}</Text>;
    }

    if (entry.kind === 'stream_done') {
        const lines = cleanLLMOutput(entry.text).split('\n').filter(l => l.trim());
        return (
            <Box flexDirection="column" marginTop={1}>
                {lines.map((line, i) => (
                    <Text key={i} color="white">{i === 0 ? `• ${line}` : `  ${line}`}</Text>
                ))}
                <Text> </Text>
                <Text dimColor>{SEPARATOR}</Text>
            </Box>
        );
    }

    // ── Agent events ──────────────────────────────────────────────────────────
    const { event } = entry;

    switch (event.type) {
        case 'acting': {
            const paramStr = formatParams(event.parametros);
            return (
                <Text>
                    <Text color="cyan">● </Text>
                    <Text dimColor>{event.skill}</Text>
                    {paramStr.length > 0 ? <Text color="gray">{`(${paramStr})`}</Text> : <Text>{''}</Text>}
                </Text>
            );
        }

        case 'tool_result': {
            const ok  = event.resultado?.sucesso !== false;
            const msg = formatResult(event.resultado);
            if (!ok) {
                return (
                    <Text>
                        <Text dimColor>  ⎿  </Text>
                        <Text color="red">{event.resultado?.erro || 'falhou'}</Text>
                    </Text>
                );
            }
            return msg
                ? <Text dimColor>{`  ⎿  ${msg}`}</Text>
                : null as any;
        }

        case 'completed': {
            // streaming_done é tratado via stream_done entry; completed sem stream
            if (!event.resposta) return <Text>{''}</Text>;
            const lines = cleanLLMOutput(event.resposta).split('\n').filter(l => l.trim());
            return (
                <Box flexDirection="column" marginTop={1}>
                    {lines.map((line, i) => (
                        <Text key={i} color="white">{i === 0 ? `• ${line}` : `  ${line}`}</Text>
                    ))}
                    <Text> </Text>
                    <Text dimColor>{SEPARATOR}</Text>
                </Box>
            );
        }

        case 'error': {
            const msg = (event.erro || 'erro desconhecido').replace(/\n[\s\S]*/m, '').slice(0, 200);
            return (
                <Box flexDirection="column" marginTop={1}>
                    <Text color="red">{`✗ ${msg}`}</Text>
                    <Text> </Text>
                    <Text dimColor>{SEPARATOR}</Text>
                </Box>
            );
        }

        case 'cancelled':
            return (
                <Box flexDirection="column" marginTop={1}>
                    <Text color="yellow">⊘ cancelado</Text>
                    <Text> </Text>
                    <Text dimColor>{SEPARATOR}</Text>
                </Box>
            );

        case 'timeout':
            return (
                <Box flexDirection="column" marginTop={1}>
                    <Text color="yellow">⊘ timeout</Text>
                    <Text> </Text>
                    <Text dimColor>{SEPARATOR}</Text>
                </Box>
            );

        case 'waiting_user':
            // Opções (se houver) são renderizadas como seletor interativo no App.tsx,
            // não duplicamos aqui pra evitar duas listas na tela.
            return (
                <Box flexDirection="column" marginTop={1}>
                    <Text>
                        <Text color="yellow">? </Text>
                        <Text bold>{event.pergunta}</Text>
                    </Text>
                    {event.type === 'waiting_user' && event.opcoes?.map((op, i) => (
                        <Text key={i} dimColor>{`  ${i + 1}. ${op}`}</Text>
                    ))}
                    {event.type === 'waiting_user' && event.opcoes?.length ? (
                        <Text dimColor>{'  (digite o numero, a opcao, ou sua resposta)'}</Text>
                    ) : null}
                </Box>
            );

        // ── Orchestrator multi-agent ───────────────────────────────────────────
        case 'orchestrator': {
            const evt = (event as any).data;
            if (!evt) return <Text>{''}</Text>;

            switch (evt.type) {
                case 'plan_created': {
                    const tasks: any[] = evt.plan?.subtasks ?? [];
                    return (
                        <Box flexDirection="column">
                            <Text color="cyan">{`◈ Plano: ${tasks.length} subtasks`}</Text>
                            {tasks.map((t: any, i: number) => (
                                <Text key={i} dimColor>{`  ◦ [${t.agentType}] ${t.description.slice(0, 80)}`}</Text>
                            ))}
                        </Box>
                    );
                }
                case 'checkpoint_resumed':
                    return <Text color="yellow">{`⟳ Retomando checkpoint (batch ${evt.fromBatch})…`}</Text>;
                case 'subtask_started':
                    return (
                        <Text>
                            <Text color="cyan">● </Text>
                            <Text dimColor>{evt.agentType}</Text>
                            <Text dimColor>{` subtask ${evt.subtaskId}`}</Text>
                        </Text>
                    );
                case 'subtask_completed': {
                    const cleaned = cleanLLMOutput(typeof evt.result === 'string' ? evt.result : '');
                    const preview = cleaned.split('\n').find((l: string) => l.trim()) ?? '';
                    return (
                        <Text>
                            <Text dimColor>  ⎿  </Text>
                            <Text color="green">✓</Text>
                            {preview.length > 0 ? <Text dimColor>{`  ${preview.slice(0, 80)}`}</Text> : <Text>{''}</Text>}
                        </Text>
                    );
                }
                case 'subtask_failed':
                    return <Text><Text dimColor>  ⎿  </Text><Text color="red">{`✗ ${evt.subtaskId}: ${String(evt.error).slice(0, 80)}`}</Text></Text>;
                case 'subtask_retrying':
                    return <Text color="yellow">{`  ↻ retry ${evt.attempt}/${evt.maxRetries} (${evt.subtaskId})`}</Text>;
                case 'plan_completed': {
                    const clean = cleanLLMOutput(evt.finalAnswer || '');
                    const lines = clean.split('\n').filter((l: string) => l.trim());
                    return (
                        <Box flexDirection="column" marginTop={1}>
                            {lines.map((line: string, i: number) => (
                                <Text key={i} color="white">{i === 0 ? `• ${line}` : `  ${line}`}</Text>
                            ))}
                            <Text> </Text>
                            <Text dimColor>{SEPARATOR}</Text>
                        </Box>
                    );
                }
                case 'plan_failed':
                    return (
                        <Box flexDirection="column" marginTop={1}>
                            <Text color="red">{`✗ plano falhou: ${String(evt.error).slice(0, 150)}`}</Text>
                            <Text> </Text>
                            <Text dimColor>{SEPARATOR}</Text>
                        </Box>
                    );
                default:
                    return <Text>{''}</Text>;
            }
        }

        default:
            return <Text>{''}</Text>;
    }
};

export default EventItem;
