'use strict';
// The Postgres functions the app calls through supabase.rpc(), re-implemented
// over the in-memory store with the same checks, return shapes and error
// messages as the SQL in supabase/migrations.

const db = require('./db');
const T = require('./time');
const { PgError, rows, raise } = db;

const VOID = Symbol('void');

function requireAuth(c) { if (!c.uid || !c.company) raise('Profil introuvable'); }
function requireAdmin(c) { if (!c.isAdmin) raise("Réservé à l'administrateur de l'entreprise"); }

/** round(extract(minute)/15)*15 min, like the SQL (half away from zero). */
function roundQuarter(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const q = Math.round(m / 15) * 15; // m >= 0 so Math.round == half-up
  return T.minToTime(h * 60 + q);
}

/** worksite_labour(): route rule mirrored from the SQL window function. */
function worksiteLabour(company, from, to, tables = null) {
  const get = (t) => (tables ? tables[t] || [] : rows(t));
  const co = get('companies').find((x) => x.id === company);
  const travelPaid = !!(co && co.travel_paid);
  const scoped = get('time_entries').filter((t) => t.company_id === company
    && (t.status === 'submitted' || t.status === 'validated') && t.worksite_id && t.start_time && t.end_time
    && (!from || t.work_date >= from) && (!to || t.work_date <= to))
    .map((t) => {
      const startMin = T.timeToMin(t.start_time);
      const endMin = (T.timeToMin(t.end_time) < startMin ? 1440 : 0) + T.timeToMin(t.end_time);
      return { t, startMin, endMin };
    });
  const byDay = new Map();
  for (const s of scoped) {
    const k = `${s.t.user_id}|${s.t.work_date}`;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  const agg = new Map();
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startMin - b.startMin || String(a.t.id).localeCompare(String(b.t.id)));
    let prevEnd = null;
    for (const s of list) {
      let route = 0;
      if (s.t.gap_before === 'route' && prevEnd !== null && s.startMin > prevEnd && travelPaid) route = s.startMin - prevEnd;
      prevEnd = prevEnd === null ? s.endMin : Math.max(prevEnd, s.endMin);
      const pay = get('user_payroll').find((p) => p.user_id === s.t.user_id && p.company_id === company);
      const rate = pay && pay.hourly_rate != null ? Number(pay.hourly_rate) : null;
      const key = `${s.t.worksite_id}|${s.t.user_id}`;
      if (!agg.has(key)) agg.set(key, { worksite_id: s.t.worksite_id, user_id: s.t.user_id, worked_minutes: 0, route_minutes: 0, paid_minutes: 0, cost: 0, unpriced_minutes: 0 });
      const a = agg.get(key);
      const paid = s.t.total_minutes + route;
      a.worked_minutes += s.t.total_minutes;
      a.route_minutes += route;
      a.paid_minutes += paid;
      if (rate == null) a.unpriced_minutes += paid; else a.cost += (paid / 60) * rate;
    }
  }
  return [...agg.values()].map((a) => ({ ...a, cost: Math.round(a.cost * 1e6) / 1e6 }));
}

const FNS = {
  stop_active_session(a, c) {
    requireAuth(c);
    const s = rows('active_sessions').find((x) => x.user_id === c.uid);
    if (!s) raise('Aucun pointage en cours');
    const vStart = roundQuarter(T.parisTime(Date.parse(s.started_at)));
    const vEnd = a.p_end ? roundQuarter(T.normTime(a.p_end)) : roundQuarter(T.parisTime(c.nowMs));
    if (vStart === vEnd) raise("Début et fin tombent sur le même quart d'heure : rien à enregistrer.", 'BT001');
    const [entry] = db.insertRows('time_entries', [{
      company_id: s.company_id, user_id: s.user_id, worksite_id: s.worksite_id, planning_id: s.planning_id,
      work_date: s.work_date, start_time: vStart, end_time: vEnd, break_minutes: 0, meal_allowance: false, status: 'draft',
    }], c, { rls: false });
    const co = rows('companies').find((x) => x.id === s.company_id);
    if (co && co.position_tracking_enabled) {
      const pos = [];
      if (s.start_lat != null && s.start_lng != null) {
        pos.push({ company_id: s.company_id, entry_id: entry.id, user_id: s.user_id, work_date: s.work_date, moment: 'start',
          latitude: s.start_lat, longitude: s.start_lng, accuracy_m: s.start_accuracy_m, captured_at: s.start_located_at || s.started_at });
      }
      const duree = c.nowMs - Date.parse(s.started_at);
      if (a.p_lat != null && a.p_lng != null && duree <= 14 * 3600 * 1000) {
        pos.push({ company_id: s.company_id, entry_id: entry.id, user_id: s.user_id, work_date: s.work_date, moment: 'end',
          latitude: Number(a.p_lat), longitude: Number(a.p_lng), accuracy_m: a.p_accuracy == null ? null : Math.round(a.p_accuracy), captured_at: c.now });
      }
      if (pos.length) db.insertRows('time_entry_positions', pos, c, { rls: false });
    }
    db.deleteRows('active_sessions', [s], db.serviceCtx(c));
    return [{ entry_id: entry.id, work_date: s.work_date, start_time: vStart, end_time: vEnd }];
  },

  correct_time_entry(a, c) {
    requireAuth(c);
    const e = rows('time_entries').find((t) => t.id === a.p_entry_id && db.can('select', 'time_entries', t, c));
    if (!e) raise("Cette ligne n'existe pas, ou vous n'y avez pas accès.");
    const pStart = T.normTime(a.p_start); const pEnd = T.normTime(a.p_end);
    if (e.start_time === pStart && e.end_time === pEnd) raise('Ces heures sont déjà celles-là.');
    if (e.user_id === c.uid) raise("Ce chemin sert à corriger les heures de quelqu'un d'autre.");
    const role = c.isAdmin ? 'admin' : db.isTeamMember(c, e.user_id, e.work_date) ? 'lead' : null;
    if (!role) raise("Vous n'avez pas le droit de corriger les heures de cette personne.");
    if (!db.can('update', 'time_entries', e, c)) raise("Cette ligne n'a pas pu être corrigée.");
    const old = { start: e.start_time, end: e.end_time, exported: !!e.exported_at };
    db.updateRows('time_entries', [e], { start_time: pStart, end_time: pEnd }, c);
    const [corr] = db.insertRows('time_entry_corrections', [{
      company_id: e.company_id, entry_id: e.id, worker_id: e.user_id, work_date: e.work_date, corrected_by: c.uid,
      corrected_by_role: role, old_start: old.start, old_end: old.end, new_start: pStart, new_end: pEnd, was_exported: old.exported,
    }], c);
    return [{ correction_id: corr.id, worker_id: e.user_id, work_date: e.work_date, old_start: old.start, old_end: old.end,
      new_start: pStart, new_end: pEnd, corrected_by_role: role }];
  },

  my_worksite_labour(a, c) {
    requireAdmin(c);
    return worksiteLabour(c.company, a.p_from || null, a.p_to || null);
  },

  set_reserve_resolution(a, c) {
    requireAdmin(c);
    const e = rows('time_entries').find((t) => t.id === a.p_entry_id && t.company_id === c.company);
    if (!e) raise('Réserve introuvable');
    if (e.reception !== 'avec') raise('Cette intervention ne porte pas de réserve');
    const note = a.p_note == null ? null : (String(a.p_note).trim() || null);
    Object.assign(e, a.p_resolved
      ? { reserve_resolved_at: c.now, reserve_resolved_by: c.uid, reserve_resolution: note }
      : { reserve_resolved_at: null, reserve_resolved_by: null, reserve_resolution: null });
    return VOID;
  },

  mark_reserve_fixed(a, c) {
    requireAuth(c);
    const e = rows('time_entries').find((t) => t.id === a.p_entry_id && t.company_id === c.company);
    if (!e) raise('Intervention introuvable');
    if (e.user_id !== c.uid) raise('Seul le salarié concerné peut déclarer avoir corrigé');
    if (e.reception !== 'avec') raise('Cette intervention ne porte pas de réserve');
    if (e.reserve_resolved_at) raise('Cette réserve a déjà été levée par le bureau');
    const note = a.p_note == null ? null : (String(a.p_note).trim() || null);
    Object.assign(e, a.p_fixed
      ? { reserve_fixed_at: c.now, reserve_fixed_by: c.uid, reserve_fix_note: note }
      : { reserve_fixed_at: null, reserve_fixed_by: null, reserve_fix_note: null });
    return VOID;
  },

  request_leave(a, c) {
    if (!['conge', 'maladie', 'intemperie'].includes(a.p_type)) raise('Type de demande invalide');
    if (String(a.p_end_date) < String(a.p_start_date)) raise('La date de fin est avant le début');
    requireAuth(c);
    const [r] = db.insertRows('leave_requests', [{
      company_id: c.company, user_id: c.uid, type: a.p_type, start_date: a.p_start_date, end_date: a.p_end_date,
      note: a.p_note == null ? null : (String(a.p_note).trim() || null),
    }], c, { rls: false });
    return r.id;
  },

  set_user_role(a, c) {
    requireAdmin(c);
    if (!['admin', 'lead', 'worker'].includes(a.p_role)) raise('Rôle inconnu');
    const u = rows('users').find((x) => x.id === a.p_user_id);
    if (!u || u.company_id !== c.company) raise('Personne introuvable dans votre entreprise');
    if (a.p_role === 'admin' && u.is_active === false) raise('Ce compte est archivé. Réactivez-le avant de le nommer au bureau.');
    if (u.role === 'admin' && a.p_role !== 'admin') {
      const admins = rows('users').filter((x) => x.company_id === c.company && x.role === 'admin' && x.is_active !== false);
      if (admins.length <= 1) raise("L'entreprise doit garder au moins un accès bureau actif.");
    }
    u.role = a.p_role;
    return VOID;
  },

  set_worksite_client_email(a, c) {
    if (!c.company) return VOID;
    const w = rows('worksites').find((x) => x.id === a.p_worksite_id && x.company_id === c.company);
    if (w) w.client_email = String(a.p_email || '').trim() || null;
    return VOID;
  },

  set_position_tracking(a, c) {
    requireAdmin(c);
    const co = rows('companies').find((x) => x.id === c.company);
    co.position_tracking_enabled = !!a.p_enabled;
    return co.position_tracking_enabled;
  },

  update_company_info(a, c) {
    requireAdmin(c);
    const co = rows('companies').find((x) => x.id === c.company);
    const map = {
      p_name: 'name', p_siret: 'siret', p_tva_intra: 'tva_intra', p_address: 'address', p_postal_code: 'postal_code',
      p_city: 'city', p_phone: 'phone', p_email: 'email', p_logo_url: 'logo_url',
      p_auto_reminder_enabled: 'auto_reminder_enabled', p_reminder_hour: 'reminder_hour',
      p_budget_alerts_enabled: 'budget_alerts_enabled', p_travel_paid: 'travel_paid', p_weekly_hours: 'weekly_hours',
      p_accountant_email: 'accountant_email', p_overtime_rate_1: 'overtime_rate_1', p_overtime_rate_2: 'overtime_rate_2',
      p_weekly_digest_enabled: 'weekly_digest_enabled',
    };
    for (const [k, v] of Object.entries(a)) {
      if (!map[k]) throw new PgError('PGRST202', `Could not find the function public.update_company_info with parameter ${k}`, { status: 404 });
      co[map[k]] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
    }
    return VOID;
  },

  update_my_photo(a, c) {
    requireAuth(c);
    const u = rows('users').find((x) => x.id === c.uid);
    u.photo_url = a.p_url || null;
    return VOID;
  },

  ensure_planning_slot(a, c) {
    // Self-heal of the grid. Fixtures are built so this never fires; if it
    // does, the request log flags it (see server.js).
    if (!a.p_worksite_id || !c.company) return VOID;
    if (a.p_user_id !== c.uid && !c.isAdmin) return VOID;
    if (!rows('users').some((u) => u.id === a.p_user_id && u.company_id === c.company)) return VOID;
    if (!rows('worksites').some((w) => w.id === a.p_worksite_id && w.company_id === c.company)) return VOID;
    if (rows('planning').some((p) => p.user_id === a.p_user_id && p.work_date === a.p_work_date && p.worksite_id === a.p_worksite_id)) return VOID;
    db.insertRows('planning', [{ company_id: c.company, user_id: a.p_user_id, work_date: a.p_work_date, worksite_id: a.p_worksite_id, added_by_worker: true }], c, { rls: false });
    return VOID;
  },

  ensure_other_worksite(a, c) {
    if (!c.company) return null;
    let w = rows('worksites').find((x) => x.company_id === c.company && x.client_name === 'Autre');
    if (!w) [w] = db.insertRows('worksites', [{ company_id: c.company, client_name: 'Autre', city: '', is_active: true }], c, { rls: false });
    return w.id;
  },

  save_push_subscription(a, c) {
    if (!String(a.p_endpoint || '').trim()) raise('Endpoint manquant');
    requireAuth(c);
    const ex = rows('push_subscriptions').find((p) => p.endpoint === a.p_endpoint);
    if (ex) Object.assign(ex, { p256dh: a.p_p256dh, auth: a.p_auth, user_id: c.uid, company_id: c.company, user_agent: a.p_user_agent || null });
    else db.insertRows('push_subscriptions', [{ company_id: c.company, user_id: c.uid, endpoint: a.p_endpoint, p256dh: a.p_p256dh, auth: a.p_auth, user_agent: a.p_user_agent || null }], c, { rls: false });
    return VOID;
  },
};

// Functions whose call means "the fixtures are inconsistent" — flagged in the log.
const SELF_HEAL = new Set(['ensure_planning_slot', 'ensure_other_worksite']);

module.exports = { FNS, VOID, SELF_HEAL, worksiteLabour, roundQuarter };
