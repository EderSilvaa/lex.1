// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const chatInput = document.querySelector('textarea');
const sendBtn = document.querySelector('.send-btn');
const mainChatContainer = document.querySelector('.chat-container'); // The original chat container
const views = {
    chat: document.getElementById('view-chat'),
    home: document.getElementById('view-home'),
    files: document.getElementById('view-files'),
    pje: document.getElementById('split-view-container') // Mapped to split view
};

// Split View Elements
const splitView = document.getElementById('split-view-container');
const browserViewport = document.getElementById('browser-viewport');
const chatDock = document.getElementById('chat-dock');
const chatDockContent = document.getElementById('chat-dock-content');
const browserTabsBar = document.getElementById('browser-tabs-bar');
const browserUrl = document.getElementById('browser-url');
const browserBack = document.getElementById('browser-back');
const browserReload = document.getElementById('browser-reload');
const newTabBtn = document.getElementById('new-tab-btn');
const chatToggleBtn = document.getElementById('chat-toggle');

// State
let pjeMode = false;
let isChatCollapsed = false;

// --- Split View Logic ---

function updateLayoutBounds() {
    if (!pjeMode || !browserViewport) return;

    // We need to wait for transition
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

// Resize Observer to keep layout in sync
const resizeObserver = new ResizeObserver(() => {
    updateLayoutBounds();
});
if (browserViewport) resizeObserver.observe(browserViewport);


function switchView(targetId) {
    const viewName = targetId.replace('nav-', '');

    // Update Sidebar
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById(targetId)?.classList.add('active');

    // Update View
    Object.values(views).forEach(el => el?.classList.remove('active'));

    // Handle Split View Logic
    if (viewName === 'pje') {
        pjeMode = true;
        splitView.classList.add('active');

        // Move Chat to Dock
        if (mainChatContainer && chatDockContent && !chatDockContent.contains(mainChatContainer)) {
            chatDockContent.appendChild(mainChatContainer);
        }

        // Trigger Layout Update after transition
        setTimeout(updateLayoutBounds, 100);

        // Initialize Tab if empty
        // if (window.lexApi) window.lexApi.newTab(); // This might be redundant if Main handles it

    } else {
        pjeMode = false;
        if (views[viewName]) views[viewName].classList.add('active');

        // Move Chat back to Main View (if it's the chat view or we want it stored there)
        // If we switch to 'chat', make sure it's in #view-chat
        if (viewName === 'chat' || viewName === 'home') {
            const originalParent = document.getElementById('view-chat');
            if (originalParent && mainChatContainer && !originalParent.contains(mainChatContainer)) {
                // Clear any placeholder
                originalParent.appendChild(mainChatContainer);
            }
        }
    }

    // Notify Main Process
    if (window.dashboardApi) {
        window.dashboardApi.setMode(viewName === 'pje' ? 'pje' : 'home');
    }
}

// Event Listeners
navItems.forEach(item => {
    item.addEventListener('click', (e) => switchView(e.currentTarget.id));
});

// --- Browser Controls ---

if (browserBack) browserBack.addEventListener('click', () => {
    // History back not direct API yet, maybe script history.back()
    if (window.lexApi) window.lexApi.pjeExecuteScript('window.history.back()');
});
if (browserReload) browserReload.addEventListener('click', () => {
    if (window.lexApi) window.lexApi.pjeExecuteScript('window.location.reload()');
});
if (newTabBtn) newTabBtn.addEventListener('click', () => {
    if (window.lexApi) window.lexApi.newTab();
});

if (browserUrl) {
    browserUrl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const url = browserUrl.value;
            if (url && window.lexApi) window.lexApi.newTab(url); // Or navigateActiveTab
        }
    });
}

// Chat Toggle
if (chatToggleBtn && chatDock) {
    chatToggleBtn.addEventListener('click', () => {
        isChatCollapsed = !isChatCollapsed;
        if (isChatCollapsed) {
            chatDock.classList.add('collapsed');
            chatToggleBtn.innerText = '←';
        } else {
            chatDock.classList.remove('collapsed');
            chatToggleBtn.innerText = '→';
        }
        // Layout update triggers via Observer
    });
}

// --- Browser Events ---

if (window.lexApi) {
    window.lexApi.onBrowserUpdateUrl((data) => {
        if (pjeMode) {
            if (browserUrl) browserUrl.value = data.url;
            // Find tab and update
            const tab = document.querySelector(`.browser-tab[data-id="${data.tabId}"]`);
            // We need robust tab rendering
        }
    });

    window.lexApi.onBrowserTabCreated((data) => {
        addTabToUI(data.tabId, data.url);
    });

    window.lexApi.onBrowserTabActive((data) => {
        document.querySelectorAll('.browser-tab').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.browser-tab[data-id="${data.tabId}"]`);
        if (tab) tab.classList.add('active');
        // Update URL bar?
    });

    window.lexApi.onBrowserTabClosed((data) => {
        const tab = document.querySelector(`.browser-tab[data-id="${data.tabId}"]`);
        if (tab) tab.remove();
    });
}

function addTabToUI(tabId, url = "") {
    // Check if exists
    if (document.querySelector(`.browser-tab[data-id="${tabId}"]`)) return;

    const tab = document.createElement('div');
    tab.className = 'browser-tab';
    tab.dataset.id = tabId;
    tab.innerHTML = `
        <span class="tab-title">Nova Aba</span>
        <span class="tab-close">×</span>
    `;

    tab.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
            window.lexApi.switchTab(tabId);
        }
    });

    tab.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        window.lexApi.closeTab(tabId);
    });

    browserTabsBar.insertBefore(tab, newTabBtn);
    window.lexApi.switchTab(tabId);
}

// --- Chat Logic ---

// Auto-resize textarea
chatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    if (this.value.trim().length > 0) sendBtn.removeAttribute('disabled');
    else sendBtn.setAttribute('disabled', 'true');
});

// Send Message
sendBtn.addEventListener('click', async () => {
    const text = chatInput.value;
    if (!text.trim()) return;

    addMessageToUI(text, 'user');

    chatInput.value = '';
    sendBtn.setAttribute('disabled', 'true');
    chatInput.style.height = 'auto';

    const loadingId = addLoadingToUI();

    try {
        if (window.lexApi) {
            const response = await window.lexApi.sendChat(text, {});
            removeMessageFromUI(loadingId);

            if (response.error) {
                addMessageToUI(`Erro: ${response.error}`, 'system');
            } else if (response.plan) {
                const aiText = response.plan.intent?.description || "Plano recebido.";
                addMessageToUI(aiText, 'ai');

                if (response.plan.steps && response.plan.steps.length > 0) {
                    addMessageToUI("⚙️ Iniciando automação...", 'system');
                    try {
                        const execResult = await window.lexApi.executePlan(response.plan);
                        if (execResult.error) {
                            addMessageToUI(`⚠️ Motor PJe: ${execResult.error}`, 'system');
                        } else {
                            addMessageToUI("✅ Automação concluída!", 'system');
                        }
                    } catch (execErr) {
                        console.error(execErr);
                    }
                }
            }
        }
    } catch (err) {
        removeMessageFromUI(loadingId);
        addMessageToUI("Erro de conexão.", 'system');
    }
});

function addMessageToUI(text, type) {
    let messageList = document.getElementById('chat-messages');
    const greeting = document.querySelector('.greeting-section');
    const container = document.querySelector('.chat-container');

    // Add class to container to switch layout mode
    if (container) container.classList.add('has-messages');

    // Hide greeting if visible
    if (greeting && greeting.style.display !== 'none') {
        greeting.style.display = 'none';
    }

    if (!messageList) {
        // Fallback if not in HTML (though it is now)
        messageList = document.createElement('div');
        messageList.id = 'chat-messages';
        messageList.className = 'chat-messages';
        // Insert before input area
        const inputArea = document.querySelector('.input-area');
        if (inputArea) inputArea.parentNode.insertBefore(messageList, inputArea);
    }

    // Thinking parsing
    let displayText = text;
    let thinkingContent = '';
    const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
        thinkingContent = thinkingMatch[1].trim();
        displayText = text.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
    }

    let htmlContent = displayText;
    if (window.marked) htmlContent = window.marked.parse(displayText);

    let messageHtml = '';
    if (thinkingContent) {
        messageHtml += `<div class="thinking-container"><details class="thinking-accordion"><summary class="thinking-summary">Thinking Process</summary><div class="thinking-content">${thinkingContent}</div></details></div>`;
    }
    messageHtml += `<div class="msg-content markdown-body">${htmlContent}</div>`;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.id = type === 'loading' ? `msg-${Date.now()}` : '';
    const icon = type === 'user' ? '👤' : '🤖';

    msgDiv.innerHTML = `<div class="msg-avatar">${icon}</div><div class="message-body">${messageHtml}</div>`;

    messageList.appendChild(msgDiv);
    messageList.scrollTop = messageList.scrollHeight;
    return msgDiv.id;
}

function addLoadingToUI() { return addMessageToUI('Pensando...', 'loading'); }
function removeMessageFromUI(id) { document.getElementById(id)?.remove(); }
