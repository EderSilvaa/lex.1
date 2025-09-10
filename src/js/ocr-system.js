// OCR System - Future-proof architecture for LEX Document Processing
// Manifest V3 compliant with strategy pattern for scalable OCR providers

// ========== EXCEPTIONS ==========
class OCRException extends Error {
  constructor(message) {
    super(message);
    this.name = 'OCRException';
  }
}

class QuotaExceededException extends OCRException {
  constructor(message) {
    super(message);
    this.name = 'QuotaExceededException';
  }
}

// ========== BASE CLASSES ==========
class OCRProvider {
  async extractText(canvas) { 
    throw new Error('Must implement extractText method'); 
  }
  
  isAvailable() { 
    throw new Error('Must implement isAvailable method'); 
  }
  
  getCost() { 
    return 0; // Free by default
  }
  
  getQuota() { 
    return { daily: 0, monthly: 0, remaining: 0 }; 
  }
}

// ========== MVP PROVIDER - FREE SHARED OCR ==========
class FreeSharedOCR extends OCRProvider {
  constructor() {
    super();
    this.apiKey = 'K87899142388957'; // Public free key for MVP
    this.baseUrl = 'https://api.ocr.space/parse/image';
    this.dailyQuota = 50;    // Conservative MVP limit
    this.monthlyQuota = 800;  // Total shared across all users
    this.name = 'Free Shared OCR (MVP)';
  }
  
  isAvailable() {
    // Check if we haven't exceeded daily quota
    const usage = this.getUsageStats();
    return usage.daily < this.dailyQuota;
  }
  
  async extractText(canvas) {
    console.log('🆓 LEX: Usando OCR compartilhado gratuito (MVP)');
    
    // Check quota before attempting
    if (!this.isAvailable()) {
      const usage = this.getUsageStats();
      throw new QuotaExceededException(`Quota MVP excedida: ${usage.daily}/${this.dailyQuota} hoje`);
    }
    
    try {
      // Convert canvas to blob with JPEG compression to reduce size
      const blob = await new Promise(resolve => 
        canvas.toBlob(resolve, 'image/jpeg', 0.8)
      );
      
      if (!blob) {
        throw new OCRException('Falha ao converter canvas para blob');
      }
      
      console.log(`📏 LEX: Tamanho da imagem: ${(blob.size / 1024).toFixed(0)}KB (limite: 1024KB)`);
      
      // Check if still too large
      if (blob.size > 1024 * 1024) { // 1MB limit
        throw new OCRException(`Imagem muito grande: ${(blob.size / 1024).toFixed(0)}KB (limite: 1024KB)`);
      }
      
      // Prepare form data
      const formData = new FormData();
      formData.append('file', blob, 'document.jpg');
      
      console.log('📤 LEX: Enviando imagem para OCR.space...');
      
      // Call OCR API
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'apikey': this.apiKey
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new OCRException(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('📥 LEX: Resposta OCR recebida');
      
      // Handle API errors
      if (result.IsErroredOnProcessing) {
        const errorMsg = result.ErrorMessage || 'Erro desconhecido no OCR';
        
        // Check if it's a quota issue
        if (errorMsg.includes('quota') || errorMsg.includes('limit')) {
          throw new QuotaExceededException(`API quota exceeded: ${errorMsg}`);
        }
        
        throw new OCRException(`OCR processing error: ${errorMsg}`);
      }
      
      // Extract text from response
      const parsedResults = result.ParsedResults;
      if (!parsedResults || parsedResults.length === 0) {
        throw new OCRException('Nenhum resultado de OCR encontrado');
      }
      
      const extractedText = parsedResults[0].ParsedText || '';
      
      if (!extractedText.trim()) {
        throw new OCRException('Texto extraído está vazio');
      }
      
      // Increment usage tracking
      this.incrementUsage();
      
      console.log(`✅ LEX: OCR bem-sucedido - ${extractedText.length} caracteres extraídos`);
      
      return {
        text: this.postProcessText(extractedText),
        confidence: 85, // OCR.space doesn't provide confidence, use fixed value
        method: 'free_shared_ocr',
        provider: this.name,
        success: true,
        stats: {
          characters: extractedText.length,
          words: extractedText.split(/\s+/).length,
          quota_remaining: this.getRemainingQuota()
        }
      };
      
    } catch (error) {
      console.error('❌ LEX: Erro no OCR compartilhado:', error);
      
      // Re-throw known exceptions
      if (error instanceof OCRException || error instanceof QuotaExceededException) {
        throw error;
      }
      
      // Wrap unknown errors
      throw new OCRException(`Free OCR failed: ${error.message}`);
    }
  }
  
  postProcessText(text) {
    if (!text) return '';
    
    return text
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove common OCR artifacts
      .replace(/[|]/g, 'I')
      .replace(/[¬]/g, '')
      .replace(/[`´'']/g, "'")
      .replace(/[""]/g, '"')
      // Fix common Portuguese OCR errors
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/(\d)([A-Za-z])/g, '$1 $2')
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      // Clean up punctuation
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([.!?])\s*([A-Z])/g, '$1 $2')
      .trim();
  }
  
  getUsageStats() {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    const usage = JSON.parse(localStorage.getItem('lex_ocr_usage') || '{}');
    
    const dailyUsage = usage[today] || 0;
    const monthlyUsage = Object.keys(usage)
      .filter(date => date.startsWith(currentMonth))
      .reduce((sum, date) => sum + (usage[date] || 0), 0);
    
    return {
      daily: dailyUsage,
      monthly: monthlyUsage,
      date: today
    };
  }
  
  incrementUsage() {
    const today = new Date().toISOString().split('T')[0];
    const usage = JSON.parse(localStorage.getItem('lex_ocr_usage') || '{}');
    
    usage[today] = (usage[today] || 0) + 1;
    
    // Keep only last 60 days to prevent localStorage bloat
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const cutoffString = cutoffDate.toISOString().split('T')[0];
    
    Object.keys(usage).forEach(date => {
      if (date < cutoffString) {
        delete usage[date];
      }
    });
    
    localStorage.setItem('lex_ocr_usage', JSON.stringify(usage));
    
    console.log(`📊 LEX: Usage atualizado - ${usage[today]} OCRs hoje`);
  }
  
  getRemainingQuota() {
    const usage = this.getUsageStats();
    return {
      daily: Math.max(0, this.dailyQuota - usage.daily),
      monthly: Math.max(0, this.monthlyQuota - usage.monthly)
    };
  }
}

// ========== SILENT FALLBACK (NO USER INTERRUPTION) ==========
class SilentFallback extends OCRProvider {
  constructor() {
    super();
    this.name = 'Silent Fallback';
  }
  
  isAvailable() {
    return true; // Always available as last resort
  }
  
  async extractText(canvas) {
    console.log('🔇 LEX: OCR falhou - retornando mensagem silenciosa');
    
    // Return a silent failure without bothering the user
    return {
      success: true, // Mark as success to continue processing
      text: '[Documento escaneado - OCR temporariamente indisponível]',
      method: 'silent_fallback',
      provider: this.name,
      confidence: 0,
      silent: true,
      reason: 'OCR quota exceeded or API unavailable',
      stats: {
        characters: 0,
        words: 0,
        source: 'fallback'
      }
    };
  }
}

// ========== OCR FACTORY ==========
class OCRFactory {
  static providers = new Map([
    ['free_shared', () => new FreeSharedOCR()],
    ['silent_fallback', () => new SilentFallback()],
    // Future providers will be added here:
    // ['user_api_key', () => new UserApiKeyOCR()],
    // ['mistral_paid', () => new MistralOCR()],
    // ['google_vision', () => new GoogleVisionOCR()]
  ]);
  
  static createOCR(strategy = 'auto') {
    if (strategy === 'auto') {
      strategy = this.chooseStrategy();
    }
    
    const providerFactory = this.providers.get(strategy);
    if (!providerFactory) {
      console.warn(`⚠️ LEX: Provider '${strategy}' não encontrado, usando fallback`);
      return new SilentFallback();
    }
    
    return providerFactory();
  }
  
  static chooseStrategy() {
    // MVP logic: try free first, fallback to user assisted
    const freeProvider = new FreeSharedOCR();
    
    if (freeProvider.isAvailable()) {
      console.log('🎯 LEX: Usando estratégia free_shared (MVP)');
      return 'free_shared';
    }
    
    console.log('🎯 LEX: Quota excedida, usando estratégia silent_fallback');
    return 'silent_fallback';
  }
  
  static getUsageStats() {
    const freeProvider = new FreeSharedOCR();
    return freeProvider.getUsageStats();
  }
}

// ========== MAIN HYBRID OCR SYSTEM ==========
class HybridOCRSystem {
  constructor() {
    this.currentProvider = null;
    this.fallbackChain = [
      'free_shared',      // MVP: Try free API first
      'silent_fallback'   // Silent fallback without user interruption
    ];
    console.log('🔄 LEX: HybridOCRSystem inicializado (MVP + Future-proof)');
  }
  
  async extractTextFromPDF(pdfBlob, options = {}) {
    console.log('🔄 LEX: Iniciando extração híbrida...');
    
    try {
      // First try native PDF text extraction
      const nativeResult = await this.tryNativeExtraction(pdfBlob, options);
      
      if (this.hasEnoughText(nativeResult, options)) {
        console.log('✅ LEX: PDF com texto nativo suficiente');
        return { 
          ...nativeResult, 
          extractionMethod: 'native_text',
          ocrUsed: false,
          scannedPdfDetected: false
        };
      }
      
      console.log('🖼️ LEX: PDF escaneado detectado, iniciando OCR...');
      return await this.tryOCRExtraction(pdfBlob, options, nativeResult);
      
    } catch (error) {
      console.error('❌ LEX: Erro na extração híbrida:', error);
      throw new OCRException(`Hybrid extraction failed: ${error.message}`);
    }
  }
  
  async tryNativeExtraction(pdfBlob, options) {
    // This calls the existing PDF.js logic
    if (window.PDFProcessor) {
      const processor = new window.PDFProcessor();
      return await processor.extractTextFromPDF(pdfBlob, options);
    }
    throw new Error('PDFProcessor not available');
  }
  
  hasEnoughText(result, options) {
    if (!result || !result.text) return false;
    
    const cleanText = result.text.trim();
    const textLength = cleanText.length;
    const wordCount = cleanText.split(/\s+/).length;
    const minThreshold = options.minTextThreshold || 50;
    
    const hasMinimumText = textLength >= minThreshold;
    const hasWords = wordCount >= 5;
    const hasReasonableRatio = (textLength / (result.stats?.processedPages || 1)) >= 10;
    
    console.log('📊 LEX: Análise texto nativo:', {
      characters: textLength,
      words: wordCount,
      pages: result.stats?.processedPages || 1,
      sufficient: hasMinimumText && hasWords && hasReasonableRatio
    });
    
    return hasMinimumText && hasWords && hasReasonableRatio;
  }
  
  async tryOCRExtraction(pdfBlob, options, nativeResult) {
    console.log('🔍 LEX: Iniciando tentativas de OCR...');
    
    let lastError = null;
    
    for (const providerType of this.fallbackChain) {
      try {
        console.log(`🎯 LEX: Tentando provider: ${providerType}`);
        
        const provider = OCRFactory.createOCR(providerType);
        
        if (!provider.isAvailable()) {
          console.log(`⚠️ LEX: Provider ${providerType} não disponível`);
          continue;
        }
        
        // Render PDF page to canvas for OCR
        const canvas = await this.renderPDFToCanvas(pdfBlob, options);
        
        // Extract text using OCR
        const ocrResult = await provider.extractText(canvas);
        
        console.log(`✅ LEX: ${providerType} bem-sucedido!`);
        
        return {
          text: ocrResult.text,
          extractionMethod: 'ocr',
          ocrUsed: true,
          scannedPdfDetected: true,
          provider: ocrResult.provider,
          method: ocrResult.method,
          confidence: ocrResult.confidence,
          success: ocrResult.success,
          stats: {
            ...ocrResult.stats,
            processedPages: 1, // Currently processing one page at a time
            processingTime: Date.now() - (this.startTime || Date.now())
          },
          metadata: nativeResult.metadata || {},
          fileSize: pdfBlob.size,
          fileSizeFormatted: this.formatFileSize(pdfBlob.size)
        };
        
      } catch (error) {
        console.warn(`⚠️ LEX: Provider ${providerType} falhou:`, error.message);
        lastError = error;
        
        // If it's a quota issue, try next provider immediately
        if (error instanceof QuotaExceededException) {
          continue;
        }
        
        // For other errors, also continue to next provider
        continue;
      }
    }
    
    // If all providers failed, return fallback result
    console.error('❌ LEX: Todos os provedores OCR falharam');
    console.log('🔄 LEX: Usando resultado de texto nativo como fallback final');
    
    return {
      ...nativeResult,
      extractionMethod: 'native_fallback', 
      ocrUsed: false,
      scannedPdfDetected: true,
      ocrError: lastError?.message || 'All OCR providers failed'
    };
  }
  
  async renderPDFToCanvas(pdfBlob, options) {
    console.log('🎨 LEX: Renderizando PDF para canvas...');
    
    // Use existing PDF.js infrastructure
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
    
    // Get first page (for MVP, process only first page)
    const page = await pdf.getPage(1);
    
    // Configure viewport with balanced quality for OCR (optimized for 1MB API limit)
    const scale = options.ocrQuality === 3 ? 1.8 : 
                  options.ocrQuality === 2 ? 1.4 : 1.2; // Reduced for size limit
    
    const viewport = page.getViewport({ scale });
    
    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // White background for better OCR
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Render page
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    console.log(`✅ LEX: PDF renderizado - ${canvas.width}x${canvas.height}px`);
    return canvas;
  }
  
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// ========== GLOBAL EXPORTS ==========
if (typeof window !== 'undefined') {
  window.HybridOCRSystem = HybridOCRSystem;
  window.OCRFactory = OCRFactory;
  window.OCRException = OCRException;
  window.QuotaExceededException = QuotaExceededException;
  
  console.log('✅ LEX: OCR System carregado (MVP + Future-proof)');
}