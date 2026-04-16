/**
 * Terminal UI — xterm.js integration
 *
 * Gerencia sessões de terminal embutido no LEX.
 */

/* global Terminal, FitAddon, WebLinksAddon, terminalApi */

let terminalInitialized = false;
let sessions = {}; // { id: { terminal, fitAddon, active } }
let activeSessionId = null;
let sessionCounter = 0;

const XTERM_THEME = {
    background: '#080808',
    foreground: '#ece8df',
    cursor: '#8d6a57',
    cursorAccent: '#080808',
    selectionBackground: 'rgba(141, 106, 87, 0.35)',
    selectionForeground: '#ece8df',
    black: '#080808',
    red: '#b87e7e',
    green: '#79aa8a',
    yellow: '#c9a96e',
    blue: '#7a9ec2',
    magenta: '#a88cb2',
    cyan: '#6fb5a8',
    white: '#ece8df',
    brightBlack: '#4a4640',
    brightRed: '#d4a0a0',
    brightGreen: '#9bc4a9',
    brightYellow: '#dfc28e',
    brightBlue: '#9bbada',
    brightMagenta: '#c4aece',
    brightCyan: '#8fd0c4',
    brightWhite: '#f5f2eb',
};

/**
 * Inicializa o terminal view (lazy — chamado ao abrir a tab).
 */
function initTerminalView() {
    if (terminalInitialized) {
        // Apenas re-fit o terminal ativo
        fitActiveTerminal();
        return;
    }

    if (!window.terminalApi) {
        console.warn('[Terminal] terminalApi not available');
        return;
    }

    terminalInitialized = true;

    // Setup event listeners do IPC
    window.terminalApi.onData((payload) => {
        const session = sessions[payload.sessionId];
        if (session) {
            session.terminal.write(payload.data);
        }
    });

    window.terminalApi.onExit((payload) => {
        const session = sessions[payload.sessionId];
        if (session) {
            session.terminal.write(`\r\n\x1b[90m[Processo encerrado com código ${payload.exitCode}]\x1b[0m\r\n`);
            session.exited = true;
        }
        updateTabUI();
    });

    // Botão de nova sessão
    const newBtn = document.getElementById('terminal-new-session');
    if (newBtn) {
        newBtn.addEventListener('click', () => createTerminalSession());
    }

    // Cria primeira sessão automaticamente
    createTerminalSession();

    // Resize observer para fit automático
    const container = document.querySelector('.terminal-container');
    if (container) {
        const ro = new ResizeObserver(() => fitActiveTerminal());
        ro.observe(container);
    }
}

/**
 * Cria uma nova sessão de terminal.
 * @param {{ mode?: 'lex'|'shell' }} [opts] — 'lex' (default) roda o LEX CLI, 'shell' roda o shell do SO.
 */
async function createTerminalSession(opts = {}) {
    const mode = opts.mode || 'lex';
    sessionCounter++;
    const sessionId = `term-${sessionCounter}-${Date.now()}`;
    const displayName = mode === 'lex' ? `LEX ${sessionCounter}` : `Shell ${sessionCounter}`;

    // Cria instância xterm.js
    const terminal = new Terminal({
        theme: XTERM_THEME,
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
        fontSize: 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 5000,
        allowProposedApi: true,
    });

    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);

    try {
        const webLinksAddon = new WebLinksAddon.WebLinksAddon();
        terminal.loadAddon(webLinksAddon);
    } catch (e) {
        // Addon opcional
    }

    // Copy/paste: Ctrl+C copia se houver seleção (senão cai pro SIGINT default),
    // Ctrl+V cola do clipboard, Ctrl+Shift+C/V sempre copia/cola.
    terminal.attachCustomKeyEventHandler((e) => {
        if (e.type !== 'keydown') return true;
        const ctrl = e.ctrlKey || e.metaKey;
        if (!ctrl) return true;

        // Ctrl+Shift+C / Ctrl+C com seleção → copiar
        if ((e.key === 'C' || e.key === 'c') && (e.shiftKey || terminal.hasSelection())) {
            const sel = terminal.getSelection();
            if (sel) {
                try { navigator.clipboard.writeText(sel); } catch (_) { /* ignore */ }
                e.preventDefault();
                return false;
            }
            // Sem seleção + sem shift → deixa Ctrl+C ir como SIGINT pro PTY
        }

        // Ctrl+V / Ctrl+Shift+V → colar
        if ((e.key === 'V' || e.key === 'v')) {
            navigator.clipboard.readText().then((text) => {
                if (text) window.terminalApi.write(sessionId, text);
            }).catch(() => { /* ignore */ });
            e.preventDefault();
            return false;
        }

        return true;
    });

    // Guarda a sessão
    sessions[sessionId] = {
        terminal,
        fitAddon,
        displayName,
        exited: false,
    };

    // Troca para a nova sessão
    switchToSession(sessionId);

    // Cria sessão PTY no main process
    const container = document.querySelector('.terminal-container');
    const cols = Math.floor((container?.clientWidth || 800) / 8);
    const rows = Math.floor((container?.clientHeight || 400) / 18);

    try {
        const result = mode === 'lex'
            ? await window.terminalApi.createLex(sessionId, { cols, rows })
            : await window.terminalApi.create(sessionId, { cols, rows });
        if (!result.success) {
            terminal.write(`\x1b[31mErro ao criar terminal: ${result.error}\x1b[0m\r\n`);
        }
    } catch (err) {
        terminal.write(`\x1b[31mErro: ${err.message || err}\x1b[0m\r\n`);
    }

    // Forward input do xterm para o PTY
    terminal.onData((data) => {
        if (!sessions[sessionId]?.exited) {
            window.terminalApi.write(sessionId, data);
        }
    });

    // Fit após montar — duplo: imediato + delayed para garantir dimensões corretas
    requestAnimationFrame(() => {
        fitAddon.fit();
        terminal.focus();
        // Re-fit após estabilizar (fonts carregadas, layout finalizado)
        setTimeout(() => {
            fitAddon.fit();
            terminal.focus();
        }, 200);
    });

    updateTabUI();
}

/**
 * Troca para uma sessão de terminal.
 */
function switchToSession(sessionId) {
    const container = document.querySelector('.terminal-container');
    if (!container) return;

    // Detach terminal anterior
    if (activeSessionId && sessions[activeSessionId]) {
        const prevEl = container.querySelector('.xterm');
        if (prevEl) prevEl.style.display = 'none';
    }

    activeSessionId = sessionId;
    const session = sessions[sessionId];
    if (!session) return;

    // Verifica se já está montado no DOM
    const existingEl = container.querySelector(`[data-session-id="${sessionId}"]`);
    if (existingEl) {
        existingEl.style.display = '';
    } else {
        // Esconde todos os outros
        container.querySelectorAll('.xterm').forEach(el => {
            el.style.display = 'none';
        });

        // Cria wrapper e monta
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-session-id', sessionId);
        wrapper.style.height = '100%';
        container.appendChild(wrapper);
        session.terminal.open(wrapper);

        // xterm pode abrir com container de dimensão 0 (layout ainda calculando).
        // ResizeObserver garante o fit assim que o container tiver tamanho real.
        const ro = new ResizeObserver(() => {
            if (wrapper.clientWidth > 0 && wrapper.clientHeight > 0) {
                session.fitAddon.fit();
                session.terminal.focus();
                ro.disconnect();
            }
        });
        ro.observe(wrapper);
    }

    requestAnimationFrame(() => {
        session.fitAddon.fit();
        session.terminal.focus();
    });

    updateTabUI();
}

/**
 * Fecha uma sessão de terminal.
 */
function closeSession(sessionId) {
    const session = sessions[sessionId];
    if (!session) return;

    // Kill PTY
    if (!session.exited) {
        window.terminalApi.kill(sessionId).catch(() => {});
    }

    // Remove do DOM
    const container = document.querySelector('.terminal-container');
    const el = container?.querySelector(`[data-session-id="${sessionId}"]`);
    if (el) el.remove();

    // Dispose xterm
    session.terminal.dispose();
    delete sessions[sessionId];

    // Troca para outra sessão ou cria uma nova
    const remaining = Object.keys(sessions);
    if (remaining.length > 0) {
        switchToSession(remaining[remaining.length - 1]);
    } else {
        activeSessionId = null;
        createTerminalSession();
    }

    updateTabUI();
}

/**
 * Atualiza a barra de tabs.
 */
function updateTabUI() {
    const tabsContainer = document.getElementById('terminal-tabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';

    for (const [id, session] of Object.entries(sessions)) {
        const tab = document.createElement('button');
        tab.className = `terminal-tab${id === activeSessionId ? ' active' : ''}`;
        tab.innerHTML = `
            <span>${session.displayName}</span>
            <span class="terminal-tab-close" data-close="${id}">&times;</span>
        `;

        tab.addEventListener('click', (e) => {
            if (e.target.classList?.contains('terminal-tab-close')) {
                closeSession(e.target.getAttribute('data-close'));
            } else {
                switchToSession(id);
            }
        });

        tabsContainer.appendChild(tab);
    }
}

/**
 * Re-fit o terminal ativo ao container.
 */
function fitActiveTerminal() {
    if (!activeSessionId || !sessions[activeSessionId]) return;
    const session = sessions[activeSessionId];

    try {
        session.fitAddon.fit();
        // Notifica o PTY do novo tamanho
        const dims = session.fitAddon.proposeDimensions();
        if (dims) {
            window.terminalApi.resize(activeSessionId, dims.cols, dims.rows)
                .catch(() => {}); // IPC handler may not be registered yet during boot
        }
    } catch (e) {
        // Ignore errors during fit (element not visible, etc.)
    }
}
