import { getSupabase } from './supabase-client';

const DEFAULT_TRIAL_DAYS = 4;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export type LicenseStatus = 'not_authenticated' | 'trial_active' | 'trial_expired' | 'pro';

export interface LicenseResult {
    status: LicenseStatus;
    daysLeft: number;
    email?: string | undefined;
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

export async function authSignInWithGoogle(): Promise<{ ok: boolean; url?: string; error?: string }> {
    try {
        const sb = getSupabase();
        const { data, error } = await sb.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: 'http://localhost/auth/callback',
                skipBrowserRedirect: true,
            },
        });
        console.log('[Auth] Google OAuth URL:', data?.url);
        if (error) {
            console.error('[Auth] Google OAuth error:', error);
            return { ok: false, error: error.message };
        }
        return { ok: true, url: data.url };
    } catch (e: any) {
        console.error('[Auth] Google OAuth exception:', e);
        return { ok: false, error: e.message };
    }
}

export async function handleGoogleCallback(url: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const sb = getSupabase();
        const hashOrQuery = url.includes('#') ? url.split('#')[1] : url.split('?')[1];
        if (!hashOrQuery) return { ok: false, error: 'URL de callback inválida' };

        const params = new URLSearchParams(hashOrQuery);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (!accessToken) return { ok: false, error: 'Token não encontrado no callback' };

        const { error } = await sb.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
        });
        if (error) return { ok: false, error: error.message };

        invalidateCache();
        await ensureProfile();
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
    if (_cache && Date.now() < _cache.expiresAt) return _cache.result;

    try {
        const sb = getSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return { status: 'not_authenticated', daysLeft: 0 };

        const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
        if (!profile) {
            await ensureProfile();
            return checkLicense();
        }

        const trialStart = new Date(profile.trial_started_at).getTime();
        const daysPassed = Math.floor((Date.now() - trialStart) / (1000 * 60 * 60 * 24));
        const trialDays = profile.trial_days ?? DEFAULT_TRIAL_DAYS;
        const daysLeft = Math.max(0, trialDays - daysPassed);

        let result: LicenseResult;
        if (profile.plan === 'pro') {
            result = { status: 'pro', daysLeft: 999, email: user.email };
        } else if (daysLeft > 0) {
            result = { status: 'trial_active', daysLeft, email: user.email };
        } else {
            result = { status: 'trial_expired', daysLeft: 0, email: user.email };
        }

        _cache = { result, expiresAt: Date.now() + CACHE_TTL_MS };
        return result;
    } catch {
        return { status: 'not_authenticated', daysLeft: 0 };
    }
}

export async function getProfile(): Promise<{ name: string; email: string; avatar: string; plan: string } | null> {
    try {
        const sb = getSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return null;

        const meta = user.user_metadata || {};
        const { data: profile } = await sb.from('profiles').select('plan').eq('id', user.id).single();

        return {
            name: meta['full_name'] || meta['name'] || user.email?.split('@')[0] || '',
            email: user.email || '',
            avatar: meta['avatar_url'] || meta['picture'] || '',
            plan: profile?.plan || 'trial',
        };
    } catch {
        return null;
    }
}

export function refreshLicense(): void {
    invalidateCache();
}
