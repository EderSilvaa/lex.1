/**
 * Skill: pje_movimentacoes
 *
 * Extrai as movimentações do processo exibido na tela atual do PJe via browser agent.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { runBrowserTask } from '../../browser-manager';

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
        }
    },

    retorno: 'Lista de movimentações: data, tipo, descrição.',

    exemplos: [
        '{ "skill": "pje_movimentacoes", "parametros": { "limite": 10 } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const limite = Number(params['limite'] || 10);
        const numero = String(params['numero'] || '');

        const instrucao = `
Você está visualizando um processo no PJe (sistema judicial brasileiro)${numero ? ` (processo ${numero})` : ''}.

Objetivo: Extrair as últimas ${limite} movimentações processuais.

- Localize a aba ou seção de movimentações/andamentos (pode estar em "Movimentações", "Andamentos", "Timeline" ou similar)
- Clique nela se necessário para expandir
- Liste as ${limite} movimentações mais recentes: data, tipo de movimentação, descrição completa
- Retorne em formato estruturado (JSON ou lista ordenada por data)
        `.trim();

        console.log(`[pje_movimentacoes] Extraindo movimentações${numero ? ` do processo ${numero}` : ''}`);

        try {
            const resultado = await runBrowserTask(instrucao, 15);
            return { sucesso: true, dados: { numero, limite, resultado }, mensagem: resultado };
        } catch (error: any) {
            return { sucesso: false, erro: error.message, mensagem: `Erro ao extrair movimentações: ${error.message}` };
        }
    }
};

export default pjeMovimentacoes;
