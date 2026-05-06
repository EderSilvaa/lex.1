/**
 * Terminal UI — xterm.js integration
 *
 * Gerencia sessões de terminal embutido no LEX.
 */

/* global Terminal, FitAddon, WebLinksAddon, terminalApi, lexEngineApi */

let terminalInitialized = false;
let sessions = {}; // { id: { terminal, fitAddon, active } }
let activeSessionId = null;
let sessionCounter = 0;
let lastEngineStatus = null;

function isLexLikeMode(mode) {
    return mode === 'lex' || mode === 'engine';
}

function normalizeLexPastedText(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!normalized.includes('\n')) return text;

    return normalized
        .split(/\n\s*\n+/)
        .map((paragraph) => paragraph
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .join(' '))
        .filter(Boolean)
        .join('  ');
}

function writeTerminalInput(sessionId, data, opts = {}) {
    const session = sessions[sessionId];
    if (!session || session.exited) return;

    const payload = opts.paste && isLexLikeMode(session.mode)
        ? normalizeLexPastedText(data)
        : data;

    if (payload) window.terminalApi.write(sessionId, payload, opts.paste ? { paste: true } : undefined);
}

function installPasteHandler(sessionId, wrapper) {
    const session = sessions[sessionId];
    if (!session || session.pasteHandlerInstalled) return;

    wrapper.addEventListener('paste', (event) => {
        const text = event.clipboardData?.getData('text/plain') || '';
        if (!text || !isLexLikeMode(session.mode)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        writeTerminalInput(sessionId, text, { paste: true });
    }, true);

    session.pasteHandlerInstalled = true;
}

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

const LEX_PROMPT_SHORTCUTS = {
    'pje-consultar': 'Abra a consulta do PJe do tribunal inferido ou solicitado. Se eu ainda nao informei o numero CNJ, peca o numero antes de preencher qualquer campo. Use dry run antes de alterar a tela. Se o PJe estiver fora, em login ou timeout, explique o estado e nao repita a mesma tool em loop.',
    'pje-resultados': 'Use pje_ler_resultados com waitMs 1000 e maxRows 10. Nao clique em nada, nao abra processo e nao baixe documentos. Apenas resuma os resultados visiveis.',
    'pje-abrir-autos': 'Abra os autos do resultado selecionado somente com confirmacao humana. Se aparecer aviso do PJe, pare no aviso se aceitarAviso nao estiver explicitamente autorizado.',
    'pje-ler-autos': 'Use pje_ler_autos em modo read-only. Nao clique, nao baixe documentos e nao pratique nenhum ato. Resuma processo, documento atual, movimentos visiveis e riscos de acoes sensiveis. Informe expressamente que foi somente leitura.',
    'pje-baixar-doc': 'Use pje_baixar_documento_atual com dryRun false apenas para o documento atual aberto no visualizador, com confirmacao no Desktop. Nao baixe autos completos e nao peticione. Se o PJe abrir o PDF em nova aba em vez de baixar, informe a aba/URL e prepare a proxima etapa sem repetir em loop.',
    'pje-analisar-doc': 'Use pje_analisar_documento_baixado com maxChars 12000 e includeFullText false. Depois responda no Padrao Lex: resumo executivo, fatos, fundamentos, dispositivo/conclusao, riscos, lacunas, proximos passos e jurisprudencia/verificacao. Avise que documento unico nao substitui analise dos autos completos. Se o PDF nao tiver texto extraivel, diga isso e nao invente conteudo, jurisprudencia, numeros de processo, turmas ou datas.',
    'doc-resumo': 'Com base no documento ja extraido ou baixado, gere um resumo juridico no Padrao Lex: fatos relevantes, fundamentos, dispositivo/conclusao, riscos, lacunas, proximos passos e jurisprudencia/verificacao. Avise quando a conclusao depender dos autos completos e nao invente precedentes.',
};

function sendShortcutPrompt(shortcutId) {
    const prompt = LEX_PROMPT_SHORTCUTS[shortcutId];
    if (!prompt) return;
    if (!activeSessionId || !sessions[activeSessionId] || sessions[activeSessionId].exited) {
        createTerminalSession({ mode: 'engine' }).then((result) => {
            const sessionId = result?.sessionId;
            if (sessionId) setTimeout(() => writeTerminalInput(sessionId, `${prompt}\r`, { paste: true }), 600);
        }).catch(() => undefined);
        return;
    }
    writeTerminalInput(activeSessionId, `${prompt}\r`, { paste: true });
}

function setEngineStatus(kind, text, title) {
    const button = document.getElementById('terminal-engine-status');
    const dot = button?.querySelector('.terminal-status-dot');
    const label = document.getElementById('terminal-engine-status-text');
    if (dot) dot.className = `terminal-status-dot ${kind}`;
    if (label) label.textContent = text;
    if (button && title) button.title = title;
}

function statusValue(ok, online = 'ok', offline = 'off') {
    return ok ? online : offline;
}

function renderStatusRow(label, value, className = '') {
    return `
        <div class="terminal-status-row ${className}">
            <span>${label}</span>
            <span title="${String(value || '').replace(/"/g, '&quot;')}">${value || '-'}</span>
        </div>
    `;
}

function renderEngineStatusPanel(status, errorText = '') {
    const summary = document.getElementById('terminal-status-panel-summary');
    const body = document.getElementById('terminal-status-panel-body');
    if (!summary || !body) return;

    if (!status) {
        summary.textContent = errorText ? 'Indisponivel' : 'Aguardando status';
        body.innerHTML = renderStatusRow('Diagnostico', errorText || 'Clique em Motor para verificar.', 'warning');
        return;
    }

    const bridgeRunning = !!status.bridge?.running;
    const mcpReady = bridgeRunning && !!status.ok;
    summary.textContent = status.ok ? 'Motor local ativo' : 'Motor incompleto';
    const messages = Array.isArray(status.messages) ? status.messages.filter(Boolean) : [];
    body.innerHTML = [
        renderStatusRow('Motor', statusValue(status.ok, 'on', 'off')),
        renderStatusRow('MCP', `lex-desktop ${statusValue(mcpReady, 'pronto', 'indisponivel')}`),
        renderStatusRow('Bridge', bridgeRunning ? status.bridge.url : 'offline'),
        renderStatusRow('Windows', status.windowsPath || ''),
        renderStatusRow('WSL', `${status.wsl?.distro || '-'} · ${statusValue(status.wsl?.available, 'ok', 'off')}`),
        renderStatusRow('Projeto', status.wsl?.projectPath || ''),
        renderStatusRow('Comando', status.wsl?.hermesPath ? 'encontrado' : 'ausente'),
        messages.length ? renderStatusRow('Diagnostico', messages.slice(0, 3).join(' | '), 'warning') : '',
    ].join('');
}

function toggleStatusPanel(forceOpen) {
    const panel = document.getElementById('terminal-status-panel');
    if (!panel) return;
    const shouldOpen = forceOpen === undefined ? panel.classList.contains('hidden') : !!forceOpen;
    panel.classList.toggle('hidden', !shouldOpen);
    if (shouldOpen) {
        renderEngineStatusPanel(lastEngineStatus);
    }
}

function buildEngineStatusTitle(status) {
    if (!status) return 'Status do Console Lex indisponivel.';
    const bridgeRunning = !!status.bridge?.running;
    const lines = [
        `Motor: ${status.ok ? 'ativo' : 'incompleto'}`,
        `Windows: ${status.windowsPath || '(nao informado)'}`,
        `WSL: ${status.wsl?.distro || '(nao informado)'}`,
        `Projeto: ${status.wsl?.projectPath || '(nao informado)'}`,
        `Bridge: ${bridgeRunning ? status.bridge.url : 'offline'}`,
        `MCP: lex-desktop ${bridgeRunning && status.ok ? 'pronto' : 'indisponivel'}`,
    ];
    if (status.wsl?.hermesPath) lines.push(`Comando interno: ${status.wsl.hermesPath}`);
    if (Array.isArray(status.messages) && status.messages.length) {
        lines.push('', 'Diagnostico:', ...status.messages.slice(0, 4));
    }
    return lines.join('\n');
}

function friendlyTerminalError(error) {
    const raw = String(error || '').trim();
    if (!raw) return 'Nao foi possivel abrir o Console Lex.';
    if (/project.*not found|no such file|nao encontrado/i.test(raw)) {
        return `${raw}\n\nVerifique se o projeto Lex Engine existe no WSL e se o caminho configurado esta correto.`;
    }
    if (/wsl|ubuntu|distro/i.test(raw)) {
        return `${raw}\n\nVerifique se o Ubuntu/WSL esta aberto e respondendo.`;
    }
    if (/hermes/i.test(raw)) {
        return `${raw}\n\nO comando interno do motor nao foi encontrado. Rode o setup do Lex Engine no WSL.`;
    }
    return raw;
}

async function refreshEngineStatus() {
    if (!window.lexEngineApi?.getStatus) {
        setEngineStatus('error', 'Motor off', 'API local da Lex indisponivel');
        renderEngineStatusPanel(null, 'API local da Lex indisponivel');
        return null;
    }

    setEngineStatus('checking', 'Verificando', 'Verificando Console Lex e motor local...');
    renderEngineStatusPanel(lastEngineStatus, 'Verificando Console Lex e motor local...');
    try {
        const result = await window.lexEngineApi.getStatus();
        if (!result?.success) {
            const error = friendlyTerminalError(result?.error || 'Falha ao verificar motor local');
            setEngineStatus('error', 'Motor off', error);
            renderEngineStatusPanel(null, error);
            return null;
        }

        const status = result.data;
        lastEngineStatus = status || null;
        if (status?.ok) {
            setEngineStatus('ok', 'Motor on', buildEngineStatusTitle(status));
        } else {
            const detail = (status?.messages || []).join('\n') || 'Lex Engine incompleto';
            setEngineStatus('error', 'Motor off', friendlyTerminalError(detail));
        }
        renderEngineStatusPanel(status);
        return status;
    } catch (err) {
        const error = friendlyTerminalError(err?.message || String(err));
        setEngineStatus('error', 'Motor off', error);
        renderEngineStatusPanel(null, error);
        return null;
    }
}

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
        newBtn.addEventListener('click', () => createTerminalSession({ mode: 'lex' }));
    }

    // Cria primeira sessão automaticamente
    const newEngineBtn = document.getElementById('terminal-new-engine-session');
    if (newEngineBtn) {
        newEngineBtn.addEventListener('click', () => createTerminalSession({ mode: 'engine' }));
    }

    const engineStatusBtn = document.getElementById('terminal-engine-status');
    if (engineStatusBtn) {
        engineStatusBtn.addEventListener('click', () => {
            toggleStatusPanel();
            refreshEngineStatus();
        });
    }

    document.addEventListener('click', (event) => {
        const panel = document.getElementById('terminal-status-panel');
        const wrap = document.querySelector('.terminal-status-wrap');
        if (!panel || !wrap || panel.classList.contains('hidden')) return;
        if (!wrap.contains(event.target)) toggleStatusPanel(false);
    });

    const shortcuts = document.getElementById('terminal-prompt-shortcuts');
    if (shortcuts) {
        shortcuts.addEventListener('change', () => {
            const shortcutId = shortcuts.value;
            shortcuts.value = '';
            sendShortcutPrompt(shortcutId);
        });
    }

    refreshEngineStatus();

    createTerminalSession({ mode: 'engine' });

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
    const requestedSessionId = typeof opts.sessionId === 'string' && opts.sessionId.trim() ? opts.sessionId.trim() : null;
    if (requestedSessionId && sessions[requestedSessionId]) {
        switchToSession(requestedSessionId);
        return { success: true, sessionId: requestedSessionId, reused: true };
    }

    sessionCounter++;
    const sessionId = requestedSessionId || `term-${sessionCounter}-${Date.now()}`;
    const displayName = opts.displayName || (
        mode === 'engine' ? `Lex ${sessionCounter}` :
        mode === 'lex' ? `Lex local ${sessionCounter}` :
        `Shell ${sessionCounter}`
    );

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
                writeTerminalInput(sessionId, text, { paste: true });
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
        mode,
        ptyReady: false,
        exited: false,
    };

    // Troca para a nova sessão
    switchToSession(sessionId);

    // Cria sessão PTY no main process
    const container = document.querySelector('.terminal-container');
    const cols = Math.floor((container?.clientWidth || 800) / 8);
    const rows = Math.floor((container?.clientHeight || 400) / 18);

    try {
        if (mode !== 'engine') {
            terminal.write(`\x1b[90mIniciando Lex local...\x1b[0m\r\n`);
        }
        const result = mode === 'engine'
            ? await window.terminalApi.createEngine(sessionId, { cols, rows })
            : mode === 'lex'
                ? await window.terminalApi.createLex(sessionId, { cols, rows })
                : await window.terminalApi.create(sessionId, { cols, rows });
        if (!result.success) {
            const error = friendlyTerminalError(result.error);
            terminal.write(`\x1b[31mErro ao abrir Console Lex: ${error}\x1b[0m\r\n`);
            if (mode === 'engine') {
                setEngineStatus('error', 'Motor off', error || 'Falha ao abrir Console Lex');
            }
        } else {
            const liveSession = sessions[sessionId];
            if (liveSession) liveSession.ptyReady = true;
            if (mode === 'engine') {
                setEngineStatus('ok', 'Motor on', 'Console Lex aberto. O motor local esta respondendo.');
            }
        }
    } catch (err) {
        terminal.write(`\x1b[31mErro: ${friendlyTerminalError(err.message || err)}\x1b[0m\r\n`);
    }

    // Forward input do xterm para o PTY
    terminal.onData((data) => {
        writeTerminalInput(sessionId, data);
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
    return { success: true, sessionId };
}

/**
 * Troca para uma sessão de terminal.
 */
function switchToSession(sessionId) {
    const container = document.querySelector('.terminal-container');
    if (!container) return;

    activeSessionId = sessionId;
    const session = sessions[sessionId];
    if (!session) return;

    window.dispatchEvent(new CustomEvent('lex-terminal-session-change', {
        detail: {
            sessionId,
            mode: session.mode,
            displayName: session.displayName,
        },
    }));

    // Verifica se já está montado no DOM
    container.querySelectorAll('[data-session-id]').forEach(el => {
        const isActive = el.getAttribute('data-session-id') === sessionId;
        el.style.display = isActive ? '' : 'none';
        el.querySelectorAll('.xterm').forEach(termEl => {
            termEl.style.display = '';
        });
    });

    const existingEl = container.querySelector(`[data-session-id="${sessionId}"]`);
    if (existingEl) {
        existingEl.style.display = '';
        existingEl.querySelectorAll('.xterm').forEach(termEl => {
            termEl.style.display = '';
        });
    } else {
        // Cria wrapper e monta
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-session-id', sessionId);
        wrapper.style.height = '100%';
        wrapper.style.width = '100%';
        container.appendChild(wrapper);
        session.terminal.open(wrapper);
        installPasteHandler(sessionId, wrapper);

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
