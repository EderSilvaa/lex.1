/**
 * Skill: pje_agir
 *
 * Motor principal de navegação PJe via browser-use (DOM-based, LLM-agnóstico).
 * Fallback automático para runBrowserTask (vision) se browser-use não estiver disponível.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { injectOverlay } from '../../browser-manager';
import { agentEmitter } from '../../agent/loop';
import { runBrowserUseTask } from '../../browser/browser-use-executor';

export const pjeAgir: Skill = {
    nome: 'pje_agir',
    descricao: 'Executa ações no browser (Chrome) em linguagem natural: navegar no PJe, clicar, preencher formulários, extrair dados de processos judiciais. Use para interações com o sistema judicial. NÃO usar para operações no sistema de arquivos local do computador.',
    categoria: 'pje',

    parametros: {
        objetivo: {
            tipo: 'string',
            descricao: 'O que deve ser feito em linguagem natural. Ex: "navegar para peticionamento novo processo", "preencher campo Jurisdição com Belém", "clicar em Pesquisar"',
            obrigatorio: true
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA). Usado para dar contexto ao agent e para selector-memory.',
            obrigatorio: false,
            default: ''
        },
        maxPassos: {
            tipo: 'number',
            descricao: 'Número máximo de passos do agent (default: 15)',
            obrigatorio: false,
            default: 15
        }
    },

    retorno: 'Resultado da ação: o que foi feito, dados extraídos ou status.',

    exemplos: [
        '{ "skill": "pje_agir", "parametros": { "objetivo": "navegar para peticionamento novo processo", "tribunal": "TRT8" } }',
        '{ "skill": "pje_agir", "parametros": { "objetivo": "preencher campo Jurisdição com Belém" } }',
        '{ "skill": "pje_agir", "parametros": { "objetivo": "clicar em Pesquisar e extrair os resultados" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const objetivo = String(params['objetivo'] || '');
        const tribunal = String(params['tribunal'] || '');
        const maxPassos = Number(params['maxPassos'] || 15);

        if (!objetivo) {
            return { sucesso: false, erro: 'Parâmetro "objetivo" obrigatório.', mensagem: 'Informe o que deve ser feito.' };
        }

        // Monta instrução com contexto jurídico
        const instrucao = tribunal
            ? `Contexto: você está operando o sistema ${tribunal} (PJe - Processo Judicial Eletrônico brasileiro).\n\nObjetivo: ${objetivo}`
            : `Contexto: você está operando um sistema judicial brasileiro (PJe).\n\nObjetivo: ${objetivo}`;

        console.log(`[pje_agir] Executando via browser-use: "${objetivo}" ${tribunal ? `(${tribunal})` : ''}`);

        try {
            const result = await runBrowserUseTask({
                task: instrucao,
                ...(tribunal ? { tribunal } : {}),
                context: 'pje_agir',
                maxSteps: maxPassos,
                onStep: (step) => {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `🌐 ${step.description}`,
                        iteracao: step.step_number,
                    });
                    injectOverlay(step.description.slice(0, 80));
                },
            });

            if (result.usedFallback) {
                console.log('[pje_agir] Usou fallback (vision)');
            }

            return {
                sucesso: result.success,
                dados: { resultado: result.result, steps: result.steps.length, captcha: result.captcha },
                mensagem: result.result || 'Ação executada com sucesso no Chrome.',
                ...(result.captcha ? { aviso: 'CAPTCHA detectado — pode precisar de intervenção manual.' } : {})
            };
        } catch (error: any) {
            console.error('[pje_agir] Erro:', error.message);
            return {
                sucesso: false,
                erro: error.message,
                mensagem: `Erro ao executar ação no browser: ${error.message}`
            };
        }
    }
};

export default pjeAgir;
