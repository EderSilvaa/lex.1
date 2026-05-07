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

Controlled copy, not runtime integration.

The Lex Desktop still uses the existing WSL fallback at `/home/eder/lex_engine`
until a later step explicitly changes `LEX_ENGINE_MODE`.

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

1. Verify no secrets were imported.
2. Run Desktop build.
3. Confirm app still starts using the external WSL Engine.
4. Add scripts/status that can distinguish external Engine from repo Engine.

