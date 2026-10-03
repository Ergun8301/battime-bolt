// Lot 12 — écran du salarié : sortie oubliée « à compléter » (ne part pas),
// « Tu as pris une pause ? » sur une journée QR de plus de 6 h, scan à midi.
//
// Lancer : npm run build, puis
//   node scripts/tests/salarie-lot12.mjs out docs/captures-lot12
// Vraie page /poseur (export statique), base Supabase SIMULÉE (aucune vraie base),
// téléphone 390×844. Même principe que scripts/tests/assistant-panneau.mjs.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
// playwright-core du projet s'il est là, sinon celui installé globalement avec playwright.
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot12', PORT = '4212'] = process.argv;
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
let hasKiosk = 'absent'; // true | false | 'absent'
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
  // Lot 12 : une tablette est-elle vraiment reliée ? 'absent' = migration pas encore passée.
  if (u.pathname === '/rest/v1/rpc/company_has_kiosk') {
    if (hasKiosk === 'absent') return r.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.company_has_kiosk', details: null, hint: null } });
    return r.fulfill({ json: hasKiosk });
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


const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const sendBtn = () => p.locator('.bt-send', { hasText: 'Envoyer ma journée' });
const submitted = () => callsTo('PATCH', '/rest/v1/time_entries').filter((c) => c.body?.status === 'submitted');

// ═════ 1 · Sortie oubliée « à compléter » : affichée, ne part pas ═════
D.planning = []; D.active_sessions = [];
D.time_entries = [entry('e-oubli', W1, '08:00', '08:00', { source: 'qr', exit_forgotten: true })];
await open(); reset();
const card1 = await p.locator('[data-testid=card-entry]').innerText();
check(card1.includes('fin à compléter'), `1) la ligne dit « 08:00 → fin à compléter » : ${card1.replace(/\s+/g, ' ').slice(0, 90)}`);
check((await p.locator('[data-testid=card-exit-forgotten]').innerText().catch(() => '')).includes('Sortie oubliée'), '1) « ⚠ Sortie oubliée — mets ton heure de fin »');
await p.screenshot({ path: `${SH}/salarie-sortie-oubliee-390x844.png` });
await sendBtn().click();
await p.waitForTimeout(1200);
check(submitted().length === 0, '1) « Envoyer ma journée » : rien n’est envoyé');
check((await bodyText()).includes('Sortie oubliée : mets ton heure de fin'), '1) message clair « Sortie oubliée : mets ton heure de fin avant d’envoyer »');
check(await p.locator('.bt-ed').count() === 1, '1) la ligne s’ouvre pour la compléter');
await p.screenshot({ path: `${SH}/salarie-sortie-oubliee-fiche-390x844.png` });

// Fin prévue déjà mise (sortie oubliée avec heure prévue) : envoyable, badge gardé.
D.time_entries = [entry('e-oubli2', W1, '08:00', '17:00', { source: 'qr', exit_forgotten: true, total_minutes: 540, break_minutes: 60 })];
D.time_entries[0].total_minutes = 480;
await open(); reset();
check((await p.locator('[data-testid=card-exit-forgotten]').innerText().catch(() => '')).includes('vérifie ton heure de fin'), '1) avec fin prévue : « Sortie oubliée — vérifie ton heure de fin »');
await sendBtn().click();
await p.waitForTimeout(1200);
const c1 = p.locator('button:has-text("Confirmer l\'envoi")'); if (await c1.count()) { await c1.click(); await p.waitForTimeout(800); }
check(submitted().length === 1, '1) … et elle part normalement');

// ═════ 2 · Journée QR > 6 h sans pause : « Tu as pris une pause ? » ═════
D.time_entries = [entry('e-qr', W1, '08:00', '17:00', { source: 'qr' })];
await open(); reset();
await sendBtn().click();
await p.waitForTimeout(800);
check(await p.locator('[data-testid=pause-ask]').count() === 1 && (await p.locator('[data-testid=pause-ask]').innerText()).includes('Tu as pris une pause'), '2) 08:00–17:00 au QR, pause 0 : la question s’affiche');
check(submitted().length === 0, '2) rien n’est envoyé avant la réponse');
const btns = await p.locator('[data-testid=pause-ask] button').allInnerTexts();
check(['Non', '30 min', '1 h'].every((x) => btns.some((b) => b.includes(x))), `2) trois boutons : ${btns.filter((b) => b.trim()).join(' / ')}`);
await p.screenshot({ path: `${SH}/salarie-pause-390x844.png` });
await p.locator('[data-testid=pause-60]').click();
await p.waitForTimeout(1500);
const c2 = p.locator('button:has-text("Confirmer l\'envoi")'); if (await c2.count()) { await c2.click(); await p.waitForTimeout(800); }
const brk = callsTo('PATCH', '/rest/v1/time_entries').find((c) => c.body?.break_minutes === 60);
check(!!brk && brk.search.includes('id=eq.e-qr'), `2) « 1 h » : pause posée sur la ligne QR (${JSON.stringify(brk?.body)})`);
check(submitted().length === 1, '2) puis la journée part (un seul toucher)');

// « Non » : rien posé, envoyée.
D.time_entries = [entry('e-qr2', W1, '07:00', '15:00', { source: 'qr' })];
await open(); reset();
await sendBtn().click(); await p.waitForTimeout(800);
await p.locator('[data-testid=pause-0]').click(); await p.waitForTimeout(1500);
const c3 = p.locator('button:has-text("Confirmer l\'envoi")'); if (await c3.count()) { await c3.click(); await p.waitForTimeout(800); }
check(!callsTo('PATCH', '/rest/v1/time_entries').some((c) => 'break_minutes' in (c.body || {})) && submitted().length === 1, '2) « Non » : aucune pause posée, journée envoyée');

// ═════ 3 · Pas de question quand elle n'a pas lieu d'être ═════
const noAsk = async (lines, label) => {
  D.time_entries = lines;
  await open(); reset();
  await sendBtn().click(); await p.waitForTimeout(900);
  const asked = await p.locator('[data-testid=pause-ask]').count();
  const c = p.locator('button:has-text("Confirmer l\'envoi")'); if (await c.count()) { await c.click(); await p.waitForTimeout(800); }
  check(asked === 0 && submitted().length === 1, `3) ${label} : pas de question, envoyée`);
};
await noAsk([entry('e-a', W1, '08:00', '12:00', { source: 'qr' }), entry('e-b', W1, '13:00', '17:00', { source: 'qr' })], 'scan à midi (2 lignes 08–12 / 13–17)');
await noAsk([entry('e-m', W1, '08:00', '17:00')], 'journée saisie à la main (pas QR)');
await noAsk([entry('e-p', W1, '08:00', '17:00', { source: 'qr', break_minutes: 30, total_minutes: 510 })], 'pause déjà notée');
await noAsk([entry('e-s', W1, '08:00', '13:30', { source: 'qr' })], 'journée QR de 5 h 30');

// ═════ 4 · Pointage ouvert la veille (avant le passage de nuit) : « Sortie oubliée » ═════
const parisIso = (day, hms) => {
  const guess = Date.parse(`${day}T${hms}Z`);
  const wall = Date.parse(`${new Date(guess).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', 'T')}Z`);
  return new Date(guess - (wall - guess)).toISOString();
};
D.time_entries = [];
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: null, work_date: yesterday, started_at: parisIso(yesterday, '08:02:10') }];
await open(); reset();
const lt4 = await p.locator('[data-testid=live-timer]').innerText().catch(() => '');
check(/sortie oubliée/i.test(lt4) && lt4.includes('Terminer ma journée') && !lt4.includes('Annuler'), `4) carte « Sortie oubliée » + « Terminer ma journée », pas d’« Annuler » : ${lt4.replace(/\s+/g, ' ').slice(0, 90)}`);
await p.fill('[data-testid=lt-end]', '16h45'); await p.keyboard.press('Tab'); await p.waitForTimeout(200);
await p.screenshot({ path: `${SH}/salarie-sortie-oubliee-veille-390x844.png` });
await p.locator('[data-testid=lt-finish]').click();
await p.waitForTimeout(1500);
const f4 = callsTo('POST', '/rest/v1/rpc/finish_active_session');
check(f4.length === 1 && f4[0].body?.p_end === '16:45:00', `4) fin tapée « 16h45 » → finish_active_session(p_end=16:45:00) : ${JSON.stringify(f4.map((c) => c.body))}`);

// ═════ 5 · Icône du scanner : seulement si une tablette est vraiment reliée ═════
D.active_sessions = []; D.time_entries = [];
const icon = async (enabled, has) => { D.companies[0].kiosk_enabled = enabled; hasKiosk = has; await open(); await p.waitForTimeout(400); return p.locator('[data-testid=scan-open]').count(); };
check(await icon(true, true) === 1, '5) borne allumée + tablette reliée : icône du scanner affichée');
check(await icon(true, false) === 0, '5) borne allumée mais AUCUNE tablette reliée : pas d’icône');
check(await icon(false, true) === 0, '5) borne éteinte : pas d’icône');
check(await icon(true, 'absent') === 1, '5) avant la migration (fonction absente) : comportement d’avant, icône affichée');
check(await icon(false, 'absent') === 0, '5) avant la migration, borne éteinte : pas d’icône (inchangé)');

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
