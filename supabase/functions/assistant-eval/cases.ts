// Lot 7 — JEU D'ÉVALUATION de l'Assistant BEMEXO : 50 phrases réelles (bureau
// et salarié, BTP et restauration, fautes et langage oral compris), chacune avec
// le résultat attendu. « Correct » = la bonne action, les bons champs, prête à
// être faite DU PREMIER COUP (ou la bonne réponse / le bon écran).
// Entreprise fictive, date figée : jeudi 1er octobre 2026.
//
// Phrases libres du SALARIÉ (sl01… français, st01… turc) : UNE fiche à confirmer pour plusieurs
// actions (heures avec tous les créneaux et la pause, nouveau chantier, panier, réserve, congé,
// envoi). Les 80 cas b01–b47 et s01–s33 ne bougent pas.
//
// Suites de conversation (sc01… : 7 bureau, 3 salarié en français, 2 salarié en turc) : la phrase est une RELANCE
// (« Et Kevin aussi », « Pareil mais lundi », « Non, retire ça ») et le cas porte `history`, les messages d'avant,
// que le banc passe au MÊME constructeur de consigne que la vraie fonction (étape 2, _shared/assistant-history.ts).
// Les relances turques restent « courtes » au sens de saisie-profil.ts (un seul indice de turc) : sc11 et sc12 passent donc
// par la consigne du profil court, comme tool-domains.test.ts l'exige de tout cas dont l'id n'est pas sl/st.
// Deux phrases LONGUES portent aussi `history` (sl17 français à « demi-heure de pause », st14 turc « Yarın da aynısı ») : le profil long,
// lui aussi, voit la conversation. sc13 et sc14 sont la RÉPONSE à une question de l'assistant que l'écran recolle à la demande d'origine
// (« Mets Karim demain, Villa Dupont ») ; sc15 est une plage horaire nue, sans « pareil » (« Et l'après-midi de 13h à 16h30 »).
//
// Livraison 3a de l'étape 3 (docs/ia-etape3/00-conception-etape3.md §2.5) : 34 cas AJOUTÉS EN FIN DE JEU : be01–be19 (bureau), se01–se06 (salarié),
// ov01–ov05 (OUVRIR un écran, bureau et salarié) et st15–st18 (turc, profil long : un id st, tool-domains.test.ts l'exige). Pas de b48 ni de s34 : saisie-profil.test.ts
// et worker-turn.test.ts reconnaissent « les 80 phrases d'origine » à leur id b/s et exigent qu'elles restent 80. Les 126 d'avant ne bougent pas, ni leur ordre. Aucun comportement de production ne change : ces cas MESURENT l'assistant tel qu'il est, pour que 3b (ouvrir un
// écran), 3c (lire) et 3d (écrire) aient un « avant » chiffré. Ils couvrent : les 5 outils du bureau qui n'avaient AUCUN cas ; le côté mince des paires
// d'outils « proches » du registre ; l'OUVERTURE d'un écran (« ouvre la fiche de Karim »), qui aujourd'hui répond par un LIEN ou un guide, jamais par
// une écriture ; les « Réserves » du salarié ; du turc côté salarié.

import type { MessageHistorique } from '../_shared/assistant-history.ts';

export const TODAY = '2026-10-01';
export const ME = 'u-ergun';

/** Facture de plombier ACQUITTÉE (PDF, texte) et devis (PDF), PNG vide. */
export const FILES = {
  facture: { mime: 'application/pdf', base64: 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAyNTkgPj4Kc3RyZWFtCkJUIC9GMSAxNCBUZiA1MCA3ODAgVGQgMTggVEwgKFBMT01CRVJJRSBNQVJUSU4gU0FSTCkgVGogVCogKEZBQ1RVUkUgTi4gMjAyNi0xMTgpIFRqIFQqIChDbGllbnQgOiBQaWVycmUtUGF1bCBKYWNxdWVzLCBWaXJpYXQpIFRqIFQqIChSZW1wbGFjZW1lbnQgY2hhdWZmZS1lYXUgMjAwIEwpIFRqIFQqIChUb3RhbCBUVEMgOiAxIDI0MCwwMCBFVVIpIFRqIFQqIChBQ1FVSVRURUUgLSBQYXllZSBsZSAyOC8wOS8yMDI2IHBhciB2aXJlbWVudCkgVGogVCogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA1NTEgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo2MjEKJSVFT0YK' },
  devis: { mime: 'application/pdf', base64: 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAyNzEgPj4Kc3RyZWFtCkJUIC9GMSAxNCBUZiA1MCA3ODAgVGQgMTggVEwgKEJBVEktUkVOT1YpIFRqIFQqIChERVZJUyBOLiBELTA0MTIpIFRqIFQqIChDbGllbnQgOiBNYWlzb24gR2FybmllciwgMTIgcnVlIGRlcyBMaWxhcywgNjkzMDAgQ2FsdWlyZSkgVGogVCogKFJlbm92YXRpb24gc2FsbGUgZGUgYmFpbikgVGogVCogKFRvdGFsIEhUIDogMTggNDAwLDAwIEVVUikgVGogVCogKE1haW4gZCBvZXV2cmUgZXN0aW1lZSA6IDE2MCBoZXVyZXMpIFRqIFQqIChWYWxhYmxlIDMgbW9pcykgVGogVCogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA1NjMgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo2MzMKJSVFT0YK' },
  photo: { mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' },
  // Livraison 3a — deux BULLETINS DE PAIE FICTIFS (PDF d'une page, texte seul) : l'un d'un salarié qui existe (Karim, septembre), l'autre d'un
  // futur salarié (Lucas, août). Employeur, noms et montants sont inventés ; le « n° de sécurité sociale » est un gabarit impossible (mois « 99 »),
  // là pour vérifier qu'il n'entre JAMAIS dans un brouillon. Si Q7 (§8 du contrat) retire l'envoi du bulletin au modèle, les cas qui les utilisent changent.
  bulletin: { mime: 'application/pdf', base64: 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0MzMgPj4Kc3RyZWFtCkJUIC9GMSAxNCBUZiA1MCA3ODAgVGQgMTggVEwgKEJBVEktRVhFTVBMRSBTQVJMIC0gQlVMTEVUSU4gREUgUEFJRSkgVGogVCogKFBlcmlvZGUgOiBzZXB0ZW1icmUgMjAyNiAoZHUgMDEvMDkvMjAyNiBhdSAzMC8wOS8yMDI2KSkgVGogVCogKFNhbGFyaWUgOiBLYXJpbSBCRU5BTEkgLSBQb3NldXIpIFRqIFQqIChOLiBkZSBzZWN1cml0ZSBzb2NpYWxlIDogMSA5OSA5OSA5OSA5OTkgOTk5IDk5KSBUaiBUKiAoSGV1cmVzIHBheWVlcyA6IDE1MSw2NykgVGogVCogKFNhbGFpcmUgYnJ1dCA6IDIgMzEwLDQwIEVVUikgVGogVCogKENvdGlzYXRpb25zIHNhbGFyaWFsZXMgOiA1MDgsMjkgRVVSKSBUaiBUKiAoTmV0IGEgcGF5ZXIgYXZhbnQgaW1wb3QgOiAxIDgwMiwxMSBFVVIpIFRqIFQqIChDb3V0IHRvdGFsIGVtcGxveWV1ciA6IDMgMjgwLDE1IEVVUikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA3MjUgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo3OTUKJSVFT0YK' },
  bulletinNouveau: { mime: 'application/pdf', base64: 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0MjcgPj4Kc3RyZWFtCkJUIC9GMSAxNCBUZiA1MCA3ODAgVGQgMTggVEwgKEJBVEktRVhFTVBMRSBTQVJMIC0gQlVMTEVUSU4gREUgUEFJRSkgVGogVCogKFBlcmlvZGUgOiBhb3V0IDIwMjYgKGR1IDAxLzA4LzIwMjYgYXUgMzEvMDgvMjAyNikpIFRqIFQqIChTYWxhcmllIDogTHVjYXMgTU9SRUFVIC0gTWFjb24pIFRqIFQqIChOLiBkZSBzZWN1cml0ZSBzb2NpYWxlIDogMSA5OSA5OSA5OSA5OTkgOTk5IDk5KSBUaiBUKiAoSGV1cmVzIHBheWVlcyA6IDE1MSw2NykgVGogVCogKFNhbGFpcmUgYnJ1dCA6IDIgMTUwLDAwIEVVUikgVGogVCogKENvdGlzYXRpb25zIHNhbGFyaWFsZXMgOiA0NzMsMDAgRVVSKSBUaiBUKiAoTmV0IGEgcGF5ZXIgYXZhbnQgaW1wb3QgOiAxIDY3NywwMCBFVVIpIFRqIFQqIChDb3V0IHRvdGFsIGVtcGxveWV1ciA6IDMgMDUzLDI1IEVVUikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA3MTkgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo3ODkKJSVFT0YK' },
};

const C = 'co-eval';
const W = {
  dupont: 'w-dupont', martin: 'w-martin', macon: 'w-pex-macon', bourg: 'w-pex-bourg', ppj: 'w-ppj-viriat', autre: 'w-autre',
};
export const ADMIN_RAW = {
  companyId: C, today: TODAY,
  users: [
    { id: 'u-karim', company_id: C, first_name: 'Karim', last_name: 'Benali', role: 'worker', is_active: true },
    { id: 'u-sofiane', company_id: C, first_name: 'Sofiane', last_name: 'Merabet', role: 'lead', is_active: true },
    { id: 'u-kevin', company_id: C, first_name: 'Kevin', last_name: 'Roussel', role: 'worker', is_active: true },
    { id: ME, company_id: C, first_name: 'Ergun', last_name: 'Kilic', role: 'admin', is_active: true },
  ],
  worksites: [
    { id: W.dupont, company_id: C, client_name: 'Villa Dupont', city: 'Lyon' },
    { id: W.martin, company_id: C, client_name: 'Bureau Martin', city: 'Villeurbanne' },
    { id: W.macon, company_id: C, client_name: 'Pizzeria Exemple', city: 'Mâcon' },
    { id: W.bourg, company_id: C, client_name: 'Pizzeria Exemple', city: 'Bourg-en-Bresse' },
    { id: W.ppj, company_id: C, client_name: 'Pierre-Paul Jacques', city: 'Viriat' },
    { id: W.autre, company_id: C, client_name: 'Autre', city: '' },
  ],
  planning: [
    ...['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((d, i) => ({
      id: `p-karim-${i}`, user_id: 'u-karim', company_id: C, work_date: d, worksite_id: W.dupont, absence_type: null, notes: null, estimated_start: '08:00:00',
    })),
    { id: 'p-kevin-1', user_id: 'u-kevin', company_id: C, work_date: '2026-10-01', worksite_id: W.macon, absence_type: null, notes: null, estimated_start: null },
    // Lot 8 : l'intervention de test de Cowork, et un congé posé (à retirer).
    { id: 'p-kevin-lyon', user_id: 'u-kevin', company_id: C, work_date: '2026-10-01', worksite_id: W.autre, absence_type: null, notes: 'Intervention à Lyon', estimated_start: '14:00:00' },
    { id: 'p-sof-c1', user_id: 'u-sofiane', company_id: C, work_date: '2026-10-12', worksite_id: null, absence_type: 'conge', notes: null, estimated_start: null },
    { id: 'p-sof-c2', user_id: 'u-sofiane', company_id: C, work_date: '2026-10-13', worksite_id: null, absence_type: 'conge', notes: null, estimated_start: null },
  ],
  leaves: [{ id: 'l-kevin', user_id: 'u-kevin', company_id: C, type: 'conge', start_date: '2026-10-12', end_date: '2026-10-16' }],
  invitations: [{ company_id: C, email: 'marc.durand@gmail.com', first_name: 'Marc', last_name: 'Durand', phone: null }],
  reserves: [{ id: 'r-karim', company_id: C, user_id: 'u-karim', work_date: '2026-09-30', worksite_id: W.dupont, observation: 'Joint silicone à reprendre' }],
  closures: [],
  // Lot 8 : ce qui peut être retiré ou corrigé.
  documents: [
    { id: 'd-fact', company_id: C, worksite_id: W.ppj, label: 'Facture plomberie', file_name: 'facture.pdf', category: 'facture_payee', created_at: '2026-09-28T10:00:00Z' },
    { id: 'd-photo', company_id: C, worksite_id: W.dupont, label: null, file_name: 'photo-1.jpg', category: 'photo', created_at: '2026-09-30T08:00:00Z' },
    { id: 'd-devis', company_id: C, worksite_id: W.dupont, label: 'Devis cuisine', file_name: 'devis.pdf', category: 'devis', created_at: '2026-09-20T09:00:00Z' },
  ],
  expenses: [
    { id: 'x-placo', company_id: C, worksite_id: W.dupont, label: 'Placo', amount: 450, category: 'materiaux', spent_on: '2026-09-29' },
    { id: 'x-loc', company_id: C, worksite_id: W.dupont, label: 'Location nacelle', amount: 300, category: 'location', spent_on: '2026-09-25' },
  ],
  certifications: [{ id: 'c-caces', company_id: C, user_id: 'u-karim', type: 'caces', label: null, expiry_date: '2027-03-15' }],
};

export const WORKER_RAW = {
  userId: 'u-karim', companyId: C, today: TODAY,
  worksites: ADMIN_RAW.worksites,
  entries: [
    { user_id: 'u-karim', work_date: '2026-09-30', start_time: '07:30:00', end_time: '16:00:00', break_minutes: 60, status: 'submitted' },
  ],
  planning: [
    { user_id: 'u-karim', work_date: TODAY, estimated_start: '08:00:00', estimated_end: '12:00:00', absence_type: null, worksite_id: W.dupont },
  ],
};
export const WORKER_LIVE = {
  enCours: null as null | { chantier_id: string; chantier: string; depuis: string },
  lignes: [
    { id: 'e1', chantier: 'Villa Dupont', chantier_id: W.dupont, debut: '07:30', fin: '12:00', envoyee: false, panier: false, reserve: false, corrigee: false },
    { id: 'e2', chantier: 'Bureau Martin', chantier_id: W.martin, debut: '13:00', fin: '16:30', envoyee: false, panier: false, reserve: true, corrigee: false },
  ],
  hier: 1,
  // Lot 8 : SES demandes en attente, SES documents récents.
  conges: [{ id: 'lv1', type: 'conge', du: '2026-10-20', au: '2026-10-24' }],
  documents: [
    { id: 'dw1', nom: 'photo-2.jpg', chantier: 'Villa Dupont', date: '2026-10-01' },
    { id: 'dw2', nom: 'photo-1.jpg', chantier: 'Bureau Martin', date: '2026-09-29' },
  ],
};
export const LIVE_EN_COURS = { chantier_id: W.macon, chantier: 'Pizzeria Exemple', depuis: '2026-10-01T06:30:00Z' };
/**
 * Journée d'aujourd'hui VIDE : tout cas qui déclare des heures d'aujourd'hui est mesuré dessus, sinon la fiche porterait
 * légitimement l'erreur « Déjà noté aujourd'hui » (les lignes e1 et e2 de WORKER_LIVE).
 */
export const LIVE_VIDE = { ...WORKER_LIVE, lignes: [] as typeof WORKER_LIVE.lignes, hier: 1 };

// ── Résultat normalisé (quelle que soit la version) ─────────────────────────
export interface Outcome {
  kind: 'action' | 'answer' | 'draft' | 'collegues' | 'none' | 'multi' | 'chantier';
  type?: string;
  draft?: Record<string, unknown>;
  problems?: string[];
  answer?: string;
  links?: string[];
  qui?: string; date?: string;
  // ── fiche à plusieurs éléments (kind 'multi') ──
  items?: Outcome[]; ignores?: string[]; non_prepare?: string[]; incertain?: boolean; note?: string;
  // ── un élément de la fiche ──
  id?: string; depend?: string[]; cible?: { chantier_id: string | null; nouveau: boolean; nom: string };
  deja_notees?: { chantier: string; debut: string; fin: string }[]; avertissements?: string[];
  nouveau_chantier?: Record<string, unknown>; manque?: string[];
}
type Check = (o: Outcome) => string | null;

const act = (type: string, f: (d: Record<string, unknown>) => string | null = () => null): Check => (o) => {
  if (o.kind !== 'action') return `attendu l'action ${type}, obtenu ${o.kind}${o.answer ? ` (« ${o.answer.slice(0, 60)} »)` : ''}`;
  if (o.type !== type) return `attendu ${type}, obtenu ${o.type}`;
  if (o.problems?.length) return `pas prête : ${o.problems.join(' / ')}`;
  return f(o.draft ?? {});
};
/**
 * Comme `act`, mais l'action est rendue AVEC ces problèmes exacts : c'est la réponse voulue (par ex. « Choisissez
 * l’intervention. » quand rien n'est prévu ce jour-là), pas un échec. `act` reste inchangé pour tous les autres cas :
 * une action « pas prête » y reste un échec.
 */
const actAvecProblemes = (type: string, problems: string[], f: (d: Record<string, unknown>) => string | null = () => null): Check => (o) => {
  if (o.kind !== 'action') return `attendu l'action ${type}, obtenu ${o.kind}${o.answer ? ` (« ${o.answer.slice(0, 60)} »)` : ''}`;
  if (o.type !== type) return `attendu ${type}, obtenu ${o.type}`;
  if (JSON.stringify(o.problems ?? []) !== JSON.stringify(problems)) return `problèmes = ${JSON.stringify(o.problems ?? [])} (attendu ${JSON.stringify(problems)})`;
  return f(o.draft ?? {});
};
const eq = (d: Record<string, unknown>, k: string, v: unknown) => (JSON.stringify(d[k]) === JSON.stringify(v) ? null : `${k} = ${JSON.stringify(d[k])} (attendu ${JSON.stringify(v)})`);
const all = (...r: (string | null)[]) => r.find((x) => x) ?? null;
const has = (d: Record<string, unknown>, k: string, re: RegExp) => (re.test(String(d[k] ?? '')) ? null : `${k} = « ${d[k]} » (attendu ${re})`);
const clean = (d: Record<string, unknown>, k: string) => (/^(euh|alors|bon|du coup|c'est|pour)\b/i.test(String(d[k] ?? '').trim()) || /^[a-zà-ÿ]/.test(String(d[k] ?? '')) ? `${k} mal formé : « ${d[k]} »` : null);
const answer = (link?: string, mention?: RegExp): Check => (o) => {
  if (o.kind !== 'answer') return `attendu une réponse, obtenu ${o.kind} ${o.type ?? ''}`;
  if (!o.answer || o.answer.length < 10) return 'réponse vide';
  if (/je n.?ai pas acc[eè]s|je ne peux pas/i.test(o.answer)) return `refus : « ${o.answer.slice(0, 60)} »`;
  if (link && !(o.links ?? []).includes(link)) return `lien ${link} manquant (${(o.links ?? []).join(',')})`;
  // Suites de conversation : la réponse doit montrer que la référence (« ce chantier », « la supprimer ») a été comprise.
  if (mention && !mention.test(o.answer)) return `la réponse ne reprend pas ce qui précède (attendu ${mention}) : « ${o.answer.slice(0, 70)} »`;
  return null;
};
const draft = (f: (lines: Record<string, unknown>[], date: string) => string | null): Check => (o) => {
  if (o.kind !== 'draft') return `attendu des heures, obtenu ${o.kind} ${o.type ?? ''}`;
  const d = o.draft as { date: string; lines: Record<string, unknown>[]; errors: string[] };
  if (d.errors?.length) return `erreurs : ${d.errors.join(' / ')}`;
  if (d.lines.some((l) => !l.worksite_id)) return 'chantier non trouvé';
  return f(d.lines, d.date);
};
/** Lot 8 : l'effacement interdit est dit en une phrase. */
const refus = (): Check => (o) => (o.kind === 'answer' && /ne s.efface|impossible|pas possible/i.test(o.answer ?? '') ? null : `attendu un refus en une phrase, obtenu ${o.kind} ${o.type ?? ''} « ${(o.answer ?? '').slice(0, 60)} »`);
const coll = (qui: string, date: string): Check => (o) => (o.kind !== 'collegues' ? `attendu le planning des collègues, obtenu ${o.kind} ${o.type ?? ''}`
  : (o.qui ?? '').toLowerCase() !== qui ? `qui = « ${o.qui} » (attendu « ${qui} »)` : o.date !== date ? `date = ${o.date} (attendu ${date})` : null);


// ── Contrôles d'une fiche à plusieurs éléments (phrases libres du salarié) ──
const fold = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[’']/g, "'"); // « ı » n'est pas décomposé par NFD
const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
interface Ligne { key: string; start: string; end: string; pause: number; site: string | null; nouveau: boolean; planning: boolean; gap: 'pause' | null }
interface NC { nom?: string; adresse?: string; code_postal?: string; ville?: string; description?: string; reutilise_id?: string }
interface Heures { date: string; lignes: Ligne[]; erreurs: string[]; nouveau?: NC; manque: string[] }
/** Type d'un élément de fiche : 'heures' pour le brouillon d'heures, 'chantier' pour un chantier seul, sinon le type d'action. */
const typeDe = (i: Outcome) => (i.kind === 'draft' ? 'heures' : i.kind === 'action' ? String(i.type) : i.kind);
/** Une fiche donne ses éléments ; toute autre réponse est un élément seul. */
const elements = (o: Outcome): Outcome[] => (o.kind === 'multi' ? o.items ?? [] : [o]);
/** LE SEUL endroit qui connaît les noms de champs de l'élément « heures ». */
function heuresDe(items: Outcome[]): Heures | string {
  const hs = items.filter((i) => i.kind === 'draft');
  if (hs.length !== 1) return `${hs.length} brouillon(s) d'heures (attendu 1)`;
  const d = hs[0].draft as { date: string; lines: Record<string, unknown>[]; errors?: string[]; nouveau_chantier?: NC; manque?: string[] };
  return {
    date: d.date, erreurs: d.errors ?? [], nouveau: d.nouveau_chantier, manque: d.manque ?? [],
    lignes: d.lines.map((l) => ({
      key: String(l.key ?? ''), start: String(l.start), end: String(l.end), pause: Number(l.break_minutes) || 0, site: (l.worksite_id as string | null) ?? null,
      nouveau: l.nouveau === true, planning: l.from_planning === true, gap: l.gap_before === 'pause' ? 'pause' : null,
    })),
  };
}
const duree = (l: Ligne) => { let d = hm(l.end) - hm(l.start); if (d < 0) d += 1440; return d; };
/** Fiche à N éléments : types ET ordre EXACTS (jamais un « envoyer_journee » ni un panier que la phrase n'a pas demandé). */
const fiche = (ordre: string[], f: (items: Outcome[]) => string | null = () => null): Check => (o) => {
  if (o.kind !== 'multi' && ordre.length > 1) return `attendu une fiche à ${ordre.length} éléments, obtenu ${o.kind} ${o.type ?? ''}`;
  const items = elements(o);
  const got = items.map(typeDe).join(' > ');
  return got !== ordre.join(' > ') ? `éléments = ${got} (attendu ${ordre.join(' > ')})` : f(items);
};
/** Heures : date, créneaux EXACTS (pas un seul, pas fusionnés), pause nette (écart OU pause du créneau, jamais les deux), aucune erreur ; chantier de chaque créneau ('NOUVEAU' = rattaché au chantier à créer, jamais pris au hasard dans le planning). */
const heures = (date: string, creneaux: [string, string][], netMin: number, chantiers: string[], f: (h: Heures) => string | null = () => null) => (items: Outcome[]): string | null => {
  const h = heuresDe(items); if (typeof h === 'string') return h;
  if (h.erreurs.length) return `erreurs : ${h.erreurs.join(' / ')}`;
  if (h.date !== date) return `date = ${h.date} (attendu ${date})`;
  const got = h.lignes.map((l) => `${l.start}-${l.end}`).join(' ');
  const want = creneaux.map(([a, b]) => `${a}-${b}`).join(' ');
  if (got !== want) return `créneaux = ${got} (attendu ${want})`;
  const net = h.lignes.reduce((s, l) => s + duree(l) - l.pause, 0);
  if (net !== netMin) return `net = ${net} min (attendu ${netMin}) — pause comptée deux fois ou oubliée ? pauses = ${h.lignes.map((l) => l.pause)}`;
  for (let i = 0; i < chantiers.length; i++) {
    const l = h.lignes[i]; const voulu = chantiers[i];
    if (voulu === 'NOUVEAU') {
      if (!l.nouveau) return `créneau ${i + 1} : devait être rattaché au NOUVEAU chantier (chantier = ${l.site}, planning = ${l.planning})`;
      if (l.planning) return `créneau ${i + 1} : chantier pris au hasard dans le planning`;
    } else if (l.nouveau || l.site !== voulu) return `créneau ${i + 1} : chantier ${l.nouveau ? 'NOUVEAU' : l.site} (attendu ${voulu})`;
    else if (l.planning) return `créneau ${i + 1} : chantier pris dans le planning au lieu de celui dit`;
  }
  return f(h);
};
/** Les écarts entre créneaux : 'pause' (dite par le salarié) ou null (non qualifié), pour chaque créneau (le premier n'a pas d'écart avant lui). */
const ecarts = (voulu: ('pause' | null)[]) => (h: Heures): string | null => {
  const got = h.lignes.map((l) => l.gap);
  return JSON.stringify(got) === JSON.stringify(voulu) ? null : `écarts = ${JSON.stringify(got)} (attendu ${JSON.stringify(voulu)})`;
};
const cleNom = (x: unknown) => fold(x).replace(/\b(madame|monsieur|mme|mr|m|a)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
const memeNom = (a: unknown, b: string) => cleNom(a) === cleNom(b); // « Dupont Pierrick » = « Pierrick Dupont » = « Monsieur Pierrick Dupont »
/** Nouveau chantier : nom (ordre libre, sans civilité), ville, code postal EXACTS ; travaux/adresse par motif ; null = doit rester VIDE (rien d'inventé). */
const nouveauChantier = (att: { nom: string; ville: string | RegExp | null; cp: string | null; travaux?: RegExp; adresse?: RegExp }) => (h: Heures): string | null => {
  const n = h.nouveau; if (!n) return 'pas de bloc « nouveau chantier »';
  if (!memeNom(n.nom, att.nom)) return `nom = « ${n.nom} » (attendu ${att.nom})`;
  const ville = fold(n.ville);
  if (att.ville === null ? ville !== '' : att.ville instanceof RegExp ? !att.ville.test(ville) : !memeNom(String(n.ville ?? '').replace(/^(a|à)\s+/i, ''), att.ville)) return `ville = « ${n.ville} » (attendu ${att.ville ?? 'vide'})`;
  if ((att.cp ?? '') !== String(n.code_postal ?? '').replace(/\s/g, '')) return `code postal = « ${n.code_postal} » (attendu ${att.cp ?? 'vide'})`;
  if (att.travaux && !att.travaux.test(fold(n.description))) return `travaux = « ${n.description} » (attendu ${att.travaux})`;
  if (att.adresse && !att.adresse.test(fold(n.adresse))) return `adresse = « ${n.adresse} » (attendu ${att.adresse})`;
  return null;
};
/** Élément annexe (panier, réserve, congé, envoi) : présent UNE fois, sans problème bloquant, champs contrôlés. */
const annexe = (items: Outcome[], type: string, f: (d: Record<string, unknown>, it: Outcome) => string | null = () => null): string | null => {
  const x = items.filter((i) => i.kind === 'action' && i.type === type);
  if (x.length !== 1) return `${type} : ${x.length} élément(s) (attendu 1)`;
  if (x[0].problems?.length) return `${type} pas prêt : ${x[0].problems.join(' / ')}`;
  return f(x[0].draft ?? {}, x[0]);
};
const LIBELLE_NON_PREPARE: Record<string, string> = { panier_repas: 'Panier repas', signaler_reserve: 'Réserve', demander_conge: 'Congé', envoyer_journee: 'Envoi de la journée' };
/** Rien ne disparaît sans un mot : chaque action demandée est dans la fiche, OU nommée dans « Laissé de côté », OU dans « Non préparé ». */
const rienDeSilencieux = (types: string[]): Check => (o) => {
  const items = elements(o).map(typeDe);
  const perdus = types.filter((t) => !items.includes(t) && !(o.ignores ?? []).includes(t) && !(o.non_prepare ?? []).includes(LIBELLE_NON_PREPARE[t] ?? t));
  return perdus.length ? `action perdue sans un mot : ${perdus.join(', ')} (éléments : ${items.join(' > ')} ; laissé de côté : ${(o.ignores ?? []).join(',')} ; non préparé : ${(o.non_prepare ?? []).join(',')})` : null;
};
const TR_MOTS = new RegExp('(^|[^\\p{L}])(bu|bir|ve|saat|hafta|toplam|çalıştınız|çalıştın|çalıştım|dakika|kadar|için|ile|yaptınız|bildirdiniz)(?![\\p{L}])', 'iu');
const FR_MOTS = new RegExp('(^|[^\\p{L}])(vous|heures|semaine|cette|déclarées|aujourd|travaillé|votre)(?![\\p{L}])', 'iu');
/**
 * Les libellés d'ÉCRAN cités entre guillemets (« Ma semaine », "Ma journée", 'Ma semaine') sont en français dans toute l'appli (D9) :
 * une réponse turque qui renvoie vers eux n'est pas « mêlée de français ». On les retire avant de chercher le turc ET le français ;
 * le reste de la réponse reste soumis au contrôle (une réponse en français, guillemets ou non, échoue). Une apostrophe de mot
 * (aujourd'hui, Martin’de) n'ouvre jamais une citation : le guillemet simple doit suivre un espace ou une ponctuation et précéder une non-lettre.
 */
export const sansLibellesEcran = (a: string) => a
  .replace(/«[^»]{0,60}»|“[^”]{0,60}”|"[^"]{0,60}"/g, ' ')
  .replace(/(^|[\s(:,;.])['’‘][^'’‘]{1,60}['’](?![\p{L}])/gu, '$1 ');
/** Réponse en TURC : lettres ou mots turcs présents, aucun mot français courant (hors libellés d'écran entre guillemets). */
const enTurc: Check = (o) => {
  const u = o.kind === 'multi' && o.items?.length === 1 ? o.items[0] : o;
  if (u.kind !== 'answer') return `attendu une réponse, obtenu ${u.kind} ${u.type ?? ''}`;
  const a = u.answer ?? '';
  if (a.length < 10) return 'réponse vide';
  const libre = sansLibellesEcran(a);
  if (!(/[ğışİĞŞ]/.test(libre) || TR_MOTS.test(libre))) return `réponse pas en turc : « ${a.slice(0, 70)} »`;
  return FR_MOTS.test(libre) ? `réponse mêlée de français : « ${a.slice(0, 70)} »` : null;
};
const unSeul = (m: string | null, ...autres: (string | null)[]) => m ?? autres.find((x) => x) ?? null;

/** `live: 'vide'` : aucune ligne notée aujourd'hui (LIVE_VIDE). */
export interface EvalCase {
  id: string; cote: 'bureau' | 'salarie'; categorie: string; phrase: string; file?: keyof typeof FILES; enCours?: boolean; live?: 'vide';
  /** Suite de conversation : les messages d'AVANT la phrase (du plus ancien au plus récent), comme l'écran les envoie dans `history`. Absent = première question, consigne d'avant. */
  history?: MessageHistorique[];
  check: Check;
}

// sl13 : la journée complète en un message (4 appels au plus) : heures sur trois chantiers dont un NOUVEAU, panier, réserve, envoi.
const recapitulatifComplet = fiche(['heures', 'panier_repas', 'signaler_reserve', 'envoyer_journee'], (it) => {
  const creneaux = (it.find((i) => i.kind === 'draft')?.draft?.lines ?? []) as { key: string; start: string }[];
  const cleDuMatin = creneaux.find((l) => l.start === '07:00')?.key;
  return unSeul(
    heures(TODAY, [['07:00', '10:00'], ['10:30', '12:00'], ['13:00', '16:30']], 480, [W.dupont, W.martin, 'NOUVEAU'],
      nouveauChantier({ nom: 'Ayhan Demir', ville: 'Bourg-en-Bresse', cp: '01000', adresse: /tilleuls/, travaux: /pergola/ }))(it),
    annexe(it, 'panier_repas', (d) => eq(d, 'valeur', true)),
    // La réserve vise le chantier « chez Dupont » : le créneau 07:00-10:00 de la fiche (pas encore noté en base).
    annexe(it, 'signaler_reserve', (d, x) => unSeul(has(d, 'detail', /fissure/i), eq(d, 'entry_id', `draft:${cleDuMatin}`), x.cible?.nom === 'Villa Dupont' ? null : `cible = ${JSON.stringify(x.cible)} (attendu Villa Dupont)`)),
    // L'envoi dépend de TOUT le reste (sendWorkerDay envoie la journée entière).
    annexe(it, 'envoyer_journee', (_d, x) => (it.filter((i) => i !== x).every((i) => x.depend?.includes(String(i.id))) ? null : `dépend de ${JSON.stringify(x.depend)} (attendu les trois autres éléments)`)),
  );
});
// sl15 : cinq actions demandées pour quatre appels au plus : aucune ne disparaît sans un mot, et l'envoi (s'il est préparé) vient en dernier.
const cinqActions: Check = (o) => {
  if (o.kind !== 'multi') return `attendu une fiche, obtenu ${o.kind} ${o.type ?? ''}`;
  const items = o.items ?? [];
  if (items.length > 4) return `${items.length} éléments (4 au plus)`;
  const envoi = items.findIndex((i) => typeDe(i) === 'envoyer_journee');
  return unSeul(
    heures(TODAY, [['08:00', '12:00'], ['13:00', '17:00']], 480, [W.dupont, W.dupont])(items),
    rienDeSilencieux(['panier_repas', 'signaler_reserve', 'demander_conge', 'envoyer_journee'])(o),
    envoi >= 0 && envoi !== items.length - 1 ? 'l’envoi doit être le DERNIER élément' : null,
  );
};

// ── Suites de conversation ──────────────────────────────────────────────────
const tour = (...messages: ['me' | 'bot', string][]): MessageHistorique[] => messages.map(([who, text]) => ({ who, text }));
// La conversation d'avant de sc01–sc03 : une affectation déjà faite (aujourd'hui du jeu = jeudi 2026-10-01, demain = 2026-10-02, la case de Karim ce jour-là = p-karim-4).
const KARIM_DEMAIN = tour(['me', 'Mets Karim sur Villa Dupont demain'], ['bot', 'Karim sera sur Villa Dupont demain.']);
/**
 * sc03 « Non, retire ça » : la bonne FAMILLE d'action (retirer CETTE case de Karim, demain) OU une question pour savoir quoi annuler.
 * Jamais une nouvelle affectation : l'action d'avant est déjà traitée, on ne la refait pas.
 */
const annulerAffectation: Check = (o) => {
  if (o.kind === 'answer') return /\?/.test(o.answer ?? '') ? null : `ni action ni question : « ${(o.answer ?? '').slice(0, 60)} »`;
  if (o.kind !== 'action') return `attendu retirer la case de Karim (ou une question), obtenu ${o.kind}`;
  if (o.problems?.length) return `pas prête : ${o.problems.join(' / ')}`;
  const d = o.draft ?? {};
  if (o.type === 'supprimer_intervention') return all(eq(d, 'user_id', 'u-karim'), eq(d, 'date', '2026-10-02'), eq(d, 'planning_id', 'p-karim-4'));
  if (o.type === 'effacer_planning') return all(eq(d, 'user_id', 'u-karim'), eq(d, 'du', '2026-10-02'), eq(d, 'au', '2026-10-02'));
  return `attendu supprimer_intervention (ou effacer_planning de Karim demain), obtenu ${o.type}`;
};

/**
 * La suite « l'après-midi » d'un matin resté BROUILLON (rien n'est enregistré : lignes_du_jour est vide). Deux lectures sont défendables et
 * comptent toutes les deux : l'après-midi seul, OU le matin puis l'après-midi (le matin n'étant pas enregistré). Dans les deux cas, le
 * chantier est CELUI D'AVANT (`site`) : jamais celui du planning, jamais un autre. Une seule ligne 07:30-16:30 échoue (les créneaux sont deux).
 */
const apresMidiDeSuite = (site: string, matin: [string, string], apresMidi: [string, string]) => (l: Record<string, unknown>[], date: string): string | null => {
  const vues = l.map((x) => `${x.worksite_id} ${x.start}-${x.end}`).join(' | ');
  const seul = `${site} ${apresMidi[0]}-${apresMidi[1]}`;
  const avecMatin = `${site} ${matin[0]}-${matin[1]} | ${site} ${apresMidi[0]}-${apresMidi[1]}`;
  if (date !== TODAY) return `${date} (attendu ${TODAY})`;
  return vues === seul || vues === avecMatin ? null : `lignes : ${vues} (attendu « ${seul} » ou « ${avecMatin} » : le matin n'est qu'un brouillon, le chantier est celui d'avant)`;
};

// ── Livraison 3a : contrôles communs à plusieurs cas (le contrôle lui-même reste écrit dans le cas : act('x', …)) ──
/**
 * Le banc ne donne pas à `prepare` les lignes d'heures ENVOYÉES d'un salarié (son paramètre `entries`) : une correction d'heures porte donc
 * toujours ce problème, et c'est la réponse voulue (comme « Choisissez l’intervention. » pour b47). On contrôle ce que le modèle a LU : salarié,
 * jour, heures, motif. Si le banc fournit un jour ces lignes, ces trois cas devront attendre `[]`.
 */
const AUCUNE_LIGNE = 'Aucune heure envoyée ce jour-là à corriger.';
/** Un n° de sécurité sociale (13 à 15 chiffres, espaces permis) n'entre JAMAIS dans un brouillon, quel que soit le champ. */
const sansNir = (d: Record<string, unknown>) => (/[12](?:[\s.-]?\d){12,14}/.test(JSON.stringify(d)) ? 'un n° de sécurité sociale est entré dans le brouillon' : null);
/** Un nombre, quelle que soit son écriture (2310.4, « 2310.40 ») : le modèle recopie un montant d'un PDF, sa mise en forme ne compte pas. */
const nb = (d: Record<string, unknown>, k: string, v: number) => (Number(d[k]) === v ? null : `${k} = ${JSON.stringify(d[k])} (attendu ${v})`);
/** FILES.bulletin : le bulletin de septembre 2026 de Karim, recopié tel quel (mois, brut, coût employeur, heures payées). */
const coutDeKarim = (d: Record<string, unknown>) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'mois', '2026-09'), nb(d, 'brut', 2310.4), nb(d, 'cout_employeur', 3280.15), nb(d, 'heures_payees', 151.67), sansNir(d));
/** FILES.bulletinNouveau : le bulletin d'août 2026 d'un futur salarié, recopié dans le brouillon d'invitation (`bulletin`). */
const bulletinDeLucas = (d: Record<string, unknown>) => {
  const b = d.bulletin as Record<string, unknown> | null;
  return b ? all(eq(b, 'mois', '2026-08'), nb(b, 'brut', 2150), nb(b, 'cout_employeur', 3053.25), nb(b, 'heures_payees', 151.67)) : 'bulletin = null (attendu les chiffres du bulletin)';
};

export const CASES: EvalCase[] = [
  // ════ BUREAU ════
  // Planning / interventions
  { id: 'b01', cote: 'bureau', categorie: 'Interventions', phrase: 'Rajoute-moi une intervention à Lyon aujourd’hui de 14h à 18h',
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', ME), eq(d, 'worksite_id', W.autre), eq(d, 'dates', [TODAY]), eq(d, 'debut', '14:00'), eq(d, 'fin', '18:00'), has(d, 'note', /lyon/i))) },
  { id: 'b02', cote: 'bureau', categorie: 'Interventions', phrase: 'rajoute moi une intervention a annecy demain de 8h a 12h',
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', ME), eq(d, 'worksite_id', W.autre), eq(d, 'dates', ['2026-10-02']), eq(d, 'debut', '08:00'), eq(d, 'fin', '12:00'), has(d, 'note', /annecy/i))) },
  { id: 'b03', cote: 'bureau', categorie: 'Interventions', phrase: 'euh ajoute une intervention chez dupont jeudi prochain à 14h pour karim, c’est pour le remplacement du chauffe-eau',
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'worksite_id', W.dupont), eq(d, 'dates', ['2026-10-08']), eq(d, 'debut', '14:00'), has(d, 'note', /chauffe-eau/i), clean(d, 'note'))) },
  { id: 'b04', cote: 'bureau', categorie: 'Interventions', phrase: 'mets kevin sur pizzeria exemple macon lundi et mardi',
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', 'u-kevin'), eq(d, 'worksite_id', W.macon), eq(d, 'dates', ['2026-10-05', '2026-10-06']))) },
  { id: 'b05', cote: 'bureau', categorie: 'Interventions', phrase: 'Karim demain matin chez Martin',
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'worksite_id', W.martin), eq(d, 'dates', ['2026-10-02']), eq(d, 'debut', '08:00'))) },
  { id: 'b06', cote: 'bureau', categorie: 'Interventions', phrase: 'décale l’intervention de karim de vendredi à lundi',
    check: act('modifier_intervention', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'date', '2026-10-02'), eq(d, 'planning_id', 'p-karim-4'), eq(d, 'nouvelle_date', '2026-10-05'))) },
  { id: 'b07', cote: 'bureau', categorie: 'Interventions', phrase: 'fais moi le planning de la semaine prochaine', check: act('planning_semaine') },
  // Congés
  { id: 'b08', cote: 'bureau', categorie: 'Congés', phrase: 'Sofiane sera en congé du 12 au 16 octobre',
    check: act('poser_absence', (d) => all(eq(d, 'user_id', 'u-sofiane'), eq(d, 'absence_type', 'conge'), eq(d, 'du', '2026-10-12'), eq(d, 'au', '2026-10-16'))) },
  { id: 'b09', cote: 'bureau', categorie: 'Congés', phrase: 'kevin est malade aujourd’hui et demain',
    check: act('poser_absence', (d) => all(eq(d, 'user_id', 'u-kevin'), eq(d, 'absence_type', 'maladie'), eq(d, 'du', TODAY), eq(d, 'au', '2026-10-02'))) },
  { id: 'b10', cote: 'bureau', categorie: 'Congés', phrase: 'accepte le congé de kevin', check: act('repondre_conge', (d) => all(eq(d, 'leave_id', 'l-kevin'), eq(d, 'decision', 'accepter'))) },
  { id: 'b11', cote: 'bureau', categorie: 'Congés', phrase: 'refuse la demande de congé de Kevin, trop de boulot ce mois ci',
    check: act('repondre_conge', (d) => all(eq(d, 'leave_id', 'l-kevin'), eq(d, 'decision', 'refuser'), has(d, 'motif', /boulot|travail|charge/i))) },
  // Clients / chantiers
  { id: 'b12', cote: 'bureau', categorie: 'Clients', phrase: 'crée un nouveau client maison garnier à caluire, tel 06 12 34 56 78',
    check: act('creer_chantier', (d) => all(eq(d, 'nom_client', 'Maison Garnier'), eq(d, 'ville', 'Caluire'), has(d, 'telephone', /06 ?12 ?34 ?56 ?78/))) },
  { id: 'b13', cote: 'bureau', categorie: 'Clients', phrase: 'nouveau chantier : résidence les lilas à bron',
    check: act('creer_chantier', (d) => all(has(d, 'nom_client', /^R[ée]sidence les Lilas$/), eq(d, 'ville', 'Bron'))) },
  { id: 'b14', cote: 'bureau', categorie: 'Clients', phrase: 'change le téléphone de bureau martin : 04 78 00 00 00',
    check: act('modifier_client', (d) => all(eq(d, 'worksite_id', W.martin), has(d, 'telephone', /04 ?78 ?00 ?00 ?00/))) },
  { id: 'b15', cote: 'bureau', categorie: 'Clients', phrase: 'le chantier villa dupont est fini, archive le', check: act('archiver_client', (d) => eq(d, 'worksite_id', W.dupont)) },
  { id: 'b16', cote: 'bureau', categorie: 'Clients', phrase: 'ajoute une dépense de 450 euros de placo sur villa dupont',
    check: act('ajouter_depense', (d) => all(eq(d, 'worksite_id', W.dupont), eq(d, 'montant', '450'), eq(d, 'categorie', 'materiaux'))) },
  // Documents
  { id: 'b17', cote: 'bureau', categorie: 'Documents', file: 'facture', phrase: 'Classe ce document sur le chantier de Pierre-Paul Jacques à Viriat, c’est une facture payée',
    check: act('ranger_document', (d) => all(eq(d, 'worksite_id', W.ppj), eq(d, 'categorie', 'facture_payee'))) },
  { id: 'b18', cote: 'bureau', categorie: 'Documents', file: 'facture', phrase: 'range ça sur le chantier de viriat',
    check: act('ranger_document', (d) => all(eq(d, 'worksite_id', W.ppj), eq(d, 'categorie', 'facture_payee'))) },
  { id: 'b19', cote: 'bureau', categorie: 'Documents', file: 'devis', phrase: 'nouveau client, voilà son devis validé',
    check: (o) => (o.kind === 'action' && o.type === 'creer_chantier' ? all(has(o.draft ?? {}, 'nom_client', /garnier/i), has(o.draft ?? {}, 'montant_devis', /^18400/), (o.draft ?? {}).budget_montant === undefined ? null : 'le montant du devis ne doit pas devenir un budget (lot 1)') : `attendu creer_chantier, obtenu ${o.kind} ${o.type ?? ''}`) },
  // Salariés / droits
  { id: 'b20', cote: 'bureau', categorie: 'Salariés', phrase: 'passe kevin chef d’équipe', check: act('changer_role', (d) => all(eq(d, 'user_id', 'u-kevin'), eq(d, 'role', 'lead'))) },
  { id: 'b21', cote: 'bureau', categorie: 'Salariés', phrase: 'relance l’invitation de marc', check: act('relancer_invitation', (d) => eq(d, 'email', 'marc.durand@gmail.com')) },
  { id: 'b22', cote: 'bureau', categorie: 'Salariés', phrase: 'envoie un rappel a karim pour ses heures', check: act('envoyer_rappel', (d) => eq(d, 'user_id', 'u-karim')) },
  { id: 'b23', cote: 'bureau', categorie: 'Salariés', phrase: 'ajoute le caces de karim, il expire le 15 mars 2027',
    check: act('ajouter_habilitation', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'categorie', 'caces'), eq(d, 'expiration', '2027-03-15'))) },
  { id: 'b24', cote: 'bureau', categorie: 'Salariés', phrase: 'Kevin a quitté la boite, archive le', check: act('archiver_salarie', (d) => eq(d, 'user_id', 'u-kevin')) },
  { id: 'b25', cote: 'bureau', categorie: 'Salariés', phrase: 'invite marc durand marc.durand@gmail.com',
    check: act('inviter_salarie', (d) => all(eq(d, 'prenom', 'Marc'), eq(d, 'nom', 'Durand'), eq(d, 'email', 'marc.durand@gmail.com'))) },
  // Réglages / paie / réserves
  { id: 'b26', cote: 'bureau', categorie: 'Réglages', phrase: 'clôture le mois de septembre', check: act('cloturer_mois', (d) => eq(d, 'mois', '2026-09')) },
  { id: 'b27', cote: 'bureau', categorie: 'Réglages', phrase: 'l’email de notre comptable c’est compta@cabinet-roux.fr',
    check: act('modifier_reglages', (d) => eq(d, 'email_comptable', 'compta@cabinet-roux.fr')) },
  { id: 'b28', cote: 'bureau', categorie: 'Réglages', phrase: 'lève la réserve de karim sur villa dupont, c’est réparé', check: act('lever_reserve', (d) => eq(d, 'entry_id', 'r-karim')) },
  // Aide / questions
  { id: 'b29', cote: 'bureau', categorie: 'Aide', phrase: 'comment je télécharge les heures du mois en excel ?', check: answer('export') },
  { id: 'b30', cote: 'bureau', categorie: 'Aide', phrase: 'à quoi sert le bouton réserves', check: answer('reserves') },
  { id: 'b31', cote: 'bureau', categorie: 'Aide', phrase: 'explique moi comment déplacer une intervention', check: answer() },
  { id: 'b32', cote: 'bureau', categorie: 'Aide', phrase: 'rédige un petit message pour dire au client que le chantier est décalé à lundi', check: answer() },
  // Retour Cowork (préview) : « corriger / pointage » prime sur « salarié », et toujours un bouton.
  { id: 'b33', cote: 'bureau', categorie: 'Aide', phrase: 'Comment je corrige le pointage d’un salarié ?', check: answer('salaries') },
  // ── Lot 8 : effacer, retirer, annuler ──
  { id: 'b34', cote: 'bureau', categorie: 'Effacer', phrase: 'Enlève l’intervention à Lyon de Kevin jeudi', check: act('supprimer_intervention', (d) => eq(d, 'planning_id', 'p-kevin-lyon')) },
  { id: 'b35', cote: 'bureau', categorie: 'Effacer', phrase: 'efface le planning de la semaine prochaine',
    check: act('effacer_planning', (d) => all(eq(d, 'user_id', null), eq(d, 'du', '2026-10-05'), eq(d, 'au', '2026-10-11'))) },
  { id: 'b36', cote: 'bureau', categorie: 'Effacer', phrase: 'vide le planning de karim de lundi à mercredi',
    check: act('effacer_planning', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'du', '2026-10-05'), eq(d, 'au', '2026-10-07'))) },
  { id: 'b37', cote: 'bureau', categorie: 'Effacer', phrase: 'enlève le congé de Sofiane du 12 au 13 octobre',
    check: act('supprimer_absence', (d) => all(eq(d, 'user_id', 'u-sofiane'), eq(d, 'du', '2026-10-12'), eq(d, 'au', '2026-10-13'))) },
  { id: 'b38', cote: 'bureau', categorie: 'Effacer', phrase: 'supprime la facture du chantier de viriat', check: act('supprimer_document', (d) => eq(d, 'document_id', 'd-fact')) },
  { id: 'b39', cote: 'bureau', categorie: 'Effacer', phrase: 'efface la dépense de placo sur villa dupont', check: act('supprimer_depense', (d) => eq(d, 'expense_id', 'x-placo')) },
  { id: 'b40', cote: 'bureau', categorie: 'Effacer', phrase: 'la location sur villa dupont c’était 350 euros pas 300, corrige',
    check: act('modifier_depense', (d) => all(eq(d, 'expense_id', 'x-loc'), eq(d, 'montant', '350'))) },
  { id: 'b41', cote: 'bureau', categorie: 'Effacer', phrase: 'supprime le caces de karim', check: act('supprimer_habilitation', (d) => eq(d, 'cert_id', 'c-caces')) },
  { id: 'b42', cote: 'bureau', categorie: 'Effacer', phrase: 'annule l’invitation de marc', check: act('annuler_invitation', (d) => eq(d, 'email', 'marc.durand@gmail.com')) },
  { id: 'b43', cote: 'bureau', categorie: 'Effacer', phrase: 'supprime les heures de karim d’hier', check: refus() },
  { id: 'b44', cote: 'bureau', categorie: 'Effacer', phrase: 'retire karim du planning demain', check: act('supprimer_intervention', (d) => eq(d, 'planning_id', 'p-karim-4')) },
  { id: 'b45', cote: 'bureau', categorie: 'Effacer', phrase: 'le devis cuisine de villa dupont, en fait c’est une facture',
    check: act('modifier_document', (d) => all(eq(d, 'document_id', 'd-devis'), eq(d, 'categorie', 'facture'))) },
  // Retour Cowork : un salarié nommé → SEULEMENT ses cases ; rien ce jour-là → on le dit.
  { id: 'b46', cote: 'bureau', categorie: 'Effacer', phrase: 'Enlève Karim de la Villa Dupont vendredi', check: act('supprimer_intervention', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'planning_id', 'p-karim-4'))) },
  // Rien ce jour-là pour Kevin : l'assistant le dit (« Choisissez l’intervention. ») et ne propose QUE les cases de Kevin (lot 8).
  // Attente corrigée : avec `act`, ce cas ne pouvait jamais passer (« pas prête » dès qu'il y a un problème).
  { id: 'b47', cote: 'bureau', categorie: 'Effacer', phrase: 'retire Kevin de la Villa Dupont vendredi',
    check: actAvecProblemes('supprimer_intervention', ['Choisissez l’intervention.'], (d) => all(eq(d, 'user_id', 'u-kevin'), eq(d, 'planning_id', null),
      (d.choix as { nom: string }[]).length && (d.choix as { nom: string }[]).every((c) => c.nom === 'Kevin') ? null : `choix : ${JSON.stringify(d.choix)}`)) },
  // ════ SALARIÉ ════
  { id: 's01', cote: 'salarie', categorie: 'Heures', phrase: 'ce matin 7h30 12h villa dupont et aprem 13h 16h30 bureau martin',
    check: draft((l) => (l.length === 2 && l[0].worksite_id === W.dupont && l[1].worksite_id === W.martin && l[0].start === '07:30' && l[1].end === '16:30' ? null : `lignes : ${JSON.stringify(l.map((x) => [x.worksite_id, x.start, x.end]))}`)) },
  { id: 's02', cote: 'salarie', categorie: 'Heures', phrase: 'rajoute moi une intervention à annecy de 14h à 18h',
    check: draft((l) => (l.length === 1 && l[0].worksite_id === W.autre && l[0].start === '14:00' && l[0].end === '18:00' && /annecy/i.test(String(l[0].observation ?? '')) ? null : `lignes : ${JSON.stringify(l)}`)) },
  { id: 's03', cote: 'salarie', categorie: 'Heures', phrase: 'hier j’ai bossé de 8h à 17h avec 1h de pause chez dupont',
    check: draft((l, date) => (date === '2026-09-30' && l.length === 1 && l[0].worksite_id === W.dupont && l[0].start === '08:00' && l[0].end === '17:00' && l[0].break_minutes === 60 ? null : `${date} ${JSON.stringify(l)}`)) },
  { id: 's04', cote: 'salarie', categorie: 'Heures', phrase: 'jai fait 6h 14h a la pizzeria de bourg',
    check: draft((l) => (l.length === 1 && l[0].worksite_id === W.bourg && l[0].start === '06:00' && l[0].end === '14:00' ? null : `lignes : ${JSON.stringify(l)}`)) },
  { id: 's05', cote: 'salarie', categorie: 'Pointage', phrase: 'je commence sur pizzeria exemple macon', check: answer() }, // lot 12 : on commence par le QR de la tablette
  { id: 's06', cote: 'salarie', categorie: 'Pointage', enCours: true, phrase: 'j’ai fini', check: act('terminer_pointage') },
  { id: 's07', cote: 'salarie', categorie: 'Pointage', enCours: true, phrase: 'j’ai terminé à 17h', check: act('terminer_pointage', (d) => eq(d, 'fin', '17:00')) },
  { id: 's08', cote: 'salarie', categorie: 'Congés', phrase: 'je voudrais poser des congés du 20 au 24 octobre',
    check: act('demander_conge', (d) => all(eq(d, 'conge_type', 'conge'), eq(d, 'du', '2026-10-20'), eq(d, 'au', '2026-10-24'))) },
  { id: 's09', cote: 'salarie', categorie: 'Congés', phrase: 'je suis malade demain', check: act('demander_conge', (d) => all(eq(d, 'conge_type', 'maladie'), eq(d, 'du', '2026-10-02'))) },
  { id: 's10', cote: 'salarie', categorie: 'Ma journée', phrase: 'envoie ma journée', check: act('envoyer_journee') },
  { id: 's11', cote: 'salarie', categorie: 'Ma journée', phrase: 'mets moi le panier', check: act('panier_repas', (d) => eq(d, 'valeur', true)) },
  { id: 's12', cote: 'salarie', categorie: 'Ma journée', phrase: 'pareil qu’hier', check: act('copier_journee', (d) => all(eq(d, 'depuis', '2026-09-30'), eq(d, 'vers', [TODAY]))) },
  { id: 's13', cote: 'salarie', categorie: 'Ma journée', phrase: 'change mes horaires de villa dupont : 7h 11h30',
    check: act('modifier_heures', (d) => all(eq(d, 'entry_id', 'e1'), eq(d, 'debut', '07:00'), eq(d, 'fin', '11:30'))) },
  { id: 's14', cote: 'salarie', categorie: 'Ma journée', phrase: 'j’ai corrigé la réserve de bureau martin sur place', check: act('reserve_corrigee', (d) => eq(d, 'entry_id', 'e2')) },
  { id: 's15', cote: 'salarie', categorie: 'Réserves', phrase: 'signale une réserve sur villa dupont, fissure sur le mur sud',
    check: act('signaler_reserve', (d) => all(eq(d, 'entry_id', 'e1'), has(d, 'detail', /fissure/i))) },
  { id: 's16', cote: 'salarie', categorie: 'Documents', file: 'photo', phrase: 'voilà la photo de la réserve sur bureau martin',
    check: act('ranger_photo', (d) => all(eq(d, 'worksite_id', W.martin), eq(d, 'reserve', true))) },
  { id: 's17', cote: 'salarie', categorie: 'Documents', file: 'facture', phrase: 'classe la facture sur viriat',
    check: act('ranger_photo', (d) => all(eq(d, 'worksite_id', W.ppj), has(d, 'categorie', /^facture/))) },
  { id: 's18', cote: 'salarie', categorie: 'Collègues', phrase: 'où sont mes collègues aujourd’hui ?', check: coll('', TODAY) },
  { id: 's19', cote: 'salarie', categorie: 'Collègues', phrase: 'ou est sofiane demain', check: coll('sofiane', '2026-10-02') },
  { id: 's20', cote: 'salarie', categorie: 'Collègues', phrase: 'que fait kevin lundi ?', check: coll('kevin', '2026-10-05') },
  { id: 's21', cote: 'salarie', categorie: 'Aide', phrase: 'comment je retire un chantier de ma journée ?', check: answer() },
  { id: 's22', cote: 'salarie', categorie: 'Aide', phrase: 'c’est combien 35 heures à 14 euros 50 ?', check: answer() },
  { id: 's23', cote: 'salarie', categorie: 'Ma journée', phrase: 'l’email du client de villa dupont c’est jean.dupont@gmail.com',
    check: act('email_client', (d) => all(eq(d, 'worksite_id', W.dupont), eq(d, 'email', 'jean.dupont@gmail.com'))) },
  { id: 's24', cote: 'salarie', categorie: 'Ma journée', phrase: 'je bosse sur un nouveau chantier, la boulangerie petit à tassin',
    check: act('nouveau_chantier', (d) => all(has(d, 'nom', /boulangerie petit/i), has(d, 'ville', /tassin/i))) },
  { id: 's25', cote: 'salarie', categorie: 'Aide', phrase: 'comment je change ma photo', check: answer('photo') },
  // ── Lot 8 : effacer ce qu'il a saisi (pas envoyé) ──
  { id: 's26', cote: 'salarie', categorie: 'Effacer', phrase: 'efface ma journée', check: act('effacer_heures', (d) => all(eq(d, 'tout', true), eq(d, 'date', '2026-10-01'))) },
  { id: 's27', cote: 'salarie', categorie: 'Effacer', phrase: 'supprime la ligne de bureau martin', check: act('effacer_heures', (d) => all(eq(d, 'tout', false), eq(d, 'entry_id', 'e2'))) },
  { id: 's28', cote: 'salarie', categorie: 'Effacer', phrase: 'annule mon pointage je me suis trompé', enCours: true, check: answer() }, // lot 12 : plus d'annulation au téléphone
  { id: 's29', cote: 'salarie', categorie: 'Effacer', phrase: 'annule ma demande de congé', check: act('annuler_conge', (d) => eq(d, 'leave_id', 'lv1')) },
  { id: 's30', cote: 'salarie', categorie: 'Effacer', phrase: 'finalement mes vacances ce sera du 21 au 25 octobre',
    check: act('modifier_conge', (d) => all(eq(d, 'leave_id', 'lv1'), eq(d, 'du', '2026-10-21'), eq(d, 'au', '2026-10-25'))) },
  { id: 's31', cote: 'salarie', categorie: 'Effacer', phrase: 'enlève la réserve sur bureau martin', check: act('retirer_reserve', (d) => eq(d, 'entry_id', 'e2')) },
  { id: 's32', cote: 'salarie', categorie: 'Effacer', phrase: 'retire la dernière photo que j’ai mise', check: act('retirer_photo', (d) => eq(d, 'document_id', 'dw1')) },
  { id: 's33', cote: 'salarie', categorie: 'Effacer', phrase: 'efface mes heures d’hier', check: act('effacer_heures', (d) => all(eq(d, 'tout', true), eq(d, 'date', '2026-09-30'))) },
  // ════ SALARIÉ — PHRASES LONGUES (une fiche, plusieurs actions ; français et turc) ════
  // Aujourd'hui du jeu = jeudi 2026-10-01 ; hier = 2026-09-30 ; lundi suivant = 2026-10-05 ; mercredi = 2026-10-07.
  // Les cas d'heures d'aujourd'hui sont mesurés sur une journée VIDE (live: 'vide').
  { id: 'sl01', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Ajoute-moi une intervention. J'ai travaillé aujourd'hui de 8h à midi, puis pause d'1h, puis de 13h à 17h sur un nouveau chantier : prénom Pierrick, nom Dupont, à Montagna 01250, pour la pose d'un store banne.",
    check: fiche(['heures'], heures(TODAY, [['08:00', '12:00'], ['13:00', '17:00']], 480, ['NOUVEAU', 'NOUVEAU'], (h) => unSeul(ecarts([null, 'pause'])(h), nouveauChantier({ nom: 'Pierrick Dupont', ville: 'Montagna', cp: '01250', travaux: /store/ })(h)))) },
  { id: 'sl02', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Alors ce matin j'ai commencé à 7h chez Dupont jusqu'à 10h, ensuite de 10h30 à midi chez Martin, et cet après-midi de 13h à 16h30 de nouveau chez Dupont.",
    check: fiche(['heures'], heures(TODAY, [['07:00', '10:00'], ['10:30', '12:00'], ['13:00', '16:30']], 480, [W.dupont, W.martin, W.dupont], (h) => unSeul(ecarts([null, null, null])(h), h.nouveau ? 'pas de nouveau chantier attendu' : null))) },
  { id: 'sl03', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Aujourd'hui j'ai bossé de 8h à 16h30 chez Martin avec une demi-heure de pause, et n'oublie pas de me mettre le panier repas.",
    check: fiche(['heures', 'panier_repas'], (it) => unSeul(heures(TODAY, [['08:00', '16:30']], 480, [W.martin], (h) => (h.lignes[0].pause === 30 ? null : `pause = ${h.lignes[0].pause} (attendu 30)`))(it), annexe(it, 'panier_repas', (d) => eq(d, 'valeur', true)))) },
  { id: 'sl04', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Cet après-midi j'ai fait une intervention de 14h à 18h chez une nouvelle cliente, madame Claire Martin, 12 rue des Lilas à Bourg-en-Bresse 01000, c'est pour la rénovation d'une salle de bain.",
    check: fiche(['heures'], heures(TODAY, [['14:00', '18:00']], 240, ['NOUVEAU'], nouveauChantier({ nom: 'Claire Martin', ville: 'Bourg-en-Bresse', cp: '01000', adresse: /12.*lilas/, travaux: /salle de bain/ }))) },
  { id: 'sl05', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Aujourd'hui j'ai travaillé de 9h à 12h puis de 14h à 17h chez un nouveau client à Bourg-en-Bresse, monsieur Ayhan Demir, pour la pose d'une pergola.",
    check: fiche(['heures'], heures(TODAY, [['09:00', '12:00'], ['14:00', '17:00']], 360, ['NOUVEAU', 'NOUVEAU'], nouveauChantier({ nom: 'Ayhan Demir', ville: 'Bourg-en-Bresse', cp: null, travaux: /pergola/ }))) },
  { id: 'sl06', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Aujourd'hui de 8h à 12h sur un nouveau chantier chez monsieur Paul Durand, pour la pose de carrelage.",
    check: fiche(['heures'], heures(TODAY, [['08:00', '12:00']], 240, ['NOUVEAU'], (h) => unSeul(nouveauChantier({ nom: 'Paul Durand', ville: null, cp: null, travaux: /carrelage/ })(h), h.manque.includes('ville') ? null : `manque = ${JSON.stringify(h.manque)} (la ville doit être réclamée)`))) },
  { id: 'sl07', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Aujourd'hui j'ai travaillé de 7h30 à 12h puis de 13h à 16h30 chez Dupont, mets-moi le panier repas, et signale une réserve : fissure sur le mur sud.",
    check: fiche(['heures', 'panier_repas', 'signaler_reserve'], (it) => unSeul(heures(TODAY, [['07:30', '12:00'], ['13:00', '16:30']], 480, [W.dupont, W.dupont])(it), annexe(it, 'panier_repas', (d) => eq(d, 'valeur', true)), annexe(it, 'signaler_reserve', (d, x) => unSeul(has(d, 'detail', /fissure/i), x.cible?.nom === 'Villa Dupont' ? null : `cible = ${JSON.stringify(x.cible)} (attendu Villa Dupont)`)))) },
  { id: 'sl08', cote: 'salarie', categorie: 'Long FR', phrase: "Hier j'ai bossé de 8h à 12h et de 13h à 17h chez Dupont, et je voudrais poser un congé du lundi au mercredi de la semaine prochaine.",
    check: fiche(['heures', 'demander_conge'], (it) => unSeul(heures('2026-09-30', [['08:00', '12:00'], ['13:00', '17:00']], 480, [W.dupont, W.dupont])(it), annexe(it, 'demander_conge', (d) => all(eq(d, 'conge_type', 'conge'), eq(d, 'du', '2026-10-05'), eq(d, 'au', '2026-10-07'))))) },
  { id: 'sl09', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "euh alors ce matin 7h 12h chez dupont, midi pause de 45 minutes, après-midi 12h45 16h30 pareil chez dupont, et j'ai vu une fissure sur le mur, mets une réserve.",
    check: fiche(['heures', 'signaler_reserve'], (it) => unSeul(heures(TODAY, [['07:00', '12:00'], ['12:45', '16:30']], 525, [W.dupont, W.dupont], ecarts([null, 'pause']))(it), annexe(it, 'signaler_reserve', (d) => has(d, 'detail', /fissure/i)))) },
  { id: 'sl10', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Ce matin de 8h à 12h chez Dupont, et cet après-midi de 13h à 17h chez une nouvelle cliente, madame Claire Martin à Bron 69500, pour l'installation d'une porte de garage.",
    check: fiche(['heures'], heures(TODAY, [['08:00', '12:00'], ['13:00', '17:00']], 480, [W.dupont, 'NOUVEAU'], nouveauChantier({ nom: 'Claire Martin', ville: 'Bron', cp: '69500', travaux: /garage/ }))) },
  { id: 'sl11', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Mets mes heures d'aujourd'hui de 8h à 12h et de 13h à 17h chez Martin, puis envoie ma journée au bureau.",
    check: fiche(['heures', 'envoyer_journee'], (it) => unSeul(heures(TODAY, [['08:00', '12:00'], ['13:00', '17:00']], 480, [W.martin, W.martin])(it), annexe(it, 'envoyer_journee', (d, x) => (x.deja_notees?.length ? `déjà notées = ${JSON.stringify(x.deja_notees)}` : null)))) },
  { id: 'sl12', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "J'ai travaillé de 8h à 12h puis de 13h à 17h sur un nouveau chantier, Bureau Martin à Villeurbanne.",
    check: fiche(['heures'], heures(TODAY, [['08:00', '12:00'], ['13:00', '17:00']], 480, [W.martin, W.martin], (h) => (h.nouveau?.reutilise_id === W.martin ? null : `reutilise_id = ${h.nouveau?.reutilise_id} (aucune création attendue : Bureau Martin existe déjà)`))) },
  { id: 'sl13', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Alors écoute, je te fais le récapitulatif complet de ma journée d'aujourd'hui. Ce matin j'ai commencé à 7h chez Dupont jusqu'à 10h, ensuite de 10h30 à midi chez Martin, et cet après-midi de 13h à 16h30 j'ai travaillé sur un nouveau chantier : c'est pour monsieur Ayhan Demir, 5 rue des Tilleuls à Bourg-en-Bresse 01000, pour la pose d'une pergola en aluminium avec les lames orientables. Mets-moi aussi le panier repas, et signale une réserve sur le chantier de chez Dupont : il y a une fissure sur le mur sud qu'il faudra reprendre avant la livraison. Voilà, c'est tout pour aujourd'hui, tu peux envoyer ma journée au bureau.",
    check: recapitulatifComplet },
  { id: 'sl14', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Ce matin j'ai commencé à 7h, non plutôt 7h30, jusqu'à midi chez Dupont.",
    check: fiche(['heures'], heures(TODAY, [['07:30', '12:00']], 270, [W.dupont])) },
  { id: 'sl15', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Aujourd'hui de 8h à 12h et de 13h à 17h chez Dupont, mets le panier repas, signale une réserve : fissure au plafond, pose un congé du lundi au mercredi prochain, et envoie ma journée.",
    check: cinqActions },
  { id: 'sl16', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: "Aujourd'hui de 8h à 16h30 chez Martin avec une heure de pause.",
    check: fiche(['heures'], heures(TODAY, [['08:00', '16:30']], 450, [W.martin], (h) => (h.lignes[0].pause === 60 ? null : `pause = ${h.lignes[0].pause} (attendu 60)`))) },
  // Étape 2 : une phrase LONGUE (pause en lettres) qui renvoie à la conversation : le chantier est celui d'avant (Bureau Martin), pas le planning de demain.
  { id: 'sl17', cote: 'salarie', categorie: 'Long FR', live: 'vide', phrase: 'Et pareil demain de 8h à 16h30 avec une demi-heure de pause.',
    history: tour(['me', 'J’ai travaillé de 8h à 17h chez Martin'], ['bot', 'Brouillon : 08:00–17:00 Bureau Martin. Vérifiez, puis enregistrez.']),
    check: fiche(['heures'], heures('2026-10-02', [['08:00', '16:30']], 480, [W.martin])) },
  { id: 'st01', cote: 'salarie', categorie: 'Long TR', live: 'vide', phrase: "Bugün sabah 8’den 12’ye kadar çalıştım, sonra bir saat mola verdim, sonra öğleden sonra 13’ten 17’ye kadar yeni bir şantiyede çalıştım: müşteri Pierrick Dupont, adres Montagna 01250, kollu tente montajı için.",
    check: fiche(['heures'], heures(TODAY, [['08:00', '12:00'], ['13:00', '17:00']], 480, ['NOUVEAU', 'NOUVEAU'], (h) => unSeul(ecarts([null, 'pause'])(h), nouveauChantier({ nom: 'Pierrick Dupont', ville: 'Montagna', cp: '01250', travaux: /tente|store/ })(h)))) },
  { id: 'st02', cote: 'salarie', categorie: 'Long TR', live: 'vide', phrase: "Bu sabah 7’den 10’a kadar Dupont’ta, sonra 10:30’dan 12’ye kadar Martin ofisinde, öğleden sonra da 13’ten 16:30’a kadar tekrar Dupont’ta çalıştım.",
    check: fiche(['heures'], heures(TODAY, [['07:00', '10:00'], ['10:30', '12:00'], ['13:00', '16:30']], 480, [W.dupont, W.martin, W.dupont], ecarts([null, null, null]))) },
  { id: 'st03', cote: 'salarie', categorie: 'Long TR', phrase: "Gelecek pazartesiden çarşambaya kadar izin almak istiyorum, bugünkü panier repas’yı da işaretle ve günümü büroya gönder.",
    check: fiche(['panier_repas', 'demander_conge', 'envoyer_journee'], (it) => unSeul(annexe(it, 'panier_repas', (d) => eq(d, 'valeur', true)), annexe(it, 'demander_conge', (d) => all(eq(d, 'du', '2026-10-05'), eq(d, 'au', '2026-10-07'))), annexe(it, 'envoyer_journee', (_d, x) => ((x.deja_notees?.length ?? 0) === 2 && x.depend?.includes(String(it[0].id)) ? null : `deja_notees = ${JSON.stringify(x.deja_notees)} ; dépend de ${JSON.stringify(x.depend)} (attendu les 2 lignes du jour et le panier)`)))) },
  { id: 'st04', cote: 'salarie', categorie: 'Long TR', phrase: "Dupont şantiyesinde duvarda bir çatlak buldum, rezerv olarak not et.",
    check: fiche(['signaler_reserve'], (it) => annexe(it, 'signaler_reserve', (d) => all(eq(d, 'entry_id', 'e1'), /catlak|fissure/.test(fold(d.detail)) ? null : `detail = « ${d.detail} » (attendu une fissure)`))) },
  { id: 'st05', cote: 'salarie', categorie: 'Long TR', phrase: "Bu hafta toplam kaç saat çalıştım?",
    check: (o) => enTurc(o) ?? (/7/.test(o.answer ?? '') ? null : `la réponse devait donner 7 h 30 : « ${(o.answer ?? '').slice(0, 70)} »`) },
  { id: 'st06', cote: 'salarie', categorie: 'Long TR', live: 'vide', phrase: "Şey, bugün... yani sabah erkenden 7’de Dupont’ta başladım, öğlen 12’de bıraktım, bir saat yemek molası verdim, sonra 13’ten 17’ye kadar Montagna’da yeni bir müşteri için çalıştım, adı Ayşe Kaya, posta kodu 01250, çatı tamiri yaptık.",
    check: fiche(['heures'], heures(TODAY, [['07:00', '12:00'], ['13:00', '17:00']], 540, [W.dupont, 'NOUVEAU'], nouveauChantier({ nom: 'Ayşe Kaya', ville: /^montagna/, cp: '01250', travaux: /cati|tamir|toit/ }))) },
  { id: 'st07', cote: 'salarie', categorie: 'Long TR', phrase: "Dün sabah 7:30’dan 12’ye kadar Dupont villasında, öğleden sonra 13’ten 16:30’a kadar Martin ofisinde çalıştım.",
    check: fiche(['heures'], heures('2026-09-30', [['07:30', '12:00'], ['13:00', '16:30']], 480, [W.dupont, W.martin])) },
  { id: 'st08', cote: 'salarie', categorie: 'Long TR', live: 'vide', phrase: "Bugün chantier’de 8’den 12’ye kadar ve 13’ten 17’ye kadar Martin’de çalıştım, panier repas da yaz.",
    check: fiche(['heures', 'panier_repas'], (it) => unSeul(heures(TODAY, [['08:00', '12:00'], ['13:00', '17:00']], 480, [W.martin, W.martin])(it), annexe(it, 'panier_repas', (d) => eq(d, 'valeur', true)))) },
  { id: 'st09', cote: 'salarie', categorie: 'Long TR', live: 'vide', phrase: "Bugün Martin ofisinde 8’den 16:30’a kadar çalıştım, aralarda yarım saat mola verdim ve panier’yi işaretle.",
    check: fiche(['heures', 'panier_repas'], (it) => unSeul(heures(TODAY, [['08:00', '16:30']], 480, [W.martin], (h) => (h.lignes[0].pause === 30 ? null : `pause = ${h.lignes[0].pause} (attendu 30)`))(it), annexe(it, 'panier_repas', (d) => eq(d, 'valeur', true)))) },
  { id: 'st10', cote: 'salarie', categorie: 'Long TR', live: 'vide', phrase: "Bugün Martin ofisinde çalıştım: 8’den 17’ye kadar, bir saat mola.",
    check: fiche(['heures'], heures(TODAY, [['08:00', '17:00']], 480, [W.martin], (h) => (h.lignes[0].pause === 60 ? null : `pause = ${h.lignes[0].pause} (attendu 60)`))) },
  { id: 'st11', cote: 'salarie', categorie: 'Long TR', live: 'vide', phrase: "Aujourd'hui sabah 8’den 12’ye kadar chez Dupont çalıştım, öğleden sonra 13’ten 17’ye kadar chez Martin, panier da işaretle.",
    check: fiche(['heures', 'panier_repas'], (it) => unSeul(heures(TODAY, [['08:00', '12:00'], ['13:00', '17:00']], 480, [W.dupont, W.martin])(it), annexe(it, 'panier_repas', (d) => eq(d, 'valeur', true)))) },
  // Variantes des règles R1–R3 (mesure du 2026-10 sur le vrai modèle) : la ville dite comme « adresse », un seul chantier cité pour deux créneaux.
  { id: 'st12', cote: 'salarie', categorie: 'Long TR', live: 'vide', phrase: "Bugün 9’dan 12’ye kadar ve 14’ten 17’ye kadar yeni bir şantiyede çalıştım: müşteri Ayhan Demir, adres Bron 69500, pergola montajı için.",
    check: fiche(['heures'], heures(TODAY, [['09:00', '12:00'], ['14:00', '17:00']], 360, ['NOUVEAU', 'NOUVEAU'], nouveauChantier({ nom: 'Ayhan Demir', ville: 'Bron', cp: '69500', travaux: /pergola/ }))) },
  { id: 'st13', cote: 'salarie', categorie: 'Long TR', live: 'vide', phrase: "Bugün sabah 8’den 12’ye kadar, öğleden sonra da 13’ten 17’ye kadar çalıştım, hepsi Martin’de.",
    check: fiche(['heures'], heures(TODAY, [['08:00', '12:00'], ['13:00', '17:00']], 480, [W.martin, W.martin])) },
  // Étape 2 : « Yarın da aynısı » (« demain pareil ») est une phrase TURQUE donc longue : elle doit voir la conversation pour savoir à quoi « aynısı » renvoie.
  { id: 'st14', cote: 'salarie', categorie: 'Long TR', live: 'vide', phrase: 'Yarın da aynısı.',
    history: tour(['me', 'Bugün Martin ofisinde 8’den 17’ye kadar çalıştım'], ['bot', 'Taslak hazır: 08:00–17:00 Martin ofisi. Kontrol edip kaydedin.']),
    check: fiche(['heures'], heures('2026-10-02', [['08:00', '17:00']], 540, [W.martin])) },
  // ════ SUITES DE CONVERSATION (étape 2 : le chat se souvient) ════
  // Chaque phrase est une relance qui n'a de sens qu'avec `history`. Avec les noms du jeu (Karim, Sofiane, Kevin ; pas de « Lucas »).
  // Bureau : demain = 2026-10-02, lundi = 2026-10-05 (aujourd'hui est un jeudi : « jeudi » seul serait aujourd'hui, d'où « lundi »).
  { id: 'sc01', cote: 'bureau', categorie: 'Suite de conversation', history: KARIM_DEMAIN, phrase: 'Et Kevin aussi',
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', 'u-kevin'), eq(d, 'worksite_id', W.dupont), eq(d, 'dates', ['2026-10-02']))) },
  { id: 'sc02', cote: 'bureau', categorie: 'Suite de conversation', history: KARIM_DEMAIN, phrase: 'Pareil mais lundi',
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'worksite_id', W.dupont), eq(d, 'dates', ['2026-10-05']))) },
  { id: 'sc03', cote: 'bureau', categorie: 'Suite de conversation', history: KARIM_DEMAIN, phrase: 'Non, retire ça', check: annulerAffectation },
  { id: 'sc04', cote: 'bureau', categorie: 'Suite de conversation', phrase: 'Combien d’heures sur ce chantier ?',
    history: tour(['me', 'Quel est le chantier qui a le plus d’heures ?'], ['bot', 'C’est Villa Dupont à Lyon : 152 h au total depuis le début.']),
    check: answer(undefined, /dupont|152/i) },
  // Le lecteur local lirait « pose » + « maladie » et rendrait un formulaire VIDE : la relance (« pareil », « -le ») saute le lecteur local.
  { id: 'sc05', cote: 'bureau', categorie: 'Suite de conversation', phrase: 'Pareil pour Sofiane, pose-le en maladie',
    history: tour(['me', 'Kevin est malade aujourd’hui et demain'], ['bot', 'C’est noté : Kevin en arrêt maladie du 1er au 2 octobre.']),
    check: act('poser_absence', (d) => all(eq(d, 'user_id', 'u-sofiane'), eq(d, 'absence_type', 'maladie'), eq(d, 'du', TODAY), eq(d, 'au', '2026-10-02'))) },
  { id: 'sc06', cote: 'bureau', categorie: 'Suite de conversation', phrase: 'Et l’après-midi de 14h à 18h',
    history: tour(['me', 'Rajoute-moi une intervention à Lyon demain de 8h à 12h'], ['bot', 'C’est fait : intervention à Lyon demain de 08:00 à 12:00.']),
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', ME), eq(d, 'worksite_id', W.autre), eq(d, 'dates', ['2026-10-02']), eq(d, 'debut', '14:00'), eq(d, 'fin', '18:00'), has(d, 'note', /lyon/i))) },
  // Un « comment » qui continue un guide est une QUESTION (repondre), pas l'ordre de supprimer.
  { id: 'sc07', cote: 'bureau', categorie: 'Suite de conversation', phrase: 'Et pour la supprimer ?',
    history: tour(['me', 'Comment je déplace une intervention ?'], ['bot', 'Déplacer une intervention :\n1. Sur le planning, cliquez la case.\n2. Choisissez la nouvelle date.\n3. Enregistrez.']),
    check: answer(undefined, /supprim|retir|effac|corbeille|croix/i) },
  // Salarié, français. Journée vide : les heures de ce matin ne sont qu'un brouillon (le cas n'est pas « Déjà noté aujourd'hui »).
  { id: 'sc08', cote: 'salarie', categorie: 'Suite de conversation', live: 'vide', phrase: 'Et l’après-midi de 13h à 16h30 pareil',
    history: tour(['me', 'Ce matin 7h30-12h chez Dupont'], ['bot', 'Brouillon : 07:30–12:00 Villa Dupont. Vérifiez, puis enregistrez.']),
    check: draft(apresMidiDeSuite(W.dupont, ['07:30', '12:00'], ['13:00', '16:30'])) },
  { id: 'sc09', cote: 'salarie', categorie: 'Suite de conversation', live: 'vide', phrase: 'et la pause c’était 30 minutes',
    history: tour(['me', 'J’ai travaillé de 8h à 16h30 chez Martin'], ['bot', 'Brouillon : 08:00–16:30 Bureau Martin. Vérifiez, puis enregistrez.']),
    check: draft((l) => (l.length === 1 && l[0].worksite_id === W.martin && l[0].start === '08:00' && l[0].end === '16:30' && l[0].break_minutes === 30 ? null : `lignes : ${JSON.stringify(l.map((x) => [x.worksite_id, x.start, x.end, x.break_minutes]))} (attendu UNE ligne 08:00-16:30 Bureau Martin, pause 30)`)) },
  { id: 'sc10', cote: 'salarie', categorie: 'Suite de conversation', phrase: 'Et Kevin ?',
    history: tour(['me', 'Où est Sofiane demain ?'], ['bot', 'Demain — Sofiane : Pizzeria Exemple (Mâcon), 8h–12h']),
    check: coll('kevin', '2026-10-02') },
  // Salarié, turc : relances courtes (un seul indice de turc, donc profil court), sur une phrase turque d'avant.
  { id: 'sc11', cote: 'salarie', categorie: 'Suite de conversation', live: 'vide', phrase: 'Mola bir saatti.',
    history: tour(['me', 'Bugün Martin ofisinde 8’den 17’ye kadar çalıştım'], ['bot', 'Taslak hazır: 08:00–17:00 Martin ofisi. Kontrol edip kaydedin.']),
    check: draft((l) => (l.length === 1 && l[0].worksite_id === W.martin && l[0].start === '08:00' && l[0].end === '17:00' && l[0].break_minutes === 60 ? null : `lignes : ${JSON.stringify(l.map((x) => [x.worksite_id, x.start, x.end, x.break_minutes]))} (attendu UNE ligne 08:00-17:00 Bureau Martin, pause 60)`)) },
  // La réponse doit REPRENDRE les 7 h 30 d'hier (la relance est comprise) ; sa langue n'est pas contrôlée ici : un seul indice de turc
  // = profil court, dont la consigne répond en français (le turc complet, lui, passe par le profil long et le contrôle `enTurc` de st05).
  { id: 'sc12', cote: 'salarie', categorie: 'Suite de conversation', phrase: 'Peki ya dün?',
    history: tour(['me', 'Bu hafta kaç saat çalıştım?'], ['bot', 'Bu hafta toplam 7 saat 30 dakika çalıştınız.']),
    check: answer(undefined, /7/) },
  // La RÉPONSE à une question de l'assistant : l'écran recolle la demande d'origine à la réponse (« demande, réponse »), alors que `history` porte déjà
  // la demande. Attendu : l'ACTION complète, jamais une réponse du genre « c'est déjà fait » ni un traitement de « Villa Dupont » seul.
  { id: 'sc13', cote: 'bureau', categorie: 'Suite de conversation', phrase: 'Mets Karim demain, Villa Dupont',
    history: tour(['me', 'Mets Karim demain'], ['bot', 'Sur quel chantier ?']),
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'worksite_id', W.dupont), eq(d, 'dates', ['2026-10-02']))) },
  // Salarié : la réserve de « Villa Dupont » (la ligne e1 du jeu), pas une réponse.
  { id: 'sc14', cote: 'salarie', categorie: 'Suite de conversation', phrase: 'Il y a une fissure au plafond, Villa Dupont',
    history: tour(['me', 'Il y a une fissure au plafond'], ['bot', 'Sur quel chantier ?']),
    check: act('signaler_reserve', (d) => all(eq(d, 'entry_id', 'e1'), has(d, 'detail', /fissure/i))) },
  // Plage horaire NUE (ni « pareil » ni chantier dit) : le chantier est celui de ce matin (Bureau Martin), pas celui du planning (Villa Dupont).
  { id: 'sc15', cote: 'salarie', categorie: 'Suite de conversation', live: 'vide', phrase: 'Et l’après-midi de 13h à 16h30',
    history: tour(['me', 'Ce matin 7h30-12h chez Martin'], ['bot', 'Brouillon : 07:30–12:00 Bureau Martin. Vérifiez, puis enregistrez.']),
    check: draft(apresMidiDeSuite(W.martin, ['07:30', '12:00'], ['13:00', '16:30'])) },

  // ════ LIVRAISON 3a DE L'ÉTAPE 3 : 34 cas ajoutés en fin de jeu (be, se, ov, st15–st18) ════
  // ── Bureau (be01–be19) : les 5 outils qui n'avaient AUCUN cas ──
  // corriger_pointage (« Réglages » = « Réglages / paie / réserves » de b26–b28) : le salarié lit le motif, donc il est toujours demandé. Hier = 2026-09-30.
  { id: 'be01', cote: 'bureau', categorie: 'Réglages', phrase: 'karim a oublié de badger hier matin, corrige ses heures : 7h30 à 16h, motif badge oublié',
    check: actAvecProblemes('corriger_pointage', [AUCUNE_LIGNE], (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'date', '2026-09-30'), eq(d, 'debut', '07:30'), eq(d, 'fin', '16:00'), has(d, 'motif', /badge/i))) },
  { id: 'be02', cote: 'bureau', categorie: 'Réglages', phrase: 'kevin hier c’était 8h-17h30 et pas 8h-16h, corrige ses heures, il a prolongé pour finir le chantier',
    check: actAvecProblemes('corriger_pointage', [AUCUNE_LIGNE], (d) => all(eq(d, 'user_id', 'u-kevin'), eq(d, 'date', '2026-09-30'), eq(d, 'debut', '08:00'), eq(d, 'fin', '17:30'), has(d, 'motif', /prolong|finir|chantier/i))) },
  { id: 'be03', cote: 'bureau', categorie: 'Réglages', phrase: 'corige le pointage de sofiane d’hier : 6h30 15h, motif : chantier commencé plus tot',
    check: actAvecProblemes('corriger_pointage', [AUCUNE_LIGNE], (d) => all(eq(d, 'user_id', 'u-sofiane'), eq(d, 'date', '2026-09-30'), eq(d, 'debut', '06:30'), eq(d, 'fin', '15:00'), has(d, 'motif', /t[oô]t|commenc/i))) },
  // attribuer_client : des heures notées sur « Autre » (ou sans chantier) passent au vrai client.
  { id: 'be04', cote: 'bureau', categorie: 'Réglages', phrase: 'les heures de kevin hier étaient notées sur Autre, mets les sur villa dupont',
    check: act('attribuer_client', (d) => all(eq(d, 'user_id', 'u-kevin'), eq(d, 'date', '2026-09-30'), eq(d, 'worksite_id', W.dupont))) },
  // Deux « Pizzeria Exemple » : la ville dite (Mâcon) départage.
  { id: 'be05', cote: 'bureau', categorie: 'Réglages', phrase: 'kevin a travaillé chez pizzeria exemple à mâcon hier mais il a mis autre, rectifie',
    check: act('attribuer_client', (d) => all(eq(d, 'user_id', 'u-kevin'), eq(d, 'date', '2026-09-30'), eq(d, 'worksite_id', W.macon))) },
  // cout_reel : bulletin d'un salarié qui EXISTE (FILES.bulletin). Change avec Q7 (le bulletin ne partirait plus au modèle).
  { id: 'be06', cote: 'bureau', categorie: 'Réglages', file: 'bulletin', phrase: 'voilà le bulletin de paie de karim de septembre, enregistre son coût réel',
    check: act('cout_reel', coutDeKarim) },
  { id: 'be07', cote: 'bureau', categorie: 'Réglages', file: 'bulletin', phrase: 'bulletin karim sept, tu peux rentrer le cout reel stp',
    check: act('cout_reel', coutDeKarim) },
  // modifier_salarie : prénom, nom ou téléphone d'un salarié (jamais le n° de sécurité sociale). Le téléphone d'un salarié n'est pas celui d'un client (b14).
  { id: 'be08', cote: 'bureau', categorie: 'Salariés', phrase: 'change le téléphone de karim : 06 11 22 33 44',
    check: act('modifier_salarie', (d) => all(eq(d, 'user_id', 'u-karim'), has(d, 'telephone', /06 ?11 ?22 ?33 ?44/))) },
  // Le modèle peut redonner le prénom inchangé : sans effet sur la carte, donc toléré ; ce qui compte est le nouveau nom.
  { id: 'be09', cote: 'bureau', categorie: 'Salariés', phrase: 'corrige le nom de famille de kevin, c’est Rousselet pas Roussel',
    check: act('modifier_salarie', (d) => all(eq(d, 'user_id', 'u-kevin'), eq(d, 'nom', 'Rousselet'), d.prenom === '' || d.prenom === 'Kevin' ? null : `prenom = ${JSON.stringify(d.prenom)} (vide ou inchangé attendu)`)) },
  { id: 'be10', cote: 'bureau', categorie: 'Salariés', phrase: 'j’ai mal écrit le prénom de sofiane, c’est Soufiane avec un u',
    check: act('modifier_salarie', (d) => all(eq(d, 'user_id', 'u-sofiane'), eq(d, 'prenom', 'Soufiane'))) },
  // modifier_habilitation : la date ou le libellé d'une habilitation qui EXISTE (le CACES de Karim, c-caces) ; ajouter_habilitation en crée une (b23).
  { id: 'be11', cote: 'bureau', categorie: 'Salariés', phrase: 'change la date d’expiration du caces de karim : 15 mai 2027',
    check: act('modifier_habilitation', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'cert_id', 'c-caces'), eq(d, 'expiration', '2027-05-15'))) },
  { id: 'be12', cote: 'bureau', categorie: 'Salariés', phrase: 'précise sur le caces de karim que c’est le R489 catégorie 3',
    check: act('modifier_habilitation', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'cert_id', 'c-caces'), has(d, 'libelle', /R489/i))) },
  // ── Bureau (suite) : le côté mince des paires d'outils proches ──
  // modifier_intervention ↔ affecter_planning : une intervention qui EXISTE (la case de Karim demain, p-karim-4) change d'heure, de salarié ou de note ; on n'en crée pas une deuxième.
  { id: 'be13', cote: 'bureau', categorie: 'Interventions', phrase: 'mets karim à 10h au lieu de 8h demain chez dupont',
    check: act('modifier_intervention', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'date', '2026-10-02'), eq(d, 'planning_id', 'p-karim-4'), eq(d, 'debut', '10:00'))) },
  { id: 'be14', cote: 'bureau', categorie: 'Interventions', phrase: 'karim ne peut pas vendredi, donne son intervention à sofiane',
    check: act('modifier_intervention', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'date', '2026-10-02'), eq(d, 'planning_id', 'p-karim-4'), eq(d, 'nouveau_user_id', 'u-sofiane'))) },
  { id: 'be15', cote: 'bureau', categorie: 'Interventions', phrase: 'change la note de l’intervention de karim vendredi : prévoir l’échafaudage',
    check: act('modifier_intervention', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'planning_id', 'p-karim-4'), has(d, 'note', /chafaudage/i))) },
  // relancer_invitation ↔ envoyer_rappel : le même mot « relance », deux destinataires (une invitation en attente / un salarié qui n'a pas envoyé ses heures).
  { id: 'be16', cote: 'bureau', categorie: 'Salariés', phrase: 'relance marc, il a pas encore créé son compte',
    check: act('relancer_invitation', (d) => eq(d, 'email', 'marc.durand@gmail.com')) },
  { id: 'be17', cote: 'bureau', categorie: 'Salariés', phrase: 'relance kevin, il a pas envoyé ses heures',
    check: act('envoyer_rappel', (d) => eq(d, 'user_id', 'u-kevin')) },
  // inviter_salarie ↔ cout_reel : un bulletin de paie joint, mais d'un salarié qui n'existe pas encore (FILES.bulletinNouveau) → on l'invite. Change avec Q7.
  { id: 'be18', cote: 'bureau', categorie: 'Salariés', file: 'bulletinNouveau', phrase: 'nouveau salarié : Lucas Moreau, lucas.moreau@exemple.fr, voilà son dernier bulletin de paie',
    check: act('inviter_salarie', (d) => all(eq(d, 'prenom', 'Lucas'), eq(d, 'nom', 'Moreau'), eq(d, 'email', 'lucas.moreau@exemple.fr'), bulletinDeLucas(d), sansNir(d))) },
  // ajouter_depense ↔ ranger_document : même facture jointe que b17/b18, mais on demande la DÉPENSE (le montant passe en « Coût chantiers »), pas le classement.
  { id: 'be19', cote: 'bureau', categorie: 'Documents', file: 'facture', phrase: 'mets cette facture en dépense sur le chantier de viriat',
    check: act('ajouter_depense', (d) => all(eq(d, 'worksite_id', W.ppj), nb(d, 'montant', 1240))) },

  // ── Salarié, français (se01–se06) ──
  // « Réserves » (1 → 5) : signaler ≠ lever ≠ retirer. Seule la ligne de Bureau Martin (e2) a une réserve ouverte ; Villa Dupont (e1) n'en a pas.
  { id: 'se01', cote: 'salarie', categorie: 'Réserves', phrase: 'ya une grosse fuite chez dupont, note une réserve',
    check: act('signaler_reserve', (d) => all(eq(d, 'entry_id', 'e1'), has(d, 'detail', /fuite/i))) },
  { id: 'se02', cote: 'salarie', categorie: 'Réserves', phrase: 'c’est réglé chez martin, tu peux lever la réserve', check: act('reserve_corrigee', (d) => eq(d, 'entry_id', 'e2')) },
  { id: 'se03', cote: 'salarie', categorie: 'Réserves', phrase: 'j’ai refait le joint chez martin, la réserve est levée', check: act('reserve_corrigee', (d) => eq(d, 'entry_id', 'e2')) },
  { id: 'se04', cote: 'salarie', categorie: 'Réserves', phrase: 'j’ai mis une réserve chez martin par erreur, enlève la', check: act('retirer_reserve', (d) => eq(d, 'entry_id', 'e2')) },
  // modifier_heures ↔ declarer_heures : une ligne DÉJÀ notée (Bureau Martin, e2) change d'horaire ; on n'en déclare pas une autre. copier_journee : la journée d'hier (09-30) sur demain.
  { id: 'se05', cote: 'salarie', categorie: 'Ma journée', phrase: 'corrige ma ligne de martin, 13h15 16h45',
    check: act('modifier_heures', (d) => all(eq(d, 'entry_id', 'e2'), eq(d, 'debut', '13:15'), eq(d, 'fin', '16:45'))) },
  { id: 'se06', cote: 'salarie', categorie: 'Ma journée', phrase: 'refais la même journée qu’hier pour demain',
    check: act('copier_journee', (d) => all(eq(d, 'depuis', '2026-09-30'), eq(d, 'vers', ['2026-10-02']))) },

  // ── OUVRIR un écran (catégorie « Aide », comme b29, b30 et b33 qui contrôlent aussi un lien). Aujourd'hui : un LIEN de navigation (ou un guide) dans une réponse,
  // jamais une écriture ; 3b en fera une ouverture pré-remplie, et ces cinq cas (plus st18, en turc) devront alors attendre l'ouverture. ──
  // ov01 : la fiche D'UN salarié (lien « salarie » + son id), pas la liste des salariés. ov02 : le guide des réserves, lu sans modèle. ov03 : « les demandes de congé »
  // est un écran à ouvrir, pas des demandes auxquelles répondre (repondre_conge). ov04 : « les réglages » s'ouvrent, on n'en modifie aucun (modifier_reglages).
  { id: 'ov01', cote: 'bureau', categorie: 'Aide', phrase: 'ouvre la fiche de Karim', check: answer('salarie:u-karim') },
  { id: 'ov02', cote: 'bureau', categorie: 'Aide', phrase: 'montre-moi les réserves', check: answer('reserves') },
  { id: 'ov03', cote: 'bureau', categorie: 'Aide', phrase: 'emmène-moi sur les demandes de congé', check: answer('conges') },
  { id: 'ov04', cote: 'bureau', categorie: 'Aide', phrase: 'va dans les réglages', check: answer('reglages') },
  // ov05 : côté salarié, le lien « Ma semaine » (écran à ouvrir, pas des heures à déclarer).
  { id: 'ov05', cote: 'salarie', categorie: 'Aide', phrase: 'ouvre ma semaine', check: answer('semaine') },

  // ── Salarié, turc (st15–st18 ; profil LONG, comme tout message turc de 2 indices ou plus) ──
  // st15–st17 : une fiche ou une carte à confirmer (un geste « direct » ne s'exécute jamais seul en profil long) ; st18 : une réponse en turc qui porte le lien (ouvrir « Ma semaine »).
  { id: 'st15', cote: 'salarie', categorie: 'Long TR', phrase: 'Martin ofisindeki rezervi yerinde düzelttim, lütfen bugün kapatın.',
    check: fiche(['reserve_corrigee'], (it) => annexe(it, 'reserve_corrigee', (d) => eq(d, 'entry_id', 'e2'))) },
  { id: 'st16', cote: 'salarie', categorie: 'Long TR', phrase: 'Dupont villasında çatıda sızıntı var, rezerv ekle.',
    check: fiche(['signaler_reserve'], (it) => annexe(it, 'signaler_reserve', (d) => all(eq(d, 'entry_id', 'e1'), /sizinti|cati|fuite|toit|infiltr/.test(fold(d.detail)) ? null : `detail = « ${d.detail} » (attendu la fuite du toit)`))) },
  { id: 'st17', cote: 'salarie', categorie: 'Long TR', phrase: 'Bugünkü Dupont satırımı değiştir lütfen: 7’den 11:30’a kadar.',
    check: act('modifier_heures', (d) => all(eq(d, 'entry_id', 'e1'), eq(d, 'debut', '07:00'), eq(d, 'fin', '11:30'))) },
  { id: 'st18', cote: 'salarie', categorie: 'Long TR', phrase: 'Haftalık ekranımı aç lütfen.', check: (o) => enTurc(o) ?? answer('semaine')(o) },

  // ── Livraison 3b-0 : les trois fiches du GUIDE corrigées (imprimer ≠ exporter, chantier terminé ≠ archiver, la borne a sa fenêtre). Cinq cas « Aide », lus par le lecteur
  // local sans modèle (comme ov02) : ils vérifient le LIEN et ce que la fiche DIT, et que l'ancienne réponse fausse ne revient pas. ──
  // La mention porte sur le TITRE de la fiche : c'est lui qui distingue la bonne fiche de l'ancienne (« Télécharger les heures… », « Archiver un client (chantier terminé) »).
  { id: 'gu01', cote: 'bureau', categorie: 'Aide', phrase: 'comment j’imprime le planning ?', check: answer('planning', /^Imprimer le planning :/) },
  { id: 'gu02', cote: 'bureau', categorie: 'Aide', phrase: 'le chantier villa dupont est terminé, comment je le range ?', check: answer('clients', /^Terminer un chantier/) },
  { id: 'gu03', cote: 'bureau', categorie: 'Aide', phrase: 'où est la borne ?', check: answer('planning', /^Relier la tablette[\s\S]*Relier une autre tablette/) },
  { id: 'gu04', cote: 'bureau', categorie: 'Aide', phrase: 'comment je termine le chantier villa dupont ?', check: answer('clients', /^Terminer un chantier/) },
  { id: 'gu05', cote: 'bureau', categorie: 'Aide', phrase: 'comment j’archive le client bureau martin ?', check: answer('clients', /^Archiver un client :/) },
];
