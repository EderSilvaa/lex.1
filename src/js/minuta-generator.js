// Minuta Generator - Gera minutas usando modelos + dados do processo
(function() {
  'use strict';

  class MinutaGenerator {
    constructor() {
      this.modelCache = window.ModelCache;
      this.sessionContext = window.lexSession;

      console.log('✍️ MinutaGenerator: Inicializado');
    }

    /**
     * Gera minuta baseada em comando do usuário
     * @param {string} comando - Ex: "Minuta uma contestação"
     * @param {object} opcoes - Opções adicionais
     */
    async gerarMinuta(comando, opcoes = {}) {
      try {
        console.log('🚀 Gerando minuta:', comando);

        // 1. Identificar tipo de documento solicitado
        const tipoDocumento = this.identificarTipoDocumento(comando);
        console.log('📝 Tipo identificado:', tipoDocumento);

        // 2. Obter dados do processo
        const dadosProcesso = this.obterDadosProcesso();

        if (!dadosProcesso.processNumber) {
          return this.mensagemSemContexto();
        }

        // 3. MODO HÍBRIDO: Tentar modelo PJe primeiro
        console.log('🔍 Buscando modelo do PJe...');
        const modeloPJe = this.buscarModeloApropriado(tipoDocumento, comando);

        if (modeloPJe && modeloPJe.conteudo) {
          console.log('✅ Modelo encontrado no PJe, preenchendo com IA...');

          // Usar modelo como base e preencher com IA
          const minuta = await this.preencherModelo(modeloPJe, dadosProcesso, opcoes);

          return this.formatarSaida(minuta, modeloPJe);
        } else {
          console.log('⚠️ Modelo não encontrado, gerando 100% com IA...');

          // Fallback: Gerar tudo com IA
          const minuta = await this.gerarMinutaComIA(tipoDocumento, dadosProcesso, comando);

          return this.formatarSaidaIA(minuta, tipoDocumento);
        }

      } catch (erro) {
        console.error('❌ Erro ao gerar minuta:', erro);
        return this.mensagemErro(erro);
      }
    }

    /**
     * Identifica tipo de documento a partir do comando
     */
    identificarTipoDocumento(comando) {
      const comandoL = comando.toLowerCase();

      // Mapeamento de palavras-chave para tipos
      const tipos = {
        'certidão': ['certidão', 'certidao', 'custas', 'pagamento'],
        'contestação': ['contestação', 'contestacao', 'contestar', 'defesa'],
        'inicial': ['inicial', 'petição inicial', 'peticao inicial', 'ação'],
        'agravo': ['agravo', 'agravo de instrumento'],
        'recurso': ['recurso', 'apelação', 'apelacao'],
        'ofício': ['ofício', 'oficio'],
        'mandado': ['mandado de segurança', 'mandado'],
        'habeas': ['habeas corpus', 'habeas'],
        'réplica': ['réplica', 'replica'],
        'impugnação': ['impugnação', 'impugnacao'],
        'carta': ['carta', 'adjudicação', 'adjudicacao']
      };

      for (const [tipo, palavrasChave] of Object.entries(tipos)) {
        if (palavrasChave.some(palavra => comandoL.includes(palavra))) {
          return tipo;
        }
      }

      // Se não identificou, retornar "genérica"
      return 'genérica';
    }

    /**
     * Busca modelo apropriado no cache usando scoring inteligente
     */
    buscarModeloApropriado(tipoDocumento, comandoOriginal = '') {
      if (!window.ModelCache) {
        console.warn('⚠️ ModelCache não disponível');
        return null;
      }

      const todosModelos = window.ModelCache.obterCache().models || [];

      if (todosModelos.length === 0) {
        console.warn('⚠️ Nenhum modelo em cache');
        return null;
      }

      console.log(`🔍 Buscando melhor modelo para "${tipoDocumento}" em ${todosModelos.length} modelos`);
      console.log(`📝 Comando: "${comandoOriginal}"`);

      // Extrair palavras-chave do tipo de documento + comando
      const keywords = this.extrairKeywords(tipoDocumento, comandoOriginal);
      console.log('🔑 Keywords:', keywords);

      // Calcular score para cada modelo
      const modelosComScore = todosModelos.map(modelo => {
        let score = 0;
        const nomeL = (modelo.nome || '').toLowerCase();
        const conteudoL = (modelo.conteudo || '').toLowerCase();

        // PRIORIDADE 1: Match exato de múltiplas palavras no nome (super importante)
        let matchesNome = 0;
        keywords.forEach(kw => {
          if (nomeL.includes(kw)) {
            matchesNome++;
            score += 30; // Cada palavra no nome vale muito
          }
        });

        // Bônus adicional se tem múltiplas keywords no nome
        if (matchesNome >= 2) {
          score += 50; // Muito mais relevante
        }

        // PRIORIDADE 2: Match de palavras específicas importantes
        const palavrasImportantes = ['custas', 'pagas', 'pagamento', 'paga'];
        palavrasImportantes.forEach(palavra => {
          if (comandoOriginal.toLowerCase().includes(palavra) && nomeL.includes(palavra)) {
            score += 100; // Match de palavras específicas do comando vale MUITO
          }
        });

        // PRIORIDADE 3: Tipo exato do documento
        if (nomeL.includes(tipoDocumento.toLowerCase())) {
          score += 20;
        }

        // PRIORIDADE 4: Match no conteúdo (menor peso)
        keywords.forEach(kw => {
          if (conteudoL.includes(kw)) {
            score += 2; // Conteúdo tem prioridade muito menor
          }
        });

        // PENALIDADE: Se tem palavras que NÃO estão no comando
        const palavrasIndesejaveis = ['cobrança', 'cobranca', 'administrativa', 'protocolo', 'encaminhamento'];
        palavrasIndesejaveis.forEach(palavra => {
          if (!comandoOriginal.toLowerCase().includes(palavra) && nomeL.includes(palavra)) {
            score -= 30; // Penalizar modelos com palavras não pedidas
          }
        });

        return { modelo, score };
      });

      // Ordenar por score (maior primeiro)
      modelosComScore.sort((a, b) => b.score - a.score);

      // Mostrar top 3 para debug
      console.log('🏆 Top 3 modelos:');
      modelosComScore.slice(0, 3).forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.modelo.nome} (score: ${item.score})`);
      });

      // Retornar modelo com maior score SOMENTE se for relevante
      const melhor = modelosComScore[0];

      // Threshold: só aceita modelo se score >= 150 (match decente)
      const SCORE_MINIMO = 150;

      if (melhor && melhor.score >= SCORE_MINIMO) {
        console.log(`✅ Modelo escolhido: ${melhor.modelo.nome} (score: ${melhor.score})`);
        return melhor.modelo;
      }

      // Se score baixo, NÃO usar modelo genérico (deixa IA gerar do zero)
      if (melhor) {
        console.warn(`⚠️ Melhor modelo tem score muito baixo (${melhor.score}), gerando com IA pura`);
      } else {
        console.warn('⚠️ Nenhum modelo encontrado, gerando com IA pura');
      }

      return null;
    }

    /**
     * Extrai palavras-chave de um texto (incluindo comando do usuário)
     */
    extrairKeywords(texto, comandoOriginal = '') {
      const textoL = texto.toLowerCase();
      const comandoL = comandoOriginal.toLowerCase();

      // Palavras-chave relevantes por tipo de documento
      const mapa = {
        'certidão': ['certidão', 'certidao', 'custas', 'pagamento', 'pagas', 'paga'],
        'contestação': ['contestação', 'contestacao', 'contestar', 'defesa', 'resposta', 'réu', 'reu'],
        'inicial': ['inicial', 'petição inicial', 'peticao inicial', 'ação', 'acao', 'exordial', 'autor'],
        'agravo': ['agravo', 'instrumento', 'recurso'],
        'recurso': ['recurso', 'apelação', 'apelacao', 'embargos'],
        'ofício': ['ofício', 'oficio', 'comunicação', 'comunicacao'],
        'mandado': ['mandado', 'segurança', 'seguranca', 'ms', 'impetrante'],
        'habeas': ['habeas', 'corpus', 'hc', 'paciente'],
        'réplica': ['réplica', 'replica', 'autor', 'resposta'],
        'impugnação': ['impugnação', 'impugnacao', 'impugnar'],
        'carta': ['carta', 'adjudicação', 'adjudicacao']
      };

      // Buscar no mapa
      for (const [tipo, keywords] of Object.entries(mapa)) {
        if (keywords.some(kw => textoL.includes(kw))) {
          // Adicionar palavras do comando do usuário para melhorar matching
          const palavrasComando = comandoL.split(/\s+/).filter(p => p.length > 3);
          return [...keywords, ...palavrasComando];
        }
      }

      // Se não achou no mapa, usar palavras do próprio texto + comando
      const palavrasTexto = textoL.split(/\s+/).filter(palavra => palavra.length > 3);
      const palavrasComando = comandoL.split(/\s+/).filter(p => p.length > 3);
      return [...palavrasTexto, ...palavrasComando];
    }

    /**
     * Gera minuta usando IA (sem modelos)
     */
    async gerarMinutaComIA(tipoDocumento, dadosProcesso, comandoOriginal) {
      console.log('🤖 Chamando IA para gerar minuta...');

      const prompt = this.construirPromptMinuta(tipoDocumento, dadosProcesso, comandoOriginal);

      try {
        // Usar cliente OpenAI global
        if (!window.openaiClient || !window.openaiClient.isConfigured()) {
          throw new Error('Cliente OpenAI não configurado');
        }

        // Usar analisarDocumento que já existe
        const contexto = {
          processNumber: dadosProcesso.processNumber,
          processInfo: dadosProcesso.processInfo,
          documents: dadosProcesso.documents
        };

        const resposta = await window.openaiClient.analisarDocumento(contexto, prompt);

        console.log('✅ Minuta gerada pela IA');
        console.log('📄 Resposta bruta (primeiros 500 caracteres):', resposta.substring(0, 500));

        // SEMPRE limpar HTML - IA insiste em retornar formatado
        let minutaLimpa = resposta;

        // Detectar se tem qualquer tag HTML
        const temHTML = /<[^>]+>/.test(minutaLimpa);

        if (temHTML) {
          console.log('🧹 Limpando HTML da resposta...');

          // 1. Substituir tags de quebra por newlines
          minutaLimpa = minutaLimpa
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/h[1-6]>/gi, '\n\n')
            .replace(/<\/li>/gi, '\n');

          // 2. Remover todas as tags HTML restantes
          minutaLimpa = minutaLimpa.replace(/<[^>]+>/g, '');

          // 3. Limpar entidades HTML
          minutaLimpa = minutaLimpa
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

          // 4. Normalizar espaços e quebras de linha
          minutaLimpa = minutaLimpa
            .replace(/\n{3,}/g, '\n\n')  // Max 2 quebras seguidas
            .replace(/ {2,}/g, ' ')       // Max 1 espaço
            .trim();

          console.log('✅ HTML removido, texto limpo');
        } else {
          console.log('✅ Resposta já está em texto puro');
        }

        return minutaLimpa;

      } catch (erro) {
        console.error('❌ Erro ao gerar com IA:', erro);
        throw erro;
      }
    }

    /**
     * Constrói prompt otimizado para geração de minuta
     */
    construirPromptMinuta(tipoDocumento, dadosProcesso, comandoOriginal) {
      const { processNumber, processInfo, documents, lastAnalysis } = dadosProcesso;

      let prompt = `Você é um assistente jurídico especializado em documentos processuais do TJPA (Tribunal de Justiça do Pará).

TAREFA: Gere uma ${tipoDocumento} profissional e completa.

DADOS DO PROCESSO:
- Número do Processo: ${processNumber}
- Classe: ${processInfo.classeProcessual || 'Não informado'}
- Assunto: ${processInfo.assunto || 'Não informado'}
- Autor/Requerente: ${processInfo.autor || 'Não informado'}
- Réu/Requerido: ${processInfo.reu || 'Não informado'}
- Tribunal: TJPA
- Data: ${this.formatarDataExtenso(new Date())}
`;

      // Adicionar contexto dos documentos processados - ✅ EXPANDIDO
      if (documents && documents.length > 0) {
        prompt += `\nDOCUMENTOS ANALISADOS (${documents.length}):\n`;

        // ✅ Aumentar para 10 documentos (vs 5) com 15K chars cada (vs 600)
        documents.slice(0, 10).forEach((doc, i) => {
          prompt += `\n${i + 1}. ${doc.name || 'Documento ' + (i + 1)}`;

          if (doc.data) {
            if (doc.data.tipo) prompt += ` (${doc.data.tipo})`;
            if (doc.data.paginas) prompt += ` - ${doc.data.paginas} págs`;
          }
          prompt += `\n`;

          // ✅ Adicionar conteúdo EXPANDIDO do documento (até 15.000 caracteres vs 600)
          if (doc.data && doc.data.texto) {
            const texto = doc.data.texto.substring(0, 15000).trim();
            prompt += `   Conteúdo (${texto.length} chars):\n   ${texto}${doc.data.texto.length > 15000 ? '\n   [... continua]' : ''}\n`;
          }
        });

        if (documents.length > 10) {
          prompt += `\n... e mais ${documents.length - 10} documento(s).\n`;
        }
      }

      // ✅ Adicionar análise anterior EXPANDIDA se disponível
      if (lastAnalysis) {
        const analiseContent = typeof lastAnalysis === 'string'
          ? lastAnalysis
          : (typeof lastAnalysis.content === 'string' ? lastAnalysis.content : JSON.stringify(lastAnalysis.content));

        // ✅ Aumentar para 8.000 chars (vs 800)
        const analiseTexto = analiseContent.substring(0, 8000);
        prompt += `\nANÁLISE ANTERIOR DO PROCESSO (${analiseTexto.length} chars):\n${analiseTexto}${analiseContent.length > 8000 ? '\n[... continua]' : ''}\n`;
      }

      prompt += `
INSTRUÇÕES CRÍTICAS:
1. Use TODOS os dados e documentos acima para gerar um documento COMPLETO e CONTEXTUALIZADO
2. Baseie-se nos documentos analisados para fundamentação e fatos
3. Use linguagem jurídica formal e técnica apropriada ao TJPA
4. NÃO use placeholders como [CAMPO] - preencha com dados reais ou omita
5. RETORNE APENAS TEXTO PURO - SEM tags HTML, SEM <br>, SEM formatação
6. Use quebras de linha simples (Enter) para separar parágrafos
7. Formato: texto corrido, parágrafos separados por linha em branco
8. NÃO inclua explicações ou comentários - apenas o documento final
9. Comece DIRETO com o título do documento

COMANDO DO USUÁRIO: "${comandoOriginal}"

GERE A MINUTA:`;

      // 📊 Log de métricas de contexto
      const promptChars = prompt.length;
      const promptTokens = Math.ceil(promptChars / 4); // ~4 chars por token
      console.log(`📊 MINUTA: Contexto gerado - ${promptChars} chars (~${promptTokens} tokens)`);
      console.log(`📊 MINUTA: Uso estimado: ${(promptTokens / 128000 * 100).toFixed(1)}% da janela GPT-4o`);
      console.log(`📊 MINUTA: Documentos incluídos: ${Math.min(documents?.length || 0, 10)} de ${documents?.length || 0} total`);

      return prompt;
    }

    /**
     * Formata saída da minuta gerada por IA
     */
    formatarSaidaIA(minuta, tipoDocumento) {
      return {
        sucesso: true,
        minuta: minuta,
        modelo: {
          nome: `${tipoDocumento} (gerado por IA)`,
          id: `ia-${Date.now()}`
        },
        metadados: {
          geradoEm: new Date().toISOString(),
          tamanho: minuta.length,
          tipoGeracao: 'IA',
          camposPreenchidos: { total: 0, pendentes: [] } // IA preenche tudo
        }
      };
    }

    /**
     * Obtém dados do processo da sessão
     */
    obterDadosProcesso() {
      let processInfo = {};
      let processNumber = '';
      let documents = [];
      let lastAnalysis = null;

      // Tentar obter da sessão primeiro
      if (this.sessionContext && this.sessionContext.processInfo) {
        processInfo = this.sessionContext.processInfo;
        processNumber = this.sessionContext.processNumber;
        documents = this.sessionContext.processedDocuments || [];
        lastAnalysis = this.sessionContext.lastAnalysis;
        console.log('📊 Usando dados da sessão ativa (lexSession)');
      }
      // Fallback: extrair do DOM do PJe
      else if (typeof extrairInformacoesCompletas === 'function') {
        const infoDom = extrairInformacoesCompletas();

        // Mapear os campos do DOM para o formato esperado
        processNumber = infoDom.numeroProcesso || '';
        processInfo = {
          classeProcessual: infoDom.classeProcessual || '',
          assunto: infoDom.assunto || '',
          autor: infoDom.autor || '',
          reu: infoDom.reu || '',
          tribunal: infoDom.tribunal || 'TJPA',
          comarca: infoDom.comarca || '',
          vara: infoDom.vara || ''
        };

        console.log('📊 Extraindo dados direto do DOM do PJe:', processInfo);
      }
      else {
        console.warn('⚠️ Não foi possível obter dados do processo (sessão não ativa e função extrair não disponível)');
      }

      return {
        processNumber: processNumber,
        processInfo: processInfo,
        documents: documents,
        lastAnalysis: lastAnalysis
      };
    }

    /**
     * Preenche modelo com dados do processo
     */
    async preencherModelo(modelo, dadosProcesso, opcoes = {}) {
      let conteudo = modelo.conteudo || modelo.conteudoHTML || '';

      console.log('🔄 Preenchendo campos do modelo...');

      // 0. Limpar HTML se necessário
      if (conteudo.includes('<p') || conteudo.includes('<div') || conteudo.includes('<span')) {
        console.log('🧹 Limpando HTML do modelo...');
        conteudo = this.limparHTML(conteudo);
      }

      // 1. Substituir campos simples
      conteudo = this.substituirCamposSimples(conteudo, dadosProcesso);

      // 2. Preencher campos que exigem IA (se habilitado)
      if (!opcoes.somenteSimples) {
        conteudo = await this.preencherCamposIA(conteudo, modelo.campos || [], dadosProcesso);
      }

      return conteudo;
    }

    /**
     * Limpa HTML e retorna apenas texto formatado
     */
    limparHTML(html) {
      // Criar elemento temporário para parsear HTML
      const temp = document.createElement('div');
      temp.innerHTML = html;

      // Substituir tags por quebras de linha
      temp.querySelectorAll('p, div, br').forEach(el => {
        el.insertAdjacentText('afterend', '\n');
      });

      // Pegar texto limpo
      let texto = temp.innerText || temp.textContent;

      // Limpar múltiplas quebras de linha
      texto = texto.replace(/\n{3,}/g, '\n\n');

      // Limpar espaços extras
      texto = texto.replace(/ {2,}/g, ' ');

      return texto.trim();
    }

    /**
     * Substitui campos simples (dados diretos do processo)
     */
    substituirCamposSimples(conteudo, dadosProcesso) {
      const { processNumber, processInfo } = dadosProcesso;

      // Mapa de substituições
      const substituicoes = {
        'NUMERO_PROCESSO': processNumber || '[NÚMERO DO PROCESSO]',
        'NOME_AUTOR': processInfo.autor || '[NOME DO AUTOR]',
        'NOME_REU': processInfo.reu || '[NOME DO RÉU]',
        'REQUERENTE': processInfo.autor || '[REQUERENTE]',
        'REQUERIDO': processInfo.reu || '[REQUERIDO]',
        'CLASSE_PROCESSUAL': processInfo.classeProcessual || '[CLASSE PROCESSUAL]',
        'ASSUNTO': processInfo.assunto || '[ASSUNTO]',
        'TRIBUNAL': processInfo.tribunal || 'Tribunal de Justiça do Pará',
        'DATA': this.formatarDataExtenso(new Date()),
        'DATA_ATUAL': this.formatarDataExtenso(new Date()),
        'LOCAL': this.extrairComarca(processInfo) || 'Belém - PA',
        'COMARCA': this.extrairComarca(processInfo) || 'Belém',
        'VARA': processInfo.vara || '[VARA]',
        'UF': 'PA'
      };

      // Aplicar substituições
      let resultado = conteudo;

      for (const [campo, valor] of Object.entries(substituicoes)) {
        // Testar vários padrões de placeholder
        const padroes = [
          new RegExp(`\\[${campo}\\]`, 'g'),
          new RegExp(`\\{\\{${campo}\\}\\}`, 'g'),
          new RegExp(`\\$\\{${campo}\\}`, 'g'),
          new RegExp(`@${campo}@`, 'g'),
          new RegExp(`%${campo}%`, 'g')
        ];

        padroes.forEach(regex => {
          resultado = resultado.replace(regex, valor);
        });
      }

      console.log('✅ Campos simples substituídos');
      return resultado;
    }

    /**
     * Preenche campos que exigem geração por IA
     */
    async preencherCamposIA(conteudo, campos, dadosProcesso) {
      // Identificar campos que ainda precisam ser preenchidos
      const camposIA = campos.filter(c => c.tipo === 'ia_gerado');

      if (camposIA.length === 0) {
        // Detectar placeholders genéricos que sobraram
        const placeholdersRestantes = [
          'FATOS_PROCESSO', 'FATOS', 'FUNDAMENTACAO', 'FUNDAMENTACAO_JURIDICA',
          'PEDIDOS', 'DIREITO', 'MERITO', 'PROVAS', 'ARGUMENTACAO'
        ];

        for (const placeholder of placeholdersRestantes) {
          const regex = new RegExp(`\\[${placeholder}\\]`, 'g');

          if (regex.test(conteudo)) {
            console.log(`🤖 Gerando conteúdo para: ${placeholder}`);

            const conteudoGerado = await this.gerarConteudoIA(placeholder, dadosProcesso);

            conteudo = conteudo.replace(regex, conteudoGerado);
          }
        }
      } else {
        // Usar metadata do modelo
        for (const campo of camposIA) {
          const conteudoGerado = await this.gerarConteudoIA(campo.nome, dadosProcesso, campo.prompt);
          const regex = new RegExp(`\\[${campo.nome}\\]`, 'g');
          conteudo = conteudo.replace(regex, conteudoGerado);
        }
      }

      console.log('✅ Campos IA preenchidos');
      return conteudo;
    }

    /**
     * Gera conteúdo usando IA
     */
    async gerarConteudoIA(nomeCampo, dadosProcesso, promptCustom = null) {
      // Construir contexto resumido
      const contexto = this.construirContextoIA(dadosProcesso);

      // Definir prompt baseado no tipo de campo
      const prompt = promptCustom || this.obterPromptParaCampo(nomeCampo);

      const promptCompleto = `
${contexto}

TAREFA: ${prompt}

INSTRUÇÕES:
- Seja conciso e objetivo
- Use linguagem jurídica formal
- Baseie-se APENAS nos documentos disponíveis
- Não invente fatos
- Formato: texto corrido, sem título

Gere o texto:
      `.trim();

      console.log(`🤖 Chamando IA para: ${nomeCampo}`);

      try {
        // Chamar API (reuso da função do content-simple.js)
        const resposta = await this.chamarAPI(promptCompleto);
        return resposta;
      } catch (erro) {
        console.error('❌ Erro ao chamar IA:', erro);
        return `[${nomeCampo} - Erro ao gerar conteúdo]`;
      }
    }

    /**
     * Constrói contexto resumido para IA
     */
    construirContextoIA(dadosProcesso) {
      const { processNumber, processInfo, documents } = dadosProcesso;

      let contexto = `# CONTEXTO DO PROCESSO\n\n`;
      contexto += `Processo: ${processNumber}\n`;

      if (processInfo.autor) contexto += `Autor: ${processInfo.autor}\n`;
      if (processInfo.reu) contexto += `Réu: ${processInfo.reu}\n`;
      if (processInfo.classeProcessual) contexto += `Classe: ${processInfo.classeProcessual}\n`;
      if (processInfo.assunto) contexto += `Assunto: ${processInfo.assunto}\n`;

      contexto += `\n## DOCUMENTOS PROCESSADOS (${documents.length})\n\n`;

      documents.slice(0, 3).forEach((doc, i) => {
        contexto += `${i + 1}. ${doc.name}\n`;

        if (doc.data && doc.data.texto) {
          // Preview de 300 caracteres
          const preview = doc.data.texto.substring(0, 300);
          contexto += `   Preview: ${preview}...\n\n`;
        }
      });

      return contexto;
    }

    /**
     * Obtém prompt apropriado para cada tipo de campo
     */
    obterPromptParaCampo(nomeCampo) {
      const prompts = {
        'FATOS_PROCESSO': 'Resuma os fatos principais do processo em 2-3 parágrafos',
        'FATOS': 'Liste os fatos relevantes do processo de forma objetiva',
        'FUNDAMENTACAO': 'Apresente a fundamentação jurídica aplicável ao caso',
        'FUNDAMENTACAO_JURIDICA': 'Elabore fundamentação jurídica baseada nos documentos',
        'PEDIDOS': 'Liste os pedidos cabíveis baseado no tipo de ação',
        'DIREITO': 'Apresente os direitos aplicáveis ao caso',
        'MERITO': 'Analise o mérito da questão',
        'PROVAS': 'Liste as provas disponíveis nos autos',
        'ARGUMENTACAO': 'Elabore argumentação jurídica fundamentada'
      };

      return prompts[nomeCampo] || `Gere conteúdo apropriado para ${nomeCampo}`;
    }

    /**
     * Chama API de IA via Edge Functions (Supabase)
     * SEMPRE usa window.openaiClient - NUNCA fallback direto
     */
    async chamarAPI(prompt) {
      // CRÍTICO: SEMPRE usar openaiClient que roteia pelo Edge Functions
      if (!window.openaiClient || !window.openaiClient.analisarDocumento) {
        throw new Error('❌ OpenAI Client não disponível. Recarregue a página.');
      }

      // Usar contexto vazio - apenas para compatibilidade
      const contextoVazio = '';
      return await window.openaiClient.analisarDocumento(contextoVazio, prompt);
    }

    /**
     * Formata data por extenso
     */
    formatarDataExtenso(data) {
      const meses = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
      ];

      const dia = data.getDate();
      const mes = meses[data.getMonth()];
      const ano = data.getFullYear();

      return `${dia} de ${mes} de ${ano}`;
    }

    /**
     * Extrai comarca das informações do processo
     */
    extrairComarca(processInfo) {
      if (processInfo.comarca) return processInfo.comarca;
      if (processInfo.tribunal && processInfo.tribunal.includes('Belém')) return 'Belém';
      return null;
    }

    /**
     * Formata saída da minuta
     */
    formatarSaida(minuta, modelo) {
      return {
        sucesso: true,
        minuta: minuta,
        modelo: {
          nome: modelo.nome,
          id: modelo.id
        },
        metadados: {
          geradoEm: new Date().toISOString(),
          tamanho: minuta.length,
          camposPreenchidos: this.contarCamposPreenchidos(minuta)
        }
      };
    }

    /**
     * Conta campos que foram preenchidos vs que ficaram em branco
     */
    contarCamposPreenchidos(conteudo) {
      const placeholders = conteudo.match(/\[[A-Z_]+\]/g) || [];
      return {
        total: placeholders.length,
        pendentes: placeholders
      };
    }

    /**
     * Mensagens de erro/aviso
     */
    mensagemModeloNaoEncontrado(tipo) {
      return {
        sucesso: false,
        erro: 'modelo_nao_encontrado',
        tipo: tipo,
        mensagem: `
⚠️ **Modelo não encontrado**

Ainda não tenho um modelo de **${tipo}** salvo.

**Como resolver:**
1. Abra a tela de "Nova Petição" no PJe
2. Selecione um modelo de ${tipo} no dropdown
3. Aguarde alguns segundos
4. Voltarei a tentar automaticamente

💡 Estou monitorando o PJe em segundo plano!
        `.trim()
      };
    }

    mensagemSemContexto() {
      return {
        sucesso: false,
        erro: 'sem_contexto',
        mensagem: `
⚠️ **Nenhum processo em contexto**

Para gerar uma minuta, preciso que você:

1. **Analise um processo** primeiro (Ctrl+; ou "Análise Completa")
2. Depois peça: "Minuta uma contestação"

💡 Preciso dos dados do processo para preencher a minuta!
        `.trim()
      };
    }

    mensagemErro(erro) {
      return {
        sucesso: false,
        erro: 'erro_generico',
        mensagem: `
❌ **Erro ao gerar minuta**

${erro.message || erro}

Tente novamente ou peça ajuda.
        `.trim()
      };
    }
  }

  // Expor globalmente
  const generator = new MinutaGenerator();

  // Adicionar função de download
  generator.downloadMinuta = function(conteudo, nomeModelo) {
    const nomeArquivo = `Minuta_${nomeModelo.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;

    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    console.log('💾 Minuta baixada:', nomeArquivo);
  };

  window.MinutaGenerator = generator;

  console.log('✍️ MinutaGenerator pronto para uso');

})();
