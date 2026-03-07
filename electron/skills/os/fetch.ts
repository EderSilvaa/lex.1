/**
 * Skill: os_fetch
 *
 * Busca conteúdo de URLs na web. Útil para consultar portais públicos,
 * diários oficiais, e páginas de tribunais.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { fetchUrl } from '../../tools/os-tools';

export const osFetch: Skill = {
    nome: 'os_fetch',
    descricao: 'Busca conteúdo de uma URL pública na web e retorna o texto. Use para consultar portais de tribunais, diários oficiais, páginas públicas. NÃO use para URLs que requerem login — use pje_agir nesse caso.',
    categoria: 'os',

    parametros: {
        url: {
            tipo: 'string',
            descricao: 'URL completa a buscar (deve começar com https:// ou http://)',
            obrigatorio: true
        },
        timeout: {
            tipo: 'number',
            descricao: 'Tempo limite em segundos (default: 15)',
            obrigatorio: false,
            default: 15
        }
    },

    retorno: 'Conteúdo textual da página (HTML é convertido para texto puro).',

    exemplos: [
        '{ "skill": "os_fetch", "parametros": { "url": "https://www.trt8.jus.br/noticias" } }',
        '{ "skill": "os_fetch", "parametros": { "url": "https://www.jusbrasil.com.br/jurisprudencia" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const url = String(params['url'] || '').trim();
        const timeoutSeg = Number(params['timeout'] || 15);

        if (!url) return { sucesso: false, erro: 'Parâmetro "url" obrigatório.', mensagem: 'Informe a URL.' };
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return { sucesso: false, erro: 'URL deve começar com http:// ou https://', mensagem: 'URL inválida.' };
        }

        const resultado = await fetchUrl(url, timeoutSeg * 1000);
        if (!resultado.sucesso) return { sucesso: false, erro: resultado.erro, mensagem: resultado.erro };

        const { status, contentType, tamanho, conteudo } = resultado.dados;
        return {
            sucesso: true,
            dados: resultado.dados,
            mensagem: `🌐 ${url} [HTTP ${status}] (${(tamanho / 1024).toFixed(1)} KB, ${contentType})\n\n${conteudo}`
        };
    }
};

export default osFetch;
