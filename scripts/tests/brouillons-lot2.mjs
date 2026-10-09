// Lot 2 (c) — « brouillons propres », sur les VRAIES pages : planning du bureau
// (/admin), fiche du salarié, Assistant du bureau, et « Ma journée » (/poseur).
// UNE base simulée partagée par les deux navigateurs, qui se comporte comme la
// vraie là où ça compte ici (aucune vraie base, aucun e-mail) :
//  · clé étrangère time_entries.planning_id → planning : effacer une
//    intervention encore désignée par une ligne d'heures est refusé (23503),
//    insérer une ligne vers une intervention absente aussi ;
//  · total_minutes est calculé par la base : l'envoyer est refusé (428C9) ;
//  · une ligne déjà envoyée une fois (submitted_at) ne s'efface pas (P0001).
// Entreprise de test neutre : « Entreprise Test », Sam Test (salarié), Alex Test (bureau).
//
// Lancer : npm run build, puis
//   node scripts/tests/brouillons-lot2.mjs out docs/captures-lot2 4650
// « Avant » (build du #144, captures seulement, rien n'est vérifié) :
//   AVANT=1 node scripts/tests/brouillons-lot2.mjs <out-144> docs/captures-lot2 4651
//
//  B1  intervention + brouillon VIDE lié : plus de « 0h00 · à envoyer » ; « Supprimer »
//      efface le brouillon PUIS l'intervention ; « Annuler » remet l'intervention PUIS
//      le brouillon (sans total_minutes)
//  B2  brouillon avec des heures, ou ligne envoyée : 🔒, zéro écriture
//  B3  intervention retirée par le salarié : bulle éteinte ; « Supprimer » détache la
//      ligne retirée (PATCH planning_id → null) PUIS efface ; heures intactes ; « Annuler » rattache
//  B4  sortie oubliée à compléter : 🔒 « Sortie oubliée à compléter »
//  B5  brouillon vide « en vrac » (sans planning_id) dans la case : part avec elle ;
//      un brouillon en vrac AVEC des heures : bloque
//  B6  salarié : début = fin refusé, aucun envoi ; B6b « Retirer » un brouillon vide : « Brouillon vide : il sera supprimé. »
//  B7  « Copier la journée d'hier » avec une sortie oubliée à compléter + 08–12 : une seule ligne
//  B8  saisie hors ligne vers une intervention supprimée : 23503, puis renvoi sans le lien ; file vidée
//  B9  bureau, fiche du salarié : « brouillon vide » + « Supprimer » ; « Annuler » sans total_minutes
//  B10 Assistant « effacer le planning » sur B1 + B3 (+ B4) : mêmes résultats
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot2', PORT = '4650'] = process.argv;
const AVANT = process.env.AVANT === '1';
const PREFIX = AVANT ? 'avant-brouillons-' : 'apres-brouillons-';
fs.mkdirSync(SH, { recursive: true });
const shot = (name) => path.join(SH, `${PREFIX}${name}.png`);
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

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 à Paris ─────────────────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const TODAY = '2026-10-21'; const YESTERDAY = '2026-10-20';
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;

// ─── Base simulée ────────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000b2';
const ME = 'u-sam'; const ADMIN = 'u-alex';
const WS = {
  'w-salle': { id: 'w-salle', company_id: CO, client_name: 'Salle', city: 'Lyon', is_active: true },
  'w-depot': { id: 'w-depot', company_id: CO, client_name: 'Dépôt', city: 'Vienne', is_active: true },
  'w-atelier': { id: 'w-atelier', company_id: CO, client_name: 'Atelier', city: 'Lyon', is_active: true },
  'w-cuisine': { id: 'w-cuisine', company_id: CO, client_name: 'Cuisine', city: 'Lyon', is_active: true },
  'w-autre': { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true },
};
const USERS = [
  { id: ADMIN, company_id: CO, first_name: 'Alex', last_name: 'Test', role: 'admin', email: 'alex@exemple.fr', is_active: true, created_at: '2026-01-01' },
  { id: ME, company_id: CO, first_name: 'Sam', last_name: 'Test', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' },
];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const generated = (r) => { let d = toMin(r.end_time) - toMin(r.start_time); if (d < 0) d += 1440; return d - (Number(r.break_minutes) || 0); };
const hhmmss = (t) => (t && t.length === 5 ? `${t}:00` : t);
let seq = 0;
const D = {};
const freshDb = () => {
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, {
    users: USERS.map((x) => ({ ...x })), companies: [{ ...COMPANY }], worksites: Object.values(WS).map((x) => ({ ...x })),
    planning: [], time_entries: [], active_sessions: [], month_closures: [], user_closures: [], leave_requests: [], invitations: [],
    documents: [], certifications: [], push_subscriptions: [], time_entry_corrections: [], time_entry_positions: [], assistant_journal: [],
    user_payroll: [], worksite_expenses: [], kiosks: [], kiosk_settings: [],
  });
};
freshDb();
/** Une ligne telle que la base la stocke (total_minutes = colonne calculée). */
const entry = (o) => {
  const r = {
    id: o.id || `e-${++seq}`, company_id: CO, user_id: ME, worksite_id: 'w-salle', planning_id: null, work_date: TODAY,
    break_minutes: 0, meal_allowance: false, status: 'draft', locked: false, exported_at: null, submitted_at: null, observation: null,
    reception: null, reserve_resolved_at: null, reserve_fixed_at: null, gap_before: null, source: null, exit_forgotten: false,
    corrected_at: null, modified_at: null, modified_by: null, client_id: null, photos: null, created_at: NOW.toISOString(), ...o,
  };
  r.start_time = hhmmss(r.start_time); r.end_time = hhmmss(r.end_time);
  r.total_minutes = generated(r);
  return r;
};
const plan = (id, ws, date, s, e, extra = {}) => ({ id, company_id: CO, user_id: ME, worksite_id: ws, work_date: date, absence_type: null,
  estimated_start: s ? `${s}:00` : null, estimated_end: e ? `${e}:00` : null, notes: null, position: null, added_by_worker: false,
  created_by: ADMIN, created_at: `${date}T06:00:00Z`, ...extra });

// ─── PostgREST simulé ────────────────────────────────────────────────────────────
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
const filterRows = (rows, params) => {
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
};
const sortRows = (rows, order) => {
  if (!order) return rows;
  const keys = order.split(',').map((o) => { const [k, dir] = o.split('.'); return { k, desc: dir === 'desc' }; });
  return [...rows].sort((a, c) => { for (const { k, desc } of keys) { const x = String(a[k] ?? ''); const y = String(c[k] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};
const embed = (t, row, sel) => {
  const out = { ...row };
  if (sel.includes('worksite:worksites')) out.worksite = row.worksite_id ? WS[row.worksite_id] || null : null;
  if (sel.includes('user:users')) out.user = D.users.find((x) => x.id === row.user_id) || null;
  return out;
};
const pgErr = (status, code, message, details = null) => ({ status, json: { code, message, details, hint: null } });
const FK_INSERT = (pid) => pgErr(409, '23503', 'insert or update on table "time_entries" violates foreign key constraint "time_entries_planning_id_fkey"', `Key (planning_id)=(${pid}) is not present in table "planning".`);
/** Toutes les requêtes (lectures comprises), dans l'ordre. */
const log = [];
const writes = () => log.filter((x) => x.m !== 'GET' && x.m !== 'HEAD');
let assistantReply = null;

const sessionFor = (uid, email) => {
  const now = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: uid, email, aud: 'authenticated', role: 'authenticated' } };
};
const newCtx = async (uid, email, viewport, init) => {
  const mobile = viewport.width < 500;
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const session = sessionFor(uid, email);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  if (init) await ctx.addInitScript(init.fn, init.arg);
  await ctx.clock.setFixedTime(NOW);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const m = req.method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/assistant')) { log.push({ m: 'FN', t: url.pathname, by: uid }); return r.fulfill({ json: assistantReply || {} }); }
    if (url.pathname.startsWith('/functions/v1/')) { log.push({ m: 'FN', t: url.pathname, by: uid }); return r.fulfill({ json: {} }); }
    if (url.pathname === '/rest/v1/rpc/company_has_kiosk') return r.fulfill({ json: false });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', ''); D[t] = D[t] || [];
    const sel = url.searchParams.get('select') || '*';
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200) => {
      if (single) return rows.length ? r.fulfill({ status, json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none', details: null, hint: null } });
      return r.fulfill({ status, json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
    };
    if (m === 'GET' || m === 'HEAD') {
      log.push({ m, t, q: url.search, by: uid });
      let rows = sortRows(filterRows(D[t], url.searchParams), url.searchParams.get('order')).map((x) => embed(t, x, sel));
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      return reply(rows);
    }
    let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    const w = { m, t, q: url.search, body, by: uid, status: 200 };
    log.push(w);
    const fail = (e) => { w.status = e.status; w.code = e.json.code; return r.fulfill(e); };
    if (m === 'POST') {
      const list = (Array.isArray(body) ? body : [body]).map((x) => ({ ...x }));
      if (t === 'time_entries') {
        for (const x of list) {
          if ('total_minutes' in x) return fail(pgErr(400, '428C9', 'cannot insert a non-DEFAULT value into column "total_minutes"', 'Column "total_minutes" is a generated column.'));
          if (x.planning_id && !D.planning.some((p) => p.id === x.planning_id)) return fail(FK_INSERT(x.planning_id));
        }
      }
      const saved = list.map((x) => {
        const row = t === 'time_entries' ? entry({ ...x, id: x.id || `new-${++seq}` }) : { id: x.id || `new-${++seq}`, ...x };
        const i = D[t].findIndex((y) => y.id === row.id);
        if (i >= 0) D[t][i] = row; else D[t].push(row);
        return row;
      });
      w.status = 201;
      return reply(saved, 201);
    }
    const hit = filterRows(D[t], url.searchParams);
    if (m === 'PATCH') {
      if (t === 'time_entries' && body && body.planning_id && !D.planning.some((p) => p.id === body.planning_id)) return fail(FK_INSERT(body.planning_id));
      for (const x of hit) {
        Object.assign(x, body);
        if (t === 'time_entries') { x.start_time = hhmmss(x.start_time); x.end_time = hhmmss(x.end_time); x.total_minutes = generated(x); }
      }
      w.ids = hit.map((x) => x.id);
      return reply(hit);
    }
    if (m === 'DELETE') {
      if (t === 'planning') {
        const ids = new Set(hit.map((x) => x.id));
        const still = D.time_entries.find((e) => e.planning_id && ids.has(e.planning_id));
        if (still) return fail(pgErr(409, '23503', 'update or delete on table "planning" violates foreign key constraint "time_entries_planning_id_fkey" on table "time_entries"', `Key (id)=(${still.planning_id}) is still referenced from table "time_entries".`));
      }
      if (t === 'time_entries' && hit.some((x) => x.submitted_at)) return fail(pgErr(400, 'P0001', 'time_entries: heures déjà envoyées — elles se retirent, elles ne s\'effacent pas'));
      D[t] = D[t].filter((x) => !hit.includes(x));
      w.ids = hit.map((x) => x.id);
      return reply(hit);
    }
    return reply([]);
  });
  return ctx;
};

// ─── Outils ──────────────────────────────────────────────────────────────────────
let ok = 0, ko = 0; const fails = []; const notes = [];
const check = (c, m) => {
  if (AVANT) { notes.push(`${c ? 'oui' : 'non'} — ${m}`); console.log(`  ℹ ${c ? 'oui' : 'non'} — ${m}`); return; }
  if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); }
};
const wsum = (list) => list.map((x) => `${x.m} ${x.t}${x.code ? ` →${x.code}` : ''}`).join(' | ') || '(aucune)';
const office = await newCtx(ADMIN, 'alex@exemple.fr', { width: 1440, height: 900 });
const op = await office.newPage();
op.on('pageerror', (e) => console.log('   [erreur page bureau]', e.message));
const openOffice = async () => {
  await op.goto(`http://localhost:${PORT}/admin`);
  await op.locator('.bt-pl-name', { hasText: 'Sam Test' }).first().waitFor({ timeout: 25000 });
  await op.waitForTimeout(1500);
};
const samRow = () => op.locator('tr', { has: op.locator('.bt-pl-name', { hasText: 'Sam Test' }) }).first();
const bubble = (title) => samRow().locator('.bt-pl-grab', { hasText: title }).first();
const toasts = async (pg = op) => (await pg.locator('[data-sonner-toast]').allInnerTexts().catch(() => [])).join(' | ').replace(/\s+/g, ' ');
const closeToasts = async (pg = op) => { await pg.evaluate(() => document.querySelectorAll('[data-sonner-toast]').forEach((t) => t.remove())).catch(() => {}); };
const openEditAndDelete = async (title) => {
  await bubble(title).click(); await op.waitForTimeout(500);
  const hint = (await op.locator('[role=dialog]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const n = log.length;
  await op.click('[data-testid=edit-delete]');
  await op.waitForTimeout(500);
  const toast = await toasts();
  await op.waitForSelector('[data-testid=undo-card]', { timeout: 3000 }).catch(() => {});
  await op.waitForTimeout(400);
  return { hint, since: n, toast };
};
const undo = async () => {
  const n = log.length;
  await op.click('[data-testid=action-undo]');
  await op.waitForSelector('[data-testid=action-undone]', { timeout: 6000 }).catch(() => {});
  await op.waitForTimeout(500);
  return n;
};
const writesSince = (n) => log.slice(n).filter((x) => x.m !== 'GET' && x.m !== 'HEAD' && x.m !== 'FN');
const scenario = (code, label) => { console.log(`\n═══ ${code} · ${label}`); };

// ═══ Vue d'ensemble (captures) : la semaine de Sam ═════════════════════════════
scenario('B0', 'la semaine de Sam : retirée (lun.), brouillon vide (mar.), sortie oubliée (mer.), brouillon avec heures (jeu.)');
freshDb();
D.planning = [plan('p-lun', 'w-depot', D_(19), '13:30', '17:00'), plan('p-mar', 'w-salle', D_(20), '08:00', '12:00'),
  plan('p-mer', 'w-atelier', TODAY, '08:00', '12:00'), plan('p-jeu', 'w-cuisine', D_(22), '08:00', '12:00')];
D.time_entries = [
  entry({ id: 'e-lun', worksite_id: 'w-depot', planning_id: 'p-lun', work_date: D_(19), start_time: '13:30', end_time: '17:00', status: 'cancelled', submitted_at: '2026-10-19T17:05:00Z' }),
  entry({ id: 'e-mar', worksite_id: 'w-salle', planning_id: 'p-mar', work_date: D_(20), start_time: '08:00', end_time: '08:00' }),
  entry({ id: 'e-mer', worksite_id: 'w-atelier', planning_id: 'p-mer', start_time: '07:58', end_time: '07:58', exit_forgotten: true, source: 'qr' }),
  entry({ id: 'e-jeu', worksite_id: 'w-cuisine', planning_id: 'p-jeu', work_date: D_(22), start_time: '08:00', end_time: '12:00' }),
];
await openOffice();
{
  const rowTxt = (await samRow().innerText()).replace(/\s+/g, ' ');
  await samRow().screenshot({ path: shot('planning-semaine') });
  check(!/08:00–08:00 · 0h00 · à envoyer/.test(rowTxt), `B1 plus de « 08:00–08:00 · 0h00 · à envoyer » sur la bulle du brouillon vide (${rowTxt.slice(0, 160)})`);
  check(await samRow().locator('[data-withdrawn="1"]').count() === 1, 'B3 la bulle retirée par le salarié est éteinte (data-withdrawn)');
  const wd = samRow().locator('[data-withdrawn="1"]').first();
  check(/retirée par le salarié/.test(await wd.innerText().catch(() => '')) && (await wd.locator('[data-testid=bubble-title]').evaluate((e) => getComputedStyle(e).textDecorationLine).catch(() => '')) === 'line-through',
    'B3 … titre barré, « retirée par le salarié »');
  check(/07:58–07:58 · 0h00 · à envoyer/.test(rowTxt), 'B4 la sortie oubliée à compléter reste affichée (à envoyer)');
  check(/08:00–12:00 · 4h00 · à envoyer/.test(rowTxt), 'B2 le brouillon avec des heures reste affiché');
  // Mode « Sélectionner » : ce qui se coche, ce qui reste 🔒 (et pourquoi).
  await op.click('[data-testid=bar-select]'); await op.waitForTimeout(400);
  const selOf = async (pid) => ({ sel: await op.locator(`[data-pid="${pid}"]`).first().getAttribute('data-sel').catch(() => null), why: await op.locator(`[data-pid="${pid}"] .bt-pl-grab`).first().getAttribute('title').catch(() => null) });
  const s = { lun: await selOf('p-lun'), mar: await selOf('p-mar'), mer: await selOf('p-mer'), jeu: await selOf('p-jeu') };
  console.log('   sélection :', JSON.stringify(s));
  check(s.mar.sel === 'off', 'B1 « Sélectionner » : l’intervention au brouillon vide se coche');
  check(s.lun.sel === 'off', 'B3 « Sélectionner » : l’intervention retirée par le salarié se coche');
  check(s.mer.sel === 'lock' && s.mer.why === 'Sortie oubliée à compléter — non supprimable', `B4 sortie oubliée : 🔒 « ${s.mer.why} »`);
  check(s.jeu.sel === 'lock' && s.jeu.why === 'Heures notées par le salarié — non supprimable', `B2 brouillon avec heures : 🔒 « ${s.jeu.why} »`);
  await samRow().screenshot({ path: shot('planning-selection') });
  await op.keyboard.press('Escape'); await op.waitForTimeout(300);
}

// ═══ B1 · intervention + brouillon vide lié ═════════════════════════════════════
scenario('B1', 'intervention P + brouillon vide 08:00–08:00 lié : Supprimer puis Annuler');
freshDb();
D.planning = [plan('p1', 'w-salle', TODAY, '08:00', '12:00')];
D.time_entries = [entry({ id: 'e1', planning_id: 'p1', start_time: '08:00', end_time: '08:00' })];
const e1Before = JSON.parse(JSON.stringify(D.time_entries[0]));
await openOffice();
{
  const { hint, since } = await openEditAndDelete('Salle');
  const w = writesSince(since);
  console.log('   écritures :', wsum(w));
  check(/Brouillon vide du salarié/.test(hint), 'B1 la fenêtre dit que le brouillon vide part avec l’intervention');
  const iDelE = w.findIndex((x) => x.m === 'DELETE' && x.t === 'time_entries' && x.ids?.join() === 'e1');
  const iDelP = w.findIndex((x) => x.m === 'DELETE' && x.t === 'planning' && x.ids?.join() === 'p1');
  check(iDelE >= 0 && iDelP > iDelE && w.every((x) => x.status < 300), 'B1 « Supprimer » : DELETE du brouillon, PUIS DELETE de l’intervention, aucune erreur');
  const dq = w[iDelE]?.q || '';
  check(/status=eq\.draft/.test(dq) && /locked=eq\.false/.test(dq) && /submitted_at=is\.null/.test(dq) && /start_time=eq\.08%3A00%3A00|start_time=eq\.08:00:00/.test(dq), `B1 le brouillon n’est effacé que s’il est ENCORE vide et jamais envoyé (${decodeURIComponent(dq).slice(0, 160)})`);
  check(D.planning.length === 0 && D.time_entries.length === 0, 'B1 base : intervention et brouillon partis');
  const card = (await op.locator('[data-testid=undo-card]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/1 intervention supprimée/.test(card), `B1 carte « ${card.trim().slice(0, 80)} »`);
  await op.screenshot({ path: shot('b1-supprimer') });
  if (!AVANT || card) {
    const n = await undo();
    const u = writesSince(n);
    console.log('   annuler :', wsum(u));
    const iP = u.findIndex((x) => x.m === 'POST' && x.t === 'planning');
    const iE = u.findIndex((x) => x.m === 'POST' && x.t === 'time_entries');
    check(iP >= 0 && iE > iP && u.every((x) => x.status < 300), 'B1 « Annuler » : l’intervention PUIS le brouillon (ordre de la clé étrangère), sans erreur');
    const sentBody = [].concat(u[iE]?.body || [])[0] || {};
    check(!('total_minutes' in sentBody) && sentBody.id === 'e1', 'B1 le brouillon revient avec son identifiant, sans total_minutes');
    const back = D.time_entries.find((x) => x.id === 'e1');
    check(D.planning.some((p) => p.id === 'p1') && back && back.planning_id === 'p1' && back.start_time === e1Before.start_time && back.status === 'draft', 'B1 base : tout est revenu à l’identique');
  }
}

// ═══ B2 · brouillon avec heures, ligne envoyée ══════════════════════════════════
scenario('B2', 'brouillon avec des heures, ou ligne envoyée : rien ne s’efface');
freshDb();
D.planning = [plan('p2', 'w-salle', TODAY, '08:00', '12:00'), plan('p3', 'w-depot', TODAY, '13:30', '17:00')];
D.time_entries = [
  entry({ id: 'e2', planning_id: 'p2', start_time: '08:00', end_time: '12:00' }),
  entry({ id: 'e3', worksite_id: 'w-depot', planning_id: 'p3', start_time: '13:30', end_time: '17:00', status: 'submitted', submitted_at: `${TODAY}T17:05:00Z` }),
];
await openOffice();
{
  const { since, toast: t1 } = await openEditAndDelete('Salle');
  await op.keyboard.press('Escape'); await op.waitForTimeout(300); await closeToasts();
  const { since: s2, toast: t2 } = await openEditAndDelete('Dépôt');
  await op.keyboard.press('Escape'); await op.waitForTimeout(300); await closeToasts();
  check(writesSince(since).length === 0 && writesSince(s2).length === 0, `B2 zéro écriture (${wsum(writesSince(since))})`);
  check(/Heures notées par le salarié/.test(t1) && /Heures envoyées/.test(t2), `B2 la raison est dite (« ${t1.slice(0, 60)} » / « ${t2.slice(0, 60)} »)`);
}

// ═══ B3 · intervention retirée par le salarié ═══════════════════════════════════
scenario('B3', 'intervention retirée par le salarié : détachée, effacée, puis rattachée');
freshDb();
D.planning = [plan('p4', 'w-depot', TODAY, '13:30', '17:00')];
D.time_entries = [entry({ id: 'e4', worksite_id: 'w-depot', planning_id: 'p4', start_time: '13:30', end_time: '17:00', status: 'cancelled', submitted_at: `${TODAY}T09:00:00Z`, break_minutes: 0 })];
const e4Before = JSON.parse(JSON.stringify(D.time_entries[0]));
await openOffice();
{
  await bubble('Dépôt').click(); await op.waitForTimeout(500);
  await op.locator('[role=dialog]').screenshot({ path: shot('b3-fenetre-retiree'), timeout: 5000 }).catch(() => {});
  await op.keyboard.press('Escape'); await op.waitForTimeout(300);
  const { hint, since } = await openEditAndDelete('Dépôt');
  const w = writesSince(since);
  console.log('   écritures :', wsum(w));
  await op.screenshot({ path: shot('b3-supprimer') });
  check(/Retirée par le salarié : ses heures retirées restent/.test(hint), 'B3 la fenêtre dit que les heures retirées restent');
  const iPatch = w.findIndex((x) => x.m === 'PATCH' && x.t === 'time_entries' && x.body && x.body.planning_id === null && x.ids?.join() === 'e4');
  const iDelP = w.findIndex((x) => x.m === 'DELETE' && x.t === 'planning' && x.ids?.join() === 'p4');
  check(iPatch >= 0 && iDelP > iPatch && /status=eq\.cancelled/.test(w[iPatch].q), 'B3 « Supprimer » : PATCH planning_id → null sur la ligne retirée (status=cancelled), PUIS DELETE');
  check(!w.some((x) => x.m === 'DELETE' && x.t === 'time_entries'), 'B3 la ligne retirée n’est jamais effacée');
  const e4 = D.time_entries.find((x) => x.id === 'e4');
  check(!D.planning.length && e4 && e4.planning_id === null && e4.status === 'cancelled' && e4.start_time === e4Before.start_time && e4.end_time === e4Before.end_time && e4.total_minutes === e4Before.total_minutes,
    'B3 base : intervention partie, ligne retirée intacte (mêmes heures), seulement détachée');
  if (!AVANT) {
    const n = await undo();
    const u = writesSince(n);
    console.log('   annuler :', wsum(u));
    const iP = u.findIndex((x) => x.m === 'POST' && x.t === 'planning');
    const iL = u.findIndex((x) => x.m === 'PATCH' && x.t === 'time_entries' && x.body?.planning_id === 'p4');
    check(iP >= 0 && iL > iP && u.every((x) => x.status < 300), 'B3 « Annuler » : l’intervention PUIS le lien de la ligne retirée');
    check(D.time_entries.find((x) => x.id === 'e4')?.planning_id === 'p4' && D.planning.length === 1, 'B3 base : ligne retirée rattachée de nouveau');
  }
}

// ═══ B4 · sortie oubliée à compléter ════════════════════════════════════════════
scenario('B4', 'sortie oubliée à compléter (début = fin, drapeau du lot 12) : gardée');
freshDb();
D.planning = [plan('p5', 'w-atelier', TODAY, '08:00', '12:00')];
D.time_entries = [entry({ id: 'e5', worksite_id: 'w-atelier', planning_id: 'p5', start_time: '07:58', end_time: '07:58', exit_forgotten: true, source: 'qr' })];
await openOffice();
{
  const { since, toast: t } = await openEditAndDelete('Atelier');
  await op.keyboard.press('Escape'); await op.waitForTimeout(300); await closeToasts();
  check(writesSince(since).length === 0 && D.time_entries.length === 1 && D.planning.length === 1, `B4 zéro écriture (${wsum(writesSince(since))})`);
  check(/Sortie oubliée à compléter/.test(t), `B4 refus « ${t.slice(0, 80)} »`);
}

// ═══ B5 · brouillons « en vrac » (sans planning_id) dans la case ════════════════
scenario('B5', 'brouillon vide en vrac : part avec la case ; brouillon en vrac avec des heures : bloque');
freshDb();
D.planning = [plan('p6', 'w-salle', TODAY, '08:00', '12:00')];
D.time_entries = [entry({ id: 'e6', planning_id: null, start_time: '10:00', end_time: '10:00' })];
await openOffice();
{
  const { since } = await openEditAndDelete('Salle');
  const w = writesSince(since);
  console.log('   écritures :', wsum(w));
  const iE = w.findIndex((x) => x.m === 'DELETE' && x.t === 'time_entries' && x.ids?.join() === 'e6');
  const iP = w.findIndex((x) => x.m === 'DELETE' && x.t === 'planning' && x.ids?.join() === 'p6');
  check(iE >= 0 && iP > iE && !D.planning.length && !D.time_entries.length, 'B5 le brouillon vide en vrac part avec la case');
  await op.locator('[data-testid=undo-close]').click({ timeout: 3000 }).catch(() => {});
}
freshDb();
D.planning = [plan('p7', 'w-salle', TODAY, '08:00', '12:00')];
D.time_entries = [entry({ id: 'e7', planning_id: null, start_time: '13:00', end_time: '15:00' })];
await openOffice();
{
  const { since, toast: t } = await openEditAndDelete('Salle');
  await op.keyboard.press('Escape'); await op.waitForTimeout(300); await closeToasts();
  check(writesSince(since).length === 0 && D.planning.length === 1 && D.time_entries.length === 1 && /Heures notées par le salarié/.test(t), `B5 brouillon en vrac avec des heures : rien d’effacé, raison dite (${t.slice(0, 60)})`);
}

// ═══ B9 · fiche du salarié : « brouillon vide » + « Supprimer » ══════════════════
scenario('B9', 'bureau, fiche de Sam : supprimer un brouillon vide, puis Annuler');
freshDb();
D.time_entries = [entry({ id: 'e10', worksite_id: 'w-salle', planning_id: null, start_time: '09:00', end_time: '09:00' }),
  entry({ id: 'e11', worksite_id: 'w-depot', planning_id: null, start_time: '13:00', end_time: '16:00', status: 'submitted', submitted_at: `${TODAY}T16:05:00Z` })];
const e10Before = JSON.parse(JSON.stringify(D.time_entries[0]));
await openOffice();
{
  await op.locator('button:visible', { hasText: 'Sam Test' }).first().click();
  await op.getByRole('button', { name: /Feuille d.heures/ }).click();
  const dlg = op.locator('[role=dialog]').filter({ has: op.locator('h2', { hasText: 'Sam Test' }) });
  await dlg.waitFor({ timeout: 10000 });
  await op.waitForTimeout(1500);
  await dlg.screenshot({ path: shot('b9-fiche-salarie') });
  const badge = await dlg.locator('[data-testid=badge-empty-draft]').count();
  const link = await dlg.locator('[data-testid=delete-empty-draft]').count();
  check(badge === 1 && link === 1, `B9 « brouillon vide » + « Supprimer » sur la seule ligne vide (${badge}/${link})`);
  if (link) {
    const n = log.length;
    await dlg.locator('[data-testid=delete-empty-draft]').click();
    await op.waitForSelector('[data-testid=action-done]', { timeout: 5000 }).catch(() => {});
    await op.waitForTimeout(800);
    const w = writesSince(n);
    console.log('   écritures :', wsum(w));
    check(w.length === 1 && w[0].m === 'DELETE' && w[0].t === 'time_entries' && w[0].ids?.join() === 'e10' && /submitted_at=is\.null/.test(w[0].q), 'B9 « Supprimer » : un seul DELETE, sur le brouillon vide jamais envoyé');
    check(!D.time_entries.some((x) => x.id === 'e10') && D.time_entries.some((x) => x.id === 'e11'), 'B9 base : le brouillon est parti, la ligne envoyée reste');
    await dlg.screenshot({ path: shot('b9-fiche-supprime-annuler') });
    const n2 = log.length;
    await dlg.locator('[data-testid=action-undo]').click();
    await op.waitForSelector('[data-testid=action-undone]', { timeout: 5000 }).catch(() => {});
    await op.waitForTimeout(800);
    const u = writesSince(n2);
    console.log('   annuler :', wsum(u));
    const body = [].concat(u.find((x) => x.m === 'POST' && x.t === 'time_entries')?.body || [])[0] || {};
    check(u.length === 1 && u[0].status < 300 && body.id === 'e10' && !('total_minutes' in body), 'B9 « Annuler » : le brouillon revient (même id), sans total_minutes');
    const back = D.time_entries.find((x) => x.id === 'e10');
    check(back && back.start_time === e10Before.start_time && back.status === 'draft' && back.worksite_id === 'w-salle', 'B9 base : brouillon remis à l’identique');
    check(await dlg.locator('[data-testid=badge-empty-draft]').count() === 1, 'B9 la fiche le montre de nouveau');
  }
  await op.keyboard.press('Escape'); await op.waitForTimeout(300);
}

// ═══ B10 · Assistant « Efface le planning d'aujourd'hui » ═══════════════════════
scenario('B10', 'Assistant effacer_planning sur B1 + B3 (+ B4) : mêmes résultats');
freshDb();
D.planning = [plan('p1', 'w-salle', TODAY, '08:00', '12:00'), plan('p4', 'w-depot', TODAY, '13:30', '17:00'), plan('p5', 'w-atelier', TODAY, '17:30', '19:00')];
D.time_entries = [
  entry({ id: 'e1', planning_id: 'p1', start_time: '08:00', end_time: '08:00' }),
  entry({ id: 'e4', worksite_id: 'w-depot', planning_id: 'p4', start_time: '13:30', end_time: '17:00', status: 'cancelled', submitted_at: `${TODAY}T09:00:00Z` }),
  entry({ id: 'e5', worksite_id: 'w-atelier', planning_id: 'p5', start_time: '17:31', end_time: '17:31', exit_forgotten: true, source: 'qr' }),
];
assistantReply = { answer: '', links: [], remaining: 40,
  action: { draft: { type: 'effacer_planning', user_id: null, salarie_texte: '', du: TODAY, au: TODAY }, problems: [], summary: `Toute l’équipe · le ${TODAY}`, question: null },
  options: { salaries: [{ id: ME, nom: 'Sam Test' }], chantiers: Object.values(WS).map((w) => ({ id: w.id, nom: w.client_name, ville: w.city })) } };
await openOffice();
{
  await op.click('[data-testid="bar-assistant"]'); await op.waitForTimeout(500);
  await op.fill('.as-bar textarea', 'Efface le planning d’aujourd’hui');
  const n = log.length;
  await op.click('button[aria-label="Envoyer"]');
  await op.waitForSelector('[data-testid=action-done], [data-testid=action-error]', { timeout: 10000 }).catch(() => {});
  await op.waitForTimeout(800);
  const card = (await op.locator('[data-testid=assistant-panel]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const w = writesSince(n).filter((x) => x.t !== 'assistant_journal');
  console.log('   écritures :', wsum(w));
  await op.locator('[data-testid=assistant-panel]').screenshot({ path: shot('b10-assistant'), timeout: 5000 }).catch(() => {});
  check(/2 cases effacées/.test(card) && /1 gardée \(sortie oubliée à compléter\)/.test(card), `B10 carte : ${card.match(/Fait[^A]*/)?.[0]?.slice(0, 120) || card.slice(-160)}`);
  const e4 = D.time_entries.find((x) => x.id === 'e4');
  check(D.planning.map((p) => p.id).join() === 'p5' && !D.time_entries.some((x) => x.id === 'e1') && e4?.planning_id === null && e4?.end_time === '17:00:00' && D.time_entries.some((x) => x.id === 'e5'),
    'B10 base : p1 + son brouillon vide partis, p4 effacée et sa ligne retirée détachée (heures intactes), p5 gardée');
  if (!AVANT) {
    const n2 = log.length;
    await op.click('[data-testid=action-undo]');
    await op.waitForSelector('[data-testid=action-undone]', { timeout: 8000 }).catch(() => {});
    await op.waitForTimeout(600);
    const u = writesSince(n2).filter((x) => x.t !== 'assistant_journal');
    console.log('   annuler :', wsum(u));
    check(u.every((x) => x.status < 300) && D.planning.length === 3 && D.time_entries.find((x) => x.id === 'e1')?.planning_id === 'p1' && D.time_entries.find((x) => x.id === 'e4')?.planning_id === 'p4',
      'B10 « Annuler » : interventions, brouillon vide et lien remis');
  }
}
await office.close();

// ═══ Côté salarié (téléphone) ═══════════════════════════════════════════════════
const worker = await newCtx(ME, 'sam@exemple.fr', { width: 390, height: 844 });
const wp = await worker.newPage();
wp.on('pageerror', (e) => console.log('   [erreur page salarié]', e.message));
const openWorker = async (pg = wp) => { await pg.goto(`http://localhost:${PORT}/poseur`); await pg.waitForSelector('.bt-total', { timeout: 20000 }); await pg.waitForTimeout(1200); };
const setWheel = async (hhmm) => {
  const [h, mm] = hhmm.split(':');
  const cols = wp.locator('.bt-molette .overflow-y-scroll');
  await cols.nth(0).evaluate((el, i) => { el.scrollTop = (3 * 24 + i) * 40; }, Number(h));
  await wp.waitForTimeout(350);
  await cols.nth(1).evaluate((el, i) => { el.scrollTop = (10 * 4 + i) * 40; }, ['00', '15', '30', '45'].indexOf(mm));
  await wp.waitForTimeout(350);
};

// ═══ B6 · début = fin refusé ════════════════════════════════════════════════════
scenario('B6', 'salarié : « + », début 08:00 et fin 08:00, OK');
freshDb();
await openWorker();
{
  await wp.locator('.bt-fab').click();
  await wp.waitForSelector('.bt-ed');
  await wp.locator('.bt-site', { hasText: 'Salle' }).first().click(); await wp.waitForTimeout(250);
  await wp.locator('.bt-timecard').nth(0).click(); await wp.waitForTimeout(400); await setWheel('08:00');
  await wp.locator('.bt-segb').nth(1).click().catch(async () => { await wp.locator('.bt-timecard').nth(1).click(); }); await wp.waitForTimeout(400); await setWheel('08:00');
  await wp.locator('button:has-text("Valider les heures")').click(); await wp.waitForTimeout(300);
  const cards = (await wp.locator('.bt-timecard').allInnerTexts()).join(' ').replace(/\s+/g, ' ');
  const n = log.length;
  await wp.locator('.bt-save', { hasText: 'OK' }).click(); await wp.waitForTimeout(1300);
  const t = await toasts(wp);
  console.log(`   cartes : ${cards} · toasts : ${t}`);
  await wp.screenshot({ path: shot('b6-debut-egal-fin') });
  check(!writesSince(n).some((x) => x.t === 'time_entries') && D.time_entries.length === 0, `B6 aucun envoi (${wsum(writesSince(n))})`);
  check(/Le début et la fin sont identiques/.test(t), 'B6 « Le début et la fin sont identiques. »');
}

// ═══ B6b · « Retirer » un brouillon vide déjà là ════════════════════════════════
scenario('B6b', 'salarié : un brouillon vide (créé avant le lot 2), poubelle → la question le dit');
freshDb();
D.time_entries = [entry({ id: 'e12', start_time: '08:00', end_time: '08:00' })];
await openWorker();
{
  await wp.locator('[data-testid=card-entry]').first().click(); await wp.waitForTimeout(500);
  await wp.waitForSelector('.bt-ed', { timeout: 5000 }).catch(() => {});
  await wp.locator('.bt-ed-trash').click(); await wp.waitForTimeout(400);
  const q = (await wp.locator('[role=dialog]').last().innerText().catch(() => '')).replace(/\s+/g, ' ');
  await wp.screenshot({ path: shot('b6b-retirer-brouillon-vide') });
  check(/Brouillon vide : il sera supprimé\./.test(q), `B6b la question dit « Brouillon vide : il sera supprimé. » (${q.slice(0, 90)})`);
  const n = log.length;
  await wp.locator('[role=dialog] button', { hasText: 'Oui, retirer' }).click(); await wp.waitForTimeout(1200);
  const w = writesSince(n);
  check(w.length === 1 && w[0].m === 'DELETE' && w[0].ids?.join() === 'e12' && !D.time_entries.length, `B6b « Oui, retirer » : le brouillon vide est supprimé (${wsum(w)})`);
}

// ═══ B7 · « Copier la journée d'hier » ══════════════════════════════════════════
scenario('B7', '« Copier la journée d’hier » : sortie oubliée à compléter + 08:00–12:00');
freshDb();
D.time_entries = [
  entry({ id: 'y1', work_date: YESTERDAY, start_time: '07:45', end_time: '07:45', exit_forgotten: true, source: 'qr', worksite_id: 'w-depot' }),
  entry({ id: 'y2', work_date: YESTERDAY, start_time: '08:00', end_time: '12:00', status: 'submitted', submitted_at: `${YESTERDAY}T12:05:00Z` }),
];
await openWorker();
{
  const n = log.length;
  const btn = wp.locator('button', { hasText: 'Copier la journée d' });
  if (await btn.count()) { await btn.first().click(); await wp.waitForTimeout(1500); }
  const posts = writesSince(n).filter((x) => x.m === 'POST' && x.t === 'time_entries');
  const rows = posts.flatMap((x) => [].concat(x.body || []));
  console.log(`   POST : ${posts.length} · lignes : ${rows.map((r) => `${r.start_time}–${r.end_time}`).join(', ')}`);
  await wp.screenshot({ path: shot('b7-copier-hier') });
  check(posts.length === 1 && rows.length === 1 && rows[0].start_time.startsWith('08:00') && rows[0].end_time.startsWith('12:00'), 'B7 une seule ligne copiée (08:00–12:00), pas la sortie oubliée');
  check(D.time_entries.filter((x) => x.work_date === TODAY).length === 1 && !D.time_entries.some((x) => x.work_date === TODAY && x.start_time === x.end_time), 'B7 base : aucun brouillon vide créé aujourd’hui');
}
await worker.close();

// ═══ B8 · file hors ligne vers une intervention supprimée ═══════════════════════
scenario('B8', 'saisie faite hors ligne sur une intervention supprimée depuis par le bureau');
freshDb();
const PENDING = [{ localId: 'local_b8', company_id: CO, user_id: ME, worksite_id: 'w-salle', planning_id: 'p-supprimee', work_date: TODAY,
  start_time: '08:00', end_time: '12:00', break_minutes: 0, total_minutes: 240, meal_allowance: false, observation: null, reception: null,
  _worksite_name: 'Salle', _worksite_city: 'Lyon', _saved_at: NOW.getTime() - 3600e3 }];
const offline = await newCtx(ME, 'sam@exemple.fr', { width: 390, height: 844 }, {
  fn: ([k, v]) => { if (!sessionStorage.getItem('b8-seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('b8-seeded', '1'); } },
  arg: [`battime_offline_${ME}`, JSON.stringify(PENDING)],
});
{
  const pg = await offline.newPage();
  pg.on('pageerror', (e) => console.log('   [erreur page salarié]', e.message));
  const n = log.length;
  await openWorker(pg);
  await pg.waitForTimeout(2500);
  const posts = writesSince(n).filter((x) => x.m === 'POST' && x.t === 'time_entries');
  console.log('   POST :', posts.map((x) => `planning_id=${[].concat(x.body)[0]?.planning_id} →${x.code || x.status}`).join(' | '));
  const queue = await pg.evaluate((k) => localStorage.getItem(k), `battime_offline_${ME}`);
  await pg.screenshot({ path: shot('b8-file-hors-ligne') });
  check(posts.length === 2 && posts[0].code === '23503' && [].concat(posts[1].body)[0]?.planning_id === null && posts[1].status === 201, 'B8 refus 23503, puis renvoi UNE fois sans le lien : accepté');
  check(!queue || JSON.parse(queue).length === 0, `B8 la file du téléphone est vide (${queue})`);
  const line = D.time_entries.find((x) => x.client_id === 'local_b8');
  check(line && line.planning_id === null && line.start_time === '08:00:00' && line.end_time === '12:00:00', 'B8 base : la ligne est arrivée, heures intactes, sans lien');
}
await offline.close();

console.log(`\n${AVANT ? `AVANT (#144) — captures seulement, ${notes.length} constats` : `${ok} ✅ / ${ko} ❌`}`);
if (fails.length) console.log(fails.map((f) => ` - ${f}`).join('\n'));
await b.close(); srv.close();
process.exit(!AVANT && ko ? 1 : 0);
