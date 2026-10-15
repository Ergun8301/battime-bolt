// GÉNÉRÉ par scripts/registre-listes-gen.ts d'après registre/outils-salarie.ts (étape 3, livraison 3a-2). NE PAS ÉDITER À LA MAIN :
// pour changer une de ces listes, changer l'outil au registre (`retrait`, `pieceJointe`, `domaines`, ou l'outil lui-même), puis
//   npx -y deno@2 run --allow-read --allow-write scripts/registre-listes-gen.ts
// registre-listes.test.ts échoue tant que ce fichier n'est pas celui que le générateur écrirait.
//
// MODULE LÉGER, côté salarié : des identifiants d'outils, aucun texte lu par le modèle, aucun import. Le navigateur peut l'importer
// (cartes de confirmation) ; il n'importe jamais registre/outils-*.ts (test T8). L'ordre est celui du registre.

/** Ce qui RETIRE ou REMPLACE quelque chose : jamais fait d'office, toujours par la carte de confirmation (lot 1, décision D3). */
export const WORKER_REMOVAL_TYPES = [
  'effacer_heures',
  'annuler_conge',
  'modifier_conge',
  'retirer_photo',
  'retirer_reserve',
  'annuler_pointage',
] as const;

/** Les outils proposés quand un fichier est joint (lot 1) : les seuls qui lisent un document. */
export const WORKER_ATTACHMENT_ACTIONS = [
  'repondre',
  'ranger_photo',
] as const;

/** Les outils de chaque domaine de tool-domains.ts (les mots qui déclenchent un domaine y restent écrits à la main). */
export const DOMAINES_OUTILS = {
  heures: [
    'effacer_heures',
    'declarer_heures',
    'terminer_pointage',
    'envoyer_journee',
    'modifier_heures',
    'panier_repas',
    'copier_journee',
  ],
  conges: [
    'annuler_conge',
    'modifier_conge',
    'demander_conge',
  ],
  chantier: [
    'retirer_photo',
    'retirer_reserve',
    'ranger_photo',
    'signaler_reserve',
    'reserve_corrigee',
    'nouveau_chantier',
    'email_client',
  ],
  collegues: [
    'planning_collegues',
  ],
} as const;
