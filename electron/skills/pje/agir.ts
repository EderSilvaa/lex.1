/**
 * Skill: pje_agir
 *
 * Executa qualquer ação no browser via Stagehand agent().
 * O agent raciocina sobre a tela atual e executa os passos necessários.
 * Substitui o loop Vision ReAct anterior (vision.ts + navegar.ts + preencher.ts).
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { runBrowserTask } from '../../stagehand-manager';
import { agentEmitter } from '../../agent/loop';

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
            descricao: 'Tribunal alvo (ex: TRT8, TJPA). Usado para dar contexto ao agent.',
            obrigatorio: false,
            default: ''
        },
        maxPassos: {
            tipo: 'number',
            descricao: 'Número máximo de passos do agent (default: 10)',
            obrigatorio: false,
            default: 10
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
        const maxPassos = Number(params['maxPassos'] || 10);

        if (!objetivo) {
            return { sucesso: false, erro: 'Parâmetro "objetivo" obrigatório.', mensagem: 'Informe o que deve ser feito.' };
        }

        // Monta instrução com contexto jurídico
        const instrucao = tribunal
            ? `Contexto: você está operando o sistema ${tribunal} (PJe - Processo Judicial Eletrônico brasileiro).\n\nObjetivo: ${objetivo}`
            : `Contexto: você está operando um sistema judicial brasileiro (PJe).\n\nObjetivo: ${objetivo}`;

        console.log(`[pje_agir] Executando: "${objetivo}" ${tribunal ? `(${tribunal})` : ''}`);

        try {
            const resultado = await runBrowserTask(
                instrucao,
                maxPassos,
                (step) => {
                    // Transmite progresso em tempo real para a UI
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `🌐 ${step}`,
                        iteracao: 0
                    });
                }
            );

            return {
                sucesso: true,
                dados: { resultado },
                mensagem: resultado || 'Ação executada com sucesso no Chrome.'
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
