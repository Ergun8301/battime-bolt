// Lancer : npm run build, puis node scripts/tests/planning-lot2.mjs out docs/captures-lot2
// Captures « avant » (build de la base, captures seules) :
//   AVANT=1 node scripts/tests/planning-lot2.mjs <out-avant> docs/captures-lot2
//
// Lot 2 (d) — sur la VRAIE page planning du bureau (base simulée AVEC état, horloge figée
// au mercredi 21 octobre 2026, 10:00 à Paris ; aucune vraie base, aucun e-mail) :
// glisser une bulle avec Ctrl, Alt ou ⌘ maintenu la COPIE ; un glisser simple la déplace.
// Vrais mouvements de souris, par petits pas (capteur « pointeur » de dnd-kit, seuil 8 px).
//  D1  glisser simple → un PATCH (déplacement), aucun POST
//  D2  Ctrl + glisser une bulle avec heures envoyées et note → UN POST planning (chantier,
//      horaire, note), l'original intact, la copie sans heures, rien sur time_entries ni /functions
//  D3  Alt et ⌘ copient ; Ctrl appuyé en cours de route copie ; relâché avant le dépôt : déplace
//  D4  repères : .bt-pl--copying, pastille « + », curseur « copy », « Copier ici » (sinon « Déposer ici »)
//  D5  glisser simple d'une bulle envoyée / notée / en cours : refusé, avec l'astuce,
//      zéro écriture ; réordonner dans sa propre case reste permis
//  D5b bulle RETIRÉE par le salarié (lot 2 c) : déplacée, sa ligne retirée d'abord détachée
//  D5c bulle qui ne porte qu'un brouillon VIDE : déplacée, le brouillon effacé d'abord
//  D5d heures envoyées depuis le chargement (l'écran ne le sait pas) : la base refuse, zéro écriture
//  D6  copie refusée, zéro écriture : absence, même case, chevauchement 08–12 sur 08–17,
//      septembre clôturé, salarié clôturé
//  D7  copie déposée SUR une bulle : POST puis positions ; ordre affiché juste
//  D8  « Annuler » la copie → DELETE de la copie ; si une heure la désigne entre-temps : gardée, dit
//  D9  Échap avec Ctrl, et Ctrl + glisser en mode « Sélectionner » : zéro écriture, aucune fenêtre
//  D10 déplacement vers une absence / un salarié ou un mois clôturé : refusé
//  D11 Assistant « déplace l'intervention » : même garde (heures envoyées → rien n'est déplacé)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/captures-lot2', PORT = '4711'] = process.argv;
const AVANT = process.env.AVANT === '1';
fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) ─────────────────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const ago = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();
// Colonnes de la semaine affichée : lundi = 0 … dimanche = 6.
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6;

// ─── Base simulée (avec état) — noms fictifs neutres ─────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000d2';
const W1 = { id: 'w1', company_id: CO, client_name: 'Salle', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Dépôt', city: 'Vienne', is_active: true };
const u = (id, first, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: 'Test', role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: null, estimated_end: null, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: `${work_date}T06:00:00Z`, ...extra });
const entry = (id, user_id, work_date, ws, status, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date, worksite_id: ws?.id ?? null, planning_id: null, status, start_time: '08:00:00', end_time: `${String(8 + Math.floor(minutes / 60)).padStart(2, '0')}:00:00`, total_minutes: minutes, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, ...extra });
const H = (s, e) => ({ estimated_start: `${s}:00`, estimated_end: `${e}:00` });
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
const fresh = () => ({
  users: [u('u-admin', 'Alex', 'admin'), u('u-sam', 'Sam'), u('u-lou', 'Lou'), u('u-noa', 'Noa'), u('u-tom', 'Tom')],
  companies: [{ ...COMPANY }],
  worksites: [W1, W2],
  planning: [
    // Sam : lun. libre (08–12, note) · mar. heures ENVOYÉES + note, et une 2e bulle avant elle · mer. pointage en cours · ven. 08–17
    slot('ps-mon', 'u-sam', D_(19), W1, { ...H('08:00', '12:00'), notes: 'code portail 1234' }),
    slot('ps-tue', 'u-sam', D_(20), W1, { ...H('08:00', '17:00'), notes: 'clé chez le gardien', position: 1 }),
    slot('ps-tue2', 'u-sam', D_(20), W2, { ...H('18:00', '20:00'), position: 0 }),
    slot('ps-wed', 'u-sam', D_(21), W2),
    slot('ps-fri', 'u-sam', D_(23), W2, H('08:00', '17:00')),
    // Sam, semaine du 28 septembre (septembre clôturé) : mar. 29/09 et jeu. 01/10
    slot('ps-s29', 'u-sam', '2026-09-29', W1), slot('ps-o1', 'u-sam', '2026-10-01', W2),
    // Lou : lun. libre · mar. deux bulles (08–12 puis 13:30–17:00) · absente (maladie) jeudi
    slot('pl-mon', 'u-lou', D_(19), W2),
    slot('pl-tue-a', 'u-lou', D_(20), W2, { ...H('08:00', '12:00'), position: 0 }),
    slot('pl-tue-b', 'u-lou', D_(20), W1, { ...H('13:30', '17:00'), position: 1 }),
    slot('pl-abs', 'u-lou', D_(22), null, { absence_type: 'maladie' }),
    // Noa : lun. retirée par le salarié (ligne « cancelled ») · mar. heures notées (brouillon)
    // · mer. un brouillon VIDE (08:00–08:00, jamais envoyé)
    slot('pn-mon', 'u-noa', D_(19), W1), slot('pn-tue', 'u-noa', D_(20), W2), slot('pn-wed', 'u-noa', D_(21), W1),
    // Tom : clôturé jusqu'au mardi 20 · jeu. libre
    slot('pt-thu', 'u-tom', D_(22), W1),
  ],
  time_entries: [
    entry('e1', 'u-sam', D_(20), W1, 'submitted', 480, { planning_id: 'ps-tue' }),
    entry('e2', 'u-noa', D_(19), W1, 'cancelled', 0, { planning_id: 'pn-mon' }),
    entry('e3', 'u-noa', D_(20), W2, 'draft', 120, { planning_id: 'pn-tue' }),
    entry('e4', 'u-noa', D_(21), W1, 'draft', 0, { planning_id: 'pn-wed', locked: false, submitted_at: null }),
  ],
  active_sessions: [{ user_id: 'u-sam', company_id: CO, worksite_id: 'w2', planning_id: 'ps-wed', work_date: D_(21), started_at: ago(2), positions: [] }],
  month_closures: [{ company_id: CO, month: '2026-09-01' }],
  user_closures: [{ user_id: 'u-tom', company_id: CO, closed_until: D_(20), closed_at: '2026-10-20T17:00:00Z', closed_by: 'u-admin', reopened_at: null }],
  leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [], assistant_journal: [],
});
let D = fresh();
// Réponse de l'Assistant (D11) : changée avant chaque demande.
let REP = null;

// ─── Session simulée + routes Supabase (comme admin-lot11) ───────────────────────
const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: 'u-admin', email: 'u-admin@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
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
    if (sel.includes('worksite:worksites')) out.worksite = D.worksites.find((w) => w.id === row.worksite_id) || null;
    if (sel.includes('user:users')) out.user = D.users.find((x) => x.id === row.user_id) || null;
  }
  return out;
};
const log = { writes: [], calls: [] };
let seq = 0;
const setup = async (ctx) => {
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/assistant')) { log.calls.push('FN assistant'); return r.fulfill({ json: REP || { answer: 'ok', links: [], remaining: 40 } }); }
    if (url.pathname.startsWith('/functions/v1/')) { log.writes.push({ m: 'FN', t: url.pathname }); return r.fulfill({ json: {} }); }
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
      const saved = arr.map((row) => { const x = { id: row.id || `new-${++seq}`, position: null, added_by_worker: false, created_at: NOW.toISOString(), ...row }; const i = D[t].findIndex((y) => y.id === x.id); if (i >= 0) D[t][i] = x; else D[t].push(x); return x; });
      log.writes.push({ m, t, rows: arr, ids: saved.map((x) => x.id) });
      return r.fulfill({ status: 201, json: single ? saved[0] : saved });
    }
    if (m === 'PATCH') {
      const body = JSON.parse(r.request().postData() || '{}');
      const hit = filterRows(D[t], url.searchParams); for (const x of hit) Object.assign(x, body);
      log.writes.push({ m, t, ids: hit.map((x) => x.id), body });
      // Comme PostgREST avec `select` : les lignes touchées (lib/erase compte les lignes détachées).
      return r.fulfill({ json: hit.map((x) => ({ ...x })) });
    }
    const all = filterRows(D[t], url.searchParams).map((x) => embed(t, x, sel));
    if (single) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const rows = all.slice(off, lim ? off + Number(lim) : undefined);
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
  });
};
const writesSince = (n) => log.writes.slice(n);
const planningWrites = (n) => writesSince(n).filter((x) => x.t === 'planning');

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const note = (m) => console.log('ℹ️ ', m);
const newPage = async () => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector('.bt-pl-gridwrap .bt-pl-grab', { timeout: 20000 }); await p.waitForTimeout(1500);
  return { ctx, p };
};

// ─── Repères dans la grille ──────────────────────────────────────────────────────
const row = (p, first) => p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: `${first} Test` }) }).first();
const cell = (p, first, day) => row(p, first).locator('td.bt-pl-cell').nth(day);
const bubIn = (p, first, day, i = 0) => cell(p, first, day).locator('.bt-pl-grab').nth(i);
const bub = (p, id) => p.locator(`[data-bub="${id}"] .bt-pl-grab`).first();
const idsIn = (p, first, day) => cell(p, first, day).locator('[data-bub]').evaluateAll((els) => els.map((e) => e.getAttribute('data-bub')));
const center = async (loc) => { const x = await loc.boundingBox(); return { x: x.x + x.width / 2, y: x.y + x.height / 2 }; };
/** Le bas d'une case : à côté de ses bulles, jamais dessus. */
const cellSpot = async (loc) => { const x = await loc.boundingBox(); return { x: x.x + x.width / 2, y: x.y + x.height - 12 }; };
/**
 * Un glisser à la souris. key : 'Control' | 'Alt' | 'Meta' ; keyAt : 'start' (avant
 * l'appui) | 'mid' (en cours de route) ; release : relâchée juste avant le dépôt ;
 * during(p) : appelé bulle en main, au-dessus de la cible (captures, mesures).
 */
const drag = async (p, from, to, { key = null, keyAt = 'start', release = false, escape = false, during = null } = {}) => {
  const a = await center(from);
  const z = to.x !== undefined ? to : await cellSpot(to);
  await p.mouse.move(a.x, a.y);
  if (key && keyAt === 'start') await p.keyboard.down(key);
  await p.mouse.down();
  await p.mouse.move(a.x + 12, a.y + 4, { steps: 4 });
  if (key && keyAt === 'mid') await p.keyboard.down(key);
  await p.mouse.move(z.x, z.y, { steps: 14 });
  await p.waitForTimeout(180);
  if (key && release) { await p.keyboard.up(key); await p.mouse.move(z.x + 2, z.y, { steps: 2 }); await p.waitForTimeout(80); }
  let out = null;
  if (during) out = await during(p);
  if (escape) { await p.keyboard.press('Escape'); await p.waitForTimeout(120); }
  await p.mouse.up();
  if (key && !release) await p.keyboard.up(key);
  await p.waitForTimeout(800);
  return out;
};
const toasts = async (p) => (await p.locator('[data-sonner-toast]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').trim());
/** Laisse se fermer les petits messages (sonner) : 8 s d'horloge, puis le temps du rendu. */
const settle = async (p) => { await p.clock.fastForward(8000); await p.waitForTimeout(600); };
/** Ce qu'on voit, bulle en main. */
const dragState = (p) => p.evaluate(() => {
  const root = document.querySelector('.bt-pl');
  const ov = document.querySelector('[data-testid=drag-overlay]') || document.querySelector('.bt-pl-overlay');
  const over = document.querySelector('.bt-pl-cell-over .bt-pl-drop');
  const shown = (sel) => { const e = over?.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; };
  const src = document.querySelector('.bt-pl-dragging');
  return {
    copying: !!root?.classList.contains('bt-pl--copying'),
    badge: !!ov?.querySelector('.bt-pl-copybadge'),
    cursor: ov ? getComputedStyle(ov).cursor : null,
    overText: over ? over.innerText.replace(/\s+/g, ' ').trim() : null,
    copyHere: shown('span.cp:not(.bt-pl-drop-arrow span)'),
    dropHere: shown('span.mv:not(.bt-pl-drop-arrow span)'),
    overlayReal: !!ov?.querySelector('.bt-pl-real-txt'),
    overlayHours: ov ? ov.innerText.replace(/\s+/g, ' ') : '',
    srcOpacity: src ? getComputedStyle(src).opacity : null,
  };
});
const shot = (name) => async (p) => { await p.screenshot({ path: `${SH}/${AVANT ? 'avant' : 'apres'}-glisser-${name}.png` }); };

// ═══ AVANT (build de la base) : captures seules ══════════════════════════════════
if (AVANT) {
  const { ctx, p } = await newPage();
  let w = log.writes.length;
  await drag(p, bubIn(p, 'Sam', TUE, 1), cell(p, 'Lou', WED), { key: 'Control', during: shot('ctrl-pendant') });
  await shot('ctrl-deplace')(p);
  note(`avant : Ctrl + glisser de la bulle envoyée de Sam → ${JSON.stringify(planningWrites(w).map((x) => `${x.m} ${x.ids?.join(',') || ''} ${x.body ? JSON.stringify(x.body) : ''}`))} (déplacée, pas copiée)`);
  await settle(p);
  w = log.writes.length;
  await drag(p, bubIn(p, 'Tom', THU), cell(p, 'Lou', THU));
  await p.waitForTimeout(400);
  await shot('absence')(p);
  note(`avant : glisser sur l'absence de Lou → ${JSON.stringify(planningWrites(w).map((x) => `${x.m} ${x.ids?.join(',') || ''}`))} (la bulle disparaît de l'écran)`);
  await ctx.close();
  console.log(`\nCaptures « avant » dans ${SH}`);
  await b.close(); srv.close();
  process.exit(0);
}

// ═══ APRÈS ═══════════════════════════════════════════════════════════════════════
{
  const { ctx, p } = await newPage();
  check(await bub(p, 'ps-mon').getAttribute('title') === 'Glisser pour déplacer · Ctrl ou Alt (⌥) + glisser pour copier · cliquer pour modifier', 'infobulle : « Glisser pour déplacer · Ctrl ou Alt (⌥) + glisser pour copier · cliquer pour modifier »');
  check(await p.locator('[data-bub]').count() >= 10, `repère data-bub posé sur chaque bulle (${await p.locator('[data-bub]').count()})`);

  // D1 + D4 (sans touche) — glisser simple : déplacement
  let w = log.writes.length;
  let st = await drag(p, bub(p, 'ps-mon'), cell(p, 'Sam', THU), { during: async (pg) => { const s = await dragState(pg); await shot('deplacer-pendant')(pg); return s; } });
  check(!st.copying && !st.badge && st.dropHere && !st.copyHere && /déposer ici/i.test(st.overText || ''), `D4 sans touche : « ${st.overText} », ni pastille ni .bt-pl--copying`);
  let pw = planningWrites(w);
  const move = pw.filter((x) => x.m === 'PATCH' && x.body.work_date);
  check(move.length === 1 && move[0].ids[0] === 'ps-mon' && move[0].body.work_date === D_(22) && move[0].body.user_id === 'u-sam' && pw.every((x) => x.m === 'PATCH'), `D1 glisser simple → un PATCH (lun. → jeu.), aucun POST (${pw.map((x) => x.m).join(', ')})`);
  check(JSON.stringify(await idsIn(p, 'Sam', THU)) === '["ps-mon"]' && (await idsIn(p, 'Sam', MON)).length === 0, 'D1 la bulle est passée au jeudi');
  check(await p.locator('[role=dialog]').count() === 0, 'D9 aucune fenêtre ouverte après le dépôt');

  // D2 + D4 (Ctrl) — copie d'une bulle avec heures envoyées et note
  await settle(p);
  w = log.writes.length;
  st = await drag(p, bub(p, 'ps-tue'), cell(p, 'Lou', WED), { key: 'Control', during: async (pg) => { const s = await dragState(pg); await shot('ctrl-pendant')(pg); return s; } });
  check(st.copying && st.badge && st.cursor === 'copy', `D4 Ctrl : .bt-pl--copying, pastille « + », curseur ${st.cursor}`);
  check(st.copyHere && !st.dropHere && /copier ici/i.test(st.overText || ''), `D4 la case dit « ${st.overText} » (et plus « Déposer ici »)`);
  check(st.srcOpacity === '1', `D4 la bulle d'origine reste pleine (opacité ${st.srcOpacity})`);
  check(!st.overlayReal && /08:00–17:00/.test(st.overlayHours), `D4 la bulle tenue montre le prévu, sans les heures envoyées (« ${st.overlayHours.trim()} »)`);
  const ws = writesSince(w);
  pw = ws.filter((x) => x.t === 'planning');
  const post = pw.filter((x) => x.m === 'POST');
  const r0 = post[0]?.rows?.[0] || {};
  check(post.length === 1 && pw.length === 1 && post[0].rows.length === 1, `D2 exactement UN POST planning (${pw.map((x) => x.m).join(', ')})`);
  check(r0.user_id === 'u-lou' && r0.work_date === D_(21) && r0.worksite_id === 'w1' && r0.estimated_start === '08:00:00' && r0.estimated_end === '17:00:00' && r0.notes === 'clé chez le gardien' && r0.absence_type === null && r0.created_by === 'u-admin' && r0.company_id === CO && !('position' in r0) && !('added_by_worker' in r0), `D2 champs copiés : chantier, horaire, note (${JSON.stringify(r0)})`);
  check(ws.every((x) => x.t !== 'time_entries' && x.m !== 'FN'), 'D2 rien sur time_entries, aucun appel /functions');
  const copyId = post[0]?.ids?.[0];
  check(JSON.stringify(await idsIn(p, 'Sam', TUE)) === '["ps-tue2","ps-tue"]' && D.planning.find((x) => x.id === 'ps-tue').user_id === 'u-sam', "D2 l'original reste en place, intact");
  const copyCell = cell(p, 'Lou', WED);
  check(JSON.stringify(await idsIn(p, 'Lou', WED)) === JSON.stringify([copyId]) && await copyCell.locator('.bt-pl-real-txt').count() === 0 && /08:00–17:00/.test(await copyCell.innerText()) && !/à envoyer/.test(await copyCell.innerText()), 'D2 la copie s’affiche en « prévu » 08:00–17:00, sans heures');
  check(await bub(p, 'ps-tue').locator('.bt-pl-real-txt').count() === 1, "D2 l'original garde ses heures envoyées");
  const card = (await p.locator('[data-testid=undo-card]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Intervention copiée · Lou · mer\. 21 oct\./.test(card) && /Annuler/.test(card), `D2 carte « ${card.trim()} »`);
  check(await p.locator('[role=dialog]').count() === 0, 'D9 aucune fenêtre ouverte après la copie');
  await p.mouse.move(720, 880); await p.waitForTimeout(150);
  await shot('ctrl-copie')(p);

  // D8 — « Annuler » la copie
  w = log.writes.length;
  await p.click('[data-testid=action-undo]'); await p.waitForSelector('[data-testid=action-undone]', { timeout: 8000 }).catch(() => {});
  pw = planningWrites(w);
  check(pw.length === 1 && pw[0].m === 'DELETE' && JSON.stringify(pw[0].ids) === JSON.stringify([copyId]), `D8 « Annuler » → DELETE de la copie seule (${pw.map((x) => `${x.m} ${x.ids}`).join(', ')})`);
  check(/la copie est retirée du planning/.test(await p.locator('[data-testid=undo-card]').innerText()), 'D8 « Annulé : la copie est retirée du planning. »');
  await p.waitForTimeout(500);
  check((await idsIn(p, 'Lou', WED)).length === 0 && D.planning.some((x) => x.id === 'ps-tue'), "D8 la copie a disparu, l'original est là");
  await p.click('[data-testid=undo-close]'); await p.waitForTimeout(200);

  // D3 — Alt, ⌘, Ctrl en cours de route : copie ; relâché avant le dépôt : déplacement
  for (const [k, day, label] of [['Alt', FRI, 'Alt'], ['Meta', SAT, '⌘ (Meta)']]) {
    await settle(p);
    w = log.writes.length;
    await drag(p, bub(p, 'pl-mon'), cell(p, 'Lou', day), { key: k });
    pw = planningWrites(w);
    check(pw.length === 1 && pw[0].m === 'POST' && pw[0].rows[0].work_date === D_(19 + day) && pw[0].rows[0].user_id === 'u-lou', `D3 ${label} + glisser → copie (${pw.map((x) => x.m).join(', ')})`);
  }
  await settle(p);
  w = log.writes.length;
  await drag(p, bub(p, 'pl-mon'), cell(p, 'Lou', SUN), { key: 'Control', keyAt: 'mid' });
  pw = planningWrites(w);
  check(pw.length === 1 && pw[0].m === 'POST' && pw[0].rows[0].work_date === D_(25), `D3 Ctrl appuyé en cours de route → copie (${pw.map((x) => x.m).join(', ')})`);
  check(JSON.stringify(await idsIn(p, 'Lou', MON)) === '["pl-mon"]', 'D3 l’original de Lou est toujours lundi');
  await settle(p);
  w = log.writes.length;
  await drag(p, bub(p, 'pt-thu'), cell(p, 'Tom', FRI), { key: 'Control', release: true });
  pw = planningWrites(w);
  check(pw.some((x) => x.m === 'PATCH' && x.ids[0] === 'pt-thu' && x.body.work_date === D_(23)) && !pw.some((x) => x.m === 'POST'), `D3 Ctrl relâché avant le dépôt → déplacement (${pw.map((x) => x.m).join(', ')})`);

  // D7 — copie déposée SUR une bulle : POST, puis les positions
  await settle(p);
  w = log.writes.length;
  const target = await center(bub(p, 'pl-tue-b'));
  await drag(p, bub(p, 'pt-thu'), target, { key: 'Control' });
  pw = planningWrites(w);
  const nid = pw[0]?.ids?.[0];
  const pos = Object.fromEntries(pw.filter((x) => x.m === 'PATCH' && 'position' in x.body).map((x) => [x.ids[0], x.body.position]));
  check(pw[0]?.m === 'POST' && pw.slice(1).every((x) => x.m === 'PATCH' && Object.keys(x.body).join() === 'position'), `D7 POST d'abord, puis seulement des positions (${pw.map((x) => x.m).join(', ')})`);
  check(pos['pl-tue-a'] === 0 && pos[nid] === 1 && pos['pl-tue-b'] === 2, `D7 positions : ${JSON.stringify(pos)}`);
  await p.waitForTimeout(400);
  check(JSON.stringify(await idsIn(p, 'Lou', TUE)) === JSON.stringify(['pl-tue-a', nid, 'pl-tue-b']), `D7 ordre affiché : ${JSON.stringify(await idsIn(p, 'Lou', TUE))}`);
  check(JSON.stringify(await idsIn(p, 'Tom', FRI)) === '["pt-thu"]', 'D7 l’original de Tom n’a pas bougé');
  await p.click('[data-testid=undo-close]').catch(() => {}); await p.waitForTimeout(150);

  // D5 — glisser simple d'une bulle qui porte des heures : refusé, avec l'astuce
  const locked = [
    ['ps-tue', 'Heures envoyées — non déplaçable'], ['pn-tue', 'Heures notées par le salarié — non déplaçable'],
    ['ps-wed', 'Pointage en cours — non déplaçable'],
  ];
  for (const [id, why] of locked) {
    await settle(p);
    w = log.writes.length;
    await drag(p, bub(p, id), cell(p, 'Sam', SAT));
    const t = await toasts(p);
    check(writesSince(w).length === 0 && t.some((x) => x.includes(`${why} · maintenez Ctrl ou Alt pour copier`)), `D5 ${id} : « ${t.find((x) => x.includes('déplaçable')) || t.join(' | ')} », zéro écriture`);
    if (id === 'ps-tue') { await p.mouse.move(720, 880); await shot('refus-envoyee')(p); }
  }
  check((await idsIn(p, 'Sam', SAT)).length === 0, 'D5 rien n’est arrivé samedi');
  await settle(p);
  w = log.writes.length;
  await drag(p, bub(p, 'ps-tue'), await center(bub(p, 'ps-tue2')));
  pw = planningWrites(w);
  check(pw.length > 0 && pw.every((x) => x.m === 'PATCH' && Object.keys(x.body).join() === 'position') && (await toasts(p)).every((x) => !x.includes('déplaçable')), `D5 réordonner une bulle envoyée DANS sa case : permis (${pw.length} position(s))`);
  check(JSON.stringify(await idsIn(p, 'Sam', TUE)) === '["ps-tue","ps-tue2"]', 'D5 nouvel ordre affiché');

  // D5b — une bulle RETIRÉE par le salarié se déplace (comme elle se supprime, lot 2 c) :
  // sa ligne retirée est d'abord détachée (heures intactes, sur leur jour), puis la case bouge.
  await settle(p);
  check(await p.locator('[data-bub="pn-mon"] [data-withdrawn="1"]').count() === 1, 'D5b avant : la bulle retirée est grisée');
  w = log.writes.length;
  await drag(p, bub(p, 'pn-mon'), cell(p, 'Noa', THU));
  let mw = writesSince(w);
  const fmtW = (l) => l.map((x) => `${x.m} ${x.t} ${x.ids?.join(',') || ''} ${x.body ? JSON.stringify(x.body) : ''}`).join(' | ');
  check(mw[0]?.m === 'PATCH' && mw[0].t === 'time_entries' && mw[0].ids.join() === 'e2' && mw[0].body.planning_id === null
    && mw.some((x) => x.m === 'PATCH' && x.t === 'planning' && x.ids[0] === 'pn-mon' && x.body.work_date === D_(22))
    && mw.every((x) => x.m === 'PATCH') && (await toasts(p)).every((x) => !x.includes('déplaçable')), `D5b bulle retirée : ligne détachée, puis case déplacée (${fmtW(mw)})`);
  const e2 = D.time_entries.find((x) => x.id === 'e2');
  check(e2.status === 'cancelled' && e2.work_date === D_(19) && e2.planning_id === null, 'D5b la ligne retirée reste sur lundi, intacte (seul le lien part)');
  await p.waitForTimeout(600);
  check(JSON.stringify(await idsIn(p, 'Noa', THU)) === '["pn-mon"]' && await p.locator('[data-bub="pn-mon"] [data-withdrawn]').count() === 0, 'D5b à sa nouvelle place, la bulle n’est plus « retirée »');

  // D5c — une bulle qui ne porte qu'un brouillon VIDE se déplace : le brouillon part d'abord
  // (relu, effacé seulement s'il est encore vide et jamais envoyé), puis la case.
  await settle(p);
  w = log.writes.length;
  await drag(p, bub(p, 'pn-wed'), cell(p, 'Noa', FRI));
  mw = writesSince(w);
  check(mw[0]?.m === 'DELETE' && mw[0].t === 'time_entries' && mw[0].ids.join() === 'e4'
    && mw.some((x) => x.m === 'PATCH' && x.t === 'planning' && x.ids[0] === 'pn-wed' && x.body.work_date === D_(23))
    && !mw.some((x) => x.m === 'POST') && (await toasts(p)).every((x) => !x.includes('déplaçable')), `D5c brouillon vide : effacé, puis case déplacée (${fmtW(mw)})`);
  check(!D.time_entries.some((x) => x.id === 'e4') && D.planning.find((x) => x.id === 'pn-wed')?.work_date === D_(23), 'D5c base : brouillon vide parti, case au vendredi');

  // D5d — des heures envoyées DEPUIS le chargement (l'écran ne le sait pas encore) :
  // la base est relue avant de déplacer, rien ne bouge.
  await settle(p);
  D.time_entries.push(entry('e8', 'u-sam', D_(23), W2, 'submitted', 240, { planning_id: 'ps-fri' }));
  w = log.writes.length;
  await drag(p, bub(p, 'ps-fri'), cell(p, 'Sam', SAT));
  let t5 = await toasts(p);
  check(writesSince(w).length === 0 && t5.some((x) => x.includes('Rien n’a été déplacé : heures déjà envoyées · maintenez Ctrl ou Alt pour copier')), `D5d heures envoyées entre-temps : « ${t5.join(' | ')} », zéro écriture`);
  await p.waitForTimeout(400);
  check(JSON.stringify(await idsIn(p, 'Sam', FRI)) === '["ps-fri"]' && (await idsIn(p, 'Sam', SAT)).length === 0, 'D5d la bulle revient à sa place');
  D.time_entries = D.time_entries.filter((x) => x.id !== 'e8');

  // D6 — copies refusées, zéro écriture
  const refusals = [
    ['ps-mon', cell(p, 'Lou', THU), 'Absent ce jour-là : rien n’a été copié.', 'absence'],
    ['pl-mon', cell(p, 'Lou', MON), 'Déjà prévu dans cette case.', 'même case'],
    ['pl-mon', 'self', 'Déjà prévu dans cette case.', 'sur elle-même'],
    ['ps-mon', cell(p, 'Sam', FRI), 'Chevauche 08:00–17:00 déjà prévu ce jour-là.', '08–12 sur 08–17'],
    ['pl-mon', cell(p, 'Tom', TUE), 'Heures clôturées pour ce salarié : rien n’a été copié.', 'salarié clôturé'],
  ];
  for (const [id, to, msg, label] of refusals) {
    await settle(p);
    w = log.writes.length;
    await drag(p, bub(p, id), to === 'self' ? await center(bub(p, id)) : to, { key: 'Control' });
    const t = await toasts(p);
    check(writesSince(w).length === 0 && t.some((x) => x.includes(msg)), `D6 ${label} : « ${t.join(' | ')} », zéro écriture`);
  }
  check(await p.locator('[data-testid=undo-card]').count() === 0, 'D6 aucune carte « copiée » après un refus');

  // D10 — déplacement vers une absence, un salarié clôturé
  for (const [to, msg, label] of [[cell(p, 'Lou', THU), 'Absent ce jour-là : rien n’a été déplacé.', 'absence'], [cell(p, 'Tom', MON), 'Heures clôturées pour ce salarié : rien n’a été déplacé.', 'salarié clôturé']]) {
    await settle(p);
    w = log.writes.length;
    await drag(p, bub(p, 'ps-mon'), to);
    const t = await toasts(p);
    check(writesSince(w).length === 0 && t.some((x) => x.includes(msg)) && JSON.stringify(await idsIn(p, 'Sam', THU)) === '["ps-mon"]', `D10 vers ${label} : « ${t.join(' | ')} », la bulle reste`);
    if (label === 'absence') { await p.mouse.move(720, 880); await shot('absence')(p); }
  }

  // D9 — Échap avec Ctrl ; Ctrl + glisser en mode « Sélectionner »
  await settle(p);
  w = log.writes.length;
  st = await drag(p, bub(p, 'ps-mon'), cell(p, 'Lou', WED), { key: 'Control', escape: true, during: dragState });
  check(st.copying && writesSince(w).length === 0 && JSON.stringify(await idsIn(p, 'Sam', THU)) === '["ps-mon"]', 'D9 Échap pendant un Ctrl + glisser : zéro écriture');
  check(!(await p.locator('.bt-pl').getAttribute('class')).includes('bt-pl--copying') && await p.locator('[role=dialog]').count() === 0, 'D9 après Échap : plus de mode copie, aucune fenêtre');
  await p.click('[data-testid=bar-select]'); await p.waitForTimeout(300);
  w = log.writes.length;
  await drag(p, p.locator('[data-bub="ps-mon"] .bt-pl-grab').first(), cell(p, 'Lou', WED), { key: 'Control' });
  check(writesSince(w).length === 0 && JSON.stringify(await idsIn(p, 'Sam', THU)) === '["ps-mon"]' && await p.locator('[role=dialog]').count() === 0, 'D9 Ctrl + glisser en mode « Sélectionner » : zéro écriture, aucune fenêtre');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // D6 / D10 — septembre clôturé (semaine du 28 septembre)
  for (let i = 0; i < 3; i++) { await p.click('button[aria-label="Semaine précédente"]'); await p.waitForTimeout(500); }
  await p.waitForSelector('[data-bub="ps-o1"]', { timeout: 8000 }).catch(() => {});
  for (const [id, to, key, msg, label] of [
    ['ps-o1', cell(p, 'Sam', WED), 'Control', 'Mois clôturé : rien n’a été copié.', 'D6 copie vers le 30 septembre'],
    ['ps-o1', cell(p, 'Sam', WED), null, 'Mois clôturé : rien n’a été déplacé.', 'D10 déplacement vers le 30 septembre'],
    ['ps-s29', cell(p, 'Sam', FRI), null, 'Mois clôturé — non déplaçable · maintenez Ctrl ou Alt pour copier', 'D5 déplacer une bulle de septembre'],
  ]) {
    await settle(p);
    w = log.writes.length;
    await drag(p, bub(p, id), to, { key });
    const t = await toasts(p);
    check(writesSince(w).length === 0 && t.some((x) => x.includes(msg)), `${label} : « ${t.join(' | ')} », zéro écriture`);
  }
  await settle(p);
  w = log.writes.length;
  await drag(p, bub(p, 'ps-s29'), cell(p, 'Sam', FRI), { key: 'Control' });
  pw = planningWrites(w);
  check(pw.length === 1 && pw[0].m === 'POST' && pw[0].rows[0].work_date === '2026-10-02', `D5 la bulle de septembre se COPIE vers le 2 octobre (${pw.map((x) => x.m).join(', ')})`);
  await p.click('[data-testid=undo-close]').catch(() => {});
  for (let i = 0; i < 3; i++) { await p.click('button[aria-label="Semaine suivante"]'); await p.waitForTimeout(500); }
  await p.waitForSelector('[data-bub="ps-mon"]', { timeout: 8000 }).catch(() => {});

  // D8 — « Annuler » quand une heure désigne la copie entre-temps
  await settle(p);
  w = log.writes.length;
  await drag(p, bub(p, 'pl-mon'), cell(p, 'Lou', WED), { key: 'Control' });
  const cid2 = planningWrites(w).find((x) => x.m === 'POST')?.ids?.[0];
  check(!!cid2, `D8 nouvelle copie (${cid2})`);
  D.time_entries.push(entry('e9', 'u-lou', D_(21), W2, 'draft', 60, { planning_id: cid2 }));
  w = log.writes.length;
  await p.click('[data-testid=action-undo]'); await p.waitForTimeout(1200);
  const card2 = (await p.locator('[data-testid=undo-card]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(writesSince(w).filter((x) => x.m === 'DELETE').length === 0 && /Impossible d’annuler : heures déjà notées par le salarié/.test(card2), `D8 heure notée sur la copie : pas de DELETE, « ${card2.trim()} »`);
  check(D.planning.some((x) => x.id === cid2), 'D8 la copie est gardée');
  await p.click('[data-testid=undo-close]').catch(() => {});

  // D11 — l'Assistant déplace une intervention : même garde
  const asReply = (planningId, userId, date, nouvelle) => ({
    answer: '', links: [], remaining: 40,
    action: { draft: { type: 'modifier_intervention', user_id: userId, salarie_texte: 'Sam', date, planning_id: planningId, choix: [{ id: planningId, chantier: 'Salle', debut: '', note: '' }], nouvelle_date: nouvelle, nouveau_user_id: null, debut: '', note: null }, problems: [], summary: '', question: null },
    options: { salaries: [{ id: 'u-sam', nom: 'Sam Test' }, { id: 'u-lou', nom: 'Lou Test' }], chantiers: [{ id: 'w1', nom: 'Salle', ville: 'Lyon' }, { id: 'w2', nom: 'Dépôt', ville: 'Vienne' }] },
  });
  await settle(p);
  await p.click('[data-testid=bar-assistant]'); await p.waitForTimeout(400);
  REP = asReply('ps-tue', 'u-sam', D_(20), D_(24));
  w = log.writes.length;
  await p.fill('.as-bar textarea', 'Déplace l’intervention de Sam de mardi à samedi');
  await p.click('button[aria-label="Envoyer"]');
  await p.waitForSelector('.ac-err', { timeout: 10000 }).catch(() => {});
  const err = await p.locator('.ac-err').last().innerText().catch(() => '');
  check(planningWrites(w).length === 0 && err.includes('Rien n’a été déplacé : heures déjà envoyées.'), `D11 Assistant, bulle avec heures envoyées : « ${err} », zéro écriture`);
  REP = asReply('ps-mon', 'u-sam', D_(22), D_(24));
  w = log.writes.length;
  await p.fill('.as-bar textarea', 'Déplace l’intervention de Sam de jeudi à samedi');
  await p.click('button[aria-label="Envoyer"]');
  await p.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  pw = planningWrites(w);
  check(pw.length === 1 && pw[0].m === 'PATCH' && pw[0].ids[0] === 'ps-mon' && pw[0].body.work_date === D_(24), `D11 Assistant, bulle libre : déplacée comme avant (${pw.map((x) => `${x.m} ${JSON.stringify(x.body)}`).join(', ')})`);
  await ctx.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
