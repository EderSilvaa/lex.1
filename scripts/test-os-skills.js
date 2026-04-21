const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const TMP_ROOT = path.join(ROOT, '.tmp-os-skill-tests');
const AUDIT_LOG = path.join(TMP_ROOT, 'os-audit.jsonl');
process.env.LEX_OS_AUDIT_LOG = AUDIT_LOG;

const tools = require('../dist-electron/tools/os-tools');
const { osListar } = require('../dist-electron/skills/os/listar');
const { osBuscar } = require('../dist-electron/skills/os/buscar');
const { osDeletar } = require('../dist-electron/skills/os/deletar');
const { osMover } = require('../dist-electron/skills/os/mover');
const { osArquivos } = require('../dist-electron/skills/os/arquivos');
const { osEscrever } = require('../dist-electron/skills/os/escrever');
const { osTamanho } = require('../dist-electron/skills/os/tamanho');
const { osSistema } = require('../dist-electron/skills/os/sistema');
const { osClipboard } = require('../dist-electron/skills/os/clipboard');
const { osFetch } = require('../dist-electron/skills/os/fetch');
const { osTerminal } = require('../dist-electron/skills/os/terminal');

function resetTmp() {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    fs.mkdirSync(TMP_ROOT, { recursive: true });
}

function cleanupTmp() {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
}

function writeFile(rel, content = '') {
    const filePath = path.join(TMP_ROOT, rel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
}

function readAuditLines() {
    if (!fs.existsSync(AUDIT_LOG)) return [];
    return fs.readFileSync(AUDIT_LOG, 'utf8')
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));
}

async function testPathAliases() {
    const home = os.homedir();

    assert.strictEqual(
        tools.resolverCaminhoOs('downloads'),
        path.join(home, 'Downloads')
    );
    assert.strictEqual(
        tools.resolverCaminhoOs('downloads/arquivo.pdf'),
        path.join(home, 'Downloads', 'arquivo.pdf')
    );
    assert.strictEqual(
        tools.resolverCaminhoOs('desktop/pasta'),
        path.join(home, 'Desktop', 'pasta')
    );
    assert.strictEqual(
        tools.resolverCaminhoOs('documentos/x.txt'),
        path.join(home, 'Documents', 'x.txt')
    );
    assert.strictEqual(
        tools.resolverCaminhoOs('~/x.txt'),
        path.join(home, 'x.txt')
    );

    const absolute = path.join(TMP_ROOT, 'absolute.txt');
    assert.strictEqual(tools.resolverCaminhoOs(absolute), absolute);
}

async function testResolverEntradaUsaBaseEFuzzySeguro() {
    resetTmp();
    const raiz = path.join(TMP_ROOT, 'documentos importantes');
    fs.mkdirSync(raiz, { recursive: true });
    const cpf = writeFile(path.join('documentos importantes', 'CPF.pdf'), 'cpf');
    const peca = writeFile(path.join('documentos importantes', 'CONTRA RAZÕES AO RECURSO D.pdf'), 'pdf');

    assert.strictEqual(
        tools.aplicarBaseCaminhoOs('CPF.pdf', raiz),
        cpf
    );
    assert.strictEqual(
        tools.aplicarBaseCaminhoOs('downloads/CPF.pdf', raiz),
        'downloads/CPF.pdf'
    );

    const direto = await tools.resolverEntradaOs('CPF.pdf', { baseDir: raiz, mustExist: true });
    assert.strictEqual(direto.sucesso, true, direto.erro);
    assert.strictEqual(direto.dados.caminho, cpf);
    assert.strictEqual(direto.dados.fuzzy, false);

    const fuzzy = await tools.resolverEntradaOs('CONTRARAZOES AO RECURSO D.pdf', { baseDir: raiz, mustExist: true });
    assert.strictEqual(fuzzy.sucesso, true, fuzzy.erro);
    assert.strictEqual(fuzzy.dados.caminho, peca);
    assert.strictEqual(fuzzy.dados.fuzzy, true);

    const info = await osArquivos.execute({ operacao: 'info', caminho: path.join(raiz, 'CONTRARAZOES AO RECURSO D.pdf') }, {});
    assert.strictEqual(info.sucesso, true, info.erro || info.mensagem);
    assert.strictEqual(info.dados.caminho, peca);
    assert.strictEqual(info.dados.fuzzy, true);

    const comprovanteMaior = writeFile(path.join('documentos importantes', 'Comprovante de residência .pdf'), 'maior');
    writeFile(path.join('documentos importantes', 'comprovante de residencia .pdf'), 'menor');
    const comprovante = await tools.resolverEntradaOs('Comprovante de residência .pdf', { baseDir: raiz, mustExist: true });
    assert.strictEqual(comprovante.sucesso, true, comprovante.erro);
    assert.strictEqual(comprovante.dados.caminho, comprovanteMaior);
}

async function testResolverEntradaNaoEscolheQuandoAmbiguo() {
    resetTmp();
    const raiz = path.join(TMP_ROOT, 'documentos importantes');
    fs.mkdirSync(raiz, { recursive: true });
    writeFile(path.join('documentos importantes', 'comprovante_de_residencia.pdf'), 'menor');
    writeFile(path.join('documentos importantes', 'comprovante-de-residencia.pdf'), 'maior');

    const result = await tools.resolverEntradaOs('comprovante de residencia.pdf', { baseDir: raiz, mustExist: true });
    assert.strictEqual(result.sucesso, false);
    assert.strictEqual(result.codigo, 'caminho_ambiguo');
    assert.strictEqual(result.dados.total, 2);
}

async function testBuscarDuplicadosPorNome() {
    resetTmp();
    writeFile('relatorio.pdf', 'original');
    writeFile('relatorio (1).pdf', 'copy');
    writeFile('outro.pdf', 'other');

    const result = await osBuscar.execute({
        caminho: TMP_ROOT,
        modo: 'duplicados_nome',
        limite: 10
    }, {});

    assert.strictEqual(result.sucesso, true, result.erro || result.mensagem);
    assert.strictEqual(result.dados.totalGrupos, 1);
    assert.strictEqual(result.dados.grupos[0].chave, 'relatorio.pdf');
    assert.strictEqual(result.dados.grupos[0].itens.length, 2);
}

async function testListarFiltroOrdenacaoPaginacao() {
    resetTmp();
    writeFile('alpha.pdf', '12345');
    writeFile('beta.pdf', '1234567890');
    writeFile('notas.txt', 'texto');
    fs.mkdirSync(path.join(TMP_ROOT, 'pasta'), { recursive: true });

    const page0 = await osListar.execute({
        caminho: TMP_ROOT,
        filtro: '*.pdf',
        ordem: 'tamanho',
        direcao: 'desc',
        limite: 1,
        pagina: 0
    }, {});

    assert.strictEqual(page0.sucesso, true, page0.erro || page0.mensagem);
    assert.strictEqual(page0.dados.total, 4);
    assert.strictEqual(page0.dados.totalFiltrado, 2);
    assert.strictEqual(page0.dados.mostrando, 1);
    assert.strictEqual(page0.dados.truncado, true);
    assert.strictEqual(page0.dados.itens[0].nome, 'beta.pdf');

    const page1 = await osListar.execute({
        caminho: TMP_ROOT,
        filtro: '*.pdf',
        ordem: 'tamanho',
        direcao: 'desc',
        limite: 1,
        pagina: 1
    }, {});

    assert.strictEqual(page1.sucesso, true, page1.erro || page1.mensagem);
    assert.strictEqual(page1.dados.truncado, false);
    assert.strictEqual(page1.dados.itens[0].nome, 'alpha.pdf');
}

async function testBuscarPorNomeEConteudo() {
    resetTmp();
    const contrato = writeFile('casos/contrato.txt', 'linha 1\nmemorial tributario\n');
    writeFile('casos/outro.txt', 'sem a palavra');
    writeFile('casos/memorial.md', 'memorial em outro tipo');

    const result = await osBuscar.execute({
        caminho: TMP_ROOT,
        padrao: '*.txt',
        conteudo: 'memorial',
        limite: 10
    }, {});

    assert.strictEqual(result.sucesso, true, result.erro || result.mensagem);
    assert.strictEqual(result.dados.total, 1);
    assert.strictEqual(result.dados.itens[0].caminho, contrato);
    assert.strictEqual(result.dados.itens[0].ocorrencias, 1);

    const alias = await osBuscar.execute({
        caminho: TMP_ROOT,
        nome: 'memorial',
        limite: 10
    }, {});

    assert(osBuscar.parametros.nome, 'schema de os_buscar deve declarar alias "nome"');
    assert(osBuscar.parametros.filtro, 'schema de os_buscar deve declarar alias "filtro"');
    assert.strictEqual(alias.sucesso, true, alias.erro || alias.mensagem);
    assert(alias.dados.total >= 1, 'os_buscar deve aceitar alias "nome" como padrao');
}

async function testDeletarRequiresConfirmation() {
    resetTmp();
    const target = writeFile('lixo.tmp', 'keep');

    const result = await osDeletar.execute({ caminho: target }, {});

    assert.strictEqual(result.sucesso, false);
    assert.strictEqual(result.dados.requiresUserAction, true);
    assert(fs.existsSync(target), 'os_deletar sem confirmacao nao deve remover arquivo');
}

async function testMoverCopiarNaoSobrescreve() {
    resetTmp();
    const origemMove = writeFile('origem-move.txt', 'origem');
    const destinoMove = writeFile('destino-move.txt', 'destino');

    const move = await tools.moverItem(origemMove, destinoMove);
    assert.strictEqual(move.sucesso, false);
    assert.strictEqual(move.codigo, 'destino_existe');
    assert(move.sugestao);
    assert.match(move.erro, /ja existe|existe/i);
    assert.strictEqual(fs.readFileSync(origemMove, 'utf8'), 'origem');
    assert.strictEqual(fs.readFileSync(destinoMove, 'utf8'), 'destino');

    const origemCopy = writeFile('origem-copy.txt', 'copy');
    const destinoCopy = writeFile('destino-copy.txt', 'destino');

    const copy = await tools.copiarArquivo(origemCopy, destinoCopy);
    assert.strictEqual(copy.sucesso, false);
    assert.strictEqual(copy.codigo, 'destino_existe');
    assert(copy.sugestao);
    assert.match(copy.erro, /ja existe|existe/i);
    assert.strictEqual(fs.readFileSync(origemCopy, 'utf8'), 'copy');
    assert.strictEqual(fs.readFileSync(destinoCopy, 'utf8'), 'destino');
}

async function testMoverOperacoesBasicas() {
    resetTmp();
    const pasta = path.join(TMP_ROOT, 'organizado');
    const mkdir = await osMover.execute({ operacao: 'criar_pasta', origem: pasta }, {});

    assert.strictEqual(mkdir.sucesso, true, mkdir.erro || mkdir.mensagem);
    assert(fs.existsSync(pasta), 'os_mover criar_pasta deve criar a pasta');

    const origem = writeFile('origem.txt', 'origem');
    const copia = path.join(pasta, 'copia.txt');
    const copy = await osMover.execute({ operacao: 'copiar', origem, destino: copia }, {});

    assert.strictEqual(copy.sucesso, true, copy.erro || copy.mensagem);
    assert.strictEqual(fs.readFileSync(origem, 'utf8'), 'origem');
    assert.strictEqual(fs.readFileSync(copia, 'utf8'), 'origem');

    const renomeado = path.join(pasta, 'renomeado.txt');
    const rename = await osMover.execute({ operacao: 'renomear', origem: copia, destino: renomeado }, {});

    assert.strictEqual(rename.sucesso, true, rename.erro || rename.mensagem);
    assert(!fs.existsSync(copia), 'renomear deve remover o nome antigo');
    assert.strictEqual(fs.readFileSync(renomeado, 'utf8'), 'origem');

    const movido = path.join(pasta, 'movido.txt');
    const move = await osMover.execute({ operacao: 'mover', origem, destino: movido }, {});

    assert.strictEqual(move.sucesso, true, move.erro || move.mensagem);
    assert(!fs.existsSync(origem), 'mover deve remover a origem');
    assert.strictEqual(fs.readFileSync(movido, 'utf8'), 'origem');
}

async function testMoverBatchExigeConfirmacaoSemMutar() {
    resetTmp();
    const origemA = writeFile('batch-a.txt', 'a');
    const origemB = writeFile('batch-b.txt', 'b');
    const destinoA = path.join(TMP_ROOT, 'batch-a-movido.txt');
    const destinoB = path.join(TMP_ROOT, 'batch-b-movido.txt');

    const result = await osMover.execute({
        operacoes: [
            { operacao: 'mover', origem: origemA, destino: destinoA },
            { operacao: 'mover', origem: origemB, destino: destinoB }
        ]
    }, {});

    assert.strictEqual(result.sucesso, false);
    assert.strictEqual(result.dados.requiresUserAction, true);
    assert.match(result.dados.question, /Confirma/i);
    assert(fs.existsSync(origemA), 'batch sem confirmacao nao deve mover origem A');
    assert(fs.existsSync(origemB), 'batch sem confirmacao nao deve mover origem B');
    assert(!fs.existsSync(destinoA), 'batch sem confirmacao nao deve criar destino A');
    assert(!fs.existsSync(destinoB), 'batch sem confirmacao nao deve criar destino B');
}

async function testMoverBatchConfirmadoComPastaVirtual() {
    resetTmp();
    const origem = writeFile('peticao.pdf', 'pdf');
    const pasta = path.join(TMP_ROOT, 'Peticoes');
    const destinoFinal = path.join(pasta, 'peticao.pdf');

    const dry = await osMover.execute({
        dry_run: true,
        operacoes: [
            { operacao: 'criar_pasta', origem: pasta },
            { operacao: 'mover', origem, destino: pasta }
        ]
    }, {});

    assert.strictEqual(dry.sucesso, true, dry.erro || dry.mensagem);
    assert.match(dry.mensagem, /destino coagido como pasta/i);
    assert(fs.existsSync(origem), 'dry-run nao deve mover a origem');

    const result = await osMover.execute({
        batch_confirmado: true,
        operacoes: [
            { operacao: 'criar_pasta', origem: pasta },
            { operacao: 'mover', origem, destino: pasta }
        ]
    }, {});

    assert.strictEqual(result.sucesso, true, result.erro || result.mensagem);
    assert(!fs.existsSync(origem), 'batch confirmado deve mover a origem');
    assert.strictEqual(fs.readFileSync(destinoFinal, 'utf8'), 'pdf');
}

async function testMoverUsaCaminhoBaseParaOperacoesRelativas() {
    resetTmp();
    const raiz = path.join(TMP_ROOT, 'documentos importantes');
    fs.mkdirSync(raiz, { recursive: true });
    const origem = writeFile(path.join('documentos importantes', 'CPF.pdf'), 'cpf');
    const destinoFinal = path.join(raiz, '01_IDENTIFICACAO', 'CPF.pdf');

    const dry = await osMover.execute({
        caminho: raiz,
        dry_run: true,
        operacoes: [
            { tipo: 'criar_pasta', origem: '01_IDENTIFICACAO' },
            { origem: 'CPF.pdf', destino: '01_IDENTIFICACAO' }
        ]
    }, {});

    assert.strictEqual(dry.sucesso, true, dry.erro || dry.mensagem);
    assert.match(dry.mensagem, /documentos importantes/i);
    assert(fs.existsSync(origem), 'dry-run com caminho base nao deve mover origem');

    const result = await osMover.execute({
        caminho: raiz,
        batch_confirmado: true,
        operacoes: [
            { tipo: 'criar_pasta', origem: '01_IDENTIFICACAO' },
            { origem: 'CPF.pdf', destino: '01_IDENTIFICACAO' }
        ]
    }, {});

    assert.strictEqual(result.sucesso, true, result.erro || result.mensagem);
    assert(!fs.existsSync(origem), 'batch com caminho base deve mover origem relativa');
    assert.strictEqual(fs.readFileSync(destinoFinal, 'utf8'), 'cpf');
}

async function testMoverBatchPreflightNaoMutaParcial() {
    resetTmp();
    const origemOk = writeFile('ok.txt', 'ok');
    const origemAmbigua = writeFile('relatorio.pdf', 'pdf');
    const destinoOk = path.join(TMP_ROOT, 'ok-movido.txt');
    const destinoAmbiguo = path.join(TMP_ROOT, 'Relatorios');

    const result = await osMover.execute({
        batch_confirmado: true,
        operacoes: [
            { operacao: 'mover', origem: origemOk, destino: destinoOk },
            { operacao: 'mover', origem: origemAmbigua, destino: destinoAmbiguo }
        ]
    }, {});

    assert.strictEqual(result.sucesso, false);
    assert.match(result.erro || result.mensagem, /Preflight|Dry-run/i);
    assert(fs.existsSync(origemOk), 'preflight com falha nao deve mover operacao anterior');
    assert(fs.existsSync(origemAmbigua), 'preflight com falha nao deve mover arquivo ambiguo');
    assert(!fs.existsSync(destinoOk), 'preflight com falha nao deve criar destino anterior');
    assert(!fs.existsSync(destinoAmbiguo), 'preflight com falha nao deve criar destino ambiguo');
}

async function testMoverBatchBloqueiaOrigemDuplicada() {
    resetTmp();
    const origem = writeFile('recurso.pdf', 'pdf');
    const destinoA = path.join(TMP_ROOT, 'Pecas', 'recurso.pdf');
    const destinoB = path.join(TMP_ROOT, 'Recursos', 'recurso.pdf');

    const result = await osMover.execute({
        batch_confirmado: true,
        operacoes: [
            { operacao: 'mover', origem, destino: destinoA },
            { operacao: 'mover', origem, destino: destinoB }
        ]
    }, {});

    assert.strictEqual(result.sucesso, false);
    assert.strictEqual(result.codigo, 'conflito_batch');
    assert.match(result.erro || result.mensagem, /ja foi usada antes|Dry-run/i);
    assert(fs.existsSync(origem), 'origem duplicada deve ser bloqueada antes de mover');
    assert(!fs.existsSync(destinoA), 'origem duplicada nao deve criar primeiro destino');
    assert(!fs.existsSync(destinoB), 'origem duplicada nao deve criar segundo destino');
}

async function testMoverBatchBloqueiaFilhoDePastaJaMovida() {
    resetTmp();
    const origemPasta = path.join(TMP_ROOT, 'Pasta');
    const origemFilho = writeFile(path.join('Pasta', 'filho.pdf'), 'pdf');
    const destinoPasta = path.join(TMP_ROOT, 'Organizado', 'Pasta');
    const destinoFilho = path.join(TMP_ROOT, 'Pecas', 'filho.pdf');

    const result = await osMover.execute({
        batch_confirmado: true,
        operacoes: [
            { operacao: 'mover', origem: origemPasta, destino: destinoPasta },
            { operacao: 'mover', origem: origemFilho, destino: destinoFilho }
        ]
    }, {});

    assert.strictEqual(result.sucesso, false);
    assert.strictEqual(result.codigo, 'conflito_batch');
    assert.match(result.erro || result.mensagem, /pasta ja consumida|Dry-run/i);
    assert(fs.existsSync(origemFilho), 'filho de pasta consumida deve ser bloqueado antes de mover');
    assert(!fs.existsSync(destinoPasta), 'pasta consumida nao deve ser movida em batch invalido');
    assert(!fs.existsSync(destinoFilho), 'filho nao deve ser movido em batch invalido');
}

async function testMoverOrganizacaoReportaArquivosRestantesNaRaiz() {
    resetTmp();
    const raiz = path.join(TMP_ROOT, 'organizar');
    const arquivoA = writeFile(path.join('organizar', 'a.pdf'), 'a');
    const arquivoB = writeFile(path.join('organizar', 'b.docx'), 'b');
    const arquivoC = writeFile(path.join('organizar', 'c.txt'), 'c');
    const arquivoSolto = writeFile(path.join('organizar', 'nao-planejado.pdf'), 'pendente');
    const pastaDocs = path.join(raiz, 'DOCUMENTOS');
    const pastaDiversos = path.join(raiz, 'DIVERSOS');

    const result = await osMover.execute({
        batch_confirmado: true,
        operacoes: [
            { operacao: 'criar_pasta', origem: pastaDocs },
            { operacao: 'criar_pasta', origem: pastaDiversos },
            { operacao: 'mover', origem: arquivoA, destino: path.join(pastaDocs, 'a.pdf') },
            { operacao: 'mover', origem: arquivoB, destino: path.join(pastaDocs, 'b.docx') },
            { operacao: 'mover', origem: arquivoC, destino: path.join(pastaDiversos, 'c.txt') }
        ]
    }, {});

    assert.strictEqual(result.sucesso, false);
    assert.strictEqual(result.codigo, 'organizacao_incompleta');
    assert.strictEqual(result.dados.falhas, 0);
    assert.strictEqual(result.dados.posOrganizacao.totalArquivosRestantes, 1);
    assert.deepStrictEqual(result.dados.posOrganizacao.arquivosRestantes, ['nao-planejado.pdf']);
    assert.match(result.mensagem, /ORGANIZACAO INCOMPLETA/i);
    assert(fs.existsSync(arquivoSolto), 'arquivo nao planejado deve continuar na raiz e ser reportado');
}

async function testMoverRecuperaNomeProximoEInfereOperacao() {
    resetTmp();
    const origemReal = writeFile('CONTRA RAZÕES AO RECURSO D.pdf', 'pdf');
    const origemAproximada = path.join(TMP_ROOT, 'CONTRARAZÕES AO RECURSO D.pdf');
    const destino = path.join(TMP_ROOT, 'PEÇAS_PROCESSUAIS', 'CONTRA RAZÕES AO RECURSO D.pdf');

    const result = await osMover.execute({
        batch_confirmado: true,
        operacoes: [
            { origem: origemAproximada, destino }
        ]
    }, {});

    assert.strictEqual(result.sucesso, true, result.erro || result.mensagem);
    assert(!fs.existsSync(origemReal), 'origem real deve ser movida por recuperacao de nome proximo');
    assert.strictEqual(fs.readFileSync(destino, 'utf8'), 'pdf');
}

async function testMoverDryRunBloqueiaRenomearSemExtensao() {
    resetTmp();
    const origem = writeFile('documento.pdf', 'pdf');
    const destino = path.join(TMP_ROOT, 'documento-sem-extensao');

    const result = await osMover.execute({
        operacao: 'renomear',
        origem,
        destino,
        dry_run: true
    }, {});

    assert.strictEqual(result.sucesso, false);
    assert.strictEqual(result.codigo, 'operacao_invalida');
    assert.match(result.erro || result.mensagem, /sem extensao/i);
    assert(fs.existsSync(origem), 'dry-run bloqueado nao deve renomear origem');
    assert(!fs.existsSync(destino), 'dry-run bloqueado nao deve criar destino');
}

async function testArquivosReadOnly() {
    resetTmp();
    const target = writeFile('nao-apagar.txt', 'conteudo');

    const result = await osArquivos.execute({
        operacao: 'deletar',
        caminho: target
    }, {});

    assert.strictEqual(result.sucesso, false);
    assert.match(result.erro, /nao e suportada|bloqueada|os_deletar/i);
    assert(fs.existsSync(target), 'os_arquivos nao deve apagar arquivo');
}

async function testArquivosLerEGrep() {
    resetTmp();
    const target = writeFile('ler.txt', 'primeira linha\npalavra-chave aqui\n');

    const read = await osArquivos.execute({ operacao: 'ler', caminho: target }, {});
    assert.strictEqual(read.sucesso, true, read.erro || read.mensagem);
    assert.strictEqual(read.dados.formato, 'texto');
    assert.match(read.dados.conteudo, /palavra-chave/);

    const grep = await osArquivos.execute({
        operacao: 'grep',
        caminho: TMP_ROOT,
        padrao: 'palavra-chave',
        extensoes: '.txt'
    }, {});

    assert.strictEqual(grep.sucesso, true, grep.erro || grep.mensagem);
    assert.strictEqual(grep.dados.total, 1);
    assert.strictEqual(grep.dados.resultados[0].arquivo, target);
}

async function testEscreverPedeConfirmacaoParaOverwrite() {
    resetTmp();
    const target = writeFile('existente.txt', 'original');

    const result = await osEscrever.execute({
        operacao: 'arquivo',
        caminho: target,
        conteudo: 'novo'
    }, {});

    assert.strictEqual(result.sucesso, false);
    assert.strictEqual(result.dados.requiresUserAction, true);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'original');
}

async function testEscreverCriaPastaArquivoESobrescreveComConfirmacao() {
    resetTmp();
    const pasta = path.join(TMP_ROOT, 'nova-pasta');
    const mkdir = await osEscrever.execute({ operacao: 'pasta', caminho: pasta }, {});

    assert.strictEqual(mkdir.sucesso, true, mkdir.erro || mkdir.mensagem);
    assert(fs.existsSync(pasta), 'os_escrever pasta deve criar pasta');

    const target = path.join(pasta, 'novo.txt');
    const create = await osEscrever.execute({
        operacao: 'arquivo',
        caminho: target,
        conteudo: 'primeira versao'
    }, {});

    assert.strictEqual(create.sucesso, true, create.erro || create.mensagem);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'primeira versao');

    const overwrite = await osEscrever.execute({
        operacao: 'arquivo',
        caminho: target,
        conteudo: 'segunda versao',
        confirmado: true
    }, {});

    assert.strictEqual(overwrite.sucesso, true, overwrite.erro || overwrite.mensagem);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'segunda versao');
}

async function testConfirmadoStringFalseContinuaPedindoConfirmacao() {
    resetTmp();
    const target = writeFile('confirmado-false.txt', 'original');

    const write = await osEscrever.execute({
        operacao: 'arquivo',
        caminho: target,
        conteudo: 'novo',
        confirmado: 'false'
    }, {});

    assert.strictEqual(write.sucesso, false);
    assert.strictEqual(write.dados.requiresUserAction, true);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'original');

    const sistema = await osSistema.execute({
        operacao: 'encerrar',
        alvo: 'processo-que-nao-deve-executar.exe',
        confirmado: 'false'
    }, {});

    assert.strictEqual(sistema.sucesso, false);
    assert.strictEqual(sistema.dados.requiresUserAction, true);

    const marker = path.join(TMP_ROOT, 'terminal-flag.txt');
    const terminal = await osTerminal.execute({
        comando: `echo terminal-mutated > "${marker}"`,
        diretorio: TMP_ROOT,
        confirmado: 'false',
        timeoutMs: 1000
    }, {});

    assert.strictEqual(terminal.sucesso, false);
    assert.strictEqual(terminal.dados.requiresUserAction, true);
    assert(!fs.existsSync(marker), 'terminal_executar confirmado:"false" nao deve executar comando mutante');
}

async function testErrosEstruturados() {
    resetTmp();

    const list = await tools.listarDiretorio(path.join(TMP_ROOT, 'nao-existe'));
    assert.strictEqual(list.sucesso, false);
    assert.strictEqual(list.codigo, 'nao_encontrado');
    assert(list.sugestao);

    const pasta = path.join(TMP_ROOT, 'pasta-cheia');
    fs.mkdirSync(pasta, { recursive: true });
    writeFile('pasta-cheia/arquivo.txt', 'conteudo');

    const del = await tools.deletarPermanente(pasta);
    assert.strictEqual(del.sucesso, false);
    assert.strictEqual(del.codigo, 'pasta_nao_vazia');
    assert(fs.existsSync(pasta), 'pasta cheia nao deve ser apagada permanentemente');

    const busca = await tools.buscarArquivos(path.join(TMP_ROOT, 'missing'), '*.pdf');
    assert.strictEqual(busca.sucesso, false);
    assert.strictEqual(busca.codigo, 'nao_encontrado');

    const buscaSkill = await osBuscar.execute({
        caminho: path.join(TMP_ROOT, 'missing'),
        padrao: '*.pdf'
    }, {});
    assert.strictEqual(buscaSkill.sucesso, false);
    assert.strictEqual(buscaSkill.codigo, 'nao_encontrado');
    assert(buscaSkill.sugestao);
}

async function testTamanhoRecursivo() {
    resetTmp();
    writeFile('raiz.txt', '12345');
    writeFile('a/a.txt', '1234567890');
    writeFile('b/b.txt', '123');

    const result = await osTamanho.execute({ caminho: TMP_ROOT, top_n: 1 }, {});

    assert.strictEqual(result.sucesso, true, result.erro || result.mensagem);
    assert.strictEqual(result.dados.totalBytes, 18);
    assert.strictEqual(result.dados.totalArquivos, 3);
    assert.strictEqual(result.dados.totalPastas, 2);
    assert.strictEqual(result.dados.topSubpastas.length, 1);
    assert.strictEqual(result.dados.topSubpastas[0].nome, 'a');
    assert.strictEqual(result.dados.topSubpastas[0].bytes, 10);
}

async function testDryRunNaoMutaFilesystem() {
    resetTmp();
    const target = writeFile('dry-delete.tmp', 'keep');

    const del = await osDeletar.execute({
        caminho: target,
        dry_run: true
    }, {});

    assert.strictEqual(del.sucesso, true, del.erro || del.mensagem);
    assert.strictEqual(del.dados.dryRun, true);
    assert.strictEqual(del.dados.operacoes[0].operacao, 'deletar');
    assert.strictEqual(del.dados.operacoes[0].efeito, 'Enviaria para a Lixeira.');
    assert(fs.existsSync(target), 'dry-run de delete nao deve remover arquivo');

    const origem = writeFile('dry-origem.txt', 'origem');
    const destino = writeFile('dry-destino.txt', 'destino');
    const move = await osMover.execute({
        operacao: 'mover',
        origem,
        destino,
        dry_run: true
    }, {});

    assert.strictEqual(move.sucesso, false);
    assert.strictEqual(move.codigo, 'destino_existe');
    assert.strictEqual(move.dados.dryRun, true);
    assert(fs.existsSync(origem), 'dry-run de mover nao deve mover origem');
    assert.strictEqual(fs.readFileSync(destino, 'utf8'), 'destino');
}

async function testDryRunExplicaCaminhoNaoEncontrado() {
    resetTmp();
    const missing = path.join(TMP_ROOT, 'nao-existe.tmp');

    const del = await osDeletar.execute({
        caminho: missing,
        dry_run: true
    }, {});

    assert.strictEqual(del.sucesso, false);
    assert.strictEqual(del.codigo, 'nao_encontrado');
    assert.match(del.erro, /nao_encontrado|nao existe/i);
    assert.match(del.mensagem, /pendencia/i);
    assert(!/bloqueio/i.test(del.erro), 'dry-run nao deve chamar caminho inexistente de bloqueio generico');
}

async function testDryRunRecuperaCaminhoTruncadoComEllipsis() {
    resetTmp();
    const target = writeFile('Acao Anulatoria de Debito Fiscal.pdf', 'pdf');
    const truncated = path.join(TMP_ROOT, 'Acao Anulatoria de Debito …');

    const del = await osDeletar.execute({
        caminho: truncated,
        dry_run: true
    }, {});

    assert.strictEqual(del.sucesso, true, del.erro || del.mensagem);
    assert.strictEqual(del.dados.operacoes[0].origemResolvida, target);
    assert.strictEqual(del.dados.operacoes[0].efeito, 'Enviaria para a Lixeira.');
}

async function testDeleteComAlvosRelativosUsaCaminhoBase() {
    resetTmp();
    const base = path.join(TMP_ROOT, 'downloads');
    const target = writeFile('downloads/2 UPJ ATENDIMENTO (1).pdf', 'pdf');

    const del = await osDeletar.execute({
        caminho: base,
        alvos: ['2 UPJ ATENDIMENTO (1).pdf'],
        dry_run: true
    }, {});

    assert.strictEqual(del.sucesso, true, del.erro || del.mensagem);
    assert.strictEqual(del.dados.total, 1);
    assert.strictEqual(del.dados.operacoes[0].origemResolvida, target);
    assert(fs.existsSync(base), 'caminho base nao deve virar alvo quando alvos foi informado');
}

async function testDeleteRecuperaNomeComEspacoDuplicado() {
    resetTmp();
    const target = writeFile('2 UPJ ATENDIMENTO (1).pdf', 'pdf');
    const typo = path.join(TMP_ROOT, '2 UPJ ATENDIMENTO  (1).pdf');

    const preview = await osDeletar.execute({
        caminho: typo,
        dry_run: true
    }, {});

    assert.strictEqual(preview.sucesso, true, preview.erro || preview.mensagem);
    assert.strictEqual(preview.dados.operacoes[0].origemResolvida, target);

    const del = await osDeletar.execute({
        caminho: typo,
        confirmado: 'true',
        permanente: 'true'
    }, {});

    assert.strictEqual(del.sucesso, true, del.erro || del.mensagem);
    assert(!fs.existsSync(target), 'delete confirmado deve recuperar nome com espaco duplicado e remover o arquivo real');
}

async function testBooleanStringsNoDelete() {
    resetTmp();
    const target = writeFile('bool-delete.tmp', 'delete-me');

    const preview = await osDeletar.execute({
        caminho: target,
        dry_run: 'true',
        permanente: 'false'
    }, {});
    assert.strictEqual(preview.sucesso, true, preview.erro || preview.mensagem);
    assert.strictEqual(preview.dados.operacoes[0].efeito, 'Enviaria para a Lixeira.');

    const del = await osDeletar.execute({
        caminho: target,
        confirmado: 'true',
        permanente: 'true'
    }, {});
    assert.strictEqual(del.sucesso, true, del.erro || del.mensagem);
    assert(!fs.existsSync(target), 'confirmado:"true" deve executar delete quando permanente:"true"');
}

async function testDeleteParaLixeiraConfirmadoRemoveArquivo() {
    resetTmp();
    const target = writeFile('lixeira-confirmado.tmp', 'delete-me');

    const del = await osDeletar.execute({
        caminho: target,
        confirmado: 'true'
    }, {});

    assert.strictEqual(del.sucesso, true, del.erro || del.mensagem);
    assert.strictEqual(del.dados.resultados[0].mensagem, 'movido para Lixeira');
    assert(!fs.existsSync(target), 'delete confirmado para Lixeira deve remover arquivo do local original');
}

async function testArquivosInfoDefault() {
    resetTmp();
    const target = writeFile('info-default.txt', 'conteudo');

    const result = await osArquivos.execute({ caminho: target }, {});

    assert.strictEqual(result.sucesso, true, result.erro || result.mensagem);
    assert.strictEqual(result.dados.existe, true);
    assert.strictEqual(result.dados.caminho, target);
}

async function testAuditoriaOs() {
    resetTmp();
    const origem = writeFile('audit-origem.txt', 'origem');
    const destino = path.join(TMP_ROOT, 'audit-destino.txt');

    const copy = await tools.copiarArquivo(origem, destino);
    assert.strictEqual(copy.sucesso, true, copy.erro);

    const linhas = readAuditLines();
    assert.strictEqual(linhas.length, 1);
    assert.strictEqual(linhas[0].skill, 'os');
    assert.strictEqual(linhas[0].operacao, 'copiar');
    assert.strictEqual(linhas[0].sucesso, true);
    assert.strictEqual(linhas[0].origem, origem);
    assert.strictEqual(linhas[0].destino, destino);

    resetTmp();
    const dryOrigem = writeFile('audit-dry.txt', 'dry');
    const dry = await osDeletar.execute({ caminho: dryOrigem, dry_run: true }, {});
    assert.strictEqual(dry.sucesso, true, dry.erro);
    assert.deepStrictEqual(readAuditLines(), []);
}

async function testSistemaAceitaAliasLegadoDeProcessos() {
    const result = await osSistema.execute({ acao: 'listar_processos' }, {});

    assert.strictEqual(result.sucesso, true, result.erro || result.mensagem);
    assert(Array.isArray(result.dados.processos), 'os_sistema deve retornar lista de processos');
    assert.strictEqual(typeof result.dados.total, 'number');
}

async function testSistemaInfoPastasEEncerrarPedeConfirmacao() {
    const info = await osSistema.execute({ operacao: 'info' }, {});
    assert.strictEqual(info.sucesso, true, info.erro || info.mensagem);
    assert.strictEqual(typeof info.dados.plataforma, 'string');
    assert.strictEqual(typeof info.dados.homeDir, 'string');

    const pastas = await osSistema.execute({ operacao: 'pastas' }, {});
    assert.strictEqual(pastas.sucesso, true, pastas.erro || pastas.mensagem);
    assert.strictEqual(pastas.dados.home, os.homedir());
    assert.strictEqual(pastas.dados.downloads, path.join(os.homedir(), 'Downloads'));

    const encerrar = await osSistema.execute({ operacao: 'encerrar', alvo: 'node.exe' }, {});
    assert.strictEqual(encerrar.sucesso, false);
    assert.strictEqual(encerrar.dados.requiresUserAction, true);
}

async function testClipboardValidacaoSemMutar() {
    const missingText = await osClipboard.execute({ operacao: 'escrever' }, {});
    assert.strictEqual(missingText.sucesso, false);
    assert.match(missingText.erro, /texto/i);

    const invalid = await osClipboard.execute({ operacao: 'limpar' }, {});
    assert.strictEqual(invalid.sucesso, false);
    assert.match(invalid.erro, /invalida|inv/i);
}

async function testFetchBloqueiaUrlsInvalidasOuPrivadas() {
    const invalid = await osFetch.execute({ url: 'ftp://example.com/arquivo.txt' }, {});
    assert.strictEqual(invalid.sucesso, false);
    assert.match(invalid.erro, /http/i);

    const privateUrl = await osFetch.execute({ url: 'http://127.0.0.1:9999' }, {});
    assert.strictEqual(privateUrl.sucesso, false);
    assert.match(privateUrl.erro, /bloqueada|privados/i);
}

async function testTerminalPedeConfirmacaoParaComandoComposto() {
    const result = await osTerminal.execute({
        comando: 'tasklist /v | findstr /i "word"',
        timeoutMs: 1000
    }, {});

    assert.strictEqual(result.sucesso, false);
    assert.strictEqual(result.dados.requiresUserAction, true);
    assert.match(result.dados.question, /Executar no terminal/);
}

async function run() {
    const tests = [
        testPathAliases,
        testResolverEntradaUsaBaseEFuzzySeguro,
        testResolverEntradaNaoEscolheQuandoAmbiguo,
        testBuscarDuplicadosPorNome,
        testListarFiltroOrdenacaoPaginacao,
        testBuscarPorNomeEConteudo,
        testDeletarRequiresConfirmation,
        testMoverOperacoesBasicas,
        testMoverBatchExigeConfirmacaoSemMutar,
        testMoverBatchConfirmadoComPastaVirtual,
        testMoverUsaCaminhoBaseParaOperacoesRelativas,
        testMoverBatchPreflightNaoMutaParcial,
        testMoverBatchBloqueiaOrigemDuplicada,
        testMoverBatchBloqueiaFilhoDePastaJaMovida,
        testMoverOrganizacaoReportaArquivosRestantesNaRaiz,
        testMoverRecuperaNomeProximoEInfereOperacao,
        testMoverDryRunBloqueiaRenomearSemExtensao,
        testMoverCopiarNaoSobrescreve,
        testArquivosReadOnly,
        testArquivosLerEGrep,
        testEscreverPedeConfirmacaoParaOverwrite,
        testEscreverCriaPastaArquivoESobrescreveComConfirmacao,
        testConfirmadoStringFalseContinuaPedindoConfirmacao,
        testErrosEstruturados,
        testTamanhoRecursivo,
        testDryRunNaoMutaFilesystem,
        testDryRunExplicaCaminhoNaoEncontrado,
        testDryRunRecuperaCaminhoTruncadoComEllipsis,
        testDeleteComAlvosRelativosUsaCaminhoBase,
        testDeleteRecuperaNomeComEspacoDuplicado,
        testBooleanStringsNoDelete,
        testDeleteParaLixeiraConfirmadoRemoveArquivo,
        testArquivosInfoDefault,
        testAuditoriaOs,
        testSistemaAceitaAliasLegadoDeProcessos,
        testSistemaInfoPastasEEncerrarPedeConfirmacao,
        testClipboardValidacaoSemMutar,
        testFetchBloqueiaUrlsInvalidasOuPrivadas,
        testTerminalPedeConfirmacaoParaComandoComposto
    ];

    try {
        for (const test of tests) {
            await test();
            console.log(`[OsSkillTest] ok ${test.name}`);
        }
        console.log(`[OsSkillTest] ${tests.length} passed`);
    } finally {
        cleanupTmp();
    }
}

run().catch((error) => {
    console.error('[OsSkillTest] failed');
    console.error(error);
    cleanupTmp();
    process.exit(1);
});
