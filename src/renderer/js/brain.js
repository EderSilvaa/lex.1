/**
 * LEX Brain UI — brain.js
 *
 * Force-graph 2D do grafo de conhecimento jurídico.
 * Usa ForceGraph2D (vasturiano/force-graph via force-graph.min.js).
 *
 * initBrainView() — chamado pelo app.js quando o nav-brain é clicado.
 */

(function () {
    'use strict';

    // ========================================================================
    // STATE
    // ========================================================================

    let _graph = null;          // ForceGraph2D instance
    let _graphData = null;      // { nodes, edges }
    let _initialized = false;
    let _searchDebounce = null;

    // Node type → muted colors (aligned with LEX dark theme)
    const TYPE_COLORS = {
        processo:    '#7c6dcf',   // muted violet
        tese:        '#4a9b9b',   // muted teal
        parte:       '#4a7aaa',   // muted blue
        aprendizado: '#9b8a4a',   // muted gold
        tribunal:    '#9b4a6e',   // muted rose
        decisao:     '#4a8a5a',   // muted green
        selector:    '#5a6378',   // slate
        prazo:       '#9b6a4a',   // muted orange
    };

    const DEFAULT_COLOR = '#5a5a8a';

    // ========================================================================
    // INIT
    // ========================================================================

    window.initBrainView = async function () {
        if (_initialized) {
            // Refresh stats on revisit
            _loadStats();
            return;
        }

        _initialized = true;
        _setupSearchBar();
        _setupButtons();
        await _loadGraph();
    };

    // ========================================================================
    // GRAPH LOADING
    // ========================================================================

    async function _loadGraph() {
        const container = document.getElementById('brain-graph');
        if (!container) return;

        // Show loading state
        document.getElementById('brain-stats-text').textContent = 'Carregando grafo...';

        let data;
        try {
            data = await window.brainApi.getGraph();
        } catch (err) {
            _showEmpty(container, 'Erro ao carregar Brain: ' + err.message);
            return;
        }

        if (!data || data.nodes.length === 0) {
            _showEmpty(container, 'Brain vazio. Use o agente (pje_browser_use) para popular com observações reais.');
            return;
        }

        _graphData = data;
        _renderGraph(container, data);
        _loadStats();
    }

    function _renderGraph(container, data) {
        if (typeof ForceGraph !== 'function') {
            _showEmpty(container, 'Biblioteca force-graph não carregada.');
            return;
        }

        // Map edges to links format expected by ForceGraph
        const links = data.edges.map(e => ({
            source: e.sourceId,
            target: e.targetId,
            relation: e.relation,
            weight: e.weight,
        }));

        const nodes = data.nodes.map(n => ({
            id: n.id,
            label: n.label,
            type: n.type,
            confidence: n.confidence,
            data: n.data,
            updatedAt: n.updatedAt,
        }));

        if (_graph) {
            _graph._destructor && _graph._destructor();
        }

        _graph = ForceGraph()(container)
            .width(container.offsetWidth || 800)
            .height(container.offsetHeight || 600)
            .graphData({ nodes, links })
            .nodeId('id')
            .nodeLabel(n => `[${n.type}] ${n.label}`)
            .nodeCanvasObject((node, ctx, globalScale) => {
                const color = TYPE_COLORS[node.type] || DEFAULT_COLOR;
                const r = Math.max(3, 2.5 + (node.confidence || 0.5) * 4);
                const x = node.x || 0;
                const y = node.y || 0;

                // Solid circle
                ctx.beginPath();
                ctx.arc(x, y, r, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();

                // Subtle border
                ctx.beginPath();
                ctx.arc(x, y, r, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(255,255,255,0.12)';
                ctx.lineWidth = 0.5;
                ctx.stroke();

                // Label
                if (globalScale >= 1.2) {
                    const label = node.label.length > 24 ? node.label.substring(0, 24) + '…' : node.label;
                    const fontSize = Math.max(3.5, 9 / globalScale);
                    ctx.font = `${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'rgba(190,190,210,0.75)';
                    ctx.fillText(label, x, y + r + (fontSize * 0.9));
                }
            })
            .nodeCanvasObjectMode(() => 'replace')
            .linkSource('source')
            .linkTarget('target')
            .linkLabel(l => l.relation)
            .linkColor(() => 'rgba(160,160,180,0.15)')
            .linkWidth(0.6)
            .linkDirectionalArrowLength(3)
            .linkDirectionalArrowRelPos(1)
            .linkDirectionalParticles(1)
            .linkDirectionalParticleWidth(1.8)
            .linkDirectionalParticleSpeed(0.004)
            .linkDirectionalParticleColor(() => 'rgba(200,195,230,0.55)')
            .backgroundColor('transparent')
            .onNodeClick((node) => _showNodeDetail(node))
            .onBackgroundClick(() => _hideSidebar());

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            if (_graph) {
                _graph.width(container.offsetWidth);
                _graph.height(container.offsetHeight);
            }
        });
        resizeObserver.observe(container);
    }

    // ========================================================================
    // NODE DETAIL SIDEBAR
    // ========================================================================

    async function _showNodeDetail(node) {
        const sidebar = document.getElementById('brain-sidebar');
        const detail = document.getElementById('brain-node-detail');
        if (!sidebar || !detail) return;

        sidebar.classList.remove('hidden');

        // Get subgraph to show edges
        let subgraph = { nodes: [], edges: [] };
        try {
            subgraph = await window.brainApi.getSubgraph(node.id, 1);
        } catch {}

        const color = TYPE_COLORS[node.type] || DEFAULT_COLOR;

        let html = `
            <div class="brain-node-type-badge" style="background:${color}">${node.type}</div>
            <div class="brain-node-label">${_escHtml(node.label)}</div>
            <div class="brain-node-meta">Confiança: ${((node.confidence || 0.5) * 100).toFixed(0)}%</div>
            <div class="brain-node-meta">Atualizado: ${_formatDate(node.updatedAt)}</div>
        `;

        // Data fields
        if (node.data && typeof node.data === 'object') {
            const dataKeys = Object.keys(node.data).filter(k =>
                !['processoNumero', 'lastUpdated', 'lastSessionId'].includes(k) &&
                node.data[k] !== null && node.data[k] !== undefined
            );
            if (dataKeys.length > 0) {
                html += '<div class="brain-node-meta" style="margin-top:10px">';
                for (const k of dataKeys.slice(0, 6)) {
                    const v = node.data[k];
                    const vStr = typeof v === 'object' ? JSON.stringify(v).substring(0, 60) : String(v).substring(0, 60);
                    html += `<div><strong>${_escHtml(k)}:</strong> ${_escHtml(vStr)}</div>`;
                }
                html += '</div>';
            }
        }

        // Edges
        const outEdges = subgraph.edges.filter(e => e.sourceId === node.id);
        const inEdges = subgraph.edges.filter(e => e.targetId === node.id);

        if (outEdges.length > 0) {
            html += '<div class="brain-node-edges"><h4>Conexões Saindo</h4>';
            for (const edge of outEdges.slice(0, 8)) {
                const target = subgraph.nodes.find(n => n.id === edge.targetId);
                if (target) {
                    html += `<div class="brain-edge-item" data-node-id="${target.id}">
                        <span class="brain-edge-relation">${edge.relation}</span>
                        <span>${_escHtml(target.label)}</span>
                    </div>`;
                }
            }
            html += '</div>';
        }

        if (inEdges.length > 0) {
            html += '<div class="brain-node-edges"><h4>Conexões Entrando</h4>';
            for (const edge of inEdges.slice(0, 8)) {
                const source = subgraph.nodes.find(n => n.id === edge.sourceId);
                if (source) {
                    html += `<div class="brain-edge-item" data-node-id="${source.id}">
                        <span class="brain-edge-relation">${edge.relation}</span>
                        <span>${_escHtml(source.label)}</span>
                    </div>`;
                }
            }
            html += '</div>';
        }

        detail.innerHTML = html;

        // Click on edge item → navigate to that node
        detail.querySelectorAll('.brain-edge-item[data-node-id]').forEach(el => {
            el.addEventListener('click', () => {
                const targetId = el.dataset.nodeId;
                const targetNode = (_graphData?.nodes || []).find(n => n.id === targetId);
                if (targetNode) _showNodeDetail(targetNode);
            });
        });
    }

    function _hideSidebar() {
        const sidebar = document.getElementById('brain-sidebar');
        if (sidebar) sidebar.classList.add('hidden');
    }

    // ========================================================================
    // SEARCH
    // ========================================================================

    function _setupSearchBar() {
        const toggleBtn = document.getElementById('btn-brain-search-toggle');
        const searchBar = document.getElementById('brain-search-bar');
        const searchInput = document.getElementById('brain-search-input');
        const resultsEl = document.getElementById('brain-search-results');

        if (!toggleBtn || !searchBar || !searchInput) return;

        toggleBtn.addEventListener('click', () => {
            searchBar.classList.toggle('hidden');
            if (!searchBar.classList.contains('hidden')) {
                searchInput.focus();
            }
        });

        searchInput.addEventListener('input', () => {
            clearTimeout(_searchDebounce);
            const q = searchInput.value.trim();
            if (!q) { resultsEl.innerHTML = ''; return; }
            _searchDebounce = setTimeout(() => _runSearch(q, resultsEl), 300);
        });
    }

    async function _runSearch(query, resultsEl) {
        try {
            const results = await window.brainApi.search(query, undefined, 10);
            if (!results || results.length === 0) {
                resultsEl.innerHTML = '<div class="brain-search-result-item">Nenhum resultado</div>';
                return;
            }

            resultsEl.innerHTML = results.map(r => `
                <div class="brain-search-result-item" data-node-id="${r.node.id}">
                    <span class="brain-result-type">${r.node.type}</span>
                    <span>${_escHtml(r.node.label.substring(0, 80))}</span>
                </div>
            `).join('');

            resultsEl.querySelectorAll('[data-node-id]').forEach(el => {
                el.addEventListener('click', async () => {
                    const nodeId = el.dataset.nodeId;
                    const node = await window.brainApi.getNode(nodeId);
                    if (node) _showNodeDetail(node);
                    // Focus node in graph
                    if (_graph && _graphData) {
                        const gNode = _graphData.nodes.find(n => n.id === nodeId);
                        if (gNode) {
                            _graph.centerAt(gNode.x || 0, gNode.y || 0, 600);
                            _graph.zoom(4, 600);
                        }
                    }
                });
            });
        } catch (err) {
            resultsEl.innerHTML = `<div class="brain-search-result-item">Erro: ${_escHtml(err.message)}</div>`;
        }
    }

    // ========================================================================
    // DREAM & EXPORT BUTTONS
    // ========================================================================

    function _setupButtons() {
        const dreamBtn = document.getElementById('btn-brain-dream');
        const exportBtn = document.getElementById('btn-brain-export');
        const exportPatternsBtn = document.getElementById('btn-brain-export-patterns');
        const learnBtn = document.getElementById('btn-brain-learn');
        const sidebarClose = document.getElementById('btn-brain-sidebar-close');

        if (dreamBtn && !dreamBtn.dataset.safeDreamBound) {
            dreamBtn.dataset.safeDreamBound = '1';
            dreamBtn.addEventListener('click', async (event) => {
                event.stopImmediatePropagation();
                dreamBtn.disabled = true;
                const orig = dreamBtn.textContent;
                dreamBtn.textContent = 'Preview...';
                try {
                    const preview = await window.brainApi.runDream(_getDreamOptions(true));
                    _renderDreamReport(preview);
                    if (preview && preview.error) {
                        alert('Dream falhou: ' + preview.error);
                        return;
                    }
                    if (preview && preview.skipped) {
                        alert('Dream pulado: ' + (preview.reason || 'ja existe um Dream em execucao'));
                        return;
                    }

                    const total = preview?.totalAffected ?? 0;
                    const ok = confirm(`Dream preview: ${total} mudancas planejadas.\nExecutar agora?`);
                    if (!ok) return;
                    const highRisk = (preview?.reports || []).filter(r => r?.risk?.level === 'high' && !r.skipped);
                    if (highRisk.length > 0) {
                        const risky = highRisk.map(r => r.phase).join(', ');
                        const riskOk = confirm(`Fases de alto risco detectadas: ${risky}.\nConfirmar mesmo assim?`);
                        if (!riskOk) return;
                    }

                    dreamBtn.textContent = 'Rodando...';
                    const result = await window.brainApi.runDream(_getDreamOptions(false));
                    _renderDreamReport(result);
                    if (result && result.error) {
                        alert('Dream falhou: ' + result.error);
                    } else {
                        alert(`Dream completo! ${result?.totalAffected ?? 0} nos afetados. Recarregando grafo...`);
                        _initialized = false;
                        document.getElementById('brain-graph').innerHTML = '';
                        _graph = null;
                        await _loadGraph();
                        await _loadStats();
                        const dash = document.getElementById('brain-dashboard');
                        if (dash && !dash.classList.contains('hidden')) {
                            await _loadDashboard(true);
                            _renderDreamReport(result);
                        }
                    }
                } catch (err) {
                    alert('Dream falhou: ' + err.message);
                } finally {
                    dreamBtn.disabled = false;
                    dreamBtn.textContent = orig;
                }
            }, true);
        }

        if (learnBtn) {
            learnBtn.addEventListener('click', () => _toggleDashboard());
            learnBtn.setAttribute('aria-expanded', 'false');
        }
        if (exportPatternsBtn) {
            exportPatternsBtn.addEventListener('click', async () => {
                exportPatternsBtn.disabled = true;
                const orig = exportPatternsBtn.textContent;
                exportPatternsBtn.textContent = 'Exportando...';
                try {
                    const result = await window.brainApi.exportPatterns();
                    if (result && result.error) alert('Export falhou: ' + result.error);
                    else if (result && result.filePath) alert('Patterns exportados:\n' + result.filePath);
                } catch (err) {
                    alert('Export falhou: ' + err.message);
                } finally {
                    exportPatternsBtn.disabled = false;
                    exportPatternsBtn.textContent = orig;
                }
            });
        }

        const closeDash = document.getElementById('btn-brain-dashboard-close');
        if (closeDash) closeDash.addEventListener('click', () => _toggleDashboard(false));
        _setupDashboardDismiss();
        const refreshDash = document.getElementById('btn-brain-dashboard-refresh');
        if (refreshDash) {
            refreshDash.addEventListener('click', async () => {
                refreshDash.disabled = true;
                const orig = refreshDash.textContent;
                refreshDash.textContent = 'Atualizando...';
                try {
                    await _loadDashboard(true);
                    await _loadStats();
                } finally {
                    refreshDash.disabled = false;
                    refreshDash.textContent = orig;
                }
            });
        }

        const detectBtn = document.getElementById('btn-brain-detect-flows');
        if (detectBtn) {
            detectBtn.addEventListener('click', async () => {
                detectBtn.disabled = true;
                const orig = detectBtn.textContent;
                detectBtn.textContent = 'Detectando...';
                try {
                    const report = await window.brainApi.detectFlows();
                    if (report && report.error) {
                        alert('Detect flows falhou: ' + report.error);
                    } else {
                        const created = report?.flowsCreated ?? 0;
                        const updated = report?.flowsUpdated ?? 0;
                        alert(`Flows: ${created} novos, ${updated} atualizados (walks: ${report?.walksGenerated ?? 0}).`);
                        await _loadDashboard(true);
                        await _loadStats();
                        _initialized = false;
                        const graph = document.getElementById('brain-graph');
                        if (graph) graph.innerHTML = '';
                        _graph = null;
                        await _loadGraph();
                        await _loadStats();
                        const dash = document.getElementById('brain-dashboard');
                        if (dash && !dash.classList.contains('hidden')) {
                            await _loadDashboard(true);
                        }
                    }
                } catch (err) {
                    alert('Falhou: ' + err.message);
                } finally {
                    detectBtn.disabled = false;
                    detectBtn.textContent = orig;
                }
            });
        }

        if (dreamBtn && !dreamBtn.dataset.safeDreamBound) {
            dreamBtn.addEventListener('click', async () => {
                dreamBtn.disabled = true;
                dreamBtn.textContent = 'Rodando...';
                try {
                    const reports = await window.brainApi.runDream();
                    if (reports && reports.error) {
                        alert('Dream falhou: ' + reports.error);
                    } else {
                        const total = (reports || []).reduce((s, r) => s + r.nodesAffected, 0);
                        alert(`Dream completo! ${total} nós afetados. Recarregando grafo...`);
                        _initialized = false;
                        document.getElementById('brain-graph').innerHTML = '';
                        _graph = null;
                        await _loadGraph();
                    }
                } catch (err) {
                    alert('Dream falhou: ' + err.message);
                } finally {
                    dreamBtn.disabled = false;
                    dreamBtn.textContent = 'Dream';
                }
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                exportBtn.disabled = true;
                exportBtn.textContent = 'Exportando...';
                try {
                    const result = await window.brainApi.exportBrain();
                    if (result && result.error) {
                        alert('Export falhou: ' + result.error);
                    } else if (result && result.filePath) {
                        alert(`Brain exportado!\n${result.filePath}\n${result.manifest.nodeCount} nós, ${result.manifest.edgeCount} arestas`);
                    }
                } catch (err) {
                    alert('Export falhou: ' + err.message);
                } finally {
                    exportBtn.disabled = false;
                    exportBtn.textContent = 'Export';
                }
            });
        }

        if (sidebarClose) {
            sidebarClose.addEventListener('click', _hideSidebar);
        }
    }

    // ========================================================================
    // STATS
    // ========================================================================

    async function _loadStats() {
        const el = document.getElementById('brain-stats-text');
        if (!el) return;
        try {
            const stats = await window.brainApi.getStats();
            const parts = [`${stats.nodeCount} nós`, `${stats.edgeCount} arestas`];
            const byType = stats.byType || {};
            for (const [type, count] of Object.entries(byType)) {
                parts.push(`${type}: ${count}`);
            }
            el.textContent = parts.join(' · ');
        } catch {
            el.textContent = '';
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    function _showEmpty(container, msg) {
        container.innerHTML = `<div class="brain-empty"><p>${_escHtml(msg)}</p></div>`;
        document.getElementById('brain-stats-text').textContent = 'Vazio';
    }

    function _escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _formatDate(ts) {
        if (!ts) return '-';
        return new Date(ts).toLocaleDateString('pt-BR');
    }

    // ========================================================================
    // REPLAY PREVIEW MODAL (global, disparado por quem invoca o skill)
    // ========================================================================

    window.showReplayPreview = function showReplayPreview(preview) {
        return new Promise((resolve) => {
            const modal = document.getElementById('replay-preview-modal');
            if (!modal || !preview) return resolve(false);

            const goalEl = document.getElementById('replay-modal-goal');
            const summaryEl = document.getElementById('replay-modal-summary');
            const stepsEl = document.getElementById('replay-modal-steps');
            const confEl = document.getElementById('replay-modal-confidence');
            const btnConfirm = document.getElementById('replay-modal-confirm');
            const btnCancel = document.getElementById('replay-modal-cancel');

            if (goalEl) goalEl.textContent = preview.task || '(sem task)';
            if (summaryEl) summaryEl.textContent = preview.summary || '';
            if (confEl) confEl.textContent = 'confidence ' + (Number(preview.confidence || 0).toFixed(2));

            if (stepsEl) {
                stepsEl.innerHTML = (preview.steps || []).map(s => `
                    <li>
                        <div class="step-head">
                            <code>${_escHtml(s.tool)}</code>
                            <span class="muted">seen ${s.observedCount}×</span>
                        </div>
                        ${s.selector ? `<div class="step-sel">seletor: <code>${_escHtml(s.selector)}</code></div>` : ''}
                        ${s.alternates && s.alternates.length ? `<div class="step-alt muted">alternates: ${s.alternates.map(a => _escHtml(a)).join(', ')}</div>` : ''}
                        ${s.inputPreview ? `<div class="step-input muted">input: ${_escHtml(s.inputPreview)}</div>` : ''}
                        ${s.expected ? `<div class="step-expected muted">→ ${_escHtml(s.expected)}</div>` : ''}
                    </li>
                `).join('');
            }

            modal.classList.remove('hidden');

            const cleanup = () => {
                modal.classList.add('hidden');
                btnConfirm?.removeEventListener('click', onConfirm);
                btnCancel?.removeEventListener('click', onCancel);
            };
            const onConfirm = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };

            btnConfirm?.addEventListener('click', onConfirm);
            btnCancel?.addEventListener('click', onCancel);
        });
    };

    // ========================================================================
    // DASHBOARD DE APRENDIZADO (observer + replay + flows)
    // ========================================================================

    let _dashLoaded = false;

    function _toggleDashboard(force) {
        const el = document.getElementById('brain-dashboard');
        if (!el) return;
        const willShow = typeof force === 'boolean' ? force : el.classList.contains('hidden');
        el.classList.toggle('hidden', !willShow);
        const learnBtn = document.getElementById('btn-brain-learn');
        if (learnBtn) {
            learnBtn.classList.toggle('active', willShow);
            learnBtn.setAttribute('aria-expanded', String(willShow));
        }
        if (willShow) _loadDashboard();
    }

    function _setupDashboardDismiss() {
        if (document.body.dataset.brainDashboardDismissBound) return;
        document.body.dataset.brainDashboardDismissBound = '1';

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') _toggleDashboard(false);
        });

        document.addEventListener('pointerdown', (event) => {
            const dash = document.getElementById('brain-dashboard');
            if (!dash || dash.classList.contains('hidden')) return;
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (dash.contains(target)) return;

            const learnBtn = document.getElementById('btn-brain-learn');
            if (learnBtn && learnBtn.contains(target)) return;

            const graph = document.getElementById('brain-graph');
            if (graph && graph.contains(target)) _toggleDashboard(false);
        }, true);
    }

    async function _syncToggles() {
        const t1 = document.getElementById('toggle-replay-enabled');
        const t2 = document.getElementById('toggle-replay-confirm');
        if (!t1 || !t2) return;

        try {
            const [enabled, confirm] = await Promise.all([
                window.brainApi.getPreference('replay.enabled', true),
                window.brainApi.getPreference('replay.confirmBeforeExecute', false),
            ]);
            t1.checked = enabled !== false;
            t2.checked = !!confirm;
        } catch { /* ignore */ }

        if (!t1.dataset.bound) {
            t1.addEventListener('change', async () => {
                try { await window.brainApi.setPreference('replay.enabled', t1.checked); }
                catch (err) { alert('Falha ao salvar: ' + err.message); }
            });
            t1.dataset.bound = '1';
        }
        if (!t2.dataset.bound) {
            t2.addEventListener('change', async () => {
                try { await window.brainApi.setPreference('replay.confirmBeforeExecute', t2.checked); }
                catch (err) { alert('Falha ao salvar: ' + err.message); }
            });
            t2.dataset.bound = '1';
        }
    }

    function _renderDreamPolicyControls() {
        const el = document.getElementById('brain-dash-dream-policy');
        if (!el || el.dataset.bound) return;
        const options = _getDreamOptions(false);
        const phases = [
            ['normalize', 'Normalize'],
            ['consolidate', 'Merge'],
            ['staleness', 'Stale'],
            ['flow', 'Flows'],
            ['promote', 'Promote'],
            ['prune', 'Prune'],
            ['compaction', 'Compact'],
            ['render', 'Render'],
        ];

        el.innerHTML = `
            <div class="brain-dream-policy-grid">
                ${phases.map(([key, label]) => `
                    <label title="${_escHtml(key)}">
                        <input type="checkbox" data-dream-phase="${_escHtml(key)}" ${options.phases[key] ? 'checked' : ''}>
                        <span>${_escHtml(label)}</span>
                    </label>
                `).join('')}
                <label title="Restaura snapshot automaticamente se a avaliação marcar danger">
                    <input type="checkbox" id="dream-auto-rollback" ${options.autoRollbackOnDanger ? 'checked' : ''}>
                    <span>Auto rollback</span>
                </label>
            </div>
        `;

        el.addEventListener('change', () => _saveDreamPolicyControls());
        el.dataset.bound = '1';
    }

    function _saveDreamPolicyControls() {
        const phases = {};
        document.querySelectorAll('[data-dream-phase]').forEach(input => {
            phases[input.dataset.dreamPhase] = !!input.checked;
        });
        const autoRollback = document.getElementById('dream-auto-rollback');
        localStorage.setItem('brain.dream.policy', JSON.stringify({
            phases,
            autoRollbackOnDanger: !!autoRollback?.checked,
        }));
    }

    function _getDreamOptions(dryRun) {
        const defaults = {
            phases: {
                normalize: true,
                consolidate: true,
                staleness: true,
                flow: true,
                promote: true,
                prune: true,
                compaction: true,
                render: true,
            },
            autoRollbackOnDanger: false,
        };
        try {
            const saved = JSON.parse(localStorage.getItem('brain.dream.policy') || '{}');
            return {
                dryRun,
                phases: { ...defaults.phases, ...(saved.phases || {}) },
                autoRollbackOnDanger: !!saved.autoRollbackOnDanger,
            };
        } catch {
            return { dryRun, ...defaults };
        }
    }

    function _renderDreamReport(result) {
        const el = document.getElementById('brain-dash-dream');
        if (!el) return;
        if (!result) {
            el.innerHTML = '<div class="brain-dash-muted">Sem relatorio do Dream.</div>';
            return;
        }

        const reports = Array.isArray(result) ? result : (result.reports || []);
        const total = Array.isArray(result)
            ? reports.reduce((sum, report) => sum + (report.nodesAffected || 0), 0)
            : (result.totalAffected || 0);
        const mode = result.dryRun ? 'preview' : 'executado';
        const duration = result.durationMs ? `${(result.durationMs / 1000).toFixed(1)}s` : '';
        const delta = _dreamMetricDelta(result.metricsBefore, result.metricsAfter);
        const snapshot = result.snapshotPath
            ? `<div class="brain-dream-snapshot" title="${_escHtml(result.snapshotPath)}">
                    <span>snapshot: ${_escHtml(_shortPath(result.snapshotPath))}</span>
                    ${!result.dryRun && window.brainApi.restoreDreamSnapshot ? '<button type="button" class="brain-dream-restore" data-snapshot-restore>Restore</button>' : ''}
               </div>`
            : '';
        const evalHtml = result.evaluation
            ? `<div class="brain-dream-eval ${_escHtml(result.evaluation.verdict)}">
                    <strong>${_escHtml(result.evaluation.verdict)}</strong>
                    <span>score ${result.evaluation.score ?? 0}</span>
                    ${(result.evaluation.reasons || []).slice(0, 2).map(reason => `<em>${_escHtml(reason)}</em>`).join('')}
               </div>`
            : '';
        const error = result.error
            ? `<div class="brain-dash-error">${_escHtml(result.error)}</div>`
            : '';

        el.innerHTML = `
            <div class="brain-dream-summary">
                <span class="brain-dash-badge">${_escHtml(mode)}</span>
                <strong>${total}</strong>
                <span class="brain-dash-muted">mudancas ${duration}</span>
            </div>
            ${delta ? `<div class="brain-dream-delta">${delta}</div>` : ''}
            ${evalHtml}
            ${snapshot}
            ${error}
            <div class="brain-dream-phases">
                ${reports.map(report => `
                    <div class="brain-dream-phase ${report.error ? 'error' : ''}">
                        <div class="phase-head">
                            <strong>${_escHtml(report.phase || '?')}</strong>
                            <span>${report.nodesAffected || 0}</span>
                        </div>
                        ${report.risk ? `<div class="brain-dream-risk ${_escHtml(report.risk.level)}">risk ${_escHtml(report.risk.level)}</div>` : ''}
                        ${(report.actions || []).slice(0, 3).map(action => `
                            <div class="brain-dash-muted">${_escHtml(action)}</div>
                        `).join('')}
                        ${(report.explanations || []).slice(0, 2).map(reason => `
                            <div class="brain-dream-explain">${_escHtml(reason)}</div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        `;

        const restoreBtn = el.querySelector('[data-snapshot-restore]');
        if (restoreBtn && result.snapshotPath) {
            restoreBtn.addEventListener('click', async () => {
                const ok = confirm('Restaurar o snapshot deste Dream? Isso volta o grafo para o estado anterior ao run.');
                if (!ok) return;
                restoreBtn.disabled = true;
                restoreBtn.textContent = '...';
                try {
                    const restored = await window.brainApi.restoreDreamSnapshot(result.snapshotPath);
                    if (!restored?.ok) {
                        alert('Restore falhou: ' + (restored?.error || 'erro desconhecido'));
                        return;
                    }
                    alert(`Snapshot restaurado: ${restored.nodesRestored} nos, ${restored.edgesRestored} arestas.`);
                    _initialized = false;
                    document.getElementById('brain-graph').innerHTML = '';
                    _graph = null;
                    await _loadGraph();
                    await _loadStats();
                    await _loadDashboard(true);
                } catch (err) {
                    alert('Restore falhou: ' + err.message);
                } finally {
                    restoreBtn.disabled = false;
                    restoreBtn.textContent = 'Restore';
                }
            });
        }
    }

    function _renderDreamHistory(history) {
        const el = document.getElementById('brain-dash-dream');
        if (!el) return;
        if (!Array.isArray(history) || history.length === 0) {
            el.innerHTML = '<div class="brain-dash-muted">Nenhum ciclo nesta sessao.</div>';
            return;
        }

        const last = history[0];
        el.innerHTML = `
            <div class="brain-dream-summary">
                <span class="brain-dash-badge">${last.dryRun ? 'preview' : 'executado'}</span>
                <strong>${last.totalAffected || 0}</strong>
                <span class="brain-dash-muted">mudancas ${(last.durationMs / 1000).toFixed(1)}s</span>
            </div>
            ${last.snapshotPath ? `<div class="brain-dream-snapshot" title="${_escHtml(last.snapshotPath)}">snapshot: ${_escHtml(_shortPath(last.snapshotPath))}</div>` : ''}
            <div class="brain-dream-phases">
                ${history.slice(0, 4).map(item => `
                    <div class="brain-dream-phase ${item.errorCount ? 'error' : ''}">
                        <div class="phase-head">
                            <strong>${_escHtml(new Date(item.finishedAt).toLocaleTimeString())}</strong>
                            <span>${item.totalAffected || 0}</span>
                        </div>
                        <div class="brain-dash-muted">${item.dryRun ? 'preview' : 'execucao'}${item.verdict ? `, ${_escHtml(item.verdict)}` : ''}${item.errorCount ? `, ${item.errorCount} erro(s)` : ''}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function _dreamMetricDelta(before, after) {
        if (!before || !after) return '';
        const pairs = [
            ['nodes', before.nodeCount, after.nodeCount],
            ['edges', before.edgeCount, after.edgeCount],
            ['flows', before.flows, after.flows],
            ['invalid', before.invalidatedPageStates, after.invalidatedPageStates],
        ];
        return pairs.map(([label, from, to]) => {
            const diff = (to || 0) - (from || 0);
            const sign = diff > 0 ? '+' : '';
            return `<span><b>${_escHtml(label)}</b> ${to || 0} <em>${sign}${diff}</em></span>`;
        }).join('');
    }

    function _shortPath(filePath) {
        const normalized = String(filePath || '').replace(/\\/g, '/');
        const parts = normalized.split('/');
        return parts.slice(-2).join('/');
    }

    async function _loadDashboard(forceRefresh = false) {
        const root = document.getElementById('brain-dashboard');
        if (!root) return;
        _syncToggles();
        const statsEl = document.getElementById('brain-dash-stats');
        const replayEl = document.getElementById('brain-dash-replay');
        const flowsEl = document.getElementById('brain-dash-flows');
        const tracesEl = document.getElementById('brain-dash-traces');
        const selsEl = document.getElementById('brain-dash-selectors');
        const windowEl = document.getElementById('brain-dash-window');
        const dreamEl = document.getElementById('brain-dash-dream');

        _renderDreamPolicyControls();

        if (forceRefresh) _dashLoaded = false;
        if (!_dashLoaded) {
            [statsEl, replayEl, flowsEl, tracesEl, selsEl].forEach(e => { if (e) e.innerHTML = '<div class="brain-dash-muted">Carregando...</div>'; });
        }

        let data;
        try {
            data = await window.brainApi.getDashboard({ windowDays: 7, topFlowsLimit: 10 });
        } catch (err) {
            if (statsEl) statsEl.innerHTML = '<div class="brain-dash-error">Falha: ' + _escHtml(err.message) + '</div>';
            return;
        }
        _dashLoaded = true;

        if (dreamEl && window.brainApi.getDreamHistory) {
            try {
                _renderDreamHistory(await window.brainApi.getDreamHistory());
            } catch {
                dreamEl.innerHTML = '<div class="brain-dash-muted">Historico do Dream indisponivel.</div>';
            }
        }

        if (!data) {
            if (statsEl) statsEl.innerHTML = '<div class="brain-dash-muted">Brain não inicializado.</div>';
            return;
        }

        // Stats
        if (statsEl) {
            const s = data.stats || {};
            statsEl.innerHTML = `
                <div class="brain-dash-grid">
                    <div><span class="k">Nodes</span><span class="v">${s.totalNodes ?? 0}</span></div>
                    <div><span class="k">Edges</span><span class="v">${s.totalEdges ?? 0}</span></div>
                    <div><span class="k">Page states</span><span class="v">${s.pageStates ?? 0}</span></div>
                    <div><span class="k">Actions</span><span class="v">${s.actions ?? 0}</span></div>
                    <div><span class="k">Flows</span><span class="v">${s.flows ?? 0}</span></div>
                    <div><span class="k">Invalidated</span><span class="v">${s.invalidatedPageStates ?? 0}</span></div>
                </div>`;
        }

        // Replay hit rate
        if (replayEl) {
            const r = data.replayHitRate || { hits: 0, total: 0, rate: 0, windowDays: 7 };
            if (windowEl) windowEl.textContent = `(${r.windowDays}d)`;
            const pct = (r.rate * 100).toFixed(1);
            const bar = `<div class="brain-dash-bar"><div style="width:${pct}%"></div></div>`;
            replayEl.innerHTML = `
                <div class="brain-dash-row">
                    <span class="brain-dash-big">${pct}%</span>
                    <span class="brain-dash-muted">${r.hits} de ${r.total} actions</span>
                </div>
                ${bar}`;
        }

        // Top flows
        if (flowsEl) {
            const list = data.topFlows || [];
            if (list.length === 0) {
                flowsEl.innerHTML = '<div class="brain-dash-muted">Nenhum flow detectado. Use "Detectar flows" após acumular observações.</div>';
            } else {
                flowsEl.innerHTML = list.map(f => `
                    <div class="brain-dash-flow">
                        <div class="brain-dash-flow-head">
                            <strong>${_escHtml(f.tribunal || '?')}</strong>
                            <span class="brain-dash-muted">${_escHtml(f.pjeContext || '')}</span>
                            <span class="brain-dash-badge">${f.instances}×</span>
                            ${f.crossConfirmations > 1 ? `<span class="brain-dash-badge trust">trust ${f.crossConfirmations}</span>` : ''}
                        </div>
                        <div class="brain-dash-flow-tools">${(f.tools || []).map(t => `<span class="tool">${_escHtml(t)}</span>`).join(' → ')}</div>
                        <div class="brain-dash-flow-meta">
                            conf ${(f.confidence || 0).toFixed(2)} · ${_formatDate(f.lastDetectedAt)}
                        </div>
                    </div>
                `).join('');
            }
        }

        // Traces recentes
        if (tracesEl) {
            const list = data.recentTraces || [];
            if (list.length === 0) {
                tracesEl.innerHTML = '<div class="brain-dash-muted">Nenhuma trace recente.</div>';
            } else {
                tracesEl.innerHTML = list.map(t => `
                    <div class="brain-dash-trace">
                        <code>${_escHtml(String(t.traceId).slice(0, 8))}</code>
                        <span>${t.steps} steps</span>
                        <span>${(t.durationMs / 1000).toFixed(1)}s</span>
                        <span class="${t.successRate >= 1 ? 'ok' : (t.successRate > 0 ? 'warn' : 'err')}">${Math.round(t.successRate * 100)}%</span>
                    </div>
                `).join('');
            }
        }

        // Selectors problemáticos
        if (selsEl) {
            const list = data.problemSelectors || [];
            if (list.length === 0) {
                selsEl.innerHTML = '<div class="brain-dash-muted">Nenhum seletor problemático.</div>';
            } else {
                selsEl.innerHTML = list.map(s => `
                    <div class="brain-dash-selector">
                        <div><strong>${_escHtml(s.tribunal || '?')}</strong> <span class="brain-dash-muted">${_escHtml(s.context || '')}</span></div>
                        <code>${_escHtml((s.label || '').slice(0, 80))}</code>
                        <div class="brain-dash-muted">✓ ${s.successCount} · ✗ ${s.failureCount}</div>
                    </div>
                `).join('');
            }
        }
    }

})();
