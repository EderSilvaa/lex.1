/**
 * Skill: pje_movimentacoes
 *
 * Extrai as movimentações do processo exibido na tela atual do PJe via browser-use.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser } from '../../browser-manager';
import { runBrowserUseTask } from '../../browser/browser-use-executor';

export const pjeMovimentacoes: Skill = {
    nome: 'pje_movimentacoes',
    descricao: 'Lista as movimentações processuais do processo aberto na tela atual do PJe. Use após consultar ou abrir um processo.',
    categoria: 'pje',

    parametros: {
        limite: {
            tipo: 'number',
            descricao: 'Número máximo de movimentações a retornar (default: 10)',
            obrigatorio: false,
            default: 10
        },
        numero: {
            tipo: 'string',
            descricao: 'Número do processo (opcional, para contexto)',
            obrigatorio: false,
            default: ''
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA). Usado para contexto.',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Lista de movimentações: data, tipo, descrição.',

    exemplos: [
        '{ "skill": "pje_movimentacoes", "parametros": { "limite": 10 } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const limite = Number(params['limite'] || 10);
        const numero = String(params['numero'] || '');
        const tribunal = String(params['tribunal'] || '');

        console.log(`[pje_movimentacoes] Extraindo movimentações${numero ? ` do processo ${numero}` : ''}`);

        const instrucao = `
Você está visualizando um processo no PJe${tribunal ? ` (${tribunal.toUpperCase()})` : ''}${numero ? ` — processo ${numero}` : ''}.

Objetivo: Extrair as últimas ${limite} movimentações processuais.

- Localize a aba ou seção de movimentações/andamentos (pode estar em "Movimentações", "Andamentos", "Timeline" ou similar, inclusive dentro de iframes)
- Clique nela se necessário para expandir
- Liste as ${limite} movimentações mais recentes com: data, tipo de movimentação e descrição completa
- Retorne em formato estruturado ordenado por data (mais recente primeiro)
        `.trim();

        try {
            await ensureBrowser();
            const res = await runBrowserUseTask({
                task: instrucao,
                tribunal,
                context: 'pje_movimentacoes',
                maxSteps: 15,
            });
            return {
                sucesso: res.success,
                dados: { numero, limite, resultado: res.result },
                mensagem: res.result || 'Movimentações extraídas.',
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message, mensagem: `Erro ao extrair movimentações: ${error.message}` };
        }
    }
};

export default pjeMovimentacoes;
