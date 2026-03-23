/**
 * Skill: browser_auto_task
 *
 * Executa uma tarefa complexa no browser via vision agent loop (runBrowserTask).
 * Usa screenshot + DOM a cada passo — mais caro e lento, mas lida com telas desconhecidas.
 *
 * Use como FALLBACK quando as skills atômicas (browser_click, browser_fill, etc.)
 * não são suficientes por falta de seletores claros ou layout complexo.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { runBrowserTask, injectOverlay } from '../../browser-manager';
import { agentEmitter } from '../../agent/loop';

export const browserAutoTask: Skill = {
    nome: 'browser_auto_task',
    descricao: 'Executa tarefa complexa no browser usando visão computacional (screenshot + DOM a cada passo). LENTO e CARO — use apenas quando browser_click/fill/type não bastam (tela desconhecida, layout complexo, sem seletores claros).',
    categoria: 'browser',

    parametros: {
        instrucao: {
            tipo: 'string',
            descricao: 'Instrução em linguagem natural do que fazer no browser. Ex: "preencher o formulário de peticionamento com os dados do processo".',
            obrigatorio: true
        },
        maxPassos: {
            tipo: 'number',
            descricao: 'Número máximo de passos do agente visual (default: 10).',
            obrigatorio: false,
            default: 10
        }
    },

    retorno: 'Resultado da tarefa executada pelo agente visual.',

    exemplos: [
        '{ "skill": "browser_auto_task", "parametros": { "instrucao": "navegar pelo menu até Peticionamento > Novo Processo" } }',
        '{ "skill": "browser_auto_task", "parametros": { "instrucao": "preencher todos os campos visíveis do formulário com os dados fornecidos", "maxPassos": 15 } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const instrucao = String(params['instrucao'] || '').trim();
        const maxPassos = Number(params['maxPassos'] || 10);

        if (!instrucao) {
            return { sucesso: false, erro: 'Parâmetro "instrucao" obrigatório.', mensagem: 'Informe o que deve ser feito no browser.' };
        }

        console.log(`[browser_auto_task] Executando: "${instrucao.slice(0, 80)}" (max ${maxPassos} passos)`);

        try {
            const resultado = await runBrowserTask(
                instrucao,
                maxPassos,
                (step) => {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `🌐 ${step}`,
                        iteracao: 0
                    });
                    injectOverlay(step);
                }
            );

            return {
                sucesso: true,
                dados: { resultado },
                mensagem: resultado || 'Tarefa executada com sucesso no browser.'
            };
        } catch (error: any) {
            console.error('[browser_auto_task] Erro:', error.message);
            return {
                sucesso: false,
                erro: error.message,
                mensagem: `Erro ao executar tarefa no browser: ${error.message}`
            };
        }
    }
};

export default browserAutoTask;
