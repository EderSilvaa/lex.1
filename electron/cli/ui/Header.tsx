import React from 'react';
import { Box, Text } from 'ink';
import * as fs from 'fs';
import * as path from 'path';

export interface SessionPreview {
    id: string;
    messageCount: number;
    updatedAt: number;
    preview: string;
}

interface HeaderProps {
    userDataDir: string;
    sessions: SessionPreview[];
}

function formatAge(ts: number): string {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60)    return 'agora';
    if (secs < 3600)  return `${Math.floor(secs / 60)}min`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
    return `${Math.floor(secs / 86400)}d`;
}

function trunc(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

const LOGO = [
    '    █  █',
    '   ██  ██',
    '  ███  ███',
    ' ████  ████',
];

const Header: React.FC<HeaderProps> = ({ userDataDir, sessions }) => {
    let providerId = '';
    let modelName  = '';
    let version    = '';
    const userName = process.env['USERNAME'] || process.env['USER'] || 'advogado';

    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(userDataDir, 'cli-config.json'), 'utf8'));
        providerId = cfg?.providerId ?? '';
        const m = cfg?.agentModel ?? '';
        modelName = m ? m.split('/').pop() ?? m : '';
    } catch { /* ok */ }

    try { version = require('../../../package.json').version ?? ''; } catch { /* ok */ }

    const providerStr = trunc(
        `${providerId}${modelName ? ` · ${modelName}` : ''}`,
        28,
    );

    return (
        <Box flexDirection="column" marginBottom={1}>
            {/* ── Top border with title ─────────────────────────────────── */}
            <Text>
                <Text color="gray">╭───</Text>
                <Text bold color="cyan"> LEX </Text>
                <Text color="gray">v{version} </Text>
                <Text color="cyan">{'─'.repeat(36)}</Text>
                <Text color="gray">╮</Text>
            </Text>

            {/* ── Content rows ──────────────────────────────────────────── */}
            <Box flexDirection="row">
                {/* Left panel */}
                <Box flexDirection="column" width={28} paddingLeft={2}>
                    <Text> </Text>
                    <Text bold>Olá, {userName}!</Text>
                    <Text> </Text>
                    {LOGO.map((line, i) => (
                        <Text key={i} color="cyan">{line}</Text>
                    ))}
                    <Text> </Text>
                    <Text dimColor>{providerStr || '(sem provider)'}</Text>
                    <Text> </Text>
                </Box>

                {/* Divider */}
                <Box flexDirection="column">
                    {Array.from({ length: 9 }).map((_, i) => (
                        <Text key={i} color="gray">│</Text>
                    ))}
                </Box>

                {/* Right panel */}
                <Box flexDirection="column" paddingLeft={2} flexGrow={1}>
                    <Text> </Text>
                    <Text bold color="cyan">Como começar</Text>
                    <Text dimColor>/model {'<id>'}   trocar modelo</Text>
                    <Text dimColor>/provider {'<id>'} trocar provider</Text>
                    <Text dimColor>/key {'<key>'}    salvar chave</Text>
                    <Text dimColor>/nova         nova sessão</Text>
                    <Text dimColor>/help         todos comandos</Text>
                    <Text> </Text>
                    <Text bold color="cyan">Sessões recentes</Text>
                    {sessions.length === 0
                        ? <Text dimColor>Nenhuma sessão ainda</Text>
                        : sessions.slice(0, 3).map(s => (
                            <Text key={s.id} dimColor>
                                {s.id.slice(0, 8)}  {formatAge(s.updatedAt).padEnd(4)}  {s.preview ? `"${trunc(s.preview, 28)}"` : ''}
                            </Text>
                        ))
                    }
                </Box>
            </Box>

            {/* ── Bottom border ─────────────────────────────────────────── */}
            <Text>
                <Text color="gray">╰{'─'.repeat(50)}╯</Text>
            </Text>
        </Box>
    );
};

export default Header;
