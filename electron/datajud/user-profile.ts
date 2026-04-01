/**
 * User Legal Profile Store
 *
 * Perfil jurídico do advogado: tribunais, áreas de atuação,
 * keywords de interesse e processos monitorados.
 *
 * Persistido via electron-store (padrão do GoalStore).
 * API key DataJud encriptada via crypto-store.
 */

import { UserLegalProfile, MonitoredProcesso, DEFAULT_PROFILE } from './types';
import { encryptApiKey, safeDecrypt } from '../crypto-store';

const STORE_KEY = 'lex-datajud-profile';
const APIKEY_STORE_KEY = 'lex-datajud-apikey';

let _store: any = null;
let _profile: UserLegalProfile | null = null;

// ── Init ─────────────────────────────────────────────────────────────

async function ensureStore(): Promise<any> {
    if (_store) return _store;
    const Store = (await import('electron-store')).default;
    _store = new Store({ name: 'lex-datajud' });
    return _store;
}

function loadProfile(store: any): UserLegalProfile {
    const saved = store.get(STORE_KEY) as UserLegalProfile | undefined;
    if (saved) return saved;
    return { ...DEFAULT_PROFILE, updatedAt: new Date().toISOString() };
}

function saveToStore(store: any, profile: UserLegalProfile): void {
    profile.updatedAt = new Date().toISOString();
    store.set(STORE_KEY, profile);
    _profile = profile;
}

// ── Profile API ──────────────────────────────────────────────────────

export async function getProfile(): Promise<UserLegalProfile> {
    const store = await ensureStore();
    if (!_profile) _profile = loadProfile(store);
    return _profile;
}

export async function saveProfile(profile: UserLegalProfile): Promise<void> {
    const store = await ensureStore();
    saveToStore(store, profile);
}

// ── Tribunais / Áreas / Keywords ─────────────────────────────────────

export async function setTribunais(tribunais: string[]): Promise<void> {
    const profile = await getProfile();
    profile.tribunais = tribunais;
    const store = await ensureStore();
    saveToStore(store, profile);
}

export async function setAreasAtuacao(areas: string[]): Promise<void> {
    const profile = await getProfile();
    profile.areasAtuacao = areas;
    const store = await ensureStore();
    saveToStore(store, profile);
}

export async function setKeywords(keywords: string[]): Promise<void> {
    const profile = await getProfile();
    profile.keywords = keywords;
    const store = await ensureStore();
    saveToStore(store, profile);
}

// ── Processos Monitorados CRUD ───────────────────────────────────────

export async function addMonitoredProcesso(p: MonitoredProcesso): Promise<void> {
    const profile = await getProfile();
    const existing = profile.processosMonitorados.findIndex(
        pp => pp.numero === p.numero
    );
    if (existing >= 0) {
        profile.processosMonitorados[existing] = p;
    } else {
        profile.processosMonitorados.push(p);
    }
    const store = await ensureStore();
    saveToStore(store, profile);
}

export async function removeMonitoredProcesso(numero: string): Promise<void> {
    const profile = await getProfile();
    profile.processosMonitorados = profile.processosMonitorados.filter(
        p => p.numero !== numero
    );
    const store = await ensureStore();
    saveToStore(store, profile);
}

export async function updateMonitoredProcesso(
    numero: string,
    updates: Partial<MonitoredProcesso>
): Promise<void> {
    const profile = await getProfile();
    const idx = profile.processosMonitorados.findIndex(p => p.numero === numero);
    if (idx >= 0) {
        profile.processosMonitorados[idx] = {
            ...profile.processosMonitorados[idx]!,
            ...updates,
        };
        const store = await ensureStore();
        saveToStore(store, profile);
    }
}

export async function getMonitoredProcessos(): Promise<MonitoredProcesso[]> {
    const profile = await getProfile();
    return profile.processosMonitorados;
}

export async function getActiveProcessos(): Promise<MonitoredProcesso[]> {
    const profile = await getProfile();
    return profile.processosMonitorados.filter(p => p.ativo);
}

// ── DataJud API Key ──────────────────────────────────────────────────

export async function setDataJudApiKey(key: string): Promise<void> {
    const store = await ensureStore();
    const encrypted = encryptApiKey(key);
    store.set(APIKEY_STORE_KEY, encrypted);
}

export async function getDataJudApiKey(): Promise<string | null> {
    const store = await ensureStore();
    const encrypted = store.get(APIKEY_STORE_KEY) as string | undefined;
    if (!encrypted) return null;
    try {
        return safeDecrypt(encrypted);
    } catch {
        return null;
    }
}

export async function hasDataJudApiKey(): Promise<boolean> {
    const store = await ensureStore();
    return !!store.get(APIKEY_STORE_KEY);
}
