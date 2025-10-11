import type { PDFExtractionResult, PDFProcessorStatus, EnvironmentInfo, ExtractionOptions } from '../../types/lex-types';
declare global {
    interface Window {
        pdfjsLib?: any;
    }
}
export declare class PDFProcessor {
    private pdfjsLib;
    private initialized;
    private loading;
    private readonly version;
    private workerSrc;
    constructor();
    /**
     * Inicializa o PDF.js carregando a biblioteca via CDN
     */
    initialize(): Promise<void>;
    /**
     * Verifica se PDF.js já está carregado (via content script)
     */
    private loadPDFJS;
    /**
     * Aguarda PDF.js estar disponível no window
     */
    private waitForPDFJS;
    /**
     * Configura o PDF.js com worker e parâmetros
     */
    private configurePDFJS;
    /**
     * Valida se a configuração do worker está funcionando
     */
    private validateWorkerConfiguration;
    /**
     * Aguarda a inicialização em andamento
     */
    private waitForInitialization;
    /**
     * Verifica se o PDF.js está pronto para uso
     */
    isReady(): boolean;
    /**
     * Obtém informações sobre o estado do PDF.js
     */
    getStatus(): PDFProcessorStatus;
    /**
     * Obtém informações sobre o ambiente de execução
     */
    getEnvironmentInfo(): EnvironmentInfo;
    /**
     * Extrai versão do Chrome do user agent
     */
    private getChromeVersion;
    /**
     * Testa a configuração do worker com diagnósticos detalhados
     */
    testWorkerConfiguration(): Promise<{
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
    }>;
    /**
     * Extrai texto de um PDF
     * @param pdfBlob - Blob do arquivo PDF
     * @param options - Opções de extração
     * @returns Resultado da extração com texto, páginas e metadados
     */
    extractTextFromPDF(pdfBlob: Blob, options?: ExtractionOptions): Promise<PDFExtractionResult>;
    /**
     * Extrai metadados do documento PDF
     */
    private extractMetadata;
    /**
     * Converte data PDF para string ISO
     */
    private parsePDFDate;
    /**
     * Formata bytes para exibição
     */
    private formatBytes;
}
//# sourceMappingURL=pdf-processor.d.ts.map