/**
 * Skill: pje_verificar_token
 *
 * Detecta se o token A3 (certificado digital USB) está conectado ao PC.
 * Usa certutil -scinfo do Windows para enumerar leitores de smart card.
 */

import { exec } from 'child_process'
import { Skill } from '../../agent/types'

async function detectarToken(): Promise<{ conectado: boolean; leitor?: string; cartaoPresente?: boolean }> {
    return new Promise((resolve) => {
        exec('certutil -scinfo', { timeout: 8000 }, (err, stdout) => {
            if (err || !stdout) {
                resolve({ conectado: false })
                return
            }

            const out = stdout.toLowerCase()
            const temLeitor = out.includes('reader') || out.includes('leitor') || out.includes('smart card')

            if (!temLeitor) {
                resolve({ conectado: false })
                return
            }

            // Leitor detectado mas sem cartão inserido
            const semCartao = out.includes('no card') || out.includes('não há') || out.includes('not present')

            const leitorMatch = stdout.match(/Reader(?:\s+name)?[\s:]+([^\r\n]+)/i)
            const leitor = leitorMatch?.[1]?.trim()

            resolve({ conectado: true, leitor, cartaoPresente: !semCartao })
        })
    })
}

export const pjeVerificarToken: Skill = {
    nome: 'pje_verificar_token',
    descricao: 'Verifica se o token A3 (certificado digital USB) está conectado e com cartão inserido. Use antes de tentar login com certificado no PJe.',
    categoria: 'pje',
    parametros: {},
    retorno: 'Status do token: conectado (boolean), leitor (nome do dispositivo), cartaoPresente (boolean)',
    exemplos: ['{"skill":"pje_verificar_token","parametros":{}}'],

    execute: async () => {
        const status = await detectarToken()

        if (!status.conectado) {
            return {
                sucesso: false,
                mensagem: '❌ Token A3 não detectado. Conecte o token USB ao computador e tente novamente.',
                dados: { tokenConectado: false }
            }
        }

        if (!status.cartaoPresente) {
            return {
                sucesso: false,
                mensagem: `⚠️ Leitor "${status.leitor || 'desconhecido'}" encontrado, mas sem token inserido.`,
                dados: { tokenConectado: true, cartaoPresente: false, leitor: status.leitor }
            }
        }

        return {
            sucesso: true,
            mensagem: `✅ Token A3 pronto. Leitor: ${status.leitor || 'detectado'}`,
            dados: { tokenConectado: true, cartaoPresente: true, leitor: status.leitor }
        }
    }
}
