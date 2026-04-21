/**
 * Skill: os_tamanho
 *
 * Calcula o tamanho recursivo de uma pasta — total em bytes, contagem
 * de arquivos/pastas e ranking das subpastas que mais ocupam espaço.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { tamanhoRecursivo } from '../../tools/os-tools';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const osTamanho: Skill = {
    nome: 'os_tamanho',
    descricao: 'Mede o tamanho TOTAL (recursivo) de uma pasta: soma de todos os arquivos em todos os níveis, contagem de arquivos/pastas e ranking das subpastas que mais ocupam espaço. Use quando o usuário pergunta "quantos MB tem X", "o que tá ocupando espaço em Y", ou quer limpar algo grande.',
    categoria: 'os',

    parametros: {
        caminho: {
            tipo: 'string',
            descricao: 'Caminho da pasta. Atalhos: "downloads", "desktop", "documentos", "~". Ou absoluto.',
            obrigatorio: false,
            default: '~'
        },
        top_n: {
            tipo: 'number',
            descricao: 'Quantas subpastas (nível 1) mostrar no ranking. Default 10.',
            obrigatorio: false,
            default: 10
        }
    },

    retorno: '{ caminho, totalBytes, totalArquivos, totalPastas, topSubpastas[] }',

    exemplos: [
        '{ "skill": "os_tamanho", "parametros": { "caminho": "downloads" } }',
        '{ "skill": "os_tamanho", "parametros": { "caminho": "C:\\\\Users\\\\EDER\\\\Documents", "top_n": 5 } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const caminho = String(params['caminho'] || '~').trim();
        const topN = Math.min(Math.max(Number(params['top_n']) || 10, 1), 30);

        const r = await tamanhoRecursivo(caminho, topN);
        if (!r.sucesso) return { sucesso: false, erro: r.erro, codigo: r.codigo, sugestao: r.sugestao, mensagem: r.erro };

        const d = r.dados as {
            caminho: string;
            totalBytes: number;
            totalArquivos: number;
            totalPastas: number;
            topSubpastas: Array<{ nome: string; bytes: number }>;
            parcial?: boolean;
            motivoParcial?: string | null;
            pastasIgnoradas?: string[];
        };

        const rank = d.topSubpastas.length > 0
            ? d.topSubpastas
                .map((s, i) => `  ${String(i + 1).padStart(2, ' ')}. ${formatBytes(s.bytes).padStart(10, ' ')}  ${s.nome}`)
                .join('\n')
            : '  (sem subpastas)';

        const aviso = d.parcial
            ? `\n⚠️  Resultado parcial (${d.motivoParcial === 'deadline' ? 'timeout interno — pasta muito grande' : d.motivoParcial})`
            : '';
        const ignoradasInfo = d.pastasIgnoradas && d.pastasIgnoradas.length > 0
            ? `\n(Ignoradas: ${d.pastasIgnoradas.slice(0, 6).join(', ')}${d.pastasIgnoradas.length > 6 ? '...' : ''})`
            : '';

        return {
            sucesso: true,
            dados: d,
            mensagem:
                `📊 Tamanho de ${d.caminho}${aviso}\n` +
                `Total: ${formatBytes(d.totalBytes)} | ${d.totalArquivos} arquivo(s), ${d.totalPastas} pasta(s)${ignoradasInfo}\n\n` +
                `Top subpastas:\n${rank}`
        };
    }
};

export default osTamanho;
