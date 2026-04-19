/* eslint-disable no-console */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { initBrain, closeBrain, getBrain } = require('../dist-electron/brain');
const { getDashboardOverview } = require('../dist-electron/brain/dashboard');
const { exportBrain } = require('../dist-electron/brain/brain-export');
const { detectFlows } = require('../dist-electron/brain/flow-detector');
const { tryReplay } = require('../dist-electron/brain/replay-executor');
const { writeBatchToBrain } = require('../dist-electron/observer/writer-brain');

const ROOT = path.resolve(__dirname, '..');
const TMP_ROOT = path.join(ROOT, '.tmp-brain-e2e');

function rmDir(dir) {
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(ROOT)) throw new Error(`Refusing to remove outside repo: ${resolved}`);
    fs.rmSync(resolved, { recursive: true, force: true });
}

function makeObservation(index) {
    const traceId = `e2e-trace-${index}`;
    return {
        ts: Date.now() + index,
        server: 'browser',
        tool: 'browser_navigate',
        input: {
            url: index % 2 === 0
                ? 'https://pje.tjpa.jus.br'
                : 'https://www.tjpa.jus.br/PortalExterno/institucional/Portal-PJE/942-Apresentacao.xhtml?cid=123',
        },
        outputPreview: 'TJPA - Portal PJE - Apresentacao',
        outputHash: `out-${index}`,
        outputSize: 32,
        durationMs: 120 + index,
        success: true,
        error: null,
        before: {
            url: 'https://pje.tjpa.jus.br',
            title: 'TJPA - Portal PJE',
            domHash: 'entrydomhash000',
            tribunal: 'TJPA',
            pjeContext: 'portal_pje',
        },
        after: {
            url: 'https://www.tjpa.jus.br/PortalExterno/institucional/Portal-PJE/942-Apresentacao.xhtml',
            title: 'TJPA - Portal PJE - Apresentacao',
            domHash: 'resultdomhash00',
            tribunal: 'TJPA',
            pjeContext: 'portal_pje',
        },
        traceId,
    };
}

async function testObserverToReplayE2E() {
    writeBatchToBrain(getBrain(), [0, 1, 2].map(makeObservation));

    const stats = getBrain().getStats();
    assert.strictEqual(stats.byType.page_state, 1, 'canonical page states should dedupe');
    assert.strictEqual(stats.byType.action, 1, 'canonical navigate actions should dedupe');

    const report = detectFlows(getBrain());
    assert.strictEqual(report.flowsCreated, 1, 'detectFlows should promote a repeated micro-flow');
    assert.strictEqual(report.detected[0].instances, 4);

    const previewEvents = [];
    const preview = await tryReplay(
        { callTool: async () => { throw new Error('dry-run should not execute tools'); } },
        {
            tribunal: 'TJPA',
            pjeContext: 'portal_pje',
            goal: 'abre o site do TJPA e me diz o titulo da pagina',
            dryRun: true,
            minConfidence: 0.1,
            onEvent: evt => previewEvents.push(evt.type),
        },
    );
    assert.strictEqual(preview.tried, true);
    assert.strictEqual(preview.success, false);
    assert(preview.plan);
    assert(previewEvents.includes('plan_found'));

    const calls = [];
    const events = [];
    const executed = await tryReplay(
        {
            callTool: async (name, args) => {
                calls.push({ name, args });
                return 'Titulo da pagina: TJPA - Portal PJE - Apresentacao';
            },
        },
        {
            tribunal: 'TJPA',
            pjeContext: 'portal_pje',
            goal: 'abre o site do TJPA e me diz o titulo da pagina',
            minConfidence: 0.1,
            onEvent: evt => events.push(evt.type),
        },
        {
            after: async () => ({ domHash: 'resultdomhash00' }),
        },
    );

    assert.strictEqual(executed.tried, true);
    assert.strictEqual(executed.success, true, executed.error);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, 'browser_navigate');
    assert.match(calls[0].args.url, /^https:\/\/(pje\.tjpa|www\.tjpa)\.jus\.br/);
    assert(events.includes('done'));

    const dashboard = getDashboardOverview(getBrain(), { windowDays: 7, topFlowsLimit: 5 });
    assert.strictEqual(dashboard.stats.flows, 1);
    assert(dashboard.topFlows.length >= 1);
    assert(dashboard.replayHitRate.hits >= 1);
    assert.strictEqual(dashboard.replayHitRate.rate, 1);
}

async function testExportPatternsScrubsSensitiveData() {
    getBrain().upsertProcesso('0001234-56.2024.8.14.0301', {
        processoNumero: '0001234-56.2024.8.14.0301',
        partes: ['Pessoa Teste', '123.456.789-00', 'teste@example.com'],
        tribunal: 'TJPA',
    });

    const result = await exportBrain(getBrain(), { mode: 'patterns' });
    assert.strictEqual(result.manifest.mode, 'patterns');
    assert(fs.existsSync(result.filePath));

    const json = zlib.gunzipSync(fs.readFileSync(result.filePath)).toString('utf8');
    const bundle = JSON.parse(json);
    assert(bundle.nodes.every(node => ['page_state', 'action', 'flow', 'selector', 'tribunal'].includes(node.type)));
    assert(!json.includes('0001234-56.2024.8.14.0301'));
    assert(!json.includes('123.456.789-00'));
    assert(!json.includes('teste@example.com'));
    assert(!json.includes('Pessoa Teste'));
}

async function main() {
    rmDir(TMP_ROOT);
    fs.mkdirSync(TMP_ROOT, { recursive: true });

    try {
        initBrain(TMP_ROOT);
        getBrain().setPreference('replay.enabled', true);
        getBrain().setPreference('replay.confirmBeforeExecute', true);

        await testObserverToReplayE2E();
        console.log('[BrainE2E] ok observer -> flow -> replay -> dashboard');

        await testExportPatternsScrubsSensitiveData();
        console.log('[BrainE2E] ok export patterns scrub');
    } finally {
        try { closeBrain(); } catch {}
        rmDir(TMP_ROOT);
    }

    console.log('[BrainE2E] 2 passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
