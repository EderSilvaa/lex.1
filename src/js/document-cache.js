// Document Cache - Sistema de cache local para documentos processados
// Part of LEX Document Processing System
// Usa localStorage com TTL para evitar reprocessamento desnecessário

class DocumentCache {
  constructor(options = {}) {
    this.prefix = options.prefix || 'lex_doc_cache_';
    this.defaultTTL = options.ttl || 30 * 60 * 1000; // 30 minutos
    this.maxCacheSize = options.maxSize || 50 * 1024 * 1024; // 50MB
    this.maxDocumentSize = options.maxDocSize || 500 * 1024; // 500KB por documento
    this.compressionEnabled = options.compression !== false;

    console.log('💾 LEX: DocumentCache instanciado', {
      TTL: `${this.defaultTTL / 1000}s`,
      maxSize: this.formatBytes(this.maxCacheSize),
      maxDocSize: this.formatBytes(this.maxDocumentSize),
      compression: this.compressionEnabled
    });
  }

  /**
   * Armazena um documento no cache
   * @param {string} documentId - ID do documento
   * @param {Object} documentData - Dados do documento processado
   * @param {number} ttl - Time to live em milissegundos (opcional)
   * @returns {boolean} Sucesso da operação
   */
  set(documentId, documentData, ttl = null) {
    const key = this.buildKey(documentId);
    const expiresAt = Date.now() + (ttl || this.defaultTTL);

    // Criar entrada de cache fora do try para estar acessível no retry
    const cacheEntry = {
      documentId: documentId,
      data: documentData,
      cached: new Date().toISOString(),
      expiresAt: expiresAt,
      size: JSON.stringify(documentData).length
    };

    // Verificar tamanho do documento individual
    const entrySize = JSON.stringify(cacheEntry).length;

    if (entrySize > this.maxDocumentSize) {
      console.warn(`⚠️ LEX: Documento ${documentId} muito grande (${this.formatBytes(entrySize)}), não será cacheado`);
      console.log(`💡 LEX: Limite por documento: ${this.formatBytes(this.maxDocumentSize)}`);
      return false;
    }

    // Verificar espaço disponível no cache geral
    if (!this.hasSpaceFor(entrySize)) {
      console.warn('⚠️ LEX: Cache cheio, limpando entradas antigas...');
      this.evictOldEntries();

      // Verificar novamente
      if (!this.hasSpaceFor(entrySize)) {
        console.error('❌ LEX: Não foi possível liberar espaço no cache');
        return false;
      }
    }

    // Comprimir dados se habilitado e o conteúdo for grande
    if (this.compressionEnabled && entrySize > 1024) {
      cacheEntry.data = this.compress(documentData);
      cacheEntry.compressed = true;
    }

    try {
      // Salvar no localStorage
      localStorage.setItem(key, JSON.stringify(cacheEntry));

      console.log(`✅ LEX: Documento ${documentId} cacheado`, {
        size: this.formatBytes(entrySize),
        expiresIn: `${Math.round((expiresAt - Date.now()) / 1000)}s`
      });

      return true;

    } catch (error) {
      console.error('❌ LEX: Erro ao cachear documento:', error);

      // Se erro por QuotaExceeded, tentar limpar cache antigo e tentar novamente
      if (error.name === 'QuotaExceededError') {
        console.warn('⚠️ LEX: Quota excedida, limpando cache antigo...');

        // Tenta limpar entradas antigas/grandes primeiro
        const freedBytes = this.evictOldEntries();

        if (freedBytes > 0) {
          console.log(`🧹 LEX: ${this.formatBytes(freedBytes)} liberados, tentando novamente...`);

          // Tenta salvar novamente após limpeza
          try {
            localStorage.setItem(key, JSON.stringify(cacheEntry));
            console.log(`✅ LEX: Documento ${documentId} cacheado após limpeza`);
            return true;
          } catch (retryError) {
            console.error('❌ LEX: Falha mesmo após limpeza:', retryError);
            // Se ainda falhar, limpa tudo
            this.clear();
          }
        } else {
          // Se não havia entradas antigas, limpa tudo
          console.warn('⚠️ LEX: Nenhuma entrada antiga encontrada, limpando todo cache...');
          this.clear();
        }
      }

      return false;
    }
  }

  /**
   * Recupera um documento do cache
   * @param {string} documentId - ID do documento
   * @returns {Object|null} Dados do documento ou null se não encontrado/expirado
   */
  get(documentId) {
    try {
      const key = this.buildKey(documentId);
      const cached = localStorage.getItem(key);

      if (!cached) {
        console.log(`📋 LEX: Documento ${documentId} não encontrado no cache`);
        return null;
      }

      const cacheEntry = JSON.parse(cached);

      // Verificar expiração
      if (Date.now() > cacheEntry.expiresAt) {
        console.log(`⏰ LEX: Cache do documento ${documentId} expirado, removendo...`);
        this.remove(documentId);
        return null;
      }

      console.log(`✅ LEX: Documento ${documentId} recuperado do cache`);

      // Descomprimir se necessário
      if (cacheEntry.compressed) {
        cacheEntry.data = this.decompress(cacheEntry.data);
      }

      return cacheEntry.data;

    } catch (error) {
      console.error('❌ LEX: Erro ao recuperar documento do cache:', error);
      return null;
    }
  }

  /**
   * Remove um documento do cache
   * @param {string} documentId - ID do documento
   * @returns {boolean} Sucesso da operação
   */
  remove(documentId) {
    try {
      const key = this.buildKey(documentId);
      localStorage.removeItem(key);
      console.log(`🗑️ LEX: Documento ${documentId} removido do cache`);
      return true;
    } catch (error) {
      console.error('❌ LEX: Erro ao remover documento do cache:', error);
      return false;
    }
  }

  /**
   * Verifica se um documento está no cache e válido
   * @param {string} documentId - ID do documento
   * @returns {boolean} True se existe e não expirou
   */
  has(documentId) {
    try {
      const key = this.buildKey(documentId);
      const cached = localStorage.getItem(key);

      if (!cached) return false;

      const cacheEntry = JSON.parse(cached);

      // Verificar expiração
      if (Date.now() > cacheEntry.expiresAt) {
        this.remove(documentId);
        return false;
      }

      return true;

    } catch (error) {
      return false;
    }
  }

  /**
   * Limpa todas as entradas expiradas do cache
   * @returns {number} Número de entradas removidas
   */
  cleanExpired() {
    let removed = 0;

    try {
      const keys = this.getAllCacheKeys();
      const now = Date.now();

      for (const key of keys) {
        try {
          const cached = localStorage.getItem(key);
          if (!cached) continue;

          const cacheEntry = JSON.parse(cached);

          if (now > cacheEntry.expiresAt) {
            localStorage.removeItem(key);
            removed++;
          }

        } catch (error) {
          // Entry inválida, remover
          localStorage.removeItem(key);
          removed++;
        }
      }

      if (removed > 0) {
        console.log(`🧹 LEX: ${removed} entradas expiradas removidas do cache`);
      }

    } catch (error) {
      console.error('❌ LEX: Erro ao limpar cache expirado:', error);
    }

    return removed;
  }

  /**
   * Remove entradas antigas para liberar espaço
   * @returns {number} Bytes liberados
   */
  evictOldEntries() {
    let freedBytes = 0;

    try {
      const entries = [];
      const keys = this.getAllCacheKeys();

      // Coletar todas as entradas com seus metadados
      for (const key of keys) {
        try {
          const cached = localStorage.getItem(key);
          if (!cached) continue;

          const cacheEntry = JSON.parse(cached);
          entries.push({
            key: key,
            cached: new Date(cacheEntry.cached).getTime(),
            size: cached.length
          });

        } catch (error) {
          // Ignorar entradas inválidas
        }
      }

      // Ordenar por data de cache (mais antigas primeiro)
      entries.sort((a, b) => a.cached - b.cached);

      // Remover 30% das entradas mais antigas
      const toRemove = Math.ceil(entries.length * 0.3);

      for (let i = 0; i < toRemove && i < entries.length; i++) {
        localStorage.removeItem(entries[i].key);
        freedBytes += entries[i].size;
      }

      console.log(`🧹 LEX: ${toRemove} entradas antigas removidas, ${this.formatBytes(freedBytes)} liberados`);

    } catch (error) {
      console.error('❌ LEX: Erro ao remover entradas antigas:', error);
    }

    return freedBytes;
  }

  /**
   * Limpa todo o cache de documentos
   * @returns {number} Número de entradas removidas
   */
  clear() {
    let removed = 0;

    try {
      const keys = this.getAllCacheKeys();

      for (const key of keys) {
        localStorage.removeItem(key);
        removed++;
      }

      console.log(`🗑️ LEX: Cache limpo completamente - ${removed} entradas removidas`);

    } catch (error) {
      console.error('❌ LEX: Erro ao limpar cache:', error);
    }

    return removed;
  }

  /**
   * Retorna estatísticas do cache
   * @returns {Object} Estatísticas
   */
  getStatistics() {
    const stats = {
      totalEntries: 0,
      totalSize: 0,
      validEntries: 0,
      expiredEntries: 0,
      oldestEntry: null,
      newestEntry: null,
      largestEntry: null
    };

    try {
      const keys = this.getAllCacheKeys();
      const now = Date.now();
      let oldestTime = Infinity;
      let newestTime = 0;
      let largestSize = 0;

      for (const key of keys) {
        try {
          const cached = localStorage.getItem(key);
          if (!cached) continue;

          const cacheEntry = JSON.parse(cached);
          const cachedTime = new Date(cacheEntry.cached).getTime();
          const size = cached.length;

          stats.totalEntries++;
          stats.totalSize += size;

          if (now > cacheEntry.expiresAt) {
            stats.expiredEntries++;
          } else {
            stats.validEntries++;
          }

          if (cachedTime < oldestTime) {
            oldestTime = cachedTime;
            stats.oldestEntry = {
              id: cacheEntry.documentId,
              cached: cacheEntry.cached
            };
          }

          if (cachedTime > newestTime) {
            newestTime = cachedTime;
            stats.newestEntry = {
              id: cacheEntry.documentId,
              cached: cacheEntry.cached
            };
          }

          if (size > largestSize) {
            largestSize = size;
            stats.largestEntry = {
              id: cacheEntry.documentId,
              size: this.formatBytes(size)
            };
          }

        } catch (error) {
          // Ignorar entradas inválidas
        }
      }

      stats.totalSizeFormatted = this.formatBytes(stats.totalSize);
      stats.utilizationPercent = ((stats.totalSize / this.maxCacheSize) * 100).toFixed(2);

    } catch (error) {
      console.error('❌ LEX: Erro ao obter estatísticas do cache:', error);
    }

    return stats;
  }

  /**
   * Retorna todas as chaves de cache do LEX
   * @returns {Array<string>} Lista de chaves
   */
  getAllCacheKeys() {
    const keys = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keys.push(key);
        }
      }
    } catch (error) {
      console.error('❌ LEX: Erro ao obter chaves do cache:', error);
    }

    return keys;
  }

  /**
   * Constrói a chave de cache para um documento
   * @param {string} documentId - ID do documento
   * @returns {string} Chave de cache
   */
  buildKey(documentId) {
    return `${this.prefix}${documentId}`;
  }

  /**
   * Verifica se há espaço disponível para armazenar dados
   * @param {number} requiredSize - Tamanho necessário em bytes
   * @returns {boolean} True se há espaço
   */
  hasSpaceFor(requiredSize) {
    try {
      const stats = this.getStatistics();
      return (stats.totalSize + requiredSize) <= this.maxCacheSize;
    } catch (error) {
      return false;
    }
  }

  /**
   * Comprime dados usando base64 (simplificado)
   * @param {Object} data - Dados a comprimir
   * @returns {string} Dados comprimidos
   */
  compress(data) {
    try {
      // Conversão simples para reduzir tamanho
      const json = JSON.stringify(data);
      return btoa(unescape(encodeURIComponent(json)));
    } catch (error) {
      console.warn('⚠️ LEX: Erro ao comprimir dados, usando dados originais');
      return data;
    }
  }

  /**
   * Descomprime dados
   * @param {string} compressed - Dados comprimidos
   * @returns {Object} Dados originais
   */
  decompress(compressed) {
    try {
      const json = decodeURIComponent(escape(atob(compressed)));
      return JSON.parse(json);
    } catch (error) {
      console.warn('⚠️ LEX: Erro ao descomprimir dados, usando dados como estão');
      return compressed;
    }
  }

  /**
   * Formata bytes para exibição
   * @param {number} bytes - Tamanho em bytes
   * @returns {string} Tamanho formatado
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Exporta todo o cache para backup
   * @returns {Object} Dados do cache
   */
  export() {
    const exported = {
      version: '1.0',
      exported: new Date().toISOString(),
      entries: []
    };

    try {
      const keys = this.getAllCacheKeys();

      for (const key of keys) {
        const cached = localStorage.getItem(key);
        if (cached) {
          exported.entries.push({
            key: key,
            data: JSON.parse(cached)
          });
        }
      }

      console.log(`📤 LEX: ${exported.entries.length} entradas exportadas`);

    } catch (error) {
      console.error('❌ LEX: Erro ao exportar cache:', error);
    }

    return exported;
  }

  /**
   * Importa cache de um backup
   * @param {Object} exportedData - Dados exportados
   * @returns {number} Número de entradas importadas
   */
  import(exportedData) {
    let imported = 0;

    try {
      if (!exportedData || !exportedData.entries) {
        throw new Error('Dados de exportação inválidos');
      }

      for (const entry of exportedData.entries) {
        localStorage.setItem(entry.key, JSON.stringify(entry.data));
        imported++;
      }

      console.log(`📥 LEX: ${imported} entradas importadas`);

    } catch (error) {
      console.error('❌ LEX: Erro ao importar cache:', error);
    }

    return imported;
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.DocumentCache = DocumentCache;
}

console.log('✅ LEX: DocumentCache carregado com sucesso');