# 📄 Teste de Extração de Documentos - Lex

## ✅ Funcionalidade Restaurada

Acabei de adicionar de volta a funcionalidade de extração de conteúdo dos documentos via iframe.

## 🧪 Como Testar

### 1. Recarregar a Extensão
1. Vá em `chrome://extensions/`
2. Recarregue a extensão Lex
3. Recarregue a página do PJe

### 2. Abrir um Documento
1. No PJe, clique em qualquer documento para visualizá-lo
2. Certifique-se de que o documento está sendo exibido em um iframe/embed

### 3. Testar a Extração
1. Abra o console (F12)
2. Clique no botão ▲ da Lex
3. Digite: **"analisar documento"** ou **"documento atual"**

### 4. Verificar os Logs
No console, você deve ver:
```
📄 LEX: Iniciando extração de conteúdo do documento
🔗 URL do documento encontrada: [URL]
🌐 Fazendo requisição autenticada para o documento...
📋 Tipo de conteúdo: [tipo]
✅ Conteúdo HTML/texto extraído: [primeiros 200 chars]...
✅ Conteúdo do documento extraído com sucesso
📊 Tamanho do conteúdo: [X] caracteres
```

## 🎯 Resultado Esperado

A IA agora deve:
- ✅ **Detectar o documento** sendo visualizado
- ✅ **Extrair o conteúdo** do iframe/embed
- ✅ **Incluir o texto** na análise
- ✅ **Responder com base** no conteúdo real do documento

## 🔍 Teste Específico

Digite no chat: **"resuma este documento"**

A Lex deve agora conseguir:
- Ler o conteúdo real do documento
- Fazer um resumo baseado no texto extraído
- Citar trechos específicos do documento

## 🚨 Se Não Funcionar

Execute no console:
```javascript
// Verificar se há iframes de documento
console.log('Iframes encontrados:', document.querySelectorAll('iframe, embed'));

// Testar extração manualmente
extrairConteudoDocumento().then(resultado => {
    console.log('Resultado da extração:', resultado);
});
```

## 📋 Tipos de Documento Suportados

- ✅ **HTML/XHTML** - Extração completa de texto
- ✅ **Texto simples** - Conteúdo direto
- ⚠️ **PDF** - Detectado mas não extraível via JavaScript
- ❌ **Outros formatos** - Detectados mas não processados

**Teste agora com um documento aberto e me informe se a IA consegue analisar o conteúdo real!**