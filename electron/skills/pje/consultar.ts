/**
 * Skill: pje_consultar
 *
 * Consulta processo no PJe via browser-use.
 * Navega para a tela de consulta, preenche o número e extrai os dados.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser } from '../../browser-manager';
import { runBrowserUseTask } from '../../browser/browser-use-executor';
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
        const consultaUrl = routes.consultaUrl;

        console.log(`[pje_consultar] Consultando processo ${numero} em ${consultaUrl}`);

        const instrucao = `
Você está operando o PJe${tribunal ? ` do ${tribunal.toUpperCase()}` : ''} (sistema judicial eletrônico brasileiro).

Passos:
1. Navegue para: ${consultaUrl}
2. Localize o campo de número do processo (pode estar em iframe)
3. Preencha com: ${numero}
4. Clique em Pesquisar ou pressione Enter
5. Aguarde os resultados carregarem
6. Extraia e retorne: partes (autor/réu/advogados), classe processual, assunto, vara/juízo, situação atual e as últimas 5 movimentações com data e descrição
        `.trim();

        try {
            await ensureBrowser();
            const res = await runBrowserUseTask({
                task: instrucao,
                tribunal,
                context: 'pje_consultar',
                maxSteps: 15,
            });

            console.log(`[pje_consultar] Resultado: success=${res.success}, result="${(res.result || '').slice(0, 200)}", steps=${res.steps?.length || 0}, fallback=${(res as any).usedFallback || false}`);

            if (!res.success) {
                return {
                    sucesso: false,
                    erro: res.result || 'browser-use falhou sem mensagem',
                    mensagem: `Falha ao consultar processo ${numero}: ${res.result || 'erro desconhecido'}`,
                };
            }
            return {
                sucesso: true,
                dados: { numero, tribunal, resultado: res.result },
                mensagem: res.result || `Consulta concluída para o processo ${numero}.`,
            };
        } catch (error: any) {
            console.error(`[pje_consultar] Exception:`, error);
            return { sucesso: false, erro: String(error?.message || error), mensagem: `Erro ao consultar processo: ${error?.message || error}` };
        }
    }
};

export default pjeConsultar;
