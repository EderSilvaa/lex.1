/**
 * Skill: pje_browser_use (canônica)
 *
 * Garante que o Chrome PJe está ativo na porta 19222 para uso via MCP
 * browser-use. Substitui as skills Playwright legadas quando o provider
 * é Anthropic e MCP browser está configurado.
 *
 * O trabalho real de navegação é feito pelo LLM via tools MCP browser__*
 * dentro do anthropic-mcp-runner.ts. Esta skill apenas prepara o Chrome.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser } from '../../browser-manager';
import { resolveTribunalRoutes } from '../../pje/tribunal-urls';

export const pjeBrowserUse: Skill = {
    nome: 'pje_browser_use',
    descricao:
        'Prepara o Chrome PJe (porta 19222) para automação via MCP browser-use. ' +
        'Após executar, use as tools MCP browser__* para navegar, preencher formulários, ' +
        'consultar processos, baixar documentos e realizar ações no PJe.',
    categoria: 'pje',

    parametros: {
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA, TRF1). Retorna a URL de login correspondente.',
            obrigatorio: false,
            default: '',
        },
    },

    retorno:
        'Confirmação de que o Chrome PJe está pronto na porta CDP 19222, ' +
        'com URL de login do tribunal para uso pelas tools MCP.',

    exemplos: [
        '{ "skill": "pje_browser_use", "parametros": { "tribunal": "TRT8" } }',
    ],

    async execute(
        params: Record<string, any>,
        _context: AgentContext,
    ): Promise<SkillResult> {
        const tribunal = String(params['tribunal'] || '');
        const routes = resolveTribunalRoutes(tribunal);

        try {
            await ensureBrowser();

            return {
                sucesso: true,
                mensagem:
                    `Chrome PJe pronto na porta 19222 (CDP). ` +
                    `URL de login: ${routes.loginUrl}\n` +
                    `Use as ferramentas MCP browser__* para navegar, preencher formulários ` +
                    `e extrair dados do PJe. O Chrome persiste entre execuções.`,
                dados: {
                    cdpUrl: 'http://localhost:19222',
                    loginUrl: routes.loginUrl,
                    consultaUrl: routes.consultaUrl,
                },
            };
        } catch (err: any) {
            return {
                sucesso: false,
                erro: `Falha ao iniciar Chrome PJe: ${err?.message}`,
            };
        }
    },
};
