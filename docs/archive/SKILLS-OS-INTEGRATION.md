# Relatório de Integração — Skills OS

Estado em 2026-04-27, contra o commit `e6b03bd9` (HEAD `main`).

Atualizacao em 2026-05-09: este relatorio descreve skills OS do agente
TypeScript/Electron. A arquitetura atual usa Lex Engine/Hermes como cerebro; as
skills OS do Electron devem ser tratadas como legado/ponte local, nao como lugar
para expandir orquestracao. Workflows duraveis devem passar pela Agora.

Esse relatório cobre apenas a categoria **`os`**. Próximas partes (browser, pje, documentos, pesquisa, plugins) virão em arquivos separados.

---

## 1. Inventário das skills OS

Diretório: [`electron/skills/os/`](../electron/skills/os/) — registradas via `registerOsSkills()` em [`electron/skills/os/index.ts`](../electron/skills/os/index.ts).

| Skill (`nome`) | Arquivo | LOC | Mutante? | Confirmação | Observação |
|---|---|---:|---|---|---|
| `os_listar` | [`listar.ts`](../electron/skills/os/listar.ts) | 186 | não | — | Lista pastas com filtro/sort/paginação. Atalhos `downloads`, `desktop`, `documentos`, `~`. |
| `os_arquivos` | [`arquivos.ts`](../electron/skills/os/arquivos.ts) | 137 | não | — | Apenas `ler` / `grep` / `info`. **Sem** `processo_mapa`, `extrair`, `docling`, `processo_documento`, `processo_pecas` — esses estão no working tree não-committado. |
| `os_buscar` | [`buscar.ts`](../electron/skills/os/buscar.ts) | 192 | não | — | Busca recursiva por nome (glob) + filtro de conteúdo. Modo `duplicados_nome`. |
| `os_escrever` | [`escrever.ts`](../electron/skills/os/escrever.ts) | 103 | sim | gate na skill (`confirmado:true` em sobrescrita) | Cria arquivo/pasta. |
| `os_mover` | [`mover.ts`](../electron/skills/os/mover.ts) | 759 | sim | gate (`batch_confirmado:true`, `dry_run`) | Mover/renomear/copiar/criar pasta. Plano semântico, dry-run, organização incompleta. |
| `os_deletar` | [`deletar.ts`](../electron/skills/os/deletar.ts) | 187 | sim | gate (`confirmado` / `batch_confirmado`) | Default vai pra Lixeira; `permanente:true` é irreversível. |
| `os_tamanho` | [`tamanho.ts`](../electron/skills/os/tamanho.ts) | 87 | não | — | Mede tamanho recursivo + ranking de subpastas. |
| `os_sistema` | [`sistema.ts`](../electron/skills/os/sistema.ts) | 196 | parcialmente | gate (`confirmado` em encerrar) | `info`, `pastas`, `abrir`, `processos`, `encerrar`. Não roda shell. |
| `os_clipboard` | [`clipboard.ts`](../electron/skills/os/clipboard.ts) | 68 | sim (escrita) | — | Ler/escrever clipboard Windows. |
| `os_fetch` | [`fetch.ts`](../electron/skills/os/fetch.ts) | 58 | não | — | HTTP GET de URL pública. Bloqueia hosts privados via `isPrivateHost`. |
| `terminal_executar` | [`terminal.ts`](../electron/skills/os/terminal.ts) | 319 | sim | gate (mutantes/compostos) | Bastidor técnico (python/git/npm). Comandos de leitura passam direto. |

**Total:** 11 skills, 2 343 LOC.

A categoria string é sempre `'os'`. Quem segrega quando filtrar por agente é o `AgentSpec.allowedSkillCategories` em [`agent-types.ts`](../electron/agent/agent-types.ts:62-70) — o tipo `os` permite `['os', 'pc']`.

---

## 2. Camadas de integração

```
 user goal
    │
    ▼
┌──────────────────┐   suggestOsPlannerAction()
│  os-intent-router│ ──────────► hint OsIntentHint { tipo, skill, parametros, motivo }
└──────────────────┘
    │
    ▼
┌──────────────────┐   buildUserPrompt() injeta "## Roteamento OS Sugerido"
│      think       │
└──────────────────┘
    │
    ▼
┌──────────────────┐   correctOsIntent() pode redirecionar terminal_executar → os_*
│      critic      │   READ_ONLY_SKILLS / LOCAL_CONFIRMATION_SKILLS pulam LLM review
└──────────────────┘
    │
    ▼
┌──────────────────┐   executeSkill() despacha para os_tools
│     executor     │   timeoutMs por categoria (60s pra `os`)
└──────────────────┘
    │
    ▼
┌──────────────────┐   audit log via tools/os-tools (+ LEX_OS_AUDIT_LOG)
│ skill (.execute) │   confirmação local quando aplicável
└──────────────────┘
```

### 2.1 Router determinístico — [`os-intent-router.ts`](../electron/agent/os-intent-router.ts)

Heurística textual sobre `objetivo` + `chatHistory` + `passos`. Retorna `OsIntentHint`. Cobertura atual:

| Sinal no texto | Hint produzido |
|---|---|
| `processos\|programas` + `encerra\|fecha\|lista` | `os_sistema { operacao: processos\|encerrar }` |
| `duplicad\|copia` + `nome obvio` | `os_buscar { modo: duplicados_nome }` |
| `duplicad` sem critério | pergunta com 3 opções |
| `delet\|apag\|remov` | `os_deletar` (com `dry_run` se pediu simular) |
| `mover\|renome\|copiar\|organiza\|arruma` | `os_mover` (organizar entra com `dry_run:true`) |
| `abre\|abrir` + `arquivo\|pasta\|pdf\|.docx` | `os_sistema { operacao: abrir }` |
| `tamanho\|espaco\|ocupa\|MB` | `os_tamanho` |
| busca comum por nome/conteúdo | sem hint determinístico; `os_buscar` é escolhido pela descrição enriquecida da skill |
| `lista\|liste\|veja\|ver\|mostra` | `os_listar` |

**Gate de contexto PC:** `isPcContext()` exige menção a Downloads/Desktop/Documentos/arquivos/pastas/extensão/path Windows. Se não bater, retorna `null` e o LLM decide sem nudge.

### 2.2 Think — [`think.ts:16, 174`](../electron/agent/think.ts)

- Importa `suggestOsPlannerAction` + `formatOsIntentHint`.
- Adiciona seção `## Roteamento OS Sugerido` no user prompt quando o hint existe.
- System prompt enumera as skills e diz "prefira skills OS específicas antes de terminal".
- Sprint 1 do router rework removeu o hint determinístico de busca; os exemplos de `os_buscar` agora entram pelo bloco `getSkillsForPrompt()`.

### 2.3 Critic — [`critic.ts:108-123`](../electron/agent/critic.ts)

Quando o LLM pede `terminal_executar`, o critic chama o router e, se houver alternativa OS específica, retorna `correctedDecision` apontando pra ela. Esse é o único redirecionamento ativo.

`READ_ONLY_SKILLS` inclui todas as 11 skills OS (com mutações marcadas para o grupo `LOCAL_CONFIRMATION_SKILLS`). Resultado: skills OS pulam o LLM review do critic e são liberadas pela heurística — performance/custo OK, mas o critic não revalida parâmetros depois que `correctedDecision` da heurística sai.

### 2.4 Loop — [`loop.ts:1213-1228`](../electron/agent/loop.ts)

`buildConfirmedParams()` — quando o usuário responde "sim" pra HITL, o loop reinjeta `confirmado:true` (e `batch_confirmado:true` para `os_mover`/`os_deletar`). É o canal pelo qual a UI confirma sobrescrita / batch / encerrar processo.

Não há outro tratamento OS específico. Fora isso, OS skills passam pelo fluxo padrão de skill execution.

### 2.5 Executor / agent-types

- [`executor.ts:91, 136, 226`](../electron/agent/executor.ts) — timeout default por categoria (60s para `os`), retries 2x para `pje`/`browser`, isBrowserAction não toca em `os`. `getSkillsForPrompt()` filtra por `allowedCategories`.
- [`agent-types.ts:62-70`](../electron/agent/agent-types.ts) — agent tipo `os` permite `['os', 'pc']` e tem prompt extra explicando quando usar cada skill OS vs terminal.

### 2.6 Tools — [`electron/tools/os-tools.ts`](../electron/tools/os-tools.ts)

1 546 LOC de utilitários compartilhados. Exporta `resolverCaminhoOs`, `aplicarBaseCaminhoOs`, `infoSistema`, `lerClipboard`, `escreverClipboard`, `pastasConhecidas`. Concentra normalização Unicode, glob→regex, resolução de aliases (`downloads`, `~/...`), bloqueio de host privado em `os_fetch` e o audit log JSONL (env `LEX_OS_AUDIT_LOG`, default em `userData/os-audit.jsonl`).

### 2.7 Testes — [`scripts/test-os-skills.js`](../scripts/test-os-skills.js) e [`test-os-planner.js`](../scripts/test-os-planner.js)

- `test-os-skills.js` (1 094 LOC): testa cada skill com tmpdir isolado. Cobre listar/buscar/escrever/mover/deletar/arquivos/tamanho/sistema/clipboard/fetch/terminal.
- `test-os-planner.js` (191 LOC): smoke do roteador — testa que cada texto produz o hint esperado.
- `validate-os-router-sprint1.js`: smoke com modelo real para garantir que `os_buscar` é escolhido pela descrição enriquecida sem regex de busca.

Rodar com `node scripts/test-os-skills.js` exige `dist-electron` compilado (`tsc -p tsconfig.electron.json`).

---

## 3. Pontos fortes

1. **Cobertura de operação rica.** As 11 skills cobrem todo o vocabulário comum de OS — listar, ler, escrever, mover, deletar, buscar, medir, abrir, processos, clipboard, fetch, terminal.
2. **Confirmação local via parâmetros.** `confirmado` / `batch_confirmado` / `dry_run` evitam round-trip de LLM e dão controle determinístico sobre ações irreversíveis.
3. **Router determinístico cobre o "core".** Para os verbos óbvios (delet/mover/buscar/listar/abrir/tamanho), o router fecha o caso sem precisar de LLM, reduzindo custo e latência.
4. **Crit short-circuit.** Skills OS passam pela heurística do critic e pulam LLM review quando read-only ou já gateadas — economia clara em runs com muitas operações de arquivo.
5. **Audit log local.** `LEX_OS_AUDIT_LOG` JSONL permite reconstruir o que a skill fez sem inspecionar logs do LLM. Útil para suporte e privacidade.
6. **Testes unitários reais.** `test-os-skills.js` mexe em arquivos de verdade num tmpdir, cobre o caminho feliz e o de erro.

---

## 4. Gaps & dívidas

### 4.1 `os_arquivos` no commit é versão antiga

[`arquivos.ts:21-26`](../electron/skills/os/arquivos.ts) só tem operações `ler`, `grep`, `info`. As operações de processo PDF (`processo_mapa`, `processo_documento`, `processo_pecas`, `extrair`, `docling`, `doc_job_*`) **só existem no working tree não-committado**. O Codex já reescreveu a skill ampliada — ela está no stash `stash@{0}`.

**Impacto:** o agente não consegue analisar PDFs grandes de processo no estado atual. Toda a infra de mapa/peças/OCR seletivo está sem ponto de entrada.

**Recomendação:** trazer a versão expandida do stash, validar e committar como uma unidade (sem misturar com as outras 16 mudanças não-committadas). Comando: `git checkout stash@{0} -- electron/skills/os/arquivos.ts electron/tools/os-tools.ts` — isso traz só o necessário pra `arquivos`.

### 4.2 Router não conhece operações pesadas de PDF

`os-intent-router.ts` não tem hint para "analise esse processo" / "leia a petição inicial" / "OCR essa página". Mesmo quando `os_arquivos` ganhar `processo_mapa`/`processo_documento`/`processo_pecas`, o router precisa aprender essas intenções para nudgar o LLM.

**Recomendação:** adicionar bloco no router que dispara em `processo|peticao inicial|contestacao|sentenca|decisao|peca|movimentacao` quando há PDF de processo no contexto.

### 4.3 Override de pergunta repetida

Vimos no debug: o LLM tende a re-perguntar quando o usuário responde com texto livre (não afirmativo). O router não foi consultado dentro do `case 'pergunta'` — apenas no `case 'skill'`. Resultado: loop de Q/A.

**Recomendação:** quando `decisao.tipo === 'pergunta'`, consultar o router; se ele já tem skill concreta pra sugerir (porque o estado mudou após resposta anterior), pular a pergunta e injetar SISTEMA hint na próxima think. Esse fix está no stash mas precisa ser revisado fora do contexto do bug do `processo_mapa`.

### 4.4 `hasChosenAnalysisMode` rígido demais

A função (no stash) usa regex literal e quebra com variações naturais ("buscar documento específico" não bate com `busca espec[ií]fica`). Solução já tentada: delegar para `detectProcessAnalysisMode`. Vale revisitar com testes de unidade que usem o vocabulário que o LLM efetivamente gera.

### 4.5 Storage CLI vs electron-store dessincronizado

Não é estritamente "skills OS", mas afeta o agente: a chave Anthropic vive em dois arquivos (`%AppData%/lex-juridico/config.json` para electron-store e `%AppData%/lex-test1/cli-config.json` para o CLI). Quando o usuário troca pela UI, o CLI continua mandando `set-config` com a chave velha e ganha a corrida. Existe `scripts/fix-cli-key.js` no stash como workaround manual.

**Recomendação:** unificar. Opção mais barata — o CLI lê chaves via RPC `get-config` ao iniciar e só mantém modelos no `cli-config.json`. Opção estrutural — eliminar `cli-config.json` e fazer o CLI usar o mesmo electron-store via shared helper.

### 4.6 Critic não revalida `correctedDecision` da heurística

Quando o critic redireciona `terminal_executar → os_*`, ele não roda heurísticas extras na nova skill. Geralmente OK, mas perde a checagem `requiresProcessReference` e a confirmação de mutantes que normalmente seria aplicada se o LLM tivesse pedido a skill OS direto.

**Recomendação:** após gerar `correctedDecision`, re-rodar `runHeuristics` na skill alvo antes de retornar approved.

### 4.7 Audit log sem rotação

`os-audit.jsonl` é append-only, sem rotação ou limite de tamanho. Em uso intenso vira arquivo gigante e o `userData` cresce sem bound.

**Recomendação:** rotação por tamanho (~10 MB) ou idade (30 dias) com retenção configurável.

### 4.8 `os_fetch` mínimo

58 LOC; só GET, sem POST/headers/auth. Para muitas pesquisas jurídicas (DOU, JusBrasil) precisa pelo menos custom headers e cookies. Hoje qualquer caso com login cai pra `pje_agir` mesmo quando seria HTTP simples.

**Recomendação:** ampliar para suportar headers customizados e cookies persistidos por host, sem mexer no bloqueio de hosts privados.

### 4.9 Falta cobertura de teste no router

`test-os-planner.js` tem 191 LOC. A versão estendida do router que vimos no stash (com modos de análise, alias detection, doc job follow-up) tem 922 LOC e nenhum teste novo correspondente. Quando reintroduzirmos esse código, tem que vir com testes.

### 4.10 Sem agente OS dedicado em uso

Existe `AgentTypeId='os'` em [`agent-types.ts:62-70`](../electron/agent/agent-types.ts), mas o orchestrator quase nunca o invoca — o planner não decompõe goals em "subtask OS isolada". Tarefas OS rodam no `general` agent. Resultado: o `systemPromptExtra` específico de OS só é usado quando o caller explicitamente passa `agentSpec`.

**Recomendação:** quando o objetivo for puramente OS (ex: "organize meus downloads"), o planner deveria spawnar um agente `os` em vez do `general` — economiza prompt size e melhora foco.

---

## 5. Próximos passos sugeridos (ordem)

1. **Recuperar `os_arquivos` ampliado do stash** (item 4.1). Sem isso, análise de processo PDF não funciona.
2. **Estender o router pra modos de análise de processo** (4.2 + 4.3 + 4.4) — aplicar com testes em `test-os-planner.js`.
3. **Unificar storage de chave API** (4.5) — fim do bug recorrente.
4. **Rotação do audit log** (4.7) — barato, evita problema futuro.
5. **Critic revalidando `correctedDecision`** (4.6) — segurança extra em redirecionamentos.
6. **Planner spawnando agente `os` para goals puramente OS** (4.10) — refinamento, não bloqueia nada.
7. **Ampliar `os_fetch`** (4.8) — só quando aparecer demanda concreta de pesquisa.

Cada item rende um PR independente. Recomendo abrir um por vez para que o relatório possa ser atualizado em incrementos.

---

## 6. Apêndice — comandos úteis

```bash
# Type-check do processo principal
tsc -p tsconfig.electron.json --noEmit

# Smoke test do router (não precisa app rodando)
node scripts/test-os-planner.js

# Suite de skills (precisa de dist-electron compilado)
npm run build && node scripts/test-os-skills.js

# Recuperar conteúdo do stash sem aplicar
git stash show -p stash@{0} -- electron/skills/os/arquivos.ts | less
```
