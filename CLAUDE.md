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
| `loop.ts` | Orquestrador do loop único; emite eventos para a UI via `agentEmitter`. Aceita `AgentSpec` opcional para especialização |
| `think.ts` | Chama o LLM para decidir a próxima skill. Aceita `AgentSpec` para filtrar skills e injetar prompt extra |
| `critic.ts` | Avalia se a resposta final está boa o suficiente |
| `executor.ts` | Despacha para a skill correta. `getSkillsForPrompt()` aceita `allowedCategories` para filtrar por agente |
| `session.ts` | Persistência de sessões/histórico de conversa |
| `memory.ts` | Memória TF-IDF para contexto de processos jurídicos |

### Planning & Multi-Agent (Phase 1 AIOS — `electron/agent/`)

Camada acima do Agent Loop que decompõe objetivos complexos em subtasks paralelas.

**Fluxo:** `Goal → Planner → SubTask[] (DAG) → Orchestrator → AgentPool → Blackboard → Síntese Final`

| Arquivo | Papel |
|---|---|
| `planner.ts` | LLM decompõe objetivo em subtasks com dependências. `shouldUsePlanner()` detecta objetivos compostos |
| `orchestrator.ts` | Coordena execução: cria plano, executa batches topológicos, sintetiza resposta final |
| `agent-pool.ts` | Spawn/parallel de agentes com concurrency limit. PJe/browser rodam serial (mutex) |
| `agent-types.ts` | Registry de 6 tipos: `general`, `pje`, `document`, `research`, `browser`, `os` |
| `blackboard.ts` | Shared context — agentes postam resultados via `set()`, outros lêem via `get()` |
| `types.ts` | `AgentSpec`, `SubTask`, `Plan`, `OrchestratorEvent`, `AgentTypeId` |

**IPC:** `ai-plan-execute` no preload → handler no main.ts → `Orchestrator.execute()`.
**Backward compat:** `runAgentLoop` sem `agentSpec` funciona exatamente como antes.

### Browser Automation (`electron/browser-manager.ts`)
Controla Chrome externo via Playwright CDP. O browser **só inicia quando uma skill PJe é executada** — `ensureBrowser()` é chamado internamente.

API pública:
- `ensureBrowser()` — garante init (lazy); usar em toda skill antes de `getActivePage()`
- `runBrowserTask(instruction, maxSteps, onStep)` — executa tarefa via agent autônomo
- `injectOverlay(text, done?)` — overlay visual no Chrome
- `closeBrowser()` — mata Chrome e limpa estado
- `reInitBrowser()` — fecha e reinicia (usado ao trocar provider/modelo)

Heartbeat: `startHeartbeat()` roda a cada 6h, faz `fetch(url)` com cookies para manter sessão PJe. Timeout de 30s evita travamento em CDP hang.

### Browser Infra (`electron/browser/`)

| Arquivo | Status | Papel |
|---|---|---|
| `validation.ts` | ✅ Integrado | Post-action DOM snapshot (antes/depois). Executado automaticamente pelo executor para skills de categoria `browser`/`pje` |
| `selector-memory.ts` | ✅ Integrado | Cache tribunal→seletor com success/failure tracking. Persistido em disco |
| `selector-discovery.ts` | ✅ Integrado | Heurística de scoring para encontrar elementos sem LLM |
| `resolve-selector.ts` | ✅ Integrado | Waterfall de 3 tiers (learned → hardcoded → discovery). Usado por 4 skills PJe: consultar, preencher, documentos, movimentacoes |
| `captcha.ts` | ✅ Integrado | Detecção de CAPTCHA (DOM heuristics) + auto-solve via vision model. PJe → pausa para usuário, gov → auto-solve |

### Skills (`electron/skills/`)
```
skills/
  pje/        abrir, agir, consultar, movimentacoes, documentos, navegar, preencher
  os/         arquivos, clipboard, escrever, fetch, listar, sistema
  pc/         agir (nut-js: mouse/teclado) — TODO: avaliar skills específicas (screenshot, abrir programa, etc.)
  documentos/ analisar, gerar
  browser/    get-state, extract, scroll, click, navigate, type, screenshot, close-tab, switch-tab
  pesquisa/   jurisprudencia
```
Cada skill exporta `{ nome, descricao, execute(params, ctx) }`. O `executor.ts` as registra e despacha.

### Providers / BYOK (`electron/provider-config.ts`)
Suporte a Anthropic, OpenAI, OpenRouter, Google AI, Groq. A config ativa é lida por `getActiveConfig()` / `getActiveVisionModel()`. Chaves são armazenadas criptografadas via `electron/crypto-store.ts`.

### Auth / License (`electron/auth/`)
> **Em desenvolvimento.** `checkLicense()` retorna `{ status: 'pro', daysLeft: 999 }` hardcoded — paywall e trial ainda não implementados. A infra de auth (signIn/signUp/signOut via Supabase) já funciona, falta conectar a verificação de plano.

### IPC — `ai-plan-execute`
`ai-plan-execute` está exposto no preload e tem handler no main.ts. Recebe `{ goal, sessionId? }`, instancia `Orchestrator`, emite eventos `orchestrator` para o renderer e retorna `{ success, result }`.

### PJe Utilities
- `electron/pje/tribunal-urls.ts` — mapa tribunal → URL de login/painel
- `electron/pje/route-memory.ts` — cache de rotas aprendidas
- `electron/crawler.ts` — crawler de login para extrair dados de processo

### Telegram Bot (`electron/telegram-bot.ts`)
Bot opcional; auto-inicia na `app.whenReady()` se estava ativo na sessão anterior.

### Scheduler & Autonomia (Phase 2 AIOS — `electron/scheduler/`)

Sistema de agendamento autônomo que executa goals sem interação do usuário.

**Fluxo:** `Goal Store → Scheduler (cron/once/interval/trigger) → Job Runner → Orchestrator → Notifications`

| Arquivo | Papel |
|---|---|
| `types.ts` | `ScheduledGoal`, `JobRun`, `ScheduleConfig`, `TriggerConfig`, `NotificationPayload` |
| `goal-store.ts` | CRUD persistente de goals + histórico de runs via electron-store |
| `scheduler.ts` | Motor: tick 60s para cron, timers para once/interval, triggers para eventos. Cron matcher inline (5-field) |
| `job-runner.ts` | Executa goals via `Orchestrator.execute()`. Prevent overlap (1 run/goal), notificações, analytics |
| `triggers.ts` | File watcher (fs.watch), PJe movimentação (polling), manual, webhook (stub) |
| `index.ts` | `initScheduler()` / `stopScheduler()` — chamados no boot e quit do app |

**Notification Layer** (`electron/notifications.ts`): toast (Electron Notification), Telegram (via bot existente), badge (IPC para renderer).

**IPC:** `schedulerApi` no preload — `listGoals`, `addGoal`, `updateGoal`, `removeGoal`, `pauseGoal`, `resumeGoal`, `runNow`, `getRuns`, `getStatus`, `setAutoLaunch`, `getAutoLaunch`.

**Auto-launch:** `app.setLoginItemSettings()` com flag `--background` para iniciar minimizado.

### Plugins & Integrações (Phase 3 AIOS — `electron/plugins/`)

Sistema extensível de plugins para integrações externas com OAuth 2.0 e gerenciamento de tokens.

**Fluxo:** `PluginManager.loadAll() → registerPlugin → OAuth → connectPlugin → registerSkills + registerAgentType`

| Arquivo | Papel |
|---|---|
| `types.ts` | `LexPlugin`, `LexPluginManifest`, `PluginTokens`, `PluginState`, `PluginAuthConfig` |
| `plugin-manager.ts` | Singleton: registro, lifecycle, OAuth tokens (criptografados), connect/disconnect. Integra com executor (registerSkill) e agent-types (registerAgentType) |
| `oauth-flow.ts` | OAuth 2.0 genérico para Electron: loopback HTTP server, BrowserWindow, PKCE, token exchange e refresh |
| `index.ts` | `initPlugins()` — registra plugins built-in e carrega estado persistido |

**Plugins Built-in (22):**

| Plugin | Dir | Skills | Auth |
|---|---|---|---|
| Gmail | `gmail/` | `gmail_listar`, `gmail_ler`, `gmail_enviar`, `gmail_buscar`, `gmail_responder` | OAuth2 Google |
| Google Calendar | `gcalendar/` | `gcal_listar`, `gcal_buscar`, `gcal_criar`, `gcal_atualizar`, `gcal_deletar` | OAuth2 Google |
| Google Drive | `gdrive/` | `gdrive_listar`, `gdrive_baixar`, `gdrive_upload`, `gdrive_buscar`, `gdrive_compartilhar` | OAuth2 Google |
| Google Docs | `gdocs/` | `gdocs_criar`, `gdocs_ler`, `gdocs_escrever`, `gdocs_exportar` | OAuth2 Google |
| Google Contacts | `gcontacts/` | `gcontacts_listar`, `gcontacts_buscar`, `gcontacts_criar`, `gcontacts_atualizar` | OAuth2 Google |
| Outlook | `outlook/` | `outlook_listar`, `outlook_ler`, `outlook_enviar`, `outlook_buscar`, `outlook_responder` | OAuth2 Microsoft |
| Microsoft Teams | `teams/` | `teams_enviar`, `teams_listar_canais`, `teams_buscar`, `teams_agendar_reuniao` | OAuth2 Microsoft |
| OneDrive/SharePoint | `onedrive/` | `onedrive_listar`, `onedrive_upload`, `onedrive_download`, `onedrive_buscar`, `onedrive_compartilhar` | OAuth2 Microsoft |
| WhatsApp | `whatsapp/` | `whatsapp_enviar`, `whatsapp_template`, `whatsapp_notificar_cliente` | API Key (Meta) |
| Slack | `slack/` | `slack_enviar`, `slack_listar_canais`, `slack_buscar`, `slack_ler_canal` | OAuth2 Slack |
| DocuSign | `docusign/` | `docusign_enviar_envelope`, `docusign_listar`, `docusign_status`, `docusign_baixar_assinado` | OAuth2 DocuSign |
| Dropbox | `dropbox/` | `dropbox_listar`, `dropbox_upload`, `dropbox_download`, `dropbox_buscar`, `dropbox_compartilhar` | OAuth2 Dropbox |
| Notion | `notion/` | `notion_buscar`, `notion_ler`, `notion_criar`, `notion_escrever`, `notion_listar` | OAuth2 Notion |
| Trello | `trello/` | `trello_boards`, `trello_listar`, `trello_criar`, `trello_mover`, `trello_atualizar` | API Key |
| Todoist | `todoist/` | `todoist_listar`, `todoist_criar`, `todoist_completar`, `todoist_atualizar`, `todoist_projetos` | API Key |
| Zapier | `zapier/` | `zapier_trigger`, `zapier_listar`, `zapier_salvar_webhook` | Nenhuma (webhook URLs) |
| Apify | `apify/` | `apify_listar`, `apify_executar`, `apify_resultado`, `apify_buscar` | API Key |
| PDF Tools | `pdf-tools/` | `pdf_merge`, `pdf_split`, `pdf_ler`, `pdf_info` | Nenhuma (local) |
| Screenshot | `screenshot/` | `screenshot_capturar`, `screenshot_ocr`, `screenshot_info` | Nenhuma (local) |
| Excel | `excel/` | `excel_ler`, `excel_criar`, `excel_info`, `excel_para_csv` | Nenhuma (local) |
| Desktop | `desktop/` | `desktop_abrir`, `desktop_janelas`, `desktop_focar`, `desktop_processos` | Nenhuma (local) |
| Clipboard | `clipboard/` | `clipboard_ler`, `clipboard_escrever`, `clipboard_imagem` | Nenhuma (local) |

**Arquitetura de cada plugin:**
- `*-client.ts` — wrapper REST API (fetch, sem SDK)
- `skills/*.ts` — skills no padrão LEX (`{ nome, descricao, categoria, execute }`)
- `index.ts` — implementa `LexPlugin`, exporta manifest + skills

**IPC:** `pluginsApi` no preload — `list`, `getStatus`, `getAuthConfig`, `startOAuth`, `disconnect`.

**Extensibilidade:** `AgentTypeId` e `Skill.categoria` são `string` (não union), permitindo que plugins registrem novos tipos dinamicamente via `registerAgentType()` e `registerSkill()`. O Planner usa `getAgentTypeIds()` para descobrir tipos disponíveis em runtime.

## Padrões importantes

- **`ensureBrowser()` antes de qualquer uso do browser** — o Chrome inicia lazy, só na primeira skill PJe.
- **`keepAlive: true`** — impede kill prematuro do Chrome em Electron. `killPreviousChrome()` mata instâncias anteriores pelo PID salvo em `chrome.pid`.
- **IPC:** renderer → main via `window.electronAPI.*` (exposto no preload). Main → renderer via `mainWindow.webContents.send(...)`.
- **Build separado:** `tsconfig.json` compila o renderer para `dist/`; `tsconfig.electron.json` compila o processo principal para `dist-electron/`.
