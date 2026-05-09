# OS Router Rework — Regex → Tool Descriptions Estilo Claude Code

> **Atualizacao em 2026-05-09:** este documento registra trabalho feito no
> roteamento OS legado do Electron. Na arquitetura atual, Lex Engine/Hermes e o
> cerebro para raciocinio, planner e multiagentes; o Electron fica como bridge
> local supervisionada. Nao expandir `electron/agent` como novo motor.

**Status:** Sprint 1 concluído e validado (2026-04-27). Pronto para Sprint 2.
**Discussão:** 2026-04-27.
**Contexto relacionado:** [`docs/SKILLS-OS-INTEGRATION.md`](../SKILLS-OS-INTEGRATION.md) seção 4.

## Histórico

- **2026-04-27** — Sprint 1 implementado: `os_buscar.descricao` reescrita no formato Claude Code (bullets WHEN / WHEN NOT / exemplos com cabeçalho do uso real). Bloco de busca removido de `os-intent-router.ts` (linhas 192-198 + função `extractSearchTerm` que ficou órfã). 6 testes `expectNoHint` adicionados em `scripts/test-os-planner.js` cobrindo "procura/ache/cade/encontra/tem algum" + caso negativo "buscar processo PJe". Ajuste posterior: `getSkillsForPrompt()` passou a renderizar todos os exemplos da skill, não só `exemplos[0]`. Type-check OK, suite passa.
- **2026-04-27** — Validação com modelos reais concluída via `npm run validate:router:sprint1`: Claude Haiku 4.5 e Claude Sonnet 4.6 passaram nos 6 prompts de smoke. O caso CNJ foi aceito como `pje_browser_use` porque o PJe está em modo MCP; o critério real é não cair em `os_buscar`.

---

## Por que mudar

`electron/agent/os-intent-router.ts` tem ~200 LOC de regex pra rotear intenção do usuário pra skills `os_*`. Três problemas estruturais:

1. **Sinônimos perdidos.** "procura"/"busca"/"encontra"/"ache" passam; "vê se tem", "cadê", "tem algum X" não.
2. **Ordem de match traiçoeira.** Bloco `delet|apag` ([os-intent-router.ts:166-169](../../electron/agent/os-intent-router.ts#L166-L169)) vence antes do bloco de `mover|organiza`. Frase tipo "remova esses arquivos da pasta X pra Y" cai em `os_deletar` quando devia ser `os_mover`.
3. **Sinais de domínio frágeis.** `isPcContext` ([linhas 82-94](../../electron/agent/os-intent-router.ts#L82-L94)) marca contexto PC pela presença de "documentos" — mas "documentos do processo" é PJe.

## Direção escolhida

Seguir o padrão de **Claude Code / OpenAI Assistants / MCP**: o modelo lê descrições enriquecidas das skills e escolhe. Sem regex no meio.

Cada skill ganha descrição estruturada:
- **WHEN to use** — gatilhos positivos.
- **WHEN NOT to use** — anti-padrões com "use X em vez disso".
- **Examples** — 1-2 prompts de usuário e a chamada esperada.

Manter apenas **uma regra de correção**: `terminal_executar → os_*` (LLMs defaultam pra terminal mesmo com prompt forte; valor real do router atual).

## Sprints

### Sprint 1 — Protótipo + 1 skill (escopo: 1 PR pequeno) ✅ CONCLUÍDO 2026-04-27

- [x] Reescrever `descricao` + `parametros[*].descricao` de `os_buscar` em [`electron/skills/os/buscar.ts`](../../electron/skills/os/buscar.ts) no formato WHEN/WHEN NOT/exemplos.
- [x] Remover do router o bloco de busca (substituído por comentário apontando para o Sprint).
- [x] Remover função `extractSearchTerm` órfã.
- [x] Adicionar 6 prompts de teste em [`scripts/test-os-planner.js`](../../scripts/test-os-planner.js) — `expectNoHint` para "procura/ache/cade/encontra/tem algum" + caso negativo "buscar processo PJe".
- [x] Garantir que o prompt injeta os 5 exemplos completos de `os_buscar` (comentário de uso real + JSON esperado).
- [x] Type-check passa.
- [x] Suite `node scripts/test-os-planner.js` passa (3/3).
- [x] **Validação com modelos reais:** `npm run validate:router:sprint1 -- --models claude-haiku-4-5-20251001` passou 6/6.
- [x] **Validação com modelos reais:** `npm run validate:router:sprint1 -- --models claude-sonnet-4-6` passou 6/6.
- [x] **Flag opcional** `LEX_OS_ROUTER_LEAN=1`: não adicionada no Sprint 1. Com Haiku/Sonnet passando, rollback por flag fica reservado para regressão real em modelo fraco/BYOK.

**Critério de aprovação:** os 5-6 prompts roteiam corretamente em ambos os modelos sem o regex. Validado em Haiku 4.5 e Sonnet 4.6.

### Sprint 2 — Propagar para as 10 skills restantes

Aplicar o mesmo formato de descrição em ordem (do mais usado pro menos):
1. `os_listar`
2. `os_arquivos` (depois que a versão expandida do stash for resolvida — ver [SKILLS-OS-INTEGRATION.md §4.1](../SKILLS-OS-INTEGRATION.md))
3. `os_mover`
4. `os_deletar`
5. `os_escrever`
6. `os_sistema`
7. `os_tamanho`
8. `os_clipboard`
9. `os_fetch`
10. `terminal_executar`

A cada skill: remover o bloco regex correspondente em `os-intent-router.ts`, adicionar prompts de teste, validar.

Ao final, `os-intent-router.ts` fica reduzido a ~50 LOC contendo só a regra `terminal_executar → os_*` (e talvez a heurística de path inference que ainda é útil para extrair `caminho` de "downloads/...").

### Sprint 3 — Sub-agente OS

- Hoje [`AgentTypeId='os'`](../../electron/agent/agent-types.ts#L62-L70) existe mas o `Planner` raramente o spawna.
- Detectar goals puramente OS (sem termos PJe/jurídicos) e spawn do agente `os` em vez do `general`.
- Ganho: prompt menor (só ~11 skills OS injetadas), `systemPromptExtra` específico, foco do modelo.

## Tradeoffs aceitos

- **Custo extra na 1ª iteração.** Hoje regex resolve grátis; com novo modelo, gasta tokens pra escolher tool. Em troca: cobre paráfrase, manutenção zero, melhora sozinho com modelos melhores.
- **Modelos fracos podem errar.** Se BYOK roda em Llama free ou Haiku, escolha pode ser ruim. Mitigação: descrições com anti-patterns explícitos + flag `LEX_OS_ROUTER_LEAN` desligada permite cair de volta no regex.

## Anti-objetivos

- **Não remover** a regra `terminal_executar → os_*` — é a melhor parte do router atual.
- **Não trocar por LLM router separado** (segunda chamada de classificação). O modelo principal já vai escolher; uma chamada extra pra "classificar antes" duplica custo sem benefício.
- **Não fazer embedding-based routing** agora. Adiciona dependência (vetorizador local ou API), benefício marginal sobre descrições bem escritas.

## Referências

- Claude Code tool definitions (no system prompt, formato `name + description + parameters` com WHEN/WHEN NOT). Esse é o template que estamos copiando.
- [docs/SKILLS-OS-INTEGRATION.md](../SKILLS-OS-INTEGRATION.md) — relatório completo das 11 skills + outros gaps.
- [project_market_tools_2026.md](../../../.claude/projects/c--Users-EDER-lex-test1/memory/project_market_tools_2026.md) — análise de mercado mencionando Hermes Agent (não temos detalhes da arquitetura interna deles).

## Quando começar

Decidido após resolver o item 4.1 do relatório (recuperar `os_arquivos` ampliado do stash). Sem isso, reescrever a descrição de `os_arquivos` é prematuro.
