# Lex Migration Plan

> **Status em 2026-05-09:** este plano e historico. A migracao operacional atual
> usa o monorepo Desktop `lex-test1`, Engine importado em `engine/lex-engine`,
> `LEX_ENGINE_MODE=repo-wsl` por padrao e `external-wsl` como rollback. Agora e a
> superficie de workflows duraveis; Lotes/batch e legado.

This file maps the current Lex Electron/TypeScript app into the Hermes-derived
Lex Agent Engine.

## Source Repositories

- Current Lex app: parent workspace, `../`
- New engine fork: `./`
- Upstream engine: https://github.com/NousResearch/hermes-agent

## Hermes Surfaces To Use

| Hermes Surface | Role In Lex |
| --- | --- |
| `run_agent.py` | Core agent loop and conversation runtime. |
| `model_tools.py` | Tool orchestration and tool-call dispatch. |
| `tools/registry.py` | Registration surface for native Python tools. |
| `skills/` | Built-in procedural skills. Legal skills start in `skills/legal/`. |
| `agent/memory_manager.py` | Persistent memory strategy to adapt for legal context. |
| `hermes_cli/default_soul.py` | Default identity seeded into `SOUL.md`. |
| `gateway/` | Future multi-channel delivery and background agent interface. |
| `cron/` | Future deadline/watch/report scheduling. |
| `skills/mcp/native-mcp/` | Likely bridge path for Lex Electron tools. |

## Lex Surfaces To Migrate Or Bridge

| Current Lex Surface | First Move |
| --- | --- |
| `../electron/skills/pje/` | Expose through Windows bridge. Do not port directly first. |
| `../electron/pje/` | Keep in Electron/Windows because browser/certificate context lives there. |
| `../electron/browser/` | Keep in Electron/Windows; expose selected actions through bridge. |
| `../electron/skills/documentos/` | Migrate high-level drafting logic into legal skills; keep file generation in bridge until stable. |
| `../electron/legal/` | Reuse as legal knowledge/style/templates. |
| `../electron/privacy/` | Preserve as product requirement; adapt to bridge and prompt policy. |
| `../electron/agent/` | Treat as legacy reference; do not duplicate the Hermes loop. |
| `../electron/batch/` | Legacy batch pipeline; do not use as the new workflow surface. |
| `../electron/agora/` | Shared workflow board for durable Hermes work. |
| `../src/` | Keep UI as Lex shell for the local engine. |

## Phase 1: Local Fork Viability

Goal: prove that the Hermes fork can behave as Lex without breaking the engine.

Tasks:

1. Keep upstream MIT attribution.
2. Seed Lex legal identity through default `SOUL.md`.
3. Add legal skills in `skills/legal/`.
4. Define the Windows bridge contract in `lex/BRIDGE-CONTRACT.md`.
5. Run a minimal Hermes setup in WSL2.
6. Confirm the agent sees and can apply `lex-legal-brief`.

Exit criteria:

- `python -m py_compile hermes_cli/default_soul.py` passes.
- The engine starts in WSL2.
- A simple legal prompt follows the Lex SOUL and legal brief workflow.

## Phase 2: Bridge Stub

Goal: let Hermes call the Lex app without touching PJe directly.

Tasks:

1. Add a local bridge server to the Lex Electron app.
2. Implement `GET /health`.
3. Implement `POST /tools/list`.
4. Implement `POST /tools/call` with stub responses.
5. Add token auth and audit logging.
6. Add one real safe tool, likely `documento.analisar` or `pje.status`.

Exit criteria:

- Engine can call the bridge and receive structured results.
- Irreversible actions return `requires_confirmation`.

## Phase 3: First Real Legal Workflow

Goal: make one end-to-end workflow useful.

Recommended first workflow:

```text
User asks:
  "Analise este caso e monte um plano de peticao."

Engine:
  uses Lex SOUL + lex-legal-brief
  asks for missing facts
  calls documento/analisar if a file is provided
  returns argument map + evidence checklist + draft structure
```

Why this first:

- No PJe certificate.
- No irreversible action.
- Useful to lawyers quickly.
- Tests legal reasoning, document flow, and product tone.

## Current Workflow Split

Inline chat/Console can use multiagents and tools for one conversational mission.
Agora is used when the task needs durable workflow state: many processes, many
petitions, checkpoints, audit trail, dependencies, or restart/resume.

## Phase 4: PJe Read-Only

Goal: safely consult PJe through Windows.

Allowed first tools:

- `pje.status`
- `pje.abrir_processo`
- `pje.consultar_processo`
- `pje.baixar_documentos`

Do not implement filing/protocol before read-only flows are reliable.

## Phase 5: Commercial Packaging

Goal: make the fork sellable.

Tasks:

1. Decide final Lex license/EULA.
2. Keep `THIRD-PARTY-NOTICES.md` in the product.
3. Add Windows/WSL2 bootstrapper.
4. Add health checks and repair actions.
5. Add update channel pinned to Lex releases, not upstream `main`.
6. Run dependency/license audit.

## Open Risks

- WSL2 installation friction for non-technical users.
- PJe/certificate instability.
- License audit of all Python/npm dependencies.
- Product liability around legal deadlines and generated documents.
- Keeping upstream updates without overwriting Lex-specific behavior.
