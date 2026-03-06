# LEX — Assistente Jurídico Agêntico para PJe

> Aplicativo Desktop (Electron + TypeScript) com IA Claude da Anthropic para automação jurídica completa. Agente autônomo com loop Think → Critic → Act → Observe, automação de browser via Stagehand v3, controle de PC via Vision AI + nut-js, e acesso ao sistema de arquivos.

![Status](https://img.shields.io/badge/status-ativo-brightgreen)
![Versão](https://img.shields.io/badge/versão-4.0-blue)
![Electron](https://img.shields.io/badge/platform-windows-blueviolet)
![IA](https://img.shields.io/badge/IA-Claude%20Sonnet%204.6-orange)

---

## Início Rápido

```bash
git clone https://github.com/EderSilvaa/lex.1.git
cd lex.1
npm install
npm run electron:dev
```

Configure a chave da API Anthropic na primeira tela do app e pronto.

---

## Funcionalidades

### Agente Autônomo
- Loop de raciocínio em 4 etapas: **Think → Critic → Act → Observe**
- Roteamento automático: decide se usa o agente ou resposta direta
- **Streaming em tempo real**: tokens aparecem progressivamente na UI enquanto Claude raciocina
- Sessões persistentes em disco — histórico não se perde ao fechar o app

### Automação PJe (Browser)
- Controla Chrome externamente via Stagehand v3
- Executa ações em linguagem natural ("consultar processo 0001234-56.2024")
- Overlay visual no navegador mostrando a ação em tempo real
- Suporte ao TRT8 (PJe 1º grau e painel do usuário externo)

### Controle de PC (Vision AI + nut-js)
- Tira screenshots e envia ao Claude Vision para análise
- Loop autônomo: vê → decide → age → verifica (até concluir)
- Executa: cliques, duplo-clique, digitação, atalhos de teclado, scroll
- Skills: `pc_agir` — qualquer tarefa no Windows em linguagem natural

### Acesso ao Sistema de Arquivos
- `os_listar` — lista diretórios com aliases amigáveis (downloads, desktop, documentos)
- `os_arquivos` — ler, mover, copiar, deletar, buscar arquivos
- `os_escrever` — criar arquivos e pastas
- `os_sistema` — executar comandos shell com confirmação humana (HITL)

### Segurança
- **Chave API criptografada**: AES-256-GCM com chave derivada da máquina (hostname+username via scrypt)
- Migração automática de keys antigas (plain text → criptografado na primeira execução)
- Blocklist de comandos perigosos no `os_sistema`
- Confirmação humana obrigatória para comandos shell (`confirmado: true`)

### Interface de Chat
- Múltiplas conversas na sidebar (como Claude.ai)
- Renderização de Markdown completa (marked + DOMPurify)
- Streaming progressivo com cursor animado
- Cards de sugestão de prompt na tela inicial
- Saudação dinâmica baseada no horário
- Pill de status do PJe em tempo real

---

## Arquitetura

```
electron/
├── main.ts                  # Main process: IPC handlers, store, inicialização
├── preload.ts               # Bridge segura renderer ↔ main (contextBridge)
├── ai-handler.ts            # Wrapper Anthropic API (texto + Vision + streaming)
├── crypto-store.ts          # AES-256-GCM para criptografar API keys em repouso
├── stagehand-manager.ts     # Chrome externo + Stagehand v3 (browser automation)
├── computer-manager.ts      # Vision loop: screenshot → Claude → nut-js (PC control)
│
├── agent/
│   ├── loop.ts              # Loop agêntico Think → Critic → Act → Observe
│   ├── think.ts             # LLM call + extrator de stream JSON ("resposta":"...")
│   ├── session.ts           # SessionManager: histórico multi-turn persistido em disco
│   ├── executor.ts          # Registra e executa skills
│   ├── types.ts             # Interfaces: Skill, AgentContext, AgentConfig, etc.
│   └── index.ts             # Inicialização: registra todas as skills
│
├── skills/
│   ├── pje/
│   │   ├── abrir.ts         # pje_abrir — navega para login do tribunal
│   │   ├── agir.ts          # pje_agir — ação livre em linguagem natural
│   │   ├── consultar.ts     # pje_consultar — consulta de processo
│   │   ├── movimentacoes.ts # pje_movimentacoes — listagem de movimentações
│   │   └── documentos.ts    # pje_documentos — acesso a documentos
│   ├── pc/
│   │   └── agir.ts          # pc_agir — controla Windows via Vision AI + nut-js
│   └── os/
│       ├── listar.ts        # os_listar — lista diretórios
│       ├── arquivos.ts      # os_arquivos — operações em arquivos
│       ├── escrever.ts      # os_escrever — cria arquivos/pastas
│       └── sistema.ts       # os_sistema — shell com HITL
│
├── tools/
│   └── os-tools.ts          # Camada base: Node.js fs/child_process (sem deps)
│
└── pje/
    ├── tribunal-urls.ts     # URLs dos tribunais suportados
    └── route-memory.ts      # Memória de rotas visitadas

src/renderer/
├── index.html               # Shell da UI
├── styles/
│   ├── main.css             # Estilos globais + fonte Michroma
│   ├── chat.css             # Mensagens, markdown, streaming cursor
│   └── thinking.css         # Animações do processo de raciocínio
└── js/
    ├── app.js               # Toda a lógica do renderer (chat, conversas, streaming)
    ├── marked.min.js        # Renderização de Markdown
    └── purify.min.js        # Sanitização HTML (DOMPurify)
```

---

## Fluxo de Streaming

```
User → app.js
  → IPC: agent-chat-message
  → loop.ts: emit streaming_start
  → think.ts: callLLM(onToken)
     → ai-handler.ts: callAnthropic(onToken)
        → SSE chunk → content_block_delta
        → createRespostaExtractor: filtra campo "resposta" do JSON
        → onToken(delta) → emit type:'token'
  → app.js: token chega → appenda na bubble
  → completed → re-renderiza com Markdown
```

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron |
| Linguagem | TypeScript |
| IA | Claude Sonnet 4.6 (Anthropic) |
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
npm run build:watch     # Watch mode do renderer
```

---

## Configuração

Toda a configuração é feita pela própria UI do app:
- **Chave Anthropic**: salva localmente criptografada com AES-256-GCM
- **Tribunal**: selecionado via skill `pje_abrir`

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
- [ ] Exportar conversa para PDF/DOCX
- [ ] Minutas automáticas com base nos autos
- [ ] RAG com jurisprudência indexada
- [ ] Notificações de movimentação processual
- [ ] Geração automática de petições

---

## Autor

**Eder Silva** — [github.com/EderSilvaa](https://github.com/EderSilvaa)

---

*Última atualização: março de 2026 — v4.0 (OS/PC automation + criptografia + streaming + sessões persistentes)*
