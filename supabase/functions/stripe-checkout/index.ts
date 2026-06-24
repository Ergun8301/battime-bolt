// Edge Function : crée une session de paiement Stripe (abonnement) pour
// l'entreprise de l'admin connecté, et renvoie l'URL de paiement.
// Clés lues dans les SECRETS Supabase (jamais en dur) :
//   STRIPE_SECRET_KEY  (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injectés)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno&no-check';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) return json({ error: 'Non authentifié' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !user) return json({ error: 'Session invalide' }, 401);

    const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return json({ error: "Réservé à l'administrateur" }, 403);

    const { priceId } = await req.json().catch(() => ({}));
    const { data: plan } = await admin.from('subscription_plans')
      .select('stripe_price_id').eq('stripe_price_id', priceId).eq('active', true).maybeSingle();
    if (!plan) return json({ error: 'Offre inconnue' }, 400);

    const { data: company } = await admin.from('companies')
      .select('id, name, stripe_customer_id').eq('id', profile.company_id).single();
    if (!company) return json({ error: 'Entreprise introuvable' }, 404);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient(),
    });

    let customerId: string | null = company.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined, name: company.name ?? undefined, metadata: { company_id: company.id },
      });
      customerId = customer.id;
      await admin.from('companies').update({ stripe_customer_id: customerId }).eq('id', company.id);
    }

    const origin = req.headers.get('origin') || '';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/admin?subscribed=1`,
      cancel_url: `${origin}/admin`,
      metadata: { company_id: company.id },
      subscription_data: { metadata: { company_id: company.id } },
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
