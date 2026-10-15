// GÉNÉRÉ par scripts/registre-listes-gen.ts d'après registre/outils-bureau.ts (étape 3, livraison 3a-2). NE PAS ÉDITER À LA MAIN :
// pour changer une de ces listes, changer l'outil au registre (`retrait`, `pieceJointe`, `domaines`, ou l'outil lui-même), puis
//   npx -y deno@2 run --allow-read --allow-write scripts/registre-listes-gen.ts
// registre-listes.test.ts échoue tant que ce fichier n'est pas celui que le générateur écrirait.
//
// MODULE LÉGER, côté bureau : des identifiants d'outils, aucun texte lu par le modèle, aucun import. Le navigateur peut l'importer
// (cartes de confirmation) ; il n'importe jamais registre/outils-*.ts (test T8). L'ordre est celui du registre.

/** Les types d'écriture de l'assistant du bureau (= les outils d'écriture du registre). */
export const ACTION_TYPES = [
  'inviter_salarie',
  'creer_chantier',
  'ranger_document',
  'poser_absence',
  'affecter_planning',
  'planning_semaine',
  'corriger_pointage',
  'modifier_intervention',
  'repondre_conge',
  'lever_reserve',
  'ajouter_depense',
  'modifier_client',
  'archiver_client',
  'changer_role',
  'relancer_invitation',
  'envoyer_rappel',
  'cloturer_mois',
  'attribuer_client',
  'ajouter_habilitation',
  'modifier_salarie',
  'archiver_salarie',
  'cout_reel',
  'modifier_reglages',
  'supprimer_intervention',
  'effacer_planning',
  'supprimer_absence',
  'supprimer_document',
  'modifier_document',
  'supprimer_depense',
  'modifier_depense',
  'supprimer_habilitation',
  'modifier_habilitation',
  'annuler_invitation',
] as const;

/** Ce qui RETIRE ou REMPLACE quelque chose : jamais fait d'office, toujours par la carte de confirmation (lot 1, décision D3). */
export const REMOVAL_TYPES = [
  'supprimer_intervention',
  'effacer_planning',
  'supprimer_absence',
  'supprimer_document',
  'modifier_document',
  'supprimer_depense',
  'modifier_depense',
  'supprimer_habilitation',
  'modifier_habilitation',
  'annuler_invitation',
] as const;

/** Les outils proposés quand un fichier est joint (lot 1) : les seuls qui lisent un document. */
export const ATTACHMENT_ACTIONS = [
  'repondre',
  'inviter_salarie',
  'creer_chantier',
  'ranger_document',
  'ajouter_depense',
  'cout_reel',
] as const;

/** Les outils de chaque domaine de tool-domains.ts (les mots qui déclenchent un domaine y restent écrits à la main). */
export const DOMAINES_OUTILS = {
  planning: [
    'poser_absence',
    'affecter_planning',
    'planning_semaine',
    'modifier_intervention',
    'repondre_conge',
    'supprimer_intervention',
    'effacer_planning',
    'supprimer_absence',
  ],
  heures: [
    'corriger_pointage',
    'lever_reserve',
    'envoyer_rappel',
    'cloturer_mois',
    'attribuer_client',
  ],
  salaries: [
    'inviter_salarie',
    'changer_role',
    'relancer_invitation',
    'envoyer_rappel',
    'ajouter_habilitation',
    'modifier_salarie',
    'archiver_salarie',
    'cout_reel',
    'supprimer_habilitation',
    'modifier_habilitation',
    'annuler_invitation',
  ],
  chantiers: [
    'creer_chantier',
    'lever_reserve',
    'ajouter_depense',
    'modifier_client',
    'archiver_client',
    'attribuer_client',
    'supprimer_depense',
    'modifier_depense',
  ],
  documents: [
    'ranger_document',
    'supprimer_document',
    'modifier_document',
  ],
  reglages: [
    'cloturer_mois',
    'modifier_reglages',
  ],
} as const;
