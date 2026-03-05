/**
 * Skill: pje_navegar
 *
 * Navega dentro do PJe para uma área/menu/ação via Stagehand agent.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { runBrowserTask } from '../../stagehand-manager';

export const pjeNavegar: Skill = {
    nome: 'pje_navegar',
    descricao: 'Navega dentro do PJe para uma área, aba ou menu em linguagem natural.',
    categoria: 'pje',

    parametros: {
        destino: {
            tipo: 'string',
            descricao: 'Destino desejado (ex: "Processo > Peticionamento > Novo Processo", "painel", "meus processos").',
            obrigatorio: true
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA).',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Confirmação de navegação ou descrição da tela atual.',

    exemplos: [
        '{ "skill": "pje_navegar", "parametros": { "destino": "Processo > Peticionamento > Novo Processo", "tribunal": "TRT8" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const destino = String(params['destino'] || '').trim();
        const tribunal = String(params['tribunal'] || '');

        if (!destino) {
            return { sucesso: false, erro: 'Destino obrigatório.', mensagem: 'Informe o destino da navegação.' };
        }

        const instrucao = `
Você está no PJe ${tribunal ? `(${tribunal})` : '(sistema judicial brasileiro)'}.

Objetivo: Navegar até "${destino}".

- Analise a tela atual e identifique como chegar ao destino
- Clique nos menus, abas ou links necessários
- Se houver menu hamburger ou menu lateral recolhido, abra-o primeiro
- Confirme que chegou ao destino correto
        `.trim();

        console.log(`[pje_navegar] Destino: "${destino}" ${tribunal ? `(${tribunal})` : ''}`);

        try {
            const resultado = await runBrowserTask(instrucao, 15);
            return {
                sucesso: true,
                dados: { destino, tribunal, resultado },
                mensagem: resultado
            };
        } catch (error: any) {
            console.error('[pje_navegar] Erro:', error.message);
            return { sucesso: false, erro: error.message, mensagem: `Erro ao navegar: ${error.message}` };
        }
    }
};

export default pjeNavegar;
