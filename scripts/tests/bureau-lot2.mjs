// Lot 2 (a)+(b) — le bureau corrige une journée ENVOYÉE avec un motif (pause,
// panier, route, heures) ou la RENVOIE au salarié ; le salarié la voit, la
// corrige et la renvoie. Sur les VRAIES pages : fiche salarié du bureau
// (/admin) et « Ma journée » (/poseur). UNE base simulée partagée par les deux
// navigateurs (aucune vraie base, aucun e-mail : send-push est simulé).
//
// Lancer : npm run build, puis
//   node scripts/tests/bureau-lot2.mjs out docs/captures-lot2 [port]
// Captures « avant » (build de #144, captures seulement, aucune vérification) :
//   AVANT=1 node scripts/tests/bureau-lot2.mjs <out-144> docs/captures-lot2 [port]
//
// La base simulée a trois états (variable MIG) :
//   'non'   migration 20261009120000 pas appliquée : table → 404 PGRST205,
//           fonctions → 404 PGRST202. La fiche doit être EXACTEMENT celle de #144.
//   'oui'   migration appliquée : les trois fonctions sont rejouées ici avec les
//           mêmes règles que le SQL (supabase/tests/lot2_corrections_bureau.mjs
//           les prouve sur un vrai Postgres), et la garde « on n'efface plus des
//           heures envoyées » (P0001).
//   'table' table présente mais fonctions absentes (cache PostgREST en retard).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot2', PORT = '4610'] = process.argv;
const AVANT = process.env.AVANT === '1';
fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  for (const c of [p, `${p}.html`, path.join(p, 'index.html')]) {
    const f = path.join(OUT, c);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); }
  }
  r.writeHead(404); r.end();
});
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge : aujourd'hui, 19:30 à Paris (la journée est finie) ──────────────
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const parisOffset = (() => { const d = new Date(`${today}T12:00:00Z`); const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(d)); return h - 12; })();
const NOW = new Date(Date.parse(`${today}T19:30:00Z`) - parisOffset * 3600000);

// ─── Base simulée ─────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000aa';
const ME = 'u-sam'; const ADMIN = 'u-admin';
const SALLE = { id: 'w-salle', company_id: CO, client_name: 'Salle', city: 'Lyon', is_active: true, address: null, latitude: null, longitude: null };
const ATELIER = { id: 'w-atelier', company_id: CO, client_name: 'Atelier', city: 'Lyon', is_active: true, address: null, latitude: null, longitude: null };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true, address: null, latitude: null, longitude: null };
const USERS = [
  { id: ADMIN, company_id: CO, first_name: 'Admin', last_name: 'Test', role: 'admin', email: 'admin@exemple.fr', is_active: true, created_at: '2026-01-01' },
  { id: ME, company_id: CO, first_name: 'Sam', last_name: 'Test', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' },
];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const hh = (t) => String(t || '').slice(0, 5);
const generated = (r) => { let d = toMin(r.end_time) - toMin(r.start_time); if (d < 0) d += 1440; return d - (Number(r.break_minutes) || 0); };
let seq = 0;
const D = {};
let MIG = 'oui';
const freshDb = () => {
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, {
    users: USERS.map((x) => ({ ...x })), companies: [{ ...COMPANY }], worksites: [SALLE, ATELIER, AUTRE].map((x) => ({ ...x })),
    planning: [], time_entries: [], active_sessions: [], time_entry_corrections: [], time_entry_edits: [],
    user_payroll: [{ user_id: ME, company_id: CO, payroll_id: '00001' }],
  });
};
freshDb();
const ws = (id) => D.worksites.find((w) => w.id === id) || null;
const nameOf = (id) => { const u = D.users.find((x) => x.id === id); return u ? { first_name: u.first_name, last_name: u.last_name } : null; };
/** Une ligne telle que la base la stockerait (total_minutes = colonne calculée). */
const row = (o) => {
  const r = {
    id: o.id || `e-${++seq}`, company_id: CO, user_id: ME, worksite_id: SALLE.id, planning_id: null, work_date: today,
    break_minutes: 0, meal_allowance: false, status: 'draft', locked: false, exported_at: null, observation: null, reception: null,
    gap_before: null, source: null, exit_forgotten: false, corrected_at: null, modified_at: null, modified_by: null, submitted_at: null,
    client_id: null, created_at: NOW.toISOString(), ...o,
  };
  if (['submitted', 'validated'].includes(r.status) && !r.submitted_at) r.submitted_at = NOW.toISOString();
  r.start_time = r.start_time.length === 5 ? `${r.start_time}:00` : r.start_time;
  r.end_time = r.end_time.length === 5 ? `${r.end_time}:00` : r.end_time;
  r.total_minutes = generated(r);
  r.worksite = ws(r.worksite_id); r.user = nameOf(r.user_id);
  return r;
};

const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k];
      if (op === 'eq') return String(cur) === val;
      if (op === 'neq') return String(cur) !== val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      if (op === 'gte') return String(cur) >= val;
      if (op === 'lte') return String(cur) <= val;
      if (op === 'gt') return String(cur) > val;
      if (op === 'lt') return String(cur) < val;
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      if (op === 'not' && val === 'is.null') return cur != null;
      return true;
    });
  }
  return rows;
};
const sortRows = (rows, order) => {
  if (!order) return rows;
  const keys = order.split(',').map((o) => { const [k, dir] = o.split('.'); return { k, desc: dir === 'desc' }; });
  return [...rows].sort((a, b) => { for (const { k, desc } of keys) { const x = String(a[k] ?? ''); const y = String(b[k] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};

// ─── Les fonctions du lot 2, rejouées (mêmes règles que le SQL) ──────────────
class Refus extends Error { constructor(message, code = 'P0001') { super(message); this.code = code; } }
const stateOf = (e) => ({ start_time: hh(e.start_time), end_time: hh(e.end_time), break_minutes: Number(e.break_minutes) || 0,
  meal_allowance: !!e.meal_allowance, gap_before: e.gap_before ?? null, status: e.status });
let editSeq = 0;
const nowIso = () => new Date(NOW.getTime() + (++editSeq) * 1000).toISOString();
const addEdit = (e, kind, reason, by, oldV, newV, extra = {}) => {
  const x = { id: `x-${editSeq + 1}`, company_id: CO, entry_id: e.id, worker_id: e.user_id, work_date: e.work_date, kind, reason, edited_by: by,
    edited_at: nowIso(), old_values: oldV, new_values: newV, correction_id: null, was_exported: !!e.exported_at, notified_at: null, notify_error: null, ...extra };
  D.time_entry_edits.push(x);
  return x;
};
const span = (s, e) => { const a = toMin(s); let z = toMin(e); if (z < a) z += 1440; return [a, z]; };
function officeCorrect(uid, { p_entry_id, p_changes: ch, p_reason }) {
  const reason = String(p_reason || '').trim();
  if (reason.length < 3) throw new Refus('Indiquez un motif (3 caractères au moins).', '22023');
  const e = D.time_entries.find((x) => x.id === p_entry_id);
  if (!e) throw new Refus('Cette ligne n\'existe pas, ou vous n\'y avez pas accès.', 'P0002');
  if (!['submitted', 'validated'].includes(e.status)) throw new Refus('Seule une journée envoyée se corrige ici : un brouillon appartient encore au salarié.');
  const old = stateOf(e);
  const start = 'start_time' in ch && hh(ch.start_time) !== old.start_time ? hh(ch.start_time) : old.start_time;
  const end = 'end_time' in ch && hh(ch.end_time) !== old.end_time ? hh(ch.end_time) : old.end_time;
  const brk = 'break_minutes' in ch ? Number(ch.break_minutes) : old.break_minutes;
  const meal = 'meal_allowance' in ch ? !!ch.meal_allowance : old.meal_allowance;
  const gap = 'gap_before' in ch ? (ch.gap_before || null) : old.gap_before;
  const [a1, a2] = span(start, end);
  if (a1 === a2) throw new Refus('Le début et la fin sont identiques.', '22023');
  if (brk < 0 || brk >= a2 - a1) throw new Refus('La pause doit être plus courte que la journée.', '22023');
  if (start !== old.start_time || end !== old.end_time) {
    const o = D.time_entries.find((x) => x.user_id === e.user_id && x.work_date === e.work_date && x.id !== e.id && x.status !== 'cancelled'
      && hh(x.start_time) !== hh(x.end_time) && Math.min(a2, span(x.start_time, x.end_time)[1]) - Math.max(a1, span(x.start_time, x.end_time)[0]) > 1);
    if (o) throw new Refus(`Ces heures chevauchent ${hh(o.start_time)}–${hh(o.end_time)} du même jour.`);
  }
  const nv = { start_time: start, end_time: end, break_minutes: brk, meal_allowance: meal, gap_before: gap, status: e.status };
  if (JSON.stringify(nv) === JSON.stringify(old)) throw new Refus('Rien n\'a changé.');
  const out = [];
  if (meal && !old.meal_allowance) {
    for (const o of D.time_entries.filter((x) => x.user_id === e.user_id && x.work_date === e.work_date && x.id !== e.id && ['submitted', 'validated'].includes(x.status) && x.meal_allowance)) {
      o.meal_allowance = false; o.modified_at = NOW.toISOString(); o.modified_by = uid;
      out.push(addEdit(o, 'correction', reason, uid, { meal_allowance: true }, { meal_allowance: false }));
    }
  }
  Object.assign(e, { start_time: `${start}:00`, end_time: `${end}:00`, break_minutes: brk, meal_allowance: meal, gap_before: gap, modified_at: NOW.toISOString(), modified_by: uid });
  e.total_minutes = generated(e);
  let corrId = null;
  if (start !== old.start_time || end !== old.end_time) {
    corrId = `c-${D.time_entry_corrections.length + 1}`;
    D.time_entry_corrections.push({ id: corrId, company_id: CO, entry_id: e.id, worker_id: e.user_id, work_date: e.work_date, corrected_by: uid, corrected_by_role: 'admin',
      corrected_at: NOW.toISOString(), old_start: `${old.start_time}:00`, old_end: `${old.end_time}:00`, new_start: `${start}:00`, new_end: `${end}:00`, was_exported: !!e.exported_at, notified_at: null, notify_error: null });
  }
  out.push(addEdit(e, 'correction', reason, uid, old, nv, { correction_id: corrId }));
  return out;
}
function officeReturn(uid, { p_user_id, p_work_date, p_reason }) {
  const reason = String(p_reason || '').trim();
  if (reason.length < 3) throw new Refus('Indiquez un motif (3 caractères au moins).', '22023');
  const day = D.time_entries.filter((x) => x.user_id === p_user_id && x.work_date === p_work_date);
  if (day.some((x) => ['submitted', 'validated'].includes(x.status) && (x.locked || x.exported_at))) {
    throw new Refus('Journée déjà partie chez le comptable : corrigez-la plutôt que de la renvoyer.');
  }
  const sent = day.filter((x) => ['submitted', 'validated'].includes(x.status)).sort((a, z) => (a.start_time < z.start_time ? -1 : 1));
  if (!sent.length) throw new Refus('Rien d\'envoyé ce jour-là.', 'P0002');
  return sent.map((e) => { const old = stateOf(e); e.status = 'draft'; return addEdit(e, 'return', reason, uid, old, { ...old, status: 'draft' }); });
}
function markNotified(uid, { p_ids, p_error }) {
  let n = 0;
  for (const x of D.time_entry_edits) {
    if (!(p_ids || []).includes(x.id) || x.edited_by !== uid || x.notified_at || x.notify_error) continue;
    if (p_error == null) x.notified_at = NOW.toISOString(); else x.notify_error = String(p_error).slice(0, 200);
    n++;
  }
  return n;
}

// ─── Réseau simulé ────────────────────────────────────────────────────────────
const writes = []; // toutes les écritures (REST hors GET, RPC, fonctions)
let assistantReply = null;
const sessionFor = (uid, email) => {
  const now = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: uid, email, aud: 'authenticated', role: 'authenticated' } };
};
const NOT_FOUND_FN = (fn) => ({ status: 404, json: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null } });
const newCtx = async (uid, email, viewport) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const session = sessionFor(uid, email);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  // Chaque message affiché (sonner) est noté : on les lit sans toucher au DOM de React.
  await ctx.addInitScript(() => {
    window.__toasts = [];
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const list = n.matches?.('[data-sonner-toast]') ? [n] : [...(n.querySelectorAll?.('[data-sonner-toast]') || [])];
        for (const t of list) setTimeout(() => window.__toasts.push((t.textContent || '').trim()), 60);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await ctx.clock.setFixedTime(NOW);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const m = req.method();
    let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) {
      const fn = url.pathname.replace('/functions/v1/', '');
      writes.push({ m: 'FN', t: fn, body, by: uid });
      if (fn === 'send-push') return r.fulfill({ json: { mode: body?.correction_id ? 'correction' : 'admin', sent: 1, failed: 0, purged: 0 } });
      if (fn === 'worker-assistant' && assistantReply) return r.fulfill({ json: assistantReply });
      return r.fulfill({ json: {} });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.replace('/rest/v1/rpc/', '');
      writes.push({ m: 'RPC', t: fn, body, by: uid });
      try {
        if (fn === 'office_correct_entry') return MIG === 'oui' ? r.fulfill({ json: officeCorrect(uid, body) }) : r.fulfill(NOT_FOUND_FN(fn));
        if (fn === 'office_return_day') return MIG === 'oui' ? r.fulfill({ json: officeReturn(uid, body) }) : r.fulfill(NOT_FOUND_FN(fn));
        if (fn === 'office_edit_mark_notified') return MIG === 'oui' ? r.fulfill({ json: markNotified(uid, body) }) : r.fulfill(NOT_FOUND_FN(fn));
      } catch (e) {
        return r.fulfill({ status: 400, json: { code: e.code || 'P0001', message: e.message, details: null, hint: null } });
      }
      if (fn === 'correct_time_entry') { // chemin d'avant (#144), début / fin seulement
        const e = D.time_entries.find((x) => x.id === body?.p_entry_id);
        const c = { id: `c-${D.time_entry_corrections.length + 1}`, company_id: CO, entry_id: e.id, worker_id: e.user_id, work_date: e.work_date, corrected_by: uid,
          corrected_by_role: 'admin', corrected_at: NOW.toISOString(), old_start: e.start_time, old_end: e.end_time, new_start: `${body.p_start}:00`, new_end: `${body.p_end}:00`,
          was_exported: false, notified_at: null, notify_error: null };
        D.time_entry_corrections.push(c);
        Object.assign(e, { start_time: c.new_start, end_time: c.new_end, modified_at: NOW.toISOString(), modified_by: uid }); e.total_minutes = generated(e);
        return r.fulfill({ json: [{ correction_id: c.id, worker_id: e.user_id, work_date: e.work_date, old_start: c.old_start, old_end: c.old_end, new_start: c.new_start, new_end: c.new_end, corrected_by_role: 'admin' }] });
      }
      if (fn === 'company_has_kiosk') return r.fulfill({ json: false });
      return r.fulfill({ json: [] });
    }
    const t = url.pathname.replace('/rest/v1/', '');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200) => {
      if (single) return rows.length ? r.fulfill({ status, json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none', details: null, hint: null } });
      return r.fulfill({ status, json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
    };
    if (t === 'time_entry_edits' && MIG === 'non') {
      return r.fulfill({ status: 404, json: { code: 'PGRST205', message: 'Could not find the table \'public.time_entry_edits\' in the schema cache', details: null, hint: null } });
    }
    if (m === 'GET' || m === 'HEAD') {
      let rows = sortRows(filterRows(D[t] || [], url.searchParams), url.searchParams.get('order'));
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      return reply(rows);
    }
    writes.push({ m, t, q: url.search, body, by: uid });
    if (t === 'time_entry_edits') return r.fulfill({ status: 403, json: { code: '42501', message: 'permission denied for table time_entry_edits' } });
    if (m === 'POST') {
      const list = (Array.isArray(body) ? body : [body]).map((x) => ({ ...x }));
      if (t === 'time_entries') { const made = list.map((x) => row(x)); D.time_entries.push(...made); return reply(made, 201); }
      return reply(list, 201);
    }
    const hit = filterRows(D[t] || [], url.searchParams);
    if (m === 'PATCH') {
      for (const x of hit) {
        if (t === 'time_entries' && x.status === 'draft' && body?.status === 'submitted') x.submitted_at = NOW.toISOString();
        Object.assign(x, body);
        if (t === 'time_entries') { x.total_minutes = generated(x); x.worksite = ws(x.worksite_id); }
      }
      return reply(hit);
    }
    if (m === 'DELETE') {
      // La garde du lot 2 : des heures envoyées une fois ne s'effacent plus.
      if (t === 'time_entries' && MIG === 'oui' && hit.some((x) => x.status !== 'draft' || x.submitted_at || D.time_entry_edits.some((y) => y.entry_id === x.id))) {
        return r.fulfill({ status: 400, json: { code: 'P0001', message: 'time_entries: heures déjà envoyées — elles se retirent, elles ne s\'effacent pas', details: null, hint: null } });
      }
      D[t] = (D[t] || []).filter((x) => !hit.includes(x)); return reply(hit);
    }
    return reply([]);
  });
  return ctx;
};

// ─── Outils ───────────────────────────────────────────────────────────────────
let ok = 0, ko = 0; const fails = [];
const check = (c, m) => { if (AVANT) return; if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };
const parseHM = (txt) => { const m = String(txt || '').match(/(\d+)\s*[h:]\s*(\d{1,2})?/); return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null; };
const shot = async (loc, name) => { await loc.screenshot({ path: path.join(SH, `${AVANT ? 'avant' : 'apres'}-${name}.png`) }).catch((e) => console.log('   (capture impossible :', e.message.split('\n')[0], ')')); };
const since = (n) => writes.slice(n);
const of = (list, m, t) => list.filter((w) => w.m === m && (t == null || w.t === t));

const office = await newCtx(ADMIN, 'admin@exemple.fr', { width: 1280, height: 900 });
const worker = await newCtx(ME, 'sam@exemple.fr', { width: 390, height: 844 });
const op = await office.newPage();
op.on('pageerror', (e) => console.log('   [erreur page bureau]', e.message));
const wp = await worker.newPage();
wp.on('pageerror', (e) => console.log('   [erreur page salarié]', e.message));

/** La fiche « Feuille d'heures » de Sam, sur aujourd'hui. */
let dlg = null;
const openSheet = async () => {
  await op.goto(`http://localhost:${PORT}/admin`);
  await op.locator('button:visible', { hasText: 'Sam Test' }).first().waitFor({ timeout: 25000 });
  await op.waitForTimeout(800);
  await op.locator('button:visible', { hasText: 'Sam Test' }).first().click();
  await op.getByRole('button', { name: /Feuille d.heures/ }).click();
  dlg = op.locator('[role=dialog]').filter({ has: op.locator('h2', { hasText: 'Sam Test' }) });
  await dlg.waitFor();
  await op.waitForTimeout(1200);
  toastMark = 0;
};
const card = (txt) => dlg.locator('.divide-y > div').filter({ hasText: txt }).first();
const sheetTotal = async () => parseHM(await dlg.locator('div:has(> span:text("Total de la période")) > span').nth(1).innerText().catch(() => ''));
const openPanel = async (c) => { await c.getByRole('button', { name: /Corriger les heures/ }).click(); await op.waitForTimeout(300); };
let toastMark = 0;
/** Les messages affichés depuis le dernier `clearToasts()`. */
const toasts = async () => (await op.evaluate((k) => (window.__toasts || []).slice(k), toastMark)).join(' | ');
const clearToasts = async () => { toastMark = await op.evaluate(() => (window.__toasts || []).length); };
const txt = async (loc) => (await loc.innerText().catch(() => '')).replace(/\s+/g, ' ');

// ── Côté salarié (mêmes gestes que scripts/tests/heures-lot1.mjs) ──
const openWorker = async () => { await wp.goto(`http://localhost:${PORT}/poseur`); await wp.waitForSelector('.bt-total', { timeout: 20000 }); await wp.waitForTimeout(900); };
const setWheel = async (hhmm) => {
  const [h, mm] = hhmm.split(':');
  const cols = wp.locator('.bt-molette .overflow-y-scroll');
  await cols.nth(0).evaluate((el, i) => { el.scrollTop = (3 * 24 + i) * 40; }, Number(h));
  await wp.waitForTimeout(350);
  await cols.nth(1).evaluate((el, i) => { el.scrollTop = (10 * 4 + i) * 40; }, ['00', '15', '30', '45'].indexOf(mm));
  await wp.waitForTimeout(350);
};
const send = async () => {
  await wp.locator('.bt-send', { hasText: 'Envoyer ma journée' }).click();
  for (let i = 0; i < 5; i++) {
    await wp.waitForTimeout(700);
    if (await wp.locator('[data-testid=pause-ask]').count()) { await wp.locator('[data-testid=pause-0]').click(); continue; }
    const c = wp.locator('button:has-text("Confirmer l\'envoi")');
    if (await c.count()) { await c.click(); continue; }
    break;
  }
  await wp.waitForTimeout(900);
};

// ═══ AVANT : captures du build de #144 (aucune vérification) ═════════════════
if (AVANT) {
  MIG = 'non'; freshDb();
  D.time_entries = [row({ id: 'e-jour', start_time: '08:00', end_time: '17:00', status: 'submitted' })];
  await openSheet();
  const c = card('Salle');
  await openPanel(c);
  await shot(c, 'bureau-panneau');
  await openWorker();
  await shot(wp, 'salarie-journee');
  console.log(`Captures « avant » écrites dans ${SH}`);
  await b.close(); srv.close();
  process.exit(0);
}

// ═══ A1 · migration PAS appliquée : la fiche de #144, à l'identique ══════════
console.log('\n═══ A1 · migration pas appliquée : panneau d’avant, correct_time_entry');
MIG = 'non'; freshDb();
D.time_entries = [row({ id: 'e-jour', start_time: '08:00', end_time: '17:00', status: 'submitted' })];
await openSheet();
{
  const c = card('Salle');
  await openPanel(c);
  const panel = c.locator('[data-testid=correct-panel]');
  const txt = (await panel.innerText()).replace(/\s+/g, ' ');
  check(txt.includes('Corriger les heures de cette journée'), `titre d’avant : « Corriger les heures de cette journée » (${txt.slice(0, 60)}…)`);
  check(await panel.locator('[data-testid=correct-reason]').count() === 0 && await panel.locator('[data-testid=correct-break]').count() === 0,
    'pas de motif, pas de pause / panier / route');
  check(await panel.locator('[data-testid=correct-return]').count() === 0, 'pas de « Renvoyer au salarié »');
  await shot(c, 'bureau-panneau-sans-migration');
  const n = writes.length;
  await panel.locator('input[aria-label="Heure de fin"]').fill('16:30');
  await panel.locator('input[aria-label="Heure de fin"]').press('Enter');
  await panel.getByRole('button', { name: /Corriger et prévenir/ }).click();
  await op.waitForTimeout(1500);
  const w = since(n);
  check(of(w, 'RPC', 'correct_time_entry').length === 1 && of(w, 'RPC', 'correct_time_entry')[0].body?.p_end === '16:30', 'POST rpc/correct_time_entry (fin 16:30), comme avant');
  check(!w.some((x) => x.m === 'RPC' && x.t.startsWith('office_')), 'aucun appel aux fonctions du lot 2');
  check(of(w, 'PATCH', 'time_entries').length === 0, 'aucune écriture brute sur time_entries');
  check(of(w, 'FN', 'send-push')[0]?.body?.correction_id === 'c-1', 'notification par correction_id (chemin d’avant)');
  check(/Heures corrigées — le salarié est prévenu/.test(await toasts()), `message d’avant : ${await toasts()}`);
}

// ═══ A3 · motif trop court, rien de changé → boutons inactifs ════════════════
console.log('\n═══ A2–A4 · pause, motif, fin (migration appliquée)');
MIG = 'oui'; freshDb();
D.time_entries = [row({ id: 'e-jour', start_time: '08:00', end_time: '17:00', status: 'submitted' })];
await openSheet();
{
  const c = card('Salle');
  check(await sheetTotal() === 540, `total de départ 9h00 (${await sheetTotal()} min)`);
  await openPanel(c);
  const panel = c.locator('[data-testid=correct-panel]');
  check((await panel.innerText()).includes('Corriger cette journée'), 'titre « Corriger cette journée »');
  const n = writes.length;
  await panel.locator('[data-testid=correct-break]').selectOption('30');
  await panel.locator('[data-testid=correct-reason]').fill('ok');
  check(await panel.locator('[data-testid=correct-submit]').isDisabled() && await panel.locator('[data-testid=correct-return]').isDisabled(),
    'A3 motif de 2 caractères : « Corriger et prévenir » et « Renvoyer » inactifs');
  await panel.locator('[data-testid=correct-break]').selectOption('0');
  await panel.locator('[data-testid=correct-reason]').fill('pause oubliée');
  check(await panel.locator('[data-testid=correct-submit]').isDisabled(), 'A3 rien de changé : « Corriger et prévenir » inactif');
  await panel.locator('[data-testid=correct-submit]').click({ force: true }).catch(() => {});
  await op.waitForTimeout(300);
  check(since(n).filter((w) => w.m !== 'GET').length === 0, 'A3 aucune requête d’écriture');

  // A2 · pause 0 → 30 avec motif
  await panel.locator('[data-testid=correct-break]').selectOption('30');
  await shot(c, 'bureau-panneau');
  await panel.locator('[data-testid=correct-submit]').click();
  await op.waitForTimeout(1800);
  const w = since(n);
  const rpc = of(w, 'RPC', 'office_correct_entry');
  check(rpc.length === 1 && JSON.stringify(rpc[0].body?.p_changes) === '{"break_minutes":30}' && rpc[0].body?.p_reason === 'pause oubliée',
    `A2 un seul POST rpc/office_correct_entry {break_minutes:30} (${JSON.stringify(rpc[0]?.body)})`);
  check(of(w, 'PATCH', 'time_entries').length === 0 && of(w, 'POST', 'time_entries').length === 0, 'A2 aucune écriture brute sur time_entries');
  const push = of(w, 'FN', 'send-push');
  check(push.length === 1 && push[0].body?.body?.includes('pause 0 → 30 min') && push[0].body?.body?.includes('« pause oubliée »')
    && push[0].body?.user_ids?.[0] === ME && push[0].body?.title === 'Entreprise Test', `A2 notification : « ${push[0]?.body?.body} »`);
  check(of(w, 'RPC', 'office_edit_mark_notified').length === 1, 'A2 issue de la notification inscrite (office_edit_mark_notified)');
  check(/Journée corrigée — le salarié est prévenu/.test(await toasts()), `A2 message : ${await toasts()}`);
  check(await sheetTotal() === 510, `A2 total 9h00 → 8h30 (${await sheetTotal()} min)`);
  const c2 = card('Salle');
  const rows = await c2.locator('[data-testid=edit-row]').allInnerTexts();
  check(rows.length === 1 && /Pause 0 → 30 min/.test(rows[0]) && /« pause oubliée »/.test(rows[0]) && /par vous/.test(rows[0]), `A2 historique : ${rows.join(' | ').replace(/\s+/g, ' ')}`);
  check(/pause 30 min/.test(await txt(c2)), 'A2 la ligne affiche « pause 30 min »');
  check(await c2.locator('[data-testid=badge-office]').count() === 1, 'A2 badge « corrigé par le bureau » (et non « modifié après envoi »)');
}

// W4 · le salarié voit la correction et son motif
console.log('\n═══ W4 · la carte corrigée, côté salarié');
await openWorker();
{
  const t = (await wp.locator('[data-testid=card-office-edit]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
  check(/Le bureau a corrigé : pause 0 → 30 min · « pause oubliée »/.test(t), `W4 carte : « ${t} »`);
  check(await wp.locator('[data-testid=day-returned]').count() === 0, 'W4 pas de bandeau « renvoyée » (journée toujours envoyée)');
  await shot(wp, 'salarie-carte-corrigee');
}

// A4 · fin 17:00 → 16:30 : une seule ligne d'historique
{
  await clearToasts();
  const c = card('Salle');
  await openPanel(c);
  const panel = c.locator('[data-testid=correct-panel]');
  await panel.locator('input[aria-label="Heure de fin"]').fill('16:30');
  await panel.locator('input[aria-label="Heure de fin"]').press('Enter');
  await panel.locator('[data-testid=correct-reason]').fill('parti plus tôt');
  const n = writes.length;
  await panel.locator('[data-testid=correct-submit]').click();
  await op.waitForTimeout(1800);
  const rpc = of(since(n), 'RPC', 'office_correct_entry');
  check(rpc.length === 1 && JSON.stringify(rpc[0].body?.p_changes) === '{"end_time":"16:30"}', `A4 {end_time:'16:30'} seulement (${JSON.stringify(rpc[0]?.body?.p_changes)})`);
  const c2 = card('Salle');
  const amber = (await c2.locator('.border-amber-200').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
  check(amber.length === 2 && amber.filter((x) => /8h00–17h00 → 8h00–16h30/.test(x)).length === 1 && /parti plus tôt/.test(amber[1]),
    `A4 une seule ligne pour cette correction (pas de doublon avec l’ancien journal) : ${amber.map((x) => x.replace(/\s+/g, ' ')).join(' | ')}`);
  check(D.time_entry_corrections.length === 1 && D.time_entry_edits.at(-1).correction_id === D.time_entry_corrections[0].id, 'A4 les deux journaux sont écrits et liés');
  check(of(since(n), 'PATCH', 'time_entry_corrections').length === 1, 'A4 issue de la notification aussi dans l’ancien journal');
}

// ═══ A5–A8 · deux chantiers : panier, route, refus du serveur, renvoi ═════════
console.log('\n═══ A5–A8 · panier déplacé, route, refus du serveur, renvoyer au salarié');
freshDb();
D.time_entries = [
  row({ id: 'e-matin', worksite_id: SALLE.id, start_time: '08:00', end_time: '12:00', status: 'submitted' }),
  row({ id: 'e-aprem', worksite_id: ATELIER.id, start_time: '13:00', end_time: '17:00', status: 'submitted', meal_allowance: true }),
];
await openSheet();
{
  // A5 · panier sur le matin alors que l'après-midi l'a
  let c = card('Salle');
  await openPanel(c);
  let panel = c.locator('[data-testid=correct-panel]');
  check(await panel.locator('[data-testid=correct-gap]').count() === 0, 'A6 première ligne du jour : pas de question « route / pause »');
  await panel.locator('[data-testid=correct-meal]').check();
  await panel.locator('[data-testid=correct-reason]').fill('panier pris le midi');
  let n = writes.length;
  await panel.locator('[data-testid=correct-submit]').click();
  await op.waitForTimeout(1800);
  let rpc = of(since(n), 'RPC', 'office_correct_entry');
  check(rpc.length === 1 && JSON.stringify(rpc[0].body?.p_changes) === '{"meal_allowance":true}', 'A5 {meal_allowance:true}');
  const ma = await txt(card('Salle')); const ap = await txt(card('Atelier'));
  check(/08:00–12:00 Lyon panier/.test(ma) && /Panier ajouté — « panier pris le midi »/.test(ma), `A5 le matin a le panier, historique « Panier ajouté » (${ma.slice(0, 160)})`);
  check(!/17:00 Lyon panier/.test(ap) && /Panier retiré — « panier pris le midi »/.test(ap) && !D.time_entries.find((x) => x.id === 'e-aprem').meal_allowance, `A5 l’après-midi le perd, historique « Panier retiré » (${ap.slice(0, 160)})`);
  check(of(since(n), 'RPC', 'office_edit_mark_notified')[0]?.body?.p_ids?.length === 2, 'A5 les deux lignes de journal marquées « prévenu »');

  // A6 · « Entre 12:00 et 13:00 : Route » sur l'après-midi
  await clearToasts();
  c = card('Atelier');
  await openPanel(c);
  panel = c.locator('[data-testid=correct-panel]');
  const gapLbl = (await panel.locator('label:has([data-testid=correct-gap])').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Entre 12:00 et 13:00/.test(gapLbl), `A6 question affichée : « ${gapLbl.slice(0, 40)} »`);
  await panel.locator('[data-testid=correct-gap]').selectOption('route');
  await panel.locator('[data-testid=correct-reason]').fill('trajet entre les deux chantiers');
  n = writes.length;
  await panel.locator('[data-testid=correct-submit]').click();
  await op.waitForTimeout(1800);
  rpc = of(since(n), 'RPC', 'office_correct_entry');
  check(rpc.length === 1 && JSON.stringify(rpc[0].body?.p_changes) === '{"gap_before":"route"}', 'A6 {gap_before:"route"}');
  const routeTxt = await card('Atelier').locator('[data-testid=line-route]').innerText().catch(() => '');
  check(/route 1h00 \(non payée\)/.test(routeTxt), `A6 résumé « ${routeTxt} »`);

  // A7 · le serveur refuse (le salarié a ajouté 17:00–19:00 entre-temps) : le message du serveur, panneau ouvert
  await clearToasts();
  c = card('Atelier');
  await openPanel(c);
  panel = c.locator('[data-testid=correct-panel]');
  D.time_entries.push(row({ id: 'e-soir', worksite_id: SALLE.id, start_time: '17:00', end_time: '19:00', status: 'submitted' }));
  await panel.locator('input[aria-label="Heure de fin"]').fill('17:30');
  await panel.locator('input[aria-label="Heure de fin"]').press('Enter');
  await panel.locator('[data-testid=correct-reason]').fill('fin réelle');
  n = writes.length;
  await panel.locator('[data-testid=correct-submit]').click();
  await op.waitForTimeout(1500);
  check(/Ces heures chevauchent 17:00–19:00 du même jour/.test(await toasts()), `A7 message du serveur : ${await toasts()}`);
  check(await panel.isVisible() && (await panel.locator('[data-testid=correct-reason]').inputValue()) === 'fin réelle', 'A7 le panneau reste ouvert, avec la saisie');
  check(of(since(n), 'FN', 'send-push').length === 0 && hh(D.time_entries.find((x) => x.id === 'e-aprem').end_time) === '17:00', 'A7 rien n’a changé, personne n’est prévenu');
  D.time_entries = D.time_entries.filter((x) => x.id !== 'e-soir');

  // A8 · « Renvoyer au salarié »
  await clearToasts();
  await panel.locator('input[aria-label="Heure de fin"]').fill('17:00');
  await panel.locator('input[aria-label="Heure de fin"]').press('Enter');
  await panel.locator('[data-testid=correct-reason]').fill('il manque ta pause de l’après-midi');
  n = writes.length;
  await panel.locator('[data-testid=correct-return]').click();
  await op.waitForTimeout(1800);
  const w = since(n);
  const ret = of(w, 'RPC', 'office_return_day');
  check(ret.length === 1 && ret[0].body?.p_user_id === ME && ret[0].body?.p_work_date === today && ret[0].body?.p_reason === 'il manque ta pause de l’après-midi', 'A8 POST rpc/office_return_day (salarié, jour, motif)');
  check(of(w, 'PATCH', 'time_entries').length === 0, 'A8 aucune écriture brute');
  const push = of(w, 'FN', 'send-push')[0]?.body?.body || '';
  check(/renvoyé/.test(push) && /« il manque ta pause de l’après-midi »/.test(push), `A8 notification : « ${push} »`);
  check(/Journée renvoyée au salarié — il est prévenu/.test(await toasts()), `A8 message : ${await toasts()}`);
  for (const ws_ of ['Salle', 'Atelier']) {
    const cc = card(ws_);
    check(await cc.locator('[data-testid=badge-draft]').count() === 1 && await cc.locator('[data-testid=badge-returned]').count() === 1,
      `A8 ${ws_} : « brouillon » et « renvoyée · en attente du salarié »`);
    check(await cc.getByRole('button', { name: /Corriger les heures/ }).count() === 0, `A8 ${ws_} : plus de bouton « Corriger »`);
    check(/Renvoyée au salarié — « il manque ta pause de l’après-midi »/.test(await txt(cc)), `A8 ${ws_} : historique « Renvoyée au salarié »`);
  }
  check(await sheetTotal() === 0, `A8 la journée ne compte plus tant qu’il ne l’a pas renvoyée (${await sheetTotal()} min)`);
  await shot(dlg.locator('.divide-y'), 'bureau-historique');
}

// W1–W2 · le salarié voit le renvoi, corrige, renvoie
console.log('\n═══ W1–W2 · journée renvoyée, côté salarié');
await openWorker();
{
  const banner = (await wp.locator('[data-testid=day-returned]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Le bureau t.a renvoyé cette journée : « il manque ta pause de l’après-midi »/.test(banner), `W1 bandeau : « ${banner} »`);
  const badges = await wp.locator('[data-testid=card-entry] .bt-badge').allInnerTexts();
  check(badges.length === 2 && badges.every((x) => /À envoyer/.test(x)), `W1 cartes « À envoyer » (${badges.join(', ')})`);
  await shot(wp, 'salarie-renvoyee');
  await wp.locator('[data-testid=card-entry]').filter({ hasText: 'Atelier' }).click();
  await wp.waitForTimeout(600);
  check(await wp.locator('.bt-ed').count() === 1 && await wp.locator('[role=dialog]', { hasText: 'Journée déjà envoyée' }).count() === 0,
    'W1 toucher une carte ouvre la fiche, sans « Journée déjà envoyée »');
  // W2 · fin 17:00 → 17:30, OK, puis « Envoyer ma journée »
  await wp.locator('.bt-segb').nth(1).click().catch(async () => { await wp.locator('.bt-timecard').nth(1).click(); });
  await wp.waitForTimeout(400);
  await setWheel('17:30');
  await wp.locator('button:has-text("Valider les heures")').click().catch(() => {});
  await wp.waitForTimeout(300);
  const n = writes.length;
  await wp.locator('.bt-save', { hasText: 'OK' }).click();
  await wp.waitForTimeout(1300);
  const upd = of(since(n), 'PATCH', 'time_entries');
  check(upd.length === 1 && upd[0].body?.end_time === '17:30' && !('status' in (upd[0].body || {})), 'W2 la correction du salarié reste un brouillon');
  const n2 = writes.length;
  await send();
  const sentP = of(since(n2), 'PATCH', 'time_entries').filter((x) => x.body?.status === 'submitted');
  check(sentP.length === 1 && D.time_entries.every((x) => x.status === 'submitted'), `W2 « Envoyer ma journée » : PATCH vers « envoyée » (${D.time_entries.map((x) => x.status).join(', ')})`);
  await openWorker();
  check(await wp.locator('[data-testid=day-returned]').count() === 0, 'W2 le bandeau disparaît');
  check(D.time_entry_edits.filter((x) => x.kind === 'return').length === 2, 'W2 l’historique du bureau reste');
}

// ═══ W3, W5 · une ligne renvoyée se retire, elle ne s'efface pas ═════════════
console.log('\n═══ W3, W5 · retirer / effacer une ligne renvoyée');
freshDb();
D.time_entries = [
  row({ id: 'e-r1', worksite_id: SALLE.id, start_time: '08:00', end_time: '12:00', status: 'draft', submitted_at: NOW.toISOString() }),
  row({ id: 'e-r2', worksite_id: ATELIER.id, start_time: '13:00', end_time: '17:00', status: 'draft', submitted_at: NOW.toISOString() }),
];
for (const e of D.time_entries) addEdit(e, 'return', 'à revoir', ADMIN, { ...stateOf(e), status: 'submitted' }, stateOf(e), { notified_at: NOW.toISOString() });
await openWorker();
{
  await wp.locator('[data-testid=card-entry]').filter({ hasText: 'Atelier' }).click();
  await wp.waitForTimeout(600);
  await wp.locator('.bt-ed-trash').click();
  await wp.waitForTimeout(400);
  const dtxt = (await wp.locator('[role=dialog]').last().innerText()).replace(/\s+/g, ' ');
  check(/restera visible comme « Retiré »/.test(dtxt), `W3 la fenêtre dit « restera visible comme « Retiré » » (${dtxt.slice(0, 90)}…)`);
  const n = writes.length;
  await wp.locator('[role=dialog] button', { hasText: 'Oui, retirer' }).click();
  await wp.waitForTimeout(1300);
  const w = since(n);
  check(of(w, 'PATCH', 'time_entries').some((x) => x.body?.status === 'cancelled') && of(w, 'DELETE', 'time_entries').length === 0,
    'W3 PATCH vers « retirée », aucun DELETE');
  check(D.time_entries.find((x) => x.id === 'e-r2')?.status === 'cancelled', 'W3 la ligne est retirée, toujours en base');
}
{
  // W5 · l'Assistant « efface la ligne de ce matin » sur une ligne renvoyée
  D.companies[0].ai_enabled = true;
  assistantReply = {
    kind: 'action', remaining: 20, chantiers: [{ id: SALLE.id, nom: 'Salle', ville: 'Lyon' }],
    action: { draft: { type: 'effacer_heures', date: today, entry_id: 'e-r1', tout: false,
      choix: [{ id: 'e-r1', chantier: 'Salle', chantier_id: SALLE.id, debut: '08:00', fin: '12:00', envoyee: false }] }, problems: [] },
  };
  await openWorker();
  await wp.locator('[data-testid=dock-assistant]').click();
  await wp.waitForTimeout(500);
  await wp.locator('.as-bar textarea').fill('efface la ligne de ce matin');
  const n = writes.length;
  await wp.locator('button[aria-label="Envoyer"]').click();
  await wp.waitForTimeout(2500);
  const cardTxt = (await wp.locator('[data-testid=worker-action-card]').last().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(of(since(n), 'DELETE', 'time_entries').length === 0 && D.time_entries.some((x) => x.id === 'e-r1'), 'W5 aucun DELETE, la ligne est toujours là');
  check(/Rien à effacer : ces heures ont été envoyées \(ou renvoyées par le bureau\)/.test(cardTxt), `W5 message : « ${cardTxt.slice(0, 140)} »`);
  assistantReply = null; D.companies[0].ai_enabled = false;
}

// ═══ A9 · renvoyer une journée exportée : refusé ════════════════════════════
console.log('\n═══ A9 · renvoyer une journée déjà chez le comptable');
freshDb();
D.time_entries = [row({ id: 'e-exp', start_time: '08:00', end_time: '17:00', status: 'submitted', locked: true, exported_at: NOW.toISOString() })];
await openSheet();
{
  await clearToasts();
  const c = card('Salle');
  await openPanel(c);
  const panel = c.locator('[data-testid=correct-panel]');
  check(/déjà partie chez le comptable/.test(await panel.innerText()), 'A9 l’avertissement « déjà partie chez le comptable » est là');
  await panel.locator('[data-testid=correct-reason]').fill('à revoir');
  const n = writes.length;
  await panel.locator('[data-testid=correct-return]').click();
  await op.waitForTimeout(1500);
  check(/Journée déjà partie chez le comptable : corrigez-la plutôt que de la renvoyer/.test(await toasts()), `A9 refus : ${await toasts()}`);
  check(D.time_entries[0].status === 'submitted' && D.time_entry_edits.length === 0 && of(since(n), 'FN', 'send-push').length === 0, 'A9 rien ne change, personne n’est prévenu');
}

// ═══ A10 · table présente, fonctions absentes ═══════════════════════════════
console.log('\n═══ A10 · base à moitié à jour (fonctions absentes)');
MIG = 'table'; freshDb();
D.time_entries = [row({ id: 'e-jour', start_time: '08:00', end_time: '17:00', status: 'submitted' })];
await openSheet();
{
  await clearToasts();
  const c = card('Salle');
  await openPanel(c);
  const panel = c.locator('[data-testid=correct-panel]');
  await panel.locator('[data-testid=correct-break]').selectOption('30');
  await panel.locator('[data-testid=correct-reason]').fill('pause oubliée');
  const n = writes.length;
  await panel.locator('[data-testid=correct-submit]').click();
  await op.waitForTimeout(1500);
  check(/Mise à jour de la base en attente : rien n.a été modifié/.test(await toasts()), `A10 message : ${await toasts()}`);
  const w = since(n);
  check(of(w, 'PATCH', 'time_entries').length === 0 && of(w, 'RPC', 'correct_time_entry').length === 0 && of(w, 'FN', 'send-push').length === 0,
    'A10 zéro écriture brute, aucun repli, personne n’est prévenu');
  check(D.time_entries[0].break_minutes === 0, 'A10 la ligne est inchangée');
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
if (fails.length) console.log(fails.map((f) => ` - ${f}`).join('\n'));
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
