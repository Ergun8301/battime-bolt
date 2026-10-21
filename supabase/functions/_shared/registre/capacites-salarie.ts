// Capacités du SALARIÉ (S1…S105, puis S106+) : ce que le salarié peut faire ou demander dans BEMEXO.
// Couche STABLE du registre : ids jamais renumérotés ni réutilisés (T3). Contrat : docs/ia-etape3/00-conception-etape3.md §2.
// Généré UNE fois par scripts/registre-import.mjs depuis docs/ia-etape3/capacites-salarie.json (105 entrées ; libellés du cahier mot pour mot).
// Depuis, ce fichier est la SOURCE : on y ajoute les nouvelles capacités et on y ferme les dettes ; le script refuse de l'écraser.
// Lecture : aucun champ d'état = couverte par `outil` / `guides` ; `ecart` = couverte en partie ; `dette` = rien encore (échéance `avant`) ;
// `humain` = le dernier clic reste à l'humain (peut aller avec un `ecart` ou une `dette` : l'aide de l'assistant, ouvrir ou lire, manque).
// Les commentaires « navigation existante » notent les liens du code que les ouvreurs de la livraison 3b rattacheront à la capacité.
import type { Capacite } from './types.ts';

export const CAPACITES_SALARIE: Capacite[] = [
  // S1 · naviguer · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:journee
  {
    id: 'S1', cote: 'salarie', libelle: "Jour affiché ; retour à aujourd'hui",
    genre: 'naviguer', niveau: 1,
    ecart: {
      livraison: '3b',
      note: "WORKER_NAV:journee (« Ma journée ») ramène à aujourd'hui (goHome). À créer : ouvrir_ecran(ecran:'journee', jour).",
    },
  },
  // S2 · lire · niveau 1
  // comportement hors registre (instantané, lecteur local, fiche multi) : instantane:prevu_par_le_bureau, instantane:heures_notees, local:answerSimpleQuestion
  {
    id: 'S2', cote: 'salarie', libelle: 'Créneaux prévus, distincts des heures saisies',
    genre: 'lire', niveau: 1,
  },
  // S3 · ecrire · niveau 2
  {
    id: 'S3', cote: 'salarie', libelle: 'Noter ses heures sur un créneau prévu',
    genre: 'ecrire', niveau: 2,
    outil: 'declarer_heures',
    ecart: {
      livraison: '3d3',
      note: "noter des heures = declarer_heures : le chantier non dit est repris du planning (plannedWorksite, fillUnsaid) et la ligne est rattachée au planning le plus recouvert (bestPlanningFor). À créer : confirmer_prevu (prépare des brouillons depuis le planning, niveau 2 avec Annuler ; l'envoi reste S39).",
    },
  },
  // S4 · lire · niveau 1
  {
    id: 'S4', cote: 'salarie', libelle: "Savoir qu'un créneau prévu ne partira pas",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "l'état d'un prévu (couvert, chevauche, heures à préciser) est calculé par l'écran (visiblePlannings, plannedState) ; l'assistant ne le reçoit pas et ne peut pas dire pourquoi un prévu ne partira pas. À créer : lire_ma_journee(date) qui rend cet état.",
    },
  },
  // S5 · lire · niveau 1
  {
    id: 'S5', cote: 'salarie', libelle: "Nombre de documents d'un chantier",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "le compte vient de la table documents de l'entreprise (tous auteurs, par chantier). À créer : lire_mes_documents(chantier) avec le nombre et la liste.",
    },
  },
  // S6 · lire · niveau 1
  {
    id: 'S6', cote: 'salarie', libelle: 'Réunions du jour',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "le prompt ne contient ni réunions ni tâches (fetchMyMissions n'est appelé que par l'écran). À créer : lire_taches_et_reunions(date) (titre, heures, lieu, équipe ; jamais additionnées aux heures).",
    },
  },
  // S7 · lire · niveau 1
  {
    id: 'S7', cote: 'salarie', libelle: 'Tâches du jour et compteur',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: 'même lecture que S6 : texte, heure ou moment, fait ou non, compteur fait/total (« 1/3 »). Aucun outil ni donnée dans le prompt.',
    },
  },
  // S8 · ecrire · niveau 2
  {
    id: 'S8', cote: 'salarie', libelle: 'Cocher une tâche (réseau requis)',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d3', avant: '2027-06-30',
      note: "set_day_task_done (setTaskDone) n'agit que sur MA tâche ; réversible (décocher) donc niveau 2 avec Annuler. À créer : cocher_tache.",
    },
  },
  // S9 · lire · niveau 1
  {
    id: 'S9', cote: 'salarie', libelle: '« Terminé le … » sur un chantier terminé',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "la lecture des chantiers de l'assistant ne demande pas completed_at : il ignore qu'un chantier est terminé, et choosableWorksites (qui retire les chantiers terminés des choix pour un jour après leur fin) n'est pas appliquée à ses listes. Écart de règle déjà consigné (docs/chantier-termine.md, section des assistants) : l'assistant peut encore proposer des heures sur un chantier terminé que l'écran n'offrirait plus…",
    },
  },
  // S10 · humain · niveau 3
  {
    id: 'S10', cote: 'salarie', libelle: 'Pointer en scannant le QR de la tablette',
    genre: 'humain', niveau: 3,
    guides: ['pointer'],
    outil: 'repondre',
    humain: {
      categorie: 'appareil',
      raison: "Règle métier du lot 12 : le téléphone ne démarre plus de pointage ; seul le scan du QR de la tablette pointe, et l'heure vient du serveur (jamais de l'horloge du téléphone). Geste physique et preuve de présence : à ne jamais faire à la place du salarié.",
    },
  },
  // S11 · ouvrir · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:borne
  {
    id: 'S11', cote: 'salarie', libelle: "Scanner ce QR depuis l'application",
    genre: 'ouvrir', niveau: 1,
  },
  // S12 · lire · niveau 1
  // comportement hors registre (instantané, lecteur local, fiche multi) : instantane:en_cours
  {
    id: 'S12', cote: 'salarie', libelle: 'Pointage en cours (chantier, début, durée)',
    genre: 'lire', niveau: 1,
  },
  // S13 · ecrire · niveau 2
  // comportement hors registre (instantané, lecteur local, fiche multi) : local:handleWorkerLocally
  {
    id: 'S13', cote: 'salarie', libelle: 'Terminer le pointage en cours',
    genre: 'ecrire', niveau: 2,
    outil: 'terminer_pointage',
  },
  // S14 · ecrire · niveau 2
  {
    id: 'S14', cote: 'salarie', libelle: 'Pointage oublié : indiquer la fin (nuit comprise)',
    genre: 'ecrire', niveau: 2,
    outil: 'terminer_pointage',
    ecart: {
      livraison: '3d3',
      note: "l'exécuteur gère le pointage resté ouvert (il demande l'heure de fin, accepte la fin le lendemain comme l'écran) mais la déclaration envoyée au modèle n'a aucun paramètre « fin » (properties vide) alors que prepareWorkerAction le lit : seule la phrase « j'ai… À créer : paramètre fin dans terminer_pointage (ou completer_sortie_oubliee).",
    },
  },
  // S15 · ecrire · niveau 2
  {
    id: 'S15', cote: 'salarie', libelle: 'Voir et compléter une « sortie oubliée »',
    genre: 'ecrire', niveau: 2,
    guides: ['sortie-oubliee'],
    ecart: {
      livraison: '3d3',
      note: "seule la fiche d'aide (et son parcours) existe. À créer : lire_ma_journee(date) qui la signale et completer_sortie_oubliee(jour, fin), niveau 2 avec Annuler.",
    },
  },
  // S16 · lire · niveau 1
  // comportement hors registre (instantané, lecteur local, fiche multi) : instantane:en_cours, instantane:heures_notees
  {
    id: 'S16', cote: 'salarie', libelle: 'Pointage rattaché au chantier et au total',
    genre: 'lire', niveau: 1,
    ecart: {
      livraison: '3c',
      note: "le chantier du pointage est connu (en_cours.chantier). À créer : lire_ma_journee(date) qui reprend le calcul de l'écran (lignes + file du téléphone + chrono).",
    },
  },
  // S17 · ecrire · niveau 2
  // comportement hors registre (instantané, lecteur local, fiche multi) : multi
  {
    id: 'S17', cote: 'salarie', libelle: 'Ajouter une intervention à la main',
    genre: 'ecrire', niveau: 2,
    outil: 'declarer_heures',
  },
  // S18 · lire · niveau 1
  // comportement hors registre (instantané, lecteur local, fiche multi) : instantane:chantiers
  {
    id: 'S18', cote: 'salarie', libelle: 'Choisir le chantier (recherche, « Autre chantier »)',
    genre: 'lire', niveau: 1,
    ecart: {
      livraison: '3c',
      note: "la liste des chantiers actifs de l'entreprise est dans le prompt et resolveWorksite apparie un nom dit (jamais d'invention ; ambigu = question avec puces) ; un lieu sans chantier connu va sur « Autre » avec le lieu en note. Écart : l'écran retire les chantiers terminés des choix (choosableWorksites), l'assistant ne sait pas qu'ils sont terminés (voir S9).",
    },
  },
  // S19 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : Un chantier créé est visible du bureau et des autres salariés et ne peut être ni modifié ni supprimé par le salarié (droit d'insertion seulement) : le geste n'est pas annulable, l'utilisateur confirme (niveau 3 par prudence, décision du patron à prendre).
  // comportement hors registre (instantané, lecteur local, fiche multi) : multi
  {
    id: 'S19', cote: 'salarie', libelle: 'Créer un « Autre chantier »',
    genre: 'ecrire', niveau: 3,
    outil: 'nouveau_chantier',
  },
  // S20 · ecrire · niveau 2
  {
    id: 'S20', cote: 'salarie', libelle: 'Régler début et fin ; heure exacte gardée',
    genre: 'ecrire', niveau: 2,
    outil: 'declarer_heures',
  },
  // S21 · lire · niveau 1
  // comportement hors registre (instantané, lecteur local, fiche multi) : instantane:heures_notees
  {
    id: 'S21', cote: 'salarie', libelle: 'Durée nette (pause déduite)',
    genre: 'lire', niveau: 1,
    ecart: {
      livraison: '3c',
      note: 'le calcul existe côté assistant (shiftMinutes, nuit comprise ; heures_notees par jour est net de pause) mais lignes_du_jour ne donne au modèle que chantier, début et fin, sans la pause ni la durée nette de chaque ligne. À créer : lire_ma_journee(date) avec durée nette, pause et état de chaque ligne.',
    },
  },
  // S22 · ecrire · niveau 2
  {
    id: 'S22', cote: 'salarie', libelle: 'Total des pauses de la ligne, contrôlé',
    genre: 'ecrire', niveau: 2,
    outil: 'declarer_heures',
    ecart: {
      livraison: '3d3',
      note: "declarer_heures porte « pause » (minutes) à la création, contrôlée comme l'écran (pause strictement plus courte que la ligne). À créer : poser_pause(ligne, minutes), niveau 2 avec Annuler, mêmes bornes que l'écran (plus court que la ligne, 12 h au plus).",
    },
  },
  // S23 · ecrire · niveau 2
  {
    id: 'S23', cote: 'salarie', libelle: 'Statut du chantier (réserve ou non)',
    genre: 'ecrire', niveau: 2,
    outil: 'signaler_reserve',
    ecart: {
      livraison: '3d3',
      note: '« Avec réserve » : signaler_reserve (direct, Annuler) ; retirer la réserve : retirer_reserve (carte, Annuler, journée non envoyée). À créer : un paramètre statut (en_cours | sans | avec) dans un outil de correction de ligne.',
    },
  },
  // S24 · ecrire · niveau 2
  {
    id: 'S24', cote: 'salarie', libelle: 'Note ou détail des réserves',
    genre: 'ecrire', niveau: 2,
    outil: 'signaler_reserve',
    ecart: {
      livraison: '3d3',
      note: "le détail d'une réserve se dit avec signaler_reserve (« detail », 500 caractères, écrit dans la note de la ligne). À créer : champ note dans l'outil de correction de ligne.",
    },
  },
  // S25 · ouvrir · niveau 1
  {
    id: 'S25', cote: 'salarie', libelle: "Documents du chantier depuis l'éditeur",
    genre: 'ouvrir', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "aucune navigation vers la fenêtre « Documents » (WORKER_NAV n'a que 9 écrans) ; l'assistant n'agit sur les documents que par ranger_photo (pièce jointe) et retirer_photo. À créer : ouvrir_ecran(ecran:'documents', chantier, ligne).",
    },
  },
  // S26 · ecrire · niveau 2
  {
    id: 'S26', cote: 'salarie', libelle: 'Enregistrer avec contrôles (dont pointage en cours)',
    genre: 'ecrire', niveau: 2,
    outil: 'declarer_heures',
    ecart: {
      livraison: '3d3',
      note: "contrôles de l'assistant : horaire lisible, 14 h au plus, pause < durée, pas de chevauchement ENTRE les lignes du brouillon, date de -31 j à +1 j. À créer : les contrôles de saveSlot dans le chemin court, avec un refus parlant.",
    },
  },
  // S27 · ecrire · niveau 2
  {
    id: 'S27', cote: 'salarie', libelle: 'Corriger une intervention (même envoyée)',
    genre: 'ecrire', niveau: 2,
    outil: 'modifier_heures',
    ecart: {
      livraison: '3d3',
      note: "modifier_heures corrige début et fin d'une ligne d'AUJOURD'HUI (désignée par son chantier) ; sur une ligne déjà envoyée, une carte « Confirmer » précède et la secrétaire est prévenue (modified_at, modified_by) comme sur l'écran.",
    },
  },
  // S28 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : Suppression (vision §3, niveau 3) et règle D3 « heures sûres » : rien ne s'efface sans carte de confirmation ; les heures envoyées ne sont jamais effacées. L'utilisateur fait le dernier clic.
  {
    id: 'S28', cote: 'salarie', libelle: 'Retirer une intervention (confirmation)',
    genre: 'ecrire', niveau: 3,
    outil: 'effacer_heures',
    ecart: {
      livraison: '3d3',
      note: "effacer_heures retire UNE ligne ou toute la journée, brouillons seulement : carte d'aperçu (« Vérifiez ce qui sera effacé »), puis Annuler qui réinsère. Les heures déjà envoyées ne s'effacent jamais côté assistant (consigne + checkWorkerAction), alors que l'écran sait « Retirer » une ligne envoyée (statut annulé, visible « Retiré », secrétaire…",
    },
  },
  // S29 · humain · niveau 1
  {
    id: 'S29', cote: 'salarie', libelle: "Fermer l'éditeur sans enregistrer",
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'hors_ecran',
      raison: "Geste d'écran sans effet sur les données (cancelSlot) : rien à protéger, rien à faire par l'assistant.",
    },
  },
  // S30 · ecrire · niveau 2
  {
    id: 'S30', cote: 'salarie', libelle: 'Terminer le pointage recouvert par une intervention',
    genre: 'ecrire', niveau: 2,
    outil: 'terminer_pointage',
    ecart: {
      livraison: '3d3',
      note: "les deux étapes existent séparément (terminer le pointage, puis noter les heures) mais ni la règle de recoupement (liveClash) ni l'enchaînement « Terminer le pointage à HH:MM, puis ajouter » (finishLiveAt) : en profil long terminer_pointage n'est même pas… À créer : dans declarer_heures, détecter le recouvrement avec en_cours et proposer cette double action en une seule carte.",
    },
  },
  // S31 · ecrire · niveau 2
  {
    id: 'S31', cote: 'salarie', libelle: 'Qualifier un trou : Route ou Pause',
    genre: 'ecrire', niveau: 2,
    guides: ['route-pause'],
    outil: 'declarer_heures',
    ecart: {
      livraison: '3d3',
      note: "en profil long, une pause DITE entre deux créneaux est écrite avec la ligne qui suit (gap_before = pause) ; répondre « c'était de la route / une pause » sur un trou déjà noté (setGapKind) n'a pas d'outil, seulement la fiche d'aide et son parcours «… À créer : qualifier_trou(ligne, route | pause), niveau 2 avec Annuler.",
    },
  },
  // S32 · ecrire · niveau 2
  {
    id: 'S32', cote: 'salarie', libelle: 'Panier du jour (cocher / décocher)',
    genre: 'ecrire', niveau: 2,
    outil: 'panier_repas',
    ecart: {
      livraison: '3d3',
      note: "panier_repas coche ou retire le panier d'AUJOURD'HUI (une seule ligne cochée par jour ; refus poli si l'entreprise n'utilise pas le panier), direct avec Annuler. Écarts : sur une journée sans ligne l'assistant refuse (« notez d'abord vos heures ») alors que l'écran garde l'intention et la pose sur la première ligne (S81) ; autre jour : non…",
    },
  },
  // S33 · ecrire · niveau 2
  // comportement hors registre (instantané, lecteur local, fiche multi) : local:handleWorkerLocally
  {
    id: 'S33', cote: 'salarie', libelle: "Copier la journée d'hier",
    genre: 'ecrire', niveau: 2,
    outil: 'copier_journee',
  },
  // S34 · ecrire · niveau 2
  {
    id: 'S34', cote: 'salarie', libelle: "Dupliquer la journée sur d'autres jours",
    genre: 'ecrire', niveau: 2,
    outil: 'copier_journee',
    ecart: {
      livraison: '3d3',
      note: "copier_journee(depuis, vers[]) copie sur 14 jours au plus, mais la plage admise est de -31 j à +1 j alors que le calendrier de l'écran n'offre qu'aujourd'hui et le futur (disabled before today) : l'assistant ne peut pas dupliquer sur la semaine prochaine…",
    },
  },
  // S35 · lire · niveau 1
  {
    id: 'S35', cote: 'salarie', libelle: 'Corrections du bureau / du chef et leur motif',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "« Le bureau a corrigé : 08:00–12:00 → 08:00–12:30 » + motif vient de time_entry_corrections et du journal du bureau (fetchEntryEdits) ; l'assistant ne les lit pas. À créer : lire_ma_journee(date) avec les corrections et leurs motifs (lecture seule, droits du salarié).",
    },
  },
  // S36 · humain · niveau 3
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:infos
  {
    id: 'S36', cote: 'salarie', libelle: '« Endroit noté » (anciennes lignes)',
    genre: 'humain', niveau: 3,
    guides: ['infos'],
    humain: {
      categorie: 'donnee_sensible',
      raison: "Donnée de localisation (CNIL) : le salarié la consulte à l'écran ; vision §4, aucune donnée sensible envoyée au modèle. Texte « L'endroit au pointage » à faire valider par le métier (n'est plus exact depuis le lot 12).",
    },
  },
  // S37 · lire · niveau 1
  // comportement hors registre (instantané, lecteur local, fiche multi) : instantane:lignes_du_jour
  {
    id: 'S37', cote: 'salarie', libelle: 'État de chaque intervention',
    genre: 'lire', niveau: 1,
    ecart: {
      livraison: '3c',
      note: "le serveur connaît envoyée oui/non (live.lignes.envoyee) mais le prompt ne montre au modèle que chantier, début et fin ; « chez le comptable » (verrouillé), « retiré » (exclu de la lecture) et « sur le téléphone » (file locale du navigateur) n'existent pas… À créer : lire_ma_journee(date) avec l'état de chaque ligne.",
    },
  },
  // S38 · ecrire · niveau 2
  {
    id: 'S38', cote: 'salarie', libelle: "État d'une réserve ; la lever",
    genre: 'ecrire', niveau: 2,
    outil: 'reserve_corrigee',
    ecart: {
      livraison: '3d3',
      note: "lever : reserve_corrigee (même fonction serveur mark_reserve_fixed, commentaire facultatif, direct avec Annuler qui remet « à lever »). Limites : seulement les lignes d'AUJOURD'HUI (le bandeau de l'écran couvre tous les jours, 50 au plus)…",
    },
  },
  // S39 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : Niveau 3 (vision §3, validé le 14 octobre 2026) : l'envoi rend les heures visibles du bureau et toute correction ensuite prévient la secrétaire. L'assistant prépare (contrôles, carte « Envoyer ma journée ») ; l'utilisateur fait le dernier clic. Les heures envoyées ne sont jamais effacées.
  // comportement hors registre (instantané, lecteur local, fiche multi) : multi, local:handleWorkerLocally
  {
    id: 'S39', cote: 'salarie', libelle: '« Envoyer ma journée » et ses 5 états',
    genre: 'ecrire', niveau: 3,
    outil: 'envoyer_journee',
    ecart: {
      livraison: '3d3',
      note: "envoyer_journee est toujours une carte « Confirmer » (jamais faite d'office), puis sendWorkerDay bascule les brouillons d'AUJOURD'HUI : l'utilisateur fait donc le dernier clic. Manquent : une journée d'un autre jour (S47), la question « prévu » (S40), la pause (S41), le contrôle de plus de 10 h (S42), la file « Envoyer ce qui reste » (S105), l'envoi différé hors ligne…",
    },
  },
  // S40 · ecrire · niveau 2
  {
    id: 'S40', cote: 'salarie', libelle: 'Confirmer / corriger les horaires prévus',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d3', avant: '2027-06-30',
      note: "la question « Tu as travaillé exactement ces horaires ? » (Oui / Non, je corrige / Envoyer seulement mes heures notées) n'existe pas côté assistant, qui n'envoie jamais le prévu (message « Rien à envoyer : les heures prévues par le bureau ne comptent qu'une… À créer : confirmer_prevu (prépare des brouillons depuis le planning, niveau 2 avec Annuler ; l'envoi reste S39, niveau 3).",
    },
  },
  // S41 · ecrire · niveau 2
  {
    id: 'S41', cote: 'salarie', libelle: 'Répondre à « Tu as pris une pause ? »',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d3', avant: '2027-06-30',
      note: "plus de 6 h d'affilée sans pause : l'écran pose la question avant l'envoi et écrit la pause sur la plus longue ligne de la plage ; l'assistant s'arrête sur « envoie ta journée depuis Ma journée, la pause y est demandée ». À créer : poser_pause(ligne, minutes), appelable aussi depuis la carte d'envoi.",
    },
  },
  // S42 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : Contrôle de cohérence avant un envoi de niveau 3 : l'humain voit le total et confirme.
  {
    id: 'S42', cote: 'salarie', libelle: 'Confirmer une journée de plus de 10 h',
    genre: 'ecrire', niveau: 3,
    dette: {
      livraison: '3d3', avant: '2027-06-30',
      note: "l'écran affiche « Vérification » (Corriger / Confirmer l'envoi) quand le total qui va partir dépasse 10 h ; sendWorkerDay n'a pas ce contrôle. À créer : dans la carte d'envoyer_journee, le même avertissement chiffré avec second bouton.",
    },
  },
  // S43 · lire · niveau 1
  {
    id: 'S43', cote: 'salarie', libelle: 'Arrêt avant envoi (chevauchement…)',
    genre: 'lire', niveau: 1,
    outil: 'envoyer_journee',
    ecart: {
      livraison: '3d3',
      note: "sendWorkerDay refuse un chevauchement corrigeable (avec les heures en cause) et la plage de plus de 6 h sans pause ; la sortie oubliée sans fin n'est pas nommée (la base refuse) alors que l'écran ouvre la ligne pour la compléter…",
    },
  },
  // S44 · ecrire · niveau 2
  {
    id: 'S44', cote: 'salarie', libelle: 'Modifier une journée envoyée (« Journée déjà envoyée »)',
    genre: 'ecrire', niveau: 2,
    outil: 'modifier_heures',
    ecart: {
      livraison: '3d3',
      note: 'corriger une ligne envoyée passe par une carte « Confirmer », puis la secrétaire est prévenue (modified_at) : équivalent de la fenêtre.',
    },
  },
  // S45 · lire · niveau 1
  {
    id: 'S45', cote: 'salarie', libelle: 'Journée renvoyée par le bureau, avec motif',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "« Le bureau t'a renvoyé cette journée : « motif » » vient du journal du bureau (fetchEntryEdits, genre « return ») ; absent du prompt. À créer : lire_ma_journee(date) avec le renvoi et son motif.",
    },
  },
  // S46 · lire · niveau 1
  {
    id: 'S46', cote: 'salarie', libelle: "Clôture et ce qu'elle bloque",
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "les mois clôturés (month_closures) et « heures clôturées jusqu'au … » (fetchMyClosure) ne sont pas lus par l'assistant. À créer : lire_ma_journee(date).cloture et refus avant écriture.",
    },
  },
  // S47 · lire · niveau 1
  {
    id: 'S47', cote: 'salarie', libelle: 'Rappels « journée(s) à envoyer » ; ouvrir le jour',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "la liste (jours planifiés passés sans heures envoyées + jours ≤ aujourd'hui avec lignes à envoyer, sur 60 jours) est calculée par l'écran ; l'assistant ne l'a pas. À créer : lire_mes_journees_a_envoyer, envoyer_journee(date) (niveau 3) et ouvrir_ecran(jour).",
    },
  },
  // S48 · humain · niveau 1
  // outils cités par le cahier, non retenus (capacité humain, T4) : declarer_heures, envoyer_journee
  {
    id: 'S48', cote: 'salarie', libelle: 'Après un scan : raccourcis ajouter / envoyer',
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'hors_ecran',
      raison: "Raccourcis de la page /pointer, sans aucune écriture : l'équivalent côté assistant est déjà couvert, et « Envoyer ma journée » y garde sa question « Envoyer votre journée maintenant ? ».",
    },
  },
  // S49 · naviguer · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:semaine
  {
    id: 'S49', cote: 'salarie', libelle: 'Ma semaine (7 jours visibles)',
    genre: 'naviguer', niveau: 1,
    ecart: {
      livraison: '3c',
      note: "WORKER_NAV:semaine ouvre l'onglet. À créer : lire_mon_planning(du, au) et lire_mes_heures(du, au).",
    },
  },
  // S50 · naviguer · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:mois
  {
    id: 'S50', cote: 'salarie', libelle: 'Mon mois',
    genre: 'naviguer', niveau: 1,
    ecart: {
      livraison: '3c',
      note: "WORKER_NAV:mois ouvre l'onglet ; même limite que S49 pour lire un mois précis (total envoyé, jours à envoyer / à déclarer, planning). À créer : lire_mes_heures(du, au).",
    },
  },
  // S51 · naviguer · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:historique
  {
    id: 'S51', cote: 'salarie', libelle: 'Historique',
    genre: 'naviguer', niveau: 1,
    guides: ['historique'],
    ecart: {
      livraison: '3c',
      note: "WORKER_NAV:historique ouvre l'onglet (et un parcours pas à pas existe). À créer : lire_mes_heures(du, au).",
    },
  },
  // S52 · ouvrir · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:historique
  {
    id: 'S52', cote: 'salarie', libelle: "Export PDF de l'historique",
    genre: 'ouvrir', niveau: 1,
    ecart: {
      livraison: '3b',
      note: "WORKER_NAV:historique amène à l'écran où se trouve le bouton « PDF ». À créer : une carte « Télécharger mon PDF » (le navigateur exige un geste de l'utilisateur, qui reste donc le dernier clic).",
    },
  },
  // S53 · lire · niveau 1
  {
    id: 'S53', cote: 'salarie', libelle: '« Interventions supprimées »',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "fenêtre en lecture seule : 60 jours de planning, heures, tâches et réunions supprimés ou décalés, avec auteur et avant → après (affichée seulement si la base a la table des traces). À créer : lire_traces et ouvrir_ecran(ecran:'traces').",
    },
  },
  // S54 · naviguer · niveau 1
  {
    id: 'S54', cote: 'salarie', libelle: 'Ouvrir un jour depuis semaine, mois ou rappel',
    genre: 'naviguer', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "toucher un jour de Semaine ou de Mois, ou un rappel, ouvre « Ma journée » sur ce jour (openDay). À créer : ouvrir_ecran(ecran:'journee', jour).",
    },
  },
  // S55 · ecrire · niveau 2
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:conges
  {
    id: 'S55', cote: 'salarie', libelle: 'Faire une demande',
    genre: 'ecrire', niveau: 2,
    guides: ['conge'],
    outil: 'demander_conge',
  },
  // S56 · lire · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:conges
  {
    id: 'S56', cote: 'salarie', libelle: 'Mes demandes : états, motif de refus',
    genre: 'lire', niveau: 1,
    ecart: {
      livraison: '3c',
      note: 'WORKER_NAV:conges ouvre la liste. À créer : lire_mes_conges.',
    },
  },
  // S57 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : Suppression d'une demande (vision §3, niveau 3) et règle D3 : confirmation avant tout retrait, même annulable. L'utilisateur fait le dernier clic.
  {
    id: 'S57', cote: 'salarie', libelle: 'Annuler une demande en attente',
    genre: 'ecrire', niveau: 3,
    guides: ['annuler-conge'],
    outil: 'annuler_conge',
  },
  // S58 · lire · niveau 1
  // comportement hors registre (instantané, lecteur local, fiche multi) : instantane:prevu_par_le_bureau, local:answerSimpleQuestion
  {
    id: 'S58', cote: 'salarie', libelle: 'Absences posées par le bureau',
    genre: 'lire', niveau: 1,
    ecart: {
      livraison: '3c',
      note: 'une absence du planning (congé, maladie, intempérie, repos) figure dans prevu_par_le_bureau pour -2 à +1 jour ; Semaine et Mois la montrent sans limite.',
    },
  },
  // S59 · lire · niveau 1
  {
    id: 'S59', cote: 'salarie', libelle: 'Rappel « N réserves à lever » et liste',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "le bandeau liste les interventions envoyées « avec réserve » ni levées par le bureau ni par le salarié, tous jours confondus (50 au plus) ; l'assistant ne lit que les lignes d'aujourd'hui et ne reçoit pas cette liste. À créer : lire_mes_reserves (date, chantier, détail ou « Sans détail écrit ») et ouvrir_ecran(ecran:'reserves').",
    },
  },
  // S60 · ecrire · niveau 2
  {
    id: 'S60', cote: 'salarie', libelle: 'Lever une réserve (commentaire, photo)',
    genre: 'ecrire', niveau: 2,
    outil: 'reserve_corrigee',
    ecart: {
      livraison: '3d3',
      note: "reserve_corrigee lève la réserve d'une ligne d'AUJOURD'HUI par mark_reserve_fixed, avec un commentaire facultatif (500 caractères), direct avec Annuler.",
    },
  },
  // S61 · ecrire · niveau 2
  {
    id: 'S61', cote: 'salarie', libelle: 'Annuler la levée (10 s)',
    genre: 'ecrire', niveau: 2,
    outil: 'reserve_corrigee',
  },
  // S62 · lire · niveau 1
  {
    id: 'S62', cote: 'salarie', libelle: 'Rappel « N formations à voir », menu avec compteur',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "le rappel et le compteur du menu viennent de my_trainings (fetchMyTrainings) ; le prompt n'en contient rien et WORKER_NAV n'a pas d'entrée « Formations ». À créer : lire_mes_formations et WORKER_NAV:formations.",
    },
  },
  // S63 · ouvrir · niveau 1
  {
    id: 'S63', cote: 'salarie', libelle: 'Ouvrir un lien ou document, regarder une vidéo',
    genre: 'ouvrir', niveau: 1,
    dette: {
      livraison: '3b', avant: '2027-01-31',
      note: "« Ouvrir ↗ » (lien externe, nouvel onglet) ou « ▶ Regarder » (vidéo du bureau, lecteur intégré, lien signé créé à l'ouverture) : aucune navigation de l'assistant n'y mène. À créer : ouvrir_ecran(ecran:'formations', formation).",
    },
  },
  // S64 · ecrire · niveau 2
  {
    id: 'S64', cote: 'salarie', libelle: 'Marquer « Vue » (annulable)',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d3', avant: '2027-06-30',
      note: '« ○ Vue » appelle set_training_seen (ma ligne seulement, date posée par le serveur) ; « Annuler » possible 10 minutes. À créer : marquer_formation_vue(formation, vue).',
    },
  },
  // S65 · ecrire · niveau 2
  {
    id: 'S65', cote: 'salarie', libelle: 'Ajouter une photo ou un fichier (15 Mo)',
    genre: 'ecrire', niveau: 2,
    outil: 'ranger_photo',
  },
  // S66 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : Suppression d'une pièce (le fichier est effacé du stockage) : niveau 3, carte puis dernier clic de l'utilisateur ; Annuler re-téléverse.
  {
    id: 'S66', cote: 'salarie', libelle: 'Parcourir par journée, ouvrir, supprimer',
    genre: 'ecrire', niveau: 3,
    outil: 'retirer_photo',
    ecart: {
      livraison: '3d5',
      note: "supprimer : retirer_photo (carte « Confirmer », Annuler qui re-téléverse le fichier), seulement SES documents des 14 derniers jours (20 au plus), comme la base l'impose. À créer : lire_mes_documents(chantier) et ouvrir_ecran(ecran:'documents').",
    },
  },
  // S67 · ecrire · niveau 2
  {
    id: 'S67', cote: 'salarie', libelle: 'Changer la catégorie',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: "l'auteur d'une pièce peut changer sa catégorie (Photo, Plan, Devis, PV…), annulable ; les factures sont réservées au bureau (canEditCategory). À créer : modifier_categorie_document, niveau 2 avec Annuler.",
    },
  },
  // S68 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : E-mail à un tiers (le client) : l'assistant prépare le message, l'utilisateur l'envoie depuis sa messagerie (mailto) ; BEMEXO n'envoie rien lui-même.
  {
    id: 'S68', cote: 'salarie', libelle: 'Envoyer les documents au client par e-mail',
    genre: 'ecrire', niveau: 3,
    guides: ['envoyer-client'],
    outil: 'email_client',
    ecart: {
      livraison: '3d5',
      note: "email_client enregistre l'e-mail du client du chantier (set_worksite_client_email) après une carte « Confirmer », sans Annuler. À créer : preparer_email_client (ouvre la messagerie, l'envoi reste à l'utilisateur) ; Annuler pour email_client.",
    },
  },
  // S69 · lire · niveau 1
  {
    id: 'S69', cote: 'salarie', libelle: '« Mon équipe » : jour, salarié, interventions',
    genre: 'lire', niveau: 1,
    guides: ['equipe'],
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: "seule la fiche d'aide et son parcours existent (rôle chef d'équipe seulement).",
    },
  },
  // S70 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : Les heures d'un coéquipier partent au bureau sous la responsabilité du chef d'équipe (envoi, niveau 3) : l'assistant prépare, le chef fait le dernier clic.
  {
    id: 'S70', cote: 'salarie', libelle: "Corriger / envoyer l'intervention d'un coéquipier",
    genre: 'ecrire', niveau: 3,
    guides: ['equipe'],
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: "« Corriger » une ligne (début, fin ; si elle est déjà envoyée, corrigerHeures prévient le salarié) puis « OK » l'envoie au bureau (lead_send_entries, journée « par le chef d'équipe ») ; un brouillon noté par le salarié s'envoie avec « Envoyer ». À créer : corriger_heures_equipe et envoyer_heures_equipe, niveau 3 car l'envoi engage le chef.",
    },
  },
  // S71 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : Même raison que S70 : l'envoi au bureau des heures d'un autre salarié est un geste de niveau 3, fait par le chef.
  {
    id: 'S71', cote: 'salarie', libelle: 'Ajouter des heures pour un coéquipier',
    genre: 'ecrire', niveau: 3,
    guides: ['equipe'],
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: '« Ajouter des heures pour {prénom} » : chantier, début, fin ; une ligne existante sur le même chantier est corrigée, jamais doublée ; « OK » enregistre et envoie. À créer : ajouter_heures_equipe, niveau 3 (même envoi que S70).',
    },
  },
  // S72 · humain · niveau 1
  {
    id: 'S72', cote: 'salarie', libelle: 'Nom, photo, menu du compte',
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'hors_ecran',
      raison: "Affichage d'identité et déclencheur de menu : aucune donnée à agir ; les entrées du menu ont chacune leur ligne.",
    },
  },
  // S73 · ouvrir · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:photo
  {
    id: 'S73', cote: 'salarie', libelle: 'Changer sa photo',
    genre: 'ouvrir', niveau: 1,
    guides: ['photo-profil'],
  },
  // S74 · ouvrir · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:notifications
  {
    id: 'S74', cote: 'salarie', libelle: 'Activer / couper les notifications',
    genre: 'ouvrir', niveau: 1,
    guides: ['notifications'],
    ecart: {
      livraison: '3d3',
      note: "WORKER_NAV:notifications lance l'activation (enablePush) si elles ne sont pas déjà actives ; si elles le sont, rien ne se passe (le code n'appelle jamais la coupure, contrairement à ce que dit l'inventaire interne « bascule »). À créer : couper_notifications, niveau 2 (réversible).",
    },
  },
  // S75 · ouvrir · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:infos
  {
    id: 'S75', cote: 'salarie', libelle: "« L'endroit au pointage » et confidentialité",
    genre: 'ouvrir', niveau: 1,
    guides: ['infos'],
  },
  // S76 · humain · niveau 3
  {
    id: 'S76', cote: 'salarie', libelle: 'Se déconnecter',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'doute_patron',
      raison: "Fin de session : l'assistant agit avec le jeton de la personne (vision §4) et ne se retire pas lui-même ce jeton ; droits d'accès = niveau 3 (vision §3). À confirmer par le patron.",
    },
  },
  // S77 · naviguer · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:journee, WORKER_NAV:semaine, WORKER_NAV:mois, WORKER_NAV:historique
  {
    id: 'S77', cote: 'salarie', libelle: 'Naviguer entre les vues',
    genre: 'naviguer', niveau: 1,
    ecart: {
      livraison: '3b',
      note: "les 4 vues du menu s'ouvrent par WORKER_NAV:* ; la vue « Formations » (entrée du menu s'il y en a au moins une) n'a pas de navigation, ni l'ouverture d'un jour précis (S54).",
    },
  },
  // S78 · humain · niveau 1
  {
    id: 'S78', cote: 'salarie', libelle: 'Ajouter, modifier, retirer ses heures sans réseau',
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'appareil',
      raison: "Règle d'or « l'heure n'est jamais bloquée faute de réseau » : tenue par l'écran et la file du navigateur (battime_offline_<id>), hors de portée d'un service en ligne.",
    },
  },
  // S79 · lire · niveau 1
  {
    id: 'S79', cote: 'salarie', libelle: 'État hors-ligne et nombre en attente',
    genre: 'lire', niveau: 1,
    dette: {
      livraison: '3c', avant: '2027-02-28',
      note: '« Hors-ligne, tout est gardé · N en attente » et la bande « N chantiers pas encore partis » viennent de la file du navigateur (localStorage) : le serveur ne la voit pas.',
    },
  },
  // S80 · ecrire · niveau 2
  {
    id: 'S80', cote: 'salarie', libelle: 'Transfert au retour du réseau, relance, échecs signalés',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: 'le transfert est automatique (retour du réseau, retour au premier plan) ; après 5 essais ou un refus définitif la bande dit « N chantier(s) du jj/mm ne part(ent) pas.',
    },
  },
  // S81 · ecrire · niveau 2
  {
    id: 'S81', cote: 'salarie', libelle: "Panier d'une journée encore vide",
    genre: 'ecrire', niveau: 2,
    outil: 'panier_repas',
    ecart: {
      livraison: '3d3',
      note: "l'écran garde le choix (une intention par jour, posée sur la première ligne qui apparaît) ; panier_repas répond « Aucune ligne aujourd'hui : notez d'abord vos heures ». À créer : mémoriser l'intention comme l'écran, ou refuser clairement.",
    },
  },
  // S82 · guider · niveau 1
  {
    id: 'S82', cote: 'salarie', libelle: "Ouvrir l'assistant (si IA activée)",
    genre: 'guider', niveau: 1,
    guides: ['assistant'],
  },
  // S83 · guider · niveau 1
  {
    id: 'S83', cote: 'salarie', libelle: 'Écrire ou dicter (français, turc)',
    genre: 'guider', niveau: 1,
    guides: ['assistant'],
  },
  // S84 · ecrire · niveau 2
  {
    id: 'S84', cote: 'salarie', libelle: 'Joindre une photo ou un PDF',
    genre: 'ecrire', niveau: 2,
    outil: 'ranger_photo',
  },
  // S85 · guider · niveau 1
  // référence du cahier absente du code, ignorée : WORKER_ACTION_SUGGESTIONS
  {
    id: 'S85', cote: 'salarie', libelle: 'Suggestions de départ',
    genre: 'guider', niveau: 1,
  },
  // S86 · ecrire · niveau 2
  // comportement hors registre (instantané, lecteur local, fiche multi) : local:parseHoursText
  {
    id: 'S86', cote: 'salarie', libelle: 'Heures dites en une phrase, Annuler / Modifier',
    genre: 'ecrire', niveau: 2,
    outil: 'declarer_heures',
  },
  // S87 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : Niveau 3 = envoyer_journee (dernier clic sur la carte), suppressions et nouveau_chantier ; tout le reste est au niveau 2 avec Annuler.
  {
    id: 'S87', cote: 'salarie', libelle: 'Actions (congé, terminer le pointage ouvert, réserve, document, envoi…) : simples ou à confirmer',
    genre: 'ecrire', niveau: 3,
    outil: 'envoyer_journee',
  },
  // S88 · ecrire · niveau 3
  // raison du niveau 3 (cahier) : Le clic « Tout confirmer » est le dernier clic de l'utilisateur, y compris pour l'envoi de la journée (niveau 3) ; à arbitrer : exiger un second clic dédié à l'envoi.
  // comportement hors registre (instantané, lecteur local, fiche multi) : multi
  {
    id: 'S88', cote: 'salarie', libelle: 'Fiche « Tout confirmer » / « Ignorer »',
    genre: 'ecrire', niveau: 3,
  },
  // S89 · guider · niveau 1
  // référence du cahier absente du code, ignorée : WORKER_NAV:*, guide:*
  {
    id: 'S89', cote: 'salarie', libelle: 'Raccourcis vers les écrans, « Me guider pas à pas »',
    genre: 'guider', niveau: 1,
    outil: 'repondre',
  },
  // S90 · lire · niveau 1
  // comportement hors registre (instantané, lecteur local, fiche multi) : instantane:heures_notees, instantane:prevu_par_le_bureau, local:answerSimpleQuestion
  {
    id: 'S90', cote: 'salarie', libelle: 'Questions heures, planning, collègues (si autorisé)',
    genre: 'lire', niveau: 1,
    outil: 'planning_collegues',
    ecart: {
      livraison: '3c',
      note: 'heures de la semaine en cours, planning de -2 à +1 jour, lignes du jour ; collègues par la fonction SQL limitée colleagues_planning (prénom, chantier (ville), horaires prévus ; « absent » sans motif ; jamais les heures pointées…',
    },
  },
  // S91 · humain · niveau 1
  {
    id: 'S91', cote: 'salarie', libelle: 'Questions restantes du jour',
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'hors_ecran',
      raison: "Garde-fou de coût tenu par le serveur (vision §4, quotas par jour) : l'assistant ne le lit ni ne le modifie.",
    },
  },
  // S92 · humain · niveau 1
  {
    id: 'S92', cote: 'salarie', libelle: '« Nouveau chat », « Historique » (pas en service)',
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'donnee_sensible',
      raison: "Conversations privées par utilisateur (vision §6) : seul l'auteur les lit, les rouvre ou les efface ; le modèle n'a pas à y toucher.",
    },
  },
  // S93 · guider · niveau 1
  {
    id: 'S93', cote: 'salarie', libelle: 'Guide pas à pas',
    genre: 'guider', niveau: 1,
    guides: [
      'reserve', 'photo-document', 'conge', 'pointer', 'envoyer-journee', 'noter-heures', 'planning', 'historique',
      'copier-journee', 'notifications', 'photo-profil', 'panier', 'modifier-heures', 'retirer-ligne', 'route-pause',
      'lever-reserve', 'annuler-conge', 'sortie-oubliee', 'autre-chantier', 'envoyer-client', 'borne', 'equipe',
      'infos',
    ],
  },
  // S94 · humain · niveau 3
  {
    id: 'S94', cote: 'salarie', libelle: 'Vérifier le QR ; se connecter sur place',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'securite',
      raison: "Identifiants : saisie humaine seulement (droits d'accès, vision §3 niveau 3) ; l'assistant ne voit ni ne manipule jamais un mot de passe.",
    },
  },
  // S95 · humain · niveau 3
  {
    id: 'S95', cote: 'salarie', libelle: 'Information et position du QR fixe (refus possible)',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'donnee_sensible',
      raison: 'Consentement à la lecture de la position (CNIL) : décision strictement personnelle, refus libre et sans conséquence.',
    },
  },
  // S96 · humain · niveau 3
  // outils cités par le cahier, non retenus (capacité humain, T4) : declarer_heures
  {
    id: 'S96', cote: 'salarie', libelle: 'Arrivée + « Ajouter une intervention faite avant »',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'appareil',
      raison: "Le pointage est un geste physique de présence décidé par le serveur ; le raccourci n'écrit rien (S48).",
    },
  },
  // S97 · humain · niveau 3
  // outils cités par le cahier, non retenus (capacité humain, T4) : envoyer_journee, declarer_heures
  {
    id: 'S97', cote: 'salarie', libelle: 'Départ + « Envoyer ma journée », « Ajouter une intervention »',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'appareil',
      raison: "Le départ est un geste physique de présence décidé par le serveur ; l'envoi de la journée garde sa confirmation (S39, niveau 3).",
    },
  },
  // S98 · humain · niveau 1
  {
    id: 'S98', cote: 'salarie', libelle: 'Pointage annulé (< 1 min) ; « Rien à enregistrer »',
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'hors_ecran',
      raison: "Résultat décidé par le serveur et affiché sur une page qui n'héberge pas l'assistant : rien à agir.",
    },
  },
  // S99 · humain · niveau 3
  {
    id: 'S99', cote: 'salarie', libelle: 'Pointage non enregistré, refus du QR fixe, « Réessayer » (si ticket connu)',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'donnee_sensible',
      raison: '« Réessayer » relance la lecture de la position : nouveau consentement à donner par la personne (CNIL).',
    },
  },
  // S100 · humain · niveau 1
  // navigation existante, rattachée par un ouvreur en 3b : WORKER_NAV:journee
  {
    id: 'S100', cote: 'salarie', libelle: '« Ouvrir mon espace »',
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'hors_ecran',
      raison: "Lien d'une page qui n'héberge pas l'assistant : aucune donnée, rien à agir.",
    },
  },
  // S101 · humain · niveau 1
  {
    id: 'S101', cote: 'salarie', libelle: 'Retour du téléphone referme la couche ouverte',
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'appareil',
      raison: "Comportement de l'appareil et de l'historique du navigateur, sans donnée.",
    },
  },
  // S102 · humain · niveau 3
  {
    id: 'S102', cote: 'salarie', libelle: 'Accès : compte archivé, rôle refusé, chargement',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'droits_acces',
      raison: "Droits d'accès et statut du compte (vision §3 niveau 3) : décidés par le bureau et le serveur ; l'assistant n'a jamais plus de droits que la personne (vision §4).",
    },
  },
  // S103 · humain · niveau 1
  {
    id: 'S103', cote: 'salarie', libelle: 'Retours passagers visibles et touchables',
    genre: 'humain', niveau: 1,
    humain: {
      categorie: 'hors_ecran',
      raison: "Présentation d'écran : rien à agir ; l'annulation d'un geste de l'assistant est dans sa carte (ActionDone).",
    },
  },
  // S104 · lire · niveau 1
  // comportement hors registre (instantané, lecteur local, fiche multi) : instantane:heures_notees, instantane:lignes_du_jour, instantane:prevu_par_le_bureau
  {
    id: 'S104', cote: 'salarie', libelle: 'Total du jour, prévu non confirmé, compteurs (chantiers, pauses à préciser, route, panier)',
    genre: 'lire', niveau: 1,
    ecart: {
      livraison: '3c',
      note: "le modèle peut additionner les lignes du jour et lire le prévu, mais il n'a ni la pause de chaque ligne, ni le pointage en cours dans le total, ni les « pauses à préciser », la route (payée ou non), le panier pris, ni l'état « prévu non confirmé » calculé… À créer : lire_ma_journee(date) qui reprend les calculs partagés (day-hours, work-status) comme seule source des chiffres.",
    },
  },
  // S105 · ecrire · niveau 2
  {
    id: 'S105', cote: 'salarie', libelle: 'Transférer les saisies gardées sur le téléphone (« Envoyer ce qui reste (N) »)',
    genre: 'ecrire', niveau: 2,
    dette: {
      livraison: '3d5', avant: '2027-06-30',
      note: "capacité réelle absente de l'annexe (elle est rangée dans « les 5 états » du geste S39) : quand des lignes attendent sur le téléphone, le bouton du bas devient « Envoyer ce qui reste (N) » et ne fait QUE transférer les saisies (elles arrivent « à envoyer »)… À créer : envoyer_saisies_telephone, outil exécuté dans le navigateur (la file est dans localStorage), niveau 2 : rien n'est envoyé au bureau.",
    },
  },
  // S106 · humain · niveau 3
  {
    id: 'S106', cote: 'salarie', libelle: 'Voir ses documents (bulletins, contrat) et en envoyer au bureau (photo, fichier)',
    genre: 'humain', niveau: 3,
    humain: {
      categorie: 'donnee_sensible',
      raison: "Ajouté le 21 octobre 2026 à la demande d'Ergun : bulletins de paie et contrat sont des données personnelles, et un fichier se choisit à la main. L'assistant ne dépose ni ne retire de document ; leur lecture par l'IA est l'étape suivante.",
    },
  },
];
