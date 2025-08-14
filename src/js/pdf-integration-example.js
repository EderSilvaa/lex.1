// Exemplo de integração do PDFProcessor com o sistema LEX
// Este arquivo demonstra como usar o PDFProcessor na extensão

/**
 * Exemplo de integração do PDFProcessor com a função atual de extração de documentos
 */
async function exemploIntegracaoPDF() {
  console.log('📄 LEX: Exemplo de integração PDF');
  
  // 1. Detectar documento PDF no iframe
  const iframe = document.querySelector('iframe[src*="/documento/"]');
  if (!iframe) {
    console.log('⚠️ LEX: Nenhum iframe de documento encontrado');
    return null;
  }
  
  const url = iframe.src;
  console.log('🔗 LEX: URL do documento:', url);
  
  // 2. Verificar tipo de documento
  const contentType = await DocumentDetector.getContentType(url);
  const documentType = DocumentDetector.detectDocumentType(url, contentType);
  
  console.log('📋 LEX: Tipo detectado:', documentType);
  
  if (documentType !== 'PDF') {
    console.log('ℹ️ LEX: Não é um PDF, usando método atual');
    return null;
  }
  
  // 3. Processar PDF
  try {
    const processor = new PDFProcessor();
    await processor.initialize();
    
    console.log('📥 LEX: Baixando PDF...');
    const pdfBlob = await DocumentDetector.getDocumentBlob(url);
    
    console.log('✅ LEX: PDF baixado, validando...');
    const isValid = await processor.validatePDF(pdfBlob);
    
    if (!isValid) {
      console.error('❌ LEX: PDF inválido');
      return null;
    }
    
    console.log('📄 LEX: Extraindo texto do PDF...');
    const result = await processor.extractTextFromPDF(pdfBlob, {
      includeMetadata: true,
      includePageNumbers: true,
      normalizeWhitespace: true,
      progressCallback: (progress) => {
        console.log(`📊 LEX: Progresso: ${Math.round(progress.progress)}%`);
      }
    });
    
    console.log('✅ LEX: Texto extraído com sucesso');
    console.log('- Páginas:', result.stats.processedPages);
    console.log('- Caracteres:', result.stats.totalCharacters);
    console.log('- Tempo:', result.stats.processingTime + 'ms');
    
    return {
      url: url,
      type: 'PDF',
      conteudo: result.text,
      metadata: result.metadata,
      stats: result.stats,
      tamanho: result.fileSize
    };
    
  } catch (error) {
    console.error('❌ LEX: Erro ao processar PDF:', error);
    return null;
  }
}

/**
 * Função melhorada para substituir a atual extrairConteudoDocumento
 */
async function extrairConteudoDocumentoMelhorado() {
  console.log('📄 LEX: Iniciando extração melhorada de documento');
  
  try {
    // 1. Detectar iframe do documento
    const iframe = document.querySelector('iframe[src*="/documento/"], iframe[src*="/documento/download/"], embed[src*="/documento/"], object[data*="/documento/"]');
    
    if (!iframe) {
      console.log('⚠️ LEX: Nenhum documento encontrado');
      return null;
    }
    
    const documentUrl = iframe.src || iframe.getAttribute('src') || iframe.data;
    console.log('🔗 LEX: URL do documento:', documentUrl);
    
    // 2. Detectar tipo de documento
    const contentType = await DocumentDetector.getContentType(documentUrl);
    const documentType = DocumentDetector.detectDocumentType(documentUrl, contentType);
    
    console.log('📋 LEX: Tipo detectado:', documentType, '| Content-Type:', contentType);
    
    // 3. Processar baseado no tipo
    switch (documentType) {
      case 'PDF':
        return await processarPDF(documentUrl);
      
      case 'IMAGE':
        console.log('🖼️ LEX: Imagem detectada - OCR será implementado na próxima fase');
        return await processarImagem(documentUrl);
      
      default:
        console.log('📄 LEX: HTML/Texto - usando método atual');
        return await processarHTML(documentUrl);
    }
    
  } catch (error) {
    console.error('❌ LEX: Erro na extração melhorada:', error);
    return null;
  }
}

/**
 * Processa documento PDF
 */
async function processarPDF(url) {
  console.log('📄 LEX: Processando PDF...');
  
  try {
    const processor = new PDFProcessor();
    await processor.initialize();
    
    const pdfBlob = await DocumentDetector.getDocumentBlob(url);
    
    // Verificar se está protegido por senha
    const isProtected = await processor.isPasswordProtected(pdfBlob);
    if (isProtected) {
      console.warn('🔒 LEX: PDF protegido por senha');
      return {
        url: url,
        tipo: 'PDF',
        conteudo: '[PDF protegido por senha - não foi possível extrair texto]',
        erro: 'password_protected'
      };
    }
    
    // Extrair texto
    const result = await processor.extractTextFromPDF(pdfBlob, {
      includeMetadata: true,
      maxPages: 50, // Limitar para evitar PDFs muito grandes
      progressCallback: (progress) => {
        console.log(`📊 LEX: Processando página ${progress.currentPage}/${progress.totalPages}`);
      }
    });
    
    return {
      url: url,
      tipo: 'PDF',
      conteudo: result.text,
      metadata: result.metadata,
      paginas: result.stats.processedPages,
      tamanho: result.fileSizeFormatted,
      tempoProcessamento: result.stats.processingTime
    };
    
  } catch (error) {
    console.error('❌ LEX: Erro ao processar PDF:', error);
    return {
      url: url,
      tipo: 'PDF',
      conteudo: '[Erro ao processar PDF]',
      erro: error.message
    };
  }
}

/**
 * Processa imagem (placeholder para OCR futuro)
 */
async function processarImagem(url) {
  console.log('🖼️ LEX: Processando imagem...');
  
  // TODO: Implementar OCR com Tesseract.js na próxima fase
  return {
    url: url,
    tipo: 'IMAGE',
    conteudo: '[Imagem detectada - OCR será implementado em breve]',
    pendente: 'ocr_implementation'
  };
}

/**
 * Processa HTML (método atual)
 */
async function processarHTML(url) {
  console.log('📄 LEX: Processando HTML...');
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain,*/*',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const htmlContent = await response.text();
    const texto = extrairTextoDeHTML(htmlContent);
    
    return {
      url: url,
      tipo: 'HTML',
      conteudo: texto,
      tamanho: htmlContent.length
    };
    
  } catch (error) {
    console.error('❌ LEX: Erro ao processar HTML:', error);
    return {
      url: url,
      tipo: 'HTML',
      conteudo: '[Erro ao processar documento HTML]',
      erro: error.message
    };
  }
}

/**
 * Extrai texto limpo de HTML (função atual)
 */
function extrairTextoDeHTML(html) {
  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const scripts = tempDiv.querySelectorAll('script, style, noscript');
    scripts.forEach(el => el.remove());
    
    let texto = tempDiv.innerText || tempDiv.textContent || '';
    
    texto = texto
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    return texto;
  } catch (error) {
    console.error('❌ LEX: Erro ao extrair texto de HTML:', error);
    return html.replace(/<[^>]*>/g, '');
  }
}

/**
 * Exemplo de uso com cache
 */
async function exemploComCache() {
  console.log('💾 LEX: Exemplo com sistema de cache');
  
  const iframe = document.querySelector('iframe[src*="/documento/"]');
  if (!iframe) return null;
  
  const url = iframe.src;
  const cacheKey = DocumentDetector.generateCacheKey(url);
  
  // Verificar cache (simulado)
  const cache = new Map();
  
  if (cache.has(cacheKey)) {
    console.log('✅ LEX: Documento encontrado no cache');
    return cache.get(cacheKey);
  }
  
  // Processar documento
  const resultado = await extrairConteudoDocumentoMelhorado();
  
  if (resultado) {
    // Armazenar no cache
    cache.set(cacheKey, resultado);
    console.log('💾 LEX: Documento armazenado no cache');
  }
  
  return resultado;
}

/**
 * Exemplo de busca em PDF
 */
async function exemploBuscaEmPDF(termoBusca) {
  console.log(`🔍 LEX: Buscando "${termoBusca}" no documento atual`);
  
  const iframe = document.querySelector('iframe[src*="/documento/"]');
  if (!iframe) return null;
  
  const url = iframe.src;
  const contentType = await DocumentDetector.getContentType(url);
  const documentType = DocumentDetector.detectDocumentType(url, contentType);
  
  if (documentType !== 'PDF') {
    console.log('⚠️ LEX: Busca só funciona em PDFs por enquanto');
    return null;
  }
  
  try {
    const processor = new PDFProcessor();
    await processor.initialize();
    
    const pdfBlob = await DocumentDetector.getDocumentBlob(url);
    
    const resultados = await processor.searchInPDF(pdfBlob, termoBusca, {
      caseSensitive: false,
      wholeWords: false,
      maxResults: 10
    });
    
    console.log(`✅ LEX: Encontradas ${resultados.totalMatches} ocorrências`);
    
    return resultados;
    
  } catch (error) {
    console.error('❌ LEX: Erro na busca:', error);
    return null;
  }
}

// Exportar funções para uso global
if (typeof window !== 'undefined') {
  window.exemploIntegracaoPDF = exemploIntegracaoPDF;
  window.extrairConteudoDocumentoMelhorado = extrairConteudoDocumentoMelhorado;
  window.exemploBuscaEmPDF = exemploBuscaEmPDF;
}

console.log('✅ LEX: Exemplos de integração PDF carregados');