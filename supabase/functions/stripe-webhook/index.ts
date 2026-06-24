// Edge Function : reçoit les événements Stripe (signés) et met à jour
// l'abonnement de l'entreprise. Déployée SANS vérif JWT (c'est Stripe qui
// appelle), mais protégée par la SIGNATURE Stripe (STRIPE_WEBHOOK_SECRET).
// Secrets : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (+ SUPABASE_* auto-injectés).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno&no-check';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, cryptoProvider,
    );
  } catch (err) {
    return new Response(`Signature invalide: ${(err as Error).message}`, { status: 400 });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const update = async (companyId: string | undefined | null, customerId: string | null, fields: Record<string, unknown>) => {
    if (companyId) { await admin.from('companies').update(fields).eq('id', companyId); return; }
    if (customerId) { await admin.from('companies').update(fields).eq('stripe_customer_id', customerId); }
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        await update(s.metadata?.company_id, s.customer as string, {
          subscription_status: 'active',
          stripe_subscription_id: s.subscription as string,
          stripe_customer_id: s.customer as string,
        });
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const isActive = sub.status === 'active' || sub.status === 'trialing';
        await update(sub.metadata?.company_id, sub.customer as string, {
          subscription_status: isActive ? 'active' : sub.status,
          stripe_subscription_id: sub.id,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await update(sub.metadata?.company_id, sub.customer as string, {
          subscription_status: 'canceled',
          stripe_subscription_id: null,
        });
        break;
      }
    }
  } catch (e) {
    return new Response(`Erreur traitement: ${String(e)}`, { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
