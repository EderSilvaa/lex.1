# PJe Universalization Sprint - Agente situado por contexto

> **Atualizacao em 2026-05-12:** esta task nasce do eixo PJe/TJ como proxima
> evolucao estrutural da Lex. O objetivo nao e trocar o aparato atual por mais
> flows fixos, e sim fazer a Lex entender em que ambiente PJe ela esta,
> aprender rotas por contexto e reaproveitar esse know-how com Brain/replay.

**Status:** planejado.  
**Discussao:** 2026-05-12.  
**Contexto relacionado:** [`docs/PJE-SKILLS-APPARATUS.md`](../PJE-SKILLS-APPARATUS.md),
[`docs/BRAIN-DREAM-REPLAY-SPRINT.md`](../BRAIN-DREAM-REPLAY-SPRINT.md),
[`electron/brain/replay-engine.ts`](../../electron/brain/replay-engine.ts),
[`electron/pje/route-memory.ts`](../../electron/pje/route-memory.ts),
[`electron/observer/enrichers/browser.ts`](../../electron/observer/enrichers/browser.ts).

## Problema

Hoje a Lex ja tem:

- tools segmentadas e deterministicas para um trilho forte de consulta/leitura;
- uma skill interna de orquestracao com replay (`pje_browser_use`);
- Brain, replay e memoria de rotas para reaproveitar sucesso anterior.

Mas o PJe varia demais para a Lex depender de um fluxo unico:

- tribunal muda;
- perfil muda (`advogado`, `servidor`, possivelmente `gabinete` e outros);
- o painel inicial muda;
- o conjunto de pastas, menus e permissões muda;
- a mesma intencao pode exigir rotas diferentes dependendo do ambiente.

Exemplo real do problema:

- um servidor pode abrir o PJe e cair em um mural com pastas;
- um advogado pode abrir o PJe e cair em uma area completamente diferente;
- o pedido "abra a pasta X" nao pode ser tratado como um clique absoluto.

Se a Lex quiser ser agente de verdade no PJe, ela precisa operar como agente
**situado**:

1. entender onde esta;
2. decidir com base nesse contexto;
3. explorar quando nao souber;
4. salvar o know-how contextualizado;
5. reaproveitar isso so quando o ambiente for compatível.

## Norte

Nao queremos substituir o aparato atual. Queremos empilhar uma camada melhor de
universalizacao por cima dele.

Regra de produto:

- tools/flows deterministas continuam existindo como trilhos confiaveis;
- `pje_browser_use` continua como ponte de exploracao e replay;
- o salto novo e armazenar `passos + onde valem + quando deixam de valer`.

Resultado desejado:

- a Lex entende se esta em `advogado > painel`, `servidor > mural`, etc.;
- uma rota aprendida para "abrir pasta conclusos" fica associada ao contexto;
- replay so roda quando o contexto atual bate com o contexto aprendido;
- quando nao bate, a Lex explora e aprende uma nova variante.

## Modelo alvo

### 1. Contexto de ambiente PJe

A Lex precisa construir um fingerprint minimo do ambiente atual:

- `tribunal`
- `profileKind` (`advogado`, `servidor`, `desconhecido`)
- `authState` (`nao_logado`, `logado`, `parcial`)
- `surfaceKind` (`painel`, `mural`, `consulta`, `autos`, `documento`, etc.)
- `screenFamily`
- `areaLabel` ou destino local reconhecivel
- `affordances` visiveis: pastas, abas, botoes, menus, modais, avisos

### 2. Know-how contextualizado

O que a Lex aprende nao deve ser salvo como "clique no seletor Y".

Deve ser salvo como:

- `contexto de partida`
- `objetivo`
- `rota`
- `evidencia de sucesso`
- `confianca`
- `sinais de invalidez`

### 3. Reuso com criterio

Replay/route-memory devem reaproveitar so quando:

- o tribunal bate;
- o perfil bate;
- a familia de tela bate;
- as affordances minimas ainda existem;
- o risco de mismatch esta aceitavel.

Se nao bater:

- nao forcar replay;
- cair para exploracao;
- salvar uma nova variante quando der certo.

## Arquivos-alvo provaveis

- `electron/observer/enrichers/browser.ts`
- `electron/brain/replay-engine.ts`
- `electron/brain/replay-executor.ts`
- `electron/pje/route-memory.ts`
- `electron/skills/pje/browser-use.ts`
- `scripts/lex-desktop-mcp-server.mjs`
- `src/renderer/js/app.js`
- `src/renderer/js/brain.js`

## Sprints

### Sprint 1 - Modelo de contexto e observabilidade

Objetivo: fazer a Lex detectar e expor onde ela esta no PJe antes de prometer
universalizacao real.

- [ ] definir um `PjeEnvironmentContext` minimo com tribunal, perfil, authState, surfaceKind, screenFamily e affordances;
- [ ] enriquecer o `browserEnricher` para registrar mais do que `tribunal + pjeContext`;
- [ ] revisar `pje_status` e `pje_inspecionar_contexto` para devolver sinais de perfil/ambiente quando possivel;
- [ ] registrar esses sinais no Brain/page_state de forma consultavel;
- [ ] mostrar esse contexto em debug/logs legiveis na UI;
- [ ] criar fixtures/testes para pelo menos dois cenarios: `advogado` e `servidor`.

**Criterio de aprovacao:** a Lex consegue diferenciar, no minimo, `advogado`
vs `servidor` e identificar familia de tela suficiente para nao tratar tudo
como o mesmo estado.

### Sprint 2 - Replay e memoria de rotas por contexto

Objetivo: impedir que a memoria atual reuse uma rota certa no contexto errado.

- [ ] expandir `findReplayPlan()` para considerar fingerprint contextual, nao apenas `(tribunal, pjeContext)`;
- [ ] evoluir `route-memory` de `tribunal:destino` para chave contextual;
- [ ] salvar variacoes da mesma rota por perfil/surface;
- [ ] bloquear replay quando houver mismatch relevante de contexto;
- [ ] manter fallback elegante para exploracao quando o replay for recusado;
- [ ] cobrir com testes de match e mismatch contextual.

**Criterio de aprovacao:** duas rotas diferentes para o mesmo objetivo podem
coexistir sem colidir, por exemplo `servidor:mural:pasta-x` e
`advogado:painel:destino-x`.

### Sprint 3 - Exploracao guiada e conquista de novas variantes

Objetivo: transformar exploracao bem-sucedida em know-how reutilizavel.

- [ ] fazer `pje_browser_use` registrar claramente quando explorou um caminho novo;
- [ ] promover rotas/flows bem-sucedidos para contexto aprendido;
- [ ] guardar affordances importantes do destino final, nao so o caminho;
- [ ] definir score minimo para uma rota ser promovida de tentativa para know-how confiavel;
- [ ] permitir aprender varias variantes do mesmo objetivo sem sobrescrever a anterior;
- [ ] criar criterio para invalidar ou enfraquecer variante que parou de funcionar.

**Criterio de aprovacao:** depois de 2-3 execucoes bem-sucedidas em um ambiente
novo, a Lex reaproveita esse caminho como replay contextualizado.

### Sprint 4 - UX, guardrails e validacao real

Objetivo: fazer essa universalizacao aparecer como comportamento de produto, nao
so como melhoria interna.

- [ ] trocar logs tecnicos por breadcrumbs como `Ambiente detectado: servidor > mural > pasta conclusos`;
- [ ] mostrar quando a Lex esta usando `replay conhecido` vs `exploracao assistida`;
- [ ] explicar quando uma rota foi recusada por incompatibilidade de contexto;
- [ ] manter HITL e evidencia final para qualquer ato sensivel;
- [ ] rodar smoke manual com matriz minima `advogado` x `servidor`;
- [ ] documentar casos ainda fora de escopo ou instaveis.

**Criterio de aprovacao:** um usuario consegue entender por que a Lex escolheu
uma rota, quando reutilizou aprendizado e quando decidiu explorar de novo.

## Fora de escopo desta task

- protocolar autonomamente no PJe;
- suportar todos os tribunais do Brasil antes de validacao assistida;
- substituir as bridge tools deterministicas do MVP;
- reabrir Agora como frente principal;
- criar dezenas de flows fixos por perfil.

## Relacao com o MVP e lancamento

Esta task e importante, mas precisa ser fatiada com disciplina:

- Sprint 1 e Sprint 2 podem comecar cedo porque melhoram seguranca de contexto;
- Sprint 3 consolida o coracao do agente PJe de verdade;
- Sprint 4 fecha a parte de produto/UX;
- nada disso deve quebrar o trilho MVP atual de `consultar -> ler -> abrir -> baixar -> analisar`.

Ou seja: universalizacao nao substitui o MVP atual; ela expande a area
conquistada do PJe sem voltar a depender de fluxo fixo para tudo.

## Criterio final da task

Esta task fica em estado bom quando:

- a Lex distingue ambientes PJe relevantes antes de agir;
- replay e route-memory passam a ser context-aware;
- o mesmo objetivo pode ter variantes por perfil/area sem colisao;
- exploracao bem-sucedida vira know-how contextualizado no Brain;
- a UI consegue narrar isso como comportamento confiavel.
