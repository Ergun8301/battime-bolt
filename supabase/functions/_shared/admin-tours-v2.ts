// Guides pas à pas du BUREAU pour le planning v2 (lot 1 du design du bureau). SANS dépendance, comme admin-tours.ts ; appliqués SEULEMENT quand
// GUIDES_BUREAU_UI2 (guides-bureau-ui2.ts) est `true`. Tableau cible | texte v1 | texte v2 : docs/design-brief/integration/guides-bureau-v2.md.
//
// Ce qui change dans le planning v2 (README du designer, §1 « un seul accès par fonction ») :
//  · « Coût chantiers » et « Versions du planning » ne sont plus des boutons de la barre : ce sont des lignes du menu « Plus ⋯ » (ordinateur) ;
//  · la petite flèche ⟲ du coin de la grille n'existe plus (Versions est dans « Plus ⋯ ») ;
//  · sous 1 024 px, le menu ☰ garde les mêmes lignes ; seul l'intitulé « Versions du planning (semaine affichée) » devient « Versions du planning ».
// Les Réglages (menu du compte), Salariés, Clients, Réserves, Sélectionner, Exporter, Borne, S'abonner et l'Assistant n'ont pas bougé.
import type { AdminStep, AdminTour } from './admin-tours.ts';

/** L'étape « ouvrir Plus ⋯ », ordinateur seulement (sous 1 024 px c'est l'étape « Menu », ajoutée par adminStepsFor). */
export const OUVRIR_PLUS: AdminStep = { cible: 'bureau-nav.plus', texte: 'Cliquez sur « Plus ⋯ ».', surface: 'ordi' };

/** Texte v2 des étapes dont le texte ou la place change ; la clé est la `cible` (le reste des étapes est repris tel quel). */
export const REMPLACEMENTS_V2: Record<string, (e: AdminStep) => AdminStep[]> = {
  'bureau-nav.couts': (e) => [OUVRIR_PLUS, { ...e, texte: 'Cliquez sur « Coût chantiers ».', mobile: 'Touchez « Coût chantiers ».' }],
  'bureau-nav.versions': (e) => [OUVRIR_PLUS, { ...e, texte: 'Cliquez sur « Versions du planning ».', mobile: 'Touchez « Versions du planning ».' }],
};

/** Une fiche pour le planning v2 : les étapes à remplacer sont remplacées, les autres reprises à l'identique. */
export function ficheV2(t: AdminTour): AdminTour {
  return { ...t, etapes: t.etapes.flatMap((e) => (REMPLACEMENTS_V2[e.cible] ? REMPLACEMENTS_V2[e.cible](e) : [e])) };
}
