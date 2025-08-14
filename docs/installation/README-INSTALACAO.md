# 🚀 Instalação da Extensão Lex.

## 📋 Pré-requisitos

1. **API Key da OpenAI**
   - Acesse: https://platform.openai.com/api-keys
   - Crie uma nova API Key
   - Copie a chave (formato: sk-proj-...)

## 🔧 Configuração

### Passo 1: Configurar API Key
1. Abra o arquivo `openai-client.js`
2. Localize a linha (aproximadamente linha 12):
   ```javascript
   this.apiKey = 'SUBSTITUA_PELA_SUA_CHAVE_OPENAI_AQUI';
   ```
3. Substitua pelo sua chave real:
   ```javascript
   this.apiKey = 'sk-proj-SUA_CHAVE_AQUI';
   ```
4. **Salve o arquivo** - isso é crucial!

### Passo 2: Instalar no Chrome
1. Abra Chrome → Extensões (chrome://extensions/)
2. Ative "Modo do desenvolvedor"
3. Clique "Carregar sem compactação"
4. Selecione a pasta do projeto

### Passo 3: Testar
1. Acesse qualquer sistema PJe
2. Procure pelo botão ▲ no canto inferior direito
3. Clique para abrir o chat
4. Digite uma pergunta

## ⚠️ Importante

- **NUNCA** faça commit da sua API Key real
- Mantenha o arquivo `openai-client.js` com placeholder no repositório
- Configure a chave apenas localmente

## 🎯 Funcionalidades

- ✅ Chat inteligente com IA
- ✅ Análise de processos
- ✅ Extração de conteúdo de documentos
- ✅ Respostas jurídicas especializadas
- ✅ Sistema de fallback

## 🔍 Debug

Para ver os logs de debug:
1. Abra o console do navegador (F12)
2. Use o chat normalmente
3. Observe os logs que começam com "LEX:"

### Comandos de Debug Avançado

Se a extensão não estiver funcionando:

```javascript
// Diagnóstico completo
debugLexChat();

// Verificar se OpenAI Client carregou
console.log('OpenAI Client:', window.openaiClient);

// Verificar configuração
window.openaiClient?.isConfigured();

// Tentar correções automáticas
corrigirProblemas();
```

### Indicadores Visuais

No cabeçalho do chat, observe o status da IA:
- 🟢 **Verde "IA ativa"**: Tudo funcionando
- 🟡 **Amarelo "IA não configurada"**: API key não configurada
- 🔴 **Vermelho "IA não carregada"**: Problema no carregamento