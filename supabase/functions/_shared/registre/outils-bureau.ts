// Outils de l'assistant du BUREAU qui EXISTENT aujourd'hui (34 déclarations : `repondre` + 33 outils) : ce que le modèle voit (description et
// paramètres, mot pour mot) et la règle de chaque outil (niveau, mode, « Annuler », exécuteur). Couche STABLE du registre.
// Contrat : docs/ia-etape3/00-conception-etape3.md §2.3. Ordre = celui de ASSISTANT_FUNCTIONS : il fait
// partie de ce que le modèle reçoit, donc de l'empreinte. Depuis 3a-2 ces listes sont GÉNÉRÉES d'ici (registre/outils-pour.ts, `outilsPour`) ;
// assistant-actions-core.ts / worker-assistant-core.ts ne les écrivent plus.
//
// Les entrées jusqu'au repère « fin des outils de la livraison 3a » ont été GÉNÉRÉES par scripts/registre-outils-gen.ts d'après le code d'avant 3a-2
// (instantané registre/avant-3a2.snapshot.json) : pour changer un jugement (« Annuler », outils proches…), éditer les FICHES du script et le
// relancer, pas ce fichier. Depuis 3a-2 ces entrées sont la SOURCE (le code les lit) ; le script ne sert plus qu'à prouver, par le test « Dérive »,
// qu'elles décrivent toujours ce que la production recevait. Après le repère, les outils des livraisons suivantes (3b, 3c, 3d) s'écrivent à la
// main ; le script les laisse intacts. POURQUOI GÉNÉRÉ : des descriptions recopiées à la main finiraient par différer d'un caractère de celles sur lesquelles la
// consigne a été réglée. La preuve du contraire est outils-empreintes.json (SHA-256 gelés) et registre-outils.test.ts : les outils
// `livraison: '3a'`, ré-assemblés en { name, description, parameters }, redonnent la liste d'aujourd'hui. Changer un mot d'une description ou
// d'un schéma fait donc échouer ce test : c'est voulu, c'est une livraison à empreinte déclarée (3b-0), jamais une retouche en passant.
//
// Lecture d'une entrée (§1.2) : `kind` + `niveau` = ce que l'outil est AUJOURD'HUI ; `mode` = `modeActuel` en 3a (aucun changement de
// comportement) ; `annuler` : oui = l'inverse exact, partiel = « Annuler » existe mais peut ne pas tout défaire, non = rien à rejouer ;
// `notifie` : le résultat prévient un tiers ; `champsCarte` : paramètres de CHAMPS_CARTE (§1.2) ; `executeur` : le `case` de l'exécuteur du
// navigateur ; `code` : fichiers de lib/ réellement appelés par ce `case` (l'exécuteur lui-même quand il écrit aussi en ligne) ; `retrait` :
// REMOVAL_TYPES ; `pieceJointe` : ATTACHMENT_ACTIONS ; `domaines` : tool-domains.ts (ces trois listes sont maintenant générées d'ici : outils-listes-*.ts). Les lignes « note » justifient une valeur sûre mais peu
// évidente, les lignes « incertain » signalent une valeur à confirmer.
import { outilOuvrir } from './outil-ouvrir.ts';
import type { Outil } from './types.ts';
import { ABSENCE_KINDS, DOC_CATEGORIES, NAV_ACTIONS } from './vocab.ts';

export const OUTILS_BUREAU: Outil[] = [
  // repondre · réponse · niveau 1 · toujours proposé
  {
    id: 'repondre', cote: 'bureau', roles: ['admin'], kind: 'reponse', niveau: 1,
    description: 'Répondre à une question (chiffres de l’entreprise) ou expliquer comment faire dans BEMEXO, avec des boutons pour ouvrir le bon écran.',
    parametres: {
      type: 'object',
      properties: {
        reponse: {
          type: 'string',
          description: 'Réponse en français, courte. Pour un « comment faire » : 3 étapes numérotées au plus.',
        },
        liens: {
          type: 'array',
          items: { type: 'string', enum: [...Object.keys(NAV_ACTIONS), 'salarie'] },
          description: 'Écrans à proposer (« M’y emmener »).',
        },
        salarie_id: { type: 'string', description: 'Si un lien « salarie » : l’id du salarié (présent dans les données).' },
      },
      required: ['reponse'],
    },
    domaines: [], livraison: '3a', pieceJointe: true,
  },
  // inviter_salarie · écriture · niveau 3 (carte) · Annuler : non · prévient un tiers
  // note : l'invitation part par e-mail (invite-worker) : le message est déjà chez l'invité, un « Annuler » exact n'existe pas.
  // incertain : champsCarte : taux_horaire (paie) n'est pas dans la liste du §1.2 et reste hors champsCarte.
  {
    id: 'inviter_salarie', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Préparer l’invitation d’un nouveau salarié (email obligatoire pour l’envoyer ; laisser vide ce qui n’est pas dit). Avec un bulletin de paie joint : recopier les champs de paie ci-dessous, JAMAIS le numéro de sécurité sociale.',
    parametres: {
      type: 'object',
      properties: {
        prenom: { type: 'string', description: 'Prénom' },
        nom: { type: 'string', description: 'Nom' },
        email: { type: 'string', description: 'Email' },
        telephone: { type: 'string', description: 'Téléphone' },
        date_entree: { type: 'string', description: 'Date d’entrée, aaaa-mm-jj' },
        contrat: { type: 'string', description: 'Type de contrat (CDI, CDD…)' },
        taux_horaire: { type: 'number', description: 'Taux horaire brut' },
        heures_hebdo: { type: 'number', description: 'Heures par semaine' },
        bulletin_mois: { type: 'string', description: 'Mois du bulletin, aaaa-mm' },
        bulletin_brut: { type: 'number', description: 'Salaire brut du mois' },
        bulletin_cout_employeur: { type: 'number', description: 'Coût total employeur du mois' },
        bulletin_heures_payees: { type: 'number', description: 'Heures payées du mois' },
      },
      required: [],
    },
    domaines: ['salaries'], livraison: '3a', pieceJointe: true, proches: ['cout_reel'],
    mode: 'carte', modeActuel: 'carte', annuler: 'non', champsCarte: ['email', 'telephone', 'heures_hebdo'], notifie: true,
    executeur: 'inviter_salarie', code: ['lib/planning-writes.ts', 'lib/real-cost.ts'],
  },
  // creer_chantier · écriture · niveau 2 (conditionnel) · Annuler : partiel
  // note : écrit aussi en ligne dans l'exécuteur (.delete) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : annuler partiel : « Annuler » supprime le client, ou l'archive si la base refuse (il a déjà servi).
  // incertain : champsCarte : règle cible du §1.2 (telephone, email) ; la condition du mode actuel est budget_heures / montant_devis (actionMode).
  {
    id: 'creer_chantier', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 2,
    description: 'Préparer la création d’un client / chantier. Avec un devis joint : client, adresse du chantier, contact, montant HT du devis, et les heures de main-d’œuvre si le devis les donne EN HEURES.',
    parametres: {
      type: 'object',
      properties: {
        nom_client: { type: 'string', description: 'Nom du client' },
        ville: { type: 'string', description: 'Ville' },
        adresse: { type: 'string', description: 'Adresse' },
        telephone: { type: 'string', description: 'Téléphone' },
        email: { type: 'string', description: 'Email' },
        description: { type: 'string', description: 'Description' },
        montant_devis: {
          type: 'number',
          description: 'Montant total HT du devis (affiché pour information, ce n’est PAS un budget main-d’œuvre)',
        },
        budget_heures: { type: 'number', description: 'Heures de main-d’œuvre prévues, seulement si elles sont écrites en heures' },
      },
      required: ['nom_client'],
    },
    domaines: ['chantiers'], livraison: '3a', pieceJointe: true, proches: ['ranger_document'],
    mode: 'conditionnel', modeActuel: 'conditionnel', annuler: 'partiel', champsCarte: ['telephone', 'email'],
    executeur: 'creer_chantier', code: ['lib/admin-writes.ts', 'lib/chantier-docs.ts', 'lib/planning-writes.ts', 'lib/assistant-actions.ts'],
  },
  // ranger_document · écriture · niveau 2 (direct) · Annuler : oui
  {
    id: 'ranger_document', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 2,
    description: 'Ranger le fichier joint (photo, PDF) dans les documents d’un chantier existant, avec sa catégorie (dite, sinon devinée d’après le contenu du document).',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier / client tel que dit (avec la ville si dite)' },
        categorie: { type: 'string', enum: [...DOC_CATEGORIES] },
        libelle: { type: 'string', description: 'Nom court et lisible du document (ex. « Facture Plomberie Martin – 1 240 € »)' },
      },
      required: ['chantier'],
    },
    domaines: ['documents'], livraison: '3a', pieceJointe: true, proches: ['creer_chantier', 'ajouter_depense'],
    mode: 'direct', modeActuel: 'direct', annuler: 'oui',
    executeur: 'ranger_document', code: ['lib/chantier-docs.ts'],
  },
  // poser_absence · écriture · niveau 2 (direct) · Annuler : oui
  {
    id: 'poser_absence', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 2,
    description: 'Préparer un congé ou une absence pour un salarié, sur des dates.',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Nom du salarié tel que dit' },
        type: { type: 'string', enum: [...ABSENCE_KINDS] },
        du: { type: 'string', description: 'aaaa-mm-jj' },
        au: { type: 'string', description: 'aaaa-mm-jj' },
      },
      required: ['salarie', 'type', 'du'],
    },
    domaines: ['planning'], livraison: '3a', proches: ['repondre_conge'],
    mode: 'direct', modeActuel: 'direct', annuler: 'oui',
    executeur: 'poser_absence', code: ['lib/planning-writes.ts'],
  },
  // affecter_planning · écriture · niveau 2 (direct) · Annuler : partiel
  // note : annuler partiel : une case qui porte des heures notées depuis est gardée, et c'est dit (partialUndo).
  {
    id: 'affecter_planning', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 2,
    description: 'Ajouter une intervention au planning : un salarié sur un chantier / client existant, un ou plusieurs jours (« ajoute une intervention », « mets Karim chez Dupont jeudi »).',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Nom du salarié ; « moi » si la personne parle d’elle-même (« rajoute-moi »)' },
        chantier: {
          type: 'string',
          description: 'Nom du chantier / client EXISTANT, tel que dans CHANTIERS (vide si seul un lieu est dit)',
        },
        dates: { type: 'array', items: { type: 'string', description: 'aaaa-mm-jj (voir CALENDRIER)' } },
        objet: {
          type: 'string',
          description: 'Objet COURT de l’intervention, 2 à 6 mots, sans le nom du client ni la date, sans « euh » (ex. « Remplacement chauffe-eau », « Pose carrelage cuisine »). Vide si rien n’est dit.',
        },
        lieu: { type: 'string', description: 'Ville ou lieu dit (« à Lyon ») quand aucun client n’est nommé' },
        debut: { type: 'string', description: 'Heure de début HH:MM si dite (« 14h » → 14:00)' },
        fin: { type: 'string', description: 'Heure de fin HH:MM si dite (« jusqu’à 18h »)' },
        moment: { type: 'string', description: 'matin, après-midi ou journée, si dit' },
      },
      required: ['salarie', 'chantier', 'dates'],
    },
    domaines: ['planning'], livraison: '3a', proches: ['modifier_intervention'],
    mode: 'direct', modeActuel: 'direct', annuler: 'partiel',
    executeur: 'affecter_planning', code: ['lib/erase.ts', 'lib/planning-writes.ts'],
  },
  // planning_semaine · écriture · niveau 3 (carte) · Annuler : partiel
  // note : annuler partiel : une case qui porte des heures notées depuis est gardée ; la version du planning gardée reste.
  {
    id: 'planning_semaine', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Préparer une PROPOSITION de planning pour une semaine (par défaut la semaine prochaine), en tenant compte des congés et du planning actuel.',
    parametres: {
      type: 'object',
      properties: { semaine_du: { type: 'string', description: 'Un jour de la semaine voulue, aaaa-mm-jj (facultatif)' } },
      required: [],
    },
    domaines: ['planning'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'partiel',
    executeur: 'planning_semaine', code: ['lib/erase.ts', 'lib/planning-versions.ts', 'lib/planning-writes.ts'],
  },
  // corriger_pointage · écriture · niveau 3 (carte) · Annuler : non · prévient un tiers
  // note : le salarié est prévenu (send-push) avec le motif : un « Annuler » exact ne rattraperait pas le message ; la correction est tracée avant / après en base.
  {
    id: 'corriger_pointage', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Préparer la correction des heures envoyées par un salarié, un jour donné, avec le motif (le salarié le lit).',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Nom du salarié' },
        date: { type: 'string', description: 'aaaa-mm-jj' },
        debut: { type: 'string', description: 'HH:MM' },
        fin: { type: 'string', description: 'HH:MM' },
        motif: {
          type: 'string',
          description: 'Pourquoi on corrige, tel que dit (ex. « oubli de pause », « badge oublié »). Vide si rien n’est dit : l’écran le demandera.',
        },
      },
      required: ['salarie', 'date', 'debut', 'fin'],
    },
    domaines: ['heures'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non', notifie: true,
    executeur: 'corriger_pointage', code: ['lib/office-edits.ts'],
  },
  // modifier_intervention · écriture · niveau 2 (direct) · Annuler : oui
  // note : « Annuler » remet l'état d'avant sans vérifier que ces champs valent encore la valeur écrite : §1.2 l'exigera en 3d-1.
  {
    id: 'modifier_intervention', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 2,
    description: 'Modifier une intervention DÉJÀ au planning : la déplacer (autre jour, autre salarié), changer l’heure ou la note.',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié actuellement prévu' },
        date: { type: 'string', description: 'Jour actuel, aaaa-mm-jj' },
        chantier: { type: 'string', description: 'Chantier, s’il y en a plusieurs ce jour-là' },
        nouvelle_date: { type: 'string', description: 'Nouveau jour, aaaa-mm-jj' },
        nouveau_salarie: { type: 'string', description: 'Nouveau salarié' },
        heure: { type: 'string', description: 'Nouvelle heure HH:MM' },
        note: { type: 'string', description: 'Nouvelle note, courte' },
      },
      required: ['salarie', 'date'],
    },
    domaines: ['planning'], livraison: '3a', proches: ['affecter_planning'],
    mode: 'direct', modeActuel: 'direct', annuler: 'oui',
    executeur: 'modifier_intervention', code: ['lib/admin-writes.ts', 'lib/erase.ts'],
  },
  // repondre_conge · écriture · niveau 3 (carte) · Annuler : non · prévient un tiers
  // note : le salarié est prévenu (notifyWorker) de la décision.
  {
    id: 'repondre_conge', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Accepter ou refuser une demande de congé EN ATTENTE (le salarié est prévenu).',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié' },
        decision: { type: 'string', enum: ['accepter', 'refuser'] },
        motif: { type: 'string', description: 'Motif du refus (facultatif)' },
      },
      required: ['decision'],
    },
    domaines: ['planning'], livraison: '3a', proches: ['poser_absence'],
    mode: 'carte', modeActuel: 'carte', annuler: 'non', notifie: true,
    executeur: 'repondre_conge', code: ['lib/admin-writes.ts'],
  },
  // lever_reserve · écriture · niveau 3 (carte) · Annuler : non
  {
    id: 'lever_reserve', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Lever une réserve de chantier ouverte (réglée).',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier' },
        salarie: { type: 'string', description: 'Salarié qui l’a signalée' },
        note: { type: 'string', description: 'Comment elle a été réglée (facultatif)' },
      },
      required: [],
    },
    domaines: ['heures', 'chantiers'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'lever_reserve', code: ['lib/admin-writes.ts'],
  },
  // ajouter_depense · écriture · niveau 3 (carte) · Annuler : non
  {
    id: 'ajouter_depense', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Ajouter une dépense (achat, facture) sur un chantier, dans « Coût chantiers ».',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier' },
        montant: { type: 'number', description: 'Montant en € (négatif = avoir)' },
        libelle: { type: 'string', description: 'Libellé court (ex. « Plaques BA13 »)' },
        categorie: { type: 'string', enum: ['materiaux', 'sous_traitance', 'location', 'autre'] },
        date: { type: 'string', description: 'Date de la dépense aaaa-mm-jj (défaut : aujourd’hui)' },
      },
      required: ['chantier', 'montant'],
    },
    domaines: ['chantiers'], livraison: '3a', pieceJointe: true, proches: ['ranger_document'],
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'ajouter_depense', code: ['lib/admin-writes.ts'],
  },
  // modifier_client · écriture · niveau 3 (carte) · Annuler : non
  {
    id: 'modifier_client', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Modifier la fiche d’un client / chantier existant (coordonnées, description, budget). Ne remplir QUE ce qui change.',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Client / chantier à modifier' },
        nouveau_nom: { type: 'string', description: 'Nouveau nom' },
        ville: { type: 'string', description: 'Ville' },
        adresse: { type: 'string', description: 'Adresse' },
        telephone: { type: 'string', description: 'Téléphone' },
        email: { type: 'string', description: 'Email' },
        description: { type: 'string', description: 'Description' },
        budget_heures: { type: 'number', description: 'Heures prévues' },
        budget_montant: { type: 'number', description: 'Montant prévu € HT' },
      },
      required: ['chantier'],
    },
    domaines: ['chantiers'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non', champsCarte: ['telephone', 'email'],
    executeur: 'modifier_client', code: ['lib/admin-writes.ts'],
  },
  // archiver_client · écriture · niveau 3 (carte) · Annuler : non
  {
    id: 'archiver_client', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Archiver un client / chantier terminé (il disparaît des listes, rien n’est supprimé).',
    parametres: {
      type: 'object',
      properties: { chantier: { type: 'string', description: 'Client / chantier' } },
      required: ['chantier'],
    },
    domaines: ['chantiers'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'archiver_client', code: ['lib/admin-writes.ts'],
  },
  // changer_role · écriture · niveau 3 (carte) · Annuler : non
  // note : droits d'accès : niveau 3 de la vision, jamais un geste direct.
  {
    id: 'changer_role', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Changer le rôle d’une personne : salarié, chef d’équipe ou bureau.',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Personne' },
        role: { type: 'string', enum: ['worker', 'lead', 'admin'] },
      },
      required: ['salarie', 'role'],
    },
    domaines: ['salaries'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'changer_role', code: ['lib/admin-writes.ts'],
  },
  // relancer_invitation · écriture · niveau 3 (carte) · Annuler : non · prévient un tiers
  // note : renvoie l'e-mail d'invitation (invite-worker).
  {
    id: 'relancer_invitation', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Renvoyer l’email d’une invitation en attente.',
    parametres: {
      type: 'object',
      properties: { personne: { type: 'string', description: 'Nom ou email de l’invité' } },
      required: [],
    },
    domaines: ['salaries'], livraison: '3a', proches: ['envoyer_rappel'],
    mode: 'carte', modeActuel: 'carte', annuler: 'non', notifie: true,
    executeur: 'relancer_invitation', code: ['lib/admin-writes.ts'],
  },
  // envoyer_rappel · écriture · niveau 3 (carte) · Annuler : non · prévient un tiers
  // note : notification sur le téléphone du salarié (send-push).
  {
    id: 'envoyer_rappel', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Envoyer à un salarié le rappel « Pense à envoyer tes heures ».',
    parametres: { type: 'object', properties: { salarie: { type: 'string', description: 'Salarié' } }, required: ['salarie'] },
    domaines: ['heures', 'salaries'], livraison: '3a', proches: ['relancer_invitation'],
    mode: 'carte', modeActuel: 'carte', annuler: 'non', notifie: true,
    executeur: 'envoyer_rappel', code: ['lib/admin-writes.ts'],
  },
  // cloturer_mois · écriture · niveau 3 (carte) · Annuler : non
  {
    id: 'cloturer_mois', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Clôturer un mois (plus aucune modification des heures).',
    parametres: { type: 'object', properties: { mois: { type: 'string', description: 'Mois aaaa-mm' } }, required: ['mois'] },
    domaines: ['heures', 'reglages'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'cloturer_mois', code: ['lib/admin-writes.ts'],
  },
  // attribuer_client · écriture · niveau 3 (carte) · Annuler : non
  {
    id: 'attribuer_client', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Attribuer un client aux heures qu’un salarié a notées sur « Autre » (ou sans chantier), un jour donné.',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié' },
        date: { type: 'string', description: 'aaaa-mm-jj' },
        chantier: { type: 'string', description: 'Client à attribuer' },
      },
      required: ['salarie', 'chantier'],
    },
    domaines: ['heures', 'chantiers'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'attribuer_client', code: ['lib/admin-writes.ts'],
  },
  // ajouter_habilitation · écriture · niveau 3 (carte) · Annuler : non
  {
    id: 'ajouter_habilitation', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Ajouter une habilitation / un document à suivre à un salarié (CACES, carte BTP, visite médicale…), avec sa date d’expiration.',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié' },
        type: {
          type: 'string',
          enum: ['caces', 'carte_btp', 'habilitation_electrique', 'visite_medicale', 'travail_hauteur', 'autre'],
        },
        libelle: { type: 'string', description: 'Précision (ex. « CACES R489 cat. 3 »)' },
        expiration: { type: 'string', description: 'Date d’expiration aaaa-mm-jj' },
      },
      required: ['salarie', 'type', 'expiration'],
    },
    domaines: ['salaries'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'ajouter_habilitation', code: ['lib/admin-writes.ts'],
  },
  // modifier_salarie · écriture · niveau 3 (carte) · Annuler : non
  {
    id: 'modifier_salarie', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Corriger le prénom, le nom ou le téléphone d’un salarié (jamais le n° de sécurité sociale).',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié' },
        prenom: { type: 'string', description: 'Nouveau prénom' },
        nom: { type: 'string', description: 'Nouveau nom' },
        telephone: { type: 'string', description: 'Nouveau téléphone' },
      },
      required: ['salarie'],
    },
    domaines: ['salaries'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non', champsCarte: ['telephone'],
    executeur: 'modifier_salarie', code: ['lib/admin-writes.ts'],
  },
  // archiver_salarie · écriture · niveau 3 (carte) · Annuler : non
  {
    id: 'archiver_salarie', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Archiver un salarié parti (ses heures restent, il ne peut plus se connecter).',
    parametres: { type: 'object', properties: { salarie: { type: 'string', description: 'Salarié' } }, required: ['salarie'] },
    domaines: ['salaries'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'archiver_salarie', code: ['lib/admin-writes.ts'],
  },
  // cout_reel · écriture · niveau 3 (carte) · Annuler : non
  {
    id: 'cout_reel', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Avec un bulletin de paie joint d’un salarié EXISTANT : recopier le coût réel du mois (jamais le n° de sécurité sociale).',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié' },
        mois: { type: 'string', description: 'Mois aaaa-mm' },
        brut: { type: 'number', description: 'Salaire brut' },
        cout_employeur: { type: 'number', description: 'Coût total employeur' },
        heures_payees: { type: 'number', description: 'Heures payées' },
      },
      required: ['salarie'],
    },
    domaines: ['salaries'], livraison: '3a', pieceJointe: true, proches: ['inviter_salarie'],
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'cout_reel', code: ['lib/real-cost.ts'],
  },
  // modifier_reglages · écriture · niveau 3 (carte) · Annuler : non
  // note : écrit aussi en ligne dans l'exécuteur (.rpc) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // incertain : champsCarte : heure_relance ajouté (il règle relance_auto) ; le §1.2 ne le nomme pas.
  {
    id: 'modifier_reglages', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Changer un réglage de l’entreprise. Ne remplir QUE ce qui change.',
    parametres: {
      type: 'object',
      properties: {
        heures_hebdo: { type: 'number', description: 'Horaire hebdomadaire' },
        email_comptable: { type: 'string', description: 'Email du comptable' },
        relance_auto: { type: 'boolean', description: 'Relance automatique des heures' },
        heure_relance: { type: 'number', description: 'Heure de la relance (0-23)' },
        alertes_budget: { type: 'boolean', description: 'Alertes de budget' },
        trajet_paye: { type: 'boolean', description: 'Trajet payé' },
        majoration_1: { type: 'number', description: 'Taux heures sup 1 (%)' },
        majoration_2: { type: 'number', description: 'Taux heures sup 2 (%)' },
        telephone: { type: 'string', description: 'Téléphone de l’entreprise' },
        email: { type: 'string', description: 'Email de l’entreprise' },
        adresse: { type: 'string', description: 'Adresse' },
        code_postal: { type: 'string', description: 'Code postal' },
        ville: { type: 'string', description: 'Ville' },
        planning_collegues: { type: 'boolean', description: 'Les salariés voient le planning de leurs collègues' },
      },
      required: [],
    },
    domaines: ['reglages'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non', champsCarte: [
      'heures_hebdo',
      'email_comptable',
      'relance_auto',
      'alertes_budget',
      'trajet_paye',
      'majoration_1',
      'majoration_2',
      'telephone',
      'email',
      'planning_collegues',
    ],
    executeur: 'modifier_reglages', code: ['lib/admin-writes.ts', 'lib/assistant-actions.ts'],
  },
  // supprimer_intervention · écriture · niveau 3 (carte) · Annuler : oui · retrait
  // note : paire documentée : 2 échecs sur 3 avant correction (ia-v2.md, « retire X »).
  {
    id: 'supprimer_intervention', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Retirer / enlever / supprimer UNE intervention (une case) du planning : un salarié (ou un chantier) et UN seul jour, par exemple « retire Marc du planning mardi », « enlève Sofiane de la Pizzeria Exemple jeudi ». « Vide / efface le planning », plusieurs jours, une période, une semaine, toute l’équipe → effacer_planning.',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié prévu (« moi » pour la personne qui parle)' },
        date: {
          type: 'string',
          description: 'Jour, aaaa-mm-jj. Un nom de jour seul (« mardi ») = le PROCHAIN jour de ce nom du CALENDRIER, aujourd’hui compris ; jamais un jour déjà passé, sauf s’il est dit (« dernier », « hier »).',
        },
        chantier: { type: 'string', description: 'Client ou chantier, s’il est dit' },
        lieu: { type: 'string', description: 'Lieu ou ville dit (« l’intervention à Lyon »)' },
      },
      required: [],
    },
    domaines: ['planning'], livraison: '3a', proches: ['effacer_planning'],
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'supprimer_intervention', code: ['lib/erase.ts', 'lib/planning-versions.ts'],
  },
  // effacer_planning · écriture · niveau 3 (carte) · Annuler : oui · retrait
  {
    id: 'effacer_planning', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Effacer / VIDER le planning (les interventions, pas les absences) d’UN salarié sur plusieurs jours, une période ou une semaine, ou de TOUTE l’équipe (même un seul jour) : « vide », « efface le planning ». « Retire / enlève <salarié> du planning <un jour> » (UN seul jour, une case) → supprimer_intervention, pas cet outil.',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié ; vide = toute l’équipe' },
        du: {
          type: 'string',
          description: 'Premier jour, aaaa-mm-jj. Un nom de jour seul (« mardi ») = le PROCHAIN jour de ce nom du CALENDRIER, aujourd’hui compris ; jamais un jour déjà passé, sauf s’il est dit (« dernier », « hier »).',
        },
        au: {
          type: 'string',
          description: 'Dernier jour, aaaa-mm-jj (même règle : le PROCHAIN jour de ce nom du CALENDRIER, jamais un jour déjà passé).',
        },
        semaine: {
          type: 'string',
          description: '« prochaine », « en cours » ou un jour de la semaine voulue, si c’est une semaine entière',
        },
      },
      required: [],
    },
    domaines: ['planning'], livraison: '3a', proches: ['supprimer_intervention'],
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'effacer_planning', code: ['lib/erase.ts', 'lib/planning-versions.ts'],
  },
  // supprimer_absence · écriture · niveau 3 (carte) · Annuler : oui · retrait
  {
    id: 'supprimer_absence', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Retirer un congé, un arrêt ou une absence posé au planning (le salarié redevient présent ces jours-là).',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié' },
        du: { type: 'string', description: 'Premier jour, aaaa-mm-jj' },
        au: { type: 'string', description: 'Dernier jour, aaaa-mm-jj' },
      },
      required: ['salarie'],
    },
    domaines: ['planning'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'supprimer_absence', code: ['lib/erase.ts', 'lib/planning-versions.ts'],
  },
  // supprimer_document · écriture · niveau 3 (carte) · Annuler : oui · retrait
  // note : écrit aussi en ligne dans l'exécuteur (.storage, .delete, .insert) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : « Annuler » re-téléverse le fichier gardé en mémoire : perdu au rechargement de l'écran.
  {
    id: 'supprimer_document', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Supprimer un document ou une photo rangé sur un chantier.',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier' },
        quoi: { type: 'string', description: 'Quel document : « la facture », « le devis », « la dernière photo », son nom…' },
      },
      required: [],
    },
    domaines: ['documents'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'supprimer_document', code: ['lib/assistant-actions.ts'],
  },
  // modifier_document · écriture · niveau 3 (carte) · Annuler : oui · retrait
  // note : écrit aussi en ligne dans l'exécuteur (.update) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : « Annuler » remet catégorie et nom d'avant sans vérifier qu'ils valent encore la valeur écrite : §1.2 l'exigera en 3d-1.
  {
    id: 'modifier_document', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Changer la catégorie ou le nom d’un document de chantier.',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier' },
        quoi: { type: 'string', description: 'Quel document' },
        nouvelle_categorie: { type: 'string', enum: [...DOC_CATEGORIES] },
        nouveau_nom: { type: 'string', description: 'Nouveau nom, court' },
      },
      required: [],
    },
    domaines: ['documents'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'modifier_document', code: ['lib/assistant-actions.ts'],
  },
  // supprimer_depense · écriture · niveau 3 (carte) · Annuler : oui · retrait
  {
    id: 'supprimer_depense', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Supprimer une dépense d’un chantier.',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier' },
        montant: { type: 'number', description: 'Montant en euros, s’il est dit' },
        quoi: { type: 'string', description: 'Quelle dépense (libellé, « la dernière »)' },
      },
      required: [],
    },
    domaines: ['chantiers'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'supprimer_depense', code: ['lib/erase.ts'],
  },
  // modifier_depense · écriture · niveau 3 (carte) · Annuler : oui · retrait
  // note : écrit aussi en ligne dans l'exécuteur (.update) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : « Annuler » remet montant, libellé et catégorie d'avant sans vérifier qu'ils valent encore la valeur écrite : §1.2 l'exigera en 3d-1.
  {
    id: 'modifier_depense', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Corriger une dépense d’un chantier (montant, libellé, catégorie).',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier' },
        montant: { type: 'number', description: 'Montant ACTUEL, s’il est dit' },
        quoi: { type: 'string', description: 'Quelle dépense' },
        nouveau_montant: { type: 'number', description: 'Nouveau montant' },
        nouveau_libelle: { type: 'string', description: 'Nouveau libellé' },
        nouvelle_categorie: { type: 'string', enum: ['materiaux', 'sous_traitance', 'location', 'autre'] },
      },
      required: [],
    },
    domaines: ['chantiers'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'modifier_depense', code: ['lib/assistant-actions.ts'],
  },
  // supprimer_habilitation · écriture · niveau 3 (carte) · Annuler : oui · retrait
  {
    id: 'supprimer_habilitation', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Supprimer une habilitation / un document suivi d’un salarié (CACES, carte BTP…).',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié' },
        quoi: { type: 'string', description: 'Laquelle (CACES, carte BTP, visite médicale…)' },
      },
      required: ['salarie'],
    },
    domaines: ['salaries'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'supprimer_habilitation', code: ['lib/erase.ts'],
  },
  // modifier_habilitation · écriture · niveau 3 (carte) · Annuler : oui · retrait
  // note : écrit aussi en ligne dans l'exécuteur (.update) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : « Annuler » remet date, libellé et alertes d'avant sans vérifier qu'ils valent encore la valeur écrite : §1.2 l'exigera en 3d-1.
  {
    id: 'modifier_habilitation', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Changer la date d’expiration ou le libellé d’une habilitation.',
    parametres: {
      type: 'object',
      properties: {
        salarie: { type: 'string', description: 'Salarié' },
        quoi: { type: 'string', description: 'Laquelle' },
        expiration: { type: 'string', description: 'Nouvelle date d’expiration, aaaa-mm-jj' },
        nouveau_libelle: { type: 'string', description: 'Nouveau libellé' },
      },
      required: ['salarie'],
    },
    domaines: ['salaries'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'modifier_habilitation', code: ['lib/assistant-actions.ts'],
  },
  // annuler_invitation · écriture · niveau 3 (carte) · Annuler : partiel · retrait
  // note : écrit aussi en ligne dans l'exécuteur (.functions.invoke) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : annuler partiel : « Annuler » renvoie une invitation (nouvel e-mail), pas la même ; aucun « Annuler » si l'invitation n'est plus trouvée.
  // note : email = clé de recherche de l'invitation à retirer, pas une adresse écrite : hors champsCarte.
  {
    id: 'annuler_invitation', cote: 'bureau', roles: ['admin'], kind: 'ecriture', niveau: 3,
    description: 'Annuler une invitation de salarié en attente.',
    parametres: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Nom de la personne invitée' },
        email: { type: 'string', description: 'Son email' },
      },
      required: [],
    },
    domaines: ['salaries'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'partiel',
    executeur: 'annuler_invitation', code: ['lib/admin-writes.ts', 'lib/assistant-actions.ts'],
  },
  // ── fin des outils de la livraison 3a (ci-dessus : généré par scripts/registre-outils-gen.ts ; les outils des livraisons suivantes s'ajoutent APRÈS ce repère) ──

  // ── Livraison 3b-1 (à la main, GÉNÉRÉ depuis les ouvreurs) : `ouvrir_fenetre`, servi seulement si l'interrupteur `ouvrir` est allumé. ──
  outilOuvrir('bureau'),
];
