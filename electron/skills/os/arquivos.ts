/**
 * Skill: os_arquivos
 *
 * Leitura e metadados de arquivos locais. Operacoes que mudam o filesystem
 * ficam nas skills canonicas: os_mover, os_deletar, os_buscar e os_escrever.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import {
    lerArquivo,
    infoItem,
    buscarConteudo,
    mapearProcessoPdf
} from '../../tools/os-tools';

export const osArquivos: Skill = {
    nome: 'os_arquivos',
    descricao: [
        'Leitura e metadados de arquivos locais: ler texto/PDF/DOCX/XLSX, info, grep por conteudo e mapear indice de PDF de processo PJe.',
        'WHEN usar processo_mapa: usuario pede para analisar/mapear um PDF de processo, descobrir pecas, identificar peticao inicial/contestacao/decisao, ou entender o indice do processo.',
        'WHEN NOT: consulta por numero CNJ sem arquivo deve ir para pje_consultar; busca por nome/cade arquivo deve ir para os_buscar; mover/copiar/deletar/criar deve ir para as skills dedicadas.'
    ].join(' '),
    categoria: 'os',

    parametros: {
        operacao: {
            tipo: 'string',
            descricao: 'Operacao a executar. Use processo_mapa para extrair mapa semantico de PDF/texto de processo PJe. Mutacoes foram removidas desta skill por seguranca.',
            obrigatorio: false,
            default: 'info',
            enum: ['ler', 'grep', 'info', 'processo_mapa']
        },
        caminho: {
            tipo: 'string',
            descricao: 'Caminho do arquivo ou pasta origem.',
            obrigatorio: true
        },
        destino: {
            tipo: 'string',
            descricao: 'Legado. Ignorado; para mover/copiar use os_mover.',
            obrigatorio: false,
            default: ''
        },
        padrao: {
            tipo: 'string',
            descricao: 'Texto a encontrar dentro dos arquivos (para "grep"). Para buscar por nome, use os_buscar.',
            obrigatorio: false,
            default: ''
        },
        extensoes: {
            tipo: 'string',
            descricao: 'Extensoes a filtrar no grep, separadas por virgula. Ex: ".pdf,.docx,.txt". Vazio = todas as extensoes de texto suportadas.',
            obrigatorio: false,
            default: ''
        },
        recursivo: {
            tipo: 'boolean',
            descricao: 'Busca recursiva em subpastas para "grep".',
            obrigatorio: false,
            default: true
        }
    },

    retorno: 'Resultado de leitura, grep, metadados ou mapa semantico do processo.',

    exemplos: [
        '{ "skill": "os_arquivos", "parametros": { "operacao": "ler", "caminho": "C:\\\\relatorio.pdf" } }',
        '{ "skill": "os_arquivos", "parametros": { "operacao": "ler", "caminho": "C:\\\\contrato.docx" } }',
        '{ "skill": "os_arquivos", "parametros": { "operacao": "grep", "caminho": "C:\\\\Downloads", "padrao": "Joao Silva", "extensoes": ".pdf,.docx" } }',
        '{ "skill": "os_arquivos", "parametros": { "operacao": "info", "caminho": "C:\\\\Downloads\\\\doc.pdf" } }',
        '{ "skill": "os_arquivos", "parametros": { "operacao": "processo_mapa", "caminho": "C:\\\\Downloads\\\\processo.pdf" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const processoMapaAlias = params['processo_mapa'] === true || String(params['processo_mapa'] || '').toLowerCase() === 'true';
        const operacaoRaw = params['operacao'] ?? params['acao'] ?? params['action'];
        const operacao = processoMapaAlias
            ? 'processo_mapa'
            : String(operacaoRaw || 'info').trim();
        const caminho = String(params['caminho'] || '').trim();
        const padrao = String(params['padrao'] || '').trim();
        const extensoesRaw = String(params['extensoes'] || '').trim();
        const recursivo = params['recursivo'] !== false;

        if (!caminho) {
            return { sucesso: false, erro: 'Parametro "caminho" obrigatorio.', mensagem: 'Informe o caminho do arquivo ou pasta.' };
        }

        switch (operacao) {
            case 'ler': {
                const resultado = await lerArquivo(caminho);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
                const fmt = resultado.dados.formato ? ` [${resultado.dados.formato.toUpperCase()}]` : '';
                const pags = resultado.dados.paginas ? `, ${resultado.dados.paginas} paginas` : '';
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `Arquivo ${resultado.dados.caminho}${fmt} (${resultado.dados.linhas} linhas${pags})\n\n${resultado.dados.conteudo}`
                };
            }

            case 'grep': {
                if (!padrao) {
                    return { sucesso: false, erro: 'Parametro "padrao" obrigatorio para grep.', mensagem: 'Informe o texto a buscar.' };
                }
                const extensoes = extensoesRaw
                    ? extensoesRaw.split(',').map(e => e.trim()).filter(Boolean)
                    : [];
                const resultado = await buscarConteudo(caminho, padrao, extensoes, recursivo);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
                const { total, resultados } = resultado.dados;
                if (total === 0) {
                    return { sucesso: true, dados: resultado.dados, mensagem: `Nenhum arquivo contem "${padrao}" em ${resultado.dados.baseDir}` };
                }
                const linhasResultado = resultados.map((r: any) =>
                    `${r.arquivo} (${r.ocorrencias} ocorrencia[s])\n${r.trechos.join('\n  ---\n')}`
                ).join('\n\n');
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: `Grep "${padrao}" em ${resultado.dados.baseDir}:\n${total} arquivo(s) encontrado(s)\n\n${linhasResultado}`
                };
            }

            case 'info': {
                const resultado = await infoItem(caminho);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
                const d = resultado.dados;
                if (!d.existe) return { sucesso: true, dados: d, mensagem: `"${caminho}" nao existe.` };
                return {
                    sucesso: true,
                    dados: d,
                    mensagem: `${d.caminho}\nTipo: ${d.tipo}\nTamanho: ${d.tamanho ? `${d.tamanho} bytes` : '-'}\nModificado: ${d.modificado}`
                };
            }

            case 'processo_mapa': {
                const resultado = await mapearProcessoPdf(caminho);
                if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
                return {
                    sucesso: true,
                    dados: resultado.dados,
                    mensagem: mensagemMapaProcesso(resultado.dados)
                };
            }

            default:
                return {
                    sucesso: false,
                    erro: `Operacao "${operacao}" nao e suportada por os_arquivos. Use processo_mapa para mapear PDF de processo, os_mover para mover/copiar, os_deletar para deletar, os_buscar para buscar por nome, ou os_escrever para criar/sobrescrever.`,
                    mensagem: 'Operacao bloqueada nesta skill por seguranca.'
                };
        }
    }
};

function mensagemMapaProcesso(dados: any): string {
    const processo = dados?.processo || 'nao identificado';
    const caminho = dados?.caminho || 'arquivo';
    const qualidade = dados?.qualidadeMapa || 'nao_encontrado';
    const paginas = dados?.paginas ? `, ${dados.paginas} paginas` : '';
    const cache = dados?.cacheHit ? ' (cache)' : '';
    const partes = Array.isArray(dados?.partes) && dados.partes.length
        ? `\nPartes: ${dados.partes.slice(0, 4).map((p: any) => `${p.nome} (${p.papel})`).join('; ')}`
        : '';
    const documentos = Array.isArray(dados?.documentos) && dados.documentos.length
        ? `\nDocumentos:\n${dados.documentos.slice(0, 8).map((doc: any) => {
            const paginasDoc = doc.paginaInicial ? ` p.${doc.paginaInicial}${doc.paginaFinal && doc.paginaFinal !== doc.paginaInicial ? `-${doc.paginaFinal}` : ''}` : '';
            const tipo = doc.tipo ? ` [${doc.tipo}]` : '';
            return `- ${doc.id}: ${doc.documento}${tipo}${paginasDoc}`;
        }).join('\n')}`
        : '\nDocumentos: indice nao encontrado no texto nativo.';
    const aliases = dados?.aliasesDocumentos && Object.keys(dados.aliasesDocumentos).length
        ? `\nAliases: ${Object.keys(dados.aliasesDocumentos).join(', ')}`
        : '';

    return `Mapa do processo ${processo}${cache}\nArquivo: ${caminho}\nQualidade: ${qualidade}; documentos: ${dados?.totalDocumentos || 0}${paginas}${partes}${documentos}${aliases}\nRecomendacao: ${dados?.recomendacao || '-'}`;
}

export default osArquivos;
