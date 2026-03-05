# LEX — Assistente Jurídico Agêntico para PJe

> Aplicativo Desktop (Electron + TypeScript) com IA Claude da Anthropic para automação e análise no PJe. Combina um agente autônomo com loop de raciocínio (Think → Critic → Act → Observe), automação real de navegador via Stagehand v3, e interface de chat com múltiplas conversas persistentes.

![Status](https://img.shields.io/badge/status-ativo-brightgreen)
![Versão](https://img.shields.io/badge/versão-3.0-blue)
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
- Memória persistente de sessão com contexto de histórico

### Automação PJe
- Controla o Chrome externamente via Stagehand v3
- Executa ações em linguagem natural ("consultar processo 0001234-56.2024")
- Overlay visual no navegador mostrando a ação em tempo real
- Suporte ao TRT8 (PJe 1º grau e painel do usuário externo)

### Interface de Chat
- Múltiplas conversas salvas na sidebar (como Claude.ai)
- Renderização de Markdown completa (marked + DOMPurify)
- Cards de sugestão de prompt na tela inicial
- Saudação dinâmica baseada no horário
- Pill de status do PJe em tempo real
- Anexo de arquivos no input

### Múltiplas Conversas
- Conversas persistidas localmente via electron-store
- Contexto do agente restaurado ao retomar uma conversa (últimas 8 mensagens)
- Título gerado automaticamente pelo primeiro input do usuário

---

## Arquitetura

```
electron/
├── main.ts                  # Main process: IPC handlers, store, inicialização
├── preload.ts               # Bridge segura renderer ↔ main (contextBridge)
├── stagehand-manager.ts     # Gerencia Chrome externo + Stagehand v3
├── agent/
│   ├── loop.ts              # Loop agêntico (Think → Critic → Act → Observe)
│   ├── session.ts           # SessionManager: histórico de mensagens por UUID
│   ├── memory.ts            # Memória persistente
│   ├── cache.ts             # Cache de respostas
│   └── index.ts             # Exports públicos do módulo agent
├── skills/pje/
│   ├── abrir.ts             # Navega para login do tribunal
│   ├── agir.ts              # Ação livre em linguagem natural
│   ├── consultar.ts         # Consulta de processo
│   ├── movimentacoes.ts     # Listagem de movimentações
│   └── documentos.ts        # Acesso a documentos
└── pje/
    ├── tribunal-urls.ts     # URLs dos tribunais suportados
    └── route-memory.ts      # Memória de rotas visitadas

src/renderer/
├── index.html               # Shell da UI
├── styles/
│   ├── main.css             # Estilos globais + fonte Michroma
│   ├── chat.css             # Mensagens, markdown, thinking accordion
│   └── thinking.css         # Animações do processo de raciocínio
└── js/
    ├── app.js               # Toda a lógica do renderer (chat, conversas, agente)
    ├── marked.min.js        # Renderização de Markdown
    └── purify.min.js        # Sanitização HTML (DOMPurify)
```

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron |
| Linguagem | TypeScript |
| IA | Claude Sonnet 4.6 (Anthropic) |
| Automação | Stagehand v3 + Chrome externo |
| Persistência | electron-store |
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
- **Chave Anthropic**: salva localmente via electron-store
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

---

## Autor

**Eder Silva** — [github.com/EderSilvaa](https://github.com/EderSilvaa)

---

*Última atualização: março de 2026 — v3.0 (Stagehand v3 + multi-conversas + markdown)*
