// Lot 10 — zone salarié : aucun redessin visible pendant les rafraîchissements
// automatiques (chrono relu toutes les 30 s, retour sur l'onglet, minute).
//
// Lancer : npm run build, puis
//   node scripts/tests/salarie-lot10.mjs out docs/captures-lot10
// Vraie page /poseur (export statique), base Supabase SIMULÉE exactement comme
// scripts/tests/salarie-lot9.mjs, téléphone 390×844, horloge de Playwright
// (page.clock) pour déclencher les relectures. Un MutationObserver est posé
// après le premier affichage ; données IDENTIQUES → seule exception admise :
// les secondes du chrono en direct (.bt-lt-big, LiveTimer).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot10', PORT = '0'] = process.argv;
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
const PORT_USED = srv.address().port;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const parisHHmm = (iso) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const CO = 'c0000000-0000-0000-0000-000000000001';
const ME = 'u-karim';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Martin', city: 'Villeurbanne', is_active: true };
const W3 = { id: 'w3', company_id: CO, client_name: 'Dépôt Gerland', city: 'Lyon', is_active: true };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true };
const entry = (id, ws, s, e, extra = {}) => {
  const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number);
  return { id, company_id: CO, user_id: ME, worksite_id: ws.id, planning_id: null, work_date: today, start_time: `${s}:00`, end_time: `${e}:00`,
    break_minutes: 0, total_minutes: (eh * 60 + em) - (sh * 60 + sm), meal_allowance: false, status: 'draft', locked: false, exported_at: null,
    observation: null, reception: null, gap_before: null, worksite: ws, ...extra };
};

// ── La base simulée (état modifiable par scénario) ──
const D = {
  users: [{ id: ME, company_id: CO, first_name: 'Karim', last_name: 'Benali', role: 'worker', email: 'karim@exemple.fr', is_active: true, created_at: '2026-01-01' }],
  companies: [{ id: CO, name: 'Benali Rénovation', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [W1, W2, W3, AUTRE],
  planning: [], time_entries: [], active_sessions: [],
  month_closures: [], leave_requests: [], documents: [], time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [],
};
let finishMode = 'ok'; // ok | missing (PGRST202 → stop_active_session) | missing-bt001
const calls = [];
const reset = () => { calls.length = 0; };
const callsTo = (method, p) => calls.filter((c) => c.method === method && c.path.includes(p));

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.grantPermissions(['geolocation']);
await ctx.setGeolocation({ latitude: 45.7578, longitude: 4.832, accuracy: 12 });
const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: ME, email: 'karim@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);

const match = (rows, sp) => {
  let out = rows;
  for (const [k, v] of sp) {
    if (v.startsWith('eq.')) { const val = v.slice(3); out = out.filter((x) => !(k in x) || String(x[k]) === val); }
    if (v.startsWith('neq.')) { const val = v.slice(4); out = out.filter((x) => !(k in x) || String(x[k]) !== val); }
  }
  return out;
};
await ctx.route('**/*.supabase.co/**', async (r) => {
  const req = r.request(); const u = new URL(req.url()); const method = req.method();
  let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
  if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
  if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
  if (u.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
  calls.push({ method, path: u.pathname, search: u.search, body });
  if (u.pathname === '/rest/v1/rpc/finish_active_session') {
    if (finishMode !== 'ok') return r.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.finish_active_session(p_end) in the schema cache', details: null, hint: null } });
    const s = D.active_sessions[0];
    D.active_sessions = [];
    // Comme la vraie fonction : moins d'une minute À L'HORLOGE DU SERVEUR → annulé, sans ligne.
    if (!body?.p_end && Date.now() - Date.parse(s.started_at) < 60000) {
      return r.fulfill({ json: [{ entry_id: null, work_date: today, start_time: null, end_time: null, cancelled: true }] });
    }
    const e = entry('e-fini', W1, parisHHmm(s.started_at), parisHHmm(new Date(Date.now() + 60000).toISOString()));
    D.time_entries.push(e);
    return r.fulfill({ json: [{ entry_id: e.id, work_date: today, start_time: e.start_time, end_time: e.end_time, cancelled: false }] });
  }
  if (u.pathname === '/rest/v1/rpc/stop_active_session') {
    if (finishMode === 'missing-bt001') return r.fulfill({ status: 400, json: { code: 'BT001', message: 'Début et fin tombent sur le même quart d\'heure : rien à enregistrer.', details: null, hint: null } });
    D.active_sessions = [];
    return r.fulfill({ json: [{ entry_id: 'e-stop', work_date: today, start_time: '08:00:00', end_time: '08:15:00' }] });
  }
  if (u.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
  const t = u.pathname.replace('/rest/v1/', '');
  const rows = match(D[t] || [], u.searchParams);
  if (method === 'GET' || method === 'HEAD') return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  if (t === 'active_sessions' && method === 'POST') {
    D.active_sessions = [{ ...body, started_at: new Date().toISOString() }];
    return r.fulfill({ status: 201, body: '' });
  }
  if (method === 'DELETE') {
    D[t] = (D[t] || []).filter((x) => !rows.includes(x));
    return r.fulfill({ json: rows });
  }
  if (method === 'PATCH') {
    for (const x of rows) Object.assign(x, body);
    return r.fulfill({ json: rows.map((x) => ({ id: x.id })) });
  }
  return r.fulfill({ status: 201, json: rows.length ? rows[0] : { id: 'new-1' } });
});

// Horloge de Playwright (comme scripts/tests/borne-lot9.mjs) : elle avance
// normalement, et `fastForward` déclenche les relectures sans attendre.
await ctx.clock.install({ time: new Date() });

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
const open = async () => { await p.goto(`http://localhost:${PORT_USED}/poseur`); await p.waitForSelector('.bt-total', { timeout: 15000 }); await p.waitForTimeout(1200); };

// ── Mesure des mutations ──────────────────────────────────────────────────────
const ALLOWED = ['.bt-lt-big'];
const MARK = '.bt-phone, .bt-day, .bt-day-scroll, .bt-total, [data-testid=card-planned], [data-testid=card-entry], [data-testid=card-live], [data-testid=live-timer], .bt-sec, .bt-send';
async function observe() {
  await p.evaluate(([allowed, mark]) => {
    const desc = (el) => {
      const parts = [];
      for (let e = el, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) {
        const cls = typeof e.className === 'string' && e.className ? `.${e.className.trim().split(/\s+/).slice(0, 3).join('.')}` : '';
        parts.unshift(e.tagName.toLowerCase() + cls + (e.dataset?.testid ? `[${e.dataset.testid}]` : ''));
      }
      return parts.join(' > ');
    };
    // Repère chaque carte AVANT : on saura quelle carte a bougé, et si elle a été remontée.
    document.querySelectorAll('[data-testid=card-planned], [data-testid=card-entry], [data-testid=card-live]').forEach((c, i) => { c.__card = `${c.dataset.testid}#${i}`; });
    window.__muts = [];
    window.__mo?.disconnect();
    window.__mo = new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!el) continue;
        const card = el.closest('[data-testid=card-planned], [data-testid=card-entry], [data-testid=card-live]');
        const zone = el.closest('[data-testid=live-timer]') ? 'chrono' : card ? (card.__card || 'nouvelle-carte') : el.closest('.bt-total') ? 'total' : 'ailleurs';
        window.__muts.push({
          type: m.type, attr: m.attributeName || null, target: desc(el), zone,
          allowed: allowed.some((s) => el.closest(s)),
          added: [...m.addedNodes].map((n) => n.dataset?.testid || n.nodeName),
          removed: [...m.removedNodes].map((n) => n.dataset?.testid || n.nodeName),
        });
      }
    });
    window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    document.querySelectorAll(mark).forEach((e) => { e.__lot10 = true; });
    window.__marked = document.querySelectorAll(mark).length;
  }, [ALLOWED, MARK]);
}
const collect = () => p.evaluate((mark) => {
  const all = window.__muts.splice(0);
  const kept = [...document.querySelectorAll(mark)].filter((e) => e.__lot10).length;
  return { all, other: all.filter((m) => !m.allowed), kept, marked: window.__marked };
}, MARK);
const summary = (ms) => {
  const by = new Map();
  for (const m of ms) { const k = `${m.type}${m.attr ? `[${m.attr}]` : ''} ${m.target}${m.added.length ? ` +${m.added.join(',')}` : ''}${m.removed.length ? ` -${m.removed.join(',')}` : ''}`; by.set(k, (by.get(k) || 0) + 1); }
  return [...by].map(([k, n]) => `${n}× ${k}`).slice(0, 14).join('\n      ');
};
const setVisible = (visible) => p.evaluate((v) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => !v });
  document.dispatchEvent(new Event('visibilitychange'));
  if (v) window.dispatchEvent(new Event('focus'));
}, visible);
const liveReads = () => callsTo('GET', '/rest/v1/active_sessions').length;
const report = {};

/** Une relecture (30 s, retour sur l'onglet, minute) sur des données identiques. */
async function quiet(label, key, trigger) {
  await observe(); reset();
  await trigger();
  await p.waitForTimeout(1500);
  const r = await collect();
  report[key] = { total: r.all.length, other: r.other.length, reads: liveReads() };
  console.log(`   ${label} : relectures chrono=${liveReads()}, journée=${callsTo('GET', '/rest/v1/time_entries').length}, mutations=${r.all.length} (hors chrono : ${r.other.length})${r.other.length ? `\n      ${summary(r.other)}` : ''}`);
  check(liveReads() > 0, `${label} : le chrono est bien relu`);
  check(r.other.length === 0, `${label} : 0 mutation hors secondes du chrono (${r.other.length})`);
  check(r.kept === r.marked, `${label} : aucun bloc remonté (${r.kept}/${r.marked} gardés)`);
  return r;
}

// ═════ 1 · Journée sans chrono : relectures muettes ═════
D.planning = [{ id: 'p1', company_id: CO, user_id: ME, worksite_id: 'w1', work_date: today, absence_type: null, estimated_start: '08:00:00', estimated_end: '12:00:00', notes: null, worksite: W1 }];
D.time_entries = [entry('e1', W2, '13:00', '16:30')];
D.active_sessions = [];
await open();
check(await p.locator('[data-testid=card-start]').count() === 2, '1) journée affichée, « Je commence » sur les 2 cartes');
await quiet('1A) relecture 30 s', 'idle30', async () => { await p.clock.fastForward(30_000); });
await quiet('1B) retour sur l’onglet', 'idleVisible', async () => { await setVisible(false); await p.clock.fastForward(20_000); await p.waitForTimeout(200); await setVisible(true); });
await quiet('1C) minute suivante (jour, journées à envoyer)', 'idle60', async () => { await p.clock.fastForward(30_000); await p.waitForTimeout(300); await p.clock.fastForward(30_000); });
// Journée entière relue (comme après un envoi différé, ou un chrono fermé ailleurs) avec les mêmes lignes.
{
  await observe(); reset();
  await p.evaluate(() => window.dispatchEvent(new Event('bemexo:offline-synced')));
  await p.waitForTimeout(1500);
  const r = await collect();
  report.dayReload = { total: r.all.length, other: r.other.length };
  const reloaded = callsTo('GET', '/rest/v1/time_entries').length > 0 && callsTo('GET', '/rest/v1/planning').length > 0;
  console.log(`   1D) journée relue : relue=${reloaded}, mutations=${r.all.length} (hors chrono : ${r.other.length})${r.other.length ? `\n      ${summary(r.other)}` : ''}`);
  check(reloaded, '1D) journée relue : lignes et planning relus');
  check(r.other.length === 0, `1D) journée relue, données identiques : 0 mutation (${r.other.length})`);
  check(r.kept === r.marked, `1D) aucun bloc remonté (${r.kept}/${r.marked} gardés)`);
}
check(await p.locator('.bt-day .animate-pulse').count() === 0 && !/Chargement/i.test(await p.locator('body').innerText()), '1) jamais de squelette ni « Chargement » pendant une relecture');

// ═════ 2 · Chrono en cours : seules les secondes bougent ═════
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: 'p1', work_date: today, started_at: new Date(Date.now() - 47 * 60000).toISOString() }];
await open();
check(await p.locator('[data-testid=card-live]').count() === 1 && await p.locator('[data-testid=live-timer]').count() === 1, '2) carte verte + chrono affichés');
const r2 = await quiet('2A) relecture 30 s, chrono ouvert', 'live30', async () => { await p.clock.fastForward(30_000); });
check(r2.all.some((m) => m.allowed), '2A) (les secondes du chrono tournent : exception admise)');
await quiet('2B) retour sur l’onglet, chrono ouvert', 'liveVisible', async () => { await setVisible(false); await p.clock.fastForward(20_000); await p.waitForTimeout(200); await setVisible(true); });
await p.screenshot({ path: `${SH}/salarie-390x844.png` });

// ═════ 3 · Un VRAI changement : chrono ouvert à la borne → seule SA carte change ═════
D.active_sessions = [];
await open();
await observe(); reset();
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: 'p1', work_date: today, started_at: new Date(Date.now() - 2 * 60000).toISOString() }];
await p.clock.fastForward(30_000);
await p.waitForTimeout(1500);
const r3 = await collect();
const zones = [...new Set(r3.other.map((m) => m.zone))];
report.realChange = { total: r3.all.length, other: r3.other.length, zones };
console.log(`   3) chrono ouvert ailleurs : mutations=${r3.all.length}, zones : ${zones.join(', ')}\n      ${summary(r3.other)}`);
check(await p.locator('[data-testid=card-live]').count() === 1 && await p.locator('[data-testid=live-timer]').count() === 1, '3) la carte du chantier passe au vert, le chrono apparaît');
const entryMuts = r3.other.filter((m) => m.zone.startsWith('card-entry'));
check(entryMuts.every((m) => m.type === 'childList' && m.added.length === 0 && m.removed.every((x) => x === 'card-start')), `3) la carte déjà notée ne perd que son « Je commence » (${summary(entryMuts) || 'rien'})`);
const outside = r3.other.filter((m) => m.zone === 'ailleurs' && !(m.type === 'childList' && m.added.length === 1 && m.added[0] === 'live-timer' && m.removed.length === 0));
check(outside.length === 0, `3) rien d’autre ne bouge hors chrono / carte en cours / total (${summary(outside) || 'rien'})`);
check(r3.kept === r3.marked, `3) aucune carte remontée (${r3.kept}/${r3.marked} gardés)`);

// ═════ 4 · Tablette 1024×768 ═════
await p.setViewportSize({ width: 1024, height: 768 });
await p.waitForTimeout(600);
await p.screenshot({ path: `${SH}/salarie-tablette-1024x768.png` });

console.log(`\nMUTATIONS ${JSON.stringify(report)}`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
