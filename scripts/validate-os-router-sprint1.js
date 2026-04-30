const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_USER_DATA_DIR = process.platform === 'win32' && process.env.APPDATA
    ? path.join(process.env.APPDATA, 'lex-test1')
    : path.join(os.homedir(), '.lex');

const PROVIDER_ENV_KEYS = {
    anthropic: 'LEX_ANTHROPIC_KEY',
    openai: 'LEX_OPENAI_KEY',
    openrouter: 'LEX_OPENROUTER_KEY',
    google: 'LEX_GOOGLE_KEY',
    groq: 'LEX_GROQ_KEY',
};

const PROVIDER_DEFAULT_MODELS = {
    anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
};

const CASES = [
    {
        name: 'pdfs 2024 downloads',
        prompt: 'ache todos os PDFs de 2024 nos meus downloads',
        expect: decision => decision.tipo === 'skill' && decision.skill === 'os_buscar',
        expected: 'os_buscar',
    },
    {
        name: 'contrato joao',
        prompt: 'cadê aquele contrato do João?',
        expect: decision => decision.tipo === 'skill' && decision.skill === 'os_buscar',
        expected: 'os_buscar',
    },
    {
        name: 'memorial documentos',
        prompt: 'tem algum arquivo memorial em documentos?',
        expect: decision => decision.tipo === 'skill' && decision.skill === 'os_buscar',
        expected: 'os_buscar',
    },
    {
        name: 'docx rescisao conteudo',
        prompt: 'procura .docx que falem sobre rescisão',
        expect: decision => decision.tipo === 'skill' && decision.skill === 'os_buscar',
        expected: 'os_buscar',
    },
    {
        name: 'duplicados ambiguo',
        prompt: 'encontra duplicados na pasta downloads',
        expect: decision => decision.tipo === 'pergunta'
            || (decision.tipo === 'skill'
                && decision.skill === 'os_buscar'
                && decision.parametros?.modo === 'duplicados_nome'),
        expected: 'pergunta ou os_buscar duplicados_nome',
    },
    {
        name: 'processo cnj',
        prompt: 'busca o processo 0000123-45.2024.8.14.0301',
        expect: decision => decision.tipo === 'skill'
            && ['pje_consultar', 'pje_browser_use'].includes(decision.skill),
        expected: 'pje_consultar ou pje_browser_use',
    },
];

function parseArgs(argv) {
    const args = {
        provider: process.env.LEX_ROUTER_VALIDATE_PROVIDER || 'anthropic',
        models: undefined,
        userDataDir: process.env.LEX_USER_DATA || DEFAULT_USER_DATA_DIR,
        worker: false,
        caseIndex: undefined,
        timeoutMs: Number(process.env.LEX_ROUTER_VALIDATE_CASE_TIMEOUT_MS || 120000),
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--provider') args.provider = argv[++i] || args.provider;
        else if (arg.startsWith('--provider=')) args.provider = arg.slice('--provider='.length);
        else if (arg === '--models') args.models = argv[++i];
        else if (arg.startsWith('--models=')) args.models = arg.slice('--models='.length);
        else if (arg === '--user-data-dir') args.userDataDir = argv[++i] || args.userDataDir;
        else if (arg.startsWith('--user-data-dir=')) args.userDataDir = arg.slice('--user-data-dir='.length);
        else if (arg === '--worker') args.worker = true;
        else if (arg === '--case-index') args.caseIndex = Number(argv[++i]);
        else if (arg.startsWith('--case-index=')) args.caseIndex = Number(arg.slice('--case-index='.length));
        else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i]) || args.timeoutMs;
        else if (arg.startsWith('--timeout-ms=')) args.timeoutMs = Number(arg.slice('--timeout-ms='.length)) || args.timeoutMs;
    }

    return args;
}

function readCliConfig(userDataDir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(userDataDir, 'cli-config.json'), 'utf8'));
    } catch {
        return {};
    }
}

function loadApiKey(provider, userDataDir) {
    const envName = PROVIDER_ENV_KEYS[provider];
    const envKey = envName ? String(process.env[envName] || '').trim() : '';
    if (envKey) return envKey;

    const { initCryptoStoreSalt, safeDecrypt } = require('../dist-electron/crypto-store');
    initCryptoStoreSalt(userDataDir);
    const cfg = readCliConfig(userDataDir);
    return safeDecrypt(String(cfg.keys?.[provider] || '').trim());
}

function modelsFor(provider, modelsArg) {
    if (modelsArg) return modelsArg.split(',').map(s => s.trim()).filter(Boolean);
    return PROVIDER_DEFAULT_MODELS[provider] || [];
}

function makeState(prompt) {
    return {
        id: `os-router-sprint1-${randomUUID()}`,
        objetivo: prompt,
        status: 'running',
        contexto: {
            documentos: [],
            resultados: {},
        },
        passos: [],
        iteracao: 0,
        startTime: Date.now(),
    };
}

function summarize(decision) {
    if (decision.tipo === 'skill') {
        return `${decision.tipo}:${decision.skill} ${JSON.stringify(decision.parametros || {})}`;
    }
    if (decision.tipo === 'pergunta') return `${decision.tipo}:${decision.pergunta || ''}`;
    return `${decision.tipo}:${String(decision.resposta || '').slice(0, 120)}`;
}

function assertDistReady() {
    const distAgentPath = path.join(ROOT, 'dist-electron', 'agent', 'index.js');
    assert(fs.existsSync(distAgentPath), 'dist-electron nao encontrado. Rode npm run build antes.');
}

async function runWorker(args) {
    assertDistReady();

    const provider = args.provider;
    const models = modelsFor(provider, args.models);
    assert.strictEqual(models.length, 1, 'worker exige exatamente um modelo');
    assert(Number.isInteger(args.caseIndex), 'worker exige --case-index');

    const testCase = CASES[args.caseIndex];
    assert(testCase, `case-index invalido: ${args.caseIndex}`);

    const apiKey = provider === 'ollama' ? 'ollama' : loadApiKey(provider, args.userDataDir);
    assert(apiKey, `API key nao encontrada para ${provider}. Configure ${PROVIDER_ENV_KEYS[provider] || 'a env var do provider'} ou cli-config.json.`);

    const { initializeAgent, think, DEFAULT_CONFIG } = require('../dist-electron/agent');
    const { clearPromptCache } = require('../dist-electron/agent/think');
    const { setActiveConfig, PROVIDER_PRESETS } = require('../dist-electron/provider-config');

    const preset = PROVIDER_PRESETS[provider];
    assert(preset, `Provider desconhecido: ${provider}`);

    const originalLog = console.log;
    const originalWarn = console.warn;
    const quiet = process.env.LEX_ROUTER_VALIDATE_VERBOSE !== '1';
    if (quiet) {
        console.log = () => {};
        console.warn = () => {};
    }

    const model = models[0];
    const started = Date.now();
    let result;
    try {
        await initializeAgent();

        setActiveConfig({
            providerId: provider,
            apiKey,
            agentModel: model,
            visionModel: preset.defaultVisionModel,
        });

        const state = makeState(testCase.prompt);
        let decision;
        try {
            decision = await think(state, {
                ...DEFAULT_CONFIG,
                verbose: false,
                enableCritic: false,
                maxIterations: 1,
                temperature: 0,
                model,
            });
        } finally {
            clearPromptCache(state.id);
        }

        result = {
            ok: testCase.expect(decision),
            name: testCase.name,
            expected: testCase.expected,
            summary: summarize(decision),
            elapsedMs: Date.now() - started,
        };
    } catch (error) {
        result = {
            ok: false,
            name: testCase.name,
            expected: testCase.expected,
            summary: `erro:${error?.message || String(error)}`,
            elapsedMs: Date.now() - started,
        };
    } finally {
        console.log = originalLog;
        console.warn = originalWarn;
    }

    process.stdout.write(`@@RESULT@@${JSON.stringify(result)}\n`);
}

function runParent(args) {
    const provider = args.provider;
    const models = modelsFor(provider, args.models);
    assert(models.length > 0, `Nenhum modelo configurado para provider "${provider}". Use --models modelo1,modelo2.`);
    assertDistReady();

    const apiKey = provider === 'ollama' ? 'ollama' : loadApiKey(provider, args.userDataDir);
    assert(apiKey, `API key nao encontrada para ${provider}. Configure ${PROVIDER_ENV_KEYS[provider] || 'a env var do provider'} ou cli-config.json.`);

    const failures = [];
    console.log(`[OS Router Sprint 1] provider=${provider} models=${models.join(', ')} timeoutPorCaso=${args.timeoutMs}ms`);

    for (const model of models) {
        console.log(`\n## ${model}`);
        for (let caseIndex = 0; caseIndex < CASES.length; caseIndex += 1) {
            const testCase = CASES[caseIndex];
            const child = spawnSync(process.execPath, [
                __filename,
                '--worker',
                '--provider', provider,
                '--models', model,
                '--case-index', String(caseIndex),
                '--user-data-dir', args.userDataDir,
            ], {
                cwd: ROOT,
                encoding: 'utf8',
                timeout: args.timeoutMs,
                env: process.env,
            });

            let parsed;
            const resultLine = String(child.stdout || '').split(/\r?\n/).find(line => line.startsWith('@@RESULT@@'));
            if (resultLine) {
                try {
                    parsed = JSON.parse(resultLine.slice('@@RESULT@@'.length));
                } catch {
                    parsed = undefined;
                }
            }

            if (!parsed) {
                const timedOut = child.error?.code === 'ETIMEDOUT' || child.signal;
                parsed = {
                    ok: false,
                    name: testCase.name,
                    expected: testCase.expected,
                    summary: timedOut
                        ? `timeout depois de ${args.timeoutMs}ms`
                        : `erro sem resultado: ${child.error?.message || child.stderr || 'saida vazia'}`,
                    elapsedMs: args.timeoutMs,
                };
            }

            const status = parsed.ok ? 'PASS' : 'FAIL';
            console.log(`${status} | ${parsed.name} | esperado=${parsed.expected} | obtido=${parsed.summary} | ${parsed.elapsedMs}ms`);
            if (!parsed.ok) failures.push({ model, case: parsed.name, summary: parsed.summary });
        }
    }

    if (failures.length > 0) {
        console.error(`\n[OS Router Sprint 1] ${failures.length} falha(s).`);
        process.exit(1);
    }

    console.log('\n[OS Router Sprint 1] validacao LLM passou.');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.worker) {
        await runWorker(args);
        return;
    }
    runParent(args);
}

main().catch(error => {
    console.error('[OS Router Sprint 1] erro');
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
