/**
 * Skill: pje_documentos
 *
 * Extrai os documentos do processo exibido na tela atual do PJe via Stagehand agent.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { runBrowserTask } from '../../stagehand-manager';

export const pjeDocumentos: Skill = {
    nome: 'pje_documentos',
    descricao: 'Lista os documentos do processo aberto na tela atual do PJe. Use após abrir um processo.',
    categoria: 'pje',

    parametros: {
        numero: {
            tipo: 'string',
            descricao: 'Número do processo (opcional, para contexto)',
            obrigatorio: false,
            default: ''
        }
    },

    retorno: 'Lista de documentos do processo: nome, tipo, data.',

    exemplos: [
        '{ "skill": "pje_documentos", "parametros": { "numero": "0801234-56.2024.8.14.0301" } }'
    ],

    async execute(params: Record<string, any>, _context: AgentContext): Promise<SkillResult> {
        const numero = String(params['numero'] || '');

        const instrucao = `
Você está visualizando um processo no PJe (sistema judicial brasileiro)${numero ? ` (processo ${numero})` : ''}.

Objetivo: Extrair a lista de documentos do processo.

- Localize a aba ou seção de documentos (pode estar em "Documentos", "Peças", "Anexos" ou similar)
- Clique nela se necessário para expandir
- Liste todos os documentos visíveis: nome/tipo, data de inclusão, quem enviou
- Retorne em formato estruturado (JSON ou lista clara)
        `.trim();

        console.log(`[pje_documentos] Extraindo documentos${numero ? ` do processo ${numero}` : ''}`);

        try {
            const resultado = await runBrowserTask(instrucao, 15);
            return { sucesso: true, dados: { numero, resultado }, mensagem: resultado };
        } catch (error: any) {
            return { sucesso: false, erro: error.message, mensagem: `Erro ao extrair documentos: ${error.message}` };
        }
    }
};

export default pjeDocumentos;
