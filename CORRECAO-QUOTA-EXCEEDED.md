# Correção do Erro QuotaExceededError no LEX

## Problema Identificado

O sistema LEX estava enfrentando erros de **QuotaExceededError** ao tentar salvar dados no localStorage do navegador. Isso acontecia porque:

1. **Cache de documentos muito grande**: Documentos PDF e HTML processados estavam sendo salvos integralmente no cache
2. **Sessão com muitos dados**: A sessão estava armazenando informações completas de 39 documentos
3. **Falta de limpeza efetiva**: Quando ocorria erro de quota, o cache era limpo mas retornava 0 entradas removidas
4. **Ciclo vicioso**: Processa → Tenta salvar → Falha → "Limpa" (0 removidos) → Tenta salvar → Falha novamente

### Logs do Erro

```
❌ LEX: Erro ao cachear documento: QuotaExceededError:
   Failed to execute 'setItem' on 'Storage': Setting the value of 'lex_doc_cache_XXXXX' exceeded the quota

⚠️ LEX: Quota excedida, limpando cache...
🗑️ LEX: Cache limpo completamente - 0 entradas removidas  ← PROBLEMA!

❌ LEX: Erro ao salvar sessão: QuotaExceededError:
   Failed to execute 'setItem' on 'Storage': Setting the value of 'lex_session' exceeded the quota
```

## Soluções Implementadas

### 1. Limite de Tamanho por Documento ([document-cache.js:10](document-cache.js#L10))

Adicionado limite de 500KB por documento no cache:

```javascript
this.maxDocumentSize = options.maxDocSize || 500 * 1024; // 500KB por documento
```

Documentos maiores que 500KB não serão mais cacheados, evitando sobrecarga do localStorage.

### 2. Limpeza Inteligente com Retry ([document-cache.js:68-110](document-cache.js#L68-L110))

Melhorada a estratégia de recuperação quando quota é excedida:

- Primeiro tenta limpar entradas antigas usando `evictOldEntries()` (remove 30% das mais antigas)
- Se conseguir liberar espaço, tenta salvar novamente
- Se falhar, apenas então limpa todo o cache
- **FIX**: Movida variável `key` e `cacheEntry` para fora do try-catch para estar acessível no retry

### 3. Sessão Otimizada ([session-context.js:291-358](session-context.js#L291-L358))

Reduzido drasticamente o tamanho da sessão salva:

- **Antes**: Salvava texto completo de TODOS os documentos processados (centenas de KB)
- **Agora**:
  - Salva apenas metadados (id, name, type, url, tipo, tamanho, páginas)
  - **NÃO salva o texto extraído dos documentos** (economia de 90%+ de espaço)
  - Conversação reduzida de 20 para 10 últimas mensagens
  - Análise salva apenas resumo, não todos os detalhes
- **Fallback**: Se quota exceder, limpa cache de docs e salva versão mínima

### 4. Script de Limpeza Manual

Criado [clear-lex-storage.js](clear-lex-storage.js) com funções para gerenciamento manual:

**Como usar:**

1. Abra o Console do navegador (F12 > Console)
2. Cole e execute o conteúdo do arquivo `clear-lex-storage.js`
3. Use os comandos disponíveis:

```javascript
// Ver informações sobre uso do storage
getLexStorageInfo()

// Limpar apenas cache de documentos
clearLexCache()

// Limpar apenas a sessão
clearLexSession()

// Limpar cache com mais de 30 minutos
clearOldLexCache(30)

// Limpar TODOS os dados do LEX (use com cuidado!)
clearLexStorage()
```

## Como Aplicar as Correções

### Opção 1: Recarregar a extensão

1. Vá em `chrome://extensions`
2. Encontre a extensão LEX
3. Clique no botão de recarregar (ícone de seta circular)
4. Recarregue a página do PJe

### Opção 2: Limpar localStorage manualmente

1. No PJe, abra o Console (F12)
2. Execute: `localStorage.clear()` (limpa tudo - cuidado!)
3. Ou use os comandos do [clear-lex-storage.js](clear-lex-storage.js) (recomendado)

## Monitoramento

Após aplicar as correções, os logs devem mostrar:

```
✅ Documentos grandes não serão cacheados:
   ⚠️ LEX: Documento XXXXX muito grande (750 KB), não será cacheado
   💡 LEX: Limite por documento: 500 KB

✅ Limpeza efetiva quando quota excedida:
   ⚠️ LEX: Quota excedida, limpando cache antigo...
   🧹 LEX: 350 KB liberados, tentando novamente...
   ✅ LEX: Documento XXXXX cacheado após limpeza

✅ Sessão otimizada:
   💾 LEX: Sessão salva (expira em 24h)

   OU se precisar limpar:

   ⚠️ LEX: Quota excedida ao salvar sessão, limpando cache de documentos...
   🧹 LEX: 8 documentos cacheados removidos
   💾 LEX: Sessão mínima salva após limpeza
```

## Prevenção Futura

O sistema agora:

1. ✅ Rejeita documentos muito grandes antes de tentar cachear
2. ✅ Limpa cache antigo automaticamente quando necessário
3. ✅ Salva apenas dados essenciais na sessão
4. ✅ Tem mecanismos de fallback quando quota é excedida
5. ✅ Fornece ferramentas para limpeza manual quando necessário

## Limitações do localStorage

O localStorage tem um limite de ~5-10MB dependendo do navegador. Para processos com muitos documentos grandes:

- O cache pode não armazenar todos os documentos
- Documentos recentes são priorizados
- Documentos podem ser reprocessados se não estiverem no cache
- Isso é normal e esperado após as correções

## Próximos Passos (Opcionais)

Se o problema persistir com processos muito grandes, considere:

1. Implementar IndexedDB (limite de 50MB+) em vez de localStorage
2. Comprimir documentos antes de cachear
3. Implementar cache seletivo (cachear apenas documentos importantes)
4. Adicionar opção para desabilitar cache completamente
