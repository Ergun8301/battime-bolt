# Audit v1 → v2 : menu, compte et journée du salarié (octobre 2026)

Demande d'Ergun (propriétaire) : « il n'y a aucun bouton de réglage concernant mon profil », « il manque un bouton de géolocalisation », « peut-être d'autres boutons déjà fonctionnels dans la v1 mais pas repris ». Règle : **aucun nouveau chantier** ; on ne restaure que ce qui existait ET marchait.

Méthode : lecture de l'ancien menu (`DropdownMenu` de `app/poseur/page.tsx`, branche `ui2 ? … : …`, toujours dans le code), de `components/poseur-day.tsx` (les branches `!ui2`), `poseur-week/month/history`, `lib/` (`position*.ts`, `live-session.ts`, `push.ts`), `components/geo-info-dialog.tsx`, `supabase/functions/_shared/saisie-profil.ts`, puis rejeu de l'écran v2 (`scripts/tests/equilibre-salarie.mjs`, rubrique « Accès »).

## 1. Le menu du compte (ancien menu déroulant → « Mon compte »)

| Fonction v1 | Présente en v2 ? | Où |
|---|---|---|
| Changer ma photo (appareil photo / galerie, RPC `update_my_photo`) | oui | « Mon compte » → « Changer ma photo » (restylé, ancre `menu.photo`) |
| Mes congés (demander, annuler) | oui | « Mon compte » → « Mes congés » (feuille du bas) |
| Assistant BEMEXO | oui, autrement | **retiré du menu à la demande d'Ergun** (doublon) ; reste le ✦ jaune de l'en-tête, visible sur tous les écrans (ancre `journee.assistant`) |
| Informations (l'endroit au pointage, lien vers la politique de confidentialité) | oui | « Mon compte » → « Informations » (feuille du bas) |
| Notifications : activer / couper / « bloquées » (masquées si l'appareil ne les gère pas) | oui | « Mon compte » → ligne de notifications (même logique `pushState`) |
| Ma journée / Ma semaine / Mon mois | oui, autrement | **barre du bas** (Journée · Semaine · Mois) ; lignes retirées du menu (doublon) |
| Historique | oui | « Mon compte » → « Historique » (n'est PAS dans la barre du bas) |
| Formations (quand il y en a, avec compteur) | oui | « Mon compte » → « Formations à voir » |
| Déconnexion | oui | « Mon compte » → « Déconnexion » |
| (v2 seulement) Réserves à lever, avec compteur | nouveau depuis l'étape 6 | « Mon compte » → « Réserves à lever » (la pastille de la journée disparaît pendant un pointage) |
| Mon équipe (chef d'équipe : bloc en haut de « Ma journée ») | oui | « Mon compte » → « Mon équipe » (page à part, chef seulement) |

## 2. L'en-tête et la journée

| Fonction v1 | Présente en v2 ? | Où |
|---|---|---|
| Icône scanner de la borne (en-tête) | oui | bouton « QR » de la barre d'action de la Journée (visible si une tablette est reliée) |
| « Retour à ma journée » (flèche) | oui | gardée sur Historique, Formations, Mon équipe et un jour ouvert ; plus sur Semaine et Mois (la barre du bas suffit) |
| Bandeau « N journées à envoyer » (+ liste) | oui | note de l'en-tête sombre (« Mardi 13 à envoyer · Ouvrir › », liste pour plusieurs jours) |
| Bandeau « chantiers pas encore partis » (hors ligne) | oui | gardé tel quel au-dessus de la liste |
| Bandeaux « réserves à lever », « formations à voir » | oui | pastilles de rappel sous la bande des jours + lignes de « Mon compte » ; **pastille rouge sur l'avatar** (remplace celle de l'ancien onglet « Plus ») |
| Panier, pauses, route, total, frise, dupliquer, copier la veille, éditeur d'heures, documents, envoi | oui | la Journée v2 (cartes, tuiles, feuilles) : rien n'a disparu (31 scripts v1 rejoués en v2, voir `baseline-scripts.md`) |
| Semaine / Mois / Historique (navigation par flèches, PDF de l'historique, « Interventions supprimées ») | oui | gardés ; le Mois gagne un résumé |

## 3. Profil et réglages : ce que la v1 ne proposait PAS (vérifié, rien créé)

| Demande d'Ergun | Existait en v1 ? | Constat |
|---|---|---|
| Nom, prénom | non | aucune saisie dans `/poseur` : le nom vient de la fiche créée par le bureau (invitation) |
| Numéro de téléphone | non | pas un champ du salarié dans `/poseur`, ni dans l'assistant (`saisie-profil.ts` = le « profil » d'une SAISIE : court / long / turc, pas le profil d'une personne) |
| Photo | **oui** | la seule rubrique de profil de la v1 : « Changer ma photo », **restaurée** (elle n'avait jamais disparu : c'est la première ligne de « Réglages ») |
| Mot de passe | non (dans l'écran salarié) | seulement la page publique `/mot-de-passe-oublie` (lien « mot de passe oublié » de la connexion) |
| Langue | non | aucune bascule : le turc n'existe que dans l'assistant et les guides |
| **Géolocalisation (bouton activer / désactiver)** | **non** | il n'y a **jamais eu** de bouton : l'enregistrement de l'endroit est un **réglage de l'ENTREPRISE** (`position_tracking_enabled`, côté bureau). Pour le salarié, la v1 faisait seulement : (1) la demande d'autorisation du téléphone au pointage en direct (jamais bloquante : refuser ne change pas le pointage), (2) une petite fenêtre d'information **une fois** avant la première collecte (`geo-info-dialog.tsx`, côté assistant), (3) l'explication permanente dans « Informations ». Tout cela est **inchangé en v2** (« Informations » est dans « Mon compte »). |

**Décision** : photo seule existait → déjà là ; nom, téléphone, mot de passe, langue, bouton de géolocalisation n'existaient pas → **non créés** (Ergun refuse un nouveau chantier). Si Ergun les veut, c'est un chantier à décider : une page « Mon profil » (lecture du nom et du téléphone, modification du téléphone), un lien de changement de mot de passe, et, pour la géolocalisation, un simple rappel de l'état de l'autorisation du téléphone (le réglage de fond reste celui de l'entreprise).
