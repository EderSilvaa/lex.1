// LEX Agent UI - Interface visual para aprovação e acompanhamento de planos
// Usa LexModal e LexToast para feedback visual sem ruído

class LexAgentUI {
  constructor() {
    this.modal = new window.LexModal();
    this.toast = window.LexToast || window.lexToast; // Compatibilidade
    this.currentPlan = null;
    this.onApproveCallback = null;
    this.onCancelCallback = null;

    console.log('🎨 LEX Agent UI: Interface inicializada');
  }

  /**
   * Mostra plano para aprovação do usuário
   * @param {Object} plan - Plano de ação do GPT-4
   * @param {Function} onApprove - Callback ao aprovar
   * @param {Function} onCancel - Callback ao cancelar
   */
  showPlanForApproval(plan, onApprove, onCancel) {
    this.currentPlan = plan;
    this.onApproveCallback = onApprove;
    this.onCancelCallback = onCancel;

    // Determinar nível de risco
    const highRisk = plan.risks?.some(r => r.level === 'high');
    const hasApprovalRequired = plan.needsApproval === true;

    // Renderizar conteúdo do plano
    const content = this.renderPlanContent(plan);

    // Ações (botões)
    const actions = [];

    // Se NÃO precisa aprovação, apenas mostrar com botão "Executar"
    if (!hasApprovalRequired) {
      actions.push({
        label: '✓ Executar',
        type: 'primary',
        callback: () => {
          if (onApprove) onApprove();
          this.showExecutionProgress(plan);
        }
      });
    } else {
      // Precisa aprovação - mostrar Cancelar + Executar
      actions.push({
        label: 'Cancelar',
        type: 'cancel',
        callback: () => {
          if (onCancel) onCancel();
          this.toast?.show('❌ Execução cancelada', 'info', 2000);
        }
      });

      actions.push({
        label: highRisk ? '⚠️ Executar Mesmo Assim' : '✓ Executar',
        type: highRisk ? 'danger' : 'primary',
        callback: () => {
          if (onApprove) onApprove();
          this.showExecutionProgress(plan);
        }
      });
    }

    // Mostrar modal
    this.modal.show({
      title: '🤖 LEX Agent - Plano de Ação',
      content: content,
      actions: actions,
      type: 'approval',
      size: 'medium',
      closeOnBackdrop: false // Não fechar clicando fora (decisão crítica)
    });

    console.log(`🎨 LEX Agent UI: Plano exibido (${plan.steps?.length || 0} passos)`);
  }

  /**
   * Renderiza conteúdo visual do plano
   * @param {Object} plan - Plano de ação
   * @returns {string} HTML do plano
   */
  renderPlanContent(plan) {
    const intent = plan.intent || {};
    const steps = plan.steps || [];
    const risks = plan.risks || [];
    const estimatedTime = plan.estimatedTime || '?';

    // Determinar nível de risco geral
    const highRisk = risks.some(r => r.level === 'high');
    const mediumRisk = risks.some(r => r.level === 'medium');

    let riskColor = '#10b981'; // Verde
    let riskLabel = 'BAIXO';
    if (highRisk) {
      riskColor = '#ef4444';
      riskLabel = 'ALTO';
    } else if (mediumRisk) {
      riskColor = '#f59e0b';
      riskLabel = 'MÉDIO';
    }

    let html = `
      <div class="lex-agent-plan">
        <!-- Intenção e resumo -->
        <div class="lex-agent-plan-header">
          <div class="lex-agent-plan-intent">
            <strong>🎯 Objetivo:</strong> ${intent.description || intent.action || 'Executar comando'}
          </div>
          <div class="lex-agent-plan-meta">
            <span class="lex-agent-plan-time">⏱️ ${estimatedTime}s</span>
            <span class="lex-agent-plan-risk" style="color: ${riskColor};">⚡ Risco: ${riskLabel}</span>
          </div>
        </div>

        <div class="lex-agent-plan-divider"></div>

        <!-- Passos do plano -->
        <div class="lex-agent-plan-steps">
          <h4>📝 Passos a Executar:</h4>
    `;

    steps.forEach((step, index) => {
      const stepIcon = this.getStepIcon(step.type);

      html += `
        <div class="lex-agent-plan-step">
          <div class="lex-agent-plan-step-number">${index + 1}</div>
          <div class="lex-agent-plan-step-content">
            <div class="lex-agent-plan-step-title">
              ${stepIcon} ${step.description}
            </div>
      `;

      // Detalhes técnicos (seletor, valor, URL) - modo compacto
      const details = [];
      if (step.selector) {
        details.push(`<code>${step.selector}</code>`);
      }
      if (step.value) {
        details.push(`→ "${step.value}"`);
      }
      if (step.url) {
        details.push(`🔗 ${step.url}`);
      }

      if (details.length > 0) {
        html += `
          <div class="lex-agent-plan-step-details">
            ${details.join(' ')}
          </div>
        `;
      }

      // Motivo (reasoning) - collapse opcional
      if (step.reasoning) {
        html += `
          <div class="lex-agent-plan-step-reasoning">
            💡 ${step.reasoning}
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    });

    html += `</div>`;

    // Riscos identificados
    if (risks.length > 0) {
      html += `
        <div class="lex-agent-plan-divider"></div>
        <div class="lex-agent-plan-risks">
          <h4>⚠️ Riscos Identificados:</h4>
      `;

      risks.forEach(risk => {
        const riskIcon = risk.level === 'high' ? '🔴' : risk.level === 'medium' ? '🟡' : '🟢';
        html += `
          <div class="lex-agent-plan-risk lex-agent-plan-risk-${risk.level}">
            <div class="lex-agent-plan-risk-label">
              ${riskIcon} <strong>${risk.level.toUpperCase()}:</strong> ${risk.description}
            </div>
            <div class="lex-agent-plan-risk-mitigation">
              ✓ Mitigação: ${risk.mitigation}
            </div>
          </div>
        `;
      });

      html += `</div>`;
    }

    html += `</div>`;

    return html;
  }

  /**
   * Mostra progresso de execução
   * @param {Object} plan - Plano sendo executado
   */
  showExecutionProgress(plan) {
    const steps = plan.steps || [];
    const totalSteps = steps.length;

    const content = `
      <div class="lex-agent-progress">
        <div class="lex-agent-progress-bar-container">
          <div class="lex-agent-progress-bar" id="lex-agent-progress-bar" style="width: 0%"></div>
        </div>
        <div class="lex-agent-progress-text" id="lex-agent-progress-text">
          🔄 Iniciando execução...
        </div>
        <div class="lex-agent-progress-step" id="lex-agent-progress-step">
          Passo 0/${totalSteps}
        </div>
      </div>
    `;

    this.modal.show({
      title: '🤖 LEX Agent - Executando...',
      content: content,
      actions: [],
      type: 'progress',
      size: 'medium',
      closeOnBackdrop: false
    });

    console.log('🎨 LEX Agent UI: Modal de progresso exibido');
  }

  /**
   * Atualiza progresso de execução
   * @param {number} current - Passo atual
   * @param {number} total - Total de passos
   * @param {string} message - Mensagem de status
   */
  updateProgress(current, total, message) {
    const percentage = Math.round((current / total) * 100);

    const progressBar = document.getElementById('lex-agent-progress-bar');
    const progressText = document.getElementById('lex-agent-progress-text');
    const progressStep = document.getElementById('lex-agent-progress-step');

    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }

    if (progressText) {
      progressText.textContent = message;
    }

    if (progressStep) {
      progressStep.textContent = `Passo ${current}/${total}`;
    }

    console.log(`🎨 LEX Agent UI: Progresso ${percentage}% - ${message}`);
  }

  /**
   * Mostra resultado final da execução
   * @param {Object} result - Resultado da execução
   */
  showExecutionResult(result) {
    const success = result.success !== false;
    const message = result.message || (success ? 'Execução concluída!' : 'Erro na execução');

    const content = `
      <div class="lex-agent-result">
        <div class="lex-agent-result-icon">
          ${success ? '✅' : '❌'}
        </div>
        <div class="lex-agent-result-message">
          ${message}
        </div>
        ${result.details ? `
          <div class="lex-agent-result-details">
            ${result.details}
          </div>
        ` : ''}
      </div>
    `;

    this.modal.show({
      title: success ? '✅ LEX Agent' : '❌ LEX Agent',
      content: content,
      actions: [
        {
          label: 'OK',
          type: success ? 'success' : 'default',
          callback: () => {}
        }
      ],
      type: 'info',
      size: 'small',
      closeOnBackdrop: true
    });

    // Toast de feedback rápido
    if (this.toast) {
      this.toast.show(
        message,
        success ? 'success' : 'error',
        3000
      );
    }

    console.log(`🎨 LEX Agent UI: Resultado exibido (${success ? 'sucesso' : 'erro'})`);
  }

  /**
   * Fecha modal ativo
   */
  close() {
    this.modal.close();
    this.currentPlan = null;
    this.onApproveCallback = null;
    this.onCancelCallback = null;
  }

  /**
   * Retorna ícone apropriado para tipo de passo
   * @param {string} type - Tipo do passo
   * @returns {string} Emoji do ícone
   */
  getStepIcon(type) {
    const icons = {
      navigate: '🔗',
      click: '👆',
      type: '⌨️',
      wait: '⏱️',
      scroll: '📜',
      read: '👁️',
      download: '📥',
      upload: '📤',
      select: '☑️',
      submit: '📤',
      verify: '✓'
    };

    return icons[type] || '▶️';
  }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.LexAgentUI = LexAgentUI;
}
