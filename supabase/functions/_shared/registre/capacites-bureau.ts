// Capacités du BUREAU (B1…B138, puis B139+) : ce que le patron peut faire ou demander dans BEMEXO.
// Couche STABLE du registre : ids jamais renumérotés ni réutilisés (T3). Contrat : docs/ia-etape3/00-conception-etape3.md §2.
// Généré UNE fois par scripts/registre-import.mjs depuis docs/ia-etape3/capacites-bureau.json (138 entrées ; libellés du cahier mot pour mot).
// Depuis, ce fichier est la SOURCE : on y ajoute les nouvelles capacités et on y ferme les dettes ; le script refuse de l'écraser.
// Lecture : aucun champ d'état = couverte par `outil` / `guides` ; `ecart` = couverte en partie ; `dette` = rien encore (échéance `avant`) ;
// `humain` = le dernier clic reste à l'humain (peut aller avec un `ecart` ou une `dette` : l'aide de l'assistant, ouvrir ou lire, manque).
// Les commentaires « navigation existante » notent les liens du code que les ouvreurs de la livraison 3b rattacheront à la capacité.
import type { Capacite } from './types.ts';

export const CAPACITES_BUREAU: Capacite[] = [
  // B1 · lire · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:planning
  {
    id: 'B1', cote: 'bureau', libelle: 'Voir la semaine, salarié par jour',
    genre: 'lire', niveau: 1,
    ecart: {
      livraison: '3c',
      note: "Outil de lecture lire_planning(du, au, salarie?, chantier?) qui rend case par case les interventions (client, ville, horaire prévu, note). Aujourd'hui seul NAV_ACTION:planning ramène à l'écran.",
    },
  },
  // B2 · lire · niveau 1
  {
    id: 'B2', cote: 'bureau', libelle: 'Lire une intervention : client, lieu, horaire prévu, créneau',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "Même outil lire_planning : client (pour « Autre », la note), produit · ville, horaire prévu, créneau matin / après-midi / soir / journée calculé sur l'horaire (day-part.ts). Aucune lecture de ce genre n'existe aujourd'hui.",
    },
  },
  // B3 · lire · niveau 1
  {
    id: 'B3', cote: 'bureau', libelle: 'Distinguer prévue / à envoyer / envoyée',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "lire_planning rend aussi l'état des heures de chaque case : prévue, saisie « à envoyer » (brouillon, ne compte pas), envoyée (début–fin et durée).",
    },
  },
  // B4 · lire · niveau 1
  {
    id: 'B4', cote: 'bureau', libelle: 'Voir « retirée », « ajoutée par le salarié », heures hors planning',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'lire_planning signale les cases retirées par le salarié, les interventions « ajoutées par le salarié » et les heures déclarées hors planning (client, durée, « saisi, à envoyer »).',
    },
  },
  // B5 · lire · niveau 1
  {
    id: 'B5', cote: 'bureau', libelle: 'Voir la réception (sans, réserve à traiter, levée, en cours)',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'lire_planning rend la réception de la journée (sans réserve / avec réserve à traiter / levée / chantier en cours).',
    },
  },
  // B6 · lire · niveau 1
  {
    id: 'B6', cote: 'bureau', libelle: "Voir le nombre de documents d'un chantier",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'lire_documents(chantier?) rend le nombre et la liste (nom, catégorie, date).',
    },
  },
  // B7 · lire · niveau 1
  {
    id: 'B7', cote: 'bureau', libelle: 'Voir qui pointe en direct, depuis quand',
    genre: 'lire', niveau: 1,
    outil: 'repondre',
  },
  // B8 · lire · niveau 1
  {
    id: 'B8', cote: 'bureau', libelle: "Voir l'absence du jour de chaque salarié",
    genre: 'lire', niveau: 1,
    outil: 'repondre',
    ecart: {
      livraison: '3c',
      note: "Aujourd'hui seulement : absents_aujourdhui (salarié, motif) dans l'instantané.",
    },
  },
  // B9 · lire · niveau 1
  {
    id: 'B9', cote: 'bureau', libelle: 'Voir « N jours en attente » / « À jour » par salarié',
    genre: 'lire', niveau: 1,
    outil: 'repondre',
    ecart: {
      livraison: '3c',
      note: "L'instantané ne dit que « qui n'a pas pointé HIER » (pas_pointe_hier).",
    },
  },
  // B10 · lire · niveau 1
  {
    id: 'B10', cote: 'bureau', libelle: "Voir réunions et tâches (x/y), même un jour d'absence",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'Outil lire_taches_reunions(salarie?, du, au) : réunions (titre, heure, lieu, participants) et tâches (texte, créneau, fait ou non).',
    },
  },
  // B11 · guider · niveau 1
  {
    id: 'B11', cote: 'bureau', libelle: 'Consulter la légende des codes visuels (ordinateur, papier)',
    genre: 'guider', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "Fiche d'aide « Légende » (couleurs matin / après-midi / soir, ✓ heures déclarées, ⋯ saisi non envoyé, réception, ajouté par le salarié, 📎, en cours, réunion). Aucune fiche ne la décrit aujourd'hui (GUIDE n'a pas de « legende »).",
    },
  },
  // B12 · naviguer · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:planning
  {
    id: 'B12', cote: 'bureau', libelle: "Changer de semaine, revenir à l'actuelle, lire S-NN",
    genre: 'naviguer', niveau: 1,
    guides: ['semaine'],
    ecart: {
      livraison: '3b',
      note: "Outil aller_a_date(date | « actuelle » | ±n semaines) qui appelle changeWeek et, sur téléphone, choisit aussi le jour (B13). Aujourd'hui l'assistant EXPLIQUE (fiche « semaine » + visite guidée) mais ne change pas la semaine ; le mécanisme existe côté écran (onOpenVersions appelle changeWeek).",
    },
  },
  // B13 · naviguer · niveau 1
  {
    id: 'B13', cote: 'bureau', libelle: "Téléphone : voir et agir sur la journée de son choix pour chaque salarié (aujourd'hui : un jour à la fois, une carte par salarié)",
    genre: 'naviguer', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: 'Même outil aller_a_date : sur téléphone il fixe le jour affiché (mobileDayIdx) ; sur ordinateur il ne fait que changer de semaine.',
    },
  },
  // B14 · lire · niveau 1
  {
    id: 'B14', cote: 'bureau', libelle: 'Rechercher un client, un salarié',
    genre: 'lire', niveau: 1,
    outil: 'repondre',
  },
  // B15 · ecrire · niveau 2
  {
    id: 'B15', cote: 'bureau', libelle: 'Créer une intervention (case, téléphone)',
    genre: 'ecrire', niveau: 2,
    guides: ['affecter'],
    outil: 'affecter_planning',
  },
  // B16 · ecrire · niveau 2
  {
    id: 'B16', cote: 'bureau', libelle: 'Créer une intervention en glissant un client',
    genre: 'ecrire', niveau: 2,
    outil: 'affecter_planning',
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: "À trancher : l'exposition renvoie à B15 (« Même outil que B15 ») sans dire elle-même si le geste est couvert. Exposition du cahier : Même outil que B15 (le geste de glisser n'est pas reproduit, il n'apporte rien de plus : client + salarié + jour, sans horaire).",
    },
  },
  // B17 · ecrire · niveau 2
  {
    id: 'B17', cote: 'bureau', libelle: 'Modifier horaire et note ; lire heures déclarées, photos',
    genre: 'ecrire', niveau: 2,
    guides: ['heure_note'],
    outil: 'modifier_intervention',
    ecart: {
      livraison: '3d2',
      note: "Outil existant modifier_intervention (jour, salarié, heure, note ; direct + Annuler). Écarts : il ne règle que le DÉBUT (la fin existante est gardée si elle reste après, sinon retirée) — pas de fin explicite ni de bouton « Effacer l'horaire »…",
    },
  },
  // B18 · ecrire · niveau 2
  {
    id: 'B18', cote: 'bureau', libelle: 'Déplacer, réordonner par glisser',
    genre: 'ecrire', niveau: 2,
    guides: ['deplacer'],
    outil: 'modifier_intervention',
    ecart: {
      livraison: '3d5',
      note: 'Déplacer : outil existant modifier_intervention (nouvelle_date, nouveau_salarie), avec les mêmes refus que le glisser (heures envoyées ou notées, pointage en cours, mois ou salarié clôturé : prepareMove).',
    },
  },
  // B19 · ecrire · niveau 2
  {
    id: 'B19', cote: 'bureau', libelle: 'Copier par glisser (Ctrl / Alt / Option / ⌘)',
    genre: 'ecrire', niveau: 2,
    outil: 'affecter_planning',
    ecart: {
      livraison: '3d2',
      note: 'Outil copier_intervention(source, cibles[]) : reprend client, horaire prévu et note (jamais les heures) et applique copyRefusal (absence, mois ou salarié clôturé, doublon, chevauchement). affecter_planning permet seulement de recréer à la main une…',
    },
  },
  // B20 · ecrire · niveau 2
  {
    id: 'B20', cote: 'bureau', libelle: "Copier vers d'autres jours ; dupliquer au lendemain",
    genre: 'ecrire', niveau: 2,
    outil: 'affecter_planning',
    ecart: {
      livraison: '3d2',
      note: 'Même outil copier_intervention (B19), « dupliquer au lendemain » = un jour de plus, même salarié. Écart : pas de lecture de la case source ni de refus motivés avec affecter_planning seul.',
    },
  },
  // B21 · lire · niveau 1
  {
    id: 'B21', cote: 'bureau', libelle: 'Comprendre un refus (verrou, absence, mois clôturé)',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "Outil lire_verrous(case) qui rend la raison exacte (heures envoyées, heures notées, pointage en cours, sortie oubliée, mois clôturé, salarié clôturé, absence) avec les mêmes règles que hardLock / moveLock / copyRefusal. Aujourd'hui seuls les refus des propres outils de l'assistant sont dits (checkAction : « Ce mois est clôturé… », « Ce salarié est absent… »).",
    },
  },
  // B22 · ecrire · niveau 3
  {
    id: 'B22', cote: 'bureau', libelle: 'Supprimer une intervention (confirmation si heures retirées)',
    genre: 'ecrire', niveau: 3,
    guides: ['retirer'],
    outil: 'supprimer_intervention',
  },
  // B23 · ecrire · niveau 2
  {
    id: 'B23', cote: 'bureau', libelle: 'Annuler une suppression ou une copie par glisser',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d1', avant: '2027-06-30',
      note: "Outil annuler_derniere_action : chaque action de l'assistant porte déjà sa fonction d'annulation (result.undo), branchée seulement sur le bouton « Annuler » de la carte.",
    },
  },
  // B24 · ecrire · niveau 3
  {
    id: 'B24', cote: 'bureau', libelle: 'Sélectionner plusieurs interventions (jour au téléphone) et les supprimer',
    genre: 'ecrire', niveau: 3,
    guides: ['selection'],
    outil: 'effacer_planning',
    ecart: {
      livraison: '3d5',
      note: "Outil existant effacer_planning (un salarié ou l'équipe, une période ou une semaine ; 62 jours au plus), avec carte de confirmation et « Annuler ».",
    },
  },
  // B25 · ecrire · niveau 2
  {
    id: 'B25', cote: 'bureau', libelle: "Poser une absence (plage ou jusqu'au retour)",
    genre: 'ecrire', niveau: 2,
    guides: ['absence'],
    outil: 'poser_absence',
    ecart: {
      livraison: '3d2',
      note: "Outil existant poser_absence, direct + Annuler (undoAbsence rend les absences remplacées). Écart : sans date de fin l'écran pose 90 jours « jusqu'au retour Présent » (HORIZON_DAYS) alors que l'outil pose UN seul jour (au = du) ; 90 jours au plus par appel.",
    },
  },
  // B26 · ecrire · niveau 3
  {
    id: 'B26', cote: 'bureau', libelle: 'Remettre « Présent »',
    genre: 'ecrire', niveau: 3,
    guides: ['present'],
    outil: 'supprimer_absence',
    ecart: {
      livraison: '3d5',
      note: "Outil existant supprimer_absence(salarie, du, au) avec carte et « Annuler ». Écart : « Présent » de l'écran ne retire que l'absence EN COURS dès la date (absenceRunFrom) et laisse les absences posées plus tard en le disant ; l'outil retire toute la plage donnée.",
    },
  },
  // B27 · ouvrir · niveau 1
  {
    id: 'B27', cote: 'bureau', libelle: 'Gérer les tâches du jour et les réunions',
    genre: 'ouvrir', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "Ouverture d'écran ouvrir_fenetre(ajouter, onglet=tâche|réunion, salarié, jour, heures) pré-rempli, sans écriture.",
    },
  },
  // B28 · ecrire · niveau 2
  {
    id: 'B28', cote: 'bureau', libelle: 'Attribuer un client à des heures « ajoutées par le salarié » ou sur « Autre »',
    genre: 'ecrire', niveau: 2,
    guides: ['attribuer'],
    outil: 'attribuer_client',
    ecart: {
      livraison: '3d1',
      note: "Outil existant attribuer_client, aujourd'hui en carte à confirmer sans « Annuler ». Écarts : il ne part que du client nommé exactement « Autre » (ou sans chantier), alors que l'écran sait aussi « changer le client » d'heures déjà attribuées…",
    },
  },
  // B29 · ecrire · niveau 2
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:nouveau_salarie
  {
    id: 'B29', cote: 'bureau', libelle: 'Inviter un salarié ; en importer par CSV/Excel',
    genre: 'ecrire', niveau: 2,
    guides: ['ajouter_salarie'],
    outil: 'inviter_salarie',
  },
  // B30 · ecrire · niveau 2
  {
    id: 'B30', cote: 'bureau', libelle: 'Gérer les invitations en attente',
    genre: 'ecrire', niveau: 2,
    guides: ['relancer'],
    outil: 'relancer_invitation',
    ecart: {
      livraison: '3d5',
      note: "Outil existant relancer_invitation (envoie ou renvoie UNE invitation ; le renvoi invalide l'ancien lien).",
    },
  },
  // B31 · ecrire · niveau 3
  {
    id: 'B31', cote: 'bureau', libelle: 'Changer un rôle (confirmation des droits)',
    genre: 'ecrire', niveau: 3,
    guides: ['role'],
    outil: 'changer_role',
  },
  // B32 · ecrire · niveau 2
  {
    id: 'B32', cote: 'bureau', libelle: 'Modifier la fiche salarié (identité, paie)',
    genre: 'ecrire', niveau: 2,
    guides: ['fiche_salarie'],
    outil: 'modifier_salarie',
    ecart: {
      livraison: '3d1',
      note: 'Outil existant modifier_salarie : prénom, nom, téléphone seulement (jamais le n° de sécurité sociale).',
    },
  },
  // B33 · ecrire · niveau 2
  {
    id: 'B33', cote: 'bureau', libelle: 'Gérer les habilitations ; valider un bulletin pour le coût réel (si IA)',
    genre: 'ecrire', niveau: 2,
    guides: ['habilitations'],
    outil: 'ajouter_habilitation',
  },
  // B34 · ecrire · niveau 3
  {
    id: 'B34', cote: 'bureau', libelle: 'Archiver, réactiver, supprimer un salarié ; clôturer (et archiver) / rouvrir ses heures',
    genre: 'ecrire', niveau: 3,
    guides: ['archiver_salarie'],
    outil: 'archiver_salarie',
    ecart: {
      livraison: '3d4',
      note: 'Outil existant archiver_salarie (ses heures restent, il ne peut plus se connecter), carte à confirmer.',
    },
  },
  // B35 · ecrire · niveau 2
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:nouveau_client
  {
    id: 'B35', cote: 'bureau', libelle: 'Créer un client ; en importer par CSV/Excel',
    genre: 'ecrire', niveau: 2,
    guides: ['creer_client'],
    outil: 'creer_chantier',
    ecart: {
      livraison: '3d5',
      note: "Outil existant creer_chantier, direct (sans budget) + Annuler (supprime le client, ou l'archive s'il a servi). Écart : le champ « Type de produit » de l'écran n'existe pas dans l'outil.",
    },
  },
  // B36 · ecrire · niveau 2
  {
    id: 'B36', cote: 'bureau', libelle: "Modifier la fiche client et son budget ; l'archiver ou la supprimer",
    genre: 'ecrire', niveau: 2,
    guides: ['fiche_client', 'budget'],
    outil: 'modifier_client',
    ecart: {
      livraison: '3d1',
      note: "Outil existant modifier_client (seuls les champs remplis changent ; aujourd'hui carte à confirmer, sans « Annuler »). Écart : pas de « Type de produit ».",
    },
  },
  // B37 · ecrire · niveau 2
  {
    id: 'B37', cote: 'bureau', libelle: "Gérer les documents d'un chantier (catégories, droits) ; les envoyer au client",
    genre: 'ecrire', niveau: 2,
    guides: ['documents'],
    outil: 'ranger_document',
    ecart: {
      livraison: '3d5',
      note: "Outil existant ranger_document : ne fonctionne qu'avec un fichier joint au chat (JPEG, PNG, WebP, HEIC ou PDF, 8 Mo au plus : ATTACH_ACCEPT et ATTACH_MAX_BYTES), classé dans un chantier existant avec sa catégorie dite ou devinée ; direct + Annuler.",
    },
  },
  // B38 · ecrire · niveau 2
  {
    id: 'B38', cote: 'bureau', libelle: 'Terminer, rouvrir un chantier ; lire son bilan',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d2', avant: '2027-06-30',
      note: "Outil à créer terminer_chantier(chantier, date) : avertissements jamais bloquants (réserves, pointages en cours, brouillons, interventions à venir : loadFinishCheck) à dire avant d'agir ; rien n'est supprimé ; « Annuler » = rouvrir (B101) ; bilan (B102).",
    },
  },
  // B39 · lire · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:salarie
  {
    id: 'B39', cote: 'bureau', libelle: "Lire la feuille d'heures d'un salarié",
    genre: 'lire', niveau: 1,
    guides: ['feuille'],
    ecart: {
      livraison: '3c',
      note: "Outil lire_heures(salarie, du, au) : total, heures supplémentaires, lignes (date, client, début–fin, durée, pause, panier, route, état brouillon / envoyée / corrigée / QR / sortie oubliée), SANS taux ni coût (ia-vision.md:44). Aujourd'hui : le lien « Fiche de X » ouvre la feuille d'heures (mode hours) et la fiche d'aide « feuille » la décrit ; l'instantané ne donne que le total d'heures du MOIS par salarié.",
    },
  },
  // B40 · ecrire · niveau 2
  {
    id: 'B40', cote: 'bureau', libelle: 'Corriger des heures (motif, salarié prévenu) ; renvoyer une journée ; supprimer un brouillon vide',
    genre: 'ecrire', niveau: 2,
    guides: ['corriger'],
    outil: 'corriger_pointage',
    ecart: {
      livraison: '3d2',
      note: 'Outil existant corriger_pointage (début, fin, motif ; même chemin que la fiche : office_correct_entry, salarié prévenu).',
    },
  },
  // B41 · ecrire · niveau 2
  {
    id: 'B41', cote: 'bureau', libelle: 'Relancer (à la main ou automatiquement) ; détail de « à relancer »',
    genre: 'ecrire', niveau: 2,
    guides: ['rappel'],
    outil: 'envoyer_rappel',
    ecart: {
      livraison: '3d5',
      note: "Outil existant envoyer_rappel (notification sur le téléphone du salarié ; carte à confirmer). Écart : sans notification activée, l'outil échoue (« utilisez la cloche ») alors que l'écran prépare un e-mail (mailto) ; pas d'« Annuler » possible (message envoyé).",
    },
  },
  // B42 · ecrire · niveau 2
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:conges
  {
    id: 'B42', cote: 'bureau', libelle: 'Accepter ou refuser un congé',
    genre: 'ecrire', niveau: 2,
    guides: ['demandes_conge'],
    outil: 'repondre_conge',
  },
  // B43 · humain · niveau 3
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:export
  {
    id: 'B43', cote: 'bureau', libelle: "Exporter l'équipe (PDF, Excel, CSV)",
    genre: 'humain', niveau: 3,
    guides: ['export', 'telecharger'],
    humain: {
      categorie: 'niveau3_valide',
      raison: "Export qui verrouille les heures de la période (liste du niveau 3 validée, ia-vision.md:37). Le fichier est fabriqué dans le navigateur par runExport (admin-planning.tsx), pas par un outil côté serveur : l'assistant prépare, l'humain clique.",
    },
    ecart: {
      livraison: '3c',
      note: "Outil à créer preparer_export(periode, format) : ouvre « Exporter l'équipe » avec la période choisie, dit combien de lignes de combien de salariés seraient verrouillées (B135) et s'arrête : l'humain fait le clic « Exporter ▾ » puis le choix de l'alerte. Aujourd'hui : NAV_ACTION:export ouvre la fenêtre sans période, et deux fiches d'aide expliquent.",
    },
  },
  // B44 · humain · niveau 3
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:export
  {
    id: 'B44', cote: 'bureau', libelle: "Envoyer l'export au comptable sans doublon",
    genre: 'humain', niveau: 3,
    guides: ['export'],
    humain: {
      categorie: 'niveau3_valide',
      raison: 'Envoi des heures au comptable : e-mail externe avec pièce jointe, verrouille les heures, non rappelable (liste du niveau 3 validée, ia-vision.md:37).',
    },
    ecart: {
      livraison: '3c',
      note: "Outil preparer_export(periode, destination=comptable) : ouvre la fenêtre, dit si l'adresse du comptable est enregistrée (sinon le bouton est désactivé) et si la période est déjà partie (avertissement du serveur) ; l'humain clique « Envoyer à… ».",
    },
  },
  // B45 · humain · niveau 3
  {
    id: 'B45', cote: 'bureau', libelle: "Choisir le verrou avant l'export",
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'niveau3_valide',
      raison: "C'est le garde-fou de l'export (décision de verrouiller ou non, lot 18) : le choix est le dernier clic humain par construction.",
    },
  },
  // B46 · ecrire · niveau 3
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:export
  {
    id: 'B46', cote: 'bureau', libelle: 'Clôturer / rouvrir un mois',
    genre: 'ecrire', niveau: 3,
    guides: ['cloture'],
    outil: 'cloturer_mois',
    ecart: {
      livraison: '3d4',
      note: "Outil existant cloturer_mois : carte à confirmer qui donne le mois ; le nombre de journées en brouillon qui resteront bloquées (askClosure) est affiché par l'écran mais PAS par la carte de l'assistant (à ajouter avant le clic).",
    },
  },
  // B47 · ouvrir · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:salarie
  {
    id: 'B47', cote: 'bureau', libelle: 'Exporter un seul salarié, sans verrou',
    genre: 'ouvrir', niveau: 1,
    guides: ['telecharger', 'feuille'],
    ecart: {
      livraison: '3b',
      note: "Ouverture d'écran ouvrir_fenetre(feuille_heures, salarié, période) : la fiche s'ouvre sur la bonne période, la personne touche « Exporter ▾ ». Aujourd'hui le lien « Fiche de X » ouvre la fiche sans choisir la période.",
    },
  },
  // B48 · ouvrir · niveau 1
  {
    id: 'B48', cote: 'bureau', libelle: 'Imprimer le planning en A4 paysage (semaine, jour, mois ; options ; Ctrl/Cmd+P)',
    genre: 'ouvrir', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "Ouverture d'écran ouvrir_fenetre(imprimer, période, salarié|équipe, signature, tâches) : le menu s'ouvre pré-rempli, ou l'impression est lancée jusqu'à l'écran du navigateur (ia-vision.md:19).",
    },
  },
  // B49 · ouvrir · niveau 1
  {
    id: 'B49', cote: 'bureau', libelle: "Versions d'une semaine : voir, revenir, annuler, garder",
    genre: 'ouvrir', niveau: 1,
    guides: ['versions'],
    ecart: {
      livraison: '3b',
      note: "Ouverture d'écran ouvrir_fenetre(versions, semaine). Aujourd'hui : après une action en bloc de l'assistant, un lien « Versions de la semaine » (versionsWeek → onOpenVersions) ouvre la fenêtre ; sinon la fiche « versions ».",
    },
  },
  // B50 · lire · niveau 1
  {
    id: 'B50', cote: 'bureau', libelle: "Lire l'historique des suppressions et décalages",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'Outil lire_journal_suppressions(salarie?, période) : qui, quand, avant → après (planning, heures, tâches, réunions).',
    },
  },
  // B51 · lire · niveau 1
  {
    id: 'B51', cote: 'bureau', libelle: 'Statistiques (heures, heures sup, absences, oublis, coût)',
    genre: 'lire', niveau: 1,
    outil: 'repondre',
    ecart: {
      livraison: '3c',
      note: "Outil lire_stats(periode, date, métrique, salarié?) sur team-stats-core. Aujourd'hui seul le total d'heures du MOIS par salarié est dans l'instantané.",
    },
  },
  // B52 · lire · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:couts
  {
    id: 'B52', cote: 'bureau', libelle: 'Coût par chantier et dépenses',
    genre: 'lire', niveau: 1,
    guides: ['couts'],
    outil: 'repondre',
    ecart: {
      livraison: '3c',
      note: "Déjà : heures totales, budget, main-d'œuvre en euros et avancement par chantier (instantané, sur toute la vie du chantier) et lien « Coût chantiers ». Manque : la période (ce mois / semaine / créneau), la route, la liste et le total des dépenses, « taux manquant : coût incomplet » → outil lire_cout_chantier(chantier, période).",
    },
  },
  // B53 · lire · niveau 1
  {
    id: 'B53', cote: 'bureau', libelle: "Voir les pièces jointes de l'entreprise par chantier",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'Outil lire_documents(chantier?, catégorie?) : total, détail par chantier (nom, catégorie, date).',
    },
  },
  // B54 · ecrire · niveau 2
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:reserves
  {
    id: 'B54', cote: 'bureau', libelle: 'Registre des réserves : lever, rouvrir',
    genre: 'ecrire', niveau: 2,
    guides: ['reserves', 'lever_reserve'],
    outil: 'lever_reserve',
    ecart: {
      livraison: '3d1',
      note: "Outil existant lever_reserve (note facultative), aujourd'hui carte à confirmer sans « Annuler ». Écarts : la photo facultative de l'écran n'existe pas dans l'outil ; l'outil écrit par setReserveResolution (admin-writes) alors que l'écran passe par liftReserve (reserve-lift) : deux chemins…",
    },
  },
  // B55 · humain · niveau 3
  {
    id: 'B55', cote: 'bureau', libelle: 'Relier une tablette (QR ou code), la remplacer, la déconnecter ; régler ses horaires, lire son état',
    genre: 'humain', niveau: 3,
    guides: ['borne'],
    humain: {
      categorie: 'appareil',
      raison: "Appairage d'un appareil : le code est affiché à l'écran de la tablette, le QR est scanné avec le téléphone du patron et « Associer cette tablette ? » se confirme à l'écran — c'est la preuve de présence physique (ia-v2.md:257 : « Accès support, borne : sécurité, code affiché à l'écran »).",
    },
    ecart: {
      livraison: '3b',
      note: "Ouverture d'écran ouvrir_fenetre(borne) + fiche d'aide « borne » (visite guidée).",
    },
  },
  // B56 · humain · niveau 3
  {
    id: 'B56', cote: 'bureau', libelle: 'Gérer le QR fixe imprimable',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'appareil',
      raison: "Activation avec avertissement légal à confirmer (« Activer le QR fixe… »), impression d'un QR physique, régénération qui invalide l'ancien QR, point de référence pris avec la position de l'appareil du patron (geolocation) : gestes d'écran à confirmer un par un.",
    },
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "Ouverture d'écran + explication seulement (ouvrir_fenetre(borne)).",
    },
  },
  // B57 · lire · niveau 1
  {
    id: 'B57', cote: 'bureau', libelle: 'Gérer les formations (ajouter, suivre qui a vu quoi, retirer / remettre, quota vidéo)',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'Outil lire_formations(formation?, salarié?) : titre, type (vidéo, lien, document), destinataires, x/y vues avec qui et quand, quota vidéo utilisé.',
    },
  },
  // B58 · humain · niveau 3
  {
    id: 'B58', cote: 'bureau', libelle: 'Envoyer planning PDF ou message aux salariés',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'niveau3_valide',
      raison: 'E-mails groupés (liste du niveau 3 validée, ia-vision.md:37) : plusieurs personnes, 50 e-mails par jour au plus, non rappelables ; la fenêtre impose déjà une confirmation « Envoyer N e-mails ? ».',
    },
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: 'Outil preparer_email_salaries(mode, destinataires, semaine, texte) : ouvre la fenêtre avec les destinataires cochés et le texte écrit, dit ceux qui ne peuvent pas être choisis (sans adresse, adresse invalide) et le quota du jour…',
    },
  },
  // B59 · ecrire · niveau 2
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:reglages
  {
    id: 'B59', cote: 'bureau', libelle: "Régler l'entreprise (logo, coordonnées)",
    genre: 'ecrire', niveau: 2,
    guides: ['reglages'],
    outil: 'modifier_reglages',
    ecart: {
      livraison: '3d5',
      note: "Outil existant modifier_reglages : téléphone, e-mail, adresse, code postal, ville (carte à confirmer aujourd'hui, sans « Annuler »). Manquent le nom, le SIRET, la TVA intracom. et le logo (B117).",
    },
  },
  // B60 · ecrire · niveau 2
  {
    id: 'B60', cote: 'bureau', libelle: 'Régler heures & paie',
    genre: 'ecrire', niveau: 2,
    guides: ['reglages'],
    outil: 'modifier_reglages',
    ecart: {
      livraison: '3d5',
      note: "Outil existant modifier_reglages : horaire de base, majorations, route payée. Manquent le panier repas (B118) et la caisse de congés BTP (B119) ; l'adresse du comptable est traitée à part (B122, destinataire de la paie).",
    },
  },
  // B61 · ecrire · niveau 2
  {
    id: 'B61', cote: 'bureau', libelle: 'Régler borne & pointage',
    genre: 'ecrire', niveau: 2,
    guides: ['collegues', 'position'],
    outil: 'modifier_reglages',
    ecart: {
      livraison: '3d5',
      note: "Outil existant modifier_reglages pour « Les salariés voient le planning de leurs collègues » (effet immédiat, RPC set_colleagues_planning). Manque : désactiver l'endroit au pointage (B120).",
    },
  },
  // B62 · ecrire · niveau 2
  {
    id: 'B62', cote: 'bureau', libelle: 'Régler notifications et alertes',
    genre: 'ecrire', niveau: 2,
    guides: ['recap'],
    outil: 'modifier_reglages',
    ecart: {
      livraison: '3d4',
      note: 'Outil existant modifier_reglages : relance automatique, heure, alertes de budget. Manquent « Envoyer le récap maintenant » (B121) et « Vérifier les habilitations » (B96) ; le support BEMEXO est B63.',
    },
  },
  // B63 · humain · niveau 3
  {
    id: 'B63', cote: 'bureau', libelle: 'Autoriser ou retirer le support BEMEXO ; lire son journal ; voir le mode support',
    genre: 'humain', niveau: 3,
    guides: ['support'],
    humain: {
      categorie: 'droits_acces',
      raison: "Droits d'accès : donner à un tiers (le support BEMEXO) l'accès à l'entreprise (tableau du niveau 3, ia-vision.md:35). Le patron doit faire ce clic lui-même.",
    },
    ecart: {
      livraison: '3b',
      note: "Fiche d'aide « support » + visite guidée, et ouverture des Réglages ; l'assistant n'autorise rien.",
    },
  },
  // B64 · humain · niveau 3
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:reglages
  {
    id: 'B64', cote: 'bureau', libelle: "Voir l'essai, s'abonner, gérer l'abonnement ; subir le blocage d'essai",
    genre: 'humain', niveau: 3,
    guides: ['abonnement'],
    humain: {
      categorie: 'paiement',
      raison: "Abonnement et paiement (liste du niveau 3 validée, ia-vision.md:37) : paiement sur page Stripe hébergée (stripe-checkout), jamais d'action de l'assistant.",
    },
    ecart: {
      livraison: '3b',
      note: "Outil ouvrir_fenetre(abonnement) qui ouvre « Choisissez votre abonnement » (forfait recommandé selon le nombre de salariés) ; l'humain choisit et paie sur la page Stripe. Aujourd'hui : fiche d'aide « abonnement » et Réglages, sans ouvrir la fenêtre d'abonnement.",
    },
  },
  // B65 · ouvrir · niveau 1
  {
    id: 'B65', cote: 'bureau', libelle: 'Ouvrir le menu du compte ; se déconnecter',
    genre: 'ouvrir', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "Ouverture d'écran ouvrir_fenetre(compte) (menu du compte, ou ☰ sur téléphone).",
    },
  },
  // B66 · guider · niveau 1
  {
    id: 'B66', cote: 'bureau', libelle: "Dialoguer avec l'assistant (écrit, voix, pièce jointe)",
    genre: 'guider', niveau: 1,
    guides: ['assistant'],
  },
  // B67 · humain · niveau 3
  {
    id: 'B67', cote: 'bureau', libelle: "Faire agir l'assistant (Annuler / Modifier, confirmations)",
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'hors_ecran',
      raison: "Le clic « Confirmer », « Annuler » ou « Modifier » d'une carte est le dernier clic humain lui-même (ia-vision.md:35) : il ne peut pas être fait par l'assistant.",
    },
  },
  // B68 · guider · niveau 1
  {
    id: 'B68', cote: 'bureau', libelle: 'Guide pas à pas ; nouveau chat, historique (à venir, non fusionné)',
    genre: 'guider', niveau: 1,
    guides: [
      'ajouter_salarie', 'importer_salaries', 'creer_client', 'importer_clients', 'affecter', 'absence',
      'demandes_conge', 'corriger', 'export', 'cloture', 'couts', 'budget', 'reserves', 'role', 'reglages',
      'documents', 'relancer', 'semaine', 'deplacer', 'heure_note', 'retirer', 'selection', 'versions', 'present',
      'attribuer', 'annuler_invitation', 'rappel', 'fiche_client', 'archiver_client', 'supprimer_client',
      'fiche_salarie', 'archiver_salarie', 'cloture_salarie', 'feuille', 'habilitations', 'cout_reel', 'reouvrir',
      'telecharger', 'lever_reserve', 'depense', 'envoyer_client', 'borne', 'support', 'abonnement', 'recap', 'caisse',
      'collegues', 'assistant',
    ],
  },
  // B69 · guider · niveau 1
  {
    id: 'B69', cote: 'bureau', libelle: "Être aidé : démarrage, astuce de copie, infobulles, saisie d'heure",
    genre: 'guider', niveau: 1,
    guides: ['ajouter_salarie', 'creer_client'],
    ecart: {
      livraison: '3b',
      note: "L'aide de démarrage (Ajoutez un salarié, Créez un client) correspond aux fiches « ajouter_salarie » et « creer_client ». L'astuce de copie n'a pas de fiche (lien avec B19, B20) ; infobulles et champ d'heure (« 14h », « 14:30 ») sont des aides passives : l'assistant les remplace par ses réponses, rien à exposer.",
    },
  },
  // B70 · lire · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:conges, NAV_ACTION:reserves
  {
    id: 'B70', cote: 'bureau', libelle: 'Voir invitations, congés, réserves, pièces en attente',
    genre: 'lire', niveau: 1,
    outil: 'repondre',
    ecart: {
      livraison: '3c',
      note: "Déjà : congés en attente (instantané, liste avec dates) et liens vers Congés et Réserves. Manquent le nombre de réserves à traiter, d'invitations non activées et de pièces comme données lisibles : lire_reserves (B109), lire_invitations (B86), lire_documents (B53).",
    },
  },
  // B71 · humain · niveau 1
  {
    id: 'B71', cote: 'bureau', libelle: "Gérer les états : chargement, erreurs, messages d'action, hors ligne, vide, essai, lecture seule, options absentes",
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'hors_ecran',
      raison: "États d'écran, pas des capacités : l'assistant ne les pilote pas, il les subit ; en mode support (lecture seule) les écritures sont refusées par la base elle-même.",
    },
  },
  // B72 · ouvrir · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:salaries, NAV_ACTION:clients, NAV_ACTION:conges, NAV_ACTION:reserves, NAV_ACTION:couts, NAV_ACTION:export, NAV_ACTION:reglages
  {
    id: 'B72', cote: 'bureau', libelle: "Téléphone : atteindre depuis un point d'entrée unique toutes les fonctions de la barre du bureau, avec leurs intitulés",
    genre: 'ouvrir', niveau: 1,
    ecart: {
      livraison: '3b',
      note: "Un seul outil ouvrir_fenetre(cible) qui couvre tout le menu. Aujourd'hui 11 cibles NAV existent (dont 7 sont des entrées du menu ☰ : Salariés, Chantiers, Demandes de congé, Réserves, Coût chantiers, Exporter, Réglages)…",
    },
  },
  // B73 · ouvrir · niveau 1
  {
    id: 'B73', cote: 'bureau', libelle: "Ouvrir le statut d'un salarié (Présent, Congé, Arrêt maladie, Intempérie, Feuille d'heures) (fenêtre, détail de B25 et B26)",
    genre: 'ouvrir', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "ouvrir_fenetre(statut, salarié, jour) : la fenêtre s'ouvre au bon salarié et au bon jour, sans rien écrire (pré-remplir est libre, ia-vision.md:33).",
    },
  },
  // B74 · ouvrir · niveau 1
  {
    id: 'B74', cote: 'bureau', libelle: 'Ouvrir une intervention pour la modifier (fenêtre Intervention : client, adresse, Fiche, Documents, horaire, note, heures déclarées)',
    genre: 'ouvrir', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: 'ouvrir_fenetre(intervention, salarié, jour, chantier).',
    },
  },
  // B75 · ouvrir · niveau 1
  {
    id: 'B75', cote: 'bureau', libelle: 'Ouvrir « Ajouter » pré-rempli sur une case (salarié, jour, client, horaire, note)',
    genre: 'ouvrir', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "ouvrir_fenetre(ajouter, …) : montre la fiche remplie et laisse l'humain valider avec « Ajouter au planning ».",
    },
  },
  // B76 · ouvrir · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:clients
  {
    id: 'B76', cote: 'bureau', libelle: "Ouvrir la fiche d'un client (nom, produit, téléphone, e-mail, ville, adresse, description, budget, chantier terminé)",
    genre: 'ouvrir', niveau: 1,
    guides: ['fiche_client'],
    ecart: {
      livraison: '3b',
      note: "ouvrir_fenetre(fiche_client, chantier). Aujourd'hui NAV_ACTION:clients n'ouvre que la LISTE (menu déroulant, ou « Chantiers » sur téléphone), jamais la fiche d'un client précis.",
    },
  },
  // B77 · ouvrir · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:salarie
  {
    id: 'B77', cote: 'bureau', libelle: "Ouvrir la fiche d'un salarié (Gérer le salarié, ou Feuille d'heures)",
    genre: 'ouvrir', niveau: 1,
    guides: ['fiche_salarie', 'feuille'],
    ecart: {
      livraison: '3b',
      note: "ouvrir_fenetre(fiche_salarie, salarié, mode, période). Aujourd'hui : le lien « Fiche de X » (action salarie:<id>, posé par « repondre » avec salarie_id) ouvre TOUJOURS la feuille d'heures (setFicheMode('hours')), jamais « Gérer le salarié ».",
    },
  },
  // B78 · ouvrir · niveau 1
  {
    id: 'B78', cote: 'bureau', libelle: "Ouvrir les documents d'un chantier (onglets Photos / Fichiers par jour)",
    genre: 'ouvrir', niveau: 1,
    guides: ['documents'],
    ecart: {
      livraison: '3b',
      note: "ouvrir_fenetre(documents, chantier, jour?). Aujourd'hui seule la fiche d'aide « documents » dit comment faire ; aucun lien ne l'ouvre.",
    },
  },
  // B79 · ecrire · niveau 2
  {
    id: 'B79', cote: 'bureau', libelle: "Réordonner les interventions d'une même case (détail de B18)",
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: 'Outil reordonner_interventions(salarié, jour, ordre[]).',
    },
  },
  // B80 · ecrire · niveau 3
  {
    id: 'B80', cote: 'bureau', libelle: 'Rouvrir un mois clôturé (détail de B46)',
    genre: 'ecrire', niveau: 3,
    guides: ['reouvrir'],
    ecart: {
      livraison: '3d4',
      note: "Outil rouvrir_mois(mois) en carte à confirmer. Aujourd'hui seule la fiche d'aide « reouvrir » le dit ; l'écran rouvre en un clic, sans confirmation, et supprime la ligne de clôture.",
    },
  },
  // B81 · ecrire · niveau 3
  {
    id: 'B81', cote: 'bureau', libelle: "Clôturer les heures d'un salarié jusqu'à une date, avec archivage en un geste pour une fin de contrat (détail de B34)",
    genre: 'ecrire', niveau: 3,
    guides: ['cloture_salarie'],
    ecart: {
      livraison: '3d4',
      note: "Outil cloturer_heures_salarie(salarié, date, archiver?) en carte : dire avant le nombre de brouillons qui resteront bloqués. Aujourd'hui seule la fiche d'aide « cloture_salarie » existe.",
    },
  },
  // B82 · ecrire · niveau 3
  {
    id: 'B82', cote: 'bureau', libelle: "Rouvrir les heures d'un salarié clôturées (détail de B34)",
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d4', avant: '2027-06-30',
      note: 'Outil rouvrir_heures_salarie(salarié) en carte ; ne supprime rien (reopened_at).',
    },
  },
  // B83 · ecrire · niveau 3
  {
    id: 'B83', cote: 'bureau', libelle: 'Renvoyer une journée au salarié : elle repasse en brouillon, avec un motif (détail de B40)',
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d4', avant: '2027-06-30',
      note: 'Outil renvoyer_journee(salarié, date, motif) en carte : la journée ne compte plus tant que le salarié ne la renvoie pas, et il est prévenu.',
    },
  },
  // B84 · ecrire · niveau 2
  {
    id: 'B84', cote: 'bureau', libelle: "Corriger la pause, le panier ou la route d'une journée envoyée (détail de B40)",
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d2', avant: '2027-06-30',
      note: "Extension d'un outil existant. Étendre corriger_pointage (aujourd'hui début et fin seulement : assistant-actions-core.ts, outil corriger_pointage) aux champs break_minutes, meal_allowance et gap_before de correctOfficeEntry.",
    },
  },
  // B85 · ecrire · niveau 3
  {
    id: 'B85', cote: 'bureau', libelle: 'Supprimer un brouillon vide (0 minute) du salarié (détail de B40)',
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: 'Outil supprimer_brouillon_vide(salarié, date) : relu et revérifié avant (des heures tapées entre-temps le gardent) ; « Annuler » existant (restoreDrafts).',
    },
  },
  // B86 · lire · niveau 1
  {
    id: 'B86', cote: 'bureau', libelle: 'Lire la liste des invitations en attente (nom, e-mail, « Invitée le JJ/MM ») (détail de B30)',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "Outil lire_invitations() : qui n'a pas activé son compte, depuis quand, envoyée ou non.",
    },
  },
  // B87 · ecrire · niveau 3
  {
    id: 'B87', cote: 'bureau', libelle: 'Supprimer une invitation en attente : retire le compte jamais connecté (détail de B30)',
    genre: 'ecrire', niveau: 3,
    guides: ['annuler_invitation'],
    outil: 'annuler_invitation',
  },
  // B88 · humain · niveau 3
  {
    id: 'B88', cote: 'bureau', libelle: "Envoyer toutes les invitations non envoyées d'un coup (envoi groupé) (détail de B30)",
    genre: 'humain', niveau: 3,
    guides: ['relancer'],
    humain: {
      categorie: 'niveau3_valide',
      raison: 'E-mails groupés (liste du niveau 3 validée, ia-vision.md:37) : un e-mail par salarié, envoi un par un avec arrêt à la première erreur, confirmation « Envoyer N e-mails ? ».',
    },
    ecart: {
      livraison: '3b',
      note: "Ouvrir la liste et dire combien d'invitations partiraient ; l'humain clique « Envoyer toutes… » puis confirme la fenêtre du navigateur.",
    },
  },
  // B89 · humain · niveau 3
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:salaries
  {
    id: 'B89', cote: 'bureau', libelle: "Importer des salariés par fichier CSV/Excel : un compte et un e-mail d'invitation par ligne (détail de B29)",
    genre: 'humain', niveau: 3,
    guides: ['importer_salaries'],
    humain: {
      categorie: 'niveau3_valide',
      raison: "E-mails groupés (une invitation par ligne) et correspondance des colonnes à contrôler à l'écran (ia-v2.md:255 : « Imports CSV : correspondance des colonnes à l'écran → lien »).",
    },
    ecart: {
      livraison: '3b',
      note: "Ouvrir la fenêtre d'import et guider. NAV_ACTIONS n'a pas de cible « import_salaries » (seulement import_clients) : le guide ouvre « Salariés », pas l'import.",
    },
  },
  // B90 · ecrire · niveau 3
  {
    id: 'B90', cote: 'bureau', libelle: "Modifier les infos de paie d'un salarié : taux horaire, horaire hebdomadaire propre, date d'embauche, type de contrat, matricule de paie (détail de B32)",
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d4', avant: '2027-06-30',
      note: "Outil modifier_paie_salarie en carte. Aujourd'hui l'assistant ne peut renseigner contrat, taux et heures hebdo qu'à la CRÉATION du salarié (inviter_salarie, savePayrollBasics), jamais les modifier ensuite. Contrat §5.1 (3d-4) : l'outil modifier_paie_salarie est SUPPRIMÉ (le taux et le matricule partiraient chez le modèle) ; à sa place une capacité humain (donnee_sensible), ouvrir_fenetre(salarie.fiche, rubrique=paie) sans aucune valeur et un filtre local sur les phrases de paie.",
    },
  },
  // B91 · humain · niveau 3
  {
    id: 'B91', cote: 'bureau', libelle: "Saisir ou modifier le n° de sécurité sociale d'un salarié (détail de B32)",
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'donnee_sensible',
      raison: "Donnée de paie sensible : jamais lue, jamais écrite ni envoyée au modèle (ia-vision.md:44 ; assistant-actions-core.ts scrubNir). Le salarié ou le bureau la tape à l'écran.",
    },
  },
  // B92 · ecrire · niveau 3
  {
    id: 'B92', cote: 'bureau', libelle: 'Réactiver un salarié archivé (détail de B34)',
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d4', avant: '2027-06-30',
      note: "Outil reactiver_salarie en carte (redonne l'accès : « droits d'accès », niveau 3). Manque d'écran : la fiche d'un archivé est inatteignable depuis la liste Salariés (cahier §2F) ; l'assistant devrait pouvoir la retrouver par son nom.",
    },
  },
  // B93 · humain · niveau 3
  {
    id: 'B93', cote: 'bureau', libelle: "Supprimer un salarié qui n'a aucune donnée (détail de B34)",
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'niveau3_valide',
      raison: "Suppression définitive (liste du niveau 3 validée) d'un compte, sans « Annuler » possible ; règle actuelle de la consigne : « Clients, chantiers et salariés : archiver, jamais supprimer » (assistant-actions-core.ts).",
    },
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "À trancher : l'exposition du cahier ne dit pas l'état actuel (ni couvert, ni partiel, ni outil à créer nommé comme sien). Exposition du cahier : L'assistant propose l'archivage (archiver_salarie) à la place et montre la fiche ; la suppression définitive d'un compte est le clic de l'humain.",
    },
  },
  // B94 · ecrire · niveau 3
  {
    id: 'B94', cote: 'bureau', libelle: "Supprimer une habilitation d'un salarié (détail de B33)",
    genre: 'ecrire', niveau: 3,
    outil: 'supprimer_habilitation',
  },
  // B95 · lire · niveau 1
  {
    id: 'B95', cote: 'bureau', libelle: "Lire les habilitations d'un salarié et leurs échéances (« expire dans N j ») (détail de B33)",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'Outil lire_habilitations(salarié?, dans_jours?) : « qui a un CACES qui expire bientôt ».',
    },
  },
  // B96 · ecrire · niveau 3
  {
    id: 'B96', cote: 'bureau', libelle: "Vérifier les habilitations maintenant : e-mail d'alerte tout de suite (détail de B62)",
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d4', avant: '2027-06-30',
      note: "Outil verifier_habilitations_maintenant : déclenche la fonction cert-expiry-alerts (e-mail d'alerte) ; réponse « Rien à signaler » ou nombre d'alertes.",
    },
  },
  // B97 · lire · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:conges
  {
    id: 'B97', cote: 'bureau', libelle: 'Lire les demandes de congé, en attente et traitées (détail de B42)',
    genre: 'lire', niveau: 1,
    guides: ['demandes_conge'],
    outil: 'repondre',
    ecart: {
      livraison: '3c',
      note: "Déjà : les congés EN ATTENTE sont dans l'instantané (conges_en_attente) et le lien « Demandes de congé » existe. Manquent les demandes déjà traitées (acceptées, refusées, motif) : lire_conges(statut, salarié?).",
    },
  },
  // B98 · ecrire · niveau 2
  {
    id: 'B98', cote: 'bureau', libelle: 'Archiver un client (il sort des listes, ses heures et documents restent) (détail de B36)',
    genre: 'ecrire', niveau: 2,
    guides: ['archiver_client'],
    outil: 'archiver_client',
  },
  // B99 · humain · niveau 3
  {
    id: 'B99', cote: 'bureau', libelle: "Supprimer un client qui n'a aucune donnée liée (détail de B36)",
    genre: 'humain', niveau: 3,
    guides: ['supprimer_client'],
    humain: {
      categorie: 'niveau3_valide',
      raison: "Suppression définitive (liste du niveau 3 validée) sans « Annuler » ; règle de la consigne : « jamais supprimer » un client (assistant-actions-core.ts). L'écran écrit directement dans la table worksites (hors lib/*-writes.ts).",
    },
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "À trancher : l'exposition du cahier ne dit pas l'état actuel (ni couvert, ni partiel, ni outil à créer nommé comme sien). Exposition du cahier : La fiche d'aide « supprimer_client » explique et renvoie vers la fiche ; l'assistant propose d'archiver.",
    },
  },
  // B100 · humain · niveau 3
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:import_clients
  {
    id: 'B100', cote: 'bureau', libelle: 'Importer des clients par fichier CSV/Excel (détail de B35)',
    genre: 'humain', niveau: 3,
    guides: ['importer_clients'],
    humain: {
      categorie: 'doute_patron',
      raison: "Correspondance des colonnes et contrôle des lignes à l'écran (ia-v2.md:255), création en masse (par paquets de 200) sans « Annuler » ni passage par lib/*-writes.ts.",
    },
  },
  // B101 · ecrire · niveau 2
  {
    id: 'B101', cote: 'bureau', libelle: 'Rouvrir un chantier terminé (détail de B38)',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d2', avant: '2027-06-30',
      note: "Outil rouvrir_chantier(chantier) : il redevient proposé aux salariés ; rien d'autre ne change.",
    },
  },
  // B102 · lire · niveau 1
  {
    id: 'B102', cote: 'bureau', libelle: "Lire le bilan d'un chantier (lecture seule) (détail de B38)",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "Outil lire_bilan_chantier(chantier) : ce que la fenêtre affiche (loadBilan/buildBilan) — heures validées, route, heures en attente (brouillons), heures par salarié, main-d'œuvre (total), dépenses par catégorie, réserves ouvertes/levées, nombre de documents…",
    },
  },
  // B103 · ecrire · niveau 2
  {
    id: 'B103', cote: 'bureau', libelle: "Changer la catégorie ou le nom d'un document de chantier (Devis, Plan, PV de réception, Photo, Réserve, Facture, Facture payée, Autre) (détail de B37)",
    genre: 'ecrire', niveau: 2,
    outil: 'modifier_document',
  },
  // B104 · ecrire · niveau 3
  {
    id: 'B104', cote: 'bureau', libelle: 'Supprimer un document ou une photo de chantier (détail de B37)',
    genre: 'ecrire', niveau: 3,
    outil: 'supprimer_document',
  },
  // B105 · humain · niveau 3
  {
    id: 'B105', cote: 'bureau', libelle: "Envoyer les documents d'un chantier au client : adresse enregistrée une fois, e-mail préparé avec des liens valables 7 jours (détail de B37)",
    genre: 'humain', niveau: 3,
    guides: ['envoyer_client'],
    humain: {
      categorie: 'appareil',
      raison: "Envoi de documents à un tiers : l'application ne l'envoie pas, elle ouvre la messagerie du patron avec le message prêt (mailto) ; le patron relit et envoie. Les liens signés valent 7 jours.",
    },
    ecart: {
      livraison: '3b',
      note: "L'assistant enregistre l'adresse (modifier_client, champ email, même effet que « OK » de la fenêtre), ouvre la fenêtre Documents et s'arrête avant « Ouvrir l'e-mail ». Aujourd'hui : fiche d'aide « envoyer_client » seule.",
    },
  },
  // B106 · ecrire · niveau 2
  {
    id: 'B106', cote: 'bureau', libelle: 'Ajouter une dépense à un chantier : chantier, catégorie, montant, date, libellé (détail de B52)',
    genre: 'ecrire', niveau: 2,
    guides: ['depense'],
    outil: 'ajouter_depense',
  },
  // B107 · ecrire · niveau 3
  {
    id: 'B107', cote: 'bureau', libelle: 'Supprimer une dépense (détail de B52)',
    genre: 'ecrire', niveau: 3,
    outil: 'supprimer_depense',
  },
  // B108 · ecrire · niveau 2
  {
    id: 'B108', cote: 'bureau', libelle: 'Rouvrir une réserve levée : elle repasse « À traiter » (détail de B54)',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d1', avant: '2027-06-30',
      note: "Outil rouvrir_reserve(réserve) ; sert d'« Annuler » à lever_reserve. Aujourd'hui seule la fiche d'aide « lever_reserve » mentionne « Rouvrir ».",
    },
  },
  // B109 · lire · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:reserves
  {
    id: 'B109', cote: 'bureau', libelle: 'Lire les réserves de chantier, à traiter et levées, groupées par chantier (détail de B54)',
    genre: 'lire', niveau: 1,
    guides: ['reserves'],
    ecart: {
      livraison: '3c',
      note: "Outil lire_reserves(statut, chantier?) : détail, date, salarié, comment elle a été levée (qui, quand, note, photo). Aujourd'hui : lien « Réserves » et fiches d'aide ; la fonction lit 50 réserves ouvertes pour lever_reserve mais ne les donne pas au modèle comme donnée.",
    },
  },
  // B110 · ecrire · niveau 3
  {
    id: 'B110', cote: 'bureau', libelle: "Prévenir par notification les participants d'une réunion (option « Prévenir par notification ») (détail de B27)",
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: "Option de enregistrer_reunion (B115) : l'assistant crée la réunion SANS prévenir par défaut ; la notification aux participants est une étape à part, en carte (plusieurs personnes). notifyMeeting dit ce qui a changé.",
    },
  },
  // B111 · ecrire · niveau 2
  {
    id: 'B111', cote: 'bureau', libelle: "Ajouter une tâche au jour d'un salarié : texte, moment ou heures de…à… (détail de B27)",
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d2', avant: '2027-06-30',
      note: 'Outil ajouter_tache(salarié, jour, texte, créneau?).',
    },
  },
  // B112 · ecrire · niveau 3
  {
    id: 'B112', cote: 'bureau', libelle: 'Retirer une tâche (retrait confirmé) (détail de B27)',
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d4', avant: '2027-06-30',
      note: 'Outil retirer_tache en carte (suppression, D3).',
    },
  },
  // B113 · ecrire · niveau 2
  {
    id: 'B113', cote: 'bureau', libelle: 'Ajouter une tâche habituelle (modèle réutilisable) (détail de B27)',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: 'Outil ajouter_tache avec garder_comme_habituelle=oui (addTemplate), ou outil séparé.',
    },
  },
  // B114 · ecrire · niveau 3
  {
    id: 'B114', cote: 'bureau', libelle: 'Retirer une tâche habituelle (détail de B27)',
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: 'Outil retirer_tache_habituelle en carte (suppression, D3).',
    },
  },
  // B115 · ecrire · niveau 2
  {
    id: 'B115', cote: 'bureau', libelle: "Créer ou modifier une réunion : titre, date, heure, fin et lieu facultatifs, toute l'équipe ou participants (détail de B27)",
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d2', avant: '2027-06-30',
      note: 'Outil enregistrer_reunion(…) créée sans notification (la notification est B110).',
    },
  },
  // B116 · ecrire · niveau 3
  {
    id: 'B116', cote: 'bureau', libelle: 'Retirer une réunion (confirmé) (détail de B27)',
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d4', avant: '2027-06-30',
      note: "Outil retirer_reunion en carte (suppression, D3), sans « Annuler » à l'écran.",
    },
  },
  // B117 · ecrire · niveau 2
  {
    id: 'B117', cote: 'bureau', libelle: "Régler le nom de l'entreprise, le SIRET, la TVA intracom. et le logo (détail de B59)",
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: "Extension d'un outil existant. Étendre modifier_reglages à ces champs (aujourd'hui absents : modifier_reglages n'a ni nom, ni SIRET, ni TVA, ni logo).",
    },
  },
  // B118 · ecrire · niveau 2
  {
    id: 'B118', cote: 'bureau', libelle: 'Activer ou couper le panier repas (détail de B60)',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: "Extension d'un outil existant. Étendre modifier_reglages (panier_repas) via saveMealEnabled.",
    },
  },
  // B119 · ecrire · niveau 2
  {
    id: 'B119', cote: 'bureau', libelle: 'Régler la caisse de congés BTP (taux ajouté au coût réel) (détail de B60)',
    genre: 'ecrire', niveau: 2,
    guides: ['caisse'],
    ecart: {
      livraison: '3d5',
      note: "Étendre modifier_reglages. Aujourd'hui seule la fiche d'aide « caisse » existe.",
    },
  },
  // B120 · ecrire · niveau 2
  {
    id: 'B120', cote: 'bureau', libelle: "Désactiver l'endroit au pointage (on ne peut que le désactiver) (détail de B61)",
    genre: 'ecrire', niveau: 2,
    guides: ['position'],
    ecart: {
      livraison: '3d5',
      note: "Outil desactiver_position : effet immédiat, sans confirmation à l'écran (réduire une collecte de données personnelles ne mérite aucun frein).",
    },
  },
  // B121 · ecrire · niveau 3
  {
    id: 'B121', cote: 'bureau', libelle: 'Envoyer le récap hebdomadaire maintenant, par e-mail (détail de B62)',
    genre: 'ecrire', niveau: 3,
    guides: ['recap'],
    ecart: {
      livraison: '3d4',
      note: "Outil envoyer_recap_maintenant : déclenche la fonction weekly-digest (récap du lundi) ; message « Récap envoyé (N destinataire(s)) ». Aujourd'hui seule la fiche d'aide « recap » existe.",
    },
  },
  // B122 · ecrire · niveau 3
  {
    id: 'B122', cote: 'bureau', libelle: "Changer l'adresse e-mail du comptable, destinataire de l'export de paie (détail de B60)",
    genre: 'ecrire', niveau: 3,
    outil: 'modifier_reglages',
  },
  // B123 · lire · niveau 1
  {
    id: 'B123', cote: 'bureau', libelle: 'Lire le journal des accès du support BEMEXO (détail de B63)',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'Outil lire_journal_support : qui est entré, quand, autorisé ou retiré.',
    },
  },
  // B124 · humain · niveau 3
  {
    id: 'B124', cote: 'bureau', libelle: 'Déconnecter la tablette de pointage : ses QR ne fonctionnent plus (détail de B55)',
    genre: 'humain', niveau: 3,
    guides: ['borne'],
    humain: {
      categorie: 'droits_acces',
      raison: "Droit d'accès d'un appareil : la tablette est coupée et ses QR ne fonctionnent plus (message de l'écran) ; confirmation « Non / Oui » à l'écran (ia-v2.md:257, sécurité de la borne).",
    },
    ecart: {
      livraison: '3b',
      note: "Fiche d'aide « borne » (visite guidée qui entoure « Déconnecter la tablette ») ; l'assistant ouvre la fenêtre Borne et ne déconnecte rien.",
    },
  },
  // B125 · ecrire · niveau 2
  {
    id: 'B125', cote: 'bureau', libelle: "Régler les horaires d'ouverture de la borne (détail de B55)",
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: 'Outil regler_horaires_borne(de, à) : enregistré dès que les deux heures sont données (ou aucune).',
    },
  },
  // B126 · lire · niveau 1
  {
    id: 'B126', cote: 'bureau', libelle: "Lire l'état de la borne : tablette reliée, vue il y a… (détail de B55)",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'Outil lire_etat_borne : reliée ou non, vue il y a… (seenLabel), horaires.',
    },
  },
  // B127 · ecrire · niveau 2
  {
    id: 'B127', cote: 'bureau', libelle: "Ajouter une formation par lien ou par document, pour l'équipe entière ou certains salariés (détail de B57)",
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: 'Outil ajouter_formation(titre, lien|document, destinataires).',
    },
  },
  // B128 · humain · niveau 3
  {
    id: 'B128', cote: 'bureau', libelle: "Ajouter une formation en vidéo : filmer ou déposer un fichier de 50 Mo au plus (quota vidéo de l'entreprise 100 Mo) (détail de B57)",
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'appareil',
      raison: "Gestes d'appareil (caméra, micro, choix et envoi d'un gros fichier vidéo) qui ne passent pas par le chat ; hors liste du niveau 3 mais non faisables par l'assistant.",
    },
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "À trancher : l'exposition du cahier ne dit pas l'état actuel (ni couvert, ni partiel, ni outil à créer nommé comme sien). Exposition du cahier : L'assistant ouvre la fenêtre Formations et dit le quota restant (lire_formations, B57) ; la prise de vue ou le choix du fichier sont à l'écran.",
    },
  },
  // B129 · ecrire · niveau 2
  {
    id: 'B129', cote: 'bureau', libelle: 'Retirer ou remettre une formation ou une vidéo (détail de B57)',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: "Outil retirer_ou_remettre_formation : c'est un archivage réversible (rien n'est effacé), « Annuler » = l'opération inverse.",
    },
  },
  // B130 · ecrire · niveau 3
  {
    id: 'B130', cote: 'bureau', libelle: "Revenir à une version d'avant du planning d'une semaine : « Revenir à la V{n} » après aperçu (détail de B49)",
    genre: 'ecrire', niveau: 3,
    guides: ['versions'],
    ecart: {
      livraison: '3d5',
      note: "Outil revenir_version_planning(semaine, version) en carte : montrer l'aperçu (« N remises, N retirées, N gardées »), garder d'abord l'état actuel ; refait l'aperçu si le planning a bougé. Aujourd'hui fiche d'aide « versions » seule.",
    },
  },
  // B131 · ecrire · niveau 2
  {
    id: 'B131', cote: 'bureau', libelle: "Garder la version actuelle du planning d'une semaine (« Garder cette version ») (détail de B49)",
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d2', avant: '2027-06-30',
      note: 'Outil garder_version_planning(semaine) : enregistre une version « manuelle » sans toucher au planning ; inoffensif.',
    },
  },
  // B132 · lire · niveau 1
  {
    id: 'B132', cote: 'bureau', libelle: "Lire l'état de l'abonnement : essai (jours restants), terminé, actif (détail de B64)",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "Outil lire_etat_abonnement : jours d'essai restants, abonné ou non (réglages de l'entreprise : trial_ends_at, subscription_status).",
    },
  },
  // B133 · humain · niveau 3
  // navigation existante, rattachée par un ouvreur en 3b : NAV_ACTION:reglages
  {
    id: 'B133', cote: 'bureau', libelle: 'Gérer mon abonnement : portail Stripe (résilier, factures, moyen de paiement) (détail de B64)',
    genre: 'humain', niveau: 3,
    guides: ['abonnement'],
    humain: {
      categorie: 'paiement',
      raison: "Abonnement et paiement (liste du niveau 3 validée, ia-vision.md:37) : page hébergée par Stripe, hors de l'application.",
    },
    ecart: {
      livraison: '3b',
      note: "Ouvrir les Réglages et guider (fiche d'aide « abonnement », visite guidée).",
    },
  },
  // B134 · humain · niveau 3
  {
    id: 'B134', cote: 'bureau', libelle: 'Se déconnecter (détail de B65)',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'securite',
      raison: "Geste de sécurité de session : un « ferme » mal compris ne doit pas déconnecter la personne au milieu d'une saisie.",
    },
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "L'assistant montre où est le bouton (ouvrir_fenetre(compte), B65) mais ne coupe pas la session.",
    },
  },
  // B135 · lire · niveau 1
  {
    id: 'B135', cote: 'bureau', libelle: "Lire ce qu'un export d'équipe va verrouiller : N lignes d'heures de M salariés sur la période (détail de B45)",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "Outil lire_verrou_export(période) sur lireCompteVerrou (lecture seule, même filtre que l'export).",
    },
  },
  // B136 · ecrire · niveau 3
  {
    id: 'B136', cote: 'bureau', libelle: "Renseigner le coût réel d'un salarié à partir d'un bulletin de paie, chiffres vérifiés puis « Valider » (détail de B33)",
    genre: 'ecrire', niveau: 3,
    guides: ['cout_reel'],
    outil: 'cout_reel',
  },
  // B137 · lire · niveau 1
  {
    id: 'B137', cote: 'bureau', libelle: 'Lire le détail de « à relancer » : qui, quels jours, mois précédent et mois en cours (détail de B41)',
    genre: 'lire', niveau: 1,
    outil: 'repondre',
    ecart: {
      livraison: '3c',
      note: "Outil lire_a_relancer : mêmes journées que l'écran (journées planifiées sans heures envoyées, hors absences, cases retirées, mois et salariés clôturés, plus les sorties oubliées). Aujourd'hui l'instantané ne contient que « pas pointé hier ».",
    },
  },
  // B138 · lire · niveau 1
  {
    id: 'B138', cote: 'bureau', libelle: 'Lire le journal « Derniers envois » des e-mails aux salariés (détail de B58)',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'Outil lire_derniers_envois_email : type, destinataire masqué, statut, date.',
    },
  },
  // B139 · humain · niveau 3
  // Ajoutée au remplissage de SURFACES : surface réelle (page /support, bandeau « Mode support ») sans capacité dans le cahier,
  // qui ne décrit que le côté du patron (B63). Ici c'est l'agent de BEMEXO.
  {
    id: 'B139', cote: 'bureau', libelle: 'Console du support BEMEXO : un agent se connecte (double vérification), entre chez une entreprise autorisée, en lecture seule, puis quitte',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'securite',
      raison: "Sécurité : la console (/support) est celle d'un agent de BEMEXO, pas celle du patron. Connexion, double vérification par code à 6 chiffres et entrée chez un client sont des gestes de ce compte, jamais de l'assistant du bureau, qui ne sert que le patron de l'entreprise.",
    },
  },
  // B140 · lire · niveau 1
  // Ajoutée au remplissage de SURFACES : volet de la fenêtre Formations (components/training-video-orphans.tsx) absent du cahier.
  {
    id: 'B140', cote: 'bureau', libelle: 'Voir les fichiers vidéo à vérifier : fichiers sans formation, formations dont le fichier manque (détail de B57)',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "Volet de lire_formations (B57) : nombre de fichiers du dossier privé sans formation et de formations publiées dont le fichier manque, avec les premières lignes. Lecture seule comme à l'écran : aucun bouton de suppression.",
    },
  },
];
