// PDF Processor - PDF.js integration for LEX Document Processing System
// Handles PDF text extraction and metadata processing with robust worker configuration

import type {
  PDFExtractionResult,
  PDFProcessorStatus,
  EnvironmentInfo,
  ExtractionOptions,
  PageResult,
  PDFMetadata
} from '../../types/lex-types';

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

export class PDFProcessor {
  private pdfjsLib: any = null;
  private initialized: boolean = false;
  private loading: boolean = false;
  private readonly version: string = '3.11.174'; // PDF.js version
  private workerSrc: string | null = null;
  
  constructor() {
    console.log('📄 LEX: PDFProcessor instanciado');
  }
  
  /**
   * Inicializa o PDF.js carregando a biblioteca via CDN
   */
  public async initialize(): Promise<void> {
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
      throw new Error(`Falha ao carregar PDF.js: ${(error as Error).message}`);
    }
  }
  
  /**
   * Verifica se PDF.js já está carregado (via content script)
   */
  private async loadPDFJS(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('📚 LEX: Verificando PDF.js pré-carregado...');
      
      // PDF.js deve estar disponível pois foi carregado como content script
      this.waitForPDFJS(resolve, reject);
    });
  }
  
  /**
   * Aguarda PDF.js estar disponível no window
   */
  private waitForPDFJS(resolve: () => void, reject: (error: Error) => void): void {
    let attempts = 0;
    const maxAttempts = 100; // 10 segundos (mais tempo pois pode demorar para carregar)
    
    const checkPDFJS = (): void => {
      attempts++;
      
      console.log(`🔍 LEX: Tentativa ${attempts}/${maxAttempts} - Verificando PDF.js pré-carregado...`);
      
      // Tentar diferentes formas de acessar PDF.js
      const possibleAccess = [
        () => window.pdfjsLib,
        () => (window as any)['pdfjs-dist/build/pdf'],
        () => (globalThis as any).pdfjsLib,
        () => (self as any).pdfjsLib,
        () => window.pdfjsLib || (window as any).pdfjs
      ];
      
      for (let i = 0; i < possibleAccess.length; i++) {
        try {
          const accessor = possibleAccess[i];
          if (accessor) {
            const pdfjs = accessor();
            if (pdfjs && typeof pdfjs === 'object' && pdfjs.getDocument) {
              this.pdfjsLib = pdfjs;
              console.log(`✅ LEX: PDF.js encontrado como content script (método ${i + 1})`);
              resolve();
              return;
            }
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
        console.log('🔍 LEX: globalThis.pdfjsLib:', typeof (globalThis as any).pdfjsLib);
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
   */
  private async configurePDFJS(): Promise<void> {
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
   */
  private async validateWorkerConfiguration(): Promise<boolean> {
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
        await loadingTask.promise;
        console.log('✅ LEX: Worker PDF.js funcionando corretamente');
        console.log('- Worker Source:', this.workerSrc);
        console.log('- PDF Test Document carregado com sucesso');
        return true;
      } catch (pdfError: any) {
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
      console.error('❌ LEX: Falha na validação do worker:', (error as Error).message);
      throw new Error(`Validação do worker falhou: ${(error as Error).message}`);
    }
  }
  
  /**
   * Aguarda a inicialização em andamento
   */
  private async waitForInitialization(): Promise<void> {
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
   */
  public isReady(): boolean {
    return this.initialized && this.pdfjsLib && !this.loading;
  }
  
  /**
   * Obtém informações sobre o estado do PDF.js
   */
  public getStatus(): PDFProcessorStatus {
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
   */
  public getEnvironmentInfo(): EnvironmentInfo {
    return {
      isExtension: typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.getURL,
      manifestVersion: chrome?.runtime?.getManifest?.()?.manifest_version || null,
      userAgent: navigator.userAgent,
      chromeVersion: this.getChromeVersion(),
      workerSupported: typeof Worker !== 'undefined'
    };
  }
  
  /**
   * Extrai versão do Chrome do user agent
   */
  private getChromeVersion(): string | null {
    const match = navigator.userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
    return match?.[1] || null;
  }
  
  /**
   * Testa a configuração do worker com diagnósticos detalhados
   */
  public async testWorkerConfiguration(): Promise<{
    success: boolean;
    workerConfigured: boolean;
    workerFunctional: boolean;
    environment: EnvironmentInfo;
    errors: Array<{
      type: string;
      message: string;
      timestamp: string;
    }>;
    details: {
      workerSource?: string;
    };
  }> {
    console.log('🧪 LEX: Iniciando teste de configuração do worker...');
    
    const testResult = {
      success: false,
      workerConfigured: false,
      workerFunctional: false,
      environment: this.getEnvironmentInfo(),
      errors: [] as Array<{
        type: string;
        message: string;
        timestamp: string;
      }>,
      details: {} as { workerSource?: string }
    };
    
    try {
      // Verificar se está inicializado
      if (!this.isReady()) {
        await this.initialize();
      }
      
      testResult.workerConfigured = !!this.workerSrc;
      if (this.workerSrc) {
        testResult.details.workerSource = this.workerSrc;
      }
      
      // Testar funcionalidade do worker
      await this.validateWorkerConfiguration();
      testResult.workerFunctional = true;
      testResult.success = true;
      
      console.log('✅ LEX: Teste de configuração do worker bem-sucedido');
      
    } catch (error) {
      testResult.errors.push({
        type: 'worker_test_failed',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      });
      
      console.error('❌ LEX: Teste de configuração do worker falhou:', (error as Error).message);
    }
    
    return testResult;
  }
  
  /**
   * Extrai texto de um PDF
   * @param pdfBlob - Blob do arquivo PDF
   * @param options - Opções de extração
   * @returns Resultado da extração com texto, páginas e metadados
   */
  public async extractTextFromPDF(pdfBlob: Blob, options?: ExtractionOptions): Promise<PDFExtractionResult> {
    console.log('📄 LEX: Iniciando extração de texto do PDF...');
    console.log('- Tamanho do arquivo:', this.formatBytes(pdfBlob.size));

    const startTime = Date.now();
    const result: PDFExtractionResult = {
      text: '',
      pages: [],
      metadata: null,
      stats: {
        totalPages: 0,
        processedPages: 0,
        totalCharacters: 0,
        averageCharsPerPage: 0,
        processingTime: 0,
        errors: []
      },
      success: false,
      fileSize: pdfBlob.size,
      fileSizeFormatted: this.formatBytes(pdfBlob.size)
    };

    try {
      // Garantir que PDF.js está inicializado
      if (!this.isReady()) {
        console.log('⏳ LEX: Inicializando PDF.js...');
        await this.initialize();
      }

      // Converter Blob para ArrayBuffer
      console.log('🔄 LEX: Convertendo blob para ArrayBuffer...');
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Carregar documento PDF
      console.log('📖 LEX: Carregando documento PDF...');
      const loadingTask = this.pdfjsLib.getDocument({
        data: uint8Array,
        verbosity: 0 // Reduzir logs
      });

      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;

      console.log(`✅ LEX: PDF carregado com sucesso - ${numPages} páginas`);
      result.stats.totalPages = numPages;

      // Extrair metadados
      try {
        const metadata = await pdfDocument.getMetadata();
        result.metadata = this.extractMetadata(metadata);
        console.log('📋 LEX: Metadados extraídos:', result.metadata);
      } catch (metadataError) {
        console.warn('⚠️ LEX: Erro ao extrair metadados:', metadataError);
      }

      // Determinar quantas páginas processar
      const maxPages = options?.maxPages ?? numPages;
      const pagesToProcess = Math.min(maxPages, numPages);

      console.log(`📄 LEX: Processando ${pagesToProcess} de ${numPages} páginas...`);

      // Processar cada página
      const pageDelimiter = options?.pageDelimiter ?? '\n\n--- Página {page} ---\n\n';

      for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
        try {
          // Callback de progresso
          if (options?.progressCallback) {
            options.progressCallback({
              currentPage: pageNum,
              totalPages: pagesToProcess,
              progress: (pageNum / pagesToProcess) * 100
            });
          }

          console.log(`📄 LEX: Processando página ${pageNum}/${pagesToProcess}...`);

          const page = await pdfDocument.getPage(pageNum);
          const textContent = await page.getTextContent();

          // Extrair texto dos items
          let pageText = '';
          if (options?.combineTextItems !== false) {
            // Combinar itens de texto em uma string
            pageText = textContent.items
              .map((item: any) => item.str)
              .join(' ');
          } else {
            // Manter estrutura de layout
            pageText = textContent.items
              .map((item: any) => item.str)
              .join('\n');
          }

          // Normalizar espaços em branco se solicitado
          if (options?.normalizeWhitespace !== false) {
            pageText = pageText
              .replace(/\s+/g, ' ')
              .replace(/\n\s*\n/g, '\n')
              .trim();
          }

          // Adicionar ao resultado
          const pageResult: PageResult = {
            pageNumber: pageNum,
            text: pageText,
            characterCount: pageText.length
          };

          result.pages.push(pageResult);
          result.stats.processedPages++;
          result.stats.totalCharacters += pageText.length;

          // Adicionar delimitador de página se solicitado
          if (options?.includePageNumbers !== false) {
            const delimiter = pageDelimiter.replace('{page}', pageNum.toString());
            result.text += delimiter + pageText;
          } else {
            result.text += pageText + '\n';
          }

          console.log(`✅ LEX: Página ${pageNum} processada - ${pageText.length} caracteres`);

        } catch (pageError) {
          console.error(`❌ LEX: Erro ao processar página ${pageNum}:`, pageError);
          result.stats.errors.push({
            page: pageNum,
            error: (pageError as Error).message
          });
        }
      }

      // Calcular estatísticas
      result.stats.averageCharsPerPage = result.stats.processedPages > 0
        ? Math.round(result.stats.totalCharacters / result.stats.processedPages)
        : 0;

      result.stats.processingTime = Date.now() - startTime;
      result.success = result.stats.processedPages > 0;

      console.log('✅ LEX: Extração de PDF concluída');
      console.log('📊 LEX: Estatísticas:', {
        páginas: `${result.stats.processedPages}/${result.stats.totalPages}`,
        caracteres: result.stats.totalCharacters,
        tempo: `${result.stats.processingTime}ms`,
        erros: result.stats.errors.length
      });

      return result;

    } catch (error) {
      console.error('❌ LEX: Erro fatal ao extrair texto do PDF:', error);
      result.stats.processingTime = Date.now() - startTime;
      result.success = false;
      result.stats.errors.push({
        page: 0,
        error: `Erro fatal: ${(error as Error).message}`
      });

      throw new Error(`Falha ao extrair texto do PDF: ${(error as Error).message}`);
    }
  }

  /**
   * Extrai metadados do documento PDF
   */
  private extractMetadata(metadata: any): PDFMetadata {
    const info = metadata.info || {};
    const pdfVersion = metadata.pdfFormatVersion || null;

    return {
      title: info.Title || null,
      author: info.Author || null,
      subject: info.Subject || null,
      creator: info.Creator || null,
      producer: info.Producer || null,
      creationDate: info.CreationDate ? this.parsePDFDate(info.CreationDate) : null,
      modificationDate: info.ModDate ? this.parsePDFDate(info.ModDate) : null,
      pdfVersion: pdfVersion
    };
  }

  /**
   * Converte data PDF para string ISO
   */
  private parsePDFDate(pdfDate: string): string | null {
    try {
      // Formato PDF: D:YYYYMMDDHHmmSSOHH'mm'
      const match = pdfDate.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).toISOString();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Formata bytes para exibição
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}