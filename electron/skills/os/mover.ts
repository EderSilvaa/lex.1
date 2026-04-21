/**
 * Skill: os_mover
 *
 * Move, renames, copies, sends items to trash, permanently deletes empty items,
 * and creates folders. Supports batch operations to avoid repeated LLM/tool
 * round trips when organizing many files.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { Skill, SkillResult, AgentContext } from '../../agent/types';
import {
    moverItem,
    copiarArquivo,
    moverParaLixeira,
    deletarPermanente,
    criarPasta,
    infoItem,
    resolverCaminhoOs,
    aplicarBaseCaminhoOs
} from '../../tools/os-tools';

type OpSingle = {
    operacao: string;
    origem: string;
    destino?: string;
    confirmado?: boolean;
    permanente?: boolean;
};

type OpResult = {
    operacao: string;
    origem: string;
    destino?: string;
    sucesso: boolean;
    mensagem: string;
    erro?: string;
    codigo?: string;
    sugestao?: string;
};

type DryRunItem = {
    operacao: string;
    origem: string;
    origemResolvida: string;
    destino?: string;
    destinoResolvido?: string;
    permanente?: boolean;
    efeito: string;
    existeOrigem?: boolean;
    existeDestino?: boolean;
    tipoOrigem?: string;
    bloqueado: boolean;
    codigo?: string;
    erro?: string;
    sugestao?: string;
};

type PosOrganizacao = {
    raiz: string;
    totalArquivosRestantes: number;
    arquivosRestantes: string[];
};

/**
 * Normaliza um item de batch — aceita sinonimos comuns que o LLM tenta usar
 * no lugar dos nomes canonicos (tipo → operacao, destino → origem em criar_pasta,
 * src/source → origem, dst/target → destino).
 */
function caminhoRelativoAoBase(caminho: string, baseDir?: string): string {
    return aplicarBaseCaminhoOs(caminho, baseDir);
}

function normalizarOp(raw: any, baseDir?: string): OpSingle {
    if (!raw || typeof raw !== 'object') {
        return { operacao: '', origem: '' };
    }
    let operacao = String(
        raw.operacao ?? raw.op ?? raw.tipo ?? raw.acao ?? raw.action ?? ''
    ).trim();

    let origem = String(
        raw.origem ?? raw.source ?? raw.src ?? raw.from ?? raw.path ?? raw.caminho ?? ''
    ).trim();
    let destino = String(
        raw.destino ?? raw.target ?? raw.dst ?? raw.to ?? ''
    ).trim();

    // Se o LLM mandou um item de batch com origem+destino mas esqueceu
    // "operacao", o unico sentido seguro e mover. Isso evita loops de schema.
    if (!operacao && origem && destino) {
        operacao = 'mover';
    }

    // criar_pasta so usa "origem" (caminho da pasta a criar). Se o LLM mandou
    // so "destino", aceita como a pasta a criar.
    if (operacao === 'criar_pasta' && !origem && destino) {
        origem = destino;
        destino = '';
    }

    return {
        operacao,
        origem: caminhoRelativoAoBase(origem, baseDir),
        destino: destino ? caminhoRelativoAoBase(destino, baseDir) : undefined,
        confirmado: raw.confirmado ?? raw.confirmed,
        permanente: raw.permanente ?? raw.permanent
    };
}

function boolParam(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'sim', 's', 'yes', 'y'].includes(normalized)) return true;
        if (['false', '0', 'nao', 'não', 'n', 'no', ''].includes(normalized)) return false;
    }
    return Boolean(value);
}

function bloqueioDryRun(item: DryRunItem, codigo: string, erro: string, sugestao: string): DryRunItem {
    return { ...item, bloqueado: true, codigo, erro, sugestao };
}

function bloquearDryRunEmLugar(item: DryRunItem, codigo: string, erro: string, sugestao: string): void {
    item.bloqueado = true;
    item.codigo = codigo;
    item.erro = erro;
    item.sugestao = sugestao;
}

function chaveCaminho(caminho: string): string {
    const normalized = path.normalize(caminho);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function mesmoCaminhoOuFilho(pai: string, filho: string): boolean {
    const paiKey = chaveCaminho(pai);
    const filhoKey = chaveCaminho(filho);
    if (paiKey === filhoKey) return true;

    const relativo = path.relative(paiKey, filhoKey);
    return Boolean(relativo) && !relativo.startsWith('..') && !path.isAbsolute(relativo);
}

function operacaoConsomeOrigem(operacao: string): boolean {
    return ['mover', 'renomear', 'deletar'].includes(operacao);
}

async function planejarUma(op: OpSingle, pastasVirtuais: Set<string>): Promise<DryRunItem> {
    const operacao = String(op.operacao || '').trim();
    const origemOriginal = String(op.origem || '').trim();
    const destinoOriginal = String(op.destino || '').trim();
    const origem = resolverCaminhoOs(origemOriginal);
    let destino = resolverCaminhoOs(destinoOriginal);
    const permanente = boolParam(op.permanente);

    const item: DryRunItem = {
        operacao,
        origem: origemOriginal,
        origemResolvida: origem,
        destino: destinoOriginal || undefined,
        destinoResolvido: destino || undefined,
        permanente,
        efeito: '',
        bloqueado: false
    };

    if (!origem) {
        return bloqueioDryRun(item, 'operacao_invalida', 'Parametro "origem" obrigatorio.', 'Informe o caminho de origem.');
    }

    if (!['mover', 'renomear', 'copiar', 'deletar', 'criar_pasta'].includes(operacao)) {
        return bloqueioDryRun(item, 'operacao_invalida', `operacao desconhecida: "${operacao}"`, 'Use mover, renomear, copiar, deletar ou criar_pasta.');
    }

    if (operacao === 'criar_pasta') {
        const info = await infoItem(origem);
        item.existeOrigem = Boolean(info.dados?.existe);
        item.efeito = item.existeOrigem ? 'Pasta ja existe; criacao seria idempotente se for pasta.' : 'Criaria pasta.';
        if (info.dados?.existe && info.dados?.tipo !== 'pasta') {
            return bloqueioDryRun(item, 'destino_existe', `Destino "${origem}" ja existe e nao e pasta.`, 'Escolha outro caminho para criar a pasta.');
        }
        // Registra pasta virtual pra ops posteriores no mesmo batch
        pastasVirtuais.add(path.normalize(origem));
        return item;
    }

    const origemInfo = await infoItem(origem);
    if (!origemInfo.sucesso) {
        return bloqueioDryRun(item, origemInfo.codigo || 'erro_io', origemInfo.erro || `Nao foi possivel validar "${origem}".`, origemInfo.sugestao || 'Confira o caminho antes de executar.');
    }
    if (origemInfo.dados?.caminho) {
        item.origemResolvida = origemInfo.dados.caminho;
    }
    item.existeOrigem = Boolean(origemInfo.dados?.existe);
    item.tipoOrigem = origemInfo.dados?.tipo;
    if (!item.existeOrigem) {
        return bloqueioDryRun(item, 'nao_encontrado', `Origem "${origem}" nao existe.`, 'Liste a pasta pai ou corrija o caminho antes de executar.');
    }

    if (operacao === 'deletar') {
        item.efeito = permanente ? 'Removeria permanentemente.' : 'Enviaria para a Lixeira.';
        return item;
    }

    if (!destino) {
        return bloqueioDryRun(item, 'operacao_invalida', 'Parametro "destino" obrigatorio.', 'Informe o caminho de destino.');
    }

    // Coerce destino-como-pasta (convencao Unix mv/cp): se destino e uma pasta
    // existente (ou termina com separador, ou foi criada virtualmente antes
    // neste batch), o destino final e destino/basename(origem) — espelhando
    // exatamente o que moverItem/copiarArquivo farao em execucao.
    let destinoCoagido = false;
    const terminaComSep = /[\\/]$/.test(destino);
    const ehPastaVirtual = pastasVirtuais.has(path.normalize(destino));
    if (terminaComSep || ehPastaVirtual) {
        destino = path.join(destino, path.basename(origem));
        destinoCoagido = true;
    } else {
        const info = await infoItem(destino);
        if (info.dados?.existe && info.dados?.tipo === 'pasta') {
            destino = path.join(destino, path.basename(origem));
            destinoCoagido = true;
        }
    }
    item.destinoResolvido = destino;

    // Guardrail: bloqueia se origem tem extensao e destino final nao tem —
    // sinal de que o LLM achou que destino era uma pasta que ainda nao existe.
    // (Foi assim que 3 PDFs viraram "pastas" sem extensao em 2026-04-20.)
    const extOrigem = path.extname(origem);
    const extDestino = path.extname(destino);
    if (extOrigem && !extDestino && !destinoCoagido) {
        return bloqueioDryRun(
            item,
            'operacao_invalida',
            `Destino "${destino}" nao tem extensao mas origem tem ("${extOrigem}"). Sem coagir isso renomearia o arquivo pra um nome sem extensao.`,
            `Se destino e uma pasta, inclua criar_pasta antes no mesmo batch, use barra no final ("${destino}${path.sep}") ou especifique destino completo "${path.join(destino, path.basename(origem))}". Se realmente quer renomear removendo a extensao, use o destino com "." no final.`
        );
    }

    const destinoInfo = await infoItem(destino);
    item.existeDestino = Boolean(destinoInfo.dados?.existe);
    if (item.existeDestino) {
        return bloqueioDryRun(item, 'destino_existe', `Destino "${destino}" ja existe.`, 'Escolha outro nome ou remova o destino antes de executar.');
    }

    const sufixoCoagido = destinoCoagido ? ' (destino coagido como pasta)' : '';
    item.efeito = operacao === 'copiar'
        ? `Copiaria origem para destino.${sufixoCoagido}`
        : operacao === 'renomear'
            ? `Renomearia origem para destino.${sufixoCoagido}`
            : `Moveria origem para destino.${sufixoCoagido}`;
    return item;
}

async function executarDryRun(ops: OpSingle[]): Promise<SkillResult> {
    const planos: DryRunItem[] = [];
    const pastasVirtuais = new Set<string>();
    for (const op of ops) {
        planos.push(await planejarUma(op, pastasVirtuais));
    }
    validarConflitosInternosDoBatch(planos);

    const bloqueios = planos.filter(p => p.bloqueado);
    const linhas = planos.map((p, idx) => {
        const status = p.bloqueado ? 'BLOQUEADO' : 'OK';
        const destino = p.destinoResolvido ? ` -> ${p.destinoResolvido}` : '';
        const detalhe = p.bloqueado ? ` - ${p.erro}` : ` - ${p.efeito}`;
        return `${idx + 1}. ${status} ${p.operacao}: ${p.origemResolvida}${destino}${detalhe}`;
    }).join('\n');

    const primeiroBloqueio = bloqueios[0];
    const schemaFault = detectarSchemaFault(bloqueios, planos.length);
    const resumoBloqueios = schemaFault
        ? schemaFault
        : bloqueios
            .slice(0, 5)
            .map(b => `${b.codigo || 'bloqueado'}: ${b.erro || b.origemResolvida}`)
            .join('; ') + (bloqueios.length > 5 ? ` (+${bloqueios.length - 5} similares)` : '');
    return {
        sucesso: bloqueios.length === 0,
        erro: primeiroBloqueio ? `Dry-run encontrou ${bloqueios.length} pendencia(s): ${resumoBloqueios}` : undefined,
        codigo: primeiroBloqueio?.codigo,
        sugestao: primeiroBloqueio?.sugestao,
        dados: {
            dryRun: true,
            total: planos.length,
            bloqueios: bloqueios.length,
            operacoes: planos
        },
        mensagem: `Dry-run OS: ${planos.length - bloqueios.length}/${planos.length} operacao(oes) prontas${bloqueios.length > 0 ? `; ${bloqueios.length} pendencia(s) precisam ser corrigidas antes da execucao` : ''}\n\n${linhas}`
    };
}

function validarConflitosInternosDoBatch(planos: DryRunItem[]): void {
    const origensConsumidas = new Map<string, DryRunItem>();
    const pastasConsumidas: DryRunItem[] = [];
    const destinosProduzidos = new Map<string, DryRunItem>();

    for (const plano of planos) {
        if (plano.bloqueado) continue;

        const operacao = plano.operacao;
        const origem = plano.origemResolvida;
        const origemKey = chaveCaminho(origem);

        const pastaConsumida = pastasConsumidas.find((p) => mesmoCaminhoOuFilho(p.origemResolvida, origem));
        if (pastaConsumida && chaveCaminho(pastaConsumida.origemResolvida) !== origemKey) {
            bloquearDryRunEmLugar(
                plano,
                'conflito_batch',
                `Origem "${origem}" fica dentro de pasta ja consumida antes no mesmo batch: "${pastaConsumida.origemResolvida}".`,
                'Reordene o plano ou use o novo caminho gerado pela operacao anterior.'
            );
            continue;
        }

        if (operacaoConsomeOrigem(operacao)) {
            const anterior = origensConsumidas.get(origemKey);
            if (anterior) {
                bloquearDryRunEmLugar(
                    plano,
                    'conflito_batch',
                    `Origem "${origem}" ja foi usada antes em outra operacao que remove/move o item do lugar original.`,
                    `Remova a operacao duplicada ou use o destino da primeira operacao: "${anterior.destinoResolvido || anterior.origemResolvida}".`
                );
                continue;
            }
        }

        const destino = operacao === 'criar_pasta' ? origem : plano.destinoResolvido;
        if (destino && ['mover', 'renomear', 'copiar'].includes(operacao)) {
            if (operacao !== 'copiar' && mesmoCaminhoOuFilho(origem, destino)) {
                bloquearDryRunEmLugar(
                    plano,
                    'conflito_batch',
                    `Destino "${destino}" fica dentro da propria origem "${origem}".`,
                    'Nao mova uma pasta para dentro dela mesma. Escolha uma pasta de destino fora da origem.'
                );
                continue;
            }

            const destinoKey = chaveCaminho(destino);
            const anteriorDestino = destinosProduzidos.get(destinoKey);
            if (anteriorDestino) {
                bloquearDryRunEmLugar(
                    plano,
                    'conflito_batch',
                    `Destino "${destino}" ja sera criado por outra operacao no mesmo batch.`,
                    'Escolha destinos finais unicos para cada arquivo/pasta antes de executar.'
                );
                continue;
            }
        }

        if (operacaoConsomeOrigem(operacao)) {
            origensConsumidas.set(origemKey, plano);
            if (plano.tipoOrigem === 'pasta') {
                pastasConsumidas.push(plano);
            }
        }

        if (destino && ['mover', 'renomear', 'copiar'].includes(operacao)) {
            destinosProduzidos.set(chaveCaminho(destino), plano);
        }
    }
}

function caminhoComum(caminhos: string[]): string | null {
    const normalizados = caminhos.filter(Boolean).map((c) => path.resolve(c));
    if (normalizados.length === 0) return null;

    const primeiro = normalizados[0];
    if (!primeiro) return null;

    const parsed = path.parse(primeiro);
    const baseRoot = parsed.root;
    const partes = normalizados.map((c) => {
        const semRoot = c.slice(path.parse(c).root.length);
        return semRoot.split(path.sep).filter(Boolean);
    });

    const limite = Math.min(...partes.map((p) => p.length));
    const comuns: string[] = [];
    for (let i = 0; i < limite; i++) {
        const candidato = partes[0]?.[i];
        if (!candidato) break;

        const igual = partes.every((p) => {
            const parte = p[i];
            if (!parte) return false;
            return process.platform === 'win32'
                ? parte.toLowerCase() === candidato.toLowerCase()
                : parte === candidato;
        });
        if (!igual) break;
        comuns.push(candidato);
    }

    return path.join(baseRoot, ...comuns);
}

function detectarRaizOrganizacao(ops: OpSingle[]): string | null {
    const criarPastas = ops
        .filter((op) => op.operacao === 'criar_pasta' && op.origem)
        .map((op) => resolverCaminhoOs(op.origem));
    const mutacoes = ops.filter((op) => ['mover', 'renomear', 'copiar'].includes(op.operacao));

    if (criarPastas.length < 2 || mutacoes.length < 3) return null;

    const paisDasPastas = criarPastas.map((p) => path.dirname(p));
    const raizPastas = caminhoComum(paisDasPastas);
    if (!raizPastas) return null;

    const origensNaRaiz = mutacoes.filter((op) => {
        const origem = resolverCaminhoOs(op.origem || '');
        return chaveCaminho(path.dirname(origem)) === chaveCaminho(raizPastas);
    }).length;

    return origensNaRaiz >= Math.max(2, Math.ceil(mutacoes.length * 0.5)) ? raizPastas : null;
}

async function verificarOrganizacaoIncompleta(ops: OpSingle[]): Promise<PosOrganizacao | null> {
    const raiz = detectarRaizOrganizacao(ops);
    if (!raiz) return null;

    try {
        const itens = await fs.readdir(raiz, { withFileTypes: true });
        const arquivosRestantes = itens
            .filter((item) => item.isFile())
            .map((item) => item.name)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));

        if (arquivosRestantes.length === 0) return null;
        return {
            raiz,
            totalArquivosRestantes: arquivosRestantes.length,
            arquivosRestantes: arquivosRestantes.slice(0, 20)
        };
    } catch {
        return null;
    }
}

function formatarPreviewBatch(ops: OpSingle[], limite = 8): string {
    const linhas = ops.slice(0, limite).map((op) => {
        const origem = op.origem || '(sem origem)';
        const destino = op.destino ? ` -> ${op.destino}` : '';
        return `  - ${op.operacao || 'operacao?'}: ${origem}${destino}`;
    });
    if (ops.length > limite) {
        linhas.push(`  ... e mais ${ops.length - limite}`);
    }
    return linhas.join('\n');
}

/**
 * Quando a maioria dos itens falha pelo mesmo motivo, retorna uma mensagem
 * prescritiva com o schema correto - evita repetir o mesmo erro 44x e da
 * ao LLM instrucao clara pra se corrigir na proxima tentativa.
 */
function detectarSchemaFault(bloqueios: DryRunItem[], total: number): string | null {
    if (bloqueios.length === 0 || total === 0) return null;
    const ratio = bloqueios.length / total;
    if (ratio < 0.5) return null;

    const operacaoInvalida = bloqueios.filter(b => /operacao desconhecida/i.test(b.erro || '')).length;
    const origemAusente = bloqueios.filter(b => /origem"? obrigatorio/i.test(b.erro || '')).length;

    if (operacaoInvalida / bloqueios.length > 0.7) {
        return `Quase todos os itens estao sem o campo "operacao". Cada item do array "operacoes" DEVE ter { "operacao": "mover"|"renomear"|"copiar"|"deletar"|"criar_pasta", "origem": "...", "destino": "..." }. NAO use "tipo" - use "operacao".`;
    }
    if (origemAusente / bloqueios.length > 0.7) {
        return `Quase todos os itens estao sem o campo "origem". Cada item DEVE ter { "operacao": "...", "origem": "caminho do arquivo/pasta" }. Para criar_pasta, "origem" e o caminho da pasta a criar (nao use "destino").`;
    }
    return null;
}

async function executarUma(op: OpSingle): Promise<OpResult> {
    const { operacao } = op;
    const confirmado = boolParam(op.confirmado);
    const permanente = boolParam(op.permanente);
    const origem = resolverCaminhoOs(op.origem || '');
    const destino = resolverCaminhoOs(op.destino || '');

    if (!origem) {
        return { operacao, origem, sucesso: false, mensagem: 'origem ausente', erro: 'Parametro "origem" obrigatorio.' };
    }

    switch (operacao) {
        case 'mover':
        case 'renomear': {
            if (!destino) return { operacao, origem, sucesso: false, mensagem: 'destino ausente', erro: 'destino obrigatorio.' };
            const r = await moverItem(origem, destino);
            return r.sucesso
                ? { operacao, origem: r.dados.origem, destino: r.dados.destino, sucesso: true, mensagem: operacao === 'renomear' ? 'renomeado' : 'movido' }
                : { operacao, origem, destino, sucesso: false, mensagem: 'falhou', erro: r.erro, codigo: r.codigo, sugestao: r.sugestao };
        }
        case 'copiar': {
            if (!destino) return { operacao, origem, sucesso: false, mensagem: 'destino ausente', erro: 'destino obrigatorio.' };
            const r = await copiarArquivo(origem, destino);
            return r.sucesso
                ? { operacao, origem: r.dados.origem, destino: r.dados.destino, sucesso: true, mensagem: 'copiado' }
                : { operacao, origem, destino, sucesso: false, mensagem: 'falhou', erro: r.erro, codigo: r.codigo, sugestao: r.sugestao };
        }
        case 'criar_pasta': {
            const r = await criarPasta(origem);
            return r.sucesso
                ? { operacao, origem: r.dados.caminho, sucesso: true, mensagem: 'pasta criada' }
                : { operacao, origem, sucesso: false, mensagem: 'falhou', erro: r.erro, codigo: r.codigo, sugestao: r.sugestao };
        }
        case 'deletar': {
            if (!confirmado) {
                return { operacao, origem, sucesso: false, mensagem: 'sem confirmacao', erro: 'deletar exige confirmado:true por item' };
            }
            const r = permanente ? await deletarPermanente(origem) : await moverParaLixeira(origem);
            if (!r.sucesso) return { operacao, origem, sucesso: false, mensagem: 'falhou', erro: r.erro, codigo: r.codigo, sugestao: r.sugestao };
            const alvo = r.dados.lixeira || r.dados.removido;
            return { operacao, origem: alvo, sucesso: true, mensagem: permanente ? 'removido permanentemente' : 'movido para Lixeira' };
        }
        default:
            return { operacao, origem, sucesso: false, mensagem: 'operacao invalida', erro: `operacao desconhecida: "${operacao}"` };
    }
}

export const osMover: Skill = {
    nome: 'os_mover',
    descricao: 'Operacoes de sistema de arquivos: mover, renomear, copiar, deletar e criar pastas. Por default, deletar manda para a Lixeira. Use permanente:true apenas se o usuario pedir exclusao irreversivel. Use dry_run:true quando o usuario pedir para simular, conferir, organizar ou mostrar o plano antes. Batch por "operacoes" sempre faz preflight e exige batch_confirmado:true antes de alterar arquivos. Em organizacao com subpastas, faz conferencia pos-execucao e retorna codigo "organizacao_incompleta" se ainda houver arquivos soltos na raiz. Aceita caminhos amigaveis como "downloads/a.pdf", "desktop", "documentos/pasta" e "~/arquivo". Ao organizar arquivos use os caminhos EXATOS retornados por os_listar - nao invente nomes.',
    categoria: 'os',

    parametros: {
        operacoes: {
            tipo: 'array',
            descricao: 'Array de operacoes em sequencia. CADA item OBRIGATORIAMENTE tem: "operacao" (mover|renomear|copiar|deletar|criar_pasta) e "origem". "destino" e obrigatorio em mover/renomear/copiar. Exemplo de item valido: { "operacao": "mover", "origem": "desktop/a.pdf", "destino": "documentos/Pasta/a.pdf" }. Preferido para 2+ operacoes. Sem dry_run, exige confirmacao do lote.',
            obrigatorio: false
        },
        operacao: {
            tipo: 'string',
            descricao: 'Modo single: operacao unica.',
            obrigatorio: false,
            enum: ['mover', 'renomear', 'copiar', 'deletar', 'criar_pasta']
        },
        origem: {
            tipo: 'string',
            descricao: 'Caminho de origem. Para criar_pasta, caminho da pasta a criar. Para deletar, caminho a remover.',
            obrigatorio: false
        },
        destino: {
            tipo: 'string',
            descricao: 'Caminho de destino. Obrigatorio para mover/renomear/copiar.',
            obrigatorio: false,
            default: ''
        },
        confirmado: {
            tipo: 'boolean',
            descricao: 'Para deletar em modo single: true somente se o usuario confirmou.',
            obrigatorio: false,
            default: false
        },
        permanente: {
            tipo: 'boolean',
            descricao: 'Para deletar: true = exclusao irreversivel. false = Lixeira.',
            obrigatorio: false,
            default: false
        },
        batch_confirmado: {
            tipo: 'boolean',
            descricao: 'Em batch: true quando o usuario confirmou o lote inteiro apos revisar o plano.',
            obrigatorio: false,
            default: false
        },
        caminho: {
            tipo: 'string',
            descricao: 'Pasta base opcional para resolver origens/destinos relativos dentro de operacoes. Ex: caminho="downloads/documentos importantes" + origem="CPF.pdf".',
            obrigatorio: false
        },
        dry_run: {
            tipo: 'boolean',
            descricao: 'Quando true, apenas resolve caminhos e valida o plano. Nao move, copia, cria ou deleta nada.',
            obrigatorio: false,
            default: false
        }
    },

    retorno: 'Single: resultado da operacao. Batch: { total, sucessos, falhas, resultados[], posOrganizacao? }. Se codigo=organizacao_incompleta, execute novo dry_run apenas com os arquivos restantes.',

    exemplos: [
        '{ "skill": "os_mover", "parametros": { "operacoes": [ { "operacao": "criar_pasta", "origem": "documentos/Memoriais" }, { "operacao": "mover", "origem": "documentos/MEMORIAIS.pdf", "destino": "documentos/Memoriais/MEMORIAIS.pdf" } ], "batch_confirmado": true } }',
        '// Organizar pasta em sub-pastas: cria pastas primeiro, depois move arquivos EXATOS retornados por os_listar',
        '{ "skill": "os_mover", "parametros": { "dry_run": true, "operacoes": [ { "operacao": "criar_pasta", "origem": "desktop/LMAO/TRABALHOS FACUL/Peticoes" }, { "operacao": "mover", "origem": "desktop/LMAO/TRABALHOS FACUL/Peticao Inicial.docx", "destino": "desktop/LMAO/TRABALHOS FACUL/Peticoes/Peticao Inicial.docx" } ] } }',
        '{ "skill": "os_mover", "parametros": { "operacao": "criar_pasta", "origem": "documentos/Memoriais" } }',
        '{ "skill": "os_mover", "parametros": { "operacao": "mover", "origem": "downloads/nota.pdf", "destino": "documentos/Fiscais/nota.pdf" } }',
        '{ "skill": "os_mover", "parametros": { "operacao": "mover", "origem": "downloads/nota.pdf", "destino": "documentos/Fiscais/nota.pdf", "dry_run": true } }',
        '{ "skill": "os_mover", "parametros": { "operacao": "deletar", "origem": "downloads/lixo.tmp", "confirmado": true } }',
        '{ "skill": "os_mover", "parametros": { "operacao": "deletar", "origem": "downloads/secreto.txt", "confirmado": true, "permanente": true } }',
        '{ "skill": "os_mover", "parametros": { "operacoes": [ { "operacao": "deletar", "origem": "downloads/a.tmp" }, { "operacao": "deletar", "origem": "downloads/b.tmp" } ], "batch_confirmado": true } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        let ops = params['operacoes'];
        if (typeof ops === 'string') {
            const tentado = ops.trim();
            try {
                ops = JSON.parse(tentado);
            } catch {
                return {
                    sucesso: false,
                    erro: 'Parametro "operacoes" veio como string mas nao e JSON valido. Envie um array JSON literal, nao stringificado.',
                    codigo: 'operacao_invalida',
                    sugestao: 'Use { "operacoes": [ { "operacao": "...", "origem": "...", "destino": "..." } ] } (array literal, sem aspas em volta).'
                };
            }
        }
        const dryRun = boolParam(params['dry_run'] ?? params['dryRun']);
        const baseDirParam = String(params['caminho'] ?? params['base'] ?? params['baseDir'] ?? '').trim();
        const baseDir = baseDirParam ? resolverCaminhoOs(baseDirParam) : undefined;
        if (Array.isArray(ops) && ops.length > 0) {
            const opsNormalizadasBase = ops.map((op) => normalizarOp(op, baseDir));
            if (dryRun) {
                return executarDryRun(opsNormalizadasBase);
            }

            const preflight = await executarDryRun(opsNormalizadasBase);
            if (!preflight.sucesso) {
                return {
                    ...preflight,
                    erro: preflight.erro || 'Preflight bloqueou o batch antes de executar qualquer alteracao.',
                    mensagem: `Preflight bloqueou o batch; nada foi alterado.\n\n${preflight.mensagem || ''}`.trim()
                };
            }

            const batchConfirmado = boolParam(params['batch_confirmado']);
            if (!batchConfirmado) {
                const deletesSemConfirm = opsNormalizadasBase.filter(o => o.operacao === 'deletar' && !boolParam(o.confirmado));
                const algumPermanente = deletesSemConfirm.some((o: any) => boolParam(o?.permanente));
                const destinoDelete = algumPermanente ? 'EXCLUSAO PERMANENTE (irreversivel)' : 'Lixeira (reversivel)';
                const question = deletesSemConfirm.length > 0
                    ? `O batch vai enviar ${deletesSemConfirm.length} item(ns) para ${destinoDelete} e executar ${opsNormalizadasBase.length} operacao(oes) no total:\n${formatarPreviewBatch(opsNormalizadasBase)}\n\nConfirma? Responda "sim" ou "nao".`
                    : `O batch vai executar ${opsNormalizadasBase.length} operacao(oes) de arquivo/pasta:\n${formatarPreviewBatch(opsNormalizadasBase)}\n\nConfirma? Responda "sim" ou "nao".`;
                return {
                    sucesso: false,
                    dados: {
                        requiresUserAction: true,
                        question
                    },
                    mensagem: `Aguardando confirmacao do batch (${opsNormalizadasBase.length} operacao[oes]).`
                };
            }

            const planosPreflight = Array.isArray((preflight.dados as any)?.operacoes)
                ? (preflight.dados as any).operacoes as DryRunItem[]
                : [];

            const opsNormalizadas = opsNormalizadasBase.map((o, idx) => {
                const plano = planosPreflight[idx];
                return {
                ...o,
                origem: plano?.origemResolvida || o.origem,
                destino: plano?.destinoResolvido || o.destino,
                confirmado: batchConfirmado ? true : boolParam(o.confirmado),
                permanente: boolParam(o.permanente)
                };
            });

            const resultados: OpResult[] = [];
            for (const op of opsNormalizadas) {
                resultados.push(await executarUma(op));
            }

            const sucessos = resultados.filter(r => r.sucesso).length;
            const falhas = resultados.length - sucessos;
            const posOrganizacao = falhas === 0
                ? await verificarOrganizacaoIncompleta(opsNormalizadasBase)
                : null;
            const linhasResumo = resultados.map(r => {
                const ic = r.sucesso ? 'OK' : 'FALHOU';
                const base = r.destino ? `${r.origem} -> ${r.destino}` : r.origem;
                return `${ic} ${r.operacao}: ${base}${r.sucesso ? '' : ` - ${r.erro}`}`;
            }).join('\n');

            const primeiraFalha = resultados.find(r => !r.sucesso);
            const resumoFalhas = resultados
                .filter(r => !r.sucesso)
                .slice(0, 3)
                .map(r => `${r.codigo || 'erro'}: ${r.erro || r.mensagem}`)
                .join('; ');
            const erroBatch = falhas > 0
                ? (falhas === resultados.length
                    ? `Todas as ${falhas} operacoes falharam. ${resumoFalhas}`
                    : `${falhas}/${resultados.length} operacoes falharam. ${resumoFalhas}`)
                : posOrganizacao
                    ? `Organizacao incompleta: ${posOrganizacao.totalArquivosRestantes} arquivo(s) ainda ficaram na raiz "${posOrganizacao.raiz}".`
                : undefined;
            const resumoPendentes = posOrganizacao
                ? `\n\nCONFERENCIA POS-ORGANIZACAO: ainda ha ${posOrganizacao.totalArquivosRestantes} arquivo(s) na raiz "${posOrganizacao.raiz}". Nao trate como concluido; proponha organizar apenas esses pendentes:\n${posOrganizacao.arquivosRestantes.map((nome) => `- ${nome}`).join('\n')}${posOrganizacao.totalArquivosRestantes > posOrganizacao.arquivosRestantes.length ? `\n... e mais ${posOrganizacao.totalArquivosRestantes - posOrganizacao.arquivosRestantes.length}` : ''}`
                : '';

            return {
                sucesso: falhas === 0 && !posOrganizacao,
                erro: erroBatch,
                codigo: primeiraFalha?.codigo || (posOrganizacao ? 'organizacao_incompleta' : undefined),
                sugestao: primeiraFalha?.sugestao || (posOrganizacao ? 'Liste os arquivos restantes na raiz e execute novo dry_run apenas para os pendentes.' : undefined),
                dados: { total: resultados.length, sucessos, falhas, resultados, ...(posOrganizacao ? { posOrganizacao } : {}) },
                mensagem: falhas > 0
                    ? `BATCH INCOMPLETO: ${sucessos}/${resultados.length} operacao(oes) ok, ${falhas} falharam. Nao trate como concluido; informe as falhas e proponha corrigir/reexecutar apenas os itens pendentes.\n\n${linhasResumo}`
                    : posOrganizacao
                        ? `ORGANIZACAO INCOMPLETA: ${sucessos}/${resultados.length} operacao(oes) executadas, mas ainda sobraram arquivos na raiz.${resumoPendentes}\n\n${linhasResumo}`
                        : `Batch concluido: ${sucessos}/${resultados.length} ok\n\n${linhasResumo}`
            };
        }

        const single = normalizarOp(params, baseDir);
        const operacao = single.operacao;
        const origem = single.origem;
        const destino = single.destino || '';
        const confirmado = boolParam(single.confirmado);
        const permanente = boolParam(single.permanente);

        if (dryRun) {
            return executarDryRun([{ operacao, origem, destino, confirmado, permanente }]);
        }

        if (!origem) {
            return { sucesso: false, erro: 'Parametro "origem" obrigatorio.', mensagem: 'Informe o caminho de origem ou use "operacoes" para batch.' };
        }

        if (operacao === 'deletar' && !confirmado) {
            const acao = permanente
                ? 'DELETAR PERMANENTEMENTE (irreversivel)'
                : 'mover para a Lixeira (reversivel)';
            return {
                sucesso: false,
                dados: {
                    requiresUserAction: true,
                    question: `Posso ${acao} **${origem}**?\n\nResponda "sim" para confirmar ou "nao" para cancelar.`
                },
                mensagem: `Aguardando confirmacao para ${acao.toLowerCase()}: ${origem}`
            };
        }

        const r = await executarUma({ operacao, origem, destino, confirmado, permanente });
        if (!r.sucesso) return { sucesso: false, erro: r.erro, codigo: r.codigo, sugestao: r.sugestao, mensagem: r.erro || r.mensagem };

        const labelOp = operacao === 'renomear' ? 'Renomeado'
            : operacao === 'mover' ? 'Movido'
            : operacao === 'copiar' ? 'Copiado'
            : operacao === 'criar_pasta' ? 'Pasta criada'
            : operacao === 'deletar' ? (permanente ? 'Removido permanentemente' : 'Movido para Lixeira')
            : operacao;
        const destinoPart = r.destino ? ` -> ${r.destino}` : '';
        return { sucesso: true, dados: r, mensagem: `${labelOp}: ${r.origem}${destinoPart}` };
    }
};

export default osMover;
