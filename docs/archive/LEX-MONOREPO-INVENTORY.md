# Lex Monorepo Inventory - Sprint 1

Data: 2026-05-07

Atualizacao em 2026-05-09:

- `repo-wsl` e o runtime padrao do Desktop.
- `external-wsl` segue preservado como rollback.
- Agora substituiu a superficie de Lotes no renderer e deve representar
  workflows duraveis do Hermes/Lex Engine.
- Lotes/batch antigo nao deve ser usado como arquitetura nova; fica apenas como
  codigo legado ate limpeza/migracao dedicada.

## Repositorios e pastas

```text
Produto/Desktop canonico:
C:\Users\EDER\lex-test1

Engine fonte para importacao:
C:\Users\EDER\lex_engine

Engine runtime/fallback:
/home/eder/lex_engine
```

## Decisao operacional

Nesta sprint, o IDE deve ficar aberto em `C:\Users\EDER\lex-test1`.

`C:\Users\EDER\lex_engine` sera usado como fonte de importacao controlada.
`/home/eder/lex_engine` continuara sendo o runtime atual do Console Lex ate
validacao posterior.

## Estado do Desktop

Modulos principais identificados:

| Modulo | Pasta/arquivo | Papel | Decisao inicial |
| --- | --- | --- | --- |
| Electron main/preload | `electron/`, `dist-electron/` | App Windows, IPC, bridge e backend | manter |
| Renderer | `src/renderer/` | UI Lex Desktop | manter |
| PJe/browser | `electron/pje`, `electron/browser*` | Execucao Windows/PJe | manter no Desktop |
| Bridge/MCP | `electron/lex-desktop-bridge.ts`, `scripts/*mcp*` | Contrato Engine -> Desktop | manter no Desktop |
| Terminal/Console | `electron/terminal`, `src/renderer/js/terminal.js` | Interface operacional atual | manter |
| Brain TS | `electron/brain`, `src/renderer/js/brain.js` | Memoria operacional/observacao | manter, revisar papel depois |
| Arquivos/docs | `electron/files*`, `src/renderer/js/file-manager.js` | Entrada/saida documental | manter |
| Configuracoes/licenca | `electron/auth`, `electron/store*`, settings UI | Produto comercial | manter |
| Agente antigo Electron | `electron/agent` | Loop/planner/skills legado | nao expandir; Hermes e o cerebro |
| Agora | `electron/agora`, `src/renderer/js/agora.js`, `src/renderer/styles/agora.css` | Workflows duraveis supervisionados | manter como superficie de trabalho complexo |

## Estado do Engine

Fonte Windows `C:\Users\EDER\lex_engine` contem:

| Modulo | Papel | Importar? | Observacao |
| --- | --- | --- | --- |
| `agent/` | raciocinio/adapters/modelos | sim | nucleo do Engine |
| `hermes_cli/` | CLI/setup/banner/status | sim | Console Lex depende disso |
| `skills/` | skills empacotadas | sim | preservar estrutura |
| `optional-skills/` | skills opcionais | sim | revisar peso depois |
| `tools/` | ferramentas internas | sim | usadas por toolsets |
| `gateway/` | canais Telegram/Discord/etc | sim | futuro produto/canais |
| `cron/` | tarefas agendadas | sim | futuro scheduler |
| `plugins/` | plugins memoria/google/etc | sim | preservar por enquanto |
| `ui-tui/`, `web/`, `website/` | UI TUI/web upstream | sim por enquanto | pode virar legado depois |
| `lex/` | docs/politicas Lex adicionadas | sim | importante preservar know-how |
| `.github/`, `docker/`, `nix/`, `packaging/` | build/infra upstream | sim | revisar depois |
| `tests/` | testes upstream | sim | manter para seguranca |

## O que nao importar

Exclusoes obrigatorias:

- `.git/`;
- `.claude/`;
- `venv/`;
- `.venv/`;
- `__pycache__/`;
- `hermes_agent.egg-info/`;
- `node_modules/`;
- logs;
- caches;
- `.env`;
- `.env.local`;
- `cli-config.yaml`;
- `data/`;
- `tmp/`;
- `temp_vision_images/`;
- `wandb/`;
- `testlogs/`;
- `ignored/`;
- `.worktrees/`;
- builds gerados como `hermes_cli/web_dist/`;
- assets gerados como `web/public/fonts/` e `web/public/ds-assets/`.

## Riscos

- O Engine tem muitas modificacoes locais nao commitadas na origem.
- A copia Windows tem docs Lex em `lex/` que nao apareceram no status WSL.
- Importar tudo sem filtro pode trazer ambiente local ou dados sensiveis.
- Apontar o Desktop para o Engine importado cedo demais pode quebrar o Console.

## Medidas de seguranca

- Importar para `engine/lex-engine/` sem mudar runtime.
- Manter `external-wsl` como fallback.
- Criar manifesto de importacao.
- Rodar build do Desktop apos a copia.
- Antes de integrar, comparar status do Engine importado com a fonte.

## Validacao executada

Data: 2026-05-07

```text
npm run build
npm run engine:status
npm run product:doctor
npm run mcp:test
```

Resultado:

- build do Desktop passou;
- `engine:status` mostrou repo engine importado, fallback Windows, fallback WSL
  e comando `hermes` todos OK;
- `product:doctor` terminou com `0 error(s), 0 warning(s)`;
- bridge local respondeu em `http://127.0.0.1:32179`;
- runtime continua apontando para `/home/eder/lex_engine`.
- `mcp:test` conectou no `lex-desktop` e descobriu 17 tools.

## Engine source no Desktop

Data: 2026-05-07

O status do Desktop passou a expor:

```text
engineMode: external-wsl
engineSource: external-wsl
engineRuntimePath: /home/eder/lex_engine
repoEnginePath: C:\Users\EDER\lex-test1\engine\lex-engine
repoEnginePathExists: true
```

O painel do Console Lex agora pode mostrar:

- fonte do Engine;
- Engine importado no repo;
- runtime WSL atual;
- fallback externo preservado.

## LEX_ENGINE_MODE

Data: 2026-05-07

O Desktop agora resolve a fonte ativa do Engine por configuracao:

```text
external-wsl -> /home/eder/lex_engine
repo-wsl     -> /mnt/c/Users/EDER/lex-test1/engine/lex-engine
repo-windows -> modo declarado, mas bloqueado como runtime nesta sprint
```

Padrao preservado:

```text
LEX_ENGINE_MODE=external-wsl
```

Validacao executada:

```text
npm run build
npm run engine:status
$env:LEX_ENGINE_MODE='repo-wsl'; npm run engine:status; Remove-Item Env:LEX_ENGINE_MODE
npm run product:doctor
$env:LEX_ENGINE_MODE='repo-wsl'; npm run product:doctor; Remove-Item Env:LEX_ENGINE_MODE
npm run mcp:test
```

Resultado:

- modo padrao segue usando `/home/eder/lex_engine`;
- `repo-wsl` encontra o Engine importado em `engine/lex-engine` via `/mnt/c/...`;
- `repo-windows` retorna erro explicativo em vez de fallback silencioso;
- bridge reiniciada e saudavel em `http://127.0.0.1:32179`;
- MCP `lex-desktop` segue conectando e expondo 17 tools.

## Migracao para repo-wsl

Data: 2026-05-07

`repo-wsl` passou a ser o padrao do Desktop e dos scripts raiz.

Padrao atual:

```text
repo-wsl -> /mnt/c/Users/EDER/lex-test1/engine/lex-engine
```

Fallback:

```text
LEX_ENGINE_MODE=external-wsl -> /home/eder/lex_engine
```

Detalhe transicional:

```text
repo-wsl usa /home/eder/lex_engine/venv/bin/python para executar o launcher
hermes do repo importado.
```

Esse arranjo evita reinstalar dependencias agora, mas garante que o projeto
carregado e exibido pelo Engine e:

```text
/mnt/c/Users/EDER/lex-test1/engine/lex-engine
```

Validacoes executadas:

```text
npm run build
npm run engine:status
$env:LEX_ENGINE_MODE='external-wsl'; npm run engine:status; Remove-Item Env:LEX_ENGINE_MODE
npm run product:doctor
npm run mcp:test
GET http://127.0.0.1:32179/health
GET http://127.0.0.1:32179/pje/status
```

Resultado:

- `engine:status` padrao mostra `Active mode: repo-wsl`;
- `Repo launcher` mostra `Project: /mnt/c/Users/EDER/lex-test1/engine/lex-engine`;
- rollback `external-wsl` segue OK;
- Desktop reiniciado sem env manual sobe com `engineSource=repo-wsl`;
- MCP `lex-desktop` conecta e descobre 17 tools;
- `pje_status` respondeu read-only; Chrome/PJe nao estava conectado no momento
  da validacao, entao retornou `connected=false`.
- Console Lex testado manualmente no Desktop em `repo-wsl`:
  - `responda apenas: Lex repo online` retornou `Lex repo online.`;
  - pergunta sobre runtime confirmou Lex Agent Engine em WSL.

Para forcar fallback temporariamente:

```powershell
$env:LEX_ENGINE_MODE='external-wsl'
npm run dev:desktop
```

## Agora e Remocao de Lotes da Superficie

Data: 2026-05-09

A aba antes chamada Lotes foi promovida para Agora:

```text
nav-agora -> .agora-wrapper -> src/renderer/js/agora.js
```

Decisoes:

- a UI da Agora nao chama mais `batchApi`;
- cards `source=batch`/`Legado` nao aparecem mais no quadro;
- `src/renderer/js/lotes.js` e `src/renderer/styles/lotes.css` foram removidos;
- `src/renderer/js/agora.js` e `src/renderer/styles/agora.css` sao a nova
  superficie;
- o board compartilhado com o Engine usa `LEX_AGORA_BOARD_PATH`;
- a tool `agora` do Engine e o contrato para agentes criarem, comentarem e
  moverem cards.

Modelo mental:

```text
Chat/Console inline = execucao conversacional, mesmo com multiagentes
Agora = workflow duravel, massivo, retomavel, auditavel
```
