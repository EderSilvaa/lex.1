# Auditoria de Legado e Sobreposicao Lex/Hermes

Status: 2026-05-13.

Objetivo: mapear onde o codigo herdado do Lex antigo ainda esta misturado com o
Hermes/Lex Engine, para reduzir confusao de arquitetura sem apagar compatibilidade
que ainda pode estar sustentando o MVP.

## Resumo executivo

A intuicao esta correta: ainda temos bastante coisa legada viva. O problema nao e
apenas existir codigo antigo no repositorio. O ponto mais delicado e que alguns
caminhos antigos ainda estao expostos por UI, preload e IPC, entao o produto pode
alternar entre dois modelos mentais:

```text
Caminho novo:
Usuario -> Console/Desktop -> Lex Engine/Hermes -> MCP/HTTP -> Desktop/PJe/Windows

Caminho antigo:
Usuario -> Renderer -> Electron agent loop TS -> skills locais -> PJe/Windows
```

Isso cria a sensacao de "dois cerebros". A direcao ja esta escrita em
`docs/CURRENT-ARCHITECTURE.md`: o Engine/Hermes deve ser o cerebro; o Desktop deve
executar acoes locais, supervisionar, pedir confirmacao e registrar auditoria.

## Achados principais

| Area | O que encontrei | Risco pratico | Direcao recomendada |
|---|---|---|---|
| Agent Loop TS | `electron/agent/*` ainda registra skills, roda think/critic/loop, memoria, planner e orchestrator. `electron/main.ts` ainda chama `runAgentLoop()` em fallback. | Alto. Mantem um cerebro paralelo ao Hermes. | Congelar como compatibilidade. Nao adicionar novas capacidades de raciocinio aqui. |
| Renderer chat | `src/renderer/js/app.js` tem `USE_AGENT_LOOP = true`, roteamento automatico, fallback `sendChat`, `executePlan` e funcoes `legacy*`. | Alto. A UI ainda consegue cair em caminhos antigos sem ficar obvio para produto. | Declarar um unico caminho canonico de chat/console. Colocar fallback atras de flag tecnica ou remover da UI principal. |
| Planner/Orchestrator TS | `ai-plan-execute`, checkpoints e scheduler Electron ainda usam `electron/agent/orchestrator`. | Alto. Compete com Hermes `delegate_task`, `todo`, `kanban` e `cron`. | Manter apenas para planos antigos/checkpoints existentes. Novos workflows devem ir para Hermes/Kanban/Agora. |
| Scheduler Electron | `electron/scheduler/job-runner.ts` executa goals via `Orchestrator` TS. Hermes tambem tem `cron/` e `tools/cronjob_tools.py`. | Alto. Duas agendas podem prometer autonomia 24/7 de formas diferentes. | Escolher fonte de verdade: Hermes cron para raciocinio e jobs; Electron apenas tray/auto-launch/ponte local. |
| Batch/Lotes | `electron/batch/*`, `batchApi` e IPC `batch-*` continuam expostos. Docs dizem que Lotes nao deve guiar a arquitetura nova. | Alto. Pode puxar produto para pipeline antigo em vez de Agora/Hermes. | Congelar como legado. Migrar conceitos uteis para Agora/Hermes antes de remover. |
| PJe skills | `electron/skills/pje/index.ts` isola `pje_browser_use` como caminho atual e marca Playwright antigo como fallback. | Medio. A separacao esta boa, mas ainda existe modo legado se MCP browser-use nao estiver configurado. | Manter fallback por enquanto, mas documentar que PJe canonico e MCP/browser-use + Desktop supervisionado. |
| MCP | Electron le `~/.lex/mcp.json`; Hermes usa config propria com `mcp_servers`. | Medio. Duas configuracoes confundem usuario e dev. | Definir um "painel MCP Lex" que gere/sincronize os dois formatos quando necessario. |
| Plugins | Electron registra 22 plugins built-in com OAuth/skills. Hermes tambem tem plugins/skills/toolsets. | Medio. Pode haver duplicacao entre "plugin do produto" e "tool do Engine". | Electron deve cuidar de auth/native UI; Hermes deve consumir capacidade via contrato/tool. |
| Memoria | `electron/agent/memory.ts`, Brain, doc-index/RAG e memoria do Hermes coexistem. O loop salva em "legacy + brain". | Medio. Risco de respostas diferentes dependendo do caminho usado. | Separar papeis: Hermes memoria de agente; Brain memoria operacional; RAG documentos; skills procedimentos. |
| Provider/BYOK | Electron ainda tem provider config e aliases legados no preload. Engine tambem tem provider/model config. | Baixo/medio. Necessario durante transicao, mas confunde fonte de verdade. | Desktop pode armazenar/UX de chave; Engine deve receber config ativa e executar. |

## Evidencias no codigo

- `docs/CURRENT-ARCHITECTURE.md` define o principio: Desktop nao deve virar outro cerebro; Engine/Hermes e fonte de raciocinio, planejamento, tools, multiagentes, memoria do agente e scheduler.
- `src/renderer/js/app.js` ainda usa `window.lexApi.runAgent`, `window.lexApi.sendChat`, `window.lexApi.executePlan` e varios caminhos `legacy*`.
- `electron/preload.ts` ainda expoe `sendChat`, `executePlan`, `runAgent`, `schedulerApi`, `pluginsApi`, `agoraApi` e `batchApi` lado a lado.
- `electron/main.ts` ainda tem handlers `agent-run`, `ai-plan-execute`, `scheduler-*` e `batch-*`.
- `electron/scheduler/job-runner.ts` executa jobs via `../agent/orchestrator`, nao via Hermes cron.
- `electron/skills/pje/index.ts` ja tem uma boa separacao: `pje_browser_use` como caminho MCP atual e Playwright antigo como fallback de compatibilidade.
- `electron/agent/loop.ts` salva interacao em memoria legada e Brain ao mesmo tempo.
- `electron/mcp-manager.ts` usa `~/.lex/mcp.json`, enquanto o Hermes tem configuracao propria de `mcp_servers`.
- `electron/plugins/index.ts` inicializa 22 plugins built-in no boot do Electron.

## O que nao devemos apagar ainda

Algumas partes antigas ainda parecem servir como amortecedor de MVP:

- Fallback PJe Playwright, caso MCP/browser-use nao esteja configurado ou falhe.
- Agent Loop local, caso o backend/Engine nao suba em alguma maquina.
- IPCs de batch/lotes, se ainda houver tela ou fluxo antigo usado em validacao interna.
- Provider/BYOK Electron, enquanto o Desktop for a UX principal de configuracao.
- Brain local, porque ele e memoria operacional/auditoria do Desktop, nao apenas legado.

A limpeza certa aqui nao e "deletar tudo antigo". E transformar legado vivo em
compatibilidade explicita, com flags, nomes e fronteiras claras.

## Modelo mental recomendado

```text
Hermes/Lex Engine
  - pensa
  - planeja
  - usa subagentes
  - agenda jobs inteligentes
  - cria/usa skills
  - conversa com MCPs

Lex Desktop/Electron
  - mostra UI
  - segura certificado/sessao PJe
  - executa acoes locais
  - pede confirmacao humana
  - guarda Brain/auditoria operacional
  - oferece ponte MCP/HTTP local para o Engine

Legado Electron Agent
  - nao cresce
  - so entra como fallback
  - deve ficar invisivel para o advogado
```

## Ordem segura de limpeza

1. Nomear oficialmente os caminhos no codigo: `canonical`, `compatibility` e `deprecated`. Hoje alguns caminhos dizem "legacy", mas ainda estao misturados na UI.
2. Colocar o fallback `sendChat/executePlan` atras de uma feature flag tecnica e registrar quando ele for usado.
3. Separar a API publica do preload em duas camadas: APIs de produto e APIs de compatibilidade. `batchApi` e `checkpointApi` nao deveriam parecer do mesmo nivel que `lexEngineApi` e `agoraApi`.
4. Trocar o scheduler Electron para modo ponte: ele pode acordar o app, mostrar notificacao e chamar Hermes cron/job, mas nao deveria planejar via Orchestrator TS.
5. Congelar `electron/agent/orchestrator`, `planner`, `agent-pool` e `checkpoint-store` como legado. Qualquer trabalho novo de multiagente vai para Hermes.
6. Consolidar PJe no caminho MCP/browser-use. O fallback Playwright fica, mas nao deve ser anunciado como arquitetura principal.
7. Definir uma politica unica de memoria: Hermes para memoria conversacional/agente; Brain para fatos operacionais/auditoria; RAG para documentos; skill para procedimento reutilizavel.
8. Reclassificar plugins Electron: eles sao "conectores de produto/auth", nao o cerebro. O Engine deve consumir as capacidades por contrato.
9. Migrar Lotes para Agora/Hermes apenas quando houver substituto claro. Antes disso, esconder de produto novo e manter como compatibilidade.

## Decisoes que faltam

- O chat principal deve chamar sempre `lexEngineApi.ask`/gateway Hermes, ou ainda precisa passar por `lexApi.runAgent` no curto prazo?
- O scheduler 24/7 do MVP sera Electron local com fallback, Hermes cron, ou um hibrido temporario?
- O painel de plugins deve configurar conectores do Desktop, tools do Hermes, ou ambos com uma unica UX?
- A memoria que o advogado enxerga como "Lex lembra disso" vai escrever em Brain, RAG, skill, Hermes memory, ou numa camada de produto que roteia para todos?

## Conclusao

O repositorio esta em transicao real: Hermes foi herdado/importado, mas o Lex
antigo ainda nao virou apenas "adaptador local". O maior risco e produto/dev
tratarem caminhos legados como se fossem equivalentes ao caminho novo.

Regra simples para daqui para frente:

```text
Se a feature pensa, planeja, agenda ou coordena agentes: Engine/Hermes.
Se a feature toca Windows, PJe, certificado, arquivo local, UI ou auditoria: Desktop.
Se esta em electron/agent e nao e ponte local: provavelmente e legado.
```
