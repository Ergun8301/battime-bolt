// Lot 7 — JEU D'ÉVALUATION de l'Assistant BEMEXO : 50 phrases réelles (bureau
// et salarié, BTP et restauration, fautes et langage oral compris), chacune avec
// le résultat attendu. « Correct » = la bonne action, les bons champs, prête à
// être faite DU PREMIER COUP (ou la bonne réponse / le bon écran).
// Entreprise fictive, date figée : jeudi 1er octobre 2026.

export const TODAY = '2026-10-01';
export const ME = 'u-ergun';

/** Facture de plombier ACQUITTÉE (PDF, texte) et devis (PDF), PNG vide. */
export const FILES = {
  facture: { mime: 'application/pdf', base64: 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAyNTkgPj4Kc3RyZWFtCkJUIC9GMSAxNCBUZiA1MCA3ODAgVGQgMTggVEwgKFBMT01CRVJJRSBNQVJUSU4gU0FSTCkgVGogVCogKEZBQ1RVUkUgTi4gMjAyNi0xMTgpIFRqIFQqIChDbGllbnQgOiBQaWVycmUtUGF1bCBKYWNxdWVzLCBWaXJpYXQpIFRqIFQqIChSZW1wbGFjZW1lbnQgY2hhdWZmZS1lYXUgMjAwIEwpIFRqIFQqIChUb3RhbCBUVEMgOiAxIDI0MCwwMCBFVVIpIFRqIFQqIChBQ1FVSVRURUUgLSBQYXllZSBsZSAyOC8wOS8yMDI2IHBhciB2aXJlbWVudCkgVGogVCogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA1NTEgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo2MjEKJSVFT0YK' },
  devis: { mime: 'application/pdf', base64: 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAyNzEgPj4Kc3RyZWFtCkJUIC9GMSAxNCBUZiA1MCA3ODAgVGQgMTggVEwgKEJBVEktUkVOT1YpIFRqIFQqIChERVZJUyBOLiBELTA0MTIpIFRqIFQqIChDbGllbnQgOiBNYWlzb24gR2FybmllciwgMTIgcnVlIGRlcyBMaWxhcywgNjkzMDAgQ2FsdWlyZSkgVGogVCogKFJlbm92YXRpb24gc2FsbGUgZGUgYmFpbikgVGogVCogKFRvdGFsIEhUIDogMTggNDAwLDAwIEVVUikgVGogVCogKE1haW4gZCBvZXV2cmUgZXN0aW1lZSA6IDE2MCBoZXVyZXMpIFRqIFQqIChWYWxhYmxlIDMgbW9pcykgVGogVCogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA1NjMgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo2MzMKJSVFT0YK' },
  photo: { mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' },
};

const C = 'co-eval';
const W = {
  dupont: 'w-dupont', martin: 'w-martin', macon: 'w-mgk-macon', bourg: 'w-mgk-bourg', ppj: 'w-ppj-viriat', autre: 'w-autre',
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
    { id: W.macon, company_id: C, client_name: 'Mister Grill Kebab', city: 'Mâcon' },
    { id: W.bourg, company_id: C, client_name: 'Mister Grill Kebab', city: 'Bourg-en-Bresse' },
    { id: W.ppj, company_id: C, client_name: 'Pierre-Paul Jacques', city: 'Viriat' },
    { id: W.autre, company_id: C, client_name: 'Autre', city: '' },
  ],
  planning: [
    ...['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((d, i) => ({
      id: `p-karim-${i}`, user_id: 'u-karim', company_id: C, work_date: d, worksite_id: W.dupont, absence_type: null, notes: null, estimated_start: '08:00:00',
    })),
    { id: 'p-kevin-1', user_id: 'u-kevin', company_id: C, work_date: '2026-10-01', worksite_id: W.macon, absence_type: null, notes: null, estimated_start: null },
  ],
  leaves: [{ id: 'l-kevin', user_id: 'u-kevin', company_id: C, type: 'conge', start_date: '2026-10-12', end_date: '2026-10-16' }],
  invitations: [{ company_id: C, email: 'marc.durand@gmail.com', first_name: 'Marc', last_name: 'Durand', phone: null }],
  reserves: [{ id: 'r-karim', company_id: C, user_id: 'u-karim', work_date: '2026-09-30', worksite_id: W.dupont, observation: 'Joint silicone à reprendre' }],
  closures: [],
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
};
export const LIVE_EN_COURS = { chantier_id: W.macon, chantier: 'Mister Grill Kebab', depuis: '2026-10-01T06:30:00Z' };

// ── Résultat normalisé (quelle que soit la version) ─────────────────────────
export interface Outcome {
  kind: 'action' | 'answer' | 'draft' | 'collegues' | 'none';
  type?: string;
  draft?: Record<string, unknown>;
  problems?: string[];
  answer?: string;
  links?: string[];
  qui?: string; date?: string;
}
type Check = (o: Outcome) => string | null;

const act = (type: string, f: (d: Record<string, unknown>) => string | null = () => null): Check => (o) => {
  if (o.kind !== 'action') return `attendu l'action ${type}, obtenu ${o.kind}${o.answer ? ` (« ${o.answer.slice(0, 60)} »)` : ''}`;
  if (o.type !== type) return `attendu ${type}, obtenu ${o.type}`;
  if (o.problems?.length) return `pas prête : ${o.problems.join(' / ')}`;
  return f(o.draft ?? {});
};
const eq = (d: Record<string, unknown>, k: string, v: unknown) => (JSON.stringify(d[k]) === JSON.stringify(v) ? null : `${k} = ${JSON.stringify(d[k])} (attendu ${JSON.stringify(v)})`);
const all = (...r: (string | null)[]) => r.find((x) => x) ?? null;
const has = (d: Record<string, unknown>, k: string, re: RegExp) => (re.test(String(d[k] ?? '')) ? null : `${k} = « ${d[k]} » (attendu ${re})`);
const clean = (d: Record<string, unknown>, k: string) => (/^(euh|alors|bon|du coup|c'est|pour)\b/i.test(String(d[k] ?? '').trim()) || /^[a-zà-ÿ]/.test(String(d[k] ?? '')) ? `${k} mal formé : « ${d[k]} »` : null);
const answer = (link?: string): Check => (o) => {
  if (o.kind !== 'answer') return `attendu une réponse, obtenu ${o.kind} ${o.type ?? ''}`;
  if (!o.answer || o.answer.length < 10) return 'réponse vide';
  if (/je n.?ai pas acc[eè]s|je ne peux pas/i.test(o.answer)) return `refus : « ${o.answer.slice(0, 60)} »`;
  if (link && !(o.links ?? []).includes(link)) return `lien ${link} manquant (${(o.links ?? []).join(',')})`;
  return null;
};
const draft = (f: (lines: Record<string, unknown>[], date: string) => string | null): Check => (o) => {
  if (o.kind !== 'draft') return `attendu des heures, obtenu ${o.kind} ${o.type ?? ''}`;
  const d = o.draft as { date: string; lines: Record<string, unknown>[]; errors: string[] };
  if (d.errors?.length) return `erreurs : ${d.errors.join(' / ')}`;
  if (d.lines.some((l) => !l.worksite_id)) return 'chantier non trouvé';
  return f(d.lines, d.date);
};
const coll = (qui: string, date: string): Check => (o) => (o.kind !== 'collegues' ? `attendu le planning des collègues, obtenu ${o.kind} ${o.type ?? ''}`
  : (o.qui ?? '').toLowerCase() !== qui ? `qui = « ${o.qui} » (attendu « ${qui} »)` : o.date !== date ? `date = ${o.date} (attendu ${date})` : null);

export interface EvalCase { id: string; cote: 'bureau' | 'salarie'; categorie: string; phrase: string; file?: keyof typeof FILES; enCours?: boolean; check: Check }

export const CASES: EvalCase[] = [
  // ════ BUREAU ════
  // Planning / interventions
  { id: 'b01', cote: 'bureau', categorie: 'Interventions', phrase: 'Rajoute-moi une intervention à Lyon aujourd’hui de 14h à 18h',
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', ME), eq(d, 'worksite_id', W.autre), eq(d, 'dates', [TODAY]), eq(d, 'debut', '14:00'), eq(d, 'fin', '18:00'), has(d, 'note', /lyon/i))) },
  { id: 'b02', cote: 'bureau', categorie: 'Interventions', phrase: 'rajoute moi une intervention a annecy demain de 8h a 12h',
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', ME), eq(d, 'worksite_id', W.autre), eq(d, 'dates', ['2026-10-02']), eq(d, 'debut', '08:00'), eq(d, 'fin', '12:00'), has(d, 'note', /annecy/i))) },
  { id: 'b03', cote: 'bureau', categorie: 'Interventions', phrase: 'euh ajoute une intervention chez dupont jeudi prochain à 14h pour karim, c’est pour le remplacement du chauffe-eau',
    check: act('affecter_planning', (d) => all(eq(d, 'user_id', 'u-karim'), eq(d, 'worksite_id', W.dupont), eq(d, 'dates', ['2026-10-08']), eq(d, 'debut', '14:00'), has(d, 'note', /chauffe-eau/i), clean(d, 'note'))) },
  { id: 'b04', cote: 'bureau', categorie: 'Interventions', phrase: 'mets kevin sur mister grill macon lundi et mardi',
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
    check: (o) => (o.kind === 'action' && o.type === 'creer_chantier' ? all(has(o.draft ?? {}, 'nom_client', /garnier/i), has(o.draft ?? {}, 'budget_montant', /^18400/)) : `attendu creer_chantier, obtenu ${o.kind} ${o.type ?? ''}`) },
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
  // ════ SALARIÉ ════
  { id: 's01', cote: 'salarie', categorie: 'Heures', phrase: 'ce matin 7h30 12h villa dupont et aprem 13h 16h30 bureau martin',
    check: draft((l) => (l.length === 2 && l[0].worksite_id === W.dupont && l[1].worksite_id === W.martin && l[0].start === '07:30' && l[1].end === '16:30' ? null : `lignes : ${JSON.stringify(l.map((x) => [x.worksite_id, x.start, x.end]))}`)) },
  { id: 's02', cote: 'salarie', categorie: 'Heures', phrase: 'rajoute moi une intervention à annecy de 14h à 18h',
    check: draft((l) => (l.length === 1 && l[0].worksite_id === W.autre && l[0].start === '14:00' && l[0].end === '18:00' && /annecy/i.test(String(l[0].observation ?? '')) ? null : `lignes : ${JSON.stringify(l)}`)) },
  { id: 's03', cote: 'salarie', categorie: 'Heures', phrase: 'hier j’ai bossé de 8h à 17h avec 1h de pause chez dupont',
    check: draft((l, date) => (date === '2026-09-30' && l.length === 1 && l[0].worksite_id === W.dupont && l[0].start === '08:00' && l[0].end === '17:00' && l[0].break_minutes === 60 ? null : `${date} ${JSON.stringify(l)}`)) },
  { id: 's04', cote: 'salarie', categorie: 'Heures', phrase: 'jai fait 6h 14h au kebab de bourg',
    check: draft((l) => (l.length === 1 && l[0].worksite_id === W.bourg && l[0].start === '06:00' && l[0].end === '14:00' ? null : `lignes : ${JSON.stringify(l)}`)) },
  { id: 's05', cote: 'salarie', categorie: 'Pointage', phrase: 'je commence sur mister grill macon', check: act('commencer_pointage', (d) => eq(d, 'worksite_id', W.macon)) },
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
];
