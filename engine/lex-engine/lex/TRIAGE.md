# Lex Migration Triage — lex.1 (Electron) → lex_engine (Hermes fork)

> **Atualizacao em 2026-05-09:** esta triagem e historica e deve ser lida junto
> com `docs/CURRENT-ARCHITECTURE.md` e `engine/lex-engine/LEX_ENGINE_IMPORT.md`.
> O Engine/Hermes ja foi importado para o monorepo e roda por padrao em
> `LEX_ENGINE_MODE=repo-wsl`. Chat/Console podem usar multiagentes inline. A
> Agora e a superficie de workflows duraveis e complexos. Lotes/batch antigo
> nao deve guiar a arquitetura nova.

Triagem feita lendo a estrutura pública do repositório `EderSilvaa/lex.1` no
GitHub. Classifica cada pasta/arquivo do `electron/` do lex.1 em uma das quatro
categorias, e lista o que precisa ser lido em código pra confirmar.

## Legenda

| Cor | Categoria | Destino |
|---|---|---|
| 🟢 | **LEGAL** — domínio jurídico brasileiro | Migra → `skills/legal/` no lex_engine |
| 🔵 | **SHELL** — UI, plataforma Windows, comercial | Fica no Electron, sob o cérebro Hermes |
| 🔴 | **INFRA DUPLICADA** — reimplementa Hermes em TS | Deleta. Hermes substitui. |
| 🟡 | **HÍBRIDO** — orquestração na UI + lógica de domínio | UI fica, lógica migra |
| ⚪ | **INVESTIGAR** — preciso ler o código pra decidir |  |

## Resumo executivo

| Categoria | Pastas | Trabalho |
|---|---|---|
| 🟢 LEGAL | `legal/`, `pje/`, `datajud/`, `skills/pje/`, `skills/documentos/`, `skills/pesquisa/` | **Migrar pra `skills/legal/` (Python)** |
| 🔵 SHELL | `auth/`, `privacy/`, `terminal/`, `python/`, `main.ts`, `preload.ts`, `src/renderer/` | **Manter no Electron** |
| 🔴 INFRA | `agent/`, `browser/`, `tools/`, `scheduler/`, `plugins/`, `cli/`, `observer/`, `eval/`, `skills/browser/`, `skills/os/`, `skills/pc/` | **Deletar** |
| 🟡 HÍBRIDO | `batch/`, `brain/` | `batch/` fica legado; Agora substitui Lotes como superficie. Brain fica em TS e expoe tools via MCP |
| ⚪ INVESTIGAR | `backend/`, `typings/` | TBD |

---

## Detalhamento por pasta

### 🟢 `electron/legal/` — LEGAL DOMAIN
| Arquivo | Destino sugerido |
|---|---|
| `glossary/` | → `skills/legal/glossary/` (data) |
| `doc-examples.ts`, `doc-importer.ts`, `doc-schemas.ts`, `doc-schema-registry.ts`, `doc-schema-seed.ts`, `doc-seed-pipeline.ts` | → nova skill `skills/legal/doc-templates/` |
| `legal-extractor.ts` | → tool Python `tools/legal_extractor.py` ou skill |
| `legal-language-engine.ts` | → conteúdo expande `skills/legal/lex-legal-brief` |
| `legal-store.ts` | → adapter pra memória do Hermes (`agent/memory_manager`) |
| `seed-data.ts` | → data files em `skills/legal/data/` |
| `style-rules.ts` | → conteúdo expande SOUL/skill (estilo de petição) |
| `index.ts` | descartar (será reescrito como SKILL.md em Python) |

**Esforço estimado:** 3-5 dias (lógica é tradução TS→Python; dados são reutilizados como JSON/MD).

### 🟢 `electron/pje/` — LEGAL DOMAIN
| Arquivo | Destino |
|---|---|
| `tribunal-urls.ts` | → `skills/legal/pje-actions/data/tribunais.json` |
| `route-memory.ts` | → memória da skill (cache de URLs visitadas por processo) |
| `types.ts` | → schemas Pydantic em `skills/legal/pje-actions/schemas.py` |
| `index.ts` | descartar |

### 🟢 `electron/skills/pje/` — LEGAL DOMAIN (alta prioridade)
12 arquivos, todas operações concretas:
| Arquivo | Operação | Migra para |
|---|---|---|
| `abrir.ts` | abrir PJe / autenticar | `pje-actions/open.py` |
| `navegar.ts` | navegação entre páginas | `pje-actions/navigate.py` |
| `pedir-codigo.ts` | 2FA / código de acesso | `pje-actions/auth.py` |
| `token-check.ts` | validação de sessão | `pje-actions/session.py` |
| `consultar.ts` | consultar processo | `pje-actions/query.py` |
| `movimentacoes.ts` | listar movimentações | `pje-actions/movements.py` |
| `documentos.ts` | listar/baixar docs | `pje-actions/documents.py` |
| `agir.ts` | executar ação no processo | `pje-actions/act.py` |
| `preencher.ts` | preencher formulário | `pje-actions/fill.py` |
| `bulk-coletar.ts` | coleta em lote | `pje-actions/bulk.py` |
| `browser-use.ts` | helper de automação | descartar — substitui por `browser_cdp_tool` |
| `index.ts` | exports | descartar |

**Confirmado 🟢.** Migração é **traduzir 11 arquivos TS** (Playwright direto) → **Python usando `browser_*` tools do Hermes**. Lógica é a mesma — clica, preenche, espera. **Esforço:** 1-1.5 sem.

### 🟢 `electron/skills/documentos/` — LEGAL DOMAIN
| Arquivo | Operação |
|---|---|
| `analisar.ts` | análise de documento jurídico |
| `gerar.ts` | geração de petição |
| `index.ts` | exports |

3 arquivos. Pequeno. **Migra para `skills/legal/documento-analisar` e `skills/legal/documento-gerar`.** **Esforço:** 2-3 dias.

### 🟢 `electron/skills/pesquisa/` — LEGAL DOMAIN
| Arquivo | Operação |
|---|---|
| `jurisprudencia.ts` | busca de jurisprudência |
| `index.ts` | exports |

Apenas 2 arquivos. **Migra para `skills/legal/jurisprudencia`** usando `tools/web_search` + `browser_*` do Hermes. **Esforço:** 2-3 dias.

### 🟢 `electron/datajud/` — LEGAL DOMAIN
| Arquivo | Destino |
|---|---|
| `datajud-client.ts` | → `tools/datajud_tool.py` (cliente HTTP CNJ) |
| `processo-store.ts` | → adapter pra memória Hermes (cache de processos) |
| `jurisprudencia-store.ts` | → idem |
| `sync-engine.ts` | → cron Hermes (`cron/`) que chama o tool |
| `user-profile.ts` | → fica no Electron (lado SHELL — perfil + API key) |
| `types.ts` | → Pydantic schemas |
| `index.ts` | descartar |

**Nota:** API key do DataJud é credencial → fica no Electron `auth/` ou `privacy/encrypted-storage.ts`. Hermes recebe via env var ou config no startup.

**Esforço:** 3-5 dias.

### 🟡 `electron/batch/` — HÍBRIDO / LEGADO
**Estado atual:** nao usar Lotes/batch como arquitetura nova. A orquestracao
duravel deve passar pelo Hermes/Lex Engine e aparecer na Agora. O codigo antigo
de `electron/batch/` ainda pode servir como referencia historica de dominio
(estrategia, auditoria, templates), mas a superficie de produto e o contrato
novo sao Agora + tool `agora` + board compartilhado.

| Arquivo | Destino |
|---|---|
| `pipeline.ts`, `worker.ts`, `protocol-queue.ts` | referência para workflows jurídicos no Hermes/Agora, não pipeline novo |
| `estrategista.ts` | → skill (estratégia jurídica é domínio) |
| `auditor.ts` | → skill (validação jurídica é domínio) |
| `diff-engine.ts` | → tool Python `tools/legal_diff.py` |
| `legal-templates.ts` | → consolida com `legal/` na nova skill `doc-templates` |
| `lote-store.ts` | legado; se algum dado for útil, migrar para estado de workflow da Agora |
| `telegram-hitl.ts` | → **deletar** — Hermes já tem gateway Telegram pronto em `gateway/platforms/telegram.py`. Se quiser HITL via Telegram, configura no Hermes. |
| `modelos/` | → data em `skills/legal/peticao-batch/data/` |
| `types.ts`, `index.ts` | descartar/reescrever |

**Decisao atual:** nao manter UI dos Lotes no renderer. A UI de produto e
Agora; canais `batch-*` so devem sobreviver ate uma limpeza/migracao dedicada.

### 🔵 `electron/auth/` — SHELL
| Arquivo | Destino |
|---|---|
| `license.ts` | mantém — lógica de trial/license é comercial Lex |
| `supabase-client.ts` | mantém — backend Lex remoto (não tem por que migrar) |

**Esforço:** 0 (fica como está).

### 🔵 `electron/privacy/` — SHELL
| Arquivo | Destino |
|---|---|
| `audit-log.ts`, `consent-manager.ts`, `encrypted-storage.ts`, `pii-vault.ts` | mantém — LGPD/UX brasileira é diferenciador, não infra Hermes |
| `index.ts` | mantém |

**Cuidado:** Hermes pode logar PII em memória/skills. Vai precisar de **hook entre Hermes Python e `pii-vault.ts`** pra mascaramento antes de persistir. Isso é trabalho novo, não migração.

**Esforço:** 0 pra manter; +3-5 dias pra integrar com Hermes.

### 🔵 `electron/terminal/` — SHELL
| Arquivo | Destino |
|---|---|
| `pty-manager.ts` | mantém — host de processo |
| `command-guard.ts`, `command-policy.ts` | mantém — sandbox de comando |
| `index.ts` | mantém, ajustar pra spawnar `hermes` |

**Esforço:** 1 dia (trocar comando padrão de bash → `hermes` via `python -m hermes_cli`).

### 🔵 `electron/python/` — SHELL (precisa expandir)
| Arquivo | Estado |
|---|---|
| `environment-manager.ts` | mantém + estende |
| `index.ts` | reescrever como subprocess runner real |

**Falta construir:**
- Subprocess runner com stdin/stdout JSON-line RPC
- Bundle do Python no NSIS (via `python-build-standalone` ou `pyembed`)
- Hot-reload em dev (watch + restart subprocess)

**Esforço:** 1-1.5 semanas.

### 🔴 `electron/agent/` — DELETA
27 arquivos TS reimplementando o agent loop. **Tudo morre.** Hermes faz: `agent/`, `run_agent.py`, `model_tools.py`, `agent/memory_manager.py`.

| Arquivo lex.1 | Equivalente Hermes |
|---|---|
| `loop.ts`, `think.ts`, `executor.ts`, `critic.ts`, `orchestrator.ts` | `run_agent.py` + `agent/` |
| `planner.ts`, `action-queue.ts`, `agent-pool.ts`, `blackboard.ts` | já no Hermes |
| `memory.ts` | `agent/memory_manager.py` |
| `checkpoint-store.ts` | `tools/checkpoint_manager.py` |
| `cache.ts`, `context-budget.ts`, `prompt-layer.ts`, `retry.ts`, `session.ts`, `usage-tracker.ts` | já no Hermes |
| `validator-agent.ts` | mecanismo de validators do Hermes |
| `os-intent-router.ts` | descartar (intent routing é parte do agent loop, Hermes faz) |
| `legislacao-downloader.ts` | ⚠️ **🟢 LEGAL camuflado.** Catálogo de 14 leis brasileiras (Constituição, CC, CLT, CP, etc.) baixadas de Planalto.gov.br. Lógica de download é genérica (HTML → texto), mas **catálogo é domínio**. Migrar: catálogo → `skills/legal/legislacao/data/catalogo.json`; downloader → script Python ~30 linhas com `requests`. Cron Hermes (24h check) substitui o scheduler interno. **Esforço:** 1 dia. |
| `doc-index.ts` | RAG → Hermes tem `tools/memory_tool.py` ou skill RAG |
| `training-collector.ts`, `training-exporter.ts`, `training-sanitizer.ts` | Hermes tem RL/training surface — verificar paridade antes de deletar |
| `agent-types.ts`, `types.ts`, `index.ts` | descartar |

**Esforço de DELETE:** 1 dia (riscar e testar). **+ Resgate:** `legislacao-downloader.ts` precisa ser inspecionado e migrado se contiver lógica jurídica.

### 🟡 `electron/brain/` — HÍBRIDO (mudou de classificação após investigação)
**Surpresa.** Não é wrapper genérico de memória. São **21 arquivos TS** com features que o Hermes **não tem**:

| Arquivo | O que faz | Único Lex? |
|---|---|---|
| `dream.ts` | detecção de padrões offline (analisa interações ociosas) | ✅ |
| `flow-detector.ts` | identifica fluxos de trabalho recorrentes | ✅ |
| `replay-engine.ts` + `replay-executor.ts` | replay de interações passadas | ✅ |
| `federated-trust.ts` | trust scoring distribuído | ✅ |
| `intent-similarity.ts` | similaridade semântica entre intenções | ✅ |
| `slot-filler.ts` | extração de parâmetros de interações | ✅ |
| `dashboard.ts` | visualização analytics | ✅ |
| `trace-query.ts` | query de histórico de interações | ✅ |
| `brain-store.ts`, `brain-export.ts`, `brain-md-watcher.ts`, `brain-renderer.ts` | persistência e render | ✅ (parcial) |
| `compaction.ts`, `normalizer.ts`, `staleness.ts`, `percentiles.ts`, `scoring.ts`, `schema.ts`, `types.ts` | utilities de pipeline | redundante c/ Hermes em alguns casos |

**Isso é feature de produto, não infra duplicada.** Hermes' `memory_manager.py` é uma camada simples; nada disso aqui.

**Decisão recomendada — opção B:** Manter `brain/` em TS no Electron e **expor pro Hermes via MCP server local** (~10 tools: `brain.dream`, `brain.flows`, `brain.replay`, `brain.search`, `brain.dashboard` etc.). Hermes consome via [skills/mcp/native-mcp/](skills/mcp/native-mcp/).

Vantagens:
- Zero retrabalho (código TS continua funcionando)
- Brain preserva sua lógica única
- Hermes usa brain como tool externa (uso canônico de MCP)
- Migração futura é gradual (port arquivo a arquivo se quiser)

Custo:
- Cria 1 servidor MCP novo no Electron (já vai existir pra outros usos: license, file-picker, datajud-with-key)
- ~10 tools wrappers no MCP server (1-2 dias de boilerplate)

**Esforço:** ~3-4 dias (MCP server + wrappers + integração).
*Alternativa A (port completo pra Python):* ~3-4 semanas.
*Alternativa C (deletar):* 0 dias, mas perde diferenciador de produto.

### 🔴 `electron/browser/` — DELETA
Hermes tem `tools/browser_tool.py`, `tools/browser_cdp_tool.py`, `tools/browser_supervisor.py`, `tools/browser_camofox.py`. Cobertura completa.

**Esforço:** 0 (deletar).

### 🔴 `electron/skills/browser/`, `electron/skills/os/`, `electron/skills/pc/` — DELETA
Skills genéricas. Hermes tem todas em `tools/file_*`, `tools/file_operations.py`, `tools/code_execution_tool.py`, etc.

**Esforço:** 0.

### 🔴 `electron/tools/`, `scheduler/`, `plugins/`, `cli/`, `observer/`, `eval/` — DELETA
Tudo reimplementação. Hermes tem `tools/`, `cron/`, `plugins/`, `hermes_cli/`, hooks/observer surface, e suite de testes próprios.

**Esforço:** 1 dia de delete + testar.

### 🔵 `electron/backend/` — SHELL (provavelmente)
1 arquivo: `server.ts`. Pequeno. Provável servidor local pra UI ou proxy de API. Sem ler o código não dá pra fechar 100%, mas tamanho indica que **não é peça crítica** — fica no Electron como está.

**Esforço:** 0 (manter; revisitar se quebrar algo).

### ⚪ `electron/typings/` — provavelmente DELETA
TS type defs. Não tem equivalente em Python (Pydantic gera schemas próprios).

---

## Renderer (`src/renderer/`)

Não consegui listar do GitHub. Sei que é **Vanilla JS + xterm.js**. **Mantém integralmente.** O único trabalho aqui é:

1. Trocar imports de canais IPC que migraram (qualquer `agent-*`, `brain-*` que mude payload).
2. Atualizar a UI da página **Configurações** pra refletir que provedor de modelo é gerenciado pelo Hermes (não mais pelo `electron/llm/`).

**Esforço:** 2-3 dias pra reauditar canais IPC.

---

## Itens menores ainda em aberto (pós-triagem)

| Item | Por quê | Tempo |
|---|---|---|
| Conteúdo de `electron/backend/server.ts` | confirmar 🔵 SHELL | 15 min |
| `src/renderer/` estrutura completa | mapear páginas pra canais IPC migrados | 2 horas |
| `electron/agent/training-*.ts` | comparar com surface RL/training do Hermes antes de deletar | 1 hora |

**Subtotal:** meio dia. Não bloqueia início da migração.

---

## Total revisado pós-triagem completa

| Bloco | Esforço |
|---|---|
| Skill `pje-actions` (11 arquivos TS → Python usando `browser_cdp_tool`) | 1-1.5 sem |
| Skill `datajud` (cliente API + cache) | 3-5 dias |
| Skill `documento-analisar` + `documento-gerar` | 2-3 dias |
| Skill `jurisprudencia` | 2-3 dias |
| Skill `legislacao` (catálogo + downloader) | 1 dia |
| Skill `lex-legal-brief` expandido (estilo, glossário, templates de `electron/legal/`) | 3-5 dias |
| Skill `peticao-batch` (híbrido — orquestração migra, UI fica) | 1-1.5 sem |
| **Brain via MCP server local** (manter TS + expor ~10 tools) | 3-4 dias |
| Servidor MCP do Electron (license + file-picker + datajud-key + dialog) | 2-3 dias |
| Reusar gateway HTTP/WS do Hermes pro chat (em vez de inventar protocolo) | 2-3 dias |
| Apontar `electron/terminal/` → `hermes` | 1 dia |
| Bundle Python no NSIS (`python-build-standalone`) | 3-5 dias |
| `electron/python/` virar runner real (subprocess + lifecycle) | 3-5 dias |
| Deletar pastas 🔴 (`agent`, `browser`, `tools`, `scheduler`, `plugins`, `cli`, `observer`, `eval`, skills genéricas) | 1-2 dias |
| Integração `pii-vault` ↔ Hermes (mascaramento antes de persistir) | 3-5 dias |
| Reauditar canais IPC do renderer (atualizar imports) | 2-3 dias |
| Polish: trial, updater, instalador NSIS, smoke test | 1 sem |
| **Total solo full-time** | **~6-7 sem** |

A decisão de manter `brain/` em TS (opção B) **economizou ~2-3 semanas** vs portar tudo pra Python. Esse foi o maior ganho da investigação completa.

---

## Próximos passos imediatos

1. **Aprovar triagem** ou marcar pastas pra reclassificar.
2. **Fechar decisão de repo:** mono (recomendado) vs poly. Sem isso, layout do `skills/legal/` muda.
3. **Liberar leitura de código** dos 6 itens em aberto pra fechar números.
4. **Definir feature-flag rollout** (caminho MVP vs big-bang). Recomendação anterior: feature flag.

Depois disso eu produzo o `MIGRATION-PLAN-v2.md` que substitui o atual e o `LEX-FORK.md` revisado.
