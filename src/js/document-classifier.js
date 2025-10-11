// Document Classifier - Classifica documentos jurídicos automaticamente
// Part of LEX Document Processing System

class DocumentClassifier {
  constructor() {
    // Tipos de documentos jurídicos e suas características
    this.documentTypes = {
      // PEÇAS INICIAIS
      'petição_inicial': {
        keywords: ['petição inicial', 'requer', 'vem perante', 'excelentíssimo', 'nestes termos'],
        priority: 10,
        category: 'petição',
        description: 'Petição Inicial'
      },
      'contestação': {
        keywords: ['contestação', 'impugnação', 'defesa', 'preliminarmente', 'no mérito'],
        priority: 9,
        category: 'defesa',
        description: 'Contestação/Defesa'
      },
      'reconvenção': {
        keywords: ['reconvenção', 'reconvindo', 'reconvinte'],
        priority: 9,
        category: 'petição',
        description: 'Reconvenção'
      },

      // DECISÕES
      'sentença': {
        keywords: ['sentença', 'julgo procedente', 'julgo improcedente', 'dispositivo', 'ante o exposto'],
        priority: 10,
        category: 'decisão',
        description: 'Sentença'
      },
      'acórdão': {
        keywords: ['acórdão', 'acordam os desembargadores', 'tribunal', 'recurso conhecido'],
        priority: 10,
        category: 'decisão',
        description: 'Acórdão'
      },
      'decisão_interlocutória': {
        keywords: ['decisão', 'defiro', 'indefiro', 'determino'],
        priority: 7,
        category: 'decisão',
        description: 'Decisão Interlocutória'
      },

      // DESPACHOS
      'despacho': {
        keywords: ['despacho', 'cumpra-se', 'intimem-se', 'dê-se vista'],
        priority: 5,
        category: 'despacho',
        description: 'Despacho'
      },

      // RECURSOS
      'apelação': {
        keywords: ['apelação', 'apelante', 'apelado', 'razões de apelação'],
        priority: 8,
        category: 'recurso',
        description: 'Apelação'
      },
      'agravo': {
        keywords: ['agravo', 'agravante', 'agravado'],
        priority: 7,
        category: 'recurso',
        description: 'Agravo'
      },
      'embargos': {
        keywords: ['embargos de declaração', 'embargante', 'embargado', 'contradição', 'omissão'],
        priority: 7,
        category: 'recurso',
        description: 'Embargos'
      },

      // MANIFESTAÇÕES
      'réplica': {
        keywords: ['réplica', 'impugna a contestação', 'refuta'],
        priority: 6,
        category: 'manifestação',
        description: 'Réplica'
      },
      'contrarrazões': {
        keywords: ['contrarrazões', 'recurso não deve ser conhecido'],
        priority: 6,
        category: 'manifestação',
        description: 'Contrarrazões'
      },
      'memoriais': {
        keywords: ['memoriais', 'alegações finais'],
        priority: 6,
        category: 'manifestação',
        description: 'Memoriais'
      },

      // PROVAS
      'laudo': {
        keywords: ['laudo pericial', 'perito', 'perícia', 'quesitos'],
        priority: 8,
        category: 'prova',
        description: 'Laudo Pericial'
      },
      'ata_audiência': {
        keywords: ['ata de audiência', 'termo de audiência', 'depoimento', 'testemunha'],
        priority: 8,
        category: 'prova',
        description: 'Ata de Audiência'
      },

      // DOCUMENTOS GERAIS
      'procuração': {
        keywords: ['procuração', 'outorga poderes', 'mandato'],
        priority: 3,
        category: 'documento',
        description: 'Procuração'
      },
      'certidão': {
        keywords: ['certidão', 'certifico que'],
        priority: 4,
        category: 'documento',
        description: 'Certidão'
      },
      'intimação': {
        keywords: ['intimação', 'fica intimado'],
        priority: 5,
        category: 'documento',
        description: 'Intimação'
      },
      'mandado': {
        keywords: ['mandado de', 'oficial de justiça', 'cumprimento'],
        priority: 6,
        category: 'documento',
        description: 'Mandado'
      }
    };
  }

  /**
   * Classifica um documento baseado em nome e conteúdo
   * @param {Object} document - Documento com { name, content }
   * @returns {Object} Classificação
   */
  classify(document) {
    const name = (document.name || '').toLowerCase();
    const content = (document.content || document.texto || '').toLowerCase();

    // Pegar preview do conteúdo (primeiros 2000 chars)
    const preview = content.substring(0, 2000);

    let bestMatch = {
      type: 'desconhecido',
      confidence: 0,
      priority: 1,
      category: 'documento',
      description: 'Documento Não Classificado'
    };

    // Analisar cada tipo de documento
    for (const [typeKey, typeData] of Object.entries(this.documentTypes)) {
      let score = 0;

      // Verificar nome do arquivo
      for (const keyword of typeData.keywords) {
        if (name.includes(keyword)) {
          score += 3; // Nome tem peso maior
        }
      }

      // Verificar conteúdo
      for (const keyword of typeData.keywords) {
        const regex = new RegExp(keyword, 'gi');
        const matches = preview.match(regex);
        if (matches) {
          score += matches.length * 1; // Cada match no conteúdo
        }
      }

      // Atualizar melhor match
      if (score > bestMatch.confidence) {
        bestMatch = {
          type: typeKey,
          confidence: score,
          priority: typeData.priority,
          category: typeData.category,
          description: typeData.description
        };
      }
    }

    // Calcular confiança percentual
    bestMatch.confidencePercent = Math.min(100, (bestMatch.confidence / 5) * 100);

    return bestMatch;
  }

  /**
   * Classifica múltiplos documentos
   * @param {Array} documents - Array de documentos
   * @returns {Array} Documentos classificados
   */
  classifyAll(documents) {
    return documents.map(doc => {
      const classification = this.classify(doc);

      return {
        ...doc,
        classification: classification,
        // Adicionar flags úteis
        isDecision: classification.category === 'decisão',
        isPetition: classification.category === 'petição',
        isResource: classification.category === 'recurso',
        isProof: classification.category === 'prova'
      };
    });
  }

  /**
   * Organiza documentos por prioridade e categoria
   * @param {Array} documents - Documentos classificados
   * @returns {Object} Documentos organizados
   */
  organize(documents) {
    const classified = this.classifyAll(documents);

    // Ordenar por prioridade (maior primeiro)
    classified.sort((a, b) => {
      return (b.classification?.priority || 0) - (a.classification?.priority || 0);
    });

    // Agrupar por categoria
    const byCategory = {
      decisão: [],
      petição: [],
      defesa: [],
      recurso: [],
      manifestação: [],
      prova: [],
      despacho: [],
      documento: [],
      desconhecido: []
    };

    classified.forEach(doc => {
      const category = doc.classification?.category || 'desconhecido';
      if (byCategory[category]) {
        byCategory[category].push(doc);
      } else {
        byCategory.desconhecido.push(doc);
      }
    });

    return {
      all: classified,
      byCategory: byCategory,
      summary: this.generateSummary(classified)
    };
  }

  /**
   * Gera resumo da organização
   * @param {Array} documents - Documentos classificados
   * @returns {Object} Resumo
   */
  generateSummary(documents) {
    const summary = {
      total: documents.length,
      byCategory: {},
      mostImportant: [],
      timeline: []
    };

    // Contar por categoria
    documents.forEach(doc => {
      const category = doc.classification?.category || 'desconhecido';
      summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
    });

    // Pegar os 5 mais importantes (maior prioridade)
    summary.mostImportant = documents
      .slice(0, 5)
      .map(doc => ({
        name: doc.name,
        type: doc.classification?.description,
        priority: doc.classification?.priority
      }));

    return summary;
  }

  /**
   * Seleciona documentos relevantes para uma pergunta
   * @param {Array} documents - Documentos disponíveis
   * @param {string} question - Pergunta do usuário
   * @param {number} maxDocs - Máximo de documentos a retornar
   * @returns {Array} Documentos relevantes
   */
  selectRelevantDocuments(documents, question, maxDocs = 5) {
    const questionLower = question.toLowerCase();

    // Score de relevância para cada documento
    const scored = documents.map(doc => {
      let relevanceScore = 0;

      // Prioridade base do tipo de documento
      relevanceScore += (doc.classification?.priority || 0) * 10;

      // Palavras-chave na pergunta relacionadas ao tipo
      if (questionLower.includes('sentença') && doc.classification?.type === 'sentença') {
        relevanceScore += 100;
      }
      if (questionLower.includes('petição') && doc.classification?.category === 'petição') {
        relevanceScore += 100;
      }
      if (questionLower.includes('recurso') && doc.classification?.category === 'recurso') {
        relevanceScore += 100;
      }
      if (questionLower.includes('prova') && doc.classification?.category === 'prova') {
        relevanceScore += 100;
      }
      if (questionLower.includes('decisão') && doc.classification?.category === 'decisão') {
        relevanceScore += 100;
      }

      // Buscar termos específicos no conteúdo do documento
      const content = (doc.content || doc.texto || '').toLowerCase();
      const preview = content.substring(0, 3000);

      // Extrair termos importantes da pergunta (remover palavras comuns)
      const stopWords = ['o', 'a', 'de', 'da', 'do', 'e', 'que', 'é', 'para', 'em', 'com', 'me', 'mostre', 'qual', 'quem'];
      const terms = questionLower
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.includes(word));

      // Contar matches dos termos no preview
      terms.forEach(term => {
        const regex = new RegExp(term, 'gi');
        const matches = preview.match(regex);
        if (matches) {
          relevanceScore += matches.length * 5;
        }
      });

      return {
        ...doc,
        relevanceScore
      };
    });

    // Ordenar por relevância e retornar os top N
    return scored
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxDocs);
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.DocumentClassifier = DocumentClassifier;
  console.log('DocumentClassifier carregado');
}
