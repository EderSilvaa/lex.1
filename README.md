# LEX — Assistente Jurídico Agêntico para PJe

> Aplicativo Desktop (Electron + TypeScript) com IA agnóstica e BYOK (Bring Your Own Key). Agente autônomo com loop Think → Critic → Act → Observe, automação de browser via Stagehand v3, controle de PC via Vision AI + nut-js, geração e análise de documentos jurídicos com LLM, acesso ao sistema de arquivos, e memória persistente com aprendizado contínuo. Suporta Anthropic, OpenAI, OpenRouter, Google AI e Groq.

![Status](https://img.shields.io/badge/status-ativo-brightgreen)
![Versão](https://img.shields.io/badge/versão-6.0-blue)
![Electron](https://img.shields.io/badge/platform-windows-blueviolet)
![IA](https://img.shields.io/badge/IA-multi--provider%20BYOK-orange)

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

### Agente Autônomo
- Loop de raciocínio em 4 etapas: **Think → Critic → Act → Observe**
- **Loop guard**: detecta repetição de skill+parâmetros e pausa para o usuário
- **Prompt compacto a partir da 2ª iteração**: lista de skills reduzida para economizar tokens
- Roteamento automático: decide se usa o agente ou resposta direta
- **Streaming em tempo real**: tokens aparecem progressivamente na UI
- Sessões persistentes em disco — histórico não se perde ao fechar o app
- **Proatividade**: ao responder, sempre sugere próximos passos relevantes
- **Alerta de prazo**: detecta processos sem movimentação há mais de 30 dias e notifica

### Memória Persistente e Aprendizado
- **Contexto do usuário**: perfil (nome, OAB, escritório) injetado no prompt do agente
- **Processos recentes**: registra automaticamente processos consultados via PJe
- **Aprendizados**: acumula padrões e observações de tarefas concluídas
- **Busca por similaridade (TF-IDF)**: recupera interações passadas semelhantes ao objetivo atual
- **Data e hora**: contexto temporal sempre presente no prompt

### Automação PJe (Browser)
- Controla Chrome externamente via Stagehand v3 com qualquer provider vision
- Executa ações em linguagem natural ("consultar processo 0001234-56.2024")
- Overlay visual no navegador mostrando a ação em tempo real
- Suporte ao TRT8 e demais tribunais PJe

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
- `os_listar` — lista diretórios com aliases amigáveis
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
├── ai-handler.ts            # Roteador multi-provider (texto + Vision + streaming)
├── crypto-store.ts          # AES-256-GCM para criptografar API keys em repouso
├── stagehand-manager.ts     # Chrome externo + Stagehand v3 (browser automation)
├── computer-manager.ts      # Vision loop: screenshot → LLM → nut-js (PC control)
├── telegram-bot.ts          # Bot Telegram: relay de mensagens + /cancelar
├── user-input.ts            # Entrada do usuário via terminal (dev)
│
├── agent/
│   ├── loop.ts              # Loop agêntico Think → Critic → Act → Observe
│   │                        #   + loop guard + memória + aprendizado
│   ├── think.ts             # System prompt completo + context builder
│   │                        #   (data/hora, perfil, browser URL, similares)
│   ├── critic.ts            # Revisão de segurança: heurísticas + LLM (alto risco)
│   ├── session.ts           # SessionManager: histórico multi-turn persistido
│   ├── memory.ts            # Memória persistente: processos, aprendizados, TF-IDF
│   ├── executor.ts          # Registra e executa skills (modo compacto ≥ iter 2)
│   ├── types.ts             # Interfaces: Skill, AgentContext, AgentConfig, etc.
│   └── index.ts             # Inicialização: registra todas as skills
│
├── skills/
│   ├── pje/                 # pje_abrir, pje_agir, pje_consultar,
│   │                        # pje_movimentacoes, pje_documentos,
│   │                        # pje_pedir_codigo, pje_token_check
│   ├── pc/                  # pc_agir — controla Windows via Vision AI
│   ├── os/                  # os_listar, os_arquivos, os_escrever,
│   │                        # os_sistema, os_clipboard, os_fetch
│   └── documentos/          # doc_analisar, doc_gerar (LLM)
│
└── pje/
    ├── tribunal-urls.ts     # URLs dos tribunais suportados
    └── route-memory.ts      # Memória de rotas visitadas

src/renderer/
├── index.html               # Shell da UI (inclui seção Provedor de IA)
├── styles/
│   ├── main.css             # Estilos globais
│   ├── chat.css             # Mensagens, markdown, streaming cursor
│   └── thinking.css         # Animações do processo de raciocínio
└── js/
    ├── app.js               # Lógica do renderer: chat, conversas, provider settings
    ├── marked.min.js        # Renderização de Markdown
    └── purify.min.js        # Sanitização HTML (DOMPurify)
```

---

## Fluxo do Agente (v6)

```
Usuário envia mensagem
  → loop.ts: carrega memória + perfil + interações similares (TF-IDF)
  → think.ts: monta system prompt completo
      [Personalidade | Comportamento | Skills | Contexto | Formato]
      Contexto inclui: data/hora, nome/OAB, URL do Chrome, tarefas similares
  → Extrai JSON: { tipo, conteudo/skill, parametros, raciocinio }

  Se tipo=resposta → responde diretamente (+ sugere próximos passos)
  Se tipo=skill    → Critic avalia:
      skill read-only → heurísticas apenas (rápido)
      skill write/risk → LLM review (seguro)
    → Executa skill → Observe
    → Registra processo/aprendizado na memória
    → Próxima iteração com skills compactas
```

---

## Fluxo BYOK — Troca de Provider em Runtime

```
Settings UI
  → user seleciona OpenRouter + cola chave
  → lexApi.setApiKey('openrouter', key)      → store encriptado
  → lexApi.setProvider({ providerId, ... })  → setActiveConfig()
                                             → reInitStagehand() [background]

Agent loop (think.ts)
  → callAI() → getActiveConfig() → switch(providerId)
     anthropic  → callAnthropic()   (SSE nativo)
     openai     → callOpenAICompat() (openai.com)
     openrouter → callOpenAICompat() (openrouter.ai/api/v1)
     google     → callGoogle()      (Gemini REST)
     groq       → callOpenAICompat() (api.groq.com)

Browser automation (stagehand-manager)
  → getStagehandModelConfig()
     → modelName: 'openrouter/qwen2.5-vl-32b-instruct:free'
     → apiKey: <chave do usuário>
  → Stagehand inicia Chrome com modelo vision do provider ativo
```

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron |
| Linguagem | TypeScript |
| IA (multi-provider) | Anthropic / OpenAI / OpenRouter / Google AI / Groq |
| Automação Browser | Stagehand v3 + Chrome externo |
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
- [ ] RAG com jurisprudência indexada
- [ ] Notificações de movimentação processual
- [ ] Modelos locais (Ollama) via OpenAI-compatible
- [x] Geração de documentos jurídicos (petição, contestação, recurso...)
- [x] Análise de documentos (PDF/DOCX/TXT)
- [x] Memória persistente com aprendizado contínuo
- [x] Bot Telegram

---

## Autor

**Eder Silva** — [github.com/EderSilvaa](https://github.com/EderSilvaa)

---

*Última atualização: março de 2026 — v6.0 (Documentos jurídicos LLM, memória com TF-IDF, loop guard, prompt adaptativo)*
