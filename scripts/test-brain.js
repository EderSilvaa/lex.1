/* eslint-disable no-console */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { BrainStore } = require('../dist-electron/brain/brain-store');
const { runDream, restoreDreamSnapshot } = require('../dist-electron/brain/dream');
const { detectFlows } = require('../dist-electron/brain/flow-detector');
const { normalizeActionInput, normalizeExistingPageStates } = require('../dist-electron/brain/normalizer');
const { findReplayPlan, recordReplayOutcome } = require('../dist-electron/brain/replay-engine');
const { writeBatchToBrain } = require('../dist-electron/observer/writer-brain');

const ROOT = path.resolve(__dirname, '..');
const TMP_ROOT = path.join(ROOT, '.tmp-brain-tests');

function rmDir(dir) {
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(ROOT)) throw new Error(`Refusing to remove outside repo: ${resolved}`);
    fs.rmSync(resolved, { recursive: true, force: true });
}

function makeBrain(name) {
    const dir = path.join(TMP_ROOT, name);
    rmDir(dir);
    fs.mkdirSync(dir, { recursive: true });
    return {
        dir,
        brain: new BrainStore(path.join(dir, 'lex-brain.db')),
    };
}

async function withBrain(name, fn) {
    const ctx = makeBrain(name);
    try {
        await fn(ctx.brain, ctx.dir);
    } finally {
        try { ctx.brain.close(); } catch {}
        rmDir(ctx.dir);
    }
}

function obs(url) {
    return {
        ts: Date.now(),
        server: 'browser',
        tool: 'browser_navigate',
        input: { url },
        outputPreview: 'ok',
        outputHash: 'ok',
        outputSize: 2,
        durationMs: 10,
        success: true,
        error: null,
        before: null,
        after: null,
        traceId: null,
    };
}

async function testCanonicalActionInput() {
    const a = normalizeActionInput('browser_navigate', { url: 'https://pje.tjpa.jus.br' });
    const b = normalizeActionInput('browser_navigate', {
        url: 'https://www.tjpa.jus.br/PortalExterno/institucional/Portal-PJE/942-Apresentacao.xhtml?cid=123',
    });
    assert.strictEqual(a.url, 'tjpa/portal_pje');
    assert.strictEqual(a.url, b.url);
}

async function testWriterDedupesCanonicalActions() {
    await withBrain('writer-dedupe', async (brain) => {
        writeBatchToBrain(brain, [
            obs('https://pje.tjpa.jus.br'),
            obs('https://www.tjpa.jus.br/PortalExterno/institucional/Portal-PJE/942-Apresentacao.xhtml?cid=123'),
        ]);
        const stats = brain.getStats();
        assert.strictEqual(stats.byType.action, 1);
        const action = brain.getNodesByType('action', 10)[0];
        assert(action);
        assert.strictEqual(action.data.canonicalInput.url, 'tjpa/portal_pje');
        assert.strictEqual(action.data.successCount, 2);
    });
}

async function testNormalizeGroupsTjpaRedirects() {
    await withBrain('normalize', async (brain) => {
        const a = brain.addNode('page_state', 'old:a', {
            url: 'https://pje.tjpa.jus.br',
            title: 'TJPA - Portal PJE',
            tribunal: 'TJPA',
            domHash: 'aaa',
        });
        const b = brain.addNode('page_state', 'old:b', {
            url: 'https://www.tjpa.jus.br/PortalExterno/institucional/Portal-PJE/942-Apresentacao.xhtml?foo=bar',
            title: 'TJPA - Portal PJE - Apresentacao',
            tribunal: 'TJPA',
            domHash: 'bbb',
        });
        const report = normalizeExistingPageStates(brain);
        assert.strictEqual(report.changed, 2);
        const keyA = brain.getNode(a.id).data.canonicalStateKey;
        const keyB = brain.getNode(b.id).data.canonicalStateKey;
        assert.strictEqual(keyA, 'TJPA|portal_pje|tjpa/portal_pje');
        assert.strictEqual(keyA, keyB);
    });
}

async function testDreamDryRunDoesNotMutate() {
    await withBrain('dream-dry-run', async (brain) => {
        const node = brain.addNode('page_state', 'old:a', {
            url: 'https://pje.tjpa.jus.br',
            title: 'TJPA - Portal PJE',
            tribunal: 'TJPA',
            domHash: 'aaa',
        });
        const result = await runDream(brain, {
            dryRun: true,
            phases: {
                normalize: true,
                consolidate: false,
                staleness: false,
                flow: false,
                promote: false,
                prune: false,
                compaction: false,
                render: false,
            },
        });
        assert(result.reports.some(r => r.phase === 'normalize' && r.planned));
        assert.strictEqual(brain.getNode(node.id).data.canonicalStateKey, undefined);
    });
}

async function testSnapshotRestore() {
    await withBrain('snapshot-restore', async (brain) => {
        const result = await runDream(brain, {
            dryRun: false,
            phases: {
                normalize: false,
                consolidate: false,
                staleness: false,
                flow: false,
                promote: false,
                prune: false,
                compaction: false,
                render: false,
            },
        });
        assert(result.snapshotPath);
        assert(fs.existsSync(result.snapshotPath));
        brain.addNode('aprendizado', 'after snapshot', { smoke: true });
        assert.strictEqual(brain.getStats().nodeCount, 1);
        const restored = restoreDreamSnapshot(brain, result.snapshotPath);
        assert.strictEqual(restored.ok, true, restored.error);
        assert.strictEqual(brain.getStats().nodeCount, 0);
    });
}

async function testPolicyDisablesPhases() {
    await withBrain('policy', async (brain) => {
        const result = await runDream(brain, {
            dryRun: true,
            phases: {
                normalize: false,
                consolidate: false,
                staleness: false,
                flow: false,
                promote: false,
                prune: false,
                compaction: false,
                render: false,
            },
        });
        const normalize = result.reports.find(r => r.phase === 'normalize');
        assert(normalize);
        assert.strictEqual(normalize.skipped, true);
        assert.strictEqual(result.policy.normalize, false);
    });
}

async function testMicroFlowAndReplayFeedback() {
    await withBrain('micro-flow', async (brain) => {
        const state = brain.addNode('page_state', 'TJPA:norm:test', {
            tribunal: 'TJPA',
            pjeContext: 'portal_pje',
            canonicalContext: 'portal_pje',
            canonicalStateKey: 'TJPA|portal_pje|tjpa/portal_pje',
        }, { confidence: 0.7, source: 'test' });
        const action = brain.addNode('action', 'browser_navigate:canon', {
            tool: 'browser_navigate',
            input: { url: 'https://pje.tjpa.jus.br' },
            canonicalInput: { url: 'tjpa/portal_pje' },
            successCount: 3,
            failureCount: 0,
        }, { confidence: 0.7, source: 'test' });
        brain.addEdge(state.id, action.id, 'performs', {});
        brain.boostEdge(state.id, action.id, 'performs', 2);

        const report = detectFlows(brain);
        assert.strictEqual(report.flowsCreated, 1);
        assert.strictEqual(report.detected[0].instances, 3);

        const plan = findReplayPlan(brain, {
            tribunal: 'TJPA',
            pjeContext: 'portal_pje',
            strict: false,
            minConfidence: 0.1,
        });
        assert(plan);
        assert.strictEqual(plan.steps.length, 1);

        const beforeFlow = brain.getNode(plan.flowId);
        assert.strictEqual(beforeFlow.data.flowKind, 'micro');
        recordReplayOutcome(brain, plan, { success: true });

        const afterAction = brain.getNode(action.id);
        const afterFlow = brain.getNode(plan.flowId);
        assert.strictEqual(afterAction.data.replaySuccessCount, 1);
        assert.strictEqual(afterFlow.data.replaySuccessCount, 1);
        assert(afterFlow.confidence > beforeFlow.confidence);
    });
}

async function testReplayPrefersMatchingEnvironment() {
    await withBrain('environment-replay', async (brain) => {
        const advogadoState = brain.addNode('page_state', 'TJPA:adv:autos', {
            tribunal: 'TJPA',
            pjeContext: 'autos',
            canonicalContext: 'autos',
            canonicalStateKey: 'TJPA|autos|tjpa/autos/adv',
            profileKind: 'advogado',
            authState: 'logado',
            surfaceKind: 'autos',
            screenFamily: 'advogado_autos',
            areaLabel: 'autos_do_advogado',
            canonicalEnvironmentKey: 'TJPA|advogado|autos|logado|autos_do_advogado',
        }, { confidence: 0.8, source: 'test' });
        const servidorState = brain.addNode('page_state', 'TJPA:serv:autos', {
            tribunal: 'TJPA',
            pjeContext: 'autos',
            canonicalContext: 'autos',
            canonicalStateKey: 'TJPA|autos|tjpa/autos/serv',
            profileKind: 'servidor',
            authState: 'logado',
            surfaceKind: 'autos',
            screenFamily: 'servidor_autos',
            areaLabel: 'autos_do_servidor',
            canonicalEnvironmentKey: 'TJPA|servidor|autos|logado|autos_do_servidor',
        }, { confidence: 0.8, source: 'test' });

        const advogadoAction = brain.addNode('action', 'browser_click:adv', {
            tool: 'browser_click',
            input: { selector: '#aba-expedientes' },
            successCount: 3,
            failureCount: 0,
        }, { confidence: 0.8, source: 'test' });
        const servidorAction = brain.addNode('action', 'browser_click:serv', {
            tool: 'browser_click',
            input: { selector: '#aba-tarefas-internas' },
            successCount: 3,
            failureCount: 0,
        }, { confidence: 0.8, source: 'test' });

        brain.addEdge(advogadoState.id, advogadoAction.id, 'performs', {});
        brain.boostEdge(advogadoState.id, advogadoAction.id, 'performs', 2);
        brain.addEdge(servidorState.id, servidorAction.id, 'performs', {});
        brain.boostEdge(servidorState.id, servidorAction.id, 'performs', 2);

        const report = detectFlows(brain);
        assert.strictEqual(report.flowsCreated, 2);

        const servidorPlan = findReplayPlan(brain, {
            tribunal: 'TJPA',
            pjeContext: 'autos',
            environment: {
                tribunal: 'TJPA',
                pjeContext: 'autos',
                profileKind: 'servidor',
                authState: 'logado',
                surfaceKind: 'autos',
                screenFamily: 'servidor_autos',
                areaLabel: 'autos_do_servidor',
                canonicalEnvironmentKey: 'TJPA|servidor|autos|logado|autos_do_servidor',
            },
            strict: false,
            minConfidence: 0.1,
        });
        assert(servidorPlan);
        assert.strictEqual(servidorPlan.steps[0].actionId, servidorAction.id);

        const advogadoPlan = findReplayPlan(brain, {
            tribunal: 'TJPA',
            pjeContext: 'autos',
            environment: {
                tribunal: 'TJPA',
                pjeContext: 'autos',
                profileKind: 'advogado',
                authState: 'logado',
                surfaceKind: 'autos',
                screenFamily: 'advogado_autos',
                areaLabel: 'autos_do_advogado',
                canonicalEnvironmentKey: 'TJPA|advogado|autos|logado|autos_do_advogado',
            },
            strict: false,
            minConfidence: 0.1,
        });
        assert(advogadoPlan);
        assert.strictEqual(advogadoPlan.steps[0].actionId, advogadoAction.id);
    });
}

async function testBrainSelectorLookupPrefersMatchingEnvironment() {
    await withBrain('selector-environment', async (brain) => {
        brain.recordSelectorSuccess('TJPA', 'autos', '#legacy-autos');
        brain.recordSelectorSuccess('TJPA', 'autos', '#servidor-autos', {
            environment: {
                tribunal: 'TJPA',
                pjeContext: 'autos',
                profileKind: 'servidor',
                authState: 'logado',
                surfaceKind: 'autos',
                screenFamily: 'servidor_autos',
                areaLabel: 'autos_do_servidor',
                canonicalEnvironmentKey: 'TJPA|servidor|autos|logado|autos_do_servidor',
            },
        });
        brain.recordSelectorSuccess('TJPA', 'autos', '#advogado-autos', {
            environment: {
                tribunal: 'TJPA',
                pjeContext: 'autos',
                profileKind: 'advogado',
                authState: 'logado',
                surfaceKind: 'autos',
                screenFamily: 'advogado_autos',
                areaLabel: 'autos_do_advogado',
                canonicalEnvironmentKey: 'TJPA|advogado|autos|logado|autos_do_advogado',
            },
        });

        const servidorSelectors = brain.lookupSelectors('TJPA', 'autos', {
            environment: {
                tribunal: 'TJPA',
                pjeContext: 'autos',
                profileKind: 'servidor',
                authState: 'logado',
                surfaceKind: 'autos',
                screenFamily: 'servidor_autos',
                areaLabel: 'autos_do_servidor',
                canonicalEnvironmentKey: 'TJPA|servidor|autos|logado|autos_do_servidor',
            },
        });
        assert.deepStrictEqual(servidorSelectors.slice(0, 2), ['#servidor-autos', '#legacy-autos']);

        const advogadoSelectors = brain.lookupSelectors('TJPA', 'autos', {
            environment: {
                tribunal: 'TJPA',
                pjeContext: 'autos',
                profileKind: 'advogado',
                authState: 'logado',
                surfaceKind: 'autos',
                screenFamily: 'advogado_autos',
                areaLabel: 'autos_do_advogado',
                canonicalEnvironmentKey: 'TJPA|advogado|autos|logado|autos_do_advogado',
            },
        });
        assert.deepStrictEqual(advogadoSelectors.slice(0, 2), ['#advogado-autos', '#legacy-autos']);
    });
}

async function testRiskAndExplainOnDreamReports() {
    await withBrain('risk-explain', async (brain) => {
        brain.addNode('page_state', 'TJPA:old', {
            url: 'https://pje.tjpa.jus.br',
            title: 'TJPA - Portal PJE',
            tribunal: 'TJPA',
            domHash: 'abc',
        }, { confidence: 0.3, source: 'test' });
        const result = await runDream(brain, {
            dryRun: true,
            phases: { normalize: true, render: false },
        });
        assert(result.reports.length > 0);
        assert(result.reports.every(r => r.risk && r.risk.level));
        assert(result.reports.every(r => Array.isArray(r.explanations) && r.explanations.length > 0));
    });
}

async function main() {
    rmDir(TMP_ROOT);
    fs.mkdirSync(TMP_ROOT, { recursive: true });
    const tests = [
        testCanonicalActionInput,
        testWriterDedupesCanonicalActions,
        testNormalizeGroupsTjpaRedirects,
        testDreamDryRunDoesNotMutate,
        testSnapshotRestore,
        testPolicyDisablesPhases,
        testMicroFlowAndReplayFeedback,
        testReplayPrefersMatchingEnvironment,
        testBrainSelectorLookupPrefersMatchingEnvironment,
        testRiskAndExplainOnDreamReports,
    ];

    for (const test of tests) {
        await test();
        console.log(`[BrainTest] ok ${test.name}`);
    }
    rmDir(TMP_ROOT);
    console.log(`[BrainTest] ${tests.length} passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
