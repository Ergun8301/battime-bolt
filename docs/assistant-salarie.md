# Assistant BEMEXO côté salarié — lot 4

Le même bouton que le bureau, dans l'app salarié. On dicte ou on écrit ses heures ; l'assistant prépare le pointage ; le salarié vérifie puis « Enregistrer ».

| Point | Comment |
|---|---|
| Lecture des phrases | Lecteur local d'abord (« 7h30-12h Villa Dupont, 13h-16h30 Bureau Martin », « de 8h à midi », « hier… pause 30 min », « 8h/12h », service resto après minuit) ; IA seulement en secours |
| Chantier | Résolu dans la liste des chantiers du salarié. Inconnu ou ambigu → à choisir, jamais inventé |
| Chantier non dit | Pré-sélectionné depuis SON planning pour ce créneau (📅 « D’après votre planning — modifiable »). Rien au planning → « Choisir le chantier… » |
| Contrôles | Horaires illisibles, début = fin, > 14 h, pause trop longue, chevauchements, date hors période → refusé |
| Enregistrement | Uniquement après « Enregistrer », via `lib/worker-entry.ts` = le chemin de la saisie manuelle (sorti tel quel de `poseur-day.tsx`) : statut `draft`, anti-doublon, hors ligne, même RLS |
| Questions | Ses heures (semaine, hier, aujourd'hui) et son planning. Coût et collègues refusés |
| Quota | 20 demandes / jour / salarié (`WORKER_ASSISTANT_DAILY_LIMIT`) |
| Stockage | Un compteur (salarié, jour, nombre). Aucun contenu, aucun log |

Pause : champ modifiable dans le brouillon, enregistré dans `break_minutes` (colonne existante ; la saisie manuelle met 0).

## Phrases longues, plusieurs actions, français + turc : UNE fiche, « Tout confirmer »

Le salarié parle (ou écrit) librement, en français ou en turc, avec des phrases longues : « Ajoute-moi une intervention. J'ai travaillé aujourd'hui de 8h à midi, puis pause d'1h, puis de 13h à 17h sur un nouveau chantier : prénom Pierrick, nom Dupont, à Montagna 01250, pour la pose d'un store banne. »

- **Une fiche à confirmer** (`components/worker-multi-card.tsx`) : les DEUX créneaux (08:00-12:00 et 13:00-17:00), « Pause 1 h » entre les deux, « Total net : 8 h 00 », le bloc « Nouveau chantier » (Pierrick Dupont · Montagna 01250 · pose d'un store banne), puis les actions annexes dites dans la même phrase (panier, réserve, congé, envoi de la journée). Tout se corrige sur la fiche ; les erreurs sont recalculées à chaque modification. Un écart entre deux chantiers est « non compté », jamais « Pause ».
- **RIEN n'est enregistré avant « Tout confirmer »**, pas même un geste « simple » (panier, réserve) : en mode fiche, l'exécution immédiate du lot 7 n'existe pas.
- **Ordre** : chantier → heures → panier → réserve → congé → envoi (`supabase/functions/_shared/worker-multi-run.ts`, testé sans navigateur par `npm run test:worker-multi-run`). Un élément qui échoue bloque ceux qui en dépendent : l'envoi (irréversible) ne part jamais sans les heures, le panier et la réserve demandés dans la même phrase. Le congé est indépendant.
- **Le chantier** est créé à la confirmation seulement, après avoir cherché dans les chantiers actifs de l'entreprise un même nom + ville (« Dupont Pierrick » = « Pierrick Dupont » : réutilisé, rien n'est créé). Ville absente : la fiche la réclame (jamais inventée), « Tout confirmer » reste grisé. Il exige le réseau : hors ligne, refus clair, rien d'écrit. Le salarié peut insérer un chantier de son entreprise, pas le modifier ni le supprimer.
- **Rien ne disparaît sans un mot** : un créneau illisible, incohérent (plus de 14 h) ou dont la pause est plus longue que lui RESTE dans la fiche, en rouge, et « Tout confirmer » reste grisé tant qu'il n'est pas corrigé ou retiré ; une date que le code ne sait pas lire reste bloquante tant que le champ « Jour » n'a pas été regardé ; au-delà de 6 créneaux, les suivants sont nommés dans « Laissé de côté » (« Lecture rapide »). Un créneau retiré par erreur se remet avec « Remettre le créneau ». Une pause niée (« sans pause », « mola vermedim ») ne qualifie jamais l'écart entre deux créneaux.
- **Échec partiel** : dit clairement ce qui est fait et ce qui ne l'est pas. On ne promet un départ automatique que si les créneaux ont été gardés faute de réseau (un refus du serveur serait réessayé sans fin). La fiche est alors figée (jamais de « Réessayer » qui écrirait les lignes en double).
- **« Annuler »** retire les lignes d'heures écrites ET celles gardées sur le téléphone, puis défait le panier et la réserve. Le chantier créé RESTE (le salarié ne peut pas le supprimer ; le bureau peut l'archiver) et la demande de congé aussi (« Mes congés »). Après un envoi réussi : pas d'annulation globale, la correction passe par « Ma journée ».
- **Turc** : sélecteur de dictée « Français / Türkçe » au-dessus du champ (mémorisé par salarié et par appareil, français par défaut). Limite connue : les cartes, boutons et messages d'erreur restent en français ; seule la réponse libre suit la langue du salarié. La dictée turque dépend du navigateur (Chrome : `tr-TR` ; Safari iOS : selon la langue de dictée installée ; Firefox : pas de dictée) : **à vérifier sur un appareil réel avant mise en ligne**. Si le navigateur ne sait pas dicter en turc, le panneau le dit et revient sur Français.
- **Limite de saisie** : 1500 caractères côté salarié (compteur à partir de 1 200) ; le bureau reste à 500. Une phrase longue peut demander quelques secondes : « Je lis votre message… » au bout de 4 s ; si l'assistant ne peut pas répondre, la phrase est remise dans le champ.
- **Colonne `worksites.postal_code`** : aucune migration du dépôt ne la crée. La clé n'est envoyée que si un code postal est dit (le bureau garde exactement les mêmes requêtes) ; si la base la refuse, la création est rejouée sans elle et le code est gardé dans l'adresse. **À faire confirmer en production (lecture seule) avant la mise en ligne.**
- **Données personnelles** : nom, adresse et code postal d'un particulier partent au modèle (formule gratuite actuelle) et sont écrits dans `worksites`. Voir `docs/ia-v2.md` (formule payante et politique de confidentialité avant d'ouvrir à de vrais salariés).
- **Anciens navigateurs** : le client envoie `multi: true` ; sans ce drapeau, le serveur répond comme avant.

Préview : `/apercu/assistant-salarie?demo=salarie` propose la phrase d'Ergun (l'IA est simulée, la fiche est construite par le vrai code, aucune requête réseau). Tests : `npm run test:assistant-multi` (navigateur, captures dans `docs/captures-assistant-multi/`), `npm run test:worker-multi-run`, `npm run test:planning-writes`, `node scripts/tests/dictee.mjs out <captures>`.

## Préview

`/apercu/assistant-salarie?demo=salarie` — préviews uniquement ; le vrai lecteur de phrases, sur des chantiers fictifs.

## Mise en service (après feu vert d'Ergun)

1. Migration `supabase/migrations/20260929170000_lot4_assistant_salarie.sql`
2. `supabase functions deploy worker-assistant`
3. Secret facultatif `WORKER_ASSISTANT_DAILY_LIMIT`

## Tests

`npm run test:assistant-salarie` (phrases, ambiguïtés, incohérences, étanchéité, IA simulée) · `npm run test:assistant-salarie-rls`

## Lot 7 — « Me guider pas à pas »

Chaque réponse « guide » (ex. « comment je demande un congé ? ») garde sa fiche écrite et son bouton vers l'écran, puis ajoute **« Me guider pas à pas »** quand la fiche a un guidage : un anneau entoure le vrai bouton, une phrase par étape (voir `docs/guides-pas-a-pas.md`).

- Une fiche d'aide (`WORKER_GUIDE`) a un `id` stable ; sa fiche de guidage (`supabase/functions/_shared/worker-tours.ts`) porte le même `id`. 23 fiches : tout ce qui se fait sur un écran, chef d'équipe compris. Les fiches « collègues » et « assistant » (`ask:`) n'en ont pas.
- Voie locale et voie modèle fabriquent leurs boutons avec le **même** helper (`workerGuideLinks`) : raccourci, puis guide. Le modèle ne peut pas ajouter le guide d'une autre fiche. Aucun nouveau champ dans les réponses.
- Le guide ne fait rien à la place du salarié : pas d'écriture, pas de réseau, pas de toucher automatique.
- Mise en ligne : **le front d'abord, puis `worker-assistant`**. Aucune migration.
- Tests : `npm run test:guides` (Deno) et `node scripts/tests/guides-lot7.mjs out <dossier>` (navigateur).
- Retour : une étape de la fiche écrite « Historique » disait « Touchez un jour » alors que cet écran n'a pas de jour à toucher ; elle dit maintenant « Faites défiler : un bloc par jour ».
