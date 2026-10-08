# Configuration des e-mails BEMEXO (à faire à la main)

Objectif : que les e-mails BEMEXO arrivent en **boîte de réception**, pas en spam.

Le code de la PR s'occupe des liens, des modèles et des en-têtes.
Ce fichier liste ce qui se règle **dans les tableaux de bord**.

> Aucune clé ni aucun mot de passe ici. Rien à inventer : chaque valeur à coller est donnée.

---

## ⚠️ L'ordre compte

1. D'abord **fusionner la PR et laisser le site se déployer**.
2. Ensuite seulement, coller les nouveaux modèles dans Supabase.

Les modèles envoient vers `https://bemexo.com/auth/confirm`. Si cette page n'est pas encore en ligne, les liens tombent sur une 404.

**Vérification :** ouvrir https://bemexo.com/auth/confirm → la page doit afficher « Lien incomplet ». C'est normal : on l'ouvre sans lien d'e-mail.

---

## Étape 1 — Base de données : la table des désabonnements

Supabase → **SQL Editor** → coller et exécuter le fichier :

`supabase/migrations/20260928120000_email_desabonnements.sql`

Elle ajoute une seule table, `email_unsubscribes`, vide. Rien d'existant n'est modifié.

---

## Étape 2 — Déployer les fonctions

Depuis le dossier du projet, avec la CLI Supabase connectée au projet :

```
supabase functions deploy weekly-digest
supabase functions deploy cert-expiry-alerts
supabase functions deploy missing-days-reminders
supabase functions deploy budget-alerts
supabase functions deploy send-payroll-export
supabase functions deploy invite-worker
supabase functions deploy email-unsubscribe --no-verify-jwt
```

- `email-unsubscribe` **doit** avoir `--no-verify-jwt` : c'est la messagerie du destinataire qui l'appelle, sans être connectée à BEMEXO.
- Les fonctions importent `supabase/functions/_shared/email.ts`. La CLI l'embarque toute seule.
- Aucun nouveau secret : les fonctions utilisent `RESEND_API_KEY` (déjà en place).

---

## Étape 3 — Resend : couper le suivi

Resend → **Domains** → `bemexo.com` → **Configuration** :

| Réglage | Valeur |
|---|---|
| Click tracking | **Off** |
| Open tracking | **Off** |

**Pourquoi :**
- Le suivi des clics remplace chaque lien par un lien de redirection sur un autre domaine.
- Le suivi des ouvertures ajoute une image invisible.
- Les deux sont mal notés par Gmail et Outlook. Le suivi des clics peut aussi « consommer » un lien de connexion.

---

## Étape 4 — Supabase : adresse du site

Supabase → **Authentication** → **URL Configuration** :

| Champ | Valeur |
|---|---|
| Site URL | `https://bemexo.com` |
| Redirect URLs | garder celles déjà présentes, et vérifier que `https://bemexo.com/**` y est |

La Site URL est utilisée par les modèles : `{{ .SiteURL }}/auth/confirm…`.

---

## Étape 5 — Supabase : expéditeur SMTP

Supabase → **Authentication** → **Emails** → onglet **SMTP Settings** :

Ne changer **que** ces deux champs. L'hôte, le port, l'utilisateur et le mot de passe Resend restent tels quels.

| Champ | Valeur |
|---|---|
| Sender email | `notifications@bemexo.com` |
| Sender name | `BEMEXO` |

C'est la même adresse que celle des récaps et des rappels : un seul expéditeur, reconnu d'un e-mail à l'autre. Les réponses partent vers `contact@bemexo.com`, **à relever**.

---

## Étape 6 — Supabase : les modèles d'e-mails

Supabase → **Authentication** → **Emails** → onglet **Templates**.

Pour chaque modèle :
1. Remplacer l'**objet** (Subject).
2. Remplacer tout le **corps** (Message body) par le contenu du fichier indiqué (ouvrir le fichier, tout copier, tout coller).
3. Cliquer sur **Save**.

| Modèle Supabase | Objet à coller | Fichier à copier |
|---|---|---|
| Confirm signup | `Confirmez votre adresse e-mail — BEMEXO` | `supabase/templates/confirmation.html` |
| Invite user | `Invitation à rejoindre votre équipe sur BEMEXO` | `supabase/templates/invite.html` |
| Reset password | `Réinitialisez votre mot de passe BEMEXO` | `supabase/templates/recovery.html` |
| Change email address | `Confirmez votre nouvelle adresse e-mail — BEMEXO` | `supabase/templates/email_change.html` |
| Magic link | `Votre lien de connexion BEMEXO` | `supabase/templates/magic_link.html` |

Les liens déjà envoyés avec l'ancien modèle continuent de fonctionner.

### Obligatoire — durée de validité des liens : 24 h

Les e-mails d'invitation et de mot de passe oublié écrivent « Ce lien est valable 24 h ». Le réglage doit le dire aussi, **avant** de coller les modèles :

Supabase → **Authentication** → **Providers** → **Email** → *Email OTP Expiration* → **86400** → **Save**.

(Par défaut : 3600 s, soit 1 h. Un salarié ouvre souvent son invitation le soir ou le lendemain.)

### Obligatoire — règle de mot de passe (octobre 2026)

L'appli demande désormais : **8 caractères minimum, dont 1 lettre, 1 chiffre et 1 caractère spécial** (ex. `Fatih.2024`), sans majuscule obligatoire. Le serveur ne doit jamais être plus strict, sinon la personne coche tout puis se fait refuser. **À régler AVANT de fusionner la PR qui change la règle** (aujourd'hui le serveur exige encore 12 caractères avec majuscule) :

Supabase → **Authentication** → **Providers** → **Email** :

| Champ | Valeur |
|---|---|
| Minimum password length | **8** |
| Password Requirements | **Letters and digits** |

Aucun réglage Supabase ne sait exiger un caractère spécial sans exiger aussi une majuscule : « Letters and digits » est le plus proche (il impose une lettre et un chiffre, que l’appli demande aussi ; le caractère spécial est vérifié par l’appli seule).

---

## Étape 7 — DNS Infomaniak : DMARC

Aujourd'hui : `v=DMARC1; p=reject;` sans `rua`. La politique est stricte, mais vous ne recevez **aucun rapport** : si un envoi légitime échoue, personne ne le voit.

Infomaniak → **Domaines** → `bemexo.com` → **Zone DNS** → modifier l'enregistrement TXT `_dmarc` :

| Type | Nom | Valeur |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=reject; rua=mailto:dmarc@bemexo.com; adkim=r; aspf=r` |

- Créer l'adresse `dmarc@bemexo.com` (ou un alias vers votre boîte) **avant** de changer l'enregistrement.
- Les rapports arrivent chaque jour, en pièce jointe XML. Un outil gratuit (dmarcian, Postmark DMARC…) les rend lisibles.
- Ne pas toucher au SPF racine ni au DKIM Resend : ils sont bons.

---

## Étape 8 — Vérifier

**E-mails envoyés par les fonctions (Resend)**
1. Aller sur **https://www.mail-tester.com** et copier l'adresse de test affichée.
2. Dans BEMEXO → Réglages, envoyer un **export paie** à cette adresse.
3. Revenir sur mail-tester et afficher le score : viser **9/10 ou plus**. Le rapport dit ce qui reste à corriger.

**E-mails de connexion (Supabase)**
1. Se déconnecter, cliquer sur « Mot de passe oublié » et saisir **votre propre adresse**.
2. Vérifier que l'e-mail arrive en boîte de réception, en français, et que le bouton ouvre `bemexo.com/auth/confirm`.

À contrôler aussi, sur un e-mail reçu dans Gmail → ⋮ → **Afficher l'original** :

| Ligne | Attendu |
|---|---|
| SPF | PASS |
| DKIM | PASS (`bemexo.com`) |
| DMARC | PASS |
| Liens | tous sur `bemexo.com` |

### Optionnel — suivre sa réputation

**Google Postmaster Tools** (https://postmaster.google.com) : ajouter `bemexo.com` pour voir, jour par jour, comment Gmail juge vos envois.

---

## Ce que fait le code (pour mémoire)

| Sujet | Avant | Après |
|---|---|---|
| Liens des e-mails de connexion | `…supabase.co/auth/v1/verify…` | `https://bemexo.com/auth/confirm?…` |
| Langue des e-mails de connexion | modèles Supabase par défaut, en anglais | français, charte BEMEXO |
| Expéditeur des récaps et alertes | `contact@` ou `no-reply@` selon la fonction | `notifications@bemexo.com` partout |
| Répondre à | absent | `contact@bemexo.com` |
| Version texte | absente | ajoutée à chaque e-mail envoyé par les fonctions |
| Désabonnement (récap, rappels, alertes) | aucun | lien en pied d'e-mail + désabonnement en un clic dans Gmail / Outlook |
| Nom de l'employeur dans l'invitation | absent | « Martin Menuiserie vous invite… » |
