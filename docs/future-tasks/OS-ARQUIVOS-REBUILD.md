# OS Arquivos — Reconstrução Correta

> **Atualizacao em 2026-05-09:** este plano descreve recuperacao de skills OS
> legadas do Electron. Na arquitetura atual, o caminho preferido para
> raciocinio, planner, multiagentes e workflows e Lex Engine/Hermes; o Electron
> deve ficar como executor/bridge local. Workflows longos devem ir para Agora,
> nao para um novo pipeline dentro de `electron/agent`.

**Status:** Phase 1 (`processo_mapa`) implementada e validada; Phase 2 (routing/loop) pendente.
**Origem:** versão expandida foi implementada uma vez, quebrou o que funcionava, foi removida (`stash@{0}` no commit anterior a `e6b03bd9`).
**Discussão:** 2026-04-27.
**Contexto:** [`docs/SKILLS-OS-INTEGRATION.md`](../SKILLS-OS-INTEGRATION.md) seção 4.1.

---

## Objetivo

Trazer de volta as operações ampliadas de `os_arquivos` (PDF de processo, OCR seletivo, jobs Docling) sem repetir os erros que causaram o rollback. Toda nova operação precisa vir com testes, contrato claro e integração revisada com router/critic/loop.

## Operações que precisam voltar

Lista vinda do `stash@{0}`. Cada uma deve ser implementada como subtarefa independente, validada antes da próxima.

### 1. `processo_mapa` (LOAD-BEARING — primeira a voltar)

Lê o índice/capa de um PDF de processo PJe e retorna estrutura semântica.

**Saída:**
```ts
{
  processo: string,                   // numero CNJ extraído
  partes: [{ nome, papel }],
  documentos: [{
    id, documento, tipo, data, hora,
    paginaInicial, paginaFinal
  }],
  aliasesDocumentos: {                // chaves estáveis pra resolver peça
    peticao_inicial, contestacao,
    ultima_decisao, ultima_movimentacao_documento, ...
  },
  totalDocumentos: number,
  paginas: number,                    // total de páginas do PDF
  indiceEncontrado: boolean,
  qualidadeMapa: 'boa' | 'parcial' | 'nao_encontrado',
  fonte: 'texto_nativo' | 'docling' | ...
}
```

**Dependências:** `mapearProcessoPdf()` em `electron/tools/os-tools.ts` (precisa ser puxada do stash junto, com revisão).

### 2. `processo_documento`

Resolve uma peça pelo nome/ID/alias usando o mapa em cache, retorna conteúdo da peça.

**Parâmetros:**
- `caminho`: PDF do processo
- `documento`: nome livre ("Petição Inicial"), tipo ("Contestacao"), ID ("157805297") ou alias canônico (`peticao_inicial`)
- `ocr`: `'auto'` | `'sempre'` | `'nunca'` (default `'auto'`)

### 3. `processo_pecas`

Plano semântico — extrai múltiplas peças em uma chamada.

**Parâmetros:**
- `caminho`
- `documentos`: lista CSV de aliases (`peticao_inicial,contestacao,ultima_decisao`)
- `ocr`

### 4. `extrair`

Leitura genérica com política de OCR explícita.

**Parâmetros novos:**
- `ocr`: `'auto'` (Docling só se nativo for fraco) | `'sempre'` (força Docling) | `'nunca'`
- `paginas`: intervalo seletivo (`"1-5"`, `"2,7-9"`)
- `formato`: `'md'` | `'text'` | `'json'` (default `'md'`)

### 5. `docling`

Força conversão via Docling (OCR pesado).

### 6. `doc_job_criar` / `doc_job_status` / `doc_job_cancelar`

Jobs Docling em background pra OCR de PDFs grandes.

### 7. Parâmetros suplementares

- `confirmado`: confirma OCR pesado depois de preflight
- `job_id`, `contexto_job`: identificação e metadados do job

---

## Erros encontrados na implementação anterior

Capturados durante o debug em 2026-04-27. **Cada item precisa ter teste de regressão antes de mergear:**

### E1. Loop infinito de `processo_mapa`

**Sintoma:** LLM chama `processo_mapa`, recebe mapa, na próxima iteração chama `processo_mapa` de novo. Detector de loop trava pedindo confirmação ao usuário, que diz "tente novamente", e o LLM repete.

**Causa raiz:** `findReusableOsArquivosResult` em [`loop.ts:2080`](../../electron/agent/loop.ts#L2080) (na versão expandida) só cobria `extrair` e `docling`, não `processo_mapa`/`processo_documento`/`processo_pecas`. Resultado redundante não era reaproveitado.

**Fix esperado:** estender `osArquivoSignature` pra cobrir todas as operações que dependem só de `caminho` (+ params secundários estáveis). Quando detectado, injetar SISTEMA hint específico por tipo de operação:
- `mapa` repetido → "mapa já existe; chame `processo_pecas` ou `processo_documento` ou pergunte ao usuário"
- `documento`/`pecas` repetidos → "já extraído; use o resultado"

### E2. Router cego pra intenções de processo

**Sintoma:** `os-intent-router.ts` não tinha hint para "analise esse processo", "leia a petição inicial", "OCR essa página". LLM defaultava pra `processo_mapa` ou `terminal_executar`.

**Fix esperado:** adicionar bloco no router que dispara em verbos `analise|leia|extrair|busca|veja` + substantivos `processo|peticao inicial|contestacao|sentenca|decisao|peca|movimentacao` quando há PDF de processo no contexto. Acoplado ao Sprint 1 do [`OS-ROUTER-REWORK`](OS-ROUTER-REWORK.md) — pode ser que o roteamento por descrição rica (Claude Code style) resolva isso sem regex.

### E3. Pergunta repetida apesar de resposta válida

**Sintoma:** agente pergunta "Como você quer analisar?" com 5 opções, usuário escolhe "Visão geral", agente repergunta com texto ligeiramente diferente.

**Causa raiz:** `hasChosenAnalysisMode` na versão antiga usava regex literal (`/\bvis[aã]o geral\b/`) que não cobria variações reais ("Visão geral rápida (partes, tipo de ação, pedidos principais)"). Quando não casava, condição `isBroadProcessAnalysis && !hasChosenAnalysisMode` permanecia true → mesma pergunta sugerida.

**Fix esperado:** `hasChosenAnalysisMode` deve delegar para `detectProcessAnalysisMode` (que retorna o modo se reconhecer), e `detectProcessAnalysisMode` precisa cobrir as variações que o LLM efetivamente gera ("buscar documento específico", "extrair peça", etc.). Tem que vir com **testes de unidade** rodando contra prompts reais.

### E4. Override de pergunta não consultava router

**Sintoma:** quando o LLM decidia `tipo=pergunta`, o loop não verificava se o roteador OS já tinha skill concreta a sugerir. Resultado: usuário responde, agente repergunta, LLM responde igual.

**Fix esperado:** no `case 'pergunta'` do loop, antes de exibir, consultar router. Se há skill concreta + temos mapa do processo + usuário já escolheu modo, redirecionar pra skill. Restrito ao cenário "processo_mapa rodou + analysisMode != null" pra evitar hijack de perguntas legítimas.

### E5. Fallback ausente quando aliases/páginas não casam

**Sintoma:** modo `'overview'` chamado, mas `aliasesDocumentos` do mapa estava vazio E os regex de `pagesForAnalysisMode` não casavam com nenhum documento. Função caía sem retorno → router caía na pergunta amplia → loop.

**Fix esperado:** garantir que o branch `if (mappedDocs.length > 0 && analysisMode)` SEMPRE retorne quando detecta modo. Adicionar fallback final por `total_paginas`:
- `latest` → últimas 20 páginas
- `overview` → primeiras 20 + últimas 20
- `deep` → primeiras 40

### E6. `processo_mapa` ressugerido apesar de já existir

**Sintoma:** [`os-intent-router.ts:885-892`](../../electron/agent/os-intent-router.ts#L885-L892) (versão antiga) sugeria `processo_mapa` mesmo com `hasLatestProcessMap(ctx) === true`.

**Fix esperado:** adicionar guard `!hasLatestProcessMap(ctx)` na condição.

### E7. Critic não revalida `correctedDecision`

**Sintoma:** quando o critic redireciona uma skill via `correctedDecision`, não roda heurísticas extras na nova skill. Perde a checagem de mutantes / processo number / etc.

**Fix esperado:** após gerar `correctedDecision`, re-rodar `runHeuristics` na skill alvo antes de retornar approved.

### E8. Audit log sem rotação

**Sintoma:** `LEX_OS_AUDIT_LOG` é JSONL append-only. Em uso intenso vira gigante.

**Fix esperado:** rotação por tamanho (~10 MB) ou idade (30 dias).

---

## Plano de implementação

### Phase 1 — Foundation
- [x] Trazer `mapearProcessoPdf` + utilitarios de `os-tools.ts` com review linha a linha, sem `git checkout`/`stash pop` cego.
- [x] Reativar `processo_mapa` em `os_arquivos`.
- [x] Cobrir parser PJe com indice normal, indice achatado e inferencia de paginas por ID.
- [x] Cobrir PDF real sem indice e cache hit.
- [x] Validar que `os_arquivos.ler/grep/info` continua funcionando intacto via `npm run test:os`.
- [ ] Smoke manual no app com um PDF PJe real do usuario antes de considerar a experiencia final fechada.

### Phase 2 — Routing & Loop
4. Aplicar fixes E1, E2, E5, E6, E7. Cada um com teste de regressão.
5. Aplicar fix E3, E4 (over­ride pergunta repetida) com vocabulário real coletado de logs reais (não regex inventado).

### Phase 3 — Operações secundárias
6. `processo_documento` (resolve peça pelo mapa).
7. `processo_pecas` (plano de múltiplas peças).
8. `extrair` com `ocr` policy (`auto`/`sempre`/`nunca`).
9. `docling` standalone.

### Phase 4 — Background jobs
10. `doc_job_criar`/`status`/`cancelar`.
11. UI de progresso de job (renderer).

### Phase 5 — Operacional
12. Aplicar fix E8 (audit log rotation).
13. Documentar no [`SKILLS-OS-INTEGRATION.md`](../SKILLS-OS-INTEGRATION.md) o estado final.

---

## Anti-padrões a evitar

- **Não trazer todo o stash de uma vez** com `git stash pop`. Foi assim que quebrou da última vez. Pegar arquivo por arquivo, ler diff, decidir o que entra.
- **Não confiar em regex de variações naturais sem testes.** O LLM gera frases diferentes a cada run. Cada regex novo precisa de teste com 5+ exemplos reais.
- **Não fazer `arquivos.ts` virar god-object.** As operações de processo (mapa/peca/pecas) podem morar em arquivo separado (`electron/skills/os/processo.ts`?) e `arquivos.ts` re-exportar — depende do trade-off entre coesão e tamanho. Decidir antes de codar.
- **Não esquecer do critic.** Cada nova operação precisa estar em `READ_ONLY_SKILLS` ou `LOCAL_CONFIRMATION_SKILLS` em [`critic.ts:35-63`](../../electron/agent/critic.ts#L35-L63), senão dispara LLM critic desnecessário.

## Critério de "feito"

- Todos os testes em [`scripts/test-os-skills.js`](../../scripts/test-os-skills.js) passam.
- Roteador tem testes em [`scripts/test-os-planner.js`](../../scripts/test-os-planner.js) cobrindo cada modo de análise com 3+ variações de prompt.
- Smoke test manual: "vá em downloads, subpasta documentos importantes, analise esse processo" → opção 1 → recebe síntese sem loop.
- [`SKILLS-OS-INTEGRATION.md`](../SKILLS-OS-INTEGRATION.md) atualizado: §4.1 marcado como resolvido.

## Quando começar

Depois do Sprint 1 do [`OS-ROUTER-REWORK`](OS-ROUTER-REWORK.md). Sem o novo formato de descrição (Claude Code style), as operações de processo voltam com a mesma fragilidade do router que causou os problemas E1-E5.

**Atualização 2026-04-27:** Sprint 1 do router foi validado com Haiku 4.5 e Sonnet 4.6. Esta task está desbloqueada para iniciar pela Phase 1 (`processo_mapa`).

**Atualizacao 2026-04-27:** Phase 1 implementada de forma reduzida e testavel: `processo_mapa`, parser semantico, aliases, inferencia de paginas e cache em memoria. Validacoes: `type-check`, `test:os` (50/50), `test:planner:os` (3/3) e `validate:router:sprint1` (12/12 com Haiku 4.5 + Sonnet 4.6).
