// LEX Toast Notification System
// Sistema de notificações não intrusivas para feedback visual

class LexToast {
  constructor() {
    this.toasts = [];
    this.container = null;
    this.initContainer();
  }

  /**
   * Inicializa o container de toasts
   */
  initContainer() {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'lex-toast-container';
    this.container.className = 'lex-toast-container';
    document.body.appendChild(this.container);
  }

  /**
   * Mostra uma notificação toast
   * @param {string} message - Mensagem a exibir
   * @param {string} type - Tipo: 'loading', 'success', 'error', 'info'
   * @param {number} duration - Duração em ms (0 = não auto-dismiss)
   * @returns {string} ID do toast
   */
  show(message, type = 'info', duration = 3000) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const toast = document.createElement('div');
    toast.id = id;
    toast.className = `lex-toast lex-toast-${type}`;

    // Ícone baseado no tipo
    const icon = this.getIcon(type);

    toast.innerHTML = `
      <div class="lex-toast-content">
        <span class="lex-toast-icon">${icon}</span>
        <span class="lex-toast-message">${message}</span>
        ${type !== 'loading' ? '<button class="lex-toast-close">×</button>' : ''}
      </div>
      ${type === 'loading' ? '<div class="lex-toast-loader"></div>' : ''}
    `;

    // Botão de fechar
    const closeBtn = toast.querySelector('.lex-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.dismiss(id));
    }

    // Adicionar ao container
    this.container.appendChild(toast);
    this.toasts.push({ id, element: toast, type });

    // Animar entrada
    setTimeout(() => toast.classList.add('lex-toast-visible'), 10);

    // Auto-dismiss
    if (duration > 0 && type !== 'loading') {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  /**
   * Toast de loading
   * @param {string} message - Mensagem
   * @returns {string} ID do toast
   */
  loading(message) {
    return this.show(message, 'loading', 0);
  }

  /**
   * Toast de sucesso
   * @param {string} message - Mensagem
   * @param {number} duration - Duração
   * @returns {string} ID do toast
   */
  success(message, duration = 3000) {
    return this.show(message, 'success', duration);
  }

  /**
   * Toast de erro
   * @param {string} message - Mensagem
   * @param {number} duration - Duração
   * @returns {string} ID do toast
   */
  error(message, duration = 5000) {
    return this.show(message, 'error', duration);
  }

  /**
   * Toast de info
   * @param {string} message - Mensagem
   * @param {number} duration - Duração
   * @returns {string} ID do toast
   */
  info(message, duration = 3000) {
    return this.show(message, 'info', duration);
  }

  /**
   * Atualiza mensagem de um toast existente
   * @param {string} id - ID do toast
   * @param {string} message - Nova mensagem
   * @param {string} type - Novo tipo (opcional)
   */
  update(id, message, type = null) {
    const toastData = this.toasts.find(t => t.id === id);
    if (!toastData) return;

    const messageEl = toastData.element.querySelector('.lex-toast-message');
    if (messageEl) {
      messageEl.textContent = message;
    }

    if (type && type !== toastData.type) {
      toastData.element.className = `lex-toast lex-toast-${type} lex-toast-visible`;
      const iconEl = toastData.element.querySelector('.lex-toast-icon');
      if (iconEl) {
        iconEl.textContent = this.getIcon(type);
      }
      toastData.type = type;
    }
  }

  /**
   * Descarta um toast
   * @param {string} id - ID do toast
   */
  dismiss(id) {
    const toastData = this.toasts.find(t => t.id === id);
    if (!toastData) return;

    // Animar saída
    toastData.element.classList.remove('lex-toast-visible');

    // Remover após animação
    setTimeout(() => {
      if (toastData.element.parentNode) {
        toastData.element.parentNode.removeChild(toastData.element);
      }
      this.toasts = this.toasts.filter(t => t.id !== id);
    }, 300);
  }

  /**
   * Descarta todos os toasts
   */
  dismissAll() {
    this.toasts.forEach(toast => this.dismiss(toast.id));
  }

  /**
   * Retorna ícone baseado no tipo
   * @param {string} type - Tipo do toast
   * @returns {string} Emoji do ícone
   */
  getIcon(type) {
    const icons = {
      loading: '🔄',
      success: '✅',
      error: '❌',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }
}

// Exportar instância global
if (typeof window !== 'undefined') {
  window.LexToast = new LexToast();
  console.log('✅ LEX: Sistema de Toast carregado');
}
