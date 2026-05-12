# PJe Skills Apparatus

Atualizado em 2026-05-09.

Nota de escopo de lancamento em 2026-05-12: com a Agora postergada para depois
do lancamento, este aparato de PJe/TJ vira o centro do MVP imediato da Lex.
Ou seja: se vamos fechar escopo para abrir o produto, e aqui que a maior parte
do esforco precisa convergir. A superficie MCP da Lex entra como camada de
distribuicao desse aparato, nao como substituta do fechamento de produto.

Este documento consolida o aparato atual de PJe da Lex, mas com uma distincao
importante:

- o que esta sendo usado hoje sobe pelo `Lex Engine`;
- o `Electron/Desktop` entra como executor supervisionado, bridge e camada
  Windows/PJe;
- algumas skills em `electron/skills/pje` continuam existindo como
  implementacao local, compatibilidade ou fallback, mas nao sao a melhor
  representacao da superficie principal em uso.

O objetivo aqui e deixar claro:

- quais tools/skills de PJe estao ativas no caminho Engine -> Desktop;
- quais implementacoes locais existem no Desktop;
- onde ja existe transparencia/log;
- onde ainda faltam guardrails e verificacao forte para tarefas criticas.
- e por que o MVP deve priorizar esse caminho antes de reabrir workflows duraveis.

## Correcao de leitura

Leitura correta do estado atual:

- a superficie principal de PJe em uso esta no `engine/lex-engine`;
- o Desktop/Electron continua como executor supervisionado de browser, PJe,
  certificado, arquivos e confirmacoes;
- o arquivo `electron/skills/pje/index.ts` descreve o aparato local do Desktop,
  nao sozinho a melhor fonte de verdade sobre "o que estamos usando no produto".

## Fontes de verdade

### 1. Superficie ativa no Engine

Arquivos principais:

- [engine/lex-engine/lex/BRIDGE-CONTRACT.md](../engine/lex-engine/lex/BRIDGE-CONTRACT.md)
- [engine/lex-engine/skills/legal/pje-bridge/SKILL.md](../engine/lex-engine/skills/legal/pje-bridge/SKILL.md)
- [docs/future-tasks/LEX-HERMES-INTEGRATION-PLAN.md](./future-tasks/LEX-HERMES-INTEGRATION-PLAN.md)

### 2. Implementacao local no Desktop

Arquivos principais:

- [electron/skills/pje/index.ts](../electron/skills/pje/index.ts)
- [electron/skills/pje/browser-use.ts](../electron/skills/pje/browser-use.ts)

## Mapa rapido

### Superficie PJe usada no Lex Engine

Estas sao as tools/skills que melhor representam o caminho ativo no produto:

| Tool/Skill | Camada | Papel |
| --- | --- | --- |
| `pje-bridge` | Engine skill | skill do Engine que instrui o uso da ponte local do Desktop |
| `pje_status` | bridge tool | diagnostico read-only do estado PJe/browser |
| `pje_consultar_processo` | bridge tool | prepara/consulta processo em modo seguro/read-only |
| `pje_abrir_consulta` | bridge tool | abre a tela de consulta do PJe com supervisao |
| `pje_inspecionar_contexto` | bridge tool | observa abas, campos, botoes, iframes e contexto atual |
| `pje_preencher_numero` | bridge tool | preenche o numero do processo com validacao e dry-run |
| `pje_clicar_consultar` | bridge tool | executa apenas o clique seguro de consultar |
| `pje_ler_resultados` | bridge tool | le resultados visiveis da consulta sem abrir processo |

### Implementacoes locais no Desktop

Estas sao implementacoes/skills presentes no lado Electron:

| Skill | Status atual | Papel |
| --- | --- | --- |
| `pje_browser_use` | implementacao local importante | skill interna de orquestracao PJe com Brain replay + MCP browser tools |
| `pje_abrir` | legado/fallback | abre o PJe e deixa o usuario autenticar |
| `pje_agir` | legado/fallback | executor generico de acoes em linguagem natural |
| `pje_consultar` | legado/fallback | consulta processo por numero CNJ |
| `pje_movimentacoes` | legado/fallback | extrai movimentacoes do processo aberto |
| `pje_documentos` | legado/fallback | extrai documentos/pecas do processo aberto |
| `pje_navegar` | legado/fallback | navega por area/menu/destino no PJe |
| `pje_preencher` | legado/fallback | preenche campos na tela atual |
| `pje_bulk_coletar` | legado/fallback | coleta dados de muitos processos em lote, sem LLM na navegacao |
| `pje_verificar_token` | utilitaria ativa | checa token A3/certificado digital local |
| `pedir_codigo_totp` | utilitaria ativa | pausa e pede codigo 2FA/TOTP ao usuario |

## Roteamento operacional

### Caminho principal em uso

O caminho principal desejado e ativo conceitualmente hoje e:

```text
Usuario -> Lex Engine/Hermes -> skill/tool de PJe no Engine ->
bridge local -> Desktop/Electron -> browser/PJe/certificado/confirmacao
```

Ou seja:

- o Engine pensa, escolhe e chama a capability;
- o Desktop executa no Windows;
- PJe nao deve ser controlado diretamente do WSL fora da ponte local.

Para o MVP comercial, isso tambem permite uma leitura importante:

- a Lex pode ser vendida como app completo;
- ou como capacidade de PJe/TJ exposta por MCP para ambientes compativeis;
- mas o fechamento de confiabilidade continua acontecendo aqui, no aparato
  PJe/TJ, e nao na casca do cliente que chama o MCP.

### Modo de orquestracao local

No lado Desktop, quando existe server MCP de browser configurado, a Lex registra:

- `pje_browser_use`
- `pje_verificar_token`
- `pedir_codigo_totp`

As skills abaixo ficam marcadas como `deprecated` e nao sao registradas:

- `pje_abrir`
- `pje_agir`
- `pje_consultar`
- `pje_movimentacoes`
- `pje_documentos`
- `pje_navegar`
- `pje_preencher`
- `pje_bulk_coletar`

### Modo fallback local

Sem MCP browser, a Lex registra:

- as 8 skills de automacao legadas;
- mais `pje_verificar_token`;
- mais `pedir_codigo_totp`.

## Camadas do aparato PJe

O aparato atual nao e so "lista de skills". Ele se apoia em varias camadas:

1. Skills/tools de PJe no Engine.
2. Bridge local Windows/Desktop.
3. Browser controlado no Desktop.
4. Memoria operacional do Brain.
5. Replay de flows aprendidos.
6. Discovery e memoria de seletores.
7. Logs/eventos enviados para a UI.

### Peca central do caminho novo

A melhor leitura hoje nao e "tudo gira em torno de `pje_browser_use`".
O mais correto e:

- o Engine expõe/intenciona a superficie principal;
- a bridge local do Desktop executa a parte Windows/PJe;
- `pje_browser_use` e uma implementacao local relevante do lado Electron,
  especialmente para a camada de execucao e observacao.

### Peca central do lado Desktop

`pje_browser_use` continua sendo uma peca central local. Ela:

- funciona como ponte entre Brain replay e MCP browser tools;
- recebe uma `task` aberta em linguagem natural;
- tenta replay no Brain antes de gastar exploracao;
- pode abrir preview de replay para confirmacao;
- cai para sub-loop MCP quando nao ha replay confiavel;
- emite eventos de replay e eventos MCP para a UI.

Arquivos chave:

- [electron/skills/pje/browser-use.ts](../electron/skills/pje/browser-use.ts)
- [electron/brain/replay-executor.ts](../electron/brain/replay-executor.ts)
- [electron/observer/enrichers/browser.ts](../electron/observer/enrichers/browser.ts)
- [src/renderer/js/app.js](../src/renderer/js/app.js)

## Inventario detalhado

### 1. `pje_browser_use`

- Arquivo: [electron/skills/pje/browser-use.ts](../electron/skills/pje/browser-use.ts)
- Status: skill interna de orquestracao local
- Categoria: `pje`
- Stack: `ensureBrowser()` + MCP browser tools + Anthropic + Brain replay
- Entradas principais:
  - `task`
  - `tribunal`
  - `maxSteps`
  - `toolTimeoutMs`
  - `totalTimeoutMs`
  - `forceVision`
  - `skipConfirm`
- Papel:
  - skill interna de orquestracao e replay para operacoes abertas no PJe;
  - ponte local entre Brain e exploracao MCP no browser;
  - consulta, navegacao, preenchimento, leitura, extracao quando ainda nao houver tool segmentada suficiente.
- Transparencia atual:
  - emite eventos `[Replay] ...`
  - emite eventos `[MCP] ...`
  - gera preview do replay quando configurado
- Confiabilidade atual:
  - tenta replay antes de explorar;
  - fallback para sub-loop MCP;
  - depende de validacao do proprio fluxo/replay;
  - ainda nao materializa um pacote final forte de evidencia para tarefas criticas.

### 2. `pje_abrir`

- Arquivo: [electron/skills/pje/abrir.ts](../electron/skills/pje/abrir.ts)
- Status: legado/fallback
- Categoria: `pje`
- Stack: browser manager + URL estatica por tribunal
- Entrada principal:
  - `tribunal`
- Papel:
  - abrir o PJe no Chrome e aguardar autenticacao do usuario.
- Transparencia atual:
  - emite progresso no `agentEmitter`
  - injeta overlay visual no browser
- Confiabilidade atual:
  - checa host atual e reaproveita sessao se ja estiver no mesmo tribunal;
  - nao cobre verificacao semantica forte alem de abrir a URL.

### 3. `pje_agir`

- Arquivo: [electron/skills/pje/agir.ts](../electron/skills/pje/agir.ts)
- Status: legado/fallback
- Categoria: `pje`
- Stack: `runBrowserUseTask()` com fallback para vision dentro do executor
- Entradas principais:
  - `objetivo`
  - `tribunal`
  - `maxPassos`
- Papel:
  - skill generica para "fazer algo" no PJe em linguagem natural.
- Transparencia atual:
  - emite cada passo para a UI;
  - injeta overlay no browser;
  - consegue sinalizar quando usou fallback.
- Confiabilidade atual:
  - boa para exploracao e navegacao assistida;
  - fraca como contrato para ato critico, porque o objetivo e aberto demais.

### 4. `pje_consultar`

- Arquivo: [electron/skills/pje/consultar.ts](../electron/skills/pje/consultar.ts)
- Status: legado/fallback
- Categoria: `pje`
- Stack: `ensureBrowser()` + `runBrowserUseTask()`
- Entradas principais:
  - `numero`
  - `tribunal`
- Papel:
  - navegar para a consulta, preencher o CNJ e extrair dados basicos do processo.
- Transparencia atual:
  - logs em console do objetivo e do resultado;
  - pouca narracao rica para o usuario.
- Confiabilidade atual:
  - retorno em texto estruturado;
  - nao tem dupla verificacao forte de que o processo aberto e realmente o pretendido.

### 5. `pje_movimentacoes`

- Arquivo: [electron/skills/pje/movimentacoes.ts](../electron/skills/pje/movimentacoes.ts)
- Status: legado/fallback
- Categoria: `pje`
- Stack: `ensureBrowser()` + `runBrowserUseTask()`
- Entradas principais:
  - `limite`
  - `numero`
  - `tribunal`
- Papel:
  - ler a aba de movimentacoes/andamentos do processo atual.
- Transparencia atual:
  - baixa, focada no retorno final.
- Confiabilidade atual:
  - depende de estar na tela certa;
  - nao valida por conta propria se o processo aberto corresponde ao contexto esperado.

### 6. `pje_documentos`

- Arquivo: [electron/skills/pje/documentos.ts](../electron/skills/pje/documentos.ts)
- Status: legado/fallback
- Categoria: `pje`
- Stack: `ensureBrowser()` + `runBrowserUseTask()`
- Entradas principais:
  - `numero`
  - `tribunal`
- Papel:
  - listar documentos/pecas/anexos do processo visivel.
- Transparencia atual:
  - baixa, focada no retorno final.
- Confiabilidade atual:
  - depende da tela certa e da interpretacao do agent;
  - nao produz evidencia final forte alem do texto retornado.

### 7. `pje_navegar`

- Arquivo: [electron/skills/pje/navegar.ts](../electron/skills/pje/navegar.ts)
- Status: legado/fallback
- Categoria: `pje`
- Stack:
  - primeiro `route-memory`
  - depois mapa estatico de URLs
  - depois agent visual
- Entradas principais:
  - `destino`
  - `tribunal`
- Papel:
  - chegar a uma area/aba/menu com o minimo de exploracao possivel.
- Transparencia atual:
  - logs em console indicam se foi por URL direta ou agent.
- Confiabilidade atual:
  - boa ideia arquitetural por privilegiar rota aprendida;
  - ainda sem narracao forte de "onde estou" para o usuario final.

### 8. `pje_preencher`

- Arquivo: [electron/skills/pje/preencher.ts](../electron/skills/pje/preencher.ts)
- Status: legado/fallback
- Categoria: `pje`
- Stack: `ensureBrowser()` + `runBrowserUseTask()`
- Entradas principais:
  - `campos`
  - `tribunal`
- Papel:
  - preencher formularios na tela atual.
- Transparencia atual:
  - sabe quais campos pretende preencher;
  - nao expande isso hoje em breadcrumbs amigaveis na UI.
- Confiabilidade atual:
  - adequada para apoio operacional;
  - insuficiente para formularios criticos sem validacao pos-preenchimento.

### 9. `pje_bulk_coletar`

- Arquivo: [electron/skills/pje/bulk-coletar.ts](../electron/skills/pje/bulk-coletar.ts)
- Status: legado/fallback
- Categoria: `pje`
- Stack: Python + Playwright via CDP + RPA puro
- Entradas principais:
  - `processos`
  - `tribunal`
- Papel:
  - coletar muitos processos em lote sem depender de LLM na navegacao.
- Transparencia atual:
  - emite progresso percentual para a UI.
- Confiabilidade atual:
  - robusta para coleta massiva simples;
  - propositalmente separa coleta de analise;
  - nao e fluxo de protocolo nem de ato sensivel.

### 10. `pje_verificar_token`

- Arquivo: [electron/skills/pje/token-check.ts](../electron/skills/pje/token-check.ts)
- Status: utilitaria ativa
- Categoria: `pje`
- Stack: `certutil -scinfo` no Windows
- Entradas:
  - nenhuma
- Papel:
  - diagnosticar se o token A3 esta presente antes do login.
- Transparencia atual:
  - mensagem clara de pronto/ausente/sem cartao.
- Confiabilidade atual:
  - boa para preflight local;
  - nao depende de browser nem de LLM.

### 11. `pedir_codigo_totp`

- Arquivo: [electron/skills/pje/pedir-codigo.ts](../electron/skills/pje/pedir-codigo.ts)
- Status: utilitaria ativa
- Categoria: `utils`
- Stack: pausa de execucao + `requestUserInput`
- Entrada principal:
  - `contexto`
- Papel:
  - pedir 2FA ao usuario e retomar a execucao.
- Transparencia atual:
  - explicita para qual contexto o codigo esta sendo pedido.
- Confiabilidade atual:
  - valida formato de 6 digitos;
  - e um bom exemplo de HITL claro.

## Infra de apoio que ja existe

### Brain e replay

O Brain ja e a memoria operacional de micro-flows do Desktop.
Hoje ele sustenta:

- deteccao de flows;
- replay de planos confiaveis;
- preview/confirmacao de replay;
- fallback quando o replay nao fecha.

Arquivos importantes:

- [electron/brain/replay-engine.ts](../electron/brain/replay-engine.ts)
- [electron/brain/replay-executor.ts](../electron/brain/replay-executor.ts)
- [electron/brain/flow-detector.ts](../electron/brain/flow-detector.ts)

### Discovery e memoria de seletores

O aparato PJe tambem ja tem:

- memoria de seletores por tribunal/contexto;
- discovery heuristico sem LLM;
- waterfall learned -> hardcoded -> discovered.

Arquivos importantes:

- [electron/browser/selector-memory.ts](../electron/browser/selector-memory.ts)
- [electron/browser/selector-discovery.ts](../electron/browser/selector-discovery.ts)
- [electron/browser/resolve-selector.ts](../electron/browser/resolve-selector.ts)

### Memoria de rotas

`pje_navegar` ja usa uma memoria de rotas aprendidas para preferir caminhos
mais diretos e deterministas quando ha historico confiavel.

Arquivo importante:

- [electron/pje/route-memory.ts](../electron/pje/route-memory.ts)

### Transparencia na UI

A UI ja possui um canal funcional para mostrar andamento:

- `agentEmitter` envia eventos `thinking`;
- `pje_browser_use` ja publica eventos de replay e MCP;
- o renderer mostra isso no accordion "Processo de pensamento".

Arquivos importantes:

- [electron/agent/loop.ts](../electron/agent/loop.ts)
- [electron/main.ts](../electron/main.ts)
- [src/renderer/js/app.js](../src/renderer/js/app.js)

## Leitura arquitetural

### O que esta ativo e alinhado com a direcao nova

- `pje_browser_use` como skill interna de orquestracao local;
- Brain como memoria operacional;
- replay antes de exploracao;
- observacao de contexto por enrichers;
- uso do browser controlado no Desktop.

### O que e compatibilidade/legado

- as skills segmentadas de operacao (`pje_consultar`, `pje_preencher`, etc.)
  como base principal de produto;
- dependencia em wrappers locais quando o MCP browser nao esta ativo;
- fluxos mais deterministas acoplados a telas especificas.

## Gaps atuais do aparato

### 1. Transparencia ainda muito tecnica

Hoje a infraestrutura existe, mas o texto emitido para o usuario ainda esta
proximo de log tecnico:

- `[Replay] step 2`
- `[MCP] step 4 -> browser__click(...)`

Falta a camada de narracao de produto:

- onde estou;
- o que encontrei;
- por que vou clicar;
- o que espero que mude;
- se confirmou ou nao.

### 2. Confiabilidade insuficiente para atos criticos

Nao existe ainda um contrato forte de fim de tarefa para:

- protocolo;
- anexacao final;
- confirmacao de envio;
- comprovacao de conclusao.

Para tarefas criticas, o aparato atual ainda precisa de:

- verificacao por etapa;
- verificacao semantica;
- evidencia final de conclusao;
- reverificacao independente;
- fallback visual final.

### 3. Falta de variante explicita de superficie

O Brain ja aprende micro-flows, mas o aparato ainda pode ganhar robustez ao
separar melhor variantes como:

- advogado;
- servidor;
- gabinete;
- autenticado versus nao autenticado;
- familia de tela/tribunal.

Task aberta para atacar esse gap:

- [docs/future-tasks/PJE-UNIVERSALIZATION-SPRINT.md](./future-tasks/PJE-UNIVERSALIZATION-SPRINT.md)

## Recomendacao pratica para a linha atual

Se a intencao e fortalecer o produto sem reabrir caminho legado, a ordem mais
segura e:

1. continuar concentrando operacao PJe na skill interna de orquestracao `pje_browser_use`;
2. usar as skills segmentadas apenas como fallback e apoio;
3. transformar os eventos tecnicos atuais em breadcrumbs legiveis ao usuario;
4. criar politica de verificacao forte para intents criticas como protocolo;
5. exigir evidencia final antes de marcar tarefa critica como concluida.

Se a intencao agora e fechar o escopo de lancamento, isso tambem implica:

6. adiar a Agora e qualquer expansao de workflow duravel para o pos-lancamento;
7. concentrar QA, UX e copy no fluxo PJe/TJ que ja esta mais perto de ficar
   vendavel.

## Resumo executivo

Hoje o aparato de PJe da Lex tem:

- 1 skill interna de orquestracao universal;
- 8 skills legadas/fallback de automacao;
- 2 utilitarias ativas;
- Brain com replay e memoria operacional;
- discovery/memoria de seletores;
- memoria de rotas;
- canal funcional de logs para a UI.

O proximo salto nao e criar mais dezenas de skills por fluxo.
O proximo salto e:

- melhorar transparencia;
- aumentar confiabilidade por verificacao em camadas;
- consolidar ainda mais a skill interna de orquestracao como interface principal do PJe.
- usar esse aparato como espinha dorsal do MVP antes de retomar a Agora.

## Mapa do MVP

Se o objetivo agora e fechar escopo para lancar, o mapa pratico fica assim:

### 1. Pronto ou quase pronto para o MVP

Estas capacidades ja estao no caminho principal ou muito perto dele:

| Capacidade | Estado | Base atual | O que falta para chamar de MVP |
| --- | --- | --- | --- |
| Diagnosticar estado do PJe/browser | pronto | `pje_status` + bridge local | smoke test e copy mais amigavel |
| Abrir tela de consulta do PJe | pronto | `pje_abrir_consulta` | validar fluxo real no TJPA |
| Inspecionar contexto da tela atual | pronto | `pje_inspecionar_contexto` | melhorar narracao para usuario |
| Preencher numero do processo com validacao | quase pronto | `pje_preencher_numero` | validar UX/dry-run no fluxo real |
| Clicar em Consultar com guarda de seguranca | quase pronto | `pje_clicar_consultar` | validar comportamento em tela real |
| Ler resultados da consulta sem abrir processo | quase pronto | `pje_ler_resultados` | confirmar consistencia no TJPA |
| Abrir autos com HITL | quase pronto | bridge local + confirmacao no Electron | reforcar evidencia final do ato |
| Baixar documento atual com HITL | quase pronto | bridge local + browser controlado | smoke test de download em ambiente real |
| Analisar documento baixado | pronto no escopo MVP | fluxo Console Lex + documentos locais | fechar teste manual no PDF recente |
| Operacao generica assistida com replay | quase pronto | `pje_browser_use` + Brain replay | breadcrumbs e validacao final mais forte |

### 2. Existe e ajuda, mas entra como apoio/fallback

Estas pecas sao uteis, mas nao devem ser vendidas como superficie principal do
MVP:

No codigo, isso agora tambem ficou isolado explicitamente em
`electron/skills/pje/index.ts`: `pje_browser_use` e a camada de orquestracao local, as
utilitarias ficam sempre ativas, e as skills abaixo entram apenas como
`fallback de compatibilidade` quando o caminho MCP/browser-use nao estiver
disponivel.

| Capacidade | Estado | Papel no MVP |
| --- | --- | --- |
| `pje_abrir` | legado/fallback | abrir sessao quando o caminho canonico nao cobrir |
| `pje_agir` | legado/fallback | exploracao assistida, nao contrato principal |
| `pje_consultar` | legado/fallback | fallback para consulta antiga |
| `pje_movimentacoes` | legado/fallback | leitura complementar, nao trilha principal |
| `pje_documentos` | legado/fallback | apoio quando a skill de orquestracao nao bastar |
| `pje_navegar` | legado/fallback | navegacao auxiliar por rota/agent |
| `pje_preencher` | legado/fallback | preenchimento auxiliar fora do fluxo principal |
| `pje_bulk_coletar` | legado/fallback | coleta massiva simples, fora do MVP vendavel imediato |
| `pje_verificar_token` | utilitaria ativa | preflight importante |
| `pedir_codigo_totp` | utilitaria ativa | HITL claro para 2FA |

### 3. Nao deve entrar no MVP como promessa principal

Mesmo que algumas bases existam, nao devemos vender isso agora:

| Capacidade | Motivo para ficar fora |
| --- | --- |
| Protocolo autonomo | confiabilidade e risco ainda insuficientes |
| Peticionamento sem confirmacao forte | foge da politica HITL |
| Juntada/assinatura automatica como fluxo comum | falta evidencia final e reverificacao |
| Automacao massiva irrestrita entre tribunais | variacao operacional alta demais |
| Workflow duravel/Agora | escopo postergado para pos-lancamento |

### 4. O que falta para fechar o MVP de PJe/TJ

Nao faltam dezenas de features. Faltam poucos fechamentos de produto:

| Falta | Impacto |
| --- | --- |
| Breadcrumbs legiveis no lugar de logs tecnicos | melhora confianca e demo |
| Evidencia final para atos sensiveis | reduz risco operacional |
| Teste real assistido do TJPA de ponta a ponta | principal gate de realidade |
| Smoke test de download e analise de documento no fluxo real | fecha a demo vendavel |
| Copy comercial clara sobre leitura vs acao sensivel | evita oversell |

### 5. Ordem recomendada de fechamento

Se a gente for atacar isso com disciplina, a sequencia mais forte e:

1. fechar `consulta -> ler resultados -> abrir autos -> baixar documento -> analisar documento`;
2. melhorar a narracao do `pje_browser_use` e das bridge tools;
3. endurecer evidencia final nos pontos sensiveis;
4. executar o roteiro real do TJPA e ajustar o que quebrar;
5. so depois pensar em ampliar superficie.
