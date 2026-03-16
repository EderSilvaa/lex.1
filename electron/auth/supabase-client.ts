import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nspauxzztflgmxjgevmo.supabase.co';
// Anon key (pública — segura para expor no client)
const SUPABASE_ANON_KEY = 'COLOQUE_SUA_ANON_KEY_AQUI';

let _client: SupabaseClient | null = null;

export function initSupabase(store: any): SupabaseClient {
    if (_client) return _client;

    // Usa electron-store como storage de sessão (persiste entre reinicializações)
    const storage = {
        getItem: (key: string) => (store.get(`sb_${key}`) as string) ?? null,
        setItem: (key: string, value: string) => store.set(`sb_${key}`, value),
        removeItem: (key: string) => store.delete(`sb_${key}`),
    };

    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { storage, autoRefreshToken: true, persistSession: true },
    });

    return _client;
}

export function getSupabase(): SupabaseClient {
    if (!_client) throw new Error('Supabase não inicializado — chame initSupabase() primeiro');
    return _client;
}
