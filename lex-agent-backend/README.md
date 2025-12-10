# 🤖 LEX Agent Backend

Backend Node.js para o LEX Agent - sistema autônomo de automação jurídica.

## 📋 Pré-requisitos

- Node.js 18+ instalado
- npm ou yarn
- Navegador Chromium (para Playwright)

## 🚀 Instalação

```bash
# 1. Navegar para o diretório
cd lex-agent-backend

# 2. Instalar dependências
npm install

# 3. Instalar navegadores do Playwright
npx playwright install chromium

# 4. Configurar variáveis de ambiente
# Edite o arquivo .env e adicione sua OPENAI_API_KEY
```

## ⚙️ Configuração

Edite o arquivo `.env`:

```env
# OpenAI API Key (obrigatório)
OPENAI_API_KEY=sk-...

# Porta do servidor (opcional, padrão: 3000)
PORT=3000

# Mostrar navegador durante execução (opcional)
HEADLESS=false
```

## 🎯 Executar

### Modo Desenvolvimento (com auto-reload)
```bash
npm run dev
```

### Modo Produção
```bash
npm start
```

Você verá:
```
🤖 =============================================
🤖  LEX Agent Backend - INICIADO
🤖 =============================================
📡 HTTP Server: http://localhost:3000
🔌 WebSocket: ws://localhost:3000
💚 Status: http://localhost:3000/health
🤖 =============================================

Aguardando conexões da extensão...
```

## 🔧 Testando a Conexão

### 1. Verificar saúde do servidor
```bash
curl http://localhost:3000/health
```

Deve retornar:
```json
{
  "status": "ok",
  "uptime": 42.5,
  "activeSessions": 0,
  "timestamp": "2025-10-14T..."
}
```

### 2. Conectar a extensão

1. Abra o Chrome e carregue a extensão LEX
2. Navegue para uma página do PJe
3. Abra o Console (F12)
4. Digite: `window.lexAgentConnector.getStatus()`

Deve retornar:
```javascript
{
  connected: true,
  sessionId: "session_1728...",
  reconnectAttempts: 0,
  backendUrl: "ws://localhost:3000"
}
```

## 📡 Endpoints da API

### WebSocket

**URL:** `ws://localhost:3000`

**Mensagens suportadas:**

#### Cliente → Servidor

```javascript
// Atualizar contexto
{
  type: 'update_context',
  payload: {
    processNumber: '1234567-89.2024.8.14.0001',
    processInfo: { ... },
    documents: [ ... ]
  }
}

// Executar comando
{
  type: 'execute_command',
  payload: {
    command: 'protocolar petição',
    context: { ... }
  }
}

// Aprovar ação
{
  type: 'approve_action',
  payload: { planId: 'plan_123' }
}
```

#### Servidor → Cliente

```javascript
// Plano criado
{
  type: 'plan_created',
  plan: {
    intent: { action: 'protocolar', target: 'petição' },
    steps: [ ... ],
    risks: [ ... ],
    needsApproval: true
  }
}

// Progresso de execução
{
  type: 'execution_progress',
  currentStep: 2,
  totalSteps: 5,
  stepDescription: 'Preenchendo formulário',
  percentage: 40
}

// Execução concluída
{
  type: 'execution_completed',
  success: true,
  message: 'Petição protocolada com sucesso'
}
```

### HTTP REST

#### `GET /health`
Verifica saúde do servidor

#### `GET /sessions`
Lista sessões ativas

#### `POST /api/analyze-context`
Analisa contexto jurídico

```bash
curl -X POST http://localhost:3000/api/analyze-context \
  -H "Content-Type: application/json" \
  -d '{"context": {"processNumber": "1234567-89.2024.8.14.0001"}}'
```

## 📁 Estrutura do Projeto

```
lex-agent-backend/
├── src/
│   ├── server.js              # Servidor principal
│   ├── agents/                # Agentes de IA (TODO)
│   ├── executors/             # Executores de ação (TODO)
│   ├── services/              # Serviços auxiliares (TODO)
│   └── utils/                 # Utilitários (TODO)
├── logs/                      # Logs de execução
├── .env                       # Configurações
├── package.json
└── README.md
```

## 🐛 Debug

### Ver logs do servidor
```bash
# No terminal onde o servidor está rodando
# Todos os logs aparecem automaticamente
```

### Ver mensagens WebSocket
```javascript
// No console da extensão
window.lexAgentConnector.ws.onmessage = (e) => {
  console.log('📨 Recebido:', JSON.parse(e.data));
}
```

### Forçar reconexão
```javascript
// No console da extensão
window.lexAgentConnector.disconnect();
window.lexAgentConnector.connect();
```

## 🚨 Solução de Problemas

### "Conexão recusada"
✅ Certifique-se de que o servidor está rodando (`npm run dev`)

### "WebSocket failed to connect"
✅ Verifique se a porta 3000 está disponível
✅ Tente reiniciar o servidor

### "Session not found"
✅ Recarregue a extensão no Chrome
✅ Recarregue a página do PJe

## 🔜 Próximos Passos

- [ ] Implementar LexAgentBrain (análise de contexto com GPT-4)
- [ ] Integrar Playwright para automação real
- [ ] Criar executores de ação específicos do PJe
- [ ] Implementar sistema de logs detalhado
- [ ] Adicionar memória de longo prazo (vector DB)

## 📝 Notas

- Este é um MVP inicial
- Automação real será implementada nas próximas iterações
- Por enquanto, apenas simula execução de ações

---

**Status:** 🟡 Em Desenvolvimento
**Versão:** 0.1.0
**Data:** Outubro 2025
