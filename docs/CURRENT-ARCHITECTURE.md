# Arquitetura Atual da Lex

Atualizado em 2026-05-09.

Este documento e a fonte rapida de verdade para a arquitetura atual. Os planos em
`docs/future-tasks/` preservam historico de decisao, mas devem ser lidos a partir
deste estado.

## Principio Central

```text
Lex Desktop = produto Windows, supervisao humana, PJe, arquivos, Brain e UI
Lex Engine/Hermes = motor de raciocinio, chat inline, multiagentes e workflows
MCP/HTTP local = contrato entre Engine e Desktop
Agora = superficie de workflows duraveis e complexos
Console Lex = interface operacional/power user do Engine
```

O Electron nao deve virar outro cerebro. O Engine/Hermes e a fonte de
raciocinio, planejamento, uso de tools, multiagentes, memoria do agente e
scheduler. O Desktop executa as acoes Windows/PJe, exibe estado, pede
confirmacao e registra auditoria.

## Runtime do Engine

O Engine foi importado para o monorepo em:

```text
C:\Users\EDER\lex-test1\engine\lex-engine
```

O runtime padrao atual e:

```text
LEX_ENGINE_MODE=repo-wsl
/mnt/c/Users/EDER/lex-test1/engine/lex-engine
```

O fallback preservado e:

```text
LEX_ENGINE_MODE=external-wsl
/home/eder/lex_engine
```

Detalhe transicional: `repo-wsl` ainda usa o Python/venv saudavel do fallback
(`/home/eder/lex_engine/venv/bin/python`) para executar o launcher do Engine
importado. Isso evita reinstalar dependencias durante esta etapa.

## Chat Inline vs Agora

A diferenca nao e "simples vs multiagente". O chat inline tambem pode usar
planner, subagentes, pesquisa, PJe, documentos e ferramentas em paralelo.

Use chat inline quando o trabalho cabe numa execucao conversacional:

- analisar um processo;
- buscar jurisprudencia em paralelo;
- consultar um processo;
- resumir um documento;
- gerar uma minuta isolada;
- responder com resultado final na mesma sessao.

Use Agora quando o trabalho vira operacao duravel:

- analisar uma pasta PJe com dezenas de processos;
- produzir muitas peticoes;
- preparar/protocolar um lote com checkpoints humanos;
- coordenar varias etapas com dependencias;
- retomar depois de pausa/restart;
- acompanhar progresso, eventos e comentarios por card/workflow.

## Agora

Agora e o quadro de workflow duravel do Hermes/Lex Engine.

Regra critica: nao reconstruir o sistema de multiagentes/workflow do zero. A
base vem da atualizacao Nous/Hermes importada:

- `tools/delegate_tool.py` para subagentes, execucao paralela, arvore de spawn,
  limites de concorrencia, interrupcao e eventos de progresso;
- `tools/todo_tool.py` para planejamento e estado de tarefas dentro da sessao;
- `cron/` e `tools/cronjob_tools.py` para rotinas/agendamentos;
- `tools/approval.py` e callbacks do gateway/TUI para aprovacoes e comandos
  sensiveis;
- eventos `subagent.*`, `tool.*`, `approval.*` e historico de spawn ja usados
  pela TUI Hermes.

O papel da Agora e adaptar essa fundacao para o produto Lex: cards, timeline,
checkpoints humanos, retomada visual e auditoria juridica. Ela deve consumir e
espelhar o estado/eventos do Engine, nao competir com `delegate_task`, `todo`,
cron ou o gateway da Nous.

Estado atual:

- UI dedicada em `src/renderer/js/agora.js` e `src/renderer/styles/agora.css`;
- nav `nav-agora`;
- IPC `window.agoraApi`;
- board compartilhado via `LEX_AGORA_BOARD_PATH`;
- tool Python `agora` no Engine para `list/show/create/update/move/comment/remove`;
- watcher no Electron emite `agora-event` quando o board muda.

Decisao importante: Agora nao e mais uma skin sobre Lotes. A superficie antiga
de Lotes saiu do renderer da Agora. O backend batch antigo pode permanecer como
codigo historico ate uma limpeza dedicada, mas nao deve guiar a arquitetura nova.

## Contrato Engine/Desktop

O caminho padrao e:

```text
Usuario -> Desktop/Console/Chat -> Lex Engine -> tool/MCP -> Desktop -> Windows/PJe/Arquivo
```

Regras:

- Engine planeja e pede acoes.
- Desktop decide se a acao pode acontecer.
- PJe, certificado, Chrome controlado, file picker e confirmacoes ficam no
  Desktop.
- Acoes sensiveis exigem confirmacao visual no Desktop.
- Brain registra observacoes, sucesso/falha, seletores e know-how operacional.

## O Que E Legado

Legado ou transicional:

- `electron/agent/*` como cerebro principal;
- provider/BYOK duplicado no Electron como fonte de verdade;
- scheduler generico duplicado no Electron;
- Lotes como superficie de produto;
- agent loop TS competindo com Hermes.

Ainda pode existir codigo legado no repo. A regra e nao expandir esse caminho:
novas capacidades de raciocinio/workflow devem ir para o Engine/Hermes e ser
expostas ao Desktop por contrato.
