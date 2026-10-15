// Étape 3, livraison 3b-1 — OUVRIR un écran depuis l'assistant, sur les VRAIES pages /admin et /poseur (export statique, base Supabase SIMULÉE, horloge figée au
// mercredi 21 octobre 2026, 10:00 à Paris).
//
//   npm run build, puis
//   node scripts/tests/ouvrir-ecrans.mjs out /tmp/captures-ouvrir [port]        (SHOTS=1 pour garder des captures ; ONLY=a,b pour rejouer des parties)
//
// Pour CHAQUE ouvreur livré (25 du bureau, 2 du salarié), à 1280, 768 et 390 px : l'assistant répond par un lien `ouvrir:<id>?…`, un toucher sur le bouton de la réponse
// fait apparaître la fenêtre (ou la vue) attendue, pré-remplie quand le lien porte des valeurs, SANS AUCUNE ÉCRITURE à partir de l'apparition de la réponse (liste blanche
// de lectures, comme guides-bureau-lot7.mjs). Le crochet de test `window.__openLink` n'existe pas : on passe par le vrai bouton, comme la personne.
//   a) bureau, 25 ouvreurs × 3 largeurs ; b) salarié, 2 ouvreurs × 3 largeurs ; c) `auto` : sur 1280 la fenêtre s'ouvre seule, sous 1024 px un bouton ;
//   d) cas négatifs : id inventé / `__proto__` / `constructor`, lien du bureau sur /poseur (et l'inverse), mois hors clôture, fonction non activée, formulaire occupé (la saisie
//      est intacte), niveau 3 jamais ouvert d'office même si la réponse le demandait, clic sur « Clôturer » ou « Envoyer » dans les 700 ms ignoré ;
//   e) anciens liens et alias (`salaries`, `nouveau_client`, `salarie:<id>`, `ask:…`, `guide:<id>`) : continuent à marcher ;
//   f) 3 cas piégés (texte d'un PDF, note de réserve, nom de chantier) : la réponse du serveur n'ouvre aucun niveau 3 — prouvés côté serveur par etape3-ouvrir.test.ts ; ici le
//      NAVIGATEUR refuse d'ouvrir d'office un niveau 3 même si une réponse piégée porte `auto`.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
// playwright-core du projet s'il est là, sinon celui installé globalement avec playwright.
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = '/tmp/captures-ouvrir', PORT = '4433'] = process.argv;
if (process.env.SHOTS) fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const run = (n) => !process.env.ONLY || process.env.ONLY.split(',').includes(String(n));
let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Horloge figée et données (celles de guides-bureau-lot7.mjs, un peu étoffées) ─────────────────────────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', address: '12 rue des Lilas', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Martin', city: 'Vienne', is_active: true };
const WS = { w1: W1, w2: W2 };
const usr = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: null, estimated_end: null, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: `${work_date}T06:00:00Z`, ...extra });
const fresh = () => ({
  users: [usr('u-admin', 'Paul', 'Martin', 'admin'), usr('u-dupont', 'Jean', 'Dupont'), usr('u-martin', 'Léa', 'Martin'), usr('u-karim', 'Karim', 'Benali')],
  companies: [{ id: CO, name: 'Entreprise Exemple', ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: 'compta@exemple.fr', support_enabled: true, colleagues_planning_visible: false }],
  worksites: [W1, W2],
  planning: [slot('p1', 'u-dupont', D_(19), W1), slot('p2', 'u-dupont', D_(20), W1), slot('p3', 'u-dupont', D_(21), W1), slot('p4', 'u-martin', D_(20), W2), slot('p5', 'u-karim', D_(21), W1, { estimated_start: '08:00:00', estimated_end: '12:00:00' })],
  time_entries: [], active_sessions: [], month_closures: [], user_closures: [], leave_requests: [
    { id: 'lr1', company_id: CO, user_id: 'u-dupont', type: 'conge', status: 'pending', start_date: D_(26), end_date: D_(27), created_at: '2026-10-10T08:00:00Z' }],
  invitations: [], documents: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [], assistant_journal: [],
  planning_versions: [{ id: 'v1', company_id: CO, week_start: D_(19), number: 1, kind: 'initial', request: null, note: null, created_by: 'u-admin', created_at: '2026-10-19T05:30:00Z', cells: [], user_ids: [] }],
});
let D = fresh();
const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sessionDe = (id, email) => ({ access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id, email, aud: 'authenticated', role: 'authenticated' } });
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
const filterRows = (rows, params) => {
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
const embed = (row, sel) => {
  const out = { ...row };
  if (sel.includes('worksite:worksites')) out.worksite = row.worksite_id ? WS[row.worksite_id] : null;
  if (sel.includes('user:users')) out.user = D.users.find((x) => x.id === row.user_id) || null;
  return out;
};
// Toutes les requêtes qui partent : { method, path, rpc, fn, body }.
const calls = [];
let REPLY = { answer: 'Voici.', links: [] };    // ce que répondent `assistant` et `worker-assistant`
let DELAY = 0;                                   // la réponse de l'assistant se fait attendre (formulaire ouvert entre-temps)
let TRAININGS = [];                              // my_trainings (salarié)
let NO_TABLES = new Set();                       // tables « absentes » (migration pas passée) : la fonction qui en dépend se cache
const mark = () => calls.length;
// Les SEULES lectures par RPC (POST ou GET) que l'ouverture d'un écran a le droit de provoquer, nommées une à une.
const RPC_LECTURE = new Set(['my_worksite_labour', 'support_is_staff', 'support_my_companies', 'my_trainings', 'company_has_kiosk', 'document_category_ready']);
const FN_LECTURE = new Set(['assistant', 'worker-assistant']);   // la question posée à l'assistant ; rien d'autre (surtout pas `kiosk`)
/** Tout ce qui n'est pas une lecture : un échec. */
const ecritures = (from) => calls.slice(from).filter((c) => {
  if (c.path.startsWith('/auth/v1/token')) return false;
  if (c.rpc) return !RPC_LECTURE.has(c.rpc);
  if (c.fn) return !FN_LECTURE.has(c.fn);
  if (/\/auth\/v1\/factors/.test(c.path)) return true;
  return !['GET', 'HEAD'].includes(c.method);
});
async function setup(ctx, session) {
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    const rec = { method: m, path: url.pathname };
    if (url.pathname.startsWith('/rest/v1/rpc/')) rec.rpc = url.pathname.slice('/rest/v1/rpc/'.length);
    if (url.pathname.startsWith('/functions/v1/')) rec.fn = url.pathname.slice('/functions/v1/'.length);
    calls.push(rec);
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/assistant') || url.pathname.startsWith('/functions/v1/worker-assistant')) {
      if (DELAY) await sleep(DELAY);
      return r.fulfill({ json: { ...REPLY, remaining: 40 } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname === '/rest/v1/rpc/my_trainings') return r.fulfill({ json: TRAININGS });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', '');
    if (NO_TABLES.has(t)) return r.fulfill({ status: 404, json: { code: '42P01', message: `relation "public.${t}" does not exist` } });
    D[t] = D[t] || [];
    const sel = url.searchParams.get('select') || '*';
    const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    if (m === 'DELETE' || m === 'POST' || m === 'PATCH') return r.fulfill({ status: 201, json: single ? { id: 'x' } : [] });
    const all = filterRows(D[t], url.searchParams).map((x) => embed(x, sel));
    if (single) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const rows = all.slice(off, lim ? off + Number(lim) : undefined);
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
  });
}

const errors = [];
const SESSION_ADMIN = sessionDe('u-admin', 'paul@exemple.fr');
const SESSION_KARIM = sessionDe('u-karim', 'karim@exemple.fr');
const LARGEURS = [[1280, 800], [768, 1024], [390, 844]];
async function newPage(w, h, cote = 'bureau') {
  D = fresh(); NO_TABLES = new Set(); REPLY = { answer: 'Voici.', links: [] }; DELAY = 0;
  const mobile = w <= 500;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(mobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await setup(ctx, cote === 'bureau' ? SESSION_ADMIN : SESSION_KARIM);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { errors.push(e.message); console.log('   [erreur page]', e.message); });
  await ouvrirPage(p, cote, w);
  return { ctx, p };
}
async function ouvrirPage(p, cote, w) {
  if (cote === 'bureau') {
    await p.goto(`http://localhost:${PORT}/admin`);
    await p.waitForSelector(w <= 1023 ? '.bt-pl-m-card' : '[data-testid=stat-waiting]', { timeout: 20000 });
  } else {
    await p.goto(`http://localhost:${PORT}/poseur`);
    await p.waitForSelector('[data-testid=dock-assistant]', { timeout: 20000 });
  }
  await p.waitForTimeout(1800);                  // les fenêtres différées et lib/openers-<côté> sont chargés
}
const assistantBtn = (p, cote) => (cote === 'bureau' ? p.locator(':is([data-testid=bar-assistant],[data-testid=m-assistant]):visible').first() : p.locator('[data-testid=dock-assistant]'));
/** Demande à l'assistant ; la réponse (simulée) porte les liens donnés. Rend le bouton du premier lien. */
async function demander(p, cote, links, { answer = 'Voici.', auto = false, question = 'ouvre cet écran' } = {}) {
  REPLY = { answer, links, ...(cote === 'salarie' ? { kind: 'guide' } : {}), ...(auto ? { auto: true } : {}) };
  if ((await p.locator('.as-bar textarea').count()) === 0) { await assistantBtn(p, cote).click(); await p.waitForSelector('.as-bar textarea'); }
  const avant = await p.locator('.as-bot').count();
  const archives = () => calls.filter((c) => c.rpc === 'assistant_chat_append').length;
  const a0 = archives();
  await p.fill('.as-bar textarea', question);
  await p.click('button[aria-label="Envoyer"]');
  await p.waitForFunction((n) => document.querySelectorAll('.as-bot').length > n, avant, { timeout: 8000 });
  // L'historique du chat s'enregistre de lui-même juste après la réponse (c'est une écriture du chat, pas de l'ouvreur) : on l'attend AVANT de mesurer.
  for (let i = 0; i < 20 && archives() === a0; i++) await sleep(100);
}
const boutonLien = (p, i = 0) => p.locator('.as-bot .as-links').last().locator('button').nth(i);
const dlg = (p, nom) => p.getByRole('dialog', { name: nom }).first();
const visible = async (loc, ms = 4500) => { try { await loc.waitFor({ state: 'visible', timeout: ms }); return true; } catch { return false; } };
const shot = (p, nom) => (process.env.SHOTS ? p.screenshot({ path: `${SH}/${nom}.png` }) : Promise.resolve());
/** Ferme ce qui reste ouvert ; recharge si une navigation sans fenêtre (menu, mode sélection, panneau) traîne. */
async function remettre(p, cote, w) {
  for (let i = 0; i < 4 && (await p.locator('[role=dialog]').count()) > 0; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(220); }
  const reste = (await p.locator('[role=dialog]').count()) + (await p.locator('.bt-pl-ddbackdrop, [data-testid=sel-bar], [data-testid=relance-panel]').count());
  if (reste > 0) await ouvrirPage(p, cote, w);
}

// ─── Ce qu'on doit voir après chaque lien ────────────────────────────────────────────────────────────────────
// `lien` : l'action donnée par le serveur (valeurs comprises) ; `voir` : la fenêtre ou la vue ; `plus` : le pré-remplissage ou un détail à vérifier.
const valeurs = async (p, dialogue, v) => {
  const ok2 = [];
  for (const x of v) ok2.push(await dialogue.locator(`input[value="${x}"], textarea`).evaluateAll((els, val) => els.some((e) => e.value === val), x));
  return ok2.every(Boolean);
};
const BUREAU = [
  { id: 'salaries.liste', lien: 'ouvrir:salaries.liste?recherche=Jean', voir: (p) => dlg(p, /^Salariés/), plus: async (p, d) => valeurs(p, d, ['Jean']) },
  { id: 'salaries.importer', lien: 'ouvrir:salaries.importer', voir: (p) => dlg(p, /Importer des salariés/) },
  { id: 'clients.importer', lien: 'ouvrir:clients.importer', voir: (p) => dlg(p, /Importer des clients/) },
  { id: 'reserves.registre', lien: 'ouvrir:reserves.registre', voir: (p) => dlg(p, /Réserves de chantier/) },
  { id: 'conges.demandes', lien: 'ouvrir:conges.demandes', voir: (p) => dlg(p, /Demandes de congé/) },
  { id: 'stats.equipe', lien: 'ouvrir:stats.equipe', voir: (p) => dlg(p, /Statistiques/) },
  { id: 'planning.supprimees', lien: 'ouvrir:planning.supprimees', voir: (p) => dlg(p, /Interventions supprimées/) },
  { id: 'planning.versions', lien: 'ouvrir:planning.versions?lundi=2026-10-19', voir: (p) => dlg(p, /Versions du planning/), plus: async (p, d) => /19 oct|19 octobre|du 19/i.test(await d.innerText()) },
  { id: 'formations.gestion', lien: 'ouvrir:formations.gestion', voir: (p) => dlg(p, /^Formations/) },
  { id: 'abonnement.choisir', lien: 'ouvrir:abonnement.choisir', voir: (p) => p.locator('[data-testid=subscribe-dialog]') },
  { id: 'relances.liste', lien: 'ouvrir:relances.liste', voir: (p, w) => (w <= 1023 ? dlg(p, /À relancer/) : p.locator('[data-testid=relance-panel]')) },
  { id: 'planning.selection', lien: 'ouvrir:planning.selection', voir: (p) => p.locator('[data-testid=sel-bar]') },
  { id: 'clients.liste', lien: 'ouvrir:clients.liste', voir: (p, w) => (w <= 1023 ? dlg(p, /^Chantiers/) : p.locator('[data-guide="bureau-clients.nouveau"]:visible').first()) },
  { id: 'planning.semaine', lien: 'ouvrir:planning.semaine?lundi=2026-10-26', voir: (p) => p.locator('[data-guide="bureau-semaine.nav"]:visible').first(), plus: async (p) => /26/.test(await p.locator('body').innerText()) && /(2\d|0?\d)\s*(oct|nov)/i.test(await p.locator('body').innerText()) },
  { id: 'salarie.fiche', lien: 'ouvrir:salarie.fiche?salarie=u-dupont&mode=hours', voir: (p) => dlg(p, /Jean/) },
  { id: 'client.fiche', lien: 'ouvrir:client.fiche?chantier=w1', voir: (p) => dlg(p, /Fiche client/), plus: async (p, d) => valeurs(p, d, ['Villa Dupont']) },
  { id: 'chantier.documents', lien: 'ouvrir:chantier.documents?chantier=w1', voir: (p) => dlg(p, /Villa Dupont|Documents/) },
  { id: 'client.nouveau', lien: 'ouvrir:client.nouveau?nom=Maison%20Garnier&ville=Caluire&email=garnier%40exemple.fr', voir: (p) => dlg(p, /Nouveau client/), plus: async (p, d) => (await valeurs(p, d, ['Maison Garnier', 'Caluire', 'garnier@exemple.fr'])) && (await p.locator('[data-testid=pre-note]').count()) === 1, rien: true },
  { id: 'salarie.nouveau', lien: 'ouvrir:salarie.nouveau?prenom=Marc&nom=Durand&email=marc%40exemple.fr', voir: (p) => dlg(p, /Nouveau salarié/), plus: async (p, d) => (await valeurs(p, d, ['Marc', 'Durand', 'marc@exemple.fr'])) && (await p.locator('[data-testid=pre-note]').count()) === 1 },
  { id: 'export.equipe', lien: 'ouvrir:export.equipe?du=2026-10-12&au=2026-10-16', voir: (p) => dlg(p, /Exporter l.équipe/), plus: async (p, d) => /12 oct\.?\s*→\s*16 oct\.?\s*2026/i.test(await d.innerText()), niveau3: true },
  { id: 'cloture.mois', lien: 'ouvrir:cloture.mois?mois=2026-10', voir: (p) => dlg(p, /Clôturer octobre 2026/), niveau3: true },
  { id: 'planning.ajouter', lien: 'ouvrir:planning.ajouter?salarie=u-dupont&date=2026-10-22&chantier=w2&debut=08%3A30&fin=12%3A00&note=Pr%C3%A9voir%20l%E2%80%99%C3%A9chafaudage', voir: (p) => dlg(p, /Ajouter une intervention/),
    plus: async (p, d) => (await valeurs(p, d, ['Prévoir l’échafaudage'])) && /Maison Martin/.test(await d.innerText()) && (await p.locator('[data-testid=pre-note]').count()) === 1 },
  { id: 'salarie.statut', lien: 'ouvrir:salarie.statut?salarie=u-dupont&date=2026-10-22', voir: (p) => dlg(p, /Statut de Jean/) },
  { id: 'absence.poser', lien: 'ouvrir:absence.poser?salarie=u-dupont&type=conge&du=2026-10-26&au=2026-10-28', voir: (p) => dlg(p, /Congé — Jean/), plus: async (p, d) => /26 oct/i.test(await d.innerText()) && /28 oct\.? 2026/i.test(await d.innerText()) },
  { id: 'export.salarie', lien: 'ouvrir:export.salarie', voir: (p) => dlg(p, /Exporter un salarié/) },
];
const SALARIE = [
  { id: 'jour.date', lien: 'ouvrir:jour.date?date=2026-10-20', voir: (p) => p.getByText(/20 octobre|mardi 20/i).first(), plus: async (p) => /20/.test(await p.locator('body').innerText()) },
  { id: 'formations.ouvrir', lien: 'ouvrir:formations.ouvrir', voir: (p) => p.getByText('Port du harnais').first(), formations: true },
];

// ═══ a · bureau : chaque ouvreur à chaque largeur ═══════════════════════════════════════════════════════════
if (run('a')) {
  for (const [w, h] of LARGEURS) {
    const { ctx, p } = await newPage(w, h, 'bureau');
    for (const c of BUREAU) {
      const d0 = mark();
      await demander(p, 'bureau', [{ label: 'Ouvrir', action: c.lien }]);
      const avant = mark();
      await boutonLien(p).click();
      const cible = c.voir(p, w);
      const vu = await visible(cible);
      check(vu, `a · ${w}px ${c.id} : ${vu ? 'la fenêtre apparaît' : 'RIEN ne s’ouvre'}`);
      if (vu && c.plus) { const d = (await cible.count()) ? cible : p; check(await c.plus(p, d), `a · ${w}px ${c.id} : pré-rempli / détail attendu`); }
      if (w <= 1023) check((await p.locator('.as-bar textarea:visible').count()) === 0, `a · ${w}px ${c.id} : le panneau de l’assistant se replie sous 1024 px`);
      const e = ecritures(avant);
      check(e.length === 0, `a · ${w}px ${c.id} : aucune écriture${e.length ? ` — ${e.map((x) => `${x.method} ${x.path}`).join(' ; ')}` : ''}`);
      if (c.id === 'client.nouveau' || c.id === 'planning.ajouter') await shot(p, `${c.id}-${w}`);
      await remettre(p, 'bureau', w);
      if ((await p.locator('.as-bar textarea').count()) === 0 && w > 1023) { /* le panneau se rouvre à la demande suivante */ }
    }
    await ctx.close();
  }
}

// ═══ b · salarié ═══════════════════════════════════════════════════════════════════════════════════════════
if (run('b')) {
  for (const [w, h] of LARGEURS) {
    for (const c of SALARIE) {
      if (c.formations) TRAININGS = [{ id: 't1', title: 'Port du harnais', kind: 'video', video_url: 'https://exemple.fr/v', document_name: null, document_path: null, document_mime: null, created_at: '2026-10-01T08:00:00Z', seen_at: null }];
      else TRAININGS = [];
      const { ctx, p } = await newPage(w, h, 'salarie');
      await demander(p, 'salarie', [{ label: 'Ouvrir', action: c.lien }], { question: 'ouvre cet écran' });
      const avant = mark();
      await boutonLien(p).click();
      const vu = await visible(c.voir(p));
      check(vu, `b · ${w}px ${c.id} : ${vu ? 'la vue apparaît' : 'RIEN ne s’ouvre'}`);
      if (vu && c.plus) check(await c.plus(p), `b · ${w}px ${c.id} : détail attendu`);
      const e = ecritures(avant);
      check(e.length === 0, `b · ${w}px ${c.id} : aucune écriture${e.length ? ` — ${e.map((x) => `${x.method} ${x.path}`).join(' ; ')}` : ''}`);
      await shot(p, `salarie-${c.id}-${w}`);
      await ctx.close();
    }
  }
}

// ═══ c · ouvrir SANS toucher (`auto`) ══════════════════════════════════════════════════════════════════════
if (run('c')) {
  for (const [w, h] of LARGEURS) {
    const { ctx, p } = await newPage(w, h, 'bureau');
    await demander(p, 'bureau', [{ label: 'Réserves', action: 'ouvrir:reserves.registre' }], { auto: true, answer: 'J’ouvre « Réserves ».', question: 'ouvre les réserves' });
    const s = await visible(dlg(p, /Réserves de chantier/), w > 1023 ? 4000 : 1500);
    if (w > 1023) check(s, `c · ${w}px : le serveur dit auto → la fenêtre s’ouvre toute seule, le panneau reste visible (${await p.locator('.as-bar textarea:visible').count() === 1})`);
    else check(!s, `c · ${w}px : sous 1024 px, auto ne s’ouvre pas : un bouton (la réponse reste affichée)`);
    if (w <= 1023) { await boutonLien(p).click(); check(await visible(dlg(p, /Réserves de chantier/)), `c · ${w}px : le bouton ouvre la fenêtre`); }
    await ctx.close();
  }
}

// ═══ d · cas négatifs ══════════════════════════════════════════════════════════════════════════════════════
if (run('d')) {
  const MSG_INCONNU = /Je ne peux pas ouvrir cet écran depuis cette page/;
  const MSG_OCCUPE = /Terminez ou fermez la fenêtre en cours/;
  const MSG_INDISPO = /pas disponible ici/;
  const { ctx, p } = await newPage(1280, 800, 'bureau');
  const aucuneFenetre = async () => (await p.locator('[role=dialog]').count()) === 0;
  const essai = async (action, attendu, label, opts = {}) => {
    await demander(p, 'bureau', [{ label: 'Essai', action }], opts);
    const avant = mark();
    const n = await p.locator('.as-bot').count();
    await boutonLien(p).click();
    await p.waitForTimeout(500);
    const texte = await p.locator('.as-bot').last().innerText();
    check(attendu.test(texte) && (await aucuneFenetre()), `d · ${label} : « ${texte.replace(/\s+/g, ' ').slice(0, 90)} »`);
    check(ecritures(avant).length === 0, `d · ${label} : aucune écriture`);
    return n;
  };
  // Ids inventés, prototypes, longueurs, autre côté.
  await essai('ouvrir:__proto__', MSG_INCONNU, 'ouvrir:__proto__');
  await essai('ouvrir:constructor.x', MSG_INCONNU, 'ouvrir:constructor.x');
  await essai('ouvrir:inconnu.ecran', MSG_INCONNU, 'id inventé');
  await essai('ouvrir:salaries.liste' + '?recherche=' + 'a'.repeat(400), MSG_INCONNU, 'lien de plus de 200 caractères');
  await essai('ouvrir:jour.date?date=2026-10-20', MSG_INCONNU, 'un écran du SALARIÉ sur la page du bureau');
  await essai('ouvrir:', MSG_INCONNU, 'ouvrir: vide');
  // Valeurs invalides : l'écran s'ouvre quand même, sans la valeur (jamais devinée).
  {
    await demander(p, 'bureau', [{ label: 'Essai', action: 'ouvrir:salaries.liste?recherche=%3Cscript%3E&__proto__=x&constructor=y&inconnue=1' }]);
    await boutonLien(p).click();
    const vu = await visible(dlg(p, /^Salariés/));
    check(vu, 'd · valeurs étrangères (__proto__, constructor, inconnue) : l’écran s’ouvre');
    check(vu && !(await dlg(p, /^Salariés/).innerHTML()).includes('<script'), 'd · aucun balisage injecté par un texte de lien');
    await remettre(p, 'bureau', 1280);
  }
  // Mois hors des deux mois clôturables ; id inventé de salarié.
  await essai('ouvrir:cloture.mois?mois=2026-07', MSG_INDISPO, 'clôture d’un mois hors des deux clôturables');
  await essai('ouvrir:salarie.fiche?salarie=inconnu-1', MSG_INDISPO, 'fiche d’un salarié qui n’est pas de l’entreprise');
  // Fonction non activée : les versions du planning (table absente), puis la borne (kiosk_enabled faux).
  {
    await p.close(); await ctx.close();
  }
  {
    const w = 1280; D = fresh(); NO_TABLES = new Set(['planning_versions']);
    const c2 = await b.newContext({ viewport: { width: w, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await setup(c2, SESSION_ADMIN); const q = await c2.newPage(); q.on('pageerror', (e) => errors.push(e.message));
    await ouvrirPage(q, 'bureau', w);
    await demander(q, 'bureau', [{ label: 'Versions', action: 'ouvrir:planning.versions' }]);
    await boutonLien(q).click(); await q.waitForTimeout(500);
    const t = await q.locator('.as-bot').last().innerText();
    check(MSG_INDISPO.test(t) && (await q.locator('[role=dialog]').count()) === 0, `d · versions du planning sans la table : « ${t.replace(/\s+/g, ' ').slice(0, 80)} »`);
    await c2.close();
  }
  // Formulaire occupé : la saisie est intacte. La réponse de l'assistant (auto) arrive pendant qu'on remplit « Nouveau client ».
  {
    const w = 1280;
    const { ctx: c4, p: r } = await newPage(w, 800, 'bureau');
    DELAY = 1800; REPLY = { answer: 'J’ouvre « Réserves ».', links: [{ label: 'Réserves', action: 'ouvrir:reserves.registre' }], auto: true };
    await assistantBtn(r, 'bureau').click(); await r.waitForSelector('.as-bar textarea');
    await r.fill('.as-bar textarea', 'ouvre les réserves'); await r.click('button[aria-label="Envoyer"]');
    // Pendant que l'assistant réfléchit, la personne ouvre « Nouveau client » et tape.
    await r.click('[data-guide="bureau-nav.clients"]'); await r.click('[data-guide="bureau-clients.nouveau"]');
    const f = dlg(r, /Nouveau client/); await f.waitFor({ state: 'visible' });
    await f.locator('input').first().fill('Saisie en cours');
    await r.waitForFunction(() => document.querySelectorAll('.as-bot').length > 0, null, { timeout: 8000 });
    await r.waitForTimeout(500);
    check(await f.locator('input').first().inputValue() === 'Saisie en cours' && (await r.getByRole('dialog', { name: /Réserves/ }).count()) === 0, 'd · formulaire occupé : la saisie est intacte, la fenêtre des réserves ne s’ouvre pas');
    check(MSG_OCCUPE.test(await r.locator('.as-bot').last().innerText()), 'd · formulaire occupé : l’assistant le dit (« terminez ou fermez la fenêtre en cours »)');
    await c4.close();
  }
  // Niveau 3 : même si une réponse piégée porte `auto`, le navigateur n'ouvre jamais d'office une fenêtre qui exporte ou clôture.
  {
    const { ctx: c5, p: q } = await newPage(1280, 800, 'bureau');
    for (const [id, lien, nom] of [['export.equipe', 'ouvrir:export.equipe?du=2026-10-12&au=2026-10-16', /Exporter l.équipe/], ['cloture.mois', 'ouvrir:cloture.mois?mois=2026-10', /Clôturer/]]) {
      await demander(q, 'bureau', [{ label: 'Piège', action: lien }], { auto: true, answer: 'J’ouvre.', question: 'résume ce document' });
      await q.waitForTimeout(900);
      check((await q.getByRole('dialog', { name: nom }).count()) === 0, `d/f · niveau 3 « ${id} » : jamais ouvert d’office, même si la réponse porte auto`);
      await boutonLien(q).click();
      check(await visible(dlg(q, nom)), `d/f · niveau 3 « ${id} » : le bouton, lui, l’ouvre (la personne a touché)`);
      await remettre(q, 'bureau', 1280);
    }
    await c5.close();
  }
  // Niveau 3 : les clics qui exportent ou clôturent sont ignorés pendant 700 ms (le bouton se retrouve sous le doigt).
  {
    const { ctx: c6, p: q } = await newPage(1280, 800, 'bureau');
    await demander(q, 'bureau', [{ label: 'Clôture', action: 'ouvrir:cloture.mois?mois=2026-10' }]);
    const avant = mark();
    await boutonLien(q).click();
    const d = dlg(q, /Clôturer octobre 2026/); await d.waitFor({ state: 'visible' });
    await d.getByRole('button', { name: 'Clôturer' }).click({ force: true }); // un double toucher, tout de suite
    await q.waitForTimeout(250);
    check(ecritures(avant).length === 0 && (await d.count()) === 1, 'd · clôture : un clic dans les 700 ms n’écrit rien et ne ferme pas la confirmation');
    await q.keyboard.press('Enter'); await q.waitForTimeout(200);
    check(ecritures(avant).length === 0, 'd · clôture : Entrée sans effet');
    await q.keyboard.press('Escape');
    await demander(q, 'bureau', [{ label: 'Export', action: 'ouvrir:export.equipe?du=2026-10-12&au=2026-10-16' }]);
    const avant2 = mark();
    await boutonLien(q).click();
    const e = dlg(q, /Exporter l.équipe/); await e.waitFor({ state: 'visible' });
    await e.locator('[data-testid=send-accountant]').click({ force: true });
    await q.waitForTimeout(250);
    check(calls.slice(avant2).filter((x) => x.method !== 'GET' && x.method !== 'HEAD').length === 0 && calls.slice(avant2).filter((x) => /time_entries/.test(x.path)).length === 0, 'd · export : « Envoyer au comptable » touché dans les 700 ms ne lit ni n’écrit rien');
    await c6.close();
  }
  // Un salarié ne reçoit jamais un écran du bureau : sur /poseur, tout lien du bureau est refusé.
  {
    const { ctx: c7, p: q } = await newPage(390, 844, 'salarie');
    for (const lien of ['ouvrir:salaries.liste', 'ouvrir:reglages.entreprise', 'ouvrir:export.equipe?du=2026-10-12', 'ouvrir:__proto__', 'ouvrir:constructor.prototype']) {
      await demander(q, 'salarie', [{ label: 'Essai', action: lien }]);
      const avant = mark();
      await boutonLien(q).click(); await q.waitForTimeout(400);
      const t = await q.locator('.as-bot').last().innerText();
      check(MSG_INCONNU.test(t) && (await q.locator('[role=dialog]').count()) === 0 && ecritures(avant).length === 0, `d · salarié : « ${lien} » refusé (« ${t.replace(/\s+/g, ' ').slice(0, 70)} »)`);
    }
    await c7.close();
  }
}

// ═══ e · les anciens liens marchent toujours ═══════════════════════════════════════════════════════════════
if (run('e')) {
  const { ctx, p } = await newPage(1280, 800, 'bureau');
  for (const [action, nom] of [['salaries', /^Salariés/], ['nouveau_client', /Nouveau client/], ['nouveau_salarie', /Nouveau salarié/], ['couts', /Coût|Heures et coût/], ['conges', /Demandes de congé/], ['import_clients', /Importer des clients/], ['reserves', /Réserves de chantier/], ['export', /Exporter l.équipe/], ['reglages', /Réglages|Paramètres/], ['salarie:u-dupont', /Jean/]]) {
    await demander(p, 'bureau', [{ label: 'Ancien lien', action }]);
    await boutonLien(p).click();
    check(await visible(dlg(p, nom)), `e · ancien lien « ${action} » : toujours ouvert par le code d’avant`);
    await remettre(p, 'bureau', 1280);
  }
  await demander(p, 'bureau', [{ label: 'Guide', action: 'guide:constructor' }, { label: 'Question', action: 'ask:Combien d’heures ?' }]);
  await boutonLien(p, 0).click(); await p.waitForTimeout(300);
  check((await p.locator('[role=dialog]').count()) === 0 && (await p.locator('[data-testid=guide-card]').count()) === 0, 'e · guide:constructor : rien');
  const n = await p.locator('.as-me').count();
  await boutonLien(p, 1).click(); await p.waitForFunction((k) => document.querySelectorAll('.as-me').length > k, n, { timeout: 5000 }).catch(() => {});
  check((await p.locator('.as-me').count()) > n, 'e · ask:… : la question est posée à l’assistant');
  await ctx.close();
  for (const [action, ok1] of [['semaine', /semaine|Sem/i], ['historique', /Historique|jour/i], ['mois', /mois|octobre/i]]) {
    const s = await newPage(390, 844, 'salarie');
    await demander(s.p, 'salarie', [{ label: 'Ancien lien', action }]);
    await boutonLien(s.p).click(); await s.p.waitForTimeout(600);
    check(ok1.test(await s.p.locator('body').innerText()) && (await s.p.locator('.as-bar textarea:visible').count()) === 0, `e · salarié, ancien lien « ${action} » : toujours ouvert (et le panneau se replie, comme avant)`);
    await s.ctx.close();
  }
}

// ═══ f · aucun crochet de test dans le build, aucune erreur JS ════════════════════════════════════════════
check(errors.length === 0, `aucune erreur JavaScript pendant tout le test (${errors.length}${errors.length ? ` : ${errors.slice(0, 3).join(' | ')}` : ''})`);
{
  const { ctx, p } = await newPage(1280, 800, 'bureau');
  check(await p.evaluate(() => typeof window.__openLink === 'undefined'), 'build de production : pas de window.__openLink');
  await ctx.close();
}
console.log(`\n${ok} ✅  ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
