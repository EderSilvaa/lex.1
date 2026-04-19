/* eslint-disable no-console */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const ROOT = path.resolve(__dirname, '..');
const BRAIN_JS = path.join(ROOT, 'src', 'renderer', 'js', 'brain.js');
const BRAIN_CSS = path.join(ROOT, 'src', 'renderer', 'styles', 'brain.css');

function brainMarkup() {
    const brainCss = fs.readFileSync(BRAIN_CSS, 'utf8').replace(/<\/style/gi, '<\\/style');
    return `
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <style>${brainCss}</style>
    <style>
        html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #08080d; font-family: Arial, sans-serif; }
        .brain-wrapper { width: 1180px; height: 760px; }
        .brain-graph { width: 100%; height: 100%; }
    </style>
</head>
<body>
    <div class="brain-wrapper">
        <div class="brain-body">
            <div id="brain-graph" class="brain-graph"></div>
            <div class="brain-toolbar">
                <span class="brain-toolbar-title">BRAIN</span>
                <div class="brain-toolbar-divider"></div>
                <button id="btn-brain-search-toggle" class="brain-btn brain-btn-cyan">Buscar</button>
                <button id="btn-brain-learn" class="brain-btn brain-btn-cyan" title="Aprendizado: flows, replay, traces">Learn</button>
                <button id="btn-brain-dream" class="brain-btn">Dream</button>
                <button id="btn-brain-export" class="brain-btn">Export</button>
                <button id="btn-brain-export-patterns" class="brain-btn">Patterns</button>
            </div>
            <div id="brain-search-bar" class="brain-search-bar hidden">
                <input id="brain-search-input" type="text" />
                <div id="brain-search-results" class="brain-search-results"></div>
            </div>
            <div id="brain-sidebar" class="brain-sidebar hidden">
                <button id="btn-brain-sidebar-close" class="brain-sidebar-close">x</button>
                <div id="brain-node-detail"></div>
            </div>
            <div id="brain-dashboard" class="brain-dashboard hidden">
                <div class="brain-dashboard-header">
                    <span class="brain-dashboard-title">APRENDIZADO</span>
                    <button id="btn-brain-dashboard-refresh" class="brain-btn">Atualizar</button>
                    <button id="btn-brain-detect-flows" class="brain-btn">Detectar flows</button>
                    <button id="btn-brain-dashboard-close" class="brain-sidebar-close" title="Fechar painel" aria-label="Fechar painel">x</button>
                </div>
                <div class="brain-dashboard-body">
                    <section class="brain-dash-section">
                        <h4>Controles de Replay</h4>
                        <div class="brain-dash-toggles">
                            <label class="brain-toggle">
                                <input type="checkbox" id="toggle-replay-enabled" />
                                <span>Replay habilitado</span>
                                <small>Se desligado, toda task passa por vision.</small>
                            </label>
                            <label class="brain-toggle">
                                <input type="checkbox" id="toggle-replay-confirm" />
                                <span>Confirmar antes de executar</span>
                                <small>Mostra o plano e pede aprovacao.</small>
                            </label>
                        </div>
                    </section>
                    <section class="brain-dash-section"><h4>Estatisticas</h4><div id="brain-dash-stats" class="brain-dash-stats"></div></section>
                    <section class="brain-dash-section"><h4>Dream</h4><div id="brain-dash-dream-policy" class="brain-dream-policy"></div><div id="brain-dash-dream" class="brain-dash-dream"></div></section>
                    <section class="brain-dash-section"><h4>Replay hit rate <span id="brain-dash-window" class="brain-dash-muted"></span></h4><div id="brain-dash-replay"></div></section>
                    <section class="brain-dash-section"><h4>Top flows</h4><div id="brain-dash-flows"></div></section>
                    <section class="brain-dash-section"><h4>Traces recentes</h4><div id="brain-dash-traces"></div></section>
                    <section class="brain-dash-section"><h4>Seletores problematicos</h4><div id="brain-dash-selectors"></div></section>
                </div>
            </div>
        </div>
        <div id="brain-stats-bar" class="brain-stats-bar"><span id="brain-stats-text">Carregando...</span></div>
    </div>
    <div id="replay-preview-modal" class="replay-modal hidden">
        <div class="replay-modal-backdrop"></div>
        <div class="replay-modal-panel">
            <div class="replay-modal-header">
                <span class="replay-modal-title">Confirmar execucao de replay</span>
                <span id="replay-modal-confidence" class="replay-modal-badge"></span>
            </div>
            <div class="replay-modal-body">
                <div class="replay-modal-goal" id="replay-modal-goal"></div>
                <div class="replay-modal-summary" id="replay-modal-summary"></div>
                <ol class="replay-modal-steps" id="replay-modal-steps"></ol>
                <div class="replay-modal-hint">Revise cada passo.</div>
            </div>
            <div class="replay-modal-footer">
                <button id="replay-modal-cancel" class="replay-modal-btn">Cancelar</button>
                <button id="replay-modal-confirm" class="replay-modal-btn primary">Executar</button>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function mockScript() {
    return `
window.__brainTest = {
    calls: [],
    alerts: [],
    confirms: [],
    prefs: {
        'replay.enabled': true,
        'replay.confirmBeforeExecute': false,
    },
};
window.alert = (msg) => { window.__brainTest.alerts.push(String(msg)); };
window.confirm = (msg) => { window.__brainTest.confirms.push(String(msg)); return true; };
if (!window.ResizeObserver) {
    window.ResizeObserver = class {
        observe() {}
        disconnect() {}
    };
}
window.ForceGraph = function ForceGraphMock() {
    return function attachForceGraph(container) {
        const canvas = document.createElement('canvas');
        canvas.width = container.offsetWidth || 800;
        canvas.height = container.offsetHeight || 600;
        canvas.dataset.testForceGraph = '1';
        container.appendChild(canvas);
        const api = {
            _destructor() { canvas.remove(); },
            graphData(data) { window.__brainTest.graphData = data; return api; },
        };
        [
            'width', 'height', 'nodeId', 'nodeLabel', 'nodeCanvasObject',
            'nodeCanvasObjectMode', 'linkSource', 'linkTarget', 'linkLabel',
            'linkColor', 'linkWidth', 'linkDirectionalArrowLength',
            'linkDirectionalArrowRelPos', 'linkDirectionalParticles',
            'linkDirectionalParticleWidth', 'linkDirectionalParticleSpeed',
            'linkDirectionalParticleColor', 'backgroundColor', 'onNodeClick',
            'onBackgroundClick'
        ].forEach((name) => {
            api[name] = function(value) {
                if (name === 'onBackgroundClick') window.__brainTest.onBackgroundClick = value;
                if (name === 'onNodeClick') window.__brainTest.onNodeClick = value;
                return api;
            };
        });
        return api;
    };
};
window.brainApi = {
    async getGraph() {
        window.__brainTest.calls.push('getGraph');
        return {
            nodes: [
                { id: 'state-1', type: 'page_state', label: 'TJPA:norm:abc', confidence: 0.8, data: { tribunal: 'TJPA' }, updatedAt: Date.now() },
                { id: 'action-1', type: 'action', label: 'browser_navigate:abc', confidence: 0.9, data: { tool: 'browser_navigate' }, updatedAt: Date.now() },
            ],
            edges: [
                { sourceId: 'state-1', targetId: 'action-1', relation: 'performs', weight: 4 },
            ],
        };
    },
    async getStats() {
        window.__brainTest.calls.push('getStats');
        return { nodeCount: 2, edgeCount: 1, byType: { page_state: 1, action: 1 } };
    },
    async getDashboard() {
        window.__brainTest.calls.push('getDashboard');
        return {
            stats: { totalNodes: 2, totalEdges: 1, pageStates: 1, actions: 1, flows: 1, invalidatedPageStates: 0 },
            replayHitRate: { windowDays: 7, hits: 1, total: 1, rate: 1 },
            topFlows: [{ flowId: 'flow-1', label: 'TJPA:portal_pje:x', tribunal: 'TJPA', pjeContext: 'portal_pje', tools: ['browser_navigate'], instances: 3, confidence: 0.8, trustMultiplier: 1, crossConfirmations: 1, lastDetectedAt: Date.now() }],
            recentTraces: [{ traceId: 'trace-123456', durationMs: 1200, steps: 1, successRate: 1 }],
            problemSelectors: [],
        };
    },
    async getDreamHistory() {
        window.__brainTest.calls.push('getDreamHistory');
        return [];
    },
    async getPreference(key, fallback) {
        window.__brainTest.calls.push('getPreference:' + key);
        return Object.prototype.hasOwnProperty.call(window.__brainTest.prefs, key) ? window.__brainTest.prefs[key] : fallback;
    },
    async setPreference(key, value) {
        window.__brainTest.calls.push('setPreference:' + key + '=' + value);
        window.__brainTest.prefs[key] = value;
        return { ok: true };
    },
    async detectFlows() {
        window.__brainTest.calls.push('detectFlows');
        return { flowsCreated: 1, flowsUpdated: 2, walksGenerated: 3 };
    },
    async runDream(opts) {
        window.__brainTest.calls.push('runDream:' + (opts && opts.dryRun ? 'dry' : 'run'));
        return {
            dryRun: !!(opts && opts.dryRun),
            totalAffected: opts && opts.dryRun ? 1 : 2,
            durationMs: 50,
            reports: [{ phase: 'flow', nodesAffected: 1, actions: ['detect'], explanations: ['ok'], risk: { level: 'low' } }],
            evaluation: { verdict: 'improved', score: 1, reasons: ['ok'] },
        };
    },
    async exportPatterns() {
        window.__brainTest.calls.push('exportPatterns');
        return { filePath: 'C:/Users/EDER/.lex/lex-brain-export-patterns-2026-04-19.json.gz', manifest: { nodeCount: 2, edgeCount: 1 } };
    },
    async exportBrain() {
        window.__brainTest.calls.push('exportBrain');
        return { filePath: 'C:/tmp/brain.json.gz', manifest: { nodeCount: 2, edgeCount: 1 } };
    },
    async restoreDreamSnapshot() {
        window.__brainTest.calls.push('restoreDreamSnapshot');
        return { ok: true, nodesRestored: 2, edgesRestored: 1 };
    },
};
undefined;
`;
}

async function waitUntil(win, predicate, label, timeoutMs = 5000) {
    const start = Date.now();
    const expression = typeof predicate === 'function' ? predicate() : predicate;
    while (Date.now() - start < timeoutMs) {
        const ok = await win.webContents.executeJavaScript(`Boolean(${expression})`);
        if (ok) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${label}`);
}

async function click(win, selector) {
    await win.webContents.executeJavaScript(`
        document.querySelector(${JSON.stringify(selector)}).click();
    `);
}

async function value(win, expression) {
    return win.webContents.executeJavaScript(expression);
}

async function main() {
    const watchdog = setTimeout(() => {
        console.error('[BrainRenderer] watchdog timeout');
        app.exit(1);
    }, 30000);

    await app.whenReady();

    const win = new BrowserWindow({
        width: 1280,
        height: 820,
        show: false,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: false,
        },
    });

    const rendererErrors = [];
    win.webContents.on('console-message', (_event, level, message) => {
        if (level >= 3) rendererErrors.push(message);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
        rendererErrors.push(`renderer gone: ${details.reason}`);
    });

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(brainMarkup())}`);
    await win.webContents.executeJavaScript(mockScript());
    const brainSource = fs.readFileSync(BRAIN_JS, 'utf8');
    await win.webContents.executeJavaScript(`${brainSource}\n//# sourceURL=brain.js`);
    await win.webContents.executeJavaScript('window.initBrainView()');

    await waitUntil(win, () => {
        return "document.querySelector('#brain-graph canvas') && window.__brainTest.calls.includes('getStats')";
    }, 'graph and stats');

    const chromeClearance = await value(win, `(() => {
        const dash = getComputedStyle(document.getElementById('brain-dashboard'));
        const toolbar = getComputedStyle(document.querySelector('.brain-toolbar'));
        const closeRect = document.getElementById('btn-brain-dashboard-close').getBoundingClientRect();
        return {
            dashTop: parseFloat(dash.top),
            toolbarTop: parseFloat(toolbar.top),
            closeWidth: closeRect.width,
            closeHeight: closeRect.height,
        };
    })()`);
    assert(chromeClearance.dashTop >= 28, `dashboard too high: ${chromeClearance.dashTop}`);
    assert(chromeClearance.toolbarTop >= 28, `toolbar too high: ${chromeClearance.toolbarTop}`);
    assert(chromeClearance.closeWidth <= 34 && chromeClearance.closeHeight <= 34, `close button too large: ${JSON.stringify(chromeClearance)}`);
    console.log('[BrainRenderer] ok chrome clearance');

    await click(win, '#btn-brain-learn');
    await waitUntil(win, () => {
        return "!document.getElementById('brain-dashboard').classList.contains('hidden') && document.getElementById('brain-dash-stats').textContent.includes('Nodes')";
    }, 'learn dashboard open');

    let dashboardState = await value(win, `(() => ({
        expanded: document.getElementById('btn-brain-learn').getAttribute('aria-expanded'),
        enabled: document.getElementById('toggle-replay-enabled').checked,
        confirm: document.getElementById('toggle-replay-confirm').checked,
    }))()`);
    assert.strictEqual(dashboardState.expanded, 'true');
    assert.strictEqual(dashboardState.enabled, true);
    assert.strictEqual(dashboardState.confirm, false);

    await click(win, '#toggle-replay-confirm');
    await waitUntil(win, () => {
        return "window.__brainTest.calls.includes('setPreference:replay.confirmBeforeExecute=true')";
    }, 'confirm toggle persistence');

    await click(win, '#btn-brain-dashboard-refresh');
    await waitUntil(win, () => {
        return "window.__brainTest.calls.filter(c => c === 'getDashboard').length >= 2 && !document.getElementById('btn-brain-dashboard-refresh').disabled";
    }, 'dashboard refresh');

    await click(win, '#btn-brain-detect-flows');
    await waitUntil(win, () => {
        return "window.__brainTest.calls.includes('detectFlows') && window.__brainTest.alerts.some(a => a.includes('Flows: 1 novos, 2 atualizados'))";
    }, 'detect flows');
    console.log('[BrainRenderer] ok learn dashboard controls');

    await win.webContents.executeJavaScript(`
        document.getElementById('brain-dashboard').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    `);
    dashboardState = await value(win, `document.getElementById('brain-dashboard').classList.contains('hidden')`);
    assert.strictEqual(dashboardState, false, 'dashboard should stay open when clicked inside');

    await win.webContents.executeJavaScript(`
        document.getElementById('brain-graph').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    `);
    dashboardState = await value(win, `document.getElementById('brain-dashboard').classList.contains('hidden')`);
    assert.strictEqual(dashboardState, true, 'dashboard should close when graph is clicked');
    console.log('[BrainRenderer] ok dashboard does not block graph');

    await win.webContents.executeJavaScript(`
        window.__brainTest.replayResult = 'pending';
        window.showReplayPreview({
            task: 'abrir TJPA',
            summary: '1 step',
            confidence: 0.82,
            steps: [{
                tool: 'browser_navigate',
                selector: '<img src=x onerror=alert(1)>',
                alternates: ['#main'],
                inputPreview: '{"url":"https://pje.tjpa.jus.br"}',
                expected: 'TJPA:norm:abc',
                observedCount: 3
            }]
        }).then(value => { window.__brainTest.replayResult = value; });
        undefined;
    `);
    await waitUntil(win, () => {
        return "!document.getElementById('replay-preview-modal').classList.contains('hidden') && document.getElementById('replay-modal-steps').textContent.includes('browser_navigate')";
    }, 'replay modal open');
    const injectedImageCount = await value(win, `document.querySelectorAll('#replay-modal-steps img').length`);
    assert.strictEqual(injectedImageCount, 0, 'replay modal should escape selector HTML');
    await click(win, '#replay-modal-confirm');
    await waitUntil(win, () => {
        return "window.__brainTest.replayResult === true && document.getElementById('replay-preview-modal').classList.contains('hidden')";
    }, 'replay modal confirm');

    await win.webContents.executeJavaScript(`
        window.__brainTest.replayResult = 'pending';
        window.showReplayPreview({ task: 'cancelar', confidence: 0.5, steps: [] })
            .then(value => { window.__brainTest.replayResult = value; });
        undefined;
    `);
    await waitUntil(win, () => "!document.getElementById('replay-preview-modal').classList.contains('hidden')", 'replay modal reopen');
    await click(win, '#replay-modal-cancel');
    await waitUntil(win, () => {
        return "window.__brainTest.replayResult === false && document.getElementById('replay-preview-modal').classList.contains('hidden')";
    }, 'replay modal cancel');
    console.log('[BrainRenderer] ok replay modal');

    const seriousErrors = rendererErrors.filter(message => !/Autofill|ResizeObserver loop/i.test(message));
    assert.deepStrictEqual(seriousErrors, []);

    win.destroy();
    clearTimeout(watchdog);
    console.log('[BrainRenderer] 4 passed');
}

main()
    .then(() => {
        app.quit();
    })
    .catch((err) => {
        console.error(err);
        app.exit(1);
    });
