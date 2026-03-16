import { getSupabase } from './supabase-client';

const TRIAL_DAYS = 4;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export type LicenseStatus = 'not_authenticated' | 'trial_active' | 'trial_expired' | 'pro';

export interface LicenseResult {
    status: LicenseStatus;
    daysLeft: number;
    email?: string;
}

let _cache: { result: LicenseResult; expiresAt: number } | null = null;

function invalidateCache(): void {
    _cache = null;
}

export async function authSignIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const sb = getSupabase();
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error: error.message };
        invalidateCache();
        await ensureProfile();
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

export async function authSignUp(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const sb = getSupabase();
        const { error } = await sb.auth.signUp({ email, password });
        if (error) return { ok: false, error: error.message };
        invalidateCache();
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

export async function authSignOut(): Promise<void> {
    const sb = getSupabase();
    await sb.auth.signOut();
    invalidateCache();
}

async function ensureProfile(): Promise<void> {
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // Insere perfil apenas se não existir (ignoreDuplicates)
    await sb.from('profiles').upsert(
        { id: user.id, email: user.email, trial_started_at: new Date().toISOString(), plan: 'trial' },
        { onConflict: 'id', ignoreDuplicates: true }
    );
}

export async function checkLicense(): Promise<LicenseResult> {
    // AUTH DESATIVADO TEMPORARIAMENTE
    return { status: 'pro', daysLeft: 999 };
}

export function refreshLicense(): void {
    invalidateCache();
}
