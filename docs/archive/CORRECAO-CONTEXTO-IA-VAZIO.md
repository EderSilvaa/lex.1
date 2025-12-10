# Correção do Problema de Contexto Vazio na IA

## Problema Identificado

Após as correções do QuotaExceededError, a IA passou a retornar respostas genéricas e vazias, sem utilizar o conteúdo dos documentos processados.

### Sintoma

Usuário reportou:
> "ele baixou 16 documento do processo e pedi no input para me dar uma resumo do processo olha oq ele me retorna... informações vazias e sem ajuda ao usuario"

Exemplo de resposta da IA:
```
Resumo do Processo Nº 0800062-91.2025.8.14.0030

Com base nas informações disponíveis, apresento um resumo do processo:

## Informações Básicas
- Tribunal: TJPA - Tribunal de Justiça do Pará
- Classe Processual: Procedimento Comum
- Assunto: Não especificado nos dados disponíveis
...
```

A resposta era genérica, sem nenhum conteúdo extraído dos 16 documentos baixados.

## Causas Raiz (Dois Problemas Distintos)

### 1. Incompatibilidade de Estrutura de Dados

O **process-analyzer.js** salva documentos com campo `content`:
```javascript
const processedData = {
  content: extractedData?.text || extractedData?.conteudo || '',
  metadata: { ... }
};
this.cache.set(document.id, processedData);
```

Mas o **session-context.js** esperava campo `texto`:
```javascript
addProcessedDocument(document, data) {
  this.processedDocuments.push({
    data: {
      texto: data.texto,  // ❌ Undefined! processedData tem 'content', não 'texto'
      tipo: data.tipo,
      tamanho: data.tamanho,
      paginas: data.paginas
    }
  });
}
```

**Resultado**: Documentos eram adicionados à sessão SEM texto, e também cacheados SEM os campos esperados.

### 2. Otimização do localStorage

A otimização do localStorage (para corrigir QuotaExceededError) removeu o campo `texto` dos documentos salvos na sessão:

### [session-context.js:314-327](session-context.js#L314-L327)
```javascript
processedDocuments: this.processedDocuments.map(doc => ({
  id: doc.id,
  name: doc.name,
  type: doc.type,
  url: doc.url,
  processedAt: doc.processedAt,
  data: {
    tipo: doc.data?.tipo,
    tamanho: doc.data?.tamanho,
    paginas: doc.data?.paginas
    // NÃO incluir texto completo para economizar espaço
  }
}))
```

Porém, o método `generateContextSummary()` esperava encontrar `doc.data.texto`:

### [session-context.js:237-238](session-context.js#L237-L238) - ANTES
```javascript
// Tentar obter o texto - primeiro da memória, depois do cache
let textoDoc = doc.data?.texto;
// ❌ Após reload da página, doc.data.texto não existe mais!
```

**Resultado**: Durante a sessão ativa (antes do reload), `doc.data.texto` existia em memória. Mas após recarregar a página e restaurar a sessão do localStorage, o campo `texto` não estava mais disponível, causando respostas vazias.

## Soluções Implementadas

### 1. Compatibilidade de Estrutura de Dados ([session-context.js:42-71](session-context.js#L42-L71))

Modificado `addProcessedDocument()` para aceitar tanto `content` quanto `texto`:

```javascript
addProcessedDocument(document, data) {
  const existing = this.processedDocuments.find(d => d.id === document.id);

  if (!existing) {
    // Compatibilidade: aceitar tanto 'texto' quanto 'content'
    const texto = data.texto || data.content || '';
    const tipo = data.tipo || data.documentType || data.metadata?.contentType;
    const tamanho = data.tamanho || data.metadata?.size;
    const paginas = data.paginas || data.metadata?.pages;

    this.processedDocuments.push({
      id: document.id,
      name: document.name,
      type: document.type,
      url: document.url,
      processedAt: new Date(),
      data: {
        texto: texto,  // ✅ Agora funciona com 'content' ou 'texto'
        tipo: tipo,
        tamanho: tamanho,
        paginas: paginas
      }
    });

    this.save();
  }
}
```

**Benefícios**:
- Funciona com estrutura antiga (`data.texto`) e nova (`data.content`)
- Extrai metadados de `data.metadata` quando necessário
- Garante que o texto seja salvo corretamente na sessão

### 2. Fallback para o DocumentCache ([session-context.js:246-263](session-context.js#L246-L263))

Modificado `generateContextSummary()` para buscar o texto do cache quando não está na memória:

```javascript
// Tentar obter o texto - primeiro da memória, depois do cache
let textoDoc = doc.data?.texto;

// Se não tem texto em memória, tentar buscar do cache
if (!textoDoc && this.cache) {
  // Verificar se cache é uma instância (não a classe)
  const cacheInstance = (typeof this.cache === 'function') ? null : this.cache;

  if (cacheInstance && typeof cacheInstance.get === 'function') {
    const cached = cacheInstance.get(doc.id);
    if (cached) {
      // Compatibilidade: buscar tanto 'texto' quanto 'content'
      textoDoc = cached.texto || cached.content || cached.data?.texto || cached.data?.content;
      if (textoDoc) {
        console.log(`📦 LEX: Texto do documento ${doc.id} recuperado do cache`);
      }
    }
  } else {
    console.warn(`⚠️ LEX: Cache não disponível para documento ${doc.id}`);
  }
}
```

**Por que verificar se é instância?**

Porque a sessão pode ter `this.cache` definido de duas formas:
- `this.cache = cacheInstance` (instância passada via `initialize()`)
- `this.cache = window.DocumentCache` (classe, não instância)

### 2. Re-inicialização do Cache após Restore ([session-context.js:422-426](session-context.js#L422-L426))

Quando a sessão é restaurada do localStorage, o cache precisa ser recriado (não pode ser serializado):

```javascript
// Restaurar cache (criar nova instância pois não pode ser serializado)
if (window.DocumentCache) {
  this.cache = new window.DocumentCache({ ttl: 30 * 60 * 1000 });
  console.log('📦 LEX: Cache re-inicializado para sessão restaurada');
}
```

**Por que isso é necessário?**

1. O `DocumentCache` é uma instância de classe, não pode ser salva em JSON
2. Ao restaurar a sessão, `this.cache` ficava undefined
3. Sem cache, não havia como recuperar o texto dos documentos
4. Agora, ao restaurar, cria-se uma nova instância que pode acessar o localStorage

### 3. Fluxo Completo do Texto do Documento

```
PRIMEIRA ANÁLISE (sessão ativa):
1. ProcessAnalyzer processa documentos
2. Texto extraído fica em memória: doc.data.texto
3. Texto também vai pro cache: localStorage['lex_doc_cache_xxxxx']
4. Sessão salva metadados SEM texto (economia de espaço)
5. generateContextSummary() usa doc.data.texto (em memória) ✅

APÓS RELOAD DA PÁGINA:
1. Sessão restaurada do localStorage
2. Cache re-inicializado (nova instância)
3. doc.data.texto não existe (não foi salvo)
4. generateContextSummary() detecta texto ausente
5. Busca no cache via this.cache.get(doc.id)
6. Recupera cached.texto do localStorage ✅
7. IA recebe contexto completo ✅
```

## Arquitetura do Cache

### DocumentCache não é Global

```javascript
// ❌ window.documentCache NÃO existe
// ✅ window.DocumentCache existe (classe)

// ProcessAnalyzer cria instância:
this.cache = new window.DocumentCache({ ttl: 30 * 60 * 1000 });

// Passa para sessão:
this.session.initialize({
  cache: this.cache  // Instância, não classe
});

// SessionContext recebe:
this.cache = options.cache || window.DocumentCache;
// Se options.cache existe: usa instância ✅
// Se não: usa classe (precisaria de new) ⚠️
```

### Solução para Sessão Restaurada

Quando a sessão é restaurada:
- `options.cache` não existe (restore não recebe options)
- Antes da correção: `this.cache` ficava undefined
- Após correção: cria nova instância em `restore()`

## Como Testar

### 1. Testar Sessão Ativa (antes do reload)
```javascript
// No console do navegador:
window.lexSession.generateContextSummary({
  maxDocuments: 5,
  includeFullText: true,
  maxCharsPerDoc: 5000
});

// Deve mostrar:
// "Conteúdo (XXXX caracteres):" com texto dos documentos
```

### 2. Testar Sessão Restaurada (após reload)
```javascript
// 1. Processar documentos normalmente
// 2. Fechar e reabrir a aba
// 3. No console:

window.lexSession.generateContextSummary({
  maxDocuments: 5,
  includeFullText: true,
  maxCharsPerDoc: 5000
});

// Deve mostrar:
// 📦 LEX: Texto do documento XXXXX recuperado do cache
// "Conteúdo (XXXX caracteres):" com texto dos documentos
```

### 3. Testar Resposta da IA
```javascript
// Após processar documentos, perguntar:
// "Me dê um resumo completo do processo"

// ✅ ANTES: Resposta genérica sem conteúdo
// ✅ AGORA: Resposta com informações dos documentos
```

## Logs Esperados

### Quando texto está em memória:
```
✅ Nenhum log adicional (texto já disponível)
```

### Quando texto vem do cache:
```
📦 LEX: Texto do documento 12345678 recuperado do cache
📦 LEX: Texto do documento 87654321 recuperado do cache
...
```

### Quando cache não disponível:
```
⚠️ LEX: Cache não disponível para documento 12345678
   - Conteúdo: [Não disponível - reprocesse o documento]
```

### Quando sessão é restaurada:
```
📦 LEX: Cache re-inicializado para sessão restaurada
✅ LEX: Sessão restaurada (16 docs, expira em 23h)
```

## Limitações Conhecidas

### 1. Cache pode expirar
- TTL padrão: 30 minutos
- Documentos antigos são removidos automaticamente
- Se cache expirou, texto não estará disponível
- **Solução**: Reprocessar documentos (já existe no sistema)

### 2. localStorage pode ser limpo
- Usuário pode limpar dados do navegador
- Navegação anônima não persiste dados
- **Solução**: Sistema detecta e pede reprocessamento

### 3. Documentos muito grandes
- Limite de 500KB por documento no cache
- Documentos maiores não são cacheados
- **Impacto**: Podem precisar reprocessamento após reload

## Prevenção de Regressões

Para evitar que o problema volte:

### ✅ Sempre use `this.cache` ao invés de `window.documentCache`
```javascript
// ❌ ERRADO
if (window.documentCache) {
  const cached = window.documentCache.get(docId);
}

// ✅ CORRETO
if (this.cache && typeof this.cache.get === 'function') {
  const cached = this.cache.get(docId);
}
```

### ✅ Sempre re-inicialize cache em restore()
```javascript
restore() {
  // ... restaurar outros dados ...

  // Crucial: criar nova instância do cache
  if (window.DocumentCache) {
    this.cache = new window.DocumentCache({ ttl: 30 * 60 * 1000 });
  }
}
```

### ✅ Sempre teste com reload de página
Não basta testar durante sessão ativa. Sempre:
1. Processar documentos
2. Fazer pergunta à IA (funciona)
3. **Recarregar página**
4. Fazer pergunta à IA novamente (deve continuar funcionando)

## Arquivos Modificados

### [session-context.js](session-context.js)
- **Linha 240-254**: Adicionado fallback para cache com verificação de tipo
- **Linha 422-426**: Re-inicialização do cache ao restaurar sessão

## Próximas Melhorias (Opcional)

1. **Indicador visual** quando documento vem do cache vs memória
2. **Re-processamento automático** se cache expirou
3. **Compressão de texto** para caber mais documentos no cache
4. **IndexedDB** como alternativa ao localStorage (limite maior)
5. **Progress bar** mostrando quantos documentos têm texto disponível

## Referências

- [CORRECAO-QUOTA-EXCEEDED.md](CORRECAO-QUOTA-EXCEEDED.md) - Problema anterior que causou este
- [document-cache.js](src/js/document-cache.js) - Implementação do cache
- [session-context.js](src/js/session-context.js) - Gerenciamento de sessão
- [process-analyzer.js](src/js/process-analyzer.js) - Processamento de documentos
