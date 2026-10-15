// Interventions supprimées ou décalées (lot 3, oct. 2026), sur les VRAIES pages :
// l'Historique du salarié (/poseur) et les Réglages / le menu du bureau (/admin).
// UNE base simulée partagée par les navigateurs (aucune vraie base, aucun e-mail).
// Horloge figée au mercredi 14 octobre 2026, 10:00 à Paris. Noms fictifs.
//
// Lancer : npm run build, puis
//   node scripts/tests/traces-lot3.mjs out docs/captures-traces [port]
// (playwright-core doit être résoluble.)
//
// La base simulée a deux états (variable MIG) :
//   'non'  migration 20261011120000 pas appliquée : traces → 404 PGRST205. Rien
//          ne doit apparaître, rien ne doit être écrit (l'appli est celle d'avant).
//   'oui'  migration appliquée : la lecture rejoue la RLS du SQL (bureau = son
//          entreprise ; salarié = ses lignes + le résumé d'une réunion « Toute
//          l'équipe ») — supabase/tests/lot3_traces_suppressions.mjs la prouve sur
//          un vrai Postgres. Personne n'écrit de trace : tout POST/PATCH/DELETE
//          sur `traces` est refusé, et compté.
//
//   N1 sans migration, salarié : pas de lien dans l'Historique, aucune écriture,
//      UNE seule lecture de `traces` (404), jamais redemandée
//   N2 sans migration, bureau : rien dans les Réglages ni dans le menu du téléphone,
//      une seule lecture au chargement de /admin, aucune à l'ouverture des Réglages / du menu
//   W1 salarié : lien discret « Interventions supprimées » dans l'Historique
//   W2 la liste : SES lignes seulement, 60 derniers jours, qui (« le bureau »,
//      « vous », « l'assistant du bureau », « automatiquement, la nuit »), avant → après en clair
//   W3 lecture seule (aucun bouton d'action), aucune écriture ; pas de défilement horizontal
//   W4 rien à montrer : « Rien de supprimé ni de décalé »
//   W5 réseau coupé : message + « Réessayer »
//   O1 bureau : Réglages → « Interventions supprimées ou décalées » → Voir
//   O2 la semaine : toute l'entreprise, noms, origine ; une réunion n'apparaît qu'une fois
//   O3 filtre salarié ; « Mois » ; ‹ période précédente ; › grisé sur la période en cours
//   O4 téléphone : menu ☰ → la même liste ; pas de défilement horizontal
//   O5 jamais d'écriture (ni trace, ni rien d'autre) en lisant
//   O6 plus de 500 lignes : l'écran le dit
//   R  case passée de Sam à Alex : Sam lit « retirée de votre planning », Alex ne
//      la voit pas, le bureau lit UNE ligne « Sam Test → Alex Exemple » ;
//      réunion « Toute l'équipe » devenue restreinte : Sam lit « Réunion retirée »
//      (l'avant seulement), jamais le résumé ni les nouveaux détails
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { ouvrirMenuCompte, ouvrirVue } from './navigation-salarie.mjs';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-traces', PORT = '5731'] = process.argv;
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

// ─── Horloge figée : mercredi 14 octobre 2026, 10:00 (Paris) ──────────────────
const NOW = new Date('2026-10-14T10:00:00+02:00');
const TODAY = '2026-10-14';

// ─── Base simulée ─────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000aa', CO2 = 'c0000000-0000-0000-0000-0000000000bb';
const ADMIN = 'u-admin', SAM = 'u-sam', ALEX = 'u-alex', CHLOE = 'u-chloe';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Exemple', city: 'Lyon', product_type: null, is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Résidence Test', city: 'Bron', product_type: null, is_active: true };
const WS = { w1: W1, w2: W2 };
const u = (id, first_name, last_name, role = 'worker', extra = {}) => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01', ...extra });
const USERS = [u(ADMIN, 'Admin', 'Test', 'admin'), u(ALEX, 'Alex', 'Exemple'), u(CHLOE, 'Chloé', 'Démo', 'lead'), u(SAM, 'Sam', 'Test'), u('u-autre', 'Autre', 'Salarié', 'worker', { company_id: CO2 })];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
const slotRow = (id, user_id, date, w, start, end, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: w?.id ?? null, work_date: date, absence_type: null, estimated_start: start, estimated_end: end,
  notes: null, position: null, added_by_worker: false, created_by: ADMIN, created_at: '2026-10-01T06:00:00Z', ...extra });
const PLANNING = [slotRow('p-s3', SAM, TODAY, W1, '08:00:00', '12:00:00'), slotRow('p-a3', ALEX, TODAY, W2, '13:30:00', '17:00:00')];
const entryRow = (id, user_id, date, w, status, start, end, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date: date, worksite_id: w?.id ?? null, planning_id: null, status, start_time: start, end_time: end,
  total_minutes: minutes, break_minutes: 0, meal_allowance: false, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, locked: false, exported_at: null, gap_before: null, source: null,
  exit_forgotten: false, modified_at: null, modified_by: null, created_at: `${date}T12:00:00Z`, submitted_at: status === 'draft' ? null : `${date}T18:00:00Z`, ...extra });
const ENTRIES = [entryRow('e-s1', SAM, '2026-10-13', W1, 'submitted', '08:00:00', '12:00:00', 240)];

// Les traces, telles que la base les écrit (avant / après complets).
let trSeq = 0;
const trace = (o) => ({ id: ++trSeq, company_id: CO, user_id: SAM, actor_id: ADMIN, actor_role: 'admin', origin: 'ecran', action: 'supprimee', object_table: 'planning',
  object_id: `obj-${trSeq}`, work_date: TODAY, before: null, after: null, created_at: '2026-10-14T07:00:00.000Z', ...o });
const planSnap = (extra = {}) => ({ id: 'p-x', company_id: CO, user_id: SAM, worksite_id: 'w1', work_date: '2026-10-15', estimated_start: '08:00:00', estimated_end: '12:00:00', absence_type: null, notes: null, ...extra });
const TRACES = [
  // Sam — cette semaine
  trace({ before: planSnap(), work_date: '2026-10-15', created_at: '2026-10-14T07:40:00.000Z' }),
  trace({ action: 'decalee', before: planSnap({ work_date: '2026-10-16' }), after: planSnap({ work_date: '2026-10-19', estimated_start: '09:00:00', estimated_end: '13:00:00', worksite_id: 'w2' }), created_at: '2026-10-13T15:20:00.000Z' }),
  trace({ object_table: 'time_entries', actor_id: SAM, actor_role: 'worker', before: { work_date: '2026-10-12', start_time: '13:00:00', end_time: '17:30:00', break_minutes: 0, worksite_id: 'w1', status: 'draft' }, created_at: '2026-10-12T17:02:00.000Z' }),
  trace({ object_table: 'active_sessions', object_id: SAM, origin: 'assistant', before: { user_id: SAM, work_date: '2026-10-13', started_at: '2026-10-13T05:58:00Z', worksite_id: 'w2' }, created_at: '2026-10-13T11:00:00.000Z' }),
  trace({ object_table: 'time_entries', actor_id: null, actor_role: null, origin: 'systeme', action: 'modifiee', before: { work_date: '2026-10-09', start_time: '08:00:00', end_time: '12:00:00', break_minutes: 0, worksite_id: 'w1' }, after: { work_date: '2026-10-09', start_time: '08:00:00', end_time: '12:00:00', break_minutes: 30, worksite_id: 'w1' }, created_at: '2026-10-13T00:31:00.000Z' }),
  // Sam — plus tôt ce mois-ci, puis il y a 70 jours (hors des 60 jours du salarié)
  trace({ object_table: 'day_tasks', before: { work_date: '2026-10-05', text: 'Ranger le dépôt', part: 'matin' }, created_at: '2026-10-02T08:00:00.000Z' }),
  trace({ before: planSnap({ work_date: '2026-08-06' }), created_at: '2026-08-05T08:00:00.000Z' }),
  // Alex — cette semaine (invisible pour Sam)
  trace({ user_id: ALEX, before: planSnap({ user_id: ALEX, work_date: '2026-10-16', worksite_id: 'w2' }), created_at: '2026-10-14T06:30:00.000Z' }),
  // Une réunion choisie (Sam + Alex) supprimée : résumé (bureau) + une ligne par participant
  ...(() => {
    const m = { id: 'm-1', company_id: CO, title: 'Point sécurité', meeting_date: '2026-10-16', start_time: '14:00:00', end_time: null, place: 'Dépôt', all_team: false };
    const at = '2026-10-13T09:00:00.000Z';
    return [trace({ user_id: null, object_table: 'meetings', object_id: 'm-1', before: { ...m, participants: [ALEX, SAM] }, created_at: at }),
      trace({ user_id: ALEX, object_table: 'meetings', object_id: 'm-1', before: m, created_at: at }),
      trace({ user_id: SAM, object_table: 'meetings', object_id: 'm-1', before: m, created_at: at })];
  })(),
  // Case passée de Sam à Alex (même jour, même heure) : la base écrit une ligne pour chacun.
  trace({ action: 'decalee', object_id: 'p-r', before: planSnap({ id: 'p-r', work_date: '2026-10-16' }), after: planSnap({ id: 'p-r', work_date: '2026-10-16', user_id: ALEX }), created_at: '2026-10-14T06:10:00.000Z' }),
  { ...trace({ action: 'decalee', object_id: 'p-r', before: planSnap({ id: 'p-r', work_date: '2026-10-16' }), after: planSnap({ id: 'p-r', work_date: '2026-10-16', user_id: ALEX }), created_at: '2026-10-14T06:10:00.000Z' }), user_id: ALEX },
  // « Toute l'équipe » devenue un entretien restreint (sans Sam) : résumé (bureau) + « retirée » pour Sam.
  ...(() => {
    const m = { id: 'm-2', company_id: CO, title: 'Equipe', meeting_date: '2026-10-15', start_time: '08:00:00', end_time: null, place: null, all_team: true };
    const at = '2026-10-13T08:00:00.000Z';
    return [trace({ user_id: null, object_table: 'meetings', object_id: 'm-2', action: 'modifiee', before: { ...m, participants: [] },
      after: { ...m, title: 'Entretien confidentiel', place: 'Bureau RH', all_team: false }, created_at: at }),
    trace({ user_id: SAM, object_table: 'meetings', object_id: 'm-2', action: 'retiree', before: m, created_at: at })];
  })(),
  // Une autre entreprise
  trace({ company_id: CO2, user_id: 'u-autre', before: planSnap({ company_id: CO2 }), created_at: '2026-10-14T07:00:00.000Z' }),
];

let MIG = 'oui';
let OFFLINE_TRACES = 0; // les n prochaines lectures de traces sont coupées (pas de réseau)
const D = {};
const freshDb = (traces = TRACES) => {
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, {
    users: USERS.map((x) => ({ ...x })), companies: [{ ...COMPANY }], worksites: Object.values(WS).map((x) => ({ ...x })),
    planning: PLANNING.map((x) => ({ ...x })), time_entries: ENTRIES.map((x) => ({ ...x })), active_sessions: [],
    traces: traces.map((x) => ({ ...x })),
    documents: [], trainings: [], training_views: [], user_payroll: [], invitations: [], month_closures: [], user_closures: [], leave_requests: [],
    push_subscriptions: [], kiosks: [], day_tasks: [], task_templates: [], meetings: [], meeting_participants: [],
  });
};
freshDb();
const userOf = (id) => D.users.find((x) => x.id === id);
const isAdmin = (uid) => userOf(uid)?.role === 'admin' && userOf(uid)?.is_active !== false;
const myCompany = (uid) => (userOf(uid)?.is_active !== false ? userOf(uid)?.company_id : null);

// ─── La RLS du SQL, rejouée (supabase/tests/lot3_traces_suppressions.mjs) ─────
const visible = (t, uid, rows) => {
  if (t !== 'traces') return rows;
  const co = myCompany(uid);
  const allTeam = (x) => (x.before === null || x.before?.all_team === true) && (x.after === null || x.after?.all_team === true);
  return rows.filter((x) => x.company_id === co && (isAdmin(uid) || x.user_id === uid
    || (x.user_id === null && x.object_table === 'meetings' && allTeam(x))));
};
// Les trois formes de `or=` que lib/traces.ts envoie.
const orFilter = (rows, or) => {
  if (!or) return rows;
  const mine = /^\(user_id\.eq\.([^,]+),and\(user_id\.is\.null,object_table\.eq\.meetings\)\)$/.exec(or);
  if (mine) return rows.filter((x) => x.user_id === mine[1] || (x.user_id === null && x.object_table === 'meetings'));
  const one = /^\(user_id\.eq\.([^,]+),and\(user_id\.is\.null,object_table\.eq\.meetings,before->>all_team\.eq\.true,or\(after\.is\.null,after->>all_team\.eq\.true\)\)\)$/.exec(or);
  if (one) return rows.filter((x) => x.user_id === one[1] || (x.user_id === null && x.object_table === 'meetings' && x.before?.all_team === true && (x.after === null || x.after?.all_team === true)));
  if (or === '(object_table.neq.meetings,user_id.is.null)') return rows.filter((x) => x.object_table !== 'meetings' || x.user_id === null);
  throw new Error(`or= inattendu : ${or}`);
};

// ─── Réseau simulé ────────────────────────────────────────────────────────────
const writes = []; // toute requête hors GET (REST, RPC, fonctions, stockage)
const gets = [];
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
function filterRows(rows, params) {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    let neg = false; let w = v; if (w.startsWith('not.')) { neg = true; w = w.slice(4); }
    const dot = w.indexOf('.'); const op = w.slice(0, dot); const val = w.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k]; let r = true;
      if (op === 'eq') r = String(cur) === val;
      else if (op === 'neq') r = String(cur) !== val;
      else if (op === 'in') r = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      else if (op === 'gte') r = String(cur) >= val;
      else if (op === 'lte') r = String(cur) <= val;
      else if (op === 'gt') r = String(cur) > val;
      else if (op === 'lt') r = String(cur) < val;
      else if (op === 'is') r = val === 'null' ? cur == null : String(cur) === val;
      return neg ? !r : r;
    });
  }
  return rows;
}
const sortRows = (rows, order) => {
  if (!order) return rows;
  const keys = order.split(',').map((o) => { const [k, dir] = o.split('.'); return { k, desc: dir === 'desc' }; });
  const val = (x) => (typeof x === 'number' ? String(x).padStart(12, '0') : String(x ?? ''));
  return [...rows].sort((a, z) => { for (const { k, desc } of keys) { const x = val(a[k]); const y = val(z[k]); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};
const sessionFor = (uid) => {
  const now = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: uid, email: `${uid}@exemple.fr`, aud: 'authenticated', role: 'authenticated' } };
};
const MISSING_TABLE = (t) => ({ status: 404, json: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache`, details: null, hint: null } });
const errors = [];
const newCtx = async (uid, viewport) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce', ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const session = sessionFor(uid);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.clock.setFixedTime(NOW);
  await ctx.route((url) => url.hostname !== 'localhost' && !url.hostname.endsWith('.supabase.co'), (r) => r.abort());
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const m = req.method();
    let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/storage/v1/')) return r.fulfill({ json: [] });
    if (url.pathname.startsWith('/functions/v1/')) { writes.push({ m: 'FN', t: url.pathname.replace('/functions/v1/', ''), body, by: uid }); return r.fulfill({ json: {} }); }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.replace('/rest/v1/rpc/', '');
      if (m === 'GET' || m === 'HEAD') gets.push({ t: `rpc/${fn}`, by: uid }); else writes.push({ m: 'RPC', t: fn, body, by: uid });
      if (fn === 'company_has_kiosk') return r.fulfill({ json: false });
      return r.fulfill({ json: [] });
    }
    const t = url.pathname.replace('/rest/v1/', '');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200, total = rows.length, off = 0) => {
      if (single) return rows.length ? r.fulfill({ status, json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none', details: null, hint: null } });
      return r.fulfill({ status, json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${total}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
    };
    if (t === 'traces') {
      if (m !== 'GET' && m !== 'HEAD') { writes.push({ m, t, body, by: uid }); return r.fulfill({ status: 403, json: { code: '42501', message: 'permission denied for table traces', details: null, hint: null } }); }
      gets.push({ t, p: new URLSearchParams(url.searchParams), by: uid, missing: MIG !== 'oui' });
      if (MIG !== 'oui') return r.fulfill(MISSING_TABLE(t));
      if (OFFLINE_TRACES > 0 && url.searchParams.get('select') === '*') { OFFLINE_TRACES--; return r.abort('internetdisconnected'); }
    }
    if (m === 'GET' || m === 'HEAD') {
      if (t !== 'traces') gets.push({ t, p: new URLSearchParams(url.searchParams), by: uid });
      const sel = url.searchParams.get('select') || '*';
      let rows = orFilter(filterRows(visible(t, uid, D[t] || []), url.searchParams), t === 'traces' ? url.searchParams.get('or') : null);
      rows = sortRows(rows, url.searchParams.get('order')).map((x) => {
        if (t !== 'planning' && t !== 'time_entries') return x;
        return { ...x, ...(sel.includes('worksite:worksites') ? { worksite: x.worksite_id ? WS[x.worksite_id] : null } : {}), ...(sel.includes('user:users') ? { user: userOf(x.user_id) || null } : {}) };
      });
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      const total = rows.length;
      if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      return reply(rows, 200, total, off);
    }
    writes.push({ m, t, q: url.search, body, by: uid });
    if (m === 'POST') { const list = (Array.isArray(body) ? body : [body]).map((x, i) => ({ id: `x-${Date.now()}-${i}`, ...x })); D[t] = [...(D[t] || []), ...list]; return reply(list, 201); }
    const hit = filterRows(D[t] || [], url.searchParams);
    if (m === 'PATCH') { for (const x of hit) Object.assign(x, body); return reply(hit); }
    if (m === 'DELETE') { D[t] = (D[t] || []).filter((x) => !hit.includes(x)); return reply(hit); }
    return reply([]);
  });
  return ctx;
};

// ─── Outils ───────────────────────────────────────────────────────────────────
let ok = 0, ko = 0; const fails = [];
const check = (c, m) => { if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };
const section = (t) => console.log(`\n═══ ${t}`);
const shot = async (loc, name) => {
  const page = typeof loc.page === 'function' ? loc.page() : loc;
  await page.evaluate(() => document.querySelectorAll('[data-sonner-toaster]').forEach((t) => { t.style.visibility = 'hidden'; })).catch(() => {});
  await new Promise((r) => setTimeout(r, 200));
  await loc.screenshot({ path: path.join(SH, `${name}.png`) }).catch((e) => console.log('   (capture impossible :', e.message.split('\n')[0], ')'));
};
const txt = async (loc) => (await loc.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const noOverflow = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); return !!el && el.scrollWidth <= el.clientWidth + 1; }, sel);
// Ce que l'appli écrit déjà à chaque chargement (rien à voir avec le lot 3).
const writesSince = (n) => writes.slice(n).filter((w) => !(w.m === 'RPC' && ['touch_last_seen', 'ensure_other_worksite', 'ensure_planning_slot'].includes(w.t)));
const tracesGets = (n, uid) => gets.slice(n).filter((g) => g.t === 'traces' && (!uid || g.by === uid));

const pages = [];
const track = (p, who) => { p.on('pageerror', (e) => { errors.push(`${who} : ${e.message}`); console.log(`   [erreur page ${who}]`, e.message); }); pages.push(p); return p; };
const office = await newCtx(ADMIN, { width: 1366, height: 900 });
const op = track(await office.newPage(), 'bureau');
const worker = await newCtx(SAM, { width: 390, height: 844 });
const wp = track(await worker.newPage(), 'salarié');

const openOffice = async (p = op) => {
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector('.bt-pl-gridwrap .bt-pl-name', { timeout: 25000 });
  await p.waitForTimeout(1300);
};
const openSettings = async (p = op) => {
  await p.locator('.bt-pl-acct:visible').first().click();
  await p.locator('button:visible', { hasText: "Réglages de l'entreprise" }).first().click();
  await p.waitForSelector('.bt-set', { timeout: 10000 });
  await p.waitForTimeout(500);
};
const dlg = (p) => p.locator('[role=dialog]').last();
const closeDlg = async (p) => { await p.keyboard.press('Escape'); await p.waitForTimeout(350); };
const openMobileOffice = async (ctx) => {
  const mp = track(await ctx.newPage(), 'bureau mobile');
  await mp.goto(`http://localhost:${PORT}/admin`); await mp.waitForSelector('.bt-pl-m-card, .bt-pl-m-ibtn', { timeout: 25000 }); await mp.waitForTimeout(1300);
  return mp;
};
const openMobileMenu = async (mp) => { await mp.locator('button[aria-label="Menu"]').first().click(); await mp.waitForSelector('.bt-mm-sheet'); await mp.waitForTimeout(500); };
const openHistory = async (p = wp) => {
  await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector('.bt-total', { timeout: 20000 }); await p.waitForTimeout(1000);
  await ouvrirVue(p, 'Historique', { menu: true, attente: 250 });
  await p.waitForSelector('h2:has-text("Historique")', { timeout: 10000 });
  await p.waitForTimeout(900);
};
// innerText garde les MAJUSCULES du CSS (étiquettes « Avant », origine) : on compare en minuscules.
const items = async (p) => (await p.locator('[data-testid=traces-item]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase());
const waitList = async (p) => { await p.waitForSelector('[data-testid=traces-list], [data-testid=traces-empty], .bt-tr-ko', { timeout: 10000 }); await p.waitForTimeout(250); };

// ═══ Sans la migration : l'appli d'avant ═════════════════════════════════════
section('N1 — sans migration, salarié : rien de plus dans l’Historique');
MIG = 'non'; freshDb();
let w0 = writes.length; let g0 = gets.length;
await openHistory();
check(await wp.locator('[data-testid=history-traces]').count() === 0, 'pas de lien « Interventions supprimées »');
check(!(await txt(wp.locator('body'))).includes('Interventions supprimées'), 'aucun texte du lot 3 à l’écran');
check(tracesGets(g0, SAM).length === 1 && tracesGets(g0, SAM).every((g) => g.missing), `une seule question à la base (table absente : PGRST205), sans suite (${tracesGets(g0, SAM).length})`);
await ouvrirMenuCompte(wp, { attente: 300 }); await wp.keyboard.press('Escape'); await wp.waitForTimeout(300);
check(tracesGets(g0, SAM).length === 1, 'rien de plus en restant sur l’Historique');
check(writesSince(w0).length === 0, `aucune écriture (${JSON.stringify(writesSince(w0).map((w) => `${w.m} ${w.t}`))})`);
await shot(wp, 'sans-migration-salarie-historique');

section('N2 — sans migration, bureau : rien dans les Réglages ni dans le menu');
w0 = writes.length; g0 = gets.length;
await openOffice();
check(tracesGets(g0, ADMIN).length === 1 && tracesGets(g0, ADMIN)[0].missing, `/admin : une seule lecture de « traces » au chargement (${tracesGets(g0, ADMIN).length})`);
await openSettings();
check(tracesGets(g0, ADMIN).length === 1, 'ouvrir les Réglages : aucune lecture de plus (table absente, su une fois)');
check(await op.locator('[data-testid=set-traces]').count() === 0, 'Réglages : pas d’entrée « Interventions supprimées ou décalées »');
await shot(dlg(op), 'sans-migration-bureau-reglages');
await closeDlg(op);
const mob0 = await newCtx(ADMIN, { width: 390, height: 844 }); const mp0 = await openMobileOffice(mob0);
const g1 = gets.length;
await openMobileMenu(mp0);
check(await mp0.locator('[data-testid=mm-traces]').count() === 0, 'menu ☰ du téléphone : pas d’entrée');
check(tracesGets(g1, ADMIN).length === 0, 'ouvrir le menu ☰ : aucune lecture de « traces »');
await shot(mp0, 'sans-migration-bureau-menu-mobile');
await mob0.close();
check(writesSince(w0).length === 0, 'aucune écriture');

// ═══ Salarié ════════════════════════════════════════════════════════════════
section('W1/W2 — salarié : lien discret, SES lignes, 60 jours, avant → après');
MIG = 'oui'; freshDb();
w0 = writes.length;
await openHistory();
const link = wp.locator('[data-testid=history-traces]');
check(await link.count() === 1 && (await txt(link)) === 'Interventions supprimées', 'lien « Interventions supprimées » sous le titre');
const linkBox = await link.boundingBox();
check(!!linkBox && linkBox.height < 30, `lien discret, pas un gros bouton (${Math.round(linkBox?.height || 0)} px de haut)`);
await shot(wp, 'salarie-historique-lien');
g0 = gets.length;
await link.click();
await wp.waitForSelector('[data-testid=traces-dialog]'); await waitList(wp);
const dW = dlg(wp);
check((await txt(dW.locator('h2'))) === 'Interventions supprimées', 'fenêtre « Interventions supprimées »');
check((await txt(dW)).includes('Les 60 derniers jours'), 'dit la période : les 60 derniers jours');
const wl = await items(wp);
console.log('     ', wl.join('\n       '));
check(wl.length === 9, `9 lignes : les siennes (planning, heures, pointage, tâche, réunions, case passée à Alex), pas celles d’Alex ni d’il y a 70 jours (${wl.length})`);
check(wl[0].startsWith('intervention supprimée') && wl[0].includes('par le bureau') && wl[0].includes('jeu. 15/10 · 08:00–12:00 · villa exemple') && wl[0].includes('14/10 à 09:40'),
  'case supprimée : par le bureau, quand (heure de Paris), jour · heures · chantier');
const moved = wl.find((x) => x.startsWith('intervention décalée'));
check(!!moved && /avant ven\. 16\/10 · 08:00–12:00 · villa exemple après lun\. 19\/10 · 09:00–13:00 · résidence test/.test(moved), 'case décalée : Avant → Après en clair');
check(wl.some((x) => x.startsWith('heures supprimées') && x.includes('par vous') && x.includes('lun. 12/10 · 13:00–17:30 · villa exemple')), 'ses heures effacées par lui : « par vous »');
check(wl.some((x) => x.startsWith('pointage en cours supprimé') && x.includes('par l’assistant du bureau') && x.includes('commencé à 07:58')), 'pointage supprimé par l’assistant du bureau');
check(wl.some((x) => x.startsWith('heures modifiées') && x.includes('automatiquement, la nuit') && !x.includes('par automatiquement') && x.includes('(pause 30 min)')), 'changement automatique de nuit : « automatiquement, la nuit »');
check(wl.some((x) => x.startsWith('tâche supprimée') && x.includes('« ranger le dépôt »')), 'tâche supprimée');
check(wl.some((x) => x.startsWith('réunion supprimée') && x.includes('« point sécurité »') && !x.includes('alex')), 'réunion supprimée — sans la liste des autres participants');
check(!wl.some((x) => x.includes('alex') || x.includes('06/08')), 'rien d’Alex, rien d’il y a plus de 60 jours');
const handed = wl.find((x) => x.startsWith('intervention retirée de votre planning'));
check(!!handed && handed.includes('était ven. 16/10 · 08:00–12:00 · villa exemple') && !handed.includes('après'), `case passée à un collègue : « retirée de votre planning », l’avant seulement (${handed})`);
const left = wl.find((x) => x.startsWith('réunion retirée'));
check(!!left && left.includes('« equipe »') && !wl.some((x) => x.includes('entretien') || x.includes('bureau rh')), 'réunion « Toute l’équipe » devenue restreinte : « Réunion retirée » (l’avant), jamais ses nouveaux détails');
check(!wl.some((x) => x.startsWith('intervention remise') || x.includes(' remis ')), '(aucune étiquette « Remis » au masculin)');
check((await txt(dW)).includes('votre planning, vos heures, vos tâches et vos réunions'), 'la phrase dit tout ce que la liste montre');
const tq = tracesGets(g0, SAM).find((g) => g.p.get('select') === '*');
check(!!tq && tq.p.getAll('created_at').some((v) => v.startsWith('gte.2026-08-14T22:00:00')), `lecture bornée aux 60 derniers jours (${tq?.p.getAll('created_at').join(' & ')})`);

section('W3 — lecture seule, aucune écriture, pas de défilement horizontal');
const actionBtns = (await dW.locator('button').allInnerTexts()).map((s) => s.trim()).filter((s) => s && s !== 'Close');
check(actionBtns.length === 0, `aucun bouton d’action dans la liste (${JSON.stringify(actionBtns)})`);
check(await noOverflow(wp, '[data-testid=traces-dialog]'), 'pas de défilement horizontal (390 px)');
check(writesSince(w0).length === 0, `aucune écriture en lisant (${JSON.stringify(writesSince(w0).map((w) => `${w.m} ${w.t}`))})`);
await shot(dW, 'salarie-liste');
await closeDlg(wp);

section('W4 — rien à montrer');
freshDb(TRACES.filter((x) => x.user_id !== SAM && x.object_table !== 'meetings'));
await openHistory();
await wp.locator('[data-testid=history-traces]').click(); await waitList(wp);
check((await txt(dlg(wp))).includes('Rien de supprimé ni de décalé sur cette période.'), '« Rien de supprimé ni de décalé sur cette période. »');
await shot(dlg(wp), 'salarie-vide');
await closeDlg(wp);

section('W5 — réseau coupé : un message, « Réessayer »');
freshDb();
await openHistory();
OFFLINE_TRACES = 1;
await wp.locator('[data-testid=history-traces]').click(); await waitList(wp);
check((await txt(dlg(wp))).includes('Impossible de charger la liste.'), 'message clair quand la lecture échoue');
await dlg(wp).getByRole('button', { name: 'Réessayer' }).click(); await waitList(wp);
check((await items(wp)).length === 9, '« Réessayer » relit la liste');
await closeDlg(wp);

section('R — Alex (il a REÇU la case de Sam) : rien de « supprimé » pour lui');
const alexCtx = await newCtx(ALEX, { width: 390, height: 844 }); const ap = track(await alexCtx.newPage(), 'alex');
await openHistory(ap);
await ap.locator('[data-testid=history-traces]').click(); await waitList(ap);
const al = await items(ap);
check(al.length === 2 && !al.some((x) => x.includes('retirée de votre planning') || x.includes('ven. 16/10 · 08:00–12:00 · villa exemple')), `Alex : sa case et sa réunion, pas la case reçue (${al.length})`);
await alexCtx.close();

// ═══ Bureau ═════════════════════════════════════════════════════════════════
section('O1/O2 — bureau : Réglages → Voir ; la semaine, toute l’entreprise');
freshDb();
w0 = writes.length;
await openOffice(); await openSettings();
const entryO = op.locator('[data-testid=set-traces]');
check(await entryO.count() === 1 && (await txt(entryO)).toLowerCase().includes('interventions supprimées ou décalées'), 'Réglages : entrée « Interventions supprimées ou décalées »');
await entryO.scrollIntoViewIfNeeded(); await op.waitForTimeout(200);
await shot(op, 'bureau-reglages-entree');
await entryO.getByRole('button', { name: 'Voir' }).click();
await op.waitForSelector('[data-testid=traces-dialog]'); await waitList(op);
check(await op.locator('.bt-set').count() === 0, 'les Réglages se ferment, la liste s’ouvre');
const dO = dlg(op);
check((await txt(dO.locator('h2'))) === 'Interventions supprimées ou décalées', 'fenêtre « Interventions supprimées ou décalées »');
check((await txt(op.locator('[data-testid=traces-period]'))).startsWith('S-42'), `semaine en cours par défaut (${await txt(op.locator('[data-testid=traces-period]'))})`);
let ol = await items(op);
console.log('     ', ol.join('\n       '));
check(ol.length === 9, `cette semaine : 9 lignes (Sam, Alex, chaque réunion une seule fois, la case passée de Sam à Alex une seule fois ; ni l’autre entreprise, ni le mois dernier) (${ol.length})`);
const reas = ol.filter((x) => x.includes('sam test → alex exemple'));
check(reas.length === 1 && reas[0].startsWith('intervention décalée') && reas[0].includes('avant sam test · ven. 16/10 · 08:00–12:00 · villa exemple') && reas[0].includes('après alex exemple · ven. 16/10'),
  'case passée de Sam à Alex : UNE ligne « Sam Test → Alex Exemple », avant / après nommés');
check((await txt(dO)).includes('Ce qui a été supprimé ou décalé pendant cette période'), 'la période filtre la date de l’intervention : c’est dit sous les filtres');
check(await dO.locator('[data-testid=traces-truncated]').count() === 0, 'moins de 500 lignes : pas d’avertissement');
check(ol.some((x) => x.startsWith('intervention supprimée — sam test') && x.includes('par admin test') && x.includes('écran')), 'nom du salarié, nom de l’auteur, origine « Écran »');
check(ol.some((x) => x.startsWith('intervention supprimée — alex exemple')), 'Alex aussi');
check(ol.filter((x) => x.startsWith('réunion supprimée')).length === 1 && ol.some((x) => x.startsWith('réunion supprimée — alex exemple, sam test')), 'la réunion : une seule ligne, avec ses participants');
check(ol.some((x) => x.startsWith('pointage en cours supprimé') && x.includes('admin test, par l’assistant') && /l’assistant\s*assistant/.test(x)), 'pointage : « par l’assistant », origine « Assistant »');
check(ol.some((x) => x.startsWith('heures supprimées — sam test') && x.includes('par sam test')), 'heures effacées par le salarié lui-même : son nom');
check(ol.some((x) => x.includes('automatiquement, la nuit') && /la nuit\s*automatique/.test(x)), 'changement automatique : « automatiquement, la nuit », origine « Automatique »');
await shot(dO, 'bureau-semaine');

section('O3 — filtre salarié, mois, période précédente');
await op.selectOption('[data-testid=traces-worker]', ALEX); await waitList(op);
ol = await items(op);
check(ol.length === 3 && ol.every((x) => x.includes('alex exemple')), `Alex : sa case, sa réunion, la case reçue de Sam (${ol.length})`);
// Filtré sur Sam : ses lignes ET le résumé d'une réunion restée « Toute l'équipe » (comme dans son Historique).
const tqs = gets.length;
await op.selectOption('[data-testid=traces-worker]', SAM); await waitList(op);
const sq = tracesGets(tqs, ADMIN).find((g) => g.p.get('select') === '*');
check(!!sq && /before->>all_team\.eq\.true/.test(sq.p.get('or') || ''), 'filtre salarié : la réunion « Toute l’équipe » restée telle reste dans la liste du salarié');
check(!(await items(op)).some((x) => x.includes('entretien')), 'filtré sur Sam : rien de l’entretien restreint (seulement « Réunion retirée » pour lui)');
await op.selectOption('[data-testid=traces-worker]', ''); await waitList(op);
await dO.getByRole('button', { name: 'Mois' }).click(); await waitList(op);
check((await txt(op.locator('[data-testid=traces-period]'))) === 'Octobre 2026', 'période : Octobre 2026');
ol = await items(op);
check(ol.length === 10 && ol.some((x) => x.startsWith('tâche supprimée — sam test')), `le mois : 10 lignes, la tâche du 02/10 comprise (${ol.length})`);
check(await dO.getByRole('button', { name: 'Période suivante' }).isDisabled(), '› grisé : pas de période future');
await dO.getByRole('button', { name: 'Période précédente' }).click(); await dO.getByRole('button', { name: 'Période précédente' }).click(); await waitList(op);
check((await txt(op.locator('[data-testid=traces-period]'))) === 'Août 2026' && (await items(op)).length === 1, 'août : la case supprimée le 05/08');
await shot(dO, 'bureau-mois-aout');
await closeDlg(op);
check(writesSince(w0).length === 0, `aucune écriture en lisant (${JSON.stringify(writesSince(w0).map((w) => `${w.m} ${w.t}`))})`);

section('O4 — téléphone : menu ☰ → la même liste');
const mob = await newCtx(ADMIN, { width: 390, height: 844 }); const mp = await openMobileOffice(mob);
await openMobileMenu(mp);
const mm = mp.locator('[data-testid=mm-traces]');
check(await mm.count() === 1 && (await txt(mm)) === 'Interventions supprimées ou décalées', 'menu ☰ : « Interventions supprimées ou décalées »');
await shot(mp, 'bureau-menu-mobile');
await mm.click(); await mp.waitForSelector('[data-testid=traces-dialog]'); await waitList(mp);
check((await items(mp)).length === 9, 'la même liste (semaine en cours)');
check(await noOverflow(mp, '[data-testid=traces-dialog]'), 'pas de défilement horizontal (390 px)');
await shot(dlg(mp), 'bureau-liste-mobile');
await mob.close();

section('O6 — plus de 500 lignes : l’écran le dit');
freshDb(Array.from({ length: 520 }, (_, i) => trace({ object_id: `bulk-${i}`, before: planSnap({ id: `bulk-${i}` }), created_at: new Date(Date.parse('2026-10-14T07:00:00Z') - i * 60000).toISOString() })));
await openOffice(); await openSettings();
await op.locator('[data-testid=set-traces]').getByRole('button', { name: 'Voir' }).click();
await op.waitForSelector('[data-testid=traces-dialog]'); await waitList(op);
check((await items(op)).length === 500, `500 lignes affichées (${(await items(op)).length})`);
check((await txt(op.locator('[data-testid=traces-truncated]'))).includes('Seules les 500 plus récentes sont affichées'), 'et une phrase le dit : « Seules les 500 plus récentes… choisissez une semaine ou un salarié »');
await closeDlg(op);

section('O5 — jamais d’écriture, jamais d’erreur');
check(!writes.some((w) => w.t === 'traces'), 'aucune requête d’écriture vers « traces » pendant tout le test');
check(errors.length === 0, `aucune erreur JavaScript (${errors.join(' | ') || 'aucune'})`);

console.log(`\n${ok} ok, ${ko} échec(s)`);
if (fails.length) console.log(fails.map((f) => `  - ${f}`).join('\n'));
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
