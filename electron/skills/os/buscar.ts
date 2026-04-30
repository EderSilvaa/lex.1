/**
 * Skill: os_buscar
 *
 * Busca recursiva de arquivos por nome (glob/substring) com opção de
 * filtrar também por conteúdo (grep em .txt/.pdf/.docx/.xlsx/etc).
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { buscarArquivos, buscarConteudo, buscarDuplicadosPorNome } from '../../tools/os-tools';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const osBuscar: Skill = {
    nome: 'os_buscar',
    descricao: `- Busca recursiva de arquivos/pastas no PC por nome (glob ou substring), opcionalmente filtrando por conteudo
- Suporta padroes glob com * e ? ("*.pdf", "*2024*", "processo*.docx") ou substring case-insensitive ("memorial")
- Modo "duplicados_nome" detecta nomes obviamente duplicados (ex: "doc.pdf" e "doc (1).pdf")
- Filtro de conteudo via "conteudo" varre o texto dentro de .txt/.md/.json/.pdf/.docx/.xlsx achados
- Use quando o usuario quer "encontra/ache/procura/cade/tem algum" arquivo por nome parcial ou padrao
- Se o usuario disser "cade aquele contrato/documento/arquivo do X?" sem mencionar PJe ou numero CNJ, assuma busca de arquivo local no PC
- Nao pergunte a pasta exata quando ja houver termo buscavel; use caminho "~" para procurar no home inteiro
- Use quando precisa varrer subpastas (recursivo por padrao)
- Para listar UMA pasta sem recursao ou filtragem, use os_listar
- Para ler/grep conteudo de UM arquivo ja conhecido, use os_arquivos
- Para buscar PROCESSO judicial (numero CNJ, movimentacoes), use pje_consultar — e PJe, nao PC
- Para "find/dir /s/ls -R" no shell, use esta skill — NAO use terminal_executar`,
    categoria: 'os',

    parametros: {
        caminho: {
            tipo: 'string',
            descricao: 'Pasta base onde iniciar a busca. Atalhos: "downloads", "desktop", "documentos", "imagens", "~". Ou absoluto Windows ("C:\\\\Users\\\\..."). Default "~" (home).',
            obrigatorio: false,
            default: '~'
        },
        modo: {
            tipo: 'string',
            descricao: 'modo="nome" (default) — busca por padrao/conteudo. modo="duplicados_nome" — encontra arquivos com nomes obviamente duplicados (variantes "(1)", "- copia", "_v2", etc) sem precisar de terminal.',
            obrigatorio: false,
            enum: ['nome', 'duplicados_nome'],
            default: 'nome'
        },
        padrao: {
            tipo: 'string',
            descricao: 'Padrao do nome. Glob com * e ? ("*.pdf", "*2024*", "processo*.docx") ou substring case-insensitive ("memorial"). Vazio = qualquer nome — so util quando "conteudo" e passado.',
            obrigatorio: false,
            default: ''
        },
        nome: {
            tipo: 'string',
            descricao: 'Alias de "padrao" para chamadas como { nome: "documentos importantes" }. Use "padrao" preferencialmente.',
            obrigatorio: false,
            default: ''
        },
        filtro: {
            tipo: 'string',
            descricao: 'Alias de "padrao" para compatibilidade com os_listar. Use "padrao" preferencialmente.',
            obrigatorio: false,
            default: ''
        },
        conteudo: {
            tipo: 'string',
            descricao: 'Texto a procurar DENTRO dos arquivos achados (grep). Suporta .txt/.md/.json/.pdf/.docx/.xlsx. Mais lento que busca so por nome — use quando o usuario pediu "arquivos que contenham X" ou "que falam sobre Y".',
            obrigatorio: false,
            default: ''
        },
        limite: {
            tipo: 'number',
            descricao: 'Maximo de resultados retornados (default 100, max 500). Reduza pra pastas gigantes.',
            obrigatorio: false,
            default: 100
        },
        profundidade_max: {
            tipo: 'number',
            descricao: 'Profundidade maxima de subpastas exploradas (default 10, max 20). Reduza pra cortar tempo em pastas profundas.',
            obrigatorio: false,
            default: 10
        }
    },

    retorno: 'Lista de matches com { caminho, tipo, tamanho, modificado }. Se "conteudo" foi passado, inclui "ocorrencias" e "trechos" por arquivo. Modo duplicados_nome retorna grupos { chave, itens[] }.',

    exemplos: [
        '// "ache todos os PDFs de 2024 nos meus downloads"\n{ "skill": "os_buscar", "parametros": { "caminho": "downloads", "padrao": "*2024*.pdf" } }',
        '// "tem algum arquivo memorial em documentos?"\n{ "skill": "os_buscar", "parametros": { "caminho": "documentos", "padrao": "*memorial*" } }',
        '// "tem cópias duplicadas obvias na pasta downloads?"\n{ "skill": "os_buscar", "parametros": { "caminho": "downloads", "modo": "duplicados_nome" } }',
        '// "procura .docx que falem sobre rescisão contratual"\n{ "skill": "os_buscar", "parametros": { "caminho": "documentos", "padrao": "*.docx", "conteudo": "rescisao contratual" } }',
        '// "cadê aquele contrato do João?"\n{ "skill": "os_buscar", "parametros": { "caminho": "~", "padrao": "*contrato*joao*" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const caminho = String(params['caminho'] || '~').trim();
        const modo = String(params['modo'] || 'nome').trim();
        const padrao = String(params['padrao'] ?? params['nome'] ?? params['filtro'] ?? '').trim();
        const conteudo = String(params['conteudo'] || '').trim();
        const limite = Math.min(Math.max(Number(params['limite']) || 100, 1), 500);
        const profundidade = Math.min(Math.max(Number(params['profundidade_max']) || 10, 1), 20);

        if (modo === 'duplicados_nome') {
            const resultado = await buscarDuplicadosPorNome(caminho, true, limite, profundidade);
            if (!resultado.sucesso) {
                return { sucesso: false, erro: resultado.erro, codigo: resultado.codigo, sugestao: resultado.sugestao, mensagem: resultado.erro };
            }

            const grupos = resultado.dados.grupos as Array<{
                chave: string;
                itens: Array<{ caminho: string; nome: string; tamanho?: number; modificado?: string; marcadorCopia: boolean }>;
            }>;

            const linhas = grupos.slice(0, 20).map((grupo, idx) => {
                const itens = grupo.itens
                    .sort((a, b) => Number(a.marcadorCopia) - Number(b.marcadorCopia) || a.nome.localeCompare(b.nome, 'pt-BR'))
                    .map(item => {
                        const tam = item.tamanho !== undefined ? ` (${formatBytes(item.tamanho)})` : '';
                        const marca = item.marcadorCopia ? ' [copia]' : '';
                        return `  - ${item.caminho}${tam}${marca}`;
                    })
                    .join('\n');
                return `${idx + 1}. ${grupo.chave} (${grupo.itens.length} arquivo[s])\n${itens}`;
            }).join('\n\n');

            const parcial = resultado.dados.parcial ? `\nBusca parcial: ${resultado.dados.motivoParcial}` : '';
            return {
                sucesso: true,
                dados: resultado.dados,
                mensagem: `Duplicados obvios por nome em ${resultado.dados.caminho}\n` +
                    `Arquivos visitados: ${resultado.dados.arquivosVisitados}\n` +
                    `Grupos encontrados: ${resultado.dados.totalGrupos}${parcial}\n\n` +
                    (linhas || 'Nenhum duplicado obvio por nome encontrado.')
            };
        }

        if (!padrao && !conteudo) {
            return {
                sucesso: false,
                erro: 'Passe "padrao" (nome) e/ou "conteudo" (texto dentro).',
                mensagem: 'Informe o que buscar — padrao (nome) ou conteudo (grep).'
            };
        }

        // 1) Busca por nome (se padrao informado). Se só conteudo, busca tudo e filtra depois.
        const resBusca = await buscarArquivos(caminho, padrao || '*', true, limite, profundidade);
        if (!resBusca.sucesso) {
            return { sucesso: false, erro: resBusca.erro, codigo: resBusca.codigo, sugestao: resBusca.sugestao, mensagem: resBusca.erro };
        }

        let itens = resBusca.dados.resultados as Array<{ caminho: string; tipo: string; tamanho?: number; modificado?: string }>;

        // 2) Filtro por conteúdo (se pedido)
        let ocorrenciasPorArquivo: Record<string, { ocorrencias: number; trechos: string[] }> = {};
        if (conteudo) {
            const resConteudo = await buscarConteudo(caminho, conteudo, [], true);
            if (resConteudo.sucesso) {
                const porPath = new Set<string>();
                for (const r of resConteudo.dados.resultados) {
                    porPath.add(r.arquivo);
                    ocorrenciasPorArquivo[r.arquivo] = { ocorrencias: r.ocorrencias, trechos: r.trechos };
                }
                // Intersecta com matches por nome (ou usa só conteúdo se padrao vazio)
                itens = padrao
                    ? itens.filter(i => porPath.has(i.caminho))
                    : Array.from(porPath).map(p => ({ caminho: p, tipo: 'arquivo' as const }));
            }
        }

        const total = itens.length;
        const bytesTotais = itens.reduce((acc, i) => acc + (i.tamanho || 0), 0);

        const linhas = itens.slice(0, 30).map(i => {
            const icone = i.tipo === 'pasta' ? '📁' : '📄';
            const tam = i.tamanho !== undefined ? ` (${formatBytes(i.tamanho)})` : '';
            const conteudoInfo = ocorrenciasPorArquivo[i.caminho]
                ? ` — ${ocorrenciasPorArquivo[i.caminho]!.ocorrencias} ocorrência(s)`
                : '';
            return `${icone} ${i.caminho}${tam}${conteudoInfo}`;
        }).join('\n');

        const cabecalho = `🔎 Busca em ${caminho}\n` +
            `Padrão: "${padrao || '(qualquer)'}"${conteudo ? ` | Conteúdo: "${conteudo}"` : ''}\n` +
            `${total} resultado(s)${itens.length > 30 ? ` (mostrando 30)` : ''} | Total: ${formatBytes(bytesTotais)}`;

        return {
            sucesso: true,
            dados: {
                caminho,
                padrao,
                conteudo,
                total,
                truncado: resBusca.dados.truncado || total > 30,
                bytesTotais,
                itens: itens.map(i => ({ ...i, ...(ocorrenciasPorArquivo[i.caminho] ?? {}) }))
            },
            mensagem: `${cabecalho}\n\n${linhas || '(nenhum resultado)'}`
        };
    }
};

export default osBuscar;
