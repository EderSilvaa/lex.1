// ============================================================================
// AGORA — durable workflow board backed by Lex Engine/Hermes
// ============================================================================

let agoraInitialized = false;
let agoraLocalCards = [];
let agoraPersistedCards = [];
let agoraSelectedCardId = 'agora-pje-consulta';
let agoraCommentCardId = null;

const agoraList = () => document.getElementById('agora-list');
const agoraTitle = () => document.getElementById('agora-title');
const btnBack = () => document.getElementById('btn-back-agora');
const btnNewTask = () => document.getElementById('btn-new-agora-task');

const agoraColumns = [
    { id: 'entrada', label: 'Entrada', tone: 'neutral' },
    { id: 'especificacao', label: 'Especificacao', tone: 'info' },
    { id: 'pronto_execucao', label: 'Pronto p/ execucao', tone: 'info' },
    { id: 'execucao', label: 'Execucao', tone: 'active' },
    { id: 'revisao', label: 'Revisao', tone: 'warning' },
    { id: 'pronto', label: 'Pronto', tone: 'success' },
];

const agoraWorkflowTypes = [
    { value: 'Workflow', label: 'Workflow juridico', assignee: 'default', guardrail: 'Revisao humana' },
    { value: 'PJe', label: 'Pasta PJe', assignee: 'pje', guardrail: 'Somente leitura' },
    { value: 'Peca', label: 'Peticoes/minutas', assignee: 'document', guardrail: 'Aprovar texto' },
    { value: 'Pesquisa', label: 'Pesquisa juridica', assignee: 'research', guardrail: 'Conferir fontes' },
    { value: 'Protocolo', label: 'Protocolo supervisionado', assignee: 'pje', guardrail: 'Confirmacao forte' },
];

const agoraSeedCards = [
    {
        id: 'agora-pje-consulta',
        column: 'entrada',
        type: 'PJe',
        title: 'Consultar pasta e baixar documentos',
        summary: 'Coleta guiada com confirmacao antes de qualquer acao sensivel.',
        agent: 'Operador PJe',
        guardrail: 'HITL nivel 1',
        priority: 'Alta',
        progress: 18,
        source: 'seed',
    },
    {
        id: 'agora-leitura-autos',
        column: 'especificacao',
        type: 'Analise',
        title: 'Classificar processos e fatos relevantes',
        summary: 'Separar partes, pedidos, eventos e documentos centrais por unidade de trabalho.',
        agent: 'Analista juridico',
        guardrail: 'Somente leitura',
        priority: 'Media',
        progress: 34,
        source: 'seed',
    },
    {
        id: 'agora-prazos',
        column: 'execucao',
        type: 'Risco',
        title: 'Mapear prazos, pendencias e riscos',
        summary: 'Cruzar movimentacoes com regras do fluxo e apontar bloqueios antes da redacao.',
        agent: 'Revisor de prazos',
        guardrail: 'Revisao humana',
        priority: 'Alta',
        progress: 62,
        source: 'seed',
    },
    {
        id: 'agora-minuta',
        column: 'revisao',
        type: 'Peca',
        title: 'Gerar minutas em lote para revisao',
        summary: 'Redacao baseada nos fatos aprovados e no historico do escritorio.',
        agent: 'Redator',
        guardrail: 'Aprovar texto',
        priority: 'Media',
        progress: 78,
        source: 'seed',
    },
    {
        id: 'agora-protocolo',
        column: 'pronto',
        type: 'Entrega',
        title: 'Pacote pronto para protocolo',
        summary: 'Documentos, minutas e checklist reunidos para decisao final.',
        agent: 'Orquestrador',
        guardrail: 'Bloqueio final',
        priority: 'Baixa',
        progress: 100,
        source: 'seed',
    },
];

function initAgoraView() {
    if (!agoraInitialized) {
        agoraInitialized = true;

        const back = btnBack();
        if (back) back.addEventListener('click', showAgoraList);

        const newBtn = btnNewTask();
        if (newBtn) newBtn.addEventListener('click', showAgoraTaskDialog);

        const refreshBtn = document.getElementById('btn-agora-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', refreshAgoraBoard);

        if (window.agoraApi && window.agoraApi.onAgoraEvent) {
            window.agoraApi.onAgoraEvent(() => refreshAgoraBoard());
        }
    }

    showAgoraList();
    refreshAgoraBoard();
}

function showAgoraList() {
    const container = agoraList();
    const title = agoraTitle();
    const back = btnBack();

    if (container) container.classList.remove('hidden');
    if (back) back.classList.add('hidden');
    if (title) title.textContent = 'Ágora';
}

async function refreshAgoraList() {
    await refreshAgoraBoard();
}

async function refreshAgoraBoard() {
    const container = agoraList();
    if (!container) return;

    if (window.agoraApi && window.agoraApi.listCards) {
        try {
            const savedCards = await window.agoraApi.listCards();
            agoraPersistedCards = Array.isArray(savedCards) ? savedCards : [];
        } catch (e) {
            console.warn('[Agora] Failed to list persisted cards:', e);
            agoraPersistedCards = [];
        }
    }

    const fallbackCards = agoraPersistedCards.length || agoraLocalCards.length ? [] : agoraSeedCards;
    const cards = dedupeAgoraCards([...agoraPersistedCards, ...agoraLocalCards, ...fallbackCards]);

    if (!cards.some(card => card.id === agoraSelectedCardId)) {
        agoraSelectedCardId = cards[0] ? cards[0].id : null;
    }

    container.innerHTML = renderAgoraBoard(cards);
    bindAgoraBoard(cards);
}

function dedupeAgoraCards(cards) {
    const seen = new Set();
    return cards.filter((card) => {
        if (!card || !card.id || seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
    });
}

function renderAgoraBoard(cards) {
    const activeCount = cards.filter(card => card.column !== 'pronto').length;
    const reviewCount = cards.filter(card => card.column === 'revisao').length;
    const completeCount = cards.filter(card => card.column === 'pronto').length;
    const selectedCard = cards.find(card => card.id === agoraSelectedCardId) || cards[0];

    return `
        <div class="agora-shell">
            <section class="agora-overview" aria-label="Resumo do quadro">
                <div class="agora-metric">
                    <span class="agora-metric-label">Ativas</span>
                    <strong>${activeCount}</strong>
                </div>
                <div class="agora-metric">
                    <span class="agora-metric-label">Em revisao</span>
                    <strong>${reviewCount}</strong>
                </div>
                <div class="agora-metric">
                    <span class="agora-metric-label">Prontas</span>
                    <strong>${completeCount}</strong>
                </div>
                <div class="agora-metric agora-metric-wide">
                    <span class="agora-metric-label">Modo</span>
                    <strong>Workflow Hermes supervisionado</strong>
                </div>
            </section>

            <div class="agora-workspace">
                <div class="agora-board" aria-label="Quadro Agora">
                    ${agoraColumns.map(column => renderAgoraColumn(column, cards)).join('')}
                </div>
                <aside class="agora-inspector" aria-label="Detalhe da tarefa">
                    ${renderAgoraInspector(selectedCard)}
                </aside>
            </div>
        </div>
    `;
}

function renderAgoraColumn(column, cards) {
    const columnCards = cards.filter(card => card.column === column.id);
    return `
        <section class="agora-column agora-column-${column.tone}">
            <header class="agora-column-header">
                <span>${column.label}</span>
                <strong>${columnCards.length}</strong>
            </header>
            <div class="agora-column-body">
                ${columnCards.length
                    ? columnCards.map(renderAgoraCard).join('')
                    : '<div class="agora-empty-lane">Sem tarefas</div>'}
            </div>
        </section>
    `;
}

function renderAgoraCard(card) {
    const selected = card.id === agoraSelectedCardId ? ' selected' : '';
    const priorityClass = String(card.priority || '').toLowerCase();
    const movable = card.source === 'local' || card.source === 'engine' || String(card.id).startsWith('agora-local-');
    const canMoveBack = movable && getAgoraColumnIndex(card.column) > 0;
    const canMoveNext = movable && getAgoraColumnIndex(card.column) < agoraColumns.length - 1;

    return `
        <article class="agora-card${selected}" data-agora-card="${escapeHtml(card.id)}" tabindex="0">
            <div class="agora-card-top">
                <span class="agora-card-type">${escapeHtml(card.type)}</span>
                <span class="agora-priority agora-priority-${priorityClass}">${escapeHtml(card.priority)}</span>
            </div>
            <h3>${escapeHtml(card.title)}</h3>
            <p>${escapeHtml(card.summary)}</p>
            <div class="agora-progress-line" aria-hidden="true">
                <span style="width:${Math.max(0, Math.min(100, card.progress || 0))}%"></span>
            </div>
            <div class="agora-card-meta">
                <span>${escapeHtml(card.agent)}</span>
                <span>${escapeHtml(card.guardrail)}</span>
            </div>
            <div class="agora-card-actions">
                <button data-agora-move="${escapeHtml(card.id)}" data-direction="-1" ${canMoveBack ? '' : 'disabled'} title="Mover para etapa anterior">
                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                <button data-agora-move="${escapeHtml(card.id)}" data-direction="1" ${canMoveNext ? '' : 'disabled'} title="Mover para proxima etapa">
                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            </div>
        </article>
    `;
}

function renderAgoraInspector(card) {
    if (!card) {
        return '<div class="agora-inspector-empty">Selecione uma tarefa</div>';
    }

    const comments = Array.isArray(card.comments) ? card.comments.slice(-4).reverse() : [];
    const events = Array.isArray(card.events) ? card.events.slice(-5).reverse() : [];

    return `
        <div class="agora-inspector-kicker">${escapeHtml(card.type)}</div>
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.summary)}</p>
        <div class="agora-inspector-grid">
            <span>Agente</span><strong>${escapeHtml(card.agent)}</strong>
            <span>Controle</span><strong>${escapeHtml(card.guardrail)}</strong>
            <span>Prioridade</span><strong>${escapeHtml(card.priority)}</strong>
            <span>Progresso</span><strong>${Math.round(card.progress || 0)}%</strong>
        </div>
        <section class="agora-inspector-section">
            <h4>Comentarios</h4>
            <div class="agora-comment-list">
                ${comments.length ? comments.map(renderAgoraComment).join('') : '<div class="agora-muted-row">Sem comentarios</div>'}
            </div>
        </section>
        <section class="agora-inspector-section">
            <h4>Eventos</h4>
            <div class="agora-event-list">
                ${events.length ? events.map(renderAgoraEvent).join('') : '<div class="agora-muted-row">Sem eventos</div>'}
            </div>
        </section>
        <section class="agora-inspector-section">
            <h4>Workers</h4>
            <div class="agora-run-list" id="agora-run-list">
                ${renderAgoraRuns(card)}
            </div>
        </section>
        ${renderAgoraCommentComposer(card)}
        <div class="agora-inspector-footer">
            <button class="agora-secondary-btn" id="btn-agora-comment" data-card-id="${escapeHtml(card.id)}">Comentar</button>
            <button class="agora-secondary-btn" id="btn-agora-open-console" data-card-id="${escapeHtml(card.id)}">Abrir no Console</button>
        </div>
    `;
}

function renderAgoraRuns(card) {
    const runs = Array.isArray(card.runs) ? card.runs.slice(-4).reverse() : [];
    const log = String(card.workerLog || '').trim();
    if (!runs.length && !log) return '<div class="agora-muted-row">Sem workers ainda</div>';
    const renderedRuns = runs.map((run) => {
        const status = run.outcome || run.status || 'active';
        const pid = run.worker_pid ? `pid ${run.worker_pid}` : 'sem pid';
        const profile = run.profile || card.agent || '-';
        const started = formatAgoraDate(run.started_at);
        const detail = run.summary || run.error || '';
        return `
            <div class="agora-run">
                <div>
                    <strong>#${escapeHtml(run.id)} ${escapeHtml(status)}</strong>
                    <span>@${escapeHtml(profile)} · ${escapeHtml(pid)} · ${escapeHtml(started)}</span>
                </div>
                ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
            </div>
        `;
    }).join('');
    const renderedLog = log
        ? `<pre class="agora-worker-log">${escapeHtml(log.slice(-4000))}</pre>`
        : '';
    return `${renderedRuns}${renderedLog}`;
}

function renderAgoraCommentComposer(card) {
    if (!card || agoraCommentCardId !== card.id) return '';
    return `
        <section class="agora-comment-composer" data-comment-card="${escapeHtml(card.id)}">
            <textarea id="agora-comment-input" rows="3" placeholder="Escreva um comentario para o Kanban"></textarea>
            <div class="agora-comment-actions">
                <button class="agora-secondary-btn" id="btn-agora-comment-cancel" type="button">Cancelar</button>
                <button class="agora-secondary-btn agora-secondary-btn-primary" id="btn-agora-comment-send" type="button">Enviar</button>
            </div>
        </section>
    `;
}

function renderAgoraComment(comment) {
    return `
        <div class="agora-comment">
            <div>
                <strong>${escapeHtml(comment.author || 'agent')}</strong>
                <span>${escapeHtml(formatAgoraDate(comment.created_at || comment.createdAt))}</span>
            </div>
            <p>${escapeHtml(comment.body || '')}</p>
        </div>
    `;
}

function renderAgoraEvent(event) {
    return `
        <div class="agora-event">
            <span>${escapeHtml(event.kind || 'evento')}</span>
            <small>${escapeHtml(formatAgoraDate(event.created_at || event.createdAt))}</small>
        </div>
    `;
}

function bindAgoraBoard(cards) {
    const container = agoraList();
    if (!container) return;

    container.querySelectorAll('[data-agora-card]').forEach(cardEl => {
        const select = () => {
            agoraSelectedCardId = cardEl.getAttribute('data-agora-card');
            container.innerHTML = renderAgoraBoard(cards);
            bindAgoraBoard(cards);
        };
        cardEl.addEventListener('click', select);
        cardEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                select();
            }
        });
    });

    container.querySelectorAll('[data-agora-move]').forEach(button => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            moveAgoraCard(
                button.getAttribute('data-agora-move'),
                Number(button.getAttribute('data-direction') || 0)
            );
        });
    });

    const consoleBtn = document.getElementById('btn-agora-open-console');
    if (consoleBtn) {
        consoleBtn.addEventListener('click', () => openAgoraCardInConsole(consoleBtn.getAttribute('data-card-id'), cards));
    }

    const commentBtn = document.getElementById('btn-agora-comment');
    if (commentBtn) {
        commentBtn.addEventListener('click', () => showAgoraCommentComposer(commentBtn.getAttribute('data-card-id'), cards));
    }

    const commentCancel = document.getElementById('btn-agora-comment-cancel');
    if (commentCancel) {
        commentCancel.addEventListener('click', () => {
            agoraCommentCardId = null;
            container.innerHTML = renderAgoraBoard(cards);
            bindAgoraBoard(cards);
        });
    }

    const commentSend = document.getElementById('btn-agora-comment-send');
    if (commentSend) {
        commentSend.addEventListener('click', () => submitAgoraComment(commentSend));
    }
}

function showAgoraCommentComposer(cardId, cards = []) {
    if (!cardId) return;
    agoraCommentCardId = cardId;
    const container = agoraList();
    if (!container) return;
    container.innerHTML = renderAgoraBoard(cards);
    bindAgoraBoard(cards);
    setTimeout(() => document.getElementById('agora-comment-input')?.focus(), 50);
}

async function openAgoraCardInConsole(cardId, cards = []) {
    if (!cardId) return;

    let card = findAgoraCard(cardId, cards);
    if (window.agoraApi && window.agoraApi.getCard) {
        try {
            const persisted = await window.agoraApi.getCard(cardId);
            if (persisted && persisted.id) card = persisted;
        } catch (e) {
            console.warn('[Agora] getCard failed before console handoff:', e);
        }
    }
    if (!card) return;

    const navTerminal = document.getElementById('nav-terminal');
    if (navTerminal) navTerminal.click();

    const prompt = buildAgoraConsolePrompt(card);
    setTimeout(() => {
        if (typeof window.lexTerminalSendPrompt === 'function') {
            window.lexTerminalSendPrompt(prompt, { mode: 'engine', delayMs: 450 }).catch((e) => {
                console.warn('[Agora] Failed to send card prompt to Console Lex:', e);
            });
        } else {
            console.warn('[Agora] Console Lex prompt bridge is not available yet.');
        }
    }, 150);
}

function findAgoraCard(cardId, cards = []) {
    return cards.find(item => item.id === cardId)
        || agoraPersistedCards.find(item => item.id === cardId)
        || agoraLocalCards.find(item => item.id === cardId)
        || agoraSeedCards.find(item => item.id === cardId)
        || null;
}

function buildAgoraConsolePrompt(card) {
    return `/kanban show ${card.id}`;
}

async function submitAgoraComment(button) {
    const composer = button?.closest?.('[data-comment-card]');
    const cardId = composer?.getAttribute('data-comment-card');
    if (!cardId) return;
    const input = document.getElementById('agora-comment-input');
    const body = input ? input.value : '';
    if (!body || !body.trim()) return;

    button.disabled = true;
    if (window.agoraApi && window.agoraApi.commentCard) {
        try {
            await window.agoraApi.commentCard(cardId, body.trim(), 'Electron');
            agoraCommentCardId = null;
            await refreshAgoraBoard();
        } catch (e) {
            console.warn('[Agora] commentCard failed:', e);
        } finally {
            button.disabled = false;
        }
    }
}

function showAgoraTaskDialog() {
    closeAgoraTaskDialog();
    const modal = document.createElement('div');
    modal.className = 'agora-task-modal';
    modal.innerHTML = `
        <div class="agora-task-modal-backdrop" data-agora-task-close></div>
        <form class="agora-task-modal-panel" id="agora-task-form">
            <header class="agora-task-modal-header">
                <div>
                    <span>Agora</span>
                    <h3>Nova tarefa complexa</h3>
                </div>
                <button type="button" class="agora-task-modal-close" data-agora-task-close aria-label="Fechar">x</button>
            </header>
            <div class="agora-task-modal-body">
                <label class="agora-task-field agora-task-field-wide">
                    <span>Objetivo</span>
                    <input name="title" type="text" maxlength="180" required placeholder="Ex: analisar pasta PJe com 50 processos">
                </label>
                <label class="agora-task-field">
                    <span>Tipo</span>
                    <select name="type">
                        ${agoraWorkflowTypes.map(type => `<option value="${escapeHtml(type.value)}">${escapeHtml(type.label)}</option>`).join('')}
                    </select>
                </label>
                <label class="agora-task-field">
                    <span>Prioridade</span>
                    <select name="priority">
                        <option>Media</option>
                        <option>Alta</option>
                        <option>Baixa</option>
                    </select>
                </label>
                <label class="agora-task-field">
                    <span>Perfil</span>
                    <select name="assignee">
                        <option value="default">default</option>
                        <option value="research">research</option>
                        <option value="document">document</option>
                        <option value="pje">pje</option>
                    </select>
                </label>
                <label class="agora-task-field">
                    <span>Entrada</span>
                    <select name="column">
                        <option value="entrada">Entrada</option>
                        <option value="especificacao">Especificacao</option>
                        <option value="pronto_execucao">Pronto p/ execucao</option>
                    </select>
                </label>
                <label class="agora-task-field">
                    <span>Unidades</span>
                    <input name="units" type="number" min="1" max="500" step="1" placeholder="1">
                </label>
                <label class="agora-task-field">
                    <span>Controle</span>
                    <select name="guardrail">
                        <option>Revisao humana</option>
                        <option>Somente leitura</option>
                        <option>Conferir fontes</option>
                        <option>Aprovar texto</option>
                        <option>Confirmacao forte</option>
                    </select>
                </label>
                <label class="agora-task-field agora-task-field-wide">
                    <span>Escopo</span>
                    <textarea name="summary" rows="4" maxlength="1200" placeholder="Inclua limites, documentos, prazos, cliente/caso e qualquer bloqueio humano esperado."></textarea>
                </label>
            </div>
            <footer class="agora-task-modal-footer">
                <button type="button" class="agora-secondary-btn" data-agora-task-close>Cancelar</button>
                <button type="submit" class="agora-secondary-btn agora-secondary-btn-primary">Criar</button>
            </footer>
        </form>
    `;
    document.body.appendChild(modal);

    const typeSelect = modal.querySelector('[name="type"]');
    const assigneeSelect = modal.querySelector('[name="assignee"]');
    const guardrailSelect = modal.querySelector('[name="guardrail"]');
    typeSelect?.addEventListener('change', () => {
        const selected = agoraWorkflowTypes.find(type => type.value === typeSelect.value);
        if (!selected) return;
        if (assigneeSelect) assigneeSelect.value = selected.assignee;
        if (guardrailSelect) guardrailSelect.value = selected.guardrail;
    });

    modal.querySelectorAll('[data-agora-task-close]').forEach(button => {
        button.addEventListener('click', closeAgoraTaskDialog);
    });

    modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAgoraTaskDialog();
    });

    modal.querySelector('#agora-task-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const submit = form.querySelector('button[type="submit"]');
        const input = buildAgoraTaskInput(new FormData(form));
        if (!input.title) return;
        if (submit) submit.disabled = true;
        try {
            await addAgoraLocalTask(input);
            closeAgoraTaskDialog();
        } finally {
            if (submit) submit.disabled = false;
        }
    });

    setTimeout(() => modal.querySelector('[name="title"]')?.focus(), 30);
}

function closeAgoraTaskDialog() {
    document.querySelector('.agora-task-modal')?.remove();
}

function buildAgoraTaskInput(formData) {
    const type = String(formData.get('type') || 'Workflow').trim();
    const selected = agoraWorkflowTypes.find(item => item.value === type) || agoraWorkflowTypes[0];
    const title = String(formData.get('title') || '').trim();
    const rawSummary = String(formData.get('summary') || '').trim();
    const units = Math.max(1, Math.min(500, Number(formData.get('units') || 1) || 1));
    const guardrail = String(formData.get('guardrail') || selected.guardrail).trim();
    const assignee = String(formData.get('assignee') || selected.assignee || 'default').trim();
    const column = String(formData.get('column') || 'entrada').trim();
    const priority = String(formData.get('priority') || 'Media').trim();
    const summaryParts = [
        rawSummary || 'Workflow duravel para decomposicao pelo Hermes em etapas, agentes e checkpoints.',
        `Unidades estimadas: ${units}.`,
        `Controle humano: ${guardrail}.`,
    ];

    return {
        column,
        type,
        title,
        summary: summaryParts.join('\n'),
        body: summaryParts.join('\n'),
        assignee,
        agent: assignee,
        guardrail,
        priority,
        progress: column === 'pronto_execucao' ? 40 : column === 'especificacao' ? 25 : 5,
        source: 'engine',
    };
}

async function addAgoraLocalTask(input) {
    const taskInput = input || buildAgoraTaskInput(new FormData());

    if (window.agoraApi && window.agoraApi.createCard) {
        try {
            const card = await window.agoraApi.createCard(taskInput);
            if (card && card.id) agoraSelectedCardId = card.id;
            await refreshAgoraBoard();
            return;
        } catch (e) {
            console.warn('[Agora] createCard failed, using local fallback:', e);
        }
    }

    const id = `agora-local-${Date.now()}`;
    agoraLocalCards.unshift({
        id,
        ...taskInput,
        source: 'local',
    });
    agoraSelectedCardId = id;
    refreshAgoraBoard();
}

async function moveAgoraCard(cardId, direction) {
    if (window.agoraApi && window.agoraApi.moveCard) {
        const persisted = agoraPersistedCards.find(item => item.id === cardId);
        if (persisted) {
            try {
                const card = await window.agoraApi.moveCard(cardId, direction);
                if (card && card.id) agoraSelectedCardId = card.id;
                await refreshAgoraBoard();
                return;
            } catch (e) {
                console.warn('[Agora] moveCard failed:', e);
            }
        }
    }

    const card = agoraLocalCards.find(item => item.id === cardId);
    if (!card) return;

    const index = getAgoraColumnIndex(card.column);
    const next = agoraColumns[index + direction];
    if (!next) return;

    card.column = next.id;
    card.progress = Math.max(5, Math.min(100, card.progress + (direction > 0 ? 20 : -20)));
    if (next.id === 'pronto') card.progress = 100;
    agoraSelectedCardId = card.id;
    refreshAgoraBoard();
}

function getAgoraColumnIndex(columnId) {
    return Math.max(0, agoraColumns.findIndex(column => column.id === columnId));
}

function formatAgoraDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
