# Mise en place d'une base STAGING (séparer prod / preview)

> But : les **déploiements preview** (deploy-preview-\*) et le **dev local** ne
> doivent plus taper la base de **production**. On crée une 2ᵉ base Supabase
> « staging » et on la branche uniquement sur le contexte *Deploy Preview* de
> Netlify.
>
> ⚠️ Aucune étape ci-dessous ne modifie la prod. On **lit** le schéma de prod
> (dump), on **écrit** uniquement dans la nouvelle base staging.

État du code (déjà en place, rien à coder) :
- `lib/supabase.ts` lit `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  et retombe sur la prod si elles sont absentes.
- Un **bandeau « STAGING »** discret (bas-gauche) s'affiche automatiquement dès
  que la base connectée n'est pas la prod → on voit tout de suite qu'on est sur
  la base de test.

Rappel des éléments à répliquer (audités) :
- **11 migrations** dans `supabase/migrations/` — mais elles sont *incrémentales*
  (elles supposent un schéma de base déjà présent). ⇒ **on ne peut pas** recréer
  le staging en les rejouant seules : il faut un **dump complet du schéma prod**.
- **3 buckets** Storage : `company-logos`, `worker-photos`, `chantier-docs` (+ leurs policies).
- **3 fonctions edge** : `invite-worker`, `stripe-checkout`, `stripe-webhook` (+ leurs secrets).
- **Réglages Auth** (URL de redirection, longueur de mot de passe, etc.).

---

## 1. Créer le projet Supabase staging

1. Dashboard Supabase → **New project** → nom `bemexo-staging` (offre gratuite OK).
2. Choisir la **même région** que la prod (`eu-west-3`) pour rester cohérent.
3. Noter, dans *Project Settings → API* :
   - **Project URL** → `https://<ref-staging>.supabase.co`
   - **anon / publishable key** (clé publique, pas la `service_role`).

## 2. Répliquer le SCHÉMA de prod → staging (le plus fiable : `supabase db dump`)

Depuis ton poste, avec la CLI Supabase installée (`npm i -g supabase` ou `brew install supabase/tap/supabase`).

```bash
# a) se connecter
supabase login

# b) DUMP DU SCHÉMA DE PROD (lecture seule — n'écrit rien en prod)
#    --schema-only = structure uniquement, AUCUNE donnée client copiée.
supabase link --project-ref sdperbcquvneohotjono
supabase db dump --schema-only -f staging_schema.sql
#    (dump aussi les rôles/policies : ajouter --keep-comments si besoin)

# c) APPLIQUER le schéma sur STAGING
supabase link --project-ref <ref-staging>
psql "postgresql://postgres:<mot-de-passe-staging>@db.<ref-staging>.supabase.co:5432/postgres" \
  -f staging_schema.sql
```

> Alternative sans CLI : *Dashboard prod → Database → Backups / ou SQL Editor*
> pour exporter le schéma, puis le coller dans le *SQL Editor* de staging.
> Si tu préfères, je peux aussi te générer un bundle SQL par **introspection
> lecture seule** de la prod (je ne lance rien sans ton feu vert).

Vérifier ensuite sur staging que les tables clés existent : `companies`, `users`,
`worksites`, `time_entries`, `planning_*`, `absences`, `clients`,
`subscription_plans`, l'enum `battime_role`, le trigger `handle_new_user`, les
fonctions `is_admin` / `get_my_company_id`.

## 3. Recréer les 3 buckets Storage (+ policies)

Dans *Dashboard staging → Storage* :
- Créer `company-logos`, `worker-photos`, `chantier-docs`.
- Rejouer les policies : elles sont dans les migrations
  `20260625120000_company_settings.sql`, `20260625150000_worker_photo.sql`,
  `20260625160000_chantier_documents.sql` (section storage) → copier/coller la
  partie `storage.*` dans le SQL Editor de staging.

## 4. Déployer les 3 fonctions edge sur staging (+ secrets Stripe en mode TEST)

```bash
supabase link --project-ref <ref-staging>
supabase functions deploy invite-worker
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
```

Secrets à poser sur staging (*Dashboard staging → Edge Functions → Secrets*),
**Stripe en mode TEST** ici (jamais les clés live sur le staging) :
- `STRIPE_SECRET_KEY` = clé **test** (`sk_test_…`)
- `STRIPE_WEBHOOK_SECRET` = secret du webhook **test** (voir guide paywall)
- (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement.)

## 5. Réglages Auth de staging (aligner sur la prod)

*Dashboard staging → Authentication* :
- **URL Configuration** → *Site URL* + *Redirect URLs* : ajouter les URLs de
  preview Netlify (`https://deploy-preview-*.netlify.app/**`) pour que les liens
  d'invitation / récupération reviennent au bon endroit.
- **Policies → Minimum password length = 6** (cohérent avec le front).
- Sessions : laisser *Time-box* / *Inactivity timeout* **désactivés**.

## 6. Brancher staging sur Netlify — previews UNIQUEMENT

*Netlify → Site settings → Environment variables → Add a variable* :

| Variable | Valeur | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref-staging>.supabase.co` | **Deploy Previews** (+ Branch deploys si utilisés) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon **staging** | **Deploy Previews** |

- **Contexte Production : NE PAS** définir ces variables (repli = prod), *ou*
  les définir explicitement avec les **valeurs prod** (plus propre — ceinture +
  bretelles). Si tu les mets, elles doivent être EXACTEMENT l'URL/clé prod
  actuelles (voir `lib/supabase.ts`).
- Scoper les variables au bon contexte est **la clé** : c'est ce qui fait que la
  prod continue sur sa base et que seules les previews vont sur staging.

## 7. Vérifier

1. Un nouveau **deploy preview** (après retour des crédits Netlify) doit :
   - afficher le **bandeau « STAGING · base de test »** en bas à gauche ;
   - permettre de créer un compte de test **sans** qu'il apparaisse en prod.
2. La **prod** (`battime.netlify.app`) : **aucun bandeau**, données réelles intactes.
3. En local, si tu mets les variables staging dans `.env.local`, le bandeau
   apparaît aussi → tu sais que tu ne touches pas la prod.

## 8. Nouveau process (important)

- Toute nouvelle **migration** : l'appliquer **d'abord sur staging**, tester en
  preview, puis sur la prod au moment du release. Fini les migrations appliquées
  directement en prod.
- Garder `supabase/migrations/` comme source de vérité versionnée.
