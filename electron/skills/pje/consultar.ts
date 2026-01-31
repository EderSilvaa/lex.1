/**
 * Skill: pje_consultar
 *
 * Consulta processo no PJe usando Playwright.
 * Requer HITL para login com certificado.
 */

import { Skill, SkillResult, AgentContext } from '../../agent/types';
import { getPJeExecutor } from '../../pje';
import { CONSULTA_SELECTORS } from '../../pje/selectors';

export const pjeConsultar: Skill = {
    nome: 'pje_consultar',
    descricao: 'Consulta informações de um processo no PJe. Requer que o usuário faça login com certificado digital.',
    categoria: 'pje',

    parametros: {
        numero: {
            tipo: 'string',
            descricao: 'Número do processo (formato CNJ: NNNNNNN-NN.NNNN.N.NN.NNNN)',
            obrigatorio: true
        },
        tribunal: {
            tipo: 'string',
            descricao: 'Tribunal (ex: TJPA, TRT8)',
            obrigatorio: false,
            default: 'TJPA'
        }
    },

    retorno: 'Dados do processo: número, classe, assunto, partes, status',

    exemplos: [
        'Consulte o processo 0801234-56.2024.8.14.0301',
        'Busque informações do processo número 123456'
    ],

    async execute(params: Record<string, any>, context: AgentContext): Promise<SkillResult> {
        const { numero, tribunal = 'TJPA' } = params;

        console.log(`[Skill:pje_consultar] Consultando: ${numero}`);

        const executor = getPJeExecutor();

        try {
            // Verificar conexão
            if (!executor.isConnected()) {
                // Tentar abrir Chrome e conectar
                console.log('[Skill:pje_consultar] Abrindo Chrome...');
                await executor.launchChrome();

                // Aguardar um pouco
                await new Promise(r => setTimeout(r, 3000));

                // Tentar conectar
                const connected = await executor.connect();

                if (!connected) {
                    return {
                        sucesso: false,
                        erro: 'Não foi possível conectar ao Chrome. Certifique-se de que o Chrome está aberto com o PJe.',
                        mensagem: 'Por favor, abra o Chrome e acesse o PJe para eu poder consultar o processo.'
                    };
                }
            }

            // Verificar login
            if (!executor.isReady()) {
                // Aguardar login do usuário
                console.log('[Skill:pje_consultar] Aguardando login...');

                const loggedIn = await executor.waitForLogin(60000);

                if (!loggedIn) {
                    return {
                        sucesso: false,
                        erro: 'Usuário não fez login no PJe',
                        mensagem: 'Por favor, faça login no PJe com seu certificado digital para eu poder consultar o processo.'
                    };
                }
            }

            // Navegar para consulta
            await executor.executeAction({
                type: 'navigate',
                url: `https://pje.${tribunal.toLowerCase()}.jus.br/pje/ConsultaPublica/listView.seam`
            });

            // Preencher número do processo
            await executor.executeAction({
                type: 'fill',
                selector: CONSULTA_SELECTORS.inputNumero[0] || '#inputNumeroProcesso',
                value: numero,
                visualDescription: 'Campo de número do processo',
                textDescription: 'Campo para digitar o número do processo'
            });

            // Clicar em pesquisar
            await executor.executeAction({
                type: 'click',
                selector: CONSULTA_SELECTORS.btnPesquisar[0] || 'button[type="submit"]',
                visualDescription: 'Botão de pesquisar',
                textDescription: 'Botão para iniciar a pesquisa'
            });

            // Aguardar resultado
            await executor.executeAction({
                type: 'wait',
                milliseconds: 2000
            });

            // Tentar clicar no link do processo
            await executor.executeAction({
                type: 'click',
                selector: CONSULTA_SELECTORS.linkProcesso[0] || 'a[class*="processo"]',
                visualDescription: 'Link do processo nos resultados'
            });

            // Aguardar carregar
            await executor.executeAction({
                type: 'wait',
                milliseconds: 2000
            });

            // Capturar screenshot para análise (opcional)
            const screenshot = await executor.executeAction({
                type: 'screenshot'
            });

            return {
                sucesso: true,
                dados: {
                    numero,
                    tribunal,
                    consultado: true,
                    screenshot: screenshot.data
                },
                mensagem: `Processo ${numero} consultado. A página do processo está aberta no Chrome.`
            };

        } catch (error: any) {
            console.error('[Skill:pje_consultar] Erro:', error.message);
            return {
                sucesso: false,
                erro: error.message,
                mensagem: `Não consegui consultar o processo: ${error.message}`
            };
        }
    }
};

export default pjeConsultar;
