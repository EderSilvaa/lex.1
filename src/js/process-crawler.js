// Process Crawler - Descobre e lista todos os documentos de um processo judicial no PJe
// Part of LEX Document Processing System

class ProcessCrawler {
  constructor() {
    this.baseUrl = window.location.origin;
    this.processNumber = null;
    this.documents = [];
    console.log('📋 LEX: ProcessCrawler instanciado');
  }

  /**
   * Descobre todos os documentos do processo atual
   * @returns {Promise<Array>} Lista de documentos encontrados
   */
  async discoverAllDocuments() {
    console.log('🔍 LEX: Iniciando descoberta de documentos do processo...');

    try {
      // 1. Extrair número do processo atual
      this.processNumber = this.extractProcessNumber();

      if (!this.processNumber) {
        throw new Error('Número do processo não encontrado na página');
      }

      console.log('📄 LEX: Processo identificado:', this.processNumber);

      // 2. Detectar estratégia de descoberta baseado na URL
      const discoveryStrategy = this.detectDiscoveryStrategy();
      console.log('🎯 LEX: Estratégia de descoberta:', discoveryStrategy);

      // 3. Executar descoberta baseada na estratégia
      switch (discoveryStrategy) {
        case 'consulta_documento':
          this.documents = await this.discoverViaConsultaDocumento();
          break;

        case 'dom_scraping':
          this.documents = await this.discoverViaDomScraping();
          break;

        case 'timeline_scraping':
          this.documents = await this.discoverViaTimeline();
          break;

        default:
          console.warn('⚠️ LEX: Estratégia não reconhecida, usando DOM scraping padrão');
          this.documents = await this.discoverViaDomScraping();
      }

      console.log(`✅ LEX: Descoberta concluída - ${this.documents.length} documentos encontrados`);
      return this.documents;

    } catch (error) {
      console.error('❌ LEX: Erro na descoberta de documentos:', error);
      throw error;
    }
  }

  /**
   * Extrai o número do processo da página atual
   * @returns {string|null} Número do processo
   */
  extractProcessNumber() {
    const texto = document.body.innerText;

    // Padrão CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
    const match = texto.match(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4})/);

    if (match) {
      return match[0];
    }

    // Tentar extrair de elementos específicos do PJe
    const processoElements = document.querySelectorAll('[class*="processo"], [id*="processo"]');
    for (const el of processoElements) {
      const text = el.textContent || '';
      const match = text.match(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4})/);
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  /**
   * Extrai o ID interno do processo (usado pelo PJe nas URLs)
   * @returns {string|null} ID do processo
   */
  extractProcessId() {
    console.log('🔍 LEX: Extraindo ID do processo...');
    console.log('🔍 LEX: URL atual:', window.location.href);

    // 1. Tentar extrair da URL atual
    const urlParams = new URLSearchParams(window.location.search);
    const idProcessoFromUrl = urlParams.get('idProcesso');

    if (idProcessoFromUrl) {
      console.log('✅ LEX: ID processo encontrado na URL:', idProcessoFromUrl);
      return idProcessoFromUrl;
    }

    // 2. Tentar extrair de inputs hidden
    const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
    for (const input of hiddenInputs) {
      const name = input.name || input.id || '';
      if (name.toLowerCase().includes('idprocesso') || name.toLowerCase().includes('processo')) {
        const value = input.value;
        if (value && /^\d+$/.test(value)) {
          console.log('✅ LEX: ID processo encontrado em input hidden:', value);
          return value;
        }
      }
    }

    // 3. Tentar extrair de atributos data-*
    const dataElements = document.querySelectorAll('[data-id-processo], [data-processo-id], [data-idprocesso]');
    for (const el of dataElements) {
      const id = el.getAttribute('data-id-processo') ||
                 el.getAttribute('data-processo-id') ||
                 el.getAttribute('data-idprocesso');

      if (id && /^\d+$/.test(id)) {
        console.log('✅ LEX: ID processo encontrado em data attribute:', id);
        return id;
      }
    }

    // 4. Tentar extrair de links que contenham idProcesso
    const links = document.querySelectorAll('a[href*="idProcesso="]');
    for (const link of links) {
      const href = link.href;
      const match = href.match(/idProcesso=(\d+)/);
      if (match) {
        console.log('✅ LEX: ID processo encontrado em link:', match[1]);
        return match[1];
      }
    }

    // 5. Tentar extrair de scripts na página (variáveis JavaScript)
    const scripts = document.getElementsByTagName('script');
    for (const script of scripts) {
      const content = script.textContent || script.innerHTML;
      const match = content.match(/idProcesso["\s:=]+(\d+)/i);
      if (match) {
        console.log('✅ LEX: ID processo encontrado em script:', match[1]);
        return match[1];
      }
    }

    // 6. Tentar extrair de iframes
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      const src = iframe.src || iframe.getAttribute('src');
      if (src && src.includes('idProcesso=')) {
        const match = src.match(/idProcesso=(\d+)/);
        if (match) {
          console.log('✅ LEX: ID processo encontrado em iframe:', match[1]);
          return match[1];
        }
      }
    }

    console.warn('⚠️ LEX: ID do processo não encontrado em nenhum lugar');
    return null;
  }

  /**
   * Detecta qual estratégia usar para descobrir documentos
   * @returns {string} Nome da estratégia
   */
  detectDiscoveryStrategy() {
    const url = window.location.href;
    const pathname = window.location.pathname;

    // Se estamos na página de autos digitais (PJE-TJPA) - documentos já estão no DOM!
    if (pathname.includes('/listAutosDigitais.seam')) {
      return 'dom_scraping';
    }

    // Se já estamos na página de consulta de documentos
    if (pathname.includes('/ConsultaDocumento/listView.seam')) {
      return 'consulta_documento';
    }

    // Se estamos visualizando um documento específico
    if (pathname.includes('/documento/') || url.includes('documento')) {
      return 'dom_scraping';
    }

    // Se estamos na timeline/movimentações
    if (pathname.includes('/movimentacao') || pathname.includes('/timeline')) {
      return 'timeline_scraping';
    }

    // Padrão: scraping do DOM
    return 'dom_scraping';
  }

  /**
   * Descobre documentos através da página ConsultaDocumento
   * @returns {Promise<Array>} Lista de documentos
   */
  async discoverViaConsultaDocumento() {
    console.log('📋 LEX: Usando estratégia ConsultaDocumento...');
    console.log('📋 LEX: URL atual:', window.location.href);
    console.log('📋 LEX: Pathname:', window.location.pathname);

    try {
      // Extrair ID do processo
      const processId = this.extractProcessId();

      console.log('🔑 LEX: Process ID extraído:', processId);

      if (!processId) {
        console.warn('⚠️ LEX: ID do processo não encontrado, tentando iframe...');
        return await this.discoverViaIframe();
      }

      // URL da página de consulta de documentos com ID do processo
      const consultaUrl = `${this.baseUrl}/pje/Processo/ConsultaDocumento/listView.seam?idProcesso=${processId}`;

      console.log('🌐 LEX: Base URL:', this.baseUrl);
      console.log('🌐 LEX: URL de consulta construída:', consultaUrl);
      console.log('🔑 LEX: ID do processo:', processId);

      // Fazer requisição autenticada
      const response = await fetch(consultaUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'Referer': window.location.href,
          'Cache-Control': 'no-cache'
        }
      });

      console.log('📡 LEX: Response status:', response.status);

      if (!response.ok) {
        console.warn(`⚠️ LEX: Página ConsultaDocumento retornou ${response.status}, tentando iframe...`);
        return await this.discoverViaIframe();
      }

      const html = await response.text();
      console.log('✅ LEX: HTML da página ConsultaDocumento obtido');
      console.log('📊 LEX: Tamanho do HTML:', html.length, 'caracteres');

      // Parsear HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Extrair documentos da tabela
      const documents = this.parseDocumentTable(doc);

      console.log(`📄 LEX: ${documents.length} documentos encontrados na primeira página`);

      if (documents.length === 0) {
        console.warn('⚠️ LEX: Nenhum documento encontrado via fetch, tentando iframe...');
        return await this.discoverViaIframe();
      }

      // Verificar se há paginação
      const totalPages = this.detectPagination(doc);

      if (totalPages > 1) {
        console.log(`📄 LEX: Detectadas ${totalPages} páginas de documentos`);

        // Buscar documentos das outras páginas
        for (let page = 2; page <= totalPages; page++) {
          console.log(`📄 LEX: Processando página ${page}/${totalPages}...`);
          const pageDocuments = await this.fetchDocumentsPage(page, processId);
          documents.push(...pageDocuments);
        }
      }

      return documents;

    } catch (error) {
      console.error('❌ LEX: Erro na estratégia ConsultaDocumento:', error);
      // Fallback para iframe
      return await this.discoverViaIframe();
    }
  }

  /**
   * Descobre documentos usando iframe invisível (fallback robusto)
   * @returns {Promise<Array>} Lista de documentos
   */
  async discoverViaIframe() {
    console.log('🎯 LEX: Usando estratégia com iframe...');

    try {
      // Extrair ID do processo
      const processId = this.extractProcessId();

      if (!processId) {
        console.warn('⚠️ LEX: ID do processo não encontrado, usando DOM scraping');
        return await this.discoverViaDomScraping();
      }

      // URL da página de consulta
      const consultaUrl = `${this.baseUrl}/pje/Processo/ConsultaDocumento/listView.seam?idProcesso=${processId}`;

      console.log('🌐 LEX: Criando iframe para:', consultaUrl);

      // Criar iframe invisível
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';

      document.body.appendChild(iframe);

      // Aguardar carregamento do iframe
      const documents = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn('⚠️ LEX: Timeout ao carregar iframe');
          cleanup();
          resolve([]);
        }, 10000); // 10 segundos de timeout

        const cleanup = () => {
          clearTimeout(timeout);
          iframe.removeEventListener('load', onLoad);
          iframe.removeEventListener('error', onError);
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        };

        const onLoad = () => {
          console.log('✅ LEX: Iframe carregado');

          try {
            // Acessar documento do iframe
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

            if (!iframeDoc) {
              console.error('❌ LEX: Não foi possível acessar documento do iframe (CORS?)');
              cleanup();
              resolve([]);
              return;
            }

            console.log('📄 LEX: Parseando documentos do iframe...');

            // Parsear documentos
            const docs = this.parseDocumentTable(iframeDoc);

            console.log(`✅ LEX: ${docs.length} documentos encontrados via iframe`);

            cleanup();
            resolve(docs);

          } catch (error) {
            console.error('❌ LEX: Erro ao parsear iframe:', error);
            cleanup();
            resolve([]);
          }
        };

        const onError = (error) => {
          console.error('❌ LEX: Erro ao carregar iframe:', error);
          cleanup();
          resolve([]);
        };

        iframe.addEventListener('load', onLoad);
        iframe.addEventListener('error', onError);

        // Carregar URL
        iframe.src = consultaUrl;
      });

      if (documents.length === 0) {
        console.warn('⚠️ LEX: Iframe não retornou documentos, usando DOM scraping');
        return await this.discoverViaDomScraping();
      }

      return documents;

    } catch (error) {
      console.error('❌ LEX: Erro na estratégia iframe:', error);
      return await this.discoverViaDomScraping();
    }
  }

  /**
   * Descobre documentos fazendo scraping do DOM atual
   * @returns {Promise<Array>} Lista de documentos
   */
  async discoverViaDomScraping() {
    console.log('📋 LEX: Usando estratégia DOM Scraping...');

    const documents = [];
    const foundIds = new Set(); // Evitar duplicatas

    try {
      // 1. ESTRATÉGIA ESPECÍFICA PJE-TJPA: Buscar links com idProcessoDocumento e nomeArqProcDocBin
      console.log('🔍 LEX: Buscando documentos no painel de autos digitais...');

      const pjeDocLinks = document.querySelectorAll('a[href*="idProcessoDocumento"]');
      console.log(`📄 LEX: Encontrados ${pjeDocLinks.length} links com idProcessoDocumento`);

      for (const link of pjeDocLinks) {
        const href = link.href || link.getAttribute('href');
        if (!href) continue;

        // Extrair parâmetros da URL
        const url = new URL(href);
        const idProcessoDocumento = url.searchParams.get('idProcessoDocumento');
        const nomeArqProcDocBin = url.searchParams.get('nomeArqProcDocBin');
        const idBin = url.searchParams.get('idBin');
        const numeroDocumento = url.searchParams.get('numeroDocumento');

        // Se tem idProcessoDocumento E nomeArqProcDocBin, é um documento
        if (idProcessoDocumento && nomeArqProcDocBin) {

          // Evitar duplicatas
          if (foundIds.has(idProcessoDocumento)) continue;
          foundIds.add(idProcessoDocumento);

          // Construir URL de download direto
          const downloadUrl = idBin && numeroDocumento
            ? `${this.baseUrl}/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idBin=${idBin}&numeroDocumento=${numeroDocumento}&nomeArqProcDocBin=${encodeURIComponent(nomeArqProcDocBin)}&idProcessoDocumento=${idProcessoDocumento}&actionMethod=Processo%2FConsultaProcesso%2FDetalhe%2FlistAutosDigitais.xhtml%3AprocessoDocumentoBinHome.setDownloadInstance%28%29`
            : href;

          const document = {
            id: idProcessoDocumento,
            url: downloadUrl,
            name: decodeURIComponent(nomeArqProcDocBin),
            type: this.inferDocumentType(nomeArqProcDocBin, nomeArqProcDocBin),
            source: 'pje_autos_digitais',
            metadata: {
              discovered: new Date().toISOString(),
              processNumber: this.processNumber,
              idBin: idBin,
              numeroDocumento: numeroDocumento
            }
          };

          documents.push(document);
          console.log(`✅ LEX: Documento encontrado: ${document.name} (ID: ${idProcessoDocumento})`);
        }
      }

      // 2. FALLBACK: Procurar por links de documentos tradicionais
      if (documents.length === 0) {
        console.log('⚠️ LEX: Nenhum documento PJE encontrado, tentando scraping tradicional...');

        const documentLinks = document.querySelectorAll('a[href*="/documento/"], a[href*="download"]');
        console.log(`🔍 LEX: Encontrados ${documentLinks.length} links tradicionais de documentos`);

        for (const link of documentLinks) {
          const href = link.href || link.getAttribute('href');

          if (!href || !href.includes('documento')) continue;

          // Extrair ID do documento
          const docIdMatch = href.match(/\/documento\/download\/(\d+)/);
          if (!docIdMatch) continue;

          const documentId = docIdMatch[1];

          // Evitar duplicatas
          if (foundIds.has(documentId)) continue;
          foundIds.add(documentId);

          // Extrair nome do documento (texto do link ou elementos próximos)
          const documentName = this.extractDocumentName(link);

          // Criar objeto de documento
          const document = {
            id: documentId,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            name: documentName || `Documento ${documentId}`,
            type: this.inferDocumentType(href, documentName),
            source: 'dom_scraping',
            metadata: {
              discovered: new Date().toISOString(),
              processNumber: this.processNumber
            }
          };

          documents.push(document);
        }
      }

      // 2. Procurar por embeds/iframes de documentos
      const embeds = document.querySelectorAll('embed[src*="/documento/"], iframe[src*="/documento/"]');

      for (const embed of embeds) {
        const src = embed.src || embed.getAttribute('src');
        if (!src) continue;

        const docIdMatch = src.match(/\/documento\/download\/(\d+)/);
        if (!docIdMatch) continue;

        const documentId = docIdMatch[1];

        // Verificar se já foi adicionado
        if (documents.find(d => d.id === documentId)) continue;

        const document = {
          id: documentId,
          url: src.startsWith('http') ? src : `${this.baseUrl}${src}`,
          name: `Documento ${documentId}`,
          type: this.inferDocumentType(src, ''),
          source: 'dom_embed',
          metadata: {
            discovered: new Date().toISOString(),
            processNumber: this.processNumber
          }
        };

        documents.push(document);
      }

      console.log(`✅ LEX: DOM scraping concluído - ${documents.length} documentos únicos`);
      return documents;

    } catch (error) {
      console.error('❌ LEX: Erro no DOM scraping:', error);
      return documents; // Retorna o que conseguiu encontrar
    }
  }

  /**
   * Descobre documentos através da timeline de movimentações
   * @returns {Promise<Array>} Lista de documentos
   */
  async discoverViaTimeline() {
    console.log('📋 LEX: Usando estratégia Timeline Scraping...');

    const documents = [];

    try {
      // Procurar seção de movimentações no DOM
      const timelineElements = document.querySelectorAll('[class*="movimentacao"], [class*="timeline"], [id*="movimentacao"]');

      for (const timeline of timelineElements) {
        // Procurar links de documentos dentro das movimentações
        const docLinks = timeline.querySelectorAll('a[href*="/documento/"]');

        for (const link of docLinks) {
          const href = link.href || link.getAttribute('href');
          if (!href) continue;

          const docIdMatch = href.match(/\/documento\/download\/(\d+)/);
          if (!docIdMatch) continue;

          const documentId = docIdMatch[1];

          // Verificar duplicata
          if (documents.find(d => d.id === documentId)) continue;

          // Tentar extrair data da movimentação
          const movDate = this.extractMovementDate(link);

          const document = {
            id: documentId,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            name: this.extractDocumentName(link) || `Documento ${documentId}`,
            type: this.inferDocumentType(href, ''),
            source: 'timeline',
            metadata: {
              discovered: new Date().toISOString(),
              processNumber: this.processNumber,
              movementDate: movDate
            }
          };

          documents.push(document);
        }
      }

      console.log(`✅ LEX: Timeline scraping concluído - ${documents.length} documentos`);
      return documents;

    } catch (error) {
      console.error('❌ LEX: Erro no timeline scraping:', error);
      return documents;
    }
  }

  /**
   * Parseia tabela de documentos do HTML
   * @param {Document} doc - Documento HTML parseado
   * @returns {Array} Lista de documentos
   */
  parseDocumentTable(doc) {
    console.log('🔍 LEX: Iniciando parsing de tabela de documentos...');
    console.log('🔍 LEX: Documento recebido:', doc ? 'OK' : 'NULL');
    console.log('🔍 LEX: Body length:', doc.body ? doc.body.innerHTML.length : 'NULL');

    // DEBUG: Mostrar primeiros 1000 caracteres do HTML
    if (doc.body) {
      console.log('🔍 LEX: Primeiros 1000 chars do HTML:', doc.body.innerHTML.substring(0, 1000));
    }

    const documents = [];
    const foundIds = new Set(); // Evitar duplicatas

    try {
      // Múltiplos seletores para diferentes versões do PJe
      const tableSelectors = [
        'table[id*="documento"]',
        'table[class*="documento"]',
        'table.rich-table',
        'table.datatable',
        'table[id*="autos"]',
        'table[class*="list"]',
        '.rich-table',
        '[id*="formConsulta"] table',
        'form table',
        'table' // Fallback genérico
      ];

      console.log('🔍 LEX: Testando seletores de tabela...');

      // DEBUG: Contar TODAS as tabelas na página
      const allTables = doc.querySelectorAll('table');
      console.log(`🔍 LEX: Total de tabelas na página: ${allTables.length}`);

      for (const selector of tableSelectors) {
        const tables = doc.querySelectorAll(selector);

        if (tables.length > 0) {
          console.log(`✅ LEX: Encontradas ${tables.length} tabelas com seletor: ${selector}`);

          for (const table of tables) {
            const rows = table.querySelectorAll('tr');
            console.log(`📋 LEX: Processando tabela com ${rows.length} linhas`);

            for (const row of rows) {
              try {
                // Procurar links de documentos
                const docLinks = row.querySelectorAll('a[href*="/documento/"]');

                for (const docLink of docLinks) {
                  const href = docLink.href || docLink.getAttribute('href');
                  if (!href) continue;

                  // Extrair ID do documento
                  const docIdMatch = href.match(/\/documento\/download\/(\d+)/);
                  if (!docIdMatch) continue;

                  const documentId = docIdMatch[1];

                  // Evitar duplicatas
                  if (foundIds.has(documentId)) continue;
                  foundIds.add(documentId);

                  // Extrair informações da linha
                  const cells = row.querySelectorAll('td');
                  const documentName = this.extractDocumentName(docLink);
                  const documentType = cells.length > 1 ? cells[1].textContent.trim() : '';
                  const documentDate = cells.length > 2 ? cells[2].textContent.trim() : '';

                  // Construir URL completa se necessário
                  let fullUrl = href;
                  if (!href.startsWith('http')) {
                    fullUrl = `${this.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
                  }

                  const document = {
                    id: documentId,
                    url: fullUrl,
                    name: documentName || `Documento ${documentId}`,
                    type: documentType || this.inferDocumentType(href, documentName),
                    source: 'consulta_documento_table',
                    metadata: {
                      discovered: new Date().toISOString(),
                      processNumber: this.processNumber,
                      dateJoined: documentDate
                    }
                  };

                  documents.push(document);
                  console.log(`📄 LEX: Documento encontrado: ${document.name} (ID: ${documentId})`);
                }

              } catch (rowError) {
                // Ignorar erros em linhas individuais
                continue;
              }
            }
          }
        }
      }

      // Se não encontrou nada em tabelas, tentar busca genérica de links
      if (documents.length === 0) {
        console.log('⚠️ LEX: Nenhum documento em tabelas, buscando links genéricos...');

        // DEBUG: Buscar TODOS os links primeiro
        const allLinksInPage = doc.querySelectorAll('a');
        console.log(`🔗 LEX: Total de links na página: ${allLinksInPage.length}`);

        // Mostrar primeiros 10 hrefs
        console.log('🔗 LEX: Primeiros 10 links:');
        Array.from(allLinksInPage).slice(0, 10).forEach((link, i) => {
          console.log(`  ${i + 1}. ${link.href || link.getAttribute('href')}`);
        });

        const allLinks = doc.querySelectorAll('a[href*="/documento/"]');
        console.log(`🔗 LEX: Encontrados ${allLinks.length} links de documentos`);

        for (const link of allLinks) {
          const href = link.href || link.getAttribute('href');
          if (!href) continue;

          const docIdMatch = href.match(/\/documento\/download\/(\d+)/);
          if (!docIdMatch) continue;

          const documentId = docIdMatch[1];

          if (foundIds.has(documentId)) continue;
          foundIds.add(documentId);

          let fullUrl = href;
          if (!href.startsWith('http')) {
            fullUrl = `${this.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
          }

          const document = {
            id: documentId,
            url: fullUrl,
            name: this.extractDocumentName(link) || `Documento ${documentId}`,
            type: this.inferDocumentType(href, ''),
            source: 'generic_link',
            metadata: {
              discovered: new Date().toISOString(),
              processNumber: this.processNumber
            }
          };

          documents.push(document);
          console.log(`📄 LEX: Documento encontrado (genérico): ${document.name} (ID: ${documentId})`);
        }
      }

      console.log(`✅ LEX: Parsing concluído - ${documents.length} documentos únicos encontrados`);

    } catch (error) {
      console.error('❌ LEX: Erro ao parsear tabela de documentos:', error);
    }

    return documents;
  }

  /**
   * Detecta número de páginas de documentos
   * @param {Document} doc - Documento HTML
   * @returns {number} Número total de páginas
   */
  detectPagination(doc) {
    try {
      // Procurar elementos de paginação comuns
      const paginationElements = doc.querySelectorAll('[class*="pagination"], [class*="paginat"], [id*="paginat"]');

      for (const pagination of paginationElements) {
        const pageLinks = pagination.querySelectorAll('a');

        let maxPage = 1;
        for (const link of pageLinks) {
          const text = link.textContent.trim();
          const pageNum = parseInt(text);

          if (!isNaN(pageNum) && pageNum > maxPage) {
            maxPage = pageNum;
          }
        }

        if (maxPage > 1) {
          return maxPage;
        }
      }

    } catch (error) {
      console.error('❌ LEX: Erro ao detectar paginação:', error);
    }

    return 1; // Sem paginação detectada
  }

  /**
   * Busca documentos de uma página específica
   * @param {number} pageNumber - Número da página
   * @param {string} processId - ID do processo
   * @returns {Promise<Array>} Documentos da página
   */
  async fetchDocumentsPage(pageNumber, processId) {
    try {
      const url = `${this.baseUrl}/pje/Processo/ConsultaDocumento/listView.seam?idProcesso=${processId}&page=${pageNumber}`;

      console.log(`📄 LEX: Buscando página ${pageNumber}:`, url);

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'text/html',
          'Referer': window.location.href,
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        console.warn(`⚠️ LEX: Erro ao buscar página ${pageNumber} (status: ${response.status})`);
        return [];
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      return this.parseDocumentTable(doc);

    } catch (error) {
      console.error(`❌ LEX: Erro ao buscar página ${pageNumber}:`, error);
      return [];
    }
  }

  /**
   * Extrai nome do documento a partir de um link
   * @param {Element} linkElement - Elemento <a> do documento
   * @returns {string} Nome do documento
   */
  extractDocumentName(linkElement) {
    // Tentar pelo texto do próprio link
    let name = linkElement.textContent.trim();

    if (name && name.length > 3 && !name.match(/^\d+$/)) {
      return name;
    }

    // Tentar por atributos
    name = linkElement.getAttribute('title') || linkElement.getAttribute('alt');
    if (name) return name.trim();

    // Tentar por elementos próximos
    const parent = linkElement.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      for (const sibling of siblings) {
        if (sibling === linkElement) continue;
        const text = sibling.textContent.trim();
        if (text && text.length > 3 && !text.match(/^\d+$/)) {
          return text;
        }
      }
    }

    return '';
  }

  /**
   * Infere o tipo de documento pela URL ou nome
   * @param {string} url - URL do documento
   * @param {string} name - Nome do documento
   * @returns {string} Tipo inferido
   */
  inferDocumentType(url, name) {
    const urlLower = url.toLowerCase();
    const nameLower = name.toLowerCase();

    if (urlLower.includes('.pdf') || nameLower.includes('pdf')) {
      return 'PDF';
    }

    if (urlLower.match(/\.(jpg|jpeg|png|tiff|tif|bmp|gif)/)) {
      return 'IMAGE';
    }

    if (nameLower.includes('petição') || nameLower.includes('peticao')) {
      return 'Petição';
    }

    if (nameLower.includes('decisão') || nameLower.includes('decisao') || nameLower.includes('sentença')) {
      return 'Decisão';
    }

    if (nameLower.includes('despacho')) {
      return 'Despacho';
    }

    if (nameLower.includes('certidão') || nameLower.includes('certidao')) {
      return 'Certidão';
    }

    return 'Documento';
  }

  /**
   * Extrai data de movimentação próxima ao link
   * @param {Element} linkElement - Elemento do documento
   * @returns {string|null} Data da movimentação
   */
  extractMovementDate(linkElement) {
    try {
      const parent = linkElement.closest('[class*="movimentacao"], [class*="timeline-item"]');
      if (!parent) return null;

      const dateElements = parent.querySelectorAll('[class*="data"], [class*="date"], .timestamp');

      for (const dateEl of dateElements) {
        const text = dateEl.textContent.trim();
        // Padrão: DD/MM/YYYY
        if (text.match(/\d{2}\/\d{2}\/\d{4}/)) {
          return text;
        }
      }

    } catch (error) {
      console.error('❌ LEX: Erro ao extrair data de movimentação:', error);
    }

    return null;
  }

  /**
   * Retorna estatísticas da descoberta
   * @returns {Object} Estatísticas
   */
  getStatistics() {
    return {
      totalDocuments: this.documents.length,
      processNumber: this.processNumber,
      documentsByType: this.groupByType(),
      documentsBySource: this.groupBySource()
    };
  }

  /**
   * Agrupa documentos por tipo
   * @returns {Object} Contagem por tipo
   */
  groupByType() {
    const grouped = {};

    for (const doc of this.documents) {
      const type = doc.type || 'Desconhecido';
      grouped[type] = (grouped[type] || 0) + 1;
    }

    return grouped;
  }

  /**
   * Agrupa documentos por fonte de descoberta
   * @returns {Object} Contagem por fonte
   */
  groupBySource() {
    const grouped = {};

    for (const doc of this.documents) {
      const source = doc.source || 'unknown';
      grouped[source] = (grouped[source] || 0) + 1;
    }

    return grouped;
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.ProcessCrawler = ProcessCrawler;
}

console.log('✅ LEX: ProcessCrawler carregado com sucesso');