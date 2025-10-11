// Session Context - Mantém contexto da sessão atual para conversação contínua
// Armazena documentos processados, histórico de análises, e permite queries específicas

class SessionContext {
  constructor() {
    this.processNumber = null;
    this.processInfo = null; // Informações extraídas do DOM (partes, classe, assunto, etc)
    this.documents = []; // Lista de documentos descobertos
    this.processedDocuments = []; // Documentos baixados e processados
    this.conversationHistory = []; // Histórico de perguntas/respostas
    this.lastAnalysis = null; // Última análise completa
    this.cache = null; // Referência ao DocumentCache
    this.createdAt = new Date();

    console.log('💬 LEX: SessionContext inicializado');
  }

  /**
   * Inicializa sessão com dados do processo
   * @param {Object} options - Opções de inicialização
   */
  initialize(options = {}) {
    this.processNumber = options.processNumber;
    this.processInfo = options.processInfo || null;
    this.documents = options.documents || [];
    this.cache = options.cache || window.DocumentCache;

    console.log(`✅ LEX: Sessão inicializada para processo ${this.processNumber}`);
    console.log(`   📄 ${this.documents.length} documentos disponíveis`);

    if (this.processInfo) {
      console.log(`   ⚖️ Partes: ${this.processInfo.autor || 'N/A'} x ${this.processInfo.reu || 'N/A'}`);
      console.log(`   📋 Classe: ${this.processInfo.classeProcessual || 'N/A'}`);
    }
  }

  /**
   * Adiciona documento processado ao contexto
   * @param {Object} document - Metadados do documento
   * @param {Object} data - Dados processados (texto, tipo, etc)
   */
  addProcessedDocument(document, data) {
    const existing = this.processedDocuments.find(d => d.id === document.id);

    if (!existing) {
      this.processedDocuments.push({
        id: document.id,
        name: document.name,
        type: document.type,
        url: document.url,
        processedAt: new Date(),
        data: {
          texto: data.texto,
          tipo: data.tipo,
          tamanho: data.tamanho,
          paginas: data.paginas
        }
      });

      console.log(`📌 LEX: Documento ${document.id} adicionado ao contexto da sessão`);

      // AUTO-SAVE após adicionar documento
      this.save();
    }
  }

  /**
   * Define resultado da última análise completa
   * @param {Object} analysis - Resultado da análise
   */
  setLastAnalysis(analysis) {
    this.lastAnalysis = {
      content: analysis,
      timestamp: new Date()
    };

    console.log('LEX: Análise completa salva no contexto da sessão');
  }

  /**
   * Salva documentos organizados por classificação
   * @param {Object} organized - Documentos organizados pelo DocumentClassifier
   */
  setOrganizedDocuments(organized) {
    this.organizedDocuments = organized;
    console.log('LEX: Documentos organizados salvos na sessão');
    console.log('- Total:', organized.summary.total);
    console.log('- Por categoria:', organized.summary.byCategory);
    console.log('- Mais importantes:', organized.summary.mostImportant);
  }

  /**
   * Obtém documentos relevantes para uma pergunta usando o classifier
   * @param {string} question - Pergunta do usuário
   * @param {number} maxDocs - Máximo de documentos a retornar
   * @returns {Array} Documentos relevantes
   */
  getRelevantDocuments(question, maxDocs = 5) {
    if (!this.organizedDocuments || !window.DocumentClassifier) {
      console.warn('LEX: Documentos não organizados ou classifier não disponível');
      return this.processedDocuments.slice(0, maxDocs);
    }

    const classifier = new window.DocumentClassifier();
    return classifier.selectRelevantDocuments(
      this.organizedDocuments.all,
      question,
      maxDocs
    );
  }

  /**
   * Adiciona mensagem ao histórico de conversação
   * @param {string} role - 'user' ou 'assistant'
   * @param {string} content - Conteúdo da mensagem
   */
  addToHistory(role, content) {
    this.conversationHistory.push({
      role: role,
      content: content,
      timestamp: new Date()
    });

    // AUTO-SAVE após adicionar ao histórico (mas com throttle)
    this.scheduleAutoSave();
  }

  /**
   * Agenda auto-save com throttle (evita salvar a cada mensagem)
   */
  scheduleAutoSave() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);

    this._saveTimeout = setTimeout(() => {
      this.save();
    }, 2000); // Salva 2 segundos após última mudança
  }

  /**
   * Busca documento por ID
   * @param {string} documentId - ID do documento
   * @returns {Object|null} Documento encontrado ou null
   */
  getDocument(documentId) {
    return this.processedDocuments.find(d => d.id === documentId);
  }

  /**
   * Busca documento por nome (busca parcial, case-insensitive)
   * @param {string} searchTerm - Termo de busca
   * @returns {Array} Documentos encontrados
   */
  searchDocuments(searchTerm) {
    const term = searchTerm.toLowerCase();

    return this.processedDocuments.filter(doc =>
      doc.name.toLowerCase().includes(term) ||
      doc.id.includes(term)
    );
  }


  /**
   * Obtém texto completo de um documento (do cache se disponível)
   * @param {string} documentId - ID do documento
   * @returns {Promise<string|null>} Texto do documento ou null
   */
  async getDocumentText(documentId) {
    // Primeiro, verificar se está no contexto
    const doc = this.getDocument(documentId);

    if (doc && doc.data.texto) {
      console.log(`✅ LEX: Texto do documento ${documentId} recuperado do contexto`);
      return doc.data.texto;
    }

    // Se não, tentar cache
    if (this.cache) {
      const cached = this.cache.get(documentId);
      if (cached && cached.texto) {
        console.log(`✅ LEX: Texto do documento ${documentId} recuperado do cache`);
        return cached.texto;
      }
    }

    console.warn(`⚠️ LEX: Documento ${documentId} não encontrado no contexto ou cache`);
    return null;
  }

  /**
   * Gera contexto resumido para enviar à IA em conversações
   * @param {Object} options - Opções de geração
   * @returns {string} Contexto formatado
   */
  generateContextSummary(options = {}) {
    const includeFullText = options.includeFullText || false;
    const maxDocuments = options.maxDocuments || 10;
    const maxCharsPerDoc = options.maxCharsPerDoc || 10000; // ✅ 10K chars default (vs 500)
    const maxAnalysisChars = options.maxAnalysisChars || 5000; // ✅ 5K chars para análise

    let context = `# CONTEXTO DO PROCESSO\n\n`;

    // INFORMAÇÕES DO PROCESSO
    if (this.processInfo) {
      context += `## Informações do Processo\n\n`;
      context += `- **Número**: ${this.processNumber || 'N/A'}\n`;
      context += `- **Tribunal**: ${this.processInfo.tribunal || 'N/A'}\n`;
      context += `- **Classe**: ${this.processInfo.classeProcessual || 'N/A'}\n`;
      context += `- **Assunto**: ${this.processInfo.assunto || 'N/A'}\n`;
      context += `- **Autor/Requerente**: ${this.processInfo.autor || 'N/A'}\n`;
      context += `- **Réu/Requerido**: ${this.processInfo.reu || 'N/A'}\n\n`;
    } else {
      context += `## Processo: ${this.processNumber}\n\n`;
    }

    // ANÁLISE ANTERIOR (SE HOUVER) - ✅ EXPANDIDO
    if (this.lastAnalysis && options.includeLastAnalysis) {
      context += `## Análise Anterior\n\n`;
      const analiseContent = typeof this.lastAnalysis.content === 'string'
        ? this.lastAnalysis.content
        : JSON.stringify(this.lastAnalysis.content);

      const analisePreview = analiseContent.substring(0, maxAnalysisChars);
      context += `${analisePreview}${analiseContent.length > maxAnalysisChars ? '...' : ''}\n\n`;
    }

    // DOCUMENTOS PROCESSADOS - ✅ TEXTO COMPLETO OU EXPANDIDO
    context += `## Documentos Processados (${this.processedDocuments.length} total)\n\n`;

    const docs = this.processedDocuments.slice(0, maxDocuments);

    docs.forEach((doc, i) => {
      context += `${i + 1}. **${doc.name}** (ID: ${doc.id})\n`;
      context += `   - Tipo: ${doc.data.tipo}\n`;
      context += `   - Páginas: ${doc.data.paginas || 'N/A'}\n`;

      if (doc.data.texto) {
        if (includeFullText) {
          // ✅ TEXTO COMPLETO quando solicitado
          const textoCompleto = doc.data.texto.substring(0, maxCharsPerDoc);
          context += `   - Conteúdo (${textoCompleto.length} caracteres):\n`;
          context += `${textoCompleto}${doc.data.texto.length > maxCharsPerDoc ? '\n   [... continua]' : ''}\n`;
        } else {
          // Preview curto quando não solicita full text
          const preview = doc.data.texto.substring(0, 500);
          context += `   - Preview: ${preview}...\n`;
        }
      } else {
        context += `   - Conteúdo: [Não extraído]\n`;
      }

      context += '\n';
    });

    if (this.processedDocuments.length > maxDocuments) {
      context += `... e mais ${this.processedDocuments.length - maxDocuments} documentos\n\n`;
    }

    // HISTÓRICO RECENTE (últimas 3 mensagens)
    if (this.conversationHistory.length > 0 && options.includeHistory) {
      context += `## Histórico Recente da Conversa\n\n`;
      const recentHistory = this.conversationHistory.slice(-3);
      recentHistory.forEach(msg => {
        context += `- **${msg.role}**: ${msg.content.substring(0, 100)}...\n`;
      });
      context += '\n';
    }

    return context;
  }

  /**
   * Obtém estatísticas da sessão
   * @returns {Object} Estatísticas
   */
  getStats() {
    return {
      processNumber: this.processNumber,
      totalDocuments: this.documents.length,
      processedDocuments: this.processedDocuments.length,
      conversationMessages: this.conversationHistory.length,
      hasAnalysis: !!this.lastAnalysis,
      sessionAge: Date.now() - this.createdAt.getTime()
    };
  }

  /**
   * Salva sessão no localStorage
   * @param {number} ttl - Time to live em horas (padrão: 24h)
   */
  save(ttl = 24) {
    try {
      const sessionData = {
        processNumber: this.processNumber,
        processInfo: this.processInfo,
        documents: this.documents,
        processedDocuments: this.processedDocuments,
        conversationHistory: this.conversationHistory.slice(-20), // Últimas 20 mensagens
        lastAnalysis: this.lastAnalysis,
        createdAt: this.createdAt,
        expiresAt: Date.now() + (ttl * 60 * 60 * 1000),
        version: '1.0'
      };

      localStorage.setItem('lex_session', JSON.stringify(sessionData));
      console.log(`💾 LEX: Sessão salva (expira em ${ttl}h)`);

      return true;
    } catch (error) {
      console.error('❌ LEX: Erro ao salvar sessão:', error);
      return false;
    }
  }

  /**
   * Restaura sessão do localStorage
   * @returns {boolean} True se restaurou com sucesso
   */
  restore() {
    try {
      const saved = localStorage.getItem('lex_session');

      if (!saved) {
        console.log('📭 LEX: Nenhuma sessão salva encontrada');
        return false;
      }

      const sessionData = JSON.parse(saved);

      // Verificar expiração
      if (Date.now() > sessionData.expiresAt) {
        console.log('⏰ LEX: Sessão expirada, removendo...');
        localStorage.removeItem('lex_session');
        return false;
      }

      // Restaurar dados
      this.processNumber = sessionData.processNumber;
      this.processInfo = sessionData.processInfo;
      this.documents = sessionData.documents || [];
      this.processedDocuments = sessionData.processedDocuments || [];
      this.conversationHistory = sessionData.conversationHistory || [];
      this.lastAnalysis = sessionData.lastAnalysis;
      this.createdAt = new Date(sessionData.createdAt);

      const horasRestantes = Math.round((sessionData.expiresAt - Date.now()) / (60 * 60 * 1000));

      console.log(`✅ LEX: Sessão restaurada (${this.processedDocuments.length} docs, expira em ${horasRestantes}h)`);

      return true;
    } catch (error) {
      console.error('❌ LEX: Erro ao restaurar sessão:', error);
      localStorage.removeItem('lex_session');
      return false;
    }
  }

  /**
   * Limpa contexto da sessão
   */
  clear() {
    this.processNumber = null;
    this.processInfo = null;
    this.documents = [];
    this.processedDocuments = [];
    this.conversationHistory = [];
    this.lastAnalysis = null;

    // Limpar localStorage também
    localStorage.removeItem('lex_session');

    console.log('🗑️ LEX: Contexto da sessão limpo');
  }

  /**
   * Verifica se há sessão ativa
   * @returns {boolean} True se há sessão ativa
   */
  isActive() {
    return !!this.processNumber && this.processedDocuments.length > 0;
  }
}

// Tornar disponível globalmente
if (typeof window !== 'undefined') {
  window.SessionContext = SessionContext;

  // Criar instância global
  if (!window.lexSession) {
    window.lexSession = new SessionContext();

    // AUTO-RESTORE: Tentar restaurar sessão salva
    const restored = window.lexSession.restore();

    if (restored) {
      console.log('🔄 LEX: Sessão anterior restaurada automaticamente');
    }
  }

  console.log('✅ LEX: SessionContext carregado com sucesso');
}
