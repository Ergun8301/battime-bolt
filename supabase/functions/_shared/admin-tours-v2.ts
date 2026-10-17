// Guides pas à pas du BUREAU pour le planning v2 (lot 1 du design du bureau, re-habillé « v2b Couleur »). SANS dépendance, comme admin-tours.ts ; appliqués SEULEMENT quand
// GUIDES_BUREAU_UI2 (guides-bureau-ui2.ts) est `true`. Tableau cible | texte v1 | texte v2 : docs/design-brief/integration/guides-bureau-v2.md.
//
// Ce qui change dans le planning v2b (README du designer, §1 « un seul accès par fonction », §4 barre en deux niveaux) :
//  · « Coût chantiers », « Versions du planning » et « Borne » ne sont plus des boutons de la barre : ce sont des lignes du menu « Plus ⋯ » (ordinateur) ;
//  · la petite flèche ⟲ du coin de la grille n'existe plus (Versions est dans « Plus ⋯ ») ;
//  · Clients, Salariés et Réserves sont dans la barre noire du haut (mêmes noms, mêmes fenêtres : les phrases « Cliquez sur « Clients » » restent justes) ;
//  · au téléphone, « Ajouter un chantier » est le bouton « + » à droite du nom du salarié ;
//  · sous 1 024 px, le menu ☰ garde les mêmes lignes ; seul l'intitulé « Versions du planning (semaine affichée) » devient « Versions du planning ».
// Les Réglages (menu du compte), Sélectionner, Exporter, S'abonner et l'Assistant n'ont pas bougé.
import type { AdminStep, AdminTour } from './admin-tours.ts';

/** L'étape « ouvrir Plus ⋯ », ordinateur seulement (sous 1 024 px c'est l'étape « Menu », ajoutée par adminStepsFor). */
export const OUVRIR_PLUS: AdminStep = { cible: 'bureau-nav.plus', texte: 'Cliquez sur « Plus ⋯ ».', surface: 'ordi' };

/** Les cibles qui passent par « Plus ⋯ » sur ordinateur (une étape « Plus ⋯ » est insérée avant chacune). */
export const PAR_PLUS = ['bureau-nav.couts', 'bureau-nav.versions', 'bureau-nav.borne'] as const;

/** Texte v2 des étapes dont le texte ou la place change ; la clé est la `cible` (le reste des étapes est repris tel quel). */
export const REMPLACEMENTS_V2: Record<string, (e: AdminStep) => AdminStep[]> = {
  'bureau-nav.couts': (e) => [OUVRIR_PLUS, { ...e, texte: 'Cliquez sur « Coût chantiers ».', mobile: 'Touchez « Coût chantiers ».' }],
  'bureau-nav.versions': (e) => [OUVRIR_PLUS, { ...e, texte: 'Cliquez sur « Versions du planning ».', mobile: 'Touchez « Versions du planning ».' }],
  'bureau-nav.borne': (e) => [OUVRIR_PLUS, { ...e, texte: 'Cliquez sur « Borne ».', mobile: 'Touchez « Borne ».' }],
  // Téléphone seulement (l'étape v1 a `surface: 'mobile'`) : le bouton s'appelle « + » à droite du nom (planche v2b, téléphone).
  'bureau-planning.ajouter': (e) => [{ ...e, texte: 'Touchez « + » à droite du nom du salarié voulu.' }],
};

/** Fiches d'aide de l'Assistant (assistant-actions-core.ts, liste des fiches) dont une étape change en v2b : id de la fiche → [n° de l'étape, texte v2b].
 *  Prêtes, PAS branchées : à appliquer à la bascule du bureau, en même temps que GUIDES_BUREAU_UI2 = true (la consigne change alors : empreinte à mettre à jour). */
export const AIDE_V2: Record<string, [number, string]> = {
  borne: [0, 'Menu « Plus ⋯ » du planning → « Borne » (ou Réglages → « Borne & pointage » → « Relier la tablette »). Il n’existe que si la borne est activée pour l’entreprise.'],
};

/** Une fiche pour le planning v2 : les étapes à remplacer sont remplacées, les autres reprises à l'identique. */
export function ficheV2(t: AdminTour): AdminTour {
  return { ...t, etapes: t.etapes.flatMap((e) => (REMPLACEMENTS_V2[e.cible] ? REMPLACEMENTS_V2[e.cible](e) : [e])) };
}
