// Diagnóstico Completo - LEX AI Context
// Execute este script no console para diagnosticar o problema

console.log('=== DIAGNÓSTICO COMPLETO DO LEX ===\n');

// 1. Verificar se classes estão carregadas
console.log('1️⃣ VERIFICANDO CLASSES:');
console.log('window.DocumentCache:', typeof window.DocumentCache);
console.log('window.SessionContext:', typeof window.SessionContext);
console.log('window.ProcessAnalyzer:', typeof window.ProcessAnalyzer);
console.log('window.lexSession:', typeof window.lexSession);

// 2. Verificar sessão atual
console.log('\n2️⃣ VERIFICANDO SESSÃO ATUAL:');
if (window.lexSession) {
  console.log('Processo:', window.lexSession.processNumber);
  console.log('Documentos processados:', window.lexSession.processedDocuments?.length || 0);
  console.log('Cache da sessão:', typeof window.lexSession.cache);
  console.log('Cache é instância?', window.lexSession.cache && typeof window.lexSession.cache.get === 'function');

  if (window.lexSession.processedDocuments?.length > 0) {
    const doc = window.lexSession.processedDocuments[0];
    console.log('\n📄 Primeiro documento em memória:');
    console.log('  ID:', doc.id);
    console.log('  Nome:', doc.name);
    console.log('  doc.data:', doc.data);
    console.log('  doc.data.texto?', !!doc.data?.texto);
    console.log('  doc.data.texto length:', doc.data?.texto?.length || 0);

    if (doc.data?.texto) {
      console.log('  ✅ Preview:', doc.data.texto.substring(0, 150));
    } else {
      console.log('  ❌ Sem texto em memória');
    }
  }
} else {
  console.log('❌ window.lexSession não existe');
}

// 3. Verificar localStorage - Sessão
console.log('\n3️⃣ VERIFICANDO SESSÃO NO LOCALSTORAGE:');
const savedSession = localStorage.getItem('lex_session');
if (savedSession) {
  const sessionData = JSON.parse(savedSession);
  console.log('Documentos salvos:', sessionData.processedDocuments?.length || 0);

  if (sessionData.processedDocuments?.length > 0) {
    const doc = sessionData.processedDocuments[0];
    console.log('\n📄 Primeiro documento salvo:');
    console.log('  ID:', doc.id);
    console.log('  Nome:', doc.name);
    console.log('  doc.data:', doc.data);
    console.log('  Campos em data:', Object.keys(doc.data || {}));
    console.log('  doc.data.texto?', !!doc.data?.texto);

    if (doc.data?.texto) {
      console.log('  ✅ Texto salvo! Length:', doc.data.texto.length);
    } else {
      console.log('  ❌ Texto NÃO foi salvo');
    }
  }
}

// 4. Verificar cache no localStorage
console.log('\n4️⃣ VERIFICANDO CACHE NO LOCALSTORAGE:');
const cacheKeys = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key?.startsWith('lex_doc_cache_')) {
    cacheKeys.push(key);
  }
}
console.log('Total de documentos em cache:', cacheKeys.length);

if (cacheKeys.length > 0) {
  const cached = JSON.parse(localStorage.getItem(cacheKeys[0]));
  console.log('\n📦 Primeiro documento em cache:');
  console.log('  ID:', cached.documentId);
  console.log('  Estrutura do cache:', Object.keys(cached));
  console.log('  cached.content?', !!cached.content);
  console.log('  cached.texto?', !!cached.texto);
  console.log('  cached.data?', !!cached.data);

  if (cached.data) {
    console.log('  cached.data:', Object.keys(cached.data));
    console.log('  cached.data.content?', !!cached.data?.content);
    console.log('  cached.data.texto?', !!cached.data?.texto);
  }

  const textoCache = cached.content || cached.texto || cached.data?.content || cached.data?.texto;
  if (textoCache) {
    console.log('  ✅ Texto encontrado! Length:', textoCache.length);
    console.log('  Preview:', textoCache.substring(0, 150));
  } else {
    console.log('  ❌ Texto NÃO encontrado em nenhum campo');
  }
}

// 5. Testar recuperação via cache da sessão
console.log('\n5️⃣ TESTANDO RECUPERAÇÃO VIA CACHE:');
if (window.lexSession?.cache && window.lexSession.processedDocuments?.length > 0) {
  const docId = window.lexSession.processedDocuments[0].id;
  console.log('Tentando recuperar documento ID:', docId);

  try {
    const cached = window.lexSession.cache.get(docId);
    console.log('Resultado do cache.get():', cached ? 'Encontrado' : 'Não encontrado');

    if (cached) {
      console.log('Estrutura:', Object.keys(cached));
      const texto = cached.texto || cached.content || cached.data?.texto || cached.data?.content;
      console.log('Texto recuperado?', !!texto);
      if (texto) {
        console.log('✅ Length:', texto.length);
        console.log('Preview:', texto.substring(0, 150));
      }
    }
  } catch (error) {
    console.error('❌ Erro ao recuperar do cache:', error);
  }
}

// 6. Testar generateContextSummary
console.log('\n6️⃣ TESTANDO generateContextSummary:');
if (window.lexSession?.processedDocuments?.length > 0) {
  try {
    console.log('Gerando contexto para 2 documentos...');
    const contexto = window.lexSession.generateContextSummary({
      maxDocuments: 2,
      includeFullText: true,
      maxCharsPerDoc: 500
    });

    console.log('Tamanho do contexto:', contexto.length, 'caracteres');
    console.log('Contém "Conteúdo ("?', contexto.includes('Conteúdo ('));
    console.log('Contém "[Não disponível"?', contexto.includes('[Não disponível'));
    console.log('\n📄 CONTEXTO GERADO:');
    console.log(contexto);
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

// 7. Verificar versão do código carregado
console.log('\n7️⃣ VERIFICANDO VERSÃO DO CÓDIGO:');
if (window.lexSession) {
  // Checar se tem o código novo
  const code = window.lexSession.addProcessedDocument.toString();
  const temCompatibilidade = code.includes('data.texto || data.content');
  console.log('addProcessedDocument tem compatibilidade?', temCompatibilidade ? '✅ SIM' : '❌ NÃO');

  if (!temCompatibilidade) {
    console.log('⚠️ ATENÇÃO: Código antigo ainda carregado!');
    console.log('Solução: Recarregue a extensão em chrome://extensions');
  }
}

console.log('\n=== FIM DO DIAGNÓSTICO ===');
console.log('\n📋 CHECKLIST:');
console.log('[ ] Classes carregadas?');
console.log('[ ] Sessão tem documentos?');
console.log('[ ] Documentos em memória têm texto?');
console.log('[ ] Documentos salvos têm texto?');
console.log('[ ] Cache tem texto?');
console.log('[ ] cache.get() funciona?');
console.log('[ ] generateContextSummary retorna texto?');
console.log('[ ] Código novo está carregado?');
