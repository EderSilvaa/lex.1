// LEX Modal System - Generic reusable modal system
// Used by LEX and LEX Agent to display info and request approvals

class LexModal {
  constructor() {
    this.activeModal = null;
    this.onApprove = null;
    this.onCancel = null;
    this.modalId = `lex-modal-${Date.now()}`;

    console.log('LexModal: sistema inicializado');
  }

  /**
   * Show modal with custom content
   * @param {Object} options
   */
  show(options = {}) {
    this.close();

    const {
      title = 'LEX',
      content = '',
      actions = [],
      type = 'info',
      closeOnBackdrop = true,
      size = 'medium' // small, medium, large
    } = options;

    const modal = document.createElement('div');
    modal.id = this.modalId;
    modal.className = `lex-modal lex-modal-${type} lex-modal-${size}`;

    const backdrop = document.createElement('div');
    backdrop.className = 'lex-modal-backdrop';

    const container = document.createElement('div');
    container.className = 'lex-modal-container';

    const header = document.createElement('div');
    header.className = 'lex-modal-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'lex-modal-title';
    titleEl.textContent = title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lex-modal-close';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = 'x';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'lex-modal-body';
    body.innerHTML = this.sanitizeHtml(content);

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

    container.appendChild(header);
    container.appendChild(body);
    if (actions.length > 0) {
      container.appendChild(footer);
    }

    modal.appendChild(backdrop);
    modal.appendChild(container);

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

    document.body.appendChild(modal);
    this.activeModal = modal;

    setTimeout(() => {
      modal.classList.add('lex-modal-visible');
    }, 10);

    const firstBtn = footer.querySelector('button');
    if (firstBtn) {
      setTimeout(() => firstBtn.focus(), 100);
    }
  }

  /**
   * Sanitize HTML before insertion to avoid XSS in modal content.
   */
  sanitizeHtml(content) {
    if (!content) return '';
    if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      return window.DOMPurify.sanitize(String(content));
    }
    const temp = document.createElement('div');
    temp.textContent = String(content);
    return temp.innerHTML;
  }

  /**
   * Update modal body without closing
   */
  updateContent(content) {
    if (!this.activeModal) return;

    const body = this.activeModal.querySelector('.lex-modal-body');
    if (body) {
      body.innerHTML = this.sanitizeHtml(content);
    }
  }

  /**
   * Update modal title
   */
  updateTitle(title) {
    if (!this.activeModal) return;

    const titleEl = this.activeModal.querySelector('.lex-modal-title');
    if (titleEl) {
      titleEl.textContent = title;
    }
  }

  /**
   * Close active modal
   */
  close() {
    if (!this.activeModal) return;

    this.activeModal.classList.remove('lex-modal-visible');

    setTimeout(() => {
      if (this.activeModal && this.activeModal.parentNode) {
        this.activeModal.remove();
      }
      this.activeModal = null;
      this.onApprove = null;
      this.onCancel = null;
    }, 200);
  }

  /**
   * Check if a modal is currently open
   */
  isOpen() {
    return this.activeModal !== null;
  }
}

if (typeof window !== 'undefined') {
  window.LexModal = LexModal;
}
