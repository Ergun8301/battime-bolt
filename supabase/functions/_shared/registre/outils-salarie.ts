// Outils de l'assistant du SALARIÉ qui EXISTENT aujourd'hui (19 déclarations : `repondre` + 18 outils) : ce que le modèle voit (description et
// paramètres, mot pour mot) et la règle de chaque outil (niveau, mode, « Annuler », exécuteur). Couche STABLE du registre.
// Contrat : docs/ia-etape3/00-conception-etape3.md §2.3. Ordre = celui de WORKER_FUNCTIONS : il fait
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
//
// PROFIL LONG (phrase libre de ≥ 120 caractères, turc, plusieurs actions : saisie-profil.ts) : tout geste `direct` ci-dessous y passe par une
// fiche à confirmer (worker-multi.ts, `confirmer: true`). `mode` décrit le profil court, le seul que workerActionMode connaisse. Le profil long
// a en outre deux déclarations à lui (DECLARER_HEURES_LONG, NOUVEAU_CHANTIER_LONG, worker-multi-prompt.ts) que ce registre ne porte pas
// encore : `variantes` (§2.3) ne prévoit que l'extension d'un outil par une livraison, pas un profil. 3a-2 ne les déplace pas : elles restent écrites
// dans worker-multi-prompt.ts, à trancher avec la boucle d'outils (3c).
import type { Outil } from './types.ts';
import { DOC_CATEGORIES, LEAVE_KINDS, WORKER_NAV } from './vocab.ts';

export const OUTILS_SALARIE: Outil[] = [
  // effacer_heures · écriture · niveau 3 (carte) · Annuler : oui · retrait
  // note : écrit aussi en ligne dans l'exécuteur (.delete, .insert) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  {
    id: 'effacer_heures', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 3,
    description: 'Effacer SES heures NON envoyées : toute sa journée, ou la ligne d’un chantier.',
    parametres: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Jour, aaaa-mm-jj (défaut : aujourd’hui)' },
        chantier: { type: 'string', description: 'Chantier de la ligne à effacer ; vide = toute la journée' },
      },
      required: [],
    },
    domaines: ['heures'], livraison: '3a', proches: ['retirer_reserve'],
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'effacer_heures', code: ['lib/worker-actions.ts'],
  },
  // annuler_conge · écriture · niveau 3 (carte) · Annuler : oui · retrait
  // note : écrit aussi en ligne dans l'exécuteur (.delete) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  {
    id: 'annuler_conge', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 3,
    description: 'Annuler SA demande de congé encore EN ATTENTE.',
    parametres: {
      type: 'object',
      properties: { ancienne_date: { type: 'string', description: 'Un jour de la demande, s’il y en a plusieurs' } },
      required: [],
    },
    domaines: ['conges'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'annuler_conge', code: ['lib/leave.ts', 'lib/worker-actions.ts'],
  },
  // modifier_conge · écriture · niveau 3 (carte) · Annuler : partiel · retrait
  // note : écrit aussi en ligne dans l'exécuteur (.delete) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : annuler partiel : si la nouvelle demande ne peut plus être retirée (traitée par le bureau), l'ancienne est renvoyée et c'est dit.
  {
    id: 'modifier_conge', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 3,
    description: 'Changer les dates de SA demande de congé encore en attente.',
    parametres: {
      type: 'object',
      properties: {
        ancienne_date: { type: 'string', description: 'Un jour de la demande actuelle' },
        du: { type: 'string', description: 'Nouveau début, aaaa-mm-jj' },
        au: { type: 'string', description: 'Nouvelle fin, aaaa-mm-jj' },
      },
      required: ['du'],
    },
    domaines: ['conges'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'partiel',
    executeur: 'modifier_conge', code: ['lib/leave.ts', 'lib/worker-actions.ts'],
  },
  // retirer_photo · écriture · niveau 3 (carte) · Annuler : oui · retrait
  // note : écrit aussi en ligne dans l'exécuteur (.storage, .delete, .insert) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : « Annuler » re-téléverse le fichier gardé en mémoire : perdu au rechargement de l'écran.
  {
    id: 'retirer_photo', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 3,
    description: 'Retirer une photo ou un document qu’il a ajouté.',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier' },
        quoi: { type: 'string', description: 'Laquelle (« la dernière photo », son nom)' },
      },
      required: [],
    },
    domaines: ['chantier'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'retirer_photo', code: ['lib/worker-actions.ts'],
  },
  // retirer_reserve · écriture · niveau 3 (carte) · Annuler : oui · retrait
  // note : écrit aussi en ligne dans l'exécuteur (.update) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  {
    id: 'retirer_reserve', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 3,
    description: 'Retirer la réserve qu’il a signalée aujourd’hui (journée pas encore envoyée).',
    parametres: { type: 'object', properties: { chantier: { type: 'string', description: 'Chantier' } }, required: [] },
    domaines: ['chantier'], livraison: '3a', proches: ['effacer_heures', 'reserve_corrigee'],
    mode: 'carte', modeActuel: 'carte', retrait: true, annuler: 'oui',
    executeur: 'retirer_reserve', code: ['lib/worker-actions.ts'],
  },
  // repondre · réponse · niveau 1 · toujours proposé
  {
    id: 'repondre', cote: 'salarie', roles: ['worker', 'lead'], kind: 'reponse', niveau: 1,
    description: 'Répondre sur SES heures / SON planning, ou expliquer comment faire dans l’appli (3 étapes au plus).',
    parametres: {
      type: 'object',
      properties: {
        reponse: { type: 'string', description: 'Réponse courte en français' },
        lien: { type: 'string', enum: Object.keys(WORKER_NAV) },
      },
      required: ['reponse'],
    },
    domaines: [], livraison: '3a', pieceJointe: true,
  },
  // declarer_heures · écriture · niveau 2 (direct) · Annuler : partiel
  // note : écrit aussi en ligne dans l'exécuteur (.delete, .rpc) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : l'écriture ne passe pas par makeWorkerExecutor mais par makeWorkerSaver (lib/worker-assistant.ts), partagé avec la fiche « Tout confirmer ».
  // note : annuler partiel : une ligne retouchée ou envoyée depuis est gardée ; aucun « Annuler » si des lignes sont restées en file hors ligne (profil court).
  {
    id: 'declarer_heures', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 2,
    description: 'Préparer la déclaration de SES heures.',
    parametres: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'aaaa-mm-jj' },
        lignes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chantier: { type: 'string', description: 'tel que dit' },
              debut: { type: 'string', description: 'HH:MM' },
              fin: { type: 'string', description: 'HH:MM' },
              pause: { type: 'number' },
            },
            required: ['debut', 'fin'],
          },
        },
      },
      required: ['lignes'],
    },
    domaines: ['heures'], livraison: '3a', proches: ['modifier_heures', 'terminer_pointage', 'copier_journee'],
    mode: 'direct', modeActuel: 'direct', annuler: 'partiel',
    executeur: 'makeWorkerSaver', code: ['lib/offline-store.ts', 'lib/worker-entry.ts', 'lib/worker-assistant.ts'],
  },
  // demander_conge · écriture · niveau 2 (direct) · Annuler : oui
  // note : écrit aussi en ligne dans l'exécuteur (.delete) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : « Annuler » retire la demande tant qu'elle est en attente ; refusé si le bureau l'a déjà traitée.
  {
    id: 'demander_conge', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 2,
    description: 'Préparer une demande de congé / absence au bureau.',
    parametres: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...LEAVE_KINDS] },
        du: { type: 'string', description: 'aaaa-mm-jj' },
        au: { type: 'string', description: 'aaaa-mm-jj' },
        note: { type: 'string', description: 'Mot pour le bureau' },
      },
      required: ['du'],
    },
    domaines: ['conges'], livraison: '3a',
    mode: 'direct', modeActuel: 'direct', annuler: 'oui',
    executeur: 'demander_conge', code: ['lib/leave.ts', 'lib/worker-actions.ts'],
  },
  // terminer_pointage · écriture · niveau 2 (direct) · Annuler : partiel
  // note : écrit aussi en ligne dans l'exécuteur (.insert, .delete) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : annuler partiel : aucun « Annuler » sans chantier connu ; il peut refuser et garder la ligne (GARDEE, DEUX_FOIS, INCERTAIN).
  {
    id: 'terminer_pointage', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 2,
    description: 'Préparer la fin du pointage en cours.',
    parametres: { type: 'object', properties: {}, required: [] },
    domaines: ['heures'], livraison: '3a', proches: ['declarer_heures'],
    mode: 'direct', modeActuel: 'direct', annuler: 'partiel',
    executeur: 'terminer_pointage', code: ['lib/live-session.ts', 'lib/worker-actions.ts'],
  },
  // ranger_photo · écriture · niveau 2 (direct) · Annuler : oui
  // note : écrit aussi en ligne dans l'exécuteur (.update) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  {
    id: 'ranger_photo', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 2,
    description: 'Un FICHIER est joint : le ranger dans les documents du chantier, avec sa catégorie (dite, sinon devinée d’après le contenu), et « Avec réserve » s’il s’agit d’une réserve.',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier tel que dit, avec la ville si dite' },
        categorie: { type: 'string', enum: [...DOC_CATEGORIES] },
        reserve: { type: 'boolean', description: 'Il y a une réserve' },
        detail: { type: 'string', description: 'Détail de la réserve (facultatif)' },
      },
      required: [],
    },
    domaines: ['chantier'], livraison: '3a', pieceJointe: true,
    mode: 'direct', modeActuel: 'direct', annuler: 'oui',
    executeur: 'ranger_photo', code: ['lib/chantier-docs.ts', 'lib/doc-category.ts', 'lib/worker-entry.ts', 'lib/worker-actions.ts'],
  },
  // signaler_reserve · écriture · niveau 2 (direct) · Annuler : oui
  // note : écrit aussi en ligne dans l'exécuteur (.update) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : « Annuler » remet la réserve et l'observation d'avant sans vérifier qu'elles valent encore la valeur écrite : §1.2 l'exigera en 3d-1.
  {
    id: 'signaler_reserve', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 2,
    description: 'Préparer une réserve sur un chantier du jour (détail facultatif).',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier' },
        detail: { type: 'string', description: 'Détail (facultatif)' },
      },
      required: [],
    },
    domaines: ['chantier'], livraison: '3a', proches: ['reserve_corrigee'],
    mode: 'direct', modeActuel: 'direct', annuler: 'oui',
    executeur: 'signaler_reserve', code: ['lib/worker-entry.ts', 'lib/worker-actions.ts'],
  },
  // envoyer_journee · écriture · niveau 3 (carte) · Annuler : non
  // incertain : notifie : la journée part au bureau (visible à la validation) sans notification dans le code ; non posé.
  {
    id: 'envoyer_journee', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 3,
    description: '« Envoyer ma journée » : envoie ses heures du jour au bureau.',
    parametres: { type: 'object', properties: {}, required: [] },
    domaines: ['heures'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'envoyer_journee', code: ['lib/worker-day.ts'],
  },
  // modifier_heures · écriture · niveau 2 (conditionnel) · Annuler : oui
  // note : « Annuler » remet les horaires d'avant (refusé si la ligne est verrouillée) sans vérifier qu'ils valent encore la valeur écrite : §1.2 l'exigera en 3d-1.
  {
    id: 'modifier_heures', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 2,
    description: 'Changer les horaires d’une de SES lignes du jour.',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier de la ligne' },
        debut: { type: 'string', description: 'HH:MM' },
        fin: { type: 'string', description: 'HH:MM' },
      },
      required: ['debut', 'fin'],
    },
    domaines: ['heures'], livraison: '3a', proches: ['declarer_heures'],
    mode: 'conditionnel', modeActuel: 'conditionnel', annuler: 'oui',
    executeur: 'modifier_heures', code: ['lib/worker-entry.ts'],
  },
  // panier_repas · écriture · niveau 2 (direct) · Annuler : oui
  // note : « Annuler » remet l'état du panier d'avant sans vérifier qu'il vaut encore la valeur écrite : §1.2 l'exigera en 3d-1.
  // incertain : champsCarte : `valeur` = le panier du jour du salarié, pas le réglage « panier » de l'entreprise du §1.2 ; laissé hors champsCarte.
  // incertain : dispo : non posé ; l'outil reste proposé et l'exécuteur refuse poliment si l'entreprise n'utilise pas le panier (MEAL_OFF_MESSAGE).
  {
    id: 'panier_repas', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 2,
    description: 'Cocher (ou retirer) le panier repas du jour.',
    parametres: { type: 'object', properties: { valeur: { type: 'boolean' } }, required: ['valeur'] },
    domaines: ['heures'], livraison: '3a',
    mode: 'direct', modeActuel: 'direct', annuler: 'oui',
    executeur: 'panier_repas', code: ['lib/meal-setting.ts', 'lib/worker-day.ts'],
  },
  // copier_journee · écriture · niveau 2 (direct) · Annuler : partiel
  // note : écrit aussi en ligne dans l'exécuteur (.delete) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : annuler partiel : une copie retouchée ou envoyée depuis est gardée, et c'est dit.
  {
    id: 'copier_journee', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 2,
    description: 'Copier une journée (par défaut hier) sur un ou plusieurs jours (par défaut aujourd’hui).',
    parametres: {
      type: 'object',
      properties: {
        depuis: { type: 'string', description: 'Jour à copier aaaa-mm-jj' },
        vers: { type: 'array', items: { type: 'string', description: 'aaaa-mm-jj' } },
      },
      required: [],
    },
    domaines: ['heures'], livraison: '3a', proches: ['declarer_heures'],
    mode: 'direct', modeActuel: 'direct', annuler: 'partiel',
    executeur: 'copier_journee', code: ['lib/worker-day.ts', 'lib/worker-actions.ts'],
  },
  // reserve_corrigee · écriture · niveau 2 (direct) · Annuler : oui
  // note : écrit aussi en ligne dans l'exécuteur (.rpc) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  // note : « Annuler » rouvre la réserve sans vérifier qu'elle est encore levée par cette action : §1.2 l'exigera en 3d-1.
  {
    id: 'reserve_corrigee', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 2,
    description: '« Lever la réserve » d’un chantier du jour (réglée sur place), avec un commentaire facultatif.',
    parametres: {
      type: 'object',
      properties: {
        chantier: { type: 'string', description: 'Chantier' },
        commentaire: { type: 'string', description: 'Ce qui a été fait (facultatif)' },
      },
      required: [],
    },
    domaines: ['chantier'], livraison: '3a', proches: ['signaler_reserve', 'retirer_reserve'],
    mode: 'direct', modeActuel: 'direct', annuler: 'oui',
    executeur: 'reserve_corrigee', code: ['lib/worker-actions.ts'],
  },
  // nouveau_chantier · écriture · niveau 3 (carte) · Annuler : non
  // note : le salarié ne peut pas supprimer un chantier : pas d'« Annuler » exact (règle d'or du §1.2).
  {
    id: 'nouveau_chantier', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 3,
    description: 'Ajouter un chantier qui n’est pas dans la liste.',
    parametres: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Nom du client / chantier' },
        ville: { type: 'string', description: 'Ville' },
      },
      required: ['nom'],
    },
    domaines: ['chantier'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non',
    executeur: 'nouveau_chantier', code: ['lib/worker-worksite.ts'],
  },
  // email_client · écriture · niveau 3 (carte) · Annuler : non
  // note : écrit aussi en ligne dans l'exécuteur (.rpc) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).
  {
    id: 'email_client', cote: 'salarie', roles: ['worker', 'lead'], kind: 'ecriture', niveau: 3,
    description: 'Enregistrer l’email du client d’un chantier (pour lui envoyer les documents).',
    parametres: {
      type: 'object',
      properties: { chantier: { type: 'string', description: 'Chantier' }, email: { type: 'string', description: 'Email' } },
      required: ['email'],
    },
    domaines: ['chantier'], livraison: '3a',
    mode: 'carte', modeActuel: 'carte', annuler: 'non', champsCarte: ['email'],
    executeur: 'email_client', code: ['lib/worker-actions.ts'],
  },
  // planning_collegues · lecture · niveau 1 · le modèle ne revoit pas le résultat
  // incertain : limites : 0 = aucune limite codée aujourd'hui (la RPC borne la période à 14 jours, le serveur interroge un seul jour) ; à fixer par 3c.
  // incertain : kind lecture : aucun _shared/lectures/planning_collegues.ts (le serveur lit la RPC lui-même) ; remplacé par lire_collegues en 3c.
  {
    id: 'planning_collegues', cote: 'salarie', roles: ['worker', 'lead'], kind: 'lecture', niveau: 1,
    description: 'Où sont / que font ses collègues (tous ou un seul), un jour donné : prénom, chantier, horaires.',
    parametres: {
      type: 'object',
      properties: {
        qui: { type: 'string', description: 'Prénom du collègue, vide = tous' },
        date: { type: 'string', description: 'aaaa-mm-jj (défaut aujourd’hui)' },
      },
      required: [],
    },
    domaines: ['collegues'], livraison: '3a',
    libelle: 'Planning des collègues',
    champs: ['prenom', 'work_date', 'chantier', 'ville', 'debut', 'fin', 'absent'],
    libres: ['prenom', 'chantier', 'ville'],
    limites: { lignes: 0, car: 0, ms: 0 },
  },
  // ── fin des outils de la livraison 3a (ci-dessus : généré par scripts/registre-outils-gen.ts ; les outils des livraisons suivantes s'ajoutent APRÈS ce repère) ──
];
