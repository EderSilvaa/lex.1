# Lex Launch Readiness

Atualizado em 2026-05-12.

Este documento transforma o estado tecnico atual da Lex em um plano pratico de
lancamento. A ideia nao e inventar roadmap novo, e sim consolidar o que ja esta
pronto, o que ainda bloqueia e em que ordem devemos fechar a operacao.

## Decisao de escopo do MVP

Em 2026-05-12, a decisao de produto para lancamento passou a ser:

- postergar a Agora para depois do lancamento;
- fechar o MVP no eixo `PJe + tribunais + leitura + analise assistida`;
- tratar `MCP-first` como parte do MVP comercial;
- evitar abrir nova frente de workflow duravel antes de estabilizar o caminho
  principal vendavel.

Na pratica, isso significa que a Agora continua sendo uma direcao de arquitetura
e uma aposta pos-lancamento, mas deixa de ser parte do escopo ativo do MVP.

Na mesma linha, a Lex deve explorar uma frente comercial paralela:

- Lex app como produto principal;
- Lex MCP como wedge de distribuicao para quem ja usa Claude ou ChatGPT.

## Objetivo do lancamento

Lancar a Lex como produto Windows supervisionado para fluxo juridico assistido,
com foco no caminho vendavel minimo ja provado:

1. abrir/usar PJe logado;
2. consultar processo;
3. ler resultados;
4. abrir autos com HITL;
5. baixar documento atual com HITL;
6. analisar documento baixado;
7. responder com resumo juridico util.

Referencia principal:

- [docs/future-tasks/LEX-PRODUCT-SPRINT-1.md](./future-tasks/LEX-PRODUCT-SPRINT-1.md)
- [docs/CURRENT-ARCHITECTURE.md](./CURRENT-ARCHITECTURE.md)
- [docs/PJE-SKILLS-APPARATUS.md](./PJE-SKILLS-APPARATUS.md)
- [docs/BRAIN-DREAM-REPLAY-SPRINT.md](./BRAIN-DREAM-REPLAY-SPRINT.md)

## Leitura honesta do estado atual

Hoje a Lex parece bem posicionada para:

- demo vendavel assistida;
- alpha fechado com operadores proximos;
- beta assistido com fluxo PJe bem delimitado.

Hoje a Lex ainda nao parece pronta para:

- lancamento publico amplo sem supervisao;
- prometer atos criticos de PJe como protocolo/juntada/assinatura;
- depender de auto-update/publicacao sem revisar a configuracao final.

Hoje o escopo que faz mais sentido fechar primeiro e:

- Console Lex;
- bridge local;
- PJe/TJ com HITL;
- leitura, consulta e analise de documento.
- exposicao clara da Lex como servidor MCP reutilizavel.

## Gates de lancamento

### Gate 1 - Produto demonstravel

Status: `quase pronto`

Ja existe:

- Console Lex com identidade de produto;
- fluxo minimo de consulta e analise documentado;
- empacotamento Windows por `electron-builder`;
- NSIS configurado;
- updater integrado no app.
- MCP `lex-desktop` funcional como servidor local testavel.

Ainda falta:

- fechar o item manual de teste real no TJPA;
- validar o roteiro completo no app aberto, do inicio ao fim.
- manter a demo focada em PJe/TJ, sem reabrir escopo de Agora.
- preparar uma demo separada de `Lex via MCP` para cliente que ja usa outro chat.

### Gate 2 - Confiabilidade operacional

Status: `amarelo`

Ja existe:

- `pje_browser_use` como skill canonica local;
- Brain com replay, preview/confirmacao e fallback;
- selector memory, selector discovery e route memory;
- HITL em pontos sensiveis do fluxo PJe.

Ainda falta:

- breadcrumbs mais legiveis para o usuario;
- politica forte de evidencia final para tarefas criticas;
- separar explicitamente o que e leitura segura vs acao sensivel no marketing e no onboarding.

### Gate 3 - Privacidade e compliance

Status: `amarelo`

Ja existe no codigo:

- PII Vault;
- consent manager;
- audit log;
- encrypted storage;
- onboarding e configuracao de privacidade no app.

Ainda falta para lancamento com menos risco:

- politica de privacidade visivel ao usuario;
- texto de consentimento final revisado;
- definicao operacional de retention, exclusao e suporte;
- checklist LGPD reduzido para o que realmente sera prometido no v1.

### Gate 4 - Distribuicao e atualizacao

Status: `vermelho`

Ja existe:

- `dist:win`;
- `dist:win:publish`;
- `autoUpdater` integrado;
- recursos de build e icones.

Bloqueio atual:

- `package.json` ainda aponta `publish.owner` para `SEU_USUARIO_GITHUB`, entao a
  trilha de publicacao/update ainda nao esta pronta para release real.

### Gate 6 - Integracao Claude/ChatGPT

Status: `amarelo`

Ja existe:

- servidor MCP stdio `lex-desktop`;
- launchers locais em `scripts/lex-desktop-mcp-server.*`;
- bridge HTTP local do Electron;
- teste local via `npm run mcp:test`.

Leitura pratica:

- para Claude, a Lex ja esta relativamente perto de uma historia de integracao;
- para ChatGPT, o repositorio ainda nao materializa uma oferta remota/publica
  pronta para conexao fora da maquina local.

Ainda falta:

- definir `MCP local para Claude` como caminho MVP imediato;
- decidir se `ChatGPT` entra no MVP via conector remoto, app custom ou fase 2;
- documentar instalacao e onboarding de MCP para cliente final;
- revisar autenticacao, permissao e narrativa comercial dessa superficie.

### Gate 5 - Suporte de operacao

Status: `amarelo`

Ja existe:

- `product:doctor`;
- status do motor;
- diagnostico de WSL/projeto/bridge;
- mensagens de erro mais amigaveis no Console Lex.

Ainda falta:

- runbook curto para instalacao, bootstrap e recovery;
- checklist de triagem para "motor off", WSL, MCP e Chrome/PJe;
- definicao de como coletar logs de campo sem expor dados sensiveis.

## Bloqueios antes de chamar de lancamento

### Bloqueios P0

- Fechar o teste real assistido do TJPA listado em [docs/BRAIN-DREAM-REPLAY-SPRINT.md](./BRAIN-DREAM-REPLAY-SPRINT.md).
- Trocar a configuracao placeholder de publicacao/update no `package.json`.
- Definir escopo comercial honesto do v1: leitura, consulta e analise assistida; sem prometer protocolo autonomo.
- Escrever e linkar uma politica de privacidade enxuta para o app.
- Congelar a Agora como feature pos-lancamento para nao diluir o fechamento do MVP.
- Definir a oferta `Lex MCP` do MVP: o que conecta hoje em Claude e o que fica para ChatGPT fase seguinte.

### Bloqueios P1

- Transformar logs tecnicos de PJe em narracao de produto.
- Formalizar evidencia final para operacoes sensiveis.
- Fechar teste manual do prompt de analise de documento baixado citado em `LEX-PRODUCT-SPRINT-1`.
- Executar smoke test do instalador Windows em maquina limpa.

## Escopo recomendado do v1

Prometer:

- consulta assistida no PJe;
- leitura orientada de resultados e autos;
- download controlado do documento atual;
- analise juridica de documento baixado;
- privacidade configuravel e supervisao humana.
- foco inicial em tribunais e fluxos PJe validados, com TJPA como trilha de fechamento.
- distribuicao adicional via MCP para clientes que ja operam em assistentes compativeis.

Nao prometer no v1:

- protocolo autonomo;
- peticionamento sem confirmacao forte;
- automacao massiva irrestrita;
- suporte universal a qualquer tribunal sem validacao assistida.
- Agora/workflow duravel como parte do MVP inicial.
- integracao completa e indiferenciada com qualquer cliente MCP sem validar setup, auth e UX.

## Plano de execucao curto

### Fase 1 - Travar o escopo

1. Congelar a mensagem de produto do v1.
2. Definir a demo oficial de 5 a 10 minutos.
3. Proibir expansao de feature fora do caminho vendavel minimo.
4. Tirar a Agora do caminho critico do lancamento.
5. Definir a narrativa `app completo` versus `Lex MCP`.

### Fase 2 - Fechar readiness tecnico

1. Rodar o teste manual TJPA completo.
2. Validar build, instalador e bootstrap em ambiente limpo.
3. Corrigir configuracao real de publicacao/update.
4. Revisar onboarding e textos de privacidade.
5. Fechar a historia MVP de integracao com Claude e a estrategia de ChatGPT.

### Fase 3 - Preparar operacao

1. Criar runbook de suporte.
2. Criar checklist de smoke test pre-release.
3. Criar checklist de go/no-go no dia do lancamento.
4. Definir canal de feedback e triagem de bugs.

## Checklist de go/no-go

- [ ] `npm run build`
- [ ] `npm run type-check`
- [ ] `npm run test:brain`
- [ ] `npm run test:brain:e2e`
- [ ] `npm run test:brain:renderer`
- [ ] `npm run product:doctor`
- [ ] fluxo real TJPA assistido validado
- [ ] export `Patterns` revisado sem dados sensiveis
- [ ] instalador Windows testado
- [ ] updater/publicacao apontando para destino real
- [ ] politica de privacidade publicada
- [ ] roteiro comercial do v1 alinhado ao que o produto realmente faz
- [ ] historia MCP do MVP definida: Claude pronto, ChatGPT com escopo honesto

## Minha recomendacao

O melhor proximo passo nao e "lancar tudo". E fechar uma `release candidate`
de beta assistido.

Se fizermos isso, a Lex entra no mercado com uma promessa forte e verdadeira:

- Desktop supervisionado;
- PJe com HITL;
- consulta e leitura com memoria operacional;
- analise juridica util;
- privacidade tratada com seriedade.

Se tentarmos chamar isso agora de lancamento publico amplo, o risco maior nao e
tecnico: e de prometer mais confiabilidade operacional do que a superficie de
PJe ja consegue sustentar.
