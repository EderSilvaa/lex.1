# Lex Engine Import Manifest

Import date: 2026-05-07

## Source

```text
Windows source: C:\Users\EDER\lex_engine
WSL runtime fallback: /home/eder/lex_engine
Branch: main
Source commit: f738dabf106256809973dc45b7e9dd48a2ce7fea
Origin: https://github.com/EderSilvaa/lex_engine.git
Upstream: https://github.com/NousResearch/hermes-agent.git
```

## Import target

```text
C:\Users\EDER\lex-test1\engine\lex-engine
```

## Import mode

Controlled copy promoted to repo-backed runtime.

The first import was a safe copy into `engine/lex-engine/` without changing
runtime behavior. After validation, Lex Desktop was switched to `repo-wsl` by
default, so the Console Lex now launches the Engine source from:

```text
/mnt/c/Users/EDER/lex-test1/engine/lex-engine
```

The old WSL runtime remains available only as rollback/fallback:

```text
LEX_ENGINE_MODE=external-wsl -> /home/eder/lex_engine
```

Transitional detail: `repo-wsl` still uses the healthy Python/venv from the
fallback Engine to execute the launcher, avoiding a dependency reinstall during
this sprint.

## Copied

- Engine source code;
- CLI/runtime files;
- skills and optional skills;
- tools/toolsets;
- gateway/channel code;
- cron/scheduler code;
- plugins;
- tests;
- upstream docs/build metadata;
- Lex-specific docs under `lex/`;
- license and third-party notices.

## Excluded

- `.git/`;
- `.claude/`;
- `venv/`;
- `.venv/`;
- `__pycache__/`;
- `hermes_agent.egg-info/`;
- `node_modules/`;
- logs;
- local data/cache folders;
- `.env` and local env variants;
- `cli-config.yaml`;
- pyc/pyo files;
- temp vision images;
- worktrees/ignored local folders;
- generated web assets and web dist.

## Robocopy summary

```text
Directories copied: 506
Files copied: 2672
Bytes copied: ~43.06 MB
Failures: 0
```

## Safety rule

Do not delete or rename `C:\Users\EDER\lex_engine` or `/home/eder/lex_engine`
during Sprint 1.

If any integration step fails, keep or restore:

```text
LEX_ENGINE_MODE=external-wsl
```

## Next steps

1. Keep `external-wsl` working as rollback.
2. Move more durable workflow state into the Engine/Agora contract instead of
   reviving the old Lotes pipeline.
3. Avoid duplicating Hermes orchestration inside Electron; Electron should stay
   as Desktop shell, bridge, PJe executor, and supervision UI.

## Current integration notes

- `LEX_ENGINE_MODE` defaults to `repo-wsl` in Desktop/scripts.
- `electron/lex-engine.ts` resolves the repo Engine and exposes status in the
  Console panel.
- `LEX_AGORA_BOARD_PATH` points both Electron and the Engine to the same Agora
  board JSON.
- The Engine gained the `agora` tool so Hermes agents can create, inspect,
  comment, move, and remove workflow cards.
- The old batch/lote renderer surface is no longer used by Agora.
