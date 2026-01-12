// Lex Overlay Logic
(function () {
    console.log('🚀 Lex Overlay Script Started');

    // Prevent double injection
    if (document.getElementById('lex-overlay-root')) {
        console.log('⚠️ Overlay already exists');
        return;
    }

    // Ensure body exists
    if (!document.body) {
        console.error('❌ Document body not found');
        return;
    }

    // Create UI Structure
    const root = document.createElement('div');
    root.id = 'lex-overlay-root';

    // Icons
    const robotIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="16" r="4"></circle><line x1="12" y1="6" x2="12" y2="3"></line><line x1="6" y1="6" x2="18" y2="6"></line></svg>`;
    const sendIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;

    root.innerHTML = `
        <div id="lex-panel">
            <div id="lex-header">
                <h3>Lex Copilot</h3>
                <button id="lex-close">×</button>
            </div>
            <div id="lex-messages">
                <div class="lex-msg ai">Olá! Estou aqui para ajudar neste processo. Para onde vamos? 🚗</div>
            </div>
            <div id="lex-input-area">
                <textarea id="lex-input" placeholder="Comando ou pergunta..."></textarea>
                <button id="lex-send">${sendIcon}</button>
            </div>
        </div>
        <div id="lex-float-btn" title="Abrir Lex">
            ${robotIcon}
        </div>
    `;

    document.body.appendChild(root);

    // Event Listeners
    const btn = document.getElementById('lex-float-btn');
    const panel = document.getElementById('lex-panel');
    const closeBtn = document.getElementById('lex-close');
    const input = document.getElementById('lex-input');
    const sendBtn = document.getElementById('lex-send');
    const msgs = document.getElementById('lex-messages');

    // Toggle Panel
    btn.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
        if (panel.style.display === 'flex') input.focus();
    });

    closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
    });

    // Send Message Logic
    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        // Add User Message
        appendMessage(text, 'user');
        input.value = '';
        sendBtn.disabled = true;

        // Capture Context (The Steering Wheel!)
        const pageContext = {
            url: window.location.href,
            title: document.title,
            // Simple extraction of visible text (limit length)
            bodyText: document.body.innerText.substring(0, 5000),
            selection: window.getSelection().toString()
        };

        try {
            // Use the exposed API
            if (window.lexApi) {
                appendMessage('Thinking...', 'ai loading');

                const response = await window.lexApi.sendChat(text, pageContext);

                // Remove loading
                const loader = msgs.querySelector('.loading');
                if (loader) loader.remove();

                const aiText = response.plan?.intent?.description || "Resposta recebida.";
                appendMessage(aiText, 'ai');

                // Execute Plan if any
                if (response.plan?.steps?.length > 0) {
                    appendMessage("⚙️ Executando automação...", 'ai');
                    await window.lexApi.executePlan(response.plan);
                    appendMessage("✅ Feito.", 'ai');
                }

                // Execute Search if any
                if (response.plan?.search_query) {
                    // We can't easily show search results in this tiny overlay yet, 
                    // but we can tell the user we did it or open a modal.
                    // For now, just notify.
                    appendMessage(`🔎 Busquei por "${response.plan.search_query}". (Resultados completos na aba principal)`, 'ai');
                }

            } else {
                appendMessage('Erro: Lex API não conectada.', 'ai error');
            }
        } catch (e) {
            console.error(e);
            appendMessage('Erro de conexão.', 'ai error');
        }

        sendBtn.disabled = false;
        input.focus();
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    function appendMessage(text, type) {
        const div = document.createElement('div');
        div.className = `lex-msg ${type}`;
        div.innerText = text;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

})();
