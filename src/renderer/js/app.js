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
let streamingRawText = '';      // Acumula texto cru durante streaming
let streamingRafId = null;      // requestAnimationFrame para render incremental
let streamingDirty = false;     // Flag: há tokens novos para renderizar
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
                // Limpa bubble anterior se ficou vazia (iteração sem tokens de resposta)
                cleanupEmptyStreamingBubble();
                streamingRawText = '';
                streamingDirty = false;
                // Cria bubble vazia antecipadamente para o streaming
                currentStreamingMsg = createStreamingBubble();
                // Inicia loop de render incremental via rAF
                startStreamingRenderLoop();
                break;

            case 'token':
                // Acumula texto cru e marca como dirty para o render loop
                if (currentStreamingMsg) {
                    streamingRawText += event.token;
                    streamingDirty = true;
                }
                break;

            case 'completed':
                // Para o render loop
                stopStreamingRenderLoop();
                if (currentStreamingMsg && event.resposta) {
                    // Render final com texto completo do servidor
                    finalizeStreamingBubble(currentStreamingMsg, event.resposta);
                    currentStreamingMsg = null;
                    // Salva a resposta na conversa (antes faltava aqui)
                    trackMessage('assistant', event.resposta);
                    saveCurrentConversation();
                } else if (currentStreamingMsg && streamingRawText) {
                    // Fallback: usa texto acumulado localmente
                    finalizeStreamingBubble(currentStreamingMsg, streamingRawText);
                    currentStreamingMsg = null;
                    trackMessage('assistant', streamingRawText);
                    saveCurrentConversation();
                } else {
                    cleanupEmptyStreamingBubble();
                    finalizeAgentResponse(event.resposta);
                }
                streamingRawText = '';
                isAgentWaitingUser = false;
                completeAgentSession();
                break;

            case 'waiting_user':
                cleanupEmptyStreamingBubble();
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
                cleanupEmptyStreamingBubble();
                hideStopBtn();
                showAgentError(event.erro);
                isAgentWaitingUser = false;
                break;

            case 'timeout':
                cleanupEmptyStreamingBubble();
                hideStopBtn();
                showAgentError('Tempo limite atingido');
                isAgentWaitingUser = false;
                break;

            case 'cancelled':
                cleanupEmptyStreamingBubble();
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

// Remove bubble de streaming anterior se ficou vazia (sem tokens)
function cleanupEmptyStreamingBubble() {
    stopStreamingRenderLoop();
    if (!currentStreamingMsg) return;
    // Se não recebeu nenhum token, remove do DOM
    if (!streamingRawText) {
        currentStreamingMsg.remove();
    }
    currentStreamingMsg = null;
    streamingRawText = '';
    streamingDirty = false;
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
    msgDiv.innerHTML = '<div class="message-body"><div class="msg-content markdown-body"><span class="stream-cursor">▋</span></div></div>';
    messageList.appendChild(msgDiv);
    smartScrollToBottom(true);
    return msgDiv;
}

// Render loop incremental: aplica markdown a cada frame enquanto há tokens novos
function startStreamingRenderLoop() {
    stopStreamingRenderLoop();
    let lastRenderLen = 0;

    function tick() {
        streamingRafId = requestAnimationFrame(tick);
        if (!streamingDirty || !currentStreamingMsg) return;
        // Verifica se o node ainda está conectado ao DOM
        if (!currentStreamingMsg.isConnected) return;
        // Só re-renderiza se acumulou pelo menos 20 chars novos (evita thrashing)
        if (streamingRawText.length - lastRenderLen < 20) return;
        streamingDirty = false;
        lastRenderLen = streamingRawText.length;

        const content = currentStreamingMsg.querySelector('.msg-content');
        if (!content) return;

        const html = renderMarkdownSafe(streamingRawText);
        content.innerHTML = html + '<span class="stream-cursor">▋</span>';

        // Auto-scroll só se usuário está perto do fim (não briga com scroll manual)
        const ml = document.getElementById('chat-messages');
        if (ml) {
            const isNearBottom = (ml.scrollHeight - ml.scrollTop - ml.clientHeight) < 120;
            if (isNearBottom) ml.scrollTop = ml.scrollHeight;
        }
    }
    streamingRafId = requestAnimationFrame(tick);
}

function stopStreamingRenderLoop() {
    if (streamingRafId) {
        cancelAnimationFrame(streamingRafId);
        streamingRafId = null;
    }
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

    smartScrollToBottom();
}

// Scroll inteligente: só rola para baixo se o usuário já está perto do final
function smartScrollToBottom(force) {
    const ml = document.getElementById('chat-messages');
    if (!ml) return;
    const isNearBottom = force || (ml.scrollHeight - ml.scrollTop - ml.clientHeight) < 120;
    if (isNearBottom) ml.scrollTop = ml.scrollHeight;
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
    hideStopBtn();
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
    // Fallback: retorna o HTML do marked como está (melhor que destruir com escapeHtml)
    // marked já escapa inputs perigosos por padrão
    return html;
}

function renderMarkdownSafe(markdownText) {
    const source = typeof markdownText === 'string' ? markdownText : String(markdownText || '');
    const html = window.marked ? window.marked.parse(source) : escapeHtml(source);
    return sanitizeHtml(html);
}

// Initialize agent events immediately (preload exposes lexApi before DOM is ready)
setupAgentEvents();


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
        // Captura arquivos anexados (se houver) antes de limpar
        const filesContext = attachedFiles.length > 0 ? [...attachedFiles] : null;
        if (filesContext) {
            attachedFiles = [];
            updateAttachmentChips();
        }

        const text = chatInput.value;
        if (!text.trim() && !filesContext) return;

        // Se tem arquivos, mostra cards bonitos + texto do user separado
        if (filesContext) {
            const userText = text.trim();
            const fileIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:0.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            const cardsHtml = filesContext.map(f =>
                `<div class="file-attachment-card">${fileIcon}<span class="file-attachment-name">${escapeHtml(f.name)}</span></div>`
            ).join('');
            const userMsgHtml = userText ? `<p style="margin-top:10px;margin-bottom:0">${escapeHtml(userText)}</p>` : '';
            addMessageToUI(cardsHtml + userMsgHtml, 'user', true);
            // Envia para IA com contexto dos arquivos (invisível na UI)
            const formatFileContent = (f) => {
                const content = f.content ? f.content.trim() : '';
                if (!content) return `[Documento: ${f.name}]\n(Este documento e uma imagem digitalizada sem texto extraivel. O conteudo nao pode ser lido automaticamente.)`;
                return `[Documento: ${f.name}]\n${content.slice(0, 6000)}`;
            };
            const fileContextStr = filesContext.map(formatFileContent).join('\n\n---\n\n');
            const aiText = `${fileContextStr}\n\n${userText || 'Analise estes documentos.'}`;
            trackMessage('user', aiText);
        } else {
            addMessageToUI(text, 'user');
            trackMessage('user', text);
        }

        const formatFileForAI = (f) => {
            const content = f.content ? f.content.trim() : '';
            if (!content) return `[Documento: ${f.name}]\n(Este documento e uma imagem digitalizada sem texto extraivel. O conteudo nao pode ser lido automaticamente.)`;
            return `[Documento: ${f.name}]\n${content.slice(0, 6000)}`;
        };
        const textForAI = filesContext
            ? filesContext.map(formatFileForAI).join('\n\n---\n\n') + `\n\n${text.trim() || 'Analise estes documentos.'}`
            : text;

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
                        routeDecision = await window.lexApi.shouldUseAgent(textForAI);
                        console.log('[Router] Mode:', routeDecision);
                    } catch (routeErr) {
                        console.warn('[Router] shouldUseAgent failed, fallback to feature flag.', routeErr);
                    }
                }

                if (routeDecision.useAgent && window.lexApi.runAgent) {
                    // === AGENT LOOP MODE ===
                    // Events will stream via onAgentEvent
                    console.log('[App] Running Agent Loop for:', textForAI.slice(0, 100), 'in session:', currentSessionId);

                    const result = await window.lexApi.runAgent(textForAI, null, currentSessionId);

                    if (!result.success) {
                        if (result.error === 'trial_expired') {
                            if (routingLoadingId) { removeMessageFromUI(routingLoadingId); routingLoadingId = null; }
                            hideStopBtn();
                            showPaywall(); return;
                        } else if (result.error === 'not_authenticated') {
                            if (routingLoadingId) { removeMessageFromUI(routingLoadingId); routingLoadingId = null; }
                            hideStopBtn();
                            showAuthOverlay(); return;
                        }
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

                    const response = await window.lexApi.sendChat(textForAI, {});
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

    options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.className = 'quick-reply-btn';
        btn.textContent = opt.label || opt;
        btn.dataset.value = opt.value || opt.label || opt;
        container.appendChild(btn);
    });

    // Event delegation: um listener no container em vez de um por botão
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.quick-reply-btn');
        if (!btn) return;
        const textToSend = btn.dataset.value;
        removeQuickReplies();
        chatInput.value = textToSend;
        chatInput.dispatchEvent(new Event('input'));
        sendBtn.click();
    });

    messageList.appendChild(container);
    smartScrollToBottom(true);
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
                <button class="open-pje-btn" style="background: var(--success-color); border: none; padding: 6px 12px; border-radius: 4px; color: #000; font-weight: 500; cursor: pointer;">Ver Tela</button>
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

// ============================================================================
// AUTH / LICENCA
// ============================================================================

const ASAAS_PAYMENT_LINK = 'https://www.asaas.com/c/SEU_LINK_AQUI';

function showAuthOverlay() {
    const el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'flex';
    const paywall = document.getElementById('paywall-overlay');
    if (paywall) paywall.style.display = 'none';
}

function hideAuthOverlay() {
    const el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'none';
}

function showPaywall() {
    const el = document.getElementById('paywall-overlay');
    if (el) el.style.display = 'flex';
    const auth = document.getElementById('auth-overlay');
    if (auth) auth.style.display = 'none';
}

function hidePaywall() {
    const el = document.getElementById('paywall-overlay');
    if (el) el.style.display = 'none';
}

function showTrialBadge(daysLeft) {
    let badge = document.getElementById('trial-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'trial-badge';
        document.body.appendChild(badge);
    }
    badge.textContent = daysLeft <= 1 ? 'Ultimo dia de trial' : `Trial: ${daysLeft} dias restantes`;
}

function removeTrialBadge() {
    const badge = document.getElementById('trial-badge');
    if (badge) badge.remove();
}

async function initAuth() {
    try {
        const license = await window.authApi.checkLicense();
        if (!license) { showAuthOverlay(); return; }

        if (license.status === 'not_authenticated') {
            showAuthOverlay(); return;
        }
        if (license.status === 'trial_expired') {
            showPaywall(); return;
        }
        // trial_active ou pro
        hideAuthOverlay(); hidePaywall();
        if (license.status === 'trial_active') showTrialBadge(license.daysLeft);
        else removeTrialBadge();
        loadProfileCard();
    } catch {
        showAuthOverlay();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initAuth();

    if (window.updaterApi) {
        window.updaterApi.onUpdateDownloaded(() => {
            const banner = document.createElement('div');
            banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:var(--bg-tertiary);border-top:1px solid var(--accent-color);padding:10px 20px;display:flex;align-items:center;justify-content:space-between;z-index:9998;font-size:13px;color:var(--text-primary)';
            banner.innerHTML = `<span>Nova versao do LEX disponivel.</span><button id="btn-install-update" style="background:var(--accent-color);color:var(--text-primary);border:none;border-radius:6px;padding:6px 14px;font-weight:700;cursor:pointer">Instalar e reiniciar</button>`;
            document.body.appendChild(banner);
            document.getElementById('btn-install-update')?.addEventListener('click', () => window.updaterApi.installNow());
        });
    }

    const authError = document.getElementById('auth-error');
    const authGoogleBtn = document.getElementById('auth-google-btn');
    if (authGoogleBtn) {
        authGoogleBtn.addEventListener('click', async () => {
            authGoogleBtn.disabled = true;
            authGoogleBtn.textContent = 'Aguardando login...';
            if (authError) authError.style.display = 'none';

            const result = await window.authApi.signInWithGoogle().catch(e => ({ ok: false, error: e.message }));

            authGoogleBtn.disabled = false;
            authGoogleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" style="margin-right:8px;flex-shrink:0"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Entrar com Google';

            if (!result.ok) {
                if (authError) { authError.textContent = result.error || 'Erro ao autenticar com Google'; authError.style.display = 'block'; }
                return;
            }

            hideAuthOverlay();
            await initAuth();
        });
    }

    const buyBtn = document.getElementById('paywall-buy-btn');
    if (buyBtn) { buyBtn.href = ASAAS_PAYMENT_LINK; buyBtn.target = '_blank'; buyBtn.rel = 'noopener'; }

    const verifyBtn = document.getElementById('paywall-verify-btn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
            verifyBtn.disabled = true; verifyBtn.textContent = 'Verificando...';
            const license = await window.authApi.refreshLicense().catch(() => null);
            verifyBtn.disabled = false; verifyBtn.textContent = 'Ja paguei, verificar acesso';
            if (license?.status === 'pro' || license?.status === 'trial_active') {
                hidePaywall();
                if (license.status === 'trial_active') showTrialBadge(license.daysLeft);
                else removeTrialBadge();
            }
        });
    }

    const logoutBtn = document.getElementById('paywall-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await window.authApi.signOut().catch(() => {});
            showAuthOverlay();
        });
    }
});

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
    'nav-lotes': document.querySelector('.lotes-wrapper'),
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

        // Refresh plugins e perfil ao abrir settings
        if (viewId === 'nav-settings') {
            initPluginsUI();
            loadProfileCard();
        }

        // Init lotes view
        if (viewId === 'nav-lotes') {
            if (typeof initLotesView === 'function') initLotesView();
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

function addMessageToUI(text, type, isRawHtml) {
    const messageList = document.getElementById('chat-messages');
    const greeting = document.querySelector('.greeting-section');
    if (!messageList) return null;

    if (greeting && greeting.style.display !== 'none') greeting.style.display = 'none';
    if (mainChatContainer) mainChatContainer.classList.add('has-messages');

    const rawText = typeof text === 'string' ? text : String(text || '');

    let messageHtml = '';
    if (isRawHtml) {
        // Conteúdo HTML direto (ex: card de arquivo)
        messageHtml = `<div class="msg-content markdown-body">${rawText}</div>`;
    } else {
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

        if (thinkingContent) {
            messageHtml += `<div class="thinking-container"><details class="thinking-accordion"><summary class="thinking-summary">Processo de pensamento</summary><div class="thinking-content">${safeThinkingContent}</div></details></div>`;
        }
        messageHtml += `<div class="msg-content markdown-body">${htmlContent}</div>`;
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.id = type === 'loading' ? `msg-${Date.now()}` : '';
    msgDiv.innerHTML = `<div class="message-body">${messageHtml}</div>`;

    messageList.appendChild(msgDiv);
    // Mensagem do usuário: força scroll; IA/sistema: smart scroll
    smartScrollToBottom(type === 'user' || type === 'loading');
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

let attachedFiles = [];

/**
 * Global function for file-manager.js to attach a file to the chat input.
 * Supports multiple files — each call adds to the list.
 */
window.attachFileToChat = function(file) {
    if (!file || !file.name) return;
    // Evita duplicata pelo path
    if (attachedFiles.some(f => f.path === file.path)) return;
    attachedFiles.push({ path: file.path, name: file.name, content: file.content || '' });
    updateAttachmentChips();
};

function updateAttachmentChips() {
    const container = document.getElementById('attachment-chips');
    if (!container) return;
    container.innerHTML = '';
    if (attachedFiles.length === 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    attachedFiles.forEach((file, idx) => {
        const chip = document.createElement('div');
        chip.className = 'attachment-chip-item';
        chip.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>${escapeHtml(file.name)}</span><button class="chip-remove" data-idx="${idx}">&times;</button>`;
        chip.querySelector('.chip-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            attachedFiles.splice(idx, 1);
            updateAttachmentChips();
        });
        container.appendChild(chip);
    });
}

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
// Privacy Settings
// ─────────────────────────────────────────────────────────────────────────────

const PRIVACY_LEVEL_HINTS = {
    '1': 'Todos os dados sensiveis (CPF, nomes, valores, CNPJ, OAB, emails) sao mascarados antes de sair da maquina. A IA so ve tokens como [PARTE_AUTORA_1], [CPF_1].',
    '2': 'Nomes de partes sao mantidos para respostas mais naturais. CPFs, CNPJs, valores e contatos sao mascarados.',
    '3': 'Nenhum dado e anonimizado. Todos os dados reais sao enviados para o provedor de IA. Nao recomendado para dados de clientes.',
    '0': 'Nenhum dado sai da sua maquina. Requer Ollama instalado localmente. Qualidade das respostas reduzida.'
};

async function initPrivacySettings() {
    const select = document.getElementById('privacy-level');
    const hint = document.getElementById('privacy-level-hint');
    const btnSave = document.getElementById('btn-privacy-save');
    const btnRevoke = document.getElementById('btn-privacy-revoke');
    const feedback = document.getElementById('privacy-feedback');
    const statsBox = document.getElementById('privacy-stats-box');

    if (!select || !window.lexApi?.privacyGetConfig) return;

    // Carrega config atual
    try {
        const config = await window.lexApi.privacyGetConfig();
        select.value = String(config.defaultLevel);
        if (hint) hint.textContent = PRIVACY_LEVEL_HINTS[select.value] || '';
    } catch { /* ignore */ }

    // Atualiza hint ao mudar nivel
    select.addEventListener('change', () => {
        if (hint) hint.textContent = PRIVACY_LEVEL_HINTS[select.value] || '';
    });

    // Salvar nivel
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            try {
                await window.lexApi.privacySetLevel(Number(select.value));
                if (feedback) { feedback.style.display = 'block'; setTimeout(() => { feedback.style.display = 'none'; }, 2000); }
            } catch (e) {
                console.error('Erro ao salvar nivel de privacidade:', e);
            }
        });
    }

    // Revogar tudo
    if (btnRevoke) {
        btnRevoke.addEventListener('click', async () => {
            if (!confirm('Revogar todo o consentimento? O nivel voltara para "Anonimizado completo" e o onboarding sera exibido novamente.')) return;
            try {
                await window.lexApi.privacyRevokeAll();
                select.value = '1';
                if (hint) hint.textContent = PRIVACY_LEVEL_HINTS['1'];
                if (feedback) { feedback.textContent = 'Consentimento revogado.'; feedback.style.display = 'block'; setTimeout(() => { feedback.style.display = 'none'; feedback.textContent = 'Salvo!'; }, 3000); }
            } catch (e) {
                console.error('Erro ao revogar consentimento:', e);
            }
        });
    }

    // Carrega audit stats
    loadPrivacyAuditStats(statsBox);
}

async function loadPrivacyAuditStats(statsBox) {
    if (!statsBox || !window.lexApi?.privacyGetAuditSummary) return;
    try {
        const summary = await window.lexApi.privacyGetAuditSummary(7);
        if (summary.totalCalls === 0) {
            statsBox.style.display = 'none';
            return;
        }
        statsBox.style.display = 'block';
        const el = document.getElementById('privacy-audit-stats');
        if (!el) return;

        const providers = Object.entries(summary.byProvider)
            .map(([p, c]) => `<span style="background:var(--bg-tertiary);padding:2px 8px;border-radius:4px;margin:2px;font-size:11px">${p} <b>${c}x</b></span>`)
            .join('') || '<span style="color:var(--text-muted)">nenhum</span>';

        el.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                <div style="background:rgba(var(--accent-rgb),0.1);border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:18px;font-weight:700;color:var(--accent-color)">${summary.totalCalls}</div>
                    <div style="font-size:10px;color:var(--text-muted)">Chamadas LLM</div>
                </div>
                <div style="background:rgba(121,170,138,0.1);border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:18px;font-weight:700;color:var(--success-color)">${summary.totalPIIMasked}</div>
                    <div style="font-size:10px;color:var(--text-muted)">PII mascaradas</div>
                </div>
            </div>
            <div>Providers: ${providers}</div>
        `;
    } catch { statsBox.style.display = 'none'; }
}

async function initPrivacyOnboarding() {
    if (!window.lexApi?.privacyIsOnboardingCompleted) return;
    try {
        const done = await window.lexApi.privacyIsOnboardingCompleted();
        if (done) return;
    } catch { return; }

    const overlay = document.getElementById('privacy-onboarding-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    // Selecao de opcao
    const options = overlay.querySelectorAll('.lex-privacy-option');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            const radio = opt.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
    });

    // Aceitar
    const btnAccept = document.getElementById('privacy-onboarding-accept');
    if (btnAccept) {
        btnAccept.addEventListener('click', async () => {
            const selected = overlay.querySelector('input[name="onb-privacy"]:checked');
            const level = selected ? Number(selected.value) : 1;
            try {
                await window.lexApi.privacyCompleteOnboarding(level);
            } catch { /* ignore */ }
            overlay.style.display = 'none';
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics Dashboard
// ─────────────────────────────────────────────────────────────────────────────

async function loadAnalyticsDashboard() {
    const el = document.getElementById('analytics-dashboard');
    if (!el || !window.lexApi?.getAnalyticsSummary) return;
    try {
        const s = await window.lexApi.getAnalyticsSummary();
        if (!s) { el.textContent = 'Sem dados ainda.'; return; }

        const topSkillsHtml = s.topSkills.length > 0
            ? s.topSkills.slice(0, 5).map(sk =>
                `<span style="display:inline-block;background:var(--bg-tertiary);padding:2px 8px;border-radius:4px;margin:2px;font-size:12px">${sk.skill} <b>${sk.count}x</b></span>`
            ).join('')
            : '<span style="color:var(--text-muted)">Nenhuma skill usada ainda</span>';

        const topModelsHtml = s.topModels.length > 0
            ? s.topModels.slice(0, 3).map(m =>
                `<span style="display:inline-block;background:var(--bg-tertiary);padding:2px 8px;border-radius:4px;margin:2px;font-size:12px">${m.model.split('/').pop()} <b>${m.count}x</b></span>`
            ).join('')
            : '<span style="color:var(--text-muted)">Nenhum modelo usado ainda</span>';

        const errCount = Object.values(s.todayErrors).reduce((a, b) => a + b, 0);

        el.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:var(--accent-color)">${s.totalMessages}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Mensagens (total)</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:var(--success-color)">${s.totalSessions}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Sessoes (total)</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:var(--warning-color)">${s.daysActive}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Dias ativos</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:var(--text-secondary)">${s.totalConversations}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Conversas</div>
                </div>
            </div>

            <div style="margin-bottom:10px">
                <b style="color:var(--text-secondary);font-size:12px">Hoje</b><br>
                <span>${s.todayMessages} msg</span> &middot;
                <span>${s.todaySessions} sessoes</span> &middot;
                <span>${s.todayActiveMinutes} min ativo</span>
                ${errCount > 0 ? ` &middot; <span style="color:var(--danger-color)">${errCount} erros</span>` : ''}
            </div>

            <div style="margin-bottom:10px">
                <b style="color:var(--text-secondary);font-size:12px">Sessao atual</b><br>
                <span>${s.currentSessionMinutes} min</span> &middot;
                <span>${s.currentSessionMessages} mensagens</span>
            </div>

            <div style="margin-bottom:10px">
                <b style="color:var(--text-secondary);font-size:12px">Skills mais usadas</b><br>
                ${topSkillsHtml}
            </div>

            <div style="margin-bottom:10px">
                <b style="color:var(--text-secondary);font-size:12px">Modelos mais usados</b><br>
                ${topModelsHtml}
            </div>

            <div>
                <b style="color:var(--text-secondary);font-size:12px">Provider favorito:</b>
                <span style="color:var(--accent-color)">${s.mostActiveProvider}</span>
                ${s.firstSeen ? ` &middot; <span style="color:var(--text-muted)">Desde ${s.firstSeen}</span>` : ''}
            </div>
        `;
    } catch (e) {
        el.textContent = 'Erro ao carregar estatisticas.';
        console.error('[Analytics]', e);
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
    ollama: '',
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

        // Link de docs + placeholder
        updateProviderLink(current?.providerId || 'anthropic');
        updateApiKeyPlaceholder(current?.providerId || 'anthropic');
    } catch (_) {}
}

function populateModelSelects(providerId) {
    if (!_providerPresets || !_providerPresets[providerId]) return;
    const preset = _providerPresets[providerId];
    const models = preset.models || [];

    const agentSelect = document.getElementById('ai-agent-model');
    const visionSelect = document.getElementById('ai-vision-model');

    // Separa modelos gratuitos dos pagos (OpenRouter usa ":free" no id)
    const freeModels = models.filter(m => m.id.includes(':free'));
    const paidModels = models.filter(m => !m.id.includes(':free'));
    const hasGroups = freeModels.length > 0 && paidModels.length > 0;

    function buildOptions(modelList) {
        if (!hasGroups) {
            return modelList.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
        }
        let html = '';
        if (freeModels.length > 0) {
            html += '<optgroup label="Gratuitos">';
            html += freeModels.filter(m => modelList.includes(m)).map(m =>
                `<option value="${m.id}">${m.name}</option>`
            ).join('');
            html += '</optgroup>';
        }
        if (paidModels.length > 0) {
            html += '<optgroup label="Pagos">';
            html += paidModels.filter(m => modelList.includes(m)).map(m =>
                `<option value="${m.id}">${m.name}</option>`
            ).join('');
            html += '</optgroup>';
        }
        return html;
    }

    if (agentSelect) {
        agentSelect.innerHTML = buildOptions(models);
    }
    if (visionSelect) {
        const visionModels = models.filter(m => m.vision);
        visionSelect.innerHTML = buildOptions(visionModels.length > 0 ? visionModels : models);
    }
}

function updateProviderLink(providerId) {
    const link = document.getElementById('ai-provider-key-link');
    if (!link) return;
    const url = PROVIDER_KEY_LINKS[providerId] || '#';
    link.href = url;
    link.textContent = url.replace('https://', '');

    // Mostra dica especial para OpenRouter (grátis)
    const defaultHint = document.getElementById('ai-provider-hint');
    const freeHint = document.getElementById('ai-provider-free-hint');
    if (defaultHint && freeHint) {
        if (providerId === 'openrouter') {
            defaultHint.style.display = 'none';
            freeHint.style.display = 'block';
        } else if (providerId === 'ollama') {
            defaultHint.style.display = 'none';
            freeHint.style.display = 'none';
        } else {
            defaultHint.style.display = 'block';
            freeHint.style.display = 'none';
        }
    }

    // Esconde campo de API key para Ollama (não precisa de chave)
    const apiKeyField = document.getElementById('ai-api-key')?.closest('.settings-field');
    if (apiKeyField) apiKeyField.style.display = providerId === 'ollama' ? 'none' : '';

    // Mostra/esconde seção Ollama
    const ollamaSection = document.getElementById('ollama-section');
    if (ollamaSection) ollamaSection.style.display = providerId === 'ollama' ? '' : 'none';
    if (providerId === 'ollama') refreshOllamaStatus();
}

function updateApiKeyPlaceholder(providerId) {
    const input = document.getElementById('ai-api-key');
    if (!input) return;
    if (providerId === 'openrouter') {
        input.placeholder = 'Chave gratuita — crie em openrouter.ai/keys';
    } else {
        input.placeholder = 'Cole sua chave aqui';
    }
}

function updateKeyStatusBadge(status) {
    const el = document.getElementById('ai-key-status');
    if (!el) return;
    if (status?.configured) {
        el.textContent = '✓ ' + (status.preview || 'Configurada');
        el.style.color = 'var(--success-color)';
    } else {
        el.textContent = 'Nao configurada';
        el.style.color = 'var(--danger-color)';
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

// ── Ollama (Modelo Local) ────────────────────────────────────────────────────

let _ollamaPulling = false;

async function refreshOllamaStatus() {
    if (!window.lexApi?.ollamaStatus) return;
    const dot = document.getElementById('ollama-status-dot');
    const text = document.getElementById('ollama-status-text');
    const notFound = document.getElementById('ollama-not-found');
    const modelsArea = document.getElementById('ollama-models-area');

    try {
        const status = await window.lexApi.ollamaStatus();
        console.log('[Ollama] Status:', status);
        if (status?.running) {
            if (dot) dot.style.background = 'var(--success-color)';
            if (text) text.textContent = `Ollama rodando${status.version ? ' (v' + status.version + ')' : ''} — ${status.models.length} modelo(s) instalado(s)`;
            if (notFound) notFound.style.display = 'none';
            if (modelsArea) modelsArea.style.display = '';
            await renderOllamaModels();
        } else {
            if (dot) dot.style.background = 'var(--danger-color)';
            if (text) text.textContent = 'Ollama nao detectado';
            if (notFound) notFound.style.display = '';
            if (modelsArea) modelsArea.style.display = 'none';
        }
    } catch (e) {
        console.error('[Ollama] Erro ao verificar:', e);
        if (dot) dot.style.background = 'var(--danger-color)';
        if (text) text.textContent = 'Ollama nao detectado — verifique se esta instalado e rodando';
        if (notFound) notFound.style.display = '';
        if (modelsArea) modelsArea.style.display = 'none';
    }
}

async function renderOllamaModels() {
    const list = document.getElementById('ollama-models-list');
    if (!list || !window.lexApi?.ollamaRecommended) return;

    try {
        const models = await window.lexApi.ollamaRecommended();
        list.innerHTML = models.map(m => `
            <div class="ollama-model-card" data-model="${m.id}" style="
                background:var(--bg-secondary);border:1px solid ${m.installed ? 'var(--success-color)' : 'var(--border-color)'};border-radius:10px;
                padding:10px 14px;display:flex;align-items:center;gap:12px;
            ">
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:600;color:${m.installed ? 'var(--success-color)' : 'var(--text-primary)'}">${m.name}${m.vision ? ' <span style="font-size:10px;background:var(--accent-strong);color:var(--text-primary);padding:1px 6px;border-radius:4px;margin-left:4px">vision</span>' : ''}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${m.description}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${m.size} · RAM minima: ${m.minRam}</div>
                </div>
                <div style="flex-shrink:0">
                    ${m.installed
                        ? `<button class="ollama-btn-remove" data-model="${m.id}" style="
                            background:none;border:1px solid var(--border-strong);border-radius:6px;color:var(--danger-color);
                            font-size:11px;padding:4px 10px;cursor:pointer">Remover</button>`
                        : `<button class="ollama-btn-install" data-model="${m.id}" style="
                            background:var(--accent-strong);border:1px solid var(--accent-color);border-radius:6px;color:var(--text-primary);
                            font-size:11px;padding:4px 10px;cursor:pointer">Baixar</button>`
                    }
                </div>
            </div>
        `).join('');

        // Bind install buttons
        list.querySelectorAll('.ollama-btn-install').forEach(btn => {
            btn.addEventListener('click', () => ollamaPullModel(btn.dataset.model));
        });

        // Bind remove buttons
        list.querySelectorAll('.ollama-btn-remove').forEach(btn => {
            btn.addEventListener('click', () => ollamaRemoveModel(btn.dataset.model));
        });
    } catch (e) {
        list.innerHTML = '<div style="font-size:12px;color:var(--danger-color)">Erro ao carregar modelos</div>';
    }
}

async function ollamaPullModel(modelId) {
    if (_ollamaPulling) return;
    _ollamaPulling = true;

    const pullBar = document.getElementById('ollama-pull-bar');
    const pullLabel = document.getElementById('ollama-pull-label');
    const pullPercent = document.getElementById('ollama-pull-percent');
    const pullFill = document.getElementById('ollama-pull-fill');
    const pullStatus = document.getElementById('ollama-pull-status');

    if (pullBar) pullBar.style.display = '';
    if (pullLabel) pullLabel.textContent = `Baixando ${modelId}...`;
    if (pullPercent) pullPercent.textContent = '0%';
    if (pullFill) pullFill.style.width = '0%';
    if (pullStatus) pullStatus.textContent = 'Iniciando download...';

    // Disable install buttons during download
    document.querySelectorAll('.ollama-btn-install').forEach(b => b.disabled = true);

    // Listen for progress
    if (window.lexApi.onOllamaPullProgress) {
        window.lexApi.onOllamaPullProgress((data) => {
            const pct = data.percent || 0;
            if (pullPercent) pullPercent.textContent = pct + '%';
            if (pullFill) pullFill.style.width = pct + '%';
            if (pullStatus) pullStatus.textContent = data.status || '';
        });
    }

    if (window.lexApi.onOllamaPullComplete) {
        window.lexApi.onOllamaPullComplete(() => {
            if (pullLabel) pullLabel.textContent = 'Download concluido!';
            if (pullPercent) pullPercent.textContent = '100%';
            if (pullFill) pullFill.style.width = '100%';
            if (pullStatus) pullStatus.textContent = '';
            _ollamaPulling = false;
            cleanupPullListeners();
            setTimeout(() => {
                if (pullBar) pullBar.style.display = 'none';
                refreshOllamaStatus();
            }, 2000);
        });
    }

    if (window.lexApi.onOllamaPullError) {
        window.lexApi.onOllamaPullError((data) => {
            if (pullLabel) pullLabel.textContent = 'Erro no download';
            if (pullStatus) pullStatus.textContent = data.error || 'Erro desconhecido';
            if (pullPercent) pullPercent.textContent = '';
            _ollamaPulling = false;
            cleanupPullListeners();
            document.querySelectorAll('.ollama-btn-install').forEach(b => b.disabled = false);
        });
    }

    try {
        await window.lexApi.ollamaPull(modelId);
    } catch (e) {
        if (pullLabel) pullLabel.textContent = 'Erro';
        if (pullStatus) pullStatus.textContent = e.message || 'Falha ao iniciar download';
        _ollamaPulling = false;
        cleanupPullListeners();
    }
}

function cleanupPullListeners() {
    if (window.lexApi?.offOllamaPullEvents) window.lexApi.offOllamaPullEvents();
    document.querySelectorAll('.ollama-btn-install').forEach(b => b.disabled = false);
}

async function ollamaRemoveModel(modelId) {
    if (!window.lexApi?.ollamaDelete) return;
    if (!confirm(`Remover o modelo "${modelId}"? O download precisara ser refeito.`)) return;
    try {
        await window.lexApi.ollamaDelete(modelId);
        await refreshOllamaStatus();
    } catch (e) {
        console.error('[Ollama] Erro ao remover modelo:', e);
    }
}

let _ollamaPollingInterval = null;

function initOllamaSettings() {
    // Initial check — show section if provider is already ollama
    const providerSelect = document.getElementById('ai-provider');
    if (providerSelect?.value === 'ollama') {
        const ollamaSection = document.getElementById('ollama-section');
        if (ollamaSection) ollamaSection.style.display = '';
        const apiKeyField = document.getElementById('ai-api-key')?.closest('.settings-field');
        if (apiKeyField) apiKeyField.style.display = 'none';
        refreshOllamaStatus();
    }

    // Botão instalar Ollama
    const btnInstall = document.getElementById('btn-ollama-install');
    if (btnInstall) {
        btnInstall.addEventListener('click', () => startOllamaInstall());
    }
}

async function startOllamaInstall() {
    if (!window.lexApi?.ollamaDownloadInstaller) return;

    const btn = document.getElementById('btn-ollama-install');
    const bar = document.getElementById('ollama-install-bar');
    const label = document.getElementById('ollama-install-label');
    const percent = document.getElementById('ollama-install-percent');
    const fill = document.getElementById('ollama-install-fill');
    const status = document.getElementById('ollama-install-status');

    if (btn) { btn.disabled = true; btn.textContent = 'Baixando...'; }
    if (bar) bar.style.display = '';

    // Listener de progresso
    if (window.lexApi.onOllamaInstallProgress) {
        window.lexApi.onOllamaInstallProgress((data) => {
            if (data.status === 'downloading') {
                if (label) label.textContent = 'Baixando installer...';
                if (percent) percent.textContent = (data.percent || 0) + '%';
                if (fill) fill.style.width = (data.percent || 0) + '%';
            } else if (data.status === 'opening') {
                if (label) label.textContent = 'Abrindo installer...';
                if (percent) percent.textContent = '100%';
                if (fill) fill.style.width = '100%';
                if (status) status.textContent = 'Conclua a instalacao na janela que abriu. A LEX vai detectar automaticamente.';
            } else if (data.status === 'error') {
                if (label) label.textContent = 'Erro no download';
                if (status) status.textContent = data.error || 'Tente novamente';
                if (btn) { btn.disabled = false; btn.textContent = 'Tentar novamente'; }
            }
        });
    }

    try {
        const result = await window.lexApi.ollamaDownloadInstaller();
        if (window.lexApi.offOllamaInstallProgress) window.lexApi.offOllamaInstallProgress();

        if (result?.success) {
            if (btn) btn.textContent = 'Aguardando instalacao...';
            if (status) status.textContent = 'Conclua a instalacao. A LEX detecta automaticamente quando o Ollama iniciar.';
            // Inicia polling para detectar quando Ollama começa a rodar
            startOllamaDetectionPolling();
        } else {
            if (btn) { btn.disabled = false; btn.textContent = 'Tentar novamente'; }
            if (status) status.textContent = result?.error || 'Erro ao baixar installer';
        }
    } catch (e) {
        if (window.lexApi.offOllamaInstallProgress) window.lexApi.offOllamaInstallProgress();
        if (btn) { btn.disabled = false; btn.textContent = 'Tentar novamente'; }
        if (status) status.textContent = e.message || 'Erro inesperado';
    }
}

function startOllamaDetectionPolling() {
    if (_ollamaPollingInterval) clearInterval(_ollamaPollingInterval);

    _ollamaPollingInterval = setInterval(async () => {
        if (!window.lexApi?.ollamaIsRunning) return;
        try {
            const running = await window.lexApi.ollamaIsRunning();
            if (running) {
                clearInterval(_ollamaPollingInterval);
                _ollamaPollingInterval = null;
                // Ollama detectado! Atualiza a UI
                await refreshOllamaStatus();
            }
        } catch { /* ignora, tenta de novo */ }
    }, 3000); // checa a cada 3s

    // Para de tentar após 5 minutos
    setTimeout(() => {
        if (_ollamaPollingInterval) {
            clearInterval(_ollamaPollingInterval);
            _ollamaPollingInterval = null;
        }
    }, 5 * 60 * 1000);
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
                setStatus('Bot ativo — aguardando mensagens no Telegram', 'var(--success-color)');
            } else {
                btnToggle.textContent = 'Ativar 24/7';
                btnToggle.style.background = '';
                setStatus(cfg.hasToken ? 'Bot configurado. Clique em "Ativar 24/7" para ligar.' : 'Configure o token e seu ID para ativar.');
            }
        } catch (e) {
            setStatus('Erro ao carregar config: ' + e.message, 'var(--danger-color)');
        }
    }

    btnSave.addEventListener('click', async () => {
        const token = tokenInput.value.trim();
        const userId = parseInt(userIdInput.value.trim(), 10);
        if (!token && !userId) { setStatus('Preencha pelo menos um campo.', 'var(--danger-color)'); return; }
        btnSave.disabled = true;
        try {
            await window.lexApi.telegramSetConfig({ token: token || '', userId: userId || 0 });
            setStatus('Config salva!', 'var(--success-color)');
            tokenInput.value = '';
            await refreshUI();
        } catch (e) {
            setStatus('Erro: ' + e.message, 'var(--danger-color)');
        } finally {
            btnSave.disabled = false;
        }
    });

    btnToggle.addEventListener('click', async () => {
        btnToggle.disabled = true;
        try {
            const status = await window.lexApi.telegramGetStatus();
            if (status.running) {
                setStatus('Desativando...', 'var(--text-secondary)');
                const r = await window.lexApi.telegramDisable();
                if (r.error) { setStatus('Erro: ' + r.error, 'var(--danger-color)'); return; }
                setStatus('Bot desativado.', 'var(--text-secondary)');
            } else {
                setStatus('Ativando...', 'var(--text-secondary)');
                const r = await window.lexApi.telegramEnable();
                if (r.error) { setStatus('Erro: ' + r.error, 'var(--danger-color)'); return; }
                setStatus('Bot ativo! Mande /start para o bot no Telegram.', 'var(--success-color)');
            }
            await refreshUI();
        } catch (e) {
            setStatus('Erro: ' + e.message, 'var(--danger-color)');
        } finally {
            btnToggle.disabled = false;
        }
    });

    await refreshUI();
}

// ─────────────────────────────────────────────────────────────────────────────
// RAG — Indexação de documentos do workspace
// ─────────────────────────────────────────────────────────────────────────────

async function loadRagStats() {
    const statsEl = document.getElementById('rag-stats');
    if (!statsEl || !window.lexApi?.ragStats) return;
    try {
        const stats = await window.lexApi.ragStats();
        if (stats.chunks > 0) {
            statsEl.textContent = `Indice atual: ${stats.chunks} trechos de ${stats.arquivos} arquivo(s)`;
            statsEl.style.color = 'var(--success-color)';
        } else {
            statsEl.textContent = 'Nenhum documento indexado ainda.';
            statsEl.style.color = 'var(--text-secondary)';
        }
    } catch {
        statsEl.textContent = '';
    }
}

function initRagSettings() {
    loadRagStats();

    const btn = document.getElementById('btn-rag-index');
    const feedback = document.getElementById('rag-feedback');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        if (!window.lexApi?.ragIndexWorkspace) return;
        btn.disabled = true;
        btn.textContent = 'Indexando...';
        if (feedback) { feedback.textContent = 'Lendo e indexando documentos...'; feedback.style.color = 'var(--text-secondary)'; }

        try {
            const res = await window.lexApi.ragIndexWorkspace();
            if (res.success) {
                if (feedback) {
                    feedback.textContent = `Concluido: ${res.chunks} trechos de ${res.arquivos} arquivo(s) indexados.`;
                    feedback.style.color = 'var(--success-color)';
                }
                loadRagStats();
            } else {
                if (feedback) { feedback.textContent = res.error || 'Erro ao indexar.'; feedback.style.color = 'var(--danger-color)'; }
            }
        } catch (e) {
            if (feedback) { feedback.textContent = 'Erro: ' + (e.message || 'falha desconhecida'); feedback.style.color = 'var(--danger-color)'; }
        } finally {
            btn.disabled = false;
            btn.textContent = 'Indexar documentos do workspace';
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Legislacao Brasileira — download e indexacao RAG
// ─────────────────────────────────────────────────────────────────────────────

async function loadLegislacaoStats() {
    const statsEl = document.getElementById('leg-stats');
    if (!statsEl || !window.lexApi?.ragLegislacaoStats) return;
    try {
        const stats = await window.lexApi.ragLegislacaoStats();
        if (stats.baixados > 0) {
            statsEl.textContent = `${stats.baixados}/${stats.total} codigos indexados localmente`;
            statsEl.style.color = 'var(--success-color)';
        } else {
            statsEl.textContent = 'Nenhum codigo baixado ainda.';
            statsEl.style.color = '#888';
        }
    } catch {
        statsEl.textContent = '';
    }
}

function initLegislacaoSettings() {
    loadLegislacaoStats();

    const btnDownload   = document.getElementById('btn-leg-download');
    const btnForcar     = document.getElementById('btn-leg-redownload');
    const progressEl    = document.getElementById('leg-progress');

    function startDownload(forcar) {
        if (!window.lexApi?.ragDownloadLegislacao) return;

        [btnDownload, btnForcar].forEach(b => b && (b.disabled = true));
        if (btnDownload) btnDownload.textContent = 'Baixando...';
        if (progressEl) progressEl.textContent = '';

        // Escuta progresso linha a linha
        window.lexApi.onRagLegislacaoProgress((msg) => {
            if (!progressEl) return;
            progressEl.textContent += msg + '\n';
            progressEl.scrollTop = progressEl.scrollHeight;
        });

        window.lexApi.ragDownloadLegislacao(forcar)
            .then((res) => {
                window.lexApi.offRagLegislacaoProgress();
                if (progressEl) {
                    const extra = `\nIndexados: ${res.indexResult?.chunks ?? 0} trechos de ${res.indexResult?.arquivos ?? 0} arquivo(s).`;
                    progressEl.textContent += extra;
                    progressEl.scrollTop = progressEl.scrollHeight;
                }
                loadLegislacaoStats();
                loadRagStats();
            })
            .catch((e) => {
                window.lexApi.offRagLegislacaoProgress();
                if (progressEl) { progressEl.textContent += '\nErro: ' + (e.message || 'falha'); }
            })
            .finally(() => {
                [btnDownload, btnForcar].forEach(b => b && (b.disabled = false));
                if (btnDownload) btnDownload.textContent = 'Baixar / Atualizar Legislacao';
            });
    }

    btnDownload?.addEventListener('click', () => startDownload(false));
    btnForcar?.addEventListener('click',   () => startDownload(true));
}

document.addEventListener('DOMContentLoaded', () => {
    setDynamicGreeting();
    loadPreferences();
    loadProviderSettings();

    // Settings tab navigation
    document.querySelectorAll('.settings-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            const panel = document.getElementById('tab-' + tab);
            if (panel) panel.classList.add('active');
        });
    });

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
            updateApiKeyPlaceholder(pid);
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

            if (statusEl) { statusEl.textContent = 'Testando...'; statusEl.style.color = 'var(--text-secondary)'; }
            btnTest.disabled = true;

            try {
                const res = await window.lexApi.sendChat('ping — responda apenas "ok"');
                if (res && !res.error) {
                    if (statusEl) { statusEl.textContent = '✓ Funcionando'; statusEl.style.color = 'var(--success-color)'; }
                    if (apiKey) document.getElementById('ai-api-key').value = '';
                } else {
                    throw new Error(res?.error || 'Sem resposta');
                }
            } catch (e) {
                if (statusEl) { statusEl.textContent = '✗ ' + (e.message || 'Erro'); statusEl.style.color = 'var(--danger-color)'; }
            } finally {
                btnTest.disabled = false;
            }
        });
    }

    // Privacy onboarding (first-run dialog)
    initPrivacyOnboarding();

    // Privacy settings
    initPrivacySettings();

    // Analytics dashboard
    loadAnalyticsDashboard();
    const btnRefreshStats = document.getElementById('btn-refresh-stats');
    if (btnRefreshStats) btnRefreshStats.addEventListener('click', loadAnalyticsDashboard);

    // Ollama (Modelo Local)
    initOllamaSettings();

    // Telegram 24/7
    initTelegramSettings();

    // RAG — Indexação de documentos
    initRagSettings();

    // Legislacao Brasileira — download e indexacao
    initLegislacaoSettings();

    // Plugins / Integracoes
    initPluginsUI();
    // Recarrega quando main avisa que plugins estão prontos (boot assíncrono)
    if (window.pluginsApi?.onReady) {
        window.pluginsApi.onReady(() => initPluginsUI());
    }

    // Settings tab navigation
    initSettingsTabs();

    // PJe status polling
    updatePjeStatus();
    window._pjeStatusInterval = setInterval(updatePjeStatus, 5000);

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

    // Attach button (via toolbar — abre file picker e adiciona à lista)
    const btnAttach = document.getElementById('btn-attach');
    if (btnAttach) {
        btnAttach.addEventListener('click', async () => {
            if (!window.filesApi?.selectFile) return;
            const filePath = await window.filesApi.selectFile();
            if (!filePath) return;
            const result = await window.filesApi.readFile(filePath);
            const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
            window.attachFileToChat({ path: filePath, name: fileName, content: result?.text || '' });
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

    // Limpa estado de streaming/agente antes de trocar
    stopStreamingRenderLoop();
    currentStreamingMsg = null;
    streamingRawText = '';
    streamingDirty = false;
    isAgentWaitingUser = false;
    hideStopBtn();

    // Clear UI
    const msgList = document.getElementById('chat-messages');
    if (msgList) msgList.innerHTML = '';
    agentThinkingElement = null;
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

// ============================================================================
// PLUGINS / INTEGRACOES UI
// ============================================================================

const PLUGIN_ICONS = {
    gmail: '📧', gcalendar: '📅', gdrive: '📁', gdocs: '📝',
    outlook: '📨', whatsapp: '💬', notion: '📓', trello: '📋',
    todoist: '✅', zapier: '⚡', apify: '🕷️',
    'pdf-tools': '📄', screenshot: '📸', excel: '📊', desktop: '🖥️', clipboard: '📋',
    gcontacts: '👥', teams: '💼', docusign: '✍️', dropbox: '📦', onedrive: '☁️', slack: '💬',
};

const PLUGIN_STATUS_LABELS = {
    not_installed: 'Nao instalado',
    installed: 'Nao conectado',
    connected: 'Conectado',
    error: 'Erro',
};

async function loadProfileCard() {
    if (!window.authApi?.getProfile) return;
    try {
        var profile = await window.authApi.getProfile();
        if (!profile) return;

        // Settings profile card
        var nameEl = document.getElementById('profile-name');
        var emailEl = document.getElementById('profile-email');
        var planEl = document.getElementById('profile-plan');
        var avatarEl = document.getElementById('profile-avatar');
        var placeholderEl = document.getElementById('profile-avatar-placeholder');
        var logoutBtn = document.getElementById('profile-logout-btn');

        if (nameEl) nameEl.textContent = profile.name || '';
        if (emailEl) emailEl.textContent = profile.email || '';
        if (planEl) {
            var labels = { pro: 'Pro', trial: 'Trial' };
            planEl.textContent = labels[profile.plan] || profile.plan;
        }

        // Sidebar avatar
        var sidebarAvatar = document.getElementById('sidebar-avatar');
        var sidebarPlaceholder = document.getElementById('sidebar-avatar-placeholder');
        var settingsIcon = document.getElementById('sidebar-settings-icon');

        if (profile.avatar) {
            // Tem foto — mostra nos dois lugares
            if (avatarEl) { avatarEl.src = profile.avatar; avatarEl.style.display = 'block'; }
            if (placeholderEl) placeholderEl.style.display = 'none';
            if (sidebarAvatar) { sidebarAvatar.src = profile.avatar; sidebarAvatar.style.display = 'block'; }
            if (sidebarPlaceholder) sidebarPlaceholder.style.display = 'none';
            if (settingsIcon) settingsIcon.style.display = 'none';
        } else {
            // Sem foto — mostra inicial
            var initial = (profile.name || 'U').charAt(0).toUpperCase();
            if (placeholderEl) { placeholderEl.textContent = initial; placeholderEl.style.display = 'flex'; }
            if (avatarEl) avatarEl.style.display = 'none';
            if (sidebarPlaceholder) { sidebarPlaceholder.textContent = initial; sidebarPlaceholder.style.display = 'flex'; }
            if (sidebarAvatar) sidebarAvatar.style.display = 'none';
            if (settingsIcon) settingsIcon.style.display = 'none';
        }

        if (logoutBtn) {
            logoutBtn.onclick = async function() {
                if (!confirm('Sair da conta?')) return;
                await window.authApi.signOut();
                location.reload();
            };
        }
    } catch (err) {
        console.error('[Profile] Erro:', err);
    }
}

function initSettingsTabs() {
    const navItems = document.querySelectorAll('.settings-nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.getAttribute('data-tab');
            // Update nav active state
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            // Show correct panel
            document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById('tab-' + tab);
            if (panel) panel.classList.add('active');
            // Refresh data when switching to specific tabs
            if (tab === 'integracoes') initPluginsUI();
            if (tab === 'uso') loadAnalyticsDashboard();
            if (tab === 'perfil') loadProfileCard();
        });
    });
}

async function initPluginsUI() {
    console.log('[Plugins UI] Iniciando...');
    if (!window.pluginsApi) {
        console.warn('[Plugins UI] pluginsApi nao disponivel');
        return;
    }

    const grid = document.getElementById('plugins-grid');
    if (!grid) {
        console.warn('[Plugins UI] plugins-grid nao encontrado no DOM');
        return;
    }

    try {
        const plugins = await window.pluginsApi.list();
        grid.innerHTML = '';

        for (const plugin of plugins) {
            const card = document.createElement('div');
            card.className = `plugin-card${plugin.status === 'connected' ? ' connected' : ''}`;
            card.id = `plugin-card-${plugin.id}`;

            const icon = PLUGIN_ICONS[plugin.id] || '🔌';
            const statusClass = plugin.status === 'connected' ? 'connected' : (plugin.status === 'error' ? 'error' : '');
            const statusText = PLUGIN_STATUS_LABELS[plugin.status] || plugin.status;

            const isConnected = plugin.status === 'connected';
            const btnText = isConnected ? 'Desconectar' : 'Conectar';
            const btnClass = isConnected ? 'plugin-btn disconnect' : 'plugin-btn';

            card.innerHTML = `
                <div class="plugin-icon">${icon}</div>
                <div class="plugin-info">
                    <div class="plugin-name">${plugin.name}</div>
                    <div class="plugin-status ${statusClass}">${statusText}</div>
                </div>
                <button class="${btnClass}" data-plugin-id="${plugin.id}" data-connected="${isConnected}">${btnText}</button>
            `;

            const btn = card.querySelector('.plugin-btn');
            btn.addEventListener('click', () => {
                if (btn.dataset.connected === 'true') {
                    disconnectPlugin(plugin.id);
                } else {
                    openPluginModal(plugin.id, plugin.name);
                }
            });

            grid.appendChild(card);
        }
    } catch (err) {
        grid.innerHTML = '<div style="font-size:12px;color:var(--danger-color)">Erro ao carregar plugins: ' + err.message + '</div>';
    }
}

async function openPluginModal(pluginId, pluginName) {
    const modal = document.getElementById('plugin-modal');
    const title = document.getElementById('plugin-modal-title');
    const body = document.getElementById('plugin-modal-body');
    const closeBtn = document.getElementById('plugin-modal-close');

    if (!modal || !body) return;

    title.textContent = 'Conectar ' + pluginName;

    try {
        const config = await window.pluginsApi.getAuthConfig(pluginId);
        const auth = config.auth;

        if (!auth) {
            // Plugin local sem auth — ativar direto
            body.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">' +
                'Este plugin nao requer autenticacao.</p>' +
                '<button class="plugin-connect-btn" id="plugin-connect-go">Ativar ' + pluginName + '</button>';

            document.getElementById('plugin-connect-go').addEventListener('click', async () => {
                await window.pluginsApi.startOAuth(pluginId);
                modal.classList.add('hidden');
                initPluginsUI();
            });

        } else if (auth.type === 'oauth2') {
            if (config.embedded) {
                // Credenciais embarcadas — usuario so loga
                body.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">' +
                    'Clique abaixo para fazer login e autorizar o LEX.</p>' +
                    '<button class="plugin-connect-btn" id="plugin-connect-go" style="width:100%">Conectar com ' + pluginName + '</button>' +
                    '<div id="plugin-connect-error" style="display:none;margin-top:8px;font-size:12px;color:var(--danger-color)"></div>';
            } else {
                // Sem credenciais embarcadas — integracao ainda nao disponivel
                body.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">' +
                    'Esta integracao ainda nao esta disponivel. Em breve!</p>';
            }

            var connectBtn = document.getElementById('plugin-connect-go');
            if (connectBtn) {
                connectBtn.addEventListener('click', async () => {
                    var errorEl = document.getElementById('plugin-connect-error');
                    errorEl.style.display = 'none';
                    connectBtn.textContent = 'Aguardando login...';
                    connectBtn.disabled = true;

                    var result = await window.pluginsApi.startOAuth(pluginId);
                    if (result.success) { modal.classList.add('hidden'); initPluginsUI(); }
                    else {
                        errorEl.textContent = result.error || 'Falha na autorizacao.';
                        errorEl.style.display = 'block';
                        connectBtn.textContent = 'Conectar com ' + pluginName;
                        connectBtn.disabled = false;
                    }
                });
            }

        } else if (auth.type === 'api_key') {
            var instructions = (auth.apiKey && auth.apiKey.instructions) || 'Insira sua chave de API.';
            var url = (auth.apiKey && auth.apiKey.url) || '';

            body.innerHTML = '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">' + instructions + '</p>' +
                (url ? '<p style="font-size:12px;margin-bottom:12px"><a href="' + url + '" target="_blank" style="color:var(--accent-color)">' + url + '</a></p>' : '') +
                '<div class="settings-field"><label class="settings-label">Chave / Token</label>' +
                '<input class="settings-input" type="password" id="plugin-api-key" placeholder="Cole a chave aqui"></div>' +
                '<button class="plugin-connect-btn" id="plugin-connect-go">Conectar ' + pluginName + '</button>' +
                '<div id="plugin-connect-error" style="display:none;margin-top:8px;font-size:12px;color:var(--danger-color)"></div>';

            document.getElementById('plugin-connect-go').addEventListener('click', async () => {
                var apiKey = document.getElementById('plugin-api-key').value.trim();
                var errorEl = document.getElementById('plugin-connect-error');

                if (!apiKey) { errorEl.textContent = 'Chave obrigatoria.'; errorEl.style.display = 'block'; return; }

                var result = await window.pluginsApi.startOAuth(pluginId, apiKey);
                if (result.success) { modal.classList.add('hidden'); initPluginsUI(); }
                else { errorEl.textContent = result.error || 'Falha ao conectar.'; errorEl.style.display = 'block'; }
            });
        }

        modal.classList.remove('hidden');
        closeBtn.onclick = () => modal.classList.add('hidden');
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    } catch (err) {
        body.innerHTML = '<p style="color:var(--danger-color);font-size:13px">Erro: ' + err.message + '</p>';
        modal.classList.remove('hidden');
    }
}

async function disconnectPlugin(pluginId) {
    if (!confirm('Desconectar este plugin? As credenciais serao removidas.')) return;
    try { await window.pluginsApi.disconnect(pluginId); initPluginsUI(); }
    catch (err) { console.error('[Plugins] Erro ao desconectar:', err); }
}

