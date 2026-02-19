window.onerror = function (msg, url, line) {
    console.error('App Error:', msg, line);
    return false;
};

// DOM Elements
const chatInput = document.querySelector('textarea');
const sendBtn = document.querySelector('.send-btn');
const mainChatContainer = document.querySelector('.chat-container');

// ============================================================================
// AGENT LOOP INTEGRATION
// ============================================================================

let currentAgentMessageId = null;
let agentThinkingElement = null;

// Setup Agent event listener
function setupAgentEvents() {
    if (!window.lexApi || !window.lexApi.onAgentEvent) {
        console.warn('[App] Agent API not available');
        return;
    }

    window.lexApi.onAgentEvent((event) => {
        console.log('[Agent Event]', event.type, event);

        switch (event.type) {
            case 'started':
                // Agent started - can show initial loading state
                console.log('[Agent] Started, runId:', event.runId);
                break;

            case 'thinking':
                // event has: pensamento, iteracao
                updateAgentThinking(event.pensamento);
                break;

            case 'criticizing':
                // event has: decision, iteracao
                updateAgentCritic(event.decision);
                break;

            case 'acting':
                // event has: skill, parametros
                addAgentActionToUI({ skill: event.skill, parametros: event.parametros });
                break;

            case 'tool_result':
                // event has: skill, resultado
                updateAgentObservation(event.resultado);
                break;

            case 'observing':
                // event has: observacao
                console.log('[Agent] Observing:', event.observacao);
                break;

            case 'completed':
                // event has: resposta, passos, duracao
                finalizeAgentResponse(event.resposta);
                completeAgentSession();
                break;

            case 'waiting_user':
                // event has: pergunta
                finalizeAgentResponse(event.pergunta);
                completeAgentSession();
                break;

            case 'error':
                // event has: erro, recuperavel
                showAgentError(event.erro);
                break;

            case 'timeout':
                showAgentError('Tempo limite atingido');
                break;

            case 'cancelled':
                showAgentError('Operação cancelada');
                break;
        }
    });
}

// Create or update the agent's thinking bubble
// Create or update the agent's thinking accordion
function updateAgentThinking(pensamento) {
    if (!agentThinkingElement) {
        // Create new thinking container (Accordion Style)
        const messageList = document.getElementById('chat-messages');
        if (!messageList) return;

        // Container wrapper
        const container = document.createElement('div');
        container.className = 'thinking-container';

        currentAgentMessageId = `agent-think-${Date.now()}`;
        container.id = currentAgentMessageId;

        // Accordion HTML
        container.innerHTML = `
            <details class="thinking-accordion" open>
                <summary class="thinking-summary">
                    Processo de pensamento
                </summary>
                <div class="thinking-content">
                    <div class="log-line">
                        <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                        <span class="log-message">${escapeHtml(pensamento)}</span>
                    </div>
                </div>
            </details>
        `;

        messageList.appendChild(container);
        messageList.scrollTop = messageList.scrollHeight;
        agentThinkingElement = container;
    } else {
        // Update summary and add log line
        const summary = agentThinkingElement.querySelector('.thinking-summary');
        if (summary) summary.textContent = pensamento.substring(0, 60) + (pensamento.length > 60 ? '...' : '');

        const content = agentThinkingElement.querySelector('.thinking-content');
        if (content) {
            const logLine = document.createElement('div');
            logLine.className = 'log-line';
            logLine.innerHTML = `
                <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                <span class="log-message">${escapeHtml(pensamento)}</span>
            `;
            content.appendChild(logLine);
            // Auto scroll inside accordion if needed, or main list
            const messageList = document.getElementById('chat-messages');
            if (messageList) messageList.scrollTop = messageList.scrollHeight;
        }
    }
}

// Legacy implementation (kept temporarily for reference)
function legacyAddAgentActionToUI(data) {
    if (!agentThinkingElement) return;

    const content = agentThinkingElement.querySelector('.thinking-content');
    if (!content) return;

    const summary = agentThinkingElement.querySelector('.thinking-summary');
    if (summary) summary.textContent = `Executando: ${data.skill}`;

    const actionId = `action-${Date.now()}`;
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    logLine.id = actionId;
    logLine.innerHTML = `
        <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="log-message log-type-exec">⚡ Executing ${escapeHtml(data.skill)}...</span>
    `;
    content.appendChild(logLine);

    // Store action ID for update
    content.dataset.lastActionId = actionId;

    const messageList = document.getElementById('chat-messages');
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
}

// Legacy implementation (kept temporarily for reference)
function legacyUpdateAgentCritic(decision) {
    if (!decision) return;

    if (!agentThinkingElement) {
        updateAgentThinking('Critic: revisando plano de acao...');
    }

    if (!agentThinkingElement) return;

    const content = agentThinkingElement.querySelector('.thinking-content');
    if (!content) return;

    const summary = agentThinkingElement.querySelector('.thinking-summary');
    const approved = !!decision.approved;
    const risk = decision.riskLevel || 'medium';
    const reason = decision.reason || 'Sem justificativa do critic';

    if (summary) {
        summary.textContent = approved
            ? `Critic: aprovado (${risk})`
            : `Critic: bloqueado (${risk})`;
    }

    let colorClass = 'log-type-critic';
    if (!approved) colorClass = 'log-type-error';
    else if (risk === 'high' || decision.requiresUserConfirmation) colorClass = 'log-type-wait';
    else if (risk === 'low') colorClass = 'log-type-info';

    const icon = approved ? 'APPROVED' : 'BLOCKED';
    const label = approved ? 'Critic approved' : 'Critic blocked';
    const actionHint = decision.correctedDecision?.skill
        ? ` | adjusted to: ${decision.correctedDecision.skill}`
        : '';
    const confirmationHint = decision.requiresUserConfirmation
        ? ' | user confirmation required'
        : '';

    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    logLine.innerHTML = `
        <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="log-message ${colorClass}">${icon} ${label}: ${escapeHtml(reason)}${escapeHtml(actionHint)}${escapeHtml(confirmationHint)}</span>
    `;
    content.appendChild(logLine);

    const messageList = document.getElementById('chat-messages');
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
}

// Legacy implementation (kept temporarily for reference)
function legacyUpdateAgentObservation(data) {
    if (!agentThinkingElement) return;

    const content = agentThinkingElement.querySelector('.thinking-content');
    if (!content) return;

    // Add result log
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    const isSuccess = data.sucesso;
    const icon = isSuccess ? '✓' : '✗';
    const colorClass = isSuccess ? 'log-type-info' : 'log-type-error'; // need to define log-type-error CSS or reuse

    logLine.innerHTML = `
        <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="log-message ${colorClass}">${icon} Result: ${isSuccess ? 'Success' : 'Failed'}</span>
    `;
    content.appendChild(logLine);
}

// Finalize with agent's response
function finalizeAgentResponse(resposta) {
    // 1. Close the thinking accordion (Optional, but cleaner)
    if (agentThinkingElement) {
        const details = agentThinkingElement.querySelector('details');
        if (details) {
            // Update summary one last time
            const summary = agentThinkingElement.querySelector('.thinking-summary');
            if (summary) summary.textContent = 'Processo de pensamento';

            // Collapse it
            details.removeAttribute('open');
        }
        agentThinkingElement = null; // Detach current thinking element
    }

    // 2. Add the final response as a SEPARATE standard message
    addMessageToUI(resposta, 'ai');
}

// Show agent error
function showAgentError(erro) {
    if (agentThinkingElement) {
        const statusText = agentThinkingElement.querySelector('.agent-status-text');
        if (statusText) {
            statusText.textContent = `Erro: ${erro}`;
            statusText.classList.add('error');
        }
    } else {
        addMessageToUI(`Erro: ${erro}`, 'system');
    }
}

// Complete agent session
function completeAgentSession() {
    agentThinkingElement = null;
    currentAgentMessageId = null;
}

// Helper: escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeHtml(html) {
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(html);
    }
    return escapeHtml(html);
}

function renderMarkdownSafe(markdownText) {
    const source = typeof markdownText === 'string' ? markdownText : String(markdownText || '');
    const html = window.marked ? window.marked.parse(source) : escapeHtml(source);
    return sanitizeHtml(html);
}

// Initialize agent events on load
document.addEventListener('DOMContentLoaded', () => {
    setupAgentEvents();
});

// Widget Elements
const pjeWidget = document.getElementById('pje-floating-container');
const browserViewport = document.getElementById('browser-viewport');
const btnClosePje = document.getElementById('btn-close-pje');
const btnMinimizePje = document.getElementById('btn-minimize-pje');
const btnMaximizePje = document.getElementById('btn-maximize-pje');

// State
let isWidgetVisible = false;

// --- Widget Layout Logic ---

function updateWidgetLayout() {
    if (!pjeWidget || !isWidgetVisible || pjeWidget.classList.contains('hidden')) {
        // Hide BrowserView
        if (window.lexApi && window.lexApi.updateBrowserLayout) {
            window.lexApi.updateBrowserLayout({ x: 0, y: 0, width: 0, height: 0 });
        }
        return;
    }

    if (browserViewport) {
        const rect = browserViewport.getBoundingClientRect();
        // Send to Main Process to resize BrowserView
        if (window.lexApi && window.lexApi.updateBrowserLayout) {
            window.lexApi.updateBrowserLayout({
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            });
        }
    }
}

// Observer for widget resize/move
const resizeObserver = new ResizeObserver(() => {
    updateWidgetLayout();
});
if (pjeWidget) resizeObserver.observe(pjeWidget);

// Fix: Expose toggle globally
window.togglePJeWidget = function (show) {
    if (!pjeWidget) return;

    if (show) {
        pjeWidget.classList.remove('hidden');
        isWidgetVisible = true;
        // Wait for CSS transition or render
        setTimeout(updateWidgetLayout, 350);
    } else {
        pjeWidget.classList.add('hidden');
        isWidgetVisible = false;
        setTimeout(updateWidgetLayout, 350);
    }
};

// --- Widget Controls ---

if (btnClosePje) btnClosePje.addEventListener('click', () => window.togglePJeWidget(false));

// Draggable Logic (Simple)
const pjeHeader = document.querySelector('.pje-header');
if (pjeHeader && pjeWidget) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    pjeHeader.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = pjeWidget.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        // Remove transform centering to allow free drag
        pjeWidget.style.transform = 'none';
        pjeWidget.style.left = initialLeft + 'px';
        pjeWidget.style.top = initialTop + 'px';
        // Ensure bottom/right don't interfere
        pjeWidget.style.bottom = 'auto';
        pjeWidget.style.right = 'auto';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        pjeWidget.style.left = `${initialLeft + dx}px`;
        pjeWidget.style.top = `${initialTop + dy}px`;

        // Ideally we pause browser view updates here or throttle them
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            updateWidgetLayout(); // Snap view to new position
        }
    });
}


// --- Chat Logic ---

// Auto-resize textarea
if (chatInput) {
    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value.trim().length > 0) sendBtn.removeAttribute('disabled');
        else sendBtn.setAttribute('disabled', 'true');
    });
}

// Feature Flag: Use Agent Loop (set to true to enable)
const USE_AGENT_LOOP = true;

// Send Message Logic
if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
        const text = chatInput.value;
        if (!text.trim()) return;

        addMessageToUI(text, 'user');

        chatInput.value = '';
        sendBtn.setAttribute('disabled', 'true');
        chatInput.style.height = 'auto';

        // Hide greeting on first message
        const greeting = document.querySelector('.greeting-section');
        if (greeting && greeting.style.display !== 'none') greeting.style.display = 'none';
        if (mainChatContainer) mainChatContainer.classList.add('has-messages');

        try {
            if (window.lexApi) {
                if (USE_AGENT_LOOP && window.lexApi.runAgent) {
                    // === AGENT LOOP MODE ===
                    // Events will stream via onAgentEvent
                    console.log('[App] Running Agent Loop for:', text);

                    const result = await window.lexApi.runAgent(text);

                    if (!result.success) {
                        // Error case (if no streaming error was shown)
                        if (!agentThinkingElement) {
                            addMessageToUI(`Falha: ${result.error}`, 'system');
                        }
                    }
                    // Response is handled via streaming events
                    completeAgentSession();

                } else {
                    // === LEGACY MODE (sendChat) ===
                    const loadingId = addLoadingToUI();

                    const response = await window.lexApi.sendChat(text, {});
                    removeMessageFromUI(loadingId);

                    if (response.error) {
                        addMessageToUI(`Erro: ${response.error}`, 'system');
                    } else if (response.plan) {
                        const aiText = response.plan.intent?.description || "Plano recebido.";
                        addMessageToUI(aiText, 'ai');

                        if (response.plan.steps && response.plan.steps.length > 0) {
                            // Automation Card message
                            const cardId = addAutomationCardToUI();

                            // Auto-Show Widget for now
                            window.togglePJeWidget(true);

                            try {
                                const execResult = await window.lexApi.executePlan(response.plan);
                                if (execResult.error) {
                                    addMessageToUI(`PJe: ${execResult.error}`, 'system');
                                } else {
                                    updateAutomationCardStatus(cardId, 'Concluído');
                                }
                            } catch (execErr) {
                                console.error(execErr);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[App] Error:', err);
            addMessageToUI("Erro de conexão.", 'system');
            completeAgentSession();
        }
    });
}

function legacyAddMessageToUIBase(text, type) {
    let messageList = document.getElementById('chat-messages');
    const greeting = document.querySelector('.greeting-section');

    // Hide greeting on first message
    if (greeting && greeting.style.display !== 'none') greeting.style.display = 'none';

    // Also add has-messages to container for alignment
    if (mainChatContainer) mainChatContainer.classList.add('has-messages');

    if (!messageList) return null;

    // Thinking parsing
    let displayText = text;
    let thinkingContent = '';
    const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
        thinkingContent = thinkingMatch[1].trim();
        displayText = text.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
    }

    const htmlContent = renderMarkdownSafe(displayText);
    const safeThinkingContent = escapeHtml(thinkingContent);

    let messageHtml = '';
    if (thinkingContent) {
        messageHtml += `<div class="thinking-container"><details class="thinking-accordion"><summary class="thinking-summary">Thinking Process</summary><div class="thinking-content">${safeThinkingContent}</div></details></div>`;
    }
    messageHtml += `<div class="msg-content markdown-body">${htmlContent}</div>`;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.id = type === 'loading' ? `msg-${Date.now()}` : '';
    const icon = type === 'user' ? 'USR' : 'LEX';

    // Styling tweaks for system messages
    if (type === 'system') {
        msgDiv.innerHTML = `<div class="msg-avatar">SYS</div><div class="message-body">${messageHtml}</div>`;
    } else {
        msgDiv.innerHTML = `<div class="msg-avatar">${icon}</div><div class="message-body">${messageHtml}</div>`;
    }

    messageList.appendChild(msgDiv);
    messageList.scrollTop = messageList.scrollHeight;
    return msgDiv.id;
}

function legacyAddLoadingToUI() { return addMessageToUI('Pensando...', 'loading'); }
function removeMessageFromUI(id) { document.getElementById(id)?.remove(); }

function legacyAddAutomationCardToUIBase() {
    let messageList = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message system automation-card';
    const id = `card-${Date.now()}`;
    msgDiv.id = id;

    // Using inline styles for speed, move to CSS later
    msgDiv.innerHTML = `
        <div class="msg-avatar">SYS</div>
        <div class="message-body" style="width: 100%;">
            <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <strong>PJe Automation</strong>
                    <div id="${id}-status" style="font-size: 12px; opacity: 0.8;">Executando...</div>
                </div>
                <button class="open-pje-btn" style="background: #4ade80; border: none; padding: 6px 12px; border-radius: 4px; color: #000; font-weight: 500; cursor: pointer;">Ver Tela</button>
            </div>
        </div>
    `;

    const openPjeBtn = msgDiv.querySelector('.open-pje-btn');
    if (openPjeBtn) {
        openPjeBtn.addEventListener('click', () => window.togglePJeWidget(true));
    }

    messageList.appendChild(msgDiv);
    messageList.scrollTop = messageList.scrollHeight;
    return id;
}

function updateAutomationCardStatus(cardId, status) {
    const el = document.getElementById(`${cardId}-status`);
    if (el) el.innerText = status;
}

// ============================================================================
// NAVIGATION LOGIC
// ============================================================================

const navItems = document.querySelectorAll('.nav-item');
const views = {
    'nav-chat': document.querySelector('.chat-wrapper'),
    'nav-pje': document.getElementById('pje-floating-container'), // PJe is floating, handled differently usually, but let's include
    'nav-files': document.querySelector('.file-manager-wrapper'),
    'nav-history': null, // Todo
    'nav-settings': null // Todo
};

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const viewId = item.id;

        // 1. Update Active State
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // 2. Handle Views
        // Special case: PJe button might just toggle the floating widget
        if (viewId === 'nav-pje') {
            window.togglePJeWidget(true);
            return;
        }

        // Standard Tab Switching
        // Hide all main views
        if (views['nav-chat']) views['nav-chat'].classList.add('hidden');
        if (views['nav-files']) views['nav-files'].classList.add('hidden');

        // Show target
        if (views[viewId]) {
            views[viewId].classList.remove('hidden');
        }
    });
});

// Initialize: Ensure Chat is visible by default
if (views['nav-chat']) views['nav-chat'].classList.remove('hidden');

function normalizeSystemText(rawText) {
    const asText = typeof rawText === 'string' ? rawText : String(rawText || '');
    return asText.replace(/^[^\p{L}\p{N}]+/u, '').trimStart();
}

function stripEmojiCharacters(rawText) {
    const asText = typeof rawText === 'string' ? rawText : String(rawText || '');
    return asText.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');
}

function addAgentActionToUI(data) {
    if (!agentThinkingElement) return;

    const content = agentThinkingElement.querySelector('.thinking-content');
    if (!content) return;

    const summary = agentThinkingElement.querySelector('.thinking-summary');
    if (summary) summary.textContent = `Executando: ${data.skill}`;

    const actionId = `action-${Date.now()}`;
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    logLine.id = actionId;
    logLine.innerHTML = `
        <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="log-message log-type-exec">Executing ${escapeHtml(data.skill)}...</span>
    `;
    content.appendChild(logLine);
    content.dataset.lastActionId = actionId;

    const messageList = document.getElementById('chat-messages');
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
}

function updateAgentCritic(decision) {
    if (!decision) return;

    if (!agentThinkingElement) {
        updateAgentThinking('Critic: reviewing execution plan...');
    }
    if (!agentThinkingElement) return;

    const content = agentThinkingElement.querySelector('.thinking-content');
    if (!content) return;

    const summary = agentThinkingElement.querySelector('.thinking-summary');
    const approved = !!decision.approved;
    const risk = decision.riskLevel || 'medium';
    const reason = decision.reason || 'No critic reason provided';

    if (summary) {
        summary.textContent = approved
            ? `Critic: approved (${risk})`
            : `Critic: blocked (${risk})`;
    }

    let colorClass = 'log-type-critic';
    if (!approved) colorClass = 'log-type-error';
    else if (risk === 'high' || decision.requiresUserConfirmation) colorClass = 'log-type-wait';
    else if (risk === 'low') colorClass = 'log-type-info';

    const label = approved ? 'Critic approved' : 'Critic blocked';
    const actionHint = decision.correctedDecision?.skill
        ? ` | adjusted to: ${decision.correctedDecision.skill}`
        : '';
    const confirmationHint = decision.requiresUserConfirmation
        ? ' | user confirmation required'
        : '';

    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    logLine.innerHTML = `
        <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="log-message ${colorClass}">${label}: ${escapeHtml(reason)}${escapeHtml(actionHint)}${escapeHtml(confirmationHint)}</span>
    `;
    content.appendChild(logLine);

    const messageList = document.getElementById('chat-messages');
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
}

function updateAgentObservation(data) {
    if (!agentThinkingElement) return;

    const content = agentThinkingElement.querySelector('.thinking-content');
    if (!content) return;

    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    const isSuccess = !!data?.sucesso;
    const colorClass = isSuccess ? 'log-type-info' : 'log-type-error';

    logLine.innerHTML = `
        <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="log-message ${colorClass}">Result: ${isSuccess ? 'Success' : 'Failed'}</span>
    `;
    content.appendChild(logLine);
}

function addMessageToUI(text, type) {
    const messageList = document.getElementById('chat-messages');
    const greeting = document.querySelector('.greeting-section');
    if (!messageList) return null;

    if (greeting && greeting.style.display !== 'none') greeting.style.display = 'none';
    if (mainChatContainer) mainChatContainer.classList.add('has-messages');

    const rawText = typeof text === 'string' ? text : String(text || '');
    const normalizedText = type === 'system' ? normalizeSystemText(rawText) : rawText;
    const cleanedText = stripEmojiCharacters(normalizedText);

    let displayText = cleanedText;
    let thinkingContent = '';
    const thinkingMatch = cleanedText.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
        thinkingContent = stripEmojiCharacters(thinkingMatch[1]).trim();
        displayText = cleanedText.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
    }

    const htmlContent = renderMarkdownSafe(displayText);
    const safeThinkingContent = escapeHtml(thinkingContent);

    let messageHtml = '';
    if (thinkingContent) {
        messageHtml += `<div class="thinking-container"><details class="thinking-accordion"><summary class="thinking-summary">Processo de pensamento</summary><div class="thinking-content">${safeThinkingContent}</div></details></div>`;
    }
    messageHtml += `<div class="msg-content markdown-body">${htmlContent}</div>`;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.id = type === 'loading' ? `msg-${Date.now()}` : '';
    msgDiv.innerHTML = `<div class="message-body">${messageHtml}</div>`;

    messageList.appendChild(msgDiv);
    messageList.scrollTop = messageList.scrollHeight;
    return msgDiv.id;
}

function addLoadingToUI() {
    return addMessageToUI('Analisando...', 'loading');
}

function addAutomationCardToUI() {
    const messageList = document.getElementById('chat-messages');
    if (!messageList) return null;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message system automation-card';
    const id = `card-${Date.now()}`;
    msgDiv.id = id;

    msgDiv.innerHTML = `
        <div class="message-body">
            <div class="automation-panel">
                <div class="automation-copy">
                    <strong>PJe Automation</strong>
                    <div id="${id}-status" class="automation-status">Executando...</div>
                </div>
                <button class="open-pje-btn">Ver Tela</button>
            </div>
        </div>
    `;

    const openPjeBtn = msgDiv.querySelector('.open-pje-btn');
    if (openPjeBtn) {
        openPjeBtn.addEventListener('click', () => window.togglePJeWidget(true));
    }

    messageList.appendChild(msgDiv);
    messageList.scrollTop = messageList.scrollHeight;
    return id;
}
