// Banc de démonstration du BUREAU (/admin) : une base SIMULÉE avec état (aucune vraie base, aucun e-mail), les données de la planche du designer
// (semaine S-42, 12 – 18 octobre 2026, jeudi 15 octobre 2026), et le serveur du dossier `out/`. Utilisé par fidelite-bureau.mjs.
// `jeu: '2a'` : les données de la maquette 2a de la planche d'essai (planning-2a-controles.mjs).
//   const sim = await demarrer({ out: 'out', port: 4421 });  const { page, ctx } = await sim.page({ ui: 2, largeur: 1440, hauteur: 900 });
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
export const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const NOW = new Date('2026-10-15T09:30:00+02:00');
const CO = 'c0000000-0000-0000-0000-0000000000b1';
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
// Même hachage que components/planning-bubble.tsx : la couleur d'un chantier se lit sur son identifiant (index 0 à 6).
const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return Math.abs(h); };
const idPour = (nom, index) => { for (let n = 0; n < 4000; n++) { const id = `ws-${nom}-${n}`; if (hashStr(id) % 7 === index) return id; } return `ws-${nom}`; };
export const CLIENTS = {
  VE: { id: idPour('ve', 0), client_name: 'Villa Exemple', product_type: 'Menuiseries', city: 'Lyon' },
  MD: { id: idPour('md', 1), client_name: 'Maison Démo', product_type: 'Volets roulants', city: 'Bron' },
  RT: { id: idPour('rt', 2), client_name: 'Résidence Test', product_type: 'Portes de garage', city: 'Villeurbanne' },
  AF: { id: idPour('af', 3), client_name: 'Atelier Fictif', product_type: 'Stores', city: 'Vénissieux' },
  GD: { id: idPour('gd', 4), client_name: 'Garage Démo', product_type: 'Portail', city: 'Caluire' },
  IM: { id: idPour('im', 5), client_name: 'Immeuble Modèle', product_type: 'Fenêtres PVC', city: 'Lyon 3e' },
  BT: { id: idPour('bt', 6), client_name: 'Bureaux Témoin', product_type: 'Pergola', city: 'Écully' },
  AU: { id: 'ws-autre', client_name: 'Autre', product_type: null, city: null },
};
const WS = Object.values(CLIENTS).map((w) => ({ ...w, company_id: CO, is_active: true, address: null, phone: null, email: null, description: null, created_at: '2026-01-01' }));
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01', photo_url: null });
export const PERSONNES = [
  u('u-alex', 'Alex', 'Test'), u('u-bruno', 'Bruno', 'Exemple'), u('u-camille', 'Camille', 'Démo', 'lead'), u('u-dina', 'Dina', 'Fictive'),
  u('u-eli', 'Eli', 'Martin-Lefebvre-Dubois de la Roche-Valmont'), u('u-fanny', 'Fanny', 'Essai'), u('u-gabriel', 'Gabriel', 'Témoin'), u('u-hugo', 'Hugo', 'Modèle'),
];
const slot = (id, user_id, jour, cl, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: cl ? CLIENTS[cl].id : null, work_date: D_(jour), absence_type: null, estimated_start: null, estimated_end: null, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: '2026-10-01T06:00:00Z', ...extra });
const H = (a, b) => ({ estimated_start: `${a}:00`, estimated_end: `${b}:00` });
const entree = (id, user_id, jour, cl, status, debut, fin, extra = {}) => {
  const [a, am] = debut.split(':').map(Number); const [b, bm] = fin.split(':').map(Number);
  return { id, company_id: CO, user_id, work_date: D_(jour), worksite_id: cl ? CLIENTS[cl].id : null, planning_id: null, status, start_time: `${debut}:00`, end_time: `${fin}:00`, total_minutes: Math.min((b * 60 + bm) - (a * 60 + am), (b * 60 + bm) - (a * 60 + am) >= 480 ? 480 : 9999), reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, locked: status !== 'draft', submitted_at: status === 'draft' ? null : '2026-10-12T17:00:00Z', ...extra };
};
const LUN = 12, MAR = 13, MER = 14, JEU = 15, VEN = 16;

export const fraiche = () => {
  const planning = [
    // Alex
    slot('a-lun1', 'u-alex', LUN, 'VE', H('07:30', '11:45')), slot('a-lun2', 'u-alex', LUN, 'MD', H('13:00', '17:00')), slot('a-mar', 'u-alex', MAR, 'VE', H('07:30', '16:30')), slot('a-mer', 'u-alex', MER, 'MD', H('07:30', '16:00')),
    slot('a-jeu1', 'u-alex', JEU, 'VE', H('08:00', '12:00')), slot('a-jeu2', 'u-alex', JEU, 'RT', H('13:30', '17:00')), slot('a-ven', 'u-alex', VEN, 'VE'),
    // Bruno
    slot('b-lun', 'u-bruno', LUN, 'RT'), slot('b-mar', 'u-bruno', MAR, 'RT'), slot('b-mer', 'u-bruno', MER, 'RT', H('07:30', '16:00')), slot('b-jeu1', 'u-bruno', JEU, 'AF', H('07:30', '11:30')), slot('b-jeu2', 'u-bruno', JEU, 'AF', H('13:30', '17:00')), slot('b-ven', 'u-bruno', VEN, 'AF', { notes: 'Prendre l’escabeau long' }),
    // Camille
    slot('c-lun1', 'u-camille', LUN, 'IM', H('07:00', '12:00')), slot('c-lun2', 'u-camille', LUN, 'GD', H('13:00', '16:30')), slot('c-mar', 'u-camille', MAR, 'IM', H('07:00', '16:00')), slot('c-mer1', 'u-camille', MER, 'IM', H('07:00', '13:00')),
    slot('c-mer2', 'u-camille', MER, 'BT', { ...H('14:00', '19:00'), added_by_worker: true }), slot('c-jeu', 'u-camille', JEU, 'IM', H('07:00', '11:00')), slot('c-ven', 'u-camille', VEN, 'IM'),
    // Dina : arrêt maladie du 12 au 16
    ...[LUN, MAR, MER, JEU, VEN].map((j) => slot(`d-${j}`, 'u-dina', j, null, { absence_type: 'maladie' })),
    // Eli
    slot('e-lun1', 'u-eli', LUN, 'MD', H('08:00', '12:00')), slot('e-lun2', 'u-eli', LUN, 'RT', { ...H('14:00', '16:00'), position: 1 }), slot('e-mar', 'u-eli', MAR, 'MD'), slot('e-mer', 'u-eli', MER, 'MD', H('07:30', '16:30')), slot('e-jeu', 'u-eli', JEU, 'GD', H('18:00', '20:00')),
    slot('e-ven', 'u-eli', VEN, null, { absence_type: 'conge' }),
    // Fanny
    slot('f-lun', 'u-fanny', LUN, 'AF'), slot('f-mar', 'u-fanny', MAR, 'AF', H('07:30', '16:00')), slot('f-mer', 'u-fanny', MER, 'AU', { ...H('08:00', '12:00'), notes: 'Dépannage M. Voisin' }), slot('f-jeu', 'u-fanny', JEU, 'AF', H('08:00', '12:00')), slot('f-ven', 'u-fanny', VEN, null, { absence_type: 'intemperie', notes: 'vent fort' }),
    // Gabriel
    slot('g-lun', 'u-gabriel', LUN, 'GD', H('07:30', '16:00')), slot('g-mar', 'u-gabriel', MAR, 'GD', H('07:30', '16:00')), slot('g-mer', 'u-gabriel', MER, null, { absence_type: 'repos' }), slot('g-jeu1', 'u-gabriel', JEU, 'VE', H('08:00', '12:00')), slot('g-jeu2', 'u-gabriel', JEU, 'VE', H('13:30', '17:00')), slot('g-ven', 'u-gabriel', VEN, 'VE'),
    // Hugo
    slot('h-jeu', 'u-hugo', JEU, 'RT', H('08:00', '17:00')), slot('h-ven', 'u-hugo', VEN, 'RT'),
    // Septembre (mois clôturé) : une intervention d'Alex le 29/09 pour la semaine précédente
    { ...slot('a-s29', 'u-alex', 29, 'VE', H('07:30', '16:30')), work_date: '2026-09-29' },
  ];
  const sub = (id, u0, j, cl, a, b, pid, extra = {}) => entree(id, u0, j, cl, 'submitted', a, b, { planning_id: pid, ...extra });
  const time_entries = [
    sub('te1', 'u-alex', LUN, 'VE', '07:30', '11:45', 'a-lun1'), sub('te2', 'u-alex', LUN, 'MD', '13:00', '17:00', 'a-lun2'), sub('te3', 'u-alex', MAR, 'VE', '07:30', '16:30', 'a-mar', { reception: 'avec' }),
    sub('te4', 'u-alex', MER, 'MD', '07:30', '16:00', 'a-mer', { reception: 'sans' }),
    entree('te5', 'u-bruno', MER, 'RT', 'submitted', '07:30', '16:00', { planning_id: 'b-mer' }), entree('te6', 'u-bruno', JEU, 'AF', 'draft', '07:30', '11:30', { planning_id: 'b-jeu1' }),
    sub('te7', 'u-camille', LUN, 'IM', '07:00', '12:00', 'c-lun1'), sub('te8', 'u-camille', LUN, 'GD', '13:00', '16:30', 'c-lun2'), sub('te9', 'u-camille', MAR, 'IM', '07:00', '16:00', 'c-mar', { reception: 'en_cours' }),
    sub('te10', 'u-camille', MER, 'IM', '07:00', '13:00', 'c-mer1'), sub('te11', 'u-camille', MER, 'BT', '14:00', '19:00', 'c-mer2', { reception: 'avec' }), entree('te12', 'u-camille', JEU, 'IM', 'draft', '07:00', '11:00', { planning_id: 'c-jeu' }),
    sub('te13', 'u-eli', LUN, 'MD', '08:00', '12:00', 'e-lun1'), entree('te14', 'u-eli', LUN, 'RT', 'cancelled', '14:00', '16:00', { planning_id: 'e-lun2', total_minutes: 0 }), sub('te15', 'u-eli', MER, 'MD', '07:30', '16:30', 'e-mer'),
    sub('te16', 'u-fanny', MAR, 'AF', '07:30', '16:00', 'f-mar'), entree('te17', 'u-fanny', MER, 'AU', 'draft', '08:00', '12:00', { planning_id: 'f-mer' }),
    sub('te18', 'u-gabriel', LUN, 'GD', '07:30', '16:00', 'g-lun', { reception: 'avec', reserve_resolved_at: '2026-10-13T10:00:00Z' }), sub('te19', 'u-gabriel', MAR, 'GD', '07:30', '16:00', 'g-mar'),
    sub('te20', 'u-gabriel', MAR, 'MD', '16:00', '17:30', null),
    { ...sub('te21', 'u-alex', 29, 'VE', '07:30', '16:30', 'a-s29'), work_date: '2026-09-29' },
    // une 2e réserve à traiter (badge « Réserves 2 »)
    sub('te22', 'u-hugo', LUN, 'GD', '07:30', '16:00', null, { reception: 'avec' }),
  ];
  return {
    users: [u('u-admin', 'Sam', 'Patron', 'admin'), ...PERSONNES], companies: [{ id: CO, name: 'Entreprise Test', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'trialing', trial_ends_at: '2026-10-27T10:00:00Z', weekly_hours: 35, logo_url: null }],
    worksites: WS, planning, time_entries,
    active_sessions: [{ user_id: 'u-alex', company_id: CO, worksite_id: CLIENTS.VE.id, planning_id: 'a-jeu1', work_date: D_(JEU), started_at: '2026-10-15T05:45:00Z', positions: [] }],
    month_closures: [{ company_id: CO, month: '2026-09-01' }],
    leave_requests: [{ id: 'lv1', company_id: CO, user_id: 'u-bruno', status: 'pending', start_date: D_(20), end_date: D_(21), created_at: '2026-10-14T10:00:00Z' }],
    invitations: [
      { id: 'iv1', company_id: CO, email: 'nouveau1@exemple.fr', first_name: 'Nina', last_name: 'Neuve', role: 'worker', accepted_at: null, expires_at: '2026-11-30T00:00:00Z', created_at: '2026-10-13T09:00:00Z' },
      { id: 'iv2', company_id: CO, email: 'nouveau2@exemple.fr', first_name: 'Omar', last_name: 'Neuf', role: 'worker', accepted_at: null, expires_at: '2026-11-30T00:00:00Z', created_at: '2026-10-13T09:10:00Z' },
    ],
    documents: [
      ...[1, 2, 3].map((n) => ({ id: `doc-ve${n}`, company_id: CO, worksite_id: CLIENTS.VE.id, label: `Photo ${n}`, file_name: `p${n}.jpg`, mime_type: 'image/jpeg', work_date: D_(JEU), created_at: '2026-10-15T07:00:00Z' })),
      ...[1, 2, 3, 4].map((n) => ({ id: `doc-md${n}`, company_id: CO, worksite_id: CLIENTS.MD.id, label: `Plan ${n}`, file_name: `m${n}.pdf`, mime_type: 'application/pdf', work_date: D_(LUN), created_at: '2026-10-12T07:00:00Z' })),
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `doc-x${n}`, company_id: CO, worksite_id: [CLIENTS.RT, CLIENTS.AF, CLIENTS.GD, CLIENTS.IM, CLIENTS.BT, CLIENTS.RT, CLIENTS.AF][n - 1].id, label: `Doc ${n}`, file_name: `d${n}.pdf`, mime_type: 'application/pdf', work_date: D_(MAR), created_at: '2026-10-13T07:00:00Z' })),
    ],
    day_tasks: [
      { id: 'tk1', company_id: CO, user_id: 'u-camille', work_date: D_(JEU), text: 'Contrôler les joints', part: null, created_by: 'u-admin', created_at: '2026-10-14T10:00:00Z', done_at: '2026-10-15T07:00:00Z', done_by: 'u-camille', start_time: null, end_time: null },
      { id: 'tk2', company_id: CO, user_id: 'u-camille', work_date: D_(JEU), text: 'Ranger le dépôt', part: null, created_by: 'u-admin', created_at: '2026-10-14T10:01:00Z', done_at: null, done_by: null, start_time: null, end_time: null },
      { id: 'tk3', company_id: CO, user_id: 'u-camille', work_date: D_(JEU), text: 'Appeler le client', part: null, created_by: 'u-admin', created_at: '2026-10-14T10:02:00Z', done_at: null, done_by: null, start_time: null, end_time: null },
    ],
    meetings: [{ id: 'mt1', company_id: CO, title: 'Réunion sécurité', meeting_date: D_(JEU), start_time: '17:15:00', end_time: '18:00:00', place: 'Dépôt', all_team: false, created_at: '2026-10-10T09:00:00Z' }],
    meeting_participants: [{ meeting_id: 'mt1', user_id: 'u-camille', company_id: CO }],
    user_closures: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [], assistant_journal: [],
  };
};

// ── Jeu de données « planche 2a » (docs/design-brief/designer-essai, script `ROWS`) : mêmes huit salariés, mêmes chantiers, mêmes cases, même ordre.
//    Utilisé par planning-2a-controles.mjs pour l'image « planche | écran » : `demarrer({ jeu: '2a' })`.
export const CLIENTS_2A = {
  V: { id: idPour('v2a', 0), client_name: 'Villa Exemple', product_type: 'Fenêtres', city: 'Lyon' },
  M: { id: idPour('m2a', 1), client_name: 'Maison Démo', product_type: 'Volets', city: 'Bron' },
  R: { id: idPour('r2a', 2), client_name: 'Résidence Test', product_type: 'Portail', city: 'Villeurbanne' },
  A: { id: idPour('a2a', 3), client_name: 'Atelier Fictif', product_type: 'Menuiserie', city: 'Vénissieux' },
  O: { id: 'ws-autre-2a', client_name: 'Autre', product_type: null, city: null },
};
export const PERSONNES_2A = [
  u('u-at', 'Alex', 'Test'), u('u-be', 'Bruno', 'Essai'), u('u-ce', 'Chloé', 'Exemple'), u('u-dd', 'Dina', 'Démo'), u('u-ef', 'Eli', 'Fictif'),
  u('u-md', 'Maximilien-Alexandre', 'Dubois-Lefèvre', 'lead'), u('u-fm', 'Fanny', 'Modèle'), u('u-ge', 'Gaspard', 'Essai'),
];
export const fraiche2a = () => {
  const base = fraiche();
  const WS2 = Object.values(CLIENTS_2A).map((w) => ({ ...w, company_id: CO, is_active: true, address: null, phone: null, email: null, description: null, created_at: '2026-01-01' }));
  const planning = []; const time_entries = []; let n = 0;
  const s2 = (uid, j, k, a, b, extra = {}) => { const id = `p2a-${++n}`; planning.push({ ...slot(id, uid, j, null, a ? H(a, b || a) : {}), worksite_id: k ? CLIENTS_2A[k].id : null, ...(a && !b ? { estimated_end: null } : {}), ...extra }); return id; };
  const abs = (uid, j, t) => planning.push(slot(`p2a-${++n}`, uid, j, null, { absence_type: t }));
  const te = (uid, j, k, status, a, b, pid, extra = {}) => time_entries.push({ ...entree(`t2a-${++n}`, uid, j, null, status, a, b, { planning_id: pid, ...extra }), worksite_id: CLIENTS_2A[k].id });
  const env = (uid, j, k, a, b, extra = {}) => { const pid = s2(uid, j, k, a, b); te(uid, j, k, 'submitted', a, b, pid, extra); };
  const brouillon = (uid, j, k, a, b) => { const pid = s2(uid, j, k, a, b); te(uid, j, k, 'draft', a, b, pid); };
  // Alex
  env('u-at', LUN, 'V', '08:00', '12:00'); env('u-at', LUN, 'R', '13:30', '17:00', { reception: 'avec' }); env('u-at', MAR, 'M', '08:00', '17:00');
  env('u-at', MER, 'V', '08:00', '12:00'); brouillon('u-at', MER, 'A', '13:30', '16:45'); const live = s2('u-at', JEU, 'V', '07:45', null); s2('u-at', VEN, 'R', '08:00', '12:00');
  // Bruno
  env('u-be', LUN, 'M', '08:00', '12:00'); s2('u-be', MAR, 'V', '08:00', '12:00'); env('u-be', MER, 'R', '13:30', '17:00'); s2('u-be', JEU, 'M', '08:00', '17:00'); s2('u-be', VEN, 'V', '08:00', '12:00');
  // Chloé
  abs('u-ce', LUN, 'conge'); abs('u-ce', MAR, 'conge'); abs('u-ce', MER, 'conge'); s2('u-ce', JEU, 'A', '18:00', '22:00'); s2('u-ce', VEN, 'R', '08:00', '12:00');
  // Dina
  env('u-dd', LUN, 'M', '08:00', '17:00'); env('u-dd', MAR, 'V', '08:00', '12:00');
  { const pid = s2('u-dd', MER, 'R', '13:30', '17:00'); te('u-dd', MER, 'R', 'cancelled', '13:30', '17:00', pid, { total_minutes: 0 }); }
  abs('u-dd', JEU, 'maladie'); abs('u-dd', VEN, 'maladie');
  // Eli
  { const pid = s2('u-ef', LUN, 'O', '09:00', '10:00', { added_by_worker: true, notes: 'Dépannage SAV' }); te('u-ef', LUN, 'O', 'submitted', '09:00', '10:00', pid); }
  env('u-ef', MAR, 'V', '13:30', '17:00'); brouillon('u-ef', MER, 'M', '18:00', '20:00'); s2('u-ef', JEU, 'R', null, null); s2('u-ef', 17, 'V', '08:00', '12:00');
  // Maximilien-Alexandre (chef)
  env('u-md', LUN, 'A', '08:00', '17:00'); env('u-md', MAR, 'A', '08:00', '17:00'); env('u-md', MER, 'A', '08:00', '17:00'); s2('u-md', JEU, 'A', '08:00', '17:00'); s2('u-md', VEN, 'A', '08:00', '17:00');
  // Fanny
  abs('u-fm', LUN, 'intemperie'); env('u-fm', MAR, 'R', '08:00', '12:00'); s2('u-fm', JEU, 'M', '13:30', '17:00');
  // Gaspard
  env('u-ge', MER, 'V', '08:00', '12:00'); s2('u-ge', JEU, 'V', '08:00', '12:00');
  // La planche compte « 9h00 » pour 08:00–17:00 : la durée envoyée est la plage entière (pas de pause déduite).
  for (const t of time_entries) if (t.status !== 'cancelled') { const [a, am] = t.start_time.split(':').map(Number); const [b, bm] = t.end_time.split(':').map(Number); t.total_minutes = (b * 60 + bm) - (a * 60 + am); }
  const tache = (id, done) => ({ id, company_id: CO, user_id: 'u-md', work_date: D_(JEU), text: `Tâche ${id}`, part: null, created_by: 'u-admin', created_at: '2026-10-14T10:00:00Z', done_at: done ? '2026-10-15T07:00:00Z' : null, done_by: done ? 'u-md' : null, start_time: null, end_time: null });
  return {
    ...base,
    users: [base.users[0], ...PERSONNES_2A], worksites: WS2, planning, time_entries,
    active_sessions: [{ user_id: 'u-at', company_id: CO, worksite_id: CLIENTS_2A.V.id, planning_id: live, work_date: D_(JEU), started_at: '2026-10-15T05:45:00Z', positions: [] }],
    leave_requests: [{ id: 'lv2a', company_id: CO, user_id: 'u-ce', status: 'pending', start_date: D_(26), end_date: D_(27), created_at: '2026-10-14T10:00:00Z' }],
    invitations: [],
    documents: [
      ...[1, 2].map((k) => ({ id: `doc2a-v${k}`, company_id: CO, worksite_id: CLIENTS_2A.V.id, label: `Photo ${k}`, file_name: `v${k}.jpg`, mime_type: 'image/jpeg', work_date: D_(LUN), created_at: '2026-10-12T07:00:00Z' })),
      { id: 'doc2a-r1', company_id: CO, worksite_id: CLIENTS_2A.R.id, label: 'PV', file_name: 'r1.pdf', mime_type: 'application/pdf', work_date: D_(LUN), created_at: '2026-10-12T07:00:00Z' },
    ],
    day_tasks: [tache('k1', true), tache('k2', false), tache('k3', false)],
    meetings: [{ id: 'mt2a', company_id: CO, title: 'Réunion sécurité', meeting_date: D_(MAR), start_time: '07:30:00', end_time: '08:00:00', place: 'Dépôt', all_team: false, created_at: '2026-10-10T09:00:00Z' }],
    meeting_participants: [{ meeting_id: 'mt2a', user_id: 'u-dd', company_id: CO }],
  };
};

const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
const filtrer = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    let neg = false; let w = v; if (w.startsWith('not.')) { neg = true; w = w.slice(4); }
    const dot = w.indexOf('.'); const op = w.slice(0, dot); const val = w.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k]; let r = true;
      if (op === 'eq') r = String(cur) === val; else if (op === 'neq') r = String(cur) !== val;
      else if (op === 'in') r = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      else if (op === 'gte') r = String(cur) >= val; else if (op === 'lte') r = String(cur) <= val;
      else if (op === 'gt') r = String(cur) > val; else if (op === 'lt') r = String(cur) < val;
      else if (op === 'is') r = val === 'null' ? cur == null : String(cur) === val;
      return neg ? !r : r;
    });
  }
  return rows;
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };

export async function demarrer({ out = 'out', port = 4421, now = NOW, base = null, jeu = null } = {}) {
  const neuf = () => (jeu === '2a' ? fraiche2a() : fraiche());
  const srv = http.createServer((q, r) => {
    const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    for (const c of [p, `${p}.html`, path.join(p, 'index.html')]) {
      const f = path.join(out, c);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); return r.end(fs.readFileSync(f)); }
    }
    r.writeHead(404); r.end();
  });
  if (!base) await new Promise((r) => srv.listen(port, r));
  const browser = await chromium.launch({ executablePath: CHROME });
  let D = neuf();
  const log = { writes: [], requetes: [] };
  let seq = 0;
  const secondes = Math.floor(now.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: secondes + 864000, aal: 'aal1' })}.sig`;
  const session = { access_token: jwt, refresh_token: 'r', expires_at: secondes + 864000, expires_in: 864000, token_type: 'bearer', user: { id: 'u-admin', email: 'u-admin@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
  const embed = (t, row, sel) => {
    const o = { ...row };
    if (t === 'planning') { if (sel.includes('worksite:worksites')) o.worksite = D.worksites.find((w) => w.id === row.worksite_id) || null; if (sel.includes('user:users')) o.user = D.users.find((x) => x.id === row.user_id) || null; }
    return o;
  };
  async function installer(ctx) {
    await ctx.clock.install({ time: now });
    await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
    await ctx.route('**/*.supabase.co/**', async (r) => {
      const url = new URL(r.request().url()); const m = r.request().method();
      log.requetes.push(`${m} ${url.pathname}`);
      if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
      if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
      if (url.pathname.startsWith('/functions/v1/')) { log.writes.push({ m: 'FN', t: url.pathname }); return r.fulfill({ json: {} }); }
      if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
      const t = url.pathname.replace('/rest/v1/', ''); D[t] = D[t] || [];
      const sel = url.searchParams.get('select') || '*';
      const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
      if (m === 'DELETE') { const gone = filtrer(D[t], url.searchParams); D[t] = D[t].filter((x) => !gone.includes(x)); log.writes.push({ m, t, ids: gone.map((x) => x.id) }); return r.fulfill({ json: gone.map((x) => ({ id: x.id })) }); }
      if (m === 'POST') {
        const body = JSON.parse(r.request().postData() || '[]'); const arr = Array.isArray(body) ? body : [body];
        const saved = arr.map((row) => { const x = { id: row.id || `new-${++seq}`, position: null, added_by_worker: false, created_at: now.toISOString(), ...row }; const i = D[t].findIndex((y) => y.id === x.id); if (i >= 0) D[t][i] = x; else D[t].push(x); return x; });
        log.writes.push({ m, t, rows: arr, ids: saved.map((x) => x.id) });
        return r.fulfill({ status: 201, json: single ? saved[0] : saved });
      }
      if (m === 'PATCH') { const body = JSON.parse(r.request().postData() || '{}'); const hit = filtrer(D[t], url.searchParams); for (const x of hit) Object.assign(x, body); log.writes.push({ m, t, ids: hit.map((x) => x.id), body }); return r.fulfill({ json: hit.map((x) => ({ ...x })) }); }
      const all = filtrer(D[t], url.searchParams).map((x) => embed(t, x, sel));
      if (single) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      const rows = all.slice(off, lim ? off + Number(lim) : undefined);
      return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
    });
  }
  return {
    browser, port, log, get D() { return D; }, reinitialiser() { D = neuf(); log.writes.length = 0; log.requetes.length = 0; },
    /** Ouvre /admin : `ui` = 1 (v1) ou 2 (v2) ; `contexte` : options Playwright (viewport, hasTouch…). */
    async page({ ui = null, largeur = 1440, hauteur = 900, hasTouch = false, attente = '.bt-pl-gridwrap .bt-pl-grab, .dzp-table .dzp-bulle, .dzp-m-carte' } = {}) {
      const ctx = await browser.newContext({ viewport: { width: largeur, height: hauteur }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch, isMobile: hasTouch });
      await installer(ctx);
      const page = await ctx.newPage();
      const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message));
      await page.goto(`${base || `http://localhost:${port}`}/admin${ui ? `?ui=${ui}` : ''}`);
      await page.waitForSelector(attente, { timeout: 25000 });
      await page.waitForTimeout(1800);
      return { page, ctx, erreurs };
    },
    async fermer() { await browser.close(); if (!base) srv.close(); },
  };
}
