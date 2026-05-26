# Aparato PJe da Lex

Como a Lex opera o PJe hoje. É o centro do MVP. Estado atual do código — para a
arquitetura geral ver [CURRENT-ARCHITECTURE.md](CURRENT-ARCHITECTURE.md).

## Caminho único

Toda ação PJe passa por uma cadeia só:

```
Hermes → MCP lex-desktop → scripts/lex-desktop-mcp-server.mjs
       → HTTP bridge :32179 (electron/lex-desktop-bridge.ts)
       → backend RPC (electron/backend/server.ts)
       → módulos electron/pje/*.ts
       → electron/browser-manager.ts → Chrome (Playwright/CDP)
```

O Hermes não controla o Chrome direto. Ele pede ações ao Desktop via tools MCP; o
Desktop executa, supervisiona e confirma. Chrome sobe lazy — só na primeira ação.

## Módulos de ação (`electron/pje/`)

Cada endpoint do bridge mapeia para um RPC do backend, que chama um módulo:

| Ação (RPC) | Módulo | Faz |
|---|---|---|
| `pje-open-url` | browser-manager | abre/navega URL PJe permitida na aba ativa |
| `pje-inspect-context` | [context-inspector.ts](../electron/pje/context-inspector.ts) | lê a página ativa: worldtree, frames, nós acionáveis, affordances |
| `pje-explore-intent` | [action-guidance.ts](../electron/pje/action-guidance.ts) | monta guidance/brief para uma intenção (preview, não age) |
| `pje-execute-intent-candidate` | [intent-candidate-executor.ts](../electron/pje/intent-candidate-executor.ts) | executa um candidato de ação (com dry-run) |
| `pje-fill-process-number` | [process-number-filler.ts](../electron/pje/process-number-filler.ts) | preenche os campos segmentados do número CNJ |
| `pje-click-search` | [search-clicker.ts](../electron/pje/search-clicker.ts) | clica Consultar/Pesquisar |
| `pje-read-search-results` | [search-results-reader.ts](../electron/pje/search-results-reader.ts) | lê a lista de resultados |
| `pje-open-search-result` | [process-result-opener.ts](../electron/pje/process-result-opener.ts) | abre um resultado (por índice/número) |
| `pje-read-autos` | [autos-reader.ts](../electron/pje/autos-reader.ts) | lê movimentações e metadados dos autos |
| `pje-download-current-document` | [document-downloader.ts](../electron/pje/document-downloader.ts) | baixa o documento atual |
| `pje-analyze-downloaded-document` | [document-analyzer.ts](../electron/pje/document-analyzer.ts) | analisa o documento baixado (texto → resumo jurídico) |

## HITL — confirmacao humana na Console Lex

Toda ação que altera estado segue o mesmo protocolo, dentro do
[lex-desktop-bridge.ts](../electron/lex-desktop-bridge.ts):

1. **`dryRun: true` é o padrão.** Sem `dryRun: false` explícito, a ação só
   devolve um *preview* — não toca a página.
2. Quando `dryRun: false`, o bridge primeiro roda o dry-run para montar o
   preview, depois chama `requestTerminalConfirmation({ title, message, detail,
   confirmLabel, cancelLabel, level })`.
3. A confirmação aparece para o usuário no Console Lex. **Só executa de verdade
   se aceito.** Se negado, retorna `accepted: false` sem agir.

Consequência prática: a Lex nunca pratica ato no PJe sem o advogado ver o que vai
acontecer e confirmar. Leitura (`inspect`, `read-*`) é segura; ação
(`fill`, `click`, `open`, `download`) passa por confirmação.

Hoje a superficie visivel dessa confirmacao e a Console Lex do Electron, que
roda a TUI Python de [engine/lex-engine/cli.py](../engine/lex-engine/cli.py),
nao `ui-tui`.

Regras operacionais do fluxo atual:

- `pje_ler_resultados` pode encerrar o pedido sozinho quando a ultima
  movimentacao ja esta visivel. Nesse caso a Lex responde e apenas oferece
  abrir os autos se o usuario pedir.
- `pje_abrir_resultado` com `dryRun=false` e `aceitarAviso=true` e o caminho
  oficial para abrir autos com HITL na Console Lex.
- `lex_confirm` nao e a etapa principal desse fluxo; ficou apenas como legado
  opt-in.
- `Ctrl+C` enquanto o overlay de aprovacao estiver aberto equivale a `Negar`.

## Agente situado por contexto

A Lex não usa flows fixos por tribunal. Ela infere em que ambiente PJe está e age
conforme o contexto:

- [environment-context.ts](../electron/pje/environment-context.ts) — tipos e
  classificação do ambiente: `PjeProfileKind` (advogado/servidor/gabinete/...),
  `PjeAuthState` (logado/não-logado/...), `PjeSurfaceKind` (login/consulta/autos/...).
- [active-environment.ts](../electron/pje/active-environment.ts) —
  `inferCurrentPjeEnvironment()` lê a página ativa (URL, título, texto) e devolve
  o contexto.
- [context-inspector.ts](../electron/pje/context-inspector.ts) — inspeção rica da
  página: worldtree, frameTree, nós acionáveis, affordances.

Loop de exploração de intenção: `inspect-context` → `explore-intent` (monta
guidance) → `execute-intent-candidate` (dry-run → confirma → executa). Frente
ativa em [active/PJE-INTENT-EXPLORER.md](active/PJE-INTENT-EXPLORER.md) e
[active/PJE-UNIVERSALIZATION-SPRINT.md](active/PJE-UNIVERSALIZATION-SPRINT.md).

## Aprendizado e reuso

A Lex aprende rotas e seletores que funcionaram, por contexto:

- [route-memory.ts](../electron/pje/route-memory.ts) — destino semântico → URL que
  funcionou. Chave contextual `tribunal:contexto:destino`. Persiste em
  `userData/pje-route-memory.json`.
- `electron/browser/selector-memory.ts` — seletores por tribunal/contexto, com
  tracking de sucesso/falha.
- [exploration-learning.ts](../electron/pje/exploration-learning.ts) — registra
  explorações PJe bem-sucedidas, alimentando o Brain.
- [tribunal-urls.ts](../electron/pje/tribunal-urls.ts) — mapa tribunal →
  login/consulta + destinos semânticos diretos.
- [cnj.ts](../electron/pje/cnj.ts) — parse/validação de número CNJ.

O Brain ([electron/brain/](../electron/brain/)) guarda replay de micro-flows
(`replay-engine.ts`, `replay-executor.ts`), `page_state`, e consolida via dream.
Direção atual `Markdown-first`: conhecimento durável tende a subir para
`Hermes + markdown`; o Brain fica como aceleração situada. Ver
[active/LEX-MARKDOWN-FIRST-MEMORY-SKILLS.md](active/LEX-MARKDOWN-FIRST-MEMORY-SKILLS.md).

## Fluxo MVP validado

Caminho central do produto, já validado em PJe real de advogado (processo
`0886971-84.2025.8.14.0301`):

```
consultar processo → abrir resultado correto → ler autos
                   → baixar documento atual → analisar sentença
```

Roteiro de regressão em
[archive/PJE-ADVOGADO-FIRST-EXECUTION-CHECKLIST.md](archive/PJE-ADVOGADO-FIRST-EXECUTION-CHECKLIST.md).

## Distribuição via MCP

A expertise PJe também é exposta como produto via MCP, para clientes que já usam
Claude Desktop/outro agente: [engine/lex-pje-mcp/](../engine/lex-pje-mcp/) (MCP
Python dedicado, em construção, ainda não plugado em `~/.hermes/config.yaml`). É
camada de distribuição, não substitui o fechamento do produto Desktop.

## Legado / removido

- As **8 skills Playwright** antigas (`pje/abrir`, `agir`, `consultar`,
  `movimentacoes`, `documentos`, `navegar`, `preencher`, `bulk-coletar`) foram
  **removidas**. Não recriar — o caminho é MCP/bridge/`electron/pje/*`.
- A skill `pje_browser_use` ([electron/skills/pje/browser-use.ts](../electron/skills/pje/browser-use.ts))
  ainda existe como camada interna/transicional, mas **não é o caminho principal**.
  Só seria invocada pelo agent loop legado (removido), então está inerte na
  prática.
- Utilitários que sobrevivem em `electron/skills/pje/`: `token-check`,
  `pedir-codigo`.
