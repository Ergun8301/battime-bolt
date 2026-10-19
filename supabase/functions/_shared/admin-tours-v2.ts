// Guides pas à pas du BUREAU pour le design v2 (planning 1a, téléphone 2b, pages secondaires). SANS dépendance, comme admin-tours.ts ; appliqués
// quand GUIDES_BUREAU_UI2 (guides-bureau-ui2.ts) est `true` (depuis la bascule du bureau). Tableau cible | texte v1 | texte v2 : docs/design-brief/integration/guides-bureau-v2.md.
//
// Ce qui change dans le bureau v2 (README du designer, §1 « un seul accès par fonction ») :
//  · « Coût chantiers », « Réserves », « Borne » et « S'abonner » (essai) sont des lignes du menu « Plus ⋯ » (ordinateur) ;
//  · « Versions du planning » n'est plus offert (demande d'Ergun) : la fiche reste, l'assistant du bureau ne propose plus son guide (components/assistant-bureau.tsx) ;
//  · les invitations en attente sont dans « Salariés » (« Invitations en attente ») ; l'export d'un seul salarié est l'onglet « Un salarié » d'Exporter ;
//  · la feuille d'heures : « Corriger » est dans la fiche de la LIGNE ; « Clôturer jusqu'au… » est dans l'onglet « Gérer » ;
//  · les documents : « Envoyer au client » ouvre la fenêtre de l'e-mail du client ;
//  · sous 1 024 px, le menu ☰ garde les mêmes lignes ; seul l'intitulé « Versions du planning (semaine affichée) » devient « Versions du planning ».
// Clients, Salariés, Sélectionner, Exporter, les Réglages (menu du compte) et l'Assistant n'ont pas bougé.
import { ADMIN_TOURS_V1, type AdminStep, type AdminTour } from './admin-tours.ts';
import { TEXTES_HEURES_V2 } from './admin-tours-ui2.ts';
import { GUIDES_BUREAU_UI2 } from './guides-bureau-ui2.ts';

/** L'étape « ouvrir Plus ⋯ », ordinateur seulement (sous 1 024 px c'est l'étape « Menu », ajoutée par adminStepsFor). */
export const OUVRIR_PLUS: AdminStep = { cible: 'bureau-nav.plus', texte: 'Cliquez sur « Plus ⋯ ».', surface: 'ordi' };
const NAV_SAL: AdminStep = { cible: 'bureau-nav.salaries', texte: 'Cliquez sur « Salariés ».' };

/** Texte v2 des étapes dont le texte ou la place change ; la clé est la `cible` (le reste des étapes est repris tel quel). */
export const REMPLACEMENTS_V2: Record<string, (e: AdminStep) => AdminStep[]> = {
  'bureau-nav.couts': (e) => [OUVRIR_PLUS, { ...e, texte: 'Cliquez sur « Coût chantiers ».', mobile: 'Touchez « Coût chantiers ».' }],
  'bureau-nav.versions': (e) => [OUVRIR_PLUS, { ...e, texte: 'Cliquez sur « Versions du planning ».', mobile: 'Touchez « Versions du planning ».' }],
  'bureau-nav.reserves': (e) => [OUVRIR_PLUS, { ...e, texte: 'Cliquez sur « Réserves ».' }],
  'bureau-nav.borne': (e) => [OUVRIR_PLUS, e],
  // « S'abonner » (essai seulement) est en haut de « Plus ⋯ » : une seule étape, sur un bouton toujours là.
  'bureau-nav.abonner': (e) => [
    { ecran: 'planning', cible: 'bureau-nav.plus', surface: 'ordi', texte: 'Si vous êtes en essai, cliquez sur « Plus ⋯ », puis sur « S’abonner ».' },
    { ...e, surface: 'mobile', texte: 'Si vous êtes en essai, touchez « S’abonner », en haut de l’écran.' },
  ],
  'bureau-invit.voir': (e) => [NAV_SAL, { ...e, ecran: 'salaries', texte: 'S’il y a des invitations en attente, cliquez sur « Invitations en attente ».',
    mobile: 'S’il y a des invitations en attente, touchez « Invitations ».' }],
  'bureau-export.un-salarie': (e) => [{ ...e, texte: 'Pour télécharger sans rien verrouiller, cliquez sur « Un salarié » et choisissez-le.' }],
  'bureau-fiche.corriger': (e) => [
    { cible: 'bureau-fiche.lignes', texte: 'Choisissez la période, puis cliquez sur la ligne de la journée envoyée.' },
    { ...e, texte: 'Cliquez sur « Corriger ».' },
  ],
  'bureau-fiche.cloturer': (e) => [{ cible: 'bureau-fiche.gerer', texte: 'Cliquez sur « Gérer », en haut de la fiche.' }, e],
  'bureau-docs.email': (e) => [{ cible: 'bureau-docs.envoyer-client', texte: 'Cliquez sur « Envoyer au client ».' }, e],
};

/** Remplacements propres à UNE fiche (la même cible sert ailleurs avec son texte d'avant). */
const PAR_FICHE_V2: Record<string, Record<string, (e: AdminStep) => AdminStep[]>> = {
  // « Un salarié » remplace la liste par celle des salariés : l'export d'équipe revient par « Toute l'équipe » (toujours visible, en haut du panneau).
  telecharger: { 'bureau-export.menu': (e) => [{ ...e, cible: 'bureau-export.equipe',
    texte: 'Pour toute l’équipe : « Toute l’équipe », la période, puis « PDF », « Excel » ou « CSV paie ». Cela verrouille les heures.' }] },
};

/** Une fiche pour le bureau v2 : les étapes à remplacer sont remplacées, les textes « Heures et paie » v2 posés, les autres reprises à l'identique. */
export function ficheV2(t: AdminTour): AdminTour {
  const texte = (e: AdminStep): AdminStep => {
    const v = TEXTES_HEURES_V2.find((x) => x.fiche === t.id && x.cible === e.cible);
    return v ? { ...e, texte: v.v2, ...(v.v2Mobile ? { mobile: v.v2Mobile } : {}) } : e;
  };
  const r = (e: AdminStep): AdminStep[] => {
    const f = PAR_FICHE_V2[t.id]?.[e.cible] ?? REMPLACEMENTS_V2[e.cible];
    return f ? f(e) : [e];
  };
  return { ...t, etapes: t.etapes.map(texte).flatMap(r) };
}

/** Les fiches du bureau v2 (même ordre, mêmes ids que ADMIN_TOURS_V1) ; celles d'avant si GUIDES_BUREAU_UI2 est `false`. */
export const ADMIN_TOURS_V2: AdminTour[] = GUIDES_BUREAU_UI2 ? ADMIN_TOURS_V1.map(ficheV2) : ADMIN_TOURS_V1;
/** Recherche STRICTE par égalité, comme findAdminTour (admin-tours.ts). */
export const findAdminTourV2 = (id: string): AdminTour | null => ADMIN_TOURS_V2.find((t) => t.id === id) ?? null;
