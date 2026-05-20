# Lex Markdown-First Memory & Skills

Atualizado em 2026-05-19.

**Status geral:** implementacao principal concluida; validacao manual pendente.  
**Leitura pratica:** ja existe base tecnica relevante no Brain e na
universalizacao PJe, mas a arquitetura de memoria do produto foi
re-enquadrada para `Markdown-first`.

## Onde paramos

Ao parar esta frente, ficamos neste estado:

- a secao `Habilidades` ja foi reorganizada e filtrada para foco juridico;
- a UX ja explica `nota`, `playbook` e `skill`;
- a curadoria explicita ja existe com os destinos:
  - `nota`
  - `playbook`
  - `manter so no Brain`
  - `descartar`
- as decisoes de curadoria ja influenciam a fila de promocoes futuras;
- `type-check`, `build` e checagem sintatica do renderer passaram.

Pendencia real ao parar:

- validacao manual no app aberto ficou bloqueada por problema externo de
  login/rede, entao a implementacao ficou pronta, mas a UX final ainda nao foi
  exercitada ponta a ponta no uso real.

## Motivo

A Lex herdou do Hermes uma base mais forte do que parecia inicialmente para:

- memoria persistente entre sessoes;
- autocuragem de conhecimento;
- skills como memoria procedural;
- eventual autocriacao/evolucao de skill;
- operacao centrada em arquivos legiveis, especialmente `SKILL.md` e docs.

Com isso, a direcao mais coerente deixa de ser `Brain-first` e passa a ser
`Markdown-first`, com o Brain ficando como camada opcional de execucao e
aceleracao.

## Decisao

Fonte principal de verdade da memoria da Lex:

- `Hermes + markdown + skills`

Camada opcional de aceleracao operacional:

- `Brain`

Em termos praticos:

- conhecimento duravel, juridico, curado e auditavel deve tender a viver em
  `SKILL.md`, notas e docs;
- memoria do agente, preferencias, correcoes e fatos persistentes continuam no
  Hermes;
- rastros tecnicos de browser, replay e variantes de execucao podem continuar
  no Brain quando fizer sentido;
- o usuario deve conseguir operar bem a Lex sem depender do Brain ativado.

## Divisao recomendada

### 1. Fica no Hermes / Markdown

- aprendizagem juridica;
- heuristicas de tribunais;
- guias e playbooks de navegacao;
- dossie por processo ou pasta;
- curadoria de documentos;
- preferencias e correcoes do usuario;
- skills criadas ou refinadas como memoria procedural.

### 2. Fica no Brain

- `page_state`;
- `domHash`;
- seletor que funcionou;
- micro-replay;
- rota de tela;
- estilo de execucao;
- pistas operacionais efemeras ou muito granulares.

### 3. Ponte desejada

O Brain nao deve ser silo.

Quando houver aprendizagem operacional relevante, a Lex deve poder promover
isso para uma camada mais duravel/legivel, por exemplo:

- uma nota `.md`;
- uma skill refinada;
- um playbook de tribunal;
- uma memoria sintetica no Hermes.

## Painel de produto

A nova secao `Habilidades` da sidebar deve evoluir para ser a superficie visivel
dessa estrategia.

Ela deve consolidar:

1. catalogo de skills;
2. skills ativas na runtime;
3. skills locais/criadas/aprendidas;
4. memorias e curas recentes;
5. indicacao de quando o Brain esta ligado ou desligado;
6. ponte entre conhecimento duravel e execucao operacional.

## Definicoes operacionais

### Nota

`Nota` e a unidade mais leve de promocao.

Funcao:

- registrar um aprendizado curto;
- preservar contexto util para o humano;
- servir como memoria rapida de caso, processo, tribunal ou documento.

Quando faz mais sentido:

- observacao ainda curta ou pontual;
- contexto muito ligado a um processo/caso especifico;
- insight util para atuacao juridica, mas ainda sem procedimento repetivel claro;
- alerta, heuristica ou licao aprendida.

Exemplos:

- "Neste processo, a movimentacao X costuma aparecer antes do documento Y."
- "No perfil de advogado do TJPA, esta tela se comportou assim."
- "Este documento tem padrao de leitura que vale lembrar neste caso."

Pergunta que a nota responde:

- `o que aprendemos aqui?`

### Playbook

`Playbook` e uma promocao mais estruturada.

Funcao:

- documentar um caminho repetivel;
- orientar execucao futura com mais consistencia;
- servir de ponte entre observacao e eventual skill procedural.

Quando faz mais sentido:

- o fluxo ja se repetiu;
- existe sequencia de passos clara;
- a aprendizagem nao esta presa a um caso unico;
- vale reaplicar em outros processos, telas ou rotinas parecidas.

Exemplos:

- "Como consultar processo e abrir autos no TJPA."
- "Como baixar e analisar documento no fluxo do advogado."
- "Como revisar uma trilha de documentos antes de peticionar."

Pergunta que o playbook responde:

- `como executar isso de novo com confianca?`

### Skill

`Skill` e memoria procedural mais madura.

Funcao:

- encapsular comportamento operacional reutilizavel;
- permitir acionamento mais formal pelo agente;
- consolidar um procedimento ja suficientemente estavel.

Quando faz mais sentido:

- o procedimento ja esta maduro;
- o contexto de uso esta claro;
- a execucao e recorrente o bastante para virar capacidade acionavel.

Pergunta que a skill responde:

- `como a Lex deve agir quando isso for pedido de novo?`

## Regra curta de promocao

- `nota`: insight, memoria de caso, contexto, alerta ou aprendizagem ainda curta;
- `playbook`: procedimento repetivel, checklist, rota operacional;
- `skill`: procedimento maduro, reutilizavel e acionavel;
- `fica so no Brain`: rastro tecnico, replay efemero ou detalhe granular demais.

## Importante

Essa logica nao existe apenas para navegacao PJe.

Ela tambem deve servir para:

- memoria de casos;
- memoria por processo;
- dossie de atuacao juridica;
- curadoria de documentos;
- estrategias e licoes aprendidas durante a execucao do trabalho juridico.

## Reorganizacao dos planos existentes

### Brain/Dream/Replay

O plano antigo continua valido para:

- replay;
- observer;
- traces;
- seletor/flow learning;
- export seguro;
- validacao operacional.

Mas deixa de ser trilha de expansao para memoria geral do produto.

### Universalizacao PJe

O plano continua valido para:

- contexto situado;
- variantes por perfil/superficie;
- guidance e exploracao contextual;
- replay contextual.

Mas deve parar de tratar o Brain como destino natural de toda aprendizagem
duravel. O que for conhecimento reutilizavel em alto nivel deve tender a
subir para Hermes/Markdown.

## Sprints sugeridas

### Sprint A - Reframing e observabilidade

- [x] alinhar docs centrais para `Markdown-first`;
- [x] ajustar linguagem inicial do produto: `Habilidades`, `memoria`, `Brain opcional`;
- [x] explicitar em UI o papel de cada camada.

### Sprint B - Painel vivo de Habilidades

- [x] mostrar catalogo herdado + local;
- [x] mostrar runtime skills ativas;
- [x] mostrar skills criadas/alteradas recentemente;
- [x] mostrar memorias/curas recentes do Hermes.
- [x] mostrar skills usadas recentemente na sessao/tarefa.

### Sprint C - Promocao de aprendizagem

- [x] expor candidatos de promocao no painel `Habilidades`;
- [x] gerar preview de promocao sem escrita automatica;
- [x] criar fluxo inicial de aprovacao/curadoria com rascunho seguro em `docs/promotions/`;
- [x] definir quando observacao operacional vira nota `.md`;
- [x] definir quando vira playbook;
- [ ] definir quando vira skill;
- [ ] definir quando fica so no Brain;
- [x] evoluir a aprovacao para curadoria mais rica, incluindo `nota`, `playbook`, `manter no Brain` e `descartar`.
- [ ] adicionar revisao mais profunda antes de publicar/promover para skill.

### Sprint D - Brain opt-in

- [ ] tornar o Brain claramente opcional no produto;
- [ ] permitir ligar/desligar modo replay/autonomia;
- [ ] manter a Lex util e auditavel mesmo sem Brain.

## Roadmap executivo

### Fase 0 - O que ja foi feito

Esta fase nao e mais hipotese. Ja esta entregue ou bem avancada:

- contexto situado do PJe;
- replay contextual;
- selector-memory e route-memory contextuais;
- guidance de exploracao;
- aprendizado de exploracao;
- `next best action` contextual;
- secao `Habilidades` inicial na sidebar;
- docs centrais reorientados para `Markdown-first`.

Isso significa que nao estamos voltando a estaca zero. Estamos corrigindo a
camada de produto e memoria em cima do que ja foi construido.

### Fase 1 - Validar o motor atual no mundo real

Objetivo: confirmar que a base operacional atual realmente ajuda, antes de
promover mais conhecimento.

Entregas:

- [ ] rodar validacao `advogado-first` no PJe real;
- [ ] registrar onde a Lex percebe bem contexto e onde ainda se perde;
- [ ] medir quando replay ajuda e quando atrapalha;
- [ ] congelar novas camadas de Brain se a validacao real pedir correcao antes.

Docs relacionados:

- [`docs/future-tasks/PJE-ADVOGADO-FIRST-VALIDATION.md`](./PJE-ADVOGADO-FIRST-VALIDATION.md)
- [`docs/future-tasks/PJE-UNIVERSALIZATION-SPRINT.md`](./PJE-UNIVERSALIZATION-SPRINT.md)

### Fase 2 - Evoluir Habilidades para painel vivo

Objetivo: tornar visivel ao usuario o que o Hermes e a memoria da Lex estao
fazendo.

Entregas:

- [x] mostrar skills ativas da runtime Hermes/WSL;
- [x] mostrar skills usadas recentemente;
- [x] mostrar skills locais e skills aprendidas;
- [x] mostrar memorias e curas recentes;
- [x] mostrar quando o Brain foi usado, e em que modo.

Resultado esperado:

- o usuario entende o que a Lex sabe;
- o usuario entende o que a Lex aprendeu;
- o usuario consegue governar essa aprendizagem.

**Estado atual:** concluida do ponto de vista de implementacao.

### Fase 3 - Promocao de aprendizagem operacional

Objetivo: fechar o ciclo `explorar -> navegar -> conquistar`.

Entregas:

- [x] expor candidatos de promocao a partir de flows/traces do Brain;
- [x] gerar preview de nota/playbook/skill antes de qualquer promocao real;
- [x] definir quando uma observacao operacional vira nota `.md`;
- [x] definir quando vira playbook;
- [ ] definir quando vira skill procedural;
- [ ] definir quando continua apenas no Brain;
- [x] criar curadoria explicita para `nota`, `playbook`, `manter no Brain` e `descartar`.
- [ ] criar politica de curadoria/aprovacao para promocoes sensiveis e promocao para skill.

Resultado esperado:

- o Brain deixa de ser silo tecnico;
- o que foi aprendido no PJe pode subir para conhecimento duravel.

**Estado atual:** concluida para `nota` / `playbook` / `manter no Brain` /
`descartar`; faltam a validacao manual no app e a camada posterior de
promocao para `skill`.

### Fase 4 - Brain opt-in de produto

Objetivo: tornar o Brain um acelerador opcional, nao precondicao de valor.

Entregas:

- [ ] expor claramente `Brain ligado/desligado`;
- [ ] separar modo `somente conhecimento/markdown` de modo `autonomia/replay`;
- [ ] garantir que a Lex continua util sem Brain;
- [ ] permitir ligar autonomia quando o usuario quiser mais agressividade operacional.

Resultado esperado:

- simplicidade de manutencao;
- auditabilidade;
- produto mais confiavel e menos caixa-preta.

## Prioridade de implementacao

Ordem recomendada a partir de agora:

1. `validar no PJe real de advogado`;
2. `tornar Habilidades um painel vivo`;
3. `criar a ponte Brain -> markdown/skill`;
4. `so depois continuar sofisticando autonomia`.

## O que muda no que ja fizemos

### Continua valido

- quase toda a base tecnica de contexto, replay e exploracao;
- a secao `Habilidades` como superficie de produto;
- a universalizacao PJe como motor de operacao situada.

### Precisa mudar de direcao

- parar de empurrar memoria geral do produto para dentro do Brain;
- parar de tratar toda aprendizagem como trace tecnico;
- usar `Hermes + markdown + skills` como destino principal do conhecimento duravel.

### Fica explicitamente adiado

- expandir Dream/Brain como centro da memoria do produto;
- transformar PJe em floresta de novos flows fixos;
- reabrir Agora no caminho critico do MVP.

## Criterio de sucesso

Essa direcao fica boa quando:

- o conhecimento duravel da Lex e legivel e curavel em markdown;
- o Hermes continua como memoria principal do agente;
- o Brain fica restrito ao que e operacional e tecnico;
- o usuario entende isso pela UI;
- a Lex aprende sem virar uma caixa-preta tecnica dificil de manter.
