/**
 * Skill: os_deletar
 *
 * Alias ergonomico para deletar arquivos/pastas. Por padrao envia para a
 * Lixeira usando os_mover, mantendo o mesmo fluxo de confirmacao.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { osMover } from './mover';
import { resolverCaminhoOs } from '../../tools/os-tools';

type DeleteOp = {
    operacao: 'deletar';
    origem: string;
    confirmado?: boolean;
    permanente?: boolean;
};

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

function tryParseJsonArray(value: string): unknown[] | null {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function normalizeOrigem(rawOrigem: string, baseDir?: string): string {
    const origem = rawOrigem.trim();
    if (!origem || !baseDir) return origem;
    if (/^[a-zA-Z]:[\\/]/.test(origem) || origem.startsWith('\\\\') || origem.startsWith('/') || origem.startsWith('~')) {
        return origem;
    }
    if (/^(downloads|desktop|documentos|documents|imagens|pictures|videos|musica|music|appdata|temp|tmp|onedrive)([\\/]|$)/i.test(origem)) {
        return origem;
    }
    return resolverCaminhoOs(`${baseDir.replace(/[\\/]+$/, '')}/${origem}`);
}

function normalizeOneOp(value: unknown, params: Record<string, any>, baseDir?: string): DeleteOp | null {
    if (typeof value === 'string') {
        const origem = normalizeOrigem(value, baseDir);
        if (!origem) return null;
        return {
            operacao: 'deletar',
            origem,
            confirmado: boolParam(params['confirmado'] ?? params['batch_confirmado']),
            permanente: boolParam(params['permanente'])
        };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const raw = value as Record<string, any>;
    const origem = normalizeOrigem(String(raw['origem'] || raw['caminho'] || raw['path'] || ''), baseDir);
    if (!origem) return null;

    return {
        operacao: 'deletar',
        origem,
        confirmado: boolParam(raw['confirmado'] ?? params['confirmado'] ?? params['batch_confirmado']),
        permanente: boolParam(raw['permanente'] ?? params['permanente'])
    };
}

function normalizeOps(params: Record<string, any>): DeleteOp[] {
    const candidates: unknown[] = [];
    const hasExplicitBatch = Array.isArray(params['operacoes'])
        || typeof params['operacoes'] === 'string'
        || Array.isArray(params['alvos'])
        || typeof params['alvos'] === 'string'
        || Array.isArray(params['caminhos'])
        || typeof params['caminhos'] === 'string';
    const baseDir = hasExplicitBatch && typeof params['caminho'] === 'string' && params['caminho'].trim()
        ? params['caminho'].trim()
        : undefined;

    const operacoes = params['operacoes'];
    if (Array.isArray(operacoes)) {
        candidates.push(...operacoes);
    } else if (typeof operacoes === 'string') {
        const parsed = tryParseJsonArray(operacoes.trim());
        if (parsed) candidates.push(...parsed);
    }

    const alvos = params['alvos'] ?? params['caminhos'];
    if (Array.isArray(alvos)) {
        candidates.push(...alvos);
    } else if (typeof alvos === 'string') {
        const parsed = tryParseJsonArray(alvos.trim());
        if (parsed) candidates.push(...parsed);
        else candidates.push(alvos);
    }

    const caminho = params['caminho'] ?? params['origem'];
    if (!hasExplicitBatch && typeof caminho === 'string' && caminho.trim()) {
        candidates.push(caminho);
    }

    return candidates
        .map(candidate => normalizeOneOp(candidate, params, baseDir))
        .filter((op): op is DeleteOp => Boolean(op));
}

export const osDeletar: Skill = {
    nome: 'os_deletar',
    descricao: 'Deleta arquivos ou pastas do PC. Por DEFAULT envia para a Lixeira do Windows (reversivel). Use permanente:true somente se o usuario pedir exclusao irreversivel. Use dry_run:true quando o usuario pedir para simular, conferir ou mostrar o plano antes. Aceita caminho unico em "caminho" ou lote em "alvos". Tambem tolera "operacoes" vindo de chamadas antigas com itens { caminho } ou { origem }. Apos confirmacao do usuario, rechame a mesma skill com confirmado:true ou batch_confirmado:true.',
    categoria: 'os',

    parametros: {
        caminho: {
            tipo: 'string',
            descricao: 'Caminho unico a enviar para a Lixeira.',
            obrigatorio: false
        },
        alvos: {
            tipo: 'array',
            descricao: 'Lista de caminhos a enviar para a Lixeira em uma unica chamada.',
            obrigatorio: false
        },
        confirmado: {
            tipo: 'boolean',
            descricao: 'TRUE somente depois que o usuario confirmou o delete.',
            obrigatorio: false,
            default: false
        },
        batch_confirmado: {
            tipo: 'boolean',
            descricao: 'TRUE depois que o usuario confirmou o lote inteiro.',
            obrigatorio: false,
            default: false
        },
        permanente: {
            tipo: 'boolean',
            descricao: 'TRUE = exclusao irreversivel. FALSE (default) = Lixeira.',
            obrigatorio: false,
            default: false
        },
        dry_run: {
            tipo: 'boolean',
            descricao: 'Quando true, apenas resolve caminhos e mostra o plano. Nao envia nada para Lixeira e nao deleta.',
            obrigatorio: false,
            default: false
        }
    },

    retorno: 'Resultado do envio para Lixeira/exclusao, incluindo confirmacao quando necessaria.',

    exemplos: [
        '{ "skill": "os_deletar", "parametros": { "caminho": "downloads/lixo.tmp" } }',
        '{ "skill": "os_deletar", "parametros": { "caminho": "downloads/lixo.tmp", "dry_run": true } }',
        '{ "skill": "os_deletar", "parametros": { "alvos": ["downloads/a.tmp", "downloads/b.tmp"] } }',
        '{ "skill": "os_deletar", "parametros": { "alvos": ["downloads/a.tmp", "downloads/b.tmp"], "batch_confirmado": true } }'
    ],

    async execute(params: Record<string, any>, context: AgentContext): Promise<SkillResult> {
        const ops = normalizeOps(params);
        if (ops.length === 0) {
            return {
                sucesso: false,
                erro: 'Informe "caminho" ou "alvos" com os arquivos/pastas a deletar.',
                mensagem: 'Nenhum alvo de delete foi informado.'
            };
        }

        return osMover.execute({
            operacoes: ops,
            dry_run: boolParam(params['dry_run'] ?? params['dryRun']),
            batch_confirmado: boolParam(params['batch_confirmado'] ?? params['confirmado'])
        }, context);
    }
};

export default osDeletar;
