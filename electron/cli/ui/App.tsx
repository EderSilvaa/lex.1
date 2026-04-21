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

type AppStatus = 'idle' | 'thinking' | 'acting' | 'streaming' | 'waiting_user';

// ── App ───────────────────────────────────────────────────────────────────────

export interface AppProps {
    userDataDir: string;
    initialSessions: SessionPreview[];
    inElectron?: boolean;
}

function getInitialSessionId(): string {
    return process.env['LEX_CONVERSATION_ID']?.trim() || randomUUID();
}

const App: React.FC<AppProps> = ({ userDataDir, initialSessions, inElectron }) => {
    const { exit } = useApp();

    const [messages, setMessages]   = useState<MessageEntry[]>([]);
    const [status, setStatus]       = useState<AppStatus>('idle');
    const [spinLabel, setSpinLabel] = useState<string | string[]>(THINK_LABELS);
    const [sessionId, setSessionId] = useState<string>(getInitialSessionId);
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

    // Quando o agente manda opcoes junto com a pergunta, viram seletor por setas
    const [pendingOpts, setPendingOpts] = useState<string[] | null>(null);
    const [optIdx, setOptIdx]           = useState(0);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const addEntry = useCallback((entry: MessageEntry) => {
        setMessages(prev => [...prev, entry]);
    }, []);

    const genId = () => randomUUID().slice(0, 8);

    // ── Streaming token state ─────────────────────────────────────────────────

    // Live streaming text rendered below the static list
    const [streamText, setStreamText] = useState('');
    const streamFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Thinking-tags filter state (same logic as output.ts)
    const thinkingDepth = useRef(0);
    const tokenBuf      = useRef('');
    const THINKING_OPEN  = /^<(pensamento|thinking|raciocinio)>/i;
    const THINKING_CLOSE = /^<\/(pensamento|thinking|raciocinio)>/i;

    function clearStreamFlushTimer() {
        if (!streamFlushTimer.current) return;
        clearTimeout(streamFlushTimer.current);
        streamFlushTimer.current = null;
    }

    function scheduleStreamTextFlush() {
        if (streamFlushTimer.current) return;
        streamFlushTimer.current = setTimeout(() => {
            streamFlushTimer.current = null;
            setStreamText(streamBuf.current);
        }, 220);
    }

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
        scheduleStreamTextFlush();
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
                    clearStreamFlushTimer();
                    streaming.current = true;
                    streamBuf.current = '';
                    thinkingDepth.current = 0;
                    tokenBuf.current = '';
                    setStreamText('');
                    setStatus('streaming');
                    break;

                case 'token':
                    if (event.token) flushToken(event.token);
                    break;

                case 'waiting_user':
                    // flush stream first
                    if (streaming.current && streamBuf.current) {
                        clearStreamFlushTimer();
                        addEntry({ id: genId(), kind: 'stream_done', text: streamBuf.current });
                        streamBuf.current = '';
                        streaming.current = false;
                        setStreamText('');
                    }
                    addEntry({ id: genId(), kind: 'event', event });
                    if (event.opcoes && event.opcoes.length > 0) {
                        setPendingOpts(event.opcoes);
                        setOptIdx(0);
                    } else {
                        setPendingOpts(null);
                    }
                    setStatus('waiting_user');
                    break;

                case 'completed':
                    if (streaming.current && streamBuf.current) {
                        clearStreamFlushTimer();
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
                        clearStreamFlushTimer();
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

    // ── Preload histórico da conversa ao abrir ────────────────────────────────
    // Quando o CLI abre uma sessão antiga (LEX_CONVERSATION_ID), busca o histórico
    // e renderiza dentro do <Static> do Ink. Pintar direto no xterm quebra porque
    // Ink limpa a tela quando seu output ≥ rows (log-update + clearTerminal).

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const hist = await rpcCall('session-history', { sessionId, limit: 12 });
                if (cancelled || !Array.isArray(hist) || hist.length === 0) return;
                const entries: MessageEntry[] = [];
                for (const m of hist) {
                    const role = m?.role === 'user' ? 'user' : 'assistant';
                    const text = String(m?.content || '').trim();
                    if (!text) continue;
                    entries.push(role === 'user'
                        ? { id: genId(), kind: 'user', text }
                        : { id: genId(), kind: 'stream_done', text },
                    );
                }
                if (entries.length > 0) setMessages(prev => [...entries, ...prev]);
            } catch {
                // sem histórico — sem problema
            }
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Ctrl+C ────────────────────────────────────────────────────────────────

    useInput((_input, key) => {
        // Navegação no seletor de opções (somente quando input text está vazio,
        // pra não atrapalhar quem quer digitar resposta livre)
        if (waitingUser && pendingOpts && pendingOpts.length > 0 && input.length === 0) {
            if (key.upArrow) {
                setOptIdx(prev => (prev - 1 + pendingOpts.length) % pendingOpts.length);
                return;
            }
            if (key.downArrow) {
                setOptIdx(prev => (prev + 1) % pendingOpts.length);
                return;
            }
        }

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

        // Enter com input vazio em modo de seleção → usa a opção destacada
        let effective = line;
        if (!effective.trim() && waitingUser && pendingOpts && pendingOpts.length > 0) {
            effective = pendingOpts[optIdx] ?? '';
        }
        if (effective.trim() && waitingUser && pendingOpts && pendingOpts.length > 0) {
            const numeric = Number(effective.trim());
            if (Number.isInteger(numeric) && numeric >= 1 && numeric <= pendingOpts.length) {
                effective = pendingOpts[numeric - 1] ?? effective;
            }
        }
        if (!effective.trim()) return;

        // Respond to agent waiting_user
        if (waitingUser && currentRunId.current) {
            setPendingOpts(null);
            addEntry({ id: genId(), kind: 'user', text: effective });
            setStatus('thinking');
            try {
                await rpcCall('agent-respond', { runId: currentRunId.current, response: effective, sessionId, source: 'terminal' });
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
    }, [sessionId, userDataDir, waitingUser, pendingOpts, optIdx]);

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
                { objetivo, config: {}, sessionId, source: 'terminal' },
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

            {/* Live streaming text — capped por linhas VISUAIS (considerando
                wrap do terminal), não lógicas. Se a live region ultrapassa o
                que Ink consegue apagar com log-update, as frames antigas ficam
                no scrollback e, quando o stream completa e o texto final vai
                pro <Static>, fica tudo duplicado. Mantemos um teto pequeno e
                fixo (6 rows) — o usuário vê que está digitando, e o texto
                final vem preciso via Static. */}
            {streaming.current && streamText.length > 0 && (() => {
                const cols = Math.max(20, process.stdout.columns || 80);
                const MAX_VISUAL_ROWS = 3;
                const lines = streamText.split('\n');
                let visualRows = 0;
                const shown: string[] = [];
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i]!;
                    const lineRows = Math.max(1, Math.ceil(line.length / cols));
                    if (visualRows + lineRows > MAX_VISUAL_ROWS && shown.length > 0) break;
                    shown.unshift(line);
                    visualRows += lineRows;
                    if (visualRows >= MAX_VISUAL_ROWS) break;
                }
                const truncated = shown.length < lines.length;
                return (
                    <Box flexDirection="column">
                        {truncated && <Text dimColor>{'… (escrevendo)'}</Text>}
                        {shown.map((line, i) => (
                            <Text key={i} color="white">{line}</Text>
                        ))}
                    </Box>
                );
            })()}

            {/* Seletor de opções (↑/↓ + Enter) quando o agente está waiting_user */}
            {process.env['LEX_CLI_STATIC_OPTIONS'] !== '1' && waitingUser && pendingOpts && pendingOpts.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                    {pendingOpts.map((op, i) => (
                        <Text key={i} color={i === optIdx ? 'cyan' : undefined} dimColor={i !== optIdx}>
                            {i === optIdx ? '→ ' : '  '}{op}
                        </Text>
                    ))}
                    <Text dimColor>{'  (↑/↓ para escolher, Enter para confirmar, ou digite sua resposta)'}</Text>
                </Box>
            )}

            {/* Spinner */}
            {(status === 'thinking' || status === 'acting' || status === 'streaming') && (
                <Spinner labels={status === 'streaming' ? 'escrevendo…' : spinLabel} />
            )}

            {/* Input */}
            {canInput && (
                <Box marginTop={status === 'idle' ? 1 : 0}>
                    <Text color="cyan">{promptChar} </Text>
                    <TextInput
                        value={input}
                        onChange={setInput}
                        onSubmit={handleSubmit}
                    />
                </Box>
            )}
        </Box>
    );
};

export default App;
