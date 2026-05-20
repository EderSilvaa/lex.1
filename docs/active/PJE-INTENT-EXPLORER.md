# PJe Intent Explorer

Atualizado em 2026-05-19.

## Status atual

`Sprint 1` iniciada e `Sprint 2` em andamento.

Importante: esta frente deve seguir o trilho canonico atual do produto:

- `context-inspector`
- `lex-desktop bridge`
- `tools MCP/bridge do lex-desktop`

`pje_browser_use` pode continuar existindo como camada interna/transicional, mas
nao deve ser tratado como o caminho principal desta task.

Ja entrou a primeira camada de fundacao no inspector:

- `worldtree` por pagina;
- `frameTree`;
- `actionableNodes`;
- `expansionCandidates`;
- `downloadCandidates`;
- pistas de `sectionPath`, `formId`, `framePath`, `jsfHints`, `ajaxHints` e
  `interactionHints`.

Isso ainda nao fecha a exploracao por intencao sozinho, mas cria a superficie
necessaria para o proximo passo: `intent resolver + affordance matcher`.

Tambem ja entrou a primeira camada da `Sprint 2`:

- nova intencao operacional `baixar_autos_completos`;
- affordances novas como `expandir_interface` e `baixar_autos_completos`;
- ranking inicial de candidatos da worldtree para exportacao/download integral;
- guidance operacional e execution brief trazendo `candidatos DOM` e sequencia
  inicial de exploracao para esse objetivo adjacente.
- catalogo inicial de `candidatos operacionais`, com `ref`, acao sugerida,
  origem e motivo, para a Lex levantar possiveis alvos antes de agir.
- primeira camada de execucao incremental: um candidato por vez, com `dryRun`,
  confirmacao humana quando necessario e reinspecao apos a acao.
- primeiro loop incremental curto: explorar -> escolher candidato -> confirmar
  -> executar -> reinspecionar, por ate 1-3 passos.

## Motivo desta task

Validamos bem o trilho principal do MVP no PJe de advogado:

- consultar processo;
- abrir resultado;
- ler autos;
- baixar documento atual;
- analisar documento baixado.

Isso foi importante para provar utilidade real no produto, mas nao resolve
sozinho a promessa central da Lex:

> agir no PJe conforme a intencao do usuario, inclusive quando a intencao sair
> do fluxo conhecido.

O exemplo que escancarou isso foi:

- `baixar o processo inteiro`

Nesse caso, a Lex nao deveria colapsar para snapshot, se enrolar ou depender de
um fluxo fixo inexistente. Ela deveria:

1. entender a intencao;
2. ler o DOM real da superficie atual;
3. explorar menus, tabs, acoes e affordances candidatas;
4. tentar um caminho seguro;
5. admitir claramente quando nao encontrou rota confiavel.

## Diagnostico honesto

Passamos bastante tempo fortalecendo:

- contexto de tela;
- replay contextual;
- guidance por superficie;
- memoria de seletores/rotas;
- flows confiaveis para `consulta -> autos -> documento`.

Isso nao foi trabalho perdido. Essa base continua necessaria.

Mas houve um desbalanceamento:

- ficamos fortes em `trilhos conhecidos`;
- e ainda fracos em `exploracao por intencao nova`.

Em outras palavras:

- hoje a Lex navega bem quando o objetivo ja foi modelado;
- ainda nao navega bem o bastante quando o pedido e adjacente ou novo.

## Objetivo real desta frente

Construir um executor exploratorio do PJe guiado por intencao e pelo DOM real,
nao so por flows previamente modelados.

Objetivo de produto:

- `intencao do usuario -> leitura do ambiente -> exploracao segura -> conquista do caminho`

Objetivo tecnico:

- sair de `tool conhecida ou improviso fraco`
- para `matching de intencao + worldtree DOM + exploracao incremental`

## Regra arquitetural critica

Nesta frente, `intencao` nao pode virar um nome bonito para `fluxo hardcoded`.

O papel da intencao aqui e:

- servir como `bussola de busca`;
- orientar `que tipo de affordance` procurar no DOM;
- ajudar a decidir `qual exploracao incremental tentar primeiro`;
- e melhorar `quando parar` ou `quando admitir que a rota nao esta clara`.

O papel da intencao aqui nao e:

- definir um caminho fixo de clique A -> B -> C;
- criar uma tool nova para cada pedido adjacente;
- substituir a exploracao real por uma taxonomia decorativa.

Em outras palavras:

- `baixar_autos_completos` nao significa `ja sabemos como baixar os autos`;
- significa `a Lex sabe que deve procurar exportacao/download integral, menus,
  tabs e acoes DOM compativeis com esse objetivo`.

## Regra de memoria/conquista

Quando a Lex descobrir uma rota boa, a memoria desejada tambem nao deve ser um
receituario rigido do tipo:

- `sempre clique aqui`

Ela deve guardar algo mais contextual:

- em `superficie X`
- com `perfil Y`
- para `intencao Z`
- estes `candidatos DOM`
- e esta `sequencia de exploracao`
- funcionaram melhor

Ou seja:

- a memoria deve registrar `know-how contextualizado`;
- nao um pseudo fluxo universal travestido de aprendizado.

## O que esta faltando hoje

### 1. Worldtree operacional do DOM

A Lex ja inspeciona bastante coisa do DOM, inclusive iframes.

O que falta e transformar isso numa estrutura operacional mais rica:

- elementos interativos;
- hierarquia de frames;
- textos de contexto;
- secoes/containers;
- pai logico do elemento;
- caminho de frame;
- ids JSF;
- href;
- onclick;
- sinais de AJAX/partial refresh;
- estado visivel/desabilitado;
- candidatos ocultos apos expansao de menu ou tab.

Essa worldtree precisa servir como superficie de decisao, nao so como dump de
inspecao.

### 2. Resolver intencoes para classes de objetivo

A Lex precisa diferenciar classes como:

- `consultar_processo`
- `abrir_autos`
- `ler_autos`
- `baixar_documento_atual`
- `baixar_documento_especifico`
- `baixar_autos_completos`
- `exportar_processo`
- `abrir_menu_x`
- `mostrar_movimentacoes`

Hoje isso ainda esta muito acoplado aos trilhos ja conhecidos.

Precisamos de um resolvedor de intencao mais direto e operacional.

### 3. Rankear affordances do DOM por intencao

Em vez de cair cedo em:

- clique generico;
- snapshot;
- tool errada;
- exploracao solta;

a Lex deve perguntar:

- quais affordances desta tela parecem servir a essa intencao?
- quais sao fortes?
- quais sao seguras?
- quais exigem expandir UI antes?

### 4. Exploracao incremental disciplinada

A Lex precisa explorar em passos pequenos e conscientes:

- abrir menu;
- expandir dropdown;
- trocar aba interna;
- revelar acao escondida;
- reinspecionar DOM;
- reranquear affordances;
- seguir.

E nao:

- dar um salto ruim;
- cair em consulta publica;
- usar snapshot cedo demais;
- inventar que algo nao existe sem explorar a superficie.

### 5. Parada segura e honesta

Quando nao houver rota confiavel, a Lex deve dizer algo como:

- `nao encontrei affordance segura para baixar os autos completos nesta superficie`
- `encontrei estes caminhos candidatos`
- `posso tentar explorar o menu X`

Isso e muito melhor do que se enrolar silenciosamente.

## Caso ancora desta task

Primeiro caso real de implementacao:

- `baixar o processo inteiro`

Essa intencao e perfeita como prova de maturidade porque:

- nao e o mesmo que baixar o documento atual;
- pode envolver menu, dropdown, visualizador ou acao contextual;
- exige leitura real do DOM e exploracao incremental;
- mostra se a Lex esta so repetindo trilho ou realmente navegando por intencao.

## Arquitetura alvo

Importante:

- o explorador por intencao deve nascer como `camada MCP/bridge explicavel`;
- nao como dependencia central de `pje_browser_use`.

### Camada A - DOM Worldtree

Responsabilidade:

- capturar a superficie atual do PJe com riqueza suficiente para exploracao.

Minimos desejados:

- `frameTree`
- `interactiveNodes`
- `container/section hints`
- `text neighborhoods`
- `jsf/ajax hints`
- `visibility/disabled state`
- `expansion candidates`

Arquivos mais provaveis:

- `electron/pje/context-inspector.ts`
- `electron/lex-desktop-bridge.ts`
- `scripts/lex-desktop-mcp-server.mjs`
- novo modulo dedicado, por exemplo:
  - `electron/pje/dom-worldtree.ts`

### Camada B - Intent Resolver

Responsabilidade:

- traduzir o pedido do usuario para uma classe operacional de objetivo.

Exemplo:

- `baixa o processo inteiro`
- `quero os autos completos em pdf`
- `exporta esse processo`

Tudo isso pode convergir para:

- `baixar_autos_completos`

Arquivos provaveis:

- `electron/pje/action-guidance.ts`
- `electron/backend/server.ts`
- `electron/lex-desktop-bridge.ts`
- `scripts/lex-desktop-mcp-server.mjs`
- possivel modulo novo:
  - `electron/pje/intent-resolver.ts`

### Camada C - Affordance Matcher

Responsabilidade:

- rankear alvos da worldtree contra a intencao atual.

Exemplo para `baixar_autos_completos`:

- botoes/links com `download`, `baixar`, `pdf`, `autos`, `inteiro`, `integral`,
  `processo completo`, `imprimir`, `exportar`;
- menus ou tabs que parecem revelar esse tipo de acao;
- sinais de que a acao esta no frame correto.

Arquivos provaveis:

- novo modulo:
  - `electron/pje/intent-affordance-matcher.ts`
- ou inicializacao direta no trilho MCP atual:
  - `electron/pje/action-guidance.ts`
  - `scripts/lex-desktop-mcp-server.mjs`

### Camada D - Exploration Policy

Responsabilidade:

- controlar exploracao pequena, segura e reversivel.

Exemplos de steps:

- `expand_menu`
- `open_dropdown`
- `switch_internal_tab`
- `click_candidate`
- `reinspect`
- `abort_with_reason`

Arquivos provaveis:

- `electron/lex-desktop-bridge.ts`
- `scripts/lex-desktop-mcp-server.mjs`
- possivel modulo novo:
  - `electron/pje/exploration-policy.ts`

### Camada E - Learn/Conquer

Responsabilidade:

- quando a Lex descobrir o caminho correto, registrar:
  - rota;
  - affordances que funcionaram;
  - estilo de exploracao;
  - contexto de superficie.

Isso continua usando a base que ja construimos em:

- Brain/replay/selector memory/route memory

Mas agora alimentado por exploracao mais rica de intencao.

## Regra de produto

Nao queremos cair em dois extremos:

### Extremo ruim 1

`vamos criar uma tool fixa para cada novo pedido`

Isso vira colecao infinita de flows.

### Extremo ruim 2

`vamos deixar o agente improvisar tudo`

Isso vira caos, erro e navegacao fraca.

### Meio certo

- algumas tools canonicamente fortes continuam existindo;
- mas a exploracao nova deve ser orientada por intencao + DOM + policy;
- o que der certo pode depois virar know-how reaproveitavel.

## Sprints propostas

## Sprint 1 - Worldtree do DOM

Meta:

- enriquecer o inspector para produzir uma worldtree realmente exploravel.

Entregas:

- frame tree melhor;
- contexto de secao/container;
- pistas JSF/AJAX;
- nos acionaveis com pai/rotulo/estado/caminho;
- base para menus e tabs expansivas.

Critero de saida:

- conseguir inspecionar uma tela de autos e apontar candidatas reais para
  `baixar autos completos`.

## Sprint 2 - Intent Resolver + Affordance Matcher

Meta:

- transformar pedidos livres em classes de objetivo e ranquear alvos do DOM.

Entregas:

- taxonomia inicial de intencoes PJe;
- matcher de affordances por objetivo;
- ranking claro com justificativa.

Critero de saida:

- para `baixar o processo inteiro`, a Lex listar alvos candidatos coerentes sem
  cair logo em snapshot.

## Sprint 3 - Exploration Policy

Meta:

- fazer a Lex explorar menus/tabs/acoes contextuais em passos pequenos.

Entregas:

- politica incremental de exploracao;
- reinspecao apos cada passo;
- regra de parada segura;
- mensagem honesta quando a rota nao estiver clara.

Critero de saida:

- a Lex conseguir tentar 1-3 caminhos racionais para `baixar autos completos`
  antes de desistir.

## Sprint 4 - Learn/Conquer

Meta:

- promover caminhos descobertos para memoria operacional reutilizavel.

Entregas:

- registro da exploracao bem-sucedida;
- replay de objetivo adjacente;
- seletores e rotas associados ao novo objetivo.

Critero de saida:

- repetir `baixar autos completos` com menos exploracao na segunda vez.

## Definicao de pronto desta task

Esta task pode ser considerada bem-sucedida quando:

- a Lex receber uma intencao nova, como `baixar o processo inteiro`;
- ler o DOM/iframes reais da superficie atual;
- identificar caminhos candidatos plausiveis;
- explorar de forma incremental e segura;
- ou concluir honestamente que nao encontrou affordance confiavel;
- sem cair cedo em snapshot como muleta principal;
- sem depender de um flow hardcoded especifico para esse pedido.

## Relacao com o que ja foi feito

Esta task nao substitui o trabalho anterior.

Ela sobe de nivel em cima dele:

- contexto de superficie continua util;
- replay continua util;
- selector memory continua util;
- route memory continua util;
- tools canonicas continuam uteis.

Mas agora tudo isso passa a servir a um objetivo maior:

- autonomia por intencao, nao apenas por trilho conhecido.

## Proximo passo imediato

Comecar pelo caso ancora:

- `baixar autos completos`

E fazer a primeira entrega tecnica em cima de:

- `context-inspector`
- `intent resolver`
- `affordance matcher`
- `tool MCP/bridge de exploracao por intencao`

Antes de abrir mais escopo lateral.
