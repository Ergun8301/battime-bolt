// Lancer : node scripts/tests/admin-lot10.mjs out docs/captures-lot10 (après npm run build).
// Lot 10 — bureau, AFFICHAGE seulement, sur la VRAIE page planning (base simulée, aucune écriture) :
//  1) « Saccades » : un MutationObserver posé sur document.body après le premier chargement
//     compte ce que le navigateur redessine quand les données NE CHANGENT PAS :
//       · sondage des chronos (30 s), sondage des compteurs (60 s),
//       · retour sur l'onglet (caché → visible, Supabase renvoie « SIGNED_IN » → profil relu).
//     Cible : 0 mutation. Exceptions autorisées : AUCUNE (il n'y a pas d'horloge à l'écran).
//     Puis un vrai changement (nouveau chrono, chrono fermé) ne touche QUE la case concernée.
//     (Lot 11 : le compteur « en direct » a quitté le cockpit — le cockpit ne bouge plus DU TOUT
//      quand un chrono démarre ou s'arrête ; la case verte reste.)
//  2) Cockpit : plus fin, logo à gauche, chiffres au centre, entreprise à droite ; aucun saut
//     quand les pointages commencent/s'arrêtent ; aucun chevauchement à 1024/1280/1440 (essai
//     + 3 pointages en cours compris) ; en-tête mobile rangé, sans défilement horizontal.
//  3) « 📟 Borne » à côté de « Réserves » (seulement si kiosk_enabled) → fenêtre des bornes.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '4310'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Dates relatives (jour de Paris) ───────────────────────────────────────────
// Lot 11 : horloge FIGÉE (mercredi 21 octobre 2026, 10:00) — « À relancer » regarde le mois en
// cours : les jours J-2…J-6 doivent rester dans le mois, quel que soit le jour où le test tourne.
const NOW = new Date('2026-10-21T10:00:00+02:00');
const today = '2026-10-21';
const day = (n) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ago = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();

// ─── Base simulée (celle du lot 9) ─────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Garnier', city: 'Vienne', is_active: true };
const u = (id, first, last, role = 'worker', is_active = true) => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active, created_at: '2026-01-01' });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: '08:00:00', estimated_end: '17:00:00', notes: null, created_at: `${work_date}T06:00:00Z`, worksite: ws ?? null, ...extra });
const entry = (id, user_id, work_date, ws, status, minutes, start = '08:00:00') => ({ id, company_id: CO, user_id, work_date, worksite_id: ws.id, status, start_time: start, end_time: `${String(Number(start.slice(0, 2)) + minutes / 60).padStart(2, '0')}:00:00`, total_minutes: minutes, reception: null, reserve_resolved_at: null, observation: null });
const sKevin = { user_id: 'u-kevin', company_id: CO, worksite_id: 'w1', planning_id: 'pl-kevin', work_date: today, started_at: ago(2), positions: [{ lat: 45.7, lng: 4.8 }] };
const sMarc = { user_id: 'u-marc', company_id: CO, worksite_id: 'w2', planning_id: null, work_date: today, started_at: ago(1), positions: [] };
const sNina = { user_id: 'u-nina', company_id: CO, worksite_id: 'w1', planning_id: 'pl-nina', work_date: day(-1), started_at: new Date(`${day(-1)}T05:45:00Z`).toISOString(), positions: [] };
const sLea = { user_id: 'u-lea', company_id: CO, worksite_id: 'w1', planning_id: 'pl-lea', work_date: today, started_at: ago(0.5), positions: [] };
const COMPANY = { id: CO, name: 'Pizzeria Exemple', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 };
const D = {
  users: [
    u('u-admin', 'Paul', 'Martin', 'admin'),
    u('u-kevin', 'Kevin', 'Roussel'), u('u-sara', 'Sara', 'Benali'), u('u-marc', 'Marc', 'Durand'), u('u-lea', 'Léa', 'Petit'), u('u-nina', 'Nina', 'Morel'),
    u('u-old', 'Ancien', 'Compte', 'worker', false),
  ],
  companies: [{ ...COMPANY }],
  worksites: [W1, W2],
  planning: [
    slot('pl-kevin', 'u-kevin', today, W1), slot('pk-2', 'u-kevin', day(-2), W1), slot('pk-3', 'u-kevin', day(-3), W1),
    slot('ps-abs', 'u-sara', today, null, { absence_type: 'conge', estimated_start: null, estimated_end: null }),
    slot('ps-4', 'u-sara', day(-4), W2), slot('ps-5', 'u-sara', day(-5), W2), slot('ps-6', 'u-sara', day(-6), W2),
    slot('pl-marc', 'u-marc', today, W1),
    slot('pl-lea', 'u-lea', today, W1),
    slot('pl-nina', 'u-nina', day(-1), W1),
    slot('po-2', 'u-old', day(-2), W1),
    slot('pa-2', 'u-admin', day(-2), W1),
  ],
  time_entries: [
    entry('e1', 'u-lea', today, W1, 'submitted', 60), entry('e2', 'u-lea', today, W1, 'validated', 60, '09:00:00'),
    entry('e3', 'u-lea', today, W2, 'draft', 180, '10:00:00'),
  ],
  active_sessions: [sKevin, sMarc, sNina],
  month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [],
  kiosks: [], kiosk_settings: [],
};

// ─── Session simulée + routes Supabase (celles du lot 9) ───────────────────────
const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: 'u-admin', email: 'paul@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k];
      if (op === 'eq') return String(cur) === val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      if (op === 'gte') return String(cur) >= val;
      if (op === 'lte') return String(cur) <= val;
      if (op === 'gt') return String(cur) > val;
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      return true;
    });
  }
  return rows;
};
const log = { liveGets: 0, planningGets: 0, extrasGets: 0, profileGets: 0, writes: 0 };
const setup = async (ctx) => {
  await ctx.clock.install({ time: NOW }); // lot 11 : horloge du contexte (page.clock la pilote)
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    // Lot 11 : ouvrir « 📟 Borne » crée tout de suite un code (create_pairing) — ce
    // n'est pas une écriture de données ; tout autre appel de fonction en est une.
    if (url.pathname === '/functions/v1/kiosk') {
      const body = JSON.parse(r.request().postData() || '{}');
      if (body.action === 'create_pairing') { log.kioskCodes = (log.kioskCodes || 0) + 1; return r.fulfill({ json: { code: '123456', expires_at: new Date(Date.now() + 600000).toISOString(), pairing_id: 'pp-1' } }); }
      if (body.action === 'cancel_pairing') return r.fulfill({ json: { success: true } });
    }
    if (url.pathname.startsWith('/functions/v1/')) { log.writes++; return r.fulfill({ json: {} }); }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', '');
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD') { log.writes++; console.log('   écriture', m, t); return r.fulfill({ status: 201, json: {} }); }
    if (t === 'active_sessions') log.liveGets++;
    if (t === 'planning' && (url.searchParams.get('select') || '').includes('worksite:worksites')) log.planningGets++;
    if (t === 'companies' && (url.searchParams.get('select') || '').includes('logo_url')) log.extrasGets++;
    if (t === 'users' && url.searchParams.get('id') === 'eq.u-admin') log.profileGets++;
    const rows = filterRows(D[t] || [], url.searchParams);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
};

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const vis = (p, sel) => p.locator(`${sel}:visible`);
const open = async (ctx, sel = '[data-testid=stat-waiting]') => {
  const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${PORT}/admin`); await pg.waitForSelector(sel, { timeout: 20000 }); await pg.waitForTimeout(1800);
  return pg;
};

// ─── Mesure des redessins : MutationObserver sur document.body ─────────────────
// Exceptions autorisées (texte d'horloge, minuterie…) : aucune sur cet écran.
const ALLOWED = [];
const startObs = (pg) => pg.evaluate(() => {
  window.__muts = [];
  const desc = (n) => {
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    if (!el) return '#text';
    const parts = []; let e = el;
    for (let i = 0; i < 5 && e && e !== document.body; i++) {
      const cls = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      parts.unshift(e.tagName.toLowerCase() + (e.dataset && e.dataset.testid ? `[${e.dataset.testid}]` : '') + cls);
      e = e.parentElement;
    }
    return parts.join(' > ');
  };
  // À quelle LIGNE du planning (ou zone) appartient le nœud touché.
  const zone = (n, m) => {
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    if (!el) return '?';
    // Lignes vides de remplissage sous le dernier salarié : leur nombre suit la hauteur
    // des vraies lignes (une case qui perd « en cours depuis » rapetisse → une ligne vide de plus).
    const ghost = (x) => x.nodeType === 1 && (x.classList.contains('bt-pl-ghostbody') || x.classList.contains('bt-pl-ghostrow'));
    if (el.closest('.bt-pl-ghostbody') || (m && m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].length > 0 && [...m.addedNodes, ...m.removedNodes].every(ghost))) return 'remplissage';
    const row = el.closest('tr'); const name = row && row.querySelector('.bt-pl-name');
    if (name) return `ligne ${name.textContent.trim()}`;
    const card = el.closest('.bt-pl-m-card'); const cn = card && card.querySelector('.bt-pl-name');
    if (cn) return `carte ${cn.textContent.trim()}`;
    if (el.closest('.bt-pl-cockpit')) return 'cockpit';
    if (el.closest('.bt-pl-m-head')) return 'en-tête mobile';
    if (el.closest('.bt-pl-bar')) return 'barre';
    return 'autre';
  };
  window.__obs = new MutationObserver((list) => {
    for (const m of list) {
      window.__muts.push({
        type: m.type, target: desc(m.target), zone: zone(m.target, m), attr: m.attributeName || null,
        old: m.oldValue, now: m.type === 'attributes' ? m.target.getAttribute(m.attributeName) : m.type === 'characterData' ? m.target.data : null,
        added: m.addedNodes.length, removed: m.removedNodes.length,
      });
    }
  });
  window.__obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true, characterDataOldValue: true });
});
const takeMuts = async (pg) => (await pg.evaluate(() => { const m = window.__muts; window.__muts = []; return m; }))
  .filter((m) => !ALLOWED.some((re) => re.test(m.target)));
const report = (label, muts) => {
  console.log(`   ${label} : ${muts.length} mutation(s)`);
  for (const m of muts.slice(0, 25)) console.log(`     · [${m.zone}] ${m.type}${m.attr ? ` ${m.attr}` : ''} ${m.target}${m.type === 'childList' ? ` (+${m.added} −${m.removed})` : ''}${m.old != null || m.now != null ? ` « ${String(m.old ?? '').slice(0, 50)} » → « ${String(m.now ?? '').slice(0, 50)} »` : ''}`);
  if (muts.length > 25) console.log(`     … ${muts.length - 25} de plus`);
};
const RESULTS = {};
const setVis = (pg, state) => pg.evaluate((s) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
  // Comme le vrai navigateur : l'événement remonte jusqu'à window (Supabase y écoute).
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
}, state);

// ═══ 1) Saccades — 1440×900, données INCHANGÉES ═══════════════════════════════
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx);
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/admin`); await p.waitForSelector('[data-testid=stat-waiting]', { timeout: 20000 }); await p.waitForTimeout(2500);
  await p.mouse.move(5, 895);
  await startObs(p);

  // 1a) sondage des chronos (30 s)
  let g = log.liveGets;
  await p.clock.fastForward(31000); await p.waitForTimeout(1500);
  let m = await takeMuts(p); RESULTS['sondage 30 s'] = m.length;
  check(log.liveGets > g, `1a) le sondage 30 s a bien relu active_sessions (${log.liveGets - g})`);
  report('1a) sondage 30 s, rien de changé', m);
  check(m.length === 0, `1a) sondage 30 s sans changement : ${m.length} mutation(s) (attendu 0)`);

  // 1b) sondage des compteurs (60 s) — fetchExtras + fetchLive
  g = log.extrasGets;
  await p.clock.fastForward(31000); await p.waitForTimeout(1500);
  m = await takeMuts(p); RESULTS['sondage 60 s'] = m.length;
  check(log.extrasGets > g, `1b) le sondage 60 s a bien relu l'entreprise et les compteurs (${log.extrasGets - g})`);
  report('1b) sondage 60 s, rien de changé', m);
  check(m.length === 0, `1b) sondage 60 s sans changement : ${m.length} mutation(s) (attendu 0)`);

  // 1c) retour sur l'onglet (caché → visible) : chronos relus + Supabase « SIGNED_IN » → profil relu
  await setVis(p, 'hidden'); await p.waitForTimeout(300);
  await takeMuts(p);
  g = log.liveGets; const pr = log.profileGets;
  await setVis(p, 'visible'); await p.waitForTimeout(2000);
  m = await takeMuts(p); RESULTS['retour onglet'] = m.length;
  check(log.liveGets > g, `1c) retour sur l'onglet : chronos relus (${log.liveGets - g})`);
  console.log(`   (profil relu au retour : ${log.profileGets - pr} fois — Supabase « SIGNED_IN »)`);
  report('1c) retour sur l\'onglet, rien de changé', m);
  check(m.length === 0, `1c) retour sur l'onglet sans changement : ${m.length} mutation(s) (attendu 0)`);

  // 1d) chrono fermé → planning relu (fetchPlanning) ; planning lui-même inchangé
  //     (pointage de moins d'une minute : aucun brouillon) → seules la case de Kevin et le chiffre bougent.
  const pl = log.planningGets;
  D.active_sessions = D.active_sessions.filter((s) => s.user_id !== 'u-kevin');
  await p.clock.fastForward(31000); await p.waitForTimeout(1800);
  m = await takeMuts(p); RESULTS['chrono fermé (planning relu)'] = m.length;
  check(log.planningGets > pl, '1d) chrono disparu → planning relu');
  report('1d) Kevin ferme son chrono', m);
  // (La vue mobile est dans la page, masquée : sa carte et son chiffre « en direct » suivent.)
  const zones1d = [...new Set(m.map((x) => x.zone))];
  check(m.length > 0 && zones1d.every((z) => ['ligne Kevin Roussel', 'carte Kevin Roussel', 'remplissage'].includes(z)), `1d) seule la case de Kevin change (${zones1d.join(', ')})`);
  check(m.filter((x) => x.zone === 'cockpit' || x.zone === 'en-tête mobile').length === 0, '1d) lot 11 : le cockpit ne change pas du tout (plus de compteur « en direct »)');
  const kevinRow = p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: 'Kevin Roussel' }) }).first();
  check(await kevinRow.locator('[data-testid=bubble-live]').count() === 0, '1d) Kevin n’est plus « en cours »');

  // 1e) un NOUVEAU chrono (Léa) → sa case seule passe « en cours »
  D.active_sessions = [...D.active_sessions, sLea];
  await p.clock.fastForward(31000); await p.waitForTimeout(1500);
  m = await takeMuts(p); RESULTS['nouveau chrono'] = m.length;
  report('1e) Léa démarre un chrono', m);
  const zones1e = [...new Set(m.map((x) => x.zone))];
  check(m.length > 0 && zones1e.every((z) => ['ligne Léa Petit', 'carte Léa Petit', 'remplissage'].includes(z)), `1e) seule la case de Léa change (${zones1e.join(', ')})`);
  check(m.filter((x) => x.zone === 'cockpit' || x.zone === 'en-tête mobile').length === 0, '1e) lot 11 : le cockpit ne change pas du tout');
  const leaRow = p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: 'Léa Petit' }) }).first();
  check(await leaRow.locator('[data-testid=bubble-live]').count() === 1, '1e) la bulle de Léa passe « en cours »');

  // 1f) de nouveau rien : 0
  await p.clock.fastForward(31000); await p.waitForTimeout(1500);
  m = await takeMuts(p); RESULTS['sondage suivant'] = m.length;
  report('1f) sondage suivant, rien de changé', m);
  check(m.length === 0, `1f) sondage suivant sans changement : ${m.length} mutation(s)`);
  check(await p.locator('.bt-spin').count() === 0, 'aucun écran « chargement » pendant les rafraîchissements');
  await ctx.close();
}

// ─── Mobile : même mesure (retour sur l'onglet + sondage) ──────────────────────
{
  D.active_sessions = [sKevin, sMarc, sNina];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx);
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/admin`); await p.waitForSelector('.bt-pl-m-card', { timeout: 20000 }); await p.waitForTimeout(2500);
  await startObs(p);
  await p.clock.fastForward(62000); await p.waitForTimeout(1500);
  await setVis(p, 'hidden'); await p.waitForTimeout(300); await setVis(p, 'visible'); await p.waitForTimeout(2000);
  const m = await takeMuts(p); RESULTS['mobile : sondages + retour onglet'] = m.length;
  report('mobile : sondages 30/60 s + retour onglet', m);
  check(m.length === 0, `mobile : ${m.length} mutation(s) sans changement (attendu 0)`);
  await ctx.close();
}

// ═══ 2) Cockpit : rangé, fin, sans saut ═══════════════════════════════════════
D.companies[0].subscription_status = 'trialing'; D.companies[0].trial_ends_at = day(12); D.companies[0].kiosk_enabled = true; // captures : essai + « Borne »
const overlap = (a, c) => a.x < c.x + c.width - 0.5 && c.x < a.x + a.width - 0.5 && a.y < c.y + c.height - 0.5 && c.y < a.y + a.height - 0.5;
const fmt = (x) => `${Math.round(x.x)}–${Math.round(x.x + x.width)}`;
const geo = (pg) => Promise.all(['.bt-pl-cockpit', '.bt-pl-cockpit .bt-pl-logo', '.bt-pl-stats', '.bt-pl-cockpit-right', '.bt-pl-bar'].map((s) => vis(pg, s).first().boundingBox()));
for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900]]) {
  D.active_sessions = [sKevin, sMarc, sNina];
  const c = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(c); const pg = await c.newPage();
  await pg.goto(`http://localhost:${PORT}/admin`); await pg.waitForSelector('[data-testid=stat-waiting]', { timeout: 20000 }); await pg.waitForTimeout(1800);
  const [ck, lg, st, rt, bar] = await geo(pg);
  const trialOn = await vis(pg, '.bt-pl-cockpit .bt-pl-trial').count() === 1;
  const liveOn = await vis(pg, '[data-testid=bubble-live], [data-testid=live-chip]').count() > 0 && await vis(pg, '[data-testid=stat-live]').count() === 0;
  const inside = [st, lg, rt].every((x) => x && x.x >= ck.x - 0.5 && x.x + x.width <= ck.x + ck.width + 0.5 && x.y >= ck.y - 0.5 && x.y + x.height <= ck.y + ck.height + 0.5);
  check(trialOn && liveOn && !overlap(st, lg) && !overlap(lg, rt) && !overlap(st, rt) && inside,
    `${width}×${height} essai + 3 pointages en cours (cases vertes, sans compteur) : logo ${fmt(lg)}, chiffres ${fmt(st)}, droite ${fmt(rt)} — aucun chevauchement, tout dans le cockpit`);
  check(lg.x < st.x && st.x + st.width <= rt.x + 0.5, `${width}×${height} : logo à gauche, chiffres au centre, entreprise à droite`);
  const stCenter = st.x + st.width / 2, ckCenter = ck.x + ck.width / 2;
  console.log(`   ${width}×${height} : cockpit ${Math.round(ck.height)} px de haut, centre des chiffres ${Math.round(stCenter)} / centre du cockpit ${Math.round(ckCenter)}`);
  check(ck.height <= 50, `${width}×${height} : cockpit fin (${Math.round(ck.height)} px ≤ 50)`);
  // Une ligne = tous les chiffres centrés à la même hauteur (à 2 px près).
  const mids = await pg.evaluate(() => [...document.querySelectorAll('.bt-pl-cockpit .bt-pl-stat')].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
  check(Math.max(...mids) - Math.min(...mids) <= 2, `${width}×${height} : les chiffres tiennent sur une ligne (${mids.join(', ')})`);
  // Sans saut : les chronos s'arrêtent tous → les cases vertes s'éteignent ; le cockpit ne bouge pas.
  D.active_sessions = [];
  await pg.clock.fastForward(31000); await pg.waitForTimeout(1500);
  const [ck2, lg2, st2, rt2, bar2] = await geo(pg);
  const liveOff = await vis(pg, '[data-testid=bubble-live], [data-testid=live-chip]').count() === 0;
  const still = (a, z) => Math.abs(a.x - z.x) < 0.5 && Math.abs(a.y - z.y) < 0.5 && Math.abs(a.width - z.width) < 0.5 && Math.abs(a.height - z.height) < 0.5;
  check(liveOff && still(ck, ck2) && still(lg, lg2) && still(st, st2) && still(rt, rt2) && still(bar, bar2), `${width}×${height} : plus aucun pointage en cours, ni le cockpit ni la barre ne bougent`);
  D.active_sessions = [sKevin, sMarc, sNina];
  await pg.clock.fastForward(31000); await pg.waitForTimeout(1500);
  const [ck3, lg3, st3, rt3] = await geo(pg);
  check(await vis(pg, '[data-testid=bubble-live]').count() > 0 && await vis(pg, '[data-testid=stat-live]').count() === 0 && still(ck, ck3) && still(lg, lg3) && still(st, st3) && still(rt, rt3), `${width}×${height} : les pointages reprennent (cases vertes), toujours sans saut ni compteur`);
  // Les panneaux des chiffres s'ouvrent toujours.
  await pg.click('[data-testid=stat-waiting]'); await pg.waitForTimeout(200);
  check(await vis(pg, '.bt-pl-sp').count() === 1, `${width}×${height} : un clic sur un chiffre ouvre son panneau`);
  await pg.locator('.bt-pl-ddbackdrop').first().click(); await pg.waitForTimeout(200);
  await pg.mouse.move(width / 2, 300); await pg.waitForTimeout(150);
  await pg.screenshot({ path: `${SH}/admin-${width}x${height}.png` });
  await c.close();
}

// ─── Mobile 390×844 : en-tête rangé ────────────────────────────────────────────
{
  D.active_sessions = [sKevin, sMarc, sNina];
  const mob = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(mob); const pm = await open(mob, '.bt-pl-m-card');
  const noHScroll = await pm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(noHScroll, 'mobile : aucun défilement horizontal');
  const head = pm.locator('.bt-pl-m-head');
  const headTxt = (await head.innerText()).replace(/\s+/g, ' ');
  check(await head.locator('.bt-pl-logo').count() === 1, 'mobile : logo dans l’en-tête');
  check(headTxt.includes('Pizzeria Exemple'), 'mobile : nom de l’entreprise dans l’en-tête');
  check(await head.locator('.bt-pl-trial').count() === 1, 'mobile : pastille d’essai conservée');
  check(await head.locator('[data-testid=m-stat-waiting]').count() === 1 && /6 j/.test(await head.locator('[data-testid=m-stat-waiting]').innerText()), 'mobile : chiffre « À relancer » compact (6 j)');
  check(await head.locator('[data-testid=m-stat-live]').count() === 0 && await head.locator('.bt-pl-m-stat').count() === 2, 'mobile (lot 11) : 2 puces, plus de « en direct »');
  check(await head.locator('button[aria-label=Menu]').count() === 1 && await head.locator('button[aria-label="Semaine précédente"]').count() === 1 && await head.locator('button[aria-label=Déconnexion]').count() === 1 && await head.locator('.bt-pl-daypill').count() === 7, 'mobile : menu, semaines, déconnexion et jours toujours là');
  const boxes = await head.locator('button:visible, .bt-pl-logo, .bt-pl-trial').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, r: r.right, y: r.top, b: r.bottom }; }));
  check(boxes.every((x) => x.x >= -0.5 && x.r <= 390.5), 'mobile : rien ne dépasse de l’écran dans l’en-tête');
  await pm.screenshot({ path: `${SH}/admin-mobile-390x844.png` });
  await mob.close();
}

// ═══ 3) « 📟 Borne » ═══════════════════════════════════════════════════════════
{
  D.companies[0] = { ...COMPANY, kiosk_enabled: false };
  const c0 = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(c0); const p0 = await open(c0);
  check(await p0.locator('[data-testid=bar-kiosk]').count() === 0, '3) borne non activée : pas de bouton « Borne »');
  await c0.close();

  D.companies[0] = { ...COMPANY, kiosk_enabled: true };
  const c1 = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(c1); const p1 = await open(c1);
  const btn = p1.locator('[data-testid=bar-kiosk]');
  check(await btn.count() === 1 && (await btn.innerText()).includes('Borne'), '3) borne activée : bouton « 📟 Borne » dans la barre');
  const neighbour = await btn.evaluate((e) => [e.previousElementSibling, e.nextElementSibling].map((s) => (s && s.textContent || '').trim()));
  check(neighbour.some((t) => t.startsWith('Réserves')), `3) à côté de « Réserves » (${neighbour.join(' | ')})`);
  const [rb, kb] = await Promise.all([p1.locator('.bt-pl-bar button', { hasText: 'Réserves' }).boundingBox(), btn.boundingBox()]);
  check(rb && kb && Math.abs(rb.y - kb.y) < 3, '3) sur la même ligne que « Réserves »');
  const w0 = log.writes;
  await btn.click(); await p1.waitForTimeout(800);
  const dlg = p1.locator('[role=dialog]');
  check(await dlg.count() === 1 && (await dlg.innerText()).includes('Borne de pointage'), '3) la fenêtre « Borne de pointage » s’ouvre');
  // Lot 11 : une seule tablette — le code s'affiche tout de suite, plus de liste ni d'« Ajouter une borne ».
  check(/123\s?456/.test(await dlg.innerText()) && (log.kioskCodes || 0) >= 1, '3) le code à 6 chiffres s’affiche tout de suite');
  check((await dlg.innerText()).includes('Aucune tablette reliée'), '3) état « Aucune tablette reliée »');
  check(await dlg.locator('button', { hasText: 'Ajouter une borne' }).count() === 0, '3) plus de « Ajouter une borne »');
  await p1.screenshot({ path: `${SH}/admin-borne-dialog.png` });
  check(log.writes === w0, '3) ouvrir la fenêtre n’écrit rien en base');
  await p1.keyboard.press('Escape'); await p1.waitForTimeout(300);
  check(await p1.locator('[role=dialog]').count() === 0, '3) la fenêtre se referme');
  await c1.close();

  // Barre d'actions avec « Borne » + assistant : rien ne se chevauche, même à 1024.
  for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900]]) {
    const c2 = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await setup(c2); const p2 = await open(c2);
    const res = await p2.evaluate(() => {
      const bar = document.querySelector('.bt-pl-bar'); const br = bar.getBoundingClientRect();
      const kids = [...bar.children].map((e) => e.getBoundingClientRect());
      const btns = [...bar.querySelectorAll('button')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
      const ov = (a, c) => a.left < c.right - 0.5 && c.left < a.right - 0.5 && a.top < c.bottom - 0.5 && c.top < a.bottom - 0.5;
      let overlaps = 0; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (ov(kids[i], kids[j])) overlaps++;
      for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (ov(btns[i], btns[j])) overlaps++;
      const inside = btns.every((r) => r.left >= br.left - 0.5 && r.right <= br.right + 0.5);
      const mids = btns.map((r) => r.top + r.height / 2); const oneLine = Math.max(...mids) - Math.min(...mids) < 6;
      return { overlaps, inside, oneLine, h: Math.round(br.height) };
    });
    check(res.overlaps === 0 && res.inside && res.oneLine, `3) ${width}×${height} : barre avec « Borne » sans chevauchement ni débordement (hauteur ${res.h} px${res.overlaps ? `, ${res.overlaps} chevauchement(s)` : ''}${res.inside ? '' : ', déborde'}${res.oneLine ? '' : ', 2 lignes'})`);
    await c2.close();
  }
}

check(log.writes === 0, `aucune écriture en base (${log.writes})`);
console.log('\nMutations par scénario :', JSON.stringify(RESULTS));
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
