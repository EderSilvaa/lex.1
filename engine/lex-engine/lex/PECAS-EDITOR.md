# Lex como Copiloto de Pecas Juridicas

> **Atualizacao em 2026-05-09:** a redacao juridica usa Lex Engine/Hermes como
> motor de raciocinio e skills. Edicoes pequenas podem ficar inline no
> chat/Console/editor; producao massiva ou com etapas retomaveis deve virar
> workflow na Agora. O antigo Lotes/batch nao e a arquitetura nova.

Este documento descreve a visao de produto e o caminho tecnico para a Lex
atuar como copiloto de redacao de pecas juridicas (contestacao, agravo,
embargos, replica, recurso, etc.).

A escrita de pecas e provavelmente o **caso de uso central** do produto Lex
para advogados e escritorios. Este e o ponto onde a heranca tecnica do Hermes
mais se converte em valor percebido pelo usuario final.

Documento complementar a:
- [lex/SKILLS-AUTOCREATE.md](SKILLS-AUTOCREATE.md) — auto-criacao e
  governanca de skills, base do reuso de templates.
- [lex/SKILLS-CATALOG-TJPA.md](SKILLS-CATALOG-TJPA.md) — `lex-petition-guard`
  para defesa contra peticoes adversarias manipuladas.
- [lex/HERMES-INHERITANCE.md](HERMES-INHERITANCE.md) — inventario das
  ferramentas herdadas que sustentam essa feature.
- [lex/BRIDGE-CONTRACT.md](BRIDGE-CONTRACT.md) — comunicacao entre Lex
  Desktop (Electron) e motor (WSL2).

## 1. Cenario Atual — O Que o Advogado Faz Hoje

Sem a Lex, redigir uma peca tipicamente envolve:

1. Abrir Word ou Google Docs.
2. Colar template antigo de outro caso similar (do drive do escritorio ou da
   internet).
3. Adaptar nome de partes, fatos, pedidos.
4. Pesquisar jurisprudencia em JusBrasil, LexML, sites de tribunais — copiar
   ementa, copiar numero do recurso.
5. Formatar manualmente (ABNT, padrao do CNJ Resolucao 65/2020, ou padrao
   interno do escritorio).
6. Pedir revisao a outro advogado (ou nao).
7. Exportar PDF, peticionar no PJe.

Pontos de dor:

- Copy/paste constante.
- Inconsistencia de citacao (jurisprudencia sem cabecalho correto, numero
  errado, tese ja superada).
- Formatacao manual repetitiva.
- **Nao ha reuso estruturado** — o advogado pode ter feito 40 contestacoes
  trabalhistas, mas cada uma comeca do zero porque o "template" e so um
  arquivo Word num drive desorganizado.

## 2. Tres Modelos Possiveis Para a Lex

### Modelo A — Editor Proprio na Lex Desktop (recomendado)

A Lex Desktop ganha um **modo "Peca"** ao lado do modo chat. O advogado
abre o app, clica "Nova peca → Contestacao trabalhista", e cai num editor
de texto rico (nao em chat).

**Como funciona:**

- Editor de texto formatado (TipTap, ProseMirror, ou Lexical — libs comuns
  em Electron).
- A Lex aparece como **painel lateral** ou via **inline ghost text** (texto
  cinza que ela sugere, advogado aceita com Tab).
- Enquanto o advogado digita, a Lex:
  - Completa paragrafos.
  - Sugere blocos inteiros (preliminares aplicaveis, topicos do merito).
  - Cita jurisprudencia quando o argumento pede.
  - Formata automaticamente.
  - Valida citacoes antes de inserir.

**Por que esse e o melhor caminho:**

- Controle total do produto.
- Nao depende de plugin de fornecedor terceiro (Microsoft, Google).
- Nao depende de cliente ter Word/Docs licenciado.
- Fluxo inteiro auditavel dentro do produto.
- Integra naturalmente com bridge HTTP existente entre Electron e motor.

### Modelo B — Plugin nos Editores Existentes

Office Add-in para Word, Apps Script para Google Docs, macro para
LibreOffice.

**Vantagem:** advogado nao muda habito.

**Desvantagem:** tres frentes de manutencao (cada plataforma com SDK
proprio), cada plugin mais limitado que app dedicado. Word add-in, por
exemplo, nao tem acesso pratico a cron, MCP cliente, ou ao historico
completo da Lex.

**Recomendacao:** futuro complemento do Modelo A, nao substituto. Apos o
Modelo A maduro, abrir frente Word como canal alternativo.

### Modelo C — Plugin via ACP em Editor de Codigo

Zed, VSCode (via plugin) ou outros editores que falem ACP, conectados via
`acp_adapter/` (vide [HERMES-INHERITANCE.md](HERMES-INHERITANCE.md) secao 7).

**Quando faz sentido:** escritorios "TI juridica" que escrevem pecas em
LaTeX ou Typst, com versionamento em git. Nicho — talvez 1% do mercado.

**Status:** o adapter ja existe no repo. Nao construir nada agora. Se um
cliente especifico pedir, e custo baixo de habilitar.

## 3. Componentes Tecnicos do Modelo A

Cada componente abaixo tem mapeada sua dependencia no que ja temos no
Hermes versus o que precisa ser construido.

### 3.1. Sugestoes Inline (Ghost Text)

| Item | Status | Acao |
| --- | --- | --- |
| LLM rapido para completion | **Pronto** — Claude Haiku, Gemini Flash via adapters do Hermes | Configurar perfil "fast" para inline |
| Frontend ghost text | **Falta** | TipTap + extensao de IA, ou implementacao custom |
| Stream incremental de tokens | **Pronto** — adapters Hermes ja streamam | Bridge HTTP precisa expor stream em SSE |
| Debouncing / cancelamento de request | **Falta** | Padrao em editores de IA — implementar no frontend |

### 3.2. Sugestoes de Bloco

(Preliminares aplicaveis, topicos de merito, pedidos coerentes.)

| Item | Status | Acao |
| --- | --- | --- |
| Skills por tipo de peca | **Parcial** — `skills/legal/lex-legal-brief` existe mas e generica | Expandir em familia: `peca-contestacao-trabalhista`, `peca-agravo-instrumento`, `peca-embargos-declaracao`, etc. |
| Auto-criacao de skill personalizada | **Pronto, falta governanca** | Vide [SKILLS-AUTOCREATE.md](SKILLS-AUTOCREATE.md) |
| Memoria do estilo do escritorio | **Pronto** — `memory` e `session_search` ja fazem | Configurar prompt para usar |
| Detector de inconsistencia (preliminares vs pedidos) | **Falta** | Funcao nova de validacao final |

### 3.3. Busca de Jurisprudencia

| Item | Status | Acao |
| --- | --- | --- |
| Acesso a base de jurisprudencia | **Falta** | Construir ou contratar |
| Cliente MCP | **Pronto** — `mcp_call_tool` aceita qualquer servidor MCP | Apenas plugar |
| Servidor MCP juridico (LexML/STJ/TST/JusBrasil) | **Falta** | Construir `lex-jurisprudencia-mcp` ou contratar provedor |
| Cache local de citacoes | **Falta** | Implementar para velocidade e funcionamento offline parcial |

**Recomendacao:** escrever um servidor MCP proprio (`lex-jurisprudencia-mcp`)
que abstrai LexML, STJ, TST e JusBrasil atras de um unico protocolo. A Lex
chama via `mcp_call_tool` e nao precisa saber o backend. Isso desacopla a
camada de IA da camada de acesso a dados juridicos.

### 3.4. Validador de Citacao (Anti-Alucinacao) — CRITICO

| Item | Status | Acao |
| --- | --- | --- |
| Conferir que recurso citado existe | **Falta** | Funcao no `lex-jurisprudencia-mcp` |
| Conferir que artigo de lei existe | **Falta** | Base local de CLT, CPC, CF, CCB |
| Conferir que tese ainda e dominante | **Falta** | Cruzar data da decisao com decisoes posteriores |
| Detectar prompt injection na peca recebida | **Conceito definido** | Construir `lex-petition-guard` (vide SKILLS-CATALOG-TJPA) |

**Por que critico:** IA juridica que inventa jurisprudencia destroi
reputacao na primeira ocorrencia. Houve casos publicos americanos de
advogados sancionados por usar ChatGPT em pecas com citacoes inventadas
(Mata v. Avianca, S.D.N.Y., 2023). A Lex nao pode falhar nisso.

**Regra absoluta:** nenhuma citacao entra na peca sem ter sido validada
por chamada real a base oficial. Se o LLM "lembra" da existencia de um
TST-RR mas a base nao confirma, a citacao **nao e inserida**, e a Lex
informa o advogado.

### 3.5. Formatacao

| Item | Status | Acao |
| --- | --- | --- |
| Padrao ABNT / CNJ Resolucao 65 | **Falta** | Definir e codificar |
| Padrao interno do escritorio | **Falta** | Configuracao por tenant |
| Numeracao automatica de topicos | **Pronto** — TipTap faz | Apenas configurar |
| Citacao com espacamento e identacao corretos | **Falta** | Padrao por tipo |
| Exportar PDF | **Falta** | puppeteer ou similar |
| Exportar DOCX | **Falta** | docxtemplater ou similar |

### 3.6. Versionamento e Revisao

| Item | Status | Acao |
| --- | --- | --- |
| Historico de versoes da peca | **Falta** | Feature nova de produto |
| Diff entre versoes | **Falta** | Lib trivial |
| Comentario/revisao por colega | **Falta** | Feature nova |
| Aprovacao antes de peticionar | **Conceito definido** | Vide SKILLS-AUTOCREATE camada 2 |
| Audit log de quem editou | **Falta** | Feature nova |

## 4. Caso de Uso Concreto Fim-a-Fim

Advogado trabalhista, Lex Desktop, Modelo A:

1. Clica **"Nova peca"**. Lex pergunta: *"Que tipo? Contestacao? Agravo?
   Replica?"*
2. Escolhe **"Contestacao trabalhista"**.
3. Lex puxa a skill `peca-contestacao-trabalhista-escritorio-x` (criada
   nas pecas anteriores via auto-criacao) e abre o editor com a estrutura
   pre-populada: cabecalho, qualificacao, preliminares, merito, pedidos.
4. Lex pergunta dados do caso: *"Autor e Reclamante. Quem e? Quais os
   pedidos da inicial?"*. Advogado anexa inicial em PDF.
5. Lex extrai o conteudo via OCR (`vision_analyze` + `ocr-and-documents`),
   roda o **`lex-petition-guard`** para detectar caracteres invisiveis ou
   prompt injection na inicial, e pre-popula:
   - Qualificacao das partes.
   - **Preliminares aplicaveis** com base no caso (so as que cabem — nao
     joga todas).
   - **Topicos do merito** baseados nos pedidos da inicial.
6. Para cada topico, advogado digita e a Lex sugere ghost text completando
   frase a frase.
7. Quando o advogado digita *"Quanto as horas extras..."*, a Lex:
   - Sugere bloco baseado no caso (jornada que o reclamante alega, jornada
     que o reclamado pode comprovar).
   - **Cita jurisprudencia validada** em tempo real via
     `mcp_call_tool('lex-jurisprudencia-mcp', ...)`.
   - **Aplica regras corretas de calculo** (DSR sobre adicional noturno,
     intervalo intrajornada do art. 71 §4 — preservadas na skill por
     iteracoes anteriores).
8. Advogado clica em **"Revisar"**. Lex roda checklist final:
   - Toda citacao foi validada? Sim.
   - Inicial recebida contem caracteres invisiveis? Aviso na linha 47.
   - Padrao de formatacao do escritorio aplicado? Sim.
   - Pedidos batem com preliminares e merito? Inconsistencia detectada
     entre topico 4 e pedido 7 — apontar.
9. Advogado revisa, ajusta, aprova. Lex exporta DOCX e PDF.
10. Lex pergunta: *"Quer salvar variacoes novas como skill? Detectei 2
    novidades: (a) voce usou argumento sobre intervalo do art. 71 §4 que
    nao estava na skill atual; (b) preferiu citar TST sobre adicional
    noturno em vez do STJ. Salvar?"*. Advogado aprova → skill evolui (com
    fluxo de aprovacao da SKILLS-AUTOCREATE camada 2).

## 5. Roadmap de Construcao

Fases em ordem sugerida. Cada fase entrega valor incremental.

| Fase | Entrega | Dependencias | Bloqueia v1 produto? |
| --- | --- | --- | --- |
| 1 | Editor rico no Electron + chat lateral integrado com Lex (MVP — peca em texto livre, sem inline) | Bridge HTTP existente | Sim |
| 2 | Inline suggestions com modelo rapido (Claude Haiku, Gemini Flash) | Streaming na bridge | Sim |
| 3 | Skills por tipo de peca (familia `peca-*`) + auto-criacao do advogado | SKILLS-AUTOCREATE fase 1+2 | Sim |
| 4 | Servidor MCP `lex-jurisprudencia-mcp` | Definir backend de jurisprudencia | Sim (sem isso, nao tem citacao) |
| 5 | Validador de citacao (anti-alucinacao) | Fase 4 | **Sim — bloqueador absoluto** |
| 6 | Padroes de formatacao configuraveis por tenant | — | Nao para v1, sim para empresa/TJPA |
| 7 | Exportacao DOCX/PDF | — | Sim para v1 |
| 8 | Historico de versoes + revisao por colega | — | Nao para v1, recomendado para v2 |

**MVP minimo vendavel:** fases 1, 2, 3, 4, 5, 7. Sem fase 5, nao se
peticiona. Sem fase 7, nao se entrega ao tribunal.

## 6. Modelo de IA Recomendado por Componente

| Componente | Modelo sugerido | Justificativa |
| --- | --- | --- |
| Inline ghost text | Claude Haiku 4.5 ou Gemini Flash | Latencia <500ms, custo baixo, qualidade suficiente para completion local |
| Sugestao de bloco | Claude Sonnet 4.6 ou Gemini 2.5 Pro | Qualidade alta, latencia 2-5s aceitavel para bloco |
| Decisoes complexas (preliminares aplicaveis, validacao de inconsistencia) | Claude Opus 4.7 ou similar | Tarefa de raciocinio juridico, vale o custo |
| Validacao de citacao | Sem LLM — chamada deterministica ao MCP | Nunca delegar a LLM uma checagem que e factual |
| OCR e extracao de inicial | Vision API (Claude vision, Gemini, ou OCR dedicado) | Pronto via `vision_analyze` |

A multi-LLM nativa do Hermes facilita: cada componente pode usar provider
diferente sem reescrita. Cliente que exige soberania de dados pode trocar
tudo para Bedrock (regiao Brasil) e a logica do produto continua igual.

## 7. Riscos e Mitigacoes

| Risco | Mitigacao |
| --- | --- |
| LLM inventar jurisprudencia | Fase 5 (validador) e regra absoluta — nenhuma citacao sem validacao real |
| Peticao adversaria com prompt injection manipulando a IA | `lex-petition-guard` no caminho de entrada (vide SKILLS-CATALOG-TJPA) |
| Skill compartilhada vazar entre clientes | Isolamento por tenant (vide SKILLS-AUTOCREATE camada 4) |
| Auto-criacao de skill com vies introduzido pelo advogado | Aprovacao bloqueante + scanner de conteudo (vide SKILLS-AUTOCREATE camadas 2 e 3) |
| Custo de inline suggestion alto em uso intenso | Modelo rapido + cache de contexto (Anthropic prompt caching ja herdado) + rate limit por tenant |
| LGPD em jurisprudencia que cita partes | Default: nao expor jurisprudencia que cite partes do caso atual; redacao automatica de nomes |
| Formatacao errada gerar peca rejeitada pelo PJe | Validador de formato antes de exportar; checagem com schema do PJe se possivel |

## 8. Diferenciador de Produto

Tres pontos onde a Lex pode se diferenciar de concorrentes diretos
(JusBrasil IA, ChatGPT generico, copilot juridico de outros fornecedores):

1. **Reuso real do estilo do escritorio.** A skill que aprende do advogado
   nao existe em ferramenta generica. Cada peca melhora a base do
   escritorio especificamente.
2. **Validacao deterministica de citacao.** Concorrentes alucinam
   jurisprudencia. A Lex se compromete a so citar o que existe na base
   oficial.
3. **Defesa contra peca adversaria manipulada.** O `lex-petition-guard`
   e diferencial unico no mercado juridico-IA brasileiro.

## 9. Aberto Para Decisao Futura

Pontos a definir quando retomar o tema:

- Stack do editor: TipTap vs ProseMirror vs Lexical vs Slate.
- Backend de jurisprudencia: contratar provedor ou construir scraping
  proprio (custo, manutencao, ToS).
- Estrutura de skills `peca-*`: granularidade (uma por tipo de peca? por
  area + tipo? por tribunal?).
- Padroes de formatacao: quais escritorios temos como referencia para
  validar ABNT/CNJ.
- Exportacao: PDF apenas via Puppeteer (estilo CSS) ou DOCX gerado por
  template? Ambos?
- Modo offline: ate onde precisa funcionar sem internet (interessa para
  TJPA que pode ter restricao de rede).
