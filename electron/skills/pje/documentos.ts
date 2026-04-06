/**
 * Skill: pje_documentos
 *
 * Extrai os documentos do processo exibido na tela atual do PJe via browser-use.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { ensureBrowser } from '../../browser-manager';
import { runBrowserUseTask } from '../../browser/browser-use-executor';

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
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal alvo (ex: TRT8, TJPA). Usado para contexto.',
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
        const tribunal = String(params['tribunal'] || '');

        console.log(`[pje_documentos] Extraindo documentos${numero ? ` do processo ${numero}` : ''}`);

        const instrucao = `
Você está visualizando um processo no PJe${tribunal ? ` (${tribunal.toUpperCase()})` : ''}${numero ? ` — processo ${numero}` : ''}.

Objetivo: Extrair a lista completa de documentos/peças do processo.

- Localize a aba ou seção de documentos (pode estar em "Documentos", "Peças", "Anexos" ou similar, inclusive dentro de iframes)
- Clique nela se necessário para expandir
- Liste todos os documentos visíveis: nome/tipo, data de inclusão, quem enviou
- Retorne em formato estruturado (lista ordenada)
        `.trim();

        try {
            await ensureBrowser();
            const res = await runBrowserUseTask({
                task: instrucao,
                tribunal,
                context: 'pje_documentos',
                maxSteps: 15,
            });
            return {
                sucesso: res.success,
                dados: { numero, resultado: res.result },
                mensagem: res.result || 'Documentos extraídos.',
            };
        } catch (error: any) {
            return { sucesso: false, erro: error.message, mensagem: `Erro ao extrair documentos: ${error.message}` };
        }
    }
};

export default pjeDocumentos;
