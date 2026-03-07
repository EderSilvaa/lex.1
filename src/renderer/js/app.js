window.onerror = function (msg, url, line) {
    console.error('App Error:', msg, line);
    return false;
};

// DOM Elements
const chatInput = document.querySelector('textarea');
const sendBtn = document.querySelector('.send-btn');
const stopBtn = document.querySelector('.stop-btn');
const mainChatContainer = document.querySelector('.chat-container');

// ============================================================================
// AGENT LOOP INTEGRATION
// ============================================================================

let currentAgentMessageId = null;
let agentThinkingElement = null;
let isAgentWaitingUser = false; // Tracks if agent session is active and waiting for reply
let currentStreamingMsg = null; // Elemento da bubble sendo populada via streaming
let routingLoadingId = null;    // Loading bubble shown while routing/starting agent

function showStopBtn() {
    if (stopBtn) stopBtn.style.display = 'flex';
    if (sendBtn) sendBtn.style.display  = 'none';
}

function hideStopBtn() {
    if (stopBtn) stopBtn.style.display = 'none';
    if (sendBtn) sendBtn.style.display  = '';
}

if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        if (window.lexApi && window.lexApi.cancelAgent) {
            window.lexApi.cancelAgent();
        }
        hideStopBtn();
    });
}

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
                console.log('[Agent] Started, runId:', event.runId);
                isAgentWaitingUser = false;
                // Remove routing loader e cria accordion imediatamente
                if (routingLoadingId) { removeMessageFromUI(routingLoadingId); routingLoadingId = null; }
                agentThinkingElement = null;
                updateAgentThinking('Analisando solicitação...');
                showStopBtn();
                break;

            case 'thinking':
                updateAgentThinking(event.pensamento);
                break;

            case 'criticizing':
                updateAgentCritic(event.decision);
                break;

            case 'acting':
                addAgentActionToUI({ skill: event.skill, parametros: event.parametros });
                break;

            case 'tool_result':
                updateAgentObservation(event.resultado);
                // Auto-expand browser when a PJe skill completes successfully
                if (event.skill && event.skill.startsWith('pje_') && event.resultado?.sucesso) {
                }
                break;

            case 'observing':
                console.log('[Agent] Observing:', event.observacao);
                break;

            case 'streaming_start':
                // Cria bubble vazia antecipadamente para o streaming
                currentStreamingMsg = createStreamingBubble();
                break;

            case 'token':
                // Appenda token na bubble de streaming
                if (currentStreamingMsg) {
                    const span = currentStreamingMsg.querySelector('.stream-text');
                    if (span) {
                        span.textContent += event.token;
                        const ml = document.getElementById('chat-messages');
                        if (ml) ml.scrollTop = ml.scrollHeight;
                    }
                }
                break;

            case 'completed':
                if (currentStreamingMsg && event.resposta) {
                    // Re-renderiza a bubble com markdown completo
                    finalizeStreamingBubble(currentStreamingMsg, event.resposta);
                    currentStreamingMsg = null;
                } else {
                    finalizeAgentResponse(event.resposta);
                }
                isAgentWaitingUser = false;
                completeAgentSession();
                break;

            case 'waiting_user':
                finalizeAgentResponse(event.pergunta);
                isAgentWaitingUser = true;
                if (event.opcoes && event.opcoes.length > 0) {
                    addQuickReplies(event.opcoes);
                } else if (event.requiresUserAction) {
                    addQuickReplies(['Sim, continuar', 'Cancelar']);
                }
                completeAgentSession();
                break;

            case 'error':
                hideStopBtn();
                showAgentError(event.erro);
                isAgentWaitingUser = false;
                break;

            case 'timeout':
                hideStopBtn();
                showAgentError('Tempo limite atingido');
                isAgentWaitingUser = false;
                break;

            case 'cancelled':
                hideStopBtn();
                if (agentThinkingElement) {
                    const details = agentThinkingElement.querySelector('details');
                    if (details) details.removeAttribute('open');
                    agentThinkingElement = null;
                }
                addMessageToUI('Operação interrompida.', 'system');
                isAgentWaitingUser = false;
                break;
        }
    });
}

// Cria bubble vazia de streaming (antes dos tokens chegarem)
function createStreamingBubble() {
    const messageList = document.getElementById('chat-messages');
    const greeting = document.querySelector('.greeting-section');
    if (!messageList) return null;

    if (greeting && greeting.style.display !== 'none') greeting.style.display = 'none';
    if (mainChatContainer) mainChatContainer.classList.add('has-messages');

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai streaming';
    msgDiv.innerHTML = '<div class="message-body"><div class="msg-content markdown-body"><span class="stream-text"></span><span class="stream-cursor">▋</span></div></div>';
    messageList.appendChild(msgDiv);
    messageList.scrollTop = messageList.scrollHeight;
    return msgDiv;
}

// Finaliza bubble de streaming: aplica markdown completo e remove cursor
function finalizeStreamingBubble(msgDiv, fullText) {
    if (!msgDiv) return;
    msgDiv.classList.remove('streaming');
    const body = msgDiv.querySelector('.message-body');
    if (!body) return;

    const rawText = typeof fullText === 'string' ? fullText : String(fullText || '');
    const htmlContent = renderMarkdownSafe(rawText);
    body.innerHTML = `<div class="msg-content markdown-body">${htmlContent}</div>`;

    const messageList = document.getElementById('chat-messages');
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
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
    trackMessage('assistant', resposta);
    saveCurrentConversation();
}

// Show agent error
function showAgentError(erro) {
    // Extrai mensagem amigável para erros conhecidos
    let msg = String(erro || 'Erro desconhecido');
    if (msg.includes('credit balance is too low') || msg.includes('402')) {
        msg = 'Saldo insuficiente na API Anthropic. Adicione créditos em console.anthropic.com.';
    } else if (msg.includes('401') || msg.includes('authentication')) {
        msg = 'Chave de API inválida. Verifique ANTHROPIC_API_KEY.';
    } else if (msg.includes('529') || msg.includes('overloaded')) {
        msg = 'API sobrecarregada. Tente novamente em instantes.';
    } else if (msg.length > 120) {
        msg = msg.slice(0, 120) + '…';
    }

    if (agentThinkingElement) {
        // Adiciona linha de erro no log do accordion
        const content = agentThinkingElement.querySelector('.thinking-content');
        if (content) {
            const logLine = document.createElement('div');
            logLine.className = 'log-line';
            logLine.innerHTML = `
                <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                <span class="log-message log-type-error">✗ ${escapeHtml(msg)}</span>
            `;
            content.appendChild(logLine);
        }
        // Fecha accordion e limpa referência
        completeAgentSession();
    }
    // Mostra também como mensagem no chat para não passar despercebido
    addMessageToUI(msg, 'system');
}

// Complete agent session
function completeAgentSession() {
    agentThinkingElement = null;
    currentAgentMessageId = null;
    if (routingLoadingId) { removeMessageFromUI(routingLoadingId); routingLoadingId = null; }
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


// --- Chat Logic ---

// Auto-resize textarea
if (chatInput) {
    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value.trim().length > 0) sendBtn.removeAttribute('disabled');
        else sendBtn.setAttribute('disabled', 'true');
    });

    // Enter envia; Shift+Enter quebra linha
    chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (this.value.trim().length > 0 && !sendBtn.hasAttribute('disabled')) {
                sendBtn.click();
            }
        }
    });
}

// Generate a unique session ID for this window/user session
let currentSessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);

// ── Conversation state ──────────────────────────────────────────────────────
let convId = currentSessionId;
let convTitle = null;
let convMessages = []; // { role, content, timestamp }

// Mode Routing: use Agent Loop only for operational/automation intents.
const USE_AGENT_LOOP = true;
const AUTO_AGENT_ROUTING = true;

// Send Message Logic
if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
        const text = chatInput.value;
        if (!text.trim()) return;

        addMessageToUI(text, 'user');
        trackMessage('user', text);

        chatInput.value = '';
        sendBtn.setAttribute('disabled', 'true');
        chatInput.style.height = 'auto';

        // Hide greeting on first message
        const greeting = document.querySelector('.greeting-section');
        if (greeting && greeting.style.display !== 'none') greeting.style.display = 'none';
        if (mainChatContainer) mainChatContainer.classList.add('has-messages');

        // Remove Quick Replies if any exist when user types manually
        removeQuickReplies();

        // Mostra loading imediato enquanto faz routing / inicializa agente
        agentThinkingElement = null;
        routingLoadingId = addLoadingToUI();

        try {
            if (window.lexApi) {
                let routeDecision = { useAgent: USE_AGENT_LOOP, reason: 'feature_flag' };

                // If the agent is actively waiting for an answer, skip the AI Router
                // and force the reply right back into the agent loop.
                if (isAgentWaitingUser) {
                    routeDecision = { useAgent: true, reason: 'agent_waiting_user' };
                    console.log('[Router] Bypassing AI router. Agent is waiting for user reply.');
                } else if (AUTO_AGENT_ROUTING && window.lexApi.shouldUseAgent) {
                    try {
                        routeDecision = await window.lexApi.shouldUseAgent(text);
                        console.log('[Router] Mode:', routeDecision);
                    } catch (routeErr) {
                        console.warn('[Router] shouldUseAgent failed, fallback to feature flag.', routeErr);
                    }
                }

                if (routeDecision.useAgent && window.lexApi.runAgent) {
                    // === AGENT LOOP MODE ===
                    // Events will stream via onAgentEvent
                    console.log('[App] Running Agent Loop for:', text, 'in session:', currentSessionId);

                    const result = await window.lexApi.runAgent(text, null, currentSessionId);

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
                    // Remove routing loader e cria o loading do legacy
                    if (routingLoadingId) { removeMessageFromUI(routingLoadingId); routingLoadingId = null; }
                    const loadingId = addLoadingToUI();

                    const response = await window.lexApi.sendChat(text, {});
                    removeMessageFromUI(loadingId);

                    if (response.error) {
                        addMessageToUI(`Erro: ${response.error}`, 'system');
                    } else if (response.plan) {
                        const aiText = response.plan.intent?.description || "Plano recebido.";
                        addMessageToUI(aiText, 'ai');
                        trackMessage('assistant', aiText);
                        saveCurrentConversation();

                        if (response.plan.steps && response.plan.steps.length > 0) {
                            // Automation Card message
                            const cardId = addAutomationCardToUI();

                            // Auto-Show Widget for now

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
            if (routingLoadingId) { removeMessageFromUI(routingLoadingId); routingLoadingId = null; }
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

// --- Quick Reply Buttons ---
function removeQuickReplies() {
    const existing = document.querySelector('.quick-reply-container');
    if (existing) existing.remove();
}

function addQuickReplies(options) {
    if (!options || options.length === 0) return;
    removeQuickReplies();

    const messageList = document.getElementById('chat-messages');
    if (!messageList) return;

    const container = document.createElement('div');
    container.className = 'quick-reply-container';

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'quick-reply-btn';
        btn.textContent = opt.label || opt;
        btn.addEventListener('click', () => {
            // Remove os botões logo após o clique
            removeQuickReplies();

            // Envia a opção escolhida como se o usuário tivesse digitado
            const textToSent = opt.value || opt.label || opt;
            chatInput.value = textToSent;
            // Dispara o evento 'input' para habilitar o sendBtn (que pode estar disabled)
            chatInput.dispatchEvent(new Event('input'));
            sendBtn.click();
        });
        container.appendChild(btn);
    });

    messageList.appendChild(container);
    messageList.scrollTop = messageList.scrollHeight;
}

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
    'nav-files': document.querySelector('.file-manager-wrapper'),
    'nav-history': null,
    'nav-settings': document.querySelector('.settings-wrapper')
};

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const viewId = item.id;

        // Update Active State
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Hide all switchable views
        Object.values(views).forEach(v => { if (v) v.classList.add('hidden'); });

        // Show target view
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
    // Abre widget do browser independente do estado do thinking element
    if (data && typeof data.skill === 'string' && data.skill.startsWith('pje_')) {
    }

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
    const modeInfo = data?.dados?.mode ? ` (${data.dados.mode})` : '';
    const errorInfo = !isSuccess && data?.erro ? ` - ${String(data.erro)}` : '';

    const mensagem = data?.mensagem ? escapeHtml(String(data.mensagem).slice(0, 120)) : (modeInfo || errorInfo ? escapeHtml(modeInfo + errorInfo) : '');
    logLine.innerHTML = `
        <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="log-message ${colorClass}">${isSuccess ? '✓' : '✗'} ${mensagem || (isSuccess ? 'concluído' : 'falhou')}</span>
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

// ============================================================================
// PJe STATUS PILL
// ============================================================================

async function updatePjeStatus() {
    const pill = document.getElementById('pje-status-pill');
    if (!pill || !window.lexApi?.checkPje) return;
    try {
        const status = await window.lexApi.checkPje();
        const label = pill.querySelector('.pje-label');
        if (status.isPje) {
            pill.className = 'pje-status-pill connected';
            if (label) label.textContent = 'TRT8 conectado';
        } else if (status.connected) {
            pill.className = 'pje-status-pill active';
            if (label) label.textContent = 'Navegador ativo';
        } else {
            pill.className = 'pje-status-pill disconnected';
            if (label) label.textContent = 'PJe desconectado';
        }
    } catch {
        const pill = document.getElementById('pje-status-pill');
        if (pill) pill.className = 'pje-status-pill disconnected';
    }
}

// ============================================================================
// SUGGESTION CARDS + INPUT TOOLBAR + ATTACHMENT
// ============================================================================

let attachedFile = null;

function sendPrompt(text) {
    if (!text || !chatInput || !sendBtn) return;
    chatInput.value = text;
    chatInput.dispatchEvent(new Event('input'));
    sendBtn.click();
}

let _userDisplayName = 'Eder Silva';

function setDynamicGreeting(displayName) {
    const h1 = document.querySelector('.greeting-section h1');
    const subtitle = document.querySelector('.greeting-section .subtitle');

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    const name = displayName || _userDisplayName;

    if (h1) h1.textContent = `${greeting}, ${name}`;

    const subtitles = [
        'Como posso ajudar voce hoje?',
        'Algum processo para consultar?',
        'O que vamos resolver hoje?',
        'Pronto para sua jornada juridica.',
        'Seus processos aguardam.',
        'Em que posso ser util?',
        'Vamos trabalhar?',
    ];
    if (subtitle) {
        subtitle.textContent = subtitles[Math.floor(Math.random() * subtitles.length)];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider / API Key settings
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_KEY_LINKS = {
    anthropic: 'https://console.anthropic.com/settings/keys',
    openai: 'https://platform.openai.com/api-keys',
    openrouter: 'https://openrouter.ai/keys',
    google: 'https://aistudio.google.com/app/apikey',
    groq: 'https://console.groq.com/keys',
};

let _providerPresets = null;

async function loadProviderSettings() {
    try {
        _providerPresets = await window.lexApi.getProviderPresets();
        const current = await window.lexApi.getProvider();

        const providerSelect = document.getElementById('ai-provider');
        if (providerSelect && current?.providerId) {
            providerSelect.value = current.providerId;
        }

        populateModelSelects(current?.providerId || 'anthropic');

        const agentSelect = document.getElementById('ai-agent-model');
        const visionSelect = document.getElementById('ai-vision-model');
        if (agentSelect && current?.agentModel) agentSelect.value = current.agentModel;
        if (visionSelect && current?.visionModel) visionSelect.value = current.visionModel;

        // Status da chave
        if (current?.providerId) {
            const status = await window.lexApi.getApiKeyStatus(current.providerId);
            updateKeyStatusBadge(status);
        }

        // Link de docs
        updateProviderLink(current?.providerId || 'anthropic');
    } catch (_) {}
}

function populateModelSelects(providerId) {
    if (!_providerPresets || !_providerPresets[providerId]) return;
    const preset = _providerPresets[providerId];
    const models = preset.models || [];

    const agentSelect = document.getElementById('ai-agent-model');
    const visionSelect = document.getElementById('ai-vision-model');

    if (agentSelect) {
        agentSelect.innerHTML = models.map(m =>
            `<option value="${m.id}">${m.name}</option>`
        ).join('');
    }
    if (visionSelect) {
        const visionModels = models.filter(m => m.vision);
        visionSelect.innerHTML = visionModels.map(m =>
            `<option value="${m.id}">${m.name}</option>`
        ).join('');
        // Fallback: se não houver vision, mostra todos
        if (visionModels.length === 0) {
            visionSelect.innerHTML = models.map(m =>
                `<option value="${m.id}">${m.name}</option>`
            ).join('');
        }
    }
}

function updateProviderLink(providerId) {
    const link = document.getElementById('ai-provider-key-link');
    if (!link) return;
    const url = PROVIDER_KEY_LINKS[providerId] || '#';
    link.href = url;
    link.textContent = url.replace('https://', '');
}

function updateKeyStatusBadge(status) {
    const el = document.getElementById('ai-key-status');
    if (!el) return;
    if (status?.configured) {
        el.textContent = '✓ ' + (status.preview || 'Configurada');
        el.style.color = '#34d399';
    } else {
        el.textContent = 'Nao configurada';
        el.style.color = '#f87171';
    }
}

async function saveProviderSettings() {
    const providerId = document.getElementById('ai-provider')?.value;
    const apiKey = document.getElementById('ai-api-key')?.value?.trim();
    const agentModel = document.getElementById('ai-agent-model')?.value;
    const visionModel = document.getElementById('ai-vision-model')?.value;

    if (!providerId) return;

    try {
        if (apiKey) {
            await window.lexApi.setApiKey(providerId, apiKey);
            document.getElementById('ai-api-key').value = '';
        }
        if (agentModel && visionModel) {
            await window.lexApi.setProvider({ providerId, agentModel, visionModel });
        }
        const status = await window.lexApi.getApiKeyStatus(providerId);
        updateKeyStatusBadge(status);
    } catch (e) {
        console.error('[Settings] Erro ao salvar provider:', e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Preferences (perfil)
// ─────────────────────────────────────────────────────────────────────────────

async function loadPreferences() {
    try {
        const prefs = await window.lexApi.getPreferences();
        if (!prefs) return;

        if (prefs.displayName) {
            _userDisplayName = prefs.displayName;
            setDynamicGreeting(prefs.displayName);
        }

        const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
        set('pref-display-name', prefs.displayName);
        set('pref-full-name', prefs.fullName);
        set('pref-role', prefs.role);
        set('pref-oab', prefs.oab);
        set('pref-tribunal', prefs.tribunal);
    } catch (_) {}
}

async function saveSettings() {
    const get = id => document.getElementById(id)?.value?.trim() || '';
    const prefs = {
        displayName: get('pref-display-name'),
        fullName: get('pref-full-name'),
        role: get('pref-role'),
        oab: get('pref-oab'),
        tribunal: get('pref-tribunal'),
    };

    if (prefs.displayName) {
        _userDisplayName = prefs.displayName;
        setDynamicGreeting(prefs.displayName);
    }

    // Salva provider junto
    await saveProviderSettings();

    try {
        await window.lexApi.savePreferences(prefs);
        const feedback = document.getElementById('settings-save-feedback');
        if (feedback) {
            feedback.classList.remove('hidden');
            setTimeout(() => feedback.classList.add('hidden'), 2500);
        }
    } catch (_) {}
}

// ── Telegram 24/7 ───────────────────────────────────────────────────────────

async function initTelegramSettings() {
    const tokenInput = document.getElementById('telegram-token');
    const userIdInput = document.getElementById('telegram-userid');
    const btnSave = document.getElementById('btn-telegram-save');
    const btnToggle = document.getElementById('btn-telegram-toggle');
    const statusEl = document.getElementById('telegram-status');
    if (!tokenInput || !userIdInput || !btnSave || !btnToggle || !statusEl) return;

    function setStatus(msg, color = '#888') {
        statusEl.textContent = msg;
        statusEl.style.color = color;
    }

    async function refreshUI() {
        try {
            const cfg = await window.lexApi.telegramGetConfig();
            if (cfg.hasToken) tokenInput.placeholder = cfg.tokenPreview || '(token salvo)';
            if (cfg.userId) userIdInput.value = cfg.userId;

            if (cfg.running) {
                btnToggle.textContent = 'Desativar 24/7';
                btnToggle.style.background = '#dc2626';
                setStatus('Bot ativo — aguardando mensagens no Telegram', '#4ade80');
            } else {
                btnToggle.textContent = 'Ativar 24/7';
                btnToggle.style.background = '';
                setStatus(cfg.hasToken ? 'Bot configurado. Clique em "Ativar 24/7" para ligar.' : 'Configure o token e seu ID para ativar.');
            }
        } catch (e) {
            setStatus('Erro ao carregar config: ' + e.message, '#f87171');
        }
    }

    btnSave.addEventListener('click', async () => {
        const token = tokenInput.value.trim();
        const userId = parseInt(userIdInput.value.trim(), 10);
        if (!token && !userId) { setStatus('Preencha pelo menos um campo.', '#f87171'); return; }
        btnSave.disabled = true;
        try {
            await window.lexApi.telegramSetConfig({ token: token || '', userId: userId || 0 });
            setStatus('Config salva!', '#4ade80');
            tokenInput.value = '';
            await refreshUI();
        } catch (e) {
            setStatus('Erro: ' + e.message, '#f87171');
        } finally {
            btnSave.disabled = false;
        }
    });

    btnToggle.addEventListener('click', async () => {
        btnToggle.disabled = true;
        try {
            const status = await window.lexApi.telegramGetStatus();
            if (status.running) {
                setStatus('Desativando...', '#94a3b8');
                const r = await window.lexApi.telegramDisable();
                if (r.error) { setStatus('Erro: ' + r.error, '#f87171'); return; }
                setStatus('Bot desativado.', '#94a3b8');
            } else {
                setStatus('Ativando...', '#94a3b8');
                const r = await window.lexApi.telegramEnable();
                if (r.error) { setStatus('Erro: ' + r.error, '#f87171'); return; }
                setStatus('Bot ativo! Mande /start para o bot no Telegram.', '#4ade80');
            }
            await refreshUI();
        } catch (e) {
            setStatus('Erro: ' + e.message, '#f87171');
        } finally {
            btnToggle.disabled = false;
        }
    });

    await refreshUI();
}

document.addEventListener('DOMContentLoaded', () => {
    setDynamicGreeting();
    loadPreferences();
    loadProviderSettings();

    // Settings save button
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) btnSaveSettings.addEventListener('click', saveSettings);

    // Provider selector — re-popula modelos e atualiza link
    const providerSelect = document.getElementById('ai-provider');
    if (providerSelect) {
        providerSelect.addEventListener('change', () => {
            const pid = providerSelect.value;
            populateModelSelects(pid);
            updateProviderLink(pid);
            window.lexApi.getApiKeyStatus(pid).then(updateKeyStatusBadge).catch(() => {});
        });
    }

    // Botão testar chave
    const btnTest = document.getElementById('btn-test-api');
    if (btnTest) {
        btnTest.addEventListener('click', async () => {
            const providerId = document.getElementById('ai-provider')?.value;
            const apiKey = document.getElementById('ai-api-key')?.value?.trim();
            const statusEl = document.getElementById('ai-key-status');
            if (!providerId) return;

            // Salva temporariamente para testar
            if (apiKey) await window.lexApi.setApiKey(providerId, apiKey);
            await window.lexApi.setProvider({
                providerId,
                agentModel: document.getElementById('ai-agent-model')?.value || '',
                visionModel: document.getElementById('ai-vision-model')?.value || '',
            });

            if (statusEl) { statusEl.textContent = 'Testando...'; statusEl.style.color = '#94a3b8'; }
            btnTest.disabled = true;

            try {
                const res = await window.lexApi.sendChat('ping — responda apenas "ok"');
                if (res && !res.error) {
                    if (statusEl) { statusEl.textContent = '✓ Funcionando'; statusEl.style.color = '#34d399'; }
                    if (apiKey) document.getElementById('ai-api-key').value = '';
                } else {
                    throw new Error(res?.error || 'Sem resposta');
                }
            } catch (e) {
                if (statusEl) { statusEl.textContent = '✗ ' + (e.message || 'Erro'); statusEl.style.color = '#f87171'; }
            } finally {
                btnTest.disabled = false;
            }
        });
    }

    // Telegram 24/7
    initTelegramSettings();

    // PJe status polling
    updatePjeStatus();
    setInterval(updatePjeStatus, 5000);

    // Pill click -> abrir PJe
    const pill = document.getElementById('pje-status-pill');
    if (pill) {
        pill.addEventListener('click', () => {
            if (pill.classList.contains('connected') || pill.classList.contains('active')) {
                sendPrompt('Abrir o PJe do TRT8');
            }
        });
    }

    // Suggestion cards
    document.querySelectorAll('.suggestion-card').forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.dataset.prompt;
            if (prompt) sendPrompt(prompt);
        });
    });

    // Attachment chip remove
    const btnRemove = document.getElementById('btn-remove-attachment');
    const attachChip = document.getElementById('attachment-chip');
    if (btnRemove) {
        btnRemove.addEventListener('click', () => {
            attachedFile = null;
            if (attachChip) attachChip.classList.add('hidden');
        });
    }

    // Attach button
    const btnAttach = document.getElementById('btn-attach');
    if (btnAttach) {
        btnAttach.addEventListener('click', async () => {
            if (!window.filesApi?.selectFile) return;
            const filePath = await window.filesApi.selectFile();
            if (!filePath) return;
            const result = await window.filesApi.readFile(filePath);
            if (!result?.success) return;
            const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
            attachedFile = { path: filePath, name: fileName, content: result.text || '' };
            const nameEl = document.getElementById('attachment-name');
            if (nameEl) nameEl.textContent = fileName;
            if (attachChip) attachChip.classList.remove('hidden');
        });
    }

    // Inject attachment content into textarea before send
    if (sendBtn) {
        sendBtn.addEventListener('mousedown', () => {
            if (!attachedFile) return;
            const existing = chatInput.value.trim();
            const snippet = attachedFile.content.slice(0, 3000);
            const prefix = `[Arquivo: ${attachedFile.name}]\n${snippet}`;
            chatInput.value = existing ? `${prefix}\n\n${existing}` : prefix;
            chatInput.dispatchEvent(new Event('input'));
            attachedFile = null;
            const chip = document.getElementById('attachment-chip');
            if (chip) chip.classList.add('hidden');
        });
    }

    // Conversations
    renderConvList();
    document.getElementById('btn-new-conv')?.addEventListener('click', newConversation);
});

// ============================================================================
// MULTI-CONVERSATION MANAGEMENT
// ============================================================================

function formatRelativeTime(ts) {
    const d = Date.now() - ts;
    if (d < 60000) return 'agora';
    if (d < 3600000) return Math.floor(d / 60000) + 'm';
    if (d < 86400000) return Math.floor(d / 3600000) + 'h';
    if (d < 604800000) return Math.floor(d / 86400000) + 'd';
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function trackMessage(role, content) {
    convMessages.push({ role, content, timestamp: Date.now() });
    if (role === 'user' && !convTitle) {
        convTitle = content.replace(/\n/g, ' ').slice(0, 50);
    }
}

async function saveCurrentConversation() {
    if (!window.lexApi?.saveConversation || convMessages.length === 0) return;
    await window.lexApi.saveConversation({
        id: convId,
        title: convTitle || 'Nova conversa',
        createdAt: convMessages[0].timestamp,
        updatedAt: Date.now(),
        messages: convMessages
    });
    renderConvList();
}

async function renderConvList() {
    const list = document.getElementById('conv-list');
    if (!list || !window.lexApi?.listConversations) return;
    const convs = await window.lexApi.listConversations();
    if (convs.length === 0) {
        list.innerHTML = '<div style="padding:8px 10px;font-size:11px;color:var(--text-muted)">Nenhuma conversa</div>';
        return;
    }
    list.innerHTML = convs.map(c => `
        <button class="conv-item${c.id === convId ? ' active' : ''}" data-id="${escapeHtml(c.id)}">
            <span class="conv-title">${escapeHtml(c.title || 'Nova conversa')}</span>
            <span class="conv-time">${formatRelativeTime(c.updatedAt)}</span>
            <button class="conv-delete" data-id="${escapeHtml(c.id)}" title="Excluir">×</button>
        </button>
    `).join('');

    list.querySelectorAll('.conv-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.closest('.conv-delete')) return;
            switchConversation(btn.dataset.id);
        });
    });
    list.querySelectorAll('.conv-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            await window.lexApi.deleteConversation(id);
            if (id === convId) newConversation();
            else renderConvList();
        });
    });
}

async function switchConversation(id) {
    if (id === convId) return;
    if (convMessages.length > 0) await saveCurrentConversation();

    const conv = await window.lexApi.loadConversation(id);
    if (!conv) return;

    // Clear UI
    const msgList = document.getElementById('chat-messages');
    if (msgList) msgList.innerHTML = '';
    if (agentThinkingElement) agentThinkingElement = null;
    if (mainChatContainer) mainChatContainer.classList.remove('has-messages');
    const greeting = document.querySelector('.greeting-section');
    if (greeting) greeting.style.display = '';

    // Restore state
    convId = conv.id;
    currentSessionId = conv.id;
    convTitle = conv.title;
    convMessages = conv.messages || [];

    // Seed agent session with history for context
    if (window.lexApi?.seedSession && convMessages.length > 0) {
        await window.lexApi.seedSession(conv.id, convMessages);
    }

    // Render saved messages (suppress tracking/auto-save)
    if (convMessages.length > 0) {
        if (mainChatContainer) mainChatContainer.classList.add('has-messages');
        if (greeting) greeting.style.display = 'none';
        for (const msg of convMessages) {
            addMessageToUI(msg.content, msg.role === 'user' ? 'user' : 'ai');
        }
    }

    renderConvList();
}

async function newConversation() {
    if (convMessages.length > 0) await saveCurrentConversation();

    // Clear UI
    const msgList = document.getElementById('chat-messages');
    if (msgList) msgList.innerHTML = '';
    if (agentThinkingElement) agentThinkingElement = null;
    if (mainChatContainer) mainChatContainer.classList.remove('has-messages');
    const greeting = document.querySelector('.greeting-section');
    if (greeting) greeting.style.display = '';
    setDynamicGreeting();

    // New session
    const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    convId = newId;
    currentSessionId = newId;
    convTitle = null;
    convMessages = [];

    await renderConvList();
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
    }

    messageList.appendChild(msgDiv);
    messageList.scrollTop = messageList.scrollHeight;
    return id;
}
