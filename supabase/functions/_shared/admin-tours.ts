// Guides pas à pas du BUREAU (lot 7, suite) — SANS dépendance : lu par le navigateur
// (components/admin-planning.tsx + components/guide-tour.tsx) ET par la fonction
// `assistant` (assistant-actions-core.ts).
//
// Une fiche par entrée du guide ÉCRIT (GUIDE dans assistant-actions-core.ts) qui se
// fait sur un écran : même `id`. Chaque étape ENTOURE un vrai bouton : `cible` = la
// valeur de son attribut `data-guide="…"` dans le code des écrans du bureau.
// Le guide MONTRE, il ne FAIT jamais : aucun clic, aucun envoi, aucune écriture.
//
// Les libellés entre « » et les ancres sont vérifiés dans le code des écrans par
// admin-tours.test.ts (npm run test:guides-bureau) : un bouton renommé ou une ancre
// retirée casse le test.
//
// Écrire une étape : une phrase très simple (140 caractères au plus, une seule idée),
// « Cliquez » à l'ordinateur (devient « Touchez » sous 1024 px, voir adminStepsFor),
// le libellé exact du bouton entre « ». Un geste qui AGIT sur une ligne précise d'une
// liste (accepter un congé, relancer, lever une réserve, rouvrir un mois…) n'est jamais
// entouré : l'ancre est sur la LISTE et la phrase dit de choisir la bonne ligne.

/**
 * L'écran à préparer avant l'étape. Seulement de la NAVIGATION (menus, fenêtres de
 * lecture) : jamais la borne, les statistiques, un salarié ou un client précis, un
 * formulaire rempli. Absent = on reste où on est.
 */
export type AdminScreen = 'planning' | 'menu' | 'compte' | 'salaries' | 'nouveau-salarie' | 'clients'
  | 'nouveau-client' | 'conges' | 'export' | 'couts' | 'reserves' | 'reglages' | 'versions';
export const ADMIN_SCREENS: AdminScreen[] = ['planning', 'menu', 'compte', 'salaries', 'nouveau-salarie', 'clients',
  'nouveau-client', 'conges', 'export', 'couts', 'reserves', 'reglages', 'versions'];

export interface AdminStep {
  /** L'écran à PRÉPARER avant l'étape (navigation seulement). */
  ecran?: AdminScreen;
  /** Valeur de l'attribut `data-guide` du bouton à entourer. */
  cible: string;
  /** Phrase ordinateur (« Cliquez »), vouvoiement, finit par un point. */
  texte: string;
  /** Phrase des petits écrans (< 1024 px) si elle diffère de `texte` (sinon dérivée). */
  mobile?: string;
  /** Étape propre à une mise en page (le texte est alors déjà écrit avec le bon verbe). */
  surface?: 'ordi' | 'mobile';
}
/** `ordi: true` = ordinateur seulement (le glisser-déposer n'existe pas sur téléphone). */
export interface AdminTour { id: string; ordi?: true; etapes: AdminStep[] }

// ── Étapes réutilisées ──────────────────────────────────────────────────────
const NAV_SAL: AdminStep = { cible: 'bureau-nav.salaries', texte: 'Cliquez sur « Salariés ».' };
const NAV_CLI: AdminStep = { cible: 'bureau-nav.clients', texte: 'Cliquez sur « Clients ».', mobile: 'Touchez « Chantiers ».' };
const NAV_EXP: AdminStep = { cible: 'bureau-nav.exporter', texte: 'Cliquez sur « Exporter ».' };
const NAV_COUT: AdminStep = { cible: 'bureau-nav.couts', texte: 'Cliquez sur « Coût chantiers » (« Coûts » sur un écran étroit).' };
const NAV_RES: AdminStep = { cible: 'bureau-nav.reserves', texte: 'Cliquez sur « Réserves ».', mobile: 'Touchez « Réserves de chantier ».' };
const NAV_ABO: AdminStep = { ecran: 'planning', cible: 'bureau-nav.abonner', texte: 'Si vous êtes en essai, cliquez sur « S’abonner », en haut de l’écran.' };
// Les Réglages : sur grand écran par le nom de l'entreprise, sous 1024 px par le menu ☰.
// La surface ne porte que sur la première étape ; la seconde reste en mobile (adminStepsFor lui donne le ☰).
const REGLAGES: AdminStep[] = [
  { ecran: 'planning', cible: 'bureau-nav.compte', surface: 'ordi', texte: 'Cliquez sur le nom de votre entreprise, en haut de l’écran.' },
  { ecran: 'compte', cible: 'bureau-nav.reglages', texte: 'Cliquez sur « Réglages de l’entreprise ».' },
];
const NOM: AdminStep = { cible: 'bureau-planning.nom', texte: 'Cliquez sur le nom du salarié concerné.' };
const NOM_SAL: AdminStep = { ecran: 'salaries', cible: 'bureau-salaries.nom', texte: 'Cliquez sur le nom du salarié concerné.' };
const CRAYON: AdminStep = { ecran: 'clients', cible: 'bureau-clients.crayon', texte: 'Cliquez sur le crayon à côté du client.', mobile: 'Touchez la ligne du client.' };
const BULLE: AdminStep = { cible: 'bureau-planning.bulle', texte: 'Cliquez sur l’intervention (la bulle) concernée.' };
const RUB_NOTIF: AdminStep = { cible: 'bureau-reglages.rub-notif', texte: 'Ouvrez la rubrique « Notifications & support » (si elle est fermée).' };

/**
 * Les 48 fiches. Les écrans (`ecran`) servent aux étapes qu'on ne peut pas atteindre autrement ;
 * une étape sans `ecran` ne ferme et n'ouvre rien (le patron vient peut-être d'ouvrir la fenêtre lui-même).
 */
export const ADMIN_TOURS: AdminTour[] = [
  { id: 'ajouter_salarie', etapes: [
    NAV_SAL,
    { ecran: 'salaries', cible: 'bureau-salaries.nouveau', texte: 'Cliquez sur « Nouveau salarié ».' },
    { ecran: 'nouveau-salarie', cible: 'bureau-salaries.envoyer', texte: 'Remplissez prénom, nom et e-mail, puis cliquez sur « Envoyer l’invitation ».' },
  ] },
  { id: 'importer_salaries', etapes: [
    NAV_SAL,
    { ecran: 'salaries', cible: 'bureau-salaries.importer', texte: 'Cliquez sur « Importer (CSV/Excel) », puis choisissez votre fichier.' },
  ] },
  { id: 'creer_client', etapes: [
    NAV_CLI,
    { ecran: 'clients', cible: 'bureau-clients.nouveau', texte: 'Cliquez sur « Nouveau client ».' },
    { ecran: 'nouveau-client', cible: 'bureau-clients.creer', texte: 'Tapez le nom du client, puis cliquez sur « Créer le client ».' },
  ] },
  { id: 'importer_clients', etapes: [
    NAV_CLI,
    { ecran: 'clients', cible: 'bureau-clients.importer', texte: 'Cliquez sur « Importer (CSV/Excel) », puis choisissez votre fichier.' },
  ] },
  { id: 'affecter', etapes: [
    { surface: 'ordi', cible: 'bureau-planning.case', texte: 'Cliquez sur une case vide : le bon salarié, le bon jour.' },
    { surface: 'mobile', cible: 'bureau-planning.ajouter', texte: 'Touchez « Ajouter un chantier » sous le salarié voulu.' },
    { cible: 'bureau-planning.ajouter-valider', texte: 'Choisissez le client, puis cliquez sur « Ajouter au planning ».' },
  ] },
  { id: 'absence', etapes: [
    NOM,
    { cible: 'bureau-statut.absences', texte: 'Choisissez « Congé », « Arrêt maladie » ou « Intempérie ».' },
    { cible: 'bureau-absence.enregistrer', texte: 'Choisissez les jours, puis cliquez sur « Enregistrer ».' },
  ] },
  { id: 'demandes_conge', etapes: [
    NAV_SAL,
    { ecran: 'salaries', cible: 'bureau-salaries.conges', texte: 'Cliquez sur « Demandes de congé ».' },
    { ecran: 'conges', cible: 'bureau-conges.liste', texte: 'Repérez la bonne demande, puis cliquez sur la coche ✓ pour accepter ou sur la croix ✗ pour refuser.' },
  ] },
  { id: 'corriger', etapes: [
    NOM,
    { cible: 'bureau-statut.feuille', texte: 'Cliquez sur « Feuille d’heures ».' },
    { cible: 'bureau-fiche.corriger', texte: 'Sur une journée déjà envoyée, cliquez sur « Corriger les heures ».' },
    { cible: 'bureau-fiche.corriger-valider', texte: 'Tapez le motif, puis cliquez sur « Corriger et prévenir ».' },
  ] },
  { id: 'export', etapes: [
    NAV_EXP,
    { ecran: 'export', cible: 'bureau-export.menu', texte: 'Choisissez la période, puis ouvrez « Exporter » et choisissez un format : cela verrouille les heures.' },
    { cible: 'bureau-export.comptable', texte: 'Ou « Envoyer à » votre comptable (son adresse se règle dans les Réglages).' },
  ] },
  { id: 'cloture', etapes: [
    NAV_EXP,
    { ecran: 'export', cible: 'bureau-export.mois', texte: 'Choisissez le mois voulu dans la liste, puis cliquez sur « Clôturer » : ses heures sont verrouillées.' },
  ] },
  { id: 'couts', etapes: [
    NAV_COUT,
    { ecran: 'couts', cible: 'bureau-cout.periodes', texte: 'Choisissez « Ce mois », « Cette semaine » ou « Créneau ».' },
  ] },
  { id: 'budget', etapes: [
    NAV_CLI,
    CRAYON,
    { cible: 'bureau-clients.budget', texte: 'Tapez les « Heures prévues » et le « Montant prévu (€) ».' },
    { cible: 'bureau-clients.enregistrer', texte: 'Cliquez sur « Enregistrer ».' },
  ] },
  { id: 'reserves', etapes: [
    NAV_RES,
    { ecran: 'reserves', cible: 'bureau-reserves.a-traiter', texte: 'Regardez la liste « À traiter » : ce sont les réserves encore ouvertes.' },
  ] },
  { id: 'role', etapes: [
    NAV_SAL,
    { ecran: 'salaries', cible: 'bureau-salaries.liste', texte: 'À droite du nom du salarié voulu, changez son rôle : Salarié, Chef d’équipe ou Bureau.' },
  ] },
  { id: 'reglages', etapes: [
    ...REGLAGES,
    { ecran: 'reglages', cible: 'bureau-reglages.enregistrer', texte: 'Changez ce que vous voulez, puis cliquez sur « Enregistrer ».' },
  ] },
  { id: 'documents', etapes: [
    BULLE,
    { cible: 'bureau-edit.documents', texte: 'Cliquez sur « Documents ».' },
    { cible: 'docs.photo', texte: 'Cliquez sur « Photo » ou « Fichier » pour ajouter.' },
  ] },
  { id: 'relancer', etapes: [
    { ecran: 'planning', cible: 'bureau-invit.voir', texte: 'S’il y a des invitations en attente, cliquez sur « Voir la liste ».' },
    { cible: 'bureau-invit.liste', texte: 'Repérez la personne, puis cliquez sur « Renvoyer » (ou « Envoyer l’invitation ») à côté de son nom.' },
  ] },
  { id: 'semaine', etapes: [
    { cible: 'bureau-semaine.nav', texte: 'Changez de semaine avec les flèches ‹ et ›.', mobile: 'Touchez la flèche › pour la semaine suivante (‹ pour la précédente).' },
  ] },
  { id: 'deplacer', ordi: true, etapes: [
    { cible: 'bureau-planning.bulle', texte: 'Repérez l’intervention à déplacer. Ne cliquez pas dessus : attrapez-la.' },
    { cible: 'bureau-planning.case', texte: 'Maintenez le clic, glissez-la sur le bon salarié et le bon jour, puis relâchez. L’anneau n’est qu’un exemple de case.' },
  ] },
  { id: 'heure_note', etapes: [
    BULLE,
    { cible: 'bureau-edit.horaire', texte: 'Réglez l’« Horaire prévu » et ajoutez une note si besoin.' },
    { cible: 'bureau-edit.enregistrer', texte: 'Cliquez sur « Enregistrer ».' },
  ] },
  { id: 'retirer', etapes: [
    BULLE,
    { cible: 'bureau-edit.supprimer', texte: 'Cliquez sur « Supprimer » pour retirer l’intervention.' },
  ] },
  { id: 'selection', etapes: [
    { cible: 'bureau-nav.selection', texte: 'Cliquez sur « Sélectionner ». S’il est déjà coloré, passez à l’étape suivante.', mobile: 'Touchez « Sélectionner des interventions ».' },
    { ecran: 'planning', cible: 'bureau-planning.bulle', texte: 'Cliquez sur chaque intervention à retirer.' }, // le menu ☰ ne doit pas recouvrir le planning
    { cible: 'bureau-selection.tout', texte: 'Ou cliquez sur « Tout sélectionner ».' },
    { cible: 'bureau-selection.supprimer', texte: 'Cliquez sur « Supprimer », puis confirmez.' },
  ] },
  { id: 'versions', etapes: [
    { cible: 'bureau-nav.versions', texte: 'Cliquez sur la petite flèche ⟲, en haut à gauche du planning.', mobile: 'Touchez « Versions du planning (semaine affichée) ».' },
    { ecran: 'versions', cible: 'bureau-versions.voir', texte: 'Cliquez sur « Voir » pour regarder une ancienne version.' },
    { cible: 'bureau-versions.liste', texte: 'Choisissez la version voulue, puis cliquez sur « Revenir à cette version ».' },
  ] },
  { id: 'present', etapes: [
    NOM,
    { cible: 'bureau-statut.present', texte: 'Cliquez sur « Présent » : cela vaut à partir du jour écrit en haut, les absences suivantes sont retirées.' },
  ] },
  { id: 'attribuer', etapes: [
    { cible: 'bureau-planning.autre', texte: 'S’il y a une case « Autre », cliquez dessus.' },
    { cible: 'bureau-planning.attribuer', texte: 'Cliquez sur « Attribuer / changer le client », puis choisissez le client.' },
  ] },
  { id: 'annuler_invitation', etapes: [
    { ecran: 'planning', cible: 'bureau-invit.voir', texte: 'S’il y a des invitations en attente, cliquez sur « Voir la liste ».' },
    { cible: 'bureau-invit.liste', texte: 'Repérez l’invitation à annuler, puis cliquez sur la croix ✕ à côté d’elle.' },
  ] },
  { id: 'rappel', etapes: [
    { cible: 'bureau-stat.relance', texte: 'S’il y a des journées à relancer, cliquez sur « à relancer ».' },
    { cible: 'bureau-stat.liste', texte: 'Repérez le salarié, puis cliquez sur « Relancer » à côté de son nom.' },
  ] },
  { id: 'fiche_client', etapes: [
    NAV_CLI,
    CRAYON,
    { cible: 'bureau-clients.enregistrer', texte: 'Changez la fiche, puis cliquez sur « Enregistrer ».' },
  ] },
  { id: 'archiver_client', etapes: [
    NAV_CLI,
    CRAYON,
    { cible: 'bureau-clients.archiver', texte: 'Cliquez sur « Archiver » pour ranger ce client.' },
  ] },
  { id: 'supprimer_client', etapes: [
    NAV_CLI,
    CRAYON,
    { cible: 'bureau-clients.supprimer', texte: 'Cliquez sur « Supprimer ». Si le client a des données, utilisez « Archiver ».' },
  ] },
  { id: 'fiche_salarie', etapes: [
    NAV_SAL,
    NOM_SAL,
    { cible: 'bureau-fiche.enregistrer', texte: 'Changez la fiche, puis cliquez sur « Enregistrer ».' },
  ] },
  { id: 'archiver_salarie', etapes: [
    NAV_SAL,
    NOM_SAL,
    { cible: 'bureau-fiche.archiver', texte: 'Cliquez sur « Archiver » pour un salarié parti.' },
  ] },
  { id: 'cloture_salarie', etapes: [
    NOM,
    { cible: 'bureau-statut.feuille', texte: 'Cliquez sur « Feuille d’heures ».' },
    { cible: 'bureau-fiche.exporter', texte: 'Pour récupérer ses heures, cliquez d’abord sur « Exporter » (cela ne verrouille rien).' },
    { cible: 'bureau-fiche.cloturer', texte: 'Puis cliquez sur « Clôturer jusqu’au… » et choisissez la date de fin.' },
  ] },
  { id: 'feuille', etapes: [
    NOM,
    { cible: 'bureau-statut.feuille', texte: 'Cliquez sur « Feuille d’heures ».' },
  ] },
  { id: 'habilitations', etapes: [
    NAV_SAL,
    NOM_SAL,
    { cible: 'bureau-fiche.habilitations', texte: 'Cliquez sur « Habilitations », puis sur « Ajouter ».' },
  ] },
  { id: 'cout_reel', etapes: [
    NAV_SAL,
    NOM_SAL,
    { cible: 'bureau-fiche.cout-bulletin', texte: 'Cliquez sur « Déposer un bulletin » (ou « Saisir à la main »), puis « Valider ».' },
  ] },
  { id: 'reouvrir', etapes: [
    NAV_EXP,
    { ecran: 'export', cible: 'bureau-export.mois', texte: 'Choisissez le mois voulu dans la liste, puis cliquez sur « Rouvrir ».' },
  ] },
  { id: 'telecharger', etapes: [
    NAV_EXP,
    { ecran: 'export', cible: 'bureau-export.un-salarie', texte: 'Pour télécharger sans rien verrouiller, cliquez sur « Un seul salarié ? » et choisissez-le.' },
    { cible: 'bureau-export.menu', texte: 'Pour toute l’équipe : période, puis « Exporter ». Attention : cela verrouille les heures de la période.' },
  ] },
  { id: 'lever_reserve', etapes: [
    NAV_RES,
    { ecran: 'reserves', cible: 'bureau-reserves.liste', texte: 'Repérez la réserve réglée, puis cliquez sur « Lever la réserve ».' },
    { cible: 'reserves.valider', texte: 'Confirmez avec « Lever la réserve ».' },
  ] },
  { id: 'depense', etapes: [
    NAV_COUT,
    { ecran: 'couts', cible: 'bureau-cout.depense', texte: 'Cliquez sur « Ajouter une dépense ».' },
  ] },
  { id: 'envoyer_client', etapes: [
    BULLE,
    { cible: 'bureau-edit.documents', texte: 'Cliquez sur « Documents ».' },
    { cible: 'bureau-docs.email', texte: 'Si l’adresse du client manque, tapez-la dans « E-mail du client », puis « OK ».' },
    { cible: 'docs.envoyer', texte: 'Il faut au moins un document. Cliquez sur « Ouvrir l’e-mail » pour écrire au client.' },
  ] },
  { id: 'borne', etapes: [
    { cible: 'bureau-nav.borne', texte: 'Cliquez sur « Borne ».', mobile: 'Touchez « Borne ».' },
    { cible: 'bureau-borne.code', texte: 'Sur la tablette, ouvrez la page de la borne et tapez ce code à 6 chiffres.' },
    { cible: 'bureau-borne.deconnecter', texte: 'Pour la retirer plus tard : « Déconnecter la tablette ».' },
  ] },
  { id: 'support', etapes: [
    ...REGLAGES,
    RUB_NOTIF,
    { cible: 'bureau-reglages.support', texte: 'Choisissez la durée, puis cliquez sur « Autoriser le support BEMEXO ». L’accès est en lecture seule et se retire quand vous voulez.' },
  ] },
  { id: 'abonnement', etapes: [
    NAV_ABO,
    ...REGLAGES,
    { cible: 'bureau-reglages.abonnement', texte: 'Sinon, cliquez sur « Gérer mon abonnement ».' },
  ] },
  { id: 'recap', etapes: [
    ...REGLAGES,
    RUB_NOTIF,
    { cible: 'bureau-reglages.recap', texte: 'Cliquez sur « Envoyer le récap maintenant » : un e-mail part tout de suite.' },
  ] },
  { id: 'caisse', etapes: [
    ...REGLAGES,
    { cible: 'bureau-reglages.rub-heures', texte: 'Ouvrez la rubrique « Heures & paie » (si elle est fermée).' },
    { cible: 'bureau-reglages.caisse', texte: 'Réglez ici la « Caisse de congés BTP ».' },
  ] },
  { id: 'collegues', etapes: [
    ...REGLAGES,
    { cible: 'bureau-reglages.rub-borne', texte: 'Ouvrez la rubrique « Borne & pointage » (si elle est fermée).' },
    { cible: 'bureau-reglages.collegues', texte: 'Activez ou coupez « Les salariés voient le planning de leurs collègues ».' },
  ] },
  { id: 'assistant', etapes: [
    { cible: 'bureau-nav.assistant', texte: 'Cliquez sur « Assistant BEMEXO » (l’étoile ✨) pour lui parler.' },
  ] },
];

/** Recherche STRICTE par égalité dans le tableau : jamais ADMIN_TOURS[id] (guide:constructor, guide:__proto__). */
export const findAdminTour = (id: string): AdminTour | null => ADMIN_TOURS.find((t) => t.id === id) ?? null;
export const hasAdminTour = (id: string): boolean => findAdminTour(id) !== null;

/** Les boutons de la barre qui, sous 1024 px, sont des lignes du menu ☰. */
export const MENU_CIBLES = [
  'bureau-nav.salaries', 'bureau-nav.clients', 'bureau-nav.exporter', 'bureau-nav.couts', 'bureau-nav.reserves',
  'bureau-nav.borne', 'bureau-nav.selection', 'bureau-nav.versions', 'bureau-nav.reglages',
];
const OUVRIR_MENU: { cible: string; texte: string; ecran: AdminScreen } = {
  ecran: 'planning', cible: 'bureau-nav.menu', texte: 'Touchez le bouton « Menu » (les trois traits), en haut de l’écran.',
};

/** « Cliquez » → « Touchez » (la majuscule est gardée : au milieu d'une phrase on écrit « cliquez »). */
const touchez = (s: string) => s
  .replace(/\b([Cc])liquez sur /g, (_m, c: string) => (c === 'C' ? 'Touchez ' : 'touchez '))
  .replace(/\b([Cc])liquez\b/g, (_m, c: string) => (c === 'C' ? 'Touchez' : 'touchez'));

/**
 * Les étapes à donner à <GuideTour> selon la mise en page (narrow = largeur ≤ 1023 px :
 * téléphone ET tablette, même écran avec le menu ☰). Sous 1024 px les boutons de la barre
 * sont des lignes du ☰ : l'écran `menu` est préparé et une étape « ouvrir le ☰ » est ajoutée avant.
 */
export function adminStepsFor(t: AdminTour, narrow: boolean): { cible: string; texte: string; ecran?: string }[] {
  const out: { cible: string; texte: string; ecran?: string }[] = [];
  let menuAnnonce = false;
  for (const e of t.etapes) {
    if (e.surface && e.surface !== (narrow ? 'mobile' : 'ordi')) continue;
    if (!narrow) { out.push({ ...(e.ecran ? { ecran: e.ecran } : {}), cible: e.cible, texte: e.texte }); continue; }
    const texte = e.mobile ?? touchez(e.texte);
    if (MENU_CIBLES.includes(e.cible)) {
      if (!menuAnnonce) { out.push({ ...OUVRIR_MENU }); menuAnnonce = true; }
      out.push({ ecran: 'menu', cible: e.cible, texte });
    } else out.push({ ...(e.ecran ? { ecran: e.ecran } : {}), cible: e.cible, texte });
  }
  return out;
}

// ── La console du SUPPORT BEMEXO (/support) ─────────────────────────────────
// Pas d'assistant côté support : le bouton « Me guider pas à pas » est sur la page elle-même
// (components/support-console.tsx). Cette fiche n'est PAS dans ADMIN_TOURS : l'assistant du
// bureau ne la lance jamais. Chaque étape dit dans quels états de la console elle s'affiche ;
// le guide MONTRE, il ne se connecte pas, ne valide aucun code et n'entre chez aucun client.
export type ConsoleKind = 'loading' | 'signed-out' | 'not-staff' | 'enroll' | 'challenge' | 'ready' | 'inside';
export interface SupportStep { etats: ConsoleKind[]; cible: string; texte: string }

export const SUPPORT_TOUR: SupportStep[] = [
  { etats: ['signed-out'], cible: 'support-console.connexion', texte: 'Cliquez sur « Se connecter » avec le compte support, puis revenez sur cette page.' },
  { etats: ['enroll'], cible: 'support-console.qr', texte: 'Scannez ce QR code avec votre application d’authentification.' },
  { etats: ['enroll'], cible: 'support-console.code', texte: 'Tapez le code à 6 chiffres dans la case entourée.' },
  { etats: ['challenge'], cible: 'support-console.code', texte: 'Tapez le code à 6 chiffres de votre application d’authentification.' },
  { etats: ['enroll', 'challenge'], cible: 'support-console.valider', texte: 'Cliquez sur « Valider ». Le bouton s’active quand les 6 chiffres sont tapés.' },
  // L'anneau est sur la LISTE, jamais sur « Entrer » : entrer ouvre l'espace d'un client et s'écrit dans son journal.
  { etats: ['ready'], cible: 'support-console.entreprises', texte: 'Cliquez sur « Entrer » à côté de l’entreprise voulue. S’il n’y en a aucune, le patron doit d’abord l’autoriser.' },
  { etats: ['inside'], cible: 'support-console.quitter', texte: 'Vous êtes en lecture seule. Cliquez sur « Quitter » quand vous avez fini.' },
];

/** Les étapes à donner à <GuideTour> pour l'état de la console ; vide pour `loading` et `not-staff` (pas de guide). */
export function supportStepsFor(kind: ConsoleKind, narrow: boolean): { cible: string; texte: string }[] {
  return SUPPORT_TOUR.filter((e) => e.etats.includes(kind)).map((e) => ({ cible: e.cible, texte: narrow ? touchez(e.texte) : e.texte }));
}
