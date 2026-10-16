// BEMEXO · données d'exemple · écran salarié. Noms neutres, valeurs fictives.
// Un jeu par écran du dossier (E01…E28, P01…P03).

export type EtatLigne = 'a-envoyer' | 'envoye' | 'chez-le-comptable' | 'retire' | 'sur-le-telephone' | 'prevu' | 'en-cours' | 'sortie-oubliee';
export type EtatJour = 'aujourdhui' | 'envoye' | 'a-envoyer' | 'a-venir' | 'absence' | 'vide' | 'cloture' | 'renvoye';
// 6 valeurs = 6 dessins (planche « Bouton d'envoi »). 'envoi-en-cours' manquait au type.
export type EtatEnvoi = 'hors-ligne' | 'envoyer-ce-qui-reste' | 'pret' | 'envoi-en-cours' | 'envoyee' | 'rien-a-envoyer';
// Le cas « mois clôturé » n'est pas une 7e valeur : 'rien-a-envoyer' + aide = 'verrouille'.
export type AideEnvoi = 'defaut' | 'hors-ligne' | 'transfert' | 'pointage-ne-part-pas' | 'recue' | 'rien' | 'verrouille' | 'ne-ferme-pas';
export type Creneau = 'matin' | 'apres-midi' | 'soir' | null;

export interface Ligne {
  id: string; chantier: string; ville: string; debut: string | null; fin: string | null;
  pauseMin: number; etat: EtatLigne; documents?: number; termineLe?: string;
  correction?: { par: 'bureau' | 'chef'; avant: string; apres: string; motif?: string };
  endroitNote?: boolean; erreur?: string;
}
export interface Tache { id: string; texte: string; moment?: 'matin' | 'apres-midi' | 'soir'; heure?: string; fait: boolean }
// Tuiles : toutes les valeurs affichées, en minutes (formatées h:mm à l'affichage).
export interface Tuiles { totalMin: number; chantiers: number; pausesMin: number; pausesAPreciser: number; routeMin: number; panier: boolean | null; verrouille: boolean }
// Barres de la carte Total et de la Semaine : heures par jour (null = rien), état = celui de la bande
export const semaineHeures: { jour: string; heures: number | null; etat: EtatJour }[] = [
  { jour: 'L', heures: 7.5, etat: 'envoye' }, { jour: 'M', heures: 8, etat: 'a-envoyer' }, { jour: 'M', heures: 8.5, etat: 'envoye' },
  { jour: 'J', heures: 6.7, etat: 'aujourdhui' }, { jour: 'V', heures: null, etat: 'absence' }, { jour: 'S', heures: 7.5, etat: 'a-venir' }, { jour: 'D', heures: null, etat: 'vide' },
];
export interface Jour { jour: string; numero: number; etat: EtatJour; absence?: 'C' | 'M' | 'I' | 'R' }

export const semaine: Jour[] = [
  { jour: 'L', numero: 12, etat: 'envoye' }, { jour: 'M', numero: 13, etat: 'a-envoyer' },
  { jour: 'M', numero: 14, etat: 'envoye' }, { jour: 'J', numero: 15, etat: 'aujourdhui' },
  { jour: 'V', numero: 16, etat: 'absence', absence: 'C' }, { jour: 'S', numero: 17, etat: 'a-venir' },
  { jour: 'D', numero: 18, etat: 'vide' },
];

export const salarie = { prenom: 'Sam', nom: 'Exemple', initiales: 'SG', role: 'poseur' as const, entreprise: 'Entreprise Test' };

export const enCours = { // E05
  pointage: { chantier: 'Villa Exemple', ville: 'Lyon', debut: '12:30', ecoule: '2:42' },
  tuiles: { totalMin: 402, chantiers: 2, pausesMin: 0, pausesAPreciser: 1, routeMin: 0, panier: false, verrouille: false } as Tuiles,
  prevuNonConfirme: '1:45',
  rappels: { journeesAEnvoyer: [{ date: '2026-10-13' }], reservesALever: 1, formationsAVoir: 2 },
  lignes: [
    { id: 'l1', chantier: 'Maison Démo', ville: 'Bron', debut: '07:30', fin: '11:30', pauseMin: 0, etat: 'a-envoyer' },
    { id: 'l2', chantier: 'Villa Exemple', ville: 'Lyon', debut: '12:30', fin: null, pauseMin: 0, etat: 'en-cours', documents: 2 },
  ] as Ligne[],
  trous: [{ apresLigne: 'l1', debut: '11:30', fin: '12:30', reponse: null as null | 'route' | 'pause' }],
  reunions: [{ titre: 'Réunion sécurité', lieu: 'Dépôt', heure: '17:15', equipe: true }],
  lignesPrevues: [
    { id: 'p1', chantier: 'Résidence Test', ville: 'Villeurbanne', debut: '16:30', fin: null, pauseMin: 0, etat: 'prevu', erreur: 'Ne partira pas : chevauche Villa Exemple et n\'a pas de fin.' },
    { id: 'p2', chantier: 'Atelier Fictif', ville: 'Vénissieux', debut: null, fin: null, pauseMin: 0, etat: 'prevu', termineLe: '2026-10-15' },
  ] as Ligne[], // E05b
  taches: [{ id: 'tk1', texte: 'Ranger le dépôt', moment: 'matin', fait: true }, { id: 'tk2', texte: 'Photos avant pose', fait: false }, { id: 'tk3', texte: 'Rendre la clé', heure: '17:00', fait: false }] as Tache[],
  frise: { de: '07:30', a: '17:00', maintenant: '15:12', segments: [['07:30', '11:30', 'a-envoyer'], ['11:30', '12:30', 'trou'], ['12:30', '15:12', 'en-cours'], ['15:12', '17:00', 'prevu']] },
};

export const nomLong = 'Résidence Les Jardins de la Doua – Bâtiment C lot 14'; // 52 caractères (E29)

// Tuiles par écran (mêmes valeurs que la planche)
export const tuilesParEcran: Record<string, Tuiles> = {
  E03: { totalMin: 0, chantiers: 0, pausesMin: 0, pausesAPreciser: 0, routeMin: 0, panier: true, verrouille: false },
  E04: { totalMin: 0, chantiers: 0, pausesMin: 0, pausesAPreciser: 0, routeMin: 0, panier: false, verrouille: false },
  E06: { totalMin: 390, chantiers: 2, pausesMin: 0, pausesAPreciser: 0, routeMin: 0, panier: true, verrouille: false },
  E12: { totalMin: 450, chantiers: 2, pausesMin: 0, pausesAPreciser: 0, routeMin: 30, panier: true, verrouille: false },
  E14: { totalMin: 480, chantiers: 1, pausesMin: 0, pausesAPreciser: 1, routeMin: 0, panier: true, verrouille: false },
  E16: { totalMin: 450, chantiers: 2, pausesMin: 0, pausesAPreciser: 0, routeMin: 0, panier: true, verrouille: true },
};

export const horsLigne = { enAttente: 2, lignes: [
  { id: 'h1', chantier: 'Maison Démo', ville: 'Bron', debut: '07:30', fin: '11:30', pauseMin: 0, etat: 'sur-le-telephone' },
  { id: 'h2', chantier: 'Villa Exemple', ville: 'Lyon', debut: '12:30', fin: '15:00', pauseMin: 0, etat: 'sur-le-telephone' },
] as Ligne[] };

export const envoyee: Ligne[] = [ // E12
  { id: 'e1', chantier: 'Maison Démo', ville: 'Bron', debut: '07:30', fin: '11:30', pauseMin: 0, etat: 'envoye' },
  { id: 'e2', chantier: 'Villa Exemple', ville: 'Lyon', debut: '12:00', fin: '15:30', pauseMin: 0, etat: 'envoye', endroitNote: true },
  { id: 'e3', chantier: 'Résidence Test', ville: 'Villeurbanne', debut: '16:00', fin: '16:30', pauseMin: 0, etat: 'retire' },
];

export const corrigee: Ligne[] = [ // E15
  { id: 'c1', chantier: 'Maison Démo', ville: 'Bron', debut: '08:00', fin: '12:30', pauseMin: 0, etat: 'envoye', correction: { par: 'bureau', avant: '08:00–12:00', apres: '08:00–12:30', motif: 'Oubli du quart d\'heure de rangement' } },
  { id: 'c2', chantier: 'Villa Exemple', ville: 'Lyon', debut: '13:30', fin: '17:30', pauseMin: 0, etat: 'envoye', correction: { par: 'chef', avant: '13:30–17:00', apres: '13:30–17:30' } },
];

export const renvoyee = { date: '2026-10-13', motif: 'Il manque la pause de midi chez Maison Démo.', lignes: [
  { id: 'r1', chantier: 'Maison Démo', ville: 'Bron', debut: '08:00', fin: '16:00', pauseMin: 0, etat: 'a-envoyer' },
] as Ligne[] };

export const verrouillee = { cloture: 'mois' as 'mois' | 'heures', jusquAu: '2026-10-31', lignes: [
  { id: 'v1', chantier: 'Maison Démo', ville: 'Bron', debut: '07:30', fin: '11:30', pauseMin: 0, etat: 'chez-le-comptable' },
  { id: 'v2', chantier: 'Villa Exemple', ville: 'Lyon', debut: '12:00', fin: '15:30', pauseMin: 0, etat: 'chez-le-comptable' },
] as Ligne[] };

export const pointageOublie = { chantier: 'Villa Exemple', debut: 'lundi 08:00', saisieFin: '06:30', finLendemain: true };

export const sortiesOubliees: Ligne[] = [ // E18
  { id: 's1', chantier: 'Villa Exemple', ville: 'Lyon', debut: '08:00', fin: null, pauseMin: 0, etat: 'sortie-oubliee' },
  { id: 's2', chantier: 'Maison Démo', ville: 'Bron', debut: '08:00', fin: '12:00', pauseMin: 0, etat: 'sortie-oubliee' },
];

export const transfertEchec = { date: '14/10', nombre: 2, raisons: ['Refusé par le serveur : jour clôturé', '5 essais sans réussite'] };

export const etatsEnvoi: Record<EtatEnvoi, { libelle: string; actif: boolean; aide: string }> = {
  'hors-ligne': { libelle: 'Envoyer ma journée →', actif: false, aide: 'HORS-LIGNE · L\'ENVOI ATTEND LE RÉSEAU' },
  'envoyer-ce-qui-reste': { libelle: 'Envoyer ce qui reste (2)', actif: true, aide: 'TRANSFÈRE LES SAISIES DU TÉLÉPHONE, PUIS ENVOIE' },
  pret: { libelle: 'Envoyer ma journée →', actif: true, aide: 'LE POINTAGE EN COURS NE PART PAS' },
  'envoi-en-cours': { libelle: 'Envoi…', actif: false, aide: 'NE FERME PAS L\'APPLICATION' },
  envoyee: { libelle: 'Journée envoyée ✓', actif: false, aide: 'REÇUE PAR LE BUREAU' },
  'rien-a-envoyer': { libelle: 'Envoyer ma journée →', actif: false, aide: 'RIEN À ENVOYER' },
};
export const aideVerrouille = 'MOIS CLÔTURÉ · DEMANDE À LA SECRÉTAIRE DE ROUVRIR'; // E16

export const chefEquipe = { jours: ['2026-10-09', '2026-10-14', '2026-10-15'], coequipiers: ['Alex', 'Bruno', 'Chloé'], selection: 'Alex', lignes: [
  { id: 't1', chantier: 'Villa Exemple', ville: 'Lyon', debut: '08:00', fin: '12:00', pauseMin: 0, etat: 'envoye' },
  { id: 't2', chantier: 'Maison Démo', ville: 'Bron', debut: '13:30', fin: '17:00', pauseMin: 0, etat: 'a-envoyer' },
  { id: 't3', chantier: 'Résidence Test', ville: 'Villeurbanne', debut: '17:00', fin: '18:00', pauseMin: 0, etat: 'chez-le-comptable' },
] as Ligne[] };

// Retrait : 3 textes selon le cas (E30a/b/c), fragments du code à reprendre en entier
export type CasRetrait = 'envoyee' | 'brouillon-vide' | 'autre';
// Ordre des contrôles d'envoi (handleSubmitDay) — chacun peut ne pas se produire
export const controlesEnvoi = ['sortie-oubliee', 'chevauchement', 'horaires-prevus', 'pause', 'journee-vide', 'plus-de-10h', 'envoi'] as const;

export const pointer = {
  arrivee: { heure: '07:45', prenom: 'Sam', chantier: 'Villa Exemple · Lyon' },
  depart: { heure: '16:30', prenom: 'Sam', debut: '07:45', fin: '16:30' },
  refus: { raison: 'QR expiré', ticketConnu: true },
};
