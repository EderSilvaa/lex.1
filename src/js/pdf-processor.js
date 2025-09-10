// PDF Processor - PDF.js integration for LEX Document Processing System
// Handles PDF text extraction and metadata processing with robust worker configuration

class PDFProcessor {
  constructor() {
    this.pdfjsLib = null;
    this.initialized = false;
    this.loading = false;
    this.version = '3.11.174'; // PDF.js version
    this.workerSrc = null;
    
    console.log('📄 LEX: PDFProcessor instanciado');
  }
  
  /**
   * Inicializa o PDF.js carregando a biblioteca via CDN
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      console.log('✅ LEX: PDF.js já inicializado');
      return;
    }
    
    if (this.loading) {
      console.log('⏳ LEX: PDF.js já está carregando, aguardando...');
      return this.waitForInitialization();
    }
    
    console.log('🔧 LEX: Inicializando PDF.js...');
    this.loading = true;
    
    try {
      await this.loadPDFJS();
      await this.configurePDFJS();
      
      this.initialized = true;
      this.loading = false;
      
      console.log('✅ LEX: PDF.js inicializado com sucesso');
      console.log('- Versão:', this.version);
      console.log('- Worker configurado:', !!this.workerSrc);
      
    } catch (error) {
      this.loading = false;
      console.error('❌ LEX: Erro ao inicializar PDF.js:', error);
      throw new Error(`Falha ao carregar PDF.js: ${error.message}`);
    }
  }
  
  /**
   * Verifica se PDF.js já está carregado (via content script)
   * @returns {Promise<void>}
   */
  async loadPDFJS() {
    return new Promise((resolve, reject) => {
      console.log('📚 LEX: Verificando PDF.js pré-carregado...');
      
      // PDF.js deve estar disponível pois foi carregado como content script
      this.waitForPDFJS(resolve, reject);
    });
  }
  
  /**
   * Aguarda PDF.js estar disponível no window
   */
  waitForPDFJS(resolve, reject) {
    let attempts = 0;
    const maxAttempts = 100; // 10 segundos (mais tempo pois pode demorar para carregar)
    
    const checkPDFJS = () => {
      attempts++;
      
      console.log(`🔍 LEX: Tentativa ${attempts}/${maxAttempts} - Verificando PDF.js pré-carregado...`);
      
      // Tentar diferentes formas de acessar PDF.js
      const possibleAccess = [
        () => window.pdfjsLib,
        () => window['pdfjs-dist/build/pdf'],
        () => globalThis.pdfjsLib,
        () => self.pdfjsLib,
        () => window.pdfjsLib || window.pdfjs
      ];
      
      for (let i = 0; i < possibleAccess.length; i++) {
        try {
          const pdfjs = possibleAccess[i]();
          if (pdfjs && typeof pdfjs === 'object' && pdfjs.getDocument) {
            this.pdfjsLib = pdfjs;
            console.log(`✅ LEX: PDF.js encontrado como content script (método ${i + 1})`);
            resolve();
            return;
          }
        } catch (e) {
          // Ignorar erros de acesso
        }
      }
      
      // Debug detalhado a cada 10 tentativas
      if (attempts % 10 === 1) {
        console.log('🔍 LEX: Propriedades do window com "pdf":', 
          Object.keys(window).filter(k => k.toLowerCase().includes('pdf')));
        console.log('🔍 LEX: window.pdfjsLib:', typeof window.pdfjsLib);
        console.log('🔍 LEX: globalThis.pdfjsLib:', typeof globalThis.pdfjsLib);
      }
      
      if (attempts < maxAttempts) {
        setTimeout(checkPDFJS, 100);
      } else {
        console.error('❌ LEX: PDF.js não encontrado após', maxAttempts, 'tentativas');
        console.log('🔍 LEX: Todas as propriedades do window (primeiras 50):', Object.keys(window).slice(0, 50));
        reject(new Error('PDF.js não disponível - verifique se foi carregado como content script'));
      }
    };
    
    // Iniciar verificação imediatamente
    checkPDFJS();
  }
  
  /**
   * Configura o PDF.js com worker e parâmetros
   * @returns {Promise<void>}
   */
  async configurePDFJS() {
    if (!this.pdfjsLib) {
      throw new Error('PDF.js não carregado');
    }
    
    console.log('⚙️ LEX: Configurando PDF.js worker...');
    
    // Configurar worker local com caminho correto
    this.workerSrc = chrome.runtime.getURL('src/js/pdf.worker.min.js');
    this.pdfjsLib.GlobalWorkerOptions.workerSrc = this.workerSrc;
    
    console.log('🔧 LEX: Worker configurado:', this.workerSrc);
    
    // Configurações globais
    this.pdfjsLib.GlobalWorkerOptions.verbosity = 0; // Reduzir logs
    
    // Validar se o worker foi carregado corretamente
    await this.validateWorkerConfiguration();
  }
  
  /**
   * Valida se a configuração do worker está funcionando
   * @returns {Promise<void>}
   */
  async validateWorkerConfiguration() {
    console.log('🔍 LEX: Validando configuração do worker...');
    
    try {
      // Testar com um PDF mínimo válido (header PDF)
      const testPdfData = new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, // %PDF-1.4
        0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A, 0x0A, // Binary comment
        0x31, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 1 0 obj
        0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, // <</Type/
        0x43, 0x61, 0x74, 0x61, 0x6C, 0x6F, 0x67, 0x2F, // Catalog/
        0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20, // Pages 2 
        0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, 0x65, 0x6E, // 0 R>>.en
        0x64, 0x6F, 0x62, 0x6A, 0x0A, 0x0A              // dobj..
      ]);
      
      const loadingTask = this.pdfjsLib.getDocument(testPdfData);
      
      // Tentar carregar o documento de teste
      try {
        const pdf = await loadingTask.promise;
        console.log('✅ LEX: Worker PDF.js funcionando corretamente');
        console.log('- Worker Source:', this.workerSrc);
        console.log('- PDF Test Document carregado com sucesso');
        return true;
      } catch (pdfError) {
        // Se o erro for sobre PDF inválido, o worker está funcionando
        if (pdfError.message.includes('Invalid PDF') || 
            pdfError.message.includes('Missing PDF header') ||
            pdfError.name === 'InvalidPDFException') {
          console.log('✅ LEX: Worker funcionando (erro de PDF esperado para teste)');
          return true;
        }
        
        // Se o erro for sobre worker, temos um problema
        if (pdfError.message.includes('Setting up fake worker failed') ||
            pdfError.message.includes('Cannot load script')) {
          console.error('❌ LEX: Erro de configuração do worker:', pdfError.message);
          throw new Error(`Worker não pôde ser carregado: ${pdfError.message}`);
        }
        
        // Outros erros também indicam problema com worker
        console.warn('⚠️ LEX: Possível problema com worker:', pdfError.message);
        throw pdfError;
      }
      
    } catch (error) {
      console.error('❌ LEX: Falha na validação do worker:', error.message);
      throw new Error(`Validação do worker falhou: ${error.message}`);
    }
  }
  
  /**
   * Aguarda a inicialização em andamento
   * @returns {Promise<void>}
   */
  async waitForInitialization() {
    const maxWait = 30000; // 30 segundos
    const checkInterval = 100; // 100ms
    let waited = 0;
    
    while (this.loading && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
    
    if (this.loading) {
      throw new Error('Timeout aguardando inicialização do PDF.js');
    }
    
    if (!this.initialized) {
      throw new Error('PDF.js falhou ao inicializar');
    }
  }
  
  /**
   * Verifica se o PDF.js está pronto para uso
   * @returns {boolean}
   */
  isReady() {
    return this.initialized && this.pdfjsLib && !this.loading;
  }
  
  /**
   * Obtém informações sobre o estado do PDF.js
   * @returns {Object}
   */
  getStatus() {
    return {
      initialized: this.initialized,
      loading: this.loading,
      version: this.version,
      workerConfigured: !!this.workerSrc,
      workerSource: this.workerSrc,
      libraryAvailable: !!this.pdfjsLib,
      ready: this.isReady(),
      environment: this.getEnvironmentInfo()
    };
  }
  
  /**
   * Obtém informações sobre o ambiente de execução
   * @returns {Object}
   */
  getEnvironmentInfo() {
    return {
      isExtension: typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL,
      manifestVersion: chrome?.runtime?.getManifest?.()?.manifest_version || null,
      userAgent: navigator.userAgent,
      chromeVersion: this.getChromeVersion(),
      workerSupported: typeof Worker !== 'undefined'
    };
  }
  
  /**
   * Extrai versão do Chrome do user agent
   * @returns {string|null}
   */
  getChromeVersion() {
    const match = navigator.userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }
  
  /**
   * Testa a configuração do worker com diagnósticos detalhados
   * @returns {Promise<Object>}
   */
  async testWorkerConfiguration() {
    console.log('🧪 LEX: Iniciando teste de configuração do worker...');
    
    const testResult = {
      success: false,
      workerConfigured: false,
      workerFunctional: false,
      environment: this.getEnvironmentInfo(),
      errors: [],
      details: {}
    };
    
    try {
      // Verificar se está inicializado
      if (!this.isReady()) {
        await this.initialize();
      }
      
      testResult.workerConfigured = !!this.workerSrc;
      testResult.details.workerSource = this.workerSrc;
      
      // Testar funcionalidade do worker
      await this.validateWorkerConfiguration();
      testResult.workerFunctional = true;
      testResult.success = true;
      
      console.log('✅ LEX: Teste de configuração do worker bem-sucedido');
      
    } catch (error) {
      testResult.errors.push({
        type: 'worker_test_failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
      
      console.error('❌ LEX: Teste de configuração do worker falhou:', error.message);
    }
    
    return testResult;
  }
  
  /**
   * Valida se um blob é um PDF válido
   * @param {Blob} pdfBlob - Blob do PDF
   * @returns {Promise<boolean>}
   */
  async validatePDF(pdfBlob) {
    if (!this.isReady()) {
      await this.initialize();
    }
    
    try {
      const arrayBuffer = await pdfBlob.arrayBuffer();
      
      // Verificar assinatura PDF
      const uint8Array = new Uint8Array(arrayBuffer);
      const header = String.fromCharCode(...uint8Array.slice(0, 4));
      
      if (header !== '%PDF') {
        console.warn('⚠️ LEX: Arquivo não possui assinatura PDF válida');
        return false;
      }
      
      // Tentar carregar com PDF.js
      const loadingTask = this.pdfjsLib.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      
      // Verificar se tem pelo menos uma página
      if (pdf.numPages < 1) {
        console.warn('⚠️ LEX: PDF não possui páginas');
        return false;
      }
      
      console.log('✅ LEX: PDF válido confirmado');
      console.log('- Páginas:', pdf.numPages);
      
      return true;
      
    } catch (error) {
      console.warn('⚠️ LEX: PDF inválido:', error.message);
      return false;
    }
  }
  
  /**
   * Detecta se o PDF está protegido por senha
   * @param {Blob} pdfBlob - Blob do PDF
   * @returns {Promise<boolean>}
   */
  async isPasswordProtected(pdfBlob) {
    if (!this.isReady()) {
      await this.initialize();
    }
    
    try {
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const loadingTask = this.pdfjsLib.getDocument(arrayBuffer);
      
      try {
        await loadingTask.promise;
        return false; // Carregou sem senha
      } catch (error) {
        if (error.name === 'PasswordException') {
          console.log('🔒 LEX: PDF protegido por senha detectado');
          return true;
        }
        throw error; // Outro tipo de erro
      }
      
    } catch (error) {
      console.error('❌ LEX: Erro ao verificar proteção por senha:', error);
      throw error;
    }
  }
  
  /**
   * Obtém informações básicas do PDF sem extrair texto
   * @param {Blob} pdfBlob - Blob do PDF
   * @returns {Promise<Object>}
   */
  async getPDFInfo(pdfBlob) {
    if (!this.isReady()) {
      await this.initialize();
    }
    
    console.log('📊 LEX: Obtendo informações do PDF...');
    
    try {
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const loadingTask = this.pdfjsLib.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      
      // Obter metadados
      const metadata = await pdf.getMetadata();
      
      const info = {
        numPages: pdf.numPages,
        fileSize: pdfBlob.size,
        fileSizeFormatted: this.formatFileSize(pdfBlob.size),
        fingerprint: pdf.fingerprint,
        metadata: {
          title: metadata.info?.Title || null,
          author: metadata.info?.Author || null,
          subject: metadata.info?.Subject || null,
          creator: metadata.info?.Creator || null,
          producer: metadata.info?.Producer || null,
          creationDate: metadata.info?.CreationDate || null,
          modificationDate: metadata.info?.ModDate || null
        },
        pdfVersion: metadata.info?.PDFFormatVersion || null,
        encrypted: metadata.info?.IsEncrypted || false
      };
      
      console.log('✅ LEX: Informações do PDF obtidas');
      console.log('- Páginas:', info.numPages);
      console.log('- Tamanho:', info.fileSizeFormatted);
      console.log('- Título:', info.metadata.title);
      
      return info;
      
    } catch (error) {
      console.error('❌ LEX: Erro ao obter informações do PDF:', error);
      throw new Error(`Falha ao processar PDF: ${error.message}`);
    }
  }
  
  /**
   * Formata tamanho de arquivo
   * @param {number} bytes - Tamanho em bytes
   * @returns {string}
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Limpa recursos e reseta o processador
   */
  cleanup() {
    console.log('🧹 LEX: Limpando recursos do PDFProcessor');
    
    // Não removemos a biblioteca carregada para reutilização
    // Apenas resetamos o estado se necessário
    
    console.log('✅ LEX: Cleanup do PDFProcessor concluído');
  }
  
  /**
   * Extrai texto completo do PDF com suporte a múltiplas páginas
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {Object} options - Opções de extração
   * @returns {Promise<Object>} - Resultado da extração
   */
  async extractTextFromPDF(pdfBlob, options = {}) {
    if (!this.isReady()) {
      await this.initialize();
    }
    
    console.log('📄 LEX: Iniciando extração de texto do PDF...');
    
    const defaultOptions = {
      includeMetadata: true,
      includePageNumbers: true,
      maxPages: null, // null = todas as páginas
      progressCallback: null,
      pageDelimiter: '\n--- Página {pageNum} ---\n',
      combineTextItems: true,
      normalizeWhitespace: true
    };
    
    const config = { ...defaultOptions, ...options };
    
    try {
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const loadingTask = this.pdfjsLib.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      
      console.log(`📊 LEX: PDF carregado - ${pdf.numPages} páginas`);
      
      // Determinar páginas a processar
      const totalPages = pdf.numPages;
      const pagesToProcess = config.maxPages ? Math.min(config.maxPages, totalPages) : totalPages;
      
      let fullText = '';
      const pageTexts = [];
      const extractionStats = {
        totalPages: totalPages,
        processedPages: 0,
        totalCharacters: 0,
        averageCharsPerPage: 0,
        processingTime: 0,
        errors: []
      };
      
      const startTime = performance.now();
      
      // Extrair texto de cada página
      for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
        try {
          console.log(`📄 LEX: Processando página ${pageNum}/${pagesToProcess}`);
          
          // Callback de progresso
          if (config.progressCallback) {
            config.progressCallback({
              currentPage: pageNum,
              totalPages: pagesToProcess,
              progress: (pageNum / pagesToProcess) * 100
            });
          }
          
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          // Processar itens de texto da página
          const pageText = this.processPageTextContent(textContent, config);
          
          // Adicionar delimitador de página se configurado
          if (config.includePageNumbers && pageText.trim()) {
            const delimiter = config.pageDelimiter.replace('{pageNum}', pageNum);
            fullText += delimiter + pageText + '\n';
          } else {
            fullText += pageText + '\n';
          }
          
          pageTexts.push({
            pageNumber: pageNum,
            text: pageText,
            characterCount: pageText.length
          });
          
          extractionStats.processedPages++;
          extractionStats.totalCharacters += pageText.length;
          
        } catch (pageError) {
          console.error(`❌ LEX: Erro na página ${pageNum}:`, pageError);
          extractionStats.errors.push({
            page: pageNum,
            error: pageError.message
          });
          
          // Continuar com próxima página
          continue;
        }
      }
      
      const endTime = performance.now();
      extractionStats.processingTime = Math.round(endTime - startTime);
      extractionStats.averageCharsPerPage = Math.round(extractionStats.totalCharacters / extractionStats.processedPages);
      
      // Normalizar texto final
      if (config.normalizeWhitespace) {
        fullText = this.normalizeWhitespace(fullText);
      }
      
      console.log('✅ LEX: Extração de texto concluída');
      console.log(`- Páginas processadas: ${extractionStats.processedPages}/${totalPages}`);
      console.log(`- Caracteres extraídos: ${extractionStats.totalCharacters}`);
      console.log(`- Tempo de processamento: ${extractionStats.processingTime}ms`);
      
      // Obter metadados se solicitado
      let metadata = null;
      if (config.includeMetadata) {
        try {
          const pdfMetadata = await pdf.getMetadata();
          metadata = {
            title: pdfMetadata.info?.Title || null,
            author: pdfMetadata.info?.Author || null,
            subject: pdfMetadata.info?.Subject || null,
            creator: pdfMetadata.info?.Creator || null,
            producer: pdfMetadata.info?.Producer || null,
            creationDate: pdfMetadata.info?.CreationDate || null,
            modificationDate: pdfMetadata.info?.ModDate || null,
            pdfVersion: pdfMetadata.info?.PDFFormatVersion || null
          };
        } catch (metadataError) {
          console.warn('⚠️ LEX: Erro ao obter metadados:', metadataError);
        }
      }
      
      return {
        text: fullText.trim(),
        pages: pageTexts,
        metadata: metadata,
        stats: extractionStats,
        success: true,
        fileSize: pdfBlob.size,
        fileSizeFormatted: this.formatFileSize(pdfBlob.size)
      };
      
    } catch (error) {
      console.error('❌ LEX: Erro na extração de texto:', error);
      throw new Error(`Falha ao extrair texto do PDF: ${error.message}`);
    }
  }
  
  /**
   * Extrai texto híbrido do PDF (texto nativo + OCR para páginas escaneadas)
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {Object} options - Opções de extração
   * @returns {Promise<Object>} - Resultado da extração híbrida
   */
  async extractTextHybrid(pdfBlob, options = {}) {
    if (!this.isReady()) {
      await this.initialize();
    }
    
    console.log('🔄 LEX: Iniciando extração híbrida (PDF.js + OCR MVP)...');
    
    const defaultOptions = {
      includeMetadata: true,
      includePageNumbers: true,
      maxPages: null,
      progressCallback: null,
      pageDelimiter: '\n--- Página {pageNum} ---\n',
      combineTextItems: true,
      normalizeWhitespace: true,
      // OCR options
      ocrFallback: true,
      minTextThreshold: 50,
      ocrQuality: 2
    };
    
    const config = { ...defaultOptions, ...options };
    
    try {
      // Use the new HybridOCRSystem
      if (!window.HybridOCRSystem) {
        throw new Error('HybridOCRSystem não carregado');
      }
      
      const ocrSystem = new window.HybridOCRSystem();
      return await ocrSystem.extractTextFromPDF(pdfBlob, config);
      
    } catch (error) {
      console.error('❌ LEX: Erro na extração híbrida:', error);
      throw new Error(`Falha na extração híbrida: ${error.message}`);
    }
  }
  
  /**
   * Verifica se a extração de texto foi bem-sucedida
   * @param {Object} result - Resultado da extração
   * @param {Object} config - Configurações
   * @returns {boolean} - true se tem texto suficiente
   */
  isTextExtractionSuccessful(result, config) {
    if (!result || !result.text) {
      return false;
    }
    
    const cleanText = result.text.trim();
    const textLength = cleanText.length;
    const wordCount = cleanText.split(/\s+/).length;
    
    // Critérios para considerar extração bem-sucedida
    const hasMinimumText = textLength >= config.minTextThreshold;
    const hasWords = wordCount >= 5; // Pelo menos 5 palavras
    const hasReasonableRatio = (textLength / result.stats.processedPages) >= 10; // 10 chars por página no mínimo
    
    console.log('📊 LEX: Análise de texto nativo:');
    console.log(`- Caracteres: ${textLength}`);
    console.log(`- Palavras: ${wordCount}`);
    console.log(`- Páginas: ${result.stats.processedPages}`);
    console.log(`- Ratio chars/página: ${Math.round(textLength / result.stats.processedPages)}`);
    console.log(`- Texto suficiente: ${hasMinimumText && hasWords && hasReasonableRatio}`);
    
    return hasMinimumText && hasWords && hasReasonableRatio;
  }
  
  /**
   * Extrai texto usando OCR nas páginas do PDF
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {Object} config - Configurações
   * @param {Object} nativeResult - Resultado da extração nativa (fallback)
   * @returns {Promise<Object>} - Resultado da extração OCR
   */
  async extractTextWithOCR(pdfBlob, config, nativeResult) {
    console.log('🔍 LEX: Iniciando extração OCR do PDF...');
    
    try {
      // Inicializar OCR se necessário
      let ocrProcessor;
      if (window.OCRProcessor) {
        ocrProcessor = new window.OCRProcessor();
        await ocrProcessor.initialize();
      } else {
        console.error('❌ LEX: OCRProcessor não disponível');
        throw new Error('OCRProcessor não carregado');
      }
      
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const loadingTask = this.pdfjsLib.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      
      const totalPages = pdf.numPages;
      const pagesToProcess = config.maxPages ? Math.min(config.maxPages, totalPages) : totalPages;
      
      let fullText = '';
      const pageTexts = [];
      const ocrStats = {
        processedPages: 0,
        successfulPages: 0,
        totalConfidence: 0,
        averageConfidence: 0,
        processingTime: 0
      };
      
      const startTime = Date.now();
      
      for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
        try {
          console.log(`🖼️ LEX: OCR página ${pageNum}/${pagesToProcess}...`);
          
          // Callback de progresso
          if (config.progressCallback) {
            config.progressCallback({
              currentPage: pageNum,
              totalPages: pagesToProcess,
              progress: (pageNum / pagesToProcess) * 100,
              method: 'ocr'
            });
          }
          
          // Renderizar página como imagem
          const canvas = await this.renderPageToCanvas(pdf, pageNum, config);
          
          // Executar OCR na imagem
          const ocrResult = await ocrProcessor.extractTextFromImage(canvas, {
            minConfidence: 30,
            preprocess: true,
            enhanceContrast: true
          });
          
          if (ocrResult.success) {
            const pageText = ocrResult.text.trim();
            
            if (pageText) {
              // Adicionar delimitador de página se configurado
              if (config.includePageNumbers) {
                const delimiter = config.pageDelimiter.replace('{pageNum}', pageNum);
                fullText += delimiter + pageText + '\n';
              } else {
                fullText += pageText + '\n';
              }
              
              pageTexts.push({
                pageNumber: pageNum,
                text: pageText,
                confidence: ocrResult.confidence,
                words: ocrResult.stats.wordsFound
              });
              
              ocrStats.successfulPages++;
              ocrStats.totalConfidence += ocrResult.confidence;
            }
          }
          
          ocrStats.processedPages++;
          
        } catch (pageError) {
          console.warn(`⚠️ LEX: Erro OCR na página ${pageNum}:`, pageError);
          // Continuar com próxima página
        }
      }
      
      const endTime = Date.now();
      ocrStats.processingTime = endTime - startTime;
      ocrStats.averageConfidence = ocrStats.successfulPages > 0 
        ? ocrStats.totalConfidence / ocrStats.successfulPages 
        : 0;
      
      console.log('✅ LEX: OCR do PDF concluído');
      console.log(`- Páginas processadas: ${ocrStats.processedPages}`);
      console.log(`- Páginas com sucesso: ${ocrStats.successfulPages}`);
      console.log(`- Confiança média: ${Math.round(ocrStats.averageConfidence)}%`);
      console.log(`- Tempo total: ${Math.round(ocrStats.processingTime/1000)}s`);
      
      // Limpar recursos OCR
      await ocrProcessor.terminate();
      
      // Construir resultado final
      return {
        text: fullText.trim(),
        pages: pageTexts,
        metadata: nativeResult.metadata || {},
        stats: {
          processedPages: ocrStats.processedPages,
          successfulPages: ocrStats.successfulPages,
          totalCharacters: fullText.length,
          totalWords: fullText.split(/\s+/).length,
          processingTime: ocrStats.processingTime,
          averageConfidence: ocrStats.averageConfidence
        },
        extractionMethod: 'ocr',
        ocrUsed: true,
        scannedPdfDetected: true,
        success: ocrStats.successfulPages > 0,
        fileSize: pdfBlob.size,
        fileSizeFormatted: this.formatFileSize(pdfBlob.size)
      };
      
    } catch (error) {
      console.error('❌ LEX: Erro na extração OCR:', error);
      // Fallback para resultado nativo
      console.log('🔄 LEX: Usando resultado de texto nativo como fallback');
      nativeResult.extractionMethod = 'native_fallback';
      nativeResult.ocrUsed = false;
      nativeResult.ocrError = error.message;
      nativeResult.scannedPdfDetected = true;
      return nativeResult;
    }
  }
  
  /**
   * Renderiza uma página do PDF para Canvas
   * @param {Object} pdf - Documento PDF
   * @param {number} pageNumber - Número da página
   * @param {Object} config - Configurações
   * @returns {Promise<Canvas>} - Canvas com a página renderizada
   */
  async renderPageToCanvas(pdf, pageNumber, config) {
    const page = await pdf.getPage(pageNumber);
    
    // Configurar viewport com escala otimizada para OCR
    const scale = config.ocrQuality === 3 ? 3.0 : 
                  config.ocrQuality === 2 ? 2.0 : 1.5;
    
    const viewport = page.getViewport({ scale });
    
    // Criar canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Configurar fundo branco para melhor OCR
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Renderizar página
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    return canvas;
  }
  
  /**
   * Processa o conteúdo de texto de uma página
   * @param {Object} textContent - Conteúdo de texto do PDF.js
   * @param {Object} config - Configurações de processamento
   * @returns {string} - Texto processado da página
   */
  processPageTextContent(textContent, config) {
    if (!textContent || !textContent.items) {
      return '';
    }
    
    let pageText = '';
    
    if (config.combineTextItems) {
      // Combinar todos os itens de texto
      pageText = textContent.items
        .map(item => item.str || '')
        .join(' ');
    } else {
      // Preservar estrutura original com quebras de linha
      let currentY = null;
      const lines = [];
      let currentLine = '';
      
      for (const item of textContent.items) {
        const itemY = item.transform[5]; // Posição Y
        
        // Nova linha se Y mudou significativamente
        if (currentY !== null && Math.abs(currentY - itemY) > 5) {
          if (currentLine.trim()) {
            lines.push(currentLine.trim());
          }
          currentLine = '';
        }
        
        currentLine += (item.str || '') + ' ';
        currentY = itemY;
      }
      
      // Adicionar última linha
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      
      pageText = lines.join('\n');
    }
    
    return pageText;
  }
  
  /**
   * Normaliza espaços em branco no texto
   * @param {string} text - Texto para normalizar
   * @returns {string} - Texto normalizado
   */
  normalizeWhitespace(text) {
    return text
      .replace(/\r\n/g, '\n') // Normalizar quebras de linha
      .replace(/\r/g, '\n')   // Normalizar quebras de linha Mac
      .replace(/\t/g, ' ')    // Converter tabs em espaços
      .replace(/ +/g, ' ')    // Múltiplos espaços em um
      .replace(/\n +/g, '\n') // Espaços no início de linhas
      .replace(/ +\n/g, '\n') // Espaços no final de linhas
      .replace(/\n{3,}/g, '\n\n') // Múltiplas quebras de linha
      .trim();
  }
  
  /**
   * Extrai texto de páginas específicas
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {Array<number>} pageNumbers - Números das páginas (1-indexed)
   * @param {Object} options - Opções de extração
   * @returns {Promise<Object>} - Resultado da extração
   */
  async extractTextFromPages(pdfBlob, pageNumbers, options = {}) {
    if (!this.isReady()) {
      await this.initialize();
    }
    
    console.log(`📄 LEX: Extraindo texto de páginas específicas: ${pageNumbers.join(', ')}`);
    
    try {
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const loadingTask = this.pdfjsLib.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      
      const results = [];
      const errors = [];
      
      for (const pageNum of pageNumbers) {
        if (pageNum < 1 || pageNum > pdf.numPages) {
          errors.push({
            page: pageNum,
            error: `Página ${pageNum} não existe (total: ${pdf.numPages})`
          });
          continue;
        }
        
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = this.processPageTextContent(textContent, options);
          
          results.push({
            pageNumber: pageNum,
            text: pageText,
            characterCount: pageText.length
          });
          
        } catch (pageError) {
          errors.push({
            page: pageNum,
            error: pageError.message
          });
        }
      }
      
      const combinedText = results
        .map(r => `--- Página ${r.pageNumber} ---\n${r.text}`)
        .join('\n\n');
      
      return {
        text: combinedText,
        pages: results,
        errors: errors,
        success: results.length > 0,
        requestedPages: pageNumbers,
        processedPages: results.length
      };
      
    } catch (error) {
      console.error('❌ LEX: Erro na extração de páginas específicas:', error);
      throw new Error(`Falha ao extrair páginas específicas: ${error.message}`);
    }
  }
  
  /**
   * Extrai apenas uma amostra do texto (primeiras páginas)
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {number} maxPages - Máximo de páginas para extrair
   * @returns {Promise<Object>} - Resultado da extração
   */
  async extractTextSample(pdfBlob, maxPages = 3) {
    console.log(`📄 LEX: Extraindo amostra de texto (${maxPages} páginas)`);
    
    return this.extractTextFromPDF(pdfBlob, {
      maxPages: maxPages,
      includeMetadata: false,
      includePageNumbers: true,
      normalizeWhitespace: true
    });
  }
  
  /**
   * Busca texto específico no PDF
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {string} searchTerm - Termo para buscar
   * @param {Object} options - Opções de busca
   * @returns {Promise<Object>} - Resultados da busca
   */
  async searchInPDF(pdfBlob, searchTerm, options = {}) {
    if (!this.isReady()) {
      await this.initialize();
    }
    
    console.log(`🔍 LEX: Buscando "${searchTerm}" no PDF`);
    
    const defaultOptions = {
      caseSensitive: false,
      wholeWords: false,
      maxResults: 50
    };
    
    const config = { ...defaultOptions, ...options };
    
    try {
      const extractionResult = await this.extractTextFromPDF(pdfBlob, {
        includePageNumbers: true,
        normalizeWhitespace: true
      });
      
      const results = [];
      const searchRegex = this.createSearchRegex(searchTerm, config);
      
      for (const pageData of extractionResult.pages) {
        const matches = [...pageData.text.matchAll(searchRegex)];
        
        for (const match of matches) {
          if (results.length >= config.maxResults) break;
          
          const startIndex = match.index;
          const endIndex = startIndex + match[0].length;
          
          // Extrair contexto ao redor da ocorrência
          const contextStart = Math.max(0, startIndex - 50);
          const contextEnd = Math.min(pageData.text.length, endIndex + 50);
          const context = pageData.text.substring(contextStart, contextEnd);
          
          results.push({
            page: pageData.pageNumber,
            match: match[0],
            context: context,
            startIndex: startIndex,
            endIndex: endIndex
          });
        }
        
        if (results.length >= config.maxResults) break;
      }
      
      console.log(`✅ LEX: Busca concluída - ${results.length} ocorrências encontradas`);
      
      return {
        searchTerm: searchTerm,
        results: results,
        totalMatches: results.length,
        searchOptions: config,
        success: true
      };
      
    } catch (error) {
      console.error('❌ LEX: Erro na busca:', error);
      throw new Error(`Falha ao buscar no PDF: ${error.message}`);
    }
  }
  
  /**
   * Cria regex para busca baseada nas opções
   * @param {string} searchTerm - Termo para buscar
   * @param {Object} options - Opções de busca
   * @returns {RegExp} - Regex para busca
   */
  createSearchRegex(searchTerm, options) {
    let pattern = searchTerm;
    
    // Escapar caracteres especiais do regex
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Palavras completas
    if (options.wholeWords) {
      pattern = `\\b${pattern}\\b`;
    }
    
    // Flags do regex
    let flags = 'g'; // Global sempre
    if (!options.caseSensitive) {
      flags += 'i'; // Case insensitive
    }
    
    return new RegExp(pattern, flags);
  }
  
  /**
   * Obtém estatísticas de uso
   * @returns {Object}
   */
  getStats() {
    return {
      initialized: this.initialized,
      loading: this.loading,
      version: this.version,
      memoryUsage: this.getMemoryUsage()
    };
  }
  
  /**
   * Estima uso de memória (aproximado)
   * @returns {string}
   */
  getMemoryUsage() {
    if (performance.memory) {
      const used = performance.memory.usedJSHeapSize;
      return this.formatFileSize(used);
    }
    return 'N/A';
  }
  
  /**
   * Extrai texto com tratamento robusto de erros e timeouts
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {Object} options - Opções de extração
   * @returns {Promise<Object>} - Resultado da extração
   */
  async extractTextWithErrorHandling(pdfBlob, options = {}) {
    const defaultOptions = {
      timeout: 30000, // 30 segundos
      maxRetries: 2,
      retryDelay: 1000,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxPages: 100,
      skipCorruptedPages: true,
      fallbackOnError: true,
      ...options
    };
    
    console.log('🛡️ LEX: Iniciando extração com tratamento robusto de erros');
    
    // Validações iniciais
    const validationResult = await this.validatePDFForExtraction(pdfBlob, defaultOptions);
    if (!validationResult.valid) {
      throw new PDFProcessingError(validationResult.error, 'VALIDATION_FAILED', validationResult.details);
    }
    
    let lastError = null;
    
    // Tentar extração com retry
    for (let attempt = 1; attempt <= defaultOptions.maxRetries; attempt++) {
      try {
        console.log(`🔄 LEX: Tentativa ${attempt}/${defaultOptions.maxRetries}`);
        
        const result = await this.executeExtractionWithTimeout(pdfBlob, defaultOptions);
        
        console.log('✅ LEX: Extração bem-sucedida');
        return result;
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ LEX: Tentativa ${attempt} falhou:`, error.message);
        
        // Não tentar novamente para alguns tipos de erro
        if (this.isNonRetryableError(error)) {
          console.log('🚫 LEX: Erro não recuperável, parando tentativas');
          break;
        }
        
        // Aguardar antes da próxima tentativa
        if (attempt < defaultOptions.maxRetries) {
          console.log(`⏳ LEX: Aguardando ${defaultOptions.retryDelay}ms antes da próxima tentativa`);
          await new Promise(resolve => setTimeout(resolve, defaultOptions.retryDelay));
        }
      }
    }
    
    // Se chegou aqui, todas as tentativas falharam
    if (defaultOptions.fallbackOnError) {
      console.log('🔄 LEX: Tentando extração com fallback');
      return await this.extractWithFallback(pdfBlob, lastError);
    }
    
    throw lastError;
  }
  
  /**
   * Valida PDF antes da extração
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {Object} options - Opções de validação
   * @returns {Promise<Object>} - Resultado da validação
   */
  async validatePDFForExtraction(pdfBlob, options) {
    console.log('🔍 LEX: Validando PDF para extração...');
    
    try {
      // Verificar tamanho do arquivo
      if (pdfBlob.size > options.maxFileSize) {
        return {
          valid: false,
          error: `Arquivo muito grande: ${this.formatFileSize(pdfBlob.size)} (máximo: ${this.formatFileSize(options.maxFileSize)})`,
          code: 'FILE_TOO_LARGE',
          details: { fileSize: pdfBlob.size, maxSize: options.maxFileSize }
        };
      }
      
      // Verificar se é um blob válido
      if (!pdfBlob || pdfBlob.size === 0) {
        return {
          valid: false,
          error: 'Arquivo vazio ou inválido',
          code: 'EMPTY_FILE',
          details: { size: pdfBlob?.size || 0 }
        };
      }
      
      // Verificar assinatura PDF
      const arrayBuffer = await pdfBlob.slice(0, 1024).arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const header = String.fromCharCode(...uint8Array.slice(0, 4));
      
      if (header !== '%PDF') {
        return {
          valid: false,
          error: 'Arquivo não é um PDF válido (assinatura incorreta)',
          code: 'INVALID_PDF_SIGNATURE',
          details: { header: header }
        };
      }
      
      // Verificar se PDF.js consegue carregar
      if (!this.isReady()) {
        await this.initialize();
      }
      
      const testArrayBuffer = await pdfBlob.arrayBuffer();
      const loadingTask = this.pdfjsLib.getDocument(testArrayBuffer);
      
      try {
        const pdf = await loadingTask.promise;
        
        // Verificar número de páginas
        if (pdf.numPages > options.maxPages) {
          console.warn(`⚠️ LEX: PDF tem ${pdf.numPages} páginas, limitando a ${options.maxPages}`);
        }
        
        console.log('✅ LEX: PDF válido para extração');
        return {
          valid: true,
          details: {
            pages: pdf.numPages,
            fileSize: pdfBlob.size,
            fingerprint: pdf.fingerprint
          }
        };
        
      } catch (pdfError) {
        if (pdfError.name === 'PasswordException') {
          return {
            valid: false,
            error: 'PDF protegido por senha',
            code: 'PASSWORD_PROTECTED',
            details: { needsPassword: true }
          };
        }
        
        return {
          valid: false,
          error: `PDF corrompido ou inválido: ${pdfError.message}`,
          code: 'CORRUPTED_PDF',
          details: { originalError: pdfError.message }
        };
      }
      
    } catch (error) {
      return {
        valid: false,
        error: `Erro na validação: ${error.message}`,
        code: 'VALIDATION_ERROR',
        details: { originalError: error.message }
      };
    }
  }
  
  /**
   * Executa extração com timeout
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {Object} options - Opções de extração
   * @returns {Promise<Object>} - Resultado da extração
   */
  async executeExtractionWithTimeout(pdfBlob, options) {
    return new Promise(async (resolve, reject) => {
      // Configurar timeout
      const timeoutId = setTimeout(() => {
        reject(new PDFProcessingError(
          `Timeout na extração após ${options.timeout}ms`,
          'EXTRACTION_TIMEOUT',
          { timeout: options.timeout }
        ));
      }, options.timeout);
      
      try {
        const result = await this.extractTextFromPDF(pdfBlob, {
          ...options,
          maxPages: Math.min(options.maxPages, 100), // Limitar páginas
          progressCallback: (progress) => {
            console.log(`📊 LEX: ${Math.round(progress.progress)}% - Página ${progress.currentPage}`);
            
            // Callback original se existir
            if (options.progressCallback) {
              options.progressCallback(progress);
            }
          }
        });
        
        clearTimeout(timeoutId);
        resolve(result);
        
      } catch (error) {
        clearTimeout(timeoutId);
        
        // Tratar erros específicos
        if (error.name === 'PasswordException') {
          reject(new PDFProcessingError(
            'PDF protegido por senha',
            'PASSWORD_PROTECTED',
            { needsPassword: true }
          ));
        } else if (error.message.includes('Invalid PDF')) {
          reject(new PDFProcessingError(
            'PDF corrompido ou inválido',
            'CORRUPTED_PDF',
            { originalError: error.message }
          ));
        } else if (error.message.includes('out of memory')) {
          reject(new PDFProcessingError(
            'Memória insuficiente para processar PDF',
            'OUT_OF_MEMORY',
            { fileSize: pdfBlob.size }
          ));
        } else {
          reject(new PDFProcessingError(
            `Erro na extração: ${error.message}`,
            'EXTRACTION_ERROR',
            { originalError: error.message }
          ));
        }
      }
    });
  }
  
  /**
   * Verifica se é um erro não recuperável
   * @param {Error} error - Erro para verificar
   * @returns {boolean} - true se não deve tentar novamente
   */
  isNonRetryableError(error) {
    if (!(error instanceof PDFProcessingError)) {
      return false;
    }
    
    const nonRetryableCodes = [
      'PASSWORD_PROTECTED',
      'FILE_TOO_LARGE',
      'INVALID_PDF_SIGNATURE',
      'CORRUPTED_PDF',
      'OUT_OF_MEMORY'
    ];
    
    return nonRetryableCodes.includes(error.code);
  }
  
  /**
   * Extração com fallback para casos de erro
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {Error} originalError - Erro original
   * @returns {Promise<Object>} - Resultado do fallback
   */
  async extractWithFallback(pdfBlob, originalError) {
    console.log('🔄 LEX: Executando estratégias de fallback...');
    
    try {
      // Estratégia 1: Tentar apenas primeira página
      console.log('📄 LEX: Tentando extrair apenas primeira página...');
      const firstPageResult = await this.extractTextFromPages(pdfBlob, [1], {
        combineTextItems: true,
        normalizeWhitespace: true
      });
      
      if (firstPageResult.success && firstPageResult.text.trim()) {
        console.log('✅ LEX: Fallback primeira página bem-sucedido');
        return {
          text: firstPageResult.text,
          fallback: true,
          fallbackStrategy: 'first_page_only',
          originalError: originalError.message,
          warning: 'Apenas primeira página foi extraída devido a erro no processamento completo'
        };
      }
      
    } catch (firstPageError) {
      console.warn('⚠️ LEX: Fallback primeira página falhou:', firstPageError.message);
    }
    
    try {
      // Estratégia 2: Tentar obter apenas metadados
      console.log('📊 LEX: Tentando extrair apenas metadados...');
      const info = await this.getPDFInfo(pdfBlob);
      
      return {
        text: `[Não foi possível extrair texto do PDF]\n\nInformações do documento:\n- Páginas: ${info.numPages}\n- Título: ${info.metadata.title || 'N/A'}\n- Autor: ${info.metadata.author || 'N/A'}`,
        fallback: true,
        fallbackStrategy: 'metadata_only',
        originalError: originalError.message,
        metadata: info.metadata,
        warning: 'Apenas metadados foram extraídos devido a erro no processamento de texto'
      };
      
    } catch (metadataError) {
      console.warn('⚠️ LEX: Fallback metadados falhou:', metadataError.message);
    }
    
    // Estratégia 3: Retornar erro estruturado
    console.log('❌ LEX: Todos os fallbacks falharam');
    return {
      text: '[Erro: Não foi possível processar o PDF]',
      fallback: true,
      fallbackStrategy: 'error_message',
      originalError: originalError.message,
      success: false,
      error: true,
      warning: 'PDF não pôde ser processado. Verifique se o arquivo não está corrompido ou protegido por senha.'
    };
  }
  
  /**
   * Processa PDF com recuperação de páginas corrompidas
   * @param {Blob} pdfBlob - Blob do PDF
   * @param {Object} options - Opções de processamento
   * @returns {Promise<Object>} - Resultado do processamento
   */
  async extractTextWithPageRecovery(pdfBlob, options = {}) {
    if (!this.isReady()) {
      await this.initialize();
    }
    
    console.log('🔧 LEX: Extração com recuperação de páginas...');
    
    try {
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const loadingTask = this.pdfjsLib.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      
      const totalPages = pdf.numPages;
      const maxPages = options.maxPages || totalPages;
      const pagesToProcess = Math.min(maxPages, totalPages);
      
      let fullText = '';
      const successfulPages = [];
      const failedPages = [];
      const pageErrors = [];
      
      console.log(`📊 LEX: Processando ${pagesToProcess} páginas com recuperação...`);
      
      // Processar cada página individualmente
      for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
        try {
          console.log(`📄 LEX: Processando página ${pageNum}/${pagesToProcess}`);
          
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = this.processPageTextContent(textContent, options);
          
          if (pageText.trim()) {
            fullText += `\n--- Página ${pageNum} ---\n${pageText}\n`;
            successfulPages.push({
              pageNumber: pageNum,
              text: pageText,
              characterCount: pageText.length
            });
          }
          
        } catch (pageError) {
          console.warn(`⚠️ LEX: Erro na página ${pageNum}:`, pageError.message);
          
          failedPages.push(pageNum);
          pageErrors.push({
            page: pageNum,
            error: pageError.message,
            type: this.classifyPageError(pageError)
          });
          
          // Adicionar placeholder para página com erro
          if (options.includeErrorPlaceholders) {
            fullText += `\n--- Página ${pageNum} (ERRO) ---\n[Erro ao processar página: ${pageError.message}]\n`;
          }
        }
      }
      
      const stats = {
        totalPages: totalPages,
        requestedPages: pagesToProcess,
        successfulPages: successfulPages.length,
        failedPages: failedPages.length,
        successRate: (successfulPages.length / pagesToProcess) * 100,
        totalCharacters: fullText.length,
        errors: pageErrors
      };
      
      console.log(`✅ LEX: Recuperação concluída - ${stats.successfulPages}/${stats.requestedPages} páginas processadas`);
      
      return {
        text: fullText.trim(),
        pages: successfulPages,
        failedPages: failedPages,
        stats: stats,
        success: successfulPages.length > 0,
        partialSuccess: failedPages.length > 0 && successfulPages.length > 0,
        recovery: true
      };
      
    } catch (error) {
      console.error('❌ LEX: Erro na recuperação de páginas:', error);
      throw new PDFProcessingError(
        `Falha na recuperação de páginas: ${error.message}`,
        'PAGE_RECOVERY_FAILED',
        { originalError: error.message }
      );
    }
  }
  
  /**
   * Classifica tipo de erro de página
   * @param {Error} error - Erro da página
   * @returns {string} - Tipo do erro
   */
  classifyPageError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('corrupt') || message.includes('invalid')) {
      return 'CORRUPTED_PAGE';
    } else if (message.includes('memory') || message.includes('out of')) {
      return 'MEMORY_ERROR';
    } else if (message.includes('timeout')) {
      return 'TIMEOUT_ERROR';
    } else if (message.includes('password') || message.includes('encrypted')) {
      return 'ENCRYPTION_ERROR';
    } else {
      return 'UNKNOWN_ERROR';
    }
  }
  
  /**
   * Monitora uso de memória durante processamento
   * @returns {Object} - Informações de memória
   */
  getMemoryInfo() {
    if (!performance.memory) {
      return {
        available: false,
        message: 'Informações de memória não disponíveis neste navegador'
      };
    }
    
    const memory = performance.memory;
    
    return {
      available: true,
      used: this.formatFileSize(memory.usedJSHeapSize),
      total: this.formatFileSize(memory.totalJSHeapSize),
      limit: this.formatFileSize(memory.jsHeapSizeLimit),
      usagePercentage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100),
      raw: {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit
      }
    };
  }
  
  /**
   * Verifica se há memória suficiente para processar PDF
   * @param {number} estimatedSize - Tamanho estimado necessário
   * @returns {boolean} - true se há memória suficiente
   */
  hasEnoughMemory(estimatedSize) {
    const memInfo = this.getMemoryInfo();
    
    if (!memInfo.available) {
      return true; // Assumir que sim se não conseguir verificar
    }
    
    const availableMemory = memInfo.raw.limit - memInfo.raw.used;
    const safetyMargin = 50 * 1024 * 1024; // 50MB de margem
    
    return availableMemory > (estimatedSize + safetyMargin);
  }
}

/**
 * Classe de erro personalizada para processamento de PDF
 */
class PDFProcessingError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', details = {}) {
    super(message);
    this.name = 'PDFProcessingError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Manter stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PDFProcessingError);
    }
  }
  
  /**
   * Converte erro para objeto JSON
   * @returns {Object} - Representação JSON do erro
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
  
  /**
   * Verifica se é um erro recuperável
   * @returns {boolean} - true se pode tentar novamente
   */
  isRetryable() {
    const nonRetryableCodes = [
      'PASSWORD_PROTECTED',
      'FILE_TOO_LARGE',
      'INVALID_PDF_SIGNATURE',
      'CORRUPTED_PDF',
      'OUT_OF_MEMORY'
    ];
    
    return !nonRetryableCodes.includes(this.code);
  }
  
  /**
   * Obtém mensagem amigável para o usuário
   * @returns {string} - Mensagem amigável
   */
  getUserFriendlyMessage() {
    const messages = {
      'PASSWORD_PROTECTED': 'Este PDF está protegido por senha e não pode ser processado.',
      'FILE_TOO_LARGE': 'O arquivo PDF é muito grande para ser processado.',
      'INVALID_PDF_SIGNATURE': 'O arquivo não é um PDF válido.',
      'CORRUPTED_PDF': 'O PDF está corrompido ou danificado.',
      'OUT_OF_MEMORY': 'Não há memória suficiente para processar este PDF.',
      'EXTRACTION_TIMEOUT': 'O processamento do PDF demorou muito tempo e foi cancelado.',
      'VALIDATION_FAILED': 'O PDF não passou na validação inicial.',
      'EXTRACTION_ERROR': 'Ocorreu um erro durante a extração de texto.',
      'PAGE_RECOVERY_FAILED': 'Não foi possível recuperar o texto de nenhuma página.'
    };
    
    return messages[this.code] || 'Ocorreu um erro inesperado ao processar o PDF.';
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.PDFProcessor = PDFProcessor;
  window.PDFProcessingError = PDFProcessingError;
}

console.log('✅ LEX: PDFProcessor carregado com sucesso');