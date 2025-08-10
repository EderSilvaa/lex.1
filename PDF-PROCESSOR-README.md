# 📄 PDFProcessor - LEX PDF Processing Foundation

## 🎯 Visão Geral

O `PDFProcessor` é a classe responsável por processar documentos PDF na extensão LEX. Utiliza a biblioteca PDF.js para extrair texto, metadados e informações de documentos PDF de forma local no browser, sem necessidade de APIs externas.

## 🚀 Funcionalidades Implementadas

### ✅ **Inicialização Automática**
- **Carregamento via CDN**: PDF.js v3.11.174 do cdnjs.cloudflare.com
- **Configuração de Worker**: Worker configurado automaticamente
- **Inicialização única**: Evita múltiplos carregamentos
- **Timeout de segurança**: 30 segundos para carregamento

### ✅ **Validação de PDFs**
- **Verificação de assinatura**: Valida header `%PDF`
- **Teste de carregamento**: Confirma que PDF.js consegue processar
- **Contagem de páginas**: Verifica se PDF tem conteúdo válido
- **Detecção de corrupção**: Identifica arquivos danificados

### ✅ **Detecção de Proteção**
- **Senha detectada**: Identifica PDFs protegidos por senha
- **PasswordException**: Captura exceções específicas do PDF.js
- **Tratamento gracioso**: Não trava em PDFs protegidos

### ✅ **Extração de Metadados**
- **Informações básicas**: Páginas, tamanho, fingerprint
- **Metadados completos**: Título, autor, criador, datas
- **Versão PDF**: Detecta versão do formato PDF
- **Status de criptografia**: Identifica se está criptografado

## 📋 API Reference

### `initialize()`
Inicializa o PDF.js carregando a biblioteca e configurando o worker.

```javascript
const processor = new PDFProcessor();
await processor.initialize();
console.log('PDF.js pronto para uso');
```

### `isReady()`
Verifica se o processador está pronto para uso.

```javascript
if (processor.isReady()) {
  console.log('Pode processar PDFs');
} else {
  await processor.initialize();
}
```

### `validatePDF(pdfBlob)`
Valida se um blob é um PDF válido.

```javascript
const isValid = await processor.validatePDF(pdfBlob);
if (isValid) {
  console.log('PDF válido para processamento');
}
```

### `isPasswordProtected(pdfBlob)`
Verifica se o PDF está protegido por senha.

```javascript
const isProtected = await processor.isPasswordProtected(pdfBlob);
if (isProtected) {
  console.log('PDF requer senha');
}
```

### `getPDFInfo(pdfBlob)`
Extrai informações completas do PDF.

```javascript
const info = await processor.getPDFInfo(pdfBlob);
console.log('Páginas:', info.numPages);
console.log('Título:', info.metadata.title);
console.log('Tamanho:', info.fileSizeFormatted);
```

### `getStatus()`
Obtém status atual do processador.

```javascript
const status = processor.getStatus();
console.log('Inicializado:', status.initialized);
console.log('Pronto:', status.ready);
console.log('Versão:', status.version);
```

## 🧪 Testes

### **Executar Testes**
Abra o arquivo `test-pdf-processor.html` no navegador para executar os testes interativos.

### **Casos de Teste Incluídos**
- ✅ **Inicialização**: Carregamento e configuração do PDF.js
- ✅ **Múltiplas inicializações**: Evita conflitos
- ✅ **Configuração de worker**: Valida funcionamento
- ✅ **Validação de PDFs**: Testa com arquivos reais
- ✅ **Detecção de senha**: Identifica PDFs protegidos
- ✅ **Extração de metadados**: Informações completas
- ✅ **PDFs online**: Teste com URLs remotas
- ✅ **Performance**: Medição de tempos
- ✅ **Uso de memória**: Monitoramento de recursos

### **Testes Automatizados**
```javascript
// Teste básico de inicialização
async function testBasicInitialization() {
  const processor = new PDFProcessor();
  await processor.initialize();
  assert(processor.isReady(), 'Processador deve estar pronto');
}

// Teste de validação
async function testPDFValidation() {
  const processor = new PDFProcessor();
  await processor.initialize();
  
  const validPDF = await fetch('sample.pdf').then(r => r.blob());
  const isValid = await processor.validatePDF(validPDF);
  assert(isValid, 'PDF válido deve ser reconhecido');
}
```

## 🔧 Integração com LEX

### **1. Carregamento Automático**
```json
// manifest.json
"js": ["document-detector.js", "pdf-processor.js", "openai-client.js", "content-simple.js"]
```

### **2. Uso no Content Script**
```javascript
// Detectar e processar PDF
const iframe = document.querySelector('iframe[src*="/documento/"]');
if (iframe) {
  const url = iframe.src;
  const type = DocumentDetector.detectDocumentType(url, '');
  
  if (type === 'PDF') {
    const processor = new PDFProcessor();
    await processor.initialize();
    
    const blob = await DocumentDetector.getDocumentBlob(url);
    const info = await processor.getPDFInfo(blob);
    
    console.log('PDF processado:', info);
  }
}
```

### **3. Integração com Cache**
```javascript
// Usar com sistema de cache
const cacheKey = DocumentDetector.generateCacheKey(url);
if (!cache.has(cacheKey)) {
  const processor = new PDFProcessor();
  await processor.initialize();
  
  const blob = await DocumentDetector.getDocumentBlob(url);
  const info = await processor.getPDFInfo(blob);
  
  cache.set(cacheKey, info);
}
```

## 🛡️ Tratamento de Erros

### **Erros de Inicialização**
```javascript
try {
  await processor.initialize();
} catch (error) {
  if (error.message.includes('Timeout')) {
    // CDN indisponível ou conexão lenta
    showNetworkError();
  } else if (error.message.includes('PDF.js')) {
    // Problema com a biblioteca
    showLibraryError();
  }
}
```

### **Erros de Processamento**
```javascript
try {
  const info = await processor.getPDFInfo(pdfBlob);
} catch (error) {
  if (error.message.includes('PasswordException')) {
    // PDF protegido por senha
    showPasswordRequiredMessage();
  } else if (error.message.includes('Invalid PDF')) {
    // Arquivo corrompido
    showCorruptedFileMessage();
  } else {
    // Erro genérico
    showGenericError(error.message);
  }
}
```

### **Estratégias de Recuperação**
- **Timeout de CDN**: Tentar CDN alternativo
- **PDF corrompido**: Informar usuário e sugerir redownload
- **Senha requerida**: Solicitar senha ou informar limitação
- **Memória insuficiente**: Sugerir arquivo menor

## 📊 Performance

### **Métricas Esperadas**
- **Inicialização**: 1-5 segundos (primeira vez)
- **Inicializações subsequentes**: < 100ms
- **Validação de PDF**: 50-200ms
- **Extração de metadados**: 100-500ms
- **Uso de memória**: ~10-50MB (dependendo do PDF)

### **Otimizações Implementadas**
- **Carregamento único**: PDF.js carregado apenas uma vez
- **Worker reutilizado**: Mesmo worker para múltiplos PDFs
- **Lazy loading**: Biblioteca carregada sob demanda
- **Cache de status**: Evita verificações desnecessárias

## 🔄 Próximos Passos

### **Fase 2.2: Extração de Texto**
- Implementar `extractTextFromPDF()`
- Processar múltiplas páginas
- Otimizar para documentos grandes
- Adicionar progress callbacks

### **Fase 2.3: Tratamento de Erros Avançado**
- Recuperação de PDFs parcialmente corrompidos
- Suporte a PDFs com senha (input do usuário)
- Timeout configurável
- Retry automático

## 🐛 Debug e Troubleshooting

### **Logs Disponíveis**
```javascript
console.log('📄 LEX: PDFProcessor instanciado');
console.log('🔧 LEX: Inicializando PDF.js...');
console.log('✅ LEX: PDF.js inicializado com sucesso');
console.log('📊 LEX: Obtendo informações do PDF...');
```

### **Ferramentas de Debug**
- **Status em tempo real**: `getStatus()` e `getStats()`
- **Página de testes**: Interface visual completa
- **Console logs**: Rastreamento detalhado
- **Performance timing**: Medição de operações

### **Problemas Comuns**
1. **CDN bloqueado**: Verificar CSP e firewall
2. **Worker não carrega**: Verificar CORS e CSP
3. **PDF não processa**: Verificar se é PDF válido
4. **Memória insuficiente**: Arquivo muito grande

## 📝 Changelog

### **v1.0.0** (Atual)
- ✅ Inicialização com PDF.js v3.11.174
- ✅ Configuração automática de worker
- ✅ Validação de PDFs
- ✅ Detecção de proteção por senha
- ✅ Extração de metadados completos
- ✅ Sistema de testes interativo
- ✅ Tratamento robusto de erros
- ✅ Integração com manifest.json
- ✅ Documentação completa