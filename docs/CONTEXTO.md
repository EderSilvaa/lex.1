# Sistema de Contexto da Sessão - LEX Extension

## 📚 Visão Geral

O sistema de contexto da extensão LEX é responsável por **manter informações persistentes** sobre processos judiciais, documentos processados e histórico de conversação durante a navegação no PJe. Permite que o assistente de IA tenha "memória" entre interações e até mesmo entre recarregamentos de página.

---

## 🏗️ Arquitetura

### **Componentes Principais**

```
┌─────────────────────────────────────────────────────────────┐
│                    SESSIONCONTEXT                           │
│  (Instância global: window.lexSession)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  Memória RAM     │  │  localStorage    │               │
│  │  (runtime)       │◄─┤  (persistência)  │               │
│  │                  │  │                  │               │
│  │ • processNumber  │  │ TTL: 24 horas    │               │
│  │ • processInfo    │  │ Auto-save        │               │
│  │ • documents[]    │  │ Auto-restore     │               │
│  │ • processed[]    │  │                  │               │
│  │ • history[]      │  └──────────────────┘               │
│  └──────────────────┘                                      │
│                                                             │
│  ┌──────────────────────────────────────────────┐          │
│  │  DocumentCache (referência externa)          │          │
│  │  Fallback para documentos não processados     │          │
│  └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Estrutura de Dados

### **1. Propriedades da Classe SessionContext**

```javascript
class SessionContext {
  constructor() {
    this.processNumber = null;           // Número do processo (ex: "0000123-45.2024.8.00.0000")
    this.processInfo = null;             // Metadados do processo
    this.documents = [];                 // Lista de documentos descobertos no DOM
    this.processedDocuments = [];        // Documentos baixados + texto extraído
    this.conversationHistory = [];       // Histórico de mensagens user/assistant
    this.lastAnalysis = null;            // Última análise completa do processo
    this.cache = null;                   // Referência ao DocumentCache global
    this.createdAt = new Date();         // Data de criação da sessão
    this._saveTimeout = null;            // Timer para throttle do auto-save
  }
}
```

---

### **2. Estrutura de `processInfo`**

Extraído do DOM do PJe:

```javascript
{
  numeroProcesso: "0000123-45.2024.8.00.0000",
  tribunal: "TJSP - Tribunal de Justiça de São Paulo",
  classeProcessual: "Ação de Cobrança",
  assunto: "Dívida de Contrato",
  autor: "João da Silva",
  reu: "Maria Santos Ltda",
  documentoId: "doc-current-123"  // ID do documento aberto (se houver)
}
```

---

### **3. Estrutura de `documents[]`**

Lista de documentos **descobertos** (antes de processar):

```javascript
[
  {
    id: "doc-12345",
    name: "Petição Inicial.pdf",
    type: "petition",
    url: "https://pje.tjsp.jus.br/...",
    pages: 12
  },
  {
    id: "doc-67890",
    name: "Sentença.pdf",
    type: "decision",
    url: "https://pje.tjsp.jus.br/...",
    pages: 8
  }
]
```

---

### **4. Estrutura de `processedDocuments[]`**

Documentos **processados** (OCR/PDF extraído):

```javascript
[
  {
    id: "doc-12345",
    name: "Petição Inicial.pdf",
    type: "petition",
    url: "https://pje.tjsp.jus.br/...",
    processedAt: "2025-10-02T10:30:00.000Z",  // Data de processamento
    data: {
      texto: "EXMO. SR. DR. JUIZ DE DIREITO DA 1ª VARA CÍVEL...\n\nVem à presença...",  // ← TEXTO COMPLETO
      tipo: "petition",
      tamanho: "45 KB",
      paginas: 12
    }
  },
  {
    id: "doc-67890",
    name: "Sentença.pdf",
    type: "decision",
    url: "https://pje.tjsp.jus.br/...",
    processedAt: "2025-10-02T10:35:00.000Z",
    data: {
      texto: "VISTOS. Trata-se de ação de cobrança...",
      tipo: "decision",
      tamanho: "32 KB",
      paginas: 8
    }
  }
]
```

**🔑 Ponto-chave:** O campo `data.texto` contém o **texto completo** extraído do PDF via OCR ou API.

---

### **5. Estrutura de `conversationHistory[]`**

Histórico de mensagens do chat:

```javascript
[
  {
    role: "user",
    content: "Quem são as partes do processo?",
    timestamp: "2025-10-02T10:40:00.000Z"
  },
  {
    role: "assistant",
    content: "Autor: João da Silva<br>Réu: Maria Santos Ltda",
    timestamp: "2025-10-02T10:40:02.000Z"
  },
  {
    role: "user",
    content: "O que diz a petição inicial?",
    timestamp: "2025-10-02T10:41:00.000Z"
  }
]
```

**Limitações:**
- Apenas as **últimas 20 mensagens** são salvas no localStorage (economia de espaço)
- Mensagens mais antigas ficam apenas em memória durante a sessão ativa

---

### **6. Estrutura de `lastAnalysis`**

Resultado da última análise completa do processo:

```javascript
{
  content: {
    resumo: "Ação de cobrança movida por João da Silva contra...",
    partesIdentificadas: { autor: "João da Silva", reu: "Maria Santos Ltda" },
    documentosAnalisados: 5,
    pontosChave: [
      "Dívida de R$ 50.000,00",
      "Contrato assinado em 2023",
      "Inadimplência desde maio/2024"
    ]
  },
  timestamp: "2025-10-02T10:30:15.000Z"
}
```

---

## 💾 Persistência no localStorage

### **Formato da Chave**

```javascript
localStorage.setItem('lex_session', JSON.stringify(sessionData));
```

**Nome da chave:** `lex_session`
**Tipo:** String JSON
**Tamanho médio:** 500 KB - 2 MB (depende do número/tamanho dos documentos)

---

### **Estrutura Completa Salva**

```javascript
{
  // Metadados da sessão
  "processNumber": "0000123-45.2024.8.00.0000",
  "createdAt": "2025-10-02T10:00:00.000Z",
  "expiresAt": 1728086400000,  // Timestamp (24h após criação)
  "version": "1.0",

  // Informações do processo
  "processInfo": {
    "numeroProcesso": "0000123-45.2024.8.00.0000",
    "tribunal": "TJSP",
    "classeProcessual": "Ação de Cobrança",
    "assunto": "Dívida de Contrato",
    "autor": "João da Silva",
    "reu": "Maria Santos Ltda"
  },

  // Documentos descobertos (sem texto)
  "documents": [
    { "id": "doc-123", "name": "Petição.pdf", "type": "petition", "url": "...", "pages": 12 }
  ],

  // Documentos processados (COM texto completo)
  "processedDocuments": [
    {
      "id": "doc-123",
      "name": "Petição.pdf",
      "type": "petition",
      "url": "...",
      "processedAt": "2025-10-02T10:30:00.000Z",
      "data": {
        "texto": "EXMO. SR. DR. JUIZ...",  // ← TEXTO COMPLETO AQUI
        "tipo": "petition",
        "tamanho": "45 KB",
        "paginas": 12
      }
    }
  ],

  // Últimas 20 mensagens do chat
  "conversationHistory": [
    { "role": "user", "content": "Quem é o autor?", "timestamp": "..." },
    { "role": "assistant", "content": "João da Silva", "timestamp": "..." }
  ],

  // Última análise completa
  "lastAnalysis": {
    "content": { ... },
    "timestamp": "2025-10-02T10:30:15.000Z"
  }
}
```

---

### **TTL (Time To Live)**

**Duração:** 24 horas (padrão)
**Verificação:** Ao chamar `restore()`

```javascript
restore() {
  const sessionData = JSON.parse(localStorage.getItem('lex_session'));

  // Verificar expiração
  if (Date.now() > sessionData.expiresAt) {
    console.log('⏰ LEX: Sessão expirada, removendo...');
    localStorage.removeItem('lex_session');
    return false;
  }

  // Restaurar dados...
}
```

**Comportamento:**
- ✅ Se < 24h → Restaura sessão automaticamente
- ❌ Se > 24h → Remove do localStorage e retorna `false`

---

## 🔄 Fluxo de Dados

### **1. Inicialização da Extensão**

```
┌─────────────────────────────────────────────┐
│  1. Extension Load                          │
│     content-simple.js carrega               │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  2. SessionContext.js carrega               │
│     window.lexSession = new SessionContext()│
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  3. Auto-restore                            │
│     lexSession.restore()                    │
│     ├─ Lê localStorage['lex_session']       │
│     ├─ Valida TTL (< 24h?)                  │
│     └─ Restaura: processedDocuments,        │
│        conversationHistory, processInfo     │
└─────────────────────────────────────────────┘
```

---

### **2. Processamento de Documentos (Análise Completa)**

```
┌──────────────────────────────────────┐
│  Usuário clica "Análise Completa"   │
│  ou pressiona Ctrl+;                 │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  1. Coleta informações do DOM                    │
│     - Número do processo                         │
│     - Partes (autor/réu)                         │
│     - Classe processual                          │
│     - Lista de documentos disponíveis            │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  2. Inicializa sessão                            │
│     lexSession.initialize({                      │
│       processNumber: "0000123...",               │
│       processInfo: { autor, reu, ... },          │
│       documents: [doc1, doc2, ...]               │
│     })                                           │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  3. Download + OCR de cada documento             │
│     Para cada documento:                         │
│     ├─ Download do PDF                           │
│     ├─ Extração de texto (OCR/PDFjs)             │
│     └─ lexSession.addProcessedDocument(doc, {    │
│          texto: "conteúdo completo...",          │
│          tipo: "petition",                       │
│          paginas: 12                             │
│        })                                        │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  4. AUTO-SAVE (imediato)                         │
│     lexSession.save()                            │
│     └─ Salva tudo no localStorage                │
└──────────────────────────────────────────────────┘
```

---

### **3. Conversação no Chat**

```
┌──────────────────────────────────────┐
│  Usuário digita pergunta             │
│  "Quem é o autor?"                   │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  1. Adiciona pergunta ao histórico               │
│     lexSession.addToHistory('user', pergunta)    │
│     └─ conversationHistory.push(...)             │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  2. Gera contexto para IA                        │
│     const contexto =                             │
│       lexSession.generateContextSummary({        │
│         maxDocuments: 5,                         │
│         includeHistory: true                     │
│       })                                         │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  3. Envia para API da IA                         │
│     fetch('https://generativelanguage...', {     │
│       prompt: contexto + pergunta                │
│     })                                           │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  4. Adiciona resposta ao histórico               │
│     lexSession.addToHistory('assistant', resp)   │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  5. AUTO-SAVE (com throttle de 2s)               │
│     lexSession.scheduleAutoSave()                │
│     └─ Aguarda 2s → lexSession.save()            │
└──────────────────────────────────────────────────┘
```

---

### **4. Reload da Página**

```
┌──────────────────────────────────────┐
│  Usuário recarrega página (F5)       │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  1. Extension recarrega                          │
│     window.lexSession = new SessionContext()     │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  2. Auto-restore do localStorage                 │
│     lexSession.restore()                         │
│     ├─ Valida TTL (< 24h?)                       │
│     ├─ Restaura processedDocuments[]             │
│     ├─ Restaura conversationHistory[]            │
│     └─ Restaura processInfo                      │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│  3. Sessão restaurada!                           │
│     ✅ Documentos disponíveis sem reprocessar    │
│     ✅ Histórico de chat mantido                 │
│     ✅ Informações do processo carregadas        │
└──────────────────────────────────────────────────┘
```

---

## 🔍 Métodos Principais

### **1. `initialize(options)`**

Inicializa sessão com dados do processo.

```javascript
lexSession.initialize({
  processNumber: "0000123-45.2024.8.00.0000",
  processInfo: {
    autor: "João da Silva",
    reu: "Maria Santos",
    classeProcessual: "Ação de Cobrança"
  },
  documents: [
    { id: "doc-123", name: "Petição.pdf", type: "petition", url: "..." }
  ],
  cache: window.DocumentCache  // Referência ao cache global
});
```

---

### **2. `addProcessedDocument(document, data)`**

Adiciona documento processado ao contexto **e salva automaticamente**.

```javascript
lexSession.addProcessedDocument(
  {
    id: "doc-123",
    name: "Petição Inicial.pdf",
    type: "petition",
    url: "https://..."
  },
  {
    texto: "EXMO. SR. DR. JUIZ DE DIREITO...",  // ← Texto completo
    tipo: "petition",
    tamanho: "45 KB",
    paginas: 12
  }
);

// ✅ Auto-save imediato: lexSession.save()
```

---

### **3. `addToHistory(role, content)`**

Adiciona mensagem ao histórico **com auto-save throttle (2s)**.

```javascript
lexSession.addToHistory('user', 'Quem é o autor?');
lexSession.addToHistory('assistant', 'João da Silva');

// ✅ Auto-save agendado: 2 segundos após última mensagem
```

---

### **4. `getDocumentText(documentId)`**

Busca texto de documento em **cascata** (memória → cache → null).

```javascript
const texto = await lexSession.getDocumentText('doc-123');

// Busca:
// 1º - processedDocuments[] (memória)
// 2º - DocumentCache global (se disponível)
// 3º - Retorna null
```

---

### **5. `searchDocuments(searchTerm)`**

Busca documentos por nome ou ID (case-insensitive).

```javascript
const resultados = lexSession.searchDocuments('petição');

// Retorna:
// [
//   { id: "doc-123", name: "Petição Inicial.pdf", ... },
//   { id: "doc-456", name: "Petição de Recurso.pdf", ... }
// ]
```

---

### **6. `generateContextSummary(options)`**

Gera contexto formatado para enviar à IA.

```javascript
const contexto = lexSession.generateContextSummary({
  maxDocuments: 5,           // Máx. 5 docs no resumo
  includeFullText: false,    // Não incluir texto completo
  includeHistory: true,      // Incluir últimas 3 mensagens
  includeLastAnalysis: false // Não incluir análise anterior
});

// Retorna string Markdown:
// # CONTEXTO DO PROCESSO
//
// ## Informações do Processo
// - Número: 0000123...
// - Autor: João da Silva
// ...
```

---

### **7. `save(ttl = 24)`**

Salva sessão no localStorage com TTL customizável.

```javascript
lexSession.save(48);  // Expira em 48 horas

// Salva:
// localStorage['lex_session'] = JSON.stringify({
//   processNumber, processInfo, processedDocuments,
//   conversationHistory (últimas 20), lastAnalysis,
//   createdAt, expiresAt, version
// })
```

---

### **8. `restore()`**

Restaura sessão do localStorage (valida TTL).

```javascript
const restored = lexSession.restore();

if (restored) {
  console.log('✅ Sessão restaurada!');
  console.log(`Documentos: ${lexSession.processedDocuments.length}`);
} else {
  console.log('❌ Nenhuma sessão válida encontrada');
}
```

---

### **9. `scheduleAutoSave()`**

Agenda auto-save com throttle de 2 segundos.

```javascript
lexSession.scheduleAutoSave();

// Comportamento:
// - Se já existe timer: cancela e reinicia
// - Aguarda 2 segundos de inatividade
// - Executa lexSession.save()
```

---

### **10. `getStats()`**

Retorna estatísticas da sessão.

```javascript
const stats = lexSession.getStats();

// Retorna:
// {
//   processNumber: "0000123...",
//   totalDocuments: 10,        // Descobertos
//   processedDocuments: 8,     // Processados
//   conversationMessages: 15,  // Total de mensagens
//   hasAnalysis: true,         // Tem análise completa?
//   sessionAge: 3600000        // Idade em ms (1 hora)
// }
```

---

### **11. `clear()`**

Limpa contexto e localStorage.

```javascript
lexSession.clear();

// Efeitos:
// - Zera todas as propriedades
// - Remove localStorage['lex_session']
// - Sessão volta ao estado inicial
```

---

### **12. `isActive()`**

Verifica se há sessão ativa.

```javascript
if (lexSession.isActive()) {
  console.log('✅ Sessão ativa');
} else {
  console.log('❌ Nenhuma sessão ativa');
}

// Retorna true se:
// - processNumber está definido
// - processedDocuments.length > 0
```

---

## ⚡ Auto-Save Inteligente

### **Estratégias de Auto-Save**

#### **1. Auto-Save Imediato** (após adicionar documento)

```javascript
addProcessedDocument(document, data) {
  this.processedDocuments.push(...);

  // ✅ SALVA IMEDIATAMENTE
  this.save();
}
```

**Por quê imediato?**
- Processamento de documentos é operação **pesada** (OCR, download)
- Perder dados após processamento é **crítico**
- Usuário pode fechar aba durante processamento

---

#### **2. Auto-Save com Throttle** (após mensagens)

```javascript
addToHistory(role, content) {
  this.conversationHistory.push(...);

  // ✅ SALVA APÓS 2 SEGUNDOS DE INATIVIDADE
  this.scheduleAutoSave();
}

scheduleAutoSave() {
  if (this._saveTimeout) clearTimeout(this._saveTimeout);

  this._saveTimeout = setTimeout(() => {
    this.save();
  }, 2000);
}
```

**Por quê throttle?**
- Conversação pode ter **múltiplas mensagens rápidas**
- Evitar salvar a cada 500ms (sobrecarga do localStorage)
- Aguardar 2s de **inatividade** antes de persistir

---

### **Exemplo de Comportamento**

```
Tempo | Ação                          | Auto-Save
------|-------------------------------|------------
0s    | User: "Quem é o autor?"       | Agendado (2s)
1s    | Assistant: "João da Silva"    | Reagendado (3s)
1.5s  | User: "E o réu?"              | Reagendado (3.5s)
2s    | Assistant: "Maria Santos"     | Reagendado (4s)
4s    | [Inatividade]                 | ✅ SALVA AGORA
```

---

## 🎯 Uso nos Comandos

### **Comando `/documentos`**

```javascript
if (textoLower.startsWith('/documentos')) {
  const docs = window.lexSession.processedDocuments;  // ← Acesso direto

  let html = `📚 <strong>Documentos (${docs.length})</strong><br><br>`;
  docs.forEach(doc => {
    html += `${doc.name} - ${doc.data.paginas} págs<br>`;
  });

  return html;
}
```

---

### **Comando `/analisar [ID]`**

```javascript
if (textoLower.startsWith('/analisar ')) {
  const docId = texto.substring(10).trim();

  // 1. Buscar documento no contexto
  const documento = window.lexSession.getDocument(docId);

  // 2. Obter texto completo
  const textoCompleto = await window.lexSession.getDocumentText(docId);

  // 3. Enviar para IA com prompt estruturado
  const resposta = await gerarRespostaIA(`Analise: ${textoCompleto}`);

  return resposta;
}
```

---

### **Comando `/buscar conteudo:"termo"`**

```javascript
if (textoLower.startsWith('/buscar ')) {
  const match = termo.match(/conteudo:"([^"]+)"/i);

  if (match) {
    const termoBusca = match[1].toLowerCase();

    // Buscar em processedDocuments[].data.texto
    window.lexSession.processedDocuments.forEach(doc => {
      if (doc.data.texto.toLowerCase().includes(termoBusca)) {
        // Encontrou!
      }
    });
  }
}
```

---

### **Comando `/timeline`**

```javascript
if (textoLower.startsWith('/timeline')) {
  const docs = window.lexSession.processedDocuments;

  // Ordenar por data de processamento
  const docsSorted = [...docs].sort((a, b) =>
    new Date(a.processedAt) - new Date(b.processedAt)
  );

  // Renderizar timeline...
}
```

---

## 🔒 Segurança e Privacidade

### **Dados Armazenados Localmente**

✅ **Vantagens:**
- Não sai do computador do usuário
- Sem transmissão para servidores externos (exceto API da IA)
- Controle total do usuário sobre os dados

⚠️ **Limitações:**
- localStorage **não é criptografado**
- Acessível via DevTools do navegador
- Limitado a ~10 MB (varia por navegador)

---

### **Dados Enviados para IA**

Durante conversação, o contexto resumido é enviado:

```javascript
const contexto = lexSession.generateContextSummary({
  maxDocuments: 5,      // Limita documentos
  includeFullText: false // Não envia texto completo (apenas preview)
});
```

**Enviado:**
- Número do processo
- Nomes das partes
- Nomes dos documentos
- Preview de 500 caracteres de cada documento

**Não enviado (por padrão):**
- Texto completo dos documentos
- Anexos/imagens
- URLs dos documentos

---

## 📊 Estatísticas de Uso

### **Tamanho Médio no localStorage**

| Componente               | Tamanho Médio |
|--------------------------|---------------|
| `processNumber`          | 50 bytes      |
| `processInfo`            | 500 bytes     |
| `documents[]` (10 docs)  | 2 KB          |
| `processedDocuments[]` (10 docs com texto) | **500 KB - 2 MB** |
| `conversationHistory[]` (20 msgs) | 10 KB |
| `lastAnalysis`           | 5 KB          |
| **TOTAL**                | **~1-2 MB**   |

**Limitações do localStorage:**
- Chrome/Edge: ~10 MB por domínio
- Firefox: ~10 MB por domínio
- Safari: ~5 MB por domínio

---

## 🚀 Performance

### **Benchmarks**

| Operação                 | Tempo        |
|--------------------------|--------------|
| `save()`                 | 10-50 ms     |
| `restore()`              | 20-100 ms    |
| `getDocument(id)`        | < 1 ms       |
| `searchDocuments(term)`  | 1-5 ms       |
| `getDocumentText(id)`    | < 1 ms       |
| `generateContextSummary()` | 5-20 ms    |

**Otimizações:**
- ✅ Busca em memória (não re-parse JSON)
- ✅ Throttle de auto-save (evita writes excessivos)
- ✅ Slice de histórico (últimas 20 msgs)
- ✅ Preview de texto (500 chars) ao invés de texto completo

---

## 🐛 Troubleshooting

### **Sessão não restaura após reload**

**Causas possíveis:**
1. TTL expirado (> 24h)
2. localStorage cheio (> 10 MB)
3. Modo privado/anônimo do navegador
4. localStorage desabilitado nas configurações

**Solução:**
```javascript
// Verificar localStorage
console.log(localStorage.getItem('lex_session'));

// Verificar TTL
const session = JSON.parse(localStorage.getItem('lex_session'));
console.log('Expira em:', new Date(session.expiresAt));
console.log('Expirou?', Date.now() > session.expiresAt);
```

---

### **localStorage cheio**

**Erro:**
```
QuotaExceededError: Failed to execute 'setItem' on 'Storage'
```

**Solução:**
```javascript
// Limpar sessão antiga
lexSession.clear();

// Ou reduzir TTL/histórico
lexSession.save(12);  // Apenas 12 horas
```

---

### **Documentos sem texto**

**Sintoma:** `doc.data.texto` está vazio ou `null`

**Causas:**
1. OCR falhou
2. PDF protegido/criptografado
3. Documento não foi processado (apenas descoberto)

**Verificação:**
```javascript
const doc = lexSession.getDocument('doc-123');
console.log('Tem texto?', !!doc.data.texto);
console.log('Tamanho:', doc.data.texto?.length);
```

---

## 📝 Exemplo Completo de Uso

```javascript
// 1. Inicializar sessão
lexSession.initialize({
  processNumber: "0000123-45.2024.8.00.0000",
  processInfo: {
    autor: "João da Silva",
    reu: "Maria Santos Ltda",
    classeProcessual: "Ação de Cobrança"
  },
  documents: [
    { id: "doc-123", name: "Petição.pdf", type: "petition", url: "..." }
  ]
});

// 2. Processar documento
lexSession.addProcessedDocument(
  { id: "doc-123", name: "Petição.pdf", type: "petition", url: "..." },
  {
    texto: "EXMO. SR. DR. JUIZ...",
    tipo: "petition",
    tamanho: "45 KB",
    paginas: 12
  }
);
// ✅ Auto-save imediato

// 3. Conversar
lexSession.addToHistory('user', 'Quem é o autor?');
lexSession.addToHistory('assistant', 'João da Silva');
// ✅ Auto-save agendado (2s)

// 4. Buscar documento
const doc = lexSession.getDocument('doc-123');
console.log(doc.name); // "Petição.pdf"

// 5. Obter texto
const texto = await lexSession.getDocumentText('doc-123');
console.log(texto.substring(0, 100)); // "EXMO. SR. DR. JUIZ..."

// 6. Gerar contexto para IA
const contexto = lexSession.generateContextSummary({
  maxDocuments: 5,
  includeHistory: true
});

// 7. Estatísticas
const stats = lexSession.getStats();
console.log(`${stats.processedDocuments} docs processados`);

// 8. Verificar se está ativa
if (lexSession.isActive()) {
  console.log('✅ Sessão ativa');
}

// 9. Limpar (quando necessário)
// lexSession.clear();
```

---

## 🎓 Resumo Executivo

| Aspecto             | Detalhes                                      |
|---------------------|-----------------------------------------------|
| **Armazenamento**   | localStorage (`lex_session`)                  |
| **TTL**             | 24 horas (padrão)                             |
| **Auto-save**       | Imediato (docs) + 2s throttle (mensagens)     |
| **Auto-restore**    | Automático ao carregar extensão               |
| **Dados principais**| `processedDocuments[]`, `conversationHistory[]` |
| **Texto completo**  | Armazenado em `doc.data.texto`                |
| **Histórico**       | Últimas 20 mensagens                          |
| **Performance**     | < 100 ms para save/restore                    |
| **Segurança**       | Dados locais (não criptografado)              |
| **Tamanho médio**   | 1-2 MB                                        |

---

**Última atualização:** 2 de outubro de 2025
**Versão do SessionContext:** 1.0
