/**
 * Processo Store — HOT Data
 *
 * Armazena dados de processos monitorados em JSON (~/.lex/datajud/).
 * Cache em memória + flush para disco (padrão do legal-store.ts).
 * Max 500 processos (LRU por _fetchedAt).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProcessoDataJud, MAX_HOT_PROCESSOS } from './types';

const DATAJUD_DIR = path.join(os.homedir(), '.lex', 'datajud');
const PROCESSOS_FILE = path.join(DATAJUD_DIR, 'processos.json');

// Cache em memória
let _processos: ProcessoDataJud[] = [];
let _initialized = false;

// ── Init ─────────────────────────────────────────────────────────────

export function initProcessoStore(): void {
    if (_initialized) return;

    fs.mkdirSync(DATAJUD_DIR, { recursive: true });

    if (fs.existsSync(PROCESSOS_FILE)) {
        try {
            const raw = fs.readFileSync(PROCESSOS_FILE, 'utf-8');
            _processos = JSON.parse(raw);
            console.log(`[ProcessoStore] Carregado: ${_processos.length} processos`);
        } catch {
            _processos = [];
            console.warn('[ProcessoStore] Arquivo corrompido, reiniciando vazio.');
        }
    }

    _initialized = true;
}

// ── Helpers ──────────────────────────────────────────────────────────

function _flush(): void {
    fs.writeFileSync(PROCESSOS_FILE, JSON.stringify(_processos, null, 2));
}

function _ensureInit(): void {
    if (!_initialized) initProcessoStore();
}

function _enforceLimits(): void {
    if (_processos.length > MAX_HOT_PROCESSOS) {
        // LRU: remove os mais antigos por _fetchedAt
        _processos.sort((a, b) => b._fetchedAt.localeCompare(a._fetchedAt));
        _processos = _processos.slice(0, MAX_HOT_PROCESSOS);
    }
}

// ── CRUD ─────────────────────────────────────────────────────────────

/** Adiciona ou atualiza um processo no store */
export function upsertProcesso(processo: ProcessoDataJud): void {
    _ensureInit();
    const idx = _processos.findIndex(p => p.numero === processo.numero);
    if (idx >= 0) {
        _processos[idx] = processo;
    } else {
        _processos.push(processo);
        _enforceLimits();
    }
    _flush();
}

/** Busca um processo pelo número CNJ */
export function getProcesso(numero: string): ProcessoDataJud | null {
    _ensureInit();
    return _processos.find(p => p.numero === numero) || null;
}

/** Retorna todos os processos armazenados */
export function getAllProcessos(): ProcessoDataJud[] {
    _ensureInit();
    return [..._processos];
}

/** Filtra processos por tribunal */
export function getProcessosByTribunal(tribunal: string): ProcessoDataJud[] {
    _ensureInit();
    return _processos.filter(p => p.tribunal === tribunal);
}

/** Remove um processo pelo número */
export function removeProcesso(numero: string): boolean {
    _ensureInit();
    const before = _processos.length;
    _processos = _processos.filter(p => p.numero !== numero);
    if (_processos.length !== before) {
        _flush();
        return true;
    }
    return false;
}

/** Estatísticas do store */
export function getProcessoStoreStats(): { total: number; tribunais: string[]; dir: string } {
    _ensureInit();
    const tribunais = [...new Set(_processos.map(p => p.tribunal))];
    return {
        total: _processos.length,
        tribunais,
        dir: DATAJUD_DIR,
    };
}
