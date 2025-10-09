// Model Cache - Gerencia cache de modelos do PJe no localStorage
(function() {
  'use strict';

  class ModelCache {
    constructor() {
      this.STORAGE_KEY = 'lex_pje_models';
      this.TTL_DIAS = 30;
      this.MAX_MODELOS = 20;
      this.VERSION = '1.0';

      console.log('💾 ModelCache: Inicializado');
    }

    /**
     * Inicializa cache se não existir
     */
    inicializar() {
      try {
        const cache = localStorage.getItem(this.STORAGE_KEY);

        if (!cache) {
          const cacheInicial = {
            version: this.VERSION,
            tribunal: 'TJPA',
            createdAt: new Date().toISOString(),
            lastUpdate: new Date().toISOString(),
            models: []
          };

          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cacheInicial));
          console.log('✅ Cache de modelos inicializado');
        } else {
          console.log('📂 Cache existente encontrado');
          this.limparExpirados();
        }
      } catch (erro) {
        console.error('❌ Erro ao inicializar cache:', erro);
      }
    }

    /**
     * Obtém cache completo
     */
    obterCache() {
      try {
        const cache = localStorage.getItem(this.STORAGE_KEY);
        return cache ? JSON.parse(cache) : { models: [] };
      } catch (erro) {
        console.error('❌ Erro ao ler cache:', erro);
        return { models: [] };
      }
    }

    /**
     * Salva modelo no cache
     */
    salvarModelo(modelo) {
      try {
        const cache = this.obterCache();

        // Adicionar metadata
        modelo.cachedAt = new Date().toISOString();
        modelo.expiresAt = this.calcularExpiracao();

        // Remover modelo antigo com mesmo valor (evitar duplicatas)
        cache.models = cache.models.filter(m => m.valor !== modelo.valor);

        // Adicionar novo modelo
        cache.models.push(modelo);

        // Limitar quantidade
        if (cache.models.length > this.MAX_MODELOS) {
          // Remover mais antigos
          cache.models.sort((a, b) => new Date(b.cachedAt) - new Date(a.cachedAt));
          cache.models = cache.models.slice(0, this.MAX_MODELOS);
        }

        cache.lastUpdate = new Date().toISOString();

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cache));

        console.log(`✅ Modelo "${modelo.nome}" salvo no cache (${cache.models.length} total)`);

        return true;
      } catch (erro) {
        console.error('❌ Erro ao salvar modelo:', erro);

        // Verificar se é erro de quota
        if (erro.name === 'QuotaExceededError') {
          console.warn('⚠️ localStorage cheio, limpando modelos antigos...');
          this.limparMaisAntigos(5);
          return this.salvarModelo(modelo); // Tentar novamente
        }

        return false;
      }
    }

    /**
     * Busca modelo por critérios
     */
    buscarModelo(criterios = {}) {
      const cache = this.obterCache();
      let modelos = cache.models || [];

      // Filtrar por nome (parcial, case-insensitive)
      if (criterios.nome) {
        const nomeBusca = criterios.nome.toLowerCase();
        modelos = modelos.filter(m =>
          m.nome.toLowerCase().includes(nomeBusca)
        );
      }

      // Filtrar por valor exato
      if (criterios.valor) {
        modelos = modelos.filter(m => m.valor === criterios.valor);
      }

      // Filtrar por ID
      if (criterios.id) {
        modelos = modelos.filter(m => m.id === criterios.id);
      }

      // Filtrar por categoria (se tivermos essa metadata)
      if (criterios.categoria) {
        const catBusca = criterios.categoria.toLowerCase();
        modelos = modelos.filter(m =>
          m.nome.toLowerCase().includes(catBusca) ||
          m.conteudo.toLowerCase().includes(catBusca)
        );
      }

      // Retornar primeiro resultado ou todos
      if (criterios.primeiro) {
        return modelos[0] || null;
      }

      return modelos;
    }

    /**
     * Lista todos os modelos
     */
    listarModelos() {
      const cache = this.obterCache();
      return cache.models || [];
    }

    /**
     * Obtém modelo por ID
     */
    obterModelo(id) {
      const cache = this.obterCache();
      return cache.models.find(m => m.id === id) || null;
    }

    /**
     * Remove modelo do cache
     */
    removerModelo(id) {
      try {
        const cache = this.obterCache();
        const tamanhoAntes = cache.models.length;

        cache.models = cache.models.filter(m => m.id !== id);

        if (cache.models.length < tamanhoAntes) {
          cache.lastUpdate = new Date().toISOString();
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cache));
          console.log(`🗑️ Modelo removido (${cache.models.length} restantes)`);
          return true;
        }

        return false;
      } catch (erro) {
        console.error('❌ Erro ao remover modelo:', erro);
        return false;
      }
    }

    /**
     * Limpa modelos expirados
     */
    limparExpirados() {
      try {
        const cache = this.obterCache();
        const agora = Date.now();
        const tamanhoAntes = cache.models.length;

        cache.models = cache.models.filter(m => {
          if (!m.expiresAt) return true; // Manter se não tem expiração
          return new Date(m.expiresAt).getTime() > agora;
        });

        const removidos = tamanhoAntes - cache.models.length;

        if (removidos > 0) {
          cache.lastUpdate = new Date().toISOString();
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cache));
          console.log(`🧹 ${removidos} modelo(s) expirado(s) removido(s)`);
        }

        return removidos;
      } catch (erro) {
        console.error('❌ Erro ao limpar expirados:', erro);
        return 0;
      }
    }

    /**
     * Remove N modelos mais antigos
     */
    limparMaisAntigos(quantidade = 5) {
      try {
        const cache = this.obterCache();

        if (cache.models.length <= quantidade) {
          console.warn('⚠️ Não há modelos suficientes para limpar');
          return 0;
        }

        // Ordenar por data (mais antigos primeiro)
        cache.models.sort((a, b) =>
          new Date(a.cachedAt || 0) - new Date(b.cachedAt || 0)
        );

        // Remover os N primeiros (mais antigos)
        cache.models = cache.models.slice(quantidade);

        cache.lastUpdate = new Date().toISOString();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cache));

        console.log(`🧹 ${quantidade} modelo(s) mais antigo(s) removido(s)`);
        return quantidade;
      } catch (erro) {
        console.error('❌ Erro ao limpar mais antigos:', erro);
        return 0;
      }
    }

    /**
     * Limpa todo o cache
     */
    limparTudo() {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
        console.log('🗑️ Cache completamente limpo');
        this.inicializar();
        return true;
      } catch (erro) {
        console.error('❌ Erro ao limpar cache:', erro);
        return false;
      }
    }

    /**
     * Calcula data de expiração
     */
    calcularExpiracao(diasCustom = null) {
      const dias = diasCustom || this.TTL_DIAS;
      const agora = new Date();
      agora.setDate(agora.getDate() + dias);
      return agora.toISOString();
    }

    /**
     * Obtém estatísticas do cache
     */
    obterEstatisticas() {
      const cache = this.obterCache();
      const modelos = cache.models || [];

      return {
        total: modelos.length,
        tribunal: cache.tribunal,
        ultimaAtualizacao: cache.lastUpdate,
        modelosPorTipo: this.agruparPorTipo(modelos),
        tamanhoEstimado: this.estimarTamanho(cache),
        maisRecente: modelos.length > 0
          ? modelos.reduce((a, b) => new Date(a.cachedAt) > new Date(b.cachedAt) ? a : b)
          : null
      };
    }

    /**
     * Agrupa modelos por tipo inferido
     */
    agruparPorTipo(modelos) {
      const tipos = {};

      modelos.forEach(modelo => {
        const tipo = this.inferirTipoModelo(modelo.nome);
        tipos[tipo] = (tipos[tipo] || 0) + 1;
      });

      return tipos;
    }

    /**
     * Infere tipo de modelo pelo nome
     */
    inferirTipoModelo(nome) {
      const nomeL = nome.toLowerCase();

      if (nomeL.includes('contestação')) return 'contestacao';
      if (nomeL.includes('inicial') || nomeL.includes('petição inicial')) return 'inicial';
      if (nomeL.includes('agravo')) return 'agravo';
      if (nomeL.includes('recurso')) return 'recurso';
      if (nomeL.includes('mandado')) return 'mandado';
      if (nomeL.includes('habeas')) return 'habeas_corpus';
      if (nomeL.includes('ofício')) return 'oficio';
      if (nomeL.includes('sentença')) return 'sentenca';

      return 'outros';
    }

    /**
     * Estima tamanho do cache em bytes
     */
    estimarTamanho(cache) {
      try {
        const json = JSON.stringify(cache);
        const bytes = new Blob([json]).size;

        if (bytes < 1024) return `${bytes} bytes`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      } catch {
        return 'N/A';
      }
    }

    /**
     * Exporta cache para backup
     */
    exportar() {
      const cache = this.obterCache();
      const json = JSON.stringify(cache, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `lex_modelos_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();

      URL.revokeObjectURL(url);
      console.log('📦 Cache exportado');
    }

    /**
     * Importa cache de backup
     */
    importar(jsonString) {
      try {
        const cache = JSON.parse(jsonString);

        // Validar estrutura básica
        if (!cache.models || !Array.isArray(cache.models)) {
          throw new Error('Formato de cache inválido');
        }

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cache));
        console.log(`✅ Cache importado: ${cache.models.length} modelos`);
        return true;
      } catch (erro) {
        console.error('❌ Erro ao importar cache:', erro);
        return false;
      }
    }
  }

  // Expor globalmente
  window.ModelCache = new ModelCache();
  window.ModelCache.inicializar();

  console.log('📊 Estatísticas do cache:', window.ModelCache.obterEstatisticas());

})();
