# 🧪 Guia de Teste - OpenAI Client Loading Fix

## 📋 Pré-requisitos para Teste

1. **API Key da OpenAI configurada** no arquivo `openai-client.js`
2. **Chrome com extensão carregada** em modo desenvolvedor
3. **Console do navegador aberto** (F12) para ver logs

## 🔍 Testes de Diagnóstico

### Teste 1: Verificar Carregamento dos Scripts

1. Abra a página `teste-pje.html` no navegador
2. Abra o console (F12)
3. Aguarde 3 segundos e verifique os logs
4. Execute: `debugLexChat()`

**Resultado esperado:**
```
✅ LEX: OpenAI Client carregado
✅ API Key configurada
✅ Botão da extensão encontrado
```

### Teste 2: Verificar OpenAI Client

1. No console, execute: `window.openaiClient`
2. Verifique se retorna um objeto (não `undefined`)
3. Execute: `window.openaiClient.isConfigured()`
4. Execute: `window.openaiClient.getStatus()`

**Resultado esperado:**
```javascript
// window.openaiClient deve retornar um objeto OpenAIClient
// isConfigured() deve retornar true se API key estiver configurada
// getStatus() deve mostrar status detalhado
```

### Teste 3: Testar Funcionalidade do Chat

1. Clique no botão ▲ da extensão
2. Verifique se o chat abre
3. Observe o status da IA no cabeçalho:
   - 🟢 Verde: "IA ativa" (API key configurada)
   - 🟡 Amarelo: "IA não configurada" (API key placeholder)
   - 🔴 Vermelho: "IA não carregada" (cliente não carregou)

### Teste 4: Testar Respostas

1. No chat, digite: "analisar processo"
2. Aguarde a resposta
3. Verifique no console se há logs da OpenAI ou fallback

**Com IA configurada:**
```
🤖 LEX: Iniciando análise com IA integrada
📤 LEX: Enviando requisição para OpenAI...
✅ LEX: Resposta da OpenAI recebida
```

**Sem IA configurada:**
```
⚠️ Cliente OpenAI não configurado, usando fallback
```

## 🔧 Solução de Problemas

### Problema: OpenAI Client não carrega

**Diagnóstico:**
```javascript
// No console
console.log('Cliente existe:', !!window.openaiClient);
console.log('Scripts carregados:', document.querySelectorAll('script[src*="openai"]'));
```

**Soluções:**
1. Recarregar a extensão no Chrome
2. Verificar se não há erros JavaScript no console
3. Executar `corrigirProblemas()` no console

### Problema: API Key não configurada

**Diagnóstico:**
```javascript
window.openaiClient.apiKey === 'SUBSTITUA_PELA_SUA_CHAVE_OPENAI_AQUI'
```

**Solução:**
1. Editar `openai-client.js`
2. Substituir placeholder pela API key real
3. Recarregar extensão

### Problema: Botão não aparece

**Diagnóstico:**
```javascript
document.querySelector('.lex-button')
```

**Solução:**
1. Executar `corrigirProblemas()` no console
2. Verificar se `window.lexAssistantActive` é `true`

## ✅ Checklist de Validação

- [ ] Scripts carregam na ordem correta (openai-client.js primeiro)
- [ ] `window.openaiClient` está disponível
- [ ] API key está configurada (se aplicável)
- [ ] Botão da extensão aparece na página
- [ ] Chat abre ao clicar no botão
- [ ] Status da IA é exibido corretamente no cabeçalho
- [ ] Respostas funcionam (IA ou fallback)
- [ ] Logs de debug são informativos
- [ ] Funções de diagnóstico funcionam

## 🚀 Teste de Produção

Para testar em um sistema PJe real:

1. Acesse qualquer página do PJe (ex: pje.tjsp.jus.br)
2. Verifique se o botão ▲ aparece
3. Teste o chat com perguntas reais
4. Monitore logs no console

## 📞 Debug Avançado

Se ainda houver problemas, execute no console:

```javascript
// Diagnóstico completo
debugLexChat();

// Teste específico do OpenAI
testarOpenAIClient();

// Verificar scripts
verificarScriptsCarregados();

// Tentar correções
corrigirProblemas();
```