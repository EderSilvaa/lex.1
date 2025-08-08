# 🔧 Troubleshooting - Extensão Lex não aparece

## 🚨 Problema: Extensão não aparece na tela

### ✅ Verificações Básicas

1. **Extensão instalada no Chrome?**
   - Vá em `chrome://extensions/`
   - Procure por "Lex."
   - Verifique se está ativada

2. **Modo desenvolvedor ativado?**
   - Em `chrome://extensions/`
   - Ative "Modo do desenvolvedor" no canto superior direito

3. **Página compatível?**
   - A extensão funciona em páginas PJe ou no arquivo `teste-simples.html`
   - URLs suportadas: `*.pje.jus.br`, `*.tjsp.jus.br`, `localhost`, `file://`

### 🔍 Diagnóstico Rápido

1. **Abra o arquivo `teste-simples.html`** no navegador
2. **Abra o console** (F12)
3. **Procure por logs** que começam com "LEX:"
4. **Procure pelos botões:**
   - Botão ▲ no canto inferior direito
   - Botão vermelho "LEX CHAT" no canto superior direito

### 🛠️ Soluções por Problema

#### ❌ Nenhum log "LEX:" no console

**Causa:** Scripts não estão carregando

**Solução:**
1. Recarregue a extensão em `chrome://extensions/`
2. Clique no ícone de "recarregar" da extensão
3. Recarregue a página

#### ❌ Logs aparecem mas botão não

**Causa:** Erro na criação do botão

**Solução:**
1. No console, execute: `document.body`
2. Se retornar `null`, aguarde a página carregar completamente
3. Execute: `criarBotaoEmergencia()` (se a função existir)

#### ❌ Botão aparece mas não funciona

**Causa:** Erro no JavaScript

**Solução:**
1. No console, execute: `debugLexChat()`
2. Verifique se há erros em vermelho no console
3. Execute: `window.openaiClient` para verificar se existe

### 🔧 Comandos de Debug

Execute no console do navegador:

```javascript
// Verificar se extensão carregou
console.log('Extensão ativa:', window.lexAssistantActive);

// Verificar OpenAI Client
console.log('OpenAI Client:', window.openaiClient);

// Verificar botões
console.log('Botão principal:', document.querySelector('.lex-button'));
console.log('Botão emergência:', document.getElementById('lex-emergency-button'));

// Diagnóstico completo
if (typeof debugLexChat === 'function') {
    debugLexChat();
} else {
    console.log('Função debugLexChat não encontrada');
}

// Forçar criação de botão de emergência
const btn = document.createElement('div');
btn.innerHTML = '🆘 LEX';
btn.style.cssText = 'position:fixed;top:10px;right:10px;background:red;color:white;padding:10px;cursor:pointer;z-index:999999;';
btn.onclick = () => alert('Botão de emergência funcionando!');
document.body.appendChild(btn);
```

### 🔄 Reset Completo

Se nada funcionar:

1. **Remova a extensão** completamente
2. **Feche o Chrome**
3. **Reabra o Chrome**
4. **Reinstale a extensão**
5. **Teste no arquivo `teste-simples.html`**

### 📞 Informações para Suporte

Se o problema persistir, colete estas informações:

1. **Versão do Chrome:** `chrome://version/`
2. **Sistema operacional**
3. **URL onde testou**
4. **Logs do console** (copie tudo que aparece)
5. **Screenshot da aba Extensions**

### 🎯 Teste de Funcionamento

Para confirmar que está funcionando:

1. Abra `teste-simples.html`
2. Deve aparecer pelo menos um dos botões:
   - ▲ (canto inferior direito)
   - 🔺 LEX CHAT (canto superior direito)
3. Clique no botão
4. Deve abrir o chat da Lex
5. Digite "teste" e pressione Enter
6. Deve receber uma resposta

### 🚀 Próximos Passos

Quando a extensão estiver funcionando:

1. Configure sua API key no `openai-client.js`
2. Teste em uma página PJe real
3. Use os comandos de debug para monitorar o funcionamento