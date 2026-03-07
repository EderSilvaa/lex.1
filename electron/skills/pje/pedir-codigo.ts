/**
 * Skill: pedir_codigo_totp
 *
 * Pausa a execução do agente e pede ao usuário o código TOTP
 * do Google Authenticator via Telegram (ou UI).
 *
 * O agente usa esta skill quando detecta que o PJe está pedindo
 * autenticação de dois fatores.
 */

import { Skill } from '../../agent/types'
import { requestUserInput } from '../../user-input'

export const pedirCodigoTotp: Skill = {
    nome: 'pedir_codigo_totp',
    descricao: 'Pausa a execução e solicita ao usuário o código de 6 dígitos do Google Authenticator (TOTP). Use quando o PJe exigir autenticação de dois fatores. O agente aguarda a resposta antes de continuar.',
    categoria: 'utils',
    parametros: {
        contexto: {
            tipo: 'string',
            obrigatorio: false,
            descricao: 'Contexto adicional para ajudar o usuário a entender para qual sistema o código é',
            default: 'PJe'
        }
    },
    retorno: 'Código TOTP de 6 dígitos fornecido pelo usuário, disponível em dados.codigo',
    exemplos: [
        '{"skill":"pedir_codigo_totp","parametros":{}}',
        '{"skill":"pedir_codigo_totp","parametros":{"contexto":"TRT8"}}'
    ],

    execute: async (params) => {
        const contexto = params['contexto'] || 'PJe'
        const prompt = `🔐 *Autenticação necessária — ${contexto}*\n\nPreciso do código do Google Authenticator.\n\nEnvie os 6 dígitos agora:`

        try {
            const resposta = await requestUserInput(prompt, 3 * 60 * 1000)
            const codigo = String(resposta).trim().replace(/\s/g, '')

            if (!/^\d{6}$/.test(codigo)) {
                return {
                    sucesso: false,
                    mensagem: `Código inválido: "${codigo}". Deve ser exatamente 6 dígitos numéricos.`,
                    erro: 'Código TOTP inválido'
                }
            }

            return {
                sucesso: true,
                mensagem: `Código TOTP recebido: ${codigo}`,
                dados: { codigo }
            }

        } catch (e: any) {
            return {
                sucesso: false,
                mensagem: 'Usuário não respondeu a tempo (3 min) ou operação foi cancelada.',
                erro: e.message
            }
        }
    }
}
