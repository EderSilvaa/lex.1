# Instruções para Teste das Correções

## Correções Aplicadas

Foram corrigidos dois problemas críticos que causavam respostas vazias da IA:

1. **Incompatibilidade de estrutura de dados** entre `process-analyzer.js` (usava `content`) e `session-context.js` (esperava `texto`)
2. **Cache não re-inicializado** após restauração da sessão
3. **Fallback para cache** quando texto não está em memória

## Como Testar

### Passo 1: Recarregar a Extensão

1. Abra `chrome://extensions` no Chrome
2. Localize a extensão **Lex.**
3. Clique no botão **🔄 Recarregar** (ícone de reload)
4. Aguarde a confirmação

### Passo 2: Limpar Dados Antigos (Recomendado)

Os documentos já processados foram salvos com a estrutura antiga (sem texto). É recomendado limpar e reprocessar:

```javascript
// Cole no console do navegador na página do PJe:

// Limpar cache antigo
for (let i = localStorage.length - 1; i >= 0; i--) {
  const key = localStorage.key(i);
  if (key?.startsWith('lex_doc_cache_') || key === 'lex_session') {
    localStorage.removeItem(key);
  }
}

console.log('✅ Cache e sessão limpos. Recarregue a página.');
```

### Passo 3: Recarregar a Página

1. Pressione **F5** para recarregar a página do PJe
2. Aguarde a página carregar completamente

### Passo 4: Processar Documentos

1. Abra um processo no PJe
2. Use o LEX para processar os documentos do processo
3. Aguarde todos os documentos serem baixados e processados

### Passo 5: Verificar se Texto Foi Salvo

Cole este código no console para verificar:

```javascript
// Verificar se documentos têm texto
const savedSession = localStorage.getItem('lex_session');
if (savedSession) {
  const session = JSON.parse(savedSession);
  console.log('📄 Documentos na sessão:', session.processedDocuments?.length || 0);

  if (session.processedDocuments?.length > 0) {
    const doc = session.processedDocuments[0];
    console.log('\n🔍 Verificando primeiro documento:');
    console.log('Nome:', doc.name);
    console.log('Tem texto?', !!doc.data?.texto);
    console.log('Tamanho do texto:', doc.data?.texto?.length || 0, 'caracteres');

    if (doc.data?.texto) {
      console.log('✅ SUCESSO! Texto foi salvo corretamente');
      console.log('Preview:', doc.data.texto.substring(0, 100) + '...');
    } else {
      console.log('❌ PROBLEMA: Texto não foi salvo');
    }
  }
}

// Verificar cache
const cacheKeys = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key?.startsWith('lex_doc_cache_')) {
    cacheKeys.push(key);
  }
}

console.log('\n📦 Documentos em cache:', cacheKeys.length);

if (cacheKeys.length > 0) {
  const firstCache = JSON.parse(localStorage.getItem(cacheKeys[0]));
  console.log('\n🔍 Verificando primeiro cache:');
  console.log('ID:', firstCache.documentId);
  console.log('Tem content?', !!firstCache.content);
  console.log('Tem data.texto?', !!firstCache.data?.texto);
  console.log('Tem data.content?', !!firstCache.data?.content);

  const texto = firstCache.content || firstCache.data?.content || firstCache.data?.texto;
  if (texto) {
    console.log('✅ SUCESSO! Cache tem texto');
    console.log('Tamanho:', texto.length, 'caracteres');
  } else {
    console.log('❌ PROBLEMA: Cache não tem texto');
  }
}
```

### Passo 6: Testar Resposta da IA

1. No chat do LEX, faça uma pergunta sobre o processo:
   - "Me dê um resumo completo do processo"
   - "Quais são os principais documentos do processo?"
   - "Analise a petição inicial"

2. Verifique se a resposta da IA:
   - ✅ Contém informações ESPECÍFICAS dos documentos
   - ✅ Cita trechos ou detalhes dos PDFs
   - ✅ Não é genérica ou vazia

### Passo 7: Testar Após Reload (Importante!)

1. **Recarregue a página** (F5) sem limpar o cache
2. Faça outra pergunta à IA
3. Verifique se a resposta continua com conteúdo dos documentos

**Logs esperados no console**:
```
📦 LEX: Cache re-inicializado para sessão restaurada
✅ LEX: Sessão restaurada (X docs, expira em Yh)
📦 LEX: Texto do documento XXXXX recuperado do cache
```

## Resultados Esperados

### ✅ ANTES (Problema)
```
Resposta da IA:
"Com base nas informações disponíveis, apresento um resumo:
- Processo: XXXXXXX
- Tribunal: TJPA
- Classe: Procedimento Comum
[Informações genéricas sem conteúdo dos documentos]"
```

### ✅ AGORA (Corrigido)
```
Resposta da IA:
"Com base nos 16 documentos processados:

**Petição Inicial (ID 12345678)**:
A parte autora alega que [trecho extraído do documento]...

**Decisão Liminar (ID 87654321)**:
O juiz determinou [conteúdo específico da decisão]...

[Resumo detalhado com informações reais dos documentos]"
```

## Problemas Conhecidos e Soluções

### Problema: "Cache não disponível para documento"
**Causa**: Cache expirou (TTL de 30 minutos)
**Solução**: Reprocessar os documentos

### Problema: "Texto não foi salvo"
**Causa**: Extensão não foi recarregada ou cache antigo ainda presente
**Solução**:
1. Recarregar extensão em `chrome://extensions`
2. Limpar cache (Passo 2)
3. Recarregar página
4. Reprocessar documentos

### Problema: IA ainda dá respostas vazias após reload
**Causa**: Cache foi limpo pelo navegador ou expirou
**Solução**: Reprocessar os documentos do processo

## Logs de Debug

Para investigar problemas, ative logs detalhados:

```javascript
// No console, antes de usar o LEX:
localStorage.setItem('lex_debug', 'true');

// Agora use o LEX normalmente e veja logs detalhados no console

// Para desativar:
localStorage.removeItem('lex_debug');
```

## Contato

Se encontrar problemas:
1. Copie TODOS os logs do console
2. Tire screenshots da resposta da IA
3. Execute o script de verificação (Passo 5) e copie o resultado
4. Reporte o problema com essas informações
