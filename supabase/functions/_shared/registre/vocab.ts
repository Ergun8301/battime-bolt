// Registre : vocabulaires fermés (livraison 3a-2). Contrat : docs/ia-etape3/00-conception-etape3.md §2.2.
//
// Les listes de mots que les déclarations d'outils (outils-*.ts) ET le code des écrans lisent : les écrans proposés par
// « M'y emmener » (bureau, salarié), les types d'absence et de congé, les catégories de documents. Elles vivent ICI, et non
// dans assistant-actions-core.ts / worker-assistant-core.ts, pour éviter un import circulaire (le registre importe ce
// fichier ; AC et WC le ré-exportent, leurs importeurs ne changent pas).
//
// MODULE LÉGER : le navigateur a le droit de l'importer (T8). TypeScript pur, aucun import, que des chaînes : rien de
// secret, rien qui pèse. Syntaxe de la cible navigateur (T11) : ni lookbehind, ni .at(), findLast, replaceAll…
// Changer un mot ici change ce que le modèle lit (l'énumération des liens, des types) : l'empreinte SHA-256 gelée de
// outils-empreintes.json l'attrape, et c'est voulu (livraison à empreinte déclarée).

/** Bureau : les écrans qu'un bouton « M'y emmener » sait ouvrir (clé → libellé du bouton). */
export const NAV_ACTIONS = {
  salaries: 'Salariés',
  nouveau_salarie: 'Nouveau salarié',
  nouveau_client: 'Nouveau client',
  import_clients: 'Importer des clients',
  conges: 'Demandes de congé',
  couts: 'Coût chantiers',
  reserves: 'Réserves',
  export: 'Exporter / clôturer',
  reglages: 'Réglages',
  // Lot 7 : chaque fiche d'aide a son bouton raccourci.
  planning: 'Voir le planning',
  clients: 'Clients',
} as const;

/** Salarié : les écrans de « M'y emmener » (clé → libellé du bouton). */
export const WORKER_NAV = {
  journee: 'Ma journée',
  semaine: 'Ma semaine',
  mois: 'Mon mois',
  historique: 'Historique',
  conges: 'Mes congés',
  // Lot 7 : chaque fiche d'aide a son bouton raccourci.
  notifications: 'Activer les notifications',
  photo: 'Changer ma photo',
  borne: 'Scanner la borne',
  infos: 'Informations',
} as const;

// Lot 2 : « repos » retiré — la base ne l'accepte pas (planning_absence_type_check :
// conge, maladie, intemperie), l'écran ne le propose plus. L'Assistant non plus.
/** Bureau : les types d'absence que le patron pose. */
export const ABSENCE_KINDS = ['conge', 'maladie', 'intemperie'] as const;

/** Salarié : les types de demande de congé (les mêmes mots, la même colonne). */
export const LEAVE_KINDS = ['conge', 'maladie', 'intemperie'] as const;

/** Catégories des documents de chantier (lot 7, colonne `documents.category`). */
export const DOC_CATEGORIES = ['facture_payee', 'facture', 'devis', 'reserve', 'photo', 'plan', 'pv_reception', 'autre'] as const;
