/**
 * Skill: os_listar
 *
 * Lista arquivos e pastas de um diretório.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { listarDiretorio, pastasConhecidas } from '../../tools/os-tools';

export const osListar: Skill = {
    nome: 'os_listar',
    descricao: 'Lista arquivos e pastas do sistema de arquivos local do Windows (computador do usuário). Use quando o usuário quer ver arquivos em Downloads, Desktop, Documentos, ou qualquer caminho local como C:\\Users\\... NÃO usar para expedientes ou documentos do PJe.',
    categoria: 'os',

    parametros: {
        caminho: {
            tipo: 'string',
            descricao: 'Caminho da pasta a listar. Use "~" para home, "downloads" para Downloads, "desktop" para Desktop, "documentos" para Documents. Ou caminho absoluto.',
            obrigatorio: true
        }
    },

    retorno: 'Lista de arquivos e pastas com nome, tipo, tamanho e data de modificação.',

    exemplos: [
        '{ "skill": "os_listar", "parametros": { "caminho": "downloads" } }',
        '{ "skill": "os_listar", "parametros": { "caminho": "C:\\\\Users\\\\EDER\\\\Documents" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        let caminho = String(params['caminho'] || '').trim();

        // Atalhos amigáveis
        const pastas = pastasConhecidas().dados!;
        const atalhos: Record<string, string> = {
            '~': pastas.home,
            'home': pastas.home,
            'downloads': pastas.downloads,
            'desktop': pastas.desktop,
            'documentos': pastas.documentos,
            'documents': pastas.documentos,
            'imagens': pastas.imagens,
            'pictures': pastas.imagens,
            'appdata': pastas.appData,
            'temp': pastas.temp,
            'onedrive': pastas.oneDrive
        };

        const atalho = atalhos[caminho.toLowerCase()];
        if (atalho) caminho = atalho;

        const resultado = await listarDiretorio(caminho);

        if (!resultado.sucesso) {
            return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };
        }

        const { itens, caminho: caminhoResolvido } = resultado.dados!;
        const pastas_count = itens.filter((i: any) => i.tipo === 'pasta').length;
        const arquivos_count = itens.filter((i: any) => i.tipo === 'arquivo').length;

        return {
            sucesso: true,
            dados: resultado.dados,
            mensagem: `📁 ${caminhoResolvido}\n${pastas_count} pasta(s), ${arquivos_count} arquivo(s)\n\n` +
                itens.map((i: any) => {
                    const icone = i.tipo === 'pasta' ? '📁' : '📄';
                    const tam = i.tamanho !== undefined ? ` (${formatBytes(i.tamanho)})` : '';
                    return `${icone} ${i.nome}${tam}`;
                }).join('\n')
        };
    }
};

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default osListar;
