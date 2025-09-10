// OCR Processor - Tesseract.js integration for LEX Document Processing System
// Handles OCR text extraction from images and scanned PDFs with robust local configuration

class OCRProcessor {
  constructor() {
    this.tesseract = null;
    this.worker = null;
    this.initialized = false;
    this.loading = false;
    
    console.log('🖼️ LEX: OCRProcessor instanciado');
  }
  
  /**
   * Inicializa o Tesseract.js carregando a biblioteca local
   */
  async initialize() {
    if (this.initialized) {
      console.log('✅ LEX: Tesseract.js já inicializado');
      return;
    }
    
    if (this.loading) {
      console.log('⏳ LEX: Tesseract.js já está carregando, aguardando...');
      return this.waitForInitialization();
    }
    
    console.log('🔧 LEX: Inicializando Tesseract.js...');
    this.loading = true;
    
    try {
      await this.loadTesseract();
      await this.createWorker();
      
      this.initialized = true;
      this.loading = false;
      
      console.log('✅ LEX: Tesseract.js inicializado com sucesso');
      
    } catch (error) {
      this.loading = false;
      console.error('❌ LEX: Erro ao inicializar Tesseract.js:', error);
      throw new Error(`Falha ao carregar Tesseract.js: ${error.message}`);
    }
  }
  
  /**
   * Carrega a biblioteca Tesseract.js local
   */
  async loadTesseract() {
    return new Promise((resolve, reject) => {
      console.log('📚 LEX: Carregando Tesseract.js local...');
      
      // Verificar se já está carregado
      if (window.Tesseract) {
        this.tesseract = window.Tesseract;
        console.log('✅ LEX: Tesseract.js já disponível');
        resolve();
        return;
      }
      
      // Carregar via script local
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('src/js/tesseract.min.js');
      script.onload = () => {
        console.log('✅ LEX: Tesseract.js carregado localmente');
        this.tesseract = window.Tesseract;
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Falha ao carregar tesseract.min.js'));
      };
      document.head.appendChild(script);
    });
  }
  
  /**
   * Cria e configura worker do Tesseract
   */
  async createWorker() {
    console.log('👷 LEX: Criando worker Tesseract...');
    
    try {
      // Criar worker simples primeiro (usar dados padrão do CDN)
      console.log('📚 LEX: Criando worker Tesseract básico...');
      
      this.worker = await this.tesseract.createWorker({
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`🔍 LEX: OCR ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      console.log('🔧 LEX: Carregando idioma português...');
      await this.worker.loadLanguage('por');
      
      console.log('⚙️ LEX: Inicializando OCR português...');
      await this.worker.initialize('por');
      
    } catch (error) {
      console.error('❌ LEX: Erro ao criar worker:', error);
      throw new Error(`Falha ao criar worker Tesseract: ${error.message}`);
    }
    
    // Configurações otimizadas para documentos jurídicos brasileiros
    await this.worker.setParameters({
      // Whitelist de caracteres para português jurídico
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüý0123456789.,;:!?()[]{}/-°ªº§',
      // Segmentação automática de página
      tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
      // Preservar espaços entre palavras
      preserve_interword_spaces: '1',
      // Otimizações de qualidade
      tessedit_do_invert: '0',
      tessedit_create_hocr: '0'
    });
    
    console.log('✅ LEX: Worker Tesseract configurado');
  }
  
  /**
   * Extrai texto de uma imagem usando OCR
   * @param {ImageData|Canvas|HTMLImageElement|Blob} imageSource - Fonte da imagem
   * @param {Object} options - Opções de processamento
   * @returns {Promise<Object>} - Resultado do OCR
   */
  async extractTextFromImage(imageSource, options = {}) {
    if (!this.isReady()) {
      await this.initialize();
    }
    
    console.log('🖼️ LEX: Iniciando OCR da imagem...');
    
    const defaultOptions = {
      preprocess: true,
      enhanceContrast: true,
      minConfidence: 30
    };
    
    const config = { ...defaultOptions, ...options };
    
    try {
      // Pré-processar imagem se solicitado
      let processedImage = imageSource;
      if (config.preprocess) {
        processedImage = await this.preprocessImage(imageSource, config);
      }
      
      // Executar OCR
      const startTime = Date.now();
      const { data } = await this.worker.recognize(processedImage);
      const endTime = Date.now();
      
      // Pós-processar texto
      const cleanedText = this.postProcessText(data.text);
      
      const result = {
        text: cleanedText,
        originalText: data.text,
        confidence: data.confidence,
        words: data.words,
        lines: data.lines,
        paragraphs: data.paragraphs,
        processingTime: endTime - startTime,
        success: data.confidence >= config.minConfidence,
        stats: {
          wordsFound: data.words ? data.words.length : 0,
          avgConfidence: data.confidence,
          minConfidence: config.minConfidence
        }
      };
      
      console.log('✅ LEX: OCR concluído');
      console.log(`- Confiança: ${Math.round(data.confidence)}%`);
      console.log(`- Palavras: ${result.stats.wordsFound}`);
      console.log(`- Tempo: ${result.processingTime}ms`);
      
      return result;
      
    } catch (error) {
      console.error('❌ LEX: Erro no OCR:', error);
      throw new Error(`Falha no OCR: ${error.message}`);
    }
  }
  
  /**
   * Pré-processa imagem para melhorar OCR
   * @param {*} imageSource - Fonte da imagem
   * @param {Object} config - Configurações
   * @returns {Promise<Canvas>} - Canvas processado
   */
  async preprocessImage(imageSource, config) {
    console.log('🎨 LEX: Pré-processando imagem para OCR...');
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    return new Promise((resolve, reject) => {
      try {
        // Se for blob, converter para Image primeiro
        if (imageSource instanceof Blob) {
          const img = new Image();
          img.onload = () => {
            this.processImageToCanvas(img, canvas, ctx, config);
            resolve(canvas);
          };
          img.onerror = () => reject(new Error('Falha ao carregar blob como imagem'));
          img.src = URL.createObjectURL(imageSource);
          return;
        }
        
        // Se for canvas, usar diretamente
        if (imageSource instanceof HTMLCanvasElement) {
          this.processCanvasToCanvas(imageSource, canvas, ctx, config);
          resolve(canvas);
          return;
        }
        
        // Se for Image, processar
        if (imageSource instanceof HTMLImageElement) {
          this.processImageToCanvas(imageSource, canvas, ctx, config);
          resolve(canvas);
          return;
        }
        
        // Fallback: retornar fonte original
        resolve(imageSource);
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Processa Image para Canvas com melhorias
   */
  processImageToCanvas(img, canvas, ctx, config) {
    canvas.width = img.width;
    canvas.height = img.height;
    
    // Desenhar imagem original
    ctx.drawImage(img, 0, 0);
    
    if (config.enhanceContrast) {
      this.enhanceImageContrast(ctx, canvas.width, canvas.height);
    }
  }
  
  /**
   * Processa Canvas para Canvas com melhorias
   */
  processCanvasToCanvas(sourceCanvas, targetCanvas, ctx, config) {
    targetCanvas.width = sourceCanvas.width;
    targetCanvas.height = sourceCanvas.height;
    
    // Copiar conteúdo
    ctx.drawImage(sourceCanvas, 0, 0);
    
    if (config.enhanceContrast) {
      this.enhanceImageContrast(ctx, targetCanvas.width, targetCanvas.height);
    }
  }
  
  /**
   * Aplica melhorias de contraste e brilho para OCR
   */
  enhanceImageContrast(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Parâmetros otimizados para documentos escaneados
    const contrast = 1.2;   // Aumentar contraste levemente
    const brightness = 10;  // Aumentar brilho levemente
    const gamma = 0.8;      // Correção gamma para documentos
    
    for (let i = 0; i < data.length; i += 4) {
      // Aplicar correções em RGB
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      
      // Gamma correction
      r = 255 * Math.pow(r / 255, gamma);
      g = 255 * Math.pow(g / 255, gamma);
      b = 255 * Math.pow(b / 255, gamma);
      
      // Contrast and brightness
      r = contrast * (r - 128) + 128 + brightness;
      g = contrast * (g - 128) + 128 + brightness;
      b = contrast * (b - 128) + 128 + brightness;
      
      // Clamp values
      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Pós-processa texto extraído do OCR
   * @param {string} text - Texto bruto do OCR
   * @returns {string} - Texto limpo
   */
  postProcessText(text) {
    if (!text) return '';
    
    return text
      // Normalizar espaços múltiplos
      .replace(/\s+/g, ' ')
      // Corrigir separação de palavras grudadas
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Separar números de letras
      .replace(/(\d)([A-Za-z])/g, '$1 $2')
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      // Corrigir pontuação comum
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([.!?])\s*([A-Z])/g, '$1 $2')
      // Remover caracteres estranhos comuns do OCR
      .replace(/[|]/g, 'I')
      .replace(/[¬]/g, '')
      .replace(/[`´']/g, "'")
      // Trim final
      .trim();
  }
  
  /**
   * Verifica se o OCR está pronto para uso
   */
  isReady() {
    return this.initialized && this.worker && !this.loading;
  }
  
  /**
   * Aguarda inicialização em andamento
   */
  async waitForInitialization() {
    const maxWait = 60000; // 60 segundos para OCR (mais tempo que PDF)
    const checkInterval = 100;
    let waited = 0;
    
    while (this.loading && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
    
    if (this.loading) {
      throw new Error('Timeout aguardando inicialização do Tesseract.js');
    }
    
    if (!this.initialized) {
      throw new Error('Tesseract.js falhou ao inicializar');
    }
  }
  
  /**
   * Termina o worker e limpa recursos
   */
  async terminate() {
    console.log('🛑 LEX: Terminando OCR processor...');
    
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch (error) {
        console.warn('⚠️ LEX: Erro ao terminar worker:', error);
      }
      this.worker = null;
    }
    
    this.initialized = false;
    this.loading = false;
    
    console.log('✅ LEX: OCR processor finalizado');
  }
  
  /**
   * Obtém status do OCR processor
   */
  getStatus() {
    return {
      initialized: this.initialized,
      loading: this.loading,
      ready: this.isReady(),
      workerActive: !!this.worker,
      tesseractAvailable: !!this.tesseract
    };
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.OCRProcessor = OCRProcessor;
}

console.log('✅ LEX: OCRProcessor carregado com sucesso');