/**
 * Script de limpeza manual do localStorage do LEX
 *
 * Como usar:
 * 1. Abra o Console do navegador (F12 > Console)
 * 2. Cole e execute este script
 * 3. O script irá limpar todos os dados do LEX do localStorage
 *
 * Também disponível via console:
 * - clearLexStorage() - Limpa todos os dados do LEX
 * - clearLexCache() - Limpa apenas o cache de documentos
 * - clearLexSession() - Limpa apenas a sessão
 * - getLexStorageInfo() - Mostra informações sobre o armazenamento
 */

(function() {
  'use strict';

  /**
   * Obtém informações sobre o uso do localStorage pelo LEX
   */
  window.getLexStorageInfo = function() {
    const keys = Object.keys(localStorage);
    const lexKeys = keys.filter(k => k.startsWith('lex_'));

    let totalSize = 0;
    const breakdown = {
      cache: { count: 0, size: 0 },
      session: { count: 0, size: 0 },
      other: { count: 0, size: 0 }
    };

    lexKeys.forEach(key => {
      const size = (localStorage.getItem(key) || '').length;
      totalSize += size;

      if (key.startsWith('lex_doc_cache_')) {
        breakdown.cache.count++;
        breakdown.cache.size += size;
      } else if (key === 'lex_session') {
        breakdown.session.count++;
        breakdown.session.size += size;
      } else {
        breakdown.other.count++;
        breakdown.other.size += size;
      }
    });

    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    console.log('📊 LEX Storage Info:');
    console.log(`Total LEX keys: ${lexKeys.length}`);
    console.log(`Total size: ${formatBytes(totalSize)}`);
    console.log('\nBreakdown:');
    console.log(`  📦 Cache: ${breakdown.cache.count} items, ${formatBytes(breakdown.cache.size)}`);
    console.log(`  💾 Session: ${breakdown.session.count} items, ${formatBytes(breakdown.session.size)}`);
    console.log(`  📝 Other: ${breakdown.other.count} items, ${formatBytes(breakdown.other.size)}`);

    // Mostrar uso total do localStorage
    let totalStorageSize = 0;
    keys.forEach(key => {
      totalStorageSize += (localStorage.getItem(key) || '').length;
    });
    console.log(`\nTotal localStorage usage: ${formatBytes(totalStorageSize)}`);
    console.log(`LEX percentage: ${((totalSize / totalStorageSize) * 100).toFixed(2)}%`);

    return {
      lexKeys: lexKeys.length,
      totalSize,
      breakdown,
      totalStorageSize
    };
  };

  /**
   * Limpa apenas o cache de documentos do LEX
   */
  window.clearLexCache = function() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('lex_doc_cache_'));

    if (keys.length === 0) {
      console.log('ℹ️ Nenhum cache de documentos encontrado');
      return 0;
    }

    keys.forEach(key => localStorage.removeItem(key));
    console.log(`✅ ${keys.length} entradas de cache removidas`);

    return keys.length;
  };

  /**
   * Limpa apenas a sessão do LEX
   */
  window.clearLexSession = function() {
    if (localStorage.getItem('lex_session')) {
      localStorage.removeItem('lex_session');
      console.log('✅ Sessão do LEX removida');
      return 1;
    } else {
      console.log('ℹ️ Nenhuma sessão encontrada');
      return 0;
    }
  };

  /**
   * Limpa todos os dados do LEX do localStorage
   */
  window.clearLexStorage = function() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('lex_'));

    if (keys.length === 0) {
      console.log('ℹ️ Nenhum dado do LEX encontrado no localStorage');
      return 0;
    }

    console.log(`🧹 Limpando ${keys.length} entradas do LEX...`);

    keys.forEach(key => localStorage.removeItem(key));

    console.log('✅ Todos os dados do LEX foram removidos do localStorage');
    console.log('💡 Recarregue a página para o LEX reiniciar do zero');

    return keys.length;
  };

  /**
   * Limpa o cache antigo (mantém apenas documentos recentes)
   */
  window.clearOldLexCache = function(olderThanMinutes = 30) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('lex_doc_cache_'));
    const now = Date.now();
    let removed = 0;

    keys.forEach(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        const cached = new Date(data.cached).getTime();
        const ageMinutes = (now - cached) / (1000 * 60);

        if (ageMinutes > olderThanMinutes) {
          localStorage.removeItem(key);
          removed++;
        }
      } catch (e) {
        // Remove entradas inválidas
        localStorage.removeItem(key);
        removed++;
      }
    });

    console.log(`✅ ${removed} entradas antigas removidas (> ${olderThanMinutes} minutos)`);
    return removed;
  };

  // Executar automaticamente ao carregar
  console.log('🔧 LEX Storage Tools carregadas!');
  console.log('📋 Comandos disponíveis:');
  console.log('  - getLexStorageInfo() - Ver informações de armazenamento');
  console.log('  - clearLexCache() - Limpar cache de documentos');
  console.log('  - clearLexSession() - Limpar sessão');
  console.log('  - clearOldLexCache(30) - Limpar cache com mais de 30 minutos');
  console.log('  - clearLexStorage() - Limpar TODOS os dados do LEX');
  console.log('');

  // Mostrar info automaticamente
  getLexStorageInfo();
})();
