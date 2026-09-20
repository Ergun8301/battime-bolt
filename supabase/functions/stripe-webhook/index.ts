// Edge Function : reçoit les événements Stripe (signés) et met à jour
// l'abonnement de l'entreprise. Déployée SANS vérif JWT (c'est Stripe qui
// appelle), mais protégée par la SIGNATURE Stripe (STRIPE_WEBHOOK_SECRET).
// Secrets : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (+ SUPABASE_* auto-injectés).
//
// ── ÉTAPE 15 : CE QUI ÉTAIT CASSÉ ────────────────────────────────────────────
//
// 1. LES ÉCHECS D'ÉCRITURE ÉTAIENT AVALÉS. La fonction faisait
//    `await admin.from('companies').update(...)` sans regarder l'erreur, puis
//    répondait 200. Stripe considère alors l'événement délivré et ne réessaie
//    JAMAIS. Un client qui vient de payer restait bloqué derrière le paywall,
//    et rien nulle part ne le signalait. Un succès affiché par-dessus un échec
//    silencieux — la version payante du problème.
//
// 2. UNE MISE À JOUR SANS AUCUNE LIGNE TOUCHÉE PASSAIT POUR UN SUCCÈS. Sans
//    `company_id` en métadonnée et sans `stripe_customer_id` connu, la fonction
//    ne faisait rien et répondait 200 quand même.
//
// 3. NI REJEU NI DÉSORDRE N'ÉTAIENT GÉRÉS. Stripe rejoue tant qu'il n'a pas de
//    2xx, et ne garantit PAS l'ordre d'arrivée : un `subscription.updated`
//    (actif) délivré après un `subscription.deleted` ressuscitait un abonnement
//    résilié.
//
// ── CE QUI LES REMPLACE ──────────────────────────────────────────────────────
//
//   - Toute erreur remonte en 500 : Stripe réessaie, c'est exactement ce qu'on
//     veut. Un webhook ne doit répondre 200 que s'il a vraiment fait le travail.
//   - L'état est RELU CHEZ STRIPE (`subscriptions.retrieve`) au lieu d'être pris
//     dans le corps de l'événement. On écrit donc l'état COURANT, et un message
//     en retard ne peut plus écraser un état plus récent. C'est la réponse au
//     désordre, et elle est plus sûre qu'une comparaison d'horodatages.
//   - `stripe_events` retient les identifiants déjà traités : un rejeu sort
//     immédiatement en 200 sans rien réécrire.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno&no-check';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

/** Statuts Stripe qui donnent accès à l'application. */
const GRANTS_ACCESS = new Set(['active', 'trialing']);

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

  // ── Déjà vu ? ──
  // On pose la marque AVANT de travailler : deux livraisons simultanées du même
  // événement se disputent la clé primaire, et une seule passe. Si le travail
  // échoue ensuite, on efface la marque pour que le prochain essai de Stripe
  // puisse rejouer — sinon un échec deviendrait définitif.
  const { error: seenErr } = await admin.from('stripe_events').insert({
    id: event.id, type: event.type,
    event_created: new Date(event.created * 1000).toISOString(),
  });
  if (seenErr) {
    if (seenErr.code === '23505') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('[stripe-webhook] mémoire des événements', seenErr);
    return new Response('Mémoire des événements indisponible', { status: 500 });
  }

  const forget = async () => {
    const { error } = await admin.from('stripe_events').delete().eq('id', event.id);
    if (error) console.error('[stripe-webhook] marque non effacée', event.id, error);
  };

  /**
   * Écrit sur l'entreprise, et VÉRIFIE qu'une ligne a bougé.
   * `.select('id')` est indispensable : sans lui, une mise à jour qui ne touche
   * aucune ligne renvoie `{ error: null }` et passerait pour un succès.
   */
  const applyToCompany = async (
    companyId: string | undefined | null,
    customerId: string | null,
    fields: Record<string, unknown>,
  ) => {
    if (!companyId && !customerId) {
      throw new Error(`Aucun identifiant d'entreprise dans l'événement ${event.id}`);
    }
    const q = admin.from('companies').update(fields);
    const { data, error } = await (companyId ? q.eq('id', companyId) : q.eq('stripe_customer_id', customerId!))
      .select('id');
    if (error) throw new Error(`Écriture refusée: ${error.message}`);
    if (!data || data.length === 0) {
      throw new Error(`Aucune entreprise ne correspond (company_id=${companyId ?? '-'}, customer=${customerId ?? '-'})`);
    }
  };

  /**
   * L'état de l'abonnement est RELU chez Stripe, jamais déduit du corps de
   * l'événement : c'est ce qui rend l'ordre d'arrivée sans importance.
   */
  const applySubscription = async (
    subscriptionId: string,
    companyId: string | undefined | null,
    customerId: string | null,
  ) => {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const active = GRANTS_ACCESS.has(sub.status);
    await applyToCompany(companyId ?? (sub.metadata?.company_id as string | undefined), customerId ?? (sub.customer as string), {
      subscription_status: active ? 'active' : sub.status,
      // Un abonnement résilié ne garde pas son identifiant : il ne sert plus à
      // rien, et le laisser ferait croire à un abonnement encore rattaché.
      stripe_subscription_id: sub.status === 'canceled' ? null : sub.id,
      stripe_customer_id: (sub.customer as string) || customerId,
    });
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const subId = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id ?? null;
        if (subId) {
          await applySubscription(subId, s.metadata?.company_id, (s.customer as string) ?? null);
        } else {
          // Paiement sans abonnement : on ne devine pas un accès. On retient au
          // moins le client Stripe pour que les événements suivants trouvent
          // l'entreprise.
          await applyToCompany(s.metadata?.company_id, (s.customer as string) ?? null, {
            stripe_customer_id: s.customer as string,
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscription(sub.id, sub.metadata?.company_id, (sub.customer as string) ?? null);
        break;
      }
      default:
        // Événement qui ne nous concerne pas : accusé de réception, rien à faire.
        // On garde la marque, il ne sert à rien de le rejouer.
        break;
    }
  } catch (e) {
    // 500 → Stripe réessaie. On efface la marque pour que le rejeu travaille
    // vraiment au lieu d'être écarté comme doublon.
    console.error('[stripe-webhook]', event.type, event.id, e);
    await forget();
    return new Response(`Erreur traitement: ${String((e as Error)?.message || e)}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
