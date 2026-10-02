// Lancer : node scripts/tests/admin-lot11.mjs out docs/captures-lot11 (après npm run build).
// Lot 11 — bureau, sur la VRAIE page planning (base simulée AVEC état, horloge figée au
// mercredi 21 octobre 2026, 10:00 à Paris) :
//  1) cockpit : 2 indicateurs seulement (🟠 « À relancer » = mois en cours, 📎 « Pièces ») ;
//     bandeau = somme des pastilles ; jours d'avant le 1er du mois et jours clôturés d'un
//     salarié (user_closures) exclus ; « Relancer » sur chaque ligne → send-push ; « ✓ relancé ».
//  2) case verte « en cours » toujours là (vrai pointage), sans compteur « en direct ».
//  3) « Sélectionner » : bulles envoyées / brouillon / en cours / absences / ajoutées par le
//     salarié NON cochables (🔒) ; « Tout sélectionner » = la semaine ; clic jour / nom ;
//     « Supprimer (N) » → DELETE ; carte « Annuler » (reste jusqu'à ✕) → upsert des MÊMES lignes ;
//     une case retirée par le salarié (ligne 'cancelled') : 🔒, jamais « à relancer » ; retirée
//     PENDANT la sélection, elle est gardée à l'effacement et c'est dit.
//  4) fenêtre d'intervention : « Supprimer » + « Annuler » ; « Horaire prévu » début – fin
//     (« 14h » → 14:00, liste au quart d'heure, préréglages, fin sans début refusée, fin avant
//     début refusée, enregistrement début + fin), plus aucune roulette ; même chose à l'ajout.
//  5) « Exporter » ouvre directement l'export de l'équipe (menu PDF / Excel / CSV, lien
//     « Un seul salarié ? ») ; « Coût chantiers » : carte « Heures » = somme des lignes.
//  6) aucune fenêtre de cette zone ne défile en largeur (1280, 1024, 390) ; la barre tient sur
//     une ligne à 1024 avec « Sélectionner », même avec des congés en attente et 12 réserves ; mobile : 2 puces, liste « À relancer », sélection
//     du jour ; zéro mutation sur un sondage de 30 s / 60 s (mode normal ET mode sélection).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '4411'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) ─────────────────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const TODAY = '2026-10-21';
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const ago = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();
const hhmm = (iso) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

// ─── Base simulée (avec état) ────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', address: '12 rue des Lilas', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Garnier', city: 'Vienne', is_active: true };
const WS = { w1: W1, w2: W2 };
const u = (id, first, last, role = 'worker', is_active = true) => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active, created_at: '2026-01-01' });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: null, estimated_end: null, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: `${work_date}T06:00:00Z`, ...extra });
const entry = (id, user_id, work_date, ws, status, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date, worksite_id: ws?.id ?? null, planning_id: null, status, start_time: '08:00:00', end_time: `${String(8 + Math.floor(minutes / 60)).padStart(2, '0')}:00:00`, total_minutes: minutes, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, ...extra });
const sKevin = { user_id: 'u-kevin', company_id: CO, worksite_id: 'w1', planning_id: 'pk-wed', work_date: TODAY, started_at: ago(2), positions: [] };
const LONG_MAIL = 'comptabilite.cabinet-dupont-et-associes@expertise-comptable-lyonnaise.fr';
const COMPANY = { id: CO, name: 'Mister Grill Kebab', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: LONG_MAIL };
const PLANNING0 = [
  // Kevin : lun. sans heures (cochable) + lun. brouillon, mar. envoyé, mer. en cours, jeu. cochable ; 2 jours dus début octobre, 1 en septembre (hors mois)
  slot('pk-mon', 'u-kevin', D_(19), W1), slot('pk-mon2', 'u-kevin', D_(19), W2), slot('pk-tue', 'u-kevin', D_(20), W1, { estimated_start: '08:00:00', estimated_end: '17:00:00' }),
  slot('pk-wed', 'u-kevin', TODAY, W1), slot('pk-thu', 'u-kevin', D_(22), W2),
  slot('pk-o5', 'u-kevin', D_(5), W1), slot('pk-o6', 'u-kevin', D_(6), W1), slot('pk-s30', 'u-kevin', '2026-09-30', W1),
  // Sara : absente lun.→mer., ven. cochable ; 1 jour dû
  ...[19, 20, 21].map((d) => slot(`ps-abs${d}`, 'u-sara', D_(d), null, { absence_type: 'maladie' })),
  slot('ps-fri', 'u-sara', D_(23), W2), slot('ps-o8', 'u-sara', D_(8), W2),
  // Marc : jeu. cochable ; LUNDI (passé) retiré par le salarié (ligne 'cancelled') → 🔒, rien de dû : à jour
  slot('pm-thu', 'u-marc', D_(22), W1), slot('pm-mon', 'u-marc', D_(19), W1),
  // Léa : mer. envoyé ; mar. ajouté par le salarié (brouillon) → 1 jour dû
  slot('pl-wed', 'u-lea', TODAY, W1), slot('pl-tue', 'u-lea', D_(20), W2, { added_by_worker: true }),
  // Nina : lun. + mar. sans heures → 2 jours dus, cochables
  slot('pn-mon', 'u-nina', D_(19), W2, { notes: 'code portail 1234', estimated_start: '08:00:00', estimated_end: '12:00:00' }), slot('pn-tue', 'u-nina', D_(20), W2),
  // Tom : clôturé jusqu'au 16/10 → les 12 et 14 ne comptent plus ; lun. 19 dû ; ven. cochable
  slot('pt-o12', 'u-tom', D_(12), W1), slot('pt-o14', 'u-tom', D_(14), W1), slot('pt-mon', 'u-tom', D_(19), W1), slot('pt-fri', 'u-tom', D_(23), W1),
  // désactivé et bureau : jamais comptés
  slot('po-15', 'u-old', D_(15), W1), slot('pa-15', 'u-admin', D_(15), W1),
];
const EXPECTED = { 'Kevin Roussel': 3, 'Sara Benali': 1, 'Léa Petit': 1, 'Nina Morel': 2, 'Tom Garcia': 1 };
const EXPECTED_WAITING = Object.values(EXPECTED).reduce((a, n) => a + n, 0); // 8
const SELECTABLE = ['pk-mon', 'pk-thu', 'ps-fri', 'pm-thu', 'pn-mon', 'pn-tue', 'pt-mon', 'pt-fri'];
const LOCKED = ['pk-mon2', 'pk-tue', 'pk-wed', 'pl-wed', 'pl-tue', 'pm-mon'];
const fresh = () => ({
  users: [u('u-admin', 'Paul', 'Martin', 'admin'), u('u-kevin', 'Kevin', 'Roussel'), u('u-sara', 'Sara', 'Benali'), u('u-marc', 'Marc', 'Durand'), u('u-lea', 'Léa', 'Petit'), u('u-nina', 'Nina', 'Morel'), u('u-tom', 'Tom', 'Garcia'), u('u-old', 'Ancien', 'Compte', 'worker', false)],
  companies: [{ ...COMPANY }],
  worksites: [W1, W2],
  planning: JSON.parse(JSON.stringify(PLANNING0)),
  time_entries: [
    entry('e1', 'u-kevin', D_(20), W1, 'submitted', 480, { planning_id: 'pk-tue', reception: 'avec', reserve_fixed_at: '2026-10-20T16:00:00Z', reserve_fix_note: 'repris' }),
    entry('e2', 'u-kevin', D_(19), W2, 'draft', 120, { planning_id: 'pk-mon2' }),
    entry('e3', 'u-lea', TODAY, W1, 'submitted', 180, { planning_id: 'pl-wed' }),
    entry('e4', 'u-lea', D_(20), W2, 'draft', 240, { planning_id: 'pl-tue' }),
    entry('e5', 'u-marc', D_(19), W1, 'cancelled', 0, { planning_id: 'pm-mon' }), // retirée par le salarié
    entry('e6', 'u-marc', TODAY, W2, 'submitted', 120), // ajouté par le salarié (sans planning)
    entry('e7', 'u-lea', D_(14), W1, 'submitted', 60, { reception: 'avec', reserve_fixed_at: '2026-10-15T09:00:00Z' }), // réserve levée par le salarié
    entry('e8', 'u-nina', D_(13), W2, 'submitted', 60, { reception: 'avec' }), // réserve ouverte
  ],
  active_sessions: [sKevin],
  month_closures: [{ company_id: CO, month: '2026-09-01' }],
  user_closures: [{ user_id: 'u-tom', company_id: CO, closed_until: '2026-10-16', closed_at: '2026-10-16T17:00:00Z', closed_by: 'u-admin', reopened_at: null }],
  leave_requests: [], invitations: [], documents: [{ id: 'd1', company_id: CO, worksite_id: 'w1', label: 'Plan', file_name: 'plan.pdf', mime_type: 'application/pdf', work_date: D_(19), created_at: '2026-10-19T08:00:00Z' }],
  certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [],
});
let D = fresh();
const LABOUR = [
  { worksite_id: 'w1', user_id: 'u-kevin', worked_minutes: 450, route_minutes: 30, paid_minutes: 480, cost: 0, unpriced_minutes: 480 },
  { worksite_id: 'w2', user_id: 'u-nina', worked_minutes: 300, route_minutes: 0, paid_minutes: 300, cost: 0, unpriced_minutes: 300 },
  { worksite_id: 'w2', user_id: 'u-lea', worked_minutes: 225, route_minutes: 15, paid_minutes: 240, cost: 0, unpriced_minutes: 240 },
];

// ─── Session simulée (expire par rapport à l'horloge figée) + routes Supabase ───
const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: 'u-admin', email: 'paul@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
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
const embed = (t, row, sel) => {
  const out = { ...row };
  if (t === 'planning') {
    if (sel.includes('worksite:worksites')) out.worksite = row.worksite_id ? WS[row.worksite_id] : null;
    if (sel.includes('user:users')) out.user = D.users.find((x) => x.id === row.user_id) || null;
  }
  return out;
};
const log = { writes: [], pushes: [], liveGets: 0, extrasGets: 0 };
let seq = 0;
const setup = async (ctx) => {
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/send-push')) { log.pushes.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ json: { sent: 1 } }); }
    if (url.pathname.startsWith('/functions/v1/')) { log.writes.push(`FN ${url.pathname}`); return r.fulfill({ json: {} }); }
    if (url.pathname === '/rest/v1/rpc/my_worksite_labour') return r.fulfill({ json: LABOUR });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', ''); D[t] = D[t] || [];
    const sel = url.searchParams.get('select') || '*';
    const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    if (m === 'DELETE') {
      const gone = filterRows(D[t], url.searchParams); D[t] = D[t].filter((x) => !gone.includes(x));
      log.writes.push({ m, t, ids: gone.map((x) => x.id) });
      return r.fulfill({ json: gone.map((x) => ({ id: x.id })) });
    }
    if (m === 'POST') {
      const body = JSON.parse(r.request().postData() || '[]'); const arr = Array.isArray(body) ? body : [body];
      const saved = arr.map((row) => { const x = { id: row.id || `new-${++seq}`, ...row }; const i = D[t].findIndex((y) => y.id === x.id); if (i >= 0) D[t][i] = x; else D[t].push(x); return x; });
      log.writes.push({ m, t, rows: arr });
      return r.fulfill({ status: 201, json: single ? saved[0] : saved });
    }
    if (m === 'PATCH') {
      const body = JSON.parse(r.request().postData() || '{}');
      const hit = filterRows(D[t], url.searchParams); for (const x of hit) Object.assign(x, body);
      log.writes.push({ m, t, ids: hit.map((x) => x.id), body });
      return r.fulfill({ json: [] });
    }
    if (t === 'active_sessions') log.liveGets++;
    if (t === 'companies' && sel.includes('logo_url')) log.extrasGets++;
    const all = filterRows(D[t], url.searchParams).map((x) => embed(t, x, sel));
    if (single) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    // Pagination (fetchAllPaged : offset / limit) — sinon la lecture paginée boucle.
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const rows = all.slice(off, lim ? off + Number(lim) : undefined);
    // (content-range exposé au navigateur : c'est lui qui porte les comptes « count: exact ».)
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
  });
};
const writesSince = (n) => log.writes.slice(n);

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const vis = (p, sel) => p.locator(`${sel}:visible`);
const newPage = async (w, h, mobile = false) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(mobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await setup(ctx); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector(mobile ? '.bt-pl-m-card' : '[data-testid=stat-waiting]', { timeout: 20000 }); await p.waitForTimeout(1800);
  return { ctx, p };
};
const row = (p, name) => p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: name }) }).first();
const bub = (p, id) => p.locator(`[data-pid="${id}"]:visible`).first();
const selCount = async (p) => Number(((await p.locator('[data-testid=sel-count]').innerText()).match(/\d+/) || [])[0]);
/** Aucune fenêtre ne défile en largeur, rien ne dépasse de son cadre ni de l'écran. */
const dialogFits = (p) => p.evaluate(() => {
  const d = [...document.querySelectorAll('[role=dialog]')].pop(); if (!d) return { ok: false, why: 'pas de fenêtre' };
  const r = d.getBoundingClientRect();
  const over = [...d.querySelectorAll('*')].filter((e) => {
    const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || s.position === 'absolute' && e.classList.contains('sr-only')) return false;
    const x = e.getBoundingClientRect(); return x.width > 0 && x.height > 0 && (x.right > r.right + 1 || x.left < r.left - 1);
  }).map((e) => `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ').slice(0, 2).join('.')}`);
  return { ok: d.scrollWidth <= d.clientWidth + 1 && over.length === 0 && r.left >= -1 && r.right <= innerWidth + 1, sw: d.scrollWidth, cw: d.clientWidth, over: over.slice(0, 4) };
});
const fitMsg = (f) => (f.ok ? '' : ` [${f.why || `scroll ${f.sw}/${f.cw} ${f.over.join(', ')}`}]`);

// ─── Mesure des redessins (comme admin-lot10) ─────────────────────────────────────
const startObs = (pg) => pg.evaluate(() => {
  window.__muts = [];
  window.__obs = new MutationObserver((list) => { for (const m of list) window.__muts.push({ type: m.type, attr: m.attributeName, t: (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.className?.toString().slice(0, 60) }); });
  window.__obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
});
const takeMuts = async (pg) => {
  const m = await pg.evaluate(() => { const x = window.__muts; window.__muts = []; return x; });
  for (const x of m.slice(0, 8)) console.log(`     · ${x.type}${x.attr ? ` ${x.attr}` : ''} .${x.t}`);
  return m;
};
/** Laisse se fermer les toasts (sonner) avant une mesure : 8 s d'horloge, puis le temps du rendu. */
const settle = async (pg) => { await pg.clock.fastForward(8000); await pg.waitForTimeout(1200); };

// ═══ 1–4) Bureau 1440×900 ════════════════════════════════════════════════════════
{
  const { ctx, p } = await newPage(1440, 900);

  // 1) Cockpit : deux indicateurs
  const stats = await p.locator('.bt-pl-cockpit .bt-pl-stat').count();
  check(stats === 2, `1) cockpit : ${stats} indicateurs (attendu 2 : « À relancer », « Pièces »)`);
  check(await p.locator('[data-testid=stat-hours], [data-testid=stat-live], [data-testid=m-stat-hours], [data-testid=m-stat-live]').count() === 0, '1) plus de « h validées » ni de « en direct » (ordinateur et mobile)');
  check(await p.locator('.bt-pl-bar button', { hasText: 'Salariés' }).count() === 1, '1) le bouton « Salariés » reste dans la barre');
  const waitTxt = (await p.locator('[data-testid=stat-waiting]').innerText()).replace(/\s+/g, ' ').replace('▾', '').trim();
  const waitN = Number((waitTxt.match(/^(\d+)/) || [])[1]);
  check(/^\d+ j à relancer$/.test(waitTxt), `1) libellé : « ${waitTxt} »`);
  const pastilles = await vis(p, '[data-testid=row-waiting]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-days'))));
  const sum = pastilles.reduce((a, n) => a + n, 0);
  check(waitN === sum && waitN === EXPECTED_WAITING, `1) bandeau (${waitN}) = somme des pastilles (${pastilles.join(' + ')} = ${sum}), attendu ${EXPECTED_WAITING}`);
  for (const [name, n] of Object.entries(EXPECTED)) {
    const t = (await row(p, name).locator('.bt-pl-namebtn').innerText()).replace(/\s+/g, ' ');
    check(t.includes(`${n} jour${n > 1 ? 's' : ''} en attente`), `1) ${name} : « ${n} jour${n > 1 ? 's' : ''} en attente » (${t.trim()})`);
  }
  check((await row(p, 'Marc Durand').locator('.bt-pl-namebtn').innerText()).includes('À jour'), '1) Marc (lundi 19, passé, retiré par lui-même : rien de dû) : « À jour »');
  const title = await p.locator('[data-testid=stat-waiting]').getAttribute('title');
  check(/en octobre/.test(title || ''), `1) infobulle avec le mois : « ${title} »`);
  check((await p.locator('[data-testid=stat-docs]').innerText()).replace(/\s+/g, ' ').includes('1 pièces'), '1) 📎 « Pièces » inchangé');
  check((await p.locator('.bt-pl-bar button', { hasText: 'Réserves' }).innerText()).includes('1'), '1) pastille « Réserves » = 1 (la réserve levée par le salarié ne compte plus)');
  check(await row(p, 'Kevin Roussel').locator('[title="Réception avec réserve — levée"]').count() === 1, '1) bulle de Kevin : réserve levée par le salarié → triangle gris « levée »');

  // Panneau « À relancer · octobre » + « Relancer »
  await p.click('[data-testid=stat-waiting]'); await p.waitForTimeout(250);
  const panel = p.locator('[data-testid=relance-panel]');
  const ptxt = (await panel.textContent()) || '';
  check(/À relancer · octobre/.test(ptxt), '1) panneau « À relancer · octobre »');
  const rows = await panel.locator('[data-testid=relance-row]').count();
  check(rows === 5 && !/Ancien|Paul|Marc/.test(ptxt), `1) une ligne par salarié en retard (${rows}), ni désactivé, ni bureau, ni Marc`);
  const kRow = panel.locator('[data-testid=relance-row]', { hasText: 'Kevin Roussel' });
  check(/3 j/.test(await kRow.innerText()) && await kRow.locator('[data-testid=relance-btn]').count() === 1, '1) ligne de Kevin : « 3 j » + bouton « Relancer »');
  await p.mouse.move(700, 600);
  await panel.screenshot({ path: `${SH}/admin-a-relancer-panneau.png` });
  await kRow.locator('[data-testid=relance-btn]').click(); await p.waitForTimeout(600);
  const push = log.pushes[log.pushes.length - 1];
  check(push && JSON.stringify(push.user_ids) === '["u-kevin"]' && /lundi 5 octobre/.test(push.body) && /lundi 19 octobre/.test(push.body) && !/septembre/.test(push.body), `1) « Relancer » → send-push pour Kevin avec ses jours (${push ? push.body : 'aucun appel'})`);
  check(await kRow.locator('[data-testid=relance-done]').count() === 1, '1) la ligne affiche « ✓ relancé »');
  await panel.locator('[data-testid=relance-row]', { hasText: 'Nina Morel' }).locator('.bt-pl-sp-who').click(); await p.waitForTimeout(500);
  check(await p.locator('[role=dialog]').count() === 1, '1) un clic sur le nom ouvre sa fiche');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 2) La case verte vient du vrai pointage
  const kevin = row(p, 'Kevin Roussel');
  check(await kevin.locator('td.bt-pl-cell-live').count() === 1 && (await kevin.locator('[data-testid=bubble-live]').innerText()).includes(`en cours depuis ${hhmm(sKevin.started_at)}`), '2) case verte + « en cours depuis » (active_sessions), sans compteur');
  await p.click('button[aria-label="Légende des icônes"]'); await p.waitForTimeout(150);
  check(await p.locator('.bt-pl-legrow', { hasText: 'En cours (pointage en direct)' }).count() === 1, '2) légende « En cours (pointage en direct) » gardée');
  await p.locator('.bt-pl-ddbackdrop').first().click(); await p.waitForTimeout(150);
  await settle(p);
  await p.mouse.move(720, 880); await p.waitForTimeout(150);
  await p.screenshot({ path: `${SH}/admin-planning-1440x900.png` });

  // Zéro mutation sur un sondage (mode normal). Les petits messages (toasts) du
  // geste précédent se referment d'abord : ils ne sont pas un rafraîchissement.
  await settle(p);
  await startObs(p);
  let g = log.liveGets; await p.clock.fastForward(31000); await p.waitForTimeout(1500);
  let mu = await takeMuts(p);
  check(log.liveGets > g && mu.length === 0, `6) sondage 30 s, rien de changé : ${mu.length} mutation(s) (attendu 0)`);
  g = log.extrasGets; await p.clock.fastForward(31000); await p.waitForTimeout(1500);
  mu = await takeMuts(p);
  check(log.extrasGets > g && mu.length === 0, `6) sondage 60 s, rien de changé : ${mu.length} mutation(s) (attendu 0)`);

  // 3) Sélectionner
  const w0 = log.writes.length;
  await p.click('[data-testid=bar-select]'); await p.waitForTimeout(300);
  check(await p.locator('[data-testid=sel-bar]').isVisible() && await selCount(p) === 0, '3) « Sélectionner » : barre du bas « 0 sélectionnée »');
  const lockedOk = [];
  for (const id of LOCKED) lockedOk.push(await bub(p, id).getAttribute('data-sel') === 'lock');
  check(lockedOk.every(Boolean), `3) envoyée, brouillon, en cours, ajoutée ou retirée par le salarié : 🔒 (${LOCKED.map((id, i) => `${id}:${lockedOk[i] ? 'lock' : '?'}`).join(' ')})`);
  check(await row(p, 'Marc Durand').locator('.bt-pl-sel.lock .bt-pl-extra').count() === 1, '3) heures ajoutées par le salarié (sans planning) : 🔒');
  const why = (id) => bub(p, id).locator('.bt-pl-grab').getAttribute('title');
  check(await why('pk-tue') === 'Heures envoyées — non supprimable' && await why('pk-wed') === 'Pointage en cours — non supprimable' && await why('pk-mon2') === 'Heures notées par le salarié — non supprimable' && await why('pm-mon') === 'Retirée par le salarié — non supprimable', '3) le 🔒 dit pourquoi (« Heures envoyées », « Pointage en cours », « Heures notées », « Retirée par le salarié »)');
  const selectableOk = [];
  for (const id of SELECTABLE) selectableOk.push(await bub(p, id).getAttribute('data-sel') === 'off');
  check(selectableOk.every(Boolean), `3) ${SELECTABLE.length} bulles cochables`);
  await bub(p, 'pk-tue').click(); await p.waitForTimeout(200);
  check(await selCount(p) === 0 && await p.locator('[role=dialog]').count() === 0, '3) clic sur une bulle verrouillée : rien de coché, aucune fenêtre');
  await row(p, 'Sara Benali').locator('.bt-pl-abs').first().click(); await p.waitForTimeout(200);
  check(await selCount(p) === 0 && await p.locator('[role=dialog]').count() === 0, '3) clic sur une absence : rien de coché (gérée par « Présent »)');
  await p.click('[data-testid=sel-all]'); await p.waitForTimeout(200);
  check(await selCount(p) === SELECTABLE.length && (await p.locator('[data-testid=sel-all]').innerText()).includes('Tout désélectionner'), `3) « Tout sélectionner » = la semaine affichée : ${await selCount(p)} (attendu ${SELECTABLE.length})`);
  await settle(p); await p.mouse.move(720, 880); await p.waitForTimeout(150);
  await p.screenshot({ path: `${SH}/admin-selection-tout-1440x900.png` });
  await p.click('[data-testid=sel-all]'); await p.waitForTimeout(200);
  check(await selCount(p) === 0, '3) « Tout désélectionner » → 0');
  const thursday = p.locator('th.bt-pl-th').nth(3);
  await thursday.click(); await p.waitForTimeout(200);
  check(await selCount(p) === 2 && await bub(p, 'pk-thu').getAttribute('data-sel') === 'on' && await bub(p, 'pm-thu').getAttribute('data-sel') === 'on', '3) clic sur « Jeudi » : ses 2 interventions cochées');
  await row(p, 'Nina Morel').locator('.bt-pl-namebtn').click(); await p.waitForTimeout(200);
  check(await selCount(p) === 4 && await p.locator('[role=dialog]').count() === 0, '3) clic sur « Nina Morel » : sa semaine cochée (pas de fenêtre de statut)');
  await bub(p, 'pm-mon').click(); await p.waitForTimeout(150);
  check(await selCount(p) === 4, '3) clic sur la case retirée par le salarié : rien de coché');
  await bub(p, 'pt-mon').click(); await p.waitForTimeout(150);
  check(await selCount(p) === 5, '3) clic sur une bulle : cochée');
  await bub(p, 'pt-mon').click(); await p.waitForTimeout(150);
  check(await selCount(p) === 4, '3) re-clic : décochée');
  await bub(p, 'pt-mon').click(); await p.waitForTimeout(150);
  check((await p.locator('[data-testid=sel-delete]').innerText()).includes('Supprimer (5)'), '3) bouton « Supprimer (5) »');
  // Zéro mutation pendant un sondage, en mode sélection aussi
  await settle(p);
  await startObs(p);
  await p.clock.fastForward(31000); await p.waitForTimeout(1500);
  mu = await takeMuts(p);
  check(mu.length === 0 && await selCount(p) === 5, `6) mode sélection, sondage 30 s : ${mu.length} mutation(s), sélection intacte`);
  check(writesSince(w0).length === 0, '3) cocher n’écrit rien');
  await p.mouse.move(720, 880); await p.waitForTimeout(150);
  await p.screenshot({ path: `${SH}/admin-selection-1440x900.png` }); // (après settle : sans toast)

  const snap = JSON.parse(JSON.stringify(D.planning.filter((x) => ['pk-thu', 'pm-thu', 'pn-mon', 'pn-tue'].includes(x.id))));
  // Course : Tom retire sa journée du lundi (envoyée puis retirée) PENDANT que le bureau
  // coche — l'écran ne le sait pas encore ; l'effacement relit et garde la case.
  D.time_entries.push(entry('e9', 'u-tom', D_(19), W1, 'cancelled', 0, { planning_id: 'pt-mon' }));
  const w1 = log.writes.length;
  await p.click('[data-testid=sel-delete]'); await p.waitForSelector('[data-testid=undo-card]', { timeout: 8000 }).catch(() => {});
  const dels = writesSince(w1).filter((x) => x.m === 'DELETE' && x.t === 'planning');
  const delIds = dels.flatMap((x) => x.ids).sort();
  check(dels.length === 1 && JSON.stringify(delIds) === JSON.stringify(['pk-thu', 'pm-thu', 'pn-mon', 'pn-tue']), `3) « Supprimer (5) » → DELETE de 4 cases (${delIds.join(', ')}) — la case retirée entre-temps par le salarié est gardée`);
  const card = (await p.locator('[data-testid=undo-card]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/4 interventions supprimées/.test(card) && /1 gardée \(retirée par le salarié\)/.test(card), `3) carte : « ${card.trim()} »`);
  check(await p.locator('[data-testid=sel-bar]').count() === 0 && await p.locator('[data-pid]').count() === 0, '3) fin du mode sélection (plus aucune case à cocher)');
  check(await row(p, 'Nina Morel').locator('.bt-pl-bub').count() === 0, '3) les bulles supprimées ont disparu du planning');
  await p.mouse.move(720, 600); await p.waitForTimeout(150);
  await p.screenshot({ path: `${SH}/admin-supprimees-annuler-1440x900.png` });
  await p.clock.fastForward(20000); await p.waitForTimeout(800);
  check(await p.locator('[data-testid=undo-card]').count() === 1, '3) la carte reste (pas de minuterie)');
  const w2 = log.writes.length;
  await p.click('[data-testid=action-undo]'); await p.waitForSelector('[data-testid=action-undone]', { timeout: 8000 }).catch(() => {});
  const ups = writesSince(w2).filter((x) => x.m === 'POST' && x.t === 'planning');
  const sortId = (a) => JSON.stringify([...a].sort((x, y) => x.id.localeCompare(y.id)));
  check(ups.length === 1 && sortId(ups[0].rows) === sortId(snap), '3) « Annuler » → upsert des 4 MÊMES lignes (mêmes id, horaires, notes)');
  check(/tout est remis au planning/.test(await p.locator('[data-testid=undo-card]').innerText()), '3) « Annulé : tout est remis au planning. »');
  await p.waitForTimeout(800);
  check(await row(p, 'Nina Morel').locator('.bt-pl-bub').count() === 2, '3) les bulles sont revenues');
  await p.click('[data-testid=undo-close]'); await p.waitForTimeout(200);
  check(await p.locator('[data-testid=undo-card]').count() === 0, '3) la croix ferme la carte');
  // Changer de semaine vide la sélection
  await p.click('[data-testid=bar-select]'); await p.waitForTimeout(150);
  await p.click('[data-testid=sel-all]'); await p.waitForTimeout(150);
  await p.click('button[aria-label="Semaine suivante"]'); await p.waitForTimeout(600);
  check(await selCount(p) === 0, '3) semaine suivante : sélection vidée');
  await p.click('button[aria-label="Semaine précédente"]'); await p.waitForTimeout(600);
  // Jours clôturés : un salarié clôturé jusqu'au 16/10 (semaine du 12), un mois clôturé (30/09)
  await p.click('button[aria-label="Semaine précédente"]'); await p.waitForTimeout(700);
  check(await bub(p, 'pt-o12').getAttribute('data-sel') === 'lock' && await bub(p, 'pt-o12').locator('.bt-pl-grab').getAttribute('title') === 'Heures clôturées pour ce salarié — non supprimable', '3) salarié clôturé jusqu’au 16/10 : ses jours sont 🔒');
  await p.click('button[aria-label="Semaine précédente"]'); await p.waitForTimeout(500);
  await p.click('button[aria-label="Semaine précédente"]'); await p.waitForTimeout(700);
  check(await bub(p, 'pk-s30').getAttribute('data-sel') === 'lock' && await bub(p, 'pk-s30').locator('.bt-pl-grab').getAttribute('title') === 'Mois clôturé — non supprimable', '3) mois clôturé (septembre) : 🔒');
  for (let i = 0; i < 3; i++) { await p.click('button[aria-label="Semaine suivante"]'); await p.waitForTimeout(500); }
  await p.waitForTimeout(400);
  check(await bub(p, 'pk-mon').count() === 1, '3) retour sur la semaine du 19');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check(await p.locator('[data-testid=sel-bar]').count() === 0, '3) Échap quitte le mode sélection');

  // 4) Fenêtre d'une intervention : « Supprimer » + « Annuler »
  await bub0(p, 'Nina Morel').click(); await p.waitForTimeout(400);
  const dlg = p.locator('[role=dialog]');
  check((await dlg.innerText()).includes('Horaire prévu') && !(await dlg.innerText()).includes('Heure de RDV'), '4) « Horaire prévu » remplace « Heure de RDV »');
  check(await dlg.locator('input[type=time], select, .bt-tc, [class*=cylinder]').count() === 0, '4) aucune roulette (ni input time, ni select, ni cylindre)');
  check(await p.inputValue('[data-testid=edit-time-start]') === '08:00' && await p.inputValue('[data-testid=edit-time-end]') === '12:00', '4) horaire existant relu : 08:00 – 12:00');
  const f1440 = await dialogFits(p); check(f1440.ok, `7) 1440 : fenêtre d'intervention sans défilement horizontal${fitMsg(f1440)}`);
  await dlg.screenshot({ path: `${SH}/admin-intervention-horaire-prevu.png` });
  const w3 = log.writes.length;
  await p.click('[data-testid=edit-delete]'); await p.waitForSelector('[data-testid=undo-card]', { timeout: 8000 }).catch(() => {});
  const d1 = writesSince(w3).filter((x) => x.m === 'DELETE' && x.t === 'planning');
  check(d1.length === 1 && d1[0].ids.length === 1 && d1[0].ids[0] === 'pn-mon', '4) « Supprimer » → DELETE d’une case (lue en entier avant)');
  check(/1 intervention supprimée/.test(await p.locator('[data-testid=undo-card]').innerText().catch(() => '')), '4) carte « 1 intervention supprimée » + « Annuler »');
  const w4 = log.writes.length;
  await p.click('[data-testid=action-undo]'); await p.waitForSelector('[data-testid=action-undone]', { timeout: 8000 }).catch(() => {});
  const u1 = writesSince(w4).filter((x) => x.m === 'POST' && x.t === 'planning');
  check(u1.length === 1 && u1[0].rows.length === 1 && u1[0].rows[0].id === 'pn-mon' && u1[0].rows[0].notes === 'code portail 1234', '4) « Annuler » remet la même ligne (note comprise)');
  await p.click('[data-testid=undo-close]'); await p.waitForTimeout(600);
  // Heures envoyées : refus, rien d'effacé
  await p.locator('[data-pid="pk-tue"], tr:has-text("Kevin Roussel") .bt-pl-grab').first().waitFor().catch(() => {});
  const w5 = log.writes.length;
  await row(p, 'Kevin Roussel').locator('td').nth(2).locator('.bt-pl-grab').first().click(); await p.waitForTimeout(400);
  await p.click('[data-testid=edit-delete]'); await p.waitForTimeout(600);
  check(writesSince(w5).filter((x) => x.m === 'DELETE').length === 0 && await p.locator('[data-testid=undo-card]').count() === 0, '4) heures envoyées : « Supprimer » refusé, rien d’effacé');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // Case retirée par le salarié : refus dit tout de suite, rien d'effacé
  await row(p, 'Marc Durand').locator('td').nth(1).locator('.bt-pl-grab').first().click(); await p.waitForTimeout(400);
  await p.click('[data-testid=edit-delete]'); await p.waitForTimeout(400);
  const toastTxt = await p.locator('[data-sonner-toast]').allInnerTexts().catch(() => []);
  check(writesSince(w5).filter((x) => x.m === 'DELETE').length === 0 && await p.locator('[data-testid=undo-card]').count() === 0 && toastTxt.some((t) => t.includes('Retirée par le salarié')), `4) case retirée par le salarié : « Supprimer » refusé avec la raison (${toastTxt.join(' | ').replace(/\s+/g, ' ').slice(0, 120)})`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 4) « Horaire prévu » : saisie simple, préréglages, refus
  await row(p, 'Tom Garcia').locator('td').nth(5).locator('.bt-pl-grab').first().click(); await p.waitForTimeout(400);
  await p.fill('[data-testid=edit-time-start]', '14h'); await p.keyboard.press('Tab'); await p.waitForTimeout(100);
  check(await p.inputValue('[data-testid=edit-time-start]') === '14:00', '4) « 14h » → 14:00');
  await p.fill('[data-testid=edit-time-end]', '12'); await p.keyboard.press('Tab'); await p.waitForTimeout(100);
  check((await p.locator('[data-testid=edit-time-error]').innerText().catch(() => '')).includes('La fin doit être après le début'), '4) fin avant le début : refusée');
  const w6 = log.writes.length;
  await p.locator('[role=dialog] button', { hasText: 'Enregistrer' }).click(); await p.waitForTimeout(400);
  check(writesSince(w6).length === 0, '4) … et rien n’est enregistré');
  await p.fill('[data-testid=edit-time-start]', ''); await p.keyboard.press('Tab'); await p.waitForTimeout(100);
  check((await p.locator('[data-testid=edit-time-error]').innerText().catch(() => '')).includes('Indiquez aussi le début'), '4) fin sans début : « Indiquez aussi le début »');
  await p.locator('[role=dialog] button', { hasText: 'Enregistrer' }).click(); await p.waitForTimeout(400);
  check(writesSince(w6).length === 0, '4) … et rien n’est enregistré');
  // Heure illisible : refusée et BLOQUANTE (avant : l'ancienne heure partait en silence).
  await p.locator('[data-testid=edit-time-preset]', { hasText: 'Matin' }).click(); await p.waitForTimeout(100);
  await p.fill('[data-testid=edit-time-start]', '7h75'); await p.keyboard.press('Tab'); await p.waitForTimeout(100);
  check((await p.locator('[data-testid=edit-time-error]').innerText().catch(() => '')).includes('Heure non comprise'), '4) « 7h75 » : « Heure non comprise »');
  await p.locator('[role=dialog] button', { hasText: 'Enregistrer' }).click(); await p.waitForTimeout(400);
  check(writesSince(w6).length === 0, '4) … et rien n’est enregistré (l’ancienne heure ne part pas en silence)');
  await p.locator('[data-testid=edit-time-preset]', { hasText: 'Après-midi' }).click(); await p.waitForTimeout(100);
  check(!(await p.locator('[data-testid=edit-time-error]').count()), '4) préréglage : le refus disparaît');
  check(await p.inputValue('[data-testid=edit-time-start]') === '13:30' && await p.inputValue('[data-testid=edit-time-end]') === '17:00', '4) préréglage « Après-midi » → 13:30 – 17:00');
  await p.click('[data-testid=edit-time-start-list]'); await p.waitForTimeout(250);
  await p.locator('[role=option][data-v="09:15"]').click(); await p.waitForTimeout(150);
  check(await p.inputValue('[data-testid=edit-time-start]') === '09:15', '4) liste au quart d’heure : 09:15 choisi');
  await p.fill('[data-testid=edit-time-start]', '14h30'); await p.keyboard.press('Tab');
  await p.fill('[data-testid=edit-time-end]', '18:00'); await p.keyboard.press('Tab'); await p.waitForTimeout(100);
  await p.locator('[role=dialog] button', { hasText: 'Enregistrer' }).click(); await p.waitForTimeout(700);
  const pt = writesSince(w6).filter((x) => x.m === 'PATCH' && x.t === 'planning');
  check(pt.length === 1 && pt[0].ids[0] === 'pt-fri' && pt[0].body.estimated_start === '14:30:00' && pt[0].body.estimated_end === '18:00:00', `4) enregistré : début 14:30 et fin 18:00 (${pt[0] ? JSON.stringify(pt[0].body) : 'rien'})`);

  // 4) Ajout : même « Horaire prévu »
  await row(p, 'Marc Durand').locator('td').nth(2).locator('.bt-pl-cellfill').click(); await p.waitForTimeout(400);
  const add = p.locator('[role=dialog]');
  check((await add.innerText()).includes('Ajouter une intervention') && await add.locator('[data-testid=add-time-start]').count() === 1, '4) « Ajouter une intervention » avec « Horaire prévu »');
  await add.locator('button[role=combobox]').click(); await p.waitForTimeout(250);
  await p.locator('[role=option]', { hasText: 'Villa Dupont' }).click(); await p.waitForTimeout(200);
  await p.fill('[data-testid=add-time-end]', '12h'); await p.keyboard.press('Tab');
  const w7 = log.writes.length;
  await add.locator('button[type=submit]').click(); await p.waitForTimeout(400);
  check(writesSince(w7).length === 0 && (await add.innerText()).includes('Indiquez aussi le début'), '4) ajout : fin sans début refusée');
  await p.locator('[data-testid=add-time-preset]', { hasText: 'Matin' }).click();
  await add.screenshot({ path: `${SH}/admin-ajouter-intervention.png` });
  await add.locator('button[type=submit]').click(); await p.waitForTimeout(700);
  const ins = writesSince(w7).filter((x) => x.m === 'POST' && x.t === 'planning');
  check(ins.length === 1 && ins[0].rows[0].estimated_start === '08:00:00' && ins[0].rows[0].estimated_end === '12:00:00' && ins[0].rows[0].worksite_id === 'w1', '4) ajout enregistré avec 08:00 – 12:00');

  // 5) Exporter → directement l'équipe
  await p.click('[data-testid=bar-export]'); await p.waitForTimeout(400);
  const ex = p.locator('[role=dialog]');
  check((await ex.innerText()).includes("Exporter l'équipe") && await p.locator('.bt-pl-exitem').count() === 0, '5) « Exporter » ouvre directement l’export de l’équipe (plus de menu Équipe / Un salarié)');
  check(await ex.locator('button', { hasText: 'Envoyer à' }).count() === 1, '5) « Envoyer à … » gardé');
  const fe = await dialogFits(p); check(fe.ok, `7) 1440 : export équipe (adresse longue) sans défilement horizontal${fitMsg(fe)}`);
  await ex.screenshot({ path: `${SH}/admin-export-equipe.png` });
  await ex.locator('button', { hasText: 'Cette semaine' }).click(); await p.waitForTimeout(150);
  await p.click('[data-testid=team-export-menu]'); await p.waitForTimeout(250);
  const items = await p.locator('[data-testid^=team-export-menu-]').allInnerTexts();
  check(items.length === 3 && /^PDF/.test(items[0]) && /^Excel/.test(items[1]) && /^CSV/.test(items[2]), `5) menu « Exporter ▾ » : ${items.map((x) => x.split('\n')[0]).join(' / ')}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('[data-testid=export-one-worker]'); await p.waitForTimeout(400);
  check((await p.locator('[role=dialog]').innerText()).includes('Exporter un salarié'), '5) « Un seul salarié ? » → la liste des salariés');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 5) Coût chantiers : carte « Heures »
  await p.click('[data-testid=bar-cost]'); await p.waitForSelector('[data-testid=cr-hours]', { timeout: 8000 }).catch(() => {});
  const hoursCard = (await p.locator('[data-testid=cr-hours]').innerText()).replace(/\s+/g, ' ');
  const lines = await p.locator('.bt-cr-h').allInnerTexts();
  const toMin = (t) => { const m = t.match(/(\d+) h(?: (\d+))?/); return m ? Number(m[1]) * 60 + Number(m[2] || 0) : 0; };
  const lineSum = lines.reduce((a, t) => a + toMin(t), 0);
  check(toMin(hoursCard) === lineSum && lineSum === 1020 && /dont 0 h 45 de route/.test(hoursCard), `5) carte « Heures » (${hoursCard}) = somme des lignes (${lines.join(' + ')})`);
  const fc = await dialogFits(p); check(fc.ok, `7) 1440 : « Coût chantiers » sans défilement horizontal${fitMsg(fc)}`);
  await p.locator('[role=dialog]').screenshot({ path: `${SH}/admin-cout-chantiers.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 13) Salariés : « clôturé au 16/10 »
  await p.locator('.bt-pl-bar button', { hasText: 'Salariés' }).click(); await p.waitForTimeout(400);
  const chip = p.locator('[role=dialog] [data-testid=closure-chip]');
  check(await chip.count() === 1 && (await chip.innerText()).trim() === 'clôturé au 16/10', '13) liste Salariés : puce grise « clôturé au 16/10 » (Tom)');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await ctx.close();
}
function bub0(p, name) { return row(p, name).locator('.bt-pl-grab').first(); }

// ═══ 6–7) 1280 et 1024 : barre sur une ligne, fenêtres sans défilement ═════════════
for (const [width, height] of [[1280, 800], [1024, 768]]) {
  D = fresh(); D.companies[0] = { ...COMPANY, kiosk_enabled: true, ai_enabled: true, subscription_status: 'trialing', trial_ends_at: '2026-11-02' };
  // Cas chargés de tous les jours : 3 congés en attente (pastille sur « Salariés ») et
  // 12 réserves ouvertes (2 chiffres sur « Réserves ») — la barre ne doit pas s'élargir.
  for (let i = 0; i < 3; i++) D.leave_requests.push({ id: `lr${i}`, company_id: CO, user_id: 'u-kevin', status: 'pending', start_date: D_(26), end_date: D_(27), created_at: '2026-10-10T08:00:00Z' });
  for (let i = 0; i < 11; i++) D.time_entries.push(entry(`rsv${i}`, 'u-nina', D_(1 + (i % 9)), W2, 'submitted', 60, { reception: 'avec' }));
  const { ctx, p } = await newPage(width, height);
  const badges = (await p.locator('.bt-pl-bar').innerText()).replace(/\s+/g, ' ');
  check(/Salariés 3/.test(badges) && /Réserves 12/.test(badges), `6) ${width} : pastilles « Salariés 3 » et « Réserves 12 » affichées`);
  const res = await p.evaluate(() => {
    const bar = document.querySelector('.bt-pl-bar'); const br = bar.getBoundingClientRect();
    const kids = [...bar.children].map((e) => e.getBoundingClientRect());
    const btns = [...bar.querySelectorAll('button')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
    const ov = (a, c) => a.left < c.right - 0.5 && c.left < a.right - 0.5 && a.top < c.bottom - 0.5 && c.top < a.bottom - 0.5;
    let overlaps = 0; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (ov(kids[i], kids[j])) overlaps++;
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (ov(btns[i], btns[j])) overlaps++;
    // Tout ce qui se voit (pastilles comprises) reste dans la barre, et la page ne défile pas en largeur.
    const all = [...bar.querySelectorAll('*')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const inside = all.every((r) => r.left >= br.left - 0.5 && r.right <= br.right + 0.5) && document.documentElement.scrollWidth <= innerWidth;
    const mids = btns.map((r) => r.top + r.height / 2);
    return { overlaps, inside, oneLine: Math.max(...mids) - Math.min(...mids) < 6, h: Math.round(br.height), n: btns.length, spare: Math.round(br.right - Math.max(...btns.map((r) => r.right))) };
  });
  check(res.overlaps === 0 && res.inside && res.oneLine, `6) ${width}×${height} : barre avec « Sélectionner », « Borne », l’assistant, 3 congés et 12 réserves sur une ligne (${res.n} boutons, ${res.h} px, ${res.spare} px de marge à droite${res.overlaps ? `, ${res.overlaps} chevauchement(s)` : ''}${res.inside ? '' : ', déborde'})`);
  const costLbl = (await p.locator('[data-testid=bar-cost]').innerText()).trim();
  // Sous 1280 px seulement (à 1280 la barre tient avec le libellé entier).
  check(costLbl === (width < 1280 ? 'Coûts' : 'Coût chantiers'), `6) ${width} : libellé « ${costLbl} »`);
  const mids = await p.evaluate(() => [...document.querySelectorAll('.bt-pl-cockpit .bt-pl-stat')].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
  check(mids.length === 2 && Math.abs(mids[0] - mids[1]) <= 2, `6) ${width} : les 2 indicateurs sur une ligne`);
  if (width === 1024) {
    await p.click('[data-testid=bar-select]'); await p.waitForTimeout(150);
    await p.locator('th.bt-pl-th').nth(3).click(); await p.waitForTimeout(150);
    await p.mouse.move(512, 760); await p.waitForTimeout(150);
    await p.screenshot({ path: `${SH}/admin-selection-1024x768.png` });
    const sb = await p.locator('[data-testid=sel-bar]').boundingBox();
    check(sb && sb.x >= 0 && sb.x + sb.width <= width, '6) 1024 : barre de sélection entière à l’écran');
    await p.click('[data-testid=sel-done]'); await p.waitForTimeout(150);
  } else {
    await p.mouse.move(640, 790); await p.waitForTimeout(150);
    await p.screenshot({ path: `${SH}/admin-planning-1280x800.png` });
  }
  // Fenêtres de la zone
  const dialogs = [
    ['export équipe', async () => { await p.click('[data-testid=bar-export]'); }],
    ['intervention', async () => { await bub0(p, 'Nina Morel').click(); }],
    ['fiche client', async () => { await bub0(p, 'Nina Morel').click(); await p.waitForTimeout(300); await p.locator('[role=dialog] button', { hasText: 'Fiche' }).click(); }],
    ['ajout', async () => { await row(p, 'Marc Durand').locator('td').nth(2).locator('.bt-pl-cellfill').click(); }],
    ['salariés', async () => { await p.locator('.bt-pl-bar button', { hasText: 'Salariés' }).click(); }],
    ['coût chantiers', async () => { await p.click('[data-testid=bar-cost]'); await p.waitForSelector('[data-testid=cr-hours]', { timeout: 8000 }).catch(() => {}); }],
  ];
  for (const [name, openIt] of dialogs) {
    await openIt(); await p.waitForTimeout(450);
    const f = await dialogFits(p);
    check(f.ok, `7) ${width} : « ${name} » sans défilement horizontal${fitMsg(f)}`);
    if (width === 1024 && name === 'export équipe') await p.screenshot({ path: `${SH}/admin-export-equipe-1024x768.png` });
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);
    if (await p.locator('[role=dialog]').count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
  }
  await ctx.close();
}

// ═══ 6–7) Mobile 390×844 ═══════════════════════════════════════════════════════════
{
  D = fresh(); D.companies[0] = { ...COMPANY, kiosk_enabled: true };
  const { ctx, p } = await newPage(390, 844, true);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile : aucun défilement horizontal');
  const chips = await p.locator('.bt-pl-m-stats .bt-pl-m-stat').count();
  check(chips === 2 && await p.locator('[data-testid=m-stat-waiting]').count() === 1 && await p.locator('[data-testid=m-stat-docs]').count() === 1, `mobile : ${chips} puces (« À relancer », « Pièces »)`);
  check(/8 j/.test(await p.locator('[data-testid=m-stat-waiting]').innerText()), 'mobile : « 8 j à relancer »');
  const leaCard = p.locator('.bt-pl-m-card', { hasText: 'Léa Petit' }).first();
  const sent = leaCard.locator('[data-testid=m-badge-sent]');
  const sentBg = await sent.evaluate((e) => getComputedStyle(e).backgroundColor).catch(() => '');
  check((await sent.innerText().catch(() => '')).includes('✓ ENVOYÉ') && !/rgb\(228, 242, 233\)|rgb\(47, 163, 107\)/.test(sentBg), `mobile : « ✓ ENVOYÉ » en couleur neutre (${sentBg})`);
  check(await p.locator('.bt-pl-m-card', { hasText: 'Kevin Roussel' }).first().locator('[data-testid=m-badge-live]').count() === 1, 'mobile : Kevin « EN COURS » (vrai pointage)');
  await p.screenshot({ path: `${SH}/admin-mobile-390x844.png` });
  await p.tap('[data-testid=m-stat-waiting]'); await p.waitForTimeout(450);
  const rl = p.locator('[data-testid=relance-list]');
  check(await rl.locator('[data-testid=relance-row]').count() === 5 && await rl.locator('[data-testid=relance-btn]').count() === 5, 'mobile : « À relancer » ouvre la liste avec « Relancer » sur chaque ligne');
  const fr = await dialogFits(p); check(fr.ok, `7) 390 : « À relancer » sans défilement horizontal${fitMsg(fr)}`);
  const pu0 = log.pushes.length;
  await rl.locator('[data-testid=relance-row]', { hasText: 'Nina Morel' }).locator('[data-testid=relance-btn]').tap(); await p.waitForTimeout(500);
  check(log.pushes.length === pu0 + 1 && JSON.stringify(log.pushes[pu0].user_ids) === '["u-nina"]', 'mobile : « Relancer » → send-push pour Nina');
  await p.screenshot({ path: `${SH}/admin-mobile-a-relancer.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // Menu : « Exporter » direct + « Sélectionner des interventions »
  await p.tap('button[aria-label=Menu]'); await p.waitForTimeout(450);
  check(await p.locator('[data-testid=mm-select]').count() === 1, 'mobile : menu « Sélectionner des interventions »');
  await p.tap('[data-testid=mm-export]'); await p.waitForTimeout(500);
  check((await p.locator('[role=dialog]').innerText()).includes("Exporter l'équipe"), 'mobile : menu « Exporter » → directement l’export de l’équipe');
  const fx = await dialogFits(p); check(fx.ok, `7) 390 : export équipe (adresse longue) sans défilement horizontal${fitMsg(fx)}`);
  await p.screenshot({ path: `${SH}/admin-mobile-export-equipe.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // « Coût chantiers » et « Salariés » depuis le menu, à 390
  for (const [label, name] of [['Coût chantiers', 'coût chantiers'], ['Salariés', 'salariés']]) {
    await p.tap('button[aria-label=Menu]'); await p.waitForTimeout(450);
    await p.locator('.bt-mm-item', { hasText: label }).first().tap(); await p.waitForTimeout(700);
    if (label === 'Coût chantiers') await p.waitForSelector('[data-testid=cr-hours]', { timeout: 8000 }).catch(() => {});
    const f = await dialogFits(p); check(f.ok, `7) 390 : « ${name} » sans défilement horizontal${fitMsg(f)}`);
    if (label === 'Coût chantiers') await p.screenshot({ path: `${SH}/admin-mobile-cout-chantiers.png` });
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);
  }

  // Fenêtre d'intervention + fiche client à 390
  await p.locator('.bt-pl-m-card', { hasText: 'Léa Petit' }).first().locator('.bt-pl-m-bubbtn').first().tap(); await p.waitForTimeout(450);
  const fi = await dialogFits(p); check(fi.ok, `7) 390 : fenêtre d'intervention sans défilement horizontal${fitMsg(fi)}`);
  await p.screenshot({ path: `${SH}/admin-mobile-intervention.png` });
  await p.locator('[role=dialog] button', { hasText: 'Fiche' }).tap(); await p.waitForTimeout(450);
  const ff = await dialogFits(p); check(ff.ok, `7) 390 : fiche client sans défilement horizontal${fitMsg(ff)}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // Sélection du jour affiché (jeudi)
  await p.locator('.bt-pl-daypill').nth(3).tap(); await p.waitForTimeout(300);
  await p.tap('[data-testid=m-select]'); await p.waitForTimeout(300);
  check(await p.locator('[data-testid=sel-all-day]').isVisible() && !(await p.locator('[data-testid=sel-all]').isVisible()), 'mobile : « Tout sélectionner » = le jour affiché');
  await p.tap('[data-testid=sel-all-day]'); await p.waitForTimeout(200);
  check(await selCount(p) === 2, `mobile : jeudi, ${await selCount(p)} interventions cochées (attendu 2)`);
  const sb = await p.locator('[data-testid=sel-bar]').boundingBox();
  check(sb && sb.x >= 0 && sb.x + sb.width <= 390.5, 'mobile : la barre de sélection tient dans l’écran');
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile : mode sélection sans défilement horizontal');
  await p.screenshot({ path: `${SH}/admin-mobile-selection.png` });
  const w0 = log.writes.length;
  await p.tap('[data-testid=sel-delete]'); await p.waitForSelector('[data-testid=undo-card]', { timeout: 8000 }).catch(() => {});
  const md = writesSince(w0).filter((x) => x.m === 'DELETE' && x.t === 'planning');
  check(md.length === 1 && JSON.stringify(md[0].ids.sort()) === JSON.stringify(['pk-thu', 'pm-thu']), 'mobile : « Supprimer (2) » → DELETE des 2 cases');
  await p.screenshot({ path: `${SH}/admin-mobile-annuler.png` });
  const w1 = log.writes.length;
  await p.tap('[data-testid=action-undo]'); await p.waitForSelector('[data-testid=action-undone]', { timeout: 8000 }).catch(() => {});
  const mu = writesSince(w1).filter((x) => x.m === 'POST' && x.t === 'planning');
  check(mu.length === 1 && mu[0].rows.length === 2, 'mobile : « Annuler » remet les 2 cases');
  await ctx.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
