// Process Analyzer - Orquestra a análise completa de um processo judicial
// Part of LEX Document Processing System
// Coordena crawler, fetcher, processor e envio para API

class ProcessAnalyzer {
  constructor() {
    this.crawler = new window.ProcessCrawler();
    this.cache = new window.DocumentCache({ ttl: 30 * 60 * 1000 }); // 30 minutos
    this.documentDetector = window.DocumentDetector;
    this.session = window.lexSession || new window.SessionContext(); // Contexto da sessão

    this.state = {
      status: 'idle', // idle, discovering, downloading, processing, analyzing, completed, error
      processNumber: null,
      documents: [],
      processed: [],
      errors: [],
      startTime: null,
      endTime: null,
      progress: {
        total: 0,
        current: 0,
        percentage: 0,
        currentDocument: null
      }
    };

    // Configurações
    this.config = {
      rateLimitDelay: 200, // OTIMIZADO: 200ms entre downloads (era 500ms)
      maxConcurrent: 6, // OTIMIZADO: 6 downloads simultâneos (era 3)
      maxDocumentSize: 10 * 1024 * 1024, // 10MB por documento
      batchSize: 20, // OTIMIZADO: Todos documentos em 1 batch (era 5)
      maxContentPerDoc: 200, // REDUZIDO: apenas preview de 200 caracteres
      useCache: true,
      processPDFs: true,
      processImages: false // OCR ainda não implementado
    };

    // Callbacks de progresso
    this.callbacks = {
      onProgress: null,
      onDocumentProcessed: null,
      onBatchSent: null,
      onComplete: null,
      onError: null
    };

    console.log('🎯 LEX: ProcessAnalyzer instanciado');
  }

  /**
   * Inicia análise completa do processo
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resultado da análise
   */
  async analyze(options = {}) {
    console.log('🚀 LEX: Iniciando análise completa do processo...');

    this.state.status = 'discovering';
    this.state.startTime = Date.now();

    try {
      // Aplicar opções customizadas
      Object.assign(this.config, options);

      // 1. DESCOBERTA: Encontrar todos os documentos
      this.updateProgress('Descobrindo documentos do processo...');

      this.state.documents = await this.crawler.discoverAllDocuments();
      this.state.processNumber = this.crawler.processNumber;
      this.state.progress.total = this.state.documents.length;

      if (this.state.documents.length === 0) {
        throw new Error('Nenhum documento encontrado no processo');
      }

      console.log(`📋 LEX: ${this.state.documents.length} documentos descobertos`);

      // INICIALIZAR SESSÃO COM DOCUMENTOS DESCOBERTOS E INFORMAÇÕES DO PROCESSO
      this.session.initialize({
        processNumber: this.state.processNumber,
        processInfo: this.processInfo || null, // Informações extraídas do DOM
        documents: this.state.documents,
        cache: this.cache
      });

      // 2. DOWNLOAD E PROCESSAMENTO: Baixar e processar cada documento
      this.state.status = 'processing';
      this.updateProgress('Baixando e processando documentos...');

      await this.processAllDocuments();

      console.log(`LEX: ${this.state.processed.length} documentos processados com sucesso`);

      if (this.state.errors.length > 0) {
        console.warn(`LEX: ${this.state.errors.length} documentos com erro`);
      }

      // 3. CLASSIFICAÇÃO AUTOMÁTICA: Organizar documentos por tipo e relevância
      this.state.status = 'classifying';
      this.updateProgress('Organizando documentos...');

      const classifier = new window.DocumentClassifier();
      const organized = classifier.organize(this.state.processed.map(p => ({
        ...p.document,
        content: p.data.content || p.data.texto || ''
      })));

      console.log('LEX: Documentos organizados:', organized.summary);

      // Salvar organização na sessão
      this.session.setOrganizedDocuments(organized);

      // NÃO ENVIAR PARA IA AUTOMATICAMENTE
      // Usuário pode pedir análise depois com documentos específicos
      const analysisResult = {
        type: 'organization',
        message: 'Documentos baixados e organizados. Use comandos para análises específicas.',
        organized: organized.summary
      };

      // 4. FINALIZAÇÃO
      this.state.status = 'completed';
      this.state.endTime = Date.now();

      const result = {
        success: true,
        processNumber: this.state.processNumber,
        statistics: this.getStatistics(),
        analysis: analysisResult,
        processingTime: this.state.endTime - this.state.startTime
      };

      console.log('🎉 LEX: Análise completa concluída!');
      console.log('📊 LEX: Estatísticas:', result.statistics);
      console.log('🔍 DEBUG analyze(): result final a ser retornado:', result);
      console.log(`💬 LEX: Sessão ativa com ${this.session.processedDocuments.length} documentos disponíveis para conversa`);

      if (this.callbacks.onComplete) {
        console.log('🔍 DEBUG analyze(): Chamando callback onComplete com result:', result);
        this.callbacks.onComplete(result);
      }

      return result;

    } catch (error) {
      console.error('❌ LEX: Erro na análise completa:', error);

      this.state.status = 'error';
      this.state.endTime = Date.now();

      const errorResult = {
        success: false,
        error: error.message,
        processNumber: this.state.processNumber,
        statistics: this.getStatistics(),
        processingTime: this.state.endTime - this.state.startTime
      };

      if (this.callbacks.onError) {
        this.callbacks.onError(errorResult);
      }

      throw error;
    }
  }

  /**
   * Processa todos os documentos descobertos
   * @returns {Promise<void>}
   */
  async processAllDocuments() {
    const documents = this.state.documents;
    const batches = this.createBatches(documents, this.config.maxConcurrent);

    for (const batch of batches) {
      // Processar batch em paralelo
      const promises = batch.map(doc => this.processDocument(doc));

      try {
        await Promise.all(promises);
      } catch (error) {
        console.error('❌ LEX: Erro ao processar batch:', error);
        // Continuar com próximo batch
      }

      // Rate limiting entre batches
      await this.delay(this.config.rateLimitDelay);
    }
  }

  /**
   * Processa um documento individual
   * @param {Object} document - Documento a processar
   * @returns {Promise<void>}
   */
  async processDocument(document) {
    console.log(`📄 LEX: Processando documento ${document.id}...`);

    this.state.progress.currentDocument = document;
    this.updateProgress(`Processando: ${document.name}`);

    try {
      // Verificar cache
      if (this.config.useCache && this.cache.has(document.id)) {
        console.log(`💾 LEX: Documento ${document.id} encontrado no cache`);
        const cachedData = this.cache.get(document.id);

        this.state.processed.push({
          document: document,
          data: cachedData,
          fromCache: true
        });

        this.incrementProgress();
        return;
      }

      // Baixar documento
      const blob = await this.downloadDocument(document.url);

      if (!blob) {
        throw new Error('Falha ao baixar documento');
      }

      // Verificar tamanho - AVISAR mas NÃO FALHAR
      if (blob.size > this.config.maxDocumentSize) {
        console.warn(`⚠️ LEX: Documento ${document.id} muito grande (${this.formatBytes(blob.size)}), pulando processamento...`);

        // Adicionar aos processados com marcação de "muito grande"
        this.state.processed.push({
          document: document,
          data: {
            texto: `[Documento muito grande: ${this.formatBytes(blob.size)} - Não processado]`,
            tipo: 'skipped',
            tamanho: blob.size
          },
          skipped: true
        });

        this.incrementProgress();
        return;
      }

      // Detectar tipo de documento
      const contentType = blob.type;
      const docType = this.documentDetector.detectDocumentType(document.url, contentType);

      console.log(`📋 LEX: Tipo detectado: ${docType}`);

      // Processar baseado no tipo
      let extractedData = null;

      switch (docType) {
        case 'PDF':
          if (this.config.processPDFs) {
            extractedData = await this.processPDF(blob, document);
          } else {
            console.log('⏭️ LEX: Processamento de PDF desabilitado');
          }
          break;

        case 'IMAGE':
          if (this.config.processImages) {
            extractedData = await this.processImage(blob, document);
          } else {
            console.log('⏭️ LEX: Processamento de imagem desabilitado');
          }
          break;

        case 'HTML':
        default:
          extractedData = await this.processHTML(document.url);
          break;
      }

      // Salvar resultado
      const processedData = {
        documentId: document.id,
        documentName: document.name,
        documentType: docType,
        url: document.url,
        content: extractedData?.text || extractedData?.conteudo || '',
        metadata: {
          ...document.metadata,
          processedAt: new Date().toISOString(),
          contentType: contentType,
          size: blob.size,
          ...extractedData?.metadata
        }
      };

      // Cachear resultado
      if (this.config.useCache) {
        this.cache.set(document.id, processedData);
      }

      this.state.processed.push({
        document: document,
        data: processedData,
        fromCache: false
      });

      // ADICIONAR À SESSÃO PARA ACESSO FUTURO
      this.session.addProcessedDocument(document, processedData);

      this.incrementProgress();

      if (this.callbacks.onDocumentProcessed) {
        this.callbacks.onDocumentProcessed(processedData);
      }

      console.log(`✅ LEX: Documento ${document.id} processado com sucesso`);

    } catch (error) {
      console.error(`❌ LEX: Erro ao processar documento ${document.id}:`, error);

      this.state.errors.push({
        document: document,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      this.incrementProgress();
    }
  }

  /**
   * Baixa um documento via fetch autenticado
   * @param {string} url - URL do documento
   * @returns {Promise<Blob>} Blob do documento
   */
  async downloadDocument(url) {
    try {
      console.log('📥 LEX: Baixando documento:', url);

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': '*/*',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();

      console.log('✅ LEX: Download concluído:', this.formatBytes(blob.size));
      return blob;

    } catch (error) {
      console.error('❌ LEX: Erro ao baixar documento:', error);
      return null;
    }
  }

  /**
   * Processa um PDF
   * @param {Blob} blob - Blob do PDF
   * @param {Object} document - Metadados do documento
   * @returns {Promise<Object>} Dados extraídos
   */
  async processPDF(blob, document) {
    console.log('📄 LEX: Processando PDF...');

    try {
      // Usar PDFProcessor do TypeScript compilado
      if (!window.PDFProcessor) {
        console.warn('⚠️ LEX: PDFProcessor não disponível, usando fallback');
        return {
          text: '[PDF - processamento não disponível]',
          metadata: { type: 'PDF' }
        };
      }

      // Instanciar processor
      const processor = new window.PDFProcessor();

      await processor.initialize();

      const result = await processor.extractTextFromPDF(blob, {
        includeMetadata: true,
        includePageNumbers: true,
        maxPages: 50, // OTIMIZADO: Limitar a 50 páginas (era 100) para evitar timeout
        progressCallback: (progress) => {
          // Reduzir logs para melhor performance
          if (progress.currentPage % 5 === 0) {
            console.log(`LEX: Processando página ${progress.currentPage}/${progress.totalPages}`);
          }
        }
      });

      console.log('✅ LEX: PDF processado:', {
        páginas: result.stats.processedPages,
        caracteres: result.stats.totalCharacters
      });

      return {
        text: result.text,
        metadata: {
          ...result.metadata,
          stats: result.stats
        }
      };

    } catch (error) {
      console.error('❌ LEX: Erro ao processar PDF:', error);
      return {
        text: '[PDF - erro ao processar]',
        metadata: { type: 'PDF', error: error.message }
      };
    }
  }

  /**
   * Processa uma imagem (placeholder para OCR)
   * @param {Blob} blob - Blob da imagem
   * @param {Object} document - Metadados do documento
   * @returns {Promise<Object>} Dados extraídos
   */
  async processImage(blob, document) {
    console.log('🖼️ LEX: Processando imagem...');

    // TODO: Implementar OCR com Tesseract.js
    return {
      text: '[Imagem - OCR será implementado em breve]',
      metadata: {
        type: 'IMAGE',
        size: blob.size
      }
    };
  }

  /**
   * Processa um documento HTML/texto
   * @param {string} url - URL do documento
   * @returns {Promise<Object>} Dados extraídos
   */
  async processHTML(url) {
    console.log('📄 LEX: Processando HTML/texto...');

    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'text/html,text/plain,*/*',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();

      // Limpar HTML se necessário
      const cleanText = this.cleanHTML(text);

      return {
        text: cleanText,
        metadata: { type: 'HTML' }
      };

    } catch (error) {
      console.error('❌ LEX: Erro ao processar HTML:', error);
      return {
        text: '[HTML - erro ao processar]',
        metadata: { type: 'HTML', error: error.message }
      };
    }
  }

  /**
   * Limpa tags HTML de um texto
   * @param {string} html - HTML a limpar
   * @returns {string} Texto limpo
   */
  cleanHTML(html) {
    try {
      const div = document.createElement('div');
      div.innerHTML = html;

      // Remover scripts e styles
      const scripts = div.querySelectorAll('script, style, noscript');
      scripts.forEach(el => el.remove());

      // Extrair texto
      let text = div.innerText || div.textContent || '';

      // Normalizar espaços
      text = text
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      return text;

    } catch (error) {
      // Fallback: remover tags manualmente
      return html.replace(/<[^>]*>/g, '').trim();
    }
  }

  /**
   * Envia documentos processados para API em lotes
   * @returns {Promise<Object>} Resultado da análise
   */
  async sendToAPI() {
    console.log('📤 LEX: Enviando documentos para API...');

    // 🧪 MODO DE DESENVOLVIMENTO: Usar mock se endpoint não estiver disponível
    const useMock = false; // ✅ ENDPOINT REAL ATIVADO!

    if (useMock) {
      console.log('🧪 LEX: Usando mock da API (desenvolvimento)');
      return await this.sendToAPIMock();
    }

    try {
      // Preparar dados dos documentos
      const documents = this.state.processed.map(p => ({
        id: p.data.documentId,
        nome: p.data.documentName,
        tipo: p.data.documentType,
        conteudo: p.data.content,
        metadata: p.data.metadata
      }));

      // Criar batches
      const batches = this.createBatches(documents, this.config.batchSize);

      console.log(`📦 LEX: ${batches.length} batches para enviar`);

      // 🎯 Usar o endpoint OPENIA que já existe e funciona!
      const apiUrl = 'https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/OPENIA';
      const apiKey = (
        window.LEX_SUPABASE_ANON_KEY ||
        localStorage.getItem('LEX_SUPABASE_ANON_KEY') ||
        ''
      ).trim();
      if (!apiKey) {
        throw new Error('Supabase key nao configurada (LEX_SUPABASE_ANON_KEY)');
      }

      let allResults = [];

      // Enviar cada batch
      for (let i = 0; i < batches.length; i++) {
        console.log(`📤 LEX: Enviando batch ${i + 1}/${batches.length}...`);

        // ✅ CONTEXTO EXPANDIDO: Enviar texto completo dos documentos (até 15K chars cada)
        const documentosTexto = batches[i].map((doc, idx) => {
          let conteudo = doc.conteudo || '(sem conteúdo)';

          // OTIMIZADO: 8.000 caracteres por documento (era 15.000) para respostas mais rápidas
          const textoCompleto = conteudo.substring(0, 8000).replace(/\s+/g, ' ').trim();

          return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOCUMENTO ${idx + 1}: ${doc.nome}
Tipo: ${doc.tipo || 'Não identificado'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${textoCompleto}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        }).join('\n\n');

        // ✅ PROMPT DETALHADO E COMPLETO para análise profunda
        const isUltimoBatch = (i === batches.length - 1);

        const promptCompleto = isUltimoBatch
          ? `Você é Lex, assistente jurídica especializada em análise processual brasileira.

PROCESSO: ${this.state.processNumber}
BATCH: ${i + 1} de ${batches.length} (ÚLTIMO BATCH - ANÁLISE FINAL)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOCUMENTOS COMPLETOS DO PROCESSO:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${documentosTexto}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUÇÕES PARA ANÁLISE CONSOLIDADA FINAL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Este é o ÚLTIMO batch. Forneça uma **ANÁLISE COMPLETA E CONSOLIDADA** do processo inteiro, incluindo:

**1. RESUMO EXECUTIVO** (3-4 parágrafos)
   - Natureza do processo (tipo de ação, objeto, valor envolvido)
   - Partes envolvidas (com qualificação completa se disponível)
   - Fase processual ATUAL (em que ponto está o processo agora?)
   - Pedidos principais de cada parte

**2. DOCUMENTOS CRÍTICOS** (listar os 3-5 mais importantes)
   - Nome do documento
   - Data (se disponível)
   - Relevância para o processo
   - Principais informações extraídas

**3. TIMELINE CRONOLÓGICA**
   - Principais marcos processuais com datas
   - Sequência dos eventos importantes
   - Última movimentação registrada

**4. ANÁLISE JURÍDICA DETALHADA**
   - Teses sustentadas pelas partes (autor e réu)
   - Argumentos principais de cada lado
   - Questões de direito envolvidas
   - Base legal (cite leis/artigos APENAS se tiver certeza absoluta)

**5. PRAZOS E OBRIGAÇÕES**
   - Prazos pendentes ou próximos (se houver)
   - Ações necessárias
   - Obrigações das partes

**6. PRÓXIMOS PASSOS RECOMENDADOS**
   - Ações imediatas sugeridas
   - Estratégia processual
   - Pontos de atenção

**7. OBSERVAÇÕES IMPORTANTES**
   - Peculiaridades do processo
   - Riscos identificados
   - Oportunidades processuais

IMPORTANTE:
- Use linguagem clara, técnica e profissional
- Base-se EXCLUSIVAMENTE nos documentos fornecidos
- Cite fatos específicos extraídos dos documentos
- NÃO invente informações que não estejam nos documentos
- Se faltar alguma informação, indique claramente
- Organize com HTML simples (<strong>, <br>, <em>)
- Seja COMPLETO e DETALHADO (não resumido demais)`
          : `Você é Lex, assistente jurídica especializada em análise processual.

PROCESSO: ${this.state.processNumber}
BATCH PARCIAL: ${i + 1} de ${batches.length}

DOCUMENTOS DESTE BATCH:

${documentosTexto}

INSTRUÇÕES:

Este é um batch PARCIAL (não é o último). Faça uma análise PRELIMINAR destes documentos:

1. **Identificação**: Tipo de cada documento e data (se disponível)
2. **Informações-chave**: Extraia os dados mais importantes de cada um
3. **Pontos relevantes**: Destaque informações críticas encontradas
4. **Observações**: Anote peculiaridades ou informações importantes

Aguarde os próximos batches para análise consolidada final. Seja objetivo mas completo.`;

        const payload = {
          pergunta: promptCompleto,
          contexto: `Análise completa do processo ${this.state.processNumber}`
        };

        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'apikey': apiKey
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API erro ${response.status}: ${errorText}`);
          }

          const result = await response.json();

          // O endpoint /OPENIA retorna { resposta: "..." } ou { fallback: "..." }
          const analise = result.resposta || result.fallback || result;
          allResults.push({
            analise: analise,
            resposta: analise // manter compatibilidade com consolidateResults
          });

          console.log(`✅ LEX: Batch ${i + 1} enviado com sucesso`);

          if (this.callbacks.onBatchSent) {
            this.callbacks.onBatchSent({
              batch: i + 1,
              total: batches.length,
              result: result
            });
          }

          // Delay entre batches
          if (i < batches.length - 1) {
            await this.delay(1000);
          }

        } catch (error) {
          console.error(`❌ LEX: Erro ao enviar batch ${i + 1}:`, error);
          // Continuar com próximo batch
        }
      }

      // Consolidar resultados
      console.log('🔍 DEBUG: Saiu do loop, allResults length:', allResults.length);
      console.log('🔍 DEBUG: allResults:', allResults);

      console.log('🔍 DEBUG: Chamando consolidateResults...');
      const consolidatedResult = this.consolidateResults(allResults);
      console.log('🔍 DEBUG: consolidatedResult:', consolidatedResult);

      console.log('✅ LEX: Todos os batches enviados');

      return consolidatedResult;

    } catch (error) {
      console.error('❌ LEX: Erro ao enviar para API:', error);
      throw error;
    }
  }

  /**
   * Mock da API para desenvolvimento/testes
   * @returns {Promise<Object>} Resultado simulado
   */
  async sendToAPIMock() {
    console.log('🧪 LEX: Modo mock ativado - simulando análise...');

    // Preparar dados dos documentos
    const documents = this.state.processed.map(p => ({
      id: p.data.documentId,
      nome: p.data.documentName,
      tipo: p.data.documentType
    }));

    // Simular delay de processamento
    await this.delay(2000);

    // Gerar análise mock baseada nos documentos
    const documentosLista = documents.map(d =>
      `<li><strong>${d.nome}</strong> (${d.tipo})</li>`
    ).join('');

    const analise = `
      <strong>📊 Análise Completa do Processo ${this.state.processNumber}</strong><br><br>

      <strong>1. Resumo Executivo</strong><br>
      O processo foi analisado com sucesso. Foram identificados ${documents.length} documentos
      que compõem os autos digitais. A análise contemplou petições iniciais, decisões,
      despachos e demais documentos processuais.<br><br>

      <strong>2. Documentos Analisados</strong><br>
      <ul style="margin: 8px 0; padding-left: 20px;">
        ${documentosLista}
      </ul><br>

      <strong>3. Fase Processual</strong><br>
      Com base na análise documental, o processo encontra-se em fase de conhecimento,
      aguardando manifestações das partes ou decisão judicial.<br><br>

      <strong>4. Próximos Passos Recomendados</strong><br>
      • Verificar prazos pendentes no sistema<br>
      • Acompanhar movimentações processuais<br>
      • Preparar petições necessárias<br><br>

      <em style="color: #888; font-size: 11px;">
        ⚠️ Análise gerada em modo mock para desenvolvimento.<br>
        Configure o endpoint Supabase para análise real com IA.
      </em>
    `;

    return {
      resumo: analise,
      success: true,
      mock: true
    };
  }

  /**
   * Consolida resultados de múltiplos batches
   * @param {Array} results - Resultados dos batches
   * @returns {Object} Resultado consolidado
   */
  consolidateResults(results) {
    console.log('🔍 DEBUG consolidateResults: Recebeu', results.length, 'resultados');

    if (results.length === 0) {
      console.log('🔍 DEBUG consolidateResults: Nenhum resultado');
      return {
        resumo: 'Nenhum resultado obtido da API',
        detalhes: []
      };
    }

    if (results.length === 1) {
      console.log('🔍 DEBUG consolidateResults: Único resultado, retornando direto');
      return results[0];
    }

    // Consolidar múltiplos resultados
    console.log('🔍 DEBUG consolidateResults: Consolidando', results.length, 'resultados');
    const consolidated = {
      resumo: results.map(r => r.resposta || r.resumo || '').join('\n\n'),
      batches: results.length,
      detalhes: results
    };
    console.log('🔍 DEBUG consolidateResults: Resultado consolidado:', consolidated);
    return consolidated;
  }

  /**
   * Cria batches de items
   * @param {Array} items - Items a dividir
   * @param {number} batchSize - Tamanho do batch
   * @returns {Array<Array>} Array de batches
   */
  createBatches(items, batchSize) {
    const batches = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Atualiza progresso e notifica callback
   * @param {string} message - Mensagem de progresso
   */
  updateProgress(message) {
    this.state.progress.message = message;

    console.log(`⏳ LEX: ${message}`);

    if (this.callbacks.onProgress) {
      this.callbacks.onProgress({
        ...this.state.progress,
        message: message,
        status: this.state.status
      });
    }
  }

  /**
   * Incrementa contador de progresso
   */
  incrementProgress() {
    this.state.progress.current++;
    this.state.progress.percentage = (this.state.progress.current / this.state.progress.total) * 100;

    this.updateProgress(`Processados ${this.state.progress.current} de ${this.state.progress.total} documentos`);
  }

  /**
   * Retorna estatísticas da análise
   * @returns {Object} Estatísticas
   */
  getStatistics() {
    return {
      processNumber: this.state.processNumber,
      totalDocuments: this.state.documents.length,
      processedDocuments: this.state.processed.length,
      fromCache: this.state.processed.filter(p => p.fromCache).length,
      errors: this.state.errors.length,
      processingTime: this.state.endTime ? this.state.endTime - this.state.startTime : 0,
      errorList: this.state.errors
    };
  }

  /**
   * Registra callback de progresso
   * @param {string} event - Nome do evento
   * @param {Function} callback - Função callback
   */
  on(event, callback) {
    if (this.callbacks.hasOwnProperty(`on${event.charAt(0).toUpperCase() + event.slice(1)}`)) {
      this.callbacks[`on${event.charAt(0).toUpperCase() + event.slice(1)}`] = callback;
    }
  }

  /**
   * Delay helper
   * @param {number} ms - Milissegundos
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Formata bytes
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
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.ProcessAnalyzer = ProcessAnalyzer;
}

console.log('✅ LEX: ProcessAnalyzer carregado com sucesso');
