# Arquitetura Atual da Lex

Fonte de verdade da arquitetura. Descreve o estado **atual** do código — não o
histórico. Docs de decisões antigas estão em [`archive/`](archive/) e não devem
ser usados como referência de "como é hoje". Em conflito, vale o código.

## Princípio central

A Lex tem duas metades, conectadas por um contrato local (MCP/HTTP):

- **Lex Engine / Hermes** é o cérebro. Pensa, planeja, usa subagentes, agenda
  jobs, gerencia skills e memória de agente. É Python, roda no WSL.
- **Lex Desktop / Electron** é a superfície do produto. Mostra UI, segura a
  sessão PJe no Chrome, executa ações Windows/arquivo, pede confirmação humana,
  registra auditoria, e guarda memória operacional (Brain).

Regra dura: **o Electron não é um segundo cérebro.** Raciocínio, planejamento,
multiagentes e orquestração ficam no Hermes. O Desktop executa, supervisiona e
audita. Capacidade nova de raciocínio vai pro Engine e cruza pro Desktop por
tool/MCP — nunca como um novo loop de agente dentro do Electron.

## Como o usuário fala com a Lex

A interface ativa é o **Console Lex** — um terminal xterm.js que **é o próprio
Hermes rodando interativo**. Quando o renderer abre, dispara o IPC
`terminal-create-engine` ([electron/main.ts](../electron/main.ts)), que chama
`getLexEngineConsoleSpawn()` em [electron/lex-engine.ts](../electron/lex-engine.ts).
O spawn resultante é, no Windows:

```
wsl.exe -d <distro> -- bash -lc "cd <projeto-wsl> && <env> <python-wsl> hermes"
```

Ou seja: digitar no Console Lex = falar direto com o Hermes. O env injeta
`LEX_DESKTOP=1`, `HERMES_KANBAN_HOME`, `LEX_AGORA_BOARD_PATH` e
`LEX_DESKTOP_REQUIRED_TOOLSETS` (web, browser, terminal, file, vision, skills,
todo, memory, session_search, clarify, delegation, cronjob).

Há também um caminho one-shot: `lexEngineApi.ask(prompt)` →
`askLexEngine()` → `hermes chat -Q --max-turns 1 --source lex-desktop -q <prompt>`.
Mesmo Hermes, modo não-interativo.

## Caminho canônico PJe

Quando o Hermes precisa agir no PJe, ele chama o MCP `lex-desktop`. A cadeia
completa:

```
Hermes (Console Lex)
  → MCP lex-desktop (registrado em ~/.hermes/config.yaml)
  → scripts/lex-desktop-mcp-server.mjs   (Node, stdio MCP)
  → HTTP bridge porta 32179               (electron/lex-desktop-bridge.ts)
  → backend RPC                           (electron/backend/server.ts)
  → módulos electron/pje/*.ts
  → electron/browser-manager.ts → Chrome via Playwright/CDP
```

O bridge expõe endpoints HTTP `/pje/*` (`status`, `abrir-consulta`,
`preencher-numero`, `clicar-consultar`, `ler-resultados`, `abrir-resultado`,
`ler-autos`, `baixar-documento-atual`, `analisar-documento-baixado`,
`inspecionar-contexto`, `explorar-intencao`, `executar-candidato-intencao`,
`executar-intencao-incremental`) mais `/brain/*` e `/confirm`. Cada um vira um
`rpcCall(...)` que o backend resolve com um módulo em
[electron/pje/](../electron/pje/) (ex: `pje-fill-process-number` →
`process-number-filler.ts`, `pje-click-search` → `search-clicker.ts`,
`pje-read-autos` → `autos-reader.ts`).

Não criar caminhos PJe paralelos que pulem essa cadeia. O MCP PJe dedicado em
Python ([engine/lex-pje-mcp/](../engine/lex-pje-mcp/)) está em construção e ainda
não está registrado em `~/.hermes/config.yaml` — quando entrar, é a evolução
natural desse caminho.

## Fronteira de memória

Duas camadas, papéis distintos, não competem:

- **Hermes** — memória de agente: persistência entre sessões, preferências,
  fatos de ambiente, memória procedural por skill, e (direção atual) conhecimento
  durável `Markdown-first` (notas, playbooks, skills).
- **Brain** ([electron/brain/](../electron/brain/)) — memória operacional do
  Desktop: `page_state`, seletores, rotas, evidências do browser/PJe, replay de
  micro-flows, dream/consolidação. É aceleração situada, não memória geral.

Regra: não duplicar no Electron uma segunda memória geral de agente. Brain =
know-how operacional; Hermes = memória de agente de alto nível.

## Runtime do Engine

Resolvido em `resolveLexEngineRuntime()` ([electron/lex-engine.ts](../electron/lex-engine.ts)):

- `LEX_ENGINE_MODE=repo-wsl` (**padrão**) — usa o monorepo em
  `engine/lex-engine/`, comando `<python-wsl> hermes`.
- `LEX_ENGINE_MODE=external-wsl` (fallback/rollback) — usa
  `/home/<user>/lex_engine/`, comando `hermes`.
- `repo-windows` — declarado mas **não suportado**.

## Configs MCP (duas, distintas)

- `~/.lex/mcp.json` — consumido pelo **Electron** ([electron/mcp-manager.ts](../electron/mcp-manager.ts)).
  Hoje: `filesystem` e `browser` (browser-use via CDP).
- `~/.hermes/config.yaml`, seção `mcp_servers` — consumido pelo **Hermes**.
  Hoje: `lex-desktop` (o caminho canônico PJe acima).

## Agora (workflow durável)

Quadro Kanban para tarefas duráveis/massivas/retomáveis. **Postergada para
pós-MVP** — direção arquitetural válida, mas fora do escopo ativo. Wiring atual:
[electron/agora/kanban-bridge.ts](../electron/agora/kanban-bridge.ts) chama o
Kanban oficial do Hermes (`hermes_cli/kanban_db.py`) via `HERMES_KANBAN_HOME`/
`kanban.db`. UI em `src/renderer/js/agora.js`. Não reconstruir orquestração de
multiagente do zero — a base é o Kanban da Nous/Hermes. Mapa em
[backlog/NOUS-KANBAN-INTEGRATION-MAP.md](backlog/NOUS-KANBAN-INTEGRATION-MAP.md).

## Mapa de pastas (caminho ativo)

```
electron/
  main.ts                 janela, IPC, terminal, auth, updater, plugins
  preload.ts              APIs expostas ao renderer
  lex-engine.ts           ponte pro Hermes (spawn console, ask, provider sync, runtime)
  lex-desktop-bridge.ts   servidor HTTP que o MCP lex-desktop consome
  backend/server.ts       RPC server (handlers PJe/brain/session via WebSocket)
  pje/                    módulos canônicos PJe (filler, clicker, readers, downloader, inspector)
  browser-manager.ts      Chrome via Playwright CDP (lazy: só sobe na 1ª ação PJe)
  brain/                  memória operacional (replay, dream, selectors, routes, flows)
  agora/                  ponte Kanban (pós-MVP)
  terminal/               node-pty pro Console Lex
  plugins/                integrações externas (Gmail, Slack, Notion, etc.)
  privacy/                PII Vault, consent, audit log (LGPD)
  provider-config.ts      BYOK; chaves cifradas em crypto-store.ts
  agent/                  biblioteca compartilhada (types, memory, session,
                          executor, retry, doc-index, legislacao-downloader)
                          — NÃO é mais cérebro; só infra que skills/backend usam

src/renderer/             JS puro: index.html, app.js (settings/brain/skills),
                          terminal.js (Console Lex), agora.js, file-manager.js

engine/
  lex-engine/             Hermes (planner, tools, kanban, gateway, MCP)
  lex-pje-mcp/            MCP PJe dedicado em Python (em construção, não plugado)
```

## O que NÃO existe mais (não procure no código)

Removido no cleanup pré-MVP de 2026-05:

- **Agent Loop TS** — todo o cérebro paralelo que vivia em `electron/agent/`
  (`loop`, `think`, `critic`, `planner`, `orchestrator`, `agent-pool`,
  `blackboard`, `validator-agent`, `action-queue`, `cache`, `context-budget`,
  `os-intent-router`, `prompt-layer`, `usage-tracker`, `confirmation-policy`,
  `training-*`).
- **Chat UI** do renderer (chat-wrapper, multi-conversation, Plan Card,
  suggestion-cards). O Console Lex substituiu.
- **Batch/Lotes** (`electron/batch/`).
- **Scheduler local** (`electron/scheduler/`, `electron/notifications.ts`).
- **8 skills Playwright PJe** (`pje/abrir`, `agir`, `consultar`, `movimentacoes`,
  `documentos`, `navegar`, `preencher`, `bulk-coletar`) — substituídas pelo
  caminho MCP/`electron/pje/*`.
- **IPC handlers**: `agent-*`, `ai-plan-execute`, `orchestrator-*`,
  `checkpoint-*`, `scheduler-*`, `batch-*`, `ai-chat-send`, `training-*`,
  `session-seed`.
- `electron/eval/` (benchmarks do agent loop).

Telegram bot ([electron/telegram-bot.ts](../electron/telegram-bot.ts)) ainda
existe como shell, mas os comandos de agente foram neutralizados (sem caminho
novo ligado).

## Onde aprofundar

- [LEX-LAUNCH-READINESS.md](LEX-LAUNCH-READINESS.md) — gates e escopo do MVP
- [PJE-SKILLS-APPARATUS.md](PJE-SKILLS-APPARATUS.md) — aparato PJe (centro do MVP)
- [SECURITY-ARCHITECTURE.md](SECURITY-ARCHITECTURE.md) — PII Vault, consent, audit, LGPD
- [BRAIN-DREAM-REPLAY-SPRINT.md](BRAIN-DREAM-REPLAY-SPRINT.md) — memória operacional
- [README.md](README.md) — índice de todos os docs
