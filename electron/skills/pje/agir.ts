/**
 * Skill: pje_agir
 *
 * Motor principal de navegacao PJe via browser-use (DOM-based, LLM-agnostico).
 * Fallback automatico para runBrowserTask (vision) se browser-use nao estiver disponivel.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { injectOverlay } from '../../browser-manager';
import { agentEmitter } from '../../agent/loop';
import { runBrowserUseTask } from '../../browser/browser-use-executor';
import { buildPjeActionGuidance } from '../../pje/action-guidance';

export const pjeAgir: Skill = {
    nome: 'pje_agir',
    descricao: 'Executa acoes no browser (Chrome) em linguagem natural: navegar no PJe, clicar, preencher formularios, extrair dados de processos judiciais. Use para interacoes com o sistema judicial. Nao usar para operacoes no sistema de arquivos local do computador.',
    categoria: 'pje',

    parametros: {
        objetivo: {
            tipo: 'string',
            descricao: 'O que deve ser feito em linguagem natural. Ex: "navegar para peticionamento novo processo", "preencher campo Jurisdicao com Belem", "clicar em Pesquisar"',
            obrigatorio: true,
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA). Usado para dar contexto ao agent e para selector-memory.',
            obrigatorio: false,
            default: '',
        },
        maxPassos: {
            tipo: 'number',
            descricao: 'Numero maximo de passos do agent (default: 15)',
            obrigatorio: false,
            default: 15,
        },
    },

    retorno: 'Resultado da acao: o que foi feito, dados extraidos ou status.',

    exemplos: [
        '{ "skill": "pje_agir", "parametros": { "objetivo": "navegar para peticionamento novo processo", "tribunal": "TRT8" } }',
        '{ "skill": "pje_agir", "parametros": { "objetivo": "preencher campo Jurisdicao com Belem" } }',
        '{ "skill": "pje_agir", "parametros": { "objetivo": "clicar em Pesquisar e extrair os resultados" } }',
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const objetivo = String(params['objetivo'] || '');
        const tribunal = String(params['tribunal'] || '');
        const maxPassos = Number(params['maxPassos'] || 15);

        if (!objetivo) {
            return { sucesso: false, erro: 'Parametro "objetivo" obrigatorio.', mensagem: 'Informe o que deve ser feito.' };
        }

        const guidance = await buildPjeActionGuidance(objetivo);
        const baseInstrucao = tribunal
            ? `Contexto: voce esta operando o sistema ${tribunal} (PJe - Processo Judicial Eletronico brasileiro).\n\nObjetivo: ${objetivo}`
            : `Contexto: voce esta operando um sistema judicial brasileiro (PJe).\n\nObjetivo: ${objetivo}`;
        const extraGuidance = guidance.guidanceText
            ? guidance.guidanceText.replace(objetivo, 'Leitura contextual da tela atual')
            : '';
        const instrucao = extraGuidance ? `${baseInstrucao}\n\n${extraGuidance}` : baseInstrucao;

        console.log(`[pje_agir] Executando via browser-use: "${objetivo}" ${tribunal ? `(${tribunal})` : ''}`);

        try {
            const result = await runBrowserUseTask({
                task: instrucao,
                ...(tribunal ? { tribunal } : {}),
                context: 'pje_agir',
                ...(guidance.environment ? { environment: guidance.environment } : {}),
                maxSteps: maxPassos,
                onStep: (step) => {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `[PJe Agir] ${step.description}`,
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
                mensagem: result.result || 'Acao executada com sucesso no Chrome.',
                ...(result.captcha ? { aviso: 'CAPTCHA detectado - pode precisar de intervencao manual.' } : {}),
            };
        } catch (error: any) {
            console.error('[pje_agir] Erro:', error.message);
            return {
                sucesso: false,
                erro: error.message,
                mensagem: `Erro ao executar acao no browser: ${error.message}`,
            };
        }
    },
};

export default pjeAgir;
