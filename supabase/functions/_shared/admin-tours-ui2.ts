// Design bureau, lot 2 « Heures et paie » : les textes des guides pas à pas du bureau pour la v2 (`?ui=2`), PRÉPARÉS ET ÉTEINTS.
//
// RIEN n'est branché : admin-tours.ts (et donc l'empreinte `guideForPrompt` du bureau, SHA 5766f6e9…3198, admin-tours.test.ts) n'importe pas ce fichier.
// Pour allumer (à la bascule du bureau, jamais avant) : passer GUIDES_BUREAU_UI2 à `true`, faire lire TEXTES_HEURES_V2 par admin-tours.ts à la place du texte
// v1 de la même `cible`, poser les ancres « à poser » ci-dessous avec la fiche qui les vise, puis régénérer l'empreinte (avec la justification écrite).
// Le tableau complet cible | texte v1 | texte v2, les raisons et les ancres qui bougent : docs/design-brief/integration/guides-bureau-heures-v2.md.

/** Éteint : les guides du bureau gardent leurs textes d'aujourd'hui. */
export const GUIDES_BUREAU_UI2 = false;

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
    v2: 'Choisissez la période, puis cliquez sur « PDF », « Excel » ou « CSV paie » : cela verrouille les heures (une alerte vous dit combien de lignes avant).' },
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
    v2: 'Pour récupérer ses heures, cliquez d’abord sur « Exporter ce salarié (sans verrou) ».',
    v1Mobile: 'Pour récupérer ses heures, touchez d’abord « Exporter » (cela ne verrouille rien).',
    v2Mobile: 'Pour récupérer ses heures, touchez d’abord « Exporter » (cela ne verrouille rien).' },
];

/**
 * Ancres qui BOUGENT ou manquent en v2 : à traiter AVANT d'allumer l'interrupteur (le test « Ancres introuvables » de admin-tours.test.ts les attend toutes).
 *  · `bureau-fiche.corriger` : le bouton « Corriger » est dans la fiche de la LIGNE (on y arrive en cliquant une ligne de la feuille d'heures) : la fiche « corriger »
 *    a besoin d'un pas de plus, donc d'une ancre sur la ligne (ex. `bureau-fiche.ligne`), visée par une fiche (sinon « Ancres posées mais jamais visées »).
 *  · `bureau-fiche.cloturer` : « Clôturer jusqu'au… » vit dans l'onglet « Gérer » (lot 3 : EQ09/EQ10) ; la fiche « cloture_salarie » a besoin d'un pas « onglet Gérer ».
 */
export const ANCRES_A_POSER_V2 = ['bureau-fiche.ligne (corriger)', 'bureau-fiche.onglet-gerer (cloture_salarie)'] as const;
