'use strict';
// In-memory store + the server-side behaviour of the real database that the
// BEMEXO UI depends on: mini-RLS scoped to the caller's company, the
// time_entries / documents / active_sessions guard triggers, generated
// total_minutes, unique violations (23505), cascades.

const crypto = require('crypto');
const { TABLES, DEFAULTS } = require('./schema');
const T = require('./time');

class PgError extends Error {
  constructor(code, message, { details = null, hint = null, status } = {}) {
    super(message);
    this.code = code;
    this.details = details;
    this.hint = hint;
    this.status = status || PgError.statusFor(code);
  }
  static statusFor(code) {
    if (code === '23505' || code === '23503') return 409;
    if (code === '42501') return 403;
    if (code === 'PGRST116') return 406;
    if (code === 'PGRST204' || code === '42703' || code === 'PGRST200' || code === 'PGRST100') return 400;
    return 400;
  }
  toJSON() { return { code: this.code, details: this.details, hint: this.hint, message: this.message }; }
}

const store = { tables: {}, seq: 0 };
function rows(table) { return store.tables[table] || (store.tables[table] = []); }
function uuid() { return crypto.randomUUID(); }

function load(data) {
  store.tables = {};
  for (const t of Object.keys(TABLES)) store.tables[t] = [];
  for (const [t, list] of Object.entries(data)) {
    if (!TABLES[t]) throw new Error(`fixtures: unknown table ${t}`);
    store.tables[t] = list.map((r) => normaliseRow(t, { ...r }));
  }
  for (const r of rows('time_entries')) computeGenerated(r);
}

// ─── type normalisation ───────────────────────────────────────────────────────
function normValue(type, v) {
  if (v === undefined || v === null) return v === undefined ? undefined : null;
  switch (type) {
    case 'time': return T.normTime(v);
    case 'date': return String(v).slice(0, 10);
    case 'timestamptz': { const ms = Date.parse(v); return Number.isFinite(ms) ? T.iso(ms) : v; }
    case 'numeric': { const n = Number(v); return Number.isFinite(n) ? n : v; }
    case 'int': { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : v; }
    case 'bool': return v === true || v === 'true';
    default: return v;
  }
}
function normaliseRow(table, r) {
  const cols = TABLES[table].cols;
  for (const k of Object.keys(r)) if (cols[k]) r[k] = normValue(cols[k], r[k]);
  return r;
}

function computeGenerated(r) {
  if (r.start_time && r.end_time) {
    let d = T.timeToMin(r.end_time) - T.timeToMin(r.start_time);
    if (d < 0) d += 1440;
    r.total_minutes = d - (Number(r.break_minutes) || 0);
  } else r.total_minutes = 0;
}

// ─── caller context ──────────────────────────────────────────────────────────
function ctxFor(uid) {
  const u = uid ? rows('users').find((x) => x.id === uid) : null;
  const active = !!u && u.is_active !== false;
  const company = active ? u.company_id : null;
  const role = active ? u.role : null;
  return {
    uid: u ? uid : null, user: u || null, company, role,
    isAdmin: role === 'admin', isLead: role === 'lead',
    now: T.clock.nowIso(), nowMs: T.clock.now(), today: T.clock.today(),
    uuid, allowReserveFix: false, bypassRls: false,
  };
}
function serviceCtx(base) { return { ...base, bypassRls: true }; }

const sameCo = (r, c) => !!c.company && r.company_id === c.company;

function monthClosed(company, date) {
  if (!date) return false;
  const m = `${String(date).slice(0, 7)}-01`;
  return rows('month_closures').some((x) => x.company_id === company && x.month === m);
}

/** is_my_team_member(p_user, p_date): lead + today + shares a chantier with me today. */
function isTeamMember(c, userId, date) {
  if (!c.isLead || !userId || date !== c.today) return false;
  const u = rows('users').find((x) => x.id === userId);
  if (!u || u.company_id !== c.company) return false;
  const sitesOf = (uid) => {
    const s = new Set();
    for (const p of rows('planning')) if (p.user_id === uid && p.work_date === date && p.worksite_id) s.add(p.worksite_id);
    for (const t of rows('time_entries')) if (t.user_id === uid && t.work_date === date && t.worksite_id && t.status !== 'cancelled') s.add(t.worksite_id);
    return s;
  };
  const mine = sitesOf(c.uid);
  for (const w of sitesOf(userId)) if (mine.has(w)) return true;
  return false;
}

// ─── row level security ──────────────────────────────────────────────────────
const adminCo = (r, c) => sameCo(r, c) && c.isAdmin;
const never = () => false;
const RLS = {
  companies: { select: (r, c) => r.id === c.company, insert: never, update: never, delete: never },
  users: {
    select: sameCo, insert: never,
    update: (r, c) => sameCo(r, c) && (c.isAdmin || r.id === c.uid), check: (r, c) => sameCo(r, c),
    delete: adminCo,
  },
  user_payroll: { select: adminCo, insert: adminCo, update: adminCo, delete: adminCo },
  worksites: { select: sameCo, insert: sameCo, update: adminCo, delete: adminCo },
  planning: {
    select: (r, c) => sameCo(r, c) && (c.isAdmin || r.user_id === c.uid || isTeamMember(c, r.user_id, r.work_date)),
    insert: adminCo, update: adminCo, delete: adminCo,
  },
  time_entries: {
    select: (r, c) => sameCo(r, c) && (c.isAdmin || r.user_id === c.uid || isTeamMember(c, r.user_id, r.work_date)),
    insert: (r, c) => sameCo(r, c) && (c.isAdmin
      || (r.user_id === c.uid && r.status === 'draft')
      || (r.status === 'draft' && isTeamMember(c, r.user_id, r.work_date))),
    update: (r, c) => sameCo(r, c) && (c.isAdmin
      || (r.user_id === c.uid && ['draft', 'submitted'].includes(r.status) && !r.locked)
      || (!r.locked && ['draft', 'submitted'].includes(r.status) && isTeamMember(c, r.user_id, r.work_date))),
    check: (r, c) => sameCo(r, c) && (c.isAdmin
      || (r.user_id === c.uid && ['draft', 'submitted', 'cancelled'].includes(r.status) && !r.locked)
      || (!r.locked && ['draft', 'submitted'].includes(r.status) && isTeamMember(c, r.user_id, r.work_date))),
    delete: (r, c) => sameCo(r, c) && (c.isAdmin || (r.user_id === c.uid && r.status === 'draft' && !r.locked)),
  },
  active_sessions: {
    select: (r, c) => sameCo(r, c) && (c.isAdmin || r.user_id === c.uid),
    insert: (r, c) => sameCo(r, c) && r.user_id === c.uid,
    update: never,
    delete: (r, c) => sameCo(r, c) && (c.isAdmin || r.user_id === c.uid),
  },
  time_entry_positions: { select: (r, c) => sameCo(r, c) && (c.isAdmin || r.user_id === c.uid), insert: never, update: never, delete: never },
  time_entry_corrections: {
    select: (r, c) => sameCo(r, c) && (c.isAdmin || r.worker_id === c.uid || r.corrected_by === c.uid),
    insert: (r, c) => sameCo(r, c) && r.corrected_by === c.uid && (c.isAdmin || isTeamMember(c, r.worker_id, r.work_date)),
    update: (r, c) => sameCo(r, c) && r.corrected_by === c.uid && !r.notified_at,
    check: (r, c) => sameCo(r, c) && r.corrected_by === c.uid,
    delete: never,
  },
  documents: {
    select: sameCo,
    insert: (r, c) => sameCo(r, c) && r.uploaded_by === c.uid,
    update: adminCo,
    delete: (r, c) => sameCo(r, c) && (c.isAdmin || r.uploaded_by === c.uid),
  },
  certifications: { select: adminCo, insert: adminCo, update: adminCo, delete: adminCo },
  leave_requests: {
    select: (r, c) => sameCo(r, c) && (c.isAdmin || r.user_id === c.uid),
    insert: (r, c) => sameCo(r, c) && r.user_id === c.uid,
    update: adminCo,
    delete: (r, c) => sameCo(r, c) && (c.isAdmin || (r.user_id === c.uid && r.status === 'pending')),
  },
  worksite_expenses: { select: adminCo, insert: adminCo, update: adminCo, delete: adminCo },
  month_closures: {
    select: sameCo,
    insert: (r, c) => adminCo(r, c) && (!r.closed_by || r.closed_by === c.uid),
    update: adminCo, delete: adminCo,
  },
  invitations: { select: adminCo, insert: adminCo, update: adminCo, delete: adminCo },
  push_subscriptions: {
    select: (r, c) => r.user_id === c.uid, insert: (r, c) => r.user_id === c.uid,
    update: (r, c) => r.user_id === c.uid, delete: (r, c) => r.user_id === c.uid,
  },
  subscription_plans: { select: (r) => r.active !== false, insert: never, update: never, delete: never },
  payroll_sends: { select: adminCo, insert: never, update: never, delete: never },
};

function can(op, table, row, c) {
  if (c.bypassRls) return true;
  if (!c.uid) return false; // anon key: nothing
  const p = RLS[table];
  if (!p) return false;
  const f = p[op] || (op === 'check' ? p.update : null);
  return f ? !!f(row, c) : false;
}

// ─── triggers ────────────────────────────────────────────────────────────────
const TRACKED = ['start_time', 'end_time', 'break_minutes', 'meal_allowance', 'observation', 'reception', 'worksite_id', 'photos', 'gap_before'];
const changed = (a, b, keys) => keys.some((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
const raise = (msg, code = 'P0001') => { throw new PgError(code, msg); };

function guardTimeEntryWrite(op, n, o, c) {
  if (!c.uid) return;
  if (c.isAdmin) {
    if (op === 'UPDATE' && changed(n, o, TRACKED)) { n.modified_at = c.now; n.modified_by = c.uid; }
    return;
  }
  if (monthClosed(n.company_id, n.work_date) && !c.allowReserveFix) raise('time_entries: le mois est clôturé par le bureau');
  if (op === 'INSERT') {
    Object.assign(n, {
      locked: false, exported_at: null, validated_at: null, validated_by: null, modified_at: null, modified_by: null,
      submitted_at: null, reserve_resolved_at: null, reserve_resolved_by: null, reserve_resolution: null,
      reserve_fixed_at: null, reserve_fixed_by: null, reserve_fix_note: null,
    });
    if (n.user_id !== c.uid) n.status = 'draft';
  } else {
    for (const k of ['user_id', 'company_id', 'work_date', 'locked', 'exported_at', 'validated_at', 'validated_by', 'client_id',
      'reserve_resolved_at', 'reserve_resolved_by', 'reserve_resolution']) n[k] = o[k];
    if (!c.allowReserveFix) for (const k of ['reserve_fixed_at', 'reserve_fixed_by', 'reserve_fix_note']) n[k] = o[k];
    if (o.user_id !== c.uid) n.status = o.status;
    if (o.status === 'submitted' && n.status === 'draft') raise('time_entries: une journée envoyée ne redevient pas brouillon (retirez-la ou corrigez-la)');
    if (o.status === 'cancelled' && n.status !== 'cancelled') raise('time_entries: une intervention retirée ne se réactive pas');
    if (o.status === 'submitted' && (n.status === 'cancelled' || changed(n, o, TRACKED))) { n.modified_at = c.now; n.modified_by = c.uid; }
    else { n.modified_at = o.modified_at ?? null; n.modified_by = o.modified_by ?? null; }
    if (n.status === 'submitted' && o.status === 'draft') n.submitted_at = c.now; // demo clock, not the browser's value
    else n.submitted_at = o.submitted_at ?? null;
  }
  if (!n.worksite_id || !rows('worksites').some((w) => w.id === n.worksite_id && w.company_id === n.company_id)) {
    raise('time_entries: chantier hors de votre entreprise');
  }
}

function guardDocumentWrite(op, n, o, c) {
  if (!rows('worksites').some((w) => w.id === n.worksite_id && w.company_id === n.company_id)) raise('documents: chantier hors de votre entreprise');
  if (n.time_entry_id) {
    const t = rows('time_entries').find((x) => x.id === n.time_entry_id);
    if (!t) raise('documents: intervention introuvable');
    if (t.company_id !== n.company_id || t.worksite_id !== n.worksite_id) raise("documents: cette intervention n'est pas celle de ce chantier");
    n.work_date = t.work_date;
  }
  if (op === 'INSERT' && !String(n.label || '').trim() && String(n.mime_type || '').startsWith('image/')) {
    const key = n.work_date || '0001-01-01';
    let max = 0;
    for (const d of rows('documents')) if (d.worksite_id === n.worksite_id && (d.work_date || '0001-01-01') === key) max = Math.max(max, d.photo_no || 0);
    n.photo_no = max + 1;
    n.label = `Photo ${n.photo_no}${n.work_date ? ` — ${n.work_date.slice(8, 10)}/${n.work_date.slice(5, 7)}/${n.work_date.slice(0, 4)}` : ''}`;
  }
}

function guardActiveSession(op, n, o, c) {
  if (!rows('worksites').some((w) => w.id === n.worksite_id && w.company_id === n.company_id)) raise('active_sessions: chantier hors de votre entreprise');
  if (monthClosed(n.company_id, n.work_date)) raise('active_sessions: le mois est clôturé par le bureau');
  if (op === 'INSERT') { n.started_at = c.now; n.created_at = c.now; } // trigger-set, demo clock
  const co = rows('companies').find((x) => x.id === n.company_id);
  if (!co || !co.position_tracking_enabled) {
    n.start_lat = null; n.start_lng = null; n.start_accuracy_m = null; n.start_located_at = null;
  } else n.start_located_at = (n.start_lat != null && n.start_lng != null) ? c.now : null;
}

function guardMonthClosure(op, n) {
  const who = rows('active_sessions').filter((a) => a.company_id === n.company_id && `${a.work_date.slice(0, 7)}-01` === n.month)
    .map((a) => { const u = rows('users').find((x) => x.id === a.user_id); return u ? `${u.first_name} ${u.last_name}`.trim() : ''; })
    .filter(Boolean);
  if (who.length) raise(`Impossible de clôturer : ${who.join(', ')} a un pointage encore ouvert sur ce mois. Sa journée doit être fermée avant.`);
}

function guardCorrectionImmutable(op, n, o, c) {
  if (!c.uid) return;
  for (const k of ['id', 'company_id', 'entry_id', 'worker_id', 'work_date', 'corrected_by', 'corrected_by_role', 'corrected_at',
    'old_start', 'old_end', 'new_start', 'new_end', 'was_exported']) n[k] = o[k];
}

const TRIGGERS = {
  time_entries: { beforeWrite: guardTimeEntryWrite, beforeDelete: (o, c) => {
    if (!c.uid || c.isAdmin) return;
    if (monthClosed(o.company_id, o.work_date)) raise('time_entries: le mois est clôturé par le bureau');
  } },
  documents: { beforeWrite: guardDocumentWrite },
  active_sessions: { beforeWrite: guardActiveSession },
  month_closures: { beforeWrite: (op, n) => { if (op === 'INSERT') guardMonthClosure(op, n); } },
  time_entry_corrections: { beforeWrite: (op, n, o, c) => { if (op === 'UPDATE') guardCorrectionImmutable(op, n, o, c); } },
};

// ─── unique constraints ──────────────────────────────────────────────────────
const UNIQUES = {
  time_entries: [
    { name: 'time_entries_client_id_unique', cols: ['user_id', 'client_id'], where: (r) => r.client_id != null },
    { name: 'one_meal_per_day', cols: ['user_id', 'work_date'], where: (r) => r.meal_allowance === true && r.status !== 'cancelled' },
  ],
  active_sessions: [{ name: 'active_sessions_pkey', cols: ['user_id'] }],
  month_closures: [{ name: 'month_closures_pkey', cols: ['company_id', 'month'] }],
  user_payroll: [
    { name: 'user_payroll_pkey', cols: ['user_id'] },
    { name: 'user_payroll_matricule_unique', cols: ['company_id', 'payroll_id'], where: (r) => r.payroll_id != null && String(r.payroll_id).trim() !== '' },
  ],
  time_entry_positions: [{ name: 'time_entry_positions_entry_moment_key', cols: ['entry_id', 'moment'] }],
  push_subscriptions: [{ name: 'push_subscriptions_endpoint_key', cols: ['endpoint'] }],
  subscription_plans: [{ name: 'subscription_plans_code_key', cols: ['code'] }],
};
function pkUnique(table) { return { name: `${table}_pkey`, cols: TABLES[table].pk }; }

function checkUniques(table, candidate, exclude = new Set(), extra = []) {
  const list = [pkUnique(table), ...(UNIQUES[table] || [])];
  const seen = new Set();
  for (const u of list) {
    if (seen.has(u.name)) continue; seen.add(u.name);
    if (u.where && !u.where(candidate)) continue;
    const key = u.cols.map((k) => JSON.stringify(candidate[k] ?? null)).join('|');
    const clash = [...rows(table), ...extra].find((r) => !exclude.has(r) && r !== candidate
      && (!u.where || u.where(r)) && u.cols.map((k) => JSON.stringify(r[k] ?? null)).join('|') === key);
    if (clash) {
      throw new PgError('23505', `duplicate key value violates unique constraint "${u.name}"`,
        { details: `Key (${u.cols.join(', ')})=(${u.cols.map((k) => candidate[k]).join(', ')}) already exists.` });
    }
  }
}

// ─── write primitives (used by PostgREST handlers and RPCs) ──────────────────
function unknownColumns(table, obj) {
  const cols = TABLES[table].cols;
  return Object.keys(obj).filter((k) => !cols[k]);
}

function prepareInsert(table, body, c) {
  const bad = unknownColumns(table, body);
  if (bad.length) throw new PgError('PGRST204', `Could not find the '${bad[0]}' column of '${table}' in the schema cache`);
  const r = {};
  const cols = TABLES[table].cols;
  for (const k of Object.keys(cols)) r[k] = null;
  const dctx = { now: c.now, today: c.today, uuid };
  for (const [k, f] of Object.entries({ ...DEFAULTS['*'], ...(DEFAULTS[table] || {}) })) {
    if (!(k in cols)) continue;
    if (body[k] === undefined) r[k] = typeof f === 'function' ? f(dctx) : f;
  }
  for (const [k, v] of Object.entries(body)) if (!(TABLES[table].generated || []).includes(k)) r[k] = v;
  if (TABLES[table].generated && body.total_minutes !== undefined) {
    throw new PgError('428C9', 'cannot insert a non-DEFAULT value into column "total_minutes"', { details: 'Column "total_minutes" is a generated column.' });
  }
  normaliseRow(table, r);
  const trg = TRIGGERS[table];
  if (trg && trg.beforeWrite) trg.beforeWrite('INSERT', r, null, c);
  if (table === 'time_entries') computeGenerated(r);
  return r;
}

/** Inserts rows atomically. `opts.rls=false` for SECURITY DEFINER paths. */
function insertRows(table, bodies, c, opts = {}) {
  const useRls = opts.rls !== false && !c.bypassRls;
  const prepared = [];
  for (const b of bodies) {
    const r = prepareInsert(table, b, c);
    if (useRls && !can('insert', table, r, c)) {
      throw new PgError('42501', `new row violates row-level security policy for table "${table}"`);
    }
    checkUniques(table, r, new Set(), prepared);
    prepared.push(r);
  }
  rows(table).push(...prepared);
  return prepared;
}

function updateRow(table, old, patch, c, opts = {}) {
  const useRls = opts.rls !== false && !c.bypassRls;
  const bad = unknownColumns(table, patch);
  if (bad.length) throw new PgError('PGRST204', `Could not find the '${bad[0]}' column of '${table}' in the schema cache`);
  if (TABLES[table].generated && patch.total_minutes !== undefined) {
    throw new PgError('428C9', 'column "total_minutes" can only be updated to DEFAULT');
  }
  const n = normaliseRow(table, { ...old, ...patch });
  const trg = TRIGGERS[table];
  if (trg && trg.beforeWrite) trg.beforeWrite('UPDATE', n, old, c);
  if (table === 'time_entries') computeGenerated(n);
  if (useRls && !can('check', table, n, c)) {
    throw new PgError('42501', `new row violates row-level security policy (USING expression) for table "${table}"`);
  }
  checkUniques(table, n, new Set([old]));
  return n;
}

/** Applies a patch to the given rows atomically; returns the new rows. */
function updateRows(table, targets, patch, c, opts = {}) {
  const next = targets.map((o) => updateRow(table, o, patch, c, opts));
  const list = rows(table);
  targets.forEach((o, i) => { const idx = list.indexOf(o); if (idx >= 0) list[idx] = next[i]; });
  return next;
}

function deleteRows(table, targets, c) {
  const trg = TRIGGERS[table];
  for (const o of targets) if (trg && trg.beforeDelete) trg.beforeDelete(o, c);
  const set = new Set(targets);
  store.tables[table] = rows(table).filter((r) => !set.has(r));
  // cascades / set null
  const ids = new Set(targets.map((r) => r.id).filter(Boolean));
  if (table === 'time_entries' && ids.size) {
    store.tables.time_entry_positions = rows('time_entry_positions').filter((p) => !ids.has(p.entry_id));
    store.tables.time_entry_corrections = rows('time_entry_corrections').filter((p) => !ids.has(p.entry_id));
    for (const d of rows('documents')) if (ids.has(d.time_entry_id)) d.time_entry_id = null;
  }
  if (table === 'planning' && ids.size) {
    for (const t of rows('time_entries')) if (ids.has(t.planning_id)) t.planning_id = null;
    for (const s of rows('active_sessions')) if (ids.has(s.planning_id)) s.planning_id = null;
  }
  if (table === 'users' && ids.size) {
    for (const t of ['user_payroll', 'planning', 'time_entries', 'active_sessions', 'certifications', 'leave_requests']) {
      store.tables[t] = rows(t).filter((r) => !ids.has(r.user_id));
    }
  }
  if (table === 'worksites' && ids.size) {
    for (const t of ['planning', 'time_entries', 'documents', 'worksite_expenses', 'active_sessions']) {
      store.tables[t] = rows(t).filter((r) => !ids.has(r.worksite_id));
    }
  }
  return targets;
}

module.exports = {
  PgError, store, rows, uuid, load, ctxFor, serviceCtx, can, isTeamMember, monthClosed,
  insertRows, updateRows, updateRow, deleteRows, normValue, computeGenerated, raise,
};
