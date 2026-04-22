const assert = require('assert');

const { suggestOsPlannerAction, formatOsIntentHint } = require('../dist-electron/agent/os-intent-router');
const { critic } = require('../dist-electron/agent/critic');

function expectSkill(name, objective, expectedSkill, expectedParams = {}, ctx = {}) {
    const hint = suggestOsPlannerAction(objective, ctx);
    assert(hint, `${name}: expected hint`);
    assert.strictEqual(hint.tipo, 'skill', `${name}: expected skill`);
    assert.strictEqual(hint.skill, expectedSkill, `${name}: expected ${expectedSkill}`);
    assert.notStrictEqual(hint.skill, 'terminal_executar', `${name}: should not use terminal`);

    for (const [key, value] of Object.entries(expectedParams)) {
        assert.deepStrictEqual(hint.parametros?.[key], value, `${name}: param ${key}`);
    }

    const formatted = formatOsIntentHint(hint);
    assert(formatted.includes(expectedSkill), `${name}: formatted hint includes skill`);
    assert(formatted.includes('Nao use terminal_executar'), `${name}: formatted hint blocks terminal`);
}

function expectPergunta(name, objective, ctx = {}) {
    const hint = suggestOsPlannerAction(objective, ctx);
    assert(hint, `${name}: expected hint`);
    assert.strictEqual(hint.tipo, 'pergunta', `${name}: expected pergunta`);
    assert(hint.pergunta, `${name}: expected pergunta text`);
    assert(Array.isArray(hint.opcoes), `${name}: expected options`);
}

function testOsPlannerRouting() {
    expectSkill(
        'listar downloads',
        'veja meus arquivos da area de downloads',
        'os_listar',
        { caminho: 'downloads' }
    );

    expectSkill(
        'listar downloads mesmo quando usuario fala terminal',
        'liste meus downloads pelo terminal',
        'os_listar',
        { caminho: 'downloads' }
    );

    expectPergunta(
        'duplicado ambiguo',
        'tem algum duplicado?',
        { chatHistory: 'Usuario acabou de listar Downloads.' }
    );

    expectSkill(
        'duplicado por nome obvio',
        'Por nome obvio',
        'os_buscar',
        { caminho: 'downloads', modo: 'duplicados_nome' },
        { chatHistory: 'Usuario: veja meus arquivos da area de downloads\nAssistente: pasta Downloads listada.' }
    );

    expectSkill(
        'deletar esses',
        'deleta esses arquivos',
        'os_deletar',
        {},
        { chatHistory: 'Contexto PC: Downloads com arquivos selecionados.' }
    );

    expectSkill(
        'mover pdfs',
        'move esses PDFs para documentos',
        'os_mover',
        {},
        { chatHistory: 'Contexto PC: arquivos em downloads.' }
    );

    expectSkill(
        'simular mover',
        'simula mover esses PDFs para documentos sem alterar nada',
        'os_mover',
        { dry_run: true },
        { chatHistory: 'Contexto PC: arquivos em downloads.' }
    );

    expectSkill(
        'organizar pasta com plano seguro',
        'organiza essa pasta em subpastas por tipo',
        'os_mover',
        { dry_run: true },
        { chatHistory: 'Contexto PC: arquivos em downloads.' }
    );

    expectSkill(
        'simular delete',
        'mostra antes o que vai deletar desses arquivos',
        'os_deletar',
        { dry_run: true },
        { chatHistory: 'Contexto PC: arquivos em downloads.' }
    );

    expectSkill(
        'abrir arquivo',
        'abre esse arquivo pdf',
        'os_sistema',
        { operacao: 'abrir' },
        { chatHistory: 'Contexto PC: C:\\Users\\EDER\\Downloads\\doc.pdf' }
    );

    expectSkill(
        'procurar memorial',
        'procura arquivo com memorial no downloads',
        'os_buscar',
        { caminho: 'downloads', conteudo: 'memorial' }
    );

    expectSkill(
        'tamanho downloads',
        'quanto espaco meus downloads ocupam?',
        'os_tamanho',
        { caminho: 'downloads' }
    );

    expectSkill(
        'listar antes de encerrar processos sem alvo',
        'Encerra os processos pra mim',
        'os_sistema',
        { operacao: 'processos' },
        { chatHistory: 'Assistente: arquivos duplicados estao com pendencias no dry-run.' }
    );

    expectSkill(
        'listar processos de leitores pdf',
        'lista processos word acrobat reader',
        'os_sistema',
        { operacao: 'processos' }
    );

    expectSkill(
        'encerrar word com skill',
        'encerra o word',
        'os_sistema',
        { operacao: 'encerrar', alvo: 'WINWORD.EXE' }
    );
}

function testTerminalStillAllowedForDevCommands() {
    const hint = suggestOsPlannerAction('roda npm run build', {});
    assert.strictEqual(hint, null, 'dev command should not be captured by OS file router');
}

async function testCriticCorrigeTerminalParaSkillOs() {
    const decision = await critic({
        id: 'test-critic-os-router',
        objetivo: 'liste meus downloads pelo terminal',
        status: 'running',
        contexto: {
            documentos: [],
            resultados: {},
            chatHistory: ''
        },
        passos: [],
        iteracao: 0,
        startTime: Date.now()
    }, {
        skill: 'terminal_executar',
        parametros: { comando: 'dir Downloads' }
    }, {});

    assert.strictEqual(decision.approved, true);
    assert.strictEqual(decision.correctedDecision?.skill, 'os_listar');
    assert.deepStrictEqual(decision.correctedDecision?.parametros, { caminho: 'downloads' });
    assert.match(decision.reason, /substituido|os_listar/i);
}

async function run() {
    const tests = [
        testOsPlannerRouting,
        testTerminalStillAllowedForDevCommands,
        testCriticCorrigeTerminalParaSkillOs
    ];

    for (const test of tests) {
        await test();
        console.log(`[OsPlannerTest] ok ${test.name}`);
    }
    console.log(`[OsPlannerTest] ${tests.length} passed`);
}

run().catch((error) => {
    console.error('[OsPlannerTest] failed');
    console.error(error);
    process.exit(1);
});
