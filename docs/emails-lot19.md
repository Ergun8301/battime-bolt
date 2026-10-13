# E-mails du bureau (lot 19 du plan IA)

Le bureau peut **envoyer par e-mail le planning de la semaine** d'un ou de
plusieurs salariés (un PDF par personne) ou **un court message**. Il y a un
**plafond de 50 e-mails par jour et par entreprise**, un **journal** des envois,
et un lien **« Se désabonner »** dans chaque e-mail.

En une phrase : *le bureau clique sur « Envoyer par e-mail », choisit les salariés,
lit l'aperçu, confirme, et chacun reçoit son planning ou le message dans sa
boîte mail.*

## Ce que ça change pour le bureau

| Avant | Après |
|---|---|
| Pour donner son planning à un salarié : imprimer, ou le lui dire | Menu du compte (en haut à droite, sous le nom de l'entreprise) → **Envoyer par e-mail** ; sur téléphone : menu ☰ → **Envoyer par e-mail** |
| Un message au salarié : téléphone, SMS | Un court message (500 caractères) dans un e-mail à l'en-tête de l'entreprise |
| Aucune trace | « Derniers envois » : date, type, qui, résultat (jamais le texte) |
| — | « 12 e-mails aujourd'hui sur 50 » toujours visible |

L'envoi du **planning** et l'envoi de la **paie au comptable** restent deux
choses séparées : l'envoi au comptable n'a pas bougé (voir « Limites »).

## Comment ça se passe à l'écran

1. Ouvrir la fenêtre. Elle montre la **semaine affichée** sur le planning.
2. Choisir **Planning (PDF)** ou **Message**.
3. Cocher les salariés. Chaque ligne dit clairement ce qui est possible :
   - *avec adresse* : on peut cocher ; l'adresse de la fiche est affichée ;
   - **sans adresse** : grisé, « Pas d'adresse e-mail enregistrée » ;
   - **désabonné** : grisé. Pour un message : « le message n'est pas envoyé.
     Contactez cette personne autrement » ;
   - **rien cette semaine** (planning seulement) : grisé, pas de planning vide.
4. Lire l'**aperçu** : c'est le texte exact de l'e-mail (objet compris).
5. **Continuer**, puis **confirmer** : « Envoyer 3 e-mails ? » avec les noms. Rien
   ne part avant ce second clic.
6. Le résultat arrive **personne par personne** : *envoyé*, *ignoré* (avec la
   raison), *non envoyé* (le service d'e-mail a refusé : rien n'est parti) ou
   *incertain* (la réponse s'est perdue : l'e-mail est peut-être parti, ne pas le
   renvoyer tout de suite).

Sur téléphone (390 px), tout tient en largeur, chaque bouton et chaque ligne
fait au moins 44 px de haut. Captures : `docs/captures-emails-lot19/`.

## Ce que la personne reçoit

Un e-mail BEMEXO au nom de l'entreprise : « Bonjour Lucas, voici votre planning
pour la semaine du 19 au 25 octobre 2026, en pièce jointe (PDF). » ou « Le
bureau de Martin Menuiserie vous écrit : … ». En bas : le lien **Se désabonner**
(et l'en-tête de désabonnement en un clic des messageries). **Répondre** écrit à
l'adresse de l'entreprise si elle est renseignée dans les réglages, sinon à
`contact@bemexo.com` (et l'e-mail le dit honnêtement).

Le texte est **fixe** : seul le message du bureau est libre. Il reste du texte
simple : aucune mise en forme, aucun lien n'est fabriqué.

## Ce qui est protégé (en mots simples)

- **Seul l'administrateur de l'entreprise, actif, peut envoyer.** Pas un salarié,
  pas un chef d'équipe, pas un compte archivé, pas le support BEMEXO (qui voit
  l'écran en lecture seule, sans aucun envoi).
- **L'adresse n'est jamais envoyée par l'écran.** L'écran n'envoie que les
  numéros des salariés ; le serveur relit l'adresse dans la base et vérifie que
  la personne est active **et dans la même entreprise**. Une requête truquée ne
  peut pas faire écrire à une adresse choisie.
- **Plafond de 50 par jour et par entreprise** (jour de Paris), commun au
  planning et aux messages. Les places sont prises **avant** l'envoi, par la
  base, une demande à la fois : même 60 clics simultanés ne dépassent pas 50
  (prouvé). Un envoi refusé rend sa place ; un envoi incertain la garde.
  Message : « Limite quotidienne atteinte (50). Réessayez demain. »
- **Les désabonnés ne reçoivent rien.** Si la liste est illisible, rien n'est
  envoyé (jamais « dans le doute, on envoie »).
- **PDF vérifié** : type `application/pdf`, signature `%PDF`, fin `%%EOF`, 1 Mo au
  plus ; le nom du fichier est fabriqué par le serveur.
- **Doublon** : même contenu, même personne, dans la même minute = un seul envoi.
- **Un e-mail par destinataire** (le lien de désabonnement est personnel).
- **Jamais de renvoi automatique.** Si le service d'e-mail ne répond pas, le
  résultat est « incertain » et c'est le bureau qui décide.
- **Le journal ne garde ni le texte ni la pièce jointe** : l'adresse est
  *masquée* (`l***@example.com`) et *hachée*, le contenu seulement *haché*. Lisible
  par le bureau de l'entreprise seulement ; même la clé de service ne peut ni
  effacer ni vider ce journal.
- Aucun journal de la fonction n'écrit une adresse ou un texte : seulement des
  compteurs.

## Désabonnements : comment ça marche

L'ancienne table (`email_unsubscribes`) n'accepte que **quatre familles**
(récap hebdo, rappels, habilitations, budget) : on ne pouvait pas en ajouter sans
retirer une contrainte, ce que nos migrations s'interdisent. Une **nouvelle table**,
`email_unsubscribes_v2`, accueille les nouvelles familles (`planning-hebdo`,
`message-bureau`) **sans liste fermée** côté base ; la liste autorisée est dans
`supabase/functions/_shared/email.ts`. L'ancienne table et ses quatre familles ne
changent pas (et les e-mails de ces quatre familles sont **identiques octet pour
octet**, vérifié contre un relevé de l'ancien code).

La page `bemexo.com/desabonnement` et la fonction `email-unsubscribe` acceptent
maintenant les six familles et écrivent dans la bonne table. Le jeton signé est
propre à l'adresse **et** à la famille.

## Ordre de mise en ligne

Chaque étape peut attendre l'autre **sans rien casser** :

1. **La migration** `supabase/migrations/20261013190000_lot19_emails.sql`
   (éditeur SQL de Supabase). Puis la ligne de vérification (en tête du fichier,
   9 × `true`), puis l'inscription dans l'historique (nom exact : `lot19_emails`).
   Elle ne change rien d'existant : deux tables et trois fonctions neuves.
2. **Le site** (fusion de la branche, déploiement habituel). Tant que la fonction
   n'est pas en ligne, l'entrée « Envoyer par e-mail » du menu est visible ; au
   premier clic, la fenêtre dit « pas encore activé » **sans erreur** et l'entrée
   se cache pour le reste de l'onglet.
3. **Les fonctions** (CLI Supabase connectée au projet) :
   ```
   supabase functions deploy send-staff-email
   supabase functions deploy email-unsubscribe --no-verify-jwt
   ```
   - `send-staff-email` : **avec** la vérification du jeton (le défaut).
   - `email-unsubscribe` : à **redéployer** pour qu'elle accepte les deux
     nouvelles familles ; **toujours** `--no-verify-jwt` (c'est la messagerie du
     destinataire qui l'appelle).
   - Les autres fonctions d'e-mail (récap, rappels, alertes, export de paie)
     **n'ont pas besoin** d'être redéployées : leur comportement n'a pas changé.

**Secrets :** aucun nouveau. `RESEND_API_KEY` existe déjà côté Supabase (jamais
affichée ni lue ici). Si la clé manquait, la fonction répondrait « Envoi d'e-mail
non configuré » **avant** de prendre une place du plafond.

**Retour arrière** (en commentaire en tête de la migration) : *doux* = retirer les
trois fonctions (plus aucun envoi, le journal et les désabonnés sont gardés) ;
*complet* = retirer aussi les deux tables (⚠ on perd le journal et la liste des
désabonnés des nouvelles familles).

## Tester SANS écrire à de vrais salariés

Ne jamais tester sur des salariés réels. Sur une entreprise **de test** (pas la
démo) :

1. Créer deux salariés de test dont l'adresse est un **alias de votre propre
   boîte** : avec Gmail, `votrenom+salarie1@gmail.com` et
   `votrenom+salarie2@gmail.com` arrivent dans votre boîte. (Resend publie aussi
   des adresses de test, par exemple `delivered@resend.dev`, qui ne livrent à
   personne : à vérifier dans leur documentation avant usage.)
2. Un salarié sans adresse, pour voir « sans adresse ».
3. Envoyer un planning aux deux alias : vérifier l'objet, le PDF (le bon
   salarié, les bons chantiers), le pied avec **Se désabonner**, « Répondre ».
4. Cliquer « Se désabonner » dans l'e-mail de `salarie2` : rouvrir la fenêtre,
   la ligne est maintenant **désabonné** ; un message à lui est **bloqué avec
   explication**.
5. Cliquer deux fois de suite sur le même envoi : le second est « ignoré » (doublon).
6. Regarder « Derniers envois » : adresses masquées, jamais de texte.

**N'essayez pas d'atteindre 50 pour de vrai** : le plafond est prouvé par les
tests (voir plus bas), y compris en rafale.

## Limites

- **L'envoi de la paie au comptable n'est pas aligné** sur ce plafond ni sur ce
  journal : il garde sa propre table (`payroll_sends`), sa propre protection
  contre les doublons et son propre comportement, inchangés. L'aligner aurait
  demandé de le modifier alors que le lot 18 y travaille.
- **Pas de bouton dans la fiche du salarié** : le menu du compte (et le menu ☰)
  suffisent, et la fiche contient le code d'export que le lot 18 modifie en
  parallèle. On choisit une seule personne dans la liste.
- Le PDF montre les **interventions et absences** du planning (jour, horaire,
  chantier, adresse, note). Les tâches et les réunions n'y sont pas.
- Une adresse partagée par deux salariés reçoit **un seul** e-mail.
- Le plafond (50) est une constante unique, `DAILY_EMAIL_CAP`, dans
  `supabase/functions/_shared/staff-email-core.ts` ; il n'est pas réglable par
  entreprise. Le modifier = changer cette ligne et redéployer la fonction.
- Pas d'envoi différé ni de rappel automatique : tout part au clic de
  confirmation.
- Réabonner quelqu'un n'est pas possible depuis l'écran (c'est la décision de la
  personne) ; en cas de besoin, la ligne se retire en SQL.

## Pour les développeurs

| Quoi | Où |
|---|---|
| Migration | `supabase/migrations/20261013190000_lot19_emails.sql` |
| Fonction edge | `supabase/functions/send-staff-email/index.ts` (une fonction, trois actions : `etat`, `planning`, `message`) |
| Toutes les décisions | `supabase/functions/_shared/staff-email-run.ts` (transport et base injectés) |
| Règles pures (plafond, texte, PDF, gabarits) | `supabase/functions/_shared/staff-email-core.ts` |
| Résultat d'envoi (`sendResendOutcome`), familles, tables | `supabase/functions/_shared/email.ts` |
| Fenêtre du bureau | `components/staff-email-dialog.tsx`, `lib/staff-email.ts`, `lib/staff-email-flag.ts` |
| Entrées | menu du compte et menu ☰ de `components/admin-planning.tsx` / `admin-mobile-menu.tsx` |

**Une fonction plutôt que deux** : l'accès (admin actif, pas le support), le
plafond, le journal et les désabonnements sont communs ; une seule fonction =
un seul déploiement, une seule règle à relire.

**Fenêtre chargée à l'ouverture** (`lib/lazy-window.tsx`, jamais préchauffée) : au
chargement du bureau, **aucune requête de plus** (24 requêtes, budget du lot 29
inchangé) ; à l'ouverture, une réponse de la fonction + une lecture du planning
de la semaine. jsPDF n'arrive qu'à l'ouverture de la fenêtre, comme les exports.

### Contrôles

| Commande | Ce qu'elle prouve |
|---|---|
| `npm run test:emails-db` | la base : en-tête, mots interdits, additif et rejouable, plafond (rafale incluse), doublons, abus (salarié, chef d'équipe, archivé, autre entreprise, support, anonyme), retours arrière |
| `npm run test:emails` | règles pures, moteur (faux transport), Resend (faux `fetch`), désabonnements ; requêtes des anciennes familles inchangées |
| `npm run test:emails-fonction` | la vraie fonction de bout en bout sur un monde simulé (jeton, rôles, destinataire relu en base, plafond, clé absente, migration absente, journaux sans contenu) |
| `npm run test:emails-moteur-db` | le moteur branché sur la VRAIE base SQL jetable (rafale de demandes simultanées) |
| `npm run test:emails-ecrans` | la fenêtre dans le navigateur, 390 px : états, compteurs, désabonné, sans adresse, plafond, support, PDF valides |

Aucun de ces tests n'envoie un e-mail : le transport est injectable (faux dans
les tests), `fetch` est détourné, les adresses sont en `@example.com`.
