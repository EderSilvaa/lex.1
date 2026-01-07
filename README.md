# LEX Desktop - Assistente Jurídico Inteligente para PJe

> Aplicativo Desktop (Electron) que funciona como um navegador dedicado para o PJe, integrando IA (GPT-4o) para analisar processos judiciais, com streaming em tempo real, formatação markdown e execução automatizada.

![Status](https://img.shields.io/badge/status-ativo-brightgreen)
![Versão](https://img.shields.io/badge/versão-2.0-blue)
![Electron](https://img.shields.io/badge/platform-windows%20%7C%20mac%20%7C%20linux-blueviolet)

---

## 🚀 Quick Start

### Instalação e Execução

1. **Clone o repositório**:
   ```bash
   git clone [URL]
   cd lex-test1
   ```

2. **Instalar Dependências**:
   ```bash
   npm install
   ```

3. **Rodar Aplicação (Dev Mode)**:
   ```bash
   npm run electron:dev
   ```
   *Isso abrirá a janela do Lex navegando automaticamente para o PJe.*

4. **Gerar Executável (Build)**:
   ```bash
   npm run electron:build
   ```
   *O instalador será gerado na pasta `dist/`.*

---

### Uso Básico

1. O aplicativo abrirá na tela de login do PJe (TJPA por padrão).
2. Faça login normalmente.
3. O ícone/sidebar do **Lex** aparecerá automaticamente na interface.
4. Use o chat para analisar processos e documentos.

---

## ✨ Funcionalidades

### 🤖 Chat com IA (GPT-4o)
- Responde perguntas sobre processos judiciais
- Analisa documentos (PDFs, HTML, imagens)
- Gera resumos executivos
- Identifica partes, pedidos, fundamentos legais

### 📡 Streaming em Tempo Real
- Respostas aparecem palavra por palavra
- Experiência similar ao ChatGPT
- Latência percebida muito menor

### 📝 Formatação Markdown
- Títulos, listas, negrito automáticos
- Código formatado
- Estrutura visual clara

### 🎯 LEX Agent (Automação) (em teste )
- Executa comandos em linguagem natural
- Planner GPT-4 gera planos de ação
- Playwright automatiza navegação
- Screenshot e interação com elementos

### 💾 Contexto Rico
- Cache inteligente de documentos (TTL 30min)
- Sessão persistente (30 dias)
- Histórico de conversas
- Busca semântica de documentos

### 📊 Dashboard de Métricas
- Documentos processados
- Tokens usados
- Tempo de sessão
- Logs do sistema (expandíveis)

---

## 📖 Documentação

### Guias Principais

- **[Guia de Testes](docs/GUIA-TESTES.md)** - Como testar todas as funcionalidades
- **[Deploy Edge Functions](docs/DEPLOY-EDGE-FUNCTION-V3.md)** - Deploy no Supabase
- **[Chrome Debug](docs/COMO-INICIAR-CHROME-DEBUG.md)** - Debug com CDP
- **[Roadmap](docs/ROADMAP-LEX-AGENT.md)** - Próximos recursos

### Recursos Específicos

- **[Streaming](docs/STREAMING-IMPLEMENTACAO.md)** - Implementação de SSE
- **[Formatação Markdown](docs/FORMATACAO-MARKDOWN-MELHORIAS.md)** - Processamento de markdown
- **[Fix Formatação](docs/FIX-FORMATACAO-STREAMING.md)** - Correção de bug de formatação

### Arquitetura

- **[Contexto](docs/CONTEXTO.md)** - Visão geral da arquitetura
- **[Nova Arquitetura Electron](docs/architecture/ELECTRON_ARCHITECTURE.md)** - 🆕 Detalhes da migração Desktop
- **[Integrações](docs/INTEGRACOES.md)** - Chat + LEX Agent
- **[Architecture](docs/architecture/)** - Diagramas e especificações

---

## 🛠️ Tecnologias

### Desktop App (Electron)
- **Electron**: Framework principal.
- **Node.js**: Main Process.
- **Electron Store**: Persistência de dados local.
- **TypeScript**: Linguagem base.

### Frontend (Injetado)
- **Content Scripts** (Reutilizados da antiga extensão).
- **PDF.js** - Extração de texto de PDFs.
- **Tesseract.js** - OCR para imagens.
- **Vanilla JS/CSS**: Interface leve e rápida.

### Backend
- **Node.js + Express** (lex-agent-backend)
- **WebSocket** (comunicação em tempo real)
- **Playwright** - Automação de navegador
- **Chrome DevTools Protocol (CDP)**

### IA
- **OpenAI GPT-4o** - Análise e geração de texto
- **Supabase Edge Functions** - Proxy serverless
- **Server-Sent Events (SSE)** - Streaming

### Infraestrutura
- **Supabase** - Backend-as-a-Service
- **localStorage** - Cache e sessão
- **Chrome Extensions API**

---

## 📁 Estrutura do Projeto

```
lex-test1/
├── manifest.json                 # Configuração da extensão
├── src/
│   ├── js/
│   │   ├── content-simple.js     # Chat, UI, OpenAI Client
│   │   ├── session-context.js    # Contexto Rico, cache
│   │   ├── lex-agent-connector.js # Conexão com backend
│   │   └── lex-agent-ui.js       # UI do Agent
│   └── css/
│       └── (estilos)
├── styles/
│   └── chat-styles.css           # Estilos do chat + markdown
├── lex-agent-backend/
│   ├── src/
│   │   ├── server.js             # Express + WebSocket
│   │   ├── action-planner.js     # GPT-4 Planner
│   │   └── pje-executor.js       # Playwright executor
│   └── package.json
├── docs/                         # Documentação completa
│   ├── GUIA-TESTES.md
│   ├── STREAMING-IMPLEMENTACAO.md
│   ├── FORMATACAO-MARKDOWN-MELHORIAS.md
│   └── archive/                  # Docs antigas/obsoletas
├── EDGE-FUNCTION-OPENIA-STREAMING.ts  # Edge Function
└── README.md                     # Este arquivo
```

---

## 🧪 Testes

### Teste Rápido

1. **Recarregar extensão**: `chrome://extensions` → 🔄 Recarregar
2. **Abrir PJe**: Entrar em qualquer processo
3. **Chat LEX**: Fazer pergunta sobre o processo
4. **Verificar**: Resposta com streaming e formatação

### Teste Completo

Siga o **[Guia de Testes](docs/GUIA-TESTES.md)** completo.

### Limpar Cache

```javascript
// Cole no console (F12) na página do PJe:
for (let i = localStorage.length - 1; i >= 0; i--) {
  const key = localStorage.key(i);
  if (key?.startsWith('lex_doc_cache_') || key === 'lex_session') {
    localStorage.removeItem(key);
  }
}
console.log('✅ Cache limpo. Recarregue a página (F5)');
```

---

## ⚙️ Configuração

### Variáveis de Ambiente (Supabase)

Configure no [Dashboard do Supabase](https://supabase.com/dashboard/project/nspauxzztflgmxjgevmo/settings/functions):

```bash
OPENAI_API_KEY=sk-proj-...
```

### Backend Local

Configure em `lex-agent-backend/.env`:

```env
PORT=3000
CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
SUPABASE_URL=https://nspauxzztflgmxjgevmo.supabase.co
SUPABASE_KEY=eyJh...
```

---

## 📊 Métricas de Uso

### Tokens OpenAI

- **Chat simples**: ~500-2000 tokens/resposta
- **Análise completa**: ~10.000-30.000 tokens
- **Com contexto rico**: até ~50.000 tokens (GPT-4o 128K)

### Cache

- **TTL**: 30 minutos
- **Tamanho**: ~1-5MB por processo
- **Limite**: localStorage (10MB total)

### Performance

- **TTFB streaming**: 1-2 segundos
- **Primeira palavra**: 1-2 segundos
- **Resposta completa**: 10-30 segundos
- **Extração PDF**: 2-5 segundos/documento

---

## 🚧 Roadmap

Veja o **[Roadmap completo](docs/ROADMAP-LEX-AGENT.md)** para:

- 🔄 Integrações futuras
- 🎯 Recursos planejados
- 📈 Melhorias de performance
- 🐛 Correções pendentes

### Próximos Passos:

- [ ] Suporte a múltiplos tribunais (TRF, STJ)
- [ ] Exportar análise para DOCX/PDF
- [ ] Minutas automáticas
- [ ] Jurisprudência integrada
- [ ] RAG (Retrieval Augmented Generation)

---

## 🤝 Comandos Rápidos

### Extensão

```bash
# Recarregar extensão
chrome://extensions → 🔄 Recarregar

# Console do Chrome
F12 → Console

# Verificar logs
window.lexLogs
```

### Backend

```bash
# Iniciar backend
cd lex-agent-backend
npm start

# Verificar saúde
curl http://localhost:3000/health

# Ver logs
npm run logs
```

### Deploy

```bash
# Edge Function
supabase login
supabase link --project-ref nspauxzztflgmxjgevmo
supabase functions deploy OPENIA

# Ver logs
supabase functions logs OPENIA --tail
```

---

## 🐛 Troubleshooting

### IA retorna respostas vazias
- **Solução**: Limpar cache e reprocessar documentos
- Veja: [Guia de Testes - Correções de Bugs](docs/GUIA-TESTES.md#testar-correções-de-bugs)

### Formatação não aparece
- **Solução**: Recarregar extensão
- Veja: [Fix Formatação](docs/FIX-FORMATACAO-STREAMING.md)

### Backend não conecta
- **Solução**: Verificar se está rodando em `localhost:3000`
- Veja: [Guia de Testes - LEX Agent Backend](docs/GUIA-TESTES.md#testar-lex-agent-backend)

### CORS error
- **Solução**: Edge Function já tem CORS configurado
- Verificar se URL está com `https://`

---

## 📝 Logs e Debug

### Ativar Logs Detalhados

```javascript
// No console:
localStorage.setItem('lex_debug', 'true');
// Use o LEX normalmente - verá logs detalhados
```

### Ver Logs do Sistema

- Abra Dashboard de Métricas no LEX
- Expanda seção "📋 Logs do Sistema"
- Últimos 100 logs capturados

### Logs da Edge Function

```bash
supabase functions logs OPENIA --tail
```

---

## 📄 Licença

[Adicionar licença aqui]

---

## 👨‍💻 Autor

**LEX Team**
- GitHub: [repositório]
- Email: [email]

---

## 🙏 Agradecimentos

- **OpenAI** - GPT-4o API
- **Supabase** - Edge Functions e BaaS
- **Playwright** - Automação de navegador
- **PDF.js** - Extração de texto
- **Tesseract.js** - OCR

---

**Última atualização**: 30 de outubro de 2025

---

<div align="center">

**[📖 Documentação](docs/)** • **[🧪 Testes](docs/GUIA-TESTES.md)** • **[🚀 Deploy](docs/DEPLOY-EDGE-FUNCTION-V3.md)** • **[🗺️ Roadmap](docs/ROADMAP-LEX-AGENT.md)**

</div>
