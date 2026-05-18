import { net } from 'electron';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nspauxzztflgmxjgevmo.supabase.co';
// Anon key (pública — segura para expor no client)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcGF1eHp6dGZsZ214amdldm1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MTI4ODUsImV4cCI6MjA3MDE4ODg4NX0.XXJf6alnb6me4PeMCA80UmfJVUZo8VxA0BFDdFCtN1A';

let _client: SupabaseClient | null = null;

function createElectronFetch(): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
        if (net && typeof net.fetch === 'function') {
            return net.fetch(input as any, init as any) as any;
        }
        return fetch(input as any, init as any);
    };
}

export function initSupabase(store: any): SupabaseClient {
    if (_client) return _client;

    // Usa electron-store como storage de sessão (persiste entre reinicializações)
    const storage = {
        getItem: (key: string) => (store.get(`sb_${key}`) as string) ?? null,
        setItem: (key: string, value: string) => store.set(`sb_${key}`, value),
        removeItem: (key: string) => store.delete(`sb_${key}`),
    };

    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
            fetch: createElectronFetch(),
        },
        auth: { storage, autoRefreshToken: true, persistSession: true },
    });

    return _client;
}

export function getSupabase(): SupabaseClient {
    if (!_client) throw new Error('Supabase não inicializado — chame initSupabase() primeiro');
    return _client;
}
