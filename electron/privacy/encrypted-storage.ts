/**
 * Encrypted Storage — Criptografia em Repouso
 *
 * Wrapper sobre crypto-store.ts para criptografar/descriptografar
 * arquivos inteiros (sessions.json, memory.json, doc-index.json).
 *
 * Usa AES-256-GCM com chave derivada da máquina (mesmo esquema das API keys).
 */

import * as fs from 'fs';
import * as path from 'path';
import { encryptApiKey, safeDecrypt, isEncrypted } from '../crypto-store';

// Prefixo para identificar arquivos criptografados por este módulo
const FILE_PREFIX = 'LEX_ENC_V1:';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Salva dados criptografados em arquivo.
 */
export function saveEncrypted(filePath: string, data: any): void {
    const json = JSON.stringify(data);
    const encrypted = encryptApiKey(json);
    const content = FILE_PREFIX + encrypted;

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Carrega dados de arquivo criptografado.
 * Suporta migração automática de arquivos plaintext existentes.
 */
export function loadEncrypted<T = any>(filePath: string, fallback: T): T {
    try {
        if (!fs.existsSync(filePath)) return fallback;

        const raw = fs.readFileSync(filePath, 'utf-8');

        // Arquivo já criptografado por nós
        if (raw.startsWith(FILE_PREFIX)) {
            const encryptedPart = raw.slice(FILE_PREFIX.length);
            const json = safeDecrypt(encryptedPart);
            if (!json) {
                console.warn('[EncryptedStorage] Falha ao descriptografar:', filePath);
                return fallback;
            }
            return JSON.parse(json) as T;
        }

        // Arquivo plaintext (legado) — tenta parsear e re-salvar criptografado
        const parsed = JSON.parse(raw) as T;
        console.log(`[EncryptedStorage] Migrando para criptografado: ${filePath}`);
        saveEncrypted(filePath, parsed);
        return parsed;

    } catch (e: any) {
        console.warn('[EncryptedStorage] Falha ao carregar:', filePath, e.message);
        return fallback;
    }
}

/**
 * Verifica se um arquivo está criptografado.
 */
export function isFileEncrypted(filePath: string): boolean {
    try {
        if (!fs.existsSync(filePath)) return false;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return raw.startsWith(FILE_PREFIX);
    } catch {
        return false;
    }
}

/**
 * Deleta um arquivo de forma segura (sobrescreve com zeros antes de deletar).
 * LGPD — direito de exclusão.
 */
export function secureDelete(filePath: string): boolean {
    try {
        if (!fs.existsSync(filePath)) return false;

        // Sobrescreve com dados aleatórios antes de deletar
        const stat = fs.statSync(filePath);
        const zeros = Buffer.alloc(stat.size, 0);
        fs.writeFileSync(filePath, zeros);
        fs.unlinkSync(filePath);

        console.log(`[EncryptedStorage] Arquivo deletado com segurança: ${filePath}`);
        return true;
    } catch (e: any) {
        console.warn('[EncryptedStorage] Falha ao deletar:', filePath, e.message);
        return false;
    }
}
