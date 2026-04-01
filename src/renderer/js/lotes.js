// ============================================================================
// LOTES (Producao em Lote) — UI Controller
// ============================================================================

let lotesInitialized = false;
let currentLoteId = null;
let lotesData = [];

// Editor state
let quillInstance = null;
let currentEditorItem = null;
let currentEditorFilePath = null;
let editorOriginalHtml = '';
// Live reasoning during wave execution (keyed by workerIndex)
const liveReasoningSteps = new Map();

// ─── DOM Refs ───────────────────────────────────────────────────────
const lotesList = () => document.getElementById('lotes-list');
const loteDetail = () => document.getElementById('lote-detail');
const lotesTitle = () => document.getElementById('lotes-title');
const btnBack = () => document.getElementById('btn-back-lotes');
const btnNewLote = () => document.getElementById('btn-new-lote');
const itemDrawer = () => document.getElementById('lote-item-drawer');

// ─── Init ───────────────────────────────────────────────────────────

function initLotesView() {
    if (lotesInitialized) {
        refreshLotesList();
        return;
    }
    lotesInitialized = true;

    // Back button
    const back = btnBack();
    if (back) back.addEventListener('click', showLotesList);

    // New lote button
    const newBtn = btnNewLote();
    if (newBtn) newBtn.addEventListener('click', promptNewLote);

    // Real-time events
    setupBatchEvents();

    refreshLotesList();
}

// ─── Event Listener ─────────────────────────────────────────────────

function setupBatchEvents() {
    if (!window.batchApi || !window.batchApi.onBatchEvent) return;

    window.batchApi.onBatchEvent((event) => {
        console.log('[Lotes] BatchEvent:', event.type, event);

        switch (event.type) {
            case 'lote_created':
            case 'lote_completed':
            case 'lote_paused':
            case 'lote_resumed':
            case 'lote_cancelled':
            case 'lote_error':
                refreshLotesList();
                if (currentLoteId === event.loteId) refreshLoteDetail(event.loteId);
                break;

            case 'strategy_ready':
                if (currentLoteId === event.loteId) refreshLoteDetail(event.loteId);
                break;

            case 'strategy_approved':
            case 'wave_started':
            case 'wave_completed':
            case 'audit_ready':
            case 'wave_approved':
            case 'redraft_started':
            case 'redraft_completed':
            case 'protocol_pending':
            case 'protocol_started':
            case 'protocol_completed':
                refreshLotesList();
                if (currentLoteId === event.loteId) refreshLoteDetail(event.loteId);
                break;

            case 'worker_reasoning_step':
                if (currentLoteId === event.loteId) appendLiveReasoningStep(event.data);
                break;

            case 'worker_progress':
            case 'worker_completed':
            case 'worker_failed':
                if (currentLoteId === event.loteId) updateWorkerProgress(event);
                break;

            case 'protocol_item':
                if (currentLoteId === event.loteId) updateProtocolItem(event);
                break;
        }
    });
}

// ─── List View ──────────────────────────────────────────────────────

async function refreshLotesList() {
    if (!window.batchApi) return;
    try {
        lotesData = await window.batchApi.listLotes();
    } catch (e) {
        console.error('[Lotes] Failed to list:', e);
        lotesData = [];
    }
    renderLotesList();
}

function renderLotesList() {
    const container = lotesList();
    if (!container) return;

    if (!lotesData || lotesData.length === 0) {
        container.innerHTML = `
            <div class="lotes-empty">
                <p>Nenhum lote criado.</p>
                <p class="text-muted">Inicie um lote no chat ou clique em "+ Novo Lote".</p>
            </div>`;
        return;
    }

    // Sort: active first, then by date desc
    const sorted = [...lotesData].sort((a, b) => {
        const activeStates = ['producing', 'wave_review', 'strategy_pending', 'protocoling', 'redrafting'];
        const aActive = activeStates.includes(a.status) ? 0 : 1;
        const bActive = activeStates.includes(b.status) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    container.innerHTML = `<div class="lotes-grid">${sorted.map(renderLoteCard).join('')}</div>`;

    // Click handlers
    container.querySelectorAll('.lote-card').forEach(card => {
        card.addEventListener('click', () => showLoteDetail(card.dataset.id));
    });
}

function renderLoteCard(lote) {
    const progress = computeProgress(lote);
    const statusBadge = getStatusBadge(lote.status);
    const timeAgo = formatTimeAgo(lote.updatedAt);

    return `
        <div class="lote-card" data-id="${lote.id}">
            <div class="lote-card-info">
                <div class="lote-card-name">${escapeHtml(lote.nome)}</div>
                <div class="lote-card-meta">
                    ${lote.totalProcessos} processos &middot; ${timeAgo}
                </div>
            </div>
            <div class="lote-card-progress">
                <div class="progress-bar">
                    <div class="progress-fill ${progress >= 100 ? 'completed' : ''}"
                         style="width: ${progress}%"></div>
                </div>
                <div class="progress-text">${Math.round(progress)}%</div>
            </div>
            ${statusBadge}
        </div>`;
}

// ─── Detail View ────────────────────────────────────────────────────

async function showLoteDetail(loteId) {
    currentLoteId = loteId;
    const detail = loteDetail();
    const list = lotesList();
    const title = lotesTitle();
    const back = btnBack();

    if (list) list.classList.add('hidden');
    if (detail) detail.classList.remove('hidden');
    if (back) back.classList.remove('hidden');

    await refreshLoteDetail(loteId);

    if (title) {
        const lote = lotesData.find(l => l.id === loteId);
        title.textContent = lote ? lote.nome : 'Detalhe do Lote';
    }
}

function showLotesList() {
    currentLoteId = null;
    const detail = loteDetail();
    const list = lotesList();
    const title = lotesTitle();
    const back = btnBack();
    const drawer = itemDrawer();

    if (list) list.classList.remove('hidden');
    if (detail) detail.classList.add('hidden');
    if (back) back.classList.add('hidden');
    if (drawer) drawer.classList.remove('open');
    if (title) title.textContent = 'Producao em Lote';

    refreshLotesList();
}

async function refreshLoteDetail(loteId) {
    if (!window.batchApi) return;
    let lote;
    try {
        lote = await window.batchApi.getLote(loteId);
    } catch (e) {
        console.error('[Lotes] Failed to get lote:', e);
        return;
    }
    if (!lote) return;

    const detail = loteDetail();
    if (!detail) return;

    detail.innerHTML = renderDetailContent(lote);
    bindDetailActions(lote);
}

function renderDetailContent(lote) {
    const progress = computeProgress(lote);
    const statusBadge = getStatusBadge(lote.status);

    let content = `
        <div class="lote-detail-header">
            <h3>${escapeHtml(lote.nome)}</h3>
            ${statusBadge}
        </div>
        <div style="margin-bottom:16px;">
            <div class="progress-bar" style="height:8px;">
                <div class="progress-fill ${progress >= 100 ? 'completed' : ''}"
                     style="width:${progress}%"></div>
            </div>
            <div class="progress-text">${Math.round(progress)}% &middot; ${lote.totalProcessos} processos</div>
        </div>`;

    // Strategy section
    if (lote.status === 'strategy_pending') {
        content += renderStrategyReview(lote);
    }

    // Waves
    if (lote.waves && lote.waves.length > 0) {
        content += lote.waves.map((wave, i) => renderWaveCard(lote, wave, i)).join('');
    }

    // Protocol section
    if (lote.status === 'protocol_pending') {
        content += renderProtocolView(lote);
    }

    // Protocol results
    if (lote.protocolResults && lote.protocolResults.length > 0) {
        content += renderProtocolResults(lote);
    }

    // Action buttons
    content += renderDetailActions(lote);

    // Error
    if (lote.error) {
        content += `<div class="audit-warnings" style="margin-top:16px;">
            <div class="audit-warning-item">Erro: ${escapeHtml(lote.error)}</div>
        </div>`;
    }

    return content;
}

// ─── Strategy Review ────────────────────────────────────────────────

function renderStrategyReview(lote) {
    const s = lote.strategy;
    if (!s) return '';

    return `
        <div class="audit-card">
            <div class="audit-card-header">
                <h4>Estrategia Proposta</h4>
                <span class="badge badge-strategy">Aguardando Aprovacao</span>
            </div>
            <div class="drawer-body" style="padding:0;">
                <div class="drawer-field">
                    <div class="drawer-field-label">Tipo de Peticao</div>
                    <div class="drawer-field-value">${escapeHtml(s.tipoPeticao || '-')}</div>
                </div>
                <div class="drawer-field">
                    <div class="drawer-field-label">Persona</div>
                    <div class="drawer-field-value">${escapeHtml(s.persona?.papel || '-')} &middot; Tom: ${escapeHtml(s.persona?.tom || '-')}</div>
                </div>
                <div class="drawer-field">
                    <div class="drawer-field-label">Tese Mestra</div>
                    <div class="drawer-field-value">${escapeHtml(s.teseMestra || '-')}</div>
                </div>
                <div class="drawer-field">
                    <div class="drawer-field-label">Fundamentos</div>
                    <div class="drawer-field-value">${(s.fundamentos || []).map(f => escapeHtml(f)).join('<br>')}</div>
                </div>
                <div class="drawer-field">
                    <div class="drawer-field-label">Processos</div>
                    <div class="drawer-field-value">${(s.processos || []).map(p => escapeHtml(p.numero)).join(', ')}</div>
                </div>
                <div class="drawer-field">
                    <div class="drawer-field-label">Waves</div>
                    <div class="drawer-field-value">${Math.ceil((s.processos?.length || 0) / (s.waveSize || 10))} waves de ${s.waveSize || 10}</div>
                </div>
            </div>
            <div class="audit-actions">
                <button class="btn-success btn-sm" id="btn-approve-strategy">Aprovar Estrategia</button>
                <button class="btn-secondary btn-sm" id="btn-cancel-strategy">Cancelar</button>
            </div>
        </div>`;
}

// ─── Wave Card ──────────────────────────────────────────────────────

function renderWaveCard(lote, wave, index) {
    const isCurrentWave = lote.currentWave === index;
    const isCollapsed = wave.status === 'approved' && !isCurrentWave;
    const statusIcon = getWaveStatusIcon(wave.status);

    let body = '';

    // Items
    if (wave.items && wave.items.length > 0) {
        body += wave.items.map(item => renderItemRow(item, lote.id)).join('');
    } else if (wave.status === 'running') {
        // Show placeholders for running wave
        const ids = wave.processoIds || [];
        body += ids.map(id => `
            <div class="item-row">
                <div class="item-status-icon">...</div>
                <div class="item-name">Processo ${escapeHtml(id)}</div>
                <div class="item-numero">aguardando</div>
            </div>`).join('');
    }

    // Audit section
    if (wave.audit) {
        body += renderAuditCard(wave.audit, index);
    }

    // Wave review actions
    if (wave.status === 'review' && lote.status === 'wave_review') {
        body += `
            <div class="audit-actions" style="margin-top:12px;">
                <button class="btn-success btn-sm btn-approve-wave" data-wave="${index}">Aprovar Wave</button>
                <button class="btn-secondary btn-sm btn-redraft-wave" data-wave="${index}">Re-redigir Marcados</button>
            </div>`;
    }

    return `
        <div class="wave-card" data-wave="${index}">
            <div class="wave-card-header" onclick="toggleWaveCollapse(this)">
                <span>${statusIcon}</span>
                <span class="wave-card-title">Wave ${index + 1} &middot; ${(wave.processoIds || []).length} processos</span>
                ${getStatusBadge(wave.status === 'review' ? 'review' : wave.status)}
            </div>
            <div class="wave-card-body ${isCollapsed ? 'collapsed' : ''}">
                ${body}
            </div>
        </div>`;
}

function toggleWaveCollapse(header) {
    const body = header.nextElementSibling;
    if (body) body.classList.toggle('collapsed');
}

// ─── Item Row ───────────────────────────────────────────────────────

function renderItemRow(item, loteId) {
    const icon = item.status === 'completed' ? '&#10003;' :
                 item.status === 'failed' ? '&#10007;' :
                 item.status === 'needs_redraft' ? '&#9888;' : '...';
    const iconClass = item.status === 'completed' ? 'high' :
                      item.status === 'failed' ? 'low' : 'medium';
    const diffClass = item.diffScore >= 85 ? 'high' :
                      item.diffScore >= 70 ? 'medium' : 'low';

    const hasContent = item.status !== 'failed' && item.peticao;
    const reasoningCount = Array.isArray(item.reasoning) ? item.reasoning.length : 0;

    return `
        <div class="item-row" data-processo="${escapeHtml(item.processoId)}"
             data-lote="${escapeHtml(loteId)}"
             style="cursor:${hasContent ? 'pointer' : 'default'}">
            <div class="item-status-icon ${iconClass}">${icon}</div>
            <div class="item-name">${escapeHtml(item.partes?.autor || item.numero)}</div>
            <div class="item-numero">${escapeHtml(item.numero)}</div>
            ${reasoningCount > 0 ? `<div class="item-reasoning-badge" title="${reasoningCount} passos de raciocinio">${reasoningCount} passos</div>` : ''}
            ${item.diffScore != null ? `<div class="diff-score ${diffClass}">${item.diffScore}%</div>` : ''}
            ${hasContent ? `<div class="item-open-btn">Ver Peticao</div>` : ''}
            ${item.error ? `<div class="item-error-msg">${escapeHtml(item.error)}</div>` : ''}
        </div>`;
}

// ─── Audit Card ─────────────────────────────────────────────────────

function renderAuditCard(audit, waveIndex) {
    let warnings = '';
    if (audit.warnings && audit.warnings.length > 0) {
        warnings = `<div class="audit-warnings">
            ${audit.warnings.map(w => `<div class="audit-warning-item">${escapeHtml(w)}</div>`).join('')}
        </div>`;
    }

    return `
        <div class="audit-card" style="margin-top:12px;">
            <div class="audit-card-header">
                <h4>Auditoria Wave ${waveIndex + 1}</h4>
            </div>
            <div class="audit-stats">
                <div class="audit-stat">
                    <div class="audit-stat-value">${audit.completedCount}</div>
                    <div class="audit-stat-label">Concluidos</div>
                </div>
                <div class="audit-stat">
                    <div class="audit-stat-value">${audit.failedCount}</div>
                    <div class="audit-stat-label">Falhas</div>
                </div>
                <div class="audit-stat">
                    <div class="audit-stat-value">${Math.round(audit.avgDiffScore)}%</div>
                    <div class="audit-stat-label">Diff Medio</div>
                </div>
                <div class="audit-stat">
                    <div class="audit-stat-value">${audit.minDiffScore}%</div>
                    <div class="audit-stat-label">Diff Min</div>
                </div>
            </div>
            ${audit.summary ? `<div class="drawer-preview">${escapeHtml(audit.summary)}</div>` : ''}
            ${warnings}
        </div>`;
}

// ─── Protocol View ──────────────────────────────────────────────────

function renderProtocolView(lote) {
    const totalItems = lote.waves.reduce((sum, w) => sum + (w.items?.length || 0), 0);
    const completedItems = lote.waves.reduce((sum, w) =>
        sum + (w.items?.filter(i => i.status === 'completed')?.length || 0), 0);

    return `
        <div class="protocol-card">
            <h4 style="margin:0 0 12px; color:var(--text-primary);">Peticoes Prontas</h4>
            <div class="protocol-count">${completedItems} peticoes</div>
            <p class="text-muted">${completedItems} de ${totalItems} prontas — clique em "Ver Peticao" nos items acima para revisar e editar</p>
            <div class="protocol-actions">
                <button class="btn-secondary btn-sm" id="btn-export-all-docx">Exportar Todas (DOCX)</button>
                <button class="btn-secondary btn-sm" id="btn-export-all-pdf">Exportar Todas (PDF)</button>
            </div>
            <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border-color);">
                <div class="protocol-warning">Protocolar no PJe (requer browser conectado)</div>
                <p class="text-muted" style="font-size:12px;">Acao irreversivel — so clique se revisou todas as peticoes</p>
                <div class="protocol-actions" style="margin-top:8px;">
                    <button class="btn-danger btn-sm" id="btn-approve-protocol">Protocolar Tudo no PJe</button>
                    <button class="btn-secondary btn-sm" id="btn-protocol-back">Voltar</button>
                </div>
            </div>
        </div>`;
}

function renderProtocolResults(lote) {
    const results = lote.protocolResults || [];
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return `
        <div class="audit-card">
            <div class="audit-card-header">
                <h4>Resultado do Protocolo</h4>
            </div>
            <div class="audit-stats">
                <div class="audit-stat">
                    <div class="audit-stat-value">${success}</div>
                    <div class="audit-stat-label">Sucesso</div>
                </div>
                <div class="audit-stat">
                    <div class="audit-stat-value">${failed}</div>
                    <div class="audit-stat-label">Falhas</div>
                </div>
            </div>
            <div style="margin-top:10px;">
                ${results.map(r => `
                    <div class="item-row">
                        <div class="item-status-icon ${r.success ? 'high' : 'low'}">${r.success ? '&#10003;' : '&#10007;'}</div>
                        <div class="item-name">${escapeHtml(r.numero)}</div>
                        <div class="item-numero">${r.protocolNumber ? 'Protocolo: ' + escapeHtml(r.protocolNumber) : (r.error ? escapeHtml(r.error) : '')}</div>
                    </div>`).join('')}
            </div>
        </div>`;
}

// ─── Detail Actions ─────────────────────────────────────────────────

function renderDetailActions(lote) {
    const actions = [];

    if (['producing', 'wave_review', 'strategy_pending', 'redrafting'].includes(lote.status)) {
        actions.push(`<button class="btn-secondary btn-sm" id="btn-pause-lote">Pausar</button>`);
    }
    if (lote.status === 'paused') {
        actions.push(`<button class="btn-primary btn-sm" id="btn-resume-lote">Retomar</button>`);
    }
    if (!['completed', 'cancelled'].includes(lote.status)) {
        actions.push(`<button class="btn-danger btn-sm" id="btn-cancel-lote">Cancelar</button>`);
    }
    if (['completed', 'cancelled', 'error'].includes(lote.status)) {
        actions.push(`<button class="btn-danger btn-sm" id="btn-remove-lote">Remover</button>`);
    }

    if (actions.length === 0) return '';
    return `<div class="lote-detail-actions" style="margin-top:16px;">${actions.join('')}</div>`;
}

function bindDetailActions(lote) {
    const detail = loteDetail();
    if (!detail) return;

    const bind = (id, fn) => {
        const el = detail.querySelector('#' + id);
        if (el) el.addEventListener('click', fn);
    };

    bind('btn-approve-strategy', () => approveStrategy(lote.id));
    bind('btn-cancel-strategy', () => cancelLote(lote.id));
    bind('btn-approve-protocol', () => approveProtocol(lote.id));
    bind('btn-protocol-back', () => showLotesList());
    bind('btn-export-all-docx', () => exportAllPeticoes(lote, 'docx'));
    bind('btn-export-all-pdf', () => exportAllPeticoes(lote, 'pdf'));
    bind('btn-pause-lote', () => pauseLote(lote.id));
    bind('btn-resume-lote', () => resumeLote(lote.id));
    bind('btn-cancel-lote', () => cancelLote(lote.id));
    bind('btn-remove-lote', async () => {
        await window.batchApi.removeLote(lote.id);
        showLotesList();
    });

    // Wave actions
    detail.querySelectorAll('.btn-approve-wave').forEach(btn => {
        btn.addEventListener('click', () => approveWave(lote.id, parseInt(btn.dataset.wave)));
    });
    detail.querySelectorAll('.btn-redraft-wave').forEach(btn => {
        btn.addEventListener('click', () => {
            const waveIndex = parseInt(btn.dataset.wave);
            const wave = lote.waves[waveIndex];
            if (!wave) return;
            // Redraft items with low diffScore or needs_redraft status
            const redraftIds = (wave.items || [])
                .filter(i => i.status === 'needs_redraft' || i.diffScore < 70)
                .map(i => i.processoId);
            if (redraftIds.length === 0) {
                alert('Nenhum item marcado para re-redacao.');
                return;
            }
            approveWave(lote.id, waveIndex, redraftIds);
        });
    });

    // Event delegation: clique em item-row abre o editor
    detail.addEventListener('click', (e) => {
        const row = e.target.closest('.item-row[data-processo][data-lote]');
        if (!row) return;
        const processoId = row.dataset.processo;
        const rowLoteId = row.dataset.lote;
        if (processoId && rowLoteId) {
            openItemDrawer(rowLoteId, processoId);
        }
    });
}

// ─── Petition Editor (full-screen overlay with Quill.js) ────────
async function openItemDrawer(loteId, processoId) {
    console.log('[Lotes] openItemDrawer:', loteId, processoId);

    let lote;
    try {
        lote = await window.batchApi.getLote(loteId);
    } catch (e) {
        console.error('[Lotes] getLote failed:', e);
        alert('Erro ao carregar lote');
        return;
    }
    if (!lote) {
        console.error('[Lotes] Lote não encontrado:', loteId);
        return;
    }

    // Find item across waves
    let item = null;
    for (const wave of lote.waves) {
        item = (wave.items || []).find(i => i.processoId === processoId);
        if (item) break;
    }
    if (!item) {
        console.error('[Lotes] Item não encontrado:', processoId);
        return;
    }

    // Tentar carregar conteúdo do arquivo OU do campo peticao
    let peticaoHtml = '';

    // 1. Tentar ler do arquivo salvo (fonte mais confiável)
    if (item.arquivo && window.batchApi.readPeticao) {
        try {
            const res = await window.batchApi.readPeticao(item.arquivo);
            if (res.success && res.content) {
                peticaoHtml = res.content;
                console.log('[Lotes] HTML carregado do arquivo:', item.arquivo);
            }
        } catch (e) {
            console.warn('[Lotes] readPeticao falhou:', e);
        }
    }

    // 2. Fallback para o campo peticao no store
    if (!peticaoHtml && item.peticao) {
        peticaoHtml = item.peticao;
        console.log('[Lotes] HTML carregado do store (fallback)');
    }

    if (!peticaoHtml) {
        alert('Petição não disponível. O arquivo pode ter sido movido ou excluído.');
        return;
    }

    openPetitionEditor(item, peticaoHtml);
};

function openPetitionEditor(item, peticaoHtml) {
    currentEditorItem = item;
    currentEditorFilePath = item.arquivo;
    editorOriginalHtml = peticaoHtml;

    const overlay = document.getElementById('petition-editor-overlay');
    if (!overlay) {
        console.error('[Lotes] Overlay #petition-editor-overlay não encontrado no DOM');
        return;
    }

    // Header
    const numero = document.getElementById('petition-editor-numero');
    const badge = document.getElementById('petition-editor-badge');
    if (numero) {
        const partes = item.partes ? ` — ${item.partes.autor} vs ${item.partes.reu}` : '';
        numero.textContent = item.numero + partes;
    }
    if (badge) badge.innerHTML = getStatusBadge(item.status);

    // Reasoning panel
    renderReasoningPanel(item.reasoning);

    // Initialize Quill (once)
    if (!quillInstance) {
        try {
            quillInstance = new Quill('#petition-quill-editor', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'align': [] }],
                        [{ 'indent': '-1' }, { 'indent': '+1' }],
                        ['blockquote'],
                        ['link'],
                        ['clean']
                    ]
                }
            });
            quillInstance.on('text-change', () => {
                const saveBtn = document.getElementById('btn-save-petition');
                if (saveBtn) saveBtn.style.display = '';
            });
            console.log('[Lotes] Quill inicializado');
        } catch (e) {
            console.error('[Lotes] Falha ao inicializar Quill:', e);
            alert('Erro ao inicializar editor: ' + e.message);
            return;
        }
    }

    // Load body content into Quill
    const bodyMatch = peticaoHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : peticaoHtml;
    quillInstance.clipboard.dangerouslyPasteHTML(bodyContent);

    // Show overlay
    overlay.classList.remove('hidden');
    console.log('[Lotes] Editor aberto para:', item.numero);

    // Bind buttons
    bindEditorButtons(item);
}

function renderReasoningPanel(reasoning) {
    const container = document.getElementById('reasoning-steps-container');
    if (!container) return;

    if (!reasoning || !Array.isArray(reasoning) || reasoning.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size:12px;">Nenhum passo de raciocinio disponivel.</p>';
        return;
    }

    container.innerHTML = `<div class="reasoning-accordion">
        ${reasoning.map(step => `
            <details class="reasoning-step">
                <summary data-step="${step.passo || '?'}">${escapeHtml(step.titulo)}</summary>
                <div class="reasoning-step-body">${escapeHtml(step.descricao)}</div>
            </details>
        `).join('')}
    </div>`;
}

function bindEditorButtons(item) {
    // Back
    const backBtn = document.getElementById('btn-editor-back');
    if (backBtn) {
        backBtn.onclick = () => closePetitionEditor();
    }

    // Save
    const saveBtn = document.getElementById('btn-save-petition');
    if (saveBtn) {
        saveBtn.style.display = 'none';
        saveBtn.onclick = async () => {
            if (!quillInstance || !currentEditorFilePath) return;
            const editedBody = quillInstance.root.innerHTML;
            const fullHtml = rebuildFullHtml(editorOriginalHtml, editedBody);
            try {
                await window.batchApi.savePeticao(currentEditorFilePath, fullHtml);
                editorOriginalHtml = fullHtml;
                saveBtn.textContent = 'Salvo!';
                setTimeout(() => { saveBtn.textContent = 'Salvar'; saveBtn.style.display = 'none'; }, 2000);
            } catch (e) {
                alert('Erro ao salvar: ' + (e.message || e));
            }
        };
    }

    // Export DOCX
    const docxBtn = document.getElementById('btn-export-docx');
    if (docxBtn) {
        docxBtn.onclick = async () => {
            if (!currentEditorFilePath) return;
            try {
                const res = await window.batchApi.exportDocx(currentEditorFilePath);
                if (res.success) {
                    docxBtn.textContent = 'Exportado!';
                    setTimeout(() => { docxBtn.textContent = 'DOCX'; }, 2000);
                } else {
                    alert('Erro: ' + res.error);
                }
            } catch (e) {
                alert('Erro ao exportar DOCX: ' + (e.message || e));
            }
        };
    }

    // Export PDF
    const pdfBtn = document.getElementById('btn-export-pdf');
    if (pdfBtn) {
        pdfBtn.onclick = async () => {
            if (!currentEditorFilePath) return;
            try {
                const res = await window.batchApi.exportPdf(currentEditorFilePath);
                if (res.success) {
                    pdfBtn.textContent = 'Exportado!';
                    setTimeout(() => { pdfBtn.textContent = 'PDF'; }, 2000);
                } else {
                    alert('Erro: ' + res.error);
                }
            } catch (e) {
                alert('Erro ao exportar PDF: ' + (e.message || e));
            }
        };
    }
}

function closePetitionEditor() {
    const overlay = document.getElementById('petition-editor-overlay');
    if (overlay) overlay.classList.add('hidden');
    currentEditorItem = null;
    currentEditorFilePath = null;
}

function rebuildFullHtml(originalHtml, newBody) {
    // Replace body content preserving head/styles
    const headMatch = originalHtml.match(/<head[^>]*>[\s\S]*?<\/head>/i);
    const head = headMatch ? headMatch[0] : '<head><meta charset="UTF-8"></head>';
    const commentMatch = originalHtml.match(/<!-- LEX Batch:.*?-->/);
    const comment = commentMatch ? commentMatch[0] + '\n' : '';

    return `<!DOCTYPE html>
<html lang="pt-BR">
${head}
<body>
${comment}${newBody}
</body>
</html>`;
}

// ─── Live Reasoning (during wave execution) ─────────────────────

function appendLiveReasoningStep(data) {
    if (!data || !data.step) return;
    const key = data.workerIndex;
    if (!liveReasoningSteps.has(key)) liveReasoningSteps.set(key, []);
    liveReasoningSteps.get(key).push(data.step);

    // Update UI if detail view is open and wave is running
    const detail = loteDetail();
    if (!detail) return;

    let container = detail.querySelector(`#live-reasoning-${key}`);
    if (!container) {
        // Find the wave card body that's currently running
        const waveCards = detail.querySelectorAll('.wave-card-body');
        const lastCard = waveCards[waveCards.length - 1];
        if (!lastCard) return;

        // Create live reasoning section for this worker
        const section = document.createElement('div');
        section.id = `live-reasoning-${key}`;
        section.style.cssText = 'margin:8px 0;padding:8px;background:rgba(193,154,98,0.05);border-radius:6px;';
        section.innerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600;">
            Processo ${escapeHtml(data.numero || '')} — Raciocinando...
        </div><div class="reasoning-accordion" id="live-steps-${key}"></div>`;
        lastCard.appendChild(section);
        container = section;
    }

    const stepsContainer = container.querySelector(`#live-steps-${key}`);
    if (!stepsContainer) return;

    const step = data.step;
    const el = document.createElement('details');
    el.className = 'reasoning-step reasoning-step-enter';
    el.innerHTML = `<summary data-step="${step.passo || '?'}">${escapeHtml(step.titulo)}</summary>
        <div class="reasoning-step-body">${escapeHtml(step.descricao)}</div>`;
    stepsContainer.appendChild(el);
}

function openFolder(filePath) {
    if (window.batchApi && window.batchApi.openFolder) {
        const dir = filePath.replace(/[\\/][^\\/]+$/, '');
        window.batchApi.openFolder(dir);
    }
}

// ─── Worker Progress (real-time) ────────────────────────────────────

function updateWorkerProgress(event) {
    // For real-time updates during wave execution, just refresh detail
    refreshLoteDetail(event.loteId);
}

function updateProtocolItem(event) {
    refreshLoteDetail(event.loteId);
}

// ─── HITL Actions ───────────────────────────────────────────────────

async function approveStrategy(loteId) {
    try {
        await window.batchApi.approveStrategy(loteId);
    } catch (e) {
        console.error('[Lotes] approveStrategy failed:', e);
    }
}

async function approveWave(loteId, waveIndex, redraftIds) {
    try {
        await window.batchApi.approveWave(loteId, waveIndex, redraftIds || null);
    } catch (e) {
        console.error('[Lotes] approveWave failed:', e);
    }
}

async function approveProtocol(loteId) {
    if (!confirm('Tem certeza? Esta acao ira protocolar todas as peticoes no PJe e e irreversivel.\n\nO browser PJe precisa estar conectado.')) return;
    try {
        await window.batchApi.approveProtocol(loteId);
    } catch (e) {
        console.error('[Lotes] approveProtocol failed:', e);
        alert('Erro ao protocolar: ' + (e.message || e));
    }
}

async function exportAllPeticoes(lote, format) {
    const allItems = lote.waves.flatMap(w => w.items || []);
    const validItems = allItems.filter(i => i.status === 'completed' && i.arquivo);

    if (validItems.length === 0) {
        alert('Nenhuma peticao pronta para exportar.');
        return;
    }

    const exportFn = format === 'docx' ? window.batchApi.exportDocx : window.batchApi.exportPdf;
    let ok = 0, fail = 0;

    for (const item of validItems) {
        try {
            const res = await exportFn(item.arquivo);
            if (res.success) ok++; else fail++;
        } catch {
            fail++;
        }
    }

    alert(`Exportacao ${format.toUpperCase()} concluida:\n${ok} sucesso, ${fail} falhas`);
}

async function pauseLote(loteId) {
    try {
        await window.batchApi.pauseLote(loteId);
    } catch (e) {
        console.error('[Lotes] pauseLote failed:', e);
    }
}

async function resumeLote(loteId) {
    try {
        await window.batchApi.resumeLote(loteId);
    } catch (e) {
        console.error('[Lotes] resumeLote failed:', e);
    }
}

async function cancelLote(loteId) {
    if (!confirm('Cancelar este lote? As peticoes ja geradas serao mantidas nos arquivos.')) return;
    try {
        await window.batchApi.cancelLote(loteId);
    } catch (e) {
        console.error('[Lotes] cancelLote failed:', e);
    }
}

// ─── New Lote ───────────────────────────────────────────────────────

const TIPOS_PETICAO = [
    { value: 'peticao_inicial', label: 'Petição Inicial' },
    { value: 'contestacao', label: 'Contestação' },
    { value: 'recurso_ordinario', label: 'Recurso Ordinário' },
    { value: 'apelacao', label: 'Apelação' },
    { value: 'agravo_instrumento', label: 'Agravo de Instrumento' },
    { value: 'agravo_interno', label: 'Agravo Interno' },
    { value: 'embargos_declaracao', label: 'Embargos de Declaração' },
    { value: 'mandado_seguranca', label: 'Mandado de Segurança' },
    { value: 'recurso_revista', label: 'Recurso de Revista' },
    { value: 'habeas_corpus', label: 'Habeas Corpus' },
    { value: 'reconvencao', label: 'Reconvenção' },
    { value: 'impugnacao', label: 'Impugnação' },
    { value: 'outro', label: 'Outro (especificar)' },
];

function promptNewLote() {
    const backdrop = document.createElement('div');
    backdrop.className = 'lote-modal-backdrop';
    backdrop.innerHTML = `
        <div class="lote-modal lote-modal-wide">
            <h3>Novo Lote de Petições</h3>

            <div class="lote-form-section">
                <label class="lote-form-label">Tipo de Petição <span class="required">*</span></label>
                <select id="lote-tipo-peticao" class="lote-form-select">
                    <option value="">Selecione o tipo...</option>
                    ${TIPOS_PETICAO.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
                </select>
                <input type="text" id="lote-tipo-outro" class="lote-form-input hidden" placeholder="Especifique o tipo de petição">
            </div>

            <div class="lote-form-section">
                <label class="lote-form-label">Contexto / Tese Jurídica <span class="required">*</span></label>
                <textarea id="lote-tese" class="lote-form-textarea" rows="3"
                    placeholder="Descreva a tese principal, o contexto do caso, ou cole um trecho da petição modelo.&#10;Ex: Nulidade da dispensa por justa causa — empregado estável (CIPA). Art. 165 CLT + Súmula 339 TST."></textarea>
                <div class="lote-form-hint-row">
                    <span class="lote-form-hint">Quanto mais contexto, melhor a qualidade das petições.</span>
                    <button type="button" class="btn-link btn-sm" id="lote-attach-doc" title="Anexar documento de referência">
                        + Anexar Documento
                    </button>
                </div>
                <div id="lote-attached-docs" class="lote-attached-docs hidden"></div>
            </div>

            <div class="lote-form-row">
                <div class="lote-form-section lote-form-half">
                    <label class="lote-form-label">Tribunal</label>
                    <input type="text" id="lote-tribunal" class="lote-form-input" placeholder="Ex: TRT-2, TJSP, STJ">
                </div>
                <div class="lote-form-section lote-form-half">
                    <label class="lote-form-label">Tom da Escrita</label>
                    <select id="lote-tom" class="lote-form-select">
                        <option value="formal">Formal e técnico</option>
                        <option value="formal_direto">Formal, porém direto</option>
                        <option value="combativo">Combativo</option>
                        <option value="conciliatorio">Conciliatório</option>
                    </select>
                </div>
            </div>

            <div class="lote-form-section">
                <label class="lote-form-label">Processos / Partes</label>
                <textarea id="lote-processos" class="lote-form-textarea" rows="4"
                    placeholder="Se já tem número(s) de processo, liste aqui (um por linha).&#10;Pode incluir dados extras: número; autor; réu; valor&#10;&#10;Se NÃO tem número, descreva as partes:&#10;Maria Silva vs Empresa X Ltda&#10;&#10;Ou deixe vazio para petição genérica (com placeholders)."></textarea>
                <span class="lote-form-hint">Opcional. Sem número? Descreva as partes ou deixe vazio — a LEX usa placeholders editáveis.</span>
            </div>

            <div class="lote-form-section">
                <label class="lote-form-label">Instruções Adicionais</label>
                <textarea id="lote-instrucoes" class="lote-form-textarea" rows="2"
                    placeholder="Observações, restrições, pedidos específicos... (opcional)"></textarea>
            </div>

            <div class="lote-modal-actions">
                <button class="btn-secondary btn-sm" id="lote-modal-cancel">Cancelar</button>
                <button class="btn-primary btn-sm" id="lote-modal-ok">Criar Lote</button>
            </div>
        </div>`;

    document.body.appendChild(backdrop);

    const selectTipo = backdrop.querySelector('#lote-tipo-peticao');
    const inputOutro = backdrop.querySelector('#lote-tipo-outro');
    const btnOk = backdrop.querySelector('#lote-modal-ok');
    const btnCancel = backdrop.querySelector('#lote-modal-cancel');

    selectTipo.focus();

    // Show/hide "outro" input
    selectTipo.addEventListener('change', () => {
        if (selectTipo.value === 'outro') {
            inputOutro.classList.remove('hidden');
            inputOutro.focus();
        } else {
            inputOutro.classList.add('hidden');
        }
    });

    // ─── Attach document logic ────────────────────────────────
    const attachedDocs = [];
    const attachBtn = backdrop.querySelector('#lote-attach-doc');
    const attachedContainer = backdrop.querySelector('#lote-attached-docs');

    if (attachBtn) {
        attachBtn.addEventListener('click', async () => {
            // Show file picker with workspace documents
            await showDocPicker(backdrop, attachedDocs, attachedContainer);
        });
    }

    function close() { backdrop.remove(); }

    btnCancel.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    btnOk.addEventListener('click', () => {
        // Validate — only tipo and tese are required
        const tipo = selectTipo.value === 'outro' ? inputOutro.value.trim() : selectTipo.value;
        const tese = backdrop.querySelector('#lote-tese').value.trim();
        const processos = backdrop.querySelector('#lote-processos').value.trim();

        if (!tipo) { selectTipo.focus(); selectTipo.style.borderColor = '#e74c3c'; return; }
        if (!tese) { backdrop.querySelector('#lote-tese').focus(); backdrop.querySelector('#lote-tese').style.borderColor = '#e74c3c'; return; }
        // Processos is OPTIONAL now — if empty, will create a single generic petition

        const tribunal = backdrop.querySelector('#lote-tribunal').value.trim();
        const tom = backdrop.querySelector('#lote-tom').value;
        const instrucoes = backdrop.querySelector('#lote-instrucoes').value.trim();

        close();
        createNewLote({
            tipo, tese,
            processos: processos || '[petição solo]',
            tribunal, tom, instrucoes,
            attachedDocs: attachedDocs.map(d => d.path),
        });
    });

    // ESC to close
    backdrop.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
}

/**
 * Mostra picker para selecionar documentos do workspace.
 */
async function showDocPicker(_parentBackdrop, attachedDocs, attachedContainer) {
    // Get workspace paths
    let workspaces = [];
    try {
        workspaces = await window.workspacesApi.get();
    } catch { /* no workspaces */ }

    if (!workspaces || workspaces.length === 0) {
        // Fallback: open native file dialog
        try {
            const filePath = await window.filesApi.selectFile([
                { name: 'Documentos', extensions: ['pdf', 'docx', 'doc', 'txt', 'md'] },
            ]);
            if (filePath) {
                const name = filePath.split(/[/\\]/).pop();
                addAttachedDoc(attachedDocs, attachedContainer, { name, path: filePath });
            }
        } catch {
            alert('Configure um workspace em Configurações > Arquivos para acessar seus documentos.');
        }
        return;
    }

    // List files from workspaces
    const allFiles = [];
    for (const ws of workspaces) {
        try {
            const files = await window.filesApi.listFiles(ws);
            if (Array.isArray(files)) {
                for (const f of files) {
                    if (/\.(pdf|docx|doc|txt|md)$/i.test(f.name || f)) {
                        allFiles.push({
                            name: f.name || f.split(/[/\\]/).pop(),
                            path: f.path || f,
                        });
                    }
                }
            }
        } catch { /* skip */ }
    }

    if (allFiles.length === 0) {
        // Fallback to native dialog
        try {
            const filePath = await window.filesApi.selectFile([
                { name: 'Documentos', extensions: ['pdf', 'docx', 'doc', 'txt', 'md'] },
            ]);
            if (filePath) {
                const name = filePath.split(/[/\\]/).pop();
                addAttachedDoc(attachedDocs, attachedContainer, { name, path: filePath });
            }
        } catch { /* ignore */ }
        return;
    }

    // Create a small inline picker
    const picker = document.createElement('div');
    picker.className = 'lote-doc-picker';
    picker.innerHTML = `
        <div class="lote-doc-picker-header">
            <input type="text" class="lote-doc-search" placeholder="Buscar documento...">
            <button class="btn-link btn-sm lote-doc-browse">Explorar...</button>
        </div>
        <div class="lote-doc-list">
            ${allFiles.slice(0, 50).map((f, i) => `
                <div class="lote-doc-item" data-idx="${i}">
                    <span class="lote-doc-icon">${getFileIcon(f.name)}</span>
                    <span class="lote-doc-name">${f.name}</span>
                </div>
            `).join('')}
        </div>
    `;

    attachedContainer.classList.remove('hidden');
    attachedContainer.before(picker);

    // Search filter
    const searchInput = picker.querySelector('.lote-doc-search');
    searchInput.focus();
    searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        picker.querySelectorAll('.lote-doc-item').forEach(item => {
            const name = item.querySelector('.lote-doc-name').textContent.toLowerCase();
            item.style.display = name.includes(q) ? '' : 'none';
        });
    });

    // Browse button - native file dialog
    picker.querySelector('.lote-doc-browse').addEventListener('click', async () => {
        try {
            const filePath = await window.filesApi.selectFile([
                { name: 'Documentos', extensions: ['pdf', 'docx', 'doc', 'txt', 'md'] },
            ]);
            if (filePath) {
                const name = filePath.split(/[/\\]/).pop();
                addAttachedDoc(attachedDocs, attachedContainer, { name, path: filePath });
            }
        } catch { /* ignore */ }
        picker.remove();
    });

    // Click to select
    picker.addEventListener('click', (e) => {
        const item = e.target.closest('.lote-doc-item');
        if (!item) return;
        const idx = parseInt(item.dataset.idx, 10);
        const file = allFiles[idx];
        if (file) {
            addAttachedDoc(attachedDocs, attachedContainer, file);
        }
        picker.remove();
    });

    // Close picker on outside click (delayed to avoid immediate close)
    setTimeout(() => {
        const closePicker = (e) => {
            if (!picker.contains(e.target) && e.target !== attachedContainer) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        };
        document.addEventListener('click', closePicker);
    }, 100);
}

function getFileIcon(name) {
    if (/\.pdf$/i.test(name)) return '📄';
    if (/\.docx?$/i.test(name)) return '📝';
    if (/\.txt$/i.test(name)) return '📃';
    if (/\.md$/i.test(name)) return '📋';
    return '📎';
}

function addAttachedDoc(attachedDocs, container, file) {
    // Avoid duplicates
    if (attachedDocs.some(d => d.path === file.path)) return;

    attachedDocs.push(file);
    container.classList.remove('hidden');
    renderAttachedDocs(attachedDocs, container);
}

function renderAttachedDocs(attachedDocs, container) {
    container.innerHTML = attachedDocs.map((d, i) => `
        <span class="lote-attached-chip">
            ${getFileIcon(d.name)} ${d.name}
            <span class="lote-attached-remove" data-idx="${i}" title="Remover">&times;</span>
        </span>
    `).join('');

    container.querySelectorAll('.lote-attached-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx, 10);
            attachedDocs.splice(idx, 1);
            renderAttachedDocs(attachedDocs, container);
            if (attachedDocs.length === 0) container.classList.add('hidden');
        });
    });
}

async function createNewLote(formData) {
    if (!window.batchApi) return;
    try {
        // Build structured input for estrategista
        const tipoLabel = TIPOS_PETICAO.find(t => t.value === formData.tipo)?.label || formData.tipo;
        const nome = `${tipoLabel} — ${formData.processos.split('\n')[0].substring(0, 40)}`;

        const result = await window.batchApi.createLote({
            rawInput: formData.processos,
            nome,
            tipoPeticao: formData.tipo,
            tese: formData.tese,
            tribunal: formData.tribunal || '',
            tom: formData.tom || 'formal',
            userInstructions: formData.instrucoes || '',
            attachedDocs: formData.attachedDocs || [],
        });

        if (result && result.loteId) {
            showLoteDetail(result.loteId);
        } else if (result && result.error) {
            alert('Erro: ' + result.error);
        }
    } catch (e) {
        console.error('[Lotes] createLote failed:', e);
        alert('Erro ao criar lote: ' + (e.message || e));
    }
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeProgress(lote) {
    if (!lote) return 0;
    if (lote.status === 'completed') return 100;
    if (lote.status === 'created' || lote.status === 'strategy_pending') return 5;
    if (lote.status === 'strategy_approved') return 10;

    const total = lote.totalProcessos || 1;
    let completed = 0;

    if (lote.waves) {
        for (const wave of lote.waves) {
            if (wave.items) {
                completed += wave.items.filter(i => i.status === 'completed').length;
            }
        }
    }

    // 10-90% for production, 90-100% for protocol
    const prodProgress = 10 + (completed / total) * 80;

    if (lote.status === 'protocol_pending') return 90;
    if (lote.status === 'protocoling') {
        const protocoled = (lote.protocolResults || []).length;
        return 90 + (protocoled / total) * 10;
    }

    return Math.min(prodProgress, 90);
}

function getStatusBadge(status) {
    const map = {
        'created': ['Criado', 'pending'],
        'strategy_pending': ['Estrategia', 'strategy'],
        'strategy_approved': ['Aprovado', 'producing'],
        'producing': ['Produzindo', 'producing'],
        'wave_review': ['Revisao', 'review'],
        'redrafting': ['Re-redacao', 'review'],
        'protocol_pending': ['Protocolar', 'review'],
        'protocoling': ['Protocolando', 'producing'],
        'completed': ['Concluido', 'completed'],
        'paused': ['Pausado', 'paused'],
        'cancelled': ['Cancelado', 'paused'],
        'error': ['Erro', 'error'],
        'pending': ['Pendente', 'pending'],
        'running': ['Executando', 'producing'],
        'review': ['Revisao', 'review'],
        'approved': ['Aprovado', 'completed'],
        'needs_redraft': ['Re-redigir', 'review'],
        'failed': ['Falhou', 'error'],
    };
    const [label, cls] = map[status] || [status, 'pending'];
    return `<span class="badge badge-${cls}">${label}</span>`;
}

function getWaveStatusIcon(status) {
    const icons = {
        'pending': '&#9675;',    // empty circle
        'running': '&#9684;',    // half circle
        'review': '&#9888;',     // warning
        'approved': '&#10003;',  // check
        'redrafting': '&#8634;', // refresh
    };
    return icons[status] || '&#9675;';
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min atras`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atras`;
    const days = Math.floor(hours / 24);
    return `${days}d atras`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
