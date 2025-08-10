# 📄 DocumentDetector - LEX Document Processing

## 🎯 Visão Geral

O `DocumentDetector` é a classe base do sistema de processamento de documentos da LEX. Ele identifica automaticamente o tipo de documento (PDF, Imagem ou HTML) e fornece métodos para baixar e processar documentos do PJe.

## 🚀 Funcionalidades

### ✅ **Detecção Automática de Tipo**
- **PDFs**: Detecta via content-type (`application/pdf`) ou extensão `.pdf`
- **Imagens**: Suporta JPG, PNG, TIFF, BMP, GIF, WebP
- **HTML**: Fallback padrão para documentos web

### ✅ **Download Autenticado**
- Mantém sessão do PJe com `credentials: 'include'`
- Suporte a diferentes tipos de resposta
- Tratamento de erros robusto

### ✅ **Cache Inteligente**
- Geração de chaves de cache únicas
- Informações de documento estruturadas
- Otimização de performance

## 📋 API Reference

### `detectDocumentType(url, contentType)`
Detecta o tipo de documento baseado na URL e content-type.

```javascript
const type = DocumentDetector.detectDocumentType(
  'https://pje.tjsp.jus.br/documento.pdf',
  'application/pdf'
);
console.log(type); // 'PDF'
```

### `getDocumentBlob(url)`
Baixa o documento como Blob mantendo autenticação.

```javascript
const blob = await DocumentDetector.getDocumentBlob(url);
console.log('Tamanho:', blob.size);
```

### `getContentType(url)`
Obtém o content-type via HEAD request.

```javascript
const contentType = await DocumentDetector.getContentType(url);
console.log('Tipo:', contentType);
```

### `extractDocumentInfo(url, contentType)`
Extrai informações completas do documento.

```javascript
const info = DocumentDetector.extractDocumentInfo(url, contentType);
console.log(info);
// {
//   url: "...",
//   type: "PDF",
//   contentType: "application/pdf",
//   filename: "documento.pdf",
//   cacheKey: "abc123...",
//   timestamp: "2024-01-01T12:00:00.000Z"
// }
```

## 🧪 Testes

### **Executar Testes**
Abra o arquivo `test-document-detector.html` no navegador para executar os testes automatizados.

### **Casos de Teste Incluídos**
- ✅ Detecção de PDFs por content-type
- ✅ Detecção de PDFs por URL
- ✅ Detecção de imagens por content-type
- ✅ Detecção de imagens por extensão
- ✅ Fallback para HTML
- ✅ Geração de cache keys
- ✅ Extração de informações

## 🔧 Integração com LEX

### **1. Carregamento Automático**
O DocumentDetector é carregado automaticamente via `manifest.json`:

```json
"js": ["document-detector.js", "openai-client.js", "content-simple.js"]
```

### **2. Uso no Content Script**
```javascript
// Detectar tipo de documento no iframe
const iframe = document.querySelector('iframe[src*="/documento/"]');
if (iframe) {
  const url = iframe.src;
  const contentType = await DocumentDetector.getContentType(url);
  const type = DocumentDetector.detectDocumentType(url, contentType);
  
  console.log('Documento detectado:', type);
}
```

### **3. Integração com Cache**
```javascript
const info = DocumentDetector.extractDocumentInfo(url, contentType);
const cacheKey = info.cacheKey;

// Verificar se já está em cache
if (cache.has(cacheKey)) {
  return cache.get(cacheKey);
}

// Processar e armazenar
const result = await processDocument(url, info.type);
cache.set(cacheKey, result);
```

## 🛡️ Tratamento de Erros

### **Erros Comuns**
- **Network Error**: Problema de conectividade
- **HTTP 403/401**: Sessão expirada no PJe
- **HTTP 404**: Documento não encontrado
- **CORS Error**: Problema de política de origem

### **Estratégias de Recuperação**
```javascript
try {
  const blob = await DocumentDetector.getDocumentBlob(url);
} catch (error) {
  if (error.message.includes('403')) {
    // Sessão expirada - solicitar login
    showLoginMessage();
  } else if (error.message.includes('404')) {
    // Documento não encontrado
    showDocumentNotFoundMessage();
  } else {
    // Erro genérico
    showGenericErrorMessage(error.message);
  }
}
```

## 📊 Performance

### **Otimizações Implementadas**
- **HEAD requests** para content-type (mais rápido que GET)
- **Range requests** como fallback (apenas 1KB)
- **Cache de chaves** para evitar reprocessamento
- **Lazy loading** - carregado apenas quando necessário

### **Métricas Esperadas**
- **Detecção de tipo**: < 1ms
- **HEAD request**: 100-500ms
- **Download de documento**: Varia com tamanho
- **Geração de cache key**: < 1ms

## 🔄 Próximos Passos

### **Fase 2: PDF Processor**
- Integração com PDF.js
- Extração de texto de PDFs
- Processamento de metadados

### **Fase 3: OCR Processor**
- Integração com Tesseract.js
- Reconhecimento de texto em imagens
- Pré-processamento de imagens

### **Fase 4: Enhanced Extractor**
- Orquestrador principal
- Cache avançado
- Processamento paralelo

## 🐛 Debug

### **Logs Disponíveis**
```javascript
// Ativar logs detalhados
console.log('🔍 LEX: Detectando tipo de documento');
console.log('📥 LEX: Baixando documento:', url);
console.log('✅ LEX: Documento baixado com sucesso');
```

### **Ferramentas de Debug**
- Console do navegador
- Network tab (DevTools)
- Página de testes (`test-document-detector.html`)

## 📝 Changelog

### **v1.0.0** (Atual)
- ✅ Detecção automática de tipos
- ✅ Download autenticado
- ✅ Geração de cache keys
- ✅ Extração de informações
- ✅ Testes automatizados
- ✅ Integração com manifest.json