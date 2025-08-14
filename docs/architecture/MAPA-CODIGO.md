# 🗺️ Mapa do Código - Extensão Lex

## 📁 Arquivo Principal: content-simple.js

### 🧩 Estrutura Geral (1000+ linhas)

```javascript
// Chat Lex - Versão Completa com Design Moderno
(function() {
  'use strict';
  
  // === SEÇÃO 1: INICIALIZAÇÃO E CONTROLE ===
  // Linhas 1-25: Verificação de carregamento e variáveis globais
  
  // === SEÇÃO 2: OPENAI CLIENT INTEGRADO ===
  // Linhas 26-170: Classe OpenAIClient completa
  
  // === SEÇÃO 3: INICIALIZAÇÃO E ESTILOS ===
  // Linhas 171-485: Função inicializar() e adicionarEstilos()
  
  // === SEÇÃO 4: INTERFACE DO USUÁRIO ===
  // Linhas 486-610: Criação de botões e interface do chat
  
  // === SEÇÃO 5: SISTEMA DE CHAT ===
  // Linhas 611-750: Eventos, mensagens e interações
  
  // === SEÇÃO 6: EXTRAÇÃO DE DADOS ===
  // Linhas 751-950: Extração de documentos e informações do processo
  
  // === SEÇÃO 7: INTELIGÊNCIA ARTIFICIAL ===
  // Linhas 951-1000+: Geração de respostas e fallbacks
  
})();
```

## 🔍 Detalhamento por Seção

### 📋 SEÇÃO 1: Inicialização e Controle (Linhas 1-25)

```javascript
// Verificar se já foi carregado
if (window.lexAssistantActive) {
  return;
}
window.lexAssistantActive = true;

// Variáveis globais
let chatContainer = null;

// Cache de elementos DOM para otimização
const domCache = {
  info: null,
  lastUpdate: 0
};
```

**Função:** Evita carregamento duplo e define variáveis globais.

### 🤖 SEÇÃO 2: OpenAI Client Integrado (Linhas 26-170)

```javascript
function criarOpenAIClient() {
  // API Key configuration
  const API_KEY = 'sua-chave-aqui';
  
  class OpenAIClient {
    constructor() { /* ... */ }
    async analisarDocumento() { /* ... */ }
    criarPromptJuridico() { /* ... */ }
    formatarContexto() { /* ... */ }
    async fazerRequisicao() { /* ... */ }
    respostaFallback() { /* ... */ }
    isConfigured() { /* ... */ }
  }
  
  window.openaiClient = new OpenAIClient();
}
```

**Função:** Cliente OpenAI completo integrado no content script.

**Métodos Principais:**
- `analisarDocumento()` - Função principal de análise
- `criarPromptJuridico()` - Cria prompts especializados em direito
- `formatarContexto()` - Formata dados do processo para a IA
- `fazerRequisicao()` - Comunicação com API da OpenAI
- `respostaFallback()` - Respostas quando IA não disponível
- `isConfigured()` - Verifica se API key está configurada

### 🎨 SEÇÃO 3: Inicialização e Estilos (Linhas 171-485)

```javascript
function inicializar() {
  // Aguardar DOM estar pronto
  // Adicionar estilos
  // Criar OpenAI Client integrado
  // Criar botão flutuante
}

function adicionarEstilos() {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    /* 300+ linhas de CSS inline */
    .lex-chat { /* ... */ }
    .lex-button { /* ... */ }
    /* ... */
  `;
  document.head.appendChild(styleSheet);
}
```

**Função:** Inicialização da extensão e injeção de estilos CSS.

**Estilos Principais:**
- `.lex-chat` - Container principal do chat
- `.lex-button` - Botão flutuante
- `.lex-message` - Mensagens do chat
- `.lex-header` - Cabeçalho com informações do processo

### 🔘 SEÇÃO 4: Interface do Usuário (Linhas 486-610)

```javascript
function criarBotaoChat() {
  // Criar botão flutuante
  // Aplicar estilos inline
  // Adicionar event listeners
}

function abrirChat() {
  // Abrir interface do chat
}

function criarInterfaceChat() {
  // Extrair informações do processo
  // Criar HTML do chat
  // Configurar eventos
  // Adicionar mensagem inicial
}

function atualizarStatusIA() {
  // Atualizar indicador visual do status da IA
}
```

**Função:** Criação e gerenciamento da interface visual.

**Componentes:**
- Botão flutuante (canto inferior direito)
- Interface do chat (overlay)
- Status da IA (verde/amarelo/vermelho)
- Área de informações do processo

### 💬 SEÇÃO 5: Sistema de Chat (Linhas 611-750)

```javascript
function configurarEventos() {
  // Botão fechar
  // Botão enviar
  // Enter para enviar
}

function adicionarMensagemInicial() {
  // Mensagem de boas-vindas
  // Sugestões de comandos
}

function enviarMensagem(texto) {
  // Adicionar mensagem do usuário
  // Mostrar indicador "pensando"
  // Gerar resposta com IA
  // Exibir resposta
}
```

**Função:** Gerenciamento de mensagens e interações do chat.

**Fluxo:**
1. Usuário digita mensagem
2. Mensagem adicionada ao chat
3. Indicador "pensando" exibido
4. IA processa pergunta
5. Resposta exibida no chat

### 📄 SEÇÃO 6: Extração de Dados (Linhas 751-950)

```javascript
async function extrairConteudoDocumento() {
  // Detectar iframe do documento
  // Extrair URL do documento
  // Fazer requisição autenticada
  // Processar conteúdo (HTML/texto/PDF)
}

function extrairTextoDeHTML(html) {
  // Limpar HTML
  // Extrair texto puro
  // Sanitizar conteúdo
}

function extrairInformacoesCompletas() {
  // Extrair número do processo
  // Extrair classe processual
  // Extrair partes (autor/réu)
  // Extrair ID do documento
  // Identificar tribunal
}

function gerarInfoProcesso(info) {
  // Gerar HTML com informações do processo
}
```

**Função:** Extração de dados do PJe e documentos.

**Dados Extraídos:**
- Número do processo
- Classe processual
- Partes (autor, réu)
- Tribunal
- Conteúdo dos documentos
- Metadados dos arquivos

### 🧠 SEÇÃO 7: Inteligência Artificial (Linhas 951-1000+)

```javascript
async function gerarRespostaIA(pergunta) {
  // Extrair contexto do processo
  // Extrair conteúdo do documento
  // Verificar disponibilidade da IA
  // Gerar resposta ou usar fallback
}

function gerarRespostaFallback(pergunta) {
  // Analisar tipo de pergunta
  // Gerar resposta estruturada
  // Incluir informações do processo
}
```

**Função:** Processamento inteligente de perguntas e geração de respostas.

**Tipos de Resposta:**
- Análise de processo
- Informações sobre documentos
- Prazos processuais
- Guias de peticionamento
- Comandos de ajuda

## 🔗 Fluxo de Dados

### 📊 Diagrama de Fluxo

```
Página PJe carrega
        ↓
content-simple.js injeta
        ↓
Inicialização (DOM ready)
        ↓
Criação do OpenAI Client
        ↓
Adição de estilos CSS
        ↓
Criação do botão flutuante
        ↓
Aguarda clique do usuário
        ↓
Extração de dados do processo ← Cache DOM
        ↓
Criação da interface do chat
        ↓
Usuário digita pergunta
        ↓
Extração de conteúdo do documento ← Requisição autenticada
        ↓
Montagem do contexto completo
        ↓
Envio para OpenAI API ← Prompt especializado
        ↓
Processamento da resposta
        ↓
Exibição no chat
```

## 🎯 Pontos de Entrada e Saída

### 📥 Entradas (Inputs)

1. **DOM do PJe:** Informações do processo
2. **Iframes:** Conteúdo dos documentos
3. **Usuário:** Perguntas e comandos
4. **OpenAI API:** Respostas da IA

### 📤 Saídas (Outputs)

1. **Interface Visual:** Botão e chat
2. **Requisições HTTP:** Para documentos e OpenAI
3. **Logs Console:** Para debug
4. **Respostas:** Análises e informações

## 🔧 Variáveis Globais Importantes

```javascript
// Controle de estado
window.lexAssistantActive = true;

// Interface
let chatContainer = null;

// Cache de performance
const domCache = {
  info: null,
  lastUpdate: 0
};

// Cliente IA
window.openaiClient = new OpenAIClient();
```

## 🎨 Classes CSS Principais

```css
.lex-chat          /* Container principal do chat */
.lex-button        /* Botão flutuante */
.lex-header        /* Cabeçalho com info do processo */
.lex-messages      /* Área de mensagens */
.lex-message       /* Mensagem individual */
.lex-bubble        /* Balão da mensagem */
.lex-input-area    /* Área de input */
.lex-send          /* Botão enviar */
```

## 🚀 Funções de Alto Nível

### 🎯 Funções Principais

1. **`inicializar()`** - Ponto de entrada principal
2. **`criarBotaoChat()`** - Cria interface visual
3. **`enviarMensagem()`** - Processa interações
4. **`gerarRespostaIA()`** - Gera respostas inteligentes
5. **`extrairInformacoesCompletas()`** - Extrai dados do PJe

### 🔧 Funções Utilitárias

1. **`adicionarEstilos()`** - Injeta CSS
2. **`configurarEventos()`** - Configura listeners
3. **`atualizarStatusIA()`** - Atualiza indicadores
4. **`extrairTextoDeHTML()`** - Processa documentos
5. **`gerarInfoProcesso()`** - Formata informações