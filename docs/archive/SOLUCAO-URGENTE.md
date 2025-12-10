# Solução Urgente - LEX Não Carregado

## Problema Identificado

A extensão LEX **NÃO ESTÁ CARREGADA** na página atual do PJe.

**Evidências**:
```
window.DocumentCache: undefined
window.SessionContext: undefined
window.ProcessAnalyzer: undefined
window.lexSession: undefined
```

## Causa Provável

1. **Extensão desabilitada ou não instalada corretamente**
2. **URL da página não corresponde aos matches do manifest.json**
3. **Erro ao carregar os scripts da extensão**

## Solução Passo a Passo

### 1. Verificar se Extensão Está Instalada e Ativa

1. Abra: `chrome://extensions`
2. Procure por **Lex.**
3. Verifique se o toggle está **AZUL (ativo)**
4. Se estiver cinza, clique para ativar

### 2. Verificar Erros de Carregamento

1. Ainda em `chrome://extensions`
2. Na extensão Lex, clique em **"Erros"**
3. Se houver erros em vermelho, copie e me envie

### 3. Verificar URL da Página

1. Qual é a URL completa da página do PJe que você está?
2. Deve ser algo como: `https://pje.tjpa.jus.br/...`

Execute este comando no console para verificar:
```javascript
console.log('URL atual:', window.location.href);
console.log('Match PJe?', /\.pje\.jus\.br|\.tjpa\.jus\.br/.test(window.location.href));
```

### 4. Recarregar a Extensão

1. Em `chrome://extensions`
2. Clique no botão **🔄 Recarregar** da extensão Lex
3. **IMPORTANTE**: Aguarde até ver "Service worker (ativo)"

### 5. Recarregar a Página do PJe

1. Volte para a aba do PJe
2. Pressione **Ctrl+Shift+R** (reload forçado, limpa cache)
3. Aguarde a página carregar completamente

### 6. Verificar se Carregou

Execute no console:
```javascript
console.log('DocumentCache:', typeof window.DocumentCache);
console.log('SessionContext:', typeof window.SessionContext);
console.log('lexSession:', typeof window.lexSession);

// Deve mostrar:
// DocumentCache: function
// SessionContext: function
// lexSession: object (ou undefined se não tem sessão ativa)
```

### 7. Limpar Cache Corrompido

O cache atual está corrompido (dados comprimidos incorretamente). Limpe:

```javascript
// Limpar TUDO do LEX
for (let i = localStorage.length - 1; i >= 0; i--) {
  const key = localStorage.key(i);
  if (key?.startsWith('lex_')) {
    localStorage.removeItem(key);
    console.log('Removido:', key);
  }
}

console.log('✅ Cache limpo. Recarregue a página (Ctrl+Shift+R)');
```

## Verificação da Instalação

### Método 1: Via DevTools

1. Abra DevTools (F12)
2. Vá na aba **Sources**
3. Expanda **Content Scripts**
4. Deve ver: `lex-init.js`, `document-cache.js`, `session-context.js`, etc.

Se **NÃO** aparecer nada em Content Scripts, a extensão não foi injetada!

### Método 2: Via Manifest

Verifique se a URL do PJe está nos matches do manifest:

```javascript
// Execute no console da página de extensões (chrome://extensions)
// com Developer Mode ativo
```

A URL deve corresponder a um destes padrões:
- `*://*.pje.jus.br/*`
- `*://*.tjpa.jus.br/*`
- `*://*.tjsp.jus.br/*`
- etc.

## Se Nada Funcionar

### Reinstalar a Extensão

1. `chrome://extensions`
2. **Remover** a extensão Lex
3. Recarregar a pasta da extensão:
   - Clique em **"Carregar sem compactação"**
   - Selecione a pasta: `c:\Users\EDER\lex-test1`
4. Verifique se apareceu sem erros
5. Recarregue a página do PJe

## Debugging Avançado

Se ainda não funcionar, execute este diagnóstico:

```javascript
// 1. Verificar se é uma página válida do PJe
console.log('URL:', location.href);
console.log('Domain:', location.hostname);
console.log('É PJe?', location.hostname.includes('pje') || location.hostname.includes('tj'));

// 2. Verificar se há content scripts carregados
console.log('Scripts:', document.querySelectorAll('script[src*="chrome-extension"]').length);

// 3. Verificar console por erros
// Procure por linhas em vermelho que mencionem "lex" ou "chrome-extension"

// 4. Verificar permissões
navigator.permissions.query({name: 'storage'}).then(result => {
  console.log('Permissão storage:', result.state);
});
```

## Resultado Esperado

Após seguir os passos, você deve ver:

```
✅ window.DocumentCache: function
✅ window.SessionContext: function
✅ window.ProcessAnalyzer: function
✅ window.lexSession: object (após processar documentos)
```

## Me Envie

Se ainda não funcionar, me envie:

1. **URL completa da página** (pode omitir números de processo)
2. **Screenshot de `chrome://extensions`** mostrando a extensão Lex
3. **Erros da extensão** (botão "Erros" em chrome://extensions)
4. **Console do DevTools** (screenshot de erros em vermelho)
5. **Resultado do diagnóstico de URL** (primeiro bloco de código acima)
