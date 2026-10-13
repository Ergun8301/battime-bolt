// Lot 10 — pointage salarié : alerte quand une intervention recouvre le pointage
// EN COURS, et raccourcis juste après le scan de la borne.
//
// Lancer : npm run build, puis
//   node scripts/tests/pointage-lot10.mjs out docs/captures-pointage-lot10
// Vraies pages /poseur et /pointer (export statique), base Supabase et fonction
// `kiosk` SIMULÉES (aucune vraie base, aucun réseau), téléphone 390×844, horloge
// de Playwright ramenée au mercredi 21 octobre 2026, 10:30 (Paris) avant chaque
// scénario. Noms fictifs uniquement.
//
// La molette de l'écran ne propose que des quarts d'heure : la minute de
// tolérance (08:02 / 08:03 / 08:04) est donc vérifiée par les tests Deno
// (supabase/functions/_shared/live-clash.test.ts), ici on vérifie « finit
// exactement au début du pointage » (sans alerte) et « un quart d'heure plus tard ».
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-pointage-lot10', PORT_ARG = '0'] = process.argv;
fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json', '.txt': 'text/x-component' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  for (const c of [p, `${p}.html`, path.join(p, 'index.html')]) {
    const f = path.join(OUT, c);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); }
  }
  r.writeHead(404); r.end();
});
await new Promise((r) => srv.listen(Number(PORT_ARG), r));
const PORT = srv.address().port;
const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Le monde fictif ─────────────────────────────────────────────────────────
const TODAY = '2026-10-21';
const YESTERDAY = '2026-10-20';
const NOW = new Date('2026-10-21T10:30:05+02:00');
const at = (hms, day = TODAY) => new Date(`${day}T${hms}+02:00`).toISOString();
const hmParis = (iso) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const CO = 'c0000000-0000-0000-0000-000000000010';
const ME = 'b0000000-0000-4000-8000-000000000010';
const OTHER_ME = 'b0000000-0000-4000-8000-0000000000ff';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Martin', city: 'Villeurbanne', is_active: true };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true };
const WS = [W1, W2, AUTRE];
const mins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const entry = (id, ws, s, e, extra = {}) => ({
  id, company_id: CO, user_id: ME, worksite_id: ws.id, planning_id: null, work_date: TODAY, start_time: `${s}:00`, end_time: `${e}:00`,
  break_minutes: 0, total_minutes: mins(e) - mins(s), meal_allowance: false, status: 'draft', locked: false, exported_at: null,
  observation: null, reception: null, gap_before: null, worksite: ws, ...extra,
});
const chrono = (hms, extra = {}) => ({ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: null, work_date: TODAY, started_at: at(hms), ...extra });

const fresh = () => ({
  users: [{ id: ME, company_id: CO, first_name: 'Karim', last_name: 'Benali', role: 'worker', email: 'karim@exemple.fr', is_active: true, created_at: '2026-01-01' }],
  companies: [{ id: CO, name: 'Martin Menuiserie', ai_enabled: false, kiosk_enabled: true, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: WS, planning: [], time_entries: [], active_sessions: [],
  month_closures: [], user_closures: [], leave_requests: [], documents: [], time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [],
});
let D = fresh();
let finishMode = 'ok';   // ok | absent | stale | cancelled | closed | lost
let liveRead = 'ok';     // ok | error | slow
let closureDelay = 0;     // lecture de « ma clôture » retardée (ms)
let punchKind = 'arrival'; // pour /pointer : arrival | departure | cancelled
let nPost = 0;
let failPost = false;     // le serveur refuse les insertions (la saisie reste dans la file du téléphone)
const calls = [];
const resetCalls = () => { calls.length = 0; };
const callsTo = (method, p) => calls.filter((c) => c.method === method && c.path.includes(p));
/** Les écritures de l'écran (hors lectures) : POST / PATCH / DELETE / RPC. */
// (company_has_kiosk : lecture du réglage de la borne par l'écran, appelée à l'ouverture — pas une écriture)
const writes = () => calls.filter((c) => c.method !== 'GET' && c.method !== 'HEAD' && !c.path.includes('/rpc/company_has_kiosk') && !c.path.includes('/functions/'));
const finishCalls = () => callsTo('POST', '/rpc/finish_active_session');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const nowS = Math.floor(NOW.getTime() / 1000);
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, role: 'authenticated', exp: nowS + 864000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: nowS + 864000, expires_in: 864000, token_type: 'bearer', user: { id: ME, email: 'karim@exemple.fr', aud: 'authenticated', role: 'authenticated' } };

const match = (rows, sp) => {
  let out = rows;
  for (const [k, v] of sp) {
    if (v.startsWith('eq.')) { const val = v.slice(3); out = out.filter((x) => !(k in x) || String(x[k]) === val); }
    if (v.startsWith('neq.')) { const val = v.slice(4); out = out.filter((x) => !(k in x) || String(x[k]) !== val); }
  }
  return out;
};

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
await ctx.clock.install({ time: NOW });

await ctx.route('**/*.supabase.co/**', async (r) => {
  const req = r.request(); const u = new URL(req.url()); const method = req.method();
  let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
  if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
  if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
  if (u.pathname.startsWith('/functions/v1/kiosk')) {
    calls.push({ method, path: u.pathname, search: '', body });
    if (body?.action === 'ticket') return r.fulfill({ json: { ticket: 'tk', kiosk_name: 'Entrée du dépôt', company_name: 'Martin Menuiserie', needs_position: false } });
    if (body?.action === 'punch') {
      if (punchKind === 'cancelled') return r.fulfill({ json: { kind: 'departure', cancelled: true, range: null, time: '09:31', first_name: 'Karim', kiosk_name: 'Entrée du dépôt', worksite_name: null } });
      if (punchKind === 'arrival') {
        D.active_sessions = [chrono('08:02:20')];
        return r.fulfill({ json: { kind: 'arrival', time: '08:02', first_name: 'Karim', kiosk_name: 'Entrée du dépôt', worksite_name: 'Villa Dupont', range: null } });
      }
      D.active_sessions = [];
      D.time_entries.push(entry('e-depart', W1, '08:02', '17:07'));
      return r.fulfill({ json: { kind: 'departure', time: '17:07', first_name: 'Karim', kiosk_name: 'Entrée du dépôt', worksite_name: 'Villa Dupont', range: { start: '08:02', end: '17:07' } } });
    }
    return r.fulfill({ json: {} });
  }
  if (u.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
  calls.push({ method, path: u.pathname, search: u.search, body });

  if (u.pathname === '/rest/v1/rpc/finish_active_session') {
    if (finishMode === 'absent') return r.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.finish_active_session(p_end) in the schema cache', details: null, hint: null } });
    if (finishMode === 'stale') return r.fulfill({ status: 400, json: { code: 'P0001', message: 'Aucun pointage en cours', details: null, hint: null } });
    if (finishMode === 'closed') return r.fulfill({ status: 400, json: { code: 'P0001', message: 'time_entries: le mois est clôturé par le bureau', details: null, hint: null } });
    if (finishMode === 'cancelled') { D.active_sessions = []; return r.fulfill({ json: [{ entry_id: null, work_date: TODAY, start_time: null, end_time: null, cancelled: true }] }); }
    const s = D.active_sessions[0];
    if (!s) return r.fulfill({ status: 400, json: { code: 'P0001', message: 'Aucun pointage en cours', details: null, hint: null } });
    const start = hmParis(s.started_at);
    const endHm = String(body?.p_end || '').slice(0, 5);
    D.active_sessions = [];
    // Comme la vraie fonction : une fin qui n'est pas après le début efface le pointage (rien n'est compté).
    if (endHm <= start) return r.fulfill({ json: [{ entry_id: null, work_date: TODAY, start_time: null, end_time: null, cancelled: true }] });
    const e = entry('e-chrono', W1, start, endHm, { source: 'qr' });
    D.time_entries.push(e);
    // 'lost' : la fermeture ABOUTIT côté base, mais la réponse ne revient jamais.
    if (finishMode === 'lost') return r.abort('failed');
    return r.fulfill({ json: [{ entry_id: e.id, work_date: TODAY, start_time: e.start_time, end_time: e.end_time, cancelled: false }] });
  }
  if (u.pathname === '/rest/v1/rpc/stop_active_session') { D.active_sessions = []; return r.fulfill({ json: [{ entry_id: 'e-stop', work_date: TODAY, start_time: '08:00:00', end_time: '08:15:00' }] }); }
  if (u.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });

  const t = u.pathname.replace('/rest/v1/', '');
  if (t === 'active_sessions' && method === 'GET') {
    if (liveRead === 'error') return r.fulfill({ status: 500, json: { code: 'XX000', message: 'panne', details: null, hint: null } });
    if (liveRead === 'slow') await new Promise((res) => setTimeout(res, 6000));
  }
  if (t === 'user_closures' && method === 'GET' && closureDelay) await new Promise((res) => setTimeout(res, closureDelay));
  const rows = match(D[t] || [], u.searchParams);
  if (method === 'GET' || method === 'HEAD') {
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (single) return rows[0] ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  }
  if (t === 'time_entries' && method === 'POST') {
    if (failPost) return r.fulfill({ status: 500, json: { code: 'XX000', message: 'panne', details: null, hint: null } });
    const row = Array.isArray(body) ? body[0] : body;
    const ws = WS.find((w) => w.id === row.worksite_id);
    D.time_entries.push({ ...row, id: `n-${++nPost}`, total_minutes: mins(row.end_time.slice(0, 5)) - mins(row.start_time.slice(0, 5)) - (row.break_minutes || 0), locked: false, exported_at: null, worksite: ws });
    return r.fulfill({ status: 201, body: '' });
  }
  if (method === 'DELETE') { D[t] = (D[t] || []).filter((x) => !rows.includes(x)); return r.fulfill({ json: rows }); }
  if (method === 'PATCH') {
    for (const x of rows) {
      Object.assign(x, body);
      if (t === 'time_entries' && x.start_time) x.total_minutes = mins(x.end_time.slice(0, 5)) - mins(x.start_time.slice(0, 5)) - (x.break_minutes || 0);
    }
    return r.fulfill({ json: rows.map((x) => ({ id: x.id })) });
  }
  return r.fulfill({ status: 201, json: rows.length ? rows[0] : { id: 'new-1' } });
});

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('   [erreur page]', e.message));

// ─── Gestes du salarié ───────────────────────────────────────────────────────
const bodyText = () => p.locator('body').innerText();
const errorToasts = () => p.locator('[data-sonner-toast][data-type="error"]').count();
const toastTexts = async () => (await p.locator('[data-sonner-toast]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
const dialogText = async () => (await p.locator('[data-testid=live-clash]').innerText()).replace(/\s+/g, ' ');
/** Remet le monde au départ : base, interrupteurs, horloge à 10:30. */
const scene = async (setup = () => {}) => {
  D = fresh(); finishMode = 'ok'; liveRead = 'ok'; closureDelay = 0; punchKind = 'arrival'; nPost = 0; failPost = false;
  await ctx.setOffline(false);
  // La file du téléphone d'un scénario ne doit pas fuir dans le suivant.
  await p.evaluate((me) => localStorage.removeItem(`battime_offline_${me}`), ME).catch(() => {});
  setup();
  await ctx.clock.setSystemTime(NOW);
  resetCalls();
};
const open = async () => {
  await p.goto(`${BASE}/poseur`);
  await p.waitForSelector('.bt-total', { timeout: 15000 });
  await p.waitForTimeout(700);
};
const setWheel = async (hhmm) => {
  const [h, mm] = hhmm.split(':');
  const cols = p.locator('.bt-molette .overflow-y-scroll');
  await cols.nth(0).evaluate((el, i) => { el.scrollTop = (3 * 24 + i) * 40; }, Number(h));
  await p.waitForTimeout(350);
  await cols.nth(1).evaluate((el, i) => { el.scrollTop = (10 * 4 + i) * 40; }, ['00', '15', '30', '45'].indexOf(mm));
  await p.waitForTimeout(350);
};
const setTimesInEditor = async (start, end) => {
  if (start) { await p.locator('.bt-timecard').nth(0).click(); await p.waitForTimeout(400); await setWheel(start); }
  if (end) { await p.locator('.bt-segb').nth(1).click().catch(async () => { await p.locator('.bt-timecard').nth(1).click(); }); await p.waitForTimeout(400); await setWheel(end); }
  await p.locator('button:has-text("Valider les heures")').click();
  await p.waitForTimeout(300);
  return (await p.locator('.bt-timecard').allInnerTexts()).join(' ');
};
const pressOk = async (wait = 1300) => { await p.locator('.bt-save', { hasText: 'OK' }).click(); await p.waitForTimeout(wait); };
/** « + » → (chantier) → heures, SANS toucher « OK ». */
const fillNew = async (site, start, end) => {
  await p.locator('.bt-fab').click();
  await p.waitForSelector('.bt-ed');
  if (site) { await p.locator('.bt-site', { hasText: site }).first().click(); await p.waitForTimeout(250); }
  const cards = await setTimesInEditor(start, end);
  if (!cards.includes(start) || !cards.includes(end)) console.log(`   ⚠ molette : ${cards.replace(/\s+/g, ' ')}`);
};
const addLine = async (site, start, end, wait) => { await fillNew(site, start, end); resetCalls(); await pressOk(wait); };
const editorTimes = async () => (await p.locator('.bt-timecard').allInnerTexts()).join(' ').replace(/\s+/g, ' ');
const noScroll = async () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
// Les captures cachent les messages passagers (le précédent resterait sur la fenêtre photographiée).
const shot = async (name) => {
  await p.evaluate(() => document.querySelectorAll('[data-sonner-toaster]').forEach((e) => { e.style.visibility = 'hidden'; }));
  await p.screenshot({ path: `${SH}/${name}-390x844.png` });
  await p.evaluate(() => document.querySelectorAll('[data-sonner-toaster]').forEach((e) => { e.style.visibility = ''; }));
};

const TEXT_MAIN = (live, s, e) => `Vous êtes pointé depuis ${live} et le pointage n'est pas terminé. Vos heures ${s}–${e} le chevauchent : la journée serait bloquée à l'envoi quand vous terminerez votre pointage.`;
const TEXT_FINISH = (live, at) => `Vous pouvez terminer le pointage à ${at}, l'heure où commence cette intervention : il comptera de ${live} à ${at}.`;
const TEXT_GAP = (end, now) => `Après ${end}, rien ne sera compté : si vous avez continué à travailler jusqu'à ${now}, ajoutez ces heures ensuite.`;
const TEXT_BEFORE = (live) => `Cette intervention recouvre le début de votre pointage (${live}). Terminez-la à ${live} au plus tard. Si vous avez vraiment commencé plus tôt, fermez cette fiche, touchez « Terminer ma journée », puis corrigez les heures de la ligne créée.`;
const TEXT_ATSTART = (start, live) => `Cette intervention commence à ${start}, presque en même temps que votre pointage (${live}) : le terminer à ${start} ne lui laisserait aucune durée. Corrigez l'heure de début. Si cette intervention est votre travail en cours, touchez « Terminer ma journée » plutôt que de l'ajouter ici.`;
const TEXT_BORNE = 'Ensuite, si vous pointez à la borne, ne scannez plus en partant : ajoutez vos dernières heures à la main, sinon la borne ouvrira un nouveau pointage.';

// ═════ 1 · Pas de pointage en cours : rien ne change ═════
await scene();
await open();
await addLine('Maison Martin', '09:00', '10:00');
check(callsTo('POST', '/rest/v1/time_entries').length === 1 && await p.locator('[data-testid=live-clash]').count() === 0 && await errorToasts() === 0,
  '1) pas de pointage : 1 POST, aucune fenêtre, aucun message rouge');

// ═════ 2 · Pointage depuis 08:02, intervention 09:00–10:00 : l'alerte, 0 écriture ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
check(await p.locator('[data-testid=live-timer]').count() === 1, '2) le pointage est bien affiché (« Tu es pointé depuis … »)');
await fillNew('Maison Martin', '09:00', '10:00');
resetCalls();
await pressOk(1000);
check(await p.locator('[data-testid=live-clash]').count() === 1, '2) la fenêtre d’alerte s’ouvre');
const t2 = await dialogText();
check(t2.includes('Votre pointage est encore en cours'), '2) titre « Votre pointage est encore en cours »');
check((await p.locator('[data-testid=live-clash-text]').innerText()).replace(/\s+/g, ' ') === TEXT_MAIN('08:02', '09:00', '10:00'), '2) texte principal exact');
check(t2.includes(TEXT_FINISH('08:02', '09:00')), '2) phrase « Vous pouvez terminer le pointage à 09:00 … »');
check(t2.includes(TEXT_BORNE), '2) consigne « ne scannez plus en partant »');
check(t2.includes(TEXT_GAP('10:00', '10:30')), '2) l’intervention finit à 10:00, il est 10:30 : « Après 10:00, rien ne sera compté … jusqu’à 10:30 »');
check(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'live-clash-fix', '2) focus d’ouverture sur « Corriger les heures » (jamais sur l’action irréversible)');
check(await p.evaluate(() => { const d = document.querySelector('[data-testid=live-clash]'); const el = document.getElementById(d.getAttribute('aria-describedby')); return !!el && el.innerText.includes('Vous êtes pointé depuis') && el.innerText.includes('Vous pouvez terminer le pointage'); }), '2) la description lue par le lecteur d’écran contient le problème ET la proposition');
check(await p.locator('[data-testid=live-clash-finish]').innerText() === 'Terminer le pointage à 09:00, puis ajouter', '2) bouton « Terminer le pointage à 09:00, puis ajouter »');
check(await p.locator('[data-testid=live-clash-fix]').innerText() === 'Corriger les heures', '2) bouton « Corriger les heures »');
check(writes().length === 0, `2) 0 écriture avant le toucher (${writes().map((c) => c.method + ' ' + c.path).join(', ')})`);
check(await noScroll(), '2) 390 px : aucun défilement horizontal');
const bh = await p.locator('[data-testid=live-clash-finish]').boundingBox();
check(!!bh && bh.height >= 44, `2) bouton principal d’au moins 44 px de haut (${bh ? Math.round(bh.height) : '?'} px, sur deux lignes à 390 px)`);
await shot('alerte-terminer');

// ═════ 3 · « Corriger les heures » : la fiche reste, rien n'est écrit ═════
await p.locator('[data-testid=live-clash-fix]').click();
await p.waitForTimeout(400);
check(await p.locator('[data-testid=live-clash]').count() === 0 && await p.locator('.bt-ed').count() === 1, '3) fenêtre fermée, fiche toujours ouverte');
const ct3 = await editorTimes();
check(ct3.includes('09:00') && ct3.includes('10:00'), `3) heures conservées : ${ct3}`);
check(writes().length === 0, '3) 0 écriture');

// ═════ 4 · « Terminer le pointage à 09:00, puis ajouter » : fermer PUIS ajouter ═════
await pressOk(800);
resetCalls();
await p.locator('[data-testid=live-clash-finish]').click();
await p.waitForSelector('[data-testid=live-timer]', { state: 'detached', timeout: 8000 }).catch(() => {});
await p.waitForTimeout(1500);
const order = writes().map((c) => (c.path.includes('finish_active_session') ? 'FIN' : `${c.method} ${c.path.replace('/rest/v1/', '')}`));
check(order[0] === 'FIN' && order[1] === 'POST time_entries' && order.length === 2, `4) ordre des écritures : fermeture PUIS ajout (${order.join(' → ')})`);
check(finishCalls()[0]?.body?.p_end === '09:00:00', `4) finish_active_session{p_end:'09:00:00'} (${JSON.stringify(finishCalls()[0]?.body)})`);
const posted4 = callsTo('POST', '/rest/v1/time_entries')[0]?.body;
check(posted4?.start_time === '09:00' && posted4?.end_time === '10:00' && posted4?.worksite_id === 'w2' && !('source' in posted4), `4) l’intervention 09:00–10:00 est ajoutée, sans colonne source (${JSON.stringify(posted4)})`);
check(D.time_entries.some((e) => e.id === 'e-chrono' && e.start_time === '08:02:00' && e.end_time === '09:00:00'), '4) la ligne du pointage : 08:02 → 09:00');
check(await p.locator('[data-testid=live-timer]').count() === 0, '4) le pointage a disparu de l’écran');
const tt4 = await toastTexts();
check(tt4.includes('Pointage terminé : 08:02 à 09:00 (heure choisie par vous)') && tt4.includes('C\'est noté'), `4) messages « Pointage terminé : 08:02 à 09:00 (heure choisie par vous) » puis « C'est noté » (${tt4.slice(0, 160)})`);
check(await errorToasts() === 0, '4) aucun message rouge');
await p.locator('.bt-send', { hasText: 'Envoyer ma journée' }).click();
await p.waitForTimeout(1200);
check(!(await bodyText()).includes('se chevauchent'), '4) « Envoyer ma journée » ne parle plus de chevauchement');

// ═════ 5 · Commence avant le pointage : seulement « Corriger les heures » ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await addLine('Maison Martin', '07:00', '09:00', 1000);
check(await p.locator('[data-testid=live-clash]').count() === 1 && await p.locator('[data-testid=live-clash-finish]').count() === 0, '5) avant le début du pointage : pas de bouton « Terminer »');
check((await p.locator('[data-testid=live-clash-why]').innerText()).replace(/\s+/g, ' ') === TEXT_BEFORE('08:02'), '5) texte exact : l’intervention recouvre le début du pointage, à finir au plus tard à 08:02 (avec « Terminer ma journée »)');
check(await p.locator('[data-testid=live-clash-fix]').innerText() === 'Corriger les heures' && writes().length === 0, '5) « Corriger les heures » seul, 0 écriture');
await shot('alerte-avant');

// ═════ 6 · Dans le futur ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await addLine('Maison Martin', '11:00', '12:00', 1000);
check((await p.locator('[data-testid=live-clash-why]').innerText()).replace(/\s+/g, ' ') === 'Il est 10:30 : cette intervention commence à 11:00, plus tard. Corrigez les heures. Si vous avez fini votre journée, fermez cette fiche et touchez « Terminer ma journée », puis ajoutez l\'intervention.', '6) « Il est 10:30 … » et la sortie à suivre');
check(await p.locator('[data-testid=live-clash-finish]').count() === 0 && writes().length === 0, '6) pas de bouton « Terminer », 0 écriture');

// ═════ 7 · Collision avec une ligne déjà notée ═════
await scene(() => { D.active_sessions = [chrono('07:42:20')]; D.time_entries = [entry('e1', W1, '08:00', '09:00')]; });
await open();
await addLine('Maison Martin', '10:00', '12:00', 1000);
const w7 = (await p.locator('[data-testid=live-clash-why]').innerText()).replace(/\s+/g, ' ');
check(w7 === 'Terminer le pointage à 10:00 chevaucherait 08:00–09:00, déjà noté. Modifiez ou retirez d\'abord cette ligne dans votre journée (fermer la fiche perd la saisie en cours), ou corrigez les heures.', '7) collision : texte exact avec « 08:00–09:00 »');
check(await p.locator('[data-testid=live-clash-finish]').count() === 0 && writes().length === 0, '7) pas de bouton « Terminer », 0 écriture');
await shot('alerte-collision');
await scene(() => { D.active_sessions = [chrono('07:42:20')]; D.time_entries = [entry('e1', W1, '08:00', '09:00', { status: 'submitted' }), entry('e2', W1, '13:00', '14:00')]; });
await open();
await addLine('Maison Martin', '10:00', '12:00', 1000);
check((await p.locator('[data-testid=live-clash-why]').innerText()).includes('Cette ligne est déjà envoyée : seule la secrétaire peut la corriger.'), '7) ligne envoyée : « seule la secrétaire peut la corriger »');

// ═════ 8 · Limite : finit exactement au début du pointage / un quart d'heure plus tard ═════
await scene(() => { D.active_sessions = [chrono('08:15:20')]; });
await open();
await addLine('Maison Martin', '07:00', '08:15', 1500);
check(await p.locator('[data-testid=live-clash]').count() === 0 && callsTo('POST', '/rest/v1/time_entries').length === 1, '8) 07:00–08:15 (finit au début du pointage) : enregistré sans fenêtre');
await scene(() => { D.active_sessions = [chrono('08:15:20')]; });
await open();
await addLine('Maison Martin', '07:00', '08:30', 1000);
check(await p.locator('[data-testid=live-clash]').count() === 1 && (await dialogText()).includes(TEXT_BEFORE('08:15')), '8) 07:00–08:30 : l’alerte « avant » s’ouvre');
await scene(() => { D.active_sessions = [chrono('08:15:20')]; });
await open();
await addLine('Maison Martin', '08:15', '09:00', 1000);
check(await p.locator('[data-testid=live-clash-finish]').count() === 0 && (await p.locator('[data-testid=live-clash-why]').innerText()).replace(/\s+/g, ' ') === TEXT_ATSTART('08:15', '08:15') && !(await dialogText()).includes('ne peut pas commencer avant'), '8) 08:15–09:00 (même minute que le pointage) : texte « presque en même temps », pas de bouton « Terminer »');

// ═════ 9 · Modification d'une ligne qui chevauche ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; D.time_entries = [entry('e1', W2, '09:00', '10:00')]; });
await open();
await p.locator('[data-testid=card-entry]').first().click();
await p.waitForSelector('.bt-ed');
await setTimesInEditor('09:15', '10:15');
resetCalls();
await pressOk(1000);
check(await p.locator('[data-testid=live-clash-finish]').innerText() === 'Terminer le pointage à 09:15, puis enregistrer', '9) heures changées : « Terminer le pointage à 09:15, puis enregistrer »');
await p.locator('[data-testid=live-clash-finish]').click();
await p.waitForTimeout(1800);
const ord9 = writes().map((c) => (c.path.includes('finish_active_session') ? 'FIN' : `${c.method} ${c.path.replace('/rest/v1/', '')}`));
check(ord9.join(' → ') === 'FIN → PATCH time_entries' && callsTo('POST', '/rest/v1/time_entries').length === 0, `9) fermeture puis PATCH (seul write de ligne) : ${ord9.join(' → ')}`);
// Seule l'observation change, sur une ligne qui chevauche le pointage : aucune alerte.
await scene(() => { D.active_sessions = [chrono('08:02:20')]; D.time_entries = [entry('e1', W2, '09:00', '10:00')]; });
await open();
await p.locator('[data-testid=card-entry]').first().click();
await p.waitForSelector('.bt-ed');
await p.locator('.bt-note').fill('Peinture terminée');
resetCalls();
await pressOk(1200);
check(await p.locator('[data-testid=live-clash]').count() === 0 && callsTo('PATCH', '/rest/v1/time_entries').length === 1 && finishCalls().length === 0, '9) observation seule : enregistrée, aucune fenêtre, pointage intact');

// ═════ 10 · Les validations locales passent AVANT l'alerte ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await addLine(null, '09:00', '10:00', 900);
check(await p.locator('[data-testid=live-clash]').count() === 0 && (await toastTexts()).includes('Choisis un chantier') && finishCalls().length === 0, '10) aucun chantier : « Choisis un chantier », aucune fenêtre, 0 appel de fermeture');
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await fillNew('Maison Martin', '09:00', '10:00');
await p.locator('[data-testid=ed-pause-autre]').click();
await p.locator('[data-testid=ed-pause-input]').fill('2:00');
await p.waitForTimeout(300);
resetCalls();
await pressOk(900);
check(await p.locator('[data-testid=live-clash]').count() === 0 && finishCalls().length === 0 && writes().length === 0 && await errorToasts() >= 1, '10) pause plus longue que la ligne : message de pause, aucune fenêtre, 0 appel');

// ═════ 11 · Hors ligne : jamais bloqué ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await fillNew('Maison Martin', '09:00', '10:00');
await ctx.setOffline(true);
await p.evaluate(() => window.dispatchEvent(new Event('offline')));
await p.waitForTimeout(300);
resetCalls();
await pressOk(1200);
check(await p.locator('[data-testid=live-clash]').count() === 0, '11) hors ligne : aucune fenêtre');
check((await toastTexts()).includes('Votre pointage est encore en cours : ces heures seront vérifiées au retour du réseau.'), '11) message « … vérifiées au retour du réseau. »');
check(finishCalls().length === 0 && callsTo('POST', '/rest/v1/time_entries').length === 0, '11) 0 appel de fermeture, la ligne part dans la file du téléphone');
check(await p.evaluate(() => Object.keys(localStorage).some((k) => /pending|offline/i.test(k) && (localStorage.getItem(k) || '').includes('09:00'))), '11) la saisie est bien gardée sur le téléphone');
await ctx.setOffline(false);
await p.waitForTimeout(2500); // le retour du réseau relance l'envoi de la file : on le laisse finir avant le scénario suivant

// ═════ 12 · Pointage déjà fermé ailleurs ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; finishMode = 'stale'; });
await open();
await addLine('Maison Martin', '09:00', '10:00', 900);
resetCalls();
await p.locator('[data-testid=live-clash-finish]').click();
await p.waitForTimeout(1500);
check((await toastTexts()).includes('Ce pointage était déjà fermé ailleurs. Vos heures sont à jour : vérifiez-les, puis réessayez.') && callsTo('POST', '/rest/v1/time_entries').length === 0, '12) « Aucun pointage en cours » : message exact, aucune ligne ajoutée');
await p.waitForTimeout(5500);
check((await toastTexts()).includes('Ce pointage était déjà fermé ailleurs'), '12) le message reste affiché plus de 5 s (10 s, pas les 4 s par défaut)');
// Pointage remplacé pendant que la fenêtre est ouverte : aucun appel de fermeture.
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await addLine('Maison Martin', '09:00', '10:00', 900);
D.active_sessions = [chrono('08:30:20')];
resetCalls();
await p.locator('[data-testid=live-clash-finish]').click();
await p.waitForTimeout(1500);
check(finishCalls().length === 0 && (await toastTexts()).includes('Ce pointage était déjà fermé ailleurs') && callsTo('POST', '/rest/v1/time_entries').length === 0, '12) pointage remplacé entre-temps : même message, AUCUN appel de fermeture, rien ajouté');

// ═════ 13 · Le serveur annule ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; finishMode = 'cancelled'; });
await open();
await addLine('Maison Martin', '09:00', '10:00', 900);
resetCalls();
await p.locator('[data-testid=live-clash-finish]').click();
await p.waitForTimeout(1500);
check((await toastTexts()).includes('Le pointage a été annulé ou a changé. Vérifiez votre journée avant de réessayer.') && callsTo('POST', '/rest/v1/time_entries').length === 0 && await p.locator('.bt-ed').count() === 1, '13) cancelled : message prudent exact, rien ajouté, fiche ouverte');

// ═════ 14 · finish_active_session absente ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; finishMode = 'absent'; });
await open();
await addLine('Maison Martin', '09:00', '10:00', 900);
resetCalls();
await p.locator('[data-testid=live-clash-finish]').click();
await p.waitForTimeout(1500);
check((await toastTexts()).includes('Terminer le pointage à une heure précise n\'est pas disponible pour l\'instant. Corrigez les heures.'), '14) message « n’est pas disponible »');
check(callsTo('POST', '/rpc/stop_active_session').length === 0 && callsTo('POST', '/rest/v1/time_entries').length === 0 && D.active_sessions.length === 1, '14) aucun arrondi (pas de stop_active_session), rien ajouté, pointage intact');
await pressOk(900);
check(await p.locator('[data-testid=live-clash-finish]').count() === 0 && (await p.locator('[data-testid=live-clash-why]').innerText()).includes('Terminer le pointage à une heure précise n\'est pas disponible pour l\'instant. Corrigez les heures, ou fermez cette fiche et touchez « Terminer ma journée ».'), '14) à l’essai suivant : la fenêtre explique, sans bouton « Terminer »');
await shot('alerte-indisponible');

// ═════ 15 · Mois clôturé pendant la fermeture ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; finishMode = 'closed'; });
await open();
await addLine('Maison Martin', '09:00', '10:00', 900);
resetCalls();
await p.locator('[data-testid=live-clash-finish]').click();
await p.waitForTimeout(1800);
check((await toastTexts()).includes('Le bureau vient de clôturer ce mois') && D.active_sessions.length === 1 && callsTo('POST', '/rest/v1/time_entries').length === 0, '15) clôture : message traduit, pointage intact, rien ajouté');

// ═════ 16 · La fermeture aboutit mais la réponse se perd ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; finishMode = 'lost'; });
await open();
await addLine('Maison Martin', '09:00', '10:00', 900);
resetCalls();
await p.locator('[data-testid=live-clash-finish]').click();
await p.waitForTimeout(2000);
const t16 = await toastTexts();
check(t16.includes('Le pointage semble avoir été terminé : vérifiez vos heures avant de réessayer.'), '16) réponse perdue : « semble avoir été terminé »');
check(callsTo('POST', '/rest/v1/time_entries').length === 0 && !(await bodyText()).includes('Rien n\'a été modifié'), '16) aucune ligne manuelle ajoutée, jamais « Rien n’a été modifié »');

// ═════ 17 · Pointage d'un autre jour, lecture en panne, minuit ═════
await scene(() => { D.active_sessions = [chrono('22:15:20', { work_date: YESTERDAY, started_at: at('22:15:20', YESTERDAY) })]; });
await open();
await addLine('Maison Martin', '09:00', '10:00');
check(await p.locator('[data-testid=live-clash]').count() === 0 && callsTo('POST', '/rest/v1/time_entries').length === 1, '17) pointage d’hier (sortie oubliée) : aucune fenêtre');
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
liveRead = 'error';
await addLine('Maison Martin', '09:00', '10:00', 1500);
check(await p.locator('[data-testid=live-clash]').count() === 1 && await errorToasts() === 0, '17) lecture en panne : repli sur le dernier pointage relu, alerte ouverte');
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await fillNew('Maison Martin', '09:00', '10:00');
await ctx.clock.setSystemTime(new Date('2026-10-22T00:20:00+02:00'));
await pressOk(1300);
check(await p.locator('[data-testid=live-clash]').count() === 0 && callsTo('POST', '/rest/v1/time_entries').length === 1, '17) fiche ouverte à cheval sur minuit : aucune alerte');

// ═════ 18 · Pointage démarré à la borne il y a quelques secondes ; lecture lente ═════
await scene();
await open();
await fillNew('Maison Martin', '09:00', '10:00');
D.active_sessions = [chrono('08:02:20')];   // apparu côté serveur, la page ne le sait pas encore
await pressOk(1500);
check(await p.locator('[data-testid=live-clash]').count() === 1, '18) pointage tout juste ouvert à la borne : vu grâce à la relecture du « OK »');
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await fillNew('Maison Martin', '09:00', '10:00');
liveRead = 'slow';
const t0 = Date.now();
await p.locator('.bt-save', { hasText: 'OK' }).click();
await p.waitForSelector('[data-testid=live-clash]', { timeout: 6000 }).catch(() => {});
check(await p.locator('[data-testid=live-clash]').count() === 1 && Date.now() - t0 < 5800, `18) lecture lente (> 3 s) : repli, pas de blocage (${Date.now() - t0} ms)`);

// ═════ 19 · Doubles touchers ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await addLine('Maison Martin', '09:00', '10:00', 900);
resetCalls();
await p.evaluate(() => { const el = document.querySelector('[data-testid=live-clash-finish]'); el.click(); el.click(); });
await p.waitForTimeout(2000);
check(finishCalls().length === 1 && callsTo('POST', '/rest/v1/time_entries').length === 1, `19) deux touchers rapides sur « Terminer… » : un seul appel de fermeture, une seule ligne (${finishCalls().length} / ${callsTo('POST', '/rest/v1/time_entries').length})`);
await scene();
await open();
await fillNew('Maison Martin', '09:00', '10:00');
resetCalls();
await p.evaluate(() => { const el = document.querySelector('.bt-save'); el.click(); el.click(); });
await p.waitForTimeout(1800);
check(callsTo('POST', '/rest/v1/time_entries').length === 1, `19) deux touchers rapides sur « OK » : un seul POST (${callsTo('POST', '/rest/v1/time_entries').length})`);

// ═════ 20 · Bouton « retour » du téléphone ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await addLine('Maison Martin', '09:00', '10:00', 900);
check(await p.locator('[data-testid=live-clash]').count() === 1, '20) fenêtre ouverte');
await p.goBack();
await p.waitForTimeout(600);
check(await p.locator('[data-testid=live-clash]').count() === 0 && new URL(p.url()).pathname === '/poseur' && await p.locator('.bt-ed').count() === 1, '20) « retour » : la fenêtre se ferme, on reste sur /poseur (fiche encore ouverte)');

// ═════ 22-26 · /pointer : les raccourcis ═════
const punchAt = async (kind) => {
  await scene();
  punchKind = kind;
  await p.goto(`${BASE}/pointer?k=k-test&c=12345678`);
  await p.waitForSelector(kind === 'cancelled' ? '[data-testid=punch-cancelled]' : 'text=enregistré', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(400);
};
await punchAt('arrival');
check(await p.locator('[data-testid=after-before]').count() === 1 && await p.locator('[data-testid=after-send]').count() === 0 && await p.locator('[data-testid=after-add]').count() === 0, '22) arrivée : « Ajouter une intervention faite avant » seul');
check((await p.locator('[data-testid=after-before]').innerText()) === 'Ajouter une intervention faite avant' && (await bodyText()).includes('Ouvrir mon espace'), '22) libellé exact, « Ouvrir mon espace » toujours là');
check(await noScroll(), '22) 390 px sans défilement horizontal');
await shot('pointer-arrivee');
await punchAt('departure');
check(await p.locator('[data-testid=after-send]').innerText() === 'Envoyer ma journée' && await p.locator('[data-testid=after-add]').innerText() === 'Ajouter une intervention' && await p.locator('[data-testid=after-before]').count() === 0, '22) départ : « Envoyer ma journée » et « Ajouter une intervention »');
await shot('pointer-depart');
await punchAt('cancelled');
check(await p.locator('[data-testid=after-before], [data-testid=after-send], [data-testid=after-add]').count() === 0, '22) pointage annulé : aucun raccourci');
await scene();
await p.goto(`${BASE}/pointer`);
await p.waitForTimeout(500);
check(await p.locator('[data-testid=after-before], [data-testid=after-send], [data-testid=after-add]').count() === 0, '22) erreur (QR absent) : aucun raccourci');
check(callsTo('POST', '/functions/v1/kiosk').every((c) => c.body?.lat == null && c.body?.lng == null), '22) QR de la tablette : aucune position lue ni envoyée');

// 23 · navigation par CLIC (pas de page.goto vers /poseur?…)
await punchAt('departure');
await p.evaluate(() => window.__marker = 'client-nav');
await p.locator('[data-testid=after-add]').click();
await p.waitForSelector('.bt-ed', { timeout: 15000 });
check(await p.evaluate(() => window.__marker) === 'client-nav', '23) navigation cliente (pas de rechargement complet)');
const c23 = await editorTimes();
check(c23.includes('17:07') && c23.includes('18:07'), `23) fiche « + » préremplie 17:07–18:07 (${c23})`);
check(new URL(p.url()).search === '' && new URL(p.url()).pathname === '/poseur', `23) adresse sans ?a= (${p.url().replace(BASE, '')})`);
await p.reload();
await p.waitForSelector('.bt-total', { timeout: 15000 });
await p.waitForTimeout(900);
check(await p.locator('.bt-ed').count() === 0, '23) rechargement : la fiche n’est PAS rouverte');
// chargement complet d'une adresse valide
const href = (a, t, u, h) => `${BASE}/poseur?a=${a}&t=${t}&u=${u}${h ? `&h=${h}` : ''}`;
await scene();
await p.goto(href('ajouter', NOW.getTime() - 5000, ME, '17:07'));
await p.waitForSelector('.bt-ed', { timeout: 15000 }).catch(() => {});
check(await p.locator('.bt-ed').count() === 1 && (await editorTimes()).includes('17:07'), '23) adresse chargée en entier : fiche ouverte et préremplie');

// 24 · cas nominaux
await punchAt('arrival');
await p.locator('[data-testid=after-before]').click();
await p.waitForSelector('.bt-ed', { timeout: 15000 });
const c24a = await editorTimes();
check(c24a.includes('07:02') && c24a.includes('08:02'), `24) arrivée 08:02 → fiche 07:02–08:02 (${c24a})`);
await p.locator('.bt-site', { hasText: 'Maison Martin' }).first().click();
await p.waitForTimeout(250);
resetCalls();
await pressOk(1500);
check(await p.locator('[data-testid=live-clash]').count() === 0 && callsTo('POST', '/rest/v1/time_entries').length === 1, '24) « faite avant » enregistrée sans alerte (ne chevauche pas le pointage)');
await punchAt('departure');
await p.locator('[data-testid=after-add]').click();
await p.waitForSelector('.bt-ed', { timeout: 15000 });
await p.locator('.bt-site', { hasText: 'Maison Martin' }).first().click();
await p.waitForTimeout(250);
resetCalls();
await pressOk(1500);
check(callsTo('POST', '/rest/v1/time_entries').length === 1 && !(await bodyText()).includes('chevauchent'), '24) départ 17:07 → fiche 17:07–18:07 enregistrée, aucun message « chevauchent »');
// le « + » ordinaire juste après une arrivée (il est 08:05) : l'alerte « avant » s'ouvre
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await ctx.clock.setSystemTime(new Date('2026-10-21T08:05:30+02:00'));
await p.locator('.bt-fab').click();
await p.waitForSelector('.bt-ed');
await p.locator('.bt-site', { hasText: 'Maison Martin' }).first().click();
await p.waitForTimeout(250);
await pressOk(1200);
check(await p.locator('[data-testid=live-clash]').count() === 1 && (await dialogText()).includes(TEXT_BEFORE('08:02')), '24) « + » ordinaire à 08:05 (08:00–09:00) : l’alerte « avant » s’ouvre, comme prévu');

// 25 · « Envoyer ma journée » après un départ : toujours une confirmation
// (journée courte, sans prévu ni pause : le cas où le bouton du dock enverrait sans rien demander)
const departCourt = async () => { await punchAt('departure'); D.time_entries = [entry('e-court', W1, '08:00', '12:00')]; };
await departCourt();
resetCalls();
await p.locator('[data-testid=after-send]').click();
await p.waitForSelector('[data-testid=send-ask]', { timeout: 15000 }).catch(() => {});
check(await p.locator('[data-testid=send-ask]').count() === 1, '25) /poseur : la fenêtre « Envoyer votre journée maintenant ? »');
check((await p.locator('[data-testid=send-ask]').innerText()).replace(/\s+/g, ' ').includes('Envoyer votre journée maintenant ?') && (await p.locator('[data-testid=send-ask]').innerText()).replace(/\s+/g, ' ').includes('Votre journée compte 4h00. Une fois envoyée, la modifier prévient la secrétaire.'), '25) texte « Votre journée compte 4h00 … »');
await p.waitForTimeout(1500);
check(writes().length === 0, `25) AUCUNE écriture tant que « Oui, envoyer ma journée » n’est pas touché (${writes().map((c) => c.method + ' ' + c.path).join(', ')})`);
await shot('envoi-confirmer');
await p.locator('[data-testid=send-ask-no]').click();
await p.waitForTimeout(800);
check(writes().length === 0 && await p.locator('[data-testid=send-ask]').count() === 0, '25) « Pas maintenant » : rien ne part');
// retour téléphone
await departCourt();
await p.locator('[data-testid=after-send]').click();
await p.waitForSelector('[data-testid=send-ask]', { timeout: 15000 }).catch(() => {});
await p.goBack();
await p.waitForTimeout(600);
check(await p.locator('[data-testid=send-ask]').count() === 0 && new URL(p.url()).pathname === '/poseur', '20) bouton « retour » : la fenêtre « envoi » se ferme, on reste sur /poseur');
// « Oui » : l'envoi garde ses questions habituelles (ici aucune : il part)
await departCourt();
await p.locator('[data-testid=after-send]').click();
await p.waitForSelector('[data-testid=send-ask]', { timeout: 15000 }).catch(() => {});
resetCalls();
await p.locator('[data-testid=send-ask-yes]').click();
await p.waitForTimeout(1800);
check(callsTo('PATCH', '/rest/v1/time_entries').some((c) => c.body?.status === 'submitted'), '25) « Oui, envoyer ma journée » : la journée part');
// journée longue : après le « oui », la question de la pause reste posée
await punchAt('departure');
await p.locator('[data-testid=after-send]').click();
await p.waitForSelector('[data-testid=send-ask]', { timeout: 15000 }).catch(() => {});
resetCalls();
await p.locator('[data-testid=send-ask-yes]').click();
await p.waitForTimeout(1000);
check(await p.locator('[data-testid=pause-ask]').count() === 1 && writes().length === 0, '25) journée de 9h05 : après le « oui », la question « Tu as pris une pause ? » reste posée, rien n’est parti');
// les branches sans envoi, chacune avec son message
await punchAt('departure'); D.time_entries = [entry('e-env', W1, '08:00', '12:00', { status: 'submitted' })];
await p.locator('[data-testid=after-send]').click();
await p.waitForSelector('.bt-total', { timeout: 15000 });
await p.waitForTimeout(900);
check(await p.locator('[data-testid=send-ask]').count() === 0 && (await toastTexts()).includes('Journée déjà envoyée.'), '25) journée déjà envoyée : « Journée déjà envoyée. »');
await punchAt('departure'); D.time_entries = [];
await p.locator('[data-testid=after-send]').click();
await p.waitForSelector('.bt-total', { timeout: 15000 });
await p.waitForTimeout(900);
check(await p.locator('[data-testid=send-ask]').count() === 0 && (await toastTexts()).includes('Rien à envoyer pour l\'instant.'), '25) rien à envoyer : « Rien à envoyer pour l’instant. »');
// file du téléphone non vide (le serveur refuse l'envoi : la saisie reste sur le téléphone)
await punchAt('departure');
failPost = true;
await p.evaluate(([me, co]) => {
  const e = { localId: 'loc-1', company_id: co, user_id: me, worksite_id: 'w2', planning_id: null, work_date: '2026-10-21', start_time: '18:00', end_time: '19:00', break_minutes: 0, total_minutes: 60, meal_allowance: false, observation: null, reception: null, _worksite_name: 'Maison Martin', _worksite_city: null, _saved_at: 1 };
  localStorage.setItem('battime_offline_' + me, JSON.stringify([e]));
}, [ME, CO]);
await p.locator('[data-testid=after-send]').click();
await p.waitForSelector('.bt-total', { timeout: 15000 });
await p.waitForTimeout(1200);
check(await p.locator('[data-testid=send-ask]').count() === 0 && (await toastTexts()).includes('Envoyez d\'abord ce qui reste en attente (bouton en bas).'), '25) file du téléphone non vide : « Envoyez d’abord ce qui reste en attente »');
await p.evaluate((me) => localStorage.removeItem('battime_offline_' + me), ME);
failPost = false;
// hors ligne : le téléphone se croit sans réseau au moment du geste (la navigation cliente, elle, aboutit)
await punchAt('departure');
await p.evaluate(() => Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }));
await p.locator('[data-testid=after-send]').click();
await p.waitForSelector('.bt-total', { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(1200);
check(await p.locator('[data-testid=send-ask]').count() === 0 && (await toastTexts()).includes('Pas de réseau : envoyez votre journée quand il revient.'), '25) hors ligne : « Pas de réseau : envoyez votre journée quand il revient. »');
await p.evaluate(() => { delete navigator.onLine; });

// 26 · paramètres refusés ou périmés
const none = async (label, url) => {
  await scene();
  D.time_entries = [entry('e-x', W1, '08:00', '12:00')];
  await p.goto(url);
  await p.waitForSelector('.bt-total', { timeout: 15000 });
  await p.waitForTimeout(1000);
  check(await p.locator('.bt-ed, [data-testid=send-ask]').count() === 0 && new URL(p.url()).search === '', `26) ${label} : aucun effet, adresse nettoyée`);
};
await none('paramètre périmé (11 min)', href('ajouter', NOW.getTime() - 11 * 60000, ME, '17:07'));
await none('autre compte', href('ajouter', NOW.getTime() - 5000, OTHER_ME, '17:07'));
await none('action inconnue', href('supprimer', NOW.getTime() - 5000, ME, '17:07'));
// consommé après 3 minutes : on tient la lecture de la journée, on avance l'horloge, puis on la libère
await scene();
let hold = null; const gate = new Promise((res) => { hold = res; });
await p.route('**/rest/v1/time_entries?*', async (r) => { if (r.request().method() === 'GET') await gate; await r.fallback(); });
const nav = p.goto(href('ajouter', NOW.getTime() - 5000, ME, '17:07')).catch(() => {});
await p.waitForTimeout(1500);
await ctx.clock.setSystemTime(new Date(NOW.getTime() + 4 * 60000));
hold();
await nav;
await p.waitForSelector('.bt-total', { timeout: 15000 });
await p.waitForTimeout(1200);
await p.unroute('**/rest/v1/time_entries?*');
check(await p.locator('.bt-ed').count() === 0 && (await toastTexts()).includes('Ce raccourci a expiré : touchez « + » pour ajouter une intervention.'), '26) consommé après 3 min : message d’expiration, aucune fiche');
// journée déjà envoyée + « Ajouter une intervention »
await scene(() => { D.time_entries = [entry('e-env', W1, '08:00', '12:00', { status: 'submitted' })]; });
await p.goto(href('ajouter', NOW.getTime() - 5000, ME, '17:07'));
await p.waitForTimeout(2000);
check((await bodyText()).includes('Journée déjà envoyée') && await p.locator('.bt-ed').count() === 0, '26) journée déjà envoyée : la confirmation « Journée déjà envoyée » d’abord');
// écran de succès laissé ouvert 20 min : l'adresse est calculée au toucher
await punchAt('departure');
await ctx.clock.setSystemTime(new Date(NOW.getTime() + 20 * 60000));
await p.locator('[data-testid=after-add]').click();
await p.waitForSelector('.bt-ed', { timeout: 15000 }).catch(() => {});
check(await p.locator('.bt-ed').count() === 1, '26) écran de succès laissé 20 min puis « Ajouter une intervention » : ça fonctionne');

// ═════ 28 · L'intervention finit APRÈS maintenant : pas de phrase « rien ne sera compté » ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await addLine('Maison Martin', '10:00', '11:00', 1000);
check(await p.locator('[data-testid=live-clash-finish]').count() === 1 && await p.locator('[data-testid=live-clash-gap]').count() === 0, '28) 10:00–11:00 à 10:30 : « Terminer … » proposé, pas de phrase sur le temps non compté (la fin est dans le futur)');

// ═════ 29 · La fiche est fermée pendant la relecture du pointage : rien n'est écrit, aucune alerte ═════
await scene(() => { D.active_sessions = [chrono('08:02:20')]; });
await open();
await fillNew('Maison Martin', '09:00', '10:00');
liveRead = 'slow';
resetCalls();
await p.locator('.bt-save', { hasText: 'OK' }).click();
await p.locator('.bt-ed-cancel').click();
await p.waitForTimeout(3600);
check(await p.locator('.bt-ed').count() === 0 && await p.locator('[data-testid=live-clash]').count() === 0, '29) « Annuler » pendant la relecture : fiche fermée, aucune alerte sans fiche derrière');
check(writes().length === 0 && await errorToasts() === 0, `29) 0 écriture, aucun message rouge (${writes().map((c) => c.method + ' ' + c.path).join(', ')})`);
await scene();
await open();
await fillNew('Maison Martin', '09:00', '10:00');
liveRead = 'slow';
resetCalls();
await p.locator('.bt-save', { hasText: 'OK' }).click();
await p.locator('.bt-ed-cancel').click();
await p.waitForTimeout(3600);
check(callsTo('POST', '/rest/v1/time_entries').length === 0 && D.time_entries.length === 0, '29) sans pointage : annuler pendant la relecture n’enregistre rien non plus');

// ═════ 30 · « Envoyer ma journée » : le focus d'ouverture va à « Pas maintenant » ═════
await departCourt();
await p.locator('[data-testid=after-send]').click();
await p.waitForSelector('[data-testid=send-ask]', { timeout: 15000 }).catch(() => {});
check(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'send-ask-no', '30) fenêtre d’envoi : focus d’ouverture sur « Pas maintenant » (Entrée n’envoie rien)');
await p.waitForTimeout(500);
check(writes().length === 0, '30) aucune écriture');

// ═════ 31 · Un double toucher sur un raccourci ne pousse qu'une adresse ═════
await punchAt('departure');
await p.evaluate(() => {
  window.__pushes = [];
  const push = history.pushState.bind(history);
  history.pushState = (st, t, url) => { window.__pushes.push(String(url)); return push(st, t, url); };
  const el = document.querySelector('[data-testid=after-add]');
  el.click();
  setTimeout(() => el.click(), 15);
});
await p.waitForSelector('.bt-ed', { timeout: 15000 });
await p.waitForTimeout(800);
check(await p.evaluate(() => window.__pushes.filter((u) => u.includes('a=ajouter')).length) === 1, '31) deux touchers à 15 ms d’écart : une seule adresse « ?a=… » poussée');
check(new URL(p.url()).search === '', `31) adresse propre (${p.url().replace(BASE, '')})`);
await p.reload();
await p.waitForSelector('.bt-total', { timeout: 15000 });
await p.waitForTimeout(900);
check(await p.locator('.bt-ed').count() === 0, '31) rechargement : le raccourci ne se rejoue pas');
await punchAt('departure');
await p.evaluate(() => { document.querySelector('[data-testid=after-add]').click(); });
check(await p.evaluate(() => ['after-send', 'after-add'].every((id) => document.querySelector(`[data-testid=${id}]`)?.disabled === true)), '31) après le premier toucher, les boutons de raccourci sont désactivés');

// ═════ 32 · Salarié clôturé : le raccourci attend la lecture de la clôture ═════
const clos = () => { D.user_closures = [{ user_id: ME, company_id: CO, closed_until: TODAY, reopened_at: null }]; };
await scene(clos);
closureDelay = 1200;
await p.goto(href('ajouter', NOW.getTime() - 5000, ME, '17:07'));
await p.waitForSelector('.bt-total', { timeout: 15000 });
await p.waitForTimeout(2500);
check(await p.locator('.bt-ed').count() === 0 && (await bodyText()).includes('Heures clôturées'), '32) clôture lue après la journée : la fenêtre « Heures clôturées » s’ouvre, pas la fiche');
await scene(clos);
closureDelay = 4000;
await p.goto(href('ajouter', NOW.getTime() - 5000, ME, '17:07'));
await p.waitForSelector('.bt-total', { timeout: 15000 });
await p.waitForTimeout(3200);
check(await p.locator('.bt-ed').count() === 1, '32) clôture très lente (4 s) : repli à 2 s, le raccourci n’est pas bloqué (le serveur refusera à l’enregistrement)');

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
