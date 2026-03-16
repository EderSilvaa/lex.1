/**
 * Edge Function: asaas-webhook
 *
 * Recebe notificações de pagamento do ASAAS e atualiza o plano do usuário.
 *
 * No painel ASAAS: Configurações → Integrações → Webhooks
 * URL: https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/asaas-webhook
 * Token de acesso: crie um token forte e coloque em ASAAS_WEBHOOK_TOKEN (env var)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN');

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // Valida token de autenticação enviado pelo ASAAS
    const token = req.headers.get('asaas-access-token');
    if (WEBHOOK_TOKEN && token !== WEBHOOK_TOKEN) {
        return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return new Response('Bad Request', { status: 400 });

    // Só processa pagamento confirmado/recebido
    const CONFIRMED_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
    if (!CONFIRMED_EVENTS.includes(body.event)) {
        return new Response(JSON.stringify({ ignored: true }), { status: 200 });
    }

    const payment = body.payment;
    // externalReference deve conter o UUID do usuário no Supabase
    // Configure isso ao criar a cobrança no ASAAS
    const userId = payment?.externalReference;
    const customerEmail = payment?.customer?.email;

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let resolvedUserId = userId;

    // Fallback: busca por email se não tiver externalReference
    if (!resolvedUserId && customerEmail) {
        const { data } = await supabase.auth.admin.listUsers();
        const user = data?.users?.find((u: any) => u.email === customerEmail);
        if (user) resolvedUserId = user.id;
    }

    if (!resolvedUserId) {
        console.error('[webhook] Usuário não identificado — payment:', payment?.id);
        return new Response(JSON.stringify({ error: 'user_not_found' }), { status: 404 });
    }

    const { error } = await supabase
        .from('profiles')
        .update({
            plan: 'pro',
            asaas_payment_id: payment?.id,
            updated_at: new Date().toISOString(),
        })
        .eq('id', resolvedUserId);

    if (error) {
        console.error('[webhook] Erro ao atualizar plano:', error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log('[webhook] Plano atualizado para pro — user:', resolvedUserId);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
});
