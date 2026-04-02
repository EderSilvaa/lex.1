/**
 * LEX Brain — Singleton + Migration
 *
 * initBrain(userDataDir):
 *   1. Descriptografa lex-brain.db.enc → lex-brain.db (se existir)
 *   2. Abre BrainStore (aplica schema + migrations)
 *   3. Migra dados de lex-agent-memory.json + pje-selector-memory.json (uma vez)
 *
 * closeBrain():
 *   1. Fecha SQLite
 *   2. Criptografa lex-brain.db → lex-brain.db.enc
 *   3. Deleta lex-brain.db (plaintext)
 *
 * getBrain() / getBrainSafe(): acesso ao singleton.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { BrainStore } from './brain-store';
import { initBrainWatcher, stopBrainWatcher } from './brain-md-watcher';
import { loadEncrypted } from '../privacy/encrypted-storage';
import type { MemoriaData } from '../agent/memory';
import type { CrossSessionFact } from '../agent/types';

// ============================================================================
// CONSTANTS
// ============================================================================

const DB_NAME = 'lex-brain.db';
const DB_ENC_NAME = 'lex-brain.db.enc';
const LEGACY_MEMORY_FILE = 'lex-agent-memory.json';
const LEGACY_SELECTOR_FILE = 'pje-selector-memory.json';

// AES-256-GCM for file-level encryption (same pattern as crypto-store)
const ENC_ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;

// ============================================================================
// SINGLETON STATE
// ============================================================================

let _brain: BrainStore | null = null;
let _dbPath: string | null = null;
let _encPath: string | null = null;
let _userDataDir: string | null = null;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Inicializa o Brain. Chamado uma vez no boot (main.ts).
 * Retorna o BrainStore pronto para uso.
 */
export function initBrain(userDataDir: string): BrainStore {
    if (_brain) return _brain;

    _userDataDir = userDataDir;
    _dbPath = path.join(userDataDir, DB_NAME);
    _encPath = path.join(userDataDir, DB_ENC_NAME);

    // 1. Decrypt .enc → .db se existir
    if (fs.existsSync(_encPath) && !fs.existsSync(_dbPath)) {
        try {
            decryptDbFile(_encPath, _dbPath, userDataDir);
            console.log('[Brain] DB descriptografado com sucesso');
        } catch (err) {
            console.error('[Brain] Falha ao descriptografar DB, criando novo:', err);
        }
    }

    // 2. Open BrainStore
    _brain = new BrainStore(_dbPath);
    console.log('[Brain] Inicializado:', _dbPath);

    // 3. Migration from legacy JSON (one-time)
    const migrationDone = _brain.getMetadata('migration_v0_done');
    if (migrationDone !== '1') {
        try {
            migrateFromLegacy(_brain, userDataDir);
            _brain.setMetadata('migration_v0_done', '1');
            console.log('[Brain] Migração v0 concluída');
        } catch (err) {
            console.error('[Brain] Erro na migração (continuando sem migrar):', err);
        }
    }

    // Inicia file watcher para sync Markdown → SQLite
    initBrainWatcher(_brain);

    return _brain;
}

/** Retorna o BrainStore ou lança erro se não inicializado. */
export function getBrain(): BrainStore {
    if (!_brain) throw new Error('[Brain] Chame initBrain() antes de usar');
    return _brain;
}

/** Retorna o BrainStore ou null — para uso em fallbacks (loop.ts). */
export function getBrainSafe(): BrainStore | null {
    return _brain;
}

/**
 * Fecha o Brain. Chamado no app quit.
 * Fecha SQLite, criptografa .db → .enc, deleta .db plaintext.
 */
export function closeBrain(): void {
    if (!_brain || !_dbPath || !_encPath || !_userDataDir) return;

    stopBrainWatcher();

    try {
        _brain.close();
        console.log('[Brain] SQLite fechado');

        // Encrypt .db → .enc
        if (fs.existsSync(_dbPath)) {
            encryptDbFile(_dbPath, _encPath, _userDataDir);
            // Delete plaintext
            fs.unlinkSync(_dbPath);
            // Also remove WAL/SHM if present
            const walPath = _dbPath + '-wal';
            const shmPath = _dbPath + '-shm';
            if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
            if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
            console.log('[Brain] DB criptografado e plaintext removido');
        }
    } catch (err) {
        console.error('[Brain] Erro ao fechar/criptografar:', err);
    }

    _brain = null;
    _dbPath = null;
    _encPath = null;
}

// ============================================================================
// FILE-LEVEL ENCRYPTION (AES-256-GCM)
// ============================================================================

/** Derives encryption key from machine identity + per-install salt (same as crypto-store) */
function deriveDbKey(userDataDir: string): Buffer {
    const os = require('os');
    const machineId = `${os.hostname()}-${os.userInfo().username}`;
    const saltFile = path.join(userDataDir, '.lex-salt');
    let salt: Buffer;
    try {
        salt = fs.readFileSync(saltFile);
    } catch {
        salt = Buffer.from('lex-crypto-salt-v1', 'utf8');
    }
    return crypto.scryptSync(machineId, salt, 32);
}

function encryptDbFile(srcPath: string, destPath: string, userDataDir: string): void {
    const key = deriveDbKey(userDataDir);
    const iv = crypto.randomBytes(IV_LEN);
    const plaintext = fs.readFileSync(srcPath);

    const cipher = crypto.createCipheriv(ENC_ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Format: iv (16) + tag (16) + ciphertext
    const output = Buffer.concat([iv, tag, encrypted]);
    fs.writeFileSync(destPath, output);
}

function decryptDbFile(srcPath: string, destPath: string, userDataDir: string): void {
    const key = deriveDbKey(userDataDir);
    const data = fs.readFileSync(srcPath);

    const iv = data.subarray(0, IV_LEN);
    const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = data.subarray(IV_LEN + TAG_LEN);

    const decipher = crypto.createDecipheriv(ENC_ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    fs.writeFileSync(destPath, plaintext);
}

// ============================================================================
// MIGRATION: Legacy JSON → SQLite
// ============================================================================

interface LegacySelectorStore {
    version: number;
    entries: Record<string, {
        selectors: string[];
        successCount: Record<string, number>;
        lastSuccessful: string;
        lastUsed: number;
    }>;
}

function migrateFromLegacy(brain: BrainStore, userDataDir: string): void {
    console.log('[Brain] Iniciando migração de dados legados...');

    const tx = brain.db.transaction(() => {
        // ── 1. Memory JSON ──────────────────────────────────
        const memoryPath = path.join(userDataDir, LEGACY_MEMORY_FILE);
        const memory = loadEncrypted<Partial<MemoriaData>>(memoryPath, {});

        if (memory && Object.keys(memory).length > 0) {
            // 1a. CrossSessionFacts → processo nodes + edges
            const fatos = (memory as any).fatos as CrossSessionFact[] | undefined;
            if (fatos && fatos.length > 0) {
                for (const fact of fatos) {
                    brain.upsertProcesso(fact.processoNumero, {
                        processoNumero: fact.processoNumero,
                        ...(fact.lastSessionId !== undefined && { lastSessionId: fact.lastSessionId }),
                        ...(fact.lastUpdated !== undefined && { lastUpdated: fact.lastUpdated }),
                        ...(fact.partes !== undefined && { partes: fact.partes }),
                        ...(fact.classe !== undefined && { classe: fact.classe }),
                        ...(fact.tribunal !== undefined && { tribunal: fact.tribunal }),
                        ...(fact.tesesDiscutidas !== undefined && { tesesDiscutidas: fact.tesesDiscutidas }),
                        ...(fact.decisoes !== undefined && { decisoes: fact.decisoes }),
                        ...(fact.status !== undefined && { status: fact.status }),
                    });
                }
                console.log(`[Brain] Migrados ${fatos.length} fatos → nós processo`);
            }

            // 1b. Interações → interactions table
            const interacoes = memory.interacoes;
            if (interacoes && interacoes.length > 0) {
                for (const i of interacoes) {
                    brain.saveInteraction({
                        objetivo: i.objetivo,
                        resposta: i.resposta,
                        passos: i.passos,
                        duracao: i.duracao,
                        sucesso: i.sucesso,
                    });
                }
                console.log(`[Brain] Migradas ${interacoes.length} interações`);
            }

            // 1c. Aprendizados → nodes tipo 'aprendizado'
            const aprendizados = memory.aprendizados;
            if (aprendizados && aprendizados.length > 0) {
                for (const text of aprendizados) {
                    brain.addAprendizado(text);
                }
                console.log(`[Brain] Migrados ${aprendizados.length} aprendizados`);
            }

            // 1d. Preferências → preferences table
            const prefs = memory.preferencias;
            if (prefs && Object.keys(prefs).length > 0) {
                for (const [key, value] of Object.entries(prefs)) {
                    brain.setPreference(key, value);
                }
                console.log(`[Brain] Migradas ${Object.keys(prefs).length} preferências`);
            }

            // 1e. Usuário → preferences table (under 'usuario.*' keys)
            const usuario = memory.usuario;
            if (usuario && Object.keys(usuario).length > 0) {
                for (const [key, value] of Object.entries(usuario)) {
                    if (value !== undefined && value !== null) {
                        brain.setPreference(`usuario.${key}`, value);
                    }
                }
                console.log(`[Brain] Migrados dados do usuário`);
            }

            // 1f. Processos recentes → register access
            const recentes = memory.processosRecentes;
            if (recentes && recentes.length > 0) {
                for (const num of recentes) {
                    brain.registerProcessoAccess(num);
                }
                console.log(`[Brain] Registrados ${recentes.length} processos recentes`);
            }
        }

        // ── 2. Selector Memory JSON ─────────────────────────
        const selectorPath = path.join(userDataDir, LEGACY_SELECTOR_FILE);
        const selectorStore = loadEncrypted<LegacySelectorStore>(selectorPath, { version: 1, entries: {} });

        if (selectorStore?.entries && Object.keys(selectorStore.entries).length > 0) {
            let selectorCount = 0;
            for (const [key, entry] of Object.entries(selectorStore.entries)) {
                const [tribunal, ...contextParts] = key.split(':');
                const context = contextParts.join(':');
                if (!tribunal || !context) continue;

                for (const selector of entry.selectors) {
                    const count = entry.successCount[selector] || 1;
                    // Record success N times to preserve weight
                    for (let i = 0; i < count; i++) {
                        brain.recordSelectorSuccess(tribunal, context, selector);
                    }
                    selectorCount++;
                }
            }
            console.log(`[Brain] Migrados ${selectorCount} seletores`);
        }
    });

    tx();
}
