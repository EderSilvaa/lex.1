# 🔑 Teste da API Key - Lex

## ✅ API Key Configurada

Acabei de configurar sua API key no lugar correto (`content-simple.js`).

## 🧪 Como Testar Agora

### 1. Recarregar a Extensão
1. Vá em `chrome://extensions/`
2. Encontre "Lex."
3. Clique no botão **recarregar** (🔄)

### 2. Testar no PJe
1. Recarregue a página do PJe
2. Clique no botão ▲ da Lex
3. O chat deve abrir

### 3. Verificar Status da IA
No cabeçalho do chat, observe o status:
- 🟢 **Verde "IA ativa"** = API key funcionando
- 🟡 **Amarelo "IA não configurada"** = Ainda há problema
- 🔴 **Vermelho "IA não carregada"** = Cliente não carregou

### 4. Testar uma Pergunta
Digite no chat: **"analisar processo"**

**Se funcionar:** Você receberá uma resposta da OpenAI
**Se não funcionar:** Receberá uma resposta de fallback

## 🔍 Debug no Console

Abra o console (F12) e procure por:
```
🔑 LEX: Verificando configuração da API...
- LEX: Resultado final: true  ← Deve ser TRUE agora
```

## 🚨 Se Ainda Não Funcionar

Execute no console:
```javascript
// Verificar se a API key está configurada
console.log('API Key configurada:', window.openaiClient?.isConfigured());
console.log('API Key (primeiros 10 chars):', window.openaiClient?.apiKey?.substring(0, 10));
```

## 📋 Resultado Esperado

- ✅ Status da IA: **Verde "IA ativa"**
- ✅ Console: **"Resultado final: true"**
- ✅ Respostas inteligentes da OpenAI
- ✅ Análise real dos processos

**Teste agora e me informe se o status mudou para verde!**