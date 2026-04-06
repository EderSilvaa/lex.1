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
            data = _getMockData();
            document.getElementById('brain-stats-text').textContent = '⚠ dados de exemplo — use o agente para popular o Brain';
            _graphData = data;
            _renderGraph(container, data);
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
        const sidebarClose = document.getElementById('btn-brain-sidebar-close');

        if (dreamBtn) {
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
    // MOCK DATA (preview UX quando Brain está vazio)
    // ========================================================================

    function _getMockData() {
        const n = (id, type, label, confidence, data) => ({ id, type, label, confidence: confidence || 0.7, data: data || {}, updatedAt: Date.now() - Math.random() * 30 * 86400000, accessedAt: Date.now() });
        const e = (id, sourceId, targetId, relation) => ({ id, sourceId, targetId, relation, weight: 1.0 });

        const nodes = [
            // Processos
            n('p1', 'processo', '0001234-12.2023.8.01.0001', 0.9, { classe: 'Ação de Indenização', tribunal: 'TJPA', status: 'Em andamento', partes: { autor: ['João Silva'], reu: ['Banco XYZ S.A.'] } }),
            n('p2', 'processo', '0009876-45.2022.8.06.0001', 0.85, { classe: 'Revisão Contratual', tribunal: 'TJCE', status: 'Aguardando julgamento', partes: { autor: ['Maria Souza'], reu: ['Financeira ABC'] } }),
            n('p3', 'processo', '0005555-77.2021.4.01.3400', 0.75, { classe: 'Mandado de Segurança', tribunal: 'TRF1', status: 'Recurso pendente', partes: { autor: ['Pedro Costa'], reu: ['União Federal'] } }),
            // Teses
            n('t1', 'tese', 'Juros abusivos acima da média de mercado', 0.8),
            n('t2', 'tese', 'Dano moral por negativação indevida', 0.9),
            n('t3', 'tese', 'Revisão de cláusulas abusivas CDC', 0.85),
            n('t4', 'tese', 'Ilegalidade de cobrança de tarifa de cadastro', 0.7),
            n('t5', 'tese', 'Direito líquido e certo — prazo decadencial', 0.65),
            // Decisões
            n('d1', 'decisao', 'Tutela antecipada deferida — suspensão de cobrança', 0.9),
            n('d2', 'decisao', 'Sentença procedente — indenização R$ 8.000', 0.95),
            n('d3', 'decisao', 'Acórdão: mantida sentença de 1º grau', 0.8),
            // Partes
            n('pa1', 'parte', 'Banco XYZ S.A.', 0.6),
            n('pa2', 'parte', 'Financeira ABC', 0.6),
            n('pa3', 'parte', 'João Silva', 0.7),
            n('pa4', 'parte', 'Maria Souza', 0.7),
            // Tribunais
            n('tr1', 'tribunal', 'TJPA', 0.95),
            n('tr2', 'tribunal', 'TJCE', 0.9),
            n('tr3', 'tribunal', 'TRF1', 0.85),
            // Aprendizados
            n('a1', 'aprendizado', '[TJPA] "negativação indevida" → pje_consultar, pje_agir', 0.8),
            n('a2', 'aprendizado', 'Usar pje_documentos antes de pje_agir em recursos', 0.75),
            n('a3', 'aprendizado', '[TJCE] Petição inicial: sempre incluir valor da causa', 0.7),
        ];

        const edges = [
            // p1 → teses, decisão, parte, tribunal
            e('e1',  'p1', 't1', 'has_tese'),
            e('e2',  'p1', 't2', 'has_tese'),
            e('e3',  'p1', 'd1', 'has_decisao'),
            e('e4',  'p1', 'd2', 'has_decisao'),
            e('e5',  'p1', 'pa1', 'has_parte'),
            e('e6',  'p1', 'pa3', 'has_parte'),
            e('e7',  'p1', 'tr1', 'from_tribunal'),
            // p2 → teses, parte, tribunal
            e('e8',  'p2', 't3', 'has_tese'),
            e('e9',  'p2', 't4', 'has_tese'),
            e('e10', 'p2', 'd3', 'has_decisao'),
            e('e11', 'p2', 'pa2', 'has_parte'),
            e('e12', 'p2', 'pa4', 'has_parte'),
            e('e13', 'p2', 'tr2', 'from_tribunal'),
            // p3 → teses, tribunal
            e('e14', 'p3', 't5', 'has_tese'),
            e('e15', 'p3', 'tr3', 'from_tribunal'),
            // teses relacionadas
            e('e16', 't1', 't3', 'related_to'),
            e('e17', 't2', 'd2', 'learned_from'),
            // aprendizados vinculados a tribunais
            e('e18', 'a1', 'tr1', 'learned_from'),
            e('e19', 'a3', 'tr2', 'learned_from'),
        ];

        return { nodes, edges };
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

})();
