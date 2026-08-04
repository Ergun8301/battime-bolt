# Plan d'activation du paywall (essai 30 j → abonnement)

> ⚠️ **RIEN n'est activé pour l'instant.** Ce document est la marche à suivre
> pour le jour où Stripe est en **mode LIVE** et le produit prêt. Tant que le
> paywall n'est pas débridé, l'accès reste ouvert en prod (comportement actuel).

## État actuel (déjà codé, vérifié)

Tout le mécanisme existe et est correct de bout en bout :
- Essai 30 j posé à l'inscription (`handle_new_user`).
- Calcul `inTrial` / `expired` / `daysLeft` dans `app/admin/page.tsx`.
- Bandeaux « il reste X jours » / « essai terminé » (déjà visibles).
- Écran de paiement `SubscribePanel` (3 offres + Stripe Checkout).
- Fonctions edge `stripe-checkout` (admin-only, metadata `company_id`) et
  `stripe-webhook` (active / past_due / canceled).

**Le seul frein volontaire**, dans `app/admin/page.tsx` :
```js
const isPreview = window.location.hostname.startsWith('deploy-preview-');
const blocked = expired && isPreview;   // ⇒ jamais bloqué en prod
```

## Décision produit retenue — Option A

- À l'expiration : **seule la secrétaire / l'admin (`/admin`) est bloquée**
  (écran de paiement).
- **Les salariés (`/poseur`) continuent de pointer normalement.** Les heures
  s'accumulent ; c'est la patronne qui paie pour les voir / exporter.
- ✅ **Rien à coder côté poseur** : le verrou n'existe que sur `/admin`. Le
  `/poseur` n'a aucune garde paywall → Option A est déjà respectée par
  construction.

## 🔒 Garantie K.HABITAT (et toute entreprise « illimitée »)

Vérifié en base : **K Habitat** a `trial_ends_at = NULL` **et**
`subscription_status = 'active'`. La logique `inTrial = (trial_ends_at != null) && !active`
fait que, avec une date NULL, `inTrial` est **toujours faux** → `expired` faux →
`blocked` faux. **K.HABITAT ne sera jamais bloquée**, quel que soit l'état de
l'interrupteur ou de Stripe. (C'est la seule entreprise sans essai aujourd'hui.)

---

## 1. Côté STRIPE — passer en LIVE (préalable, à faire par Ergun)

1. **Produits & prix (mode LIVE)** : recréer les 3 offres dans Stripe *Live* et
   noter les 3 nouveaux `price_id` (`price_…` live).
2. **Mettre à jour la table `subscription_plans`** avec les price IDs LIVE
   (SQL sur la prod, additive) :
   ```sql
   update public.subscription_plans set stripe_price_id = '<price_live_1>' where code = '<code_1>';
   update public.subscription_plans set stripe_price_id = '<price_live_2>' where code = '<code_2>';
   update public.subscription_plans set stripe_price_id = '<price_live_3>' where code = '<code_3>';
   ```
   (Vérifier d'abord les `code`/`stripe_price_id` actuels :
   `select code, label, stripe_price_id, amount_eur from public.subscription_plans order by sort;`)
3. **Webhook LIVE** : Stripe *Developers → Webhooks → Add endpoint* →
   URL = `https://sdperbcquvneohotjono.functions.supabase.co/stripe-webhook`
   → événements : `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   Noter le **Signing secret** (`whsec_…`).
4. **Secrets Supabase (prod)** — *Edge Functions → Secrets* :
   - `STRIPE_SECRET_KEY` = clé **live** (`sk_live_…`)
   - `STRIPE_WEBHOOK_SECRET` = `whsec_…` du endpoint live
5. (Optionnel mais conseillé) activer la **facturation Stripe** (TVA, factures
   PDF automatiques) — le champ `tva_intra` existe déjà côté entreprise.

## 2. Côté CODE — l'interrupteur propre (petit changement, à coder le moment venu)

Remplacer le verrou « hostname » par une **variable d'environnement** dédiée,
dans `app/admin/page.tsx` :

```js
// AVANT
const isPreview = typeof window !== 'undefined' && window.location.hostname.startsWith('deploy-preview-');
const blocked = expired && isPreview;

// APRÈS
const paywallEnforced = process.env.NEXT_PUBLIC_PAYWALL_ENFORCED === 'true';
const blocked = expired && paywallEnforced;
```

- Par défaut (variable absente) → `blocked = false` → **prod ouverte** (aucun
  risque tant qu'on n'a pas posé la variable).
- Pour activer : poser `NEXT_PUBLIC_PAYWALL_ENFORCED=true` sur Netlify
  (contexte **Production**) et redéployer. Pour **désactiver en urgence** :
  repasser à `false` (ou supprimer) + redeploy — pas de changement de code.
- Documenter la variable dans `.env.example`.
- ⚠️ Ne rien changer côté `/poseur` (Option A).

> À coder dans une session dédiée, une fois Stripe live vérifié. **Pas maintenant.**

## 3. AVANT d'activer — savoir QUI serait bloqué (lecture seule)

Lancer ce SELECT (aucune écriture) pour voir l'impact réel :

```sql
select
  name,
  trial_ends_at,
  subscription_status,
  case
    when trial_ends_at is null then 'jamais bloquée (illimité)'
    when subscription_status = 'active' then 'OK (abonnée)'
    when now() > trial_ends_at then '⚠ SERAIT BLOQUÉE'
    else 'en essai — ' || ceil(extract(epoch from (trial_ends_at - now()))/86400)::text || ' j restants'
  end as etat_si_paywall_actif
from public.companies
order by trial_ends_at nulls first;
```

- Repérer les lignes « ⚠ SERAIT BLOQUÉE ».
- Pour celles qu'on ne veut pas bloquer tout de suite : **prolonger l'essai**
  avant d'activer, ex. :
  ```sql
  update public.companies set trial_ends_at = now() + interval '30 days'
  where id = '<company_id>';   -- ciblé, jamais en masse à l'aveugle
  ```

## 4. Test bout-en-bout (idéalement sur STAGING d'abord)

Sur la base **staging** (Stripe en mode **test**) :
1. Créer une entreprise de test, forcer l'expiration :
   `update companies set trial_ends_at = now() - interval '1 day' where id='<test>';`
2. Poser `NEXT_PUBLIC_PAYWALL_ENFORCED=true` sur le contexte preview.
3. Vérifier :
   - `/admin` de l'entreprise test → **écran de paiement** (bloqué).
   - `/poseur` d'un salarié de cette entreprise → **pointe toujours** (non bloqué). ✅ Option A
4. Payer avec une **carte test** Stripe (`4242 4242 4242 4242`, date future, CVC libre).
5. Retour `/admin?subscribed=1` → « Activation… » → le webhook bascule
   `subscription_status='active'` → **débloqué**.
6. Depuis Stripe (test) : *Cancel subscription* → webhook `deleted` →
   `canceled` → l'`/admin` **rebloque** (si l'essai est aussi expiré).

Une fois ce parcours vert sur staging, refaire une **validation ciblée en prod**
(sur une entreprise jetable ou la tienne avec un essai temporairement expiré),
puis activer pour de bon.

---

## Ordre recommandé le jour J

1. Crédits Netlify revenus + staging en place (voir `staging-setup.md`).
2. Stripe LIVE prêt (section 1) + test bout-en-bout sur staging (section 4).
3. SELECT « qui serait bloqué » (section 3) + prolonger les essais à préserver.
4. Coder l'interrupteur (section 2), déployer.
5. Poser `NEXT_PUBLIC_PAYWALL_ENFORCED=true` (Production) → activer.
6. Surveiller les premiers paiements réels.
