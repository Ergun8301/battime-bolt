// Lot 23 — Chantier terminé + bilan du chantier
// (base Supabase SIMULÉE, vraies pages de l'export statique, aucun accès réseau réel).
//
// Lancer : npm run build, puis
//   node scripts/tests/chantier-termine-lot23.mjs out docs/captures-chantier-termine [port]
//
//  A · BUREAU (/admin, 390 px) : fiche client → bloc « Chantier en cours » ; Terminer : date du jour par défaut,
//      jamais dans le futur, QUATRE avertissements (réserve, pointage en cours, brouillons, interventions à venir)
//      avec « Terminer quand même » (jamais un blocage) ; contrôle impossible = on laisse terminer ; erreurs de la base ;
//      « Terminé le … » dans la fiche et les listes ; Rouvrir.
//  B · BILAN en lecture seule : période, heures par salarié (= Coût chantiers), dépenses, réserves, documents
//      (factures comprises), budget prévu / réel ; aucune écriture, aucun bouton d'écriture ; pas de défilement horizontal.
//  C · MÊMES CHIFFRES que « Coût chantiers » (heures, route, budget) pour le même jeu de données.
//  D · Avant la migration : rien (fonction absente, réseau coupé, colonne absente) — aucun message, aucune erreur.
//  E · Mode support : le bilan se lit, aucun bouton Terminer / Rouvrir, les heures ne sont pas inventées.
//  F · Chargement à l'ouverture : aucune lecture du bilan au chargement de la page.
//  G · SALARIÉ (/poseur, 390 px) : chantier terminé absent de « + » (nouvelle intervention), nom et heures intacts sur
//      ses cartes avec « Terminé le … », pointage en cours qui se termine normalement, avant migration tout est proposé.
//  H · Contrôle statique : aucune suppression ajoutée (navigateur).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-chantier-termine', PORT = '0'] = process.argv;
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
const BASE = `http://localhost:${srv.address().port}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };

// ─── Données (FICTIVES) ────────────────────────────────────────────────────────
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const CO = 'c0000000-0000-0000-0000-000000000001';
const frMonths = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const frDay = (d) => `${Number(d.slice(8, 10))} ${frMonths[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const ADMIN = u('u-admin', 'Paul', 'Martin', 'admin');
const SAM = u('u-sam', 'Sam', 'Girard');
const ALEX = u('u-alex', 'Alex', 'Roux');
const LEA = u('u-lea', 'Léa', 'Petit');
const FIN_DAY = addDays(today, -12);                     // un chantier terminé il y a 12 jours
const FIN_AT = `${FIN_DAY}T12:00:00+00:00`;
// Villa Dupont : EN COURS, avec budget (40 h / 1 600 €) ; Maison Martin : TERMINÉ ; Atelier Petit : en cours, rien à signaler.
const WD = () => ({ id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true, client_email: null, budget_hours: 40, budget_amount: 1600, completed_at: null, completed_by: null });
const WM = () => ({ id: 'w2', company_id: CO, client_name: 'Maison Martin', city: 'Villeurbanne', is_active: true, client_email: null, budget_hours: null, budget_amount: null, completed_at: FIN_AT, completed_by: 'u-admin' });
const WP = () => ({ id: 'w3', company_id: CO, client_name: 'Atelier Petit', city: 'Nantes', is_active: true, client_email: null, budget_hours: null, budget_amount: null, completed_at: null, completed_by: null });
const WA = () => ({ id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true, client_email: null, budget_hours: null, budget_amount: null, completed_at: null, completed_by: null });
const te = (id, user, ws, date, s, e, extra = {}) => {
  const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number);
  return { id, company_id: CO, user_id: user.id, worksite_id: ws, planning_id: null, work_date: date, start_time: `${s}:00`, end_time: `${e}:00`, break_minutes: 0,
    total_minutes: (eh * 60 + em) - (sh * 60 + sm), meal_allowance: false, status: 'submitted', locked: false, exported_at: null, observation: null, reception: null, gap_before: null,
    reserve_resolved_at: null, reserve_fixed_at: null, ...extra };
};
const D1 = addDays(today, -40), D2 = addDays(today, -39), D3 = addDays(today, -20);
/** Les interventions de Villa Dupont : le jeu de données du bilan (mêmes valeurs que le test SQL du lot). */
const entriesDupont = () => [
  te('b1', SAM, 'w1', D1, '08:00', '12:00', { reception: 'en_cours' }),
  te('b2', SAM, 'w1', D1, '13:00', '17:00', { status: 'validated', reception: 'avec', observation: 'Joint à reprendre côté cuisine', gap_before: 'route' }),
  te('b3', SAM, 'w1', D2, '08:00', '12:30', { break_minutes: 30, total_minutes: 240, reception: 'avec', observation: 'Rayure sur la vitre', reserve_fixed_at: `${D2}T10:00:00Z` }),
  te('b4', SAM, 'w1', addDays(today, -3), '08:00', '11:00', { status: 'draft' }),
  te('b5', SAM, 'w1', addDays(today, -2), '08:00', '16:00', { status: 'cancelled', reception: 'avec', observation: 'Retirée' }),
  te('b6', ALEX, 'w1', D3, '08:00', '16:00', { break_minutes: 60, total_minutes: 420, reception: 'avec', observation: 'Plinthe fendue', reserve_resolved_at: `${D3}T09:00:00Z` }),
  te('b7', LEA, 'w1', addDays(today, -4), '09:00', '12:00', { status: 'draft' }),
  te('b8', LEA, 'w1', addDays(today, -4), '09:00', '09:00', { status: 'draft', total_minutes: 0 }),
  te('b9', SAM, 'w3', D1, '08:00', '12:00'),
];
// my_worksite_labour (toute la vie du chantier) : Sam 780 min dont 60 de route, Alex 420 min sans taux horaire.
const LABOUR = [
  { worksite_id: 'w1', user_id: 'u-sam', worked_minutes: 720, route_minutes: 60, paid_minutes: 780, cost: 520, unpriced_minutes: 0 },
  { worksite_id: 'w1', user_id: 'u-alex', worked_minutes: 420, route_minutes: 0, paid_minutes: 420, cost: 0, unpriced_minutes: 420 },
  { worksite_id: 'w3', user_id: 'u-sam', worked_minutes: 240, route_minutes: 0, paid_minutes: 240, cost: 160, unpriced_minutes: 0 },
  { worksite_id: 'w2', user_id: 'u-alex', worked_minutes: 480, route_minutes: 0, paid_minutes: 480, cost: 0, unpriced_minutes: 480 },
];
const doc = (id, ws, cat) => ({ id, company_id: CO, worksite_id: ws, category: cat, label: id, file_name: id, file_path: `${CO}/${ws}/${id}`, mime_type: 'application/pdf', size_bytes: 1000, created_at: new Date().toISOString(), uploaded_by: ADMIN.id, work_date: today, time_entry_id: null });
const DOCS = [doc('d1', 'w1', 'devis'), doc('d2', 'w1', 'facture'), doc('d3', 'w1', 'facture_payee'), doc('d4', 'w1', 'photo'), doc('d5', 'w1', 'photo'), doc('d6', 'w1', 'reserve'), doc('d7', 'w1', null), doc('d8', 'w3', 'plan')];
const EXPS = [
  { id: 'x1', company_id: CO, worksite_id: 'w1', spent_on: addDays(today, -41), category: 'materiaux', label: 'Plaques', supplier: null, amount: 820.5 },
  { id: 'x2', company_id: CO, worksite_id: 'w1', spent_on: addDays(today, -39), category: 'materiaux', label: 'Vis', supplier: null, amount: 179.5 },
  { id: 'x3', company_id: CO, worksite_id: 'w1', spent_on: addDays(today, -30), category: 'location', label: 'Échafaudage', supplier: null, amount: 150 },
  { id: 'x4', company_id: CO, worksite_id: 'w1', spent_on: addDays(today, -20), category: 'autre', label: 'Avoir', supplier: null, amount: -50 },
  { id: 'x5', company_id: CO, worksite_id: 'w3', spent_on: addDays(today, -35), category: 'materiaux', label: 'Autre chantier', supplier: null, amount: 999 },
];

const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v0] of params) {
    if (SKIP.has(k) || k === 'or' || k === 'and') continue;
    let v = v0, neg = false;
    if (v.startsWith('not.')) { neg = true; v = v.slice(4); }
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k];
      let r = true;
      if (op === 'eq') r = String(cur) === val;
      else if (op === 'neq') r = String(cur) !== val;
      else if (op === 'in') r = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      else if (op === 'gte') r = cur != null && String(cur) >= val;
      else if (op === 'lte') r = cur != null && String(cur) <= val;
      else if (op === 'gt') r = cur != null && String(cur) > val;
      else if (op === 'lt') r = cur != null && String(cur) < val;
      else if (op === 'is') r = val === 'null' ? cur == null : String(cur) === val;
      return neg ? !r : r;
    });
  }
  return rows;
};

/**
 * Monte la base simulée. `S` : l'état (tables, mode de la fonction « prête ? », colonne présente ou non, réponses d'écriture, journaux).
 * Une écriture (POST / PATCH / PUT / DELETE) est NOTÉE dans S.writes : le bilan ne doit en produire aucune.
 */
async function mount(ctx, S, me) {
  const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: me.id, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
  const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: me.id, email: me.email, aud: 'authenticated', role: 'authenticated' } };
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  if (S.support) await ctx.addInitScript(([k, v]) => { try { sessionStorage.setItem(k, v); } catch { /* */ } }, ['bemexo-support', JSON.stringify({ staffId: me.id, companyId: CO, name: 'Dupont Rénovation', expiresAt: new Date(Date.now() + 3600e3).toISOString() })]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const method = req.method(); const P = url.pathname;
    let body = null; try { body = req.postDataJSON(); } catch { body = null; }
    if (P.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (P.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (P.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (P.startsWith('/storage/')) return r.fulfill({ json: [] });
    S.requests.push(`${method} ${P.replace('/rest/v1/', '')}${decodeURIComponent(url.search).slice(0, 400)}`);
    // ── Fonctions serveur ──
    if (P.startsWith('/rest/v1/rpc/')) {
      const fn = P.replace('/rest/v1/rpc/', '');
      S.rpc.push(fn);
      if (fn === 'worksite_completion_ready') {
        if (S.ready === 'hang') return;
        if (S.ready === 'network') return r.abort('failed');
        if (S.ready === 'missing') return r.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.worksite_completion_ready without parameters in the schema cache', details: null, hint: null } });
        return r.fulfill({ json: true });
      }
      if (fn === 'my_worksite_labour') {
        if (S.labourError) return r.fulfill({ status: 500, json: { code: 'XX000', message: 'boom', details: null, hint: null } });
        return r.fulfill({ json: S.labour });
      }
      if (fn === 'set_worksite_completed') {
        S.setCalls.push(body);
        if (S.setDelay) await new Promise((res) => setTimeout(res, S.setDelay));
        if (S.setNetwork) return r.abort('failed');
        if (S.setError) return r.fulfill({ status: S.setError.status || 400, json: { code: S.setError.code, message: S.setError.message, details: null, hint: null } });
        const w = S.worksites.find((x) => x.id === body.p_worksite);
        const at = body.p_date ? `${body.p_date}T12:00:00+00:00` : null;
        if (w) { w.completed_at = at; w.completed_by = at ? me.id : null; }
        return r.fulfill({ json: at });
      }
      if (fn === 'support_enter') return r.fulfill({ json: [{ name: 'Dupont Rénovation', expires_at: new Date(Date.now() + 3600e3).toISOString() }] });
      return r.fulfill({ json: [] });
    }
    // ── Tables ──
    const t = P.replace('/rest/v1/', '');
    if (method !== 'GET' && method !== 'HEAD') { S.writes.push(`${method} ${t}`); return r.fulfill({ status: 201, json: [{ id: 'new-1' }] }); }
    if (S.failTable && S.failTable === t) return r.fulfill({ status: 500, json: { code: 'XX000', message: 'boom', details: null, hint: null } });
    let rows = filterRows(S[t] || [], url.searchParams);
    // Colonne absente (migration pas appliquée) : la base ne rend ni completed_at ni completed_by.
    if (!S.column) {
      const strip = (w) => { if (!w || typeof w !== 'object') return w; const c = { ...w }; delete c.completed_at; delete c.completed_by; return c; };
      rows = rows.map((x) => (t === 'worksites' ? strip(x) : 'worksite' in x ? { ...x, worksite: strip(x.worksite) } : x));
    }
    // RLS simulée : un salarié ne lit jamais une facture (lot 24), ni les dépenses, ni les taux.
    if (t === 'documents' && me.role !== 'admin') rows = rows.filter((x) => x.category !== 'facture' && x.category !== 'facture_payee');
    if (t === 'worksite_expenses' && me.role !== 'admin') rows = [];
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const page = rows.slice(off, lim ? off + Number(lim) : undefined);
    if (single) return page.length ? r.fulfill({ json: page[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: page, headers: { 'content-range': `${off}-${Math.max(off, off + page.length - 1)}/${rows.length}`, 'access-control-expose-headers': 'content-range' } });
  });
}
const freshState = (extra = {}) => ({
  ready: 'ok', column: true, support: false, setError: null, setNetwork: false, labourError: false, failTable: null,
  requests: [], rpc: [], writes: [], setCalls: [], labour: LABOUR,
  users: [ADMIN, SAM, ALEX, LEA],
  companies: [{ id: CO, name: 'Dupont Rénovation', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, travel_paid: true }],
  worksites: [WD(), WM(), WP(), WA()],
  planning: [
    // Villa Dupont : deux interventions à venir (+ une absence qui ne compte pas) ; une d'hier, déjà faite
    { id: 'pl1', company_id: CO, user_id: 'u-sam', worksite_id: 'w1', work_date: addDays(today, 3), absence_type: null, estimated_start: '08:00:00', estimated_end: '12:00:00', notes: null },
    { id: 'pl2', company_id: CO, user_id: 'u-alex', worksite_id: 'w1', work_date: addDays(today, 5), absence_type: null, estimated_start: null, estimated_end: null, notes: null },
    { id: 'pl3', company_id: CO, user_id: 'u-alex', worksite_id: 'w1', work_date: addDays(today, 6), absence_type: 'conge', estimated_start: null, estimated_end: null, notes: null },
    { id: 'pl4', company_id: CO, user_id: 'u-sam', worksite_id: 'w1', work_date: addDays(today, -1), absence_type: null, estimated_start: null, estimated_end: null, notes: null },
  ],
  time_entries: [...entriesDupont()],
  active_sessions: [{ user_id: 'u-lea', company_id: CO, worksite_id: 'w1', planning_id: null, work_date: today, started_at: new Date(Date.now() - 50 * 60000).toISOString() }],
  worksite_expenses: EXPS, documents: DOCS,
  month_closures: [], leave_requests: [], invitations: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], user_closures: [],
  ...extra,
});

const clickFirst = async (p, cands, timeout = 4000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const [sel, text] of cands) {
      const loc = p.locator(sel, text ? { hasText: text } : undefined).filter({ visible: true }).first();
      if (await loc.count().catch(() => 0)) {
        await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
        try { await loc.click({ timeout: 2500 }); return true; } catch { /* recouvert, on réessaie */ }
      }
    }
    await p.waitForTimeout(150);
  }
  return false;
};
const step = async (p, ...cands) => { const okk = await clickFirst(p, cands); if (okk) await p.waitForTimeout(450); return okk; };
const norm = (s) => (s || '').replace(/\s+/g, ' ').replace(/[  ]/g, ' ').trim();
const noHScroll = (p, sel = '[role=dialog]') => p.evaluate((sel) => {
  const ds = [...document.querySelectorAll(sel)].filter((d) => d.getBoundingClientRect().width > 0);
  const pageOk = document.documentElement.scrollWidth <= window.innerWidth + 1;
  const bad = [];
  for (const d of ds) {
    const r = d.getBoundingClientRect();
    if (d.scrollWidth > d.clientWidth + 1 || r.right > window.innerWidth + 1 || r.left < -1) bad.push(`${d.getAttribute('data-testid') || d.className.slice(0, 30)} ${d.scrollWidth}>${d.clientWidth}`);
    for (const e of d.querySelectorAll('*')) {
      const x = e.getBoundingClientRect();
      if (x.width > 0 && x.height > 0 && x.right > r.right + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('[data-sonner-toaster]')) { bad.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} dépasse`); break; }
    }
  }
  return { ok: pageOk && !bad.length && ds.length > 0, bad };
}, sel);
const newPage = async (S, me, vp) => {
  const ctx = await b.newContext({ viewport: vp, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(vp.width < 700 ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await mount(ctx, S, me);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
  return { ctx, p, errs };
};
const toasts = (p, type) => p.locator(`[data-sonner-toast]${type ? `[data-type="${type}"]` : ''}`).count();

// ─── Ouvertures (bureau, téléphone) ────────────────────────────────────────────
const loadAdmin = async (p) => {
  await p.goto(`${BASE}/admin`);
  await p.locator('.bt-pl-acct, .bt-pl-m-ibtn[aria-label="Menu"]').filter({ visible: true }).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(900);
};
const openFiche = async (p, name = 'Villa Dupont') => {
  if (!(await step(p, ['.bt-pl-m-ibtn[aria-label="Menu"]']))) return false;
  if (!(await step(p, ['.bt-mm-item', 'Chantiers']))) return false;
  if (!(await step(p, ['[role=dialog] button', name]))) return false;
  await p.waitForSelector('[role=dialog] :text("Fiche client")', { timeout: 6000 }).catch(() => {});
  await p.waitForTimeout(500);
  return true;
};
const win = (p) => p.locator('[data-testid=chantier-termine-fenetre]');
const closeWin = async (p) => { await p.keyboard.press('Escape'); await p.waitForTimeout(350); };
const barText = (p) => p.locator('[data-testid=chantier-termine-bar]').innerText().then(norm).catch(() => '');

// ════════════════════════════════════════════════════════════════════════════
// A · BUREAU, 390 px : terminer
// ════════════════════════════════════════════════════════════════════════════
const S = freshState();
{
  const { ctx, p, errs } = await newPage(S, ADMIN, { width: 390, height: 844 });
  await loadAdmin(p);
  // F · aucune lecture du bilan ni du contrôle au chargement de la page
  const heavy = (arr) => arr.filter((x) => /worksite_expenses|my_worksite_labour|worksite_completion_ready|set_worksite_completed|active_sessions.*worksite_id=eq\./.test(x));
  check(heavy(S.requests).length === 0 && !S.rpc.includes('my_worksite_labour') && !S.rpc.includes('worksite_completion_ready'),
    `F) au chargement de la page : aucune lecture du bilan, du contrôle ni de la fonction « prête » (${heavy(S.requests).join(' | ') || 'aucune'})`);
  check(await openFiche(p), 'A0) fiche client « Villa Dupont » ouverte (téléphone : ☰ → Chantiers → ligne)');
  await p.waitForSelector('[data-testid=chantier-termine-bar]', { timeout: 6000 }).catch(() => {});
  check(S.rpc.filter((x) => x === 'worksite_completion_ready').length === 1 && !S.rpc.includes('my_worksite_labour'), 'F) à l’ouverture de la fiche : UNE lecture « suis-je prête ? » et rien d’autre (pas de bilan)');
  const bar = await barText(p);
  check(/Chantier en cours/.test(bar) && /Bilan du chantier/.test(bar) && /Terminer le chantier/.test(bar) && !/Rouvrir/.test(bar), `A1) bloc de la fiche : « ${bar} »`);
  const sizes = await p.locator('[data-testid=ct-bilan], [data-testid=ct-terminer]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.height), Math.round(r.width)]; }));
  check(sizes.length === 2 && sizes.every(([h, w]) => h >= 44 && w >= 44), `A1) boutons ≥ 44 px (${JSON.stringify(sizes)})`);
  await p.locator('[data-testid=chantier-termine-bar]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${SH}/01-fiche-client.png` });

  // A2 · Terminer : date du jour, jamais dans le futur, quatre avertissements
  S.requests.length = 0;
  await p.locator('[data-testid=ct-terminer]').click();
  await win(p).waitFor({ timeout: 6000 });
  await p.waitForSelector('[data-testid=ct-warnings], [data-testid=ct-rien], [data-testid=ct-check-error]', { timeout: 8000 }).catch(() => {});
  const dateIn = p.locator('[data-testid=ct-date]');
  check((await dateIn.inputValue()) === today && (await dateIn.getAttribute('max')) === today, `A2) date du jour par défaut (${await dateIn.inputValue()}), plafond = aujourd’hui (max=${await dateIn.getAttribute('max')})`);
  const warnTitles = await p.locator('[data-testid^=ct-warn-] b').allInnerTexts();
  check(JSON.stringify(warnTitles.map(norm)) === JSON.stringify(['1 réserve non levée', '1 pointage en cours', '2 brouillons non envoyés', '2 interventions planifiées à venir']),
    `A2) quatre avertissements, dans l’ordre : ${warnTitles.map(norm).join(' | ')}`);
  check(norm(await p.locator('[data-testid=ct-confirmer]').innerText()) === 'Terminer quand même', 'A2) avec avertissements : « Terminer quand même » (jamais un blocage)');
  check(await p.locator('[data-testid=ct-confirmer]').isEnabled(), 'A2) le bouton est actif : les avertissements ne bloquent pas');
  // Les contrôles lisent seulement ce chantier, à l'ouverture
  if (process.env.DEBUG_REQ) console.log(S.requests.join('\n'));
  const reads = S.requests.filter((x) => /time_entries|planning|active_sessions/.test(x));
  check(reads.length >= 4 && reads.every((x) => /worksite_id=eq\.w1/.test(x)), `A2) cinq petites lectures, toutes limitées au chantier (${reads.length})`);
  const sizes2 = await p.locator('[data-testid=ct-annuler], [data-testid=ct-confirmer], [data-testid=ct-date]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check(sizes2.every((h) => h >= 44), `A2) champs et boutons ≥ 44 px (${sizes2.join(', ')})`);
  check((await noHScroll(p)).ok, 'A2) aucun défilement horizontal');
  await p.screenshot({ path: `${SH}/02-terminer-avec-avertissements.png` });

  // Date dans le futur : message, bouton inactif
  await dateIn.fill(addDays(today, 1));
  await p.waitForTimeout(200);
  check(norm(await p.locator('[data-testid=ct-date-err]').innerText()) === 'La date de fin ne peut pas être dans le futur.' && !(await p.locator('[data-testid=ct-confirmer]').isEnabled()), 'A2) une date de demain : message en français, bouton inactif');
  await dateIn.fill('');
  await p.waitForTimeout(200);
  check(!(await p.locator('[data-testid=ct-confirmer]').isEnabled()), 'A2) date vidée : bouton inactif');

  // Erreurs de la base : on le dit, rien ne change, la fenêtre reste ouverte
  await dateIn.fill(addDays(today, -2));
  S.setError = { status: 403, code: '42501', message: 'Réservé au bureau de l\'entreprise.' };
  await p.locator('[data-testid=ct-confirmer]').click();
  await p.waitForTimeout(500);
  check(norm(await p.locator('[data-testid=ct-erreur]').innerText()) === 'Réservé au bureau de l\'entreprise.' && await win(p).count() === 1, 'A3) refus de la base (42501) : le message de la base s’affiche, la fenêtre reste ouverte');
  S.setError = { status: 400, code: '22023', message: 'La date de fin ne peut pas être dans le futur.' };
  await p.locator('[data-testid=ct-confirmer]').click();
  await p.waitForTimeout(500);
  check(/futur/.test(await p.locator('[data-testid=ct-erreur]').innerText()), 'A3) date refusée par la base (22023) : message français');
  S.setError = { status: 500, code: 'XX000', message: 'duplicate key value violates unique constraint "x"' };
  await p.locator('[data-testid=ct-confirmer]').click();
  await p.waitForTimeout(500);
  const generic = norm(await p.locator('[data-testid=ct-erreur]').innerText());
  check(/rien n’a été changé/.test(generic) && !/duplicate|constraint/.test(generic), `A3) erreur technique : jamais le texte brut (« ${generic} »)`);
  S.setError = null; S.setNetwork = true;
  await p.locator('[data-testid=ct-confirmer]').click();
  await p.waitForTimeout(600);
  check(/rien n’a été changé/.test(await p.locator('[data-testid=ct-erreur]').innerText()), 'A3) réseau coupé pendant l’envoi : message clair, rien n’a changé');
  check(S.worksites.find((w) => w.id === 'w1').completed_at === null && S.writes.length === 0, 'A3) après toutes ces erreurs : le chantier n’est pas terminé et aucune autre écriture n’est partie');
  S.setNetwork = false;

  // Terminer pour de vrai, à J−2
  S.setCalls.length = 0;
  const chosen = addDays(today, -2);
  await dateIn.fill(chosen);
  await p.locator('[data-testid=ct-confirmer]').click();
  await p.waitForFunction(() => !document.querySelector('[data-testid=ct-confirmer]'), null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(500);
  check(S.setCalls.length === 1 && S.setCalls[0].p_worksite === 'w1' && S.setCalls[0].p_date === chosen, `A4) UNE seule demande à la base : chantier w1, date ${chosen}`);
  check(S.writes.length === 0, 'A4) et rien d’autre n’est écrit : aucune heure, aucun planning, aucun document ne bouge');
  check(await p.locator('[data-sonner-toast]', { hasText: `Chantier terminé le ${frDay(chosen)}` }).count() === 1, `A4) confirmation : « Chantier terminé le ${frDay(chosen)} »`);
  const bar2 = await barText(p);
  check(bar2.includes(`Terminé le ${frDay(chosen)}`) && /Rouvrir le chantier/.test(bar2) && !/Terminer le chantier/.test(bar2), `A4) la fiche suit : « ${bar2} »`);
  // Les listes de choix du bureau le montrent, sans le cacher
  await closeWin(p); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await step(p, ['.bt-pl-m-ibtn[aria-label="Menu"]']); await step(p, ['.bt-mm-item', 'Chantiers']);
  const rowTxt = norm(await p.locator('[role=dialog] button', { hasText: 'Villa Dupont' }).first().innerText());
  check(rowTxt.includes(`Terminé le ${chosen.slice(8, 10)}/${chosen.slice(5, 7)}/${chosen.slice(0, 4)}`), `A4) la liste « Chantiers » du bureau l’affiche : « ${rowTxt} »`);
  const other = norm(await p.locator('[role=dialog] button', { hasText: 'Atelier Petit' }).first().innerText());
  check(!/Terminé/.test(other), 'A4) un autre chantier n’affiche rien');

  // A5 · Rouvrir
  await step(p, ['[role=dialog] button', 'Villa Dupont']);
  await p.waitForSelector('[data-testid=ct-rouvrir]', { timeout: 5000 });
  check(/Terminé le/.test(await barText(p)), 'A5) la fiche rouverte montre « Terminé le … » et « Rouvrir le chantier »');
  S.setCalls.length = 0;
  await p.locator('[data-testid=ct-rouvrir]').click();
  await win(p).waitFor({ timeout: 5000 });
  check(/Rouvrir le chantier/.test(await win(p).innerText()) && /redevient proposé/.test(await win(p).innerText()), 'A5) confirmation « Rouvrir le chantier ? » avec la conséquence expliquée');
  await p.locator('[data-testid=ct-annuler]').click();
  await p.waitForTimeout(400);
  check(S.setCalls.length === 0 && /Terminé le/.test(await barText(p)), 'A5) « Annuler » : rien n’est demandé à la base');
  await p.locator('[data-testid=ct-rouvrir]').click();
  await win(p).waitFor({ timeout: 5000 });
  await p.locator('[data-testid=ct-rouvrir-ok]').click();
  await p.waitForTimeout(700);
  check(S.setCalls.length === 1 && S.setCalls[0].p_date === null && S.setCalls[0].p_worksite === 'w1', 'A5) « Rouvrir » : la date est retirée (p_date = null)');
  check(/Chantier en cours/.test(await barText(p)) && /Terminer le chantier/.test(await barText(p)), 'A5) la fiche est de nouveau « Chantier en cours »');
  check(errs.filter((e) => !/Failed to load resource/.test(e)).length === 0, `A) aucune erreur de page (hors les refus simulés) : ${errs.filter((e) => !/Failed to load resource/.test(e)).slice(0, 2).join(' | ') || 'aucune'}`);
  await ctx.close();
}

// A6 · rien à signaler, et contrôle impossible = on laisse terminer
{
  const S2 = freshState();
  const { ctx, p } = await newPage(S2, ADMIN, { width: 390, height: 844 });
  await loadAdmin(p);
  await openFiche(p, 'Atelier Petit');
  await p.waitForSelector('[data-testid=ct-terminer]', { timeout: 6000 });
  await p.locator('[data-testid=ct-terminer]').click();
  await p.waitForSelector('[data-testid=ct-rien]', { timeout: 6000 }).catch(() => {});
  check(await p.locator('[data-testid=ct-rien]').count() === 1 && norm(await p.locator('[data-testid=ct-confirmer]').innerText()) === 'Terminer le chantier', 'A6) rien à signaler : message vert et bouton simple « Terminer le chantier »');
  await ctx.close();
  const S3 = freshState({ failTable: 'active_sessions' });
  const c3 = await newPage(S3, ADMIN, { width: 390, height: 844 });
  await loadAdmin(c3.p);
  await openFiche(c3.p, 'Villa Dupont');
  await c3.p.waitForSelector('[data-testid=ct-terminer]', { timeout: 6000 });
  await c3.p.locator('[data-testid=ct-terminer]').click();
  await c3.p.waitForSelector('[data-testid=ct-check-error]', { timeout: 8000 }).catch(() => {});
  check(await c3.p.locator('[data-testid=ct-check-error]').count() === 1 && await c3.p.locator('[data-testid=ct-confirmer]').isEnabled() && norm(await c3.p.locator('[data-testid=ct-confirmer]').innerText()) === 'Terminer quand même',
    'A6) contrôle impossible (une lecture échoue) : on le dit et « Terminer quand même » reste possible — jamais un blocage');
  await c3.ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// B · LE BILAN, 390 px, lecture seule — et C · mêmes chiffres que « Coût chantiers »
// ════════════════════════════════════════════════════════════════════════════
{
  const SB = freshState();
  SB.worksites = [{ ...WD(), completed_at: FIN_AT, completed_by: 'u-admin' }, WM(), WP(), WA()];
  const { ctx, p, errs } = await newPage(SB, ADMIN, { width: 390, height: 844 });
  await loadAdmin(p);
  await openFiche(p);
  await p.waitForSelector('[data-testid=ct-bilan]', { timeout: 6000 });
  SB.requests.length = 0; SB.writes.length = 0; SB.rpc.length = 0;
  await p.locator('[data-testid=ct-bilan]').click();
  await p.waitForSelector('[data-testid=bilan]', { timeout: 8000 });
  await p.waitForTimeout(500);
  const T = async (id) => norm(await p.locator(`[data-testid=${id}]`).first().innerText());
  check(/Bilan du chantier/.test(await win(p).innerText()) && await T('bl-nom') === 'Villa Dupont' && await T('bl-statut') === `Terminé le ${frDay(FIN_DAY)}`, `B1) titre, chantier et statut : « Terminé le ${frDay(FIN_DAY)} »`);
  // Période
  check(await T('bl-premiere') === frDay(D1) && await T('bl-derniere') === frDay(D3) && await T('bl-fin') === frDay(FIN_DAY), `B2) période : première ${frDay(D1)}, dernière ${frDay(D3)}, fin ${frDay(FIN_DAY)} (brouillons et ligne retirée ignorés)`);
  // Heures
  check(await T('bl-heures-valid') === '20 h' && await T('bl-route') === '1 h' && await T('bl-heures-attente') === '6 h', `B3) heures validées 20 h (dont 1 h de route), en attente 6 h (brouillons) : ${await T('bl-heures-valid')} / ${await T('bl-route')} / ${await T('bl-heures-attente')}`);
  const persons = await p.locator('[data-testid=bl-salarie]').allInnerTexts();
  const pp = persons.map(norm);
  check(pp.length === 3 && pp[0].startsWith('Sam Girard 13 h') && /dont 1 h de route/.test(pp[0]) && /\+ 3 h en attente/.test(pp[0]) && pp[1].startsWith('Alex Roux 7 h') && pp[2].startsWith('Léa Petit —') && /\+ 3 h en attente/.test(pp[2]),
    `B3) par salarié : ${pp.join(' | ')}`);
  check(await T('bl-mo') === '520 €' && await p.locator('[data-testid=bl-taux]').count() === 1, 'B3) main-d’œuvre 520 € et « Taux horaire manquant : coût incomplet »');
  // Dépenses
  check(await T('bl-dep-total') === '1 100 €' && await T('bl-dep-materiaux') === '1 000 € (2)' && await T('bl-dep-location') === '150 €' && await T('bl-dep-autre') === '-50 €', `B4) dépenses : ${await T('bl-dep-total')} (Matériaux ${await T('bl-dep-materiaux')}, Location ${await T('bl-dep-location')}, Divers ${await T('bl-dep-autre')})`);
  // Réserves
  check(await T('bl-res-ouvertes') === '1' && await T('bl-res-levees') === '2' && /Joint à reprendre côté cuisine/.test(await T('bl-res-ligne')) && /Sam Girard/.test(await T('bl-res-ligne')), 'B5) réserves : 1 à lever (nommée, avec le texte), 2 levées (l’une par le salarié, l’autre par le bureau)');
  // Documents (le bureau voit les factures)
  const docs = await p.locator('[data-testid^=bl-doc-]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-testid'), e.textContent.trim()]));
  const dm = Object.fromEntries(docs);
  check(dm['bl-doc-total'] === '7' && dm['bl-doc-devis'] === '1' && dm['bl-doc-photo'] === '2' && dm['bl-doc-facture'] === '1' && dm['bl-doc-facture_payee'] === '1' && dm['bl-doc-sans_categorie'] === '1', `B6) documents : 7 au total, par catégorie, factures comprises pour le bureau (${JSON.stringify(dm)})`);
  // Budget
  check(await T('bl-bud-h') === '20 h / 40 h' && await T('bl-bud-h-pct') === '50 %' && await T('bl-bud-e') === '520 € / 1 600 €' && await T('bl-bud-e-pct') === '33 %', `B7) budget prévu / réel : ${await T('bl-bud-h')} (${await T('bl-bud-h-pct')}), ${await T('bl-bud-e')} (${await T('bl-bud-e-pct')})`);
  check(/1 620 €/.test(await T('bl-total')), 'B7) coût total (main-d’œuvre + dépenses) : 1 620 €');
  // Lecture seule
  const btns = await win(p).locator('button').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()));
  check(btns.every((t) => /fermer|close|plus d.infos|^$/i.test(t)), `B8) aucun bouton d’écriture dans le bilan (boutons : ${btns.map((t) => `« ${t} »`).join(', ') || 'aucun'})`);
  check(SB.writes.length === 0 && SB.setCalls.length === 0, 'B8) et aucune écriture n’est partie vers la base');
  check(!/Supprimer|Modifier|Enregistrer/.test(await win(p).innerText()), 'B8) aucun mot d’écriture dans la fenêtre');
  // Lectures : limitées à ce chantier, à l'ouverture
  if (process.env.DEBUG_REQ) console.log(SB.requests.join('\n'));
  const rd = SB.requests;
  check(SB.rpc.includes('my_worksite_labour') && rd.some((x) => /worksite_expenses.*worksite_id=eq\.w1/.test(x)) && rd.some((x) => /documents.*worksite_id=eq\.w1/.test(x)) && rd.some((x) => /time_entries.*worksite_id=eq\.w1/.test(x)), `F) le bilan lit ses données à l'OUVERTURE (labour, dépenses, documents, interventions du chantier) : ${rd.length} requêtes`);
  check((await noHScroll(p)).ok, 'B9) aucun défilement horizontal à 390 px');
  await win(p).evaluate((el) => { el.scrollTop = 0; });
  await p.screenshot({ path: `${SH}/03-bilan-haut.png` });
  await win(p).evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${SH}/04-bilan-bas.png` });
  const bilanVals = { h: await T('bl-heures-valid'), route: await T('bl-route'), budH: await T('bl-bud-h'), budPct: await T('bl-bud-h-pct') };
  await closeWin(p); await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  // C · « Coût chantiers » sur le MÊME jeu de données
  check(await step(p, ['.bt-pl-m-ibtn[aria-label="Menu"]']) && await step(p, ['.bt-mm-item', /Co[uû]t/]), 'C0) fenêtre « Coût chantiers » ouverte');
  await p.waitForSelector('.bt-cr-row', { timeout: 8000 }).catch(() => {});
  const rowCR = p.locator('.bt-cr-row', { hasText: 'Villa Dupont' }).first();
  const crH = norm(await rowCR.locator('.bt-cr-h').innerText());
  const crRoute = norm(await rowCR.locator('.bt-cr-route').innerText());
  const crBud = norm(await rowCR.locator('.bt-cr-budhead b').innerText());
  const crPct = norm(await rowCR.locator('.bt-cr-budpct').innerText());
  check(crH === bilanVals.h && crRoute.includes(bilanVals.route) && crBud === bilanVals.budH && crPct === bilanVals.budPct,
    `C1) même chiffres que « Coût chantiers » : heures ${crH} = ${bilanVals.h} ; route « ${crRoute} » ; budget ${crBud} = ${bilanVals.budH} ; ${crPct} = ${bilanVals.budPct}`);
  check(errs.filter((e) => !/Failed to load resource/.test(e)).length === 0, `B) aucune erreur de page (${errs.slice(0, 2).join(' | ') || 'aucune'})`);
  await ctx.close();
}

// B bis · bilan d'un chantier VIDE, d'un chantier en cours, d'une lecture qui échoue
{
  const SV = freshState({ time_entries: [], worksite_expenses: [], documents: [], labour: [] });
  const { ctx, p } = await newPage(SV, ADMIN, { width: 390, height: 844 });
  await loadAdmin(p);
  await openFiche(p, 'Atelier Petit');
  await p.waitForSelector('[data-testid=ct-bilan]', { timeout: 6000 });
  await p.locator('[data-testid=ct-bilan]').click();
  await p.waitForSelector('[data-testid=bilan]', { timeout: 8000 });
  const txt = norm(await win(p).innerText());
  check(/En cours/.test(txt) && /Aucune heure déclarée/.test(txt) && /Aucune dépense saisie/.test(txt) && /Aucune réserve déclarée/.test(txt) && /Aucun document rangé/.test(txt) && !/Budget prévu/.test(txt),
    'B10) chantier vide et en cours : « En cours », et un « Aucun… » par rubrique, pas de budget');
  check((await noHScroll(p)).ok, 'B10) pas de défilement horizontal');
  await ctx.close();
  const SE = freshState({ labourError: true });
  const e = await newPage(SE, ADMIN, { width: 390, height: 844 });
  await loadAdmin(e.p);
  await openFiche(e.p);
  await e.p.waitForSelector('[data-testid=ct-bilan]', { timeout: 6000 });
  await e.p.locator('[data-testid=ct-bilan]').click();
  await e.p.waitForSelector('[data-testid=bl-erreur]', { timeout: 8000 }).catch(() => {});
  check(/Bilan illisible/.test(norm(await win(e.p).innerText())) && !/\d+ h/.test(norm(await e.p.locator('[data-testid=bl-erreur]').innerText())), 'B11) heures illisibles : « Bilan illisible… mieux vaut rien qu’un chiffre faux » — aucun chiffre');
  await e.ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// D · AVANT LA MIGRATION : rien, sans message
// ════════════════════════════════════════════════════════════════════════════
for (const [label, extra] of [['fonction absente (404)', { ready: 'missing' }], ['réseau coupé', { ready: 'network' }], ['colonne absente', { column: false }], ['pas de réponse', { ready: 'hang' }]]) {
  const SD = freshState(extra);
  const { ctx, p, errs } = await newPage(SD, ADMIN, { width: 390, height: 844 });
  await loadAdmin(p);
  await openFiche(p);
  await p.waitForTimeout(1200);
  check(await p.locator('[data-testid=chantier-termine-bar]').count() === 0, `D) ${label} : ni bouton « Terminer », ni « Bilan », ni message dans la fiche`);
  check(await toasts(p, 'error') === 0 && !/Terminé|Bilan du chantier|Terminer le chantier/.test(norm(await p.locator('[role=dialog]').first().innerText())), `D) ${label} : aucun message d’erreur, la fiche est celle d’avant`);
  check(errs.filter((x) => !/Failed to load resource|ERR_FAILED|net::/.test(x)).length === 0, `D) ${label} : aucune erreur de page (${errs.filter((x) => !/Failed to load resource|ERR_FAILED|net::/.test(x)).slice(0, 2).join(' | ') || 'aucune'})`);
  check(!SD.rpc.includes('set_worksite_completed') && !SD.rpc.includes('my_worksite_labour'), `D) ${label} : aucune autre fonction appelée`);
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// E · MODE SUPPORT : lecture seule
// ════════════════════════════════════════════════════════════════════════════
{
  const SS = freshState({ support: true });
  SS.worksites = [{ ...WD(), completed_at: FIN_AT, completed_by: 'u-admin' }, WM(), WP(), WA()];
  const { ctx, p } = await newPage(SS, ADMIN, { width: 390, height: 844 });
  await loadAdmin(p);
  check(await p.locator('[data-testid=support-banner]').count() === 1, 'E0) le bandeau « Mode support · lecture seule » est là');
  await openFiche(p);
  await p.waitForSelector('[data-testid=ct-bilan]', { timeout: 6000 });
  const bar = await barText(p);
  check(/Terminé le/.test(bar) && /Bilan du chantier/.test(bar) && !/Rouvrir/.test(bar) && !/Terminer le chantier/.test(bar) && await p.locator('[data-testid=ct-terminer], [data-testid=ct-rouvrir]').count() === 0, `E1) support : le statut et le bilan se voient, AUCUN bouton d’écriture (« ${bar} »)`);
  await p.locator('[data-testid=ct-bilan]').click();
  await p.waitForSelector('[data-testid=bilan]', { timeout: 8000 });
  check(!SS.rpc.includes('my_worksite_labour') && await p.locator('[data-testid=bl-heures-support]').count() === 1, 'E2) support : les heures ne sont pas calculées avec la mauvaise entreprise (my_worksite_labour non appelée) et le bilan le dit');
  check(await p.locator('[data-testid=bl-total]').count() === 0 && (await p.locator('[data-testid=bl-dep-total]').innerText()) !== '' && SS.writes.length === 0, 'E2) support : pas de total inventé ; dépenses, réserves et documents se lisent ; aucune écriture');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// G · SALARIÉ, 390 px
// ════════════════════════════════════════════════════════════════════════════
const workerState = (extra = {}) => freshState({
  users: [SAM, ADMIN], worksites: [WD(), WM(), WP(), WA()], planning: [], active_sessions: [],
  // Sam a 4 h sur le chantier TERMINÉ aujourd'hui (envoyées) et 2 h de brouillon sur un chantier en cours.
  time_entries: [
    { ...te('s1', SAM, 'w2', today, '08:00', '12:00'), worksite: WM() },
    { ...te('s2', SAM, 'w1', today, '14:00', '16:00', { status: 'draft' }), worksite: WD() },
  ],
  ...extra,
});
const openDay = async (p) => { await p.goto(`${BASE}/poseur`); await p.waitForSelector('.bt-total', { timeout: 20000 }); await p.waitForTimeout(900); };
{
  const SW = workerState();
  const { ctx, p, errs } = await newPage(SW, SAM, { width: 390, height: 844 });
  await openDay(p);
  const cards = await p.locator('[data-testid=card-entry]').allInnerTexts();
  const cm = cards.map(norm).find((c) => c.includes('Maison Martin')) || '';
  check(cm.includes(`Terminé le ${frDay(FIN_DAY)}`) && cm.includes('4:00'), `G1) la carte du chantier terminé garde son nom et ses 4 h, avec « Terminé le ${frDay(FIN_DAY)} » : « ${cm.slice(0, 90)} »`);
  const other = cards.map(norm).find((c) => c.includes('Villa Dupont')) || '';
  check(other && !/Terminé/.test(other), 'G1) la carte d’un chantier en cours n’affiche rien de plus');
  check(/^6:00/.test(norm(await p.locator('.bt-total-big').first().innerText())), `G1) total du jour intact : 4 h (chantier terminé) + 2 h = ${norm(await p.locator('.bt-total-big').first().innerText())}`);
  await p.screenshot({ path: `${SH}/05-salarie-journee.png` });
  // « + » : nouvelle intervention
  await p.locator('button[aria-label="Ajouter un chantier"]').click();
  await p.waitForSelector('.bt-site', { timeout: 6000 });
  const names = (await p.locator('.bt-site .bt-site-name').allInnerTexts()).map(norm);
  check(names.includes('Villa Dupont') && names.includes('Atelier Petit') && names.includes('Autre chantier') && !names.includes('Maison Martin'), `G2) « + » : le chantier terminé n’est plus proposé (${names.join(', ')})`);
  await p.locator('.bt-site-search').fill('martin');
  await p.waitForTimeout(250);
  check(await p.locator('.bt-site').count() === 0 && /Aucun chantier trouvé/.test(await p.locator('.bt-ed').innerText()), 'G2) même en cherchant son nom : « Aucun chantier trouvé »');
  await p.locator('.bt-site-search').fill('');
  await p.screenshot({ path: `${SH}/06-salarie-choix-chantier.png` });
  check((await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)), 'G2) aucun défilement horizontal de la page');
  check(errs.filter((e) => !/Failed to load resource/.test(e)).length === 0, `G) aucune erreur de page (${errs.slice(0, 2).join(' | ') || 'aucune'})`);
  await ctx.close();
}
// G3 · pointage EN COURS sur le chantier terminé : continue normalement
{
  const SW = workerState({ active_sessions: [{ user_id: 'u-sam', company_id: CO, worksite_id: 'w2', planning_id: null, work_date: today, started_at: new Date(Date.now() - 95 * 60000).toISOString() }] });
  SW.finishCalls = [];
  const { ctx, p } = await newPage(SW, SAM, { width: 390, height: 844 });
  await openDay(p);
  const lt = norm(await p.locator('[data-testid=live-timer]').innerText().catch(() => ''));
  check(/Tu es pointé depuis/i.test(lt) && lt.includes('Maison Martin') && lt.includes(`Terminé le ${frDay(FIN_DAY)}`), `G3) pointage en cours sur un chantier terminé : le chrono tourne, nom et « Terminé le … » affichés (« ${lt.slice(0, 120)} »)`);
  const live = norm(await p.locator('[data-testid=card-live]').first().innerText().catch(() => ''));
  check(live.includes('Maison Martin') && live.includes('Terminé le'), `G3) la carte verte « en cours » montre aussi le chantier et sa date de fin`);
  SW.rpc.length = 0;
  await p.locator('[data-testid=lt-finish]').click();
  await p.waitForTimeout(1500);
  check(SW.rpc.some((x) => x === 'finish_active_session' || x === 'stop_active_session') && await toasts(p, 'error') === 0, 'G3) « Terminer ma journée » marche : la base est appelée, aucune erreur (le statut du chantier ne bloque rien)');
  await ctx.close();
}
// G4 · onglets Semaine / Historique : historique exact, « Terminé le … »
{
  const SW = workerState();
  const { ctx, p } = await newPage(SW, SAM, { width: 390, height: 844 });
  await openDay(p);
  await p.locator('button[aria-label="Mon compte et menu"]').click();
  await p.getByRole('menuitem', { name: 'Historique' }).click();
  await p.waitForSelector('h2:has-text("Historique")', { timeout: 10000 });
  await p.waitForTimeout(1200);
  const hist = norm(await p.locator('body').innerText());
  check(hist.includes('Maison Martin') && hist.includes(`Terminé le ${frDay(FIN_DAY)}`), 'G4) Historique : le chantier terminé garde ses lignes et affiche « Terminé le … »');
  await p.locator('button[aria-label="Mon compte et menu"]').click();
  await p.getByRole('menuitem', { name: 'Ma semaine' }).click();
  await p.waitForTimeout(1500);
  const wk = norm(await p.locator('body').innerText());
  check(wk.includes('Maison Martin') && /Terminé le/.test(wk), 'G4) Ma semaine : idem');
  await ctx.close();
}
// G5 · avant la migration (colonne absente) : tout est proposé, rien n'est ajouté
{
  const SW = workerState({ column: false });
  const { ctx, p } = await newPage(SW, SAM, { width: 390, height: 844 });
  await openDay(p);
  check(!/Terminé le/.test(norm(await p.locator('body').innerText())) && await p.locator('[data-testid=termine-le]').count() === 0, 'G5) avant la migration : aucun « Terminé le »');
  await p.locator('button[aria-label="Ajouter un chantier"]').click();
  await p.waitForSelector('.bt-site', { timeout: 6000 });
  const names = (await p.locator('.bt-site .bt-site-name').allInnerTexts()).map(norm);
  check(names.includes('Maison Martin') && names.includes('Villa Dupont'), `G5) avant la migration : tous les chantiers sont proposés comme avant (${names.join(', ')})`);
  await ctx.close();
}
// G6 · un salarié ne voit pas les factures ni les chiffres du bureau (le bilan n'existe pas pour lui)
{
  const SW = workerState();
  const { ctx, p } = await newPage(SW, SAM, { width: 390, height: 844 });
  await openDay(p);
  check(await p.locator('[data-testid=chantier-termine-bar], [data-testid=bilan], [data-testid=ct-terminer]').count() === 0 && !SW.rpc.includes('worksite_completion_ready') && !SW.rpc.includes('my_worksite_labour'),
    'G6) côté salarié : aucun bouton Terminer, aucun bilan, aucune lecture « prête » ni des heures du bureau');
  await ctx.close();
}

// G7 · le chef d'équipe (salarié) : « Mon équipe » ne propose pas non plus le chantier terminé
{
  const CHEF = u('u-chef', 'Chef', 'Équipe', 'lead');
  const SW = workerState({ users: [CHEF, SAM, ADMIN], time_entries: [{ ...te('s1', SAM, 'w2', today, '08:00', '12:00'), worksite: WM() }] });
  const { ctx, p } = await newPage(SW, CHEF, { width: 390, height: 844 });
  await openDay(p);
  await p.waitForSelector('[data-testid=team-day]', { timeout: 8000 }).catch(() => {});
  await p.locator('[data-testid=td-add]').click().catch(() => {});
  await p.waitForSelector('[data-testid=td-site]', { timeout: 5000 }).catch(() => {});
  const opts = (await p.locator('[data-testid=td-site] option').allInnerTexts()).map(norm);
  check(opts.includes('Villa Dupont') && opts.includes('Atelier Petit') && !opts.includes('Maison Martin'), `G7) chef d'équipe : nouvelle ligne → le chantier terminé n’est pas proposé (${opts.join(', ')})`);
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// H · Contrôle statique : aucune suppression ajoutée
// ════════════════════════════════════════════════════════════════════════════
{
  const files = ['lib/chantier-termine.ts', 'lib/chantier-termine-ready.ts', 'components/chantier-termine.tsx', 'components/chantier-termine-bar.tsx', 'components/termine-le.tsx',
    'supabase/functions/_shared/chantier-termine.ts', 'supabase/functions/_shared/chantier-statut.ts'];
  const bad = [];
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    if (/\.delete\(|\.remove\(|\bDELETE\b|\.truncate\(/.test(code)) bad.push(f);
  }
  check(bad.length === 0, `H) aucun appel de suppression (.delete() / .remove()) dans les fichiers du lot (${bad.join(', ') || 'aucun'})`);
}

await b.close(); srv.close();
console.log(`\n${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
