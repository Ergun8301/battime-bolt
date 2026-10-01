// Lot 9 — zone salarié : « Je commence » sur la carte, « J'ai fini » sans blocage,
// carte verte « en cours depuis », panier = case du bloc noir, heures à la minute.
//
// Lancer : npm run build, puis
//   node scripts/tests/salarie-lot9.mjs out docs/captures-lot9
// Vraie page /poseur (export statique), base Supabase SIMULÉE (aucune vraie base),
// téléphone 390×844. Même principe que scripts/tests/assistant-panneau.mjs.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
// playwright-core du projet s'il est là, sinon celui installé globalement avec playwright.
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot9', PORT = '4198'] = process.argv;
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

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
const open = async () => { await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector('.bt-total', { timeout: 15000 }); await p.waitForTimeout(900); };
const errorToasts = () => p.locator('[data-sonner-toast][data-type="error"]').count();
const bodyText = () => p.locator('body').innerText();

// ═════ 1 · La journée : plus de bloc « Pointer en direct », « Je commence » sur chaque carte ═════
D.planning = [{ id: 'p1', company_id: CO, user_id: ME, worksite_id: 'w1', work_date: today, absence_type: null, estimated_start: '08:00:00', estimated_end: '12:00:00', notes: null, worksite: W1 }];
D.time_entries = [entry('e1', W2, '13:00', '16:30')];
await open();
check(!(await bodyText()).includes('Pointer en direct'), '1) plus de bloc « Pointer en direct »');
check(await p.locator('select').count() === 0, '1) plus de liste déroulante de chantiers');
const cards = await p.locator('[data-testid=card-planned], [data-testid=card-entry]').count();
const starts = await p.locator('[data-testid=card-start]').count();
check(cards === 2 && starts === 2, `1) « Je commence » sur chaque carte : ${starts} bouton(s) / ${cards} carte(s)`);
check(await p.locator('[data-testid=card-planned] [data-testid=card-start]').count() === 1 && await p.locator('[data-testid=card-entry] [data-testid=card-start]').count() === 1,
  '1) une carte prévue ET une carte notée ont chacune leur bouton');
check(await p.locator('.bt-meal').count() === 0 && !(await bodyText()).includes('Panier repas'), '1) plus de ligne blanche « Panier repas »');
check(await p.locator('button[aria-label="Panier repas"][aria-pressed="false"]').count() === 1, '1) la case « Panier » du bloc noir est un bouton (aria-pressed=false)');
await p.screenshot({ path: `${SH}/salarie-journee.png` });

// ═════ 2 · « Je commence » sur la carte : départ, sans ouvrir la fiche ; la carte passe au vert ═════
reset();
await p.locator('[data-testid=card-planned] [data-testid=card-start]').click();
await p.waitForTimeout(1500);
const post = callsTo('POST', '/rest/v1/active_sessions');
check(post.length === 1 && post[0].body?.worksite_id === 'w1' && post[0].body?.planning_id === 'p1' && post[0].body?.work_date === today,
  `2) POST active_sessions (chantier w1, planning p1) : ${JSON.stringify(post.map((c) => c.body))}`);
check(await p.locator('.bt-ed').count() === 0, '2) la fiche (éditeur) ne s’est PAS ouverte');
check(await p.locator('[data-testid=card-live]').count() === 1, '2) la carte du chantier est verte (en cours)');
const liveTxt = await p.locator('[data-testid=card-live]').innerText().catch(() => '');
check(/en cours depuis \d\d:\d\d/.test(liveTxt), `2) « en cours depuis HH:MM » : ${liveTxt.replace(/\s+/g, ' ').slice(0, 80)}`);
check(await p.locator('[data-testid=card-start]').count() === 0, '2) plus aucun « Je commence » (un seul chrono)');
check(await p.locator('button:has-text("J\'ai fini")').count() === 1, '2) « J’ai fini » affiché');

// ═════ 3 · Carte verte depuis la base (pointage ouvert à la borne) ; non modifiable ═════
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: 'p1', work_date: today, started_at: new Date(Date.now() - 47 * 60000).toISOString() }];
await open();
const since = parisHHmm(D.active_sessions[0].started_at);
check((await p.locator('[data-testid=card-live]').innerText()).includes(`en cours depuis ${since}`), `3) carte verte « en cours depuis ${since} » lue depuis active_sessions`);
await p.locator('[data-testid=card-live]').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${SH}/salarie-en-cours.png` });
await p.locator('[data-testid=card-live]').click();
await p.waitForTimeout(400);
check(await p.locator('.bt-ed').count() === 0, '3) la carte en cours n’ouvre pas de fiche (pas de doublon à la main)');
// « Envoyer ma journée » : la carte en cours n'est pas matérialisée.
reset();
await p.locator('.bt-send', { hasText: 'Envoyer ma journée' }).click();
await p.waitForTimeout(1200);
const confirmBtn = p.locator('button:has-text("Confirmer l\'envoi")');
if (await confirmBtn.count()) { await confirmBtn.click(); await p.waitForTimeout(800); }
const inserted = callsTo('POST', '/rest/v1/time_entries').flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body]));
check(!inserted.some((x) => x?.planning_id === 'p1'), `3) « Envoyer ma journée » ne matérialise PAS la carte en cours (${inserted.length} ligne(s) prévue(s) créée(s))`);

// Chantier pointé SANS carte (scan de la borne) → carte verte de synthèse.
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w3', planning_id: null, work_date: today, started_at: new Date(Date.now() - 12 * 60000).toISOString() }];
await open();
const synth = await p.locator('[data-testid=card-live]').innerText().catch(() => '');
check(synth.includes('Dépôt Gerland') && synth.includes('en cours depuis'), `3) chantier sans carte → carte verte à part : ${synth.replace(/\s+/g, ' ').slice(0, 70)}`);
check(await p.locator('[data-testid=card-planned]').count() === 1, '3) la carte prévue (autre chantier) reste normale, jamais « la première carte »');

// ═════ 4 · « J'ai fini » après 30 s : annulé sans erreur (DELETE ciblé), pas d'appel serveur ═════
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: 'p1', work_date: today, started_at: new Date(Date.now() - 25000).toISOString() }];
await open(); reset();
const startedShort = D.active_sessions[0].started_at;
await p.locator('button:has-text("J\'ai fini")').click();
await p.waitForTimeout(1500);
const del = callsTo('DELETE', '/rest/v1/active_sessions');
check(del.length === 1 && new URLSearchParams(del[0].search).get('started_at') === `eq.${startedShort}`, `4) DELETE active_sessions ciblé sur started_at : ${del.map((c) => decodeURIComponent(c.search)).join(' | ')}`);
check(callsTo('POST', '/rest/v1/rpc/').length === 0, '4) aucun appel finish/stop pour moins d’une minute');
check(await errorToasts() === 0, '4) aucun message d’erreur');
const t4 = await bodyText();
check(!/quart d/i.test(t4), '4) jamais « pas encore un quart d’heure »');
check(t4.includes('Pointage annulé (moins d’une minute)'), '4) message neutre « Pointage annulé (moins d’une minute) »');
check(await p.locator('button:has-text("J\'ai fini")').count() === 0 && await p.locator('[data-testid=card-start]').count() === 2, '4) chrono parti, « Je commence » revenu sur les cartes');

// ═════ 5 · « J'ai fini » après plus d'une minute : finish_active_session ═════
finishMode = 'ok';
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: 'p1', work_date: today, started_at: new Date(Date.now() - 5 * 60000 - 20000).toISOString() }];
await open(); reset();
await p.locator('button:has-text("J\'ai fini")').click();
await p.waitForTimeout(1800);
check(callsTo('POST', '/rest/v1/rpc/finish_active_session').length === 1, '5) rpc finish_active_session appelée');
check(callsTo('POST', '/rest/v1/rpc/stop_active_session').length === 0, '5) stop_active_session PAS appelée');
check((await bodyText()).includes('Pointage fermé'), '5) « Pointage fermé — HH:MM à HH:MM »');
check(await p.locator('[data-testid=card-entry]').count() === 2, '5) la ligne créée apparaît sans recharger la page');
check(await errorToasts() === 0, '5) aucun message d’erreur');

// ═════ 6 · Fonction pas encore déployée (404 PGRST202) → repli stop_active_session ═════
finishMode = 'missing';
D.time_entries = [entry('e1', W2, '13:00', '16:30')];
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: 'p1', work_date: today, started_at: new Date(Date.now() - 20 * 60000).toISOString() }];
await open(); reset();
await p.locator('button:has-text("J\'ai fini")').click();
await p.waitForTimeout(1800);
check(callsTo('POST', '/rest/v1/rpc/finish_active_session').length === 1 && callsTo('POST', '/rest/v1/rpc/stop_active_session').length === 1,
  '6) 404 PGRST202 → repli sur stop_active_session');
check(await errorToasts() === 0 && (await bodyText()).includes('Pointage fermé'), '6) fermé normalement, sans erreur');
// … et son refus BT001 (même quart d'heure) : UNE ligne neutre.
finishMode = 'missing-bt001';
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: 'p1', work_date: today, started_at: new Date(Date.now() - 3 * 60000).toISOString() }];
await open(); reset();
await p.locator('button:has-text("J\'ai fini")').click();
await p.waitForTimeout(1500);
const t6 = await bodyText();
check(t6.includes('Rien à compter pour l’instant') && !/quart d/i.test(t6) && await errorToasts() === 0, '6) BT001 → une ligne neutre, jamais « quart d’heure », pas d’erreur rouge');
check(await p.locator('button:has-text("J\'ai fini")').count() === 1, '6) le chrono reste ouvert (rien n’a été écrit)');
finishMode = 'ok';

// ═════ 7 · Panier : la case du bloc noir bascule pris / non pris et écrit meal_allowance ═════
D.active_sessions = [];
D.time_entries = [entry('e1', W2, '13:00', '16:30')];
await open(); reset();
const panier = p.locator('button[aria-label="Panier repas"]');
await panier.click();
await p.waitForTimeout(1200);
const patches = callsTo('PATCH', '/rest/v1/time_entries');
check(patches.some((c) => c.body?.meal_allowance === true), `7) PATCH time_entries meal_allowance=true : ${JSON.stringify(patches.map((c) => c.body))}`);
check(await panier.getAttribute('aria-pressed') === 'true' && (await panier.innerText()).includes('Panier ✓'), '7) aria-pressed=true, « Panier ✓ · repas pris »');
await p.screenshot({ path: `${SH}/salarie-panier.png` });
reset();
await panier.click();
await p.waitForTimeout(1200);
check(callsTo('PATCH', '/rest/v1/time_entries').some((c) => c.body?.meal_allowance === false) && await panier.getAttribute('aria-pressed') === 'false', '7) second appui : non pris (meal_allowance=false)');
// Journée encore vide : l'intention est gardée, posée sur la première ligne.
D.time_entries = []; D.planning = [];
await open(); reset();
await panier.click();
await p.waitForTimeout(800);
check(callsTo('PATCH', '/rest/v1/time_entries').length === 0 && await panier.getAttribute('aria-pressed') === 'true', '7) journée vide : panier gardé coché (rien à écrire encore)');
await open();
check(await panier.getAttribute('aria-pressed') === 'true', '7) … toujours coché après rechargement (jamais décoché en silence)');
reset();
D.time_entries = [entry('e9', W2, '08:00', '12:00')];
await p.evaluate(() => window.dispatchEvent(new Event('online')));
await open();
await p.waitForTimeout(800);
check(callsTo('PATCH', '/rest/v1/time_entries').some((c) => c.body?.meal_allowance === true), '7) première ligne apparue → panier posé dessus');

// ═════ 8 · L'arrondi ne pénalise jamais : 08:07–16:52 ouvert puis « OK » → aucune heure envoyée ═════
D.planning = []; D.active_sessions = [];
D.time_entries = [entry('e2', W2, '08:07', '16:52')];
await open(); reset();
await p.locator('[data-testid=card-entry]').click();
await p.waitForSelector('.bt-ed');
const cardsTxt = await p.locator('.bt-timecard').allInnerTexts();
check(cardsTxt.join(' ').includes('08:07') && cardsTxt.join(' ').includes('16:52'), `8) la fiche s’ouvre sur 08:07 / 16:52 (pas 08:00 / 16:45) : ${cardsTxt.join(' | ').replace(/\s+/g, ' ')}`);
await p.locator('.bt-timecard').first().click();
await p.waitForTimeout(700);
check((await p.locator('[data-testid=heure-exacte]').innerText().catch(() => '')).includes('08:07'), '8) sous la molette : « Heure exacte gardée : 08:07 »');
await p.locator('button:has-text("Valider les heures")').click();
await p.waitForTimeout(500);
await p.locator('.bt-save', { hasText: 'OK' }).click();
await p.waitForTimeout(1200);
const upd = callsTo('PATCH', '/rest/v1/time_entries').find((c) => c.search.includes('id=eq.e2'));
check(!!upd && !('start_time' in (upd.body || {})) && !('end_time' in (upd.body || {})), `8) PATCH sans start_time ni end_time : ${JSON.stringify(upd?.body)}`);

// ═════ 9 · Deux pointages qui se touchent d'une minute : pas de fausse alerte « se chevauchent » ═════
D.time_entries = [entry('e3', W1, '08:07', '10:15'), entry('e4', W2, '10:14', '12:01')];
await open(); reset();
await p.locator('.bt-send', { hasText: 'Envoyer ma journée' }).click();
await p.waitForTimeout(1200);
check(!(await bodyText()).includes('se chevauchent'), '9) 1 minute de recouvrement tolérée : pas de « se chevauchent »');
check(callsTo('PATCH', '/rest/v1/time_entries').some((c) => c.body?.status === 'submitted'), '9) journée envoyée directement');

// ═════ 10 · Endroit activé : l'information (CNIL) AVANT le premier chrono, jamais pour « + » ═════
D.companies[0].position_tracking_enabled = true;
D.time_entries = []; D.active_sessions = [];
D.planning = [{ id: 'p1', company_id: CO, user_id: ME, worksite_id: 'w1', work_date: today, absence_type: null, estimated_start: '08:00:00', estimated_end: '12:00:00', notes: null, worksite: W1 }];
await open(); reset();
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('bemexo-geo-info')) localStorage.removeItem(k); });
await p.locator('button[aria-label="Ajouter un chantier"]').click();
await p.waitForTimeout(500);
check(await p.locator('[data-testid=geo-info]').count() === 0, '10) « + » (heures à la main) : aucune information d’endroit');
await p.locator('.bt-ed-cancel').click();
await p.waitForTimeout(400);
await p.locator('[data-testid=card-planned] [data-testid=card-start]').click();
await p.waitForTimeout(500);
check(await p.locator('[data-testid=geo-info]').count() === 1 && callsTo('POST', '/rest/v1/active_sessions').length === 0, '10) « Je commence » : l’information d’abord, rien d’écrit avant');
await p.locator('[data-testid=geo-info] button').click();
await p.waitForTimeout(1800);
const post10 = callsTo('POST', '/rest/v1/active_sessions');
check(post10.length === 1 && typeof post10[0].body?.start_lat === 'number', '10) « J’ai compris » → le pointage démarre (avec l’endroit)');

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
