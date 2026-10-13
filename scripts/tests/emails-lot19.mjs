// Lot 19 — « Envoyer par e-mail » (bureau) : la fenêtre components/staff-email-dialog.tsx.
// Lancer : node scripts/tests/emails-lot19.mjs out <dossier-captures> [port 42700-42799] (après npm run build).
// Cinq captures à 390 px ; CAPTURES_ECRAN_LARGE=1 ajoute deux captures à 1280 px (pas gardées dans le dépôt).
//
// VRAIES pages /admin (export statique), base Supabase ET fonction `send-staff-email` SIMULÉES
// (ctx.route) : AUCUN e-mail ne peut partir, aucune vraie base, aucune écriture.
//  1) rien au chargement : aucune requête vers la fonction ni vers le journal, ni jsPDF ;
//     à l'ouverture : UNE réponse de la fonction + UNE lecture du planning de la semaine ;
//  2) la liste : avec adresse / sans adresse / désabonné / aucune intervention, avec la raison écrite ;
//  3) planning : compteur « N e-mails aujourd'hui sur 50 », aperçu, confirmation EXPLICITE avant
//     l'envoi, un PDF VALIDE par salarié (%PDF…%%EOF, le nom du chantier dedans), jamais d'adresse
//     dans la requête, résultat par destinataire ;
//  4) message : 500 caractères, désabonné bloqué avec explication, requête sans adresse ;
//  5) plafond : « Limite quotidienne atteinte (50). Réessayez demain. », trop de destinataires choisis ;
//  6) refus / incertain / réseau coupé pendant l'envoi : dits en clair, jamais « envoyé » par erreur ;
//  7) fonction ou migration absente : message neutre, aucune erreur, boutons cachés ensuite ;
//  8) mode support : lecture seule, AUCUN appel ; 390 px : aucun défilement horizontal, boutons ≥ 44 px ;
//  9) le journal (« Derniers envois »).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import('playwright-core')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs'));
const [,, OUT = 'out', SH = 'docs/captures-emails-lot19', PORT_ARG = '42700'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT_ARG), r));
const BASE = `http://localhost:${srv.address().port}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

// ── Les gros fichiers (jsPDF) sont reconnus par leur contenu, comme site-rapide-lot5 ─────────────
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const JSPDF = walk(path.join(OUT, '_next', 'static', 'chunks')).filter((f) => f.endsWith('.js') && /jsPDF\.API/.test(fs.readFileSync(f, 'utf8'))).map((f) => '/' + path.relative(OUT, f).split(path.sep).join('/'));

// ── Données fictives ────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const NOW = new Date('2026-10-13T13:00:00Z'); // mardi 13 octobre 2026, 15 h à Paris : la semaine affichée commence le lundi 12
const MONDAY = '2026-10-12';
const COMPANY = { id: CO, name: 'Martin Menuiserie', email: 'bureau@martin-menuiserie.example.com', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, travel_paid: false };
const u = (id, first, last, role = 'worker', extra = {}) => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id.replace('u-', '')}@example.com`, is_active: true, created_at: '2026-01-01', ...extra });
const LONG_NAME = ['Jean-Christophe-Maximilien', 'de La Rochefoucauld-Montmorency'];
const USERS = [
  u('u-admin', 'Paul', 'Martin', 'admin'),
  u('u-lucas', 'Lucas', 'Petit'), u('u-nina', 'Nina', 'Roux', 'lead'), u('u-omar', 'Omar', 'Diallo'),
  u('u-sara', 'Sara', 'Benali'), u('u-kevin', 'Kevin', 'Roussel', 'worker', { email: '' }),
  u('u-long', LONG_NAME[0], LONG_NAME[1], 'worker', { email: 'jean-christophe-maximilien.delarochefoucauld-montmorency@entreprise-renovation-grand-lyon.example.com' }),
];
const WS = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', address: '12 rue des Lilas', postal_code: '69003', city: 'Lyon', is_active: true };
const WS2 = { id: 'w2', company_id: CO, client_name: 'Résidence Les Terrasses du Parc de la Tête d’Or — bâtiment C', address: '1234 avenue du Maréchal-de-Lattre-de-Tassigny', postal_code: '69370', city: 'Saint-Didier-au-Mont-d’Or', is_active: true };
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: '08:00:00', estimated_end: '12:00:00', notes: null, position: null, created_at: `${work_date}T06:00:00Z`, worksite: ws ?? null, ...extra });
const PLANNING = [
  slot('p1', 'u-lucas', '2026-10-12', WS), slot('p2', 'u-lucas', '2026-10-12', WS2, { estimated_start: '13:00:00', estimated_end: '17:00:00', notes: 'Prévoir l’échelle' }), slot('p3', 'u-lucas', '2026-10-14', WS, { estimated_start: '08:00:00', estimated_end: '17:00:00' }),
  slot('p4', 'u-nina', '2026-10-13', WS2), slot('p5', 'u-sara', '2026-10-14', WS), slot('p6', 'u-kevin', '2026-10-15', WS),
  slot('p7', 'u-long', '2026-10-12', WS2), slot('p8', 'u-long', '2026-10-16', null, { absence_type: 'conge', estimated_start: null, estimated_end: null }),
];
const LOG = [
  { id: 'l1', kind: 'planning-hebdo', user_id: 'u-lucas', recipient_mask: 'l***@example.com', status: 'sent', created_at: '2026-10-12T09:30:00Z' },
  { id: 'l2', kind: 'message-bureau', user_id: 'u-nina', recipient_mask: 'n***@example.com', status: 'uncertain', created_at: '2026-10-12T10:05:00Z' },
];
const nowS = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwtFor = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: nowS + 36000, aal: 'aal1' })}.sig`;
const SESSION = { access_token: jwtFor('u-admin'), refresh_token: 'r', expires_at: nowS + 36000, expires_in: 36000, token_type: 'bearer', user: { id: 'u-admin', email: 'paul@example.com', aud: 'authenticated', role: 'authenticated' } };
const AUTH_KEY = 'sb-sdperbcquvneohotjono-auth-token';
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true; const cur = x[k];
      if (op === 'eq') return String(cur) === val; if (op === 'neq') return String(cur) !== val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      if (op === 'gte') return cur != null && String(cur) >= val; if (op === 'lte') return cur != null && String(cur) <= val;
      if (op === 'gt') return cur != null && String(cur) > val; if (op === 'lt') return cur != null && String(cur) < val;
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val; return true;
    });
  }
  return rows;
};

/** L'état que renverrait la fonction : qui a une adresse, qui est désabonné, le compteur. */
const etatBody = (used = 3) => ({
  available: true, cap: 50, used, remaining: Math.max(0, 50 - used),
  workers: USERS.filter((x) => x.role !== 'admin').map((x) => ({ id: x.id, has_email: !!x.email, unsubscribed: { 'planning-hebdo': x.id === 'u-sara', 'message-bureau': x.id === 'u-sara' } })),
});
const OKMSG = 'Envoyé.';

/**
 * Le bureau. `fn` : comment la fonction simulée répond ; `etat` : 'ok' | 'missing' | 'unavailable' | 'network' | 'error' ;
 * `send` : 'ok' | 'cap' | 'uncertain' | 'failed' | 'network' | 'refused' ; `used` : compteur du jour.
 */
async function bureau({ width = 390, height = 844, isMobile = true, etat = 'ok', send = 'ok', used = 3, support = false, storedAbsent = false, log = LOG } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile, hasTouch: isMobile, serviceWorkers: 'block', acceptDownloads: false });
  await ctx.clock.install({ time: NOW });
  const S = { fn: [], reads: [], restWrites: 0, requests: [], etat, send, used, resend: 0, etatCalls: 0 };
  const D = { users: USERS, companies: [COMPANY], worksites: [WS, WS2], planning: PLANNING, time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], staff_email_log: log };
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [AUTH_KEY, JSON.stringify(SESSION)]);
  if (support) await ctx.addInitScript((v) => { sessionStorage.setItem('bemexo-support', JSON.stringify(v)); }, { staffId: 'u-admin', companyId: CO, name: 'Martin Menuiserie', expiresAt: '2030-01-01T10:00:00Z' });
  if (storedAbsent) await ctx.addInitScript(() => { sessionStorage.setItem('bemexo-emails-absents', '1'); });
  ctx.on('request', (r) => S.requests.push(new URL(r.url()).pathname));
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: SESSION.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/send-staff-email')) {
      const body = JSON.parse(r.request().postData() || '{}'); S.fn.push(body);
      if (body.action === 'etat') {
        S.etatCalls++;
        if (S.etat === 'missing') return r.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'Requested function was not found' } });
        if (S.etat === 'unavailable') return r.fulfill({ json: { available: false } });
        if (S.etat === 'network') { S.etat = 'ok'; return r.abort('failed'); }
        if (S.etat === 'error') return r.fulfill({ status: 403, json: { error: 'Réservé à l’administrateur de l’entreprise' } });
        return r.fulfill({ json: etatBody(S.used) });
      }
      const ids = body.action === 'planning' ? (body.items || []).map((i) => i.user_id) : (body.user_ids || []);
      if (S.send === 'network') return r.abort('failed');
      if (S.send === 'refused') return r.fulfill({ status: 400, json: { error: 'Message trop long (500 caractères au plus).' } });
      if (S.send === 'cap') {
        return r.fulfill({ status: 429, json: { success: false, error: 'Limite quotidienne atteinte (50). Réessayez demain.', kind: 'x', cap: 50, used: 50, remaining: 0, sent: 0,
          results: ids.map((id) => ({ user_id: id, outcome: 'skipped', reason: 'limite', message: 'Limite quotidienne atteinte (50). Réessayez demain.' })) } });
      }
      const out = ids.map((id, i) => {
        if (S.send === 'uncertain') return { user_id: id, outcome: 'uncertain', reason: 'incertain', message: 'Réponse du service d’e-mail perdue : l’e-mail est peut-être parti. Ne le renvoyez pas tout de suite.' };
        if (S.send === 'failed') return { user_id: id, outcome: 'failed', reason: 'refus-service', message: 'Refusé par le service d’e-mail : rien n’est parti.' };
        if (S.send === 'mixed' && i === 1) return { user_id: id, outcome: 'skipped', reason: 'doublon', message: 'Même contenu envoyé à cette personne il y a moins d’une minute : non renvoyé.' };
        return { user_id: id, outcome: 'sent', message: OKMSG };
      });
      const sent = out.filter((x) => x.outcome === 'sent').length;
      S.used += out.filter((x) => x.outcome === 'sent' || x.outcome === 'uncertain').length;
      return r.fulfill({ json: { success: true, kind: body.action, cap: 50, used: S.used, remaining: 50 - S.used, sent, results: out } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: url.pathname.endsWith('/support_enter') ? [{ name: 'Martin Menuiserie', expires_at: '2030-01-01T10:00:00Z' }] : [] });
    const t = url.pathname.replace('/rest/v1/', ''); const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD') { S.restWrites++; return r.fulfill({ status: 201, json: {} }); }
    S.reads.push({ t, search: url.search });
    const all = filterRows(D[t] || [], url.searchParams);
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : Infinity;
    let rows = all.slice(off, off + lim);
    if (t === 'staff_email_log') rows = [...rows].sort((a, c) => c.created_at.localeCompare(a.created_at));
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}` } });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { pageErrors.push(e.message); console.log('   [erreur page]', e.message); });
  await p.goto(`${BASE}/admin`);
  await p.locator('.bt-pl-acct, .bt-pl-m-ibtn[aria-label="Menu"]').filter({ visible: true }).first().waitFor({ timeout: 20000 });
  await sleep(1200); // au repos : la file de préchauffage a fini
  return { ctx, p, S, mobile: isMobile };
}
/** Ouvre la fenêtre comme le ferait le bureau (barre d'outils sur ordinateur, menu ☰ sur téléphone). */
async function openDialog(h) {
  const { p, mobile } = h;
  if (mobile) {
    await p.locator('.bt-pl-m-ibtn[aria-label="Menu"]').first().click(); await sleep(500);
    await p.click('[data-testid=mm-email]');
  } else { await p.click('.bt-pl-acct'); await p.click('[data-testid=menu-email]'); }
  await p.waitForSelector('[data-testid=staff-email-dialog]', { timeout: 10000 });
  await p.waitForFunction(() => !document.querySelector('[data-testid=em-loading]'), null, { timeout: 10000 }).catch(() => {});
  await sleep(500);
}
const dlg = (p) => p.locator('[data-testid=staff-email-dialog]');
const hscroll = (p) => p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d.scrollWidth - d.clientWidth <= 1 && document.documentElement.scrollWidth <= innerWidth; });
const txt = async (p, sel) => (await p.locator(sel).innerText()).replace(/\s+/g, ' ').trim();
const person = (id) => `[data-testid=em-person-${id}]`;
const sizes = (p, sel) => p.locator(sel).evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((e) => Math.round(e.getBoundingClientRect().height)));
const pick = async (p, ...ids) => { for (const id of ids) await p.locator(`${person(id)} label`).click(); };
const hasChunk = (S, list) => S.requests.some((r) => list.includes(r));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 1) rien au chargement ; à l’ouverture : une réponse de la fonction + une lecture du planning');
{
  const h = await bureau({ isMobile: false, width: 1280, height: 800 });
  const { p, S } = h;
  check(S.fn.length === 0 && !S.reads.some((r) => r.t === 'staff_email_log') && S.etatCalls === 0, '1) au chargement du bureau : AUCUNE requête vers la fonction ni vers le journal');
  check(!hasChunk(S, JSPDF), `1) au chargement : jsPDF n’est pas demandé (${JSPDF.length} fichier(s) reconnu(s) par leur contenu)`);
  check(await p.locator('[data-testid=bar-email]').count() === 0, '1) la barre d’outils n’a PAS un bouton de plus (elle tient déjà sur une ligne à 1280 px avec tous les boutons)');
  await p.click('.bt-pl-acct');
  check(await p.locator('[data-testid=menu-email]').isVisible() && /^Envoyer par e-mail$/.test(await txt(p, '[data-testid=menu-email]')), '1) l’entrée « Envoyer par e-mail » est dans le menu du compte (sous le nom de l’entreprise)');
  if (process.env.CAPTURES_ECRAN_LARGE) await p.screenshot({ path: `${SH}/emails-menu-compte-1280x800.png` });
  await p.keyboard.press('Escape'); await p.mouse.click(5, 400); await sleep(300);
  const readsBefore = S.reads.length; const planBefore = S.reads.filter((r) => r.t === 'planning').length;
  await openDialog(h);
  check(S.fn.length === 1 && S.fn[0].action === 'etat', `1) à l’ouverture : UNE requête à la fonction, l’état (${JSON.stringify(S.fn)})`);
  const planAfter = S.reads.filter((r) => r.t === 'planning').slice(planBefore);
  check(planAfter.length === 1 && /work_date=gte\.2026-10-12/.test(planAfter[0].search) && /work_date=lte\.2026-10-18/.test(planAfter[0].search), `1) … et UNE lecture du planning, de la semaine affichée (lun. 12 → dim. 18 oct.) : ${planAfter.length} lecture(s)`);
  check(S.reads.length - readsBefore === 1, `1) … rien d’autre n’est lu (${S.reads.slice(readsBefore).map((r) => r.t).join(', ')})`);
  check(S.restWrites === 0, '1) aucune écriture dans la base');
  check(await p.locator('[data-sonner-toast]').count() === 0, '1) aucun message flottant');
  await h.ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 2) la liste (téléphone 390 px) : adresse, sans adresse, désabonné, rien cette semaine');
{
  const h = await bureau();
  const { p, S } = h;
  await openDialog(h);
  const state = (id) => p.locator(person(id)).getAttribute('data-state');
  check([await state('u-lucas'), await state('u-nina'), await state('u-omar'), await state('u-sara'), await state('u-kevin'), await state('u-long')].join() === 'ok,ok,vide,desabonne,sans-adresse,ok', '2) Lucas, Nina et le salarié au nom long : sélectionnables ; Omar : rien cette semaine ; Sara : désabonnée ; Kevin : sans adresse');
  check(/désabonné/.test(await txt(p, person('u-sara'))) && /ne plus recevoir le planning par e-mail/.test(await txt(p, person('u-sara'))), '2) Sara : « désabonné » + la raison écrite');
  check(/sans adresse/.test(await txt(p, person('u-kevin'))) && /Pas d’adresse e-mail enregistrée/.test(await txt(p, person('u-kevin'))), '2) Kevin : « sans adresse » + la raison');
  check(/rien cette semaine/.test(await txt(p, person('u-omar'))) && /Aucune intervention prévue/.test(await txt(p, person('u-omar'))), '2) Omar : « rien cette semaine » + la raison');
  check(await p.locator(`${person('u-sara')} input`).isDisabled() && await p.locator(`${person('u-kevin')} input`).isDisabled() && await p.locator(`${person('u-omar')} input`).isDisabled(), '2) ces trois lignes ne se cochent pas');
  check(/Lucas Petit/.test(await txt(p, person('u-lucas'))) && /lucas@example\.com/.test(await txt(p, person('u-lucas'))) && /3 interv\./.test(await txt(p, person('u-lucas'))), '2) Lucas : son adresse (celle de sa fiche) et « 3 interv. » cette semaine');
  check((await txt(p, '[data-testid=em-counter]')).startsWith('3 e-mails aujourd’hui sur 50') && /il en reste 47/.test(await txt(p, '[data-testid=em-counter]')), `2) compteur : « ${await txt(p, '[data-testid=em-counter]')} »`);
  check(await hscroll(p), '2) 390 px : aucun défilement horizontal (noms et adresses très longs compris)');
  const hs = [...await sizes(p, '.bt-em-btn'), ...await sizes(p, '.bt-em-segbtn'), ...await sizes(p, '.bt-em-row')];
  check(hs.length >= 8 && hs.every((x) => x >= 44), `2) boutons et lignes cochables : 44 px au moins (${Math.min(...hs)} px le plus petit, sur ${hs.length})`);
  check(await p.locator('[data-testid=em-continue]').isDisabled() && /Choisissez au moins une personne/.test(await txt(p, '[data-testid=em-blocker]')), '2) « Continuer » est grisé et dit pourquoi : « Choisissez au moins une personne. »');
  check(/Tout sélectionner \(3\)/.test(await txt(p, '[data-testid=em-all]')), '2) « Tout sélectionner (3) » : seulement ceux qu’on peut contacter');
  // clavier : le focus se voit
  await p.locator('[data-testid=em-mode-message]').focus(); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab');
  const ring = await p.locator('[data-testid=em-mode-message]').evaluate((e) => { const c = getComputedStyle(e); return { w: parseFloat(c.outlineWidth), st: c.outlineStyle }; });
  check(ring.st !== 'none' && ring.w >= 2, `2) le focus au clavier se voit (contour ${ring.w} px)`);
  await p.evaluate(() => (document.activeElement)?.blur?.());
  await p.locator('[data-testid=staff-email-dialog]').evaluate((e) => { e.scrollTop = 0; });
  await p.screenshot({ path: `${SH}/emails-planning-390x844.png` });
  await h.ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 3) planning : aperçu, confirmation explicite, PDF valides, aucune adresse dans la requête');
{
  const h = await bureau({ isMobile: false, width: 1280, height: 800 });
  const { p, S } = h;
  await openDialog(h);
  await p.locator(`${person('u-lucas')} label`).click();
  check((await txt(p, '[data-testid=em-preview]')).includes('Bonjour Lucas,') && /Objet : \[Martin Menuiserie\] Votre planning de la semaine du 12 au 18 octobre 2026/.test(await txt(p, '[data-testid=em-preview]')) && /planning-semaine-2026-10-12\.pdf/.test(await txt(p, '[data-testid=em-preview]')), '3) aperçu : le prénom, l’objet avec la semaine, le nom du fichier joint');
  check(/lien « Se désabonner »/.test(await txt(p, '[data-testid=em-preview]')), '3) l’aperçu annonce le lien de désabonnement');
  await p.locator('[data-testid=em-all]').click();
  if (process.env.CAPTURES_ECRAN_LARGE) await p.screenshot({ path: `${SH}/emails-planning-1280x800.png` });
  check(await p.locator(`${person('u-lucas')} input`).isChecked() && await p.locator(`${person('u-nina')} input`).isChecked() && await p.locator(`${person('u-long')} input`).isChecked() && !(await p.locator(`${person('u-sara')} input`).isChecked()), '3) « Tout sélectionner » coche Lucas, Nina et le nom long — jamais Sara');
  await p.locator('[data-testid=em-continue]').click();
  await p.waitForSelector('[data-testid=em-confirm]');
  check(/Envoyer 3 e-mails \?/.test(await txt(p, '[data-testid=em-confirm]')) && /Lucas Petit/.test(await txt(p, '[data-testid=em-confirm]')) && /ne se rappelle pas/.test(await txt(p, '[data-testid=em-confirm]')), '3) confirmation explicite : « Envoyer 3 e-mails ? », les noms, « Un e-mail envoyé ne se rappelle pas »');
  check(S.fn.filter((x) => x.action !== 'etat').length === 0, '3) AVANT la confirmation : rien n’a été envoyé à la fonction');
  await p.locator('[data-testid=em-back]').click();
  check(await p.locator('[data-testid=em-confirm]').count() === 0 && await p.locator('[data-testid=em-continue]').isEnabled(), '3) « Retour » revient au choix, sans rien envoyer');
  await p.locator('[data-testid=em-continue]').click(); await p.waitForSelector('[data-testid=em-confirm]');
  await p.locator('[data-testid=em-send]').click();
  await p.waitForSelector('[data-testid=em-done]', { timeout: 15000 });
  const sends = S.fn.filter((x) => x.action === 'planning');
  check(sends.length === 1, '3) UNE seule requête d’envoi à la fonction');
  const body = sends[0];
  check(body.week_start === MONDAY && body.items.length === 3 && body.items.map((i) => i.user_id).sort().join() === ['u-lucas', 'u-nina', 'u-long'].sort().join(), '3) la requête porte la semaine et des identifiants de salariés');
  check(!/@/.test(JSON.stringify(body).replace(/"content_base64":"[^"]*"/g, '')), '3) … AUCUNE adresse e-mail dans la requête (le destinataire sera relu en base par la fonction)');
  check(body.items.every((i) => Object.keys(i).sort().join() === 'content_base64,mime,user_id' && i.mime === 'application/pdf'), '3) … chaque ligne = identifiant + type + PDF, rien d’autre (pas de nom de fichier, pas de destinataire)');
  const pdfs = body.items.map((i) => Buffer.from(i.content_base64, 'base64'));
  check(pdfs.every((x) => x.subarray(0, 5).toString() === '%PDF-' && x.subarray(-1024).toString('latin1').includes('%%EOF') && x.length > 1500 && x.length < 200000), `3) trois PDF VALIDES (signature, fin de fichier, ${pdfs.map((x) => `${Math.round(x.length / 1024)} ko`).join(', ')})`);
  const lucasPdf = pdfs[body.items.findIndex((i) => i.user_id === 'u-lucas')].toString('latin1');
  check(lucasPdf.includes('Lucas Petit') && lucasPdf.includes('Villa Dupont') && lucasPdf.includes('08:00') && lucasPdf.includes('Lyon') && !lucasPdf.includes('Benali'), '3) le PDF de Lucas contient SON planning (son nom, Villa Dupont, les horaires, Lyon) et celui de personne d’autre');
  const longPdf = pdfs[body.items.findIndex((i) => i.user_id === 'u-long')].toString('latin1');
  check(longPdf.includes('Conge') || longPdf.includes('Cong') , '3) le PDF du salarié au nom long montre son congé du vendredi');
  check(hasChunk(S, JSPDF), '3) jsPDF est arrivé à l’ouverture de la fenêtre (pas avant)');
  const res = await p.locator('[data-testid=em-results] li').evaluateAll((els) => els.map((e) => ({ o: e.getAttribute('data-outcome'), t: e.innerText.replace(/\s+/g, ' ') })));
  check(res.length === 3 && res.every((x) => x.o === 'sent' && /envoyé/.test(x.t)), `3) résultat par destinataire : trois « envoyé » (${res.map((x) => x.t.slice(0, 30)).join(' | ')})`);
  check(/3 envoyés · 0 ignoré · 0 refusé · 0 incertain · 6 aujourd’hui sur 50/.test(await txt(p, '[data-testid=em-summary]')), `3) résumé : « ${await txt(p, '[data-testid=em-summary]')} »`);
  check(S.restWrites === 0, '3) aucune écriture directe dans la base depuis le navigateur');
  await p.locator('[data-testid=em-new]').click();
  check(/6 e-mails aujourd’hui sur 50/.test(await txt(p, '[data-testid=em-counter]')) && !(await p.locator(`${person('u-lucas')} input`).isChecked()), '3) « Nouvel envoi » : compteur à jour (6), sélection vide');
  await h.ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 4) message : 500 caractères, désabonné bloqué avec explication, requête sans adresse');
{
  const h = await bureau({ send: 'mixed' });
  const { p, S } = h;
  await openDialog(h);
  await p.locator('[data-testid=em-mode-message]').click();
  check(/A demandé à ne plus recevoir les messages du bureau : le message n’est pas envoyé\. Contactez cette personne autrement\./.test(await txt(p, person('u-sara'))), '4) Sara (désabonnée) : « le message n’est pas envoyé. Contactez cette personne autrement. »');
  check(await p.locator(`${person('u-sara')} input`).isDisabled(), '4) … et on ne peut pas la cocher');
  check(await p.locator(`${person('u-omar')}`).getAttribute('data-state') === 'ok', '4) Omar (aucune intervention) peut recevoir un MESSAGE (le planning n’est pas en cause)');
  check(/Écrivez un message/.test(await txt(p, '[data-testid=em-blocker]')) || /Choisissez/.test(await txt(p, '[data-testid=em-blocker]')), '4) sans texte ni destinataire : « Continuer » grisé avec la raison');
  await p.locator('[data-testid=em-text]').fill('x'.repeat(501));
  check(/501\/500/.test(await txt(p, '[data-testid=em-count]')) && await p.locator('[data-testid=em-count].over').count() === 1, '4) 501 caractères : compteur « 501/500 » en rouge');
  await pick(p, 'u-lucas');
  check(await p.locator('[data-testid=em-continue]').isDisabled() && /Message trop long \(500 caractères au plus\)/.test(await txt(p, '[data-testid=em-blocker]')), '4) … « Message trop long (500 caractères au plus). » : envoi impossible');
  await p.locator('[data-testid=em-text]').fill('<b>Urgent</b> : réunion demain à 7 h 30.\n\nMerci de confirmer.');
  check(/\d+\/500/.test(await txt(p, '[data-testid=em-count]')), '4) texte valable : compteur normal');
  const prev = await txt(p, '[data-testid=em-preview]');
  check(prev.includes('<b>Urgent</b> : réunion demain à 7 h 30.') && prev.includes('Merci de confirmer.') && prev.includes('Bonjour Lucas,') && /\[Martin Menuiserie\] Message du bureau/.test(prev), '4) aperçu : le texte tel quel (les chevrons restent du texte), le modèle fixe, l’objet fixe');
  check(await p.locator('[data-testid=em-preview] b', { hasText: 'Urgent' }).count() === 0, '4) … le HTML du message n’est jamais interprété à l’écran');
  await pick(p, 'u-nina');
  await p.locator('[data-testid=em-text]').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await p.screenshot({ path: `${SH}/emails-message-390x844.png` });
  await p.locator('[data-testid=em-continue]').click(); await p.waitForSelector('[data-testid=em-confirm]'); await sleep(300);
  check(await p.locator('[data-testid=em-send]').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), '4) la confirmation se montre d’elle-même : le bouton « Envoyer 2 e-mails » est à l’écran sans défiler');
  await p.screenshot({ path: `${SH}/emails-confirmation-390x844.png` });
  await p.locator('[data-testid=em-send]').click(); await p.waitForSelector('[data-testid=em-done]', { timeout: 15000 });
  const msg = S.fn.filter((x) => x.action === 'message');
  check(msg.length === 1 && msg[0].user_ids.join() === 'u-lucas,u-nina' && msg[0].message.startsWith('<b>Urgent</b>'), '4) la requête : identifiants + texte');
  check(Object.keys(msg[0]).sort().join() === 'action,message,user_ids' && !/@/.test(JSON.stringify(msg[0])), '4) … et rien d’autre : aucune adresse, aucun destinataire, aucun objet');
  check(await p.locator('[data-testid=em-results] li[data-outcome=sent]').count() === 1 && await p.locator('[data-testid=em-results] li[data-outcome=skipped]').count() === 1, '4) résultat : un « envoyé », un « ignoré » (doublon)');
  check(/ignoré/.test(await txt(p, '[data-testid=em-results] li[data-outcome=skipped]')) && /moins d’une minute/.test(await txt(p, '[data-testid=em-results] li[data-outcome=skipped]')), '4) … avec la raison');
  await p.locator('[data-testid=staff-email-dialog]').evaluate((e) => { e.scrollTop = 0; });
  await p.screenshot({ path: `${SH}/emails-resultats-390x844.png` });
  await h.ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 5) plafond');
{
  const h = await bureau({ used: 50 });
  const { p, S } = h;
  await openDialog(h);
  check(/50 e-mails aujourd’hui sur 50/.test(await txt(p, '[data-testid=em-counter]')) && /Limite quotidienne atteinte \(50\)\. Réessayez demain\./.test(await txt(p, '[data-testid=em-counter]')), '5) 50 sur 50 : « Limite quotidienne atteinte (50). Réessayez demain. »');
  await pick(p, 'u-lucas');
  check(await p.locator('[data-testid=em-continue]').isDisabled() && /Limite quotidienne atteinte \(50\)\. Réessayez demain\./.test(await txt(p, '[data-testid=em-blocker]')), '5) « Continuer » est grisé, avec le même message');
  await p.locator('[data-testid=staff-email-dialog]').evaluate((e) => { e.scrollTop = 0; });
  await p.screenshot({ path: `${SH}/emails-plafond-390x844.png` });
  check(S.fn.filter((x) => x.action !== 'etat').length === 0, '5) rien n’a été envoyé');
  await h.ctx.close();
}
{
  const h = await bureau({ used: 48 });
  const { p } = h;
  await openDialog(h);
  await p.locator('[data-testid=em-all]').click();
  check(/Il reste 2 envois aujourd’hui : retirez 1 personne\./.test(await txt(p, '[data-testid=em-blocker]')) && await p.locator('[data-testid=em-continue]').isDisabled(), '5) 48 envois, 3 personnes choisies : « Il reste 2 envois aujourd’hui : retirez 1 personne. »');
  await p.locator(`${person('u-long')} label`).click();
  check(await p.locator('[data-testid=em-continue]').isEnabled(), '5) en retirer une : « Continuer » est possible');
  await h.ctx.close();
}
{
  // Le plafond atteint DEPUIS un autre onglet pendant que la fenêtre est ouverte : la fonction répond 429 avec ses résultats.
  const h = await bureau({ send: 'cap', used: 10 });
  const { p } = h;
  await openDialog(h);
  await pick(p, 'u-lucas');
  await p.locator('[data-testid=em-continue]').click(); await p.waitForSelector('[data-testid=em-confirm]'); await p.locator('[data-testid=em-send]').click();
  await p.waitForSelector('[data-testid=em-done]', { timeout: 15000 });
  check(/Limite quotidienne atteinte \(50\)\. Réessayez demain\./.test(await txt(p, '[data-testid=em-done]')) && await p.locator('[data-testid=em-results] li[data-outcome=skipped]').count() === 1, '5) réponse 429 de la fonction : le message du plafond et le résultat « ignoré » s’affichent');
  await h.ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 6) refus, incertain, réseau coupé');
for (const [send, label, outcome, re] of [['failed', 'refusé par le service', 'failed', /non envoyé/], ['uncertain', 'réponse perdue', 'uncertain', /Ne le renvoyez pas tout de suite/]]) {
  const h = await bureau({ send });
  const { p } = h;
  await openDialog(h);
  await pick(p, 'u-lucas');
  await p.locator('[data-testid=em-continue]').click(); await p.waitForSelector('[data-testid=em-confirm]'); await p.locator('[data-testid=em-send]').click();
  await p.waitForSelector('[data-testid=em-done]', { timeout: 15000 });
  const li = p.locator('[data-testid=em-results] li').first();
  check(await li.getAttribute('data-outcome') === outcome && re.test(await li.innerText()) && !/envoyé\b(?! )/.test((await li.innerText()).split('—')[1]?.split('\n')[0] || ''), `6) ${label} : « ${(await li.innerText()).replace(/\s+/g, ' ').slice(0, 90)} »`);
  check(!/(^| )3 envoyés|1 envoyé/.test(await txt(p, '[data-testid=em-summary]')), `6) ${label} : le résumé ne compte aucun « envoyé » (${await txt(p, '[data-testid=em-summary]')})`);
  await h.ctx.close();
}
{
  const h = await bureau({ send: 'network' });
  const { p } = h;
  await openDialog(h);
  await pick(p, 'u-lucas');
  await p.locator('[data-testid=em-continue]').click(); await p.waitForSelector('[data-testid=em-confirm]'); await p.locator('[data-testid=em-send]').click();
  await p.waitForSelector('[data-testid=em-banner]', { timeout: 15000 });
  check(/peut-être partis/.test(await txt(p, '[data-testid=em-banner]')) && /Derniers envois/.test(await txt(p, '[data-testid=em-banner]')), `6) connexion coupée pendant l’envoi : « ${await txt(p, '[data-testid=em-banner]')} »`);
  check(await p.locator('[data-testid=em-done]').count() === 0, '6) … aucun résultat inventé');
  await h.ctx.close();
}
{
  const h = await bureau({ send: 'refused' });
  const { p } = h;
  await openDialog(h);
  await pick(p, 'u-lucas');
  await p.locator('[data-testid=em-continue]').click(); await p.waitForSelector('[data-testid=em-confirm]'); await p.locator('[data-testid=em-send]').click();
  await p.waitForSelector('[data-testid=em-banner]', { timeout: 15000 });
  check(/Message trop long/.test(await txt(p, '[data-testid=em-banner]')) && await p.locator('[data-testid=em-continue]').isVisible(), '6) la fonction refuse (400) : son message s’affiche, on reste sur le choix');
  await h.ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 7) fonction ou migration absente : message neutre, aucune erreur, boutons cachés');
for (const [etat, label] of [['missing', 'fonction pas déployée (404)'], ['unavailable', 'migration pas appliquée (available:false)']]) {
  const h = await bureau({ etat, isMobile: false, width: 1280, height: 800 });
  const { p, S } = h;
  const err0 = pageErrors.length;
  await openDialog(h);
  check(await p.locator('[data-testid=em-unavailable]').isVisible() && /n’est pas encore activé/.test(await txt(p, '[data-testid=em-unavailable]')) && /Rien n’est parti et rien n’est à corriger/.test(await txt(p, '[data-testid=em-unavailable]')), `7) ${label} : message neutre`);
  check(await p.locator('[data-sonner-toast]').count() === 0 && await p.locator('[data-testid=staff-email-dialog] [role=alert]').count() === 0 && pageErrors.length === err0, '7) … aucun message d’erreur, aucune alerte, aucune erreur de page');
  check(await p.locator('[data-testid=em-continue]').count() === 0 && S.fn.length === 1, '7) … aucun envoi possible, UN seul appel (l’état)');
  await p.getByRole('button', { name: 'Fermer' }).first().click(); await sleep(500);
  await p.click('.bt-pl-acct');
  check(await p.locator('[data-testid=menu-email]').count() === 0, '7) après fermeture : l’entrée du menu du compte a disparu');
  await p.keyboard.press('Escape'); await p.mouse.click(5, 400);
  await p.reload(); await p.locator('.bt-pl-acct').first().waitFor({ timeout: 20000 }); await sleep(800);
  await p.click('.bt-pl-acct');
  check(await p.locator('[data-testid=menu-email]').count() === 0, '7) … et reste cachée après un rechargement dans le même onglet');
  await h.ctx.close();
}
{
  const h = await bureau({ etat: 'missing' });
  const { p } = h;
  await openDialog(h);
  await p.getByRole('button', { name: 'Fermer' }).first().click(); await sleep(500);
  await p.locator('.bt-pl-m-ibtn[aria-label="Menu"]').first().click(); await sleep(500);
  check(await p.locator('[data-testid=mm-email]').count() === 0 && await p.locator('[data-testid=mm-export]').count() === 1, '7) téléphone : l’entrée du menu ☰ disparaît aussi, les autres restent');
  await h.ctx.close();
}
{
  const h = await bureau({ storedAbsent: true, isMobile: false, width: 1280, height: 800 });
  await h.p.click('.bt-pl-acct');
  check(await h.p.locator('[data-testid=menu-email]').count() === 0, '7) onglet où la fonction a déjà été vue absente : entrée cachée dès le chargement');
  await h.ctx.close();
}
{
  const h = await bureau({ etat: 'network' });
  const { p, S } = h;
  await openDialog(h);
  check(/Impossible de joindre le serveur/.test(await txt(p, '[data-testid=em-error]')) && await p.locator('[data-testid=em-continue]').count() === 0, '7) réseau coupé à l’ouverture : message clair + « Réessayer » (ce n’est PAS « absent »)');
  await p.getByRole('button', { name: 'Réessayer' }).click(); await p.waitForSelector('[data-testid=em-counter]', { timeout: 10000 });
  check(S.etatCalls === 2, '7) « Réessayer » relit l’état (2 appels en tout)');
  await h.ctx.close();
}
{
  const h = await bureau({ etat: 'error' });
  const { p } = h;
  await openDialog(h);
  check(/Réservé à l’administrateur/.test(await txt(p, '[data-testid=em-error]')), '7) refus de la fonction (403) : son message est affiché');
  await h.ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 8) mode support : lecture seule, aucun appel');
{
  const h = await bureau({ support: true, isMobile: false, width: 1280, height: 800 });
  const { p, S } = h;
  const readsBefore = S.reads.length;
  await openDialog(h);
  check(await p.locator('[data-testid=em-support]').isVisible() && /Mode support : lecture seule\. Aucun e-mail ne peut partir/.test(await txt(p, '[data-testid=em-support]')), '8) mode support : « lecture seule. Aucun e-mail ne peut partir »');
  check(S.fn.length === 0 && S.reads.length === readsBefore, '8) AUCUN appel à la fonction, AUCUNE lecture à l’ouverture');
  check(await p.locator('[data-testid=em-continue]').count() === 0 && await p.locator('[data-testid=em-send]').count() === 0 && await p.locator('input[type=checkbox]').count() === 0, '8) pas de bouton d’envoi, pas de case à cocher');
  check(/Lucas Petit/.test(await txt(p, '[data-testid=em-support]')) && /sans adresse/.test(await txt(p, '[data-testid=em-support]')), '8) la liste des salariés reste lisible (avec adresse / sans adresse)');
  await h.ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 9) le journal');
{
  const h = await bureau();
  const { p, S } = h;
  await openDialog(h);
  check(!S.reads.some((r) => r.t === 'staff_email_log'), '9) le journal n’est pas lu à l’ouverture');
  await p.locator('[data-testid=em-log-open]').click(); await p.waitForSelector('[data-testid=em-log]');
  const items = await p.locator('[data-testid=em-log] li').allInnerTexts();
  check(items.length === 2 && /Message · Nina Roux · incertain/.test(items[0]) && /Planning · Lucas Petit · envoyé/.test(items[1]), `9) « Derniers envois » : ${items.map((x) => x.replace(/\s+/g, ' ')).join(' | ')}`);
  check(S.reads.filter((r) => r.t === 'staff_email_log').length === 1 && !/@example\.com/.test(items.join(' ')), '9) UNE lecture, sur demande ; seules des adresses masquées existent dans le journal');
  await h.ctx.close();
}

check(pageErrors.length === 0, `aucune erreur de page JavaScript (${pageErrors.slice(0, 2).join(' | ') || 'aucune'})`);
console.log(`\n${ok} vérifications réussies, ${ko} échec(s).`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
