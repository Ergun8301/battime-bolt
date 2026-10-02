// Lot 11 — la borne simplifiée (retour du vrai test du patron, points 1 à 4).
// Lancer : node scripts/tests/borne-lot11.mjs out docs/captures-lot11 (après npm run build).
//
//  A) Fenêtre « Borne de pointage » du bureau (vraie page /admin, base simulée) :
//     code à l'ouverture, renouvelé tout seul (page.clock), « Aucune tablette
//     reliée » / « Tablette reliée — vue il y a 3 min » (orange après 15 min),
//     nouvelle tablette → « Tablette reliée » + nouveau code + anciennes
//     déconnectées, « Déconnecter la tablette » → toutes les tablettes actives,
//     horaires enregistrés tout seuls, fermer périme le code ; ni liste, ni
//     « Ajouter une borne », ni lieu, ni nom, ni GPS ; pas de défilement
//     horizontal à 390 px.
//  B) Écran de la tablette : UNE barre fine (logo + entreprise même taille,
//     point de connexion, date + heure au centre, « QR » + icône plein écran à
//     droite), pas le mot « Borne », pas de 2e barre, planning jusqu'en bas ;
//     1280×800, 1024×768, 768×1024 (portrait) et 390×844. QR : retour au
//     planning après 30 s ou au toucher. Appui long → « Déconnecter » prévient
//     le serveur (unpair).
//  C) Relier : /borne?code=123456 → code pré-rempli, retiré de l'adresse, un
//     toucher « Relier » ; aucune demande de position.
//  D) /pointer : entreprise seule, aucune demande de position (même si une
//     ancienne fonction répond needs_gps: true).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import('playwright-core')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs'));
const [,, OUT = 'out', SH = 'docs/captures-lot11', PORT_ARG = '0'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT_ARG), r));
const PORT = srv.address().port;
const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const GEO_STUB = () => {
  window.__geo = 0;
  const g = { getCurrentPosition() { window.__geo++; }, watchPosition() { window.__geo++; return 1; }, clearWatch() {} };
  try { Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => g }); } catch { /* */ }
};

// ═══════════════════════════════════════════════════════════════════════════
// A) LA FENÊTRE « BORNE DE POINTAGE » DU BUREAU
// ═══════════════════════════════════════════════════════════════════════════
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const COMPANY = { id: CO, name: 'Martin Menuiserie', ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 };
const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwtFor = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
const sessionFor = (sub, email) => ({ access_token: jwtFor(sub), refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: sub, email, aud: 'authenticated', role: 'authenticated' } });
const ADMIN_SESSION = sessionFor('u-admin', 'paul@exemple.fr');
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
const CODES = ['123456', '654321', '246810', '135790', '112233', '445566', '778899', '102938', '564738', '918273'];

/** Une page /admin avec la base simulée ; `state` porte les tablettes et les appels à la fonction. */
async function adminPage({ width = 1440, height = 900, kiosks = [], isMobile = false } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile, hasTouch: isMobile });
  // Horloge simulée qui démarre maintenant (les données sont relatives à aujourd'hui).
  await ctx.clock.install({ time: new Date() });
  const state = {
    D: {
      users: [u('u-admin', 'Paul', 'Martin', 'admin'), u('u-kevin', 'Kevin', 'Roussel'), u('u-sara', 'Sara', 'Benali')],
      companies: [{ ...COMPANY }], worksites: [W1],
      planning: [{ id: 'pl1', company_id: CO, user_id: 'u-kevin', worksite_id: 'w1', work_date: today, absence_type: null, estimated_start: '08:00:00', estimated_end: '17:00:00', notes: null, created_at: `${today}T06:00:00Z`, worksite: W1 }],
      time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [],
      kiosks: kiosks.map((k) => ({ company_id: CO, revoked_at: null, ...k })), kiosk_settings: [],
    },
    fn: [], restWrites: 0, codeN: 0, offset: 0,
  };
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(ADMIN_SESSION)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: ADMIN_SESSION.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      state.fn.push(body);
      const browserNow = Date.now() + state.offset;
      if (body.action === 'create_pairing') {
        const n = state.codeN++;
        return r.fulfill({ json: { code: CODES[n % CODES.length], expires_at: new Date(browserNow + 600e3).toISOString(), pairing_id: `pair-${n + 1}` } });
      }
      if (body.action === 'cancel_pairing') return r.fulfill({ json: { success: true, cancelled: 1 } });
      if (body.action === 'revoke') {
        const k = state.D.kiosks.find((x) => x.id === body.kiosk_id && !x.revoked_at);
        if (k) k.revoked_at = new Date(browserNow).toISOString();
        return r.fulfill({ json: { success: true, revoked: k ? 1 : 0 } });
      }
      if (body.action === 'settings') return r.fulfill({ json: { success: true, settings: { show_planning: false, require_gps: false, active_from: body.active_from ?? null, active_until: body.active_until ?? null } } });
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', '');
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD') { state.restWrites++; console.log('   écriture REST', m, t); return r.fulfill({ status: 201, json: {} }); }
    const rows = filterRows(state.D[t] || [], url.searchParams);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`${BASE}/admin`);
  await p.waitForSelector('[data-testid=stat-waiting], .bt-pl-m-ibtn', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1500);
  /** Avance l'horloge du navigateur (et celle de la fonction simulée). */
  const ff = async (ms) => { state.offset += ms; await p.clock.fastForward(ms); await p.waitForTimeout(400); };
  const calls = (action) => state.fn.filter((c) => c.action === action);
  return { ctx, p, state, ff, calls };
}
const isoAgo = (min) => new Date(Date.now() - min * 60e3).toISOString();
const dialogText = (p) => p.locator('[role=dialog]').innerText().catch(() => '');
const codeText = (p) => p.locator('[data-testid=ka-code]').innerText().catch(() => '');
const statusText = (p) => p.locator('[data-testid=ka-status-text]').innerText().catch(() => '');
const dotClass = (p) => p.locator('[data-testid=ka-status] .ka-dot').getAttribute('class').catch(() => '');
const openDialog = async (p) => { await p.click('[data-testid=bar-kiosk]'); await p.waitForTimeout(900); };

// ── A1 · aucune tablette : code tout de suite, rien d'autre à régler ─────────
{
  const { ctx, p, state, ff, calls } = await adminPage();
  await openDialog(p);
  const txt = await dialogText(p);
  check(/Borne de pointage/.test(txt), 'A1) la fenêtre garde son titre « Borne de pointage »');
  check(/^\d{3} \d{3}$/.test((await codeText(p)).trim()) && (await codeText(p)).trim() === '123 456', `A1) le code à 6 chiffres s’affiche dès l’ouverture (« ${(await codeText(p)).trim()} »)`);
  check(calls('create_pairing').length === 1, `A1) un seul appel create_pairing à l’ouverture (${calls('create_pairing').length})`);
  const cp = calls('create_pairing')[0] || {};
  check(!('name' in cp) && !('worksite_id' in cp), `A1) ni nom ni lieu envoyés (${JSON.stringify(cp)})`);
  check(state.restWrites === 0, `A1) aucune écriture directe en base (${state.restWrites})`);
  check((await statusText(p)).trim() === 'Aucune tablette reliée', `A1) état « Aucune tablette reliée » (${(await statusText(p)).trim()})`);
  check(!/ka-dot (on|late)/.test(await dotClass(p)), 'A1) point gris');
  check(await p.locator('[data-testid=ka-disconnect]').count() === 0, 'A1) pas de « Déconnecter la tablette » sans tablette');
  const url = await p.locator('[data-testid=ka-qr]').getAttribute('data-url');
  check(url === `${BASE}/borne?code=123456` && await p.locator('[data-testid=ka-qr] svg').count() === 1, `A1) petit QR à côté du code → ${url}`);
  check(/bemexo\.com\/borne/.test(txt) && /tapez ce code/.test(txt), 'A1) « Sur la tablette, ouvrez bemexo.com/borne et tapez ce code. »');
  const gone = ['Ajouter une borne', 'Vos bornes', 'Créer le code', 'Lieu', 'Nom (', 'GPS', 'sur place', 'Enregistrer les options', 'Valable encore', 'Retirer'];
  check(gone.every((g) => !txt.includes(g)), `A1) plus de liste, d’« Ajouter une borne », de lieu, de nom, de GPS, de compte à rebours (${gone.filter((g) => txt.includes(g)).join(', ') || 'ok'})`);
  check(await p.locator('[role=dialog] select, [role=dialog] input[type=checkbox], [role=dialog] input[type=time]').count() === 0, 'A1) ni liste déroulante, ni case GPS, ni champ heure à roulette');
  check(/Horaires d.ouverture/.test(txt) && /facultatif/.test(txt) && /Toujours allumée/.test(txt), 'A1) « Horaires d’ouverture (facultatif) » + « Toujours allumée » gardés');
  check(await p.locator('[role=dialog] button', { hasText: /^Enregistrer/ }).count() === 0, 'A1) pas de bouton « Enregistrer » (enregistrement automatique)');
  await p.mouse.move(5, 5);
  await p.screenshot({ path: `${SH}/borne-admin-aucune-tablette-1440x900.png` });

  // ── A2 · renouvellement automatique ~1 min avant l'expiration ──────────────
  await ff(8 * 60e3);
  check(calls('create_pairing').length === 1 && (await codeText(p)).trim() === '123 456', 'A2) après 8 min : même code');
  await ff(60e3 + 2000);
  await p.waitForTimeout(500);
  check(calls('create_pairing').length === 2 && (await codeText(p)).trim() === '654 321', `A2) à 9 min : nouveau code tout seul (${(await codeText(p)).trim()})`);
  check(calls('cancel_pairing').some((c) => c.pairing_id === 'pair-1'), 'A2) l’ancien code est périmé (cancel_pairing)');
  check(await p.locator('[data-testid=ka-qr]').getAttribute('data-url') === `${BASE}/borne?code=654321`, 'A2) le QR suit le nouveau code');

  // ── A3 · horaires : enregistrés dès qu'ils sont complets ──────────────────
  await p.fill('[data-testid=ka-from]', '6h');
  await p.locator('[data-testid=ka-from]').press('Tab');
  await p.waitForTimeout(400);
  check(calls('settings').length === 0 && /Indiquez aussi l.heure de fermeture/.test(await p.locator('[data-testid=ka-save]').innerText()), 'A3) ouverture seule : rien n’est envoyé, « Indiquez aussi l’heure de fermeture. »');
  await p.fill('[data-testid=ka-until]', '20h');
  await p.locator('[data-testid=ka-until]').press('Tab');
  await p.waitForTimeout(600);
  const st = calls('settings').at(-1) || {};
  check(calls('settings').length === 1 && st.active_from === '06:00' && st.active_until === '20:00', `A3) « 6h » → « 20h » : enregistré tout seul (${JSON.stringify(st)})`);
  check(!('require_gps' in st), 'A3) plus de require_gps envoyé');
  check(/✓ Enregistré/.test(await p.locator('[data-testid=ka-save]').innerText()), 'A3) « ✓ Enregistré »');
  await p.mouse.move(5, 5);
  await p.screenshot({ path: `${SH}/borne-admin-horaires-1440x900.png` });
  await p.click('[data-testid=ka-always]');
  await p.waitForTimeout(600);
  const st2 = calls('settings').at(-1) || {};
  check(calls('settings').length === 2 && st2.active_from === null && st2.active_until === null && await p.locator('[data-testid=ka-always]').getAttribute('aria-pressed') === 'true', 'A3) « Toujours allumée » : horaires effacés, enregistrés');

  // ── A4 · fermer la fenêtre périme le code affiché ──────────────────────────
  const nCancel = calls('cancel_pairing').length;
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  check(await p.locator('[role=dialog]').count() === 0 && calls('cancel_pairing').length === nCancel + 1 && calls('cancel_pairing').at(-1).pairing_id === 'pair-2', 'A4) fermer la fenêtre : le code affiché est périmé');
  check(state.restWrites === 0, `A) aucune écriture directe en base (${state.restWrites})`);
  await ctx.close();
}

// ── A5 · tablette reliée : « vue il y a 3 min », orange après 15 min ────────
{
  const { ctx, p } = await adminPage({ kiosks: [{ id: 'k-old', created_at: isoAgo(3 * 24 * 60), last_seen_at: isoAgo(3) }] });
  await openDialog(p);
  check((await statusText(p)).trim() === 'Tablette reliée — vue il y a 3 min', `A5) « Tablette reliée — vue il y a 3 min » (${(await statusText(p)).trim()})`);
  check(/ka-dot on/.test(await dotClass(p)), 'A5) point vert');
  check(await p.locator('[data-testid=ka-disconnect]').innerText() === 'Déconnecter la tablette', 'A5) lien discret « Déconnecter la tablette »');
  await p.mouse.move(5, 5);
  await p.screenshot({ path: `${SH}/borne-admin-reliee-1440x900.png` });
  await ctx.close();
}
{
  const { ctx, p } = await adminPage({ kiosks: [{ id: 'k-old', created_at: isoAgo(3 * 24 * 60), last_seen_at: isoAgo(20) }] });
  await openDialog(p);
  check((await statusText(p)).trim() === 'Tablette reliée — vue il y a 20 min' && /ka-dot late/.test(await dotClass(p)), `A5) vue il y a 20 min → point orange (${(await statusText(p)).trim()})`);
  await ctx.close();
}

// ── A6 · une nouvelle tablette remplace l'ancienne ; « Déconnecter » ────────
{
  const { ctx, p, state, ff, calls } = await adminPage({
    kiosks: [
      { id: 'k-a', created_at: isoAgo(5 * 24 * 60), last_seen_at: isoAgo(60 * 30) },
      { id: 'k-b', created_at: isoAgo(2 * 24 * 60), last_seen_at: isoAgo(4) },
    ],
  });
  await openDialog(p);
  check((await statusText(p)).trim() === 'Tablette reliée — vue il y a 4 min', `A6) deux tablettes d’avant le lot 11 : l’état suit la plus récente (${(await statusText(p)).trim()})`);
  check(calls('revoke').length === 0, 'A6) ouvrir la fenêtre ne déconnecte rien');
  // La tablette tape le code : une nouvelle tablette apparaît.
  state.D.kiosks.push({ id: 'k-new', company_id: CO, revoked_at: null, created_at: new Date(Date.now() + state.offset).toISOString(), last_seen_at: new Date(Date.now() + state.offset).toISOString() });
  await ff(5200);
  await p.waitForTimeout(800);
  check(await p.locator('[data-sonner-toast]', { hasText: 'Tablette reliée' }).count() >= 1, 'A6) toast « Tablette reliée »');
  const rv = calls('revoke').map((c) => c.kiosk_id).sort();
  check(JSON.stringify(rv) === JSON.stringify(['k-a', 'k-b']), `A6) les anciennes tablettes sont déconnectées, la nouvelle reste (${rv.join(', ')})`);
  check(calls('create_pairing').length === 2 && (await codeText(p)).trim() === '654 321', 'A6) le code a servi : un nouveau code s’affiche');
  check((await statusText(p)).trim() === 'Tablette reliée — vue à l’instant', `A6) « Tablette reliée — vue à l’instant » (${(await statusText(p)).trim()})`);
  // Plusieurs tablettes encore actives (cas de la prod) : « Déconnecter » les retire toutes.
  state.D.kiosks.push({ id: 'k-x', company_id: CO, revoked_at: null, created_at: isoAgo(10), last_seen_at: isoAgo(10) });
  state.D.kiosks.push({ id: 'k-y', company_id: CO, revoked_at: null, created_at: isoAgo(9), last_seen_at: isoAgo(9) });
  await p.click('[data-testid=ka-disconnect]');
  await p.waitForTimeout(300);
  const conf = p.locator('[data-testid=ka-disconnect-confirm]');
  check(await conf.isVisible() && /Oui, déconnecter/.test(await conf.innerText()) && /Non/.test(await conf.innerText()), 'A6) « Déconnecter la tablette » → « Oui, déconnecter » / « Non »');
  await conf.locator('button', { hasText: 'Non' }).click();
  await p.waitForTimeout(200);
  check(await p.locator('[data-testid=ka-disconnect]').isVisible() && calls('revoke').length === 2, 'A6) « Non » : rien n’est déconnecté');
  await p.click('[data-testid=ka-disconnect]');
  await p.mouse.move(5, 5);
  await p.screenshot({ path: `${SH}/borne-admin-deconnecter-1440x900.png` });
  await p.locator('[data-testid=ka-disconnect-confirm] button', { hasText: 'Oui, déconnecter' }).click();
  await p.waitForTimeout(1200);
  const rv2 = calls('revoke').slice(2).map((c) => c.kiosk_id).sort();
  check(JSON.stringify(rv2) === JSON.stringify(['k-new', 'k-x', 'k-y']), `A6) « Oui, déconnecter » : toutes les tablettes actives (${rv2.join(', ')})`);
  check((await statusText(p)).trim() === 'Aucune tablette reliée' && await p.locator('[data-testid=ka-disconnect]').count() === 0, 'A6) puis « Aucune tablette reliée »');
  check(state.restWrites === 0, `A6) aucune écriture directe en base (${state.restWrites})`);
  await ctx.close();
}

// ── A7 · tablette (1024×768) et téléphone (390×844) : rien ne déborde ───────
{
  const { ctx, p } = await adminPage({ width: 1024, height: 768, kiosks: [{ id: 'k-old', created_at: isoAgo(3 * 24 * 60), last_seen_at: isoAgo(3) }] });
  await openDialog(p);
  const m = await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return { sw: d.scrollWidth, cw: d.clientWidth }; });
  check(m.sw <= m.cw + 1, `A7) 1024×768 : pas de défilement horizontal dans la fenêtre (${m.sw}/${m.cw})`);
  await p.mouse.move(5, 5);
  await p.screenshot({ path: `${SH}/borne-admin-1024x768.png` });
  await ctx.close();
}
{
  const { ctx, p } = await adminPage({ width: 390, height: 844, isMobile: true, kiosks: [{ id: 'k-old', created_at: isoAgo(3 * 24 * 60), last_seen_at: isoAgo(3) }] });
  await p.locator('.bt-pl-m-ibtn[aria-label=Menu]').first().click();
  await p.waitForTimeout(500);
  await p.click('[data-testid=mm-kiosk]');
  await p.waitForTimeout(1000);
  const m = await p.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    const over = [...d.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5); }).map((e) => e.className || e.tagName).slice(0, 5);
    return { sw: d.scrollWidth, cw: d.clientWidth, page: document.documentElement.scrollWidth <= window.innerWidth, over };
  });
  check(/\d{3} \d{3}/.test(await codeText(p)) && (await statusText(p)).includes('Tablette reliée'), 'A7) 390×844 (menu → Borne) : code et état affichés');
  check(m.sw <= m.cw + 1 && m.page && m.over.length === 0, `A7) 390×844 : aucun défilement horizontal ${JSON.stringify(m)}`);
  await p.screenshot({ path: `${SH}/borne-admin-390x844.png` });
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// B) L'ÉCRAN DE LA TABLETTE
// ═══════════════════════════════════════════════════════════════════════════
const NOW = new Date('2026-10-01T07:30:00Z'); // jeudi 09:30 à Paris
const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const W = [['Inès', 'Garnier', 4], ['Julie', 'Bernard', 1], ['Karim', 'Haddad', 3], ['Lucas', 'Petit', 0], ['Sofia', 'Moreau', 5], ['Thomas', 'Lefèvre', 2]];
const slots = [];
const S = (w, i, title, sub, hours, color, live = null) => slots.push({ w: `w${w}`, date: DAYS[i], title, sub, hours, color, live });
for (let i = 0; i < 5; i++) {
  S(0, i, i < 3 ? 'Salle de bains Roche' : 'École Jean Moulin', i < 3 ? 'Caluire-et-Cuire' : 'Bron', '08:00–17:00', i < 3 ? 6 : 2);
  if (i < 2) { S(1, i, 'Cuisine Martin', 'Villeurbanne', '08:00–12:00', 1); S(1, i, 'École Jean Moulin', 'Bron', '13:30–17:00', 2); }
  else S(1, i, 'Cuisine Martin', 'Villeurbanne', '08:00–17:00', 1);
  S(2, i, 'Villa Dupont', 'Lyon 6e', '07:30–16:30', 4, i === 3 ? '07:42' : null);
  S(3, i, 'École Jean Moulin', 'Bron', '07:30–16:00', 2);
  if (i === 4) S(3, i, 'Dépôt', 'Vénissieux', '16:30', 0);
  if (i !== 2) S(4, i, 'Villa Dupont', 'Lyon 6e', '08:00–17:00', 4);
  if (i < 4) S(5, i, 'Cuisine Martin', 'Villeurbanne', '07:00–15:30', 1);
}
const BOARD = {
  week_start: DAYS[0], today: DAYS[3], days: DAYS,
  workers: W.map(([f, l, t], i) => ({ k: `w${i}`, first_name: f, last_name: l, tint: t })),
  slots, absences: [{ w: 'w4', date: DAYS[2] }],
  live_extra: [{ w: 'w5', date: DAYS[3], title: 'Dépôt', since: '06:58' }],
};
const SETTINGS = { show_planning: true, require_gps: false, active_from: null, active_until: null };
const CACHE = { kioskId: 'k-test', token: 'jeton', seed: 'ZGVtby1ib3JuZS1iZW1leG8tbmUtcGFzLXV0aWxpc2Vy', companyName: 'Martin Menuiserie', kioskName: 'Entrée du dépôt', settings: SETTINGS, board: BOARD, boardAt: NOW.getTime(), syncedAt: NOW.getTime() };

async function tablet({ width = 1280, height = 800, cache = CACHE, isMobile = false, boardMode = 'ok' } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: isMobile, isMobile });
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(GEO_STUB);
  if (cache) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('init')) { localStorage.setItem(k, v); sessionStorage.setItem('init', '1'); } }, ['bx_kiosk_v1', JSON.stringify(cache)]);
  const fn = [];
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      fn.push(body);
      if (body.action === 'sync') return r.fulfill({ json: { revoked: false, kiosk_name: 'Borne', company_name: 'Martin Menuiserie', settings: SETTINGS, planning: [] } });
      if (body.action === 'board') return boardMode === 'ok' ? r.fulfill({ json: BOARD }) : r.fulfill({ status: 500, json: { error: 'Planning indisponible' } });
      if (body.action === 'unpair') return r.fulfill({ json: { success: true, revoked: true } });
      if (body.action === 'pair') {
        if (body.code !== '123456') return r.fulfill({ status: 400, json: { error: 'Code incorrect ou expiré.' } });
        return r.fulfill({ json: { kiosk_id: 'k-neuve', token: 'jeton-neuf', seed: CACHE.seed, step: 60, digits: 8, kiosk_name: 'Borne', company_name: 'Martin Menuiserie', settings: SETTINGS } });
      }
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    return r.fulfill({ json: {} });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  return { ctx, p, fn };
}

/** Mesures de la barre (positions, tailles, chevauchements). */
const measureBar = (p) => p.evaluate(async () => {
  await document.fonts.ready;
  const q = (s) => document.querySelector(s);
  const R = (e) => (e ? e.getBoundingClientRect() : null);
  const top = q('.kb .kb-grid > .kb-top'); const logo = q('[data-testid=kb-logo]'); const co = q('[data-testid=kb-company]');
  const dot = q('[data-testid=kb-online]'); const clock = q('.kb-top .kb-clock'); const date = q('[data-testid=kb-date]'); const time = q('[data-testid=kb-time]');
  const go = q('[data-testid=kb-pointer]'); const fsb = q('[data-testid=kb-fullscreen]'); const week = q('[data-testid=kb-week]');
  const rt = R(top), rl = R(logo), rc = R(co), rd = R(dot), rk = R(clock), rg = R(go), rf = R(fsb), rw = R(week);
  // Hauteur des capitales du nom (canvas, police chargée) ↔ lettres du logo (83 % de sa hauteur).
  const cs = getComputedStyle(co);
  const cv = document.createElement('canvas').getContext('2d');
  cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const capH = cv.measureText('MHE').actualBoundingBoxAscent;
  const ov = (a, c) => !!a && !!c && a.left < c.right - 0.5 && c.left < a.right - 0.5 && a.top < c.bottom - 0.5 && c.top < a.bottom - 0.5;
  const kb = q('.kb');
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    bars: document.querySelectorAll('.kb .kb-top').length,
    foot: document.querySelectorAll('.kb-foot, [data-testid=kb-kname], .kb-status').length,
    text: kb.innerText,
    barH: rt.height, barTop: rt.top, barBottom: rt.bottom,
    logoLeft: rl.left, logoH: rl.height, logoGlyphH: rl.height * 0.827, capH, coSize: parseFloat(cs.fontSize),
    logoMid: rl.top + rl.height / 2, coMid: rc.top + rc.height / 2,
    coRight: rc.right, coTrunc: co.scrollWidth > co.clientWidth + 1,
    dotRight: rd.right, dotBg: getComputedStyle(dot).backgroundColor, dotW: rd.width,
    clockMid: rk.left + rk.width / 2, clockLeft: rk.left, clockRight: rk.right,
    dateText: date.textContent, dateShown: getComputedStyle(date).display !== 'none' && R(date).width > 0, timeText: time.textContent,
    clockHasBoth: clock.contains(date) && clock.contains(time),
    timeSize: parseFloat(getComputedStyle(time).fontSize),
    goText: go.innerText.trim(), goLeft: rg.left, goRight: rg.right, goMid: rg.top + rg.height / 2,
    fs: !!fsb, fsText: fsb ? fsb.innerText.trim() : '', fsLabel: fsb?.getAttribute('aria-label') || '', fsW: rf?.width || 0, fsLeft: rf?.left ?? 9999, fsMid: rf ? rf.top + rf.height / 2 : 0,
    barMid: rt.top + rt.height / 2,
    overlaps: [ov(rc, rk), ov(rd, rk), ov(rk, rg), ov(rg, rf), ov(rl, rk)].filter(Boolean).length,
    weekTop: rw.top, weekBottom: rw.bottom,
    hscroll: document.documentElement.scrollWidth > window.innerWidth,
  };
});

for (const [w, h, mobile] of [[1280, 800, false], [1024, 768, false], [768, 1024, false], [390, 844, true]]) {
  const { ctx, p } = await tablet({ width: w, height: h, isMobile: mobile });
  await p.goto(`${BASE}/borne`);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(1000);
  const m = await measureBar(p);
  const tag = `B) ${w}×${h}`;
  check(m.bars === 1 && m.foot === 0, `${tag} : UNE seule barre, plus de 2e barre (pied, nom de borne, « Borne active ») (${m.bars} barre, ${m.foot} reste)`);
  check(!/borne/i.test(m.text), `${tag} : le mot « Borne » n’apparaît nulle part à l’écran`);
  check(m.barH <= 64 && m.barTop <= 10, `${tag} : barre fine (${Math.round(m.barH)} px) collée en haut`);
  check(m.logoLeft <= 16, `${tag} : logo BEMEXO à gauche (${Math.round(m.logoLeft)} px)`);
  const capRatio = m.capH / m.logoGlyphH;
  check(capRatio >= 0.85 && capRatio <= 1.2 && Math.abs(m.logoMid - m.coMid) <= 3, `${tag} : logo et nom de l’entreprise de même taille (capitales ${m.capH.toFixed(1)} px ↔ lettres du logo ${m.logoGlyphH.toFixed(1)} px, rapport ${capRatio.toFixed(2)}), alignés`);
  check(m.dotBg === 'rgb(47, 213, 132)' && m.dotW <= 10, `${tag} : petit point vert de connexion (${m.dotBg})`);
  check(Math.abs(m.clockMid - m.vw / 2) <= 2, `${tag} : date et heure au centre (${Math.round(m.clockMid)} / ${m.vw / 2})`);
  check(m.clockHasBoth && m.timeText === '09:30' && m.dateText === 'Jeudi 1 octobre', `${tag} : « Jeudi 1 octobre » + « 09:30 », toutes deux dans .kb-clock`);
  if (w > 600) check(m.dateShown && m.timeSize >= 22, `${tag} : date visible, heure bien lisible (${m.timeSize}px)`);
  else check(!m.dateShown && m.timeSize >= 20, `${tag} : téléphone : l’heure seule au centre (${m.timeSize}px)`);
  check(m.goText === 'QR' && m.goRight <= m.vw - 12 && m.goLeft > m.vw / 2, `${tag} : bouton « QR » à droite (« ${m.goText} »)`);
  check(m.fs && m.fsText === '' && m.fsLabel === 'Plein écran' && m.fsW <= 40 && m.fsLeft >= m.goRight + 2 && Math.abs(m.fsMid - m.barMid) <= 2, `${tag} : petite icône plein écran à droite du « QR », sans texte, centrée sur la barre (${Math.round(m.fsW)} px)`);
  check(m.overlaps === 0 && !m.hscroll, `${tag} : rien ne se chevauche, pas de défilement horizontal (${m.overlaps})`);
  check(m.weekTop - m.barBottom <= 12 && m.weekBottom >= m.vh - 14, `${tag} : le planning prend toute la place restante (${Math.round(m.weekTop)}→${Math.round(m.weekBottom)} / ${m.vh})`);
  if (w >= 768) check(!m.coTrunc, `${tag} : « Martin Menuiserie » en entier`);
  await p.screenshot({ path: `${SH}/borne-${w}x${h}.png` });
  await ctx.close();
}

// ── B2 · QR : retour au planning après 30 s ou au toucher ───────────────────
{
  const { ctx, p } = await tablet();
  await p.goto(`${BASE}/borne`);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(600);
  await p.click('[data-testid=kb-pointer]');
  await p.waitForTimeout(300);
  const ov = p.locator('[data-testid=kb-qr-overlay]');
  check(await ov.isVisible() && await p.locator('[data-testid=kb-qr-overlay] .kb-qr svg').count() === 1, 'B2) « QR » ouvre le QR en grand');
  const ovText = await ov.innerText();
  check(/retour automatique dans 30 s/.test(ovText) && !/borne/i.test(ovText), 'B2) « retour automatique dans 30 s », sans le mot « Borne »');
  check(await p.locator('[data-testid=kb-qr-overlay] .kb-top').count() === 1 && await p.locator('[data-testid=kb-qr-overlay] [data-testid=kb-pointer]').count() === 0, 'B2) même barre fine, sans le bouton « QR »');
  await p.screenshot({ path: `${SH}/borne-qr-1280x800.png` });
  await p.clock.fastForward(25_000);
  await p.waitForTimeout(200);
  check(await ov.isVisible(), 'B2) toujours affiché à 25 s');
  await p.clock.fastForward(6_000);
  await p.waitForTimeout(300);
  check(await ov.count() === 0 && await p.locator('[data-testid=kb-week]').isVisible(), 'B2) retour automatique au planning à 30 s');
  await p.click('[data-testid=kb-pointer]');
  await p.waitForTimeout(200);
  await p.mouse.click(400, 500);
  await p.waitForTimeout(200);
  check(await ov.count() === 0, 'B2) un toucher ramène au planning');
  // Hors ligne : le point passe à l'orange (avec une info-bulle).
  await ctx.setOffline(true);
  await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await p.waitForTimeout(300);
  const off = await p.evaluate(() => { const d = document.querySelector('[data-testid=kb-online]'); return { bg: getComputedStyle(d).backgroundColor, title: d.getAttribute('title') }; });
  check(off.bg === 'rgb(240, 145, 90)' && /Hors ligne/.test(off.title), `B2) hors ligne : point orange « ${off.title} »`);
  await ctx.setOffline(false);
  await ctx.close();
}

// ── B4 · planning ancien (relecture en échec) : son heure reste lisible ─────
{
  const { ctx, p } = await tablet({ width: 1024, height: 768, boardMode: 'err', cache: { ...CACHE, boardAt: NOW.getTime() - 5 * 60e3 } });
  await p.goto(`${BASE}/borne`);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const s = await p.evaluate(() => {
    const st = document.querySelector('.kb-top .kb-stamp'); const ck = document.querySelector('.kb-top .kb-clock');
    if (!st) return null;
    const a = st.getBoundingClientRect(); const c = ck.getBoundingClientRect(); const br = document.querySelector('[data-testid=kb-brand]').getBoundingClientRect();
    return { text: st.textContent, w: a.width, inside: a.right <= br.right + 0.5, clear: a.right < c.left };
  });
  check(!!s && /^Planning du 1 oct\. à 09:25$/.test(s.text) && s.w > 100 && s.inside && s.clear, `B4) planning de plus de 2 min : « ${s?.text} » lisible dans la barre, sans toucher l’heure`);
  check(await p.locator('[data-testid=bubble-live]').count() === 0, 'B4) et plus aucune pastille « en cours » (lot 9)');
  await p.screenshot({ path: `${SH}/borne-planning-ancien-1024x768.png` });
  await ctx.close();
}

// ── B3 · appui long 5 s sur le logo → « Déconnecter » prévient le serveur ───
{
  const { ctx, p, fn } = await tablet();
  await p.goto(`${BASE}/borne`);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(600);
  const br = await p.locator('[data-testid=kb-brand]').boundingBox();
  await p.mouse.move(br.x + 20, br.y + br.height / 2); await p.mouse.down();
  await p.clock.fastForward(2000); await p.mouse.up(); await p.clock.fastForward(4000);
  check(await p.locator('[data-testid=kb-unpair-confirm]').count() === 0, 'B3) appui court : rien');
  await p.mouse.down(); await p.clock.fastForward(5200); await p.waitForTimeout(150); await p.mouse.up();
  check(await p.locator('[data-testid=kb-unpair-confirm]').isVisible(), 'B3) appui long de 5 s sur le logo → confirmation');
  await p.click('text=Oui, déconnecter');
  await p.waitForTimeout(500);
  const up = fn.find((c) => c.action === 'unpair');
  check(!!up && up.kiosk_id === 'k-test' && up.token === 'jeton', `B3) « Oui, déconnecter » : la tablette prévient le serveur (unpair ${JSON.stringify(up || {})})`);
  check(await p.locator('[data-testid=kb-pairing]').isVisible() && await p.evaluate(() => localStorage.getItem('bx_kiosk_v1')) === null, 'B3) puis l’écran « Relier cette tablette », rien de gardé');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// C) RELIER : /borne?code=… (le QR de la fenêtre du bureau)
// ═══════════════════════════════════════════════════════════════════════════
{
  const { ctx, p, fn } = await tablet({ width: 1024, height: 768, cache: null });
  await p.goto(`${BASE}/borne?code=123456`);
  await p.waitForSelector('[data-testid=kb-pairing]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(400);
  const st = await p.evaluate(() => ({ v: document.querySelector('.kp-code').value, search: location.search, href: location.href, text: document.body.innerText }));
  check(st.v === '123456', `C) code pré-rempli depuis le QR (${st.v})`);
  check(st.search === '' && !/123456/.test(st.href), `C) code retiré de l’adresse (${st.href})`);
  check(/Relier cette tablette/.test(st.text) && /bouton 📟 Borne/.test(st.text), 'C) « Relier cette tablette », « … (bouton 📟 Borne) »');
  check(/Une seule tablette par entreprise : en relier une nouvelle déconnecte l.ancienne\./.test(st.text), 'C) « Une seule tablette par entreprise : en relier une nouvelle déconnecte l’ancienne. »');
  check(!/Réglages → Borne de pointage/.test(st.text), 'C) plus de « Réglages → Borne de pointage »');
  const btn = p.locator('.kp-btn');
  check((await btn.innerText()).trim() === 'Relier' && await btn.isEnabled(), 'C) un toucher : « Relier »');
  await p.screenshot({ path: `${SH}/borne-relier-1024x768.png` });
  await btn.click();
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 8000 }).catch(() => {});
  const pr = fn.find((c) => c.action === 'pair');
  check(!!pr && JSON.stringify(Object.keys(pr).sort()) === JSON.stringify(['action', 'code']) && pr.code === '123456', `C) « pair » n’envoie que le code, aucune position (${JSON.stringify(pr || {})})`);
  check(await p.evaluate(() => window.__geo) === 0, 'C) aucune demande de position à la tablette');
  check(await p.locator('[data-testid=kb-week]').isVisible(), 'C) reliée : le planning s’affiche');
  await ctx.close();
}
{
  const { ctx, p } = await tablet({ width: 390, height: 844, cache: null, isMobile: true });
  await p.goto(`${BASE}/borne?code=12ab`);
  await p.waitForSelector('[data-testid=kb-pairing]', { timeout: 10000 }).catch(() => {});
  const st = await p.evaluate(() => ({ v: document.querySelector('.kp-code').value, search: location.search }));
  check(st.v === '' && st.search === '', `C) code invalide dans l’adresse : ignoré et retiré (${JSON.stringify(st)})`);
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// D) /pointer : entreprise seule, jamais de position
// ═══════════════════════════════════════════════════════════════════════════
async function phone({ session = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile: true, hasTouch: true });
  await ctx.addInitScript(GEO_STUB);
  if (session) await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  const fn = [];
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return session ? r.fulfill({ json: session.user }) : r.fulfill({ status: 401, json: {} });
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      fn.push(body);
      // Une ANCIENNE fonction répondrait encore needs_gps: true : la page l'ignore.
      if (body.action === 'ticket') return r.fulfill({ json: { ticket: 'tk', kiosk_name: 'Borne', company_name: 'Martin Menuiserie', needs_gps: true } });
      if (body.action === 'punch') return r.fulfill({ json: { kind: 'arrival', time: '09:31', first_name: 'Karim', kiosk_name: 'Borne', worksite_name: 'Villa Dupont', range: null } });
    }
    return r.fulfill({ json: {} });
  });
  const p = await ctx.newPage();
  return { ctx, p, fn };
}
{
  const { ctx, p } = await phone();
  await p.goto(`${BASE}/pointer?k=k-test&c=12345678`);
  await p.waitForSelector('[data-testid=pointer-company]', { timeout: 8000 }).catch(() => {});
  const t = await p.evaluate(() => ({ co: document.querySelector('[data-testid=pointer-company]')?.textContent, body: document.body.innerText }));
  check(t.co === 'Martin Menuiserie' && !/·/.test(t.body) && !/borne/i.test(t.body), `D) connexion : l’entreprise seule (« ${t.co} »), sans « · Borne »`);
  await p.screenshot({ path: `${SH}/borne-pointer-connexion-390x844.png` });
  await ctx.close();
}
{
  const { ctx, p, fn } = await phone({ session: sessionFor('u-karim', 'karim@exemple.fr') });
  await p.goto(`${BASE}/pointer?k=k-test&c=12345678`);
  await p.waitForSelector('text=Arrivée enregistrée', { timeout: 8000 }).catch(() => {});
  const pu = fn.find((c) => c.action === 'punch');
  check(/Arrivée enregistrée/.test(await p.evaluate(() => document.body.innerText)), 'D) pointage enregistré');
  check(!!pu && JSON.stringify(Object.keys(pu).sort()) === JSON.stringify(['action', 'ticket']), `D) « punch » sans position (${JSON.stringify(pu || {})})`);
  check(await p.evaluate(() => window.__geo) === 0, 'D) aucune demande de position, même si needs_gps: true');
  await ctx.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
