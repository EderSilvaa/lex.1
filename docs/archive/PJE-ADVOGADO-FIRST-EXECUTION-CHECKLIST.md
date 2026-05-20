# PJe Advogado-First Execution Checklist

> **Atualizacao em 2026-05-19:** a execucao assistida principal foi concluida.
> O fluxo central do MVP passou no PJe real de advogado:
> `consulta -> abrir autos -> baixar documento atual -> analisar sentenca`.
>
> Resultado consolidado:
>
> - Caso 1 `consulta simples`: passou
> - Caso 2 `abrir resultado correto`: passou
> - Caso 3 `leitura de autos`: passou
> - Extensao pratica nao prevista no roteiro curto: `baixar e analisar sentenca`: passou
>
> O documento continua util como roteiro de repeticao/regressao, mas nao esta mais
> bloqueado por login/rede.
>
> **Atualizacao em 2026-05-13:** este documento e o roteiro curto para executar
> a validacao `advogado-first` no app real, sem transformar a sessao em um teste
> pesado demais.

**Status:** roteiro validado na pratica; agora serve como checklist de regressao.  
**Usa como base:** [`docs/future-tasks/PJE-ADVOGADO-FIRST-VALIDATION.md`](./PJE-ADVOGADO-FIRST-VALIDATION.md)

## Como usar

Rodar em duas passadas:

1. `passada 1`: observar a Lex quase sem interferir;
2. `passada 2`: repetir depois de ajustes para ver se replay e coerencia melhoraram.

## Observacao atual

No estado atual:

- o roteiro cumpriu seu papel de validar o trilho principal do MVP no PJe real;
- o maior erro encontrado foi um falso `nao_logado`, depois corrigido no classificador;
- o proximo uso mais valioso deste checklist e regressao, nao desbloqueio inicial.

Preencher para cada caso:

- `resultado`: passou / passou com ressalvas / falhou
- `contexto detectado`
- `o que a Lex tentou`
- `onde acertou`
- `onde errou`
- `ajuste sugerido`

## Preparacao

Antes de comecar:

- abrir o app da Lex;
- abrir o PJe real de advogado;
- garantir um processo seguro para teste;
- preferir cenarios de leitura/consulta antes de qualquer acao sensivel;
- deixar pronto um lugar para anotar evidencias.

## Evidencias minimas por caso

Coletar, se possivel:

- breadcrumb/contexto detectado;
- intent e guidance principal;
- se houve replay, exploracao ou mistura;
- resumo final da Lex;
- screenshot ou texto curto do ponto onde acertou/errou.

## Caso 1 - Consulta simples

### Prompt sugerido

`Consulte o processo [NUMERO] no PJe e me diga o que encontrou.`

### O que observar

- a Lex reconheceu que esta no PJe de advogado?
- ela detectou `intent=consultar`?
- ela apontou campo de numero e acao de consulta?
- ela evitou comportamento de `mural/pasta/servidor`?
- ela validou a mudanca para resultados?

### Resultado

- [x] passou
- [ ] passou com ressalvas
- [ ] falhou

### Notas

- contexto detectado: PJe TJPA de advogado, autenticado, fluxo de consulta valido
- acao principal escolhida: abrir consulta estruturada, preencher numero e consultar
- erro observado: falso negativo de autenticacao em rodada anterior, corrigido
- ajuste sugerido: manter regressao especifica para `painel logado != login`

## Caso 2 - Abrir resultado correto

### Prompt sugerido

`Abra o resultado correto desse processo e entre nos autos.`

### O que observar

- a Lex percebeu que esta em `resultado_consulta` e nao em `autos` ainda?
- ela mudou o intent para `abrir_resultado`?
- ela abriu o resultado certo?
- ela reconheceu a mudanca de superficie para autos?

### Resultado

- [x] passou
- [ ] passou com ressalvas
- [ ] falhou

### Notas

- contexto detectado: resultado de consulta antes da transicao para autos
- alvo clicado: resultado correto do processo consultado
- erro observado: nenhum bloqueante na rodada validada
- ajuste sugerido: manter guarda para evitar reabrir consulta quando a intencao for autos

## Caso 3 - Leitura de autos

### Prompt sugerido

`Agora leia os autos desse processo e me resuma o que esta na tela.`

### O que observar

- a Lex mudou para `intent=ler_autos`?
- ela priorizou leitura e inspecao em vez de navegar sem necessidade?
- os breadcrumbs explicaram que a superficie atual ja era de autos?
- ela evitou acao sensivel desnecessaria?

### Resultado

- [x] passou
- [ ] passou com ressalvas
- [ ] falhou

### Notas

- contexto detectado: autos abertos com documento atual e movimentacoes visiveis
- leitura feita: resumo de documento atual, partes e ultimas movimentacoes
- erro observado: nenhum bloqueante na rodada validada
- ajuste sugerido: seguir com checks de qualidade de narracao, nao de acesso

## Caso 4 - Repeticao para medir replay

### Prompt sugerido

`Repita a consulta e abra os autos de um processo semelhante.`

### O que observar

- apareceu sinal de `replay conhecido` ou preview?
- a variante reaproveitada bateu com objetivo e superficie?
- a segunda execucao pareceu mais coerente do que a primeira?
- o replay ajudou ou atrapalhou?

### Resultado

- [ ] passou
- [ ] passou com ressalvas
- [ ] falhou

### Notas

- houve replay:
- resumo do flow escolhido:
- erro observado:
- ajuste sugerido:

## Leitura de decisao ao final

### Se 3 ou 4 casos passarem

- estamos no caminho certo;
- vale continuar expandindo universalizacao com mais confianca.

### Se so 2 casos passarem

- a base esta promissora, mas ainda precisa correcoes reais antes de continuar
  sofisticando muito a arquitetura.

### Se 0 ou 1 caso passar

- parar expansao de infra;
- voltar para correcoes de percepcao, guidance e replay no mundo real.

## Checklist de fechamento

- [x] caso 1 executado
- [x] caso 2 executado
- [x] caso 3 executado
- [ ] caso 4 executado
- [x] evidencias salvas
- [x] principais erros resumidos
- [x] decisao tomada: continuar / ajustar / pausar expansao
