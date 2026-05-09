# Auto-criacao de Skills pela IA — Estado Atual e Gaps para a Lex

> **Atualizacao em 2026-05-09:** este documento continua valido para a camada
> Engine/Hermes. Skills criadas ou ajustadas pelo agente devem alimentar chat
> inline, Console e workflows duraveis da Agora. O Desktop/Electron supervisiona
> permissoes, PJe, arquivos e auditoria; nao recriar essa logica em
> `electron/agent`.

Este documento mapeia o que existe no Hermes hoje sobre skills criadas pelo
agente, e o que falta construir para tornar a feature segura, auditavel e
diferenciada num produto juridico (Lex).

A intencao da feature e clara: cada uso bem-sucedido vira procedimento
reutilizavel. Para um advogado ou escritorio, isso significa que a Lex aprende
a forma deles de trabalhar e fica mais util a cada caso.

## Estado Atual no Hermes

### Tool: `skill_manage`

Implementada em `tools/skill_manager_tool.py`. Exposta ao proprio agente como
tool callable. Acoes disponiveis:

| Acao | Funcao | Linha |
| --- | --- | --- |
| `create` | Cria nova skill (SKILL.md + diretorio opcional) | `_create_skill` (~326) |
| `patch` | Find-and-replace em SKILL.md ou arquivo de apoio | `_patch_skill` (~419) |
| `edit` | Reescrita completa do SKILL.md | `_edit_skill` (~383) |
| `delete` | Remove skill | `_delete_skill` (~516) |
| `write_file` | Adiciona arquivo em `references/`, `templates/`, `scripts/`, `assets/` | `_write_file` (~539) |
| `remove_file` | Remove arquivo de apoio | `_remove_file` (~594) |

Schema OpenAI da tool: `SKILL_MANAGE_SCHEMA` em
`tools/skill_manager_tool.py:709`.

### Gatilhos no system prompt

Definidos em `agent/prompt_builder.py`:

- `SKILLS_GUIDANCE` (linha ~176): orienta a salvar skill apos tarefa complexa
  (5+ tool calls), erro dificil, ou workflow nao-trivial.
- Bloco "Skills (mandatory)" (linha ~845-872): instrui o agente a *patchar*
  skill desatualizada imediatamente e a *oferecer* salvar como skill apos
  tarefas iterativas.

### Protecoes ja implementadas

Em `tools/skill_manager_tool.py`:

- Validacao de nome (lowercase, hifens, max 64 chars) — `_validate_name` ~133.
- Validacao de categoria — `_validate_category` ~147.
- Frontmatter YAML obrigatorio com `name` + `description` — `_validate_frontmatter` ~172.
- Limite de tamanho do conteudo (100k chars) — `_validate_content_size` ~211,
  `MAX_SKILL_CONTENT_CHARS` ~119.
- Limite de tamanho de arquivo de apoio (1 MiB) — `MAX_SKILL_FILE_BYTES` ~120.
- Protecao contra path traversal — `_validate_file_path` ~251,
  `_resolve_skill_target` ~279.
- Escrita atomica — `_atomic_write_text` ~290.
- Deteccao de colisao de nome — em `_create_skill`.
- Skills externas (`external_dirs`) sao read-only — `_is_local_skill` ~109.
- Cache do system prompt e invalidado apos mudanca — `clear_skills_system_prompt_cache`
  chamado no fim de `skill_manage` ~696.

### Scanner de seguranca opcional

- Flag `skills.guard_agent_created` no config (padrao **off**) —
  `_guard_agent_created_enabled` ~56.
- Quando ligada, executa `tools/skills_guard.scan_skill` apos a escrita.
- Se o scan bloquear, faz rollback (`shutil.rmtree` em create,
  restaura conteudo original em edit) — `_security_scan_skill` ~72.

### Limitacao crucial

Hoje toda skill criada pelo agente vai para `~/.hermes/skills/` (constante
`SKILLS_DIR` em `tools/skill_manager_tool.py:103`), sem distincao entre:

- Skills oficiais do produto (bundled).
- Skills do tenant/cliente (institucionais).
- Skills criadas pelo agente naquela sessao especifica.

Tudo se mistura no mesmo diretorio e e listado igualmente em
`<available_skills>` do prompt.

## Lacunas para uso na Lex

Cinco camadas que precisam ser construidas. Estao numeradas pela ordem
sugerida de execucao.

### 1. Procedencia rastreavel

**O que falta:** marcar cada skill com sua origem e mante-las isoladas em
diretorios distintos.

**Por que importa:** auditor de TJPA ou compliance officer de escritorio
precisa saber se uma skill e oficial da Lex, foi customizada pelo cliente,
ou foi criada pela IA. Hoje e impossivel distinguir.

**Estrutura proposta:**

```
~/.lex/skills/
├── product/         # skills oficiais (lex-legal-brief, pje-bridge)
├── tenant/<id>/     # skills do escritorio/orgao
└── agent-created/<tenant_id>/<user_id>/
    └── <skill-name>/
        └── SKILL.md  # com metadata extra
```

**Frontmatter extra para skills agent-created:**

```yaml
---
name: contestacao-horas-extras-com-noturno
description: ...
metadata:
  lex:
    origin: agent-created
    created_at: 2026-05-01T14:32:00Z
    created_by_user: user_123
    tenant_id: tj-pa
    source_session: <session_id>
    approved: false
    approved_by: null
    approved_at: null
---
```

**Onde mexer:**

- `tools/skill_manager_tool.py:103` — `SKILLS_DIR` precisa virar resolucao
  por tipo (product/tenant/agent-created).
- `tools/skill_manager_tool.py:226` (`_resolve_skill_dir`) — destinar create
  do agente para `agent-created/<tenant>/<user>/`.
- `tools/skill_manager_tool.py:326` (`_create_skill`) — injetar metadata
  `lex.origin`, `created_at`, etc., automaticamente quando a tool e chamada
  pelo agente.
- `agent/skill_utils.py` — incluir os tres diretorios no scan, mas com flag
  de origem propagada para o resultado.
- `tools/skills_tool.py:546` (`_find_all_skills`) — passar a origem adiante
  em cada item devolvido, para o prompt e a UI distinguirem.

### 2. Aprovacao humana bloqueante

**O que falta:** skills criadas pelo agente devem nascer em estado `pending`
e nao entrar em producao ate aprovacao explicita.

**Por que importa:** hoje o prompt diz *"offer to save as a skill"* e
*"Confirm with user before creating/deleting"* (`tools/skill_manager_tool.py:725`).
No contexto juridico, "confirm" via chat e fragil — uma resposta "ok"
distraida nao deveria bastar. Precisa de fluxo explicito.

**Comportamento proposto:**

- `skill_manage(action='create')` chamada pelo agente cria a skill com
  `metadata.lex.approved: false`.
- Skills com `approved: false` **nao aparecem** no `<available_skills>` do
  system prompt e **nao podem ser carregadas** via `skill_view`.
- Aparecem em UI propria da Lex Desktop (lista de "skills pendentes") com
  diff/preview do conteudo, e exigem clique humano explicito para virar
  `approved: true`.
- Apenas o usuario com permissao de aprovacao (configurado por tenant) pode
  aprovar.

**Onde mexer:**

- `tools/skills_tool.py:546` (`_find_all_skills`) — filtrar
  `approved == false` quando chamado pelo agent loop.
- `tools/skills_tool.py:1057` (`_is_skill_disabled` / equivalente em
  `skill_view`) — bloquear leitura de skills nao-aprovadas pelo agente.
- Criar `tools/skill_approval.py` com funcoes `list_pending`, `approve`,
  `reject`.
- Bridge Lex Desktop (`lex/BRIDGE-CONTRACT.md`) — expor endpoints
  `GET /skills/pending`, `POST /skills/<name>/approve`,
  `POST /skills/<name>/reject`.

### 3. Quarentena e validacao de conteudo juridico

**O que falta:** scanner que valide o **conteudo** da skill antes da
aprovacao, nao so o codigo.

**Por que importa:** o `skills.guard_agent_created` atual
(`tools/skills_guard.py`) detecta padroes de codigo malicioso. Numa skill
juridica, o risco maior nao e malware — e:

- Citacao de jurisprudencia inventada (alucinacao).
- Artigo de lei errado ou inexistente.
- Calculo trabalhista/tributario com formula incorreta.
- Conteudo manipulado por prompt injection vinda de peticao adversaria
  (vide `lex/SKILLS-CATALOG-TJPA.md` secao "Releituras com Nuance" sobre
  godmode).
- Vies introduzido pelo proprio usuario via correcoes ("sempre conclua a
  favor do peticionario X").

**Validacoes propostas:**

| Categoria | Verificacao |
| --- | --- |
| Citacoes legais | Cruzar artigos citados (CLT, CPC, CF) com base local de leis. Marcar artigos inexistentes. |
| Jurisprudencia | Marcar trechos no formato de ementa que nao tenham fonte verificavel. |
| Calculos | Detectar formulas em scripts e marcar para revisao matematica. |
| Prompt injection | Rodar `lex-petition-guard` (a construir, vide catalogo) sobre o body da skill: zero-width chars, trigger words, instrucoes adversariais. |
| Vies textual | Heuristicas para frases imperativas que pre-decidem mérito ("sempre defira", "sempre conclua que..."). |

**Onde mexer:**

- Criar `tools/skill_juridical_guard.py` paralelo ao `skills_guard.py` atual.
- `tools/skill_manager_tool.py:72` (`_security_scan_skill`) — chamar tambem
  o guard juridico quando `metadata.lex.origin == 'agent-created'`.
- Scanner deve gerar relatorio anexado a skill (nao bloqueia a criacao em
  `pending`, mas e exibido junto na tela de aprovacao).

### 4. Isolamento por tenant

**O que falta:** garantir que skills criadas no contexto de um cliente nao
sejam visiveis a outro.

**Por que importa:** num produto multi-cliente (escritorios A e B,
TJPA, advogado autonomo X), skills criadas no contexto de cada um sao
informacao confidencial — podem revelar estrategia processual, formato
interno, dados de cliente. Hoje `~/.hermes/skills/` e flat e visivel a
qualquer sessao na mesma instalacao.

**Comportamento proposto:**

- `tenant_id` faz parte do path: `agent-created/<tenant>/<user>/<skill>`.
- O agent loop resolve o `tenant_id` da sessao ativa (gateway/CLI/Electron
  bridge fornecem) e filtra `_find_all_skills` para incluir apenas
  `product/`, `tenant/<active_tenant>/`, e
  `agent-created/<active_tenant>/`.
- Sub-isolamento opcional dentro do tenant (skill `agent-created` por
  usuario individual vs compartilhada com colegas) — flag `shared: bool` no
  frontmatter, default `false`.

**Onde mexer:**

- `gateway/session_context.py` — adicionar `get_session_tenant()` analogo
  ao `get_session_env('HERMES_SESSION_PLATFORM')` ja existente.
- `tools/skills_tool.py:546` (`_find_all_skills`) — receber/resolver
  tenant ativo e filtrar.
- `tools/skills_tool.py:524` (`_is_skill_disabled`) — extender resolucao
  para considerar tenant.
- Migracao: skills ja existentes em `~/.hermes/skills/` viram `product/`
  por padrao na primeira execucao.

### 5. Versionamento e rollback

**O que falta:** historico de modificacoes em skills.

**Por que importa:** uma skill pode ter sido usada em pecas reais. Alterar
ela depois e evento que precisa ficar registrado: quem alterou, quando,
qual diff, e capacidade de voltar a uma versao anterior. `patch` e `edit`
hoje sao destrutivos.

**Comportamento proposto:**

- Cada `patch`/`edit`/`delete` cria entrada em
  `<skill_dir>/.lex/history/<timestamp>-<user>.diff`.
- Tool nova `skill_history(name, action='list'|'show'|'rollback', version=N)`.
- Audit log central em `~/.lex/skills/.lex/audit.log` com hash de cada
  versao para detectar adulteracao.
- Skills `delete`-adas viram `archived` em vez de removidas (recuperaveis
  por 90 dias, configuravel).

**Onde mexer:**

- `tools/skill_manager_tool.py:383` (`_edit_skill`) — gravar diff antes do
  `_atomic_write_text`.
- `tools/skill_manager_tool.py:419` (`_patch_skill`) — idem.
- `tools/skill_manager_tool.py:516` (`_delete_skill`) — substituir
  `shutil.rmtree` por mover para diretorio de archive.
- Criar `tools/skill_history_tool.py` com a tool exposta ao agente e a
  endpoint da bridge Lex Desktop.

## Ordem Sugerida de Execucao

| Fase | Camada | Custo | Bloqueia o que? |
| --- | --- | --- | --- |
| 1 | Procedencia rastreavel | Baixo | Tudo abaixo depende. Sem origem marcada, nao tem como aplicar regra diferente para skill da IA. |
| 2 | Aprovacao bloqueante | Medio | Sem isso, nao da pra confiar a feature ao usuario final. |
| 3 | Quarentena/validacao juridica | Alto (depende de base local de leis e do `lex-petition-guard`) | Ortogonal a 4 e 5; pode rodar em paralelo se houver duas frentes. |
| 4 | Isolamento por tenant | Medio | Pre-requisito pra Lex Multi-cliente. Pode entrar antes de 3 se o produto comecar com unico tenant. |
| 5 | Versionamento/rollback | Medio | Importante mas nao bloqueia o lancamento; pode ficar pra v2 do recurso. |

Para um MVP do recurso "Lex aprende com voce", o minimo viavel e
**fase 1 + fase 2**. As fases 3, 4 e 5 sao requisitos para escalar para
multi-cliente e para uso institucional auditavel.

## Diferenciador de Produto

Vale notar: nenhuma IA juridica concorrente expoe esse ciclo de
auto-aprendizado controlado hoje. Quando feito direito (com aprovacao
humana, validacao juridica, e isolamento por tenant), isso vira
**a feature mais distintiva da Lex**:

- O cliente percebe que a ferramenta esta ficando dele com o tempo, nao
  e generica.
- O escritorio capitaliza conhecimento institucional na ferramenta em vez
  de no Drive desorganizado.
- A LGPD/auditoria sao satisfeitas pelo proprio mecanismo (cada skill tem
  origem, aprovador, historico).

A camada tecnica do Hermes para isso ja esta 60% pronta. As 5 lacunas
acima sao o que separa a versao "funciona pra dev" da versao "vendavel
para tribunal".
