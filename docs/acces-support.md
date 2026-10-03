# Lot 5 — Accès support BEMEXO

Derrière **`companies.support_enabled`** (désactivé par défaut, activable par
BEMEXO seulement : verrou `companies_support_flag_guard`).

## Ce que ça fait

| | |
|---|---|
| Patron | Réglages → « Support BEMEXO » : **Autoriser le support BEMEXO** (1 h / 24 h / 7 j), **Retirer l'accès**, journal des accès |
| Support | `/support` : connexion → double vérification (code à 6 chiffres) → entreprises qui l'ont autorisé → **Entrer** |
| Mode support | Même interface que le patron + bandeau rouge « Mode support · lecture seule · expire à … · Quitter » |
| Expiration | Automatique à l'heure dite ; « Quitter » ou fermer l'onglet fait sortir |
| Journal | Autorisé / retiré / entré / sorti, avec qui et quand. Lisible par le patron, **non modifiable** (même par la clé service) |

## Ce que la base vérifie (pas l'écran)

1. Le compte est dans `support_staff` (ajouté à la main, en SQL).
2. Sa session a passé la double vérification (jeton `aal2`).
3. L'entreprise a une autorisation active (non retirée, non expirée, 7 jours max).
4. L'entreprise a `support_enabled`.

Un seul verrou manquant → aucune ligne. Le support n'a **que des policies de
lecture** : toute écriture est refusée par la base.

Jamais visibles au support : bulletins, paie et n° de sécurité sociale, réglages
de coût, invitations, abonnements push.

## 100 % additif

Tables, fonctions et trigger **neufs**. Une policy `support_read` (SELECT) est
**ajoutée** sur 16 tables, à côté des policies existantes, qui ne sont ni
modifiées ni supprimées. Pour tout compte hors `support_staff`, la condition
est fausse : rien ne change.

## Aperçu (sans base ni compte)

`/apercu/acces-support?demo=support` — préviews uniquement.

## ⏰ Après feu vert d'Ergun

1. Migration `supabase/migrations/20260930090000_lot5_acces_support.sql`
2. Pour une entreprise pilote :
   `UPDATE public.companies SET support_enabled = true WHERE id = '…';`

## Compte support d'Ergun — pas à pas

> Le compte support est **distinct** du compte salarié d'Ergun.

1. **Créer le compte** sur la page d'inscription BEMEXO, avec une adresse
   dédiée (ex. `support@bemexo.com`) et le nom d'entreprise
   **« BEMEXO Support »**. Confirmer l'email.
   *Pas via « Add user » du tableau de bord Supabase : l'inscription exige une
   entreprise ou une invitation, la création échouerait.*
2. **L'inscrire comme support** (éditeur SQL Supabase) :
   ```sql
   INSERT INTO public.support_staff (user_id, label)
   SELECT id, 'Ergun — support BEMEXO' FROM auth.users WHERE email = 'support@bemexo.com';
   ```
   Contrôle : `SELECT count(*) FROM public.support_staff;` → 1
3. **Vérifier que la double vérification est allumée** : Supabase →
   Authentication → Multi-Factor → TOTP **Enabled** (c'est le réglage par défaut).
4. **Installer une application d'authentification** sur le téléphone
   (Google Authenticator, Microsoft Authenticator, 1Password…).
5. **Se connecter** avec le compte support, puis ouvrir **`/support`** :
   scanner le QR code, taper le code à 6 chiffres. C'est fait une fois ; ensuite
   chaque connexion demande mot de passe + code.
6. **Tester** : sur l'entreprise pilote, le patron clique « Autoriser le
   support BEMEXO » → elle apparaît sur `/support` → **Entrer**.

**Téléphone perdu** : Supabase → Authentication → Users → compte support →
supprimer le facteur MFA, puis refaire l'étape 5.

**Ne jamais** mettre `support_enabled` sur l'entreprise « BEMEXO Support ».

## Contrôles

- `npm run test:support-rls` — 51 vérifications sur une base jetable
- Captures : `docs/captures-acces-support/`
