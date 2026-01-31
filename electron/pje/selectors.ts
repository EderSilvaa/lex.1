/**
 * PJe Selectors
 *
 * Mapa de seletores conhecidos do PJe para fallback.
 * Organizados por seção/funcionalidade.
 */

// ============================================================================
// LOGIN
// ============================================================================

export const LOGIN_SELECTORS = {
    // Botão de login com certificado
    btnCertificado: [
        '#btnLoginCertificado',
        'button:has-text("Certificado Digital")',
        'a:has-text("Certificado")',
        '[class*="certificado"]'
    ],

    // Indicador de logado
    userLoggedIn: [
        '.usuario-logado',
        '[class*="user-info"]',
        '#nomeUsuario',
        '.nome-usuario'
    ]
};

// ============================================================================
// CONSULTA DE PROCESSO
// ============================================================================

export const CONSULTA_SELECTORS = {
    // Campo de número do processo
    inputNumero: [
        '#fPP\\:inputNumeroProcesso',
        'input[name*="numeroProcesso"]',
        'input[placeholder*="processo"]',
        'input[aria-label*="processo"]',
        '#numProcesso',
        'input[id*="processo"]'
    ],

    // Botão de pesquisar
    btnPesquisar: [
        '#fPP\\:searchProcessos',
        'button[type="submit"]',
        'button:has-text("Pesquisar")',
        'button:has-text("Buscar")',
        'input[type="submit"]'
    ],

    // Link do processo nos resultados
    linkProcesso: [
        'a[class*="processo"]',
        'a[href*="processo"]',
        'a[title*="processo"]'
    ]
};

// ============================================================================
// DETALHES DO PROCESSO
// ============================================================================

export const PROCESSO_SELECTORS = {
    // Número do processo na página
    numero: [
        '.numero-processo',
        '[class*="numProcesso"]',
        '#numeroProcesso',
        'h1:has-text("0")', // Números de processo começam com 0
    ],

    // Partes
    autor: [
        '.polo-ativo',
        '[class*="autor"]',
        'td:has-text("Autor") + td'
    ],
    reu: [
        '.polo-passivo',
        '[class*="reu"]',
        'td:has-text("Réu") + td'
    ],

    // Classe/Assunto
    classe: [
        '.classe-judicial',
        '[class*="classe"]'
    ],
    assunto: [
        '.assunto-principal',
        '[class*="assunto"]'
    ],

    // Movimentações
    listaMovimentacoes: [
        '#tblMovimentacoes',
        'table[class*="movimentacao"]',
        '.lista-movimentacoes'
    ],
    itemMovimentacao: [
        'tr[class*="movimentacao"]',
        '.movimentacao-item'
    ],

    // Documentos
    listaDocumentos: [
        '#tblDocumentos',
        'table[class*="documento"]',
        '.lista-documentos'
    ],
    linkDocumento: [
        'a[class*="documento"]',
        'a[href*="documento"]',
        'a[href*="download"]'
    ]
};

// ============================================================================
// PROTOCOLAÇÃO
// ============================================================================

export const PROTOCOLO_SELECTORS = {
    // Botão de nova petição
    btnNovaPeticao: [
        '#btnNovaPeticao',
        'button:has-text("Petição")',
        'a:has-text("Protocolar")'
    ],

    // Upload de arquivo
    inputArquivo: [
        'input[type="file"]',
        '#fileUpload',
        '[class*="upload"]'
    ],

    // Tipo de petição
    selectTipo: [
        '#tipoPeticao',
        'select[name*="tipo"]'
    ],

    // Botão de enviar
    btnEnviar: [
        '#btnEnviar',
        'button:has-text("Enviar")',
        'button:has-text("Protocolar")',
        'button[type="submit"]'
    ],

    // Confirmação
    btnConfirmar: [
        '#btnConfirmar',
        'button:has-text("Confirmar")',
        'button:has-text("Sim")'
    ]
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Retorna array de seletores para um elemento
 */
export function getSelectors(category: string, element: string): string[] {
    const categories: Record<string, any> = {
        login: LOGIN_SELECTORS,
        consulta: CONSULTA_SELECTORS,
        processo: PROCESSO_SELECTORS,
        protocolo: PROTOCOLO_SELECTORS
    };

    const cat = categories[category];
    if (!cat) return [];

    return cat[element] || [];
}

/**
 * Gera seletor Playwright com múltiplas alternativas
 */
export function buildLocatorChain(selectors: string[]): string {
    // Retorna primeiro seletor (Playwright tentará cada um)
    return selectors[0] || '';
}
