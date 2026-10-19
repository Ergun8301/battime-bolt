// Design bureau, lot 2 « Heures et paie » : les textes des guides pas à pas du bureau pour la v2.
//
// Branchés depuis la bascule du bureau : ficheV2 (admin-tours-v2.ts) pose `v2` (et `v2Mobile`) à la place du texte v1 de la même fiche et de la même `cible`,
// quand GUIDES_BUREAU_UI2 (guides-bureau-ui2.ts) est `true`. Les étapes qui changent de place (corriger, cloture_salarie, telecharger) y sont remplacées.
// Le tableau complet cible | texte v1 | texte v2, les raisons et les ancres qui bougent : docs/design-brief/integration/guides-bureau-heures-v2.md.

export interface TexteGuideV2 {
  /** La fiche (admin-tours.ts) et l'ancre `data-guide` visée. */
  fiche: string;
  cible: string;
  /** Le texte d'aujourd'hui (copié, pour que le tableau se lise seul). */
  v1: string;
  /** Le texte pour la v2 : mêmes libellés que les écrans v2. */
  v2: string;
  /** Téléphone, quand le texte d'aujourd'hui en a un. */
  v1Mobile?: string;
  v2Mobile?: string;
}

export const TEXTES_HEURES_V2: TexteGuideV2[] = [
  { fiche: 'demandes_conge', cible: 'bureau-conges.liste',
    v1: 'Repérez la bonne demande, puis cliquez sur la coche ✓ pour accepter ou sur la croix ✗ pour refuser.',
    v2: 'Repérez la bonne demande, puis cliquez sur « Accepter » ou sur « Refuser ».',
    v1Mobile: 'Repérez la bonne demande, puis touchez la coche ✓ pour accepter ou la croix ✗ pour refuser.',
    v2Mobile: 'Repérez la bonne demande, puis touchez « Accepter » ou « Refuser ».' },
  { fiche: 'corriger', cible: 'bureau-fiche.corriger',
    v1: 'Sur une journée déjà envoyée, cliquez sur « Corriger les heures ».',
    v2: 'Cliquez sur la ligne de la journée envoyée, puis sur « Corriger ».' },
  { fiche: 'corriger', cible: 'bureau-fiche.corriger-valider',
    v1: 'Tapez le motif, puis cliquez sur « Corriger et prévenir ».',
    v2: 'Tapez le motif, puis cliquez sur « Corriger et prévenir ».' },
  { fiche: 'export', cible: 'bureau-export.menu',
    v1: 'Choisissez la période, puis ouvrez « Exporter » et choisissez un format : cela verrouille les heures.',
    v2: 'Choisissez la période, puis cliquez sur « PDF », « Excel » ou « CSV paie » : cela verrouille les heures.' },
  { fiche: 'export', cible: 'bureau-export.comptable',
    v1: 'Ou « Envoyer à » votre comptable (son adresse se règle dans les Réglages).',
    v2: 'Ou « Envoyer » au comptable (son adresse se règle dans les Réglages).' },
  { fiche: 'cloture', cible: 'bureau-export.mois',
    v1: 'Choisissez le mois voulu dans la liste, puis cliquez sur « Clôturer » : ses heures sont verrouillées.',
    v2: 'Choisissez le mois voulu dans la liste, puis cliquez sur « Clôturer… » : ses heures sont verrouillées.' },
  { fiche: 'reouvrir', cible: 'bureau-export.mois',
    v1: 'Choisissez le mois voulu dans la liste, puis cliquez sur « Rouvrir ».',
    v2: 'Choisissez le mois voulu dans la liste, puis cliquez sur « Rouvrir… ».' },
  { fiche: 'telecharger', cible: 'bureau-export.un-salarie',
    v1: 'Pour télécharger sans rien verrouiller, cliquez sur « Un seul salarié ? » et choisissez-le.',
    v2: 'Pour télécharger sans rien verrouiller, cliquez sur « Un seul salarié ? » et choisissez-le.' },
  { fiche: 'telecharger', cible: 'bureau-export.menu',
    v1: 'Pour toute l’équipe : période, puis « Exporter ». Attention : cela verrouille les heures de la période.',
    v2: 'Pour toute l’équipe : période, puis « PDF », « Excel » ou « CSV paie ». Attention : cela verrouille les heures de la période.' },
  { fiche: 'cloture_salarie', cible: 'bureau-fiche.exporter',
    v1: 'Pour récupérer ses heures, cliquez d’abord sur « Exporter » (cela ne verrouille rien).',
    v2: 'Pour récupérer ses heures, cliquez d’abord sur « Exporter ce salarié (sans verrou) » : cela ne verrouille rien.',
    v1Mobile: 'Pour récupérer ses heures, touchez d’abord « Exporter » (cela ne verrouille rien).',
    v2Mobile: 'Pour récupérer ses heures, touchez d’abord « Exporter » (cela ne verrouille rien).' },
];
