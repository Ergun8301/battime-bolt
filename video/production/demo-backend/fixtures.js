'use strict';
// FIXTURE GENERATOR — « Delorme Rénovation » (entreprise fictive).
//
// generate(now) builds September 2026 from the demo clock: every working day
// before "today" is planned AND sent (with the special cases of the
// storyboard), today and the future are only planned. Scene presets then add
// the state of Thursday 24 September 2026 (S-39) at the time of each shot.
//
// Everything is deterministic: the same logical row always gets the same id
// (sha1-based UUIDs), so a take can be re-run and ids stay stable across scenes.

const fs = require('fs');
const path = require('path');
const T = require('./lib/time');
const { stableUuid } = require('./lib/auth');

// ─── fixed identities ────────────────────────────────────────────────────────
const COMPANY_ID = '0d3c0001-0000-4000-8000-000000000001';

// Brute-forced (tools-bruteforce-ids.js) so that hashStr(id) % 7 — the palette
// index used by components/admin-planning.tsx — gives each real chantier its
// own colour: VM 0 amber, CED 2 green, CEN 3 brick, DUB 4 violet, JF 1 plum,
// LEF 5 olive (6 = Autre).
const W = {
  VM: '0d3c0011-0000-4000-8000-000000000003',
  CED: '0d3c0012-0000-4000-8000-000000000007',
  CEN: '0d3c0013-0000-4000-8000-000000000004',
  DUB: '0d3c0014-0000-4000-8000-000000000004',
  JF: '0d3c0015-0000-4000-8000-000000000007',
  LEF: '0d3c0016-0000-4000-8000-000000000004',
  AUTRE: '0d3c0017-0000-4000-8000-000000000002',
};
// Same trick for the avatar tints (hashStr(user.id) % 7), in first-name order.
const U = {
  ines: '0d3c0021-0000-4000-8000-000000000006',
  julien: '0d3c0022-0000-4000-8000-000000000004',
  karim: '0d3c0023-0000-4000-8000-000000000006',
  lucas: '0d3c0024-0000-4000-8000-000000000006',
  mehdi: '0d3c0025-0000-4000-8000-000000000006',
  sofia: '0d3c0026-0000-4000-8000-000000000007',
  thomas: '0d3c0027-0000-4000-8000-000000000005',
  yanis: '0d3c0028-0000-4000-8000-000000000001',
  sophie: '0d3c0029-0000-4000-8000-000000000006',
};

const PEOPLE = {
  sophie: { first: 'Sophie', last: 'Durand', role: 'admin', created: '2026-06-02' },
  karim: { first: 'Karim', last: 'Benali', role: 'worker', rate: 32.5, pid: '00042', nir: '1 91 04 99 999 042 31', hire: '2019-03-04', created: '2026-06-03' },
  julien: { first: 'Julien', last: 'Morel', role: 'lead', rate: 37, pid: '00017', nir: '1 84 11 99 999 017 52', hire: '2012-09-03', created: '2026-06-03' },
  lucas: { first: 'Lucas', last: 'Martin', role: 'worker', rate: 30.5, pid: '00051', nir: '1 98 02 99 999 051 08', hire: '2021-01-11', created: '2026-06-03' },
  sofia: { first: 'Sofia', last: 'Rossi', role: 'worker', rate: 33, pid: '00038', nir: '2 93 07 99 999 038 64', hire: '2018-06-18', created: '2026-06-03' },
  mehdi: { first: 'Mehdi', last: 'Haddad', role: 'worker', rate: 29.5, pid: '00063', nir: '1 01 05 99 999 063 27', hire: '2023-02-06', created: '2026-06-04' },
  ines: { first: 'Inès', last: 'Garcia', role: 'worker', rate: 31, pid: '00058', nir: '2 96 09 99 999 058 90', hire: '2020-10-05', created: '2026-06-04' },
  thomas: { first: 'Thomas', last: 'Petit', role: 'worker', rate: 34.5, pid: '00027', nir: '1 87 12 99 999 027 45', hire: '2016-04-25', created: '2026-06-04' },
  yanis: { first: 'Yanis', last: 'Bernard', role: 'worker', rate: 29, pid: '00071', nir: '1 03 03 99 999 071 13', hire: '2024-03-18', created: '2026-06-05' },
};
const WORKERS = ['ines', 'julien', 'karim', 'lucas', 'mehdi', 'sofia', 'thomas', 'yanis'];
const deaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const emailOf = (k) => `${deaccent(PEOPLE[k].first)}.${deaccent(PEOPLE[k].last)}@delorme-renovation.example`;

const SITES = {
  VM: { name: 'Villa Martin', product: 'Menuiseries', city: 'Annecy', postal: '74000', address: '12 chemin des Vergers', email: 'villa.martin@example.com', desc: 'Remplacement des menuiseries — 11 fenêtres alu + baie coulissante', lat: 45.8994, lng: 6.1281, budgetTarget: 84 },
  CED: { name: 'Résidence Les Cèdres', product: 'Rénovation', city: 'Seynod', postal: '74600', address: '3 allée des Cèdres', email: 'syndic.lescedres@example.com', desc: 'Rénovation des parties communes, bâtiment B', lat: 45.8871, lng: 6.0969, budgetTarget: 76 },
  CEN: { name: 'Restaurant Le Central', product: 'Agencement', city: 'Annecy', postal: '74000', address: '8 place du Marché', email: 'contact.lecentral@example.com', desc: 'Agencement salle et bar — mobilier sur mesure', lat: 45.9006, lng: 6.1243, budgetTarget: 103 },
  DUB: { name: 'Maison Dubois', product: 'Menuiseries', city: 'Argonay', postal: '74370', address: '27 route des Prés', email: 'famille.dubois@example.com', desc: 'Porte-fenêtre, volets et porte d’entrée', lat: 45.9411, lng: 6.1418, budgetTarget: 55 },
  JF: { name: 'École Jules-Ferry', product: 'Peinture', city: 'Cran-Gevrier', postal: '74960', address: '1 rue des Écoles', email: 'services.techniques@example.com', desc: 'Peinture des classes du 1er étage (vacances de la Toussaint en ligne de mire)', lat: 45.9014, lng: 6.1036, budgetTarget: null },
  LEF: { name: 'Cabinet Lefèvre', product: 'Plâtrerie', city: 'Annecy-le-Vieux', postal: '74940', address: '45 avenue des Tilleuls', email: 'cabinet.lefevre@example.com', desc: 'Cloisons et doublages — nouveaux bureaux', lat: 45.9191, lng: 6.1429, budgetTarget: 38 },
};

const THURSDAY = '2026-09-24';
const MONTH_FROM = '2026-09-01';
// History starts on Monday 31 August so that week S-36 is complete: the payroll
// CSV recaps WHOLE weeks, and an empty Monday made everybody's first September
// week read 31–32 h. August is closed (month_closures) and was exported on
// 2 September 09:10, so the 31/08 lines are exported + locked.
const HISTORY_FROM = '2026-08-31';
const AUGUST_EXPORT = ['2026-09-02', '09:10:00'];

// ─── deterministic randomness ────────────────────────────────────────────────
function seedOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(key) { let a = seedOf(key); return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rid = (...parts) => stableUuid(parts.join('|'));
const at = (date, time) => T.parisIso(date, time);
const hm = (min) => T.minToTime(min).slice(0, 5);

// ─── who works where ─────────────────────────────────────────────────────────
const PRIMARY = {
  '2026-08-31': { karim: 'VM', sofia: 'DUB', lucas: 'CEN', mehdi: 'CED', ines: 'LEF', thomas: 'CEN', julien: 'JF', yanis: 'LEF' },
  '2026-09-07': { karim: 'VM', sofia: 'DUB', lucas: 'CEN', mehdi: 'CED', ines: 'LEF', thomas: 'CEN', julien: 'JF', yanis: 'LEF' },
  '2026-09-14': { karim: 'VM', sofia: 'VM', lucas: 'CEN', mehdi: 'CED', ines: 'LEF', thomas: 'JF', julien: 'JF', yanis: 'JF' },
  '2026-09-21': { karim: 'VM', sofia: 'DUB', lucas: 'CEN', mehdi: 'CED', ines: 'LEF', thomas: 'JF', julien: 'JF', yanis: 'JF' },
  '2026-09-28': { karim: 'VM', sofia: 'DUB', lucas: 'CEN', mehdi: 'CED', ines: 'LEF', thomas: 'JF', julien: 'JF', yanis: 'JF' },
  '2026-10-05': { karim: 'VM', sofia: 'DUB', lucas: 'CEN', mehdi: 'CED', ines: 'LEF', thomas: 'JF', julien: 'JF', yanis: 'JF' },
};
const SECONDARY = { karim: 'DUB', sofia: 'VM', lucas: 'CED', mehdi: 'LEF', ines: 'CED', thomas: 'CEN', julien: 'CEN', yanis: 'LEF' };

const std = (s, a = '07:30', b = '12:00', c = '13:00', d = '16:30') => [{ s, a, b }, { s, a: c, b: d, gap: 'pause' }];

/** Explicit days of the storyboard. */
const OVERRIDES = {
  // Karim — the hero: long days so S-39 goes over 35 h once Thursday is in.
  'karim|2026-09-21': { blocks: [{ s: 'VM', a: '07:30', b: '12:00' }, { s: 'VM', a: '13:00', b: '17:30', gap: 'pause' }] },
  'karim|2026-09-22': { blocks: [{ s: 'DUB', a: '07:30', b: '12:00' }, { s: 'VM', a: '13:00', b: '17:15', gap: 'pause' }] },
  'karim|2026-09-23': { blocks: [{ s: 'VM', a: '07:30', b: '12:00' }, { s: 'VM', a: '12:45', b: '17:45', gap: 'pause' }] },
  'karim|2026-09-24': {
    blocks: [
      { s: 'VM', a: '07:30', b: '12:00', planEst: ['07:30', '12:00'], planNote: 'Fenêtres séjour + chambre 2' },
      { s: 'CED', a: '12:45', b: '16:30', gap: 'route', workerAdded: true },
    ],
  },
  'karim|2026-09-25': { blocks: [{ s: 'VM', a: '07:30', b: '12:00', planNote: 'Pose baie coulissante — prévoir 2 personnes' }, { s: 'VM', a: '13:00', b: '15:30', gap: 'pause' }] },
  // Thursday of the others (their "real" day; scenes decide how much of it exists at shot time).
  'lucas|2026-09-24': { blocks: std('CEN', '07:00', '12:00', '13:00', '16:00') },
  'sofia|2026-09-24': { blocks: std('DUB', '07:15', '12:00', '13:00', '16:15') },
  'thomas|2026-09-24': { blocks: std('JF', '07:15', '12:00', '13:00', '16:30') },
  'julien|2026-09-24': { blocks: std('JF', '07:00', '12:00', '13:00', '16:30') },
  'yanis|2026-09-24': { blocks: std('JF') },
  'mehdi|2026-09-24': { blocks: std('LEF') },
  'mehdi|2026-09-25': { blocks: [{ s: 'LEF', a: '08:00', b: '12:00', planRdv: '08:00', planNote: 'Clés chez la gardienne' }, { s: 'LEF', a: '13:00', b: '15:30', gap: 'pause' }] },
  // Absences
  'ines|2026-09-21': { absence: 'conge' }, 'ines|2026-09-22': { absence: 'conge' }, 'ines|2026-09-23': { absence: 'conge' },
  'ines|2026-09-24': { absence: 'conge' }, 'ines|2026-09-25': { absence: 'conge' },
  'mehdi|2026-09-23': { absence: 'intemperie' },
  'julien|2026-09-21': { absence: 'maladie' }, 'julien|2026-09-22': { absence: 'maladie' },
  // « en attente » : planned, nothing sent (sent late — visible only in s6)
  'lucas|2026-09-22': { blocks: std('CEN'), missingUntil: ['2026-09-25', '07:40'] },
  'lucas|2026-09-23': { blocks: std('CEN'), missingUntil: ['2026-09-25', '07:42'] },
  'yanis|2026-09-21': { blocks: std('JF'), missingUntil: ['2026-09-24', '18:05'] },
};

/** Réserves : 3 levées plus tôt dans le mois + celle de Sofia, corrigée sur place. */
const RESERVES = [
  { u: 'mehdi', d: '2026-09-08', s: 'CED', obs: "Reprise d'enduit cage d'escalier", resolved: ['2026-09-11', '10:05'], res: 'Reprise faite, vue avec le syndic' },
  { u: 'lucas', d: '2026-09-10', s: 'CEN', obs: 'Plinthe décollée près du bar', resolved: ['2026-09-14', '09:20'], res: 'Plinthe recollée, contrôlée sur place' },
  { u: 'ines', d: '2026-09-16', s: 'LEF', obs: 'Fissure sur joint de bande, bureau 2', resolved: ['2026-09-18', '16:40'], res: 'Bande reprise et poncée' },
  { u: 'sofia', d: '2026-09-21', s: 'DUB', obs: 'Seuil de la porte-fenêtre à reprendre', fixed: ['2026-09-23', '15:40'] },
];

const NOTES = ['Livraison décalée à 10 h', 'Client absent le matin, accès par le garage', 'Reste les finitions demain', 'Attente séchage enduit', 'Protections des sols posées', 'Joints à reprendre après séchage'];

function dayPlan(u, d) {
  const o = OVERRIDES[`${u}|${d}`];
  if (o) return o;
  const monday = T.mondayOf(d);
  const P = (PRIMARY[monday] || PRIMARY['2026-09-28'])[u];
  const S = SECONDARY[u];
  const r = rng(`shape|${u}|${d}`)();
  const fri = T.weekday(d) === 4;
  if (r < 0.13) return { blocks: [{ s: S, a: '07:30', b: '10:30' }, { s: P, a: '11:00', b: '12:00', gap: 'route' }, { s: P, a: '13:00', b: '16:30', gap: 'pause' }] };
  if (fri) return { blocks: std(P, '07:30', '12:00', '13:00', '15:30') };
  if (r < 0.26) return { blocks: std(P, '07:30', '12:00', '12:45', '17:15') };
  return { blocks: std(P) };
}

// ─── row factories ───────────────────────────────────────────────────────────
function planRow(u, d, s, extra = {}) {
  const monday = T.mondayOf(d);
  return {
    id: rid('plan', u, d, s), company_id: COMPANY_ID, user_id: U[u], worksite_id: W[s], work_date: d,
    estimated_start: null, estimated_end: null, notes: null, absence_type: null, position: null,
    added_by_worker: false, created_at: at(T.addDays(monday, -3), '16:30:00'), created_by: U.sophie, ...extra,
  };
}
function absenceRow(u, d, type, createdAt) {
  return {
    id: rid('abs', u, d), company_id: COMPANY_ID, user_id: U[u], worksite_id: null, work_date: d,
    estimated_start: null, estimated_end: null, notes: null, absence_type: type, position: null,
    added_by_worker: false, created_at: createdAt, created_by: U.sophie,
  };
}
function entryRow(u, d, i, b, extra = {}) {
  return {
    id: rid('te', u, d, i), company_id: COMPANY_ID, user_id: U[u], worksite_id: W[b.s], planning_id: rid('plan', u, d, b.s),
    work_date: d, start_time: T.normTime(b.a), end_time: T.normTime(b.b), break_minutes: 0, meal_allowance: false,
    observation: null, photos: null, reception: null, gap_before: b.gap || null, status: 'submitted',
    created_at: null, submitted_at: null, validated_at: null, validated_by: null, locked: false, exported_at: null,
    modified_by: null, modified_at: null, client_id: null,
    reserve_resolved_at: null, reserve_resolved_by: null, reserve_resolution: null,
    reserve_fixed_at: null, reserve_fixed_by: null, reserve_fix_note: null, ...extra,
  };
}

/** Planning creation time: the office plans each week on the Friday before, 16:30. */
function weekPlannedAt(d) { return T.parisToMs(T.addDays(T.mondayOf(d), -3), '16:30:00'); }

// ─── the generator ───────────────────────────────────────────────────────────
function generate(nowMs, { todayIsPast = false } = {}) {
  const today = T.parisDate(nowMs);
  const tb = {
    companies: [], users: [], user_payroll: [], worksites: [], planning: [], time_entries: [], active_sessions: [],
    time_entry_positions: [], time_entry_corrections: [], documents: [], certifications: [], leave_requests: [],
    worksite_expenses: [], month_closures: [], invitations: [], push_subscriptions: [], subscription_plans: [], payroll_sends: [],
  };
  const storage = [];

  tb.companies.push({
    id: COMPANY_ID, name: 'Delorme Rénovation', siret: null, tva_intra: null, address: '5 rue des Artisans',
    postal_code: '74000', city: 'Annecy', phone: null, email: 'contact@delorme-renovation.example',
    logo_url: `http://localhost:4600/sb/storage/v1/object/public/company-logos/${COMPANY_ID}/logo.svg?v=1`,
    created_at: at('2026-06-02', '08:00:00'), is_active: true, trial_ends_at: null, subscription_status: 'active',
    stripe_customer_id: null, stripe_subscription_id: null, plan_code: 'equipe', current_period_end: at('2026-10-02', '00:00:00'),
    auto_reminder_enabled: true, reminder_hour: 17, budget_alerts_enabled: true, weekly_digest_enabled: true,
    travel_paid: true, weekly_hours: 35, accountant_email: 'compta@cabinet-roux.example', overtime_rate_1: 25, overtime_rate_2: 50,
    position_tracking_enabled: true,
  });
  storage.push({ bucket: 'company-logos', path: `${COMPANY_ID}/logo.svg`, asset: 'brand/logo-client-dr.svg', fallback: 'svg', contentType: 'image/svg+xml' });

  for (const [k, p] of Object.entries(PEOPLE)) {
    tb.users.push({
      id: U[k], company_id: COMPANY_ID, first_name: p.first, last_name: p.last, role: p.role, phone: null,
      email: emailOf(k), is_active: true, created_at: at(p.created, '09:00:00'), invited_at: null, last_seen_at: null, photo_url: null,
    });
    if (p.rate) {
      tb.user_payroll.push({
        user_id: U[k], company_id: COMPANY_ID, social_security_number: p.nir, hire_date: p.hire, contract_type: 'CDI',
        hourly_rate: p.rate, weekly_hours: null, payroll_id: p.pid, updated_at: at('2026-06-05', '10:00:00'),
      });
    }
  }

  for (const [k, s] of Object.entries(SITES)) {
    tb.worksites.push({
      id: W[k], company_id: COMPANY_ID, client_name: s.name, client_phone: null, client_email: s.email,
      address: s.address, city: s.city, postal_code: s.postal, description: s.desc, product_type: s.product,
      is_active: true, created_at: at('2026-08-24', '10:00:00'), completed_at: null, budget_hours: null, budget_amount: null, budget_alert_level: null,
    });
  }
  tb.worksites.push({
    id: W.AUTRE, company_id: COMPANY_ID, client_name: 'Autre', client_phone: null, client_email: null, address: null, city: '',
    postal_code: null, description: null, product_type: null, is_active: true, created_at: at('2026-06-02', '08:00:00'),
    completed_at: null, budget_hours: null, budget_amount: null, budget_alert_level: null,
  });

  // Leave requests (+ the absences they put on the planning when approved).
  const leaves = [
    { k: 'karim', type: 'conge', from: '2026-10-12', to: '2026-10-16', note: 'Mariage de mon frère', status: 'pending', created: ['2026-09-22', '19:12:00'] },
    { k: 'karim', type: 'conge', from: '2026-08-17', to: '2026-08-21', note: null, status: 'approved', created: ['2026-07-06', '18:40:00'], decided: ['2026-07-07', '08:15:00'] },
    { k: 'ines', type: 'conge', from: '2026-09-21', to: '2026-09-25', note: 'Vacances', status: 'approved', created: ['2026-08-24', '12:30:00'], decided: ['2026-08-25', '09:02:00'] },
    { k: 'thomas', type: 'conge', from: '2026-10-05', to: '2026-10-09', note: null, status: 'rejected', created: ['2026-09-14', '20:05:00'], decided: ['2026-09-15', '08:47:00'], decisionNote: 'Période de livraison, on en reparle' },
  ];
  for (const l of leaves) {
    if (T.parisToMs(...l.created) > nowMs) continue;
    const decided = l.decided && T.parisToMs(...l.decided) <= nowMs;
    tb.leave_requests.push({
      id: rid('leave', l.k, l.from), company_id: COMPANY_ID, user_id: U[l.k], type: l.type, start_date: l.from, end_date: l.to,
      note: l.note, status: decided ? l.status : 'pending', decided_at: decided ? at(...l.decided) : null,
      decided_by: decided ? U.sophie : null, decision_note: decided ? (l.decisionNote || null) : null, created_at: at(...l.created),
    });
    if (decided && l.status === 'approved' && l.k === 'karim') {
      for (const d of T.dateRange(l.from, l.to)) tb.planning.push(absenceRow(l.k, d, 'conge', at(...l.decided)));
    }
  }

  // September: planning + sent hours.
  const lastPlanned = (() => {
    let d = HISTORY_FROM; let last = null;
    for (let i = 0; i < 70; i++, d = T.addDays(d, 1)) if (weekPlannedAt(d) <= nowMs) last = d;
    return last;
  })();
  const pastLimit = todayIsPast ? today : T.addDays(today, -1);
  const entryIdx = new Map();
  for (const d of T.dateRange(HISTORY_FROM, lastPlanned)) {
    if (T.weekday(d) >= 5) continue;
    for (const u of WORKERS) {
      const plan = dayPlan(u, d);
      if (plan.absence) {
        const createdAt = u === 'ines' ? at('2026-08-25', '09:02:00') : at(d, '07:05:00');
        if (T.parisToMs(d, '07:05:00') <= nowMs || u === 'ines') tb.planning.push(absenceRow(u, d, plan.absence, createdAt));
        continue;
      }
      const isPast = d <= pastLimit && d !== THURSDAY; // Thursday is always written by the scene
      // planning rows (one per chantier)
      const seen = new Set();
      for (const b of plan.blocks) {
        if (seen.has(b.s)) continue; seen.add(b.s);
        if (b.workerAdded) continue; // added by ensure_planning_slot once sent — see scenes
        const extra = {};
        if (b.planEst) { extra.estimated_start = T.normTime(b.planEst[0]); extra.estimated_end = T.normTime(b.planEst[1]); }
        if (b.planRdv) extra.estimated_start = T.normTime(b.planRdv);
        if (b.planNote) extra.notes = b.planNote;
        tb.planning.push(planRow(u, d, b.s, extra));
      }
      if (!isPast) continue;
      let late = null;
      if (plan.missingUntil) {
        if (T.parisToMs(...plan.missingUntil) > nowMs) continue; // still « en attente »
        late = at(...plan.missingUntil);
      }
      tb.time_entries.push(...dayEntries(u, d, plan, late));
    }
  }
  function dayEntries(u, d, plan, lateSubmit) {
    const r = rng(`day|${u}|${d}`);
    const lastEnd = T.timeToMin(plan.blocks[plan.blocks.length - 1].b);
    const submitted = lateSubmit || at(d, hm(lastEnd + 4 + Math.floor(r() * 22)) + ':00');
    const created = T.iso(Date.parse(submitted) - 60000 - Math.floor(r() * 90000));
    const meal = r() < 0.86;
    const exported = d < MONTH_FROM && T.parisToMs(...AUGUST_EXPORT) <= nowMs ? at(...AUGUST_EXPORT) : null;
    const out = plan.blocks.map((b, i) => entryRow(u, d, i, b, {
      created_at: created, submitted_at: submitted, meal_allowance: meal && i === 0,
      ...(exported ? { exported_at: exported, locked: true } : {}),
    }));
    const last = out[out.length - 1];
    const x = r();
    const scripted = !!OVERRIDES[`${u}|${d}`]; // storyboard days stay exactly as written
    if (!scripted && x < 0.06) last.reception = 'en_cours';
    else if (!scripted && x < 0.08) last.reception = 'sans';
    if (!scripted && r() < 0.05) last.observation = NOTES[Math.floor(r() * NOTES.length)];
    for (const rv of RESERVES) {
      if (rv.u !== u || rv.d !== d) continue;
      const e = [...out].reverse().find((x2) => x2.worksite_id === W[rv.s]);
      Object.assign(e, { reception: 'avec', observation: rv.obs });
      if (rv.resolved && T.parisToMs(...rv.resolved) <= nowMs) Object.assign(e, { reserve_resolved_at: at(...rv.resolved), reserve_resolved_by: U.sophie, reserve_resolution: rv.res });
      if (rv.fixed && T.parisToMs(...rv.fixed) <= nowMs) Object.assign(e, { reserve_fixed_at: at(...rv.fixed), reserve_fixed_by: U[u] });
    }
    for (const e of out) entryIdx.set(`${u}|${d}|${e.worksite_id}`, e);
    return out;
  }

  // Documents: ~44 rows, photos numbered per (chantier, jour) like the DB trigger.
  const PHOTO_PLAN = [
    ['VM', '2026-09-02', 2], ['VM', '2026-09-09', 2], ['VM', '2026-09-16', 2], ['VM', '2026-09-18', 1], ['VM', '2026-09-22', 2, 'karim', [7, 3]],
    ['CED', '2026-09-03', 2], ['CED', '2026-09-08', 2], ['CED', '2026-09-15', 2], ['CED', '2026-09-22', 1],
    ['CEN', '2026-09-04', 2], ['CEN', '2026-09-10', 2], ['CEN', '2026-09-17', 2], ['CEN', '2026-09-21', 1],
    ['DUB', '2026-09-07', 2], ['DUB', '2026-09-11', 2], ['DUB', '2026-09-21', 2, 'sofia', [7, 11]], ['DUB', '2026-09-23', 1],
    ['JF', '2026-09-14', 2], ['JF', '2026-09-17', 2], ['JF', '2026-09-22', 1],
    ['LEF', '2026-09-01', 2], ['LEF', '2026-09-16', 2],
  ];
  // assets/photos/chantier-NN.jpg (generated by the assets track), matched by trade:
  // 01 window joint · 02 plasterboard · 03 scaffold + windows · 04 floor tiles · 05 classroom wall
  // 06 roof tiles · 07 door-window threshold · 08 electrical boxes · 09 insulation · 10 wood floor
  // 11 facade window · 12 blocks + plaster tools
  const PHOTO_ASSETS = { VM: [11, 3, 1], CED: [6, 9, 8, 4], CEN: [10, 4, 8], DUB: [11, 7, 3], JF: [5], LEF: [12, 2] };
  const assetCursor = {};
  const nextAsset = (s, forced) => {
    let n = forced;
    if (!n) { const list = PHOTO_ASSETS[s]; const i = (assetCursor[s] = (assetCursor[s] ?? -1) + 1); n = list[i % list.length]; }
    return `photos/chantier-${String(n).padStart(2, '0')}.jpg`;
  };
  const addPhoto = (s, d, no, uKey, entry, createdAt, forcedAsset) => {
    const id = rid('doc', s, d, no);
    const file = `${COMPANY_ID}/${W[s]}/${id}.jpg`;
    const asset = nextAsset(s, forcedAsset);
    const size = (() => { try { return fs.statSync(path.join(__dirname, '..', 'assets', asset)).size; } catch { return 180000 + (seedOf(id) % 90000); } })();
    const hhmm = createdAt.slice(11, 16).replace(':', '');
    tb.documents.push({
      id, company_id: COMPANY_ID, worksite_id: W[s], uploaded_by: U[uKey], label: `Photo ${no} — ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`,
      file_path: file, file_name: `IMG_${d.replace(/-/g, '')}_${hhmm}.jpg`, mime_type: 'image/jpeg', size_bytes: size,
      created_at: createdAt, work_date: d, time_entry_id: entry ? entry.id : null, photo_no: no,
    });
    storage.push({ bucket: 'chantier-docs', path: file, asset, fallback: 'jpg', contentType: 'image/jpeg' });
  };
  for (const [s, d, n, who, forced] of PHOTO_PLAN) {
    if (d >= today && !(todayIsPast && d <= today)) continue;
    const onSite = WORKERS.filter((u) => entryIdx.has(`${u}|${d}|${W[s]}`));
    const uKey = who || onSite[Math.floor(rng(`uploader|${s}|${d}`)() * onSite.length)];
    if (!uKey) continue;
    const entry = entryIdx.get(`${uKey}|${d}|${W[s]}`);
    for (let no = 1; no <= n; no++) {
      const t = no === 1 ? '11:42:00' : '15:58:00';
      addPhoto(s, d, no, uKey, entry, at(d, uKey === 'karim' && d === '2026-09-22' ? (no === 1 ? '14:12:00' : '16:37:00') : t), forced && forced[no - 1]);
    }
  }
  const PDFS = [
    { s: 'VM', label: 'Devis signé.pdf', asset: 'docs/devis-demo.pdf', by: 'sophie', created: ['2026-09-01', '09:10:00'] },
    { s: 'DUB', label: 'Devis signé.pdf', asset: 'docs/devis-demo.pdf', by: 'sophie', created: ['2026-09-02', '08:55:00'] },
    { s: 'CED', label: 'Plan RDC.pdf', asset: 'docs/plan-rdc-demo.pdf', by: 'sophie', created: ['2026-09-03', '14:20:00'] },
    { s: 'LEF', label: 'Plan RDC.pdf', asset: 'docs/plan-rdc-demo.pdf', by: 'sophie', created: ['2026-09-07', '08:40:00'] },
    { s: 'CEN', label: 'PV de réception.pdf', asset: 'docs/pv-reception-demo.pdf', by: 'lucas', created: ['2026-09-18', '16:50:00'], day: '2026-09-18' },
  ];
  for (const p of PDFS) {
    if (T.parisToMs(...p.created) > nowMs) continue;
    const id = rid('pdf', p.s, p.label);
    const file = `${COMPANY_ID}/${W[p.s]}/${id}.pdf`;
    const entry = p.day ? entryIdx.get(`${p.by}|${p.day}|${W[p.s]}`) : null;
    const size = (() => { try { return fs.statSync(path.join(__dirname, '..', 'assets', p.asset)).size; } catch { return 48213; } })();
    tb.documents.push({
      id, company_id: COMPANY_ID, worksite_id: W[p.s], uploaded_by: U[p.by], label: p.label, file_path: file, file_name: p.label,
      mime_type: 'application/pdf', size_bytes: size, created_at: at(...p.created), work_date: p.day || null,
      time_entry_id: entry ? entry.id : null, photo_no: null,
    });
    storage.push({ bucket: 'chantier-docs', path: file, asset: p.asset, fallback: 'pdf', contentType: 'application/pdf', title: p.label.replace(/\.pdf$/, '') });
  }

  // Habilitations
  const certs = [
    // The UI prints « <type> — <label> » (worker-detail.tsx:663), so the label is only the complement:
    // « CACES — R486 Nacelle », « Habilitation électrique — B1V », « Visite médicale ».
    ['sofia', 'caces', 'R486 Nacelle', '2026-09-30'],
    ['sofia', 'habilitation_electrique', 'B1V', '2027-03-15'],
    ['sofia', 'visite_medicale', null, '2026-10-19'],
    ['karim', 'carte_btp', null, '2029-05-31'],
    ['karim', 'travail_hauteur', null, '2027-06-30'],
    ['thomas', 'caces', 'R489 Chariot', '2027-11-02'],
    ['julien', 'habilitation_electrique', 'BR', '2027-01-20'],
  ];
  for (const [k, type, label, exp] of certs) {
    tb.certifications.push({
      id: rid('cert', k, type, label || ''), company_id: COMPANY_ID, user_id: U[k], type, label, expiry_date: exp,
      alert_30_sent_at: null, alert_7_sent_at: null, created_at: at('2026-06-10', '10:00:00'), created_by: U.sophie,
    });
  }

  // Dépenses de septembre
  const exps = [
    ['VM', '2026-09-08', 'materiaux', 'Menuiseries alu — lot 2', 2480],
    ['VM', '2026-09-15', 'location', 'Nacelle 2 jours', 380],
    ['CED', '2026-09-09', 'materiaux', 'Plaques de plâtre', 640],
    ['CED', '2026-09-17', 'sous_traitance', 'Électricité', 1450],
    ['CEN', '2026-09-11', 'autre', 'Évacuation gravats', 290],
  ];
  for (const [s, d, cat, label, amount] of exps) {
    if (T.parisToMs(d, '18:00:00') > nowMs) continue;
    tb.worksite_expenses.push({
      id: rid('exp', s, label), company_id: COMPANY_ID, worksite_id: W[s], spent_on: d, category: cat, label, supplier: null,
      amount, created_by: U.sophie, created_at: at(d, '18:00:00'),
    });
  }

  tb.month_closures.push({ company_id: COMPANY_ID, month: '2026-08-01', closed_at: at('2026-09-02', '09:15:00'), closed_by: U.sophie });

  tb.subscription_plans.push(
    { id: rid('plan-sub', 'solo'), code: 'solo', label: "Jusqu'à 5 salariés", stripe_price_id: 'price_demo_solo', amount_eur: 29, min_workers: 1, max_workers: 5, sort: 1, active: true, created_at: at('2026-06-01', '08:00:00') },
    { id: rid('plan-sub', 'equipe'), code: 'equipe', label: '6 à 15 salariés', stripe_price_id: 'price_demo_equipe', amount_eur: 59, min_workers: 6, max_workers: 15, sort: 2, active: true, created_at: at('2026-06-01', '08:00:00') },
    { id: rid('plan-sub', 'pme'), code: 'pme', label: '16 à 40 salariés', stripe_price_id: 'price_demo_pme', amount_eur: 119, min_workers: 16, max_workers: 40, sort: 3, active: true, created_at: at('2026-06-01', '08:00:00') },
  );

  return { tb, storage, entryIdx, today, nowMs, addPhoto };
}

// ─── Thursday 24 September (S-39) — the day being filmed ─────────────────────
function thursdayBlocks(u) { return OVERRIDES[`${u}|${THURSDAY}`].blocks; }
function planId(u, s, d = THURSDAY) { return rid('plan', u, d, s); }

function addSession(g, u, s, startedAt, { located = true, accuracy = 12, dLat = 0, dLng = 0 } = {}) {
  const site = SITES[s];
  g.tb.active_sessions.push({
    user_id: U[u], company_id: COMPANY_ID, worksite_id: W[s], planning_id: planId(u, s), work_date: THURSDAY,
    started_at: at(THURSDAY, startedAt), created_at: at(THURSDAY, startedAt),
    start_lat: located ? +(site.lat + dLat).toFixed(6) : null, start_lng: located ? +(site.lng + dLng).toFixed(6) : null,
    start_accuracy_m: located ? accuracy : null, start_located_at: located ? at(THURSDAY, startedAt) : null,
  });
}

function addPositions(g, entry, u, s, startAt, endAt, startAcc, endAcc, dLat = 0, dLng = 0) {
  const site = SITES[s];
  g.tb.time_entry_positions.push(
    { id: rid('pos', entry.id, 'start'), company_id: COMPANY_ID, entry_id: entry.id, user_id: U[u], work_date: entry.work_date, moment: 'start',
      latitude: +(site.lat + dLat).toFixed(6), longitude: +(site.lng + dLng).toFixed(6), accuracy_m: startAcc, captured_at: at(entry.work_date, startAt), created_at: at(entry.work_date, endAt) },
    { id: rid('pos', entry.id, 'end'), company_id: COMPANY_ID, entry_id: entry.id, user_id: U[u], work_date: entry.work_date, moment: 'end',
      latitude: +(site.lat + dLat + 0.0002).toFixed(6), longitude: +(site.lng + dLng - 0.0002).toFixed(6), accuracy_m: endAcc, captured_at: at(entry.work_date, endAt), created_at: at(entry.work_date, endAt) },
  );
}

/**
 * Writes Thursday's time entries for the given stage.
 *  'a'  16:32 — Karim: VM draft 07:30–12:00 (+ positions, 2 morning photos). Others: mix draft / sent.
 *  'b'  16:44 — + Karim: Les Cèdres draft 12:45–16:30 (route), panier on.
 *  'c'  17:05 — Karim's day sent 16:46 with the Cèdres réserve + « Photo 1 — 24/09/2026 »; Thomas & Mehdi sent too.
 *  'final' (s6) — everybody sent, Lucas the next morning.
 */
function thursday(g, stage) {
  const d = THURSDAY;
  const sent = {
    a: { sofia: '16:20:00', julien: '16:31:00', yanis: '16:30:40' },
    b: { sofia: '16:20:00', julien: '16:31:00', yanis: '16:30:40' },
    c: { sofia: '16:20:00', julien: '16:31:00', yanis: '16:30:40', thomas: '16:52:00', mehdi: '17:01:00', karim: '16:46:00' },
    final: { sofia: '16:20:00', julien: '16:31:00', yanis: '16:30:40', thomas: '16:52:00', mehdi: '17:01:00', karim: '16:46:00', lucas: ['2026-09-25', '07:38:00'] },
  }[stage];
  const byLive = { lucas: ['07:02:00', 18], sofia: ['07:10:00', 9], thomas: ['07:15:00', 14], julien: ['07:05:00', 11] };

  for (const u of ['lucas', 'sofia', 'thomas', 'julien', 'yanis', 'mehdi']) {
    const blocks = thursdayBlocks(u);
    const s = sent[u];
    const submittedAt = !s ? null : Array.isArray(s) ? at(...s) : at(d, s);
    const entries = blocks.map((b, i) => entryRow(u, d, i, b, {
      status: submittedAt ? 'submitted' : 'draft',
      // live clock-in closes at 12:00 (stop_active_session); the rest is typed when the block ends
      created_at: i === 0 && byLive[u] ? at(d, '12:00:02') : at(d, T.normTime(b.b)),
      submitted_at: submittedAt, meal_allowance: i === 0,
    }));
    g.tb.time_entries.push(...entries);
    for (const e of entries) g.entryIdx.set(`${u}|${d}|${e.worksite_id}`, e);
    if (byLive[u]) addPositions(g, entries[0], u, blocks[0].s, byLive[u][0], '12:00:00', byLive[u][1], byLive[u][1] - 3, 0.0003, -0.0002);
  }

  // Karim
  const [vmB, cedB] = thursdayBlocks('karim');
  const kSent = sent.karim ? at(d, sent.karim) : null;
  const vm = entryRow('karim', d, 0, vmB, {
    status: kSent ? 'submitted' : 'draft', created_at: at(d, '12:00:03'), submitted_at: kSent,
    meal_allowance: stage !== 'a',
  });
  g.tb.time_entries.push(vm);
  g.entryIdx.set(`karim|${d}|${W.VM}`, vm);
  // live clock-in: the place at start and at the end (etape 26)
  g.tb.time_entry_positions.push(
    { id: rid('pos', vm.id, 'start'), company_id: COMPANY_ID, entry_id: vm.id, user_id: U.karim, work_date: d, moment: 'start', latitude: 45.8994, longitude: 6.1281, accuracy_m: 12, captured_at: at(d, '07:30:00'), created_at: at(d, '12:00:03') },
    { id: rid('pos', vm.id, 'end'), company_id: COMPANY_ID, entry_id: vm.id, user_id: U.karim, work_date: d, moment: 'end', latitude: 45.8996, longitude: 6.1279, accuracy_m: 9, captured_at: at(d, '12:00:00'), created_at: at(d, '12:00:03') },
  );
  // two morning photos, taken from the planned chantier (no line yet → time_entry_id null)
  g.addPhoto('VM', d, 1, 'karim', null, at(d, '10:12:00'), 11);
  g.addPhoto('VM', d, 2, 'karim', null, at(d, '11:48:00'), 3);
  if (stage === 'a') return;

  const ced = entryRow('karim', d, 1, cedB, {
    planning_id: null, status: kSent ? 'submitted' : 'draft', created_at: at(d, '16:43:00'), submitted_at: kSent,
    client_id: 'local_1790260980000_k4r1m', meal_allowance: false,
    reception: kSent ? 'avec' : null, observation: kSent ? 'Joint silicone manquant fenêtre salon' : null,
  });
  g.tb.time_entries.push(ced);
  g.entryIdx.set(`karim|${d}|${W.CED}`, ced);
  if (stage === 'b') return;

  // sent: the grid's self-heal created the Cèdres slot (added_by_worker)…
  g.tb.planning.push(planRow('karim', d, 'CED', { added_by_worker: true, created_at: at(d, '16:46:30'), created_by: null }));
  // …and the photo of the réserve, attached to the Cèdres line (taken 16:44, still on site).
  g.addPhoto('CED', d, 1, 'karim', ced, at(d, '16:44:00'), 1); // the missing silicone joint
}

/** Office correction made in the « Contrôler » take (Thursday 17:06), kept in every later scene. */
function officeCorrection(g) {
  // Le bureau a corrigé Les Cèdres (16:30 → 16:45, la photo de 16:44 le prouve) le jeudi soir, salarié prévenu.
  const ced = g.entryIdx.get(`karim|${THURSDAY}|${W.CED}`);
  ced.end_time = '16:45:00';
  ced.modified_at = at(THURSDAY, '17:06:00');
  ced.modified_by = U.sophie;
  g.tb.time_entry_corrections.push({
    id: rid('corr', ced.id, 1), company_id: COMPANY_ID, entry_id: ced.id, worker_id: U.karim, work_date: THURSDAY,
    corrected_by: U.sophie, corrected_by_role: 'admin', corrected_at: at(THURSDAY, '17:06:00'),
    old_start: '12:45:00', old_end: '16:30:00', new_start: '12:45:00', new_end: '16:45:00', was_exported: false,
    notified_at: at(THURSDAY, '17:06:02'), notify_error: null,
  });
}

// ─── scene presets ───────────────────────────────────────────────────────────
const SCENES = {
  s1: { now: [THURSDAY, '07:25:00'], title: 'Jeudi 07:25 — personne n’a encore envoyé ; 4 en direct (Lucas, Sofia, Thomas, Julien)' },
  s2: { now: [THURSDAY, '07:29:30'], title: 'Identique à s1, 07:29:30 (juste avant « Je commence »)' },
  s2x: { now: [THURSDAY, '07:31:00'], title: 's1 + Karim en direct à la Villa Martin depuis 07:30:00 → 5 en direct' },
  s3a: { now: [THURSDAY, '16:32:00'], title: 'Karim : brouillon Villa Martin 07:30–12:00 + positions ; les autres : brouillons / envoyés' },
  s3b: { now: [THURSDAY, '16:44:00'], title: 's3a + brouillon Résidence Les Cèdres 12:45–16:30 (route), panier coché' },
  s4: { now: [THURSDAY, '17:05:00'], title: 'Journée de Karim envoyée 16:46 (réserve Les Cèdres, Photo 1 — 24/09/2026)' },
  s4b: { now: [THURSDAY, '16:44:00'], title: 'Identique à s3b (avant le morphing prévu → pointé)' },
  s5: { now: [THURSDAY, '17:20:00'], title: 'Identique à s4 — 2 réserves à traiter (Karim + Sofia)' },
  s6: { now: ['2026-09-30', '17:00:00'], title: 'Fin de mois : tout septembre envoyé, correction du bureau sur Les Cèdres, rien exporté' },
  s6x: { now: ['2026-09-30', '17:05:00'], title: 's6 après export : septembre verrouillé (exporté 17:03) et clôturé' },
  s7c: { now: [THURSDAY, '10:20:00'], title: 'Vue chef (Julien) : Thomas en direct depuis 07:15, Yanis rien encore' },
  s7: { now: [THURSDAY, '17:30:00'], title: 'Identique à s4 (congés, habilitations, import)' },
};

function build(scene, nowOverrideMs = null) {
  const def = SCENES[scene];
  if (!def) throw new Error(`unknown scene ${scene}`);
  const nowMs = nowOverrideMs ?? T.parisToMs(...def.now);
  const past = scene === 's6' || scene === 's6x';
  const g = generate(nowMs, { todayIsPast: past });

  switch (scene) {
    case 's1': case 's2':
      addSession(g, 'lucas', 'CEN', '07:02:00', { accuracy: 18, dLat: 0.0003, dLng: -0.0002 });
      addSession(g, 'sofia', 'DUB', '07:10:00', { accuracy: 9, dLat: 0.0003, dLng: -0.0002 });
      addSession(g, 'thomas', 'JF', '07:15:00', { accuracy: 14, dLat: 0.0003, dLng: -0.0002 });
      addSession(g, 'julien', 'JF', '07:05:00', { accuracy: 11, dLat: 0.0003, dLng: -0.0002 });
      break;
    case 's2x':
      addSession(g, 'lucas', 'CEN', '07:02:00', { accuracy: 18, dLat: 0.0003, dLng: -0.0002 });
      addSession(g, 'sofia', 'DUB', '07:10:00', { accuracy: 9, dLat: 0.0003, dLng: -0.0002 });
      addSession(g, 'thomas', 'JF', '07:15:00', { accuracy: 14, dLat: 0.0003, dLng: -0.0002 });
      addSession(g, 'julien', 'JF', '07:05:00', { accuracy: 11, dLat: 0.0003, dLng: -0.0002 });
      addSession(g, 'karim', 'VM', '07:30:00', { accuracy: 12 });
      break;
    case 's3a': thursday(g, 'a'); break;
    case 's3b': case 's4b': thursday(g, 'b'); break;
    case 's4': thursday(g, 'c'); break;
    case 's5': case 's7': thursday(g, 'c'); officeCorrection(g); break;
    case 's7c': {
      addSession(g, 'lucas', 'CEN', '07:02:00', { accuracy: 18, dLat: 0.0003, dLng: -0.0002 });
      addSession(g, 'sofia', 'DUB', '07:10:00', { accuracy: 9, dLat: 0.0003, dLng: -0.0002 });
      addSession(g, 'julien', 'JF', '07:05:00', { accuracy: 11, dLat: 0.0003, dLng: -0.0002 });
      addSession(g, 'thomas', 'JF', '07:15:00', { accuracy: 14, dLat: 0.0003, dLng: -0.0002 });
      break;
    }
    case 's6': case 's6x': {
      thursday(g, 'final');
      officeCorrection(g);
      // La réserve de Sofia (corrigée sur place) a été levée par le bureau le jeudi soir.
      const sofia = g.tb.time_entries.find((t) => t.user_id === U.sofia && t.work_date === '2026-09-21' && t.reception === 'avec');
      Object.assign(sofia, { reserve_resolved_at: at(THURSDAY, '17:22:00'), reserve_resolved_by: U.sophie, reserve_resolution: 'Seuil repris, vérifié sur place' });
      if (scene === 's6x') {
        const stamp = at('2026-09-30', '17:03:00');
        for (const t of g.tb.time_entries) {
          if (t.work_date >= '2026-09-01' && t.work_date <= '2026-09-30' && (t.status === 'submitted' || t.status === 'validated')) {
            t.exported_at = stamp; t.locked = true;
          }
        }
        g.tb.month_closures.push({ company_id: COMPANY_ID, month: '2026-09-01', closed_at: at('2026-09-30', '17:04:00'), closed_by: U.sophie });
      }
      break;
    }
    default: break;
  }

  // Nothing may exist "after" the demo clock.
  for (const [t, list] of Object.entries(g.tb)) {
    for (const r of list) {
      for (const k of ['created_at', 'submitted_at', 'started_at', 'captured_at', 'corrected_at', 'decided_at', 'closed_at', 'reserve_resolved_at', 'reserve_fixed_at']) {
        if (r[k] && Date.parse(r[k]) > nowMs) throw new Error(`fixtures(${scene}): ${t}.${k}=${r[k]} is after now`);
      }
    }
  }
  return { nowMs, tables: g.tb, storage: g.storage, title: def.title };
}

/** Budget (hours) such that Math.round(used / budget * 100) === target. */
function calibrateBudget(usedMinutes, target) {
  const used = usedMinutes / 60;
  const ideal = used / (target / 100);
  let best = Math.max(1, Math.round(ideal));
  for (let b = Math.max(1, Math.floor(ideal) - 3); b <= Math.ceil(ideal) + 3; b++) {
    if (Math.round((used / b) * 100) === target) { best = b; break; }
  }
  return best;
}

module.exports = {
  COMPANY_ID, U, W, PEOPLE, SITES, SCENES, THURSDAY, WORKERS, emailOf, build, calibrateBudget,
  DEMO_USERS: Object.fromEntries(Object.keys(PEOPLE).map((k) => [k, { id: U[k], email: emailOf(k), role: PEOPLE[k].role, name: `${PEOPLE[k].first} ${PEOPLE[k].last}` }])),
};
