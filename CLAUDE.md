# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Desenvolvimento (watch TS + inicia Electron)
npm run electron:dev

# Só iniciar o app (sem watch)
npm run electron:start

# Compilar TypeScript
npm run build          # renderer (tsconfig.json)
tsc -p tsconfig.electron.json   # processo principal

# Type-check sem emitir
npm run type-check
```

> **CRÍTICO:** VSCode seta `ELECTRON_RUN_AS_NODE=1`. O script `scripts/launch-electron.js` deleta essa variável antes de spawnar o Electron. **Nunca chamar `electron` diretamente** — sempre via `npm run electron:start`.

## Arquitetura

### Processos Electron
- **Main:** `electron/main.ts` — janela, IPC handlers, inicialização de serviços
- **Renderer:** `src/renderer/index.html` + `src/renderer/js/app.js` (JS puro, sem framework)
- **Preload:** `electron/preload.ts` — expõe API segura ao renderer via `contextBridge`

### Agent Loop (`electron/agent/`)
Padrão: **Objetivo → LOOP(Think → Act → Observe) → Resposta**

| Arquivo | Papel |
|---|---|
| `loop.ts` | Orquestrador principal; emite eventos para a UI via `agentEmitter` |
| `think.ts` | Chama o LLM para decidir a próxima skill a executar |
| `critic.ts` | Avalia se a resposta final está boa o suficiente |
| `executor.ts` | Despacha para a skill correta e retorna `SkillResult` |
| `session.ts` | Persistência de sessões/histórico de conversa |
| `memory.ts` | Memória TF-IDF para contexto de processos jurídicos |

### Browser Automation (`electron/stagehand-manager.ts`)
Controla Chrome externo via Stagehand v3 (Playwright). O browser **só inicia quando uma skill PJe é executada** — `ensureStagehand()` é chamado internamente.

API pública:
- `ensureStagehand()` — garante init (lazy); usar em toda skill antes de `getStagehand()`
- `runBrowserTask(instruction, maxSteps, onStep)` — executa tarefa via agent autônomo
- `injectOverlay(text, done?)` — overlay visual no Chrome
- `closeStagehand()` — mata Chrome e limpa estado
- `reInitStagehand()` — fecha e reinicia (usado ao trocar provider/modelo)

### Skills (`electron/skills/`)
```
skills/
  pje/      abrir, agir, consultar, movimentacoes, documentos, navegar, preencher
  os/       arquivos, clipboard, escrever, fetch, listar, sistema
  pc/       agir (nut-js: mouse/teclado)
  documentos/ analisar, gerar
```
Cada skill exporta `{ name, description, execute(params, ctx) }`. O `executor.ts` as registra e despacha.

### Providers / BYOK (`electron/provider-config.ts`)
Suporte a Anthropic, OpenAI, OpenRouter, Google AI, Groq. A config ativa é lida por `getStagehandModelConfig()` e passada ao Stagehand. Chaves são armazenadas criptografadas via `electron/crypto-store.ts`.

### PJe Utilities
- `electron/pje/tribunal-urls.ts` — mapa tribunal → URL de login/painel
- `electron/pje/route-memory.ts` — cache de rotas aprendidas
- `electron/crawler.ts` — crawler de login para extrair dados de processo

### Telegram Bot (`electron/telegram-bot.ts`)
Bot opcional; auto-inicia na `app.whenReady()` se estava ativo na sessão anterior.

## Padrões importantes

- **`ensureStagehand()` antes de qualquer uso do browser** — o Chrome inicia lazy, só na primeira skill PJe.
- **`keepAlive: true` no Stagehand** — impede o supervisor de matar o Chrome prematuramente em Electron. `killPreviousChrome()` mata instâncias anteriores pelo PID salvo em `chrome.pid`.
- **IPC:** renderer → main via `window.electronAPI.*` (exposto no preload). Main → renderer via `mainWindow.webContents.send(...)`.
- **Build separado:** `tsconfig.json` compila o renderer para `dist/`; `tsconfig.electron.json` compila o processo principal para `dist-electron/`.
