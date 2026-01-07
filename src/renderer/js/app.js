// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const chatInput = document.querySelector('textarea');
const sendBtn = document.querySelector('.send-btn');

// Navigation Logic
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        // Remove active class from all
        navItems.forEach(nav => nav.classList.remove('active'));
        views.forEach(view => view.classList.remove('active'));

        // Add active class to clicked
        // Handle click on icon or span
        const target = e.currentTarget;
        target.classList.add('active');

        // Show corresponding view
        const viewId = target.id.replace('nav-', 'view-');

        // IPC Communication
        if (window.dashboardApi) {
            if (target.id === 'nav-pje') {
                window.dashboardApi.setMode('pje');
            } else {
                window.dashboardApi.setMode('home');
            }
        }

        const view = document.getElementById(viewId);
        if (view) {
            view.classList.add('active');
        } else {
            // Handle special cases without views (like Settings)
            console.log('Clicked:', target.id);
        }
    });
});

// Chat Input Logic
chatInput.addEventListener('input', (e) => {
    if (e.target.value.trim().length > 0) {
        sendBtn.removeAttribute('disabled');
    } else {
        sendBtn.setAttribute('disabled', 'true');
    }
});

// Auto-resize textarea
chatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Send Message
sendBtn.addEventListener('click', async () => {
    const text = chatInput.value;
    if (!text.trim()) return;

    // UI: Add User Message
    addMessageToUI(text, 'user');

    // Clear input
    chatInput.value = '';
    sendBtn.setAttribute('disabled', 'true');
    chatInput.style.height = 'auto'; // Reset height

    // Show Loading
    const loadingId = addLoadingToUI();

    try {
        // Send to Main Process -> Supabase
        if (window.lexApi) {
            console.log('Sending to AI...');
            const response = await window.lexApi.sendChat(text, {}); // Context empty for now

            // Remove loading
            removeMessageFromUI(loadingId);

            if (response.error) {
                addMessageToUI(`Erro: ${response.error}`, 'system');
            } else if (response.plan) {
                // Formatting the plan/response
                // The edge function returns a "plan" object usually.
                // For chat, we might want a text response.
                // Assuming plan has a description or we just show the raw purpose for now.
                const aiText = response.plan.intent?.description || "Plano recebido.";
                addMessageToUI(aiText, 'ai');

                // TODO: Render structured plan
                console.log('AI Plan:', response.plan);
            }
        } else {
            removeMessageFromUI(loadingId);
            addMessageToUI("Erro: lexApi não disponível.", 'system');
        }
    } catch (err) {
        console.error(err);
        removeMessageFromUI(loadingId);
        addMessageToUI("Erro de conexão.", 'system');
    }
});

function addMessageToUI(text, type) {
    const chatContainer = document.querySelector('.greeting-section'); // Just appending here for now, better to have a list
    // Actually, we should probably hide the greeting and show a message list.
    // Let's create a message list container if not exists
    let messageList = document.getElementById('chat-messages');
    if (!messageList) {
        // First message: Hide greeting
        document.querySelector('.greeting-section').style.display = 'none';

        messageList = document.createElement('div');
        messageList.id = 'chat-messages';
        messageList.className = 'chat-messages';
        document.querySelector('.chat-container').insertBefore(messageList, document.querySelector('.input-area'));
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.id = type === 'loading' ? `msg-${Date.now()}` : '';

    // Icon
    const icon = type === 'user' ? '👤' : (type === 'ai' ? '🤖' : '⚠️');

    msgDiv.innerHTML = `
        <div class="msg-avatar">${icon}</div>
        <div class="msg-content">${text}</div>
    `;

    messageList.appendChild(msgDiv);
    messageList.scrollTop = messageList.scrollHeight;

    return msgDiv.id;
}

function addLoadingToUI() {
    return addMessageToUI('Pensando...', 'loading');
}

function removeMessageFromUI(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}
