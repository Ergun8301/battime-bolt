// Lot 3 bis (2) — PANIER : réglage « Utiliser le panier repas » (oui par défaut).
// Décocher MASQUE, rien d'autre : la case du salarié disparaît et l'écran n'écrit
// plus le panier ; le bureau garde la case sur une ligne qui en a encore un ; les
// exports gardent la colonne si la période en contient un. Avant la migration
// (colonne absente → 42703), tout est exactement comme avant et la ligne de
// réglage n'apparaît pas.
//
// Sur les VRAIES pages (/admin et /poseur, export statique), UNE base simulée
// partagée par les navigateurs (aucune vraie base, aucun e-mail).
//
// Lancer : npm run build, puis
//   node scripts/tests/panier-lot3bis.mjs out docs/captures-lot3bis [port]
// Captures « avant » (build de 5657373, captures seulement, aucune vérification) :
//   AVANT=1 node scripts/tests/panier-lot3bis.mjs <out-avant> docs/captures-lot3bis [port]
//
// État de la base simulée (variable MEAL) :
//   'absent'  migration 20261010120000 pas appliquée : tout select qui demande
//             meal_enabled → 400 42703 ; set_meal_enabled → 404 PGRST202.
//   true      colonne présente, « oui » (défaut après migration).
//   false     colonne présente, « non ».
// Plus les règles du lot 11 sur la nouvelle ligne de réglage (ⓘ à côté du libellé,
// lignes ≤ 90 caractères, feuille de style figée, aucun défilement horizontal).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const XLSX = createRequire(import.meta.url)('xlsx');

const [,, OUT = 'out', SH = 'docs/captures-lot3bis', PORT = '5251'] = process.argv;
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
const yesterday = (() => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); })();
const MEAL_OFF_MESSAGE = 'Votre entreprise n’utilise pas le panier repas : rien à cocher.';

// ─── Base simulée ─────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000cc';
const ME = 'u-sam'; const ADMIN = 'u-admin';
const SALLE = { id: 'w-salle', company_id: CO, client_name: 'Salle', city: 'Lyon', is_active: true, address: null, latitude: null, longitude: null };
const ATELIER = { id: 'w-atelier', company_id: CO, client_name: 'Atelier', city: 'Lyon', is_active: true, address: null, latitude: null, longitude: null };
const DEPOT = { id: 'w-depot', company_id: CO, client_name: 'Dépôt', city: 'Lyon', is_active: true, address: null, latitude: null, longitude: null };
const USERS = [
  { id: ADMIN, company_id: CO, first_name: 'Alex', last_name: 'Martin', role: 'admin', email: 'alex@exemple.fr', is_active: true, created_at: '2026-01-01' },
  { id: ME, company_id: CO, first_name: 'Sam', last_name: 'Test', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' },
];
const COMPANY = {
  id: CO, name: 'Entreprise Test', siret: '', tva_intra: '', address: '', postal_code: '', city: 'Lyon', phone: '', email: '', logo_url: '',
  subscription_status: 'active', trial_ends_at: '2030-01-01', auto_reminder_enabled: true, reminder_hour: 17, budget_alerts_enabled: true,
  travel_paid: false, weekly_hours: 35, accountant_email: null, overtime_rate_1: 25, overtime_rate_2: 50,
  ai_enabled: false, kiosk_enabled: false, support_enabled: false, position_tracking_enabled: false, colleagues_planning_visible: true,
};
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const hh = (t) => String(t || '').slice(0, 5);
const generated = (r) => { let d = toMin(r.end_time) - toMin(r.start_time); if (d < 0) d += 1440; return d - (Number(r.break_minutes) || 0); };
let seq = 0;
const D = {};
let MEAL = true;
let failMeal = false;     // set_meal_enabled répond 400 (B4)
let mealNetFail = false;  // la lecture de meal_enabled échoue (réseau coupé)
let groupedBroken = false; // lot 29 : la lecture GROUPÉE des réglages échoue en 42703 (une autre colonne manque) → repli par groupes
let assistantReply = null;
const freshDb = (meal = MEAL) => {
  MEAL = meal;
  for (const k of Object.keys(D)) delete D[k];
  const co = { ...COMPANY };
  if (meal !== 'absent') co.meal_enabled = meal;
  Object.assign(D, {
    users: USERS.map((x) => ({ ...x })), companies: [co], worksites: [SALLE, ATELIER, DEPOT].map((x) => ({ ...x })),
    planning: [], time_entries: [], active_sessions: [], time_entry_corrections: [], time_entry_edits: [],
    user_payroll: [{ user_id: ME, company_id: CO, payroll_id: '00001', weekly_hours: null }],
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
  return [...rows].sort((a, z) => { for (const { k, desc } of keys) { const x = String(a[k] ?? ''); const y = String(z[k] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};

// office_correct_entry, réduite à ce que ce test touche (panier) — les vraies règles
// sont prouvées par supabase/tests/lot2_corrections_bureau.mjs.
const officeCorrect = (uid, { p_entry_id, p_changes: ch, p_reason }) => {
  const e = D.time_entries.find((x) => x.id === p_entry_id);
  const old = { meal_allowance: !!e.meal_allowance, break_minutes: e.break_minutes };
  Object.assign(e, ch, { modified_at: NOW.toISOString(), modified_by: uid });
  e.total_minutes = generated(e);
  const x = { id: `x-${D.time_entry_edits.length + 1}`, company_id: CO, entry_id: e.id, worker_id: e.user_id, work_date: e.work_date, kind: 'correction',
    reason: p_reason, edited_by: uid, edited_at: NOW.toISOString(), old_values: old, new_values: { ...old, ...ch }, correction_id: null,
    was_exported: false, notified_at: null, notify_error: null };
  D.time_entry_edits.push(x);
  return [x];
};

// ─── Réseau simulé ────────────────────────────────────────────────────────────
const writes = []; // toutes les écritures (REST hors GET, RPC, fonctions)
const mealReads = []; // chaque lecture qui demande meal_enabled : statut rendu
const pageErrors = [];
const sessionFor = (uid, email) => {
  const now = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: uid, email, aud: 'authenticated', role: 'authenticated' } };
};
const newCtx = async (uid, email, viewport) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true, ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const session = sessionFor(uid, email);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.clock.setFixedTime(NOW);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const m = req.method();
    let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) {
      const fn = url.pathname.replace('/functions/v1/', '');
      writes.push({ m: 'FN', t: fn, body, by: uid });
      if (fn === 'send-push') return r.fulfill({ json: { mode: 'admin', sent: 1, failed: 0, purged: 0 } });
      if (fn === 'worker-assistant' && assistantReply) return r.fulfill({ json: assistantReply });
      return r.fulfill({ json: {} });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.replace('/rest/v1/rpc/', '');
      writes.push({ m: 'RPC', t: fn, body, by: uid });
      if (fn === 'set_meal_enabled') {
        if (MEAL === 'absent') return r.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.set_meal_enabled(p_enabled) in the schema cache', details: null, hint: null } });
        if (failMeal) return r.fulfill({ status: 400, json: { code: 'XX000', message: 'panne simulée', details: null, hint: null } });
        if (uid !== ADMIN) return r.fulfill({ status: 403, json: { code: '42501', message: 'Réservé au bureau.', details: null, hint: null } });
        D.companies[0].meal_enabled = body?.p_enabled ?? true; MEAL = D.companies[0].meal_enabled;
        return r.fulfill({ json: MEAL });
      }
      if (fn === 'update_company_info') return r.fulfill({ json: null });
      if (fn === 'office_correct_entry') return r.fulfill({ json: officeCorrect(uid, body) });
      if (fn === 'office_edit_mark_notified') return r.fulfill({ json: 1 });
      if (fn === 'company_has_kiosk') return r.fulfill({ json: false });
      return r.fulfill({ json: [] });
    }
    const t = url.pathname.replace('/rest/v1/', '');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200) => {
      if (single) return rows.length ? r.fulfill({ status, json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none', details: null, hint: null } });
      return r.fulfill({ status, json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
    };
    if (m === 'GET' || m === 'HEAD') {
      // Comme PostgREST : une colonne inconnue fait échouer la requête (et seulement elle).
      if (t === 'companies' && /meal_enabled/.test(url.searchParams.get('select') || '')) {
        if (groupedBroken && (url.searchParams.get('select') || '').includes(',')) { mealReads.push(400); return r.fulfill({ status: 400, json: { code: '42703', message: 'column companies.position_tracking_enabled does not exist', details: null, hint: null } }); }
        if (mealNetFail) { mealReads.push('réseau'); return r.abort('failed'); }
        if (MEAL === 'absent') { mealReads.push(400); return r.fulfill({ status: 400, json: { code: '42703', message: 'column companies.meal_enabled does not exist', details: null, hint: null } }); }
        mealReads.push(200);
      }
      let rows = sortRows(filterRows(D[t] || [], url.searchParams), url.searchParams.get('order'));
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      return reply(rows);
    }
    writes.push({ m, t, q: url.search, body, by: uid });
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
    if (m === 'DELETE') { D[t] = (D[t] || []).filter((x) => !hit.includes(x)); return reply(hit); }
    return reply([]);
  });
  return ctx;
};

// ─── Outils ───────────────────────────────────────────────────────────────────
let ok = 0, ko = 0; const fails = [];
const check = (c, m) => { if (AVANT) return; if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };
const shotName = (name) => path.join(SH, `panier-${AVANT ? 'avant' : 'apres'}-${name}.png`);
const shot = async (loc, name) => { await loc.screenshot({ path: shotName(name) }).catch((e) => console.log('   (capture impossible :', e.message.split('\n')[0], ')')); };
const since = (n) => writes.slice(n);
const of = (list, m, t) => list.filter((w) => w.m === m && (t == null || w.t === t));
const mealWrites = (list) => list.filter((w) => w.t === 'time_entries' && w.m !== 'GET' && (Array.isArray(w.body) ? w.body : [w.body]).some((x) => x && typeof x === 'object' && 'meal_allowance' in x && (w.m === 'PATCH' || x.meal_allowance === true)));
const norm = (s) => (s || '').replace(/\s+/g, ' ').replace(/[’]/g, "'").trim();
const watch = (p, who) => { p.on('pageerror', (e) => { pageErrors.push(`${who} : ${e.message}`); console.log(`   [erreur page ${who}]`, e.message); }); return p; };
const download = async (pg, click) => {
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), click()]);
  const p = await dl.path();
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(p) };
};
const xlsxDetailHead = (buf) => { const wb = XLSX.read(buf, { type: 'buffer' }); return (XLSX.utils.sheet_to_json(wb.Sheets['Détail'], { header: 1 })[0] || []).map(String); };
const pdfText = (buf) => buf.toString('latin1');

// ── Réglages de l'entreprise (bureau) ──
const SET = '[role=dialog]:has(.bt-set)';
const POP = '[data-radix-popper-content-wrapper] [role=dialog]';
const secBtn = (p, key) => p.locator(`[data-testid=set-sec-${key}] > h3 > button`);
const openSec = async (p, key) => { if ((await secBtn(p, key).getAttribute('aria-expanded')) !== 'true') { await secBtn(p, key).click(); await p.waitForTimeout(200); } };
const openSettings = async (p) => {
  await p.goto(`http://localhost:${PORT}/admin`);
  const desk = p.locator('.bt-pl-acct:visible'); const mob = p.locator('.bt-pl-m-ibtn[aria-label="Menu"]:visible');
  await desk.or(mob).first().waitFor({ timeout: 25000 }); await p.waitForTimeout(800);
  if (await desk.count()) await desk.first().click(); else await mob.first().click();
  await p.locator('button:visible', { hasText: "Réglages de l'entreprise" }).first().click();
  await p.waitForSelector(`${SET} [data-testid=set-sec-paie]`, { timeout: 10000 });
  await p.waitForTimeout(900); // lectures séparées (panier, collègues…)
  await openSec(p, 'paie');
};
const paieLabels = (p) => p.locator(`${SET} [data-testid=set-sec-paie] label.bt-set-l`).allTextContents().then((l) => l.map(norm));
const paieHint = (p) => p.locator(`${SET} [data-testid=set-sec-paie] .bt-set-sec-hint`).innerText().then(norm);
const waitPop = async (p, want) => { for (let i = 0; i < 20; i++) { const open = (await p.locator(POP).count()) > 0 && await p.locator(POP).first().isVisible().catch(() => false); if (open === want) return true; await p.waitForTimeout(50); } return false; };
const popText = async (p) => norm(await p.locator(POP).first().textContent({ timeout: 1500 }).catch(() => ''));
const noHScroll = (p) => p.locator(SET).evaluate((d) => {
  const innerR = d.getBoundingClientRect().left + d.clientLeft + d.clientWidth;
  const clipped = (el) => { for (let a = el.parentElement; a && a !== d; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return true; return false; };
  const bad = [...d.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerR + 1 && !clipped(el); });
  return { ok: d.scrollWidth <= d.clientWidth + 1 && bad.length === 0 && document.documentElement.scrollWidth <= window.innerWidth + 1, sw: d.scrollWidth, cw: d.clientWidth, bad: bad.slice(0, 3).map((e) => e.className || e.tagName) };
});
/** Capture de la rubrique « Heures & paie », cadrée sur la ligne du comptable (présente avant ET après). */
const shotSettings = async (p, name) => {
  await p.locator(`${SET} .bt-set-sub:has(label.bt-set-l:text-is("Adresse de votre comptable"))`).scrollIntoViewIfNeeded();
  await p.mouse.move(2, 2); await p.waitForTimeout(400);
  await shot(p, name);
};
const saveSettings = async (p) => { await p.locator(`${SET} .bt-set-save`).click(); await p.waitForTimeout(1500); };
const P_KEYS = ['p_name', 'p_siret', 'p_tva_intra', 'p_address', 'p_postal_code', 'p_city', 'p_phone', 'p_email', 'p_logo_url', 'p_auto_reminder_enabled', 'p_reminder_hour',
  'p_budget_alerts_enabled', 'p_travel_paid', 'p_weekly_hours', 'p_accountant_email', 'p_overtime_rate_1', 'p_overtime_rate_2'];

// ── Fiche « Feuille d'heures » de Sam (bureau) ──
let dlg = null;
const openSheet = async (op) => {
  await op.goto(`http://localhost:${PORT}/admin`);
  await op.locator('button:visible', { hasText: 'Sam Test' }).first().waitFor({ timeout: 25000 });
  await op.waitForTimeout(800);
  await op.locator('button:visible', { hasText: 'Sam Test' }).first().click();
  await op.getByRole('button', { name: /Feuille d.heures/ }).click();
  dlg = op.locator('[role=dialog]').filter({ has: op.locator('h2', { hasText: 'Sam Test' }) });
  await dlg.waitFor();
  await op.waitForTimeout(1200);
};
const card = (txt) => dlg.locator('.divide-y > div').filter({ hasText: txt }).first();
const openPanel = async (op, c) => { await c.getByRole('button', { name: /Corriger les heures/ }).click(); await op.waitForTimeout(400); };
const sheetExport = async (op, kind) => { await dlg.locator('[data-testid=export-menu]').click(); return download(op, () => op.locator(`[data-testid=export-menu-${kind}]`).click()); };
const teamExport = async (op, kind) => {
  await op.goto(`http://localhost:${PORT}/admin`);
  await op.locator('button:visible', { hasText: 'Sam Test' }).first().waitFor({ timeout: 25000 });
  await op.waitForTimeout(800);
  await op.locator('.bt-pl-fill:visible', { hasText: 'Exporter' }).first().click();
  const item = op.getByRole('button', { name: /Exporter l.équipe/ });
  if (await item.count()) await item.first().click();
  const team = op.locator('[role=dialog]').filter({ has: op.locator('h2', { hasText: /Exporter l.équipe/ }) });
  await team.waitFor();
  await team.getByRole('button', { name: "Aujourd'hui", exact: true }).click();
  await team.locator('[data-testid=team-export-menu]').click();
  return download(op, () => op.locator(`[data-testid=team-export-menu-${kind}]`).click());
};

// ── « Ma journée » (salarié) ──
const openWorker = async (wp) => { await wp.goto(`http://localhost:${PORT}/poseur`); await wp.waitForSelector('.bt-total', { timeout: 20000 }); await wp.waitForTimeout(1200); };
const tile = (wp) => wp.locator('[data-testid=panier]');
const send = async (wp) => {
  await wp.locator('.bt-send', { hasText: 'Envoyer ma journée' }).click();
  for (let i = 0; i < 5; i++) {
    await wp.waitForTimeout(700);
    if (await wp.locator('[data-testid=pause-ask]').count()) { await wp.locator('[data-testid=pause-0]').click(); continue; }
    const c = wp.locator('button:has-text("Confirmer l\'envoi")');
    if (await c.count()) { await c.click(); continue; }
    break;
  }
  await wp.waitForTimeout(1000);
};
const openHistory = async (wp) => {
  await openWorker(wp);
  await wp.locator('button[aria-label="Mon compte et menu"]').click();
  await wp.getByRole('menuitem', { name: 'Historique' }).click();
  await wp.waitForSelector('h2:has-text("Historique")', { timeout: 10000 });
  await wp.waitForTimeout(900);
};
// Une carte « jour » de l'historique (Card shadcn : div.rounded-lg.border), repérée par sa date.
const historyDay = (wp, iso) => wp.locator('div.rounded-lg.border').filter({ has: wp.locator('p.font-semibold', { hasText: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)) }) }).first();
const cacheOf = (wp) => wp.evaluate((k) => localStorage.getItem(k), `bemexo-panier-reglage-v1:${CO}`);

const office = await newCtx(ADMIN, 'alex@exemple.fr', { width: 1280, height: 900 });
const officeM = await newCtx(ADMIN, 'alex@exemple.fr', { width: 390, height: 844 });
const worker = await newCtx(ME, 'sam@exemple.fr', { width: 390, height: 844 });
const op = watch(await office.newPage(), 'bureau');
const opm = watch(await officeM.newPage(), 'bureau 390');
const wp = watch(await worker.newPage(), 'salarié');

// ═══ AVANT : captures du build de 5657373 (aucune vérification) ═══════════════
if (AVANT) {
  freshDb(true);
  await openSettings(op); await shotSettings(op, 'reglages-paie-1280');
  await openSettings(opm); await shotSettings(opm, 'reglages-paie-390');
  D.time_entries = [row({ id: 'e1', worksite_id: ATELIER.id, start_time: '13:00', end_time: '16:30' })];
  await openWorker(wp); await shot(wp, 'salarie-journee-390');
  freshDb(false);
  D.time_entries = [row({ id: 'e1', worksite_id: ATELIER.id, start_time: '13:00', end_time: '16:30' })];
  await openWorker(wp); await shot(wp, 'salarie-journee-panier-non-390');
  D.time_entries = [row({ id: 'e-s1', start_time: '08:00', end_time: '12:00', status: 'submitted' })];
  await openSheet(op); { const c = card('Salle'); await openPanel(op, c); await shot(c, 'fiche-correction-panier-non-1280'); }
  D.time_entries = [row({ id: 'e-h1', start_time: '08:00', end_time: '12:00', status: 'submitted' })];
  await openHistory(wp); await shot(wp, 'historique-panier-non-390');
  console.log(`Captures « avant » écrites dans ${SH}`);
  await b.close(); srv.close();
  process.exit(0);
}

// ═══ A · migration PAS appliquée (42703) : exactement comme avant ═════════════
console.log('\n═══ A · colonne absente (42703) : comme avant, ligne de réglage masquée');
freshDb('absent');
mealReads.length = 0;
D.time_entries = [row({ id: 'e1', worksite_id: ATELIER.id, start_time: '13:00', end_time: '16:30' })];
await openWorker(wp);
{
  check(mealReads.includes(400), `A0 la lecture de meal_enabled reçoit bien 42703 (${mealReads.join(', ')})`);
  check(await tile(wp).isVisible(), 'A1 salarié : la case « Panier » est là');
  const n = writes.length;
  await tile(wp).click(); await wp.waitForTimeout(1200);
  check(of(since(n), 'PATCH', 'time_entries').some((w) => w.body?.meal_allowance === true), 'A1 un appui écrit meal_allowance=true (inchangé)');
  check(await cacheOf(wp) === null, 'A1 rien de gardé sur le téléphone (colonne absente = « oui »)');
}
await openSettings(op);
{
  check(await op.locator(`${SET} [data-testid=setting-meal]`).count() === 0, 'A2 réglages : pas de ligne « Utiliser le panier repas »');
  check(!/panier/i.test(await paieHint(op)), `A2 rubrique « Heures & paie » : le résumé ne parle pas de panier (« ${await paieHint(op)} »)`);
  const n = writes.length;
  await saveSettings(op);
  const w = since(n);
  const upd = of(w, 'RPC', 'update_company_info');
  const keys = Object.keys(upd[0]?.body || {}).sort();
  check(upd.length === 1 && JSON.stringify(keys) === JSON.stringify([...P_KEYS].sort()), `A2 « Enregistrer » : un update_company_info, les 17 mêmes paramètres (${keys.length})`);
  check(of(w, 'RPC', 'set_meal_enabled').length === 0, 'A2 aucun appel à set_meal_enabled');
  check(await op.locator(SET).count() === 0, 'A2 la fenêtre se ferme (enregistré)');
}
D.time_entries = [row({ id: 'e-s1', start_time: '08:00', end_time: '12:00', status: 'submitted' })];
{
  const x = await teamExport(op, 'excel');
  check(xlsxDetailHead(x.buf).includes('Panier repas'), `A3 export de l’équipe (Excel) : colonne « Panier repas » toujours là (${xlsxDetailHead(x.buf).join(' | ')})`);
}

// ═══ B · « oui » (défaut après migration) : seule la ligne de réglage apparaît ═
console.log('\n═══ B · « oui » : ligne de réglage, règles du lot 11, enregistrement');
freshDb(true);
await openSettings(op);
{
  // Feuille de style figée (lot 10) : observée pendant les gestes qui suivent.
  await op.evaluate((s) => {
    const st = document.querySelector(`${s} style`);
    window.__styleNode = st; window.__styleMuts = 0;
    new MutationObserver((ms) => { window.__styleMuts += ms.length; }).observe(st, { childList: true, characterData: true, subtree: true });
  }, SET);
  const labels = await paieLabels(op);
  const iR = labels.indexOf('Temps de route entre deux chantiers'); const iM = labels.indexOf('Utiliser le panier repas'); const iC = labels.indexOf('Adresse de votre comptable');
  check(iM > 0 && iM === iR + 1 && iC === iM + 1, `B1 « Utiliser le panier repas » entre « Temps de route… » et « Adresse de votre comptable » (${labels.join(' | ')})`);
  const blk = op.locator(`${SET} [data-testid=setting-meal]`);
  check(await blk.locator('[data-testid=set-meal]').isChecked() && norm(await blk.locator('.bt-set-switch').innerText()) === 'Oui', 'B1 case cochée, « Oui »');
  const sub = norm(await blk.locator('.bt-set-substate').innerText());
  check(sub.length <= 90 && sub === 'Une case « Panier » par jour pour le salarié.', `B1 une ligne courte (${sub.length} car.) : « ${sub} »`);
  check(/panier repas/.test(await paieHint(op)) && (await paieHint(op)).length <= 90, `B1 résumé de la rubrique : « ${await paieHint(op)} »`);
  // Lot 11 : ⓘ à côté du libellé, jamais dedans ; s'ouvre au survol, au clic, au clavier.
  const tipLoc = op.locator(`${SET} [data-testid=set-tip-panier]`);
  const place = await tipLoc.evaluate((e) => ({ inLabel: !!e.parentElement.closest('label'), inButton: !!e.parentElement.closest('button'), nextToLabel: !!e.parentElement.querySelector(':scope > label') }));
  check(!place.inLabel && !place.inButton && place.nextToLabel, `B1 lot 11 : ⓘ à côté du libellé, ni dans un <label> ni dans un bouton (${JSON.stringify(place)})`);
  await tipLoc.scrollIntoViewIfNeeded();
  await op.mouse.move(2, 2); await waitPop(op, false);
  await tipLoc.hover();
  const hov = await waitPop(op, true); const tipTxt = await popText(op);
  await op.mouse.move(2, 2); const hovClosed = await waitPop(op, false);
  check(hov && hovClosed && /paniers déjà notés sont gardés/.test(tipTxt), `B1 ⓘ au survol : « ${tipTxt} »`);
  await tipLoc.click(); await op.waitForTimeout(250);
  const clk = await waitPop(op, true); await op.mouse.move(2, 2); await op.waitForTimeout(250);
  const kept = await waitPop(op, true);
  await tipLoc.click(); const clkClosed = await waitPop(op, false);
  check(clk && kept && clkClosed, 'B1 ⓘ au clic : reste ouverte souris partie, se referme au second clic');
  await tipLoc.focus(); await op.keyboard.press('Enter');
  const kb = await waitPop(op, true); await op.keyboard.press('Enter'); const kbClosed = await waitPop(op, false);
  check(kb && kbClosed, 'B1 ⓘ au clavier (Entrée) : s’ouvre et se referme');
  // Lot 11 : plus aucune ligne d'explication de plus de 90 caractères ; 2 lignes au plus à 1280.
  const longs = await op.locator(SET).evaluate((d) => [...d.querySelectorAll('p, .bt-set-substate, .bt-set-hint, .bt-set-sec-hint, .bt-set-note')]
    .filter((el) => el.getBoundingClientRect().width > 0).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter((t) => t.length > 90));
  check(longs.length === 0, `B1 lot 11 : aucune ligne > 90 caractères${longs.length ? ' — ' + longs.join(' | ') : ''}`);
  const nLines = await blk.locator('.bt-set-substate').evaluate((e) => { const rg = document.createRange(); rg.selectNodeContents(e); return new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.bottom))).size; });
  check(nLines <= 2, `B1 lot 11 : à 1280 px la ligne tient sur ${nLines} ligne(s)`);
  // Feuille de style : on coche / décoche (nouveaux rendus), puis on remet.
  await blk.locator('[data-testid=set-meal]').uncheck(); await blk.locator('[data-testid=set-meal]').check(); await op.waitForTimeout(200);
  const st = await op.evaluate((s) => ({ same: document.querySelector(`${s} style`) === window.__styleNode, muts: window.__styleMuts }), SET);
  check(st.same && st.muts === 0, `B1 lot 10/11 : feuille de style des réglages figée (${st.muts} réécriture)`);
  const hs = await noHScroll(op);
  check(hs.ok, `B1 1280 : rien ne déborde en largeur (${hs.sw}/${hs.cw})${hs.bad.length ? ' — ' + hs.bad.join(', ') : ''}`);
  await shotSettings(op, 'reglages-paie-1280');
  // B2 · « Enregistrer » sans changement : pas de set_meal_enabled.
  const n = writes.length;
  await saveSettings(op);
  check(of(since(n), 'RPC', 'update_company_info').length === 1 && of(since(n), 'RPC', 'set_meal_enabled').length === 0, 'B2 rien changé : update_company_info seul, aucun set_meal_enabled');
}
// Tablette 1024 et téléphone 390 : largeur, toucher.
for (const [w, h] of [[1024, 768], [390, 844]]) {
  const c = w === 390 ? officeM : await newCtx(ADMIN, 'alex@exemple.fr', { width: w, height: h });
  const pg = w === 390 ? opm : watch(await c.newPage(), `bureau ${w}`);
  await openSettings(pg);
  const hsx = await noHScroll(pg);
  check(hsx.ok && await pg.locator(`${SET} [data-testid=setting-meal]`).isVisible(), `B1 ${w}×${h} : ligne visible, rien ne déborde en largeur (${hsx.sw}/${hsx.cw})${hsx.bad.length ? ' — ' + hsx.bad.join(', ') : ''}`);
  if (w === 390) {
    const t = pg.locator(`${SET} [data-testid=set-tip-panier]`);
    await t.scrollIntoViewIfNeeded(); await t.tap();
    const o = await waitPop(pg, true);
    const box = o ? await pg.locator(POP).first().boundingBox() : null;
    await t.tap(); const cl = await waitPop(pg, false);
    check(o && cl && box && box.x >= 0 && box.x + box.width <= w + 1, `B1 390 : ⓘ au toucher, tient dans l’écran, se referme (${box ? Math.round(box.x) + '…' + Math.round(box.x + box.width) : 'fermée'})`);
    await shotSettings(pg, 'reglages-paie-390');
  } else await c.close();
}
// B3 · décocher puis « Enregistrer » : update_company_info PUIS set_meal_enabled(false).
{
  await openSettings(op);
  const blk = op.locator(`${SET} [data-testid=setting-meal]`);
  await blk.locator('[data-testid=set-meal]').uncheck();
  check(norm(await blk.locator('.bt-set-switch').innerText()) === 'Non', 'B3 décoché : « Non »');
  const n = writes.length;
  await saveSettings(op);
  const w = since(n).filter((x) => x.m === 'RPC');
  const iU = w.findIndex((x) => x.t === 'update_company_info'); const iS = w.findIndex((x) => x.t === 'set_meal_enabled');
  check(iU >= 0 && iS > iU && w[iS].body?.p_enabled === false, `B3 update_company_info PUIS set_meal_enabled {p_enabled:false} (${w.map((x) => x.t).join(' → ')})`);
  check(await op.locator(SET).count() === 0 && D.companies[0].meal_enabled === false, 'B3 fenêtre fermée, base à « non »');
  await openSettings(op);
  const blk2 = op.locator(`${SET} [data-testid=setting-meal]`);
  check(!(await blk2.locator('[data-testid=set-meal]').isChecked()) && norm(await blk2.locator('.bt-set-switch').innerText()) === 'Non', 'B3 rouvert : décoché, « Non »');
  await openSettings(opm); await shotSettings(opm, 'reglages-paie-panier-non-390');
}
// B4 · set_meal_enabled échoue : message, la fenêtre reste ouverte.
{
  freshDb(true); failMeal = true;
  await openSettings(op);
  await op.locator(`${SET} [data-testid=set-meal]`).uncheck();
  const n = writes.length;
  await saveSettings(op);
  const err = norm(await op.locator(`${SET} .bt-set-err`).innerText().catch(() => ''));
  check(err === 'Panier repas : réglage non enregistré. Réessayez.' && await op.locator(SET).count() === 1, `B4 échec : « ${err} », la fenêtre reste ouverte`);
  check(of(since(n), 'RPC', 'update_company_info').length === 1 && D.companies[0].meal_enabled === true, 'B4 les autres réglages sont enregistrés, le panier reste « oui »');
  failMeal = false;
}
// B5 · contre-épreuves « oui » : rien ne change pour l'entreprise qui l'utilise.
console.log('\n═══ B5 · « oui » : salarié et bureau comme avant');
freshDb(true);
D.time_entries = [row({ id: 'e1', worksite_id: ATELIER.id, start_time: '13:00', end_time: '16:30' })];
await openWorker(wp);
{
  check(await tile(wp).isVisible() && await tile(wp).getAttribute('aria-pressed') === 'false', 'B5 salarié : case « Panier » là, non prise');
  await shot(wp, 'salarie-journee-390');
  check(await cacheOf(wp) === '1', 'B5 valeur gardée sur le téléphone : « oui »');
  const n = writes.length;
  await tile(wp).click(); await wp.waitForTimeout(1200);
  check(of(since(n), 'PATCH', 'time_entries').some((w) => w.body?.meal_allowance === true) && await tile(wp).getAttribute('aria-pressed') === 'true', 'B5 un appui : meal_allowance=true, « Panier ✓ »');
}
// Contre-épreuve de C2 : avec « oui », OK sur le matin DÉPLACE le panier resté l'après-midi.
D.time_entries = [
  row({ id: 'e-am', worksite_id: ATELIER.id, start_time: '08:00', end_time: '12:00' }),
  row({ id: 'e-pm', worksite_id: SALLE.id, start_time: '13:00', end_time: '17:00', meal_allowance: true }),
];
await openWorker(wp);
{
  const n = writes.length;
  await wp.locator('[data-testid=card-entry]').filter({ hasText: 'Atelier' }).click();
  await wp.waitForSelector('.bt-ed'); await wp.locator('.bt-save', { hasText: 'OK' }).click(); await wp.waitForTimeout(1500);
  check(mealWrites(since(n)).length > 0, `B5 « oui » : OK sur une ligne range le panier (${mealWrites(since(n)).length} écriture(s) meal_allowance) — la contre-épreuve de C2`);
}
D.time_entries = [row({ id: 'e-s1', start_time: '08:00', end_time: '12:00', status: 'submitted' })];
await openSheet(op);
{
  const c = card('Salle'); await openPanel(op, c);
  check(await c.locator('[data-testid=correct-meal]').count() === 1, 'B5 bureau : case « Panier » de correction présente (ligne sans panier)');
  const x = await sheetExport(op, 'excel');
  check(xlsxDetailHead(x.buf).includes('Panier repas'), 'B5 fiche, Excel : colonne « Panier repas » (comme avant)');
}
let csvOn = null;
{ await openSheet(op); csvOn = (await sheetExport(op, 'csv')).buf; }
D.time_entries = [row({ id: 'e-h1', start_time: '08:00', end_time: '12:00', status: 'submitted' })];
await openHistory(wp);
check(norm(await historyDay(wp, today).locator('[data-testid=history-meal-count]').innerText().catch(() => '')) === '0 panier', 'B5 historique : « 0 panier » (comme avant)');

// ═══ C · « non » : masqué partout, rien d'écrit, rien d'effacé ═════════════════
console.log('\n═══ C1 · « non » : plus de case « Panier » chez le salarié');
freshDb(false);
D.time_entries = [row({ id: 'e1', worksite_id: ATELIER.id, start_time: '13:00', end_time: '16:30' })];
await openWorker(wp);
{
  check(await tile(wp).count() === 0 && await wp.locator('button[aria-label="Panier repas"]').count() === 0, 'C1 aucune case « Panier » (ni bouton « Panier repas »)');
  const ov = await wp.locator('.bt-stats').evaluate((s) => {
    const R = s.getBoundingClientRect();
    return { ok: s.scrollWidth <= s.clientWidth + 1 && [...s.children].every((c) => c.getBoundingClientRect().right <= R.right + 1) && document.documentElement.scrollWidth <= window.innerWidth + 1, n: s.children.length };
  });
  check(ov.ok, `C1 bloc noir : ${ov.n} cases, rien ne déborde à 390`);
  check(await cacheOf(wp) === '0', 'C1 valeur gardée sur le téléphone : « non »');
  await shot(wp, 'salarie-journee-panier-non-390');
}

console.log('\n═══ C2/C3 · copier hier, OK, ligne prévue, retirer, envoyer : jamais de panier écrit');
{
  // C3 · un panier « en attente » (coché sur une journée vide, avant le réglage) + copier hier.
  freshDb(false);
  D.time_entries = [row({ id: 'e-hier', work_date: yesterday, worksite_id: ATELIER.id, start_time: '08:00', end_time: '12:00', status: 'submitted' })];
  const intentKey = `bemexo-panier-v1:${ME}:${today}`;
  await openWorker(wp);
  await wp.evaluate((k) => localStorage.setItem(k, '1'), intentKey);
  await openWorker(wp);
  let n = writes.length;
  await wp.locator('button', { hasText: "Copier la journée d'hier" }).click(); await wp.waitForTimeout(2000);
  const posts = of(since(n), 'POST', 'time_entries');
  check(posts.length >= 1 && posts.every((w) => (Array.isArray(w.body) ? w.body : [w.body]).every((x) => x.meal_allowance !== true)), `C2 copier hier : ${posts.length} insertion(s), aucune avec meal_allowance=true`);
  check(mealWrites(since(n)).length === 0, 'C3 la première ligne apparaît : le panier « en attente » n’est PAS posé (aucune écriture meal_allowance)');
  check(await wp.evaluate((k) => localStorage.getItem(k), intentKey) === '1', 'C3 … ni effacé (gardé par jour, sans effet)');

  // C2 · OK sur une ligne, une ligne prévue, retirer, envoyer — le panier resté reste.
  freshDb(false);
  D.time_entries = [
    row({ id: 'e-am', worksite_id: ATELIER.id, start_time: '08:00', end_time: '12:00' }),
    row({ id: 'e-pm', worksite_id: SALLE.id, start_time: '13:00', end_time: '17:00', meal_allowance: true }),
    row({ id: 'e-x', worksite_id: SALLE.id, start_time: '17:00', end_time: '17:30' }),
  ];
  D.planning = [{ id: 'p1', company_id: CO, user_id: ME, worksite_id: DEPOT.id, work_date: today, absence_type: null, estimated_start: '18:00:00', estimated_end: '19:00:00', notes: null, worksite: DEPOT, created_at: NOW.toISOString() }];
  await openWorker(wp);
  n = writes.length;
  await wp.locator('[data-testid=card-entry]').filter({ hasText: 'Atelier' }).first().click();
  await wp.waitForSelector('.bt-ed'); await wp.locator('.bt-save', { hasText: 'OK' }).click(); await wp.waitForTimeout(1500);
  check(of(since(n), 'PATCH', 'time_entries').length >= 1 && mealWrites(since(n)).length === 0, 'C2 OK sur le matin : la ligne est enregistrée, le panier de l’après-midi n’est PAS déplacé');
  n = writes.length;
  await wp.locator('[data-testid=card-planned]').first().click();
  await wp.waitForSelector('.bt-ed'); await wp.locator('.bt-save', { hasText: 'OK' }).click(); await wp.waitForTimeout(1500);
  const pPosts = of(since(n), 'POST', 'time_entries');
  check(pPosts.length === 1 && mealWrites(since(n)).length === 0, `C2 ligne prévue confirmée : 1 insertion (meal_allowance=${pPosts[0]?.body?.meal_allowance ?? (Array.isArray(pPosts[0]?.body) ? pPosts[0].body[0]?.meal_allowance : '?')}), aucune écriture du panier`);
  n = writes.length;
  await wp.locator('[data-testid=card-entry]').filter({ hasText: '17:00' }).filter({ hasText: '17:30' }).first().click();
  await wp.waitForSelector('.bt-ed');
  await wp.locator('button[aria-label="Retirer ce chantier"]').click();
  await wp.getByRole('button', { name: 'Oui, retirer' }).click(); await wp.waitForTimeout(1500);
  check(of(since(n), 'DELETE', 'time_entries').length === 1 && mealWrites(since(n)).length === 0, 'C2 retirer une ligne : supprimée, aucune écriture du panier');
  n = writes.length;
  await send(wp);
  const sent = of(since(n), 'PATCH', 'time_entries').filter((w) => w.body?.status === 'submitted');
  check(sent.length >= 1 && mealWrites(since(n)).length === 0, `C2 envoyer la journée : envoyée (${sent.length} écriture(s)), aucune écriture du panier`);
  check(D.time_entries.find((x) => x.id === 'e-pm')?.meal_allowance === true, 'C2 le panier déjà noté (après-midi) est toujours là');
}

console.log('\n═══ C4 · historique du salarié');
{
  freshDb(false);
  D.time_entries = [
    row({ id: 'e-h1', start_time: '08:00', end_time: '12:00', status: 'submitted' }),
    row({ id: 'e-h2', work_date: yesterday, start_time: '08:00', end_time: '12:00', status: 'submitted', meal_allowance: true }),
  ];
  await openHistory(wp);
  const dayT = historyDay(wp, today); const dayY = historyDay(wp, yesterday);
  check(await dayT.locator('[data-testid=history-meal-count]').count() === 0, 'C4 jour sans panier : plus de « 0 panier »');
  check(norm(await dayY.locator('[data-testid=history-meal-count]').innerText().catch(() => '')) === '1 panier' && (await dayY.innerText()).includes('Panier'), 'C4 jour avec un panier resté : « 1 panier » et le badge « Panier »');
  const pdf1 = pdfText((await download(wp, () => wp.getByRole('button', { name: 'PDF' }).click())).buf);
  check(pdf1.includes('Paniers repas : 1') && pdf1.includes('(Panier)'), 'C4 PDF avec un panier resté : total « Paniers repas : 1 » et colonne « Panier »');
  D.time_entries = [row({ id: 'e-h1', start_time: '08:00', end_time: '12:00', status: 'submitted' })];
  await openHistory(wp);
  await shot(wp, 'historique-panier-non-390');
  const pdf0 = pdfText((await download(wp, () => wp.getByRole('button', { name: 'PDF' }).click())).buf);
  check(!pdf0.includes('Panier') && pdf0.includes('Total :'), 'C4 PDF sans panier : ni total ni colonne « Panier »');
}

console.log('\n═══ C5 · fiche du bureau : la case ne reste que pour retirer un panier resté');
{
  freshDb(false);
  D.time_entries = [
    row({ id: 'e-s1', start_time: '08:00', end_time: '12:00', status: 'submitted' }),
    row({ id: 'e-s2', worksite_id: ATELIER.id, start_time: '13:00', end_time: '17:00', status: 'submitted', meal_allowance: true }),
  ];
  await openSheet(op);
  let c = card('Salle'); await openPanel(op, c);
  check(await c.locator('[data-testid=correct-panel]').count() === 1 && await c.locator('[data-testid=correct-meal]').count() === 0, 'C5 ligne sans panier : pas de case « Panier » (panneau ouvert)');
  check(await c.locator('[data-testid=correct-break]').count() === 1, 'C5 … la pause reste corrigeable');
  await shot(c, 'fiche-correction-panier-non-1280');
  await openSheet(op);
  c = card('Atelier'); await openPanel(op, c);
  const meal = c.locator('[data-testid=correct-meal]');
  check(await meal.count() === 1 && await meal.isChecked(), 'C5 ligne avec un panier resté : case « Panier » présente et cochée');
  await shot(c, 'fiche-correction-panier-reste-1280');
  await meal.uncheck();
  await c.locator('[data-testid=correct-reason]').fill('panier en trop');
  const n = writes.length;
  await c.locator('[data-testid=correct-submit]').click(); await op.waitForTimeout(1800);
  const rpc = of(since(n), 'RPC', 'office_correct_entry');
  check(rpc.length === 1 && JSON.stringify(rpc[0].body?.p_changes) === '{"meal_allowance":false}', `C5 décocher + motif : office_correct_entry {meal_allowance:false} (${JSON.stringify(rpc[0]?.body?.p_changes)})`);
}

console.log('\n═══ C6 · exports (fiche et équipe)');
{
  freshDb(false);
  D.time_entries = [row({ id: 'e-s1', start_time: '08:00', end_time: '12:00', status: 'submitted' })];
  await openSheet(op);
  const x0 = await sheetExport(op, 'excel');
  check(!xlsxDetailHead(x0.buf).includes('Panier repas') && xlsxDetailHead(x0.buf).includes('Statut'), `C6 fiche, Excel sans panier : pas de colonne « Panier repas » (${xlsxDetailHead(x0.buf).join(' | ')})`);
  const p0 = pdfText((await sheetExport(op, 'pdf')).buf);
  check(!p0.includes('Paniers repas') && !p0.includes('(Panier)') && p0.includes('Total heures'), 'C6 fiche, PDF sans panier : ni « Paniers repas » ni colonne « Panier »');
  const csvOff = (await sheetExport(op, 'csv')).buf;
  check(csvOn && Buffer.compare(csvOn, csvOff) === 0, `C6 fiche, CSV de paie : identique à l’octet près à celui de « oui » (${csvOff.length} octets)`);
  const t0 = await teamExport(op, 'excel');
  check(!xlsxDetailHead(t0.buf).includes('Panier repas'), 'C6 équipe, Excel sans panier : pas de colonne « Panier repas »');
  D.time_entries = [row({ id: 'e-s1', start_time: '08:00', end_time: '12:00', status: 'submitted' })]; // le verrou de l'export a écrit dessus
  const tp = pdfText((await teamExport(op, 'pdf')).buf);
  check(!tp.includes('Paniers repas') && !tp.includes('(Panier)'), 'C6 équipe, PDF sans panier : ni total ni colonne « Panier »');
  // Un panier resté dans la période : la colonne revient (rien ne sort d'une paie en silence).
  D.time_entries = [
    row({ id: 'e-s1', start_time: '08:00', end_time: '12:00', status: 'submitted' }),
    row({ id: 'e-s2', worksite_id: ATELIER.id, start_time: '13:00', end_time: '17:00', status: 'submitted', meal_allowance: true }),
  ];
  await openSheet(op);
  const x1 = await sheetExport(op, 'excel');
  check(xlsxDetailHead(x1.buf).includes('Panier repas'), 'C6 fiche, Excel avec un panier resté : la colonne « Panier repas » revient');
  const p1 = pdfText((await sheetExport(op, 'pdf')).buf);
  check(p1.includes('Paniers repas : 1'), 'C6 fiche, PDF avec un panier resté : « Paniers repas : 1 »');
  const t1 = await teamExport(op, 'excel');
  check(xlsxDetailHead(t1.buf).includes('Panier repas'), 'C6 équipe, Excel avec un panier resté : la colonne revient');
  // Relu AU CLIC : la fiche ouverte avec « oui », le réglage passe à « non » ensuite.
  freshDb(true);
  D.time_entries = [row({ id: 'e-s1', start_time: '08:00', end_time: '12:00', status: 'submitted' })];
  await openSheet(op);
  D.companies[0].meal_enabled = false; MEAL = false;
  const x2 = await sheetExport(op, 'excel');
  check(!xlsxDetailHead(x2.buf).includes('Panier repas'), 'C6 fiche ouverte avant le changement : l’export relit le réglage au clic (pas de colonne)');
}

console.log('\n═══ C7 · Assistant du salarié : refus poli');
{
  freshDb(false);
  D.companies[0].ai_enabled = true;
  D.time_entries = [row({ id: 'e1', worksite_id: ATELIER.id, start_time: '13:00', end_time: '16:30' })];
  assistantReply = { kind: 'action', answer: 'Je coche le panier.', remaining: 20, chantiers: [{ id: ATELIER.id, nom: 'Atelier', ville: 'Lyon' }], action: { draft: { type: 'panier_repas', valeur: true }, problems: [] } };
  await openWorker(wp);
  await wp.locator('[data-testid=dock-assistant]').click(); await wp.waitForTimeout(500);
  await wp.locator('.as-bar textarea').fill('mets moi le panier');
  const n = writes.length;
  await wp.locator('button[aria-label="Envoyer"]').click(); await wp.waitForTimeout(2500);
  const note = norm(await wp.locator('[data-testid=wa-meal-off]').innerText().catch(() => ''));
  check(note === norm(MEAL_OFF_MESSAGE), `C7 « ${note} »`);
  check(await wp.locator('[data-testid=worker-action-card]').count() === 0 && await wp.locator('[data-testid=action-done]').count() === 0, 'C7 ni formulaire ni « C’est fait »');
  const bubble = norm(await wp.locator('.as-bot').last().innerText());
  check(!/Je coche le panier/.test(bubble), `C7 la bulle ne dit plus « Je coche le panier » (« ${bubble} »)`);
  check(since(n).filter((w) => w.t === 'time_entries').length === 0, 'C7 aucune écriture sur time_entries');
  await shot(wp.locator('[data-testid=assistant-panel]'), 'assistant-panier-refus-390');
  // Le réglage passe à « non » APRÈS l'ouverture de l'écran : l'exécution le relit et refuse.
  freshDb(true);
  D.companies[0].ai_enabled = true;
  D.time_entries = [row({ id: 'e1', worksite_id: ATELIER.id, start_time: '13:00', end_time: '16:30' })];
  await openWorker(wp);
  D.companies[0].meal_enabled = false; MEAL = false;
  await wp.locator('[data-testid=dock-assistant]').click(); await wp.waitForTimeout(500);
  await wp.locator('.as-bar textarea').fill('mets moi le panier');
  const n2 = writes.length;
  await wp.locator('button[aria-label="Envoyer"]').click(); await wp.waitForTimeout(2500);
  const cardTxt = norm(await wp.locator('[data-testid=worker-action-card]').last().innerText().catch(() => ''));
  check(cardTxt.includes(norm(MEAL_OFF_MESSAGE)) && since(n2).filter((w) => w.t === 'time_entries' && w.m !== 'GET').length === 0, `C7 changé après l’ouverture : l’exécution relit le réglage et refuse, rien d’écrit (« ${cardTxt.slice(0, 90)} »)`);
  assistantReply = null;
}

console.log('\n═══ C8 · hors ligne : la dernière valeur connue');
{
  freshDb(false);
  D.time_entries = [row({ id: 'e1', worksite_id: ATELIER.id, start_time: '13:00', end_time: '16:30' })];
  await openWorker(wp); // garde « non »
  mealNetFail = true;
  await openWorker(wp);
  check(await tile(wp).count() === 0, 'C8 lecture impossible, « non » gardé : la case reste cachée');
  await wp.evaluate((k) => localStorage.removeItem(k), `bemexo-panier-reglage-v1:${CO}`);
  await openWorker(wp);
  check(await tile(wp).isVisible(), 'C8 lecture impossible, rien de gardé : comme avant (case visible)');
  mealNetFail = false;
}

console.log('\n═══ C9 · une autre colonne manque (repli par groupes) ET la lecture du panier échoue');
{
  freshDb(false);
  D.time_entries = [row({ id: 'e1', worksite_id: ATELIER.id, start_time: '13:00', end_time: '16:30' })];
  await openWorker(wp); // garde « non »
  groupedBroken = true; mealNetFail = true;
  await openWorker(wp);
  check(await tile(wp).count() === 0, 'C9 le groupe « panier » illisible ne remet pas « oui » : le « non » gardé sur le téléphone s’applique, case cachée');
  groupedBroken = false; mealNetFail = false;
}

check(pageErrors.length === 0, `aucune erreur de page${pageErrors.length ? ' — ' + pageErrors.join(' | ') : ''}`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
if (fails.length) console.log('Échecs :\n - ' + fails.join('\n - '));
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
