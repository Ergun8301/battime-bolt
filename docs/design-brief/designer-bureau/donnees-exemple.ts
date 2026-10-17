// BEMEXO · données d'exemple · écran bureau (/admin). Noms neutres, valeurs fictives.
// Mêmes valeurs que la planche (semaine S-42, 12 – 18 octobre 2026, aujourd'hui = jeudi 15).

export type Creneau = 'matin' | 'apres-midi' | 'soir' | null;            // null = journée entière ou sans horaire
export type EtatHeures = 'prevue' | 'a-envoyer' | 'envoyee' | 'en-cours';
export type Reception = 'sans-reserve' | 'reserve-a-traiter' | 'reserve-levee' | 'chantier-en-cours';
export type Absence = 'conge' | 'arret-maladie' | 'intemperie' | 'repos';
export type Role = 'salarie' | 'chef' | 'bureau';

export interface Client { id: string; nom: string; produit: string; ville: string; couleur: 0|1|2|3|4|5|6 | null; termineLe?: string; budgetHeures?: number; budgetMontant?: number }
export interface Intervention {
  id: string; salarieId: string; jour: string; clientId: string; noteAutre?: string;
  debutPrevu?: string; finPrevue?: string; creneau: Creneau; etat: EtatHeures;
  debut?: string; fin?: string; dureeMin?: number; enCoursDepuis?: string;
  retireeParSalarie?: boolean; ajouteeParSalarie?: boolean; reception?: Reception; documents?: number; notePoseur?: string;
  sansHeuresEnvoyees?: boolean; // jour passé, compte dans « à relancer »
}
export interface Salarie { id: string; prenom: string; nom: string; initiales: string; role: Role; joursEnAttente: number; envoyeesMin: number; prevuesMin: number; clotureAu?: string }

export const semaine = { code: 'S-42', du: '2026-10-12', au: '2026-10-18', aujourdhui: '2026-10-15', courante: true };
export const totalJours = ['31:45', '30:00', '38:30', '4:00', null, null, null]; // en-têtes de jour (NOUVEAU)

export const clients: Client[] = [
  { id: 'AU', nom: 'Autre', produit: 'Chantier non listé', ville: '', couleur: null },
  { id: 'VE', nom: 'Villa Exemple', produit: 'Menuiseries', ville: 'Lyon', couleur: 0, budgetHeures: 120, budgetMontant: 4200 },
  { id: 'MD', nom: 'Maison Démo', produit: 'Volets roulants', ville: 'Bron', couleur: 1 },
  { id: 'RT', nom: 'Résidence Test', produit: 'Portes de garage', ville: 'Villeurbanne', couleur: 2 },
  { id: 'AF', nom: 'Atelier Fictif', produit: 'Stores', ville: 'Vénissieux', couleur: 3 },
  { id: 'GD', nom: 'Garage Démo', produit: 'Portail', ville: 'Caluire', couleur: 4, termineLe: '2026-10-02' },
  { id: 'IM', nom: 'Immeuble Modèle', produit: 'Fenêtres PVC', ville: 'Lyon 3e', couleur: 5 },
  { id: 'BT', nom: 'Bureaux Témoin', produit: 'Pergola', ville: 'Écully', couleur: 6 },
];

export const salaries: Salarie[] = [
  { id: 's1', prenom: 'Alex', nom: 'Test', initiales: 'AT', role: 'salarie', joursEnAttente: 0, envoyeesMin: 1695, prevuesMin: 420 },
  { id: 's2', prenom: 'Bruno', nom: 'Exemple', initiales: 'BE', role: 'salarie', joursEnAttente: 2, envoyeesMin: 480, prevuesMin: 1020 },
  { id: 's3', prenom: 'Camille', nom: 'Démo', initiales: 'CD', role: 'chef', joursEnAttente: 0, envoyeesMin: 1650, prevuesMin: 480 },
  { id: 's4', prenom: 'Dina', nom: 'Fictive', initiales: 'DF', role: 'salarie', joursEnAttente: 0, envoyeesMin: 0, prevuesMin: 0 },
  { id: 's5', prenom: 'Eli', nom: 'Martin-Lefebvre-Dubois de la Roche-Valmont', initiales: 'EM', role: 'salarie', joursEnAttente: 1, envoyeesMin: 960, prevuesMin: 120 },
  { id: 's6', prenom: 'Fanny', nom: 'Essai', initiales: 'FE', role: 'salarie', joursEnAttente: 2, envoyeesMin: 480, prevuesMin: 240 },
  { id: 's7', prenom: 'Gabriel', nom: 'Témoin', initiales: 'GT', role: 'salarie', joursEnAttente: 0, envoyeesMin: 960, prevuesMin: 960, clotureAu: '2026-09-30' },
  { id: 's8', prenom: 'Hugo', nom: 'Modèle', initiales: 'HM', role: 'salarie', joursEnAttente: 0, envoyeesMin: 0, prevuesMin: 960 },
];

export const absences: { salarieId: string; type: Absence; du: string; au: string }[] = [
  { salarieId: 's4', type: 'arret-maladie', du: '2026-10-12', au: '2026-10-16' },  // imprimé « Absent », borne « Absent »
  { salarieId: 's5', type: 'conge', du: '2026-10-16', au: '2026-10-23' },
  { salarieId: 's6', type: 'intemperie', du: '2026-10-16', au: '2026-10-16' },
  { salarieId: 's7', type: 'repos', du: '2026-10-14', au: '2026-10-14' },
];

export const interventions: Intervention[] = [
  { id: 'i1', salarieId: 's1', jour: '2026-10-12', clientId: 'VE', creneau: 'matin', etat: 'envoyee', debut: '07:30', fin: '11:45', dureeMin: 255 },
  { id: 'i2', salarieId: 's1', jour: '2026-10-12', clientId: 'MD', creneau: 'apres-midi', etat: 'envoyee', debut: '13:00', fin: '17:00', dureeMin: 240, documents: 2 },
  { id: 'i3', salarieId: 's1', jour: '2026-10-13', clientId: 'VE', creneau: null, etat: 'envoyee', debut: '07:30', fin: '16:30', dureeMin: 480, reception: 'reserve-a-traiter' },
  { id: 'i4', salarieId: 's1', jour: '2026-10-15', clientId: 'VE', debutPrevu: '08:00', finPrevue: '12:00', creneau: 'matin', etat: 'en-cours', enCoursDepuis: '07:45', documents: 3 },
  { id: 'i5', salarieId: 's1', jour: '2026-10-15', clientId: 'RT', debutPrevu: '13:30', finPrevue: '17:00', creneau: 'apres-midi', etat: 'prevue' },
  { id: 'i6', salarieId: 's2', jour: '2026-10-12', clientId: 'RT', creneau: null, etat: 'prevue', sansHeuresEnvoyees: true },
  { id: 'i7', salarieId: 's2', jour: '2026-10-15', clientId: 'AF', creneau: 'matin', etat: 'a-envoyer', debut: '07:30', fin: '11:30', dureeMin: 240 },
  { id: 'i8', salarieId: 's3', jour: '2026-10-14', clientId: 'BT', creneau: 'apres-midi', etat: 'envoyee', debut: '14:00', fin: '19:00', dureeMin: 300, ajouteeParSalarie: true },
  { id: 'i9', salarieId: 's5', jour: '2026-10-12', clientId: 'RT', creneau: 'apres-midi', etat: 'envoyee', debut: '14:00', fin: '16:00', dureeMin: 120, retireeParSalarie: true },
  { id: 'i10', salarieId: 's5', jour: '2026-10-15', clientId: 'GD', debutPrevu: '18:00', finPrevue: '20:00', creneau: 'soir', etat: 'prevue' },
  { id: 'i11', salarieId: 's6', jour: '2026-10-14', clientId: 'AU', noteAutre: 'Dépannage M. Voisin', creneau: 'matin', etat: 'a-envoyer', debut: '08:00', fin: '12:00', dureeMin: 240 },
  { id: 'i12', salarieId: 's7', jour: '2026-10-12', clientId: 'GD', creneau: null, etat: 'envoyee', debut: '07:30', fin: '16:00', dureeMin: 480, reception: 'reserve-levee' },
];
export const horsPlanning = [{ salarieId: 's7', jour: '2026-10-13', clientId: 'MD', dureeMin: 90, statut: 'ajoute-par-le-salarie' as const }];
export const reunions = [{ id: 'r1', titre: 'Réunion sécurité', jour: '2026-10-15', heure: '17:15', fin: '17:45', lieu: 'Dépôt', participants: ['s1', 's3', 's7', 's8'], notification: true }];
export const taches = [{ id: 't1', salarieId: 's3', jour: '2026-10-15', texte: 'Ranger le dépôt', moment: 'matin', fait: '09:12' }, { id: 't2', salarieId: 's3', jour: '2026-10-15', texte: 'Photos avant pose', fait: false }, { id: 't3', salarieId: 's3', jour: '2026-10-15', texte: 'Rendre la clé', heure: '17:00', fait: null }];

export const bandeau = { envoyeesMin: 8535, prevuesMin: 3660, aRelancer: 5, aRelancerDetail: [{ salarieId: 's2', jours: ['2026-10-12', '2026-10-13'] }, { salarieId: 's6', jours: ['2026-10-12', '2026-10-14'] }, { salarieId: 's5', jours: ['2026-10-13'] }],
  enDirect: [{ salarieId: 's1', clientId: 'VE', depuis: '07:45' }], absentsAujourdhui: 1, pieces: 14, barres: [31.75, 30, 38.5, 4, 0, 0, 0] };
export const compteurs = { congesEnAttente: 1, invitationsNonActivees: 2, reservesATraiter: 2, essaiJoursRestants: 12 }; // badge « Salariés » = congés + invitations = 3
export const moisClotures = ['2026-09'];                    // PL04, PL28 : repère « CLOS »
export const exportAlerte = { lignes: 42, salaries: 7, dejaVerrouillees: 6, apresChangement: 44 };
export const comptable = { nom: 'Cabinet Exemple', email: 'compta@cabinet-exemple.fr', dejaEnvoye: { le: '2026-10-14', a: '09:14' } };
export const borne = { tablette: 'Tablette du dépôt', relieeLe: '2026-10-02', vueA: '14:10', codeSecours: '482913', ouverture: ['06:00', '20:00'], qrFixe: false };
export const forfaits = [{ nom: 'Équipe', min: 1, max: 5, prixHT: 29 }, { nom: 'Entreprise', min: 6, max: 15, prixHT: 59 }, { nom: 'Groupe', min: 16, max: 40, prixHT: 109 }];
