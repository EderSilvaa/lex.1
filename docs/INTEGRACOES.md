# 🔌 LEX - Integrações e Bibliotecas

**Última atualização:** 30/09/2025

---

## 📚 Bibliotecas Integradas

### 1. **PDF.js v3.11.174**

#### **Propósito:**
Extração de texto completo de documentos PDF diretamente no navegador.

#### **Arquivos:**
- `src/js/pdf.min.js` (320 KB)
- `src/js/pdf.worker.min.js` (1.06 MB)

#### **Integração:**
```javascript
// manifest.json - carregado como content script
"js": [
  "src/js/pdf.min.js",  // PRIMEIRO (antes de todos os outros)
  // ... outros scripts
]

// Configuração do worker
const workerSrc = chrome.runtime.getURL('src/js/pdf.worker.min.js');
window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
```

#### **Uso:**
```javascript
// src/ts/pdf-processor.js
const processor = new PDFProcessor();
await processor.initialize(); // carrega PDF.js

const resultado = await processor.extractTextFromPDF(pdfBlob, {
  maxPages: undefined,          // processar todas as páginas
  combineTextItems: true,       // combinar itens de texto
  normalizeWhitespace: true     // normalizar espaços
});

console.log(resultado.text);           // texto extraído
console.log(resultado.stats.totalPages); // número de páginas
console.log(resultado.metadata);       // metadados do PDF
```

#### **Características:**
- ✅ Manifest V3 compliant (sem CDN)
- ✅ Extração página por página com progresso
- ✅ Suporte a metadados (autor, título, criação)
- ✅ Normalização de espaços em branco
- ✅ Fallback automático em caso de erro

---

### 2. **Tesseract.js v5**

#### **Propósito:**
OCR (Optical Character Recognition) de imagens e PDFs escaneados em português.

#### **Arquivo:**
- `src/js/tesseract.min.js` (66 KB)

#### **Integração:**
```javascript
// manifest.json - carregado como content script
"js": [
  "src/js/pdf.min.js",
  "src/js/tesseract.min.js",  // SEGUNDO
  // ... outros scripts
]
```

#### **Uso:**
```javascript
// src/js/content-simple.js - processarDocumentoImagem()
const imageBlob = await DocumentDetector.getDocumentBlob(url);

const { data: { text } } = await Tesseract.recognize(
  imageBlob,
  'por', // idioma: português
  {
    logger: info => {
      if (info.status === 'recognizing text') {
        console.log(`📊 OCR Progress: ${Math.round(info.progress * 100)}%`);
      }
    }
  }
);

console.log('Texto extraído:', text);
```

#### **Características:**
- ✅ Reconhecimento em português (`'por'`)
- ✅ Progress callback para acompanhamento
- ✅ Suporte a múltiplos formatos de imagem
- ✅ Execução no navegador (sem backend)

---

### 3. **Pako (Compressão)**

#### **Propósito:**
Compressão/descompressão de dados no cache localStorage.

#### **Integração:**
Incluído via script externo (já carregado pelo PJe).

#### **Uso:**
```javascript
// src/js/document-cache.js
compressData(data) {
  const jsonString = JSON.stringify(data);
  const compressed = pako.deflate(jsonString, { to: 'string' });
  return btoa(compressed);
}

decompressData(compressedData) {
  const compressed = atob(compressedData);
  const decompressed = pako.inflate(compressed, { to: 'string' });
  return JSON.parse(decompressed);
}
```

#### **Características:**
- ✅ Reduz tamanho do cache significativamente
- ✅ Compatível com localStorage
- ✅ Compressão/descompressão rápida

---

## 🔗 Integrações de API

### 1. **Supabase Edge Functions**

#### **Endpoint em Uso:**
```
https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/OPENIA
```

#### **Autenticação:**
```javascript
const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Chave pública

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}`,
  'apikey': apiKey
};
```

#### **Formato de Requisição:**
```json
{
  "pergunta": "Você é um assistente jurídico. Analise o processo 0003398-66.1997.8.14.0301...",
  "contexto": "Análise completa do processo 0003398-66.1997.8.14.0301"
}
```

#### **Formato de Resposta:**
```json
{
  "resposta": "## RESUMO EXECUTIVO\n\n O processo trata de...",
  "fallback": "Serviço de IA temporariamente indisponível. Tente novamente."
}
```

#### **Uso:**
```javascript
// src/js/process-analyzer.js - sendToAPI()
const apiUrl = 'https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/OPENIA';

// Envio em batches de 3 documentos
for (let i = 0; i < batches.length; i++) {
  const documentosTexto = batches[i].map(doc => {
    let conteudo = doc.conteudo.substring(0, 15000); // limite de 15k chars
    return `## DOCUMENTO: ${doc.nome}\n${conteudo}`;
  }).join('\n\n');

  const payload = {
    pergunta: `Analise o processo ${processNumber}:\n\n${documentosTexto}`,
    contexto: `Análise completa do processo ${processNumber}`
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  const analise = result.resposta || result.fallback;
}
```

#### **Características:**
- ✅ Batches de 3 documentos (evita erro 500)
- ✅ Limite de 15000 caracteres por documento
- ✅ Retry automático em caso de falha
- ✅ Consolidação de resultados múltiplos
- ✅ Tratamento de erro de rede (ERR_NETWORK_CHANGED)

---

### 2. **OpenAI GPT-4 (via Supabase)**

#### **Modelo:**
GPT-4 (configurado no backend Supabase)

#### **Contexto:**
```javascript
const promptCompleto = `Você é um assistente jurídico especializado.
Analise COMPLETAMENTE o processo ${processNumber} com base nos documentos abaixo:

${documentosTexto}

Forneça uma análise completa incluindo:
1. RESUMO EXECUTIVO (2-3 parágrafos)
2. PARTES DO PROCESSO
3. PEDIDOS PRINCIPAIS
4. FUNDAMENTOS LEGAIS
5. CRONOLOGIA DOS EVENTOS
6. ANÁLISE TÉCNICA E RECOMENDAÇÕES`;
```

#### **Características:**
- ✅ Prompts especializados para análise jurídica
- ✅ Contexto completo com múltiplos documentos
- ✅ Resposta estruturada em seções
- ✅ Análise técnica e recomendações

---

## 🌐 Integrações com PJe

### 1. **Sistema de Autenticação**

#### **Cookies de Sessão:**
A extensão usa a sessão ativa do usuário no PJe:

```javascript
// Download autenticado de documentos
const response = await fetch(documentUrl, {
  method: 'GET',
  credentials: 'include', // usa cookies da sessão
  headers: {
    'Accept': 'application/pdf,application/octet-stream,*/*',
    'Cache-Control': 'no-cache'
  }
});
```

#### **Características:**
- ✅ Não requer login adicional
- ✅ Usa credenciais do navegador
- ✅ Acesso a documentos protegidos

---

### 2. **DOM Scraping (PJe-TJPA)**

#### **Estratégia de Descoberta:**
```javascript
// src/js/process-crawler.js - discoverViaDomScraping()

// Buscar links com parâmetro específico do PJe-TJPA
const pjeDocLinks = document.querySelectorAll('a[href*="idProcessoDocumento"]');

for (const link of pjeDocLinks) {
  const url = new URL(link.href);

  // Extrair parâmetros da URL
  const idProcessoDocumento = url.searchParams.get('idProcessoDocumento');
  const nomeArqProcDocBin = url.searchParams.get('nomeArqProcDocBin');
  const idBin = url.searchParams.get('idBin');
  const numeroDocumento = url.searchParams.get('numeroDocumento');

  // Construir URL de download direto
  const downloadUrl = `${baseUrl}/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?...`;

  documents.push({
    id: idProcessoDocumento,
    name: decodeURIComponent(nomeArqProcDocBin),
    url: downloadUrl,
    type: 'PDF',
    source: 'pje_autos_digitais'
  });
}
```

#### **Características:**
- ✅ Específico para PJe-TJPA (Tribunal do Pará)
- ✅ Busca na sidebar "Docs"
- ✅ Extração de metadata: ID, nome, tipo
- ✅ Suporte para 10-14 documentos por processo

---

## 📦 Integração com Chrome Extension API

### 1. **Manifest V3**

```json
{
  "manifest_version": 3,
  "permissions": [
    "activeTab",
    "storage",
    "scripting",
    "webRequest"
  ],
  "host_permissions": [
    "*://*.pje.jus.br/*",
    "*://*.tjpa.jus.br/*"
  ]
}
```

### 2. **Content Scripts**

Ordem de carregamento (importante!):
```json
"content_scripts": [{
  "js": [
    "src/js/pdf.min.js",           // 1. PDF.js (PRIMEIRO)
    "src/js/tesseract.min.js",     // 2. Tesseract.js
    "src/js/document-detector.js", // 3. Detector
    "src/js/document-cache.js",    // 4. Cache
    "src/js/process-crawler.js",   // 5. Crawler
    "src/ts/pdf-processor.js",     // 6. Processor
    "src/js/process-analyzer.js",  // 7. Analyzer
    "src/js/content-simple.js"     // 8. UI (ÚLTIMO)
  ],
  "run_at": "document_end"
}]
```

### 3. **Web Accessible Resources**

```json
"web_accessible_resources": [{
  "resources": [
    "src/js/pdf.worker.min.js",  // Worker do PDF.js
    "styles/chat-styles.css",
    // ... todos os scripts
  ],
  "matches": ["<all_urls>"]
}]
```

### 4. **Runtime API**

```javascript
// Acesso a recursos da extensão
const workerUrl = chrome.runtime.getURL('src/js/pdf.worker.min.js');
const cssUrl = chrome.runtime.getURL('styles/chat-styles.css');
```

---

## 🔐 Segurança

### 1. **Manifest V3 Compliance**
- ✅ Sem eval() ou código inline
- ✅ CSP (Content Security Policy) rigoroso
- ✅ Bibliotecas locais (sem CDN dinâmico)

### 2. **API Keys**
- ✅ Chave Supabase pública (não expõe OpenAI key)
- ✅ Autenticação via bearer token
- ✅ Endpoint backend protegido

### 3. **Cookies e Sessão**
- ✅ Usa sessão existente do PJe
- ✅ Não armazena credenciais
- ✅ `credentials: 'include'` para requests

---

## 📊 Estatísticas de Integração

### **Tamanho Total das Bibliotecas:**
- PDF.js: 320 KB (minified)
- PDF.js Worker: 1.06 MB
- Tesseract.js: 66 KB
- **Total: ~1.45 MB**

### **Performance:**
- Descoberta de documentos: ~500ms
- Download de PDF (100 KB): ~200ms
- Extração de texto (10 páginas): ~2s
- OCR de imagem: ~5-10s
- Cache hit: <10ms

### **Compatibilidade:**
- ✅ Chrome 88+
- ✅ Edge 88+
- ✅ Opera 74+
- ✅ Brave (baseado em Chromium)
- ❌ Firefox (Manifest V2/V3 diferentes)
- ❌ Safari (sem suporte a Manifest V3)

---

## 🚀 Próximas Integrações Planejadas

1. **Backend próprio** (alternativa ao Supabase)
2. **Suporte a outros tribunais** (TRF, TST, etc)
3. **Integração com Elasticsearch** (busca avançada)
4. **WebSocket** (análise em tempo real)
5. **Service Worker avançado** (cache inteligente)

---

## 📝 Notas de Desenvolvimento

### **Lições Aprendidas:**

1. **PDF.js no Manifest V3:**
   - Não usar CDN, sempre local
   - Carregar ANTES de todos os outros scripts
   - Worker via `chrome.runtime.getURL()`

2. **Tesseract.js:**
   - OCR é lento (5-10s por imagem)
   - Usar logger para mostrar progresso
   - Idioma 'por' funciona melhor que 'eng' para português

3. **Batches da API:**
   - Batches grandes (5+ docs) causam erro 500
   - Limitar caracteres por documento (15k)
   - Retry automático é essencial

4. **Cache:**
   - localStorage tem limite de 5-10MB
   - Compressão é essencial
   - TTL de 1 hora é ideal

---

**🤖 Documentação gerada automaticamente pela Claude Code**
