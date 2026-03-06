/**
 * Crypto Store
 *
 * Criptografia de dados sensíveis (API keys) usando AES-256-GCM.
 * Chave derivada da máquina via scrypt — sem segredo hardcoded.
 * Usa apenas node:crypto (zero dependências extras).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import * as os from 'os';

// Formato de dado criptografado: "iv:tag:encrypted" (tudo hex)
const ENCRYPTED_PREFIX = 'enc:v1:';
const KEY_LEN = 32; // AES-256
const IV_LEN = 16;
const TAG_LEN = 16;

/**
 * Deriva chave de criptografia da máquina (hostname + username).
 * Não é perfeita contra acesso físico, mas protege contra leitura passiva de arquivos.
 */
function deriveKey(): Buffer {
    const machineId = `${os.hostname()}-${os.userInfo().username}`;
    const salt = Buffer.from('lex-crypto-salt-v1', 'utf8');
    return scryptSync(machineId, salt, KEY_LEN);
}

/**
 * Criptografa um texto simples.
 * Retorna string no formato: "enc:v1:ivHex:tagHex:encryptedHex"
 */
export function encryptApiKey(plaintext: string): string {
    const key = deriveKey();
    const iv = randomBytes(IV_LEN);

    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descriptografa um valor armazenado.
 * Lança erro se o formato for inválido ou a autenticação falhar.
 */
export function decryptApiKey(stored: string): string {
    if (!isEncrypted(stored)) {
        throw new Error('Valor não está no formato criptografado');
    }

    const withoutPrefix = stored.slice(ENCRYPTED_PREFIX.length);
    const parts = withoutPrefix.split(':');

    if (parts.length !== 3) {
        throw new Error('Formato de dado criptografado inválido');
    }

    const [ivHex, tagHex, encHex] = parts;
    const key = deriveKey();
    const iv = Buffer.from(ivHex!, 'hex');
    const tag = Buffer.from(tagHex!, 'hex');
    const encryptedData = Buffer.from(encHex!, 'hex');

    if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
        throw new Error('Tamanho de IV ou tag inválido');
    }

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
    ]);

    return decrypted.toString('utf8');
}

/**
 * Verifica se um valor já está no formato criptografado.
 * Usado para migração automática de keys antigas (plain text).
 */
export function isEncrypted(value: string): boolean {
    return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Tenta descriptografar, retornando o valor original se não estiver criptografado.
 * Útil para migração transparente de dados legados.
 */
export function safeDecrypt(stored: string): string {
    if (!stored) return stored;
    if (!isEncrypted(stored)) return stored; // legado: retorna plain

    try {
        return decryptApiKey(stored);
    } catch (e: any) {
        console.error('[CryptoStore] Falha ao descriptografar:', e.message);
        return stored; // fallback: retorna como está
    }
}
