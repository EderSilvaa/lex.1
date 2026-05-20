# Mapa de Integracao Nous/Hermes Kanban

Atualizado em 2026-05-09.

Este mapa existe para evitar recriar do zero o workflow multiagente da Agora.
A fonte tecnica do Kanban deve ser a atualizacao oficial da Nous/Hermes,
tag `v2026.5.7` / release `v0.13.0`, em vez da tool artesanal `agora`
criada como ponte transicional.

## Decisao

Agora nao e um segundo orquestrador.

Agora e a superficie Lex para o Kanban duravel do Hermes:

```text
Chat/Console inline -> multiagentes conversacionais do Engine
Agora -> Kanban duravel oficial do Hermes, com cards, workers, DB, eventos
Desktop -> supervisao, PJe, Windows, Brain, auditoria e confirmacoes
```

O criterio nao e "tarefa simples vs tarefa complexa". O chat inline tambem
pode usar subagentes. O criterio para Agora e durabilidade:

- volume grande;
- varias etapas;
- dependencias entre tarefas;
- risco juridico/operacional;
- necessidade de pausa, retomada, auditoria e HITL;
- execucao por varios perfis/workers.

Exemplos de Agora:

- analisar uma pasta PJe com dezenas de processos;
- produzir e revisar muitas peticoes;
- preparar/protocolar tarefas com checkpoints humanos;
- acompanhar workflow por cards e eventos.

Exemplos de chat inline:

- analisar um processo isolado;
- buscar jurisprudencia em paralelo;
- gerar uma minuta unica;
- usar um subagente durante a conversa e fechar a resposta na mesma sessao.

## Estado Atual da Lex

Ja foi feito antes deste mapa:

- `Lotes` saiu da superficie de produto;
- aba `Agora` entrou no renderer;
- `electron/agora/*` mantem um board JSON local;
- `engine/lex-engine/tools/agora_tool.py` expoe `agora`;
- `toolsets.py` inclui `agora`;
- commit e push realizados em `5155ce6e feat: replace Lotes with Agora workflow surface`.

Esse estado e bom como direcao de produto, mas nao como arquitetura final do
workflow. A parte JSON/tool `agora` e transicional e deve ser substituida ou
adaptada para o Kanban oficial.

Atualizacao posterior: o IPC da Agora passou a usar
`electron/agora/kanban-bridge.ts`, que chama `hermes_cli/kanban_db.py` e grava
no `kanban.db` oficial sob `HERMES_KANBAN_HOME`. O JSON/tool `agora` ficou como
fallback de compatibilidade ate a limpeza final.

Atualizacao posterior 2: o Electron ganhou um dispatcher leve que chama
`kanban_db.dispatch_once()` no startup e em intervalo. Por seguranca, spawn de
workers automaticos fica atras de `LEX_AGORA_ENABLE_WORKERS=1`; sem essa flag,
o dispatcher promove/reclama tarefas, mas nao inicia subprocessos.

## Fonte Upstream Verificada

Snapshot local usado para o inventario:

```text
C:\tmp\hermes-agent-v2026.5.7
```

Tag upstream:

```text
NousResearch/hermes-agent v2026.5.7
release v0.13.0
```

Pecas oficiais encontradas:

| Area | Arquivos upstream | Papel |
| --- | --- | --- |
| Core DB | `hermes_cli/kanban_db.py` | SQLite, status, dependencias, claims, runs, eventos, boards, dispatcher |
| CLI | `hermes_cli/kanban.py` | `hermes kanban ...` e handler `/kanban` compartilhado |
| Tools | `tools/kanban_tools.py` | `kanban_show`, `kanban_complete`, `kanban_block`, `kanban_heartbeat`, `kanban_comment`, `kanban_create`, `kanban_link` |
| Toolsets | `toolsets.py` | inclui tools `kanban_*` no core com check_fn para nao poluir schema fora do worker |
| Main CLI | `hermes_cli/main.py` | subcomando `kanban` e pin de `HERMES_KANBAN_BOARD` |
| Config | `hermes_cli/config.py` | secao `kanban.dispatch_in_gateway`, intervalo e `failure_limit` |
| Gateway | `gateway/run.py` | dispatcher embutido, watcher de notificacao e `/kanban` em plataformas |
| Dashboard | `plugins/kanban/dashboard/*` | API FastAPI, WebSocket de eventos e UI Kanban oficial |
| Skills | `skills/devops/kanban-orchestrator`, `skills/devops/kanban-worker` | instrucoes oficiais de orquestrador/worker |
| Tests | `tests/hermes_cli/test_kanban_*`, `tests/tools/test_kanban_tools.py`, `tests/plugins/test_kanban_dashboard_plugin.py` | suite oficial para validar importacao |

## O Que Existe ou Falta no Engine Atual

Existe:

- `hermes_constants.get_default_hermes_root()`, necessario para o Kanban;
- `hermes_cli/config.py` ja tem conceitos de config, mas ainda sem secao
  `kanban`;
- `toolsets.py` ja tem `delegate_task` e `todo`;
- dependencias web (`fastapi`, `uvicorn`) ja existem em extras;
- API/plugin infra do Hermes ja esta no vendor.

Falta importar:

- `engine/lex-engine/hermes_cli/kanban.py`;
- `engine/lex-engine/hermes_cli/kanban_db.py`;
- `engine/lex-engine/hermes_cli/kanban_diagnostics.py`;
- `engine/lex-engine/tools/kanban_tools.py`;
- `engine/lex-engine/plugins/kanban/dashboard/*`;
- `engine/lex-engine/skills/devops/kanban-orchestrator/SKILL.md`;
- `engine/lex-engine/skills/devops/kanban-worker/SKILL.md`;
- testes Kanban upstream relevantes.

Falta adaptar:

- `engine/lex-engine/toolsets.py`;
- `engine/lex-engine/hermes_cli/main.py`;
- `engine/lex-engine/cli.py`;
- `engine/lex-engine/hermes_cli/config.py`;
- `engine/lex-engine/gateway/run.py`;
- renderer Agora para ler Kanban oficial em vez de board JSON.

## Modelo Oficial Que Deve Guiar a Agora

O Kanban upstream usa status:

```text
triage -> todo -> ready -> running -> blocked -> done -> archived
```

Mapeamento recomendado para a UI Lex:

| Kanban Hermes | Agora Lex | Observacao |
| --- | --- | --- |
| `triage` | Entrada | demanda ainda crua |
| `todo` | Especificacao | card aceito, mas ainda nao pronto |
| `ready` | Pronto para execucao | dependencias liberadas |
| `running` | Execucao | worker/assignee ativo |
| `blocked` | Revisao / HITL | precisa de decisao humana, erro, risco ou documento |
| `done` | Pronto | concluido e auditavel |
| `archived` | Arquivo | fora do board principal |

Recomendacao: Agora deve aceitar as seis colunas visiveis oficiais
(`triage`, `todo`, `ready`, `running`, `blocked`, `done`) em vez de comprimir
`ready` dentro de `execucao`. Isso preserva o dispatcher upstream sem
traducao perigosa.

## Plano de Integracao

### Fase 0: Guardrail de Importacao

Objetivo: congelar o estado Lex antes de puxar o Kanban.

- Manter `origin/main` com o commit `5155ce6e` como rollback.
- Nao sobrescrever a pasta inteira `engine/lex-engine` as cegas.
- Importar o subsistema oficial em fatias verificaveis.
- Preservar branding Lex e patches ja feitos no Engine.

### Fase 1: Core Kanban Sem UI

Objetivo: fazer o banco e CLI oficial funcionarem dentro do Engine.

Importar:

- `hermes_cli/kanban_db.py`;
- `hermes_cli/kanban.py`;
- `hermes_cli/kanban_diagnostics.py`;
- testes `tests/hermes_cli/test_kanban_*`.

Adaptar:

- `hermes_cli/main.py`: registrar subcomando `kanban`;
- `hermes_cli/config.py`: incluir secao `kanban`;
- startup CLI: pin de `HERMES_KANBAN_BOARD` quando aplicavel.

Validar:

```text
python -m hermes_cli.main kanban init
python -m hermes_cli.main kanban create "teste Agora"
python -m hermes_cli.main kanban list --json
pytest tests/hermes_cli/test_kanban_db.py tests/hermes_cli/test_kanban_cli.py
```

### Fase 2: Tools de Worker

Objetivo: permitir que agentes oficialmente criados pelo dispatcher manipulem
seu proprio card.

Importar:

- `tools/kanban_tools.py`;
- `tests/tools/test_kanban_tools.py`.

Adaptar:

- `toolsets.py`: remover `agora` do core final e adicionar `kanban_*`;
- manter check_fn upstream: tool aparece quando `HERMES_KANBAN_TASK` existe ou
  quando o perfil habilita explicitamente o toolset `kanban`;
- decidir se `agora` vira alias/adapter para comandos Kanban ou se e removida
  apos migracao.

Validar:

```text
pytest tests/tools/test_kanban_tools.py tests/test_toolsets.py
```

### Fase 3: Dispatcher

Objetivo: cards `ready` virarem workers reais.

Opcoes:

1. Curta: usar `hermes kanban daemon --force` como processo separado durante o
   MVP.
2. Correta: portar o dispatcher embutido do `gateway/run.py` upstream.

Recomendacao: comecar pela opcao curta para validar workflow local. Depois
portar o dispatcher embutido no gateway, porque e o modelo oficial da release.

Pontos que precisam entrar do upstream:

- `_kanban_dispatcher_watcher`;
- `_kanban_notifier_watcher`;
- `_handle_kanban_command`;
- bypass de `/kanban` quando ha agent ativo;
- config `kanban.dispatch_in_gateway`;
- env vars `HERMES_KANBAN_TASK`, `HERMES_KANBAN_RUN_ID`,
  `HERMES_KANBAN_BOARD`, `HERMES_KANBAN_DB`,
  `HERMES_KANBAN_WORKSPACES_ROOT`.

Validar:

```text
hermes kanban create "worker smoke" --assignee <profile>
hermes kanban dispatch --json
hermes kanban runs <task_id>
hermes kanban show <task_id> --json
```

### Fase 4: Agora Sobre Kanban Oficial

Objetivo: trocar a fonte de dados da UI.

Antes:

```text
Electron Agora -> board JSON -> engine agora_tool.py
```

Agora:

```text
Electron Agora -> kanban-bridge.ts -> hermes_cli/kanban_db.py -> kanban.db
```

Destino final:

```text
Electron Agora -> Kanban DB/API oficial -> kanban_* / hermes kanban
```

Implementacao recomendada:

- manter UI `src/renderer/js/agora.js` e CSS;
- trocar IPC `agoraApi` para consultar o Kanban oficial;
- primeira versao chama o `kanban_db.py` oficial via ponte Python local;
- versao posterior pode falar com `plugins/kanban/dashboard/plugin_api.py`
  ou com endpoint local dedicado;
- watcher deve observar `task_events`, nao arquivo JSON.

### Fase 5: Dashboard Oficial

Objetivo: reaproveitar API e WebSocket upstream sem prender a UX da Lex ao
visual default da Nous.

Importar:

- `plugins/kanban/dashboard/plugin_api.py`;
- `plugins/kanban/dashboard/manifest.json`;
- `plugins/kanban/dashboard/dist/*`;
- `tests/plugins/test_kanban_dashboard_plugin.py`.

Uso Lex:

- API oficial como backend;
- UI Lex continua propria;
- WebSocket de eventos alimenta cards e timeline da Agora.

### Fase 6: Remocao da Ponte JSON

Objetivo: encerrar a duplicacao.

Remover ou congelar como compat:

- `electron/agora/*` baseado em JSON;
- `engine/lex-engine/tools/agora_tool.py`;
- `LEX_AGORA_BOARD_PATH`;
- toolset `agora`;
- docs que tratam Agora como board JSON.

Manter:

- nome de produto `Agora`;
- nav/UI Lex;
- contrato de supervisao Desktop;
- auditoria PJe/Brain/HITL.

## Riscos Tecnicos

| Risco | Por que importa | Mitigacao |
| --- | --- | --- |
| Drift grande em `cli.py` e `gateway/run.py` | upstream mexeu em milhares de linhas | importar core primeiro, gateway depois |
| `engine/lex-engine` nao e submodule Git | nao da para `git pull` dentro dele | usar snapshot upstream e patches pequenos |
| Tool `agora` atual duplica Kanban | pode criar dois estados de workflow | marcar como transicional e migrar |
| Dispatcher pode spawnar workers demais | tarefas juridicas podem custar caro/ter risco | limitar perfis, concorrencia e exigir HITL para PJe |
| Board global vs perfil | Kanban upstream compartilha board entre perfis | pin de `HERMES_KANBAN_BOARD` e board por cliente/caso quando necessario |
| PJe/Windows nao devem ir para Hermes puro | certificado, browser e arquivos ficam no Desktop | workers chamam Desktop via MCP/HTTP, com confirmacao |

## Ordem Recomendada de Execucao

1. Copiar core oficial (`kanban_db.py`, `kanban.py`, `kanban_diagnostics.py`).
2. Registrar comando `hermes kanban`.
3. Rodar testes oficiais de DB/CLI.
4. Copiar `kanban_tools.py` e ajustar `toolsets.py`.
5. Rodar testes de tools/toolsets.
6. Fazer smoke manual com board e task.
7. Decidir dispatcher curto: `daemon --force` ou gateway embutido.
8. Validar spawn automatico com `LEX_AGORA_ENABLE_WORKERS=1` e perfil
   `default`/especialista.
9. Trocar o dispatcher leve pelo gateway embutido completo, se necessario.
10. Remover JSON/tool `agora`.
11. Commit separado por fase.

## Resultado Esperado

Depois da integracao, a frase correta da arquitetura vira:

```text
Agora e a interface Lex do Kanban oficial da Nous/Hermes.
O estado duravel mora no SQLite Kanban do Engine.
Workers usam kanban_*.
Desktop supervisiona PJe, arquivos, Brain e atos sensiveis.
```
