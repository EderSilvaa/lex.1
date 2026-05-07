# Lex como MCP — Posicionamento e Modelo de Licenciamento

Este documento define a estrategia da Lex em relacao ao Model Context
Protocol (MCP) — padrao aberto da Anthropic para comunicacao entre agentes
de IA e ferramentas externas.

A posicao da Lex tem **duas pernas tecnicas e uma narrativa unica:**

1. **Cliente MCP** — a Lex consome qualquer ferramenta externa que fale MCP
   (PJe, jurisprudencia, sistemas internos, e-mail, calendario, etc.).
2. **Servidor MCP** — a Lex expoe sua expertise juridica brasileira como
   tools MCP, plugaveis em qualquer agente externo (Claude Desktop, Cursor,
   Codex, sistemas proprios de escritorios e tribunais).

**Narrativa:** a Lex e o **motor de expertise juridica brasileira**. Voce
consome essa expertise pelo aplicativo Lex Desktop ou pelo MCP da Lex,
plugado na ferramenta que voce ja usa.

Documento complementar a:
- [HERMES-INHERITANCE.md](HERMES-INHERITANCE.md) — inventario tecnico do
  que herdamos do Hermes, incluindo `tools/mcp_tool.py` (cliente) e
  `mcp_serve.py` (servidor).
- [SKILLS-AUTOCREATE.md](SKILLS-AUTOCREATE.md) — skills sao a base do
  repertorio que vira tools MCP.
- [SKILLS-CATALOG-TJPA.md](SKILLS-CATALOG-TJPA.md) — `lex-petition-guard`
  como tool defensiva.
- [PECAS-EDITOR.md](PECAS-EDITOR.md) — algumas tools MCP correspondem a
  capacidades do editor de pecas.

## 1. Estado Tecnico das Duas Pernas

### 1.1. Cliente MCP — `tools/mcp_tool.py`

**Pronto para uso.** Capacidades implementadas:

- Transportes: `stdio` (subprocess local) e `HTTP/StreamableHTTP` (servidor remoto).
- Auto-discovery: conecta no servidor, descobre as tools dele, registra elas
  no registry interno do agente.
- OAuth: fluxo OAuth completo via `tools/mcp_oauth.py` e
  `tools/mcp_oauth_manager.py`.
- Reconexao automatica com backoff exponencial.
- Filtragem de env vars em subprocesses stdio.
- Stripping de credenciais em mensagens de erro.
- Sampling reverso (servidor MCP pede LLM da Lex via `sampling/createMessage`).
- Thread-safe com event loop dedicado.

Configuracao em `~/.hermes/config.yaml`, secao `mcp_servers`.

### 1.2. Servidor MCP — `mcp_serve.py`

**Infraestrutura pronta. Conteudo precisa ser redefinido para a Lex juridica.**

Hoje expoe 10 tools de mensageria (heranca do Hermes original): `conversations_list`,
`conversation_get`, `messages_read`, `attachments_fetch`, `events_poll`,
`events_wait`, `messages_send`, `channels_list`, `permissions_list_open`,
`permissions_respond`.

Compatibilidade ja garantida: Claude Code, Cursor, Codex, Claude Desktop, e
qualquer cliente MCP padrao.

Para a Lex juridica, as tools expostas sao reescritas (vide secao 3 abaixo).

## 2. A Sacada Central — MCP da Lex Expoe Expertise, Nao Dados

O modelo nao e *"API de listagem de pecas"*. E *"a Lex em forma de funcao
callable"*.

### Por que essa diferenca importa

- **Dado** e replicavel (qualquer um pode raspar PJe, copiar jurisprudencia
  publica, listar artigos de lei). Quem vende dado compete com Google.
- **Know-how** e defensavel (como o PJe MG se comporta diferente do PJe
  TJPA em horario invalido, quais 3 preliminares quase sempre cabem em
  contestacao trabalhista, quando o STF mudou tese e a citacao velha
  parou de funcionar). Quem vende know-how compete com expertise — escasso.

### Skills viram MCP tools — a ponte natural

| Conceito interno (skills do Hermes) | Exposicao externa (MCP da Lex) |
| --- | --- |
| Skill e instrucao procedimental ("como fazer X") | MCP tool e capacidade procedimental ("execute X") |
| Skill tem `description` em frontmatter | MCP tool tem `description` em schema |
| Skill e carregada via `skill_view(name)` | MCP tool e invocada via `mcp_call_tool('lex', name)` |
| Skill encapsula know-how em SKILL.md + scripts | MCP tool encapsula know-how em handler |

**Arquitetura natural:** cada skill aprovada vira automaticamente uma MCP
tool exposta no servidor da Lex. Frontmatter ganha controle de exposicao:

```yaml
metadata:
  lex:
    expose_via_mcp: true
    mcp_visibility: public | tenant_only | private
    mcp_tier: free | premium
```

### Ciclo virtuoso

1. Advogado usa Lex Desktop, redige peca, descobre procedimento → salva
   skill (auto-criacao).
2. Skill aprovada entra no repertorio da Lex.
3. **Mesma skill** ja fica disponivel como MCP tool.
4. Colega do advogado, usando Claude Desktop, pluga MCP da Lex e ganha
   aquele procedimento.

## 3. Tools-Alvo do Servidor MCP da Lex

Cada bullet abaixo e uma MCP tool a ser exposta. Agrupadas por categoria
e pre-classificadas por tier (vide secao 5 para o modelo de licenciamento).

### 3.1. Workflow / Automacao de Sistemas Externos

| Tool | O que faz | Tier |
| --- | --- | --- |
| `lex_pje_peticionar(tribunal, num_processo, peca_path)` | Peticiona no PJe com quirks regionais, captcha, ordem correta | Premium |
| `lex_pje_extrair_andamentos(tribunal, num_processo)` | Extrai andamentos lidando com paginacao e formato por tribunal | Premium |
| `lex_esaj_consultar(tribunal, num_processo)` | Idem para tribunais que ainda usam e-SAJ | Premium |
| `lex_dou_monitorar(termos)` | Monitora Diario Oficial com regras de matching juridico | Free (basico) / Premium (avancado) |
| `lex_projudi_consultar(tribunal, num_processo)` | Acesso a Projudi de tribunais que usam o sistema | Premium |

### 3.2. Conhecimento Juridico Curado

| Tool | O que faz | Tier |
| --- | --- | --- |
| `lex_jurisprudencia_buscar(tema, tribunal=STF|STJ|TST|...)` | Busca, valida e retorna so citacoes ainda dominantes | Free (rate-limited) |
| `lex_artigo_validar(referencia)` | Confere existencia, vigencia e alteracoes do artigo | Free |
| `lex_sumula_consultar(numero, tribunal)` | Consulta sumulas com status (vigente/cancelada/superada) | Free |
| `lex_prazo_calcular(tipo, data_intimacao, tribunal)` | Calcula prazo com dias uteis, feriado forense local, suspensoes | Free |

### 3.3. Procedimentos de Redacao

| Tool | O que faz | Tier |
| --- | --- | --- |
| `lex_redigir_contestacao_trabalhista(dados_caso)` | Executa skill, retorna draft | Premium |
| `lex_redigir_agravo_instrumento(dados_caso)` | Idem | Premium |
| `lex_redigir_<tipo_peca>(...)` | Familia completa de pecas | Premium |
| `lex_calcular_horas_extras(jornada_alegada, jornada_provada, periodo)` | Calculo correto com DSR, adicional noturno, intervalo | Premium |
| `lex_calcular_<tipo>(...)` | Familia de calculos juridicos | Premium |
| `lex_formatar_peca(texto, padrao=ABNT|CNJ-65|escritorio_x)` | Aplica padrao de formatacao | Premium (padrao tenant) |

### 3.4. Defesa Contra Manipulacao

| Tool | O que faz | Tier |
| --- | --- | --- |
| `lex_petition_guard(texto_peca_recebida)` | Detecta zero-width chars, prompt injection, manipulacao | Free |
| `lex_citation_validate(texto)` | Valida todas as citacoes encontradas no texto | Free (rate-limited) |

### 3.5. Skills do Tenant (escopo privado)

| Tool | O que faz | Tier |
| --- | --- | --- |
| `lex_invoke_skill(skill_name, args)` | Invoca qualquer skill do tenant autenticado | Premium + escopo tenant |
| `lex_list_skills()` | Lista skills disponiveis para o tenant | Premium + escopo tenant |

## 4. Cenarios de Go-To-Market

### Cenario 1 — Advogado ja usa Claude Desktop

- Nao precisa abandonar a ferramenta.
- Cola config MCP da Lex.
- *"Claude, peticione essa contestacao no PJe TJPA."* → Claude usa
  `lex_pje_peticionar`.
- *"Claude, gera contestacao trabalhista pra esse caso."* → Claude usa
  `lex_redigir_contestacao_trabalhista`.
- A Lex vira **layer de capacidade juridica** dentro da ferramenta que o
  advogado ja gosta.

### Cenario 2 — Escritorio com stack proprio

- Sistema interno chama MCP da Lex como servico.
- Lex vira **backend de inteligencia juridica** do produto deles.
- Cliente paga licenca institucional, nao precisa migrar produto.

### Cenario 3 — Orgao publico (TJPA, outros tribunais)

- Sistemas internos do tribunal chamam MCP da Lex via HTTP MCP server
  dedicado, com OAuth institucional.
- Lex vira **fornecedor de capacidade**, nao app obrigatorio em cada
  maquina.
- Auditoria, SLA, residencia de dados negociaveis.

### Cenario 4 — Aquisicao via Claude Desktop

- Usuario comum descobre Lex via tool free no Claude Desktop.
- Ve valor, contrata licenca Pro.
- Eventualmente migra para Lex Desktop quando quer experiencia completa.
- **MCP free e canal de aquisicao, nao produto autonomo.**

A perna MCP nao compete com a Lex Desktop. Alimenta ela.

## 5. Modelo de Licenciamento — Recomendacao Hibrida

Tres modelos foram considerados antes da decisao:

### Modelo 1 — 100% Pago (so licenciado)

**Vantagens:** receita direta, sem freeloader, auditavel.

**Desvantagens:** mata o canal de aquisicao, contradiz narrativa de motor
aberto, comunica produto fechado num ecossistema (MCP) que e padrao aberto.
Concorrente generalista (ChatGPT, Gemini) tem features grátis.

### Modelo 2 — 100% Grátis

**Vantagens:** maximum reach, brand de "infraestrutura juridica br".

**Desvantagens:** mata a Lex Desktop, concorrente pode construir produto em
cima sem pagar, custos sem receita, scraping facil, sem incentivo a
licenca institucional.

### Modelo 3 — Hibrido por Tipo de Tool (recomendado)

A divisao e por **natureza da tool**, nao por usuario.

**Free** — tools defensivas e read-only, com rate limit:

- `lex_artigo_validar`, `lex_sumula_consultar`, `lex_prazo_calcular`
- `lex_jurisprudencia_buscar` (rate limit baixo)
- `lex_petition_guard`, `lex_citation_validate`
- `lex_dou_monitorar` basico

**Premium (licenca Lex)** — workflow profundo, repertorio, customizacao:

- Familia `lex_redigir_*` (acessa repertorio de skills)
- Familia `lex_pje_*` e `lex_esaj_*` e `lex_projudi_*` (automacao de sistemas)
- Familia `lex_calcular_*` (procedimentos juridicos especificos)
- `lex_formatar_peca` com padrao do tenant
- Skills personalizadas do escritorio (escopo tenant)
- HTTP transport remoto (vs stdio local)
- Rate limit alto, suporte, audit log

### Por que o hibrido funciona

1. **Free tier e canal de aquisicao real.** Advogado curioso descobre a
   Lex porque o Claude Desktop dele acabou de validar uma citacao
   corretamente, ve "powered by Lex". Curioso, descobre tools premium.
2. **Lex Desktop nao e canibalizada.** As tools pagas via MCP sao caras
   na nota (por chamada ou por seat). A Lex Desktop entrega o pacote
   inteiro num preco de produto. Advogado intenso prefere a app; agente
   curioso pluga MCP free; institucional grande compra licenca completa.
3. **Defesa do ecossistema.** Tools defensivas gratis viram **brand**.
   *"A Lex protege o ecossistema juridico brasileiro de IA, nao vende
   defesa."* TJPA e OAB respeitam essa posicao.
4. **Cobrar onde doi pouco.** Workflow profundo e onde o valor esta
   concentrado. Cobrar la e justo e cliente pagante nao sente como roubo.
5. **Telemetria de tudo.** Free e sign-up obrigatorio (e-mail + ToS).
   Voce sabe quem usa o que — qualifica leads pro premium.
6. **Anti-concorrente.** Concorrente que quiser construir produto sobre
   MCP free bate no teto rapido — execucao esta atras de licenca, ToS
   proibe uso comercial pra terceiros.

### Estrutura de tier sugerida

| Tier | Quem | O que recebe | Preco |
| --- | --- | --- | --- |
| **Free** | Qualquer pessoa, sign-up por e-mail | Tools defensivas + read-only com rate limit baixo | R$ 0 |
| **Pro / Advogado** | Pessoa fisica registrada na OAB | Free + tools de redacao basica + rate limit medio + Lex Desktop | Mensalidade individual |
| **Escritorio** | CNPJ juridico | Pro + tools de workflow PJe + skills do escritorio + multi-usuario | Por seat ou por escritorio |
| **Institucional** | Orgao publico, grande corporacao | Tudo + HTTP MCP server dedicado + audit log + SLA + skills isoladas | Negociado |

A licenca da Lex Desktop vem junto da Pro/Escritorio/Institucional — o
cliente que paga ganha tanto a app quanto acesso premium ao MCP.

## 6. Governanca Necessaria — Cliente

Para a perna "qualquer MCP pluga em nos" ser segura para o usuario juridico:

| Item | Status | Acao |
| --- | --- | --- |
| Allowlist de MCPs aprovados por tenant | **Falta** | Construir UI no Lex Desktop e enforcement no engine |
| Confirmacao humana antes de invocar tool de MCP novo | **Falta** | Camada nova no agent loop |
| Audit log de toda chamada MCP saindo | **Parcial** | Formatar log auditavel para TJPA/empresa |
| UI de gestao de MCPs no Lex Desktop | **Falta** | Sem editar `config.yaml` na mao |
| Catalogo curado de MCPs juridicos recomendados | **Falta** | "MCPs aprovados pela Lex pro mercado br" |
| Sampling reverso desligado por padrao | **Verificar** | MCP malicioso poderia pedir LLM da Lex em nome do tenant |

## 7. Governanca Necessaria — Servidor

Para a perna "Lex e MCP em qualquer lugar" ser vendavel institucionalmente:

| Item | Status | Acao |
| --- | --- | --- |
| Substituir tools de mensageria por tools juridicas | **Falta — central** | Reescrever `mcp_serve.py` |
| Auto-registro de skills como tools MCP | **Falta — feature chave** | Codigo que itera skills e expõe |
| Schemas auto-gerados de frontmatter | **Falta** | Frontmatter precisa enriquecer para virar schema MCP util |
| Auth no servidor (quem chama?) | **Falta** | Stdio local sem auth hoje. Premium exige API key + OAuth institucional. |
| Tier de acesso (free/premium) | **Falta** | Camada nova |
| Escopo por tenant | **Falta** | Vide SKILLS-AUTOCREATE camada 4 |
| Audit log de chamadas entrando | **Falta** | Critico para premium |
| Rate limit por chamador | **Falta** | Critico para free |
| Modo HTTP/Streamable (nao so stdio) | **Verificar** — provavelmente so stdio | Necessario para premium remoto |
| Doc publica do MCP da Lex | **Falta** | Site `mcp.lex.[dominio]` com tools, schemas, exemplos |
| Filtro `expose_via_mcp` no frontmatter | **Falta** | Nem toda skill vira MCP publica |

## 8. Riscos

### Risco 1 — Comunidade de skills no MCP free pode degradar a marca

Se skill agent-created por advogado individual vazar pro MCP free, queima
reputacao. Skills agent-created **nunca** entram no MCP publico sem
curadoria explicita (vide SKILLS-AUTOCREATE camada 2).

### Risco 2 — MCP da Anthropic ainda e jovem

Spec pode mudar, Claude Desktop pode reduzir suporte, etc. **Nao construir
o unico canal de produto em cima de MCP.** Lex Desktop continua produto
principal; MCP e camada complementar.

### Risco 3 — Free tier suficiente, ninguem paga

Mitigacao: free tier e estritamente read-only/defensivo. Workflow real
(redigir, peticionar, calcular) sempre exige licenca. Ninguem petitiona
processo serio so com tools free.

### Risco 4 — Concorrente usa free tier para construir produto

Mitigacao: ToS explicito proibindo uso comercial pra terceiros. Rate
limit agressivo no free. Tools de execucao todas premium. Audit log
detecta uso fora do padrao individual.

### Risco 5 — Cliente institucional confia na free e nao licencia

Mitigacao: orgao publico precisa de SLA, audit log, residencia de dados,
suporte — coisas que so vem na licenca institucional. Free nao da nada
disso, deliberadamente.

## 9. Comunicacao Recomendada

> **A Lex e um motor de expertise juridica brasileira. Voce consome essa
> expertise de duas formas:**
>
> **1. Aplicativo Lex (Lex Desktop)** — escreva pecas, gerencie casos,
> atenda cliente com a Lex como copilot integral.
>
> **2. Lex como MCP** — pegue a inteligencia juridica da Lex e cole
> dentro da ferramenta de IA que voce ja usa (Claude Desktop, Cursor,
> Codex, ou seu sistema proprio). A Lex vira uma camada de capacidade
> juridica plugavel em qualquer lugar.
>
> **E o caminho contrario tambem:** a Lex pluga em qualquer sistema
> externo que fale MCP — PJe, sistema do escritorio, base de
> jurisprudencia. O motor e bidirecional.

Vantagens dessa formulacao:

1. Nao promete inventario de MCPs juridicos brasileiros que nao existe ainda.
2. Posiciona a Lex como infraestrutura, nao app — justifica preco/escala
   maior.
3. MCP vira diferencial tecnico que concorrente generalista nao tem do
   mesmo jeito.

## 10. Roadmap de Construcao

| Fase | Entrega | Bloqueia comunicacao? |
| --- | --- | --- |
| 1 | Substituir tools de mensageria por primeiras 5 tools juridicas free (`lex_artigo_validar`, `lex_jurisprudencia_buscar`, `lex_prazo_calcular`, `lex_petition_guard`, `lex_citation_validate`) | **Sim — sem isso nao da pra anunciar nada** |
| 2 | Doc publica `mcp.lex.[dominio]` com config copy-paste para Claude Desktop / Cursor / Codex | **Sim** |
| 3 | Sign-up + telemetria + ToS para free tier | **Sim** |
| 4 | Servidor MCP backend `lex-jurisprudencia-mcp` (necessario para tools de jurisprudencia funcionarem de verdade) | **Sim para jurisprudencia free** |
| 5 | Auto-registro de skills aprovadas como MCP tools | **Nao para v1, sim para escala** |
| 6 | Auth + tier free/premium + rate limit | **Sim para premium funcionar** |
| 7 | HTTP/Streamable transport (alem de stdio) | **Sim para institucional** |
| 8 | Familia `lex_redigir_*` premium | **Sim para premium ter substancia** |
| 9 | Familia `lex_pje_*` premium | **Diferencial chave para escritorio** |
| 10 | Allowlist e governanca da perna cliente | **Sim para vender para TJPA** |

## 11. Decisoes em Aberto

- **Escolher dominio do site do MCP** (`mcp.lexagent.com.br`?
  `lex.lexagent.com.br/mcp`?).
- **Definir base inicial de jurisprudencia** — construir scraper proprio
  ou contratar provedor (LexML, JusBrasil, outro).
- **Modelo de cobranca premium**: por chamada vs por seat vs flat
  mensal vs hibrido.
- **Posicionamento de marca da Free Tier**: "Lex Open Tools" vs "Lex Free"
  vs "Lex Public" — escolher um nome que comunique generosidade sem
  parecer "versao limitada".
- **ToS preciso para uso comercial por terceiros** — redacao juridica
  necessaria.
- **Estrategia para MCPs juridicos brasileiros que nao existem ainda**
  (PJe-MCP, LexML-MCP) — construir nos primeiros para viabilizar a perna
  cliente, ou esperar mercado.
