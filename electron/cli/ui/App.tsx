/**
 * CLI App — componente Ink principal
 *
 * Substitui o loop readline de repl.ts por uma UI declarativa React/Ink.
 * Mantém toda a lógica de sessão, eventos e comandos.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useApp, useInput, Static } from 'ink';
import TextInput from 'ink-text-input';
import { randomUUID } from 'crypto';

import { backendEvents, rpcCall, stopBackend } from '../../backend-client';
import type { AgentEvent } from '../../agent/types';
import { messageBus } from '../message-bus';
import type { BusMessage } from '../message-bus';
import { tryRunCommand } from '../commands';
import { checkProviderReady } from '../config';
import {
    initCryptoStoreSalt,
    encryptApiKey,
} from '../../crypto-store';
import {
    setActiveConfig,
    getActiveConfig,
    PROVIDER_PRESETS,
    type ProviderId,
} from '../../provider-config';
import { syncConfigToBackend } from '../../backend-client';
import * as fs from 'fs';
import * as path from 'path';

// ── Detecção automática de API key ────────────────────────────────────────────

const KEY_PATTERNS: Array<{ pattern: RegExp; providerId: ProviderId }> = [
    { pattern: /^sk-ant-[a-zA-Z0-9_-]{20,}$/, providerId: 'anthropic'  },
    { pattern: /^sk-or-[a-zA-Z0-9_-]{20,}$/,  providerId: 'openrouter' },
    { pattern: /^sk-[a-zA-Z0-9_-]{20,}$/,      providerId: 'openai'     },
    { pattern: /^AIza[a-zA-Z0-9_-]{30,}$/,     providerId: 'google'     },
    { pattern: /^gsk_[a-zA-Z0-9_-]{20,}$/,     providerId: 'groq'       },
];

function detectApiKey(input: string): { providerId: ProviderId; apiKey: string } | null {
    const trimmed = input.trim();
    for (const { pattern, providerId } of KEY_PATTERNS) {
        if (pattern.test(trimmed)) return { providerId, apiKey: trimmed };
    }
    return null;
}

import Header, { type SessionPreview } from './Header';
import Spinner from './Spinner';
import EventItem, { type MessageEntry } from './EventItem';

// ── Labels humorísticas ───────────────────────────────────────────────────────

const THINK_LABELS = [
    'um segundo…',
    'deixa eu ver…',
    'boa pergunta…',
    'hmm…',
    'processando…',
    'inventando jurisprudência…',
    'citando fonte que não existe…',
    'culpando o estagiário…',
    'consultando o achômetro…',
    'fabricando precedente…',
    'vendo se tem jeito…',
    'improvisando com confiança…',
    'fingindo que leu tudo…',
    'adiando o inevitável…',
    'fazendo parecer mais difícil…',
    'perguntando pro Lenza…',
    'esperando o Tartuce responder…',
    'checando no Vade Mecum…',
    'ligando pro Didier…',
    'aguardando o STF mudar de ideia…',
    'vendo se tem súmula pra isso…',
    'rezando pro TJ aceitar…',
];

// ── Types ─────────────────────────────────────────────────────────────────────

type AppStatus = 'idle' | 'thinking' | 'acting' | 'waiting_user';

// ── App ───────────────────────────────────────────────────────────────────────

export interface AppProps {
    userDataDir: string;
    initialSessions: SessionPreview[];
    inElectron?: boolean;
}

const App: React.FC<AppProps> = ({ userDataDir, initialSessions, inElectron }) => {
    const { exit } = useApp();

    const [messages, setMessages]   = useState<MessageEntry[]>([]);
    const [status, setStatus]       = useState<AppStatus>('idle');
    const [spinLabel, setSpinLabel] = useState<string | string[]>(THINK_LABELS);
    const [sessionId, setSessionId] = useState<string>(randomUUID());
    const [input, setInput]         = useState('');

    // streaming tokens accumulated here; flushed to messages on completed/error
    const streamBuf = useRef('');
    const streaming = useRef(false);

    // current runId for cancellation
    const currentRunId = useRef('');
    const ctrlCCount   = useRef(0);
    const running      = useRef(false);

    // waiting_user mode
    const waitingUser = status === 'waiting_user';

    // ── Helpers ───────────────────────────────────────────────────────────────

    const addEntry = useCallback((entry: MessageEntry) => {
        setMessages(prev => [...prev, entry]);
    }, []);

    const genId = () => randomUUID().slice(0, 8);

    // ── Streaming token state ─────────────────────────────────────────────────

    // Live streaming text rendered below the static list
    const [streamText, setStreamText] = useState('');

    // Thinking-tags filter state (same logic as output.ts)
    const thinkingDepth = useRef(0);
    const tokenBuf      = useRef('');
    const THINKING_OPEN  = /^<(pensamento|thinking|raciocinio)>/i;
    const THINKING_CLOSE = /^<\/(pensamento|thinking|raciocinio)>/i;

    function flushToken(token: string) {
        tokenBuf.current += token;

        while (tokenBuf.current.length > 0) {
            const buf = tokenBuf.current;
            const openM  = buf.match(THINKING_OPEN);
            const closeM = buf.match(THINKING_CLOSE);

            if (openM) { thinkingDepth.current++; tokenBuf.current = buf.slice(openM[0].length); continue; }
            if (closeM && thinkingDepth.current > 0) { thinkingDepth.current--; tokenBuf.current = buf.slice(closeM[0].length); continue; }
            if (thinkingDepth.current > 0) { tokenBuf.current = ''; break; }
            if (buf.startsWith('<')) {
                const close = buf.indexOf('>');
                if (close === -1 && buf.length < 30) break;
            }
            const ch = buf[0]!;
            tokenBuf.current = buf.slice(1);
            if (!ch.trim() && streamBuf.current === '') continue;
            streamBuf.current += ch;
        }
        setStreamText(streamBuf.current);
    }

    // ── Agent events ──────────────────────────────────────────────────────────

    useEffect(() => {
        const onEvent = (event: AgentEvent) => {
            switch (event.type) {
                case 'started':
                    currentRunId.current = event.runId;
                    break;

                case 'thinking':
                    setStatus('thinking');
                    setSpinLabel(THINK_LABELS);
                    break;

                case 'acting':
                    setStatus('acting');
                    setSpinLabel(event.skill);
                    addEntry({ id: genId(), kind: 'event', event });
                    break;

                case 'tool_result':
                    setStatus('thinking');
                    setSpinLabel(THINK_LABELS);
                    addEntry({ id: genId(), kind: 'event', event });
                    break;

                case 'streaming_start':
                    streaming.current = true;
                    streamBuf.current = '';
                    thinkingDepth.current = 0;
                    tokenBuf.current = '';
                    setStreamText('');
                    setStatus('thinking');
                    break;

                case 'token':
                    if (event.token) flushToken(event.token);
                    break;

                case 'waiting_user':
                    // flush stream first
                    if (streaming.current && streamBuf.current) {
                        addEntry({ id: genId(), kind: 'stream_done', text: streamBuf.current });
                        streamBuf.current = '';
                        streaming.current = false;
                        setStreamText('');
                    }
                    addEntry({ id: genId(), kind: 'event', event });
                    setStatus('waiting_user');
                    break;

                case 'completed':
                    if (streaming.current && streamBuf.current) {
                        addEntry({ id: genId(), kind: 'stream_done', text: streamBuf.current });
                    } else if (!streaming.current && event.resposta) {
                        addEntry({ id: genId(), kind: 'event', event });
                    }
                    streaming.current = false;
                    streamBuf.current = '';
                    tokenBuf.current  = '';
                    setStreamText('');
                    currentRunId.current = '';
                    setStatus('idle');
                    break;

                case 'error':
                case 'cancelled':
                case 'timeout':
                    if (streaming.current) {
                        streamBuf.current = '';
                        streaming.current = false;
                        setStreamText('');
                    }
                    addEntry({ id: genId(), kind: 'event', event });
                    currentRunId.current = '';
                    setStatus('idle');
                    break;

                case 'orchestrator':
                    addEntry({ id: genId(), kind: 'event', event });
                    break;

                default:
                    break;
            }
        };

        backendEvents.on('agent-event', onEvent);
        return () => { backendEvents.off('agent-event', onEvent); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Message bus (renderInfo / renderError from commands) ──────────────────

    useEffect(() => {
        const onMsg = (msg: BusMessage) => {
            addEntry({ id: genId(), kind: 'bus', msg });
        };
        messageBus.on('message', onMsg);
        return () => { messageBus.off('message', onMsg); };
    }, [addEntry]);

    // ── Ctrl+C ────────────────────────────────────────────────────────────────

    useInput((_input, key) => {
        if (!key.ctrl || _input !== 'c') return;

        if (running.current) {
            ctrlCCount.current++;
            if (ctrlCCount.current === 1) {
                addEntry({ id: genId(), kind: 'bus', msg: { kind: 'info', text: 'cancelando… (ctrl+c novamente para forçar saída)' } });
                rpcCall('agent-cancel', currentRunId.current ? { runId: currentRunId.current } : {}).catch(() => {});
            } else {
                cleanup().then(() => process.exit(130));
            }
        } else {
            cleanup().then(() => exit());
        }
    });

    // ── Cleanup ───────────────────────────────────────────────────────────────

    async function cleanup() {
        try { await stopBackend(); } catch { /* ignore */ }
    }

    // ── Submit handler ────────────────────────────────────────────────────────

    const handleSubmit = useCallback(async (line: string) => {
        setInput('');
        if (!line.trim()) return;

        // Respond to agent waiting_user
        if (waitingUser && currentRunId.current) {
            setStatus('thinking');
            try {
                await rpcCall('agent-respond', { runId: currentRunId.current, response: line });
            } catch (err: any) {
                addEntry({ id: genId(), kind: 'bus', msg: { kind: 'error', text: err?.message || String(err) } });
                setStatus('idle');
            }
            return;
        }

        ctrlCCount.current = 0;

        // ── Detecção automática de API key ────────────────────────────────────
        const detected = detectApiKey(line);
        if (detected) {
            const { providerId, apiKey } = detected;
            try {
                initCryptoStoreSalt(userDataDir);
                const cfgPath = path.join(userDataDir, 'cli-config.json');
                const saved = (() => { try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return {}; } })();
                saved.keys = saved.keys ?? {};
                saved.keys[providerId] = encryptApiKey(apiKey);
                saved.providerId = providerId;
                const preset = PROVIDER_PRESETS[providerId]!;
                saved.agentModel  = saved.agentModel  ?? preset.defaultAgentModel;
                saved.visionModel = saved.visionModel ?? preset.defaultVisionModel;
                fs.writeFileSync(cfgPath, JSON.stringify(saved, null, 2), 'utf8');
                const updated = { ...getActiveConfig(), providerId, apiKey, agentModel: saved.agentModel, visionModel: saved.visionModel };
                setActiveConfig(updated);
                await syncConfigToBackend(updated);
                addEntry({ id: genId(), kind: 'bus', msg: { kind: 'info', text: `✓ chave ${providerId} salva — pode enviar seu objetivo agora` } });
            } catch (err: any) {
                addEntry({ id: genId(), kind: 'bus', msg: { kind: 'error', text: `erro ao salvar chave: ${err?.message}` } });
            }
            return;
        }

        // Echo user input
        addEntry({ id: genId(), kind: 'user', text: line });

        // Try slash command
        const action = await tryRunCommand(line, { sessionId, userDataDir });
        if (action) {
            if (action.type === 'exit') {
                await cleanup();
                exit();
                return;
            }
            if (action.type === 'new-session') {
                setSessionId(randomUUID());
                return;
            }
            if (action.type === 'load-session') {
                setSessionId(action.sessionId as string);
                return;
            }
            if (action.type === 'clear') {
                setMessages([]);
                return;
            }
            if (action.type === 'run-goal') {
                await runGoal(action.objetivo as string);
                return;
            }
            // noop — command already emitted info/error to bus
            return;
        }

        // Regular agent run
        await runGoal(line);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, userDataDir, waitingUser]);

    async function runGoal(objetivo: string) {
        const notReady = checkProviderReady();
        if (notReady) {
            for (const line of notReady.split('\n')) {
                addEntry({ id: genId(), kind: 'bus', msg: { kind: 'info', text: line } });
            }
            return;
        }

        running.current = true;
        setStatus('thinking');
        try {
            await rpcCall(
                'agent-run',
                { objetivo, config: {}, sessionId },
                { timeoutMs: 12 * 60 * 1000 + 60_000 },
            );
        } catch (err: any) {
            addEntry({ id: genId(), kind: 'bus', msg: { kind: 'error', text: err?.message || String(err) } });
        } finally {
            running.current = false;
            ctrlCCount.current = 0;
            setStatus('idle');
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const canInput = status === 'idle' || status === 'waiting_user';
    const promptChar = waitingUser ? '→' : '>';

    return (
        <Box flexDirection="column">
            {/* Static: header (opcional) + past messages (rendered once, scroll up) */}
            <Static items={[
                ...(inElectron ? [] : [{ id: '__header__', kind: 'header' as const }]),
                ...messages,
            ]}>
                {(item: any) => {
                    if (item.kind === 'header') {
                        return (
                            <Header
                                key="header"
                                userDataDir={userDataDir}
                                sessions={initialSessions}
                            />
                        );
                    }
                    return <EventItem key={item.id} entry={item as MessageEntry} />;
                }}
            </Static>

            {/* Live streaming text */}
            {streaming.current && streamText.length > 0 && (
                <Text color="white">{'• '}{streamText}</Text>
            )}

            {/* Spinner */}
            {(status === 'thinking' || status === 'acting') && (
                <Spinner labels={spinLabel} />
            )}

            {/* Input */}
            <Box marginTop={status === 'idle' ? 1 : 0}>
                <Text color="cyan">{promptChar} </Text>
                {canInput
                    ? (
                        <TextInput
                            value={input}
                            onChange={setInput}
                            onSubmit={handleSubmit}
                        />
                    )
                    : <Text dimColor> </Text>
                }
            </Box>
        </Box>
    );
};

export default App;
