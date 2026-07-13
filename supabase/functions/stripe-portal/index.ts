// Edge Function : ouvre le PORTAIL CLIENT Stripe pour l'entreprise de l'admin
// connecté (gérer / résilier l'abonnement, factures, moyen de paiement).
// Renvoie une URL de redirection vers la page hébergée par Stripe.
// Clés lues dans les SECRETS Supabase (jamais en dur) :
//   STRIPE_SECRET_KEY  (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injectés)
// Prérequis côté Stripe : le « Portail client » doit être activé dans le
// dashboard (Réglages → Facturation → Portail client).
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

    const { data: company } = await admin.from('companies')
      .select('stripe_customer_id').eq('id', profile.company_id).single();
    if (!company?.stripe_customer_id) return json({ error: "Aucun abonnement à gérer pour le moment." }, 400);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient(),
    });

    const origin = req.headers.get('origin') || '';
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${origin}/admin`,
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
