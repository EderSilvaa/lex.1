# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo. Fonte de
verdade arquitetural: [docs/CURRENT-ARCHITECTURE.md](docs/CURRENT-ARCHITECTURE.md).

Idioma: responda em português do Brasil, direto e técnico. Sem over-engineering —
o projeto está em modo "fechar MVP".

## Gotcha crítica — launcher do Electron

VSCode seta `ELECTRON_RUN_AS_NODE=1`. O script
[scripts/launch-electron.js](scripts/launch-electron.js) deleta essa env var antes
de spawnar o Electron. **Nunca chamar `electron` direto** — sempre via
`npm run electron:start` ou `npm run electron:dev`.

## Comandos

```bash
npm run electron:dev    # watch TS + inicia Electron
npm run electron:start  # só inicia (sem watch)
npm run build           # compila pra dist-electron/
npm run type-check      # tsc --noEmit (tsconfig.electron.json, sem strict)
```

> Existem dois tsconfigs no repo. `tsconfig.electron.json` é o build real.
> `tsconfig.json` é mais estrito e nenhum script o usa — IDE pega ele e mostra
> erros que o build aceita. Dívida técnica conhecida, não bloqueia produto.

## Arquitetura em um parágrafo

LEX tem duas metades conectadas por MCP/HTTP local:

- **Lex Engine / Hermes** (Python no WSL, em [engine/lex-engine/](engine/lex-engine/))
  é o cérebro: raciocina, planeja, usa subagentes, agenda jobs, gerencia skills.
  Roda dentro do terminal "Console Lex" do Electron.
- **Lex Desktop** (Electron + TypeScript) é a superfície do produto: mostra UI,
  segura sessão PJe no Chrome, executa ações Windows/arquivo, pede confirmação
  humana, registra auditoria, e mantém memória operacional (Brain).

Quando o Hermes precisa agir em PJe/Windows/arquivos, ele chama o MCP `lex-desktop`
(registrado em `~/.hermes/config.yaml`), que spawna
[scripts/lex-desktop-mcp-server.mjs](scripts/lex-desktop-mcp-server.mjs), que
encaminha HTTP pra ponte em
[electron/lex-desktop-bridge.ts](electron/lex-desktop-bridge.ts), que chama
handlers RPC em [electron/backend/server.ts](electron/backend/server.ts), que usa
módulos em [electron/pje/](electron/pje/) pra controlar Chrome via Playwright/CDP.

## Onde as coisas vivem (caminho ativo)

**Electron (TypeScript):**
- [electron/main.ts](electron/main.ts) — janela, IPC, terminal, auth, updater
- [electron/preload.ts](electron/preload.ts) — APIs expostas ao renderer
- [electron/lex-engine.ts](electron/lex-engine.ts) — ponte pro Hermes via WSL
- [electron/lex-desktop-bridge.ts](electron/lex-desktop-bridge.ts) — servidor HTTP que o MCP `lex-desktop` consome
- [electron/backend/server.ts](electron/backend/server.ts) — RPC server com handlers PJe
- [electron/pje/](electron/pje/) — módulos canônicos PJe (filler, clicker, reader, downloader, etc.)
- [electron/browser-manager.ts](electron/browser-manager.ts) — Chrome via Playwright CDP
- [electron/brain/](electron/brain/) — memória operacional: replay, dream, selector/route memory
- [electron/agora/](electron/agora/) — Kanban (parqueado pós-MVP, mas wired)
- [electron/terminal/](electron/terminal/) — node-pty pra view Console Lex
- [electron/agent/](electron/agent/) — biblioteca compartilhada (types, memory, session, retry, doc-index, legislacao-downloader) — **NÃO é mais um cérebro**, é só infra que backend/RAG consomem

**Renderer (JS puro):**
- [src/renderer/index.html](src/renderer/index.html) — markup principal
- [src/renderer/js/app.js](src/renderer/js/app.js) — settings, brain, skills (catálogo Hermes), navegação
- [src/renderer/js/terminal.js](src/renderer/js/terminal.js) — xterm.js do Console Lex
- [src/renderer/js/agora.js](src/renderer/js/agora.js) — UI Ágora
- [src/renderer/js/file-manager.js](src/renderer/js/file-manager.js) — view de arquivos

**Engine (Python):**
- [engine/lex-engine/](engine/lex-engine/) — Hermes (planner, tools, kanban, gateway, MCP client/server)
- [engine/lex-pje-mcp/](engine/lex-pje-mcp/) — MCP PJe dedicado em Python, em construção, ainda **não plugado** em `~/.hermes/config.yaml`

## Caminho canônico PJe

```
Hermes (Console Lex) → lex-desktop MCP (scripts/lex-desktop-mcp-server.mjs)
                     → HTTP bridge porta 32179 (electron/lex-desktop-bridge.ts)
                     → backend RPC (electron/backend/server.ts)
                     → módulos em electron/pje/
                     → browser-manager → Chrome via CDP
```

Não introduzir caminhos paralelos que ignorem essa cadeia. Tudo de PJe novo
deve passar por aqui ou pelo `engine/lex-pje-mcp/` quando ele for plugado.

## Engine/Hermes — config runtime

- Runtime padrão: `LEX_ENGINE_MODE=repo-wsl` (usa o monorepo em
  `engine/lex-engine/`)
- Fallback: `LEX_ENGINE_MODE=external-wsl` (usa `/home/eder/lex_engine/`)
- Kanban compartilhado: `HERMES_KANBAN_HOME` / `kanban.db`
- Spawn de workers Ágora requer `LEX_AGORA_ENABLE_WORKERS=1`

## Padrões importantes

- **Lazy browser**: `ensureBrowser()` em [electron/browser-manager.ts](electron/browser-manager.ts). Chrome só sobe quando uma ação PJe é realmente invocada.
- **MCP em duas configs distintas**: `~/.lex/mcp.json` (consumido pelo Electron — hoje tem `filesystem` e `browser`/browser-use); `~/.hermes/config.yaml` seção `mcp_servers` (consumido pelo Hermes — hoje tem `lex-desktop`).
- **Retry de LLM**: `withAIRetry` em [electron/agent/retry.ts](electron/agent/retry.ts), inclui status 529 (Anthropic overloaded) e "overloaded" string.
- **Boot order** em main.ts: `createWindow()` → handlers IPC do terminal (imediato) → backend. Terminal handlers DEVEM estar registrados antes do renderer disparar `terminal-create-engine` (~200ms depois do load).
- **IPC convention**: renderer → main via `window.lexApi.*` / `window.lexEngineApi.*` / `window.brainApi.*` etc. Main → renderer via `mainWindow.webContents.send(...)`.
- **Provider/BYOK**: chaves criptografadas via [electron/crypto-store.ts](electron/crypto-store.ts). Provider ativo via `getActiveConfig()` em [electron/provider-config.ts](electron/provider-config.ts). Mudança de provider re-sincroniza com Hermes.

## O que foi removido em 2026-05 (não procure no código)

Após o cleanup pré-MVP:

- Agent Loop TS inteiro (`loop`, `think`, `critic`, `planner`, `orchestrator`, `agent-pool`, `blackboard`, `validator-agent`, `action-queue`, `cache`, `context-budget`, `os-intent-router`, `prompt-layer`, `usage-tracker`, `confirmation-policy`, `training-*` em `electron/agent/`)
- Chat UI do renderer (chat-wrapper, conv-section, multi-conversation, Plan Card UI, suggestion-cards)
- Pipeline Batch/Lotes (`electron/batch/`)
- Scheduler local (`electron/scheduler/`, `electron/notifications.ts`)
- 8 skills Playwright PJe (`pje/abrir`, `pje/agir`, `pje/consultar`, `pje/movimentacoes`, `pje/documentos`, `pje/navegar`, `pje/preencher`, `pje/bulk-coletar`)
- IPC handlers: `agent-*`, `ai-plan-execute`, `orchestrator-*`, `checkpoint-*`, `scheduler-*`, `batch-*`, `ai-chat-send`, `training-*`, `session-seed`, `plugins-*`
- `electron/eval/` (benchmarks do agent loop)
- **Ecossistema de skills/plugins** (2ª leva): `electron/skills/` (os, pc, browser, documentos, pesquisa), `electron/plugins/` (22 plugins + OAuth), `electron/browser/` (validation, captcha, selector-memory, resolve-selector, browser-use-*), `agent/executor.ts`, `agent/agent-types.ts`, `agent/checkpoint-store.ts`, `agent-events.ts`, `computer-manager.ts`, `pje-manager.ts`, `anthropic-mcp-runner.ts`, `legal/{style-rules,legal-language-engine}.ts`. Eram duplicata do que o Hermes já faz nativo (mensageria/arquivos/browser/terminal/OAuth). Exclusivos do Desktop catalogados em [docs/backlog/DESKTOP-EXCLUSIVE-CAPABILITIES.md](docs/backlog/DESKTOP-EXCLUSIVE-CAPABILITIES.md).

Telegram bot (`electron/telegram-bot.ts`) sobrevive como shell mas comandos
do agent foram neutralizados — settings ainda mostra a aba.

## Docs referência

- [docs/CURRENT-ARCHITECTURE.md](docs/CURRENT-ARCHITECTURE.md) — fonte de verdade
- [docs/LEX-LAUNCH-READINESS.md](docs/LEX-LAUNCH-READINESS.md) — gates de lançamento
- [docs/BRAIN-DREAM-REPLAY-SPRINT.md](docs/BRAIN-DREAM-REPLAY-SPRINT.md) — sprint atual
- Outros docs em `docs/` podem ter referências a código removido — preferir o código atual em caso de conflito.
