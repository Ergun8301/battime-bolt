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
//
// ── DEUX TROUS DE CETTE MÉCANIQUE, BOUCHÉS ENSUITE ───────────────────────────
//
// 4. « DÉJÀ VU » NE VOULAIT PAS DIRE « DÉJÀ FAIT ». Poser la marque puis
//    l'effacer en cas d'échec ne couvre que les erreurs ATTRAPÉES. Si la
//    fonction plante ou dépasse son temps, la marque reste : Stripe rejoue, voit
//    la marque, reçoit 200, et l'abonnement n'est JAMAIS appliqué — cette fois
//    définitivement, puisque Stripe cesse d'insister. La marque porte donc un
//    état : `processing` ou `done`. Un `processing` trop vieux est repris ; un
//    `processing` récent renvoie 409, et Stripe repassera.
//
// 5. RELIRE CHEZ STRIPE NE SUFFIT PAS CONTRE LA CONCURRENCE. Deux traitements
//    simultanés : celui qui a lu « actif » peut écrire APRÈS celui qui a lu
//    « résilié », et le compte résilié redevient actif. L'écriture passe donc
//    par `apply_subscription_state`, qui sérialise par entreprise et n'applique
//    que si elle repose sur une lecture PLUS RÉCENTE que la dernière appliquée.
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

  // ── Déjà vu, ou déjà FAIT ? ──
  // La marque porte un état. `done` = travail terminé, on peut accuser
  // réception. `processing` = quelqu'un travaille (ou est mort en travaillant) :
  // au-delà du bail on reprend la main, en deçà on renvoie 409 pour que Stripe
  // repasse. Rien ne justifie un 200 tant que le travail n'est pas fait.
  const LEASE_MS = 120_000;
  const json200 = (extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ received: true, ...extra }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  const { error: seenErr } = await admin.from('stripe_events').insert({
    id: event.id, type: event.type, status: 'processing', started_at: new Date().toISOString(),
    event_created: new Date(event.created * 1000).toISOString(),
  });

  if (seenErr) {
    if (seenErr.code !== '23505') {
      console.error('[stripe-webhook] mémoire des événements', seenErr);
      return new Response('Mémoire des événements indisponible', { status: 500 });
    }
    const { data: prev, error: readErr } = await admin.from('stripe_events')
      .select('status, started_at').eq('id', event.id).maybeSingle();
    if (readErr || !prev) {
      console.error('[stripe-webhook] marque illisible', event.id, readErr);
      return new Response('Mémoire des événements indisponible', { status: 500 });
    }
    if (prev.status === 'done') return json200({ duplicate: true });

    const age = Date.now() - new Date(prev.started_at as string).getTime();
    if (age < LEASE_MS) {
      // Un traitement est en cours ailleurs. Ne pas accuser réception : s'il
      // échoue, c'est ce rejeu-ci qui devra reprendre le travail.
      return new Response('Traitement déjà en cours', { status: 409 });
    }
    // Bail expiré : on reprend, mais seulement si personne ne nous a devancés.
    const { data: taken, error: takeErr } = await admin.from('stripe_events')
      .update({ started_at: new Date().toISOString() })
      .eq('id', event.id).eq('status', 'processing').eq('started_at', prev.started_at)
      .select('id');
    if (takeErr || !taken || taken.length === 0) {
      return new Response('Traitement repris par un autre essai', { status: 409 });
    }
  }

  /** Le travail a échoué : on rend la marque pour que le rejeu de Stripe reprenne. */
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
   * l'événement : c'est ce qui rend l'ordre d'ARRIVÉE sans importance.
   *
   * Mais relire ne suffit pas contre la CONCURRENCE : deux traitements en
   * parallèle, celui qui a lu « actif » peut écrire après celui qui a lu
   * « résilié ». L'écriture passe donc par une fonction serveur qui sérialise
   * par entreprise et refuse une écriture fondée sur une lecture plus ancienne
   * que la dernière appliquée. L'horodatage est pris JUSTE APRÈS la lecture :
   * c'est lui qui dit laquelle des deux vues est la plus fraîche.
   */
  const applySubscription = async (
    subscriptionId: string,
    companyId: string | undefined | null,
    customerId: string | null,
  ) => {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const readAt = new Date().toISOString();

    const { data, error } = await admin.rpc('apply_subscription_state', {
      p_company: companyId ?? (sub.metadata?.company_id as string | undefined) ?? null,
      p_customer: (sub.customer as string) ?? customerId ?? null,
      p_subscription: sub.id,
      p_status: sub.status,
      p_read_at: readAt,
    });
    if (error) throw new Error(`Écriture refusée: ${error.message}`);

    const row = (Array.isArray(data) ? data[0] : data) as
      { applied: boolean; company_id: string | null; reason: string | null } | null;
    if (!row) throw new Error("Réponse vide de l'application d'état");
    if (!row.applied) {
      if (row.reason === 'entreprise introuvable') {
        throw new Error(`Aucune entreprise ne correspond (company_id=${companyId ?? '-'}, customer=${(sub.customer as string) ?? '-'})`);
      }
      // Une lecture plus fraîche a déjà été appliquée : ne rien écrire est le
      // comportement CORRECT, pas un échec. Accuser réception.
      console.log('[stripe-webhook] écriture ignorée —', row.reason, event.id);
    }
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

  // Travail terminé : la marque passe à « done ». C'est SEULEMENT à partir
  // d'ici qu'un rejeu peut être écarté sans rien perdre.
  const { error: doneErr } = await admin.from('stripe_events')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', event.id);
  if (doneErr) {
    // Le travail est fait mais la marque n'a pas bougé : un rejeu la verrait
    // « processing » et referait le travail. C'est sans conséquence — la
    // fonction est idempotente par construction — mais on le journalise.
    console.error('[stripe-webhook] marque non close', event.id, doneErr);
  }

  return json200();
});
