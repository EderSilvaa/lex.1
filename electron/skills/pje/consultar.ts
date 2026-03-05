/**
 * Skill: pje_consultar
 *
 * Consulta processo no PJe via Stagehand agent.
 * Navega para a tela de consulta, preenche o número e extrai os dados.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { runBrowserTask } from '../../stagehand-manager';
import { resolveTribunalRoutes } from '../../pje/tribunal-urls';

export const pjeConsultar: Skill = {
    nome: 'pje_consultar',
    descricao: 'Consulta informações de um processo no PJe. Navega até a tela de consulta, preenche o número e extrai os dados.',
    categoria: 'pje',

    parametros: {
        numero: {
            tipo: 'string',
            descricao: 'Número do processo (formato CNJ: NNNNNNN-NN.NNNN.N.NN.NNNN)',
            obrigatorio: true
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA, TRF1).',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Dados do processo: partes, classe, assunto, movimentações recentes.',

    exemplos: [
        '{ "skill": "pje_consultar", "parametros": { "numero": "0801234-56.2024.8.14.0301", "tribunal": "TJPA" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const numero = String(params['numero'] || '').trim();
        const tribunal = String(params['tribunal'] || '');

        if (!numero) {
            return { sucesso: false, erro: 'Número do processo obrigatório.', mensagem: 'Informe o número do processo.' };
        }

        const routes = resolveTribunalRoutes(tribunal);
        const consultaUrl = routes.consultaUrl ?? routes.loginUrl;

        const instrucao = `
Você está no sistema PJe (Processo Judicial Eletrônico) do ${tribunal || 'tribunal brasileiro'}.

Objetivo: Consultar o processo número ${numero}.

Passos:
1. Se não estiver na tela de consulta de processos, navegue até ela (URL de referência: ${consultaUrl})
2. Localize o campo de número do processo e preencha com: ${numero}
3. Clique em Pesquisar (ou botão equivalente)
4. Aguarde os resultados carregarem
5. Clique no processo encontrado para abrir os detalhes
6. Extraia e retorne: número do processo, partes (polo ativo e passivo), classe processual, assunto, status atual, última movimentação e data da próxima audiência (se houver)

Retorne os dados em formato JSON estruturado.
        `.trim();

        console.log(`[pje_consultar] Consultando processo ${numero} no ${tribunal || 'PJe'}`);

        try {
            const resultado = await runBrowserTask(instrucao, 20);
            return {
                sucesso: true,
                dados: { numero, tribunal, resultado },
                mensagem: resultado
            };
        } catch (error: any) {
            console.error('[pje_consultar] Erro:', error.message);
            return { sucesso: false, erro: error.message, mensagem: `Erro ao consultar processo: ${error.message}` };
        }
    }
};

export default pjeConsultar;
