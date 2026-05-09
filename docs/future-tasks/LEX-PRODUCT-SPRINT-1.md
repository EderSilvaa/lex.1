# Lex Product Sprint 1 - Console Lex como produto provisorio

> **Atualizacao em 2026-05-09:** Console Lex continua interface operacional, mas
> a arquitetura agora distingue inline multiagente (chat/Console) de workflow
> duravel (Agora). A aba Lotes foi substituida por Agora e nao deve guiar produto
> novo.

Objetivo da sprint: deixar a Lex com cara de produto unificado usando o terminal
como interface principal por enquanto. A decisao sobre chat visual fica para o
fim; nesta sprint o Console Lex deve parecer intencional, funcional e seguro.

## Norte

```text
Lex Desktop = produto visivel, permissoes, PJe, arquivos e status
Console Lex = interface principal temporaria do agente
Lex Engine = motor local por baixo
MCP lex-desktop = contrato entre motor e desktop
```

## Fora de escopo

- reconstruir chat visual;
- protocolo/peticionamento no PJe;
- automacao profunda de processo inteiro;
- refatorar monorepo;
- trocar o motor Hermes/Lex Engine internamente.

## Estado atual observado

- A UI principal ja usa marca Lex.
- A aba Terminal ja existe e abre uma sessao do Engine.
- O status mostra `Motor off`, `Motor local ativo` e botao `Abrir motor`.
- O MCP `lex-desktop` ja esta funcional e expoe tools PJe/Brain.
- Fluxo tecnico ja provado:
  - abrir consulta PJe;
  - preencher numero CNJ;
  - pesquisar;
  - ler resultados;
  - abrir autos com HITL;
  - ler autos;
  - baixar documento atual;
  - analisar PDF baixado localmente.

## Task 1 - Inventario de textos visiveis

Mapear strings visiveis que ainda vazam implementacao ou marca antiga.

Arquivos-alvo iniciais:

- `src/renderer/index.html`
- `src/renderer/js/terminal.js`
- `src/renderer/styles/terminal.css`
- `electron/lex-engine.ts`
- `electron/lex-desktop-bridge.ts`
- `scripts/lex-desktop-mcp-server.mjs`

Checklist:

- [x] separar strings de produto (`Lex`, `Console Lex`, `Motor local`);
- [x] separar strings tecnicas aceitaveis (`Lex Engine`, `MCP`, `WSL`) para
      diagnostico;
- [x] manter `hermes` apenas quando for comando interno, path ou doc tecnico;
- [ ] nao alterar referencias juridicas reais contendo "Hermes" em modelos ou
      jurisprudencia.

Pronto quando:

- busca por `Hermes|hermes|HERMES` em UI/runtime retornar apenas detalhes
  tecnicos ou docs.

## Task 2 - Console Lex: primeira impressao

Melhorar a primeira tela do terminal sem trocar a tecnologia.

Entregas:

- [x] aba renomeada para `Console Lex` ou manter `Terminal` com subtitulo claro;
- [x] sessao inicial com nome `Lex 1` em vez de `Engine 1`, se nao quebrar fluxo;
- [x] mensagem inicial curta:
  - Lex local;
  - PJe e arquivos passam por confirmacao;
  - comandos juridicos podem ser pedidos em linguagem natural;
- [x] status com tooltip mais claro quando o motor estiver off;
- [x] erro amigavel quando WSL/projeto/motor nao forem encontrados.

Pronto quando:

- ao abrir o app, o usuario entende que esta no console da Lex, nao em um shell
  tecnico improvisado.

### Mapeamento detalhado da Task 2

Objetivo especifico: fazer o primeiro contato com o Console Lex parecer uma
experiencia intencional de produto, mantendo o terminal como ferramenta principal.

#### 2.1 Entrada visual

- [x] item da sidebar com nome `Console`, tooltip `Console Lex`;
- [x] barra superior com status do motor antes das abas;
- [x] botao principal `Novo console`;
- [x] seletor `Fluxos` visivel, sem exigir comandos decorados.

Pronto quando:

- ao abrir o app, a palavra mais visivel da area e Lex/Console, nao Terminal ou
  Engine.

#### 2.2 Nome de sessao

- [x] sessoes do motor nomeadas como `Lex 1`, `Lex 2`, etc.;
- [x] sessoes locais auxiliares nomeadas como `Lex local N`;
- [x] revisar se ainda precisamos expor sessao `Lex local` no botao `+`;
- [ ] decidir se o `+` deve abrir outro Console Lex ou ficar reservado para modo
      tecnico.

Pronto quando:

- nenhuma aba padrao aparece como `Engine 1`.

#### 2.3 Mensagem inicial

Mensagem atual implementada:

```text
Console Lex
Use este console para conversar com a Lex e acionar o PJe por tools seguras.
PJe, downloads, arquivos e atos sensiveis passam por confirmacao no Desktop.
```

Pendencias:

- [x] testar na tela real se a intro nao polui demais o output do Hermes;
- [ ] ajustar cor/contraste da intro se ficar apagada;
- [ ] decidir se deve mostrar uma sugestao curta de primeiro comando.

Pronto quando:

- a mensagem orienta sem parecer tutorial longo.

#### 2.4 Status do motor

Estado implementado:

- [x] `Motor on`;
- [x] `Motor off`;
- [x] `Verificando`;
- [x] tooltip com Windows path, WSL, projeto, bridge e diagnostico.
- [x] painel visual expandido no botao `Motor` com Motor, MCP, Bridge, Windows,
      WSL, Projeto e Comando.

Pendencias:

- [x] incluir explicitamente `MCP lex-desktop: ok/off` no tooltip ou em area
      futura de status;
- [ ] reduzir detalhes tecnicos do tooltip quando o usuario for final;
- [ ] manter detalhe tecnico acessivel para suporte/dev.

Pronto quando:

- se o motor falhar, o usuario sabe se o problema e WSL, caminho do projeto ou
  comando interno ausente.

#### 2.5 Linguagem de erro

Estado implementado:

- [x] erro ao abrir console fala `Erro ao abrir Console Lex`;
- [x] erro de projeto sugere verificar caminho do Lex Engine no WSL;
- [x] erro de WSL sugere verificar Ubuntu/WSL;
- [x] erro de comando interno nao aparece como marca antiga para usuario comum.

Pendencias:

- [ ] testar manualmente cenarios de falha real:
  - WSL fechado/indisponivel;
  - caminho do projeto errado;
  - comando interno ausente;
- [ ] garantir que stack traces longos nao ocupem a tela inteira.

Pronto quando:

- erro tecnico vira instrucao curta e acionavel.

#### 2.6 Fluxos no primeiro contato

Estado implementado:

- [x] seletor `Fluxos`;
- [x] prompts compactos para PJe/documento;
- [x] prompts com travas de nao peticionar, nao baixar autos completos e exigir
      confirmacao.

Pendencias:

- [x] validar se o prompt e enviado corretamente para a sessao ativa;
- [x] validar se o prompt nao perde caracteres no xterm;
- [x] avaliar se o seletor deve inserir prompt sem enviar, ou enviar direto;
- [ ] talvez adicionar um modo `copiar prompt` para advogado revisar antes.

Pronto quando:

- o usuario consegue iniciar um fluxo juridico util sem saber o nome das tools
  MCP.

#### 2.7 Coisas que nao entram nesta task

- nao redesenhar o chat;
- nao criar sistema completo de onboarding;
- nao esconder o terminal;
- nao mudar o motor;
- nao criar automacoes PJe novas;
- nao mexer em licenca ou pagamento.

#### 2.8 Teste manual recomendado

1. Abrir a Lex.
2. Confirmar sidebar: `Console`.
3. Confirmar barra: status `Motor on` ou erro amigavel.
4. Confirmar primeira aba: `Lex 1`.
5. Confirmar intro do Console Lex.
6. Abrir `Fluxos > Analisar documento baixado`.
7. Verificar se o prompt chega ao console.
8. Cancelar se for gastar API, ou deixar rodar se estiver em teste controlado.

#### 2.9 Criterio final da Task 2

Task 2 fica concluida quando:

- o Console Lex abre com identidade clara;
- status do motor e compreensivel;
- primeira sessao nao usa linguagem de backend;
- prompts de fluxo estao acessiveis;
- build passa;
- app reinicia;
- o usuario consegue olhar e dizer: "isso e a Lex em modo console", nao "isso e
  um terminal colado dentro do app".

## Task 3 - Atalhos de prompts juridicos

Criar atalhos que inserem prompts seguros no Console Lex.

Atalhos MVP:

- [x] `Consultar processo PJe`;
- [x] `Ler resultados da consulta`;
- [x] `Abrir autos com confirmacao`;
- [x] `Ler autos`;
- [x] `Baixar documento atual`;
- [x] `Analisar documento baixado`;
- [x] `Resumo juridico do documento`.

Regra:

- atalhos apenas inserem/enviam prompts;
- nenhuma acao sensivel acontece sem a tool pedir confirmacao no Electron;
- prompts devem ser compactos para economizar tokens.

Pronto quando:

- um fluxo PJe basico pode ser guiado por atalhos sem o usuario decorar nomes de
  tools MCP.

## Task 4 - Cartao de status do motor

Mostrar diagnostico simples e confiavel.

Campos:

- [x] Motor: on/off/verificando;
- [x] caminho Windows do projeto;
- [x] WSL distro/path;
- [x] comando do motor encontrado;
- [x] bridge local on/off;
- [x] MCP recomendado: `lex-desktop`;
- [x] ultima falha relevante sem stack trace gigante.

Pronto quando:

- se o motor nao abrir, a tela indica o problema provavel sem exigir terminal
  externo.

## Task 5 - Fluxo vendavel minimo no Console

Consolidar o fluxo que ja provamos tecnicamente.

Fluxo:

```text
1. abrir/usar PJe logado
2. consultar processo por numero CNJ
3. ler resultado
4. abrir autos com HITL
5. baixar documento atual com HITL
6. analisar documento baixado
7. gerar resumo juridico
```

Entregas:

- [x] prompts prontos para cada etapa;
- [x] resposta esperada documentada;
- [x] fallback quando PJe estiver fora do ar;
- [x] fallback quando PDF nao tiver texto extraivel;
- [x] aviso de que analise de documento unico nao substitui analise de autos
      completos.

Pronto quando:

- conseguimos demonstrar em 5-10 minutos a Lex consultando um processo e
  analisando uma sentenca baixada.

### Roteiro demonstravel da Task 5

Objetivo: demonstrar a Lex em um fluxo juridico real, com controle humano nos
pontos sensiveis e sem exigir que o usuario decore nomes de tools.

#### Demo de 5-10 minutos

1. Abrir a Lex e confirmar `Motor on`.
2. Abrir ou focar o PJe ja autenticado no Chrome controlado.
3. Usar `Fluxos > Consultar processo PJe`.
4. Informar o numero CNJ ou pedir para a Lex preencher o numero ja dado.
5. Rodar dry run do preenchimento e confirmar que tribunal/digito estao ok.
6. Executar consulta e usar `Fluxos > Ler resultados`.
7. Abrir autos com HITL, parando em aviso/modal quando existir.
8. Usar `Fluxos > Ler autos` para confirmar que esta na capa/timeline correta.
9. Abrir/selecionar o documento atual no visualizador.
10. Usar `Fluxos > Baixar documento atual`.
11. Usar `Fluxos > Analisar documento baixado`.
12. Usar `Fluxos > Resumo juridico` se quiser uma saida mais curta.

#### Resposta esperada por etapa

- Consulta: numero normalizado, tribunal inferido, validacao do digito CNJ,
  campos encontrados e indicacao se a tela exige login.
- Resultado: lista enxuta com processo, classe, orgao julgador, partes,
  autuacao, ultima movimentacao e acoes visiveis, sem clicar em nada.
- Abrir autos: confirmacao de que clicou apenas no link do processo; se houver
  aviso do PJe, parar e pedir autorizacao expressa antes de aceitar.
- Ler autos: numero, cabecalho, documento atual, movimentos visiveis e alertas
  de botoes sensiveis, em modo somente leitura.
- Baixar documento: caminho local do PDF quando houver download real; se o PJe
  abrir PDF em nova aba, registrar URL/aba atual e explicar que o documento esta
  carregado para a proxima etapa.
- Analisar documento: resumo executivo, fatos relevantes, fundamentos,
  dispositivo/conclusao, riscos, prazos, lacunas e proximos passos praticos.
- Resumo juridico: versao curta para advogado revisar rapidamente.

#### Fallback quando o PJe estiver fora do ar ou indisponivel

- Nao repetir a mesma tool em loop.
- Dizer se a falha parece login, PJe fora do ar, timeout, popup/modal, aba errada
  ou Chrome desconectado.
- Sugerir a menor acao humana possivel: fazer login, aguardar retorno do PJe,
  focar a aba correta ou rodar `pje_status`.
- Preservar o estado atual e nao limpar campos/abas sem necessidade.
- Se houver dados ja lidos antes da falha, resumir o que foi obtido e marcar o
  restante como pendente.

#### Fallback quando o PDF nao tiver texto extraivel

- Informar que o PDF parece imagem, digitalizacao ou documento protegido.
- Nao inventar conteudo do documento.
- Sugerir OCR ou leitura por imagem como proxima etapa futura.
- Se houver metadados ou nome do arquivo, usar apenas como contexto auxiliar e
  deixar claro que nao substitui o teor do documento.

#### Aviso de escopo juridico

Analise de documento unico nao e analise integral dos autos. A Lex deve avisar
quando a conclusao depender de peticao inicial, contestacao, documentos
anteriores, certidoes, intimacoes ou movimentacoes nao analisadas.

## Task 6 - Politica de linguagem juridica Lex

Garantir que o motor responda como Lex juridica nos fluxos principais.

Regras:

- [x] separar fatos, fundamentos, dispositivo, riscos e proximos passos;
- [x] listar lacunas;
- [x] nao inventar jurisprudencia;
- [x] sinalizar quando precedente precisa ser verificado;
- [x] tratar PJe como HITL;
- [x] nao sugerir protocolo/ato sensivel sem confirmacao.

Pronto quando:

- o prompt de analise de documento gera uma saida util para advogado sem
  alucinar acordaos ou agir como decisor final.

### Padrao Lex de resposta juridica

Toda analise juridica gerada pela Lex deve priorizar uma estrutura previsivel:

```text
1. Resumo executivo
2. Fatos relevantes
3. Fundamentos juridicos identificados
4. Dispositivo, decisao ou conclusao do documento
5. Pontos de atencao e riscos
6. Lacunas de informacao
7. Proximos passos praticos
8. Jurisprudencia e verificacao
```

Regras de linguagem:

- nao inventar jurisprudencia, numeros de processo, turmas, camaras ou datas;
- quando um precedente for apenas provavel, dizer que precisa ser verificado;
- distinguir fato extraido do documento de inferencia da Lex;
- nao transformar analise em conselho final sem ressalva profissional;
- quando analisar documento unico, avisar se a conclusao depende dos autos
  completos;
- listar lacunas antes de sugerir providencia mais forte.

### Politica HITL do PJe

HITL nao e uma confirmacao unica para tudo. A Lex deve graduar conforme risco.

#### Nivel 0 - Somente leitura

Pode executar sem confirmacao pesada quando o usuario pediu a leitura.

Exemplos:

- inspecionar contexto;
- ler resultados;
- ler autos ja abertos;
- identificar documento atual;
- resumir movimentacoes visiveis.

Resposta esperada:

- dizer que operou em modo somente leitura;
- informar que nada foi clicado, baixado, peticionado ou alterado.

#### Nivel 1 - Navegacao reversivel

Pode executar se o usuario pediu explicitamente a navegacao. Usar dry run quando
houver risco de clicar no alvo errado.

Exemplos:

- abrir consulta;
- preencher numero CNJ;
- clicar em Pesquisar;
- abrir link do processo;
- trocar/focar aba;
- abrir documento no visualizador.

Resposta esperada:

- explicar alvo escolhido;
- parar se aparecer aviso/modal sensivel;
- nao aceitar aviso do PJe sem autorizacao especifica.

#### Nivel 2 - Acao sensivel ou registrada

Precisa confirmacao clara antes de prosseguir.

Exemplos:

- aceitar aviso de acesso aos autos;
- baixar documento;
- acessar autos com aviso de registro;
- usar certificado/PJeOffice;
- acessar processo em que o advogado pode nao constar como parte.

Resposta esperada:

- explicar o risco pratico: acesso registrado, arquivo baixado, certificado
  acionado ou dado sensivel exposto;
- pedir confirmacao expressa;
- executar apenas a acao confirmada, sem encadear ato seguinte automaticamente.

#### Nivel 3 - Ato processual ou alteracao

Precisa confirmacao forte e preferencialmente confirmacao no Desktop.

Exemplos:

- protocolar;
- peticionar;
- assinar;
- juntar documento;
- enviar manifestacao;
- alterar cadastro;
- dar ciencia/intimacao quando aplicavel.

Resposta esperada:

- preparar minuta ou plano, se solicitado;
- apresentar resumo do que sera praticado;
- pedir confirmacao explicita;
- nunca praticar o ato se o pedido estiver ambiguo.

### Frases de seguranca preferidas

```text
Vou operar em modo somente leitura.
Isso pode registrar acesso no PJe. Confirma que deseja continuar?
Posso baixar apenas o documento atual, sem baixar autos completos.
Nao encontrei texto extraivel no PDF; nao vou inferir conteudo.
Nao tenho confirmacao dessa jurisprudencia; preciso verificar em base oficial.
Esta analise considera somente o documento atual, nao os autos completos.
```

## Task 7 - Validacao e commit

Validacoes minimas:

- [x] `npm run build`;
- [x] app reinicia;
- [x] `hermes mcp test lex-desktop` mostra tools;
- [x] Console Lex abre;
- [x] status do motor atualiza;
- [ ] prompt `pje_analisar_documento_baixado` funciona no PDF recente.

Pronto quando:

- sprint commitada e enviada para `origin/main`.

## Ordem recomendada de execucao

1. Task 1 - Inventario.
2. Task 2 - Console Lex.
3. Task 4 - Status do motor.
4. Task 3 - Atalhos de prompts.
5. Task 5 - Fluxo vendavel minimo.
6. Task 6 - Linguagem juridica.
7. Task 7 - Validacao e commit.

## Decisao de produto da sprint

O terminal fica como interface principal ate segunda ordem.

O produto final pode virar chat visual, terminal polido ou hibrido, mas essa
decisao nao bloqueia a Sprint 1. O foco agora e fazer o Console Lex parecer uma
escolha de produto, nao uma etapa temporaria quebrada.
