/**
 * Skill: pc_agir
 *
 * Controla o PC inteiro em linguagem natural via Vision AI + nut-js.
 * Tira screenshots, Claude analisa, executa mouse/teclado — repete até concluir.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { runComputerTask, takeScreenshot, getDisplayInfo } from '../../computer-manager';
import { agentEmitter } from '../../agent/loop';

export const pcAgir: Skill = {
    nome: 'pc_agir',
    descricao: 'Controla o PC em linguagem natural usando Vision AI: abrir programas, clicar, digitar, organizar janelas, interagir com qualquer aplicativo. Use quando a tarefa não puder ser feita com ferramentas de filesystem ou browser.',
    categoria: 'pc',

    parametros: {
        objetivo: {
            tipo: 'string',
            descricao: 'O que deve ser feito no PC, em linguagem natural. Ex: "abra o Bloco de Notas e escreva um cabeçalho", "salve o documento Word aberto", "tire um screenshot e descreva o que está na tela"',
            obrigatorio: true
        },
        maxPassos: {
            tipo: 'number',
            descricao: 'Número máximo de passos do Vision loop (default: 15)',
            obrigatorio: false,
            default: 15
        }
    },

    retorno: 'Descrição do que foi feito e resultado final.',

    exemplos: [
        '{ "skill": "pc_agir", "parametros": { "objetivo": "abra o Bloco de Notas e escreva \'Relatório LEX\'" } }',
        '{ "skill": "pc_agir", "parametros": { "objetivo": "o que está aberto na tela agora?" } }',
        '{ "skill": "pc_agir", "parametros": { "objetivo": "pressione Ctrl+S para salvar o arquivo atual" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const objetivo = String(params['objetivo'] || '').trim();
        const maxPassos = Number(params['maxPassos'] || 15);

        if (!objetivo) {
            return { sucesso: false, erro: 'Parâmetro "objetivo" obrigatório.', mensagem: 'Informe o que deve ser feito no PC.' };
        }

        // Caso especial: apenas ver a tela (screenshot + descrição)
        const isObservation = /^(o que|descreva|veja|screenshot|capture|o que está|o que tem)/i.test(objetivo);
        if (isObservation) {
            return await capturarEDescrever(objetivo);
        }

        console.log(`[pc_agir] Executando: "${objetivo}"`);

        try {
            const resultado = await runComputerTask(
                objetivo,
                maxPassos,
                (step) => {
                    agentEmitter.emit('agent-event', {
                        type: 'thinking',
                        pensamento: `🖥️ ${step}`,
                        iteracao: 0
                    });
                }
            );

            return {
                sucesso: true,
                dados: { resultado, objetivo },
                mensagem: resultado
            };
        } catch (error: any) {
            console.error('[pc_agir] Erro:', error.message);
            return {
                sucesso: false,
                erro: error.message,
                mensagem: `Erro ao controlar PC: ${error.message}`
            };
        }
    }
};

/**
 * Tira screenshot e pede para Claude descrever o que está na tela
 */
async function capturarEDescrever(objetivo: string): Promise<SkillResult> {
    try {
        agentEmitter.emit('agent-event', {
            type: 'thinking',
            pensamento: '🖥️ Capturando tela...',
            iteracao: 0
        });

        const { buffer } = await takeScreenshot(1280);
        const { callAIWithVision } = await import('../../ai-handler');

        const descricao = await callAIWithVision({
            system: 'Você é um assistente que descreve o conteúdo de screenshots de PC Windows. Seja objetivo e detalhado: liste programas abertos, janelas visíveis, conteúdo relevante.',
            user: objetivo || 'Descreva detalhadamente o que está na tela.',
            imageBase64: buffer.toString('base64'),
            mediaType: 'image/png',
            temperature: 0.3,
            maxTokens: 800
        });

        const display = getDisplayInfo();

        return {
            sucesso: true,
            dados: { descricao, resolucao: `${display.width}x${display.height}` },
            mensagem: descricao
        };
    } catch (error: any) {
        return {
            sucesso: false,
            erro: error.message,
            mensagem: `Erro ao capturar tela: ${error.message}`
        };
    }
}

export default pcAgir;
