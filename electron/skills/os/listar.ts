/**
 * Skill: os_listar
 *
 * Lista arquivos e pastas de um diretório com filtro, ordenação e paginação.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { listarDiretorio } from '../../tools/os-tools';

type Item = {
    nome: string;
    tipo: 'pasta' | 'arquivo';
    tamanho?: number;
    modificado?: string;
    caminho: string;
};

// Glob simples → RegExp (só *  e ?)
function globToRegex(glob: string): RegExp {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const pattern = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    return new RegExp(pattern, 'i');
}

function aplicarFiltro(itens: Item[], filtro: string): Item[] {
    if (!filtro) return itens;
    const tem_glob = /[*?]/.test(filtro);
    if (tem_glob) {
        const re = globToRegex(filtro);
        return itens.filter(i => re.test(i.nome));
    }
    const needle = filtro.toLowerCase();
    return itens.filter(i => i.nome.toLowerCase().includes(needle));
}

function ordenar(itens: Item[], ordem: string, direcao: 'asc' | 'desc'): Item[] {
    const mult = direcao === 'desc' ? -1 : 1;
    const copia = [...itens];
    switch (ordem) {
        case 'data':
            copia.sort((a, b) => mult * String(a.modificado ?? '').localeCompare(String(b.modificado ?? '')));
            break;
        case 'tamanho':
            copia.sort((a, b) => mult * ((a.tamanho ?? -1) - (b.tamanho ?? -1)));
            break;
        case 'tipo':
            copia.sort((a, b) => {
                const t = a.tipo.localeCompare(b.tipo);
                return mult * (t !== 0 ? t : a.nome.localeCompare(b.nome, 'pt-BR'));
            });
            break;
        case 'nome':
        default:
            copia.sort((a, b) => mult * a.nome.localeCompare(b.nome, 'pt-BR'));
            break;
    }
    return copia;
}

export const osListar: Skill = {
    nome: 'os_listar',
    descricao: 'Lista arquivos e pastas do sistema de arquivos local (Windows). Suporta filtro por nome (substring ou glob *.pdf), ordenação (nome/data/tamanho/tipo) e paginação. Use quando o usuário quer ver arquivos em Downloads, Desktop, Documentos, ou qualquer caminho local. NÃO usar para expedientes ou documentos do PJe.',
    categoria: 'os',

    parametros: {
        caminho: {
            tipo: 'string',
            descricao: 'Caminho da pasta. Atalhos: "downloads", "desktop", "documentos", "imagens", "~" (home). Ou caminho absoluto.',
            obrigatorio: false,
            default: '~'
        },
        filtro: {
            tipo: 'string',
            descricao: 'Filtra por nome. Substring (case-insensitive) ou glob com * e ? (ex: "*.pdf", "processo*", "*2024*"). Vazio = sem filtro.',
            obrigatorio: false,
            default: ''
        },
        ordem: {
            tipo: 'string',
            descricao: 'Critério de ordenação.',
            obrigatorio: false,
            enum: ['nome', 'data', 'tamanho', 'tipo'],
            default: 'nome'
        },
        direcao: {
            tipo: 'string',
            descricao: 'Direção da ordenação.',
            obrigatorio: false,
            enum: ['asc', 'desc'],
            default: 'asc'
        },
        limite: {
            tipo: 'number',
            descricao: 'Máximo de itens retornados (default: 100, máx: 500). Use limite menor pra pastas gigantes.',
            obrigatorio: false,
            default: 100
        },
        pagina: {
            tipo: 'number',
            descricao: '0-indexado. Pule páginas: offset = pagina * limite.',
            obrigatorio: false,
            default: 0
        }
    },

    retorno: 'Lista paginada com { total, mostrando, pagina, truncado, itens[] }. Se truncado:true, há mais páginas.',

    exemplos: [
        '{ "skill": "os_listar", "parametros": { "caminho": "downloads" } }',
        '{ "skill": "os_listar", "parametros": { "caminho": "downloads", "filtro": "*.pdf", "ordem": "data", "direcao": "desc", "limite": 20 } }',
        '{ "skill": "os_listar", "parametros": { "caminho": "documentos", "filtro": "processo" } }',
        '{ "skill": "os_listar", "parametros": { "caminho": "downloads", "limite": 50, "pagina": 1 } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const caminho = String(params['caminho'] || '~').trim();
        const filtro = String(params['filtro'] || '').trim();
        const ordem = String(params['ordem'] || 'nome').trim();
        const direcao = (params['direcao'] === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
        const limite = Math.min(Math.max(Number(params['limite']) || 100, 1), 500);
        const pagina = Math.max(Number(params['pagina']) || 0, 0);

        // Atalhos amigáveis
        const resultado = await listarDiretorio(caminho);
        if (!resultado.sucesso) {
            return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
        }

        const { itens, caminho: caminhoResolvido } = resultado.dados! as { itens: Item[]; caminho: string };

        // Filtro → ordenação → paginação
        const filtrados = aplicarFiltro(itens, filtro);
        const ordenados = ordenar(filtrados, ordem, direcao);
        const totalFiltrado = ordenados.length;
        const inicio = pagina * limite;
        const pagina_itens = ordenados.slice(inicio, inicio + limite);
        const truncado = inicio + pagina_itens.length < totalFiltrado;

        const pastas_count = pagina_itens.filter(i => i.tipo === 'pasta').length;
        const arquivos_count = pagina_itens.filter(i => i.tipo === 'arquivo').length;

        const avisoTruncado = truncado
            ? `\n⚠️  LISTAGEM PARCIAL — você está vendo SOMENTE ${pagina_itens.length} de ${totalFiltrado}. Não faça afirmações sobre arquivos que não estão nesta página. Use pagina:${pagina + 1} para ver mais.`
            : '';
        const avisoDuplicatas = pagina_itens.length > 0
            ? `\nℹ️  Nesta pasta NÃO existem nomes duplicados — o Windows não permite 2 arquivos com o mesmo nome exato no mesmo diretório. Se vê "Ação X.pdf" na lista, há 1 arquivo com esse nome, nunca mais.`
            : '';

        const cabecalho = `📁 ${caminhoResolvido}\n` +
            `Total: ${itens.length} item(ns)` +
            (filtro ? ` | Filtrados: ${totalFiltrado}` : '') +
            ` | Mostrando: ${pagina_itens.length} (pág ${pagina})` +
            (truncado ? ` — há mais ${totalFiltrado - inicio - pagina_itens.length} (use pagina:${pagina + 1})` : '') +
            `\n${pastas_count} pasta(s), ${arquivos_count} arquivo(s)` +
            avisoTruncado + avisoDuplicatas + `\n`;

        const corpo = pagina_itens.map(i => {
            const icone = i.tipo === 'pasta' ? '📁' : '📄';
            const tam = i.tamanho !== undefined ? ` (${formatBytes(i.tamanho)})` : '';
            return `${icone} ${i.nome}${tam}`;
        }).join('\n');

        return {
            sucesso: true,
            dados: {
                caminho: caminhoResolvido,
                total: itens.length,
                totalFiltrado,
                mostrando: pagina_itens.length,
                pagina,
                limite,
                truncado,
                itens: pagina_itens
            },
            mensagem: cabecalho + '\n' + corpo
        };
    }
};

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default osListar;
