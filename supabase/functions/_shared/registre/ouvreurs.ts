// Les OUVREURS de l'assistant (étape 3, livraison 3b-1) : les écrans qu'il sait ouvrir, pré-remplis, SANS JAMAIS ENREGISTRER.
// Contrat : docs/ia-etape3/00-conception-etape3.md §3 ; détail des écrans : docs/ia-etape3/04-ouvrir-n-importe-quel-ecran.md §1.2-1.3.
//
// MODULE LOURD, FONCTIONS EDGE ET TESTS SEULEMENT. Il porte les phrases lues par le modèle (`titre`, `decrit`, `aide`) et les noms d'états
// de l'interface : le navigateur n'y touche jamais (test T8). Il lit, à sa place, deux modules LÉGERS GÉNÉRÉS (ouvreurs-leger-bureau.ts,
// ouvreurs-leger-salarie.ts : ids, rôles, paramètres typés, drapeaux ; le test registre-ouvreurs.test.ts échoue tant qu'ils ne sont pas
// ce que `scripts/registre-ouvreurs-gen.ts` écrirait d'après ce fichier).
//
// PÉRIMÈTRE 3b-1 = vagues 1 et 2 (docs/ia-etape3/00-conception-etape3.md §3.1) : les écrans sans paramètre ou dont les paramètres sont DÉJÀ
// des états de la page. Les vagues 3 à 5 (props `init` sur les fenêtres à état interne, journée du salarié, guide) viendront après le
// redesign du bureau ; `OUVREURS_REPORTES` dit lesquels, et pourquoi.
//
// Règles (toutes testées) : un ouvreur ne clique JAMAIS « Enregistrer », « Envoyer » ni « Clôturer » ; il pose des valeurs que la personne
// peut changer ; les paramètres ne portent jamais de n° de sécurité sociale, de taux horaire, de bulletin ; un texte est borné à 80
// caractères et aplati ; un ouvreur de niveau 3 (`export.equipe`, `cloture.mois`) n'est ouvert que si la personne a évoqué le sujet.
import type { Cote, Ouvreur, ParamOuvreur } from './types.ts';

const S = (aide: string, requis = false): ParamOuvreur => ({ kind: 'salarie', aide, ...(requis ? { requis } : {}) });
const C = (aide: string, requis = false): ParamOuvreur => ({ kind: 'chantier', aide, ...(requis ? { requis } : {}) });
const D = (aide = 'aaaa-mm-jj, ou un jour dit (« lundi », « demain »)', requis = false): ParamOuvreur => ({ kind: 'date', aide, ...(requis ? { requis } : {}) });
const T = (aide: string): ParamOuvreur => ({ kind: 'texte', aide });
const E = (valeurs: readonly string[], aide: string): ParamOuvreur => ({ kind: 'enum', valeurs, aide });

/** Les 26 ouvreurs du bureau livrés en 3b-1. Ordre = ordre de l'enum de l'outil `ouvrir_fenetre` du bureau. */
export const OUVREURS_BUREAU: Ouvreur[] = [
  // ── Vague 1 : sans paramètre (ou un filtre de recherche, déjà un état) ──
  {
    id: 'salaries.liste', cote: 'bureau', roles: ['admin'], titre: 'Salariés', decrit: 'La liste des salariés (nouveau salarié, import, demandes de congé, export d’un salarié), avec une recherche par nom.',
    params: { recherche: T('nom à chercher dans la liste') }, niveau: 1,
    etats: ['salariesOpen', 'salariesQuery'], ancres: ['bureau-nav.salaries', 'bureau-salaries.liste'], alias: ['salaries'],
  },
  {
    id: 'salaries.importer', cote: 'bureau', roles: ['admin'], titre: 'Importer des salariés', decrit: 'L’import d’un fichier CSV ou Excel de salariés (la personne choisit le fichier).',
    params: {}, niveau: 1, formulaire: true,
    composants: ['import-workers-dialog'], etats: ['importWorkersOpen'], ancres: ['bureau-salaries.importer'],
  },
  {
    id: 'clients.importer', cote: 'bureau', roles: ['admin'], titre: 'Importer des clients', decrit: 'L’import d’un fichier CSV ou Excel de clients et de chantiers (la personne choisit le fichier).',
    params: {}, niveau: 1, formulaire: true,
    composants: ['import-dialog'], etats: ['importOpen'], ancres: ['bureau-clients.importer'], alias: ['import_clients'],
  },
  {
    id: 'reserves.registre', cote: 'bureau', roles: ['admin'], titre: 'Réserves', decrit: 'Le registre des réserves de chantier : à traiter et levées.',
    params: {}, niveau: 1,
    composants: ['reserves-report'], etats: ['reservesOpen'], ancres: ['bureau-nav.reserves', 'bureau-reserves.liste'], alias: ['reserves'],
  },
  {
    id: 'conges.demandes', cote: 'bureau', roles: ['admin'], titre: 'Demandes de congé', decrit: 'Les demandes de congé des salariés, à accepter ou à refuser.',
    params: {}, niveau: 1,
    composants: ['leave-admin-dialog'], etats: ['leaveOpen'], ancres: ['bureau-salaries.conges', 'bureau-conges.liste'], alias: ['conges'],
  },
  {
    id: 'stats.equipe', cote: 'bureau', roles: ['admin'], titre: 'Statistiques de l’équipe', decrit: 'Les statistiques de l’équipe (lecture seule).',
    params: {}, niveau: 1,
    composants: ['team-stats'], etats: ['statsOpen'],
  },
  {
    id: 'planning.supprimees', cote: 'bureau', roles: ['admin'], titre: 'Interventions supprimées', decrit: 'Les interventions supprimées ou décalées du planning (la trace de ce qui a changé).',
    params: {}, niveau: 1, dispo: 'traces',
    composants: ['traces-dialog'], etats: ['tracesOpen', 'tracesOn'],
  },
  {
    id: 'planning.versions', cote: 'bureau', roles: ['admin'], titre: 'Versions du planning', decrit: 'Les versions enregistrées du planning d’une semaine (par défaut la semaine affichée).',
    params: { lundi: { kind: 'lundi', aide: 'un jour de la semaine voulue (aaaa-mm-jj ou « lundi prochain »)' } }, niveau: 1, dispo: 'versions',
    composants: ['planning-versions-dialog'], etats: ['versionsOpen', 'versionsOn', 'currentWeekStart'], ancres: ['bureau-nav.versions', 'bureau-versions.liste'],
  },
  {
    id: 'formations.gestion', cote: 'bureau', roles: ['admin'], titre: 'Formations', decrit: 'Les formations de l’entreprise (vidéos, qui les a vues).',
    params: {}, niveau: 1, dispo: 'formations',
    composants: ['trainings-admin'], etats: ['trainingsOpen', 'trainingsOn'],
  },
  {
    id: 'abonnement.choisir', cote: 'bureau', roles: ['admin'], titre: 'Choisir un abonnement', decrit: 'Le panneau « Choisissez votre abonnement » (le paiement reste un geste de la personne).',
    params: {}, niveau: 1,
    etats: ['subOpen'], ancres: ['bureau-nav.abonner'],
  },
  {
    id: 'relances.liste', cote: 'bureau', roles: ['admin'], titre: 'À relancer', decrit: 'Les journées planifiées dont les heures ne sont pas envoyées, avec un bouton « Relancer » par ligne.',
    params: {}, niveau: 1,
    etats: ['statPanel', 'relanceOpen'], ancres: ['bureau-stat.relance', 'bureau-stat.liste'],
  },
  {
    id: 'planning.selection', cote: 'bureau', roles: ['admin'], titre: 'Sélectionner des interventions', decrit: 'Le mode « Sélectionner » du planning (cocher des interventions ; la suppression reste un geste de la personne).',
    params: {}, niveau: 1,
    etats: ['selectMode'], ancres: ['bureau-nav.selection'],
  },
  {
    id: 'borne.gestion', cote: 'bureau', roles: ['admin'], titre: 'Tablette de pointage', decrit: 'La gestion de la borne : code pour relier la tablette, état. Le code s’affiche à la personne, jamais à l’assistant.',
    params: {}, niveau: 1, dispo: 'borne',
    composants: ['kiosk-admin'], etats: ['kioskOpen', 'kioskOn'], ancres: ['bureau-nav.borne'],
  },
  {
    id: 'clients.liste', cote: 'bureau', roles: ['admin'], titre: 'Clients', decrit: 'La liste des clients et chantiers (nouveau client, import, fiche), avec une recherche par nom.',
    params: { recherche: T('nom à chercher dans la liste') }, niveau: 1,
    etats: ['chantierMenuOpen', 'mobileChantiersOpen', 'clientsQuery'], ancres: ['bureau-nav.clients'], alias: ['clients'],
  },
  // ── Vague 2 : paramètres déjà portés par des états ──
  {
    id: 'planning.semaine', cote: 'bureau', roles: ['admin'], titre: 'Planning de la semaine', decrit: 'Le planning à une autre semaine (jour précis sur téléphone).',
    params: { lundi: { kind: 'lundi', aide: 'un jour de la semaine voulue (aaaa-mm-jj ou « lundi prochain »)' }, jour: D('jour à afficher sur téléphone') }, niveau: 1,
    etats: ['currentWeekStart', 'mobileDayIdx'], ancres: ['bureau-semaine.nav'], alias: ['planning'],
  },
  {
    id: 'salarie.fiche', cote: 'bureau', roles: ['admin'], titre: 'Fiche du salarié', decrit: 'La fiche d’un salarié : feuille d’heures (mode hours) ou gestion (mode manage). Jamais de paie.',
    params: { salarie: S('nom du salarié tel que dit', true), mode: E(['hours', 'manage'], 'hours = feuille d’heures, manage = gestion de la fiche') }, niveau: 1, formulaire: true,
    composants: ['worker-detail'], etats: ['ficheWorker', 'ficheMode'], alias: ['salarie:'],
  },
  {
    id: 'client.fiche', cote: 'bureau', roles: ['admin'], titre: 'Fiche du client', decrit: 'La fiche d’un client ou chantier : coordonnées, budget, documents, terminer, archiver.',
    params: { chantier: C('nom du client ou chantier tel que dit', true) }, niveau: 1, formulaire: true,
    etats: ['clientFiche'], ancres: ['bureau-clients.crayon'],
  },
  {
    id: 'chantier.documents', cote: 'bureau', roles: ['admin'], titre: 'Documents du chantier', decrit: 'Les documents et photos d’un chantier (par défaut sans jour précis).',
    params: { chantier: C('nom du client ou chantier tel que dit', true), jour: D('jour du document, s’il est dit') }, niveau: 1, formulaire: true, empile: true,
    composants: ['chantier-documents'], etats: ['docsWorksite'],
  },
  {
    id: 'client.nouveau', cote: 'bureau', roles: ['admin'], titre: 'Nouveau client', decrit: 'Le formulaire « Nouveau client », pré-rempli avec ce qui est dit ; la personne vérifie puis enregistre.',
    params: {
      nom: T('nom du client'), produit: T('type de travaux ou de produit'), telephone: T('téléphone'), email: T('adresse e-mail'),
      ville: T('ville'), adresse: T('adresse'), description: T('description'),
    }, niveau: 1, formulaire: true,
    etats: ['clientOpen', 'cName', 'cProduct', 'cPhone', 'cEmail', 'cCity', 'cAddress', 'cDesc'], ancres: ['bureau-clients.nouveau'], alias: ['nouveau_client', 'nouveau-client'],
  },
  {
    id: 'salarie.nouveau', cote: 'bureau', roles: ['admin'], titre: 'Nouveau salarié', decrit: 'Le formulaire « Nouveau salarié », pré-rempli avec ce qui est dit ; l’invitation part au clic de la personne.',
    params: { prenom: T('prénom'), nom: T('nom'), email: T('adresse e-mail'), telephone: T('téléphone') }, niveau: 1, formulaire: true,
    etats: ['workerOpen', 'wFirst', 'wLast', 'wEmail', 'wPhone'], ancres: ['bureau-salaries.nouveau'], alias: ['nouveau_salarie', 'nouveau-salarie'],
  },
  {
    id: 'export.equipe', cote: 'bureau', roles: ['admin'], titre: 'Exporter l’équipe', decrit: 'L’export de toute l’équipe pour une période : exporter VERROUILLE les heures, donc la personne choisit elle-même le format et clique. Jamais ouvert sans qu’elle l’ait demandé.',
    params: { du: D('premier jour de la période', false), au: D('dernier jour de la période', false) }, niveau: 3,
    declencheur: 'export|paie|comptable|telecharg|heures de l equipe',
    etats: ['exportOpen', 'exportRange'], ancres: ['bureau-nav.exporter', 'bureau-export.menu'], alias: ['export'],
  },
  {
    id: 'cloture.mois', cote: 'bureau', roles: ['admin'], titre: 'Clôturer un mois', decrit: 'La confirmation « Clôturer le mois » (le mois précédent ou le mois en cours seulement) : clôturer verrouille les heures, la personne clique elle-même.',
    params: { mois: { kind: 'mois', requis: true, aide: 'aaaa-mm, le mois précédent ou le mois en cours' } }, niveau: 3,
    declencheur: 'clotur|cloture|verrouill',
    etats: ['closureTarget'], ancres: ['bureau-export.mois'],
  },
  {
    id: 'planning.ajouter', cote: 'bureau', roles: ['admin'], titre: 'Ajouter une intervention', decrit: 'La fenêtre « Ajouter » du planning (intervention ou tâche), pré-remplie ; la personne vérifie puis enregistre. Pour FAIRE l’ajout (« mets », « ajoute »), utiliser affecter_planning, pas cet écran.',
    params: {
      salarie: S('nom du salarié tel que dit', true), date: D('jour de l’intervention', true), chantier: C('nom du client ou chantier tel que dit'),
      debut: { kind: 'heure', aide: 'heure de début HH:MM' }, fin: { kind: 'heure', aide: 'heure de fin HH:MM' }, note: T('note de l’intervention'),
      type: E(['intervention', 'tache'], 'intervention (défaut) ou tache'),
    }, niveau: 1, formulaire: true,
    etats: ['addOpen', 'addTarget', 'addWorksite', 'addNote', 'addStart', 'addEnd', 'addKind'],
  },
  {
    id: 'salarie.statut', cote: 'bureau', roles: ['admin'], titre: 'Statut du salarié', decrit: 'Le choix du statut d’un salarié à partir d’un jour : présent, absences, feuille d’heures. Rien n’est changé avant le clic.',
    params: { salarie: S('nom du salarié tel que dit', true), date: D('jour de départ du statut') }, niveau: 1,
    etats: ['statusTarget'], ancres: ['bureau-statut.absences'],
  },
  {
    id: 'absence.poser', cote: 'bureau', roles: ['admin'], titre: 'Poser une absence', decrit: 'Le formulaire d’absence (calendrier) d’un salarié, pré-rempli ; la personne vérifie puis valide. Pour POSER l’absence directement (« mets Sofiane en congé »), utiliser poser_absence.',
    params: { salarie: S('nom du salarié tel que dit', true), type: E(['conge', 'maladie', 'intemperie'], 'type d’absence'), du: D('premier jour', true), au: D('dernier jour') }, niveau: 1, formulaire: true,
    etats: ['pendingAbsence', 'absRange'], ancres: ['bureau-absence.enregistrer'],
  },
  {
    id: 'export.salarie', cote: 'bureau', roles: ['admin'], titre: 'Exporter un salarié', decrit: 'L’export des heures d’un seul salarié (sa feuille d’heures : calendrier, Excel, PDF). Cet export ne verrouille rien.',
    params: { salarie: S('nom du salarié tel que dit') }, niveau: 1,
    etats: ['exportWorkerOpen'], ancres: ['bureau-export.un-salarie'],
  },
];

/** Les ouvreurs du salarié livrés en 3b-1 (vague 1). */
export const OUVREURS_SALARIE: Ouvreur[] = [
  {
    id: 'jour.date', cote: 'salarie', roles: ['worker', 'lead'], titre: 'Une autre journée', decrit: 'Ma journée à une autre date (les heures de ce jour-là), pas celle d’aujourd’hui.',
    params: { date: D('jour voulu, aaaa-mm-jj ou un jour dit (« hier », « lundi »)', true) }, niveau: 1,
    etats: ['selectedDate'],
  },
  {
    id: 'formations.ouvrir', cote: 'salarie', roles: ['worker', 'lead'], titre: 'Mes formations', decrit: 'La liste de mes formations (vidéos à voir). N’existe que si l’entreprise m’en a donné.',
    params: {}, niveau: 1, dispo: 'formations',
    etats: ['view'],
  },
];

export const OUVREURS: readonly Ouvreur[] = [...OUVREURS_BUREAU, ...OUVREURS_SALARIE];

/** Les ouvreurs d'un côté, dans l'ordre (celui de l'enum de l'outil). Recherche par égalité dans un tableau, jamais `OUVREURS[id]` (`__proto__`, `constructor`). */
export const ouvreursDe = (cote: Cote): readonly Ouvreur[] => OUVREURS.filter((o) => o.cote === cote);
export const trouverOuvreur = (id: unknown, cote: Cote): Ouvreur | null => (typeof id === 'string' ? ouvreursDe(cote).find((o) => o.id === id) ?? null : null);

// ── Ce qui n'est PAS livré en 3b-1, avec la raison ───────────────────────────────────────────────────────────────────────────────────

/**
 * Ouvreurs des vagues 3 à 5 : pas en 3b-1 (ni leurs paramètres). Chacun exige de toucher une fenêtre à état interne (prop `init`) ou la journée du
 * salarié (components/poseur-day.tsx), que le redesign du bureau (tâche n°70) remanie ; ne pas les démarrer pendant cette intégration (§0.2).
 */
export const OUVREURS_REPORTES: readonly { id: string; cote: Cote; vague: 1 | 3 | 4 | 5; raison: string }[] = [
  { id: 'salarie.fiche#periode', cote: 'bureau', vague: 3, raison: 'La période de la feuille d’heures est un état interne de WorkerDetail (worker-detail.tsx) : prop `init`.' },
  { id: 'couts.chantiers', cote: 'bureau', vague: 3, raison: 'Période et chantier déplié sont des états internes de CostReport : prop `init`.' },
  { id: 'reglages.entreprise', cote: 'bureau', vague: 3, raison: 'La rubrique est un accordéon interne de CompanySettings : prop `init`.' },
  { id: 'planning.imprimer', cote: 'bureau', vague: 3, raison: 'Les options d’impression sont l’état interne de PrintMenu : prop `init`.' },
  { id: 'email.groupe', cote: 'bureau', vague: 3, raison: 'Destinataires et texte sont l’état interne de StaffEmailDialog : prop `init` ; l’envoi est du niveau 3.' },
  { id: 'invitations.liste', cote: 'bureau', vague: 3, raison: 'La ligne repliée est un état interne de pending-invitations.tsx.' },
  { id: 'chantier.termine', cote: 'bureau', vague: 3, raison: 'Le mode (terminer, rouvrir, bilan) est l’état interne de ChantierTermine.' },
  { id: 'planning.intervention', cote: 'bureau', vague: 3, raison: 'Retrouver l’identifiant de l’intervention puis ouvrir la fenêtre de modification : résolution à part.' },
  { id: 'planning.copier', cote: 'bureau', vague: 3, raison: 'Dépend de la résolution de planning.intervention (identifiant de la case du planning).' },
  { id: 'heures.attribuer', cote: 'bureau', vague: 3, raison: 'Dépend de la résolution d’une ligne d’heures hors planning.' },
  { id: 'historique.supprimees', cote: 'salarie', vague: 1, raison: 'L’ouverture de « Mes interventions supprimées » (tracesOpen) est un état INTERNE de PoseurHistory (poseur-history.tsx:46) : il faudrait toucher une fenêtre à état interne, donc vague 3.' },
  { id: 'semaine.ouvrir', cote: 'salarie', vague: 3, raison: 'Le lundi affiché est l’état interne de PoseurWeek (poseur-week.tsx) : prop `init`.' },
  { id: 'mois.ouvrir', cote: 'salarie', vague: 3, raison: 'Le mois affiché est l’état interne de PoseurMonth : prop `init`.' },
  { id: 'conges.demande', cote: 'salarie', vague: 3, raison: 'Type, dates et note sont l’état interne de LeaveRequestDialog : prop `init`.' },
  { id: 'reserves.liste', cote: 'salarie', vague: 3, raison: 'La liste repliée est un état interne de worker-reserves.tsx.' },
  { id: 'jour.ouvrir', cote: 'salarie', vague: 3, raison: 'Alias de « journee » ; l’ouvreur propre arrive avec les autres écrans de la journée.' },
  { id: 'historique.ouvrir', cote: 'salarie', vague: 3, raison: 'Alias de « historique » ; l’ouvreur propre arrive avec historique.supprimees.' },
  { id: 'infos.ouvrir', cote: 'salarie', vague: 3, raison: 'Alias de « infos » (sans paramètre) ; hors vagues 1 et 2.' },
  { id: 'scanner.ouvrir', cote: 'salarie', vague: 3, raison: 'Geste d’appareil (caméra) : un bouton seulement ; hors vagues 1 et 2.' },
  { id: 'photo.profil', cote: 'salarie', vague: 3, raison: 'Geste d’appareil (sélecteur de photo) : un bouton seulement ; hors vagues 1 et 2.' },
  { id: 'jour.ligne_nouvelle', cote: 'salarie', vague: 4, raison: 'Journée du salarié (poseur-day.tsx) : états fStart/fEnd/fWorksiteId, sur le modèle afterScanPending.' },
  { id: 'jour.ligne', cote: 'salarie', vague: 4, raison: 'Journée du salarié (poseur-day.tsx) : fiche d’une ligne existante, états internes de la journée (vague 4).' },
  { id: 'jour.documents', cote: 'salarie', vague: 4, raison: 'Journée du salarié (poseur-day.tsx) : documents du chantier, état docsWs de la journée (vague 4).' },
  { id: 'jour.dupliquer', cote: 'salarie', vague: 4, raison: 'Journée du salarié (poseur-day.tsx) : « Dupliquer cette journée », états repeatOpen et copyDates (vague 4).' },
  { id: 'jour.envoyer', cote: 'salarie', vague: 4, raison: 'Journée du salarié (poseur-day.tsx) ; niveau 3 : envoyer la journée, sur le modèle de a=envoyer (vague 4).' },
  { id: 'equipe.jour', cote: 'salarie', vague: 4, raison: 'Journée du salarié (poseur-day.tsx) : « Mon équipe » du chef d’équipe, composant TeamDay (vague 4).' },
];

/**
 * Les actions de lien d'AVANT 3b (NAV_ACTIONS, WORKER_NAV, `AdminScreen`, `TourScreen`) dont l'ouvreur n'est pas livré : elles continuent de marcher par
 * le code existant (onNavigate de la page), tel quel. T1 exige que CHAQUE action de lien soit l'alias d'un ouvreur livré OU une entrée d'ici.
 */
export const ALIAS_SANS_OUVREUR: readonly { cote: Cote; alias: string; cible: string; raison: string }[] = [
  { cote: 'bureau', alias: 'couts', cible: 'couts.chantiers', raison: 'Ouvreur de la vague 3 (période et chantier déplié : prop `init`) ; le lien ouvre déjà « Coût chantiers » par le code existant.' },
  { cote: 'bureau', alias: 'reglages', cible: 'reglages.entreprise', raison: 'Ouvreur de la vague 3 (rubrique : prop `init`) ; le lien ouvre déjà les réglages par le code existant.' },
  { cote: 'bureau', alias: 'menu', cible: '—', raison: 'Menu ☰ : navigation du guide pas à pas, aucun intérêt hors guide (04 §1.2) ; jamais proposé au modèle.' },
  { cote: 'bureau', alias: 'compte', cible: '—', raison: 'Menu du compte : navigation du guide pas à pas, jamais proposé au modèle (04 §1.2).' },
  { cote: 'salarie', alias: 'journee', cible: 'jour.ouvrir', raison: 'Ouvreur de la journée du salarié (vague 4) ; le lien « Ma journée » marche par le code existant.' },
  { cote: 'salarie', alias: 'semaine', cible: 'semaine.ouvrir', raison: 'Ouvreur de la vague 3 (lundi : prop `init`) ; le lien « Ma semaine » marche par le code existant.' },
  { cote: 'salarie', alias: 'mois', cible: 'mois.ouvrir', raison: 'Ouvreur de la vague 3 (mois : prop `init`) ; le lien « Mon mois » marche par le code existant.' },
  { cote: 'salarie', alias: 'historique', cible: 'historique.ouvrir', raison: 'Ouvreur de la vague 3 ; le lien « Historique » marche par le code existant.' },
  { cote: 'salarie', alias: 'conges', cible: 'conges.demande', raison: 'Ouvreur de la vague 3 (type, dates, note : prop `init`) ; le lien « Mes congés » marche par le code existant.' },
  { cote: 'salarie', alias: 'infos', cible: 'infos.ouvrir', raison: 'Ouvreur hors vagues 1 et 2 ; le lien « Informations » marche par le code existant.' },
  { cote: 'salarie', alias: 'borne', cible: 'scanner.ouvrir', raison: 'Geste d’appareil (caméra) : le toucher de la personne est le geste ; le lien « Scanner la borne » marche par le code existant.' },
  { cote: 'salarie', alias: 'photo', cible: 'photo.profil', raison: 'Geste d’appareil (sélecteur de photo) ; le lien « Changer ma photo » marche par le code existant.' },
  { cote: 'salarie', alias: 'notifications', cible: '—', raison: 'Geste d’appareil (permission de notifications) : une ACTION, pas une navigation (04 §1.4 point 7) ; réservé à l’humain, hors des ouvreurs.' },
  { cote: 'salarie', alias: 'menu', cible: '—', raison: 'Menu du compte : navigation du guide pas à pas, jamais proposé au modèle (04 §1.3).' },
];
