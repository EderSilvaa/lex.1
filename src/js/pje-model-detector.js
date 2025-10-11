// PJE Model Detector - Extrai modelos de petição do PJe via DOM
(function() {
  'use strict';

  class PjeModelDetector {
    constructor() {
      this.isActive = false;
      this.modelosExtraidos = [];
      this.editorDetectado = null;
      this.observers = [];
      this.lastProcessedUrl = null; // Evitar processar mesma URL múltiplas vezes

      console.log('🔍 PJE Model Detector: Inicializado');
    }

    /**
     * Inicia monitoramento automático do DOM
     */
    iniciar() {
      if (this.isActive) {
        console.log('⚠️ Detector já está ativo');
        return;
      }

      this.isActive = true;
      console.log('🚀 PJE Model Detector: Ativado');

      // Verificar imediatamente se já estamos na tela de petição
      this.verificarTelaPeticao();

      // Monitorar mudanças no DOM (caso navegue para tela de petição)
      this.monitorarNavegacao();
    }

    /**
     * Para monitoramento
     */
    parar() {
      this.isActive = false;
      this.observers.forEach(obs => obs.disconnect());
      this.observers = [];
      console.log('🛑 PJE Model Detector: Desativado');
    }

    /**
     * Verifica se estamos na tela de petição do PJe
     */
    verificarTelaPeticao() {
      const currentUrl = window.location.href;

      // Se já processamos esta URL, não processar novamente
      if (this.lastProcessedUrl === currentUrl) {
        return;
      }

      // Indicadores de tela de petição no TJPA
      const indicadores = [
        // URL contém esses termos
        currentUrl.includes('peticao'),
        currentUrl.includes('documento'),
        currentUrl.includes('expedicao'),
        currentUrl.includes('minutar'),
        currentUrl.includes('editor'),
        currentUrl.includes('listAutosDigitais'), // TJPA

        // Elementos específicos do PJe - EXPANDIDO
        !!document.querySelector('select[name="modTDDecoration:modTD"]'), // TJPA específico
        !!document.querySelector('select[name*="modTD"]'),
        !!document.querySelector('select[name*="modelo"]'),
        !!document.querySelector('select[name*="template"]'),
        !!document.querySelector('select[id*="modelo"]'),
        !!document.querySelector('select[id*="template"]'),
        !!document.querySelector('select[id*="Modelo"]'),
        !!document.querySelector('textarea[name*="texto"]'),
        !!document.querySelector('textarea[name*="conteudo"]'),
        !!document.querySelector('textarea[id*="texto"]'),
        !!document.querySelector('textarea[id*="docPrincipalEditorTextArea"]'), // TJPA
        !!document.querySelector('.cke_editable'),
        !!document.querySelector('[contenteditable="true"]'),
        !!document.getElementById('editor'),
        !!document.getElementById('texto'),

        // Títulos da página
        document.title.toLowerCase().includes('petição'),
        document.title.toLowerCase().includes('peticao'),
        document.title.toLowerCase().includes('documento'),
        document.title.toLowerCase().includes('minutar'),
        document.title.toLowerCase().includes('editor')
      ];

      const naTelaPeticao = indicadores.some(i => i === true);

      if (naTelaPeticao) {
        this.lastProcessedUrl = currentUrl; // Marcar como processada
        console.log('✅ PJE: Tela de petição detectada!');
        console.log('   URL:', currentUrl);
        console.log('   Title:', document.title);
        this.extrairModelosDisponiveis();
      } else {
        // Debug detalhado APENAS 1x a cada 10 verificações (evitar spam)
        if (!this._debugCount) this._debugCount = 0;
        this._debugCount++;

        if (this._debugCount % 10 === 0 && (window.location.href.includes('minuta') || window.location.href.includes('peticao') || window.location.href.includes('documento'))) {
          console.log('🔍 PJE DEBUG: URL parece ser de petição mas não detectou');
          console.log('   URL completa:', window.location.href);
          console.log('   Title:', document.title);

          // Listar todos os selects
          const todosSelects = document.querySelectorAll('select');
          console.log(`   📋 ${todosSelects.length} elementos <select> na página`);

          if (todosSelects.length > 0 && todosSelects.length < 20) {
            todosSelects.forEach((select, i) => {
              if (select.options.length > 1) {
                console.log(`   Select ${i}: name="${select.name || 'n/a'}" id="${select.id || 'n/a'}" options=${select.options.length}`);
              }
            });
          }
        }
      }

      return naTelaPeticao;
    }

    /**
     * Monitora navegação para detectar quando entrar na tela de petição
     */
    monitorarNavegacao() {
      // Observer para mudanças no body (SPAs)
      const bodyObserver = new MutationObserver(() => {
        if (this.isActive) {
          this.verificarTelaPeticao();
        }
      });

      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true
      });

      this.observers.push(bodyObserver);

      // Monitorar mudanças de URL (pushState/replaceState)
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      const self = this;
      history.pushState = function() {
        originalPushState.apply(this, arguments);
        setTimeout(() => self.verificarTelaPeticao(), 500);
      };

      history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        setTimeout(() => self.verificarTelaPeticao(), 500);
      };
    }

    /**
     * Extrai lista de modelos do dropdown
     */
    extrairModelosDisponiveis() {
      console.log('🔎 PJE: Buscando dropdown de modelos...');

      // Seletores possíveis para dropdown de modelos
      const seletoresPossiveis = [
        // TJPA específicos (descobertos via diagnóstico)
        'select[name="modTDDecoration:modTD"]',
        'select[id="modTDDecoration:modTD"]',
        '#modTDDecoration\\:modTD', // Escape do : para CSS

        // Genéricos
        'select[name*="modelo"]',
        'select[name*="Modelo"]',
        'select[name*="modTD"]',
        'select[name*="template"]',
        'select[name*="Template"]',
        'select[id*="modelo"]',
        'select[id*="Modelo"]',
        'select[id*="modTD"]',
        'select[id*="template"]',
        'select[id*="Template"]',
        'select[name*="tipoDocumento"]',
        'select[name*="TipoDocumento"]',
        'select[id*="tipoDocumento"]',
        'select[id*="TipoDocumento"]',
        'select.modelo',
        'select.template',
        '#comboModelo',
        '#selectModelo'
      ];

      let selectModelos = null;

      for (const seletor of seletoresPossiveis) {
        selectModelos = document.querySelector(seletor);
        if (selectModelos && selectModelos.options.length > 5) {
          console.log(`✅ Dropdown encontrado: ${seletor} (${selectModelos.options.length} opções)`);
          break;
        }
      }

      // Se não encontrou por seletores específicos, tentar busca heurística
      if (!selectModelos) {
        console.log('🔍 PJE: Tentando busca heurística...');
        const todosSelects = document.querySelectorAll('select');

        for (const select of todosSelects) {
          // Critérios: select com muitas opções (>10) e nome/id sugestivo
          if (select.options.length > 10) {
            const nome = (select.name || '').toLowerCase();
            const id = (select.id || '').toLowerCase();

            // Palavras-chave que indicam ser dropdown de modelos/tipos
            const keywords = ['tipo', 'modelo', 'template', 'documento', 'peticao', 'minutar'];

            if (keywords.some(kw => nome.includes(kw) || id.includes(kw))) {
              console.log(`✅ Dropdown encontrado (heurística): name="${select.name}" id="${select.id}" (${select.options.length} opções)`);
              selectModelos = select;
              break;
            }
          }
        }
      }

      if (!selectModelos) {
        console.log('⚠️ Dropdown de modelos não encontrado');
        return [];
      }

      // Extrair options
      const modelos = Array.from(selectModelos.options)
        .filter(opt => opt.value && opt.value !== '' && opt.value !== '0')
        .map(opt => ({
          id: `modelo-${opt.value}`,
          nome: opt.text.trim(),
          valor: opt.value,
          elemento: selectModelos
        }));

      if (modelos.length > 0) {
        console.log(`📋 ${modelos.length} modelos encontrados`);
        this.modelosExtraidos = modelos;

        // DESABILITADO: Download automático causando problemas com TinyMCE
        // O download automático estava quebrando o editor do PJe
        console.log('ℹ️ Download automático desabilitado');
        console.log('💡 Por ora, os modelos serão capturados manualmente quando você selecionar no PJe');
      }

      return modelos;
    }

    /**
     * Baixa todos os modelos automaticamente em background (silencioso)
     */
    async baixarTodosModelosSilenciosamente(selectElement, modelos) {
      console.log(`📦 Download silencioso: ${modelos.length} modelos`);

      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      let sucesso = 0;
      let falhas = 0;

      // Salvar valor original para restaurar depois
      const valorOriginal = selectElement.value;

      for (let i = 0; i < modelos.length; i++) {
        const modelo = modelos[i];

        try {
          // Log discreto apenas no console (não mostrar no front)
          if (i % 10 === 0) {
            console.log(`📥 Progresso: ${i}/${modelos.length}`);
          }

          // Selecionar modelo programaticamente
          selectElement.value = modelo.valor;

          // Disparar evento change para o PJe carregar o modelo
          const changeEvent = new Event('change', { bubbles: true, cancelable: true });
          selectElement.dispatchEvent(changeEvent);

          // Também tentar A4J.AJAX se disponível
          if (window.A4J && window.A4J.AJAX) {
            try {
              window.A4J.AJAX.Submit(selectElement.form || selectElement, changeEvent);
            } catch (e) {
              // Ignorar erro silenciosamente
            }
          }

          // Aguardar modelo carregar (usar nosso método com retry)
          const modeloCapturado = await this.aguardarECapturarModeloComTimeout(modelo.valor, modelo.nome);

          if (modeloCapturado) {
            sucesso++;
          } else {
            falhas++;
          }

          // Pequeno delay entre modelos para não sobrecarregar
          await delay(800);

        } catch (erro) {
          console.error(`❌ Erro ao baixar modelo ${modelo.nome}:`, erro);
          falhas++;
        }
      }

      // Restaurar seleção original
      selectElement.value = valorOriginal;

      console.log(`✅ Download completo: ${sucesso} sucessos, ${falhas} falhas de ${modelos.length} total`);

      // Notificar cache sobre conclusão
      if (window.ModelCache) {
        const cache = new window.ModelCache();
        console.log(`💾 Cache agora tem ${cache.obterEstatisticas().totalModelos} modelos`);
      }
    }

    /**
     * Aguarda e captura modelo com timeout inteligente
     */
    aguardarECapturarModeloComTimeout(modeloId, nomeModelo, tentativas = 0) {
      return new Promise((resolve) => {
        const maxTentativas = 15; // 15 x 500ms = 7.5 segundos
        const intervalo = 500;

        const tentarCapturar = () => {
          if (tentativas >= maxTentativas) {
            console.warn(`⏱️ Timeout: ${nomeModelo}`);
            resolve(null);
            return;
          }

          const editor = this.detectarEditor();

          if (editor) {
            const conteudo = this.extrairConteudoEditor(editor);

            if (conteudo && conteudo.length >= 50) {
              // Sucesso! Processar modelo
              const modeloCompleto = this.processarModeloCapturado(modeloId, nomeModelo, editor, conteudo);
              resolve(modeloCompleto);
              return;
            }
          }

          // Tentar novamente
          tentativas++;
          setTimeout(tentarCapturar, intervalo);
        };

        tentarCapturar();
      });
    }

    /**
     * Monitora quando usuário seleciona um modelo
     */
    monitorarSelecaoModelo(selectElement) {
      const self = this;

      // IMPORTANTE: PJe usa A4J.AJAX que pode sobrescrever addEventListener
      // Então vamos usar técnica de polling + MutationObserver

      let valorAnterior = selectElement.value;

      // Polling para detectar mudança (fallback)
      const checkInterval = setInterval(() => {
        if (!this.isActive) {
          clearInterval(checkInterval);
          return;
        }

        const valorAtual = selectElement.value;

        if (valorAtual !== valorAnterior && valorAtual && valorAtual !== '0') {
          valorAnterior = valorAtual;

          const nomeModelo = selectElement.options[selectElement.selectedIndex]?.text;
          console.log('🎯 Modelo selecionado:', nomeModelo);

          // Aguardar AJAX + render do conteúdo
          setTimeout(() => {
            self.capturarConteudoModelo(valorAtual, nomeModelo);
          }, 3000); // 3s para AJAX completar
        }
      }, 500); // Verificar a cada 500ms

      // Também tentar listener normal (pode funcionar em alguns casos)
      selectElement.addEventListener('change', function() {
        const valorSelecionado = this.value;

        if (!valorSelecionado || valorSelecionado === '0') return;

        console.log('🎯 Modelo selecionado (evento change):', this.options[this.selectedIndex].text);

        // Aguardar editor carregar conteúdo do modelo
        setTimeout(() => {
          self.capturarConteudoModelo(valorSelecionado, this.options[this.selectedIndex].text);
        }, 3000); // 3s para o PJe carregar via AJAX
      }, true); // useCapture = true para tentar capturar antes do A4J

      console.log('👀 Monitorando seleção de modelos (polling + eventos)...');
    }

    /**
     * Captura conteúdo do modelo do editor
     */
    capturarConteudoModelo(modeloId, nomeModelo) {
      console.log('📥 Capturando conteúdo do modelo:', nomeModelo || modeloId);

      const editor = this.detectarEditor();

      if (!editor) {
        console.log('⚠️ Editor não detectado');
        console.log('   Usando MutationObserver para aguardar editor aparecer...');

        // Usar MutationObserver para aguardar o editor aparecer
        this.aguardarEditorComObserver(modeloId, nomeModelo);
        return null;
      }

      const conteudo = this.extrairConteudoEditor(editor);

      console.log(`📝 Conteúdo extraído: ${conteudo ? conteudo.length : 0} caracteres`);

      if (!conteudo || conteudo.length < 50) {
        console.log('⚠️ Conteúdo vazio ou muito curto (<50 caracteres)');
        console.log('   Conteúdo:', conteudo?.substring(0, 100));
        return null;
      }

      // Encontrar metadata do modelo
      const modeloInfo = this.modelosExtraidos.find(m => m.valor === modeloId) || {
        nome: nomeModelo || `Modelo ${modeloId}`
      };

      const modeloCompleto = {
        id: `modelo-${modeloId}-${Date.now()}`,
        nome: modeloInfo ? modeloInfo.nome : `Modelo ${modeloId}`,
        valor: modeloId,
        conteudo: conteudo,
        conteudoHTML: editor.tipo === 'html' ? conteudo : null,
        tipoEditor: editor.tipo,
        extraidoEm: new Date().toISOString(),
        tribunal: 'TJPA',
        campos: this.detectarCampos(conteudo)
      };

      console.log('✅ Modelo capturado:', modeloCompleto.nome);
      console.log(`   ${modeloCompleto.campos.length} campos detectados:`, modeloCompleto.campos);

      // Salvar no cache
      this.salvarNoCache(modeloCompleto);

      // Notificar Lex
      this.notificarLex(modeloCompleto);

      return modeloCompleto;
    }

    /**
     * Aguarda editor aparecer usando MutationObserver
     */
    aguardarEditorComObserver(modeloId, nomeModelo, tentativas = 0) {
      const maxTentativas = 20; // 20 tentativas = ~10 segundos
      const intervalo = 500; // Verificar a cada 500ms

      if (tentativas >= maxTentativas) {
        console.error('❌ Timeout: Editor não encontrado após 10 segundos');
        return;
      }

      console.log(`⏳ Tentativa ${tentativas + 1}/${maxTentativas} - Procurando editor...`);

      // Tentar detectar editor imediatamente
      const editor = this.detectarEditor();

      if (editor) {
        const conteudo = this.extrairConteudoEditor(editor);

        // Verificar se o conteúdo já foi carregado
        if (conteudo && conteudo.length >= 50) {
          console.log('✅ Editor encontrado e conteúdo carregado!');
          this.processarModeloCapturado(modeloId, nomeModelo, editor, conteudo);
          return;
        } else {
          console.log('📝 Editor encontrado, mas conteúdo ainda vazio. Aguardando...');
        }
      }

      // Continuar tentando
      setTimeout(() => {
        this.aguardarEditorComObserver(modeloId, nomeModelo, tentativas + 1);
      }, intervalo);
    }

    /**
     * Processa modelo capturado
     */
    processarModeloCapturado(modeloId, nomeModelo, editor, conteudo) {
      // Encontrar metadata do modelo
      const modeloInfo = this.modelosExtraidos.find(m => m.valor === modeloId) || {
        nome: nomeModelo || `Modelo ${modeloId}`
      };

      const modeloCompleto = {
        id: `modelo-${modeloId}-${Date.now()}`,
        nome: modeloInfo ? modeloInfo.nome : `Modelo ${modeloId}`,
        valor: modeloId,
        conteudo: conteudo,
        conteudoHTML: editor.tipo === 'html' ? conteudo : null,
        tipoEditor: editor.tipo,
        extraidoEm: new Date().toISOString(),
        tribunal: 'TJPA',
        campos: this.detectarCampos(conteudo)
      };

      console.log('✅ Modelo capturado:', modeloCompleto.nome);
      console.log(`   ${modeloCompleto.campos.length} campos detectados:`, modeloCompleto.campos);

      // Salvar no cache
      this.salvarNoCache(modeloCompleto);

      // Notificar Lex
      this.notificarLex(modeloCompleto);

      return modeloCompleto;
    }

    /**
     * Detecta tipo de editor presente na página
     */
    detectarEditor() {
      // 1. CKEditor
      if (typeof CKEDITOR !== 'undefined') {
        const instances = Object.keys(CKEDITOR.instances);
        if (instances.length > 0) {
          const instanceName = instances[0];
          console.log('✅ CKEditor detectado:', instanceName);
          return {
            tipo: 'ckeditor',
            nome: instanceName,
            instance: CKEDITOR.instances[instanceName]
          };
        }
      }

      // 2. TinyMCE
      if (typeof tinymce !== 'undefined' && tinymce.editors.length > 0) {
        console.log('✅ TinyMCE detectado');
        return {
          tipo: 'tinymce',
          instance: tinymce.editors[0]
        };
      }

      // 3. Textarea específico do TJPA (PRIORIDADE)
      const textareaTJPA = document.querySelector('textarea#docPrincipalEditorTextArea');
      if (textareaTJPA) {
        console.log('✅ Textarea TJPA detectado');
        return {
          tipo: 'textarea',
          elemento: textareaTJPA
        };
      }

      // 4. Outros textareas e contenteditable
      const textareas = [
        document.querySelector('textarea[name*="texto"]'),
        document.querySelector('textarea[name*="conteudo"]'),
        document.querySelector('textarea[id*="editor"]'),
        document.querySelector('textarea'),
        document.querySelector('.cke_editable'),
        document.querySelector('[contenteditable="true"]')
      ];

      for (const textarea of textareas) {
        if (textarea) {
          console.log('✅ Editor HTML/Textarea detectado:', textarea.id || textarea.name || textarea.tagName);
          return {
            tipo: textarea.tagName === 'TEXTAREA' ? 'textarea' : 'html',
            elemento: textarea
          };
        }
      }

      console.log('❌ Nenhum editor encontrado');
      return null;
    }

    /**
     * Extrai conteúdo do editor baseado no tipo
     */
    extrairConteudoEditor(editor) {
      try {
        switch (editor.tipo) {
          case 'ckeditor':
            return editor.instance.getData();

          case 'tinymce':
            return editor.instance.getContent();

          case 'textarea':
            return editor.elemento.value;

          case 'html':
            return editor.elemento.innerHTML || editor.elemento.innerText;

          default:
            return null;
        }
      } catch (erro) {
        console.error('❌ Erro ao extrair conteúdo:', erro);
        return null;
      }
    }

    /**
     * Detecta campos dinâmicos no conteúdo (placeholders)
     */
    detectarCampos(conteudo) {
      const campos = new Set();

      // Padrões de placeholders
      const padroes = [
        /\[([A-Z_]+)\]/g,           // [CAMPO]
        /\{\{([a-zA-Z_]+)\}\}/g,    // {{campo}}
        /\$\{([a-zA-Z_]+)\}/g,      // ${campo}
        /@([A-Z_]+)@/g,             // @CAMPO@
        /%([A-Z_]+)%/g              // %CAMPO%
      ];

      padroes.forEach(regex => {
        let match;
        while ((match = regex.exec(conteudo)) !== null) {
          campos.add(match[1]);
        }
      });

      return Array.from(campos).map(nome => ({
        nome: nome,
        tipo: this.inferirTipoCampo(nome)
      }));
    }

    /**
     * Infere tipo de campo baseado no nome
     */
    inferirTipoCampo(nomeCampo) {
      const nome = nomeCampo.toLowerCase();

      if (nome.includes('processo') || nome.includes('numero')) return 'processo';
      if (nome.includes('autor') || nome.includes('requerente')) return 'parte_autor';
      if (nome.includes('reu') || nome.includes('requerido')) return 'parte_reu';
      if (nome.includes('advogado')) return 'advogado';
      if (nome.includes('oab')) return 'oab';
      if (nome.includes('data')) return 'data';
      if (nome.includes('local') || nome.includes('comarca')) return 'local';
      if (nome.includes('vara')) return 'vara';
      if (nome.includes('fato') || nome.includes('fundamenta')) return 'ia_gerado';
      if (nome.includes('pedido')) return 'ia_gerado';

      return 'texto';
    }

    /**
     * Salva modelo no cache
     */
    salvarNoCache(modelo) {
      try {
        // Usar ModelCache se disponível, senão localStorage direto
        if (window.ModelCache) {
          window.ModelCache.salvarModelo(modelo);
        } else {
          const cache = JSON.parse(localStorage.getItem('lex_pje_models') || '{"version":"1.0","models":[]}');

          // Evitar duplicatas
          cache.models = cache.models.filter(m => m.valor !== modelo.valor);
          cache.models.push(modelo);
          cache.lastUpdate = new Date().toISOString();

          // Limitar a 20 modelos
          if (cache.models.length > 20) {
            cache.models = cache.models.slice(-20);
          }

          localStorage.setItem('lex_pje_models', JSON.stringify(cache));
          console.log('💾 Modelo salvo no cache');
        }
      } catch (erro) {
        console.error('❌ Erro ao salvar modelo:', erro);
      }
    }

    /**
     * Notifica Lex que modelo foi capturado
     */
    notificarLex(modelo) {
      // Disparar evento customizado
      const evento = new CustomEvent('pje-modelo-capturado', {
        detail: { modelo }
      });
      document.dispatchEvent(evento);

      // Mostrar toast se Lex estiver disponível
      if (typeof mostrarToast === 'function') {
        mostrarToast(`✅ Modelo "${modelo.nome}" capturado com sucesso!`);
      }
    }

    /**
     * Busca modelos disponíveis no cache
     */
    obterModelosCache() {
      try {
        const cache = JSON.parse(localStorage.getItem('lex_pje_models') || '{"models":[]}');
        return cache.models || [];
      } catch {
        return [];
      }
    }
  }

  // Expor globalmente
  window.PjeModelDetector = new PjeModelDetector();

  // Auto-iniciar se configurado
  if (window.location.href.includes('pje')) {
    console.log('🔧 Auto-iniciando PJE Model Detector...');
    setTimeout(() => {
      window.PjeModelDetector.iniciar();
    }, 2000); // Aguardar página carregar
  }

})();
