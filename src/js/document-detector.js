// Document Detector - Core infrastructure for document type detection
// Part of LEX Document Processing System

class DocumentDetector {
  /**
   * Detecta o tipo de documento baseado na URL e content-type
   * @param {string} url - URL do documento
   * @param {string} contentType - Content-Type do documento
   * @returns {string} - 'PDF', 'IMAGE', ou 'HTML'
   */
  static detectDocumentType(url, contentType) {
    console.log('🔍 LEX: Detectando tipo de documento');
    console.log('- URL:', url);
    console.log('- Content-Type:', contentType);
    
    // Verificar PDF primeiro
    if (this.isPDF(url, contentType)) {
      console.log('✅ LEX: Documento PDF detectado');
      return 'PDF';
    }
    
    // Verificar imagem
    if (this.isImage(url, contentType)) {
      console.log('✅ LEX: Documento de imagem detectado');
      return 'IMAGE';
    }
    
    // Default para HTML
    console.log('✅ LEX: Documento HTML detectado (padrão)');
    return 'HTML';
  }
  
  /**
   * Verifica se o documento é um PDF
   * @param {string} url - URL do documento
   * @param {string} contentType - Content-Type do documento
   * @returns {boolean}
   */
  static isPDF(url, contentType) {
    // Verificar content-type
    if (contentType && contentType.toLowerCase().includes('application/pdf')) {
      return true;
    }
    
    // Verificar extensão na URL
    if (url && /\.pdf(\?|$)/i.test(url)) {
      return true;
    }
    
    // Verificar padrões comuns do PJe para PDFs
    if (url && url.includes('/documento/') && url.includes('pdf')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Verifica se o documento é uma imagem
   * @param {string} url - URL do documento
   * @param {string} contentType - Content-Type do documento
   * @returns {boolean}
   */
  static isImage(url, contentType) {
    // Verificar content-type
    if (contentType && contentType.toLowerCase().startsWith('image/')) {
      return true;
    }
    
    // Verificar extensões de imagem na URL
    if (url && /\.(jpg|jpeg|png|tiff|tif|bmp|gif|webp)(\?|$)/i.test(url)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Obtém o blob do documento via fetch autenticado
   * @param {string} url - URL do documento
   * @returns {Promise<Blob>} - Blob do documento
   */
  static async getDocumentBlob(url) {
    console.log('📥 LEX: Baixando documento:', url);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include', // Importante para manter sessão do PJe
        headers: {
          'Accept': '*/*',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      console.log('✅ LEX: Documento baixado com sucesso');
      console.log('- Tamanho:', this.formatFileSize(blob.size));
      console.log('- Tipo:', blob.type);
      
      return blob;
      
    } catch (error) {
      console.error('❌ LEX: Erro ao baixar documento:', error);
      throw new Error(`Falha ao baixar documento: ${error.message}`);
    }
  }
  
  /**
   * Obtém o content-type do documento via HEAD request
   * @param {string} url - URL do documento
   * @returns {Promise<string>} - Content-Type do documento
   */
  static async getContentType(url) {
    console.log('🔍 LEX: Verificando content-type:', url);
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        console.warn('⚠️ LEX: HEAD request falhou, usando GET');
        // Fallback para GET se HEAD não funcionar
        const getResponse = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Range': 'bytes=0-1023' // Apenas os primeiros 1KB
          }
        });
        return getResponse.headers.get('content-type') || '';
      }
      
      const contentType = response.headers.get('content-type') || '';
      console.log('✅ LEX: Content-Type obtido:', contentType);
      return contentType;
      
    } catch (error) {
      console.warn('⚠️ LEX: Erro ao obter content-type:', error);
      return ''; // Retorna string vazia em caso de erro
    }
  }
  
  /**
   * Valida se a URL é acessível
   * @param {string} url - URL para validar
   * @returns {Promise<boolean>} - true se acessível
   */
  static async isUrlAccessible(url) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        credentials: 'include'
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  /**
   * Formata tamanho de arquivo para exibição
   * @param {number} bytes - Tamanho em bytes
   * @returns {string} - Tamanho formatado
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Gera uma chave de cache baseada na URL
   * @param {string} url - URL do documento
   * @returns {string} - Chave de cache
   */
  static generateCacheKey(url) {
    try {
      // Usar btoa para codificar a URL e criar uma chave única
      const encoded = btoa(url);
      // Remover caracteres especiais e limitar tamanho
      return encoded.replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
    } catch {
      // Fallback se btoa falhar
      return url.replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
    }
  }
  
  /**
   * Extrai informações básicas do documento
   * @param {string} url - URL do documento
   * @param {string} contentType - Content-Type do documento
   * @returns {Object} - Informações do documento
   */
  static extractDocumentInfo(url, contentType) {
    const type = this.detectDocumentType(url, contentType);
    const filename = this.extractFilename(url);
    
    return {
      url: url,
      type: type,
      contentType: contentType,
      filename: filename,
      cacheKey: this.generateCacheKey(url),
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Extrai nome do arquivo da URL
   * @param {string} url - URL do documento
   * @returns {string} - Nome do arquivo
   */
  static extractFilename(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      return filename || 'documento';
    } catch {
      return 'documento';
    }
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.DocumentDetector = DocumentDetector;
}

console.log('✅ LEX: DocumentDetector carregado com sucesso');