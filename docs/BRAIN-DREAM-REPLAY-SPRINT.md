# Brain/Dream/Replay Sprint Memory

Atualizado em 2026-05-19.

Nota de arquitetura em 2026-05-09: Brain continua memoria operacional do
Desktop, especialmente para PJe/RPA/observacoes. O cerebro de raciocinio e
orquestracao passa a ser Lex Engine/Hermes; Agora usa o Engine para workflows
duraveis e deve consultar/registrar no Brain quando o trabalho envolver
descoberta operacional.

Nota de reposicionamento em 2026-05-16: com a nova leitura `Markdown-first`,
este sprint continua valido como fundacao de replay/observer/execucao
operacional, mas deixa de ser trilha para expandir a memoria geral do produto.
Conhecimento duravel, autocuragem, aprendizagem juridica e skills devem tender
ao eixo `Hermes + markdown`, com o Brain ficando como camada opcional de
aceleracao. Ver:
[`docs/active/LEX-MARKDOWN-FIRST-MEMORY-SKILLS.md`](./active/LEX-MARKDOWN-FIRST-MEMORY-SKILLS.md).

## Status

Fase automatizada do sprint concluida. O Brain, Dream, Observer, Replay, testes de servico e testes E2E/UX do renderer estao implementados e validados.

No ponto atual do projeto:

- a parte de `Habilidades + Markdown-first + curadoria` avancou bastante por cima
  desta fundacao;
- a pergunta em aberto deixou de ser "a infra existe?" e passou a ser "a Lex ja
  navega no PJe com autonomia suficiente no uso real?";
- no eixo `PJe advogado-first`, essa resposta avancou bem: em 2026-05-19 a Lex
  validou com sucesso `consulta -> resultado -> autos -> download -> analise da
  sentenca` no TJPA;
- o que continua pendente aqui nao e mais o gate operacional do fluxo
  advogado-first, e sim os checks manuais especificos de `Learn/replay preview,
  execute/cancel, vision fallback e export de patterns`.

## Entregue

- Brain inicia no runtime Electron com `better-sqlite3` valido.
- Observer grava observacoes no Brain e deduplica actions/page states por normalizacao canonica.
- Dream possui dry-run, snapshot, restore, policy por fase, avaliacao, rollback, historico, risk e explain.
- Flow detection promove micro-flows e flows repetidos.
- Replay usa plano confiavel, preview/confirmacao, feedback de sucesso/falha, seletores alternativos, timeout adaptativo e fallback para vision.
- Replay foi corrigido para validar DOM real via `expectedNextDomHash`, sem confundir hash de label canonico `TJPA:norm:*` com `domHash`.
- Export `patterns` gera bundle seguro sem dados de processo/CPF/e-mail/nomes sensiveis.
- Learn dashboard foi ajustado para nao bloquear o grafo: clique no grafo fecha o painel; clique dentro do painel nao fecha.
- UI do Learn respeita margem do chrome do Electron e o botao de fechar permanece compacto.
- Modal de replay foi coberto em renderer test, incluindo confirm/cancel e escape de HTML perigoso.

## Testes Automatizados

Scripts disponiveis:

- `npm run test:brain`
- `npm run test:brain:e2e`
- `npm run test:brain:renderer`
- `npm run type-check`

Ultima validacao executada:

- `npm run test:brain:renderer`: 4 passed
- `npm run test:brain:e2e`: 2 passed
- `npm run test:brain`: 8 passed
- `npm run type-check`: ok
- `node --check scripts/test-brain-renderer.js`: ok
- `node --check scripts/run-electron-script.js`: ok

Runtime confirmado apos restart:

```json
{
  "nodeCount": 9,
  "edgeCount": 5,
  "byType": {
    "action": 1,
    "aprendizado": 2,
    "page_state": 1,
    "processo": 4,
    "tribunal": 1
  }
}
```

## Pendencia Antes de Fechar 100%

O fluxo real principal do TJPA no PJe de advogado ja foi validado em 2026-05-19.

Para declarar este sprint 100% fechado, faltam apenas os checks manuais
especificos do Brain/Learn/Replay no app aberto:

1. Abrir Brain -> Learn.
2. Confirmar que stats aparecem e que o painel fecha ao clicar no grafo.
3. Rodar task real: `abre o site do TJPA (https://pje.tjpa.jus.br) e me diz o titulo da pagina`.
4. Clicar `Detectar flows` e confirmar que dashboard/grafo atualizam.
5. Repetir a mesma task para acumular observacoes.
6. Ativar `Confirmar antes de executar`.
7. Rodar a task novamente e confirmar que o modal de replay aparece.
8. Testar os dois caminhos do modal: `Executar` e `Cancelar`.
9. Desligar `Replay habilitado` e confirmar fallback para vision.
10. Exportar `Patterns` e conferir que o bundle nao contem processo/CPF/e-mail.

Essa pendencia e manual/assistida porque depende do browser real, CDP, rede e comportamento atual do site TJPA/PJe.

## Proxima Decisao

O sprint de infra esta em estado bom para pausa. Podemos avancar em outras features e voltar depois somente para o teste real assistido do TJPA antes de declarar fechamento final.

## O que continua valido

- observer e coleta de observacoes operacionais;
- replay, preview e cancelamento seguro;
- traces, selectors e flow detection;
- export seguro de patterns;
- validacao manual assistida no PJe real.

## O que nao deve virar trilha principal daqui para frente

- expandir o Brain como memoria geral do produto;
- empurrar aprendizagem juridica duravel para dentro de traces tecnicos;
- duplicar memoria procedural que o Hermes ja sabe sustentar.

## Nova leitura pratica

- `Hermes` guarda memoria principal do agente;
- `Markdown/skills` guardam conhecimento duravel e curavel;
- `Brain` acelera execucao e replay quando ativado.

## Observacao adicional

Essa divisao nao serve apenas para trilhas operacionais do PJe.

Ela tambem deve sustentar:

- memoria de casos;
- memoria por processo;
- dossies de atuacao juridica;
- curadoria de documentos e licoes aprendidas durante a execucao.
