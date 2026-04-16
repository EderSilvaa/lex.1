# LEX — Assistente Jurídico Agêntico para PJe

> Aplicativo Desktop (Electron + TypeScript) com IA agnóstica e BYOK (Bring Your Own Key). CLI como motor principal, Electron como shell visual. Agente autônomo com loop Think → Critic → Act → Observe, MCP (Model Context Protocol) para tools extensíveis, automação de browser via browser-use MCP + Playwright CDP, controle de PC via Vision AI + nut-js, geração e análise de documentos jurídicos com LLM, acesso ao sistema de arquivos, e memória persistente com aprendizado contínuo. Suporta Anthropic, OpenAI, OpenRouter, Google AI e Groq.

![Status](https://img.shields.io/badge/status-ativo-brightgreen)
![Versão](https://img.shields.io/badge/versão-7.0-blue)
![Electron](https://img.shields.io/badge/platform-windows-blueviolet)
![IA](https://img.shields.io/badge/IA-multi--provider%20BYOK-orange)
![MCP](https://img.shields.io/badge/MCP-compatible-green)

---

## Início Rápido

```bash
git clone https://github.com/EderSilvaa/lex.1.git
cd lex.1
npm install
npm run electron:dev
```

Abra **Configurações → Provedor de IA**, selecione seu provider, cole a chave e clique em **Testar**.

---

## BYOK — Traga Sua Própria Chave

O Lex não requer chave própria. O usuário conecta o provider de sua escolha:

| Provider | Modelos | Vision | Grátis |
|---|---|---|---|
| **Anthropic** | Claude Haiku/Sonnet/Opus | ✅ | ❌ pago |
| **OpenAI** | GPT-4o, GPT-4o Mini | ✅ | ❌ pago |
| **OpenRouter** | 200+ modelos | ✅ | ✅ 200 req/dia |
| **Google AI** | Gemini 2.0/2.5 | ✅ | ✅ limitado |
| **Groq** | Llama 4, Llama 3.3 | ✅ | ✅ limitado |

> **Opção gratuita recomendada:** OpenRouter com `qwen/qwen2.5-vl-32b-instruct:free` — modelo vision capaz de automação de browser sem custo.

---

## Funcionalidades

### CLI como Motor + Terminal Embutido
- **Terminal xterm.js** é a view padrão do app (chat widget oculto)
- CLI standalone roda dentro do PTY do Electron ou em terminal externo do SO
- Ink/React UI com welcome box, streaming, markdown, spinner
- Comandos interativos: `/model`, `/provider`, `/key`, `/schedule`
- Crash do renderer não mata o CLI (processo separado via node-pty)

### MCP — Model Context Protocol
- Suporte a **servers MCP externos** via `~/.lex/mcp.json`
- **Provider-agnóstico**: tools MCP convertidos para Vercel AI SDK, funcionam com qualquer provider
- **browser-use MCP**: automação de browser via MCP server Python, conecta no Chrome via CDP (porta 19222)
- **filesystem MCP**: acesso a arquivos via `@modelcontextprotocol/server-filesystem`
- Auto-routing PJe: detecta se browser-use MCP está disponível, senão usa skills Playwright legacy
- Setup automatizado: `scripts/setup-mcp-deps.js` instala dependências Python (uv, browser-use)

### Agente Autônomo
- Loop de raciocínio em 4 etapas: **Think → Critic → Act → Observe**
- **Loop guard**: detecta repetição de skill+parâmetros e pausa para o usuário
- **Prompt compacto a partir da 2ª iteração**: lista de skills reduzida para economizar tokens
- Roteamento automático: decide se usa o agente ou resposta direta
- **Streaming em tempo real**: tokens aparecem progressivamente na UI
- Sessões persistentes em disco — histórico não se perde ao fechar o app
- **Proatividade**: ao responder, sempre sugere próximos passos relevantes
- **Alerta de prazo**: detecta processos sem movimentação há mais de 30 dias e notifica
- **Retry inteligente**: exponential backoff com jitter, suporte a 429/529 (overloaded)

### Memória Persistente e Aprendizado
- **Contexto do usuário**: perfil (nome, OAB, escritório) injetado no prompt do agente
- **Processos recentes**: registra automaticamente processos consultados via PJe
- **Aprendizados**: acumula padrões e observações de tarefas concluídas
- **Busca por similaridade (TF-IDF)**: recupera interações passadas semelhantes ao objetivo atual
- **Data e hora**: contexto temporal sempre presente no prompt

### Automação PJe (Browser)
- **MCP browser-use** (preferencial): automação via server MCP Python no Chrome existente (porta 19222)
- **Playwright CDP** (fallback): skills legacy para quando MCP não está disponível
- Overlay visual no navegador mostrando a ação em tempo real
- Suporte ao TRT8 e demais tribunais PJe
- Auto-detecção: `hasMcpBrowser()` escolhe automaticamente entre MCP e Playwright

### Documentos Jurídicos (LLM)
- **`doc_analisar`** — lê PDF/DOCX/TXT, analisa com LLM e extrai:
  tipo, resumo, pontos principais, teses jurídicas, riscos, pedidos e prazos
- **`doc_gerar`** — gera petição, contestação, apelação, agravo, embargos, parecer ou recurso:
  - Usa dados do processo e perfil do advogado automaticamente
  - Salva em `~/Documents/Lex/` como HTML formatado (abre no Word nativamente)
  - Estrutura jurídica rígida: cabeçalho, qualificação, fatos, direito, pedidos, encerramento

### Controle de PC (Vision AI + nut-js)
- Tira screenshots e envia ao modelo vision para análise
- Loop autônomo: vê → decide → age → verifica (até concluir)
- Executa: cliques, duplo-clique, digitação, atalhos de teclado, scroll

### Acesso ao Sistema de Arquivos
- `os_listar` — lista diretórios com aliases amigáveis (Documents, Downloads, Desktop, Home)
- `os_arquivos` — ler, mover, copiar, deletar, buscar arquivos
- `os_escrever` — criar arquivos e pastas
- `os_sistema` — executar comandos shell com confirmação humana (HITL)
- `os_clipboard` — ler e escrever área de transferência
- `os_fetch` — buscar conteúdo de URLs externas

### Segurança
- **Chaves API criptografadas**: AES-256-GCM com chave derivada da máquina (hostname+username via scrypt)
- Múltiplas chaves armazenadas simultaneamente (uma por provider)
- Migração automática de chaves legadas na primeira execução
- Blocklist de comandos perigosos no `os_sistema`
- **Critic**: revisa ações de alto risco antes de executar; skills somente-leitura usam apenas heurísticas (sem LLM extra)

### Telegram Bot
- Receba e responda mensagens do agente via Telegram
- Suporte a Markdown nas respostas
- `/cancelar` — cancela tarefa em andamento imediatamente

---

## Arquitetura

```
electron/
├── main.ts                  # Main process: IPC handlers, store, inicialização
├── preload.ts               # Bridge segura renderer ↔ main (contextBridge)
├── provider-config.ts       # Registro BYOK: presets, ActiveProviderConfig
├── ai-handler.ts            # Roteador multi-provider (Vercel AI SDK) + MCP tools
├── mcp-manager.ts           # Carrega servers MCP de ~/.lex/mcp.json (stdio)
├── crypto-store.ts          # AES-256-GCM para criptografar API keys em repouso
├── browser-manager.ts       # Chrome externo + Playwright CDP (browser automation)
├── computer-manager.ts      # Vision loop: screenshot → LLM → nut-js (PC control)
├── telegram-bot.ts          # Bot Telegram: relay de mensagens + /cancelar
│
├── agent/
│   ├── loop.ts              # Loop agêntico Think → Critic → Act → Observe
│   ├── think.ts             # System prompt + context builder
│   ├── critic.ts            # Revisão de segurança: heurísticas + LLM (alto risco)
│   ├── retry.ts             # Exponential backoff (429, 529, network errors)
│   ├── session.ts           # SessionManager: histórico multi-turn persistido
│   ├── memory.ts            # Memória persistente: processos, aprendizados, TF-IDF
│   ├── executor.ts          # Registra e executa skills (modo compacto ≥ iter 2)
│   ├── types.ts             # Interfaces: Skill, AgentContext, AgentConfig, etc.
│   └── index.ts             # Inicialização: registra todas as skills
│
├── cli/                     # CLI standalone (Ink/React)
│   ├── index.ts             # Entry point: REPL ou one-shot
│   ├── repl.ts              # REPL interativo com Ink
│   ├── one-shot.ts          # Modo single-command
│   ├── commands.ts          # /model, /provider, /key, /schedule
│   ├── output.ts            # Markdown, spinner, bullet points
│   ├── ui-bridge.ts         # uiNavigate() — CLI controla abas do Electron
│   └── ui/                  # Componentes Ink/React (App, Header, EventItem, Spinner)
│
├── skills/
│   ├── pje/                 # browser-use (MCP), abrir, agir, consultar,
│   │                        # movimentacoes, documentos, navegar, preencher
│   ├── browser/             # get-state, extract, scroll, click, navigate,
│   │                        # type, screenshot, close-tab, switch-tab
│   ├── pc/                  # pc_agir — controla Windows via Vision AI
│   ├── os/                  # os_listar, os_arquivos, os_escrever,
│   │                        # os_sistema, os_clipboard, os_fetch
│   ├── documentos/          # doc_analisar, doc_gerar (LLM)
│   └── pesquisa/            # pesquisa_jurisprudencia
│
├── terminal/
│   └── pty-manager.ts       # node-pty: gerencia sessões PTY
│
└── pje/
    ├── tribunal-urls.ts     # URLs dos tribunais suportados
    └── route-memory.ts      # Memória de rotas visitadas

src/renderer/
├── index.html               # Shell da UI (terminal como view padrão)
├── styles/
│   ├── main.css             # Estilos globais
│   ├── terminal.css         # Estilos do terminal xterm.js
│   ├── chat.css             # Mensagens, markdown, streaming cursor
│   └── ...
└── js/
    ├── app.js               # Lógica do renderer: views, conversas, settings
    ├── terminal.js          # xterm.js: sessões, tabs, fit, copy/paste
    └── ...

scripts/
├── launch-electron.js       # Deleta ELECTRON_RUN_AS_NODE antes de spawnar
└── setup-mcp-deps.js        # Instala Python deps (uv, browser-use) via pip
```

---

## Fluxo do Agente (v7)

```
Usuário digita no terminal (CLI dentro do PTY)
  → CLI envia via WebSocket ao backend
  → loop.ts: carrega memória + perfil + interações similares (TF-IDF)
  → think.ts: monta system prompt completo
      [Personalidade | Comportamento | Skills | Contexto | Formato]
  → Extrai XML: { pensamento, tipo, resposta/skill, parametros }

  Se tipo=resposta → responde diretamente (streaming via terminal)
  Se tipo=skill    → Critic avalia → Executa → Observe → Próxima iteração

  Skills PJe: se MCP browser-use disponível → usa pje_browser_use
              senão → usa skills Playwright legacy
```

---

## MCP — Configuração

```json
// ~/.lex/mcp.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents", "~/Downloads"]
    },
    "browser": {
      "command": "browser-use",
      "args": ["--mcp", "--cdp-url", "http://localhost:19222"]
    }
  }
}
```

Tools MCP são convertidos para formato Vercel AI SDK e funcionam com qualquer provider.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron |
| CLI | Ink/React + node-pty (xterm.js no Electron) |
| Linguagem | TypeScript |
| IA (multi-provider) | Vercel AI SDK — Anthropic / OpenAI / OpenRouter / Google AI / Groq |
| MCP | @modelcontextprotocol/sdk (stdio client) |
| Automação Browser | browser-use MCP (preferencial) + Playwright CDP (fallback) |
| Controle PC | nut-js (@nut-tree-fork) + Vision AI |
| Segurança | AES-256-GCM (node:crypto) |
| Persistência | electron-store + JSON em disco |
| Markdown | marked + DOMPurify |
| Frontend | Vanilla JS + CSS |

---

## Scripts

```bash
npm run electron:dev    # Watch TS + lança Electron (desenvolvimento)
npm run electron:start  # Lança Electron sem recompilar
npm run electron:build  # Compila TypeScript para dist-electron/
```

---

## Configuração

Toda a configuração é feita pela própria UI do app em **Configurações → Provedor de IA**:

1. Selecione o provider (Anthropic, OpenAI, OpenRouter, Google AI, Groq)
2. Cole sua chave API (link direto para obter a chave é exibido)
3. Escolha o **modelo agente** (para raciocínio) e **modelo browser** (deve ter vision)
4. Preencha seu **perfil** (nome, OAB, escritório) — usado automaticamente nos documentos
5. Clique em **Testar** para validar a conexão
6. Salve — o app troca de provider instantaneamente, sem reiniciar

Não há `.env` necessário.

---

## Tribunais Suportados

| Tribunal | URL PJe |
|----------|---------|
| TRT8 (Belém) | `pje.trt8.jus.br` |

Novos tribunais podem ser adicionados em `electron/pje/tribunal-urls.ts`.

---

## Roadmap

- [ ] Suporte a mais tribunais (TRF, STJ, TJPA)
- [ ] PJe-model fine-tuned para navegação
- [ ] CLI → UI bridge (`uiNavigate`) para abrir arquivos/brain automaticamente
- [x] MCP — Model Context Protocol (provider-agnóstico)
- [x] CLI como motor, Electron como shell (terminal embutido)
- [x] browser-use MCP para automação PJe
- [x] Auto-routing PJe: MCP vs Playwright legacy
- [x] Retry 529 (Anthropic overloaded)
- [x] RAG com jurisprudência indexada
- [x] Scheduler autônomo (cron/once/interval/trigger)
- [x] 22 plugins (Gmail, Calendar, Drive, Outlook, Teams, etc.)
- [x] Geração de documentos jurídicos (petição, contestação, recurso...)
- [x] Análise de documentos (PDF/DOCX/TXT)
- [x] Memória persistente com aprendizado contínuo
- [x] Bot Telegram
- [x] Multi-agent com planner + orchestrator

---

## Autor

**Eder Silva** — [github.com/EderSilvaa](https://github.com/EderSilvaa)

---

*Última atualização: abril de 2026 — v7.0 (MCP provider-agnóstico, CLI como motor, terminal embutido, browser-use MCP, auto-routing PJe)*
