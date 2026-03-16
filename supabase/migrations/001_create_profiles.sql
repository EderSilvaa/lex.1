-- Tabela de perfis de usuários (vinculada ao auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
    id                UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email             TEXT,
    trial_started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    plan              TEXT        NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'pro')),
    asaas_payment_id  TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security: usuário só lê/insere o próprio perfil
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura própria" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Inserção própria" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Atualização de plan SÓ via service_role (edge function webhook)
-- Usuário comum não pode se auto-promover para 'pro'
