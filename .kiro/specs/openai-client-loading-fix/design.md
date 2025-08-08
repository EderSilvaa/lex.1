# Design Document - OpenAI Client Loading Fix

## Overview

Este documento descreve a solução para o problema de carregamento do `openai-client.js` no Chrome. O problema principal é que o arquivo não está sendo executado corretamente, impedindo que a funcionalidade de IA esteja disponível. A solução envolve diagnosticar os problemas de carregamento, corrigir a ordem de execução dos scripts e implementar mecanismos robustos de inicialização.

## Architecture

### Current Architecture Issues
1. **Script Loading Order**: O manifest pode não estar carregando os scripts na ordem correta
2. **Timing Issues**: O `content-simple.js` pode estar tentando usar o OpenAI client antes dele estar disponível
3. **Namespace Conflicts**: Possível conflito entre diferentes implementações do cliente
4. **Error Handling**: Falta de tratamento adequado para falhas de carregamento

### Proposed Architecture
```
Chrome Extension
├── manifest.json (script loading order)
├── openai-client.js (standalone, self-contained)
├── content-simple.js (waits for OpenAI client)
└── debug tools (comprehensive diagnostics)
```

## Components and Interfaces

### 1. OpenAI Client Module
**Purpose**: Standalone module que se auto-inicializa e expõe interface global

**Interface**:
```javascript
window.openaiClient = {
  isConfigured(): boolean
  analisarDocumento(contexto, pergunta): Promise<string>
  isReady(): boolean
  getStatus(): object
}
```

**Key Features**:
- Self-contained initialization
- Robust error handling
- Status reporting
- Debug logging

### 2. Content Script Integration
**Purpose**: Aguarda o OpenAI client estar disponível antes de usar

**Key Features**:
- Polling mechanism para aguardar cliente
- Fallback gracioso quando cliente não disponível
- Timeout handling
- Status reporting

### 3. Debug and Diagnostics
**Purpose**: Ferramentas para identificar problemas de carregamento

**Key Features**:
- Script loading verification
- API key validation
- Network connectivity tests
- Timing analysis

## Data Models

### OpenAI Client Status
```javascript
{
  loaded: boolean,
  configured: boolean,
  apiKeyValid: boolean,
  lastError: string | null,
  initTime: number,
  version: string
}
```

### Debug Report
```javascript
{
  scriptsLoaded: string[],
  clientStatus: OpenAIClientStatus,
  manifestConfig: object,
  timing: {
    domReady: number,
    clientInit: number,
    contentInit: number
  }
}
```

## Error Handling

### 1. Script Loading Failures
- **Detection**: Verificar se `window.openaiClient` existe após timeout
- **Recovery**: Tentar recarregar ou usar fallback
- **User Feedback**: Mostrar status no chat

### 2. API Key Issues
- **Detection**: Validar formato e configuração da API key
- **Recovery**: Mostrar instruções de configuração
- **User Feedback**: Mensagem clara sobre configuração necessária

### 3. Network/API Failures
- **Detection**: Catch de erros em requisições
- **Recovery**: Usar respostas de fallback
- **User Feedback**: Informar sobre indisponibilidade temporária

## Testing Strategy

### 1. Unit Tests
- OpenAI client initialization
- API key validation
- Error handling scenarios

### 2. Integration Tests
- Script loading order
- Cross-script communication
- Timing scenarios

### 3. Manual Testing
- Fresh extension install
- Different Chrome versions
- Network conditions
- API key scenarios

## Implementation Plan

### Phase 1: Diagnostics
1. Enhance debug tools to identify root cause
2. Add comprehensive logging
3. Create diagnostic report function

### Phase 2: Fix Script Loading
1. Review and fix manifest.json script order
2. Implement robust initialization sequence
3. Add polling mechanism for dependencies

### Phase 3: Error Handling
1. Add comprehensive error handling
2. Implement fallback mechanisms
3. Improve user feedback

### Phase 4: Testing & Validation
1. Test in clean Chrome environment
2. Validate all scenarios
3. Performance optimization