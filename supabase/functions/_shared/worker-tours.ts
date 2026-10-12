// Guides pas à pas du SALARIÉ (lot 7) — SANS dépendance : lu par le navigateur
// (components/guide-tour.tsx) ET par la fonction (worker-assistant-core.ts).
//
// Une fiche par entrée de WORKER_GUIDE qui se fait sur un écran (même `id`).
// Chaque étape ENTOURE un vrai bouton : `cible` = la valeur de son attribut
// `data-guide="…"` dans le code des écrans. Rien n'est jamais fait à la place du
// salarié : le guide montre, il ne touche à rien.
//
// Les libellés entre « » sont vérifiés dans le code des écrans par
// worker-tours.test.ts (npm run test:guides) : un bouton renommé casse le test.
//
// Écrire une étape : une phrase très simple (140 caractères au plus, une seule
// idée), « Touchez » jamais « cliquez », le libellé exact du bouton entre « ».
// Si le geste dépend d'un état (« S'il y a un pointage en cours… »), le dire.

/**
 * L'écran à préparer avant l'étape. Seulement de la NAVIGATION : jamais
 * 'notifications', 'photo' ni 'borne' (gestes qui agissent : le salarié les
 * touche lui-même). Absent = on reste où on est, menu refermé.
 */
export type TourScreen = 'journee' | 'semaine' | 'mois' | 'historique' | 'conges' | 'infos' | 'menu';

export interface TourStep {
  ecran?: TourScreen;
  /** Valeur de l'attribut `data-guide` du bouton à entourer. */
  cible: string;
  texte: string;
}
export interface WorkerTour { id: string; etapes: TourStep[] }

export const TOUR_LABEL = 'Me guider pas à pas';
const PREFIX = 'guide:';
/** L'action du bouton « Me guider pas à pas » dans une réponse de l'assistant. */
export const tourAction = (id: string) => `${PREFIX}${id}`;
/** `guide:conge` → `conge` ; toute autre action → null. */
export const tourIdOf = (action: string): string | null => (action.startsWith(PREFIX) ? action.slice(PREFIX.length) : null);

// Le menu du compte (votre nom, en haut à droite) : même première étape partout.
const MENU: TourStep = { cible: 'menu.compte', texte: 'Touchez votre nom, en haut à droite.' };
const CHANTIER = 'Dans « Chantiers du jour », touchez le chantier concerné.';

export const WORKER_TOURS: WorkerTour[] = [
  { id: 'reserve', etapes: [
    { ecran: 'journee', cible: 'journee.chantier', texte: CHANTIER },
    { cible: 'editeur.reserve', texte: 'Dans la fiche du chantier, touchez « Avec réserve ».' },
    { cible: 'editeur.note', texte: 'Dans la même fiche, écrivez un détail si vous voulez (facultatif).' },
    { cible: 'editeur.documents', texte: 'Pour joindre une photo, touchez « Documents » (facultatif).' },
    { cible: 'editeur.ok', texte: 'Touchez « OK » pour enregistrer.' },
  ] },
  { id: 'photo-document', etapes: [
    { ecran: 'journee', cible: 'journee.chantier', texte: CHANTIER },
    { cible: 'editeur.documents', texte: 'Dans la fiche, touchez « Documents ».' },
    { cible: 'docs.photo', texte: 'Dans « Documents », touchez « Photo » pour l’appareil photo, ou « Fichier » pour un document.' },
  ] },
  { id: 'conge', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.conges', texte: 'Touchez « Mes congés ».' },
    { ecran: 'conges', cible: 'conges.faire', texte: 'Touchez « Faire une demande ».' },
    { cible: 'conges.type', texte: 'Dans le formulaire, choisissez le type, puis les dates « Du » et « Au ».' },
    { cible: 'conges.envoyer', texte: 'Touchez « Envoyer la demande ». Le bureau vous répond.' },
  ] },
  { id: 'pointer', etapes: [
    { ecran: 'journee', cible: 'entete.scanner', texte: 'En arrivant, touchez l’icône du scanner, en haut, et visez le QR code de la tablette.' },
    { cible: 'journee.terminer', texte: 'En partant, scannez à nouveau. Ou, s’il y a un pointage en cours, touchez « Terminer ma journée ».' },
    { cible: 'journee.plus', texte: 'Pas de tablette ? Notez vos heures avec le bouton « + ».' },
  ] },
  { id: 'envoyer-journee', etapes: [
    { ecran: 'journee', cible: 'journee.chantier', texte: 'Vérifiez chaque chantier et ses horaires. Touchez-en un pour le corriger.' },
    { cible: 'journee.envoyer', texte: 'Puis touchez « Envoyer ma journée ». Le bureau la reçoit.' },
  ] },
  { id: 'noter-heures', etapes: [
    { ecran: 'journee', cible: 'journee.plus', texte: 'Touchez le bouton « + ».' },
    { cible: 'editeur.chantier', texte: 'Dans la fiche, touchez le chantier où vous avez travaillé.' },
    { cible: 'editeur.horaires', texte: 'Touchez « Début » puis « Fin » pour régler les heures.' },
    { cible: 'editeur.ok', texte: 'Touchez « OK ».' },
    { cible: 'journee.envoyer', texte: 'Puis touchez « Envoyer ma journée » pour la donner au bureau.' },
  ] },
  { id: 'planning', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.semaine', texte: 'Touchez « Ma semaine » (ou « Mon mois » pour tout le mois).' },
    { ecran: 'semaine', cible: 'semaine.jour', texte: 'Touchez un jour pour voir son détail.' },
  ] },
  { id: 'historique', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.historique', texte: 'Touchez « Historique ».' },
    { ecran: 'historique', cible: 'historique.jour', texte: 'Vos anciennes heures, jour par jour. Faites défiler pour remonter dans le temps.' },
  ] },
  { id: 'copier-journee', etapes: [
    { ecran: 'journee', cible: 'journee.copier', texte: 'Touchez « Copier la journée d’hier » (journée vide) ou « Dupliquer cette journée » (autres jours).' },
    { cible: 'copier.valider', texte: 'Pour dupliquer : choisissez les jours sur le calendrier, puis touchez « Copier ».' },
  ] },
  { id: 'notifications', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.notifications', texte: 'Touchez « Activer les notifications », puis autorisez quand le téléphone le demande.' },
  ] },
  { id: 'photo-profil', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.photo', texte: 'Touchez « Changer ma photo », puis choisissez une photo.' },
  ] },
  { id: 'panier', etapes: [
    { ecran: 'journee', cible: 'journee.panier', texte: 'Touchez la case « Panier » du bloc noir : un appui pour « repas pris », un autre pour « non pris ».' },
  ] },
  { id: 'modifier-heures', etapes: [
    { ecran: 'journee', cible: 'journee.chantier', texte: 'Dans « Chantiers du jour », touchez la ligne à corriger.' },
    { cible: 'editeur.horaires', texte: 'Dans la fiche, touchez « Début » ou « Fin » et réglez l’heure.' },
    { cible: 'editeur.ok', texte: 'Touchez « OK ». Si la journée est déjà envoyée, le bureau est prévenu.' },
  ] },
  { id: 'retirer-ligne', etapes: [
    { ecran: 'journee', cible: 'journee.chantier', texte: 'Dans « Chantiers du jour », touchez la ligne à retirer.' },
    { cible: 'editeur.retirer', texte: 'Dans la fiche, touchez la corbeille (« Retirer ce chantier »).' },
    { cible: 'confirmer.retirer', texte: 'Confirmez avec « Oui, retirer ».' },
  ] },
  { id: 'route-pause', etapes: [
    { ecran: 'journee', cible: 'journee.trou', texte: 'Entre deux chantiers, l’appli demande « c’était quoi ? » : touchez « Route » ou « Pause ».' },
  ] },
  { id: 'lever-reserve', etapes: [
    { ecran: 'journee', cible: 'reserves.bandeau', texte: 'Touchez le bandeau jaune des réserves à lever, en haut de votre journée.' },
    { cible: 'reserves.lever', texte: 'Sous le bon chantier, touchez « Lever la réserve ».' },
    { cible: 'reserves.valider', texte: 'Écrivez un commentaire si vous voulez, puis touchez « Lever la réserve ».' },
  ] },
  { id: 'annuler-conge', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.conges', texte: 'Touchez « Mes congés ».' },
    { ecran: 'conges', cible: 'conges.annuler', texte: 'Sur une demande « En attente », touchez la petite corbeille à droite.' },
  ] },
  { id: 'sortie-oubliee', etapes: [
    { ecran: 'journee', cible: 'journee.terminer', texte: 'S’il y a un pointage en cours, touchez « Terminer ma journée ».' },
    { cible: 'journee.sortie-oubliee', texte: 'Le lendemain, touchez la ligne « Sortie oubliée » : elle attend votre heure de fin.' },
    { cible: 'editeur.horaires', texte: 'Dans la fiche, touchez « Fin », puis réglez l’heure à laquelle vous avez fini.' },
    { cible: 'editeur.ok', texte: 'Touchez « OK ».' },
    { cible: 'journee.envoyer', texte: 'Puis touchez « Envoyer ma journée ».' },
  ] },
  { id: 'autre-chantier', etapes: [
    { ecran: 'journee', cible: 'journee.plus', texte: 'Touchez le bouton « + ».' },
    { cible: 'editeur.autre', texte: 'Dans la fiche, touchez « Autre chantier ».' },
    { cible: 'editeur.ajouter-chantier', texte: 'Écrivez le nom du chantier, puis touchez « Ajouter ce chantier ». Le bureau le verra.' },
    { cible: 'editeur.ok', texte: 'Réglez les heures, puis touchez « OK ».' },
  ] },
  { id: 'envoyer-client', etapes: [
    { ecran: 'journee', cible: 'journee.chantier', texte: CHANTIER },
    { cible: 'editeur.documents', texte: 'Dans la fiche, touchez « Documents ».' },
    { cible: 'docs.envoyer', texte: 'Dans « Documents », touchez « Ouvrir l’e-mail ». La première fois, écrivez d’abord l’e-mail du client.' },
  ] },
  { id: 'borne', etapes: [
    { ecran: 'journee', cible: 'entete.scanner', texte: 'Touchez l’icône du scanner, puis visez le QR code de la borne.' },
  ] },
  { id: 'equipe', etapes: [
    { ecran: 'journee', cible: 'equipe.jour', texte: 'Chef d’équipe seulement. Dans « Mon équipe », choisissez le jour (7 derniers jours).' },
    { cible: 'equipe.salarie', texte: 'Choisissez le salarié dans la liste.' },
    { cible: 'equipe.corriger', texte: 'S’il a déjà une ligne, touchez « Corriger ».' },
    { cible: 'equipe.ajouter', texte: 'Sinon, touchez « Ajouter des heures » (chantier, début, fin).' },
    { cible: 'equipe.ok', texte: 'Touchez « OK — envoyer au bureau ». C’est marqué « par le chef d’équipe ».' },
  ] },
  { id: 'infos', etapes: [
    MENU,
    { ecran: 'menu', cible: 'menu.infos', texte: 'Touchez « Informations ».' },
    { ecran: 'infos', cible: 'infos.fermer', texte: 'Lisez le texte, puis touchez « Fermer ».' },
  ] },
];

export const findWorkerTour = (id: string): WorkerTour | null => WORKER_TOURS.find((t) => t.id === id) ?? null;
export const hasWorkerTour = (id: string): boolean => findWorkerTour(id) !== null;
