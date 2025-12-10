# Fase 3: Renderer e Interface

**Duração estimada:** 3 dias (24 horas)
**Esforço:** Alto
**Status:** ⏳ Pendente

---

## Objetivos

✅ Adaptar content-simple.js para renderer
✅ Portar componentes de UI (chat, modais, toasts)
✅ Implementar módulos de cache e contexto
✅ Integrar PDF.js e Tesseract.js
✅ Criar interface completa do LEX Agent

---

## Arquitetura do Renderer

```
src/renderer/
├── index.html                  # Página principal
├── chat.html                   # Interface de chat
├── styles/
│   ├── main.css               # Estilos globais
│   ├── chat.css               # Estilos do chat (adaptado de chat-styles.css)
│   └── modal.css              # Estilos de modais
├── js/
│   ├── main.js                # Script principal
│   ├── chat-controller.js     # Adaptado de content-simple.js
│   ├── session-context.js     # Reaproveitado
│   ├── document-cache.js      # Reaproveitado
│   ├── document-classifier.js # Reaproveitado
│   ├── process-analyzer.js    # Reaproveitado
│   ├── minuta-generator.js    # Reaproveitado
│   └── ui-components.js       # Componentes de UI
└── lib/
    ├── pdf.min.js             # PDF.js
    ├── tesseract.min.js       # Tesseract
    └── marked.min.js          # Markdown parser
```

---

## Sub-tarefas Detalhadas

### 3.1 Copiar Módulos Reaproveitáveis (30 min)

**Descrição:** Copiar módulos que não precisam de adaptação

**Comandos:**
```bash
cd c:\Users\EDER\lex-desktop

# Criar diretórios
mkdir src\renderer\js
mkdir src\renderer\lib
mkdir src\renderer\styles

# Copiar módulos JavaScript
xcopy c:\Users\EDER\lex-test1\src\js\session-context.js src\renderer\js\
xcopy c:\Users\EDER\lex-test1\src\js\document-cache.js src\renderer\js\
xcopy c:\Users\EDER\lex-test1\src\js\document-classifier.js src\renderer\js\
xcopy c:\Users\EDER\lex-test1\src\js\process-analyzer.js src\renderer\js\
xcopy c:\Users\EDER\lex-test1\src\js\process-crawler.js src\renderer\js\
xcopy c:\Users\EDER\lex-test1\src\js\minuta-generator.js src\renderer\js\
xcopy c:\Users\EDER\lex-test1\src\js\document-detector.js src\renderer\js\
xcopy c:\Users\EDER\lex-test1\src\js\model-cache.js src\renderer\js\
xcopy c:\Users\EDER\lex-test1\src\js\pje-model-detector.js src\renderer\js\

# Copiar bibliotecas
xcopy c:\Users\EDER\lex-test1\src\js\pdf.min.js src\renderer\lib\
xcopy c:\Users\EDER\lex-test1\src\js\tesseract.min.js src\renderer\lib\

# Copiar CSS
xcopy c:\Users\EDER\lex-test1\styles\chat-styles.css src\renderer\styles\chat.css
```

**Arquivos copiados:**
- ✅ session-context.js (17.6 KB)
- ✅ document-cache.js (15.4 KB)
- ✅ document-classifier.js (11.1 KB)
- ✅ process-analyzer.js (29.7 KB)
- ✅ minuta-generator.js (29.4 KB)
- ✅ pdf.min.js (320 KB)
- ✅ tesseract.min.js (66 KB)

**Checklist:**
- [ ] Arquivos copiados
- [ ] Estrutura validada

---

### 3.2 Adaptar content-simple.js → chat-controller.js (4 horas)

**Descrição:** Maior tarefa da fase - adaptar o arquivo principal

**Arquivo fonte:** `c:\Users\EDER\lex-test1\src\js\content-simple.js` (141 KB)
**Arquivo destino:** `src/renderer/js/chat-controller.js`

**Mudanças principais:**

#### A. Remover código específico de extensão
```javascript
// REMOVER:
chrome.runtime.sendMessage(...)
chrome.storage.local.get(...)
chrome.runtime.getURL(...)

// SUBSTITUIR POR:
window.electronAPI.sendMessage(...)
localStorage.getItem(...)
// Paths relativos ou via electronAPI
```

#### B. Adaptar carregamento de CSS
```javascript
// ANTES (Extension):
function carregarCSS() {
  const cssUrl = chrome.runtime.getURL('styles/chat-styles.css');
  const link = document.createElement('link');
  link.href = cssUrl;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}

// DEPOIS (Electron):
// CSS já carregado via <link> no HTML
// Ou carregar dinamicamente:
function carregarCSS() {
  const link = document.createElement('link');
  link.href = './styles/chat.css';
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}
```

#### C. Adaptar comunicação com backend
```javascript
// ANTES (WebSocket via lex-agent-connector.js):
window.lexAgent.connect();
window.lexAgent.sendCommand(command, context);

// DEPOIS (IPC):
const sessionId = await window.electronAPI.createSession();
await window.electronAPI.executeCommand(sessionId, command, context);
```

#### D. Adaptar sistema de chat
```javascript
class ChatController {
  constructor() {
    this.sessionId = null;
    this.chatHistory = [];
    this.isOpen = false;
    this.container = null;
  }

  async initialize() {
    console.log('🎨 Inicializando ChatController...');

    // Criar sessão
    this.sessionId = await window.electronAPI.createSession();
    console.log('📝 Sessão criada:', this.sessionId);

    // Carregar histórico
    await this.loadHistory();

    // Criar interface
    this.createChatInterface();

    // Configurar listeners
    this.setupEventListeners();
    this.setupBackendListeners();

    console.log('✅ ChatController inicializado');
  }

  createChatInterface() {
    // Criar container do chat (mesmo HTML da extensão)
    this.container = document.createElement('div');
    this.container.id = 'lex-chat-container';
    this.container.className = 'lex-chat-premium compact';

    this.container.innerHTML = `
      <div class="lex-chat-header">
        <div class="lex-header-left">
          <span class="lex-logo-text">LEX</span>
          <span class="lex-status-indicator"></span>
        </div>
        <button class="lex-close-btn" title="Fechar (Esc)">×</button>
      </div>

      <div class="lex-chat-messages" id="lex-messages"></div>

      <div class="lex-chat-input-area">
        <textarea
          id="lex-input"
          placeholder="Digite sua pergunta..."
          rows="1"
        ></textarea>
        <button id="lex-send-btn" class="lex-send-button" title="Enviar (Ctrl+Enter)">
          ➤
        </button>
      </div>
    `;

    document.body.appendChild(this.container);
  }

  async sendMessage(userMessage) {
    // Adicionar mensagem do usuário
    this.addMessage(userMessage, 'user');

    // Preparar contexto
    const context = await this.prepareContext();

    // Enviar para backend via IPC
    const result = await window.electronAPI.executeCommand(
      this.sessionId,
      userMessage,
      context
    );

    if (!result.success) {
      this.addMessage(`Erro: ${result.error}`, 'error');
      return;
    }

    // Resposta será recebida via listener 'plan-created'
  }

  prepareContext() {
    // Obter dados da sessão
    const session = window.SessionContext.getCurrentSession();

    return {
      processNumber: session?.processNumber,
      documents: session?.documents || [],
      previousAnalysis: session?.analysis || null,
      chatHistory: this.chatHistory.slice(-3) // Últimas 3 mensagens
    };
  }

  addMessage(content, type = 'assistant') {
    const messagesDiv = document.getElementById('lex-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `lex-message lex-${type}-message`;

    if (type === 'assistant') {
      // Renderizar markdown
      messageDiv.innerHTML = marked.parse(content);
    } else {
      messageDiv.textContent = content;
    }

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Salvar no histórico
    this.chatHistory.push({ type, content, timestamp: Date.now() });
    this.saveHistory();
  }

  setupBackendListeners() {
    // Plano criado
    window.electronAPI.onPlanCreated((sessionId, plan) => {
      if (sessionId === this.sessionId) {
        this.handlePlanCreated(plan);
      }
    });

    // Execução completada
    window.electronAPI.onExecutionCompleted((sessionId, result) => {
      if (sessionId === this.sessionId) {
        this.addMessage('✅ Ação executada com sucesso!', 'system');
      }
    });

    // Erro
    window.electronAPI.onExecutionError((sessionId, error) => {
      if (sessionId === this.sessionId) {
        this.addMessage(`❌ Erro: ${error}`, 'error');
      }
    });
  }

  handlePlanCreated(plan) {
    // Mostrar plano formatado
    let message = `**Plano de Ação:**\n\n`;
    message += `📋 ${plan.intent.description}\n\n`;
    message += `**Passos:**\n`;
    plan.steps.forEach((step, i) => {
      message += `${i + 1}. ${step.description}\n`;
    });

    if (plan.needsApproval) {
      message += `\n⚠️ Ação requer aprovação. Deseja executar?`;
      this.addMessage(message, 'assistant');
      this.showApprovalButtons();
    } else {
      this.addMessage(message, 'assistant');
    }
  }

  showApprovalButtons() {
    // Adicionar botões de aprovação
    const messagesDiv = document.getElementById('lex-messages');
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'approval-buttons';
    buttonsDiv.innerHTML = `
      <button class="approve-btn">✅ Aprovar</button>
      <button class="cancel-btn">❌ Cancelar</button>
    `;

    buttonsDiv.querySelector('.approve-btn').addEventListener('click', () => {
      window.electronAPI.executePlan(this.sessionId);
      buttonsDiv.remove();
    });

    buttonsDiv.querySelector('.cancel-btn').addEventListener('click', () => {
      window.electronAPI.cancelAction(this.sessionId);
      buttonsDiv.remove();
      this.addMessage('Ação cancelada.', 'system');
    });

    messagesDiv.appendChild(buttonsDiv);
  }

  async loadHistory() {
    // Carregar do localStorage
    const saved = localStorage.getItem('lex_chat_history');
    if (saved) {
      this.chatHistory = JSON.parse(saved);
      // Restaurar mensagens na UI
      this.chatHistory.forEach(msg => {
        this.addMessage(msg.content, msg.type);
      });
    }
  }

  saveHistory() {
    localStorage.setItem('lex_chat_history', JSON.stringify(this.chatHistory));
  }
}

// Exportar globalmente
window.ChatController = ChatController;
```

**Checklist:**
- [ ] Código adaptado
- [ ] APIs Chrome removidas
- [ ] IPC implementado
- [ ] Interface funcional
- [ ] Histórico salvando

---

### 3.3 Criar Interface HTML Completa (2 horas)

**Criar `src/renderer/chat.html`:**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;">
  <title>LEX Agent - Chat</title>

  <!-- Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Michroma&display=swap" rel="stylesheet">

  <!-- Estilos -->
  <link rel="stylesheet" href="styles/main.css">
  <link rel="stylesheet" href="styles/chat.css">
  <link rel="stylesheet" href="styles/modal.css">
</head>
<body>
  <!-- Chat será injetado aqui pelo ChatController -->

  <!-- Bibliotecas -->
  <script src="lib/pdf.min.js"></script>
  <script src="lib/tesseract.min.js"></script>
  <script src="lib/marked.min.js"></script>

  <!-- Módulos LEX -->
  <script src="js/document-cache.js"></script>
  <script src="js/session-context.js"></script>
  <script src="js/document-classifier.js"></script>
  <script src="js/process-analyzer.js"></script>
  <script src="js/minuta-generator.js"></script>

  <!-- Controlador principal -->
  <script src="js/chat-controller.js"></script>

  <!-- Inicialização -->
  <script>
    (async () => {
      console.log('🚀 Inicializando LEX Agent...');

      const chatController = new ChatController();
      await chatController.initialize();

      console.log('✅ LEX Agent pronto!');

      // Expor globalmente para debug
      window.lex = chatController;
    })();
  </script>
</body>
</html>
```

**Checklist:**
- [ ] HTML criado
- [ ] Bibliotecas referenciadas
- [ ] Ordem de carregamento correta
- [ ] CSP configurado

---

### 3.4 Adaptar CSS (90 min)

**Editar `src/renderer/styles/chat.css`:**

Copiar de `chat-styles.css` e fazer ajustes:

```css
/* Adaptar para app desktop (sem overlay) */
#lex-chat-container {
  /* ANTES (Extension - overlay): */
  /* position: fixed; */
  /* top: 20px; */
  /* right: 20px; */

  /* DEPOIS (Electron - fullscreen): */
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 0;
}

/* Ajustar tamanhos para desktop */
.lex-chat-messages {
  max-height: calc(100vh - 140px); /* Mais espaço */
}

/* ... manter resto do CSS */
```

**Checklist:**
- [ ] CSS adaptado
- [ ] Layout desktop aplicado
- [ ] Responsividade mantida

---

### 3.5 Integrar Marked.js (Markdown) (30 min)

**Descrição:** Adicionar biblioteca para renderizar markdown

**Download:**
```bash
cd c:\Users\EDER\lex-desktop\src\renderer\lib

# Baixar marked.min.js
# https://cdn.jsdelivr.net/npm/marked/marked.min.js
```

**Uso no chat-controller.js:**
```javascript
// Já mostrado acima na função addMessage()
messageDiv.innerHTML = marked.parse(content);
```

**Checklist:**
- [ ] marked.js baixado
- [ ] Integrado no chat
- [ ] Markdown renderizando

---

### 3.6 Criar Sistema de Modais (90 min)

**Criar `src/renderer/js/ui-components.js`:**

```javascript
class ModalManager {
  static show(title, content, options = {}) {
    const modal = document.createElement('div');
    modal.className = 'lex-modal-overlay';
    modal.innerHTML = `
      <div class="lex-modal">
        <div class="lex-modal-header">
          <h2>${title}</h2>
          <button class="lex-modal-close">×</button>
        </div>
        <div class="lex-modal-content">
          ${content}
        </div>
        <div class="lex-modal-footer">
          ${options.showCancel !== false ? '<button class="lex-btn-cancel">Cancelar</button>' : ''}
          ${options.showConfirm !== false ? '<button class="lex-btn-confirm">Confirmar</button>' : ''}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    return new Promise((resolve) => {
      const closeModal = (result) => {
        modal.remove();
        resolve(result);
      };

      modal.querySelector('.lex-modal-close')?.addEventListener('click', () => closeModal(false));
      modal.querySelector('.lex-btn-cancel')?.addEventListener('click', () => closeModal(false));
      modal.querySelector('.lex-btn-confirm')?.addEventListener('click', () => closeModal(true));

      // Fechar ao clicar fora
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(false);
      });
    });
  }

  static toast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `lex-toast lex-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

window.ModalManager = ModalManager;
```

**Criar CSS (`src/renderer/styles/modal.css`):**
```css
.lex-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(5px);
}

.lex-modal {
  background: linear-gradient(135deg, #1a1a2e 0%, #0f0f0f 100%);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.lex-modal-header {
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lex-modal-header h2 {
  margin: 0;
  color: #a855f7;
}

.lex-modal-close {
  background: none;
  border: none;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
}

.lex-modal-content {
  padding: 20px;
  color: #fff;
}

.lex-modal-footer {
  padding: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.lex-btn-confirm, .lex-btn-cancel {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.lex-btn-confirm {
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  color: white;
}

.lex-btn-cancel {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

/* Toast */
.lex-toast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 15px 20px;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transform: translateY(100px);
  opacity: 0;
  transition: all 0.3s ease;
  z-index: 10001;
}

.lex-toast.show {
  transform: translateY(0);
  opacity: 1;
}

.lex-toast-success { border-left: 4px solid #22c55e; }
.lex-toast-error { border-left: 4px solid #ef4444; }
.lex-toast-warning { border-left: 4px solid #f59e0b; }
.lex-toast-info { border-left: 4px solid #3b82f6; }
```

**Checklist:**
- [ ] ModalManager criado
- [ ] Toasts implementados
- [ ] CSS completo

---

### 3.7 Integrar PDF.js e Tesseract.js (60 min)

**Validar integração:**
```javascript
// Testar PDF.js
const loadPDF = async (pdfUrl) => {
  const loadingTask = pdfjsLib.getDocument(pdfUrl);
  const pdf = await loadingTask.promise;
  console.log('PDF carregado:', pdf.numPages, 'páginas');
  return pdf;
};

// Testar Tesseract.js
const extractTextFromImage = async (imageUrl) => {
  const worker = await Tesseract.createWorker();
  await worker.loadLanguage('por');
  await worker.initialize('por');
  const { data: { text } } = await worker.recognize(imageUrl);
  await worker.terminate();
  return text;
};
```

**Checklist:**
- [ ] PDF.js funciona
- [ ] Tesseract.js funciona
- [ ] Workers configurados

---

### 3.8 Testar Interface Completa (2 horas)

**Testes a realizar:**
1. Interface carrega sem erros
2. Chat envia e recebe mensagens
3. Markdown renderiza corretamente
4. Modais abrem e fecham
5. Toasts aparecem
6. Histórico salva e carrega
7. Sessão persiste

**Checklist:**
- [ ] Todos os testes passando
- [ ] UI responsiva
- [ ] Sem erros no console

---

## Validação da Fase 3

### Critérios de Sucesso

✅ Interface completa renderizando
✅ Chat funcional
✅ Comunicação IPC funcionando
✅ Modais e toasts operacionais
✅ PDF.js e Tesseract integrados
✅ Histórico persistindo
✅ UX fluida e responsiva

---

## Próxima Fase

➡️ **[Fase 4: BrowserView PJe](FASE-4-BROWSERVIEW-PJE.md)**

---

**Status:** ⏳ Aguardando início
**Atualizado:** 2025-12-10
