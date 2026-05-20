# PJe Advogado-First Validation

> **Atualizacao em 2026-05-19:** a validacao real `advogado-first` foi executada
> com sucesso no fluxo principal de produto:
> `consulta -> resultado -> autos -> download do documento atual -> analise da sentenca`.
> O principal bloqueio de login/rede foi superado, e os falsos negativos de
> autenticacao/superficie foram corrigidos no classificador do PJe.
>
> Evidencia real confirmada no app:
>
> - consulta do processo `0886971-84.2025.8.14.0301`;
> - abertura correta dos autos;
> - leitura de movimentacoes e metadados do documento atual;
> - download da sentenca;
> - analise juridica coerente da decisao.
>
> O que segue pendente aqui nao e mais o eixo `advogado-first`, e sim expansao
> posterior (`server-readiness`, refinamentos e novos cenarios).
>
> **Atualizacao em 2026-05-13:** como o acesso real disponivel hoje e de
> `advogado`, a validacao pratica desta fase passa a ser `advogado-first`.
> O objetivo e confirmar se a Lex ja esta se comportando como agente situado no
> PJe real, sem bloquear a evolucao por falta de acesso imediato ao perfil de
> `servidor`.

**Status:** validacao principal de `advogado` concluida com sucesso; `server-readiness` continua como frente posterior.  
**Contexto relacionado:** [`docs/PJE-SKILLS-APPARATUS.md`](../PJE-SKILLS-APPARATUS.md),
[`docs/future-tasks/PJE-UNIVERSALIZATION-SPRINT.md`](./PJE-UNIVERSALIZATION-SPRINT.md),
[`electron/skills/pje/browser-use.ts`](../../electron/skills/pje/browser-use.ts),
[`electron/pje/action-guidance.ts`](../../electron/pje/action-guidance.ts),
[`electron/brain/replay-engine.ts`](../../electron/brain/replay-engine.ts).

## Objetivo

Esta task agora tem papel de gate de realidade dentro do roadmap novo
`Markdown-first`: antes de promover mais aprendizagem para memoria duravel,
precisamos confirmar que a base operacional atual realmente se comporta bem no
PJe real.

Responder, com evidencia pratica, estas perguntas:

1. a Lex esta identificando corretamente o ambiente real do PJe de advogado?
2. a Lex esta escolhendo uma rota coerente para o objetivo pedido?
3. a Lex esta reaproveitando o aprendizado certo depois de repetir a tarefa?
4. a arquitetura atual continua suficientemente neutra para absorver `servidor`
   depois, sem hardcode excessivo de `advogado`?

## Resultado real obtido

Na rodada de validacao em 2026-05-19:

- a Lex consultou o processo corretamente no TJPA;
- a Lex abriu o resultado certo e entrou nos autos;
- a Lex leu autos e movimentacoes com resposta coerente;
- a Lex baixou a sentenca atual;
- a Lex analisou a sentenca com resumo juridico util.

Tambem houve uma correcao importante durante a validacao:

- o classificador do PJe estava confundindo `painel logado` com `login`;
- isso gerava falso `authState=nao_logado`;
- a heuristica foi ajustada e o fluxo voltou a operar de forma consistente.

## Principio de execucao

Nao vamos travar a evolucao esperando acesso de servidor.

Vamos dividir a validacao em dois eixos:

- `advogado real`: validacao obrigatoria, com sinal confiavel de produto;
- `server-readiness`: checklist estrutural, observacional e arquitetural para
  garantir que o motor nao esta enviesado demais para advogado.

Roteiro curto para execucao no app real:

- [`docs/future-tasks/PJE-ADVOGADO-FIRST-EXECUTION-CHECKLIST.md`](./PJE-ADVOGADO-FIRST-EXECUTION-CHECKLIST.md)

## Criterios de sucesso desta fase

Esta fase e considerada boa se:

- a Lex operar de forma consistente no PJe real de advogado;
- os logs/breadcrumbs mostrarem contexto, objetivo, replay e exploracao de modo
  legivel;
- o replay reutilizar a variante correta depois de 2-3 execucoes;
- os gaps restantes de `servidor` ficarem claramente identificados como
  validacao pendente, nao como confusao arquitetural.

**Leitura atual:** criterios principais de `advogado-first` atendidos para o
fluxo central do MVP.

## Bloco A - Validacao real de advogado

### Cenarios minimos obrigatorios

#### A1. Consulta simples de processo

Objetivo:

- validar percepcao basica e trilho `consulta -> resultado`.

Passos:

1. abrir o PJe de advogado;
2. pedir para a Lex consultar um processo conhecido;
3. observar contexto detectado, affordances, prioridade e ferramenta sugerida;
4. confirmar se a Lex preenche, consulta e reconhece a mudanca para resultados.

Sinais esperados:

- contexto compativel com `advogado`;
- `intent=consultar`;
- guidance apontando campo de processo e acao de consulta;
- sem insistencia em mural/pastas de servidor.

Falhas a observar:

- perfil errado;
- tentativa de navegar para superficie inexistente no advogado;
- escolha de candidato DOM ruim;
- falta de validacao de mudanca de superficie.

#### A2. Consulta -> abrir resultado -> autos

Objetivo:

- validar transicao entre superfícies e escolha de rota coerente.

Passos:

1. repetir a consulta;
2. pedir para abrir o resultado correto;
3. observar se a Lex distingue `resultado_consulta` de `autos`;
4. confirmar se a abertura muda o contexto de forma consistente.

Sinais esperados:

- `intent=abrir_resultado` quando apropriado;
- replay/contexto nao confundindo consulta com autos;
- leitura correta da mudanca de superficie.

Falhas a observar:

- abrir processo errado;
- cair em leitura de autos cedo demais;
- tentar consultar de novo em vez de abrir resultado.

#### A3. Leitura de autos

Objetivo:

- validar comportamento read-only e prudencia em superficie de autos.

Passos:

1. com o processo aberto, pedir leitura dos autos;
2. observar se a Lex prioriza leitura e inspecao em vez de novas acoes;
3. verificar se logs e breadcrumbs explicam que a superficie atual ja e de
   autos.

Sinais esperados:

- `intent=ler_autos`;
- guidance de leitura read-only;
- baixa propensao a cliques desnecessarios.

Falhas a observar:

- tentativa de reabrir resultado;
- tentativa de navegar sem necessidade;
- mistura de leitura com acao sensivel.

#### A4. Repeticao para medir replay

Objetivo:

- validar se o Brain esta reaproveitando a variante certa.

Passos:

1. repetir A1-A3 com processo semelhante;
2. observar se aparece `replay conhecido` ou preview coerente;
3. confirmar se a variante reaproveitada bate com o objetivo e o estilo da
   superficie atual.

Sinais esperados:

- melhora de consistencia;
- menos exploracao cega;
- replay escolhendo o flow certo por contexto/objetivo/estilo.

Falhas a observar:

- replay puxando variante errada;
- replay mais atrapalhando do que ajudando;
- falta de clareza sobre por que um replay foi escolhido ou recusado.

## Bloco B - Server-readiness

Este bloco nao exige acesso real imediato. Ele serve para verificar se a base
atual esta preparada para absorver o servidor depois.

### Checklist estrutural

- [ ] `profileKind`, `surfaceKind`, `screenFamily` e `areaLabel` nao estao
      assumindo advogado por default.
- [ ] `acessar_pastas` continua sendo tratado como affordance contextual, nao
      como comportamento universal.
- [ ] replay continua dependente de contexto e estilo, nao apenas de
      `tribunal + pjeContext`.
- [ ] guidance continua emitindo `navigate first` quando a superficie nao expor
      a affordance certa.
- [ ] logs/breadcrumbs continuam legiveis o bastante para debug "nas escuras".

### Cenarios para simulacao mental/revisao assistida

- `servidor > mural > consulta indireta`
- `servidor > fila/pasta > abrir item`
- `servidor > autos`

Perguntas de readiness:

1. se essa superficie aparecesse hoje, a Lex tentaria operar como advogado?
2. ela teria sinais suficientes para perceber que nao esta em consulta direta?
3. ela cairia para exploracao conservadora em vez de insistir em um flow fixo?

## Evidencias que devemos coletar

Para cada execucao real de advogado, registrar:

- prompt/objetivo;
- contexto detectado;
- intent/resumo de guidance;
- se houve replay, exploracao ou mistura dos dois;
- resultado final;
- ponto de erro, se houver;
- ajuste que o erro sugere.

Se possivel, salvar:

- screenshot ou texto do breadcrumb;
- resumo do replay preview;
- observacao manual do usuario sobre "pareceu inteligente" vs "pareceu macro".

## Tabela de avaliacao

| Bloco | Pergunta | Resultado esperado | Status |
| --- | --- | --- | --- |
| Percepcao | A Lex reconheceu que esta no PJe de advogado? | contexto coerente e legivel | passou |
| Decisao | A rota escolhida bateu com a superficie atual? | consulta, resultado e autos sem confusao | passou |
| Aprendizado | O replay melhorou a segunda tentativa? | menos exploracao, mais coerencia | passou com ressalvas |
| Narracao | Os breadcrumbs explicaram o comportamento? | usuario entende o que a Lex fez | passou |
| Server-readiness | A arquitetura continua neutra para servidor? | sem hardcode de advogado | pendente |

## Decisao ao final da validacao

### Se a validacao de advogado for boa

- seguir com ajustes finos pontuais;
- depois retomar a universalizacao/servidor com mais confianca.

**Estado atual:** esta e a leitura correta desta task.

### Se a validacao de advogado for mediana

- parar expansao de arquitetura;
- corrigir primeiro percepcao, guidance ou replay onde houve erro real.

### Se a validacao de advogado for ruim

- congelar novas camadas de Brain/replay por enquanto;
- voltar para o trilho minimo e endurecer comportamento base no mundo real.

## Recomendacao pratica

Rodar esta validacao em duas passadas:

1. `passada 1`: observar a Lex quase sem interferencia para descobrir onde ela
   erra;
2. `passada 2`: depois dos ajustes, repetir os mesmos cenarios para medir se o
   replay e a situacao melhoraram.

## Resultado esperado desta task

Ao fim desta validacao, devemos saber:

- se estamos mesmo no caminho certo com o agente PJe;
- quais partes ja estao boas o bastante para continuar expandindo;
- e quais gaps ainda precisam ser resolvidos antes de insistir em mais camadas
  de autonomia.
