// PDF Processor - PDF.js integration for LEX Document Processing System
// Handles PDF text extraction and metadata processing with robust worker configuration

import type { 
  PDFExtractionResult, 
  PDFProcessorStatus, 
  EnvironmentInfo, 
  ExtractionOptions
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
  
  // Placeholder para outros métodos que serão convertidos posteriormente
  public async extractTextFromPDF(_pdfBlob: Blob, _options?: ExtractionOptions): Promise<PDFExtractionResult> {
    // TODO: Implementar conversão completa
    throw new Error('Método ainda não convertido para TypeScript');
  }
}