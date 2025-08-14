# 🛡️ Guia de Tratamento de Erros - PDFProcessor

## 🎯 Visão Geral

O PDFProcessor implementa um sistema robusto de tratamento de erros com múltiplas estratégias de recuperação, validação prévia e fallbacks inteligentes para garantir que a LEX funcione mesmo com PDFs problemáticos.

## 🚨 Tipos de Erros

### **Erros de Validação**
- **`INVALID_PDF_SIGNATURE`**: Arquivo não é um PDF válido
- **`FILE_TOO_LARGE`**: Arquivo excede limite de tamanho
- **`EMPTY_FILE`**: Arquivo vazio ou blob inválido
- **`PASSWORD_PROTECTED`**: PDF protegido por senha
- **`CORRUPTED_PDF`**: PDF corrompido ou danificado

### **Erros de Processamento**
- **`EXTRACTION_TIMEOUT`**: Processamento excedeu tempo limite
- **`OUT_OF_MEMORY`**: Memória insuficiente
- **`EXTRACTION_ERROR`**: Erro genérico na extração
- **`PAGE_RECOVERY_FAILED`**: Falha na recuperação de páginas

### **Erros de Sistema**
- **`VALIDATION_ERROR`**: Erro durante validação
- **`UNKNOWN_ERROR`**: Erro não classificado

## 🔧 Métodos de Tratamento de Erros

### `extractTextWithErrorHandling()`
Método principal com tratamento robusto de erros.

```javascript
const result = await processor.extractTextWithErrorHandling(pdfBlob, {
  timeout: 30000,        // Timeout em ms
  maxRetries: 2,         // Número de tentativas
  retryDelay: 1000,      // Delay entre tentativas
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxPages: 100,         // Limite de páginas
  fallbackOnError: true  // Usar fallback se falhar
});
```

### `validatePDFForExtraction()`
Validação prévia antes do processamento.

```javascript
const validation = await processor.validatePDFForExtraction(pdfBlob, {
  maxFileSize: 50 * 1024 * 1024,
  maxPages: 100
});

if (!validation.valid) {
  console.error('PDF inválido:', validation.error);
  console.error('Código:', validation.code);
}
```

### `extractTextWithPageRecovery()`
Recuperação de páginas individuais em caso de erro.

```javascript
const result = await processor.extractTextWithPageRecovery(pdfBlob, {
  maxPages: 50,
  includeErrorPlaceholders: true
});

console.log(`Sucesso: ${result.stats.successfulPages}/${result.stats.requestedPages}`);
console.log(`Taxa de sucesso: ${result.stats.successRate}%`);
```

## 🔄 Estratégias de Fallback

### **1. Primeira Página Apenas**
Se o processamento completo falhar, tenta extrair apenas a primeira página.

```javascript
// Resultado com fallback
{
  text: "Texto da primeira página...",
  fallback: true,
  fallbackStrategy: "first_page_only",
  originalError: "Erro original...",
  warning: "Apenas primeira página foi extraída..."
}
```

### **2. Metadados Apenas**
Se não conseguir extrair texto, retorna informações do documento.

```javascript
// Resultado com metadados
{
  text: "[Não foi possível extrair texto]\n\nInformações:\n- Páginas: 10\n- Título: Documento...",
  fallback: true,
  fallbackStrategy: "metadata_only",
  metadata: { title: "...", author: "..." }
}
```

### **3. Mensagem de Erro**
Último recurso quando todos os fallbacks falham.

```javascript
// Resultado de erro
{
  text: "[Erro: Não foi possível processar o PDF]",
  fallback: true,
  fallbackStrategy: "error_message",
  success: false,
  error: true
}
```

## 🔁 Sistema de Retry

### **Configuração de Retry**
```javascript
const options = {
  maxRetries: 3,         // Máximo 3 tentativas
  retryDelay: 2000,      // 2 segundos entre tentativas
  fallbackOnError: true  // Usar fallback se todas falharem
};
```

### **Erros Não Recuperáveis**
Alguns erros não são tentados novamente:
- PDF protegido por senha
- Arquivo muito grande
- PDF corrompido
- Assinatura inválida
- Memória insuficiente

## 🧪 Classe PDFProcessingError

### **Criação de Erro**
```javascript
throw new PDFProcessingError(
  'PDF protegido por senha',
  'PASSWORD_PROTECTED',
  { needsPassword: true }
);
```

### **Métodos Úteis**
```javascript
const error = new PDFProcessingError('Mensagem', 'CODE', {});

// Verificar se pode tentar novamente
if (error.isRetryable()) {
  console.log('Pode tentar novamente');
}

// Mensagem amigável para usuário
const friendlyMessage = error.getUserFriendlyMessage();

// Converter para JSON
const errorData = error.toJSON();
```

## 📊 Monitoramento de Memória

### **Verificar Memória Disponível**
```javascript
const memInfo = processor.getMemoryInfo();

if (memInfo.available) {
  console.log('Memória usada:', memInfo.used);
  console.log('Limite:', memInfo.limit);
  console.log('Uso:', memInfo.usagePercentage + '%');
}
```

### **Validar Capacidade**
```javascript
const fileSize = 25 * 1024 * 1024; // 25MB
const hasEnough = processor.hasEnoughMemory(fileSize);

if (!hasEnough) {
  throw new PDFProcessingError(
    'Memória insuficiente',
    'OUT_OF_MEMORY',
    { required: fileSize }
  );
}
```

## 🔧 Implementação Prática

### **Exemplo Completo**
```javascript
async function processarPDFComTratamentoDeErros(pdfBlob) {
  const processor = new PDFProcessor();
  await processor.initialize();
  
  try {
    // Validação prévia
    const validation = await processor.validatePDFForExtraction(pdfBlob);
    
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        code: validation.code,
        userMessage: getErrorMessage(validation.code)
      };
    }
    
    // Extração com tratamento robusto
    const result = await processor.extractTextWithErrorHandling(pdfBlob, {
      timeout: 30000,
      maxRetries: 2,
      fallbackOnError: true,
      progressCallback: (progress) => {
        console.log(`Progresso: ${Math.round(progress.progress)}%`);
      }
    });
    
    return {
      success: true,
      text: result.text,
      fallback: result.fallback || false,
      stats: result.stats
    };
    
  } catch (error) {
    if (error instanceof PDFProcessingError) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        userMessage: error.getUserFriendlyMessage(),
        retryable: error.isRetryable()
      };
    }
    
    return {
      success: false,
      error: error.message,
      code: 'UNKNOWN_ERROR',
      userMessage: 'Erro inesperado ao processar PDF'
    };
  }
}

function getErrorMessage(code) {
  const messages = {
    'PASSWORD_PROTECTED': 'Este PDF está protegido por senha.',
    'FILE_TOO_LARGE': 'O arquivo é muito grande para ser processado.',
    'CORRUPTED_PDF': 'O PDF está corrompido ou danificado.',
    'INVALID_PDF_SIGNATURE': 'O arquivo não é um PDF válido.'
  };
  
  return messages[code] || 'Erro ao processar PDF.';
}
```

### **Integração com Interface**
```javascript
async function mostrarResultadoParaUsuario(pdfBlob) {
  const resultado = await processarPDFComTratamentoDeErros(pdfBlob);
  
  if (resultado.success) {
    if (resultado.fallback) {
      mostrarAviso('PDF processado com limitações: ' + resultado.stats.warning);
    } else {
      mostrarSucesso('PDF processado com sucesso!');
    }
    
    exibirTexto(resultado.text);
    
  } else {
    mostrarErro(resultado.userMessage);
    
    if (resultado.retryable) {
      mostrarBotaoTentarNovamente();
    }
  }
}
```

## 📋 Checklist de Tratamento de Erros

### **Antes do Processamento**
- [ ] Validar se é um PDF válido
- [ ] Verificar tamanho do arquivo
- [ ] Confirmar memória disponível
- [ ] Detectar proteção por senha

### **Durante o Processamento**
- [ ] Configurar timeout apropriado
- [ ] Implementar progress callback
- [ ] Monitorar uso de memória
- [ ] Tratar erros de página individual

### **Após Erro**
- [ ] Classificar tipo de erro
- [ ] Decidir se deve tentar novamente
- [ ] Aplicar estratégia de fallback
- [ ] Fornecer feedback ao usuário

### **Logging e Debug**
- [ ] Registrar todos os erros
- [ ] Incluir contexto suficiente
- [ ] Manter stack traces
- [ ] Facilitar troubleshooting

## 🚨 Casos Especiais

### **PDFs Muito Grandes**
```javascript
// Processar em lotes menores
const result = await processor.extractTextWithPageRecovery(pdfBlob, {
  maxPages: 20, // Processar apenas 20 páginas por vez
  includeErrorPlaceholders: false
});
```

### **PDFs Corrompidos**
```javascript
// Tentar recuperar páginas individuais
const result = await processor.extractTextWithPageRecovery(pdfBlob, {
  skipCorruptedPages: true,
  includeErrorPlaceholders: true
});
```

### **Timeout em PDFs Complexos**
```javascript
// Aumentar timeout para PDFs complexos
const result = await processor.extractTextWithErrorHandling(pdfBlob, {
  timeout: 60000, // 1 minuto
  maxRetries: 1   // Menos tentativas para economizar tempo
});
```

## 📊 Métricas de Erro

### **Monitoramento**
- Taxa de sucesso por tipo de PDF
- Tempo médio de processamento
- Frequência de cada tipo de erro
- Eficácia das estratégias de fallback

### **Alertas**
- Taxa de erro acima de 10%
- Uso de memória acima de 80%
- Timeouts frequentes
- Muitos PDFs corrompidos

Este sistema garante que a LEX seja robusta e confiável mesmo com PDFs problemáticos! 🛡️