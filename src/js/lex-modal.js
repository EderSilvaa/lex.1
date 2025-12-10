// LEX Modal System - Sistema de modais genérico e reutilizável
// Usado por LEX e LEX Agent para exibir informações e pedir aprovações

class LexModal {
  constructor() {
    this.activeModal = null;
    this.onApprove = null;
    this.onCancel = null;
    this.modalId = `lex-modal-${Date.now()}`;

    console.log('📦 LexModal: Sistema de modais inicializado');
  }

  /**
   * Mostra modal com conteúdo customizado
   * @param {Object} options - Configurações do modal
   * @param {string} options.title - Título do modal
   * @param {string} options.content - Conteúdo HTML
   * @param {Array} options.actions - Botões de ação
   * @param {string} options.type - Tipo: 'info', 'approval', 'progress'
   * @param {boolean} options.closeOnBackdrop - Permitir fechar clicando fora
   */
  show(options = {}) {
    // Fechar modal anterior se existir
    this.close();

    const {
      title = 'LEX',
      content = '',
      actions = [],
      type = 'info',
      closeOnBackdrop = true,
      size = 'medium' // small, medium, large
    } = options;

    // Criar estrutura do modal
    const modal = document.createElement('div');
    modal.id = this.modalId;
    modal.className = `lex-modal lex-modal-${type} lex-modal-${size}`;

    const backdrop = document.createElement('div');
    backdrop.className = 'lex-modal-backdrop';

    const container = document.createElement('div');
    container.className = 'lex-modal-container';

    // Header
    const header = document.createElement('div');
    header.className = 'lex-modal-header';
    header.innerHTML = `
      <h3 class="lex-modal-title">${title}</h3>
      <button class="lex-modal-close" aria-label="Fechar">×</button>
    `;

    // Body
    const body = document.createElement('div');
    body.className = 'lex-modal-body';
    body.innerHTML = content;

    // Footer com ações
    const footer = document.createElement('div');
    footer.className = 'lex-modal-footer';

    if (actions.length > 0) {
      actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = `lex-modal-btn lex-modal-btn-${action.type || 'default'}`;
        btn.textContent = action.label;
        btn.onclick = () => {
          if (action.callback) {
            action.callback();
          }
          if (action.closeOnClick !== false) {
            this.close();
          }
        };
        footer.appendChild(btn);
      });
    }

    // Montar estrutura
    container.appendChild(header);
    container.appendChild(body);
    if (actions.length > 0) {
      container.appendChild(footer);
    }

    modal.appendChild(backdrop);
    modal.appendChild(container);

    // Event listeners
    const closeBtn = header.querySelector('.lex-modal-close');
    closeBtn.onclick = () => {
      if (this.onCancel) {
        this.onCancel();
      }
      this.close();
    };

    if (closeOnBackdrop) {
      backdrop.onclick = () => {
        if (this.onCancel) {
          this.onCancel();
        }
        this.close();
      };
    }

    // Adicionar ao DOM
    document.body.appendChild(modal);
    this.activeModal = modal;

    // Animação de entrada
    setTimeout(() => {
      modal.classList.add('lex-modal-visible');
    }, 10);

    // Focar no primeiro botão
    const firstBtn = footer.querySelector('button');
    if (firstBtn) {
      setTimeout(() => firstBtn.focus(), 100);
    }

    console.log(`📦 LexModal: Modal aberto (${type})`);
  }

  /**
   * Atualiza conteúdo do modal sem fechar
   * @param {string} content - Novo conteúdo HTML
   */
  updateContent(content) {
    if (!this.activeModal) return;

    const body = this.activeModal.querySelector('.lex-modal-body');
    if (body) {
      body.innerHTML = content;
    }
  }

  /**
   * Atualiza título do modal
   * @param {string} title - Novo título
   */
  updateTitle(title) {
    if (!this.activeModal) return;

    const titleEl = this.activeModal.querySelector('.lex-modal-title');
    if (titleEl) {
      titleEl.textContent = title;
    }
  }

  /**
   * Fecha modal ativo
   */
  close() {
    if (!this.activeModal) return;

    // Animação de saída
    this.activeModal.classList.remove('lex-modal-visible');

    setTimeout(() => {
      if (this.activeModal && this.activeModal.parentNode) {
        this.activeModal.remove();
      }
      this.activeModal = null;
      this.onApprove = null;
      this.onCancel = null;
      console.log('📦 LexModal: Modal fechado');
    }, 200);
  }

  /**
   * Verifica se há modal ativo
   */
  isOpen() {
    return this.activeModal !== null;
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.LexModal = LexModal;
}
