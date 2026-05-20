#!/usr/bin/env node
/**
 * LEX MCP example config setup.
 *
 * Escreve um `~/.lex/mcp.example.json` com o MCP filesystem como referência.
 * Executado como postinstall. Soft — nunca trava a instalação.
 *
 * Nota: o browser-use (lib externa de automação de browser) foi abandonado
 * quando o caminho canônico de PJe migrou para Playwright + bridge determinística
 * (electron/pje/*). Este script não instala mais browser-use/uv.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function log(msg) { console.log(`[LEX Setup] ${msg}`); }

function ensureExampleConfig() {
    const dir = path.join(os.homedir(), '.lex');
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    const examplePath = path.join(dir, 'mcp.example.json');
    const example = {
        mcpServers: {
            filesystem: {
                command: 'npx',
                args: [
                    '-y', '@modelcontextprotocol/server-filesystem',
                    path.join(os.homedir(), 'Documents'),
                    path.join(os.homedir(), 'Downloads'),
                    path.join(os.homedir(), 'Desktop'),
                    os.homedir(),
                ],
            },
        },
    };
    try {
        fs.writeFileSync(examplePath, JSON.stringify(example, null, 2), 'utf8');
        log(`mcp.example.json atualizado: ${examplePath}`);
    } catch { /* soft */ }
}

ensureExampleConfig();
