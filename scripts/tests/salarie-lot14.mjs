// Lot 14 — chef d'équipe : « Mon équipe » sur les 7 derniers jours, pour tous
// les salariés de l'entreprise ; pas de doublon ; le salarié, lui, ne change rien.
//
// Lancer : npm run build, puis
//   node scripts/tests/salarie-lot14.mjs out docs/captures-lot14
// Vraie page /poseur (export statique), base Supabase SIMULÉE (aucune vraie base),
// téléphone 390×844. Même principe que scripts/tests/assistant-panneau.mjs.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
// playwright-core du projet s'il est là, sinon celui installé globalement avec playwright.
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot14', PORT = '4214'] = process.argv;
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
  users: [
    { id: ME, company_id: CO, first_name: 'Karim', last_name: 'Benali', role: 'lead', email: 'karim@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: 'u-lucas', company_id: CO, first_name: 'Lucas', last_name: 'Petit', role: 'worker', email: 'lucas@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: 'u-nina', company_id: CO, first_name: 'Nina', last_name: 'Roux', role: 'worker', email: 'nina@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: 'u-paul', company_id: CO, first_name: 'Paul', last_name: 'Bureau', role: 'admin', email: 'paul@exemple.fr', is_active: true, created_at: '2026-01-01' },
  ],
  companies: [{ id: CO, name: 'Benali Rénovation', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [W1, W2, W3, AUTRE],
  planning: [], time_entries: [], active_sessions: [],
  month_closures: [], leave_requests: [], documents: [], time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [],
};
let hasKiosk = 'absent'; // true | false | 'absent'
let sendMode = 'ok'; // ok | absent (migration du lot 14 pas encore passée)
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
  if (u.pathname === '/rest/v1/rpc/lead_send_entries') {
    if (sendMode === 'absent') return r.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.lead_send_entries' } });
    let n = 0;
    for (const id of body?.p_ids || []) { const e = D.time_entries.find((x) => x.id === id); if (e && e.status === 'draft') { e.status = 'submitted'; e.lead_edited_by = ME; n++; } }
    return r.fulfill({ json: n });
  }
  if (u.pathname === '/rest/v1/time_entries' && req.method() === 'POST') {
    const row = { ...(Array.isArray(body) ? body[0] : body), id: `new-${D.time_entries.length + 1}`, total_minutes: 0, locked: false };
    D.time_entries.push(row);
    return r.fulfill({ status: 201, json: [{ id: row.id }] });
  }
  if (u.pathname === '/rest/v1/rpc/correct_time_entry') {
    const e = D.time_entries.find((x) => x.id === body?.p_entry_id);
    if (!e) return r.fulfill({ status: 400, json: { message: 'Cette ligne n’existe pas, ou vous n’y avez pas accès.' } });
    const row = { correction_id: 'c-1', worker_id: e.user_id, work_date: e.work_date, old_start: e.start_time, old_end: e.end_time, new_start: body.p_start, new_end: body.p_end, corrected_by_role: 'lead' };
    e.start_time = `${body.p_start}:00`; e.end_time = `${body.p_end}:00`;
    return r.fulfill({ json: [row] });
  }
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
const lucasEntry = (id, ws, s, e, extra = {}) => ({ ...entry(id, ws, s, e), user_id: 'u-lucas', ...extra });
const ninaEntry = (id, ws, s, e, extra = {}) => ({ ...entry(id, ws, s, e), user_id: 'u-nina', ...extra });
const td = () => p.locator('[data-testid=team-day]');

// ═════ 1 · Le chef voit « Mon équipe » : 7 jours, salariés de l'entreprise (jamais le bureau) ═════
D.planning = [{ id: 'pl-l', company_id: CO, user_id: 'u-lucas', worksite_id: 'w2', work_date: yesterday, absence_type: null, estimated_start: '08:00:00', estimated_end: '17:00:00', notes: null, worksite: W2 }];
D.time_entries = [];
await open(); reset();
check(await td().count() === 1, '1) le chef voit « Mon équipe » sur sa journée');
const dayBtns = await td().locator('[data-testid=td-day]').count();
check(dayBtns === 7 && (await td().locator('[data-testid=td-day][aria-pressed=true]').getAttribute('data-day')) === today, `1) 7 jours au choix, aujourd’hui sélectionné (${dayBtns})`);
const opts = await td().locator('[data-testid=td-who] option').allInnerTexts();
check(opts.includes('Lucas Petit') && opts.includes('Nina Roux') && !opts.some((o) => /Paul|Karim/.test(o)), `1) salariés de l’entreprise au choix, ni le bureau ni lui-même (${opts.join(', ')})`);
await td().screenshot({ path: `${SH}/chef-mon-equipe-390x844.png` });

// ═════ 2 · Saisie de la VEILLE pour Lucas, sans être sur son chantier ═════
await td().locator(`[data-testid=td-day][data-day="${yesterday}"]`).click(); await p.waitForTimeout(700);
await td().locator('[data-testid=td-who]').selectOption('u-lucas'); await p.waitForTimeout(300);
check(await td().locator('[data-testid=td-none]').count() === 1, '2) hier, Lucas : « Pas d’heures ce jour-là »');
await td().locator('[data-testid=td-add]').click(); await p.waitForTimeout(300);
check(await td().locator('[data-testid=td-site]').inputValue() === 'w2', '2) chantier proposé : celui de Lucas ce jour-là (Maison Martin)');
await p.fill('[data-testid=td-start]', '7h30'); await p.keyboard.press('Tab');
await p.fill('[data-testid=td-end]', '16h'); await p.keyboard.press('Tab'); await p.waitForTimeout(200);
await td().screenshot({ path: `${SH}/chef-saisie-veille-390x844.png` });
await td().locator('[data-testid=td-save]').click(); await p.waitForTimeout(1200);
const post = callsTo('POST', '/rest/v1/time_entries');
const b0 = Array.isArray(post[0]?.body) ? post[0].body[0] : post[0]?.body;
check(post.length === 1 && b0?.user_id === 'u-lucas' && b0?.work_date === yesterday && b0?.worksite_id === 'w2' && b0?.start_time === '07:30' && b0?.end_time === '16:00',
  `2) ligne créée pour Lucas, HIER, sans être sur son chantier : ${JSON.stringify(b0)}`);
const send2 = callsTo('POST', '/rest/v1/rpc/lead_send_entries');
check(send2.length === 1 && JSON.stringify(send2[0].body?.p_ids) === JSON.stringify([D.time_entries.at(-1).id]), `2) « OK » l’envoie au bureau (lead_send_entries ${JSON.stringify(send2[0]?.body)})`);
check(D.time_entries.at(-1).status === 'submitted' && (await bodyText()).includes('Envoyé au bureau pour Lucas'), '2) journée ENVOYÉE, message « Envoyé au bureau pour Lucas — par le chef d’équipe »');
check((await td().locator('[data-testid=td-row]').innerText()).toLowerCase().includes('envoyé'), '2) la ligne apparaît « envoyé » dans « Mon équipe »');

// ═════ 3 · Le salarié a déjà une ligne ce jour-là sur ce chantier : corrigée, pas doublée ═════
D.planning = [];
D.time_entries = [ninaEntry('n-1', W1, '08:00', '12:00', { work_date: yesterday })];
await open(); reset();
await td().locator(`[data-testid=td-day][data-day="${yesterday}"]`).click(); await p.waitForTimeout(700);
await td().locator('[data-testid=td-who]').selectOption('u-nina'); await p.waitForTimeout(300);
check(await td().locator('[data-testid=td-row]').count() === 1 && (await td().locator('[data-testid=td-row]').innerText()).includes('08:00–12:00'), '3) Nina : sa ligne d’hier (08:00–12:00) est là');
await td().locator('[data-testid=td-add]').click(); await p.waitForTimeout(300);
await td().locator('[data-testid=td-site]').selectOption('w1'); await p.waitForTimeout(200);
check(await td().locator('[data-testid=td-will-correct]').count() === 1, '3) même chantier choisi : « elle sera corrigée, pas doublée »');
await p.fill('[data-testid=td-start]', '08:00'); await p.keyboard.press('Tab');
await p.fill('[data-testid=td-end]', '13h'); await p.keyboard.press('Tab'); await p.waitForTimeout(200);
await td().locator('[data-testid=td-save]').click(); await p.waitForTimeout(1200);
check(callsTo('POST', '/rest/v1/time_entries').length === 0, '3) aucune 2e ligne créée');
const pt = callsTo('PATCH', '/rest/v1/time_entries');
check(pt.length === 1 && pt[0].search.includes('id=eq.n-1') && pt[0].body?.end_time === '13:00' && !('start_time' in pt[0].body), `3) la ligne existante est corrigée (fin 13:00, début inchangé) : ${JSON.stringify(pt[0]?.body)}`);
check(callsTo('POST', '/rest/v1/rpc/lead_send_entries').some((c) => JSON.stringify(c.body?.p_ids) === '["n-1"]'), '3) … puis envoyée au bureau');

// ═════ 4 · Journée envoyée : correction notifiée ; validée / chez le comptable : intouchable ═════
D.time_entries = [
  lucasEntry('l-sent', W1, '08:00', '16:00', { work_date: yesterday, status: 'submitted' }),
  lucasEntry('l-val', W2, '16:00', '18:00', { work_date: yesterday, status: 'validated' }),
  lucasEntry('l-lock', W3, '18:00', '19:00', { work_date: yesterday, status: 'submitted', locked: true }),
];
await open(); reset();
await td().locator(`[data-testid=td-day][data-day="${yesterday}"]`).click(); await p.waitForTimeout(700);
await td().locator('[data-testid=td-who]').selectOption('u-lucas'); await p.waitForTimeout(300);
const edits = td().locator('[data-testid=td-edit]');
check(await edits.count() === 3 && !(await edits.nth(0).isDisabled()) && await edits.nth(1).isDisabled() && await edits.nth(2).isDisabled(),
  '4) « Corriger » : possible sur l’envoyée, grisé sur la validée et sur celle chez le comptable');
await edits.nth(0).click(); await p.waitForTimeout(300);
await p.fill('[data-testid=td-end]', '17h'); await p.keyboard.press('Tab'); await p.waitForTimeout(200);
await td().locator('[data-testid=td-save]').click(); await p.waitForTimeout(1500);
const rpc = callsTo('POST', '/rest/v1/rpc/correct_time_entry');
check(rpc.length === 1 && rpc[0].body?.p_entry_id === 'l-sent' && rpc[0].body?.p_end === '17:00', `4) journée envoyée : correction par correct_time_entry (journal + salarié prévenu) ${JSON.stringify(rpc[0]?.body)}`);

// ═════ 4 bis · Ligne notée par le salarié sans l'envoyer : « Envoyer » ═════
D.time_entries = [lucasEntry('l-draft', W1, '08:00', '12:00', { work_date: yesterday })];
await open(); reset();
await td().locator(`[data-testid=td-day][data-day="${yesterday}"]`).click(); await p.waitForTimeout(700);
await td().locator('[data-testid=td-who]').selectOption('u-lucas'); await p.waitForTimeout(300);
await td().locator('[data-testid=td-send]').click(); await p.waitForTimeout(1200);
check(callsTo('POST', '/rest/v1/rpc/lead_send_entries').some((c) => JSON.stringify(c.body?.p_ids) === '["l-draft"]') && D.time_entries[0].status === 'submitted', '4 bis) brouillon du salarié : « Envoyer » l’envoie au bureau');
// Serveur pas encore à jour (migration absente) : noté, pas d'erreur rouge.
sendMode = 'absent';
D.time_entries = [];
await open(); reset();
await td().locator('[data-testid=td-who]').selectOption('u-nina'); await p.waitForTimeout(300);
await td().locator('[data-testid=td-add]').click(); await p.waitForTimeout(300);
await td().locator('[data-testid=td-site]').selectOption('w1');
await td().locator('[data-testid=td-save]').click(); await p.waitForTimeout(1200);
check((await bodyText()).includes('envoi au bureau bientôt disponible') && await p.locator('[data-sonner-toast][data-type="error"]').count() === 0, '4 bis) avant la migration : « noté », aucune erreur');
sendMode = 'ok';

// ═════ 5 · Le salarié ne voit rien de tout ça et saisit comme avant ═════
D.users[0].role = 'worker';
D.time_entries = [entry('k-1', W1, '08:00', '12:00')];
await open(); reset();
check(await td().count() === 0, '5) un salarié n’a pas « Mon équipe »');
await p.locator('.bt-send', { hasText: 'Envoyer ma journée' }).click(); await p.waitForTimeout(1200);
const c5 = p.locator('button:has-text("Confirmer l\'envoi")'); if (await c5.count()) { await c5.click(); await p.waitForTimeout(800); }
check(callsTo('PATCH', '/rest/v1/time_entries').some((c) => c.body?.status === 'submitted'), '5) il envoie sa journée comme avant');
D.users[0].role = 'lead';

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
