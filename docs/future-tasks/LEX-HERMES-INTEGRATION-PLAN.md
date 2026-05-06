# Plano de Integracao Lex Electron + Lex Engine

Este plano define como transformar o Hermes forkado no motor da Lex sem quebrar o
produto Electron atual. A ideia central e simples:

```text
Lex Electron = corpo do produto Windows
Lex Engine / Hermes = cerebro do agente
MCP Bridge local = ponte segura entre os dois
```

O objetivo nao e reescrever a Lex do zero. O objetivo e preservar o que ja e
valioso no Electron e trocar, aos poucos, o motor de agente duplicado pelo motor
do Hermes/Lex Engine.

## Decisao de Arquitetura

### Destino: monorepo Lex com fronteiras claras

O destino recomendado e um monorepo da Lex, mas sem misturar as camadas.

O monorepo deve versionar junto o que precisa evoluir junto: Desktop, bridge,
MCP, Brain operacional, prompts/politicas Lex e o runtime do Engine usado pelo
produto. Isso evita a duvida pratica de "qual repositorio editar?" quando uma
mudanca envolve UI, PJe, MCP e comportamento do agente.

Monorepo nao significa acoplamento interno livre. A fronteira continua sendo:

```text
apps/desktop ou electron-app = Lex Desktop/Electron
engine/hermes ou vendor/hermes = Lex Engine/Hermes
packages/brain = Brain operacional da Lex
packages/mcp-lex-desktop = contrato MCP com o Desktop
packages/shared = schemas, tipos e contratos compartilhados
```

Regra de fronteira:

- Electron nao importa codigo interno do Hermes diretamente.
- Hermes nao manipula PJe/Windows diretamente.
- Comunicacao entre motor e desktop acontece por MCP/HTTP/JSON estruturado.
- O Brain operacional da Lex fica acessivel por contrato, nao por acesso solto a
  arquivos internos.
- O Hermes pode continuar isolado como fork, subtree, submodule ou pasta
  versionada, desde que a versao usada pela Lex seja explicita.

### Repositorio canonico

A decisao recomendada agora e tratar a Lex como produto principal e caminhar para
um repositorio canonico unico da Lex. O conteudo do Electron atual deve entrar no
monorepo como camada Desktop. O Hermes/Lex Engine deve entrar como camada Engine,
mantendo sua propria fronteira para facilitar atualizacoes futuras do upstream.

Enquanto a migracao nao for concluida, `lex-test1` continua sendo o corpo
Desktop operacional e `lex_engine` continua sendo o motor Hermes usado pela Lex.
Durante esse periodo, qualquer mudanca deve deixar claro qual lado esta sendo
alterado.

### Manter o Electron como produto principal

O Electron continua sendo a experiencia que o usuario baixa e abre no Windows.
Ele deve cuidar de:

- interface visual da Lex;
- login/licenca/Supabase;
- configuracao de chaves e provedores;
- confirmacoes de acoes sensiveis;
- PJe, certificado digital e RPA/navegador Windows;
- acesso controlado a arquivos locais;
- exibicao de historico, documentos, casos e status do motor;
- empacotamento, instalador e atualizacoes.

### Usar Hermes/Lex Engine como motor

O fork do Hermes passa a ser o motor local da Lex. Ele deve cuidar de:

- raciocinio do agente;
- conversa principal;
- planejamento;
- memoria operacional;
- criacao e uso de skills;
- scheduler/tarefas futuras;
- canais como Telegram/WhatsApp no futuro;
- escolha de modelo e provedores;
- orquestracao de ferramentas via MCP.

### Usar MCP Bridge como contrato entre os dois

O Electron nao deve chamar funcoes internas do Hermes diretamente, e o Hermes nao
deve mexer livremente no PC do usuario. O caminho padrao deve ser:

```text
Usuario -> Lex Electron -> Lex Engine -> MCP tool -> Lex Electron -> Windows/PJe/Arquivo
```

Isso deixa claro quem pode fazer o que, facilita permissao por ferramenta e evita
uma arquitetura fragil baseada em scripts soltos.

## Regra de Ouro

O motor pode pensar e pedir uma acao. O Electron decide se a acao pode acontecer.

Para a area juridica, isso e essencial. O agente pode montar uma peticao,
preparar um protocolo ou sugerir uma estrategia, mas atos sensiveis precisam de
confirmacao visual e registrada no desktop.

## O Que Fica do Projeto Electron Atual

Manter:

- UI React/Electron;
- janelas, preload, IPC e empacotamento;
- PJe, certificado digital e executor RPA que dependem do Windows;
- certificado digital;
- sistema de licenca;
- tela de configuracoes;
- privacidade/LGPD;
- Brain juridico em TypeScript como memoria operacional e fabrica de know-how;
- DataJud e integracoes juridicas;
- fluxo de documentos;
- qualquer logica que ja conversa bem com o usuario final.

Substituir aos poucos:

- loop de agente em TypeScript;
- roteadores de intencao duplicados;
- BYOK antigo como fonte de verdade;
- skills genericas de OS/browser que o Hermes ja resolve melhor;
- memoria generica duplicada;
- scheduler duplicado;
- plugins genericos que competem com skills do Hermes.

## O Que Fica do Lex Engine/Hermes

Manter:

- CLI e runtime Python;
- sistema de skills;
- auto-criacao de skills, com guardrails Lex;
- modelo/provedor agnostico;
- terminal local apenas para modo dev/admin;
- gateway/canais;
- estrutura de config do Hermes, adaptada para Lex;
- creditos/licenca do Hermes upstream.

Adaptar:

- persona padrao para Lex juridica;
- comandos e mensagens com marca Lex;
- lista de skills para priorizar juridico;
- ferramentas perigosas com politica de permissao;
- instalacao no Windows via WSL ou bundle controlado.

## Fonte de Verdade

### Modelo e chaves

A fonte de verdade deve ser o Lex Engine/Hermes.

O Electron pode oferecer uma tela bonita para editar essas configuracoes, mas nao
deve manter outro sistema paralelo de BYOK. Ele deve gravar/ler a configuracao do
motor.

### Acoes juridicas

A fonte de verdade para permissao deve ser o Electron.

Mesmo que o Hermes consiga executar uma acao, o Electron deve controlar:

- se aquela ferramenta esta habilitada;
- se precisa confirmacao;
- qual usuario autorizou;
- qual caso/processo estava ativo;
- qual log/auditoria foi gerado.

### PJe

A fonte de verdade operacional deve ser o Electron.

PJe, certificado e browser Windows ficam no Electron. O Hermes pede a acao por
MCP e recebe o resultado estruturado.

O ponto central nao e importar uma automacao PJe pronta como verdade final. A
Lex deve operar em modo discovery-first:

```text
Electron observa/executa -> Brain registra -> Hermes entende/planeja ->
Electron executa de novo -> Brain atualiza sucesso/falha
```

O Brain guarda o know-how operacional: telas, passos, seletores, evidencias,
prints, resultados, falhas, variantes por tribunal e nivel de confianca. O
Hermes usa esse know-how para raciocinar, propor proximos passos, criar skills e
orquestrar execucoes controladas.

## Papel do Brain e do Hermes

### Brain

O Brain e a memoria operacional da Lex. Ele deve armazenar:

- fluxos descobertos;
- passos de RPA;
- evidencias de tela;
- seletores DOM ou coordenadas quando necessario;
- variacoes por tribunal/sistema;
- historico de sucesso e falha;
- nivel de confianca por fluxo;
- relacao entre caso, documento, processo e acao executada.

### Hermes/Lex Engine

O Hermes nao substitui o Brain. Ele atua em cima do Brain:

- pergunta ao Brain o que ja se sabe;
- identifica lacunas no fluxo;
- decide se precisa explorar, perguntar ou executar;
- transforma fluxo bem-sucedido em skill;
- sugere correcao quando um RPA falha;
- explica ao usuario o que esta acontecendo;
- chama o Electron via MCP quando precisa agir no Windows/PJe.

### Electron

O Electron continua sendo o executor confiavel:

- abre navegador/PJe;
- usa certificado;
- captura tela/DOM;
- executa clique/digitacao/download;
- pede confirmacao para ato sensivel;
- registra logs de auditoria;
- devolve resultado estruturado para o Hermes e para o Brain.

## Modelo de Permissoes

### Nivel 0: conhecimento

Exemplos:

- resumir documento;
- explicar tese;
- montar checklist;
- sugerir perguntas ao cliente;
- criar uma skill de leitura/analise.

Pode rodar sem confirmacao especial.

### Nivel 1: leitura controlada

Exemplos:

- abrir arquivo selecionado pelo usuario;
- consultar status do PJe;
- ler metadados de um processo;
- buscar no Brain.

Pode exigir confirmacao inicial ou permissao por caso/pasta.

### Nivel 2: acao reversivel

Exemplos:

- gerar minuta;
- criar pasta;
- salvar arquivo;
- preparar protocolo sem enviar.

Deve aparecer no Electron com pre-visualizacao quando envolver documento juridico.

### Nivel 3: acao sensivel

Exemplos:

- protocolar peticao;
- enviar mensagem a cliente;
- baixar lote grande de documentos;
- alterar dado de processo;
- usar certificado digital;
- executar comando no sistema.

Sempre precisa confirmacao explicita no Electron.

## MCP Bridge Inicial

Criar um servidor MCP local chamado `lex-desktop`.

Status atual:

- bridge HTTP local do Electron ativo em `http://127.0.0.1:32179`;
- servidor MCP stdio `lex-desktop` criado em `scripts/lex-desktop-mcp-server.mjs`;
- launchers Windows criados em `scripts/lex-desktop-mcp-server.cmd` e
  `scripts/lex-desktop-mcp-server.ps1`;
- Hermes configurado com `mcp_servers.lex-desktop` em `~/.hermes/config.yaml`;
- teste real concluido: Hermes chamou `lex_health` via MCP e recebeu
  `service=lex-desktop; engine_ok=true`.
- tool `lex_confirm` criada para abrir confirmacao no Electron e devolver
  `accepted=true/false` ao motor;
- tool `brain_search` criada para busca read-only no Brain via backend RPC;
- tools `brain_flows` e `brain_get_flow` criadas para listar e inspecionar
  fluxos operacionais aprendidos sem executar acoes;
- tool `brain_record_observation` criada para registrar observacoes
  operacionais controladas no Brain via pipeline Observer;
- tool `pje_status` criada para diagnostico read-only do navegador/PJe;
- tool `pje_consultar_processo` criada como plano read-only/dry-run: valida CNJ,
  infere tribunal, resolve URLs do PJe e opcionalmente consulta DataJud se a
  chave estiver configurada;
- tool `pje_abrir_consulta` criada para abrir/navegar o Chrome controlado ate a
  tela de consulta do PJe, sempre com confirmacao visual no Electron e sem
  preencher campos;
- tool `pje_inspecionar_contexto` criada para observar, em modo read-only, abas,
  popups, iframes, textos visiveis, campos e botoes candidatos antes de qualquer
  preenchimento;
- tool `pje_preencher_numero` criada para validar/normalizar CNJ, conferir
  divergencia de tribunal e preencher somente os campos segmentados do numero do
  processo, com `dryRun` por padrao e confirmacao visual antes de alterar o PJe;
- tool `pje_clicar_consultar` criada para identificar candidatos seguros de
  Pesquisar/Consultar, bloquear consulta vazia por padrao e clicar uma unica vez
  somente apos confirmacao visual no Electron;
- tool `pje_ler_resultados` criada para ler, em modo read-only, as tabelas e
  linhas visiveis retornadas pela consulta do PJe sem abrir processo ou baixar
  documentos;
- detector WSL do Electron ajustado para probes pequenos e mais robustos.

Ferramentas MVP:

- `lex_health`: retorna se o Electron esta vivo e qual versao esta rodando.
- `lex_confirm`: abre modal de confirmacao no Electron.
- `brain.search`: busca conhecimento/casos/fluxos no Brain atual.
- `brain_search`: nome tecnico atual da tool MCP de busca no Brain.
- `brain.flows`: lista fluxos juridicos disponiveis.
- `brain.get_flow`: carrega um fluxo operacional especifico.
- `brain_flows` e `brain_get_flow`: nomes tecnicos atuais das tools MCP de
  flows.
- `brain.record_observation`: registra observacao, falha ou sucesso de execucao.
- `brain_record_observation`: nome tecnico atual da tool MCP de registro de
  observacao.
- `arquivo.selecionar`: abre seletor de arquivo no Electron.
- `documento.analisar`: recebe arquivo selecionado e devolve texto/metadata.
- `pje_status`: informa se o navegador/PJe esta pronto, sem abrir navegador nem
  executar acao.
- `pje_consultar_processo`: prepara consulta por CNJ sem automatizar o browser;
  retorna tribunal, URLs, readiness do PJe e proximas acoes seguras.
- `pje_abrir_consulta`: apos confirmacao no Electron, abre a tela de consulta do
  PJe no Chrome controlado. Nao preenche campos e nao pratica ato processual.
- `pje_inspecionar_contexto`: inspeciona o contexto inteiro do browser controlado
  e devolve refs de campos/botoes candidatos, incluindo iframes e popups.
- `pje_preencher_numero`: valida CNJ com ou sem mascara, bloqueia numero
  incompleto/divergencia de tribunal e preenche somente o numero segmentado do
  processo. Nao clica em consultar.
- `pje_clicar_consultar`: identifica o botao de Pesquisar/Consultar da tela
  atual do PJe, exige criterio de busca preenchido e, com confirmacao, executa
  apenas o clique de consulta. Nao abre resultado nem baixa documentos.
- `pje_ler_resultados`: le resultados visiveis da consulta atual do PJe e tenta
  extrair numero do processo, orgao julgador, classe, polos e ultima
  movimentacao. Nao clica, nao navega, nao abre processo e nao baixa documentos.
- `pje.consultar_processo`: nome conceitual da capability de consulta read-only.
- `rpa.dry_run`: valida se um fluxo parece executavel sem praticar ato sensivel.

Ferramentas posteriores:

- `pje.baixar_documentos`;
- `documento.gerar_peticao`;
- `pje.preparar_protocolo`;
- `pje.protocolar_peticao`;
- `rpa.execute_flow`;
- `rpa.learn_step`;
- `mensagem.enviar_cliente`;
- `agenda.criar_prazo`;
- `canal.enviar_resposta`.

## Chat e Console

Nao bater o martelo em apenas uma interface agora. O melhor desenho inicial e
ter duas abas com papeis diferentes:

- `Chat Lex`: interface visual normal, feita para o advogado.
- `Console Engine`: terminal embutido para Hermes/Lex Engine, debug e power use.

O chat principal do produto deve ser React/Electron normal. O console pode usar
`xterm.js` + `node-pty` e chamar WSL/Hermes por baixo quando necessario.

Motivo:

- melhor experiencia para advogado;
- permite anexos, cards, preview de documento e botoes de confirmacao;
- permite logs juridicos e auditoria;
- evita expor terminal para usuario comum;
- preserva o CLI como ferramenta de diagnostico.

Regra importante: no MVP, Chat e Console nao devem competir pela mesma sessao.
O Console pode abrir uma sessao crua do Hermes. O Chat deve passar pelo caminho
controlado do Electron. Depois, se valer a pena, as sessoes podem ser unificadas.

Fluxo recomendado:

```text
Chat React -> IPC Electron -> processo do Lex Engine -> resposta stream -> React
```

No MVP, o Electron pode chamar o comando do Hermes/Lex Engine como subprocesso.
Depois, se ficar necessario, criar um modo daemon local do motor.

## Canais Externos

Os canais do Hermes devem virar canais Lex.

### Telegram

No Telegram, o usuario cria/configura um bot proprio da Lex ou usa um bot da
empresa, dependendo do modelo comercial.

Para o MVP, o caminho mais simples e:

- cada usuario/escritorio configura seu token;
- o gateway roda local ou em processo controlado;
- mensagens sensiveis pedem confirmacao no desktop.

### WhatsApp

WhatsApp deve ser tratado como fase posterior.

Opcoes:

- WhatsApp Cloud API oficial, mais profissional e vendavel;
- provedor intermediario;
- automacao local apenas como experimento, nao como base comercial.

Regra: WhatsApp pode coletar pedido e entregar informacao simples, mas qualquer
ato juridico sensivel volta para confirmacao no Electron.

## Fases de Implementacao

### Fase 0: congelar decisoes

Status esperado:

- plano aprovado;
- responsabilidades definidas;
- repositorio canonico do monorepo Lex definido;
- repositorio Electron e repositorio Engine identificados como fontes de
  importacao/transicao;
- decisoes de licenca/creditos documentadas.

Entrega:

- este documento;
- decisao de monorepo documentada;
- checklist de importacao;
- lista de riscos.

### Fase 1: importar sem integrar

Criar a estrutura alvo do monorepo e importar sem trocar comportamento.

Estrutura sugerida:

```text
apps/desktop/
engine/hermes/
packages/mcp-lex-desktop/
packages/brain/
packages/shared/
docs/
scripts/
```

Se o repositorio canonico escolhido for o fork Hermes, importar o Electron atual
para `apps/desktop/` ou `electron-app/`. Se o repositorio canonico escolhido for
o Electron atual, trazer o Engine como `engine/hermes/`, `vendor/hermes/`,
subtree ou submodule. Em ambos os casos, a primeira importacao nao deve mudar o
comportamento.

Entrega:

- codigo importado com fronteiras de pasta claras;
- build atual ainda funcionando;
- nenhuma troca de motor ainda.

### Fase 2: detectar o Lex Engine

Adicionar uma tela/area de status no Electron:

- Engine instalado;
- caminho do Engine;
- versao;
- modelo ativo;
- provedor ativo;
- API key configurada ou ausente;
- WSL disponivel ou ausente.

Entrega:

- botao "Verificar Lex Engine";
- diagnostico legivel para usuario;
- logs sem mostrar chave completa.

### Fase 3: chat visual chamando o motor

Trocar o chat para chamar o Lex Engine, mantendo o Electron como UI.

Entrega:

- pergunta simples no chat;
- streaming ou resposta final;
- erro amigavel se o motor nao estiver configurado;
- botao para abrir configuracao.

### Fase 4: MCP minimo

Criar o primeiro MCP server local do Electron.

Entrega:

- `lex_health` implementado e testado;
- `lex_confirm` implementado;
- `brain_search` implementado e testado;
- `brain_flows` e `brain_get_flow` implementados e testados;
- `brain_record_observation` implementado e testado com chamada real do Hermes;
- `pje_status` implementado e testado com chamada real do Hermes;
- primeira chamada real do motor para uma tool do Electron concluida.

### Fase 5: primeiro fluxo juridico util

Comecar sem PJe sensivel.

Fluxo sugerido:

```text
Usuario seleciona PDF -> Lex Engine analisa -> Brain complementa -> Lex gera plano/minuta -> Electron mostra preview
```

Entrega:

- selecionar documento;
- extrair/analisar;
- gerar resumo juridico;
- listar lacunas;
- gerar rascunho.

### Fase 6: Brain + Hermes em modo descoberta

Validar o ciclo de aprendizado operacional antes de confiar em RPA sensivel.

Fluxo sugerido:

```text
Hermes pergunta ao Brain -> Electron observa tela/fluxo ->
Brain registra -> Hermes sugere proximo passo -> Electron executa passo simples
```

Entrega:

- carregar um fluxo existente do Brain;
- registrar sucesso/falha de um passo;
- Hermes explicar por que escolheu aquele passo;
- transformar um fluxo estavel em candidata a skill;
- nenhum protocolo e nenhuma acao juridica irreversivel.

### Fase 7: PJe read-only

Adicionar PJe apenas leitura.

Entrega:

- status do PJe implementado via `pje_status`;
- consulta de processo iniciada via `pje_consultar_processo` em modo
  read-only/dry-run;
- abertura da tela de consulta implementada via `pje_abrir_consulta`, com
  confirmacao visual e sem preencher campo;
- inspecao de contexto implementada via `pje_inspecionar_contexto`, incluindo
  abas/popups, iframes e candidatos a campo de numero do processo;
- preenchimento seguro do numero implementado via `pje_preencher_numero`, com
  validacao CNJ, `dryRun` e confirmacao antes de alterar campos;
- clique controlado em Pesquisar/Consultar implementado via
  `pje_clicar_consultar`, com `dryRun`, bloqueio de consulta vazia e confirmacao
  antes do clique;
- leitura estruturada de resultados visiveis implementada via
  `pje_ler_resultados`, sem abrir processo ou baixar documentos;
- leitura de documentos;
- resumo do processo;
- nenhum protocolo ainda.

### Fase 8: PJe com acao sensivel

Adicionar preparacao e protocolo com confirmacao forte.

Entrega:

- preparar peticao;
- revisar anexos;
- confirmar no Electron;
- executar no PJe;
- gerar recibo/log.

### Fase 9: canais

Adicionar Telegram primeiro, WhatsApp depois.

Entrega:

- canal conectado;
- regra de permissao por canal;
- confirmacao desktop para ato sensivel;
- historico vinculado ao caso.

## Checklist de Migracao do Electron

Antes de desligar qualquer modulo antigo:

- existe substituto no Lex Engine?
- existe teste ou fluxo manual validado?
- o usuario recebe erro amigavel?
- a permissao esta clara?
- logs nao vazam chave/API/dados sensiveis?
- da para voltar ao comportamento antigo se quebrar?

## Riscos

### Risco: dois motores competindo

Mitigacao: escolher uma fonte de verdade. O Hermes/Lex Engine deve ser o motor do
agente. O Electron deve ser interface e executor controlado.

### Risco: acesso amplo demais ao PC

Mitigacao: usuario final nao deve depender de terminal livre. Expor acoes por MCP
com permissao e confirmacao.

### Risco: WSL virar gambiarra

Mitigacao: WSL e detalhe de runtime no Windows. A arquitetura real e Electron +
Engine + MCP.

### Risco: PJe quebrar por mudanca de pagina

Mitigacao: manter PJe isolado no Electron, registrar variacoes no Brain, usar
dry-run quando possivel, manter logs e fallback para confirmacao humana.

### Risco: Brain virar deposito sem uso

Mitigacao: toda tool de RPA deve ler ou escrever no Brain. O Hermes deve
consultar o Brain antes de executar fluxo conhecido e registrar resultado depois.

### Risco: skills se criarem sem controle

Mitigacao: skills juridicas precisam de nivel de permissao, origem, descricao e
escopo. Skills de Nivel 3 nao executam ato sensivel sem confirmacao.

## Ordem Recomendada Agora

1. Aprovar este plano como norte.
2. Definir o repositorio canonico do monorepo Lex.
3. Criar a estrutura alvo com Desktop, Engine, Brain, MCP e shared separados por
   pastas.
4. Importar o outro lado sem integrar nem mudar comportamento.
5. Fixar a versao/caminho do Lex Engine usado pelo Desktop.
6. Criar tela de status do Engine.
7. Fazer o chat visual chamar o Engine.
8. Criar MCP minimo.
9. Migrar primeiro fluxo juridico de documento.
10. Validar Brain + Hermes em modo descoberta.
11. Migrar PJe read-only.
12. So depois ligar PJe com acoes sensiveis.

## Decisao Recomendada

Para a Lex, o melhor caminho e:

```text
Produto comercial = Electron
Motor inteligente = Lex Engine/Hermes
Contrato tecnico = MCP
Terminal = apenas dev/debug
PJe = Electron controlado
Brain = memoria operacional e discovery do PJe/RPA
Skills = Hermes com guardrails juridicos
```

Isso preserva o que ja existe, aproveita o poder do Hermes e ainda mantem a Lex
vendavel, local-first e agnostica de provedor.
