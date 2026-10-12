// Lot 12 — QR FIXE IMPRIMABLE + POSITION AU SCAN, dans un vrai navigateur.
// Lancer : npm run build, puis
//   node scripts/tests/qr-fixe-lot12.mjs out docs/captures-qr-fixe [port]
// Vraies pages /admin, /pointer et /poseur (export statique), base Supabase et
// fonction `kiosk` SIMULÉES (aucune vraie base, aucun réseau).
//
//  A) Bureau (fenêtre « Borne de pointage ») : section repliée « QR fixe à
//     imprimer », désactivée par défaut ; avertissement « moins sécurisé » ;
//     confirmation avec rappels RGPD / CSE / jurisprudence ; activer ; la ligne
//     fixe n'est jamais une « tablette » ; poser le point (refusé à ± 250 m,
//     position refusée, accepté à ± 12 m) ; rayon ; imprimer (feuille A4 :
//     entreprise, « QR fixe — moins sécurisé », date, référence) ; régénérer ;
//     désactiver ; « Déconnecter la tablette » ne touche pas au QR fixe ;
//     390 px sans défilement horizontal ; migration absente → rien ne change.
//     L'avertissement dit que la position est déclarée par le téléphone et peut
//     être falsifiée (un frein, pas une preuve) ; « Scannez la tablette » n'est
//     dit que s'il y a une tablette ; derniers pointages « dans la zone : oui »
//     lisibles par le bureau ; borne COUPÉE : on peut encore désactiver et
//     régénérer le QR fixe (Réglages → Borne & pointage), pas l'activer.
//  B) Salarié (/pointer#f=…) : écran d'information RGPD avant le premier scan
//     DE CE COMPTE (un collègue sur le même téléphone le voit à son tour ;
//     aucune position lue avant « Continuer ») ; scan accepté dans la zone
//     (UNE lecture, jamais en continu) ; refusé hors zone ; localisation
//     refusée ; « Je refuse » ; migration absente ; QR de la tablette toujours
//     sans position ; le scanner de l'appli ouvre le QR fixe.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import('playwright-core')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs'));
const [,, OUT = 'out', SH = 'docs/captures-qr-fixe', PORT_ARG = '0'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT_ARG), r));
const PORT = srv.address().port;
const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const frToday = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true };
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const COMPANY = { id: CO, name: 'Martin Menuiserie', ai_enabled: false, kiosk_enabled: true, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 };
const nowS = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwtFor = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: nowS + 36000, aal: 'aal1' })}.sig`;
const sessionFor = (sub, email) => ({ access_token: jwtFor(sub), refresh_token: 'r', expires_at: nowS + 36000, expires_in: 36000, token_type: 'bearer', user: { id: sub, email, aud: 'authenticated', role: 'authenticated' } });
const AUTH_KEY = 'sb-sdperbcquvneohotjono-auth-token';
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k];
      if (op === 'eq') return String(cur) === val;
      if (op === 'neq') return String(cur) !== val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      if (op === 'gte') return String(cur) >= val;
      if (op === 'lte') return String(cur) <= val;
      if (op === 'gt') return String(cur) > val;
      if (op === 'lt') return String(cur) < val;
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      if (op === 'not') return val === 'is.null' ? cur != null : true;
      return true;
    });
  }
  return rows;
};
// Le dépôt fictif : 45,7578 N / 4,8320 E (1 m vers le nord ≈ 1 / 111 195 degré).
const REF = { lat: 45.7578, lng: 4.832 };
const north = (m) => REF.lat + m / 111195;
const haversine = (a, c) => { const R = 6371008.8, rad = Math.PI / 180; const h = Math.sin((c.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(c.lat * rad) * Math.sin((c.lng - a.lng) * rad / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const ALT = 'Scannez la tablette, ou ajoutez votre intervention à la main.';           // entreprise avec une tablette reliée
const ALT_SANS = 'Ajoutez votre intervention à la main.';                             // aucune tablette reliée
const ALT_NEUTRE = 'Ajoutez votre intervention à la main, ou scannez la tablette si votre entreprise en a une.'; // on ne sait pas

// ═══════════════════════════════════════════════════════════════════════════
// A) BUREAU
// ═══════════════════════════════════════════════════════════════════════════
const ADMIN_SESSION = sessionFor('u-admin', 'paul@exemple.fr');
/**
 * Une page /admin, base simulée. mode : 'ok' (migration passée), 'absent'
 * (fonction neuve, migration pas passée), 'old' (ancienne fonction : « Action inconnue »).
 */
async function adminPage({ width = 1440, height = 900, isMobile = false, mode = 'ok', kiosks = [], geo = null, borneCut = false, recent = [] } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 2 : 1 });
  if (geo) { await ctx.grantPermissions(['geolocation'], { origin: BASE }); await ctx.setGeolocation(geo); }
  const state = {
    D: {
      users: [u('u-admin', 'Paul', 'Martin', 'admin'), u('u-kevin', 'Kevin', 'Roussel')], companies: [{ ...COMPANY, kiosk_enabled: !borneCut }], worksites: [W1, AUTRE],
      planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [],
      kiosks: kiosks.map((k) => ({ company_id: CO, revoked_at: null, kind: 'tablette', ...k })), kiosk_settings: [],
    },
    fn: [], restWrites: 0, n: 0,
    fx: { enabled: false, id: null, token: null, ref: null, created_at: null, point: { set: false, accuracy_m: null, at: null }, radius: 200, recent },
  };
  const status = () => {
    const f = state.fx;
    return { available: true, enabled: f.enabled, kiosk_enabled: !borneCut, has_tablet: state.D.kiosks.some((k) => k.kind === 'tablette' && !k.revoked_at),
      recent: f.recent, company_name: 'Martin Menuiserie', token: f.enabled ? f.token : null, ref: f.enabled ? f.ref : null,
      created_at: f.enabled ? f.created_at : null, last_used_at: null, uses_7d: f.enabled ? 3 : 0, point: f.point, radius_m: f.radius };
  };
  const newFixed = () => {
    const n = ++state.n;
    const id = `0f1e2d3c-4b5a-4968-8776-a5b4c3d2e${String(n).padStart(3, '0')}`;
    Object.assign(state.fx, { enabled: true, id, token: `${id}.${String.fromCharCode(64 + n).repeat(43)}`, ref: `E${String(n).padStart(3, '0')}`, created_at: new Date().toISOString() });
    state.D.kiosks.push({ id, company_id: CO, kind: 'fixe', revoked_at: null, created_at: new Date().toISOString(), last_seen_at: null });
  };
  const revokeFixed = () => { for (const k of state.D.kiosks) if (k.kind === 'fixe' && !k.revoked_at) k.revoked_at = new Date().toISOString(); state.fx.enabled = false; };
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [AUTH_KEY, JSON.stringify(ADMIN_SESSION)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: ADMIN_SESSION.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      state.fn.push(body);
      const a = body.action;
      if (a === 'create_pairing') return r.fulfill({ json: { code: '123456', expires_at: new Date(Date.now() + 600e3).toISOString(), pairing_id: 'pair-1' } });
      if (a === 'cancel_pairing') return r.fulfill({ json: { success: true, cancelled: 1 } });
      if (a === 'revoke') { const k = state.D.kiosks.find((x) => x.id === body.kiosk_id && !x.revoked_at); if (k) k.revoked_at = new Date().toISOString(); return r.fulfill({ json: { success: true, revoked: k ? 1 : 0 } }); }
      if (a === 'settings') return r.fulfill({ json: { success: true, settings: { show_planning: false, require_gps: false, active_from: null, active_until: null } } });
      if (a?.startsWith('fixed_')) {
        if (mode === 'old') return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
        if (mode === 'absent') return a === 'fixed_status' ? r.fulfill({ json: { available: false } }) : r.fulfill({ status: 409, json: { error: 'Le QR fixe n’est pas disponible pour l’instant.', code: 'fixed_unavailable' } });
        if (a === 'fixed_status') return r.fulfill({ json: status() });
        // Borne coupée par BEMEXO : comme la vraie fonction, seul couper (désactiver, régénérer) reste permis.
        if (borneCut && !['fixed_disable', 'fixed_regenerate'].includes(a)) return r.fulfill({ status: 403, json: { error: 'La borne est désactivée pour votre entreprise.', code: 'kiosk_disabled' } });
        if ((a === 'fixed_enable' || a === 'fixed_regenerate') && body.confirm !== true) return r.fulfill({ status: 400, json: { error: 'Confirmation requise.', code: 'confirm_required' } });
        if (a === 'fixed_enable') { if (!state.fx.enabled) newFixed(); return r.fulfill({ json: status() }); }
        if (a === 'fixed_regenerate') { revokeFixed(); newFixed(); return r.fulfill({ json: status() }); }
        if (a === 'fixed_disable') { revokeFixed(); return r.fulfill({ json: status() }); }
        if (a === 'fixed_point') {
          if (!(body.accuracy <= 100)) return r.fulfill({ status: 400, json: { error: 'Précision insuffisante : il faut 100 m ou mieux.', code: 'point_imprecise' } });
          state.fx.point = { set: true, accuracy_m: Math.round(body.accuracy), at: new Date().toISOString() };
          return r.fulfill({ json: status() });
        }
        if (a === 'fixed_radius') { state.fx.radius = body.radius_m; return r.fulfill({ json: status() }); }
      }
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', '');
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD') { state.restWrites++; return r.fulfill({ status: 201, json: {} }); }
    // Migration absente : la colonne kind n'existe pas (PostgREST : 42703).
    if (t === 'kiosks' && mode !== 'ok' && (url.searchParams.get('select') || '').includes('kind')) {
      return r.fulfill({ status: 400, json: { code: '42703', message: 'column kiosks.kind does not exist', details: null, hint: null } });
    }
    let rows = filterRows(state.D[t] || [], url.searchParams);
    if (t === 'kiosks' && mode !== 'ok') rows = rows.map(({ kind, ...rest }) => rest);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`${BASE}/admin`);
  await p.waitForSelector('[data-testid=bar-kiosk], .bt-pl-m-ibtn, .bt-pl-acct', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const calls = (action) => state.fn.filter((c) => c.action === action);
  return { ctx, p, state, calls };
}
const openDialog = async (p) => { await p.click('[data-testid=bar-kiosk]'); await p.waitForTimeout(1200); };
const dialogText = (p) => p.locator('[role=dialog]').innerText().catch(() => '');
const kfText = (p) => p.locator('[data-testid=kf]').innerText().catch(() => '');
const statusText = (p) => p.locator('[data-testid=ka-status-text]').innerText().catch(() => '');
const shot = async (p, name, el = '[role=dialog]') => { await p.mouse.move(2, 2); await p.waitForTimeout(150); await p.locator(el).first().screenshot({ path: `${SH}/${name}` }); };

// ── A1 · désactivé par défaut, avertissement, confirmation, activer ──────────
{
  const iso0 = (min) => new Date(Date.now() - min * 60e3).toISOString();
  const RECENT = [{ name: 'Kevin Roussel', kind: 'arrival', at: iso0(35), in_zone: true }, { name: 'Lucas Petit', kind: 'departure', at: iso0(60 * 26), in_zone: true }];
  const { ctx, p, state, calls } = await adminPage({ height: 1100, geo: { latitude: REF.lat, longitude: REF.lng, accuracy: 250 }, recent: RECENT });
  await openDialog(p);
  check(await p.locator('[data-testid=kf]').count() === 1, 'A1) section « QR fixe à imprimer » présente (migration passée)');
  check(calls('fixed_status').length === 1, 'A1) un seul appel fixed_status à l’ouverture');
  check(/QR fixe à imprimer/.test(await kfText(p)) && (await p.locator('[data-testid=kf-badge]').innerText()).trim() === 'Désactivé', 'A1) repliée, badge « Désactivé » (désactivé par défaut)');
  check(await p.locator('[data-testid=kf-head]').getAttribute('aria-expanded') === 'false' && await p.locator('[data-testid=kf-warn]').count() === 0, 'A1) repliée : rien d’autre affiché');
  check((await statusText(p)).trim() === 'Aucune tablette reliée', 'A1) la tablette : rien ne change (« Aucune tablette reliée »)');
  await shot(p, 'bureau-1-section-repliee.png');
  await p.click('[data-testid=kf-head]'); await p.waitForTimeout(300);
  const warn = await p.locator('[data-testid=kf-warn]').innerText();
  check(/^Moins sécurisé :/.test(warn) && /une photo de ce QR permet de pointer/.test(warn) && /Le QR de la tablette, qui change chaque minute, reste disponible\./.test(warn), `A1) avertissement « Moins sécurisé : une photo de ce QR permet de pointer… Le QR de la tablette, qui change chaque minute, reste disponible. »`);
  check(/cette position est déclarée par le téléphone et peut être falsifiée/.test(warn) && /la zone est un frein, pas une preuve de présence/.test(warn), 'A1) l’avertissement dit la vérité : position déclarée par le téléphone, falsifiable, un frein et non une preuve');
  check(!/(vérifi|garanti|prouv)/i.test(warn.replace('pas une preuve de présence', '')), 'A1) l’avertissement ne promet aucune vérification ni garantie');
  check(/Aucune tablette n’est reliée/.test(await p.locator('[data-testid=kf-no-tablet]').innerText().catch(() => '')), 'A1) aucune tablette reliée : le bureau est prévenu (le QR fixe serait le seul pointage en direct)');
  await shot(p, 'bureau-2-avertissement.png');
  await p.click('[data-testid=kf-enable]'); await p.waitForTimeout(250);
  const conf = await p.locator('[data-testid=kf-confirm]').innerText();
  check(/registre RGPD/.test(conf) && /CSE s’il existe/.test(conf) && /Informez vos salariés/.test(conf), 'A1) confirmation : informer les salariés, registre RGPD, CSE s’il existe');
  check(/n’admet la géolocalisation .* que s’il n’existe pas d’autre moyen/.test(conf) && /la saisie à la main reste toujours proposée \(aucune tablette n’est reliée/.test(conf), 'A1) confirmation : la jurisprudence (la saisie à la main reste proposée ; aucune tablette reliée, dit sans détour)');
  check(/La zone est un frein, pas une preuve/.test(conf) && /déclarée par le téléphone du salarié et peut être falsifiée/.test(conf) && /« dans la zone : oui » ne prouve pas qu’il était sur place/.test(conf), 'A1) confirmation : la zone est un frein, pas une preuve (« dans la zone : oui » ne prouve rien)');
  check(/jamais en continu/.test(conf) && /Aucune coordonnée du salarié n’est gardée/.test(conf) && /premier scan de chaque compte/.test(conf), 'A1) confirmation : une lecture au scan, aucune coordonnée gardée, information à chaque compte');
  check(calls('fixed_enable').length === 0, 'A1) rien n’est activé avant « Oui, activer »');
  await shot(p, 'bureau-3-confirmation-rgpd.png');
  await p.click('[data-testid=kf-confirm-no]'); await p.waitForTimeout(200);
  check(calls('fixed_enable').length === 0 && await p.locator('[data-testid=kf-enable]').count() === 1, 'A1) « Annuler » : rien n’est activé');
  await p.click('[data-testid=kf-enable]'); await p.click('[data-testid=kf-confirm-yes]'); await p.waitForTimeout(700);
  check(calls('fixed_enable').length === 1 && calls('fixed_enable')[0].confirm === true, 'A1) « Oui, activer » : fixed_enable avec confirmation');
  check((await p.locator('[data-testid=kf-badge]').innerText()).trim() === 'Activé · réf. E001', 'A1) badge « Activé · réf. E001 »');
  const url = await p.locator('[data-testid=kf-qr]').getAttribute('data-url');
  check(url === `${BASE}/pointer#f=${state.fx.token}` && await p.locator('[data-testid=kf-qr] svg').count() === 1, `A1) QR : ${url?.slice(0, 60)}… (adresse du site en cours, jeton dans le fragment)`);
  check(/À poser une fois, depuis votre téléphone, à l’endroit où le QR sera affiché/.test(await p.locator('[data-testid=kf-point-state]').innerText()), 'A1) « Point de référence : à poser… » (obligatoire)');
  check(/3 pointages ces 7 derniers jours/.test(await p.locator('[data-testid=kf-meta]').innerText()), 'A1) usage visible : « 3 pointages ces 7 derniers jours »');
  check(await p.locator('[data-testid=kf-radius-200]').getAttribute('aria-pressed') === 'true', 'A1) rayon 200 m par défaut');
  await p.waitForTimeout(5600); // une relecture des tablettes (toutes les 5 s)
  check((await statusText(p)).trim() === 'Aucune tablette reliée' && calls('revoke').length === 0
    && await p.locator('[data-sonner-toast]', { hasText: 'Tablette reliée' }).count() === 0, 'A1) la ligne « fixe » n’est jamais prise pour une tablette (ni « Tablette reliée », ni déconnexion)');
  await shot(p, 'bureau-4-active-point-a-poser.png');
  check(state.restWrites === 0, `A1) aucune écriture directe en base (${state.restWrites})`);

  // ── A2 · poser le point : imprécis (on redemande), puis accepté ───────────
  const msgIs = (re) => p.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid=kf-point-msg]')?.textContent || ''), re.source, { timeout: 20000 }).catch(() => {});
  await p.click('[data-testid=kf-point]'); await msgIs(/Précision insuffisante/);
  const m1 = await p.locator('[data-testid=kf-point-msg]').innerText();
  check(/Précision insuffisante \(± 250 m\) : il faut 100 m ou mieux/.test(m1) && calls('fixed_point').length === 0, `A2) ± 250 m : « ${m1} » — rien d’envoyé, on redemande`);
  await shot(p, 'bureau-5-point-imprecis.png');
  await ctx.setGeolocation({ latitude: REF.lat, longitude: REF.lng, accuracy: 12 });
  await p.click('[data-testid=kf-point]'); await msgIs(/Point posé/);
  const fp = calls('fixed_point')[0] || {};
  check(calls('fixed_point').length === 1 && Math.abs(fp.lat - REF.lat) < 1e-6 && Math.abs(fp.lng - REF.lng) < 1e-6 && fp.accuracy === 12, `A2) ± 12 m : point envoyé à la fonction (${JSON.stringify(fp)})`);
  check(/✓ Point posé \(± 12 m\)/.test(await p.locator('[data-testid=kf-point-msg]').innerText()) && new RegExp(`Posé le ${frToday.replace(/\//g, '\\/')} à \\d\\d:\\d\\d \\(± 12 m\\)`).test(await p.locator('[data-testid=kf-point-state]').innerText()), 'A2) « Posé le jj/mm/aaaa à hh:mm (± 12 m) »');
  check((await p.locator('[data-testid=kf-point]').innerText()).trim() === 'Reposer le point ici', 'A2) le bouton devient « Reposer le point ici »');
  await shot(p, 'bureau-6-point-pose.png');
  // Les derniers pointages du QR fixe : « dans la zone : oui », lisible par le bureau, avec la réserve.
  check((await p.locator('[data-testid=kf-recent-sum]').innerText()).trim() === 'Derniers pointages avec ce QR (2)', 'A2) le bureau voit « Derniers pointages avec ce QR (2) »');
  await p.click('[data-testid=kf-recent-sum]'); await p.waitForTimeout(200);
  const recRows = await p.locator('[data-testid=kf-recent-row]').allInnerTexts();
  check(recRows.length === 2 && /^Kevin Roussel · arrivée · \d\d\/\d\d\/\d{4} à \d\d:\d\d · dans la zone : oui$/.test(recRows[0]) && /^Lucas Petit · départ · .* · dans la zone : oui$/.test(recRows[1]),
    `A2) « Kevin Roussel · arrivée · date à heure · dans la zone : oui » (${recRows[0]})`);
  const recNote = await p.locator('[data-testid=kf-recent-note]').innerText();
  check(/position déclarée par le téléphone/.test(recNote) && /ce n’est pas une preuve de présence/.test(recNote) && /Aucune coordonnée n’est gardée/.test(recNote), 'A2) la liste dit ce que vaut « dans la zone » : déclaré par le téléphone, pas une preuve, aucune coordonnée');
  check(!/\d{2}\.\d{3,}/.test(await p.locator('[data-testid=kf]').innerText()), 'A2) aucune coordonnée à l’écran');
  await shot(p, 'bureau-10-derniers-pointages.png');
  await p.click('[data-testid=kf-recent-sum]'); await p.waitForTimeout(150);
  await p.click('[data-testid=kf-radius-500]'); await p.waitForTimeout(500);
  check(calls('fixed_radius').at(-1)?.radius_m === 500 && await p.locator('[data-testid=kf-radius-500]').getAttribute('aria-pressed') === 'true', 'A2) rayon 500 m enregistré');
  await p.click('[data-testid=kf-radius-200]'); await p.waitForTimeout(500);

  // ── A3 · imprimer : feuille A4 dans une fenêtre à part ─────────────────────
  await p.evaluate(() => {
    const o = window.open.bind(window);
    window.__printed = 0;
    window.open = (...a) => { const w = o(...a); if (w) w.print = () => { window.__printed++; }; return w; };
  });
  const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('[data-testid=kf-print]')]);
  await pop.waitForLoadState().catch(() => {});
  await p.waitForTimeout(800);
  const sheet = await pop.evaluate(() => ({ text: document.body.innerText, url: document.querySelector('.qr')?.getAttribute('data-url'), svg: !!document.querySelector('.qr svg'), title: document.title }));
  check(/Martin Menuiserie/.test(sheet.text) && /QR fixe — moins sécurisé/.test(sheet.text), 'A3) feuille : nom de l’entreprise, « QR fixe — moins sécurisé »');
  check(sheet.text.includes(`Imprimé le ${frToday}`) && /Réf\. E001/.test(sheet.text), `A3) feuille : date (${frToday}) et référence courte (E001)`);
  check(sheet.svg && sheet.url === `${BASE}/pointer#f=${state.fx.token}`, 'A3) feuille : le QR du jeton actif');
  check(/Votre position est lue une seule fois, au moment du scan/.test(sheet.text) && /Vous pouvez refuser : ajoutez votre intervention à la main\./.test(sheet.text) && !/tablette/i.test(sheet.text.replace('QR fixe — moins sécurisé', '')), 'A3) feuille (aucune tablette reliée) : information position + seul autre moyen vrai, sans « tablette »');
  check(await p.evaluate(() => window.__printed) === 1, 'A3) la fenêtre d’impression s’ouvre (window.print)');
  await pop.setViewportSize({ width: 794, height: 1123 });
  await pop.screenshot({ path: `${SH}/bureau-7-impression-a4.png` });
  await pop.close();

  // ── A4 · régénérer (confirmation), désactiver (confirmation) ───────────────
  const oldUrl = await p.locator('[data-testid=kf-qr]').getAttribute('data-url');
  await p.click('[data-testid=kf-regen]'); await p.waitForTimeout(200);
  check(/L’ancien QR imprimé cessera aussitôt de marcher/.test(await p.locator('[data-testid=kf-regen-confirm]').innerText()) && calls('fixed_regenerate').length === 0, 'A4) « Régénérer… » : confirmation « L’ancien QR imprimé cessera aussitôt de marcher »');
  await shot(p, 'bureau-8-regenerer.png');
  await p.click('[data-testid=kf-regen-yes]'); await p.waitForTimeout(700);
  const newUrl = await p.locator('[data-testid=kf-qr]').getAttribute('data-url');
  check(calls('fixed_regenerate').length === 1 && calls('fixed_regenerate')[0].confirm === true && newUrl !== oldUrl && (await p.locator('[data-testid=kf-badge]').innerText()).includes('E002'), 'A4) régénéré : nouveau QR, nouvelle référence (E002)');
  check(/Posé le/.test(await p.locator('[data-testid=kf-point-state]').innerText()), 'A4) le point de référence est gardé');
  await p.click('[data-testid=kf-disable]'); await p.waitForTimeout(200);
  check(/Plus aucun pointage ne sera possible avec le QR imprimé/.test(await p.locator('[data-testid=kf-disable-confirm]').innerText()), 'A4) « Désactiver… » : confirmation');
  await p.locator('[data-testid=kf-disable-confirm] button', { hasText: 'Non' }).click(); await p.waitForTimeout(200);
  check(calls('fixed_disable').length === 0, 'A4) « Non » : rien n’est désactivé');
  await p.click('[data-testid=kf-disable]'); await p.click('[data-testid=kf-disable-yes]'); await p.waitForTimeout(700);
  check(calls('fixed_disable').length === 1 && (await p.locator('[data-testid=kf-badge]').innerText()).trim() === 'Désactivé' && await p.locator('[data-testid=kf-enable]').count() === 1, 'A4) désactivé : badge « Désactivé », « Activer le QR fixe… » revient');
  await shot(p, 'bureau-9-desactive.png');
  check(state.restWrites === 0, `A) aucune écriture directe en base (${state.restWrites})`);
  await ctx.close();
}

// ── A2 bis · localisation refusée sur le téléphone du bureau ───────────────
{
  const { ctx, p, state, calls } = await adminPage();
  state.fx.enabled = true; state.fx.id = 'f-actif'; state.fx.token = `0f1e2d3c-4b5a-4968-8776-a5b4c3d2e998.${'Y'.repeat(43)}`; state.fx.ref = 'E998';
  await openDialog(p);
  await p.click('[data-testid=kf-head]'); await p.waitForTimeout(200);
  await p.click('[data-testid=kf-point]');
  await p.waitForFunction(() => /indisponible/.test(document.querySelector('[data-testid=kf-point-msg]')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  check(/Position indisponible : autorisez la localisation/.test(await p.locator('[data-testid=kf-point-msg]').innerText()) && calls('fixed_point').length === 0, 'A2) localisation refusée : « Position indisponible… », rien d’envoyé');
  await ctx.close();
}

// ── A5 · « Déconnecter la tablette » ne touche pas au QR fixe ───────────────
{
  const iso = (min) => new Date(Date.now() - min * 60e3).toISOString();
  const { ctx, p, state, calls } = await adminPage({ kiosks: [{ id: 'k-tab', created_at: iso(3 * 24 * 60), last_seen_at: iso(3) }] });
  state.fx.enabled = true; state.fx.id = 'f-actif'; state.fx.token = `0f1e2d3c-4b5a-4968-8776-a5b4c3d2e999.${'Z'.repeat(43)}`; state.fx.ref = 'E999';
  state.D.kiosks.push({ id: 'f-actif', company_id: CO, kind: 'fixe', revoked_at: null, created_at: iso(1), last_seen_at: iso(0) });
  await openDialog(p);
  check((await statusText(p)).trim() === 'Tablette reliée — vue il y a 3 min', `A5) l’état suit la tablette, pas le QR fixe plus récent (${(await statusText(p)).trim()})`);
  await p.click('[data-testid=ka-disconnect]');
  await p.locator('[data-testid=ka-disconnect-confirm] button', { hasText: 'Oui, déconnecter' }).click();
  await p.waitForTimeout(1200);
  const rv = calls('revoke').map((c) => c.kiosk_id);
  check(JSON.stringify(rv) === JSON.stringify(['k-tab']), `A5) « Oui, déconnecter » : la tablette seulement (${rv.join(', ')}), le QR fixe reste actif`);
  check((await p.locator('[data-testid=kf-badge]').innerText()).includes('Activé'), 'A5) section QR fixe : toujours « Activé »');
  await ctx.close();
}

// ── A5 bis · AVEC une tablette reliée : « la tablette » est un vrai autre moyen ──
{
  const iso = (min) => new Date(Date.now() - min * 60e3).toISOString();
  const { ctx, p } = await adminPage({ kiosks: [{ id: 'k-tab', created_at: iso(3 * 24 * 60), last_seen_at: iso(3) }] });
  await openDialog(p);
  await p.click('[data-testid=kf-head]'); await p.waitForTimeout(250);
  check(await p.locator('[data-testid=kf-no-tablet]').count() === 0, 'A5 bis) tablette reliée : pas d’avertissement « aucune tablette »');
  await p.click('[data-testid=kf-enable]'); await p.waitForTimeout(250);
  const conf = await p.locator('[data-testid=kf-confirm]').innerText();
  check(/le QR de la tablette et la saisie à la main restent toujours proposés/.test(conf) && !/aucune tablette/i.test(conf), 'A5 bis) confirmation : « le QR de la tablette et la saisie à la main restent toujours proposés »');
  await p.click('[data-testid=kf-confirm-yes]'); await p.waitForTimeout(700);
  await p.evaluate(() => { const o = window.open.bind(window); window.open = (...a) => { const w = o(...a); if (w) w.print = () => {}; return w; }; });
  const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('[data-testid=kf-print]')]);
  await pop.waitForLoadState().catch(() => {}); await p.waitForTimeout(500);
  const txt = await pop.evaluate(() => document.body.innerText);
  check(/Vous pouvez refuser : scannez la tablette, ou ajoutez votre intervention à la main\./.test(txt), 'A5 bis) feuille (tablette reliée) : « scannez la tablette, ou ajoutez votre intervention à la main »');
  await pop.close(); await ctx.close();
}

// ── A8 · borne COUPÉE par BEMEXO : le bureau coupe encore le QR fixe (Réglages → Borne & pointage) ──
const openSettingsBorne = async (p) => {
  const desk = p.locator('.bt-pl-acct:visible'); const mob = p.locator('.bt-pl-m-ibtn[aria-label="Menu"]:visible');
  await desk.or(mob).first().waitFor({ timeout: 20000 });
  if (await desk.count()) await desk.first().click(); else await mob.first().click();
  await p.locator('button:visible', { hasText: "Réglages de l'entreprise" }).first().click();
  await p.waitForSelector('[role=dialog]:has(.bt-set) .bt-set', { timeout: 10000 });
  await p.waitForTimeout(900);
  const sec = p.locator('[data-testid=set-sec-borne] > h3 > button');
  if ((await sec.getAttribute('aria-expanded')) !== 'true') { await sec.click(); await p.waitForTimeout(400); }
};
{
  const iso = (min) => new Date(Date.now() - min * 60e3).toISOString();
  const { ctx, p, state, calls } = await adminPage({ borneCut: true, height: 1200, kiosks: [{ id: 'f-actif', kind: 'fixe', created_at: iso(60), last_seen_at: null }], recent: [{ name: 'Kevin Roussel', kind: 'arrival', at: iso(20 * 60), in_zone: true }] });
  Object.assign(state.fx, { enabled: true, id: 'f-actif', token: `0f1e2d3c-4b5a-4968-8776-a5b4c3d2e777.${'W'.repeat(43)}`, ref: 'E777', created_at: iso(60) });
  await openSettingsBorne(p);
  check(await p.locator('[data-testid=bar-kiosk], [data-testid=set-kiosk-open]').count() === 0, 'A8) borne coupée : ni bouton « Borne » ni « Relier la tablette » (comme avant)');
  check(await p.locator('[data-testid=kf]').count() === 1 && await p.locator('[data-testid=kf-head]').getAttribute('aria-expanded') === 'true', 'A8) mais le QR fixe encore actif est là, ouvert, dans Réglages → Borne & pointage');
  const cutTxt = await p.locator('[data-testid=kf-cut]').innerText();
  check(/La borne est coupée par BEMEXO/.test(cutTxt) && /ne marche pas pour l’instant/.test(cutTxt) && /désactiver ou le régénérer/.test(cutTxt) && /pas l’activer/.test(cutTxt), 'A8) message clair : borne coupée, le QR ne marche pas, on peut le désactiver ou le régénérer');
  const warnCut = await p.locator('[data-testid=kf-warn]').innerText();
  check(/un frein, pas une preuve de présence/.test(warnCut) && !/reste disponible/.test(warnCut), 'A8) borne coupée : l’avertissement reste honnête et ne promet plus « le QR de la tablette reste disponible »');
  check(await p.locator('[data-testid=kf-enable], [data-testid=kf-print], [data-testid=kf-point], [data-testid=kf-radius-200]').count() === 0, 'A8) ni « Activer », ni « Imprimer », ni point, ni rayon (la fonction les refuserait)');
  check(await p.locator('[data-testid=kf-regen]').count() === 1 && await p.locator('[data-testid=kf-disable]').count() === 1 && await p.locator('[data-testid=kf-recent]').count() === 1, 'A8) « Régénérer… », « Désactiver… » et les derniers pointages restent');
  await p.locator('[data-testid=kf]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  await p.locator('[role=dialog]:has(.bt-set)').screenshot({ path: `${SH}/bureau-11-borne-coupee-reglages.png` });
  await p.click('[data-testid=kf-regen]'); await p.click('[data-testid=kf-regen-yes]'); await p.waitForTimeout(700);
  check(calls('fixed_regenerate').length === 1 && calls('fixed_regenerate')[0].confirm === true && (await p.locator('[data-testid=kf-badge]').innerText()).includes('E001'), 'A8) borne coupée : « Régénérer » avec confirmation → nouveau QR (l’ancien photographié ne marche plus)');
  await p.click('[data-testid=kf-disable]'); await p.click('[data-testid=kf-disable-yes]'); await p.waitForTimeout(700);
  check(calls('fixed_disable').length === 1 && (await p.locator('[data-testid=kf-badge]').innerText()).trim() === 'Désactivé' && await p.locator('[data-testid=kf-enable]').count() === 0, 'A8) borne coupée : « Désactiver » → badge « Désactivé », pas de bouton « Activer »');
  check(calls('fixed_enable').length === 0 && state.restWrites === 0, 'A8) rien activé, aucune écriture directe en base');
  await ctx.close();
}
for (const [label, opts] of [['borne coupée, aucun QR fixe actif', { borneCut: true }], ['borne coupée, migration absente', { borneCut: true, mode: 'absent' }]]) {
  const { ctx, p } = await adminPage(opts);
  await openSettingsBorne(p);
  check(await p.locator('[data-testid=kf]').count() === 0 && await p.locator('[data-testid=set-sec-borne]').count() === 1, `A8) ${label} : rien de plus dans les réglages`);
  await ctx.close();
}

// ── A6 · téléphone 390 px : tout tient en largeur ──────────────────────────
{
  const m = await adminPage({ width: 390, height: 844, isMobile: true });
  m.state.fx.point = { set: true, accuracy_m: 9, at: new Date().toISOString() };
  await m.p.locator('.bt-pl-m-ibtn[aria-label="Menu"]').click().catch(() => {});
  await m.p.waitForTimeout(300);
  await m.p.locator('.bt-mm-item', { hasText: 'Borne' }).click().catch(() => {});
  await m.p.waitForTimeout(1200);
  await m.p.click('[data-testid=kf-head]').catch(() => {});
  await m.p.click('[data-testid=kf-enable]').catch(() => {});
  await m.p.click('[data-testid=kf-confirm-yes]').catch(() => {});
  await m.p.waitForTimeout(800);
  const sw = await m.p.locator('[role=dialog]').evaluate((d) => d.scrollWidth - d.clientWidth).catch(() => -1);
  check(sw >= 0 && sw <= 1 && await m.p.locator('[data-testid=kf-qr]').count() === 1, `A6) 390×844, QR fixe activé : aucun défilement horizontal (${sw})`);
  await m.p.locator('[data-testid=kf]').scrollIntoViewIfNeeded();
  await m.p.screenshot({ path: `${SH}/bureau-telephone-390x844.png` });
  await m.ctx.close();
}

// ── A7 · migration absente / ancienne fonction : la fenêtre reste celle d'avant ──
for (const mode of ['absent', 'old']) {
  const iso = (min) => new Date(Date.now() - min * 60e3).toISOString();
  const { ctx, p, state, calls } = await adminPage({ mode, kiosks: [{ id: 'k-tab', created_at: iso(60), last_seen_at: iso(2) }] });
  await openDialog(p);
  check(await p.locator('[data-testid=kf]').count() === 0 && !/QR fixe/.test(await dialogText(p)), `A7) ${mode === 'absent' ? 'migration absente' : 'ancienne fonction'} : aucune section « QR fixe »`);
  check((await statusText(p)).trim() === 'Tablette reliée — vue il y a 2 min', `A7) ${mode} : la tablette se lit comme avant (lecture sans « kind » si la colonne manque) (${(await statusText(p)).trim()})`);
  check(calls('fixed_enable').length === 0 && state.restWrites === 0, `A7) ${mode} : rien d’écrit`);
  if (mode === 'absent') await shot(p, 'bureau-sans-migration.png');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// B) SALARIÉ — /pointer#f=…
// ═══════════════════════════════════════════════════════════════════════════
const KARIM = sessionFor('u-karim', 'karim@exemple.fr');
const LEA = sessionFor('u-lea', 'lea@exemple.fr');
const INFO_KEY = (uid) => `bx_fixed_qr_info_v1:${uid}`;
const TOKEN = `0f1e2d3c-4b5a-4968-8776-a5b4c3d2e001.${'A'.repeat(43)}`;
/** Compte les lectures de position (une seule par scan ; jamais de suivi continu). */
const GEO_SPY = () => {
  window.__geo = 0; window.__watch = 0;
  const g = navigator.geolocation;
  if (!g) return;
  const orig = g.getCurrentPosition.bind(g);
  g.getCurrentPosition = (...a) => { window.__geo++; return orig(...a); };
  g.watchPosition = () => { window.__watch++; return 0; };
};
/**
 * Un téléphone. mode : 'ok' (migration passée) | 'absent' (migration pas passée).
 * geo : { lat, lng, accuracy } (localisation autorisée) ou null (refusée).
 */
async function phone({ session = KARIM, mode = 'ok', geo = { latitude: north(50), longitude: REF.lng, accuracy: 15 }, infoSeenFor = [], tablet = true, loginAs = KARIM } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  if (geo) { await ctx.grantPermissions(['geolocation'], { origin: BASE }); await ctx.setGeolocation(geo); }
  await ctx.addInitScript(GEO_SPY);
  // (try : la page vide about:blank n'a pas de localStorage.)
  if (session) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* about:blank */ } }, [AUTH_KEY, JSON.stringify(session)]);
  // L'écran d'information déjà lu sur ce téléphone, PAR CES COMPTES seulement.
  for (const uid of infoSeenFor) await ctx.addInitScript((k) => { try { localStorage.setItem(k, '1'); } catch { /* about:blank */ } }, INFO_KEY(uid));
  const fn = [];
  const st = { arrived: false };
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: (session || loginAs).user });
    if (url.pathname.startsWith('/auth/v1/token')) return r.fulfill({ json: loginAs }); // connexion e-mail + mot de passe
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      fn.push(body);
      const alt = tablet ? ALT : ALT_SANS;
      if (body.action === 'ticket' && body.f) {
        if (mode === 'absent') return r.fulfill({ status: 404, json: { error: `Le QR fixe n’est pas disponible pour l’instant. ${ALT_NEUTRE}`, code: 'fixed_unavailable' } });
        return r.fulfill({ json: { ticket: 'tk-fixe', kiosk_name: 'QR fixe', company_name: 'Martin Menuiserie', needs_gps: false, needs_position: true, radius_m: 200, has_tablet: tablet } });
      }
      if (body.action === 'ticket') return r.fulfill({ json: { ticket: 'tk-tab', kiosk_name: 'Borne', company_name: 'Martin Menuiserie', needs_gps: false } });
      if (body.action === 'punch') {
        const time = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date());
        if (body.ticket === 'tk-fixe') {
          // Le serveur décide (comme la vraie fonction) : position exigée, 200 m + marge.
          if (typeof body.lat !== 'number') return r.fulfill({ status: 403, json: { error: `Position non reçue (refusée ou introuvable). ${alt}`, code: 'position_missing' } });
          if (!(body.accuracy <= 150)) return r.fulfill({ status: 403, json: { error: `Position trop imprécise pour vérifier la zone. ${alt}`, code: 'position_imprecise' } });
          if (haversine(REF, { lat: body.lat, lng: body.lng }) > 200 + Math.min(body.accuracy, 100)) return r.fulfill({ status: 403, json: { error: `Vous êtes hors de la zone de ce QR. ${alt}`, code: 'out_of_zone' } });
        }
        const kind = st.arrived ? 'departure' : 'arrival';
        st.arrived = !st.arrived;
        return r.fulfill({ json: { kind, time, first_name: 'Karim', kiosk_name: body.ticket === 'tk-fixe' ? 'QR fixe' : 'Borne', worksite_name: 'Autre', range: kind === 'departure' ? { start: '07:30', end: time } : null } });
      }
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    return r.fulfill({ json: [] });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  return { ctx, p, fn };
}
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const punches = (fn) => fn.filter((c) => c.action === 'punch');

// ── B1 · premier scan : information RGPD, puis UNE lecture, dans la zone ────
{
  const { ctx, p, fn } = await phone();
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('[data-testid=fixed-info]', { timeout: 10000 }).catch(() => {});
  const info = await p.locator('[data-testid=fixed-info]').innerText().catch(() => '');
  check(/Ce QR demande votre position/.test(info), 'B1) premier scan d’un QR fixe : écran d’information avant tout');
  check(/Pourquoi \?/.test(info) && /à moins de 200 m de l’entreprise/.test(info), 'B1) information : pourquoi (200 m autour de l’entreprise)');
  check(/Une seule lecture, au moment du scan\. Jamais en continu/.test(info), 'B1) information : une seule lecture au scan, jamais en continu');
  check(/Rien n’est gardé : ni coordonnées, ni trajet/.test(info) && /dans la zone : oui/.test(info), 'B1) information : rien n’est gardé (seulement « dans la zone : oui »)');
  check(/Vous pouvez refuser : scannez la tablette, ou ajoutez votre intervention à la main\./.test(info), 'B1) information : droit de refuser + autres moyens');
  check(fn.some((c) => c.action === 'ticket' && c.f === TOKEN) && punches(fn).length === 0, 'B1) le jeton (fragment) est vérifié ; aucun pointage avant « Continuer »');
  check(await p.evaluate(() => window.__geo) === 0, 'B1) aucune position lue avant « Continuer »');
  check(await p.evaluate(() => window.location.hash) === '' && await p.evaluate(() => window.location.pathname) === '/pointer', 'B1) le jeton est retiré de l’adresse (historique, partage)');
  await p.screenshot({ path: `${SH}/salarie-1-information-rgpd-390x844.png` });
  await p.click('[data-testid=fixed-info-ok]');
  await p.waitForSelector('text=Arrivée enregistrée', { timeout: 15000 }).catch(() => {});
  const pu = punches(fn)[0] || {};
  check(/Arrivée enregistrée/.test(await bodyText(p)), 'B1) 50 m du point (± 15 m) : « Arrivée enregistrée »');
  check(JSON.stringify(Object.keys(pu).sort()) === JSON.stringify(['accuracy', 'action', 'lat', 'lng', 'ticket']) && Math.abs(pu.lat - north(50)) < 1e-6 && pu.accuracy === 15, `B1) la position part AVEC le pointage, vérifiée par le serveur (${JSON.stringify(pu)})`);
  check(await p.evaluate(() => window.__geo) === 1 && await p.evaluate(() => window.__watch) === 0, 'B1) UNE seule lecture de position, aucun suivi continu');
  check(await p.evaluate((k) => localStorage.getItem(k), INFO_KEY('u-karim')) === '1' && await p.evaluate(() => localStorage.getItem('bx_fixed_qr_info_v1')) === null, 'B1) information lue : retenue pour CE COMPTE (clé par salarié, pas une clé du téléphone)');
  await p.screenshot({ path: `${SH}/salarie-2-arrivee-dans-la-zone-390x844.png` });
  // Deuxième scan (départ) : plus d'écran d'information, une lecture de plus.
  await p.goto('about:blank');
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('text=Départ enregistré', { timeout: 15000 }).catch(() => {});
  check(/Départ enregistré/.test(await bodyText(p)) && await p.locator('[data-testid=fixed-info]').count() === 0, 'B1) scan suivant : directement « Départ enregistré », sans réafficher l’information');
  check(await p.evaluate(() => window.__geo) === 1, 'B1) … une seule lecture pour ce scan aussi');
  await ctx.close();
}

// ── B2 · hors zone : refus clair, autres moyens ─────────────────────────────
{
  const { ctx, p, fn } = await phone({ infoSeenFor: ['u-karim'], geo: { latitude: north(2000), longitude: REF.lng, accuracy: 10 } });
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('[data-testid=fixed-refused]', { timeout: 15000 }).catch(() => {});
  const t = await bodyText(p);
  check(/Pointage non enregistré/.test(t) && /Vous êtes hors de la zone de ce QR\./.test(t) && t.includes(ALT), 'B2) 2 km : « Vous êtes hors de la zone de ce QR. Scannez la tablette, ou ajoutez votre intervention à la main. »');
  check(await p.locator('[data-testid=fixed-refused-manual]').getAttribute('href') === '/poseur', 'B2) bouton « Ajouter mon intervention à la main » → mon espace');
  check(await p.locator('[data-testid=fixed-refused-retry]').count() === 1, 'B2) « Réessayer » proposé');
  check(punches(fn).length === 1 && await p.evaluate(() => window.__geo) === 1, 'B2) une lecture, un essai, refusé par le serveur');
  await p.screenshot({ path: `${SH}/salarie-3-hors-zone-390x844.png` });
  await ctx.close();
}

// ── B3 · localisation refusée : rien n'est envoyé, autres moyens ────────────
{
  const { ctx, p, fn } = await phone({ infoSeenFor: ['u-karim'], geo: null });
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('[data-testid=fixed-refused]', { timeout: 20000 }).catch(() => {});
  const t = await bodyText(p);
  check(/Position non reçue \(refusée ou introuvable\)\./.test(t) && t.includes(ALT), 'B3) localisation refusée : « Position non reçue… Scannez la tablette, ou ajoutez votre intervention à la main. »');
  check(punches(fn).length === 0, 'B3) aucun pointage envoyé sans position');
  await p.screenshot({ path: `${SH}/salarie-4-localisation-refusee-390x844.png` });
  await ctx.close();
}

// ── B4 · « Je refuse » sur l'écran d'information ────────────────────────────
{
  const { ctx, p, fn } = await phone();
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('[data-testid=fixed-info]', { timeout: 10000 }).catch(() => {});
  await p.click('[data-testid=fixed-info-no]');
  await p.waitForTimeout(400);
  const t = await bodyText(p);
  check(/Votre position ne sera pas lue\./.test(t) && t.includes(ALT), 'B4) « Je refuse » : « Votre position ne sera pas lue. » + autres moyens');
  check(await p.evaluate(() => window.__geo) === 0 && punches(fn).length === 0, 'B4) aucune lecture de position, aucun pointage');
  check(await p.evaluate((k) => localStorage.getItem(k), INFO_KEY('u-karim')) === null, 'B4) l’information sera remontrée au prochain scan');
  await p.screenshot({ path: `${SH}/salarie-6-je-refuse-390x844.png` });
  await ctx.close();
}

// ── B5 · pas connecté : connexion d'abord (le ticket attend), PUIS l'information, PUIS la position ──
{
  const { ctx, p, fn } = await phone({ session: null });
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('text=Connectez-vous pour pointer', { timeout: 10000 }).catch(() => {});
  check(/Connectez-vous pour pointer/.test(await bodyText(p)) && await p.locator('[data-testid=fixed-info]').count() === 0, 'B5) non connecté : la connexion d’abord (on ne sait pas encore de quel compte il s’agit)');
  check(await p.evaluate(() => window.__geo) === 0 && punches(fn).length === 0, 'B5) … aucune position lue, aucun pointage');
  await p.fill('#kx-email', 'karim@exemple.fr'); await p.fill('#kx-pass', 'secret123'); await p.click('button[type=submit]');
  await p.waitForSelector('[data-testid=fixed-info]', { timeout: 10000 }).catch(() => {});
  check(await p.locator('[data-testid=fixed-info]').count() === 1 && await p.evaluate(() => window.__geo) === 0 && punches(fn).length === 0, 'B5) après la connexion : l’information de CE COMPTE, avant toute lecture de position');
  await p.click('[data-testid=fixed-info-ok]');
  await p.waitForSelector('text=Arrivée enregistrée', { timeout: 15000 }).catch(() => {});
  check(/Arrivée enregistrée/.test(await bodyText(p)) && await p.evaluate(() => window.__geo) === 1 && await p.evaluate((k) => localStorage.getItem(k), INFO_KEY('u-karim')) === '1', 'B5) « Continuer » : une lecture, pointage enregistré, information retenue pour ce compte');
  await ctx.close();
}

// ── B6 · migration absente ──────────────────────────────────────────────────
{
  const { ctx, p, fn } = await phone({ mode: 'absent' });
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('[data-testid=fixed-refused]', { timeout: 10000 }).catch(() => {});
  const t = await bodyText(p);
  check(/Le QR fixe n’est pas disponible pour l’instant\./.test(t) && t.includes(ALT_NEUTRE), 'B6) migration absente : « Le QR fixe n’est pas disponible pour l’instant. » + autres moyens (formule neutre : entreprise inconnue)');
  check(await p.evaluate(() => window.__geo) === 0 && punches(fn).length === 0 && await p.locator('[data-testid=fixed-info]').count() === 0, 'B6) ni information, ni position, ni pointage');
  await p.screenshot({ path: `${SH}/salarie-5-migration-absente-390x844.png` });
  await ctx.close();
}

// ── B7 · le QR de la tablette : jamais de position (inchangé) ───────────────
{
  const { ctx, p, fn } = await phone();
  await p.goto(`${BASE}/pointer?k=k-test&c=12345678`);
  await p.waitForSelector('text=Arrivée enregistrée', { timeout: 10000 }).catch(() => {});
  const pu = punches(fn)[0];
  check(/Arrivée enregistrée/.test(await bodyText(p)) && !!pu && JSON.stringify(Object.keys(pu).sort()) === JSON.stringify(['action', 'ticket']), `B7) QR de la tablette : pointage sans position (${JSON.stringify(pu || {})})`);
  check(await p.evaluate(() => window.__geo) === 0 && await p.locator('[data-testid=fixed-info]').count() === 0, 'B7) ni information, ni lecture de position');
  await ctx.close();
}

// ── B7 bis · un collègue sur LE MÊME TÉLÉPHONE : l'information est montrée à SON compte aussi ──
{
  // Karim a déjà lu l'information sur ce téléphone ; Léa se connecte ensuite.
  const { ctx, p, fn } = await phone({ session: LEA, loginAs: LEA, infoSeenFor: ['u-karim'] });
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('[data-testid=fixed-info]', { timeout: 10000 }).catch(() => {});
  check(await p.locator('[data-testid=fixed-info]').count() === 1, 'B9) autre compte sur le même téléphone : l’écran d’information s’affiche (la lecture de Karim ne vaut pas pour Léa)');
  check(await p.evaluate(() => window.__geo) === 0 && punches(fn).length === 0, 'B9) … aucune position de Léa lue avant son « Continuer »');
  await p.click('[data-testid=fixed-info-ok]');
  await p.waitForSelector('text=Arrivée enregistrée', { timeout: 15000 }).catch(() => {});
  check(/Arrivée enregistrée/.test(await bodyText(p)) && await p.evaluate(() => window.__geo) === 1, 'B9) Léa continue : une lecture, pointage enregistré');
  check(await p.evaluate((k) => localStorage.getItem(k), INFO_KEY('u-lea')) === '1' && await p.evaluate((k) => localStorage.getItem(k), INFO_KEY('u-karim')) === '1', 'B9) deux comptes, deux marques sur ce téléphone');
  await p.goto('about:blank');
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('text=Départ enregistré', { timeout: 15000 }).catch(() => {});
  check(/Départ enregistré/.test(await bodyText(p)) && await p.locator('[data-testid=fixed-info]').count() === 0, 'B9) Léa au scan suivant : plus d’écran d’information (retenu pour son compte)');
  await ctx.close();
}

// ── B10 · entreprise SANS tablette reliée : jamais « Scannez la tablette » ──
{
  const { ctx, p, fn } = await phone({ tablet: false, geo: { latitude: north(2000), longitude: REF.lng, accuracy: 10 } });
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('[data-testid=fixed-info]', { timeout: 10000 }).catch(() => {});
  const info = await p.locator('[data-testid=fixed-info]').innerText().catch(() => '');
  check(/Vous pouvez refuser : ajoutez votre intervention à la main\./.test(info) && !/tablette/i.test(info), 'B10) information, aucune tablette reliée : « Vous pouvez refuser : ajoutez votre intervention à la main. » (sans « tablette »)');
  check(/que le bureau peut lire/.test(info), 'B10) information : « dans la zone : oui », que le bureau peut lire');
  await p.screenshot({ path: `${SH}/salarie-7-sans-tablette-390x844.png` });
  await p.click('[data-testid=fixed-info-ok]');
  await p.waitForSelector('[data-testid=fixed-refused]', { timeout: 15000 }).catch(() => {});
  const t = await bodyText(p);
  check(t.includes(`Vous êtes hors de la zone de ce QR. ${ALT_SANS}`) && !/tablette/i.test(t), 'B10) hors zone : « … Ajoutez votre intervention à la main. », jamais « Scannez la tablette »');
  await ctx.close();
}
{
  const { ctx, p } = await phone({ tablet: false, infoSeenFor: ['u-karim'], geo: null });
  await p.goto(`${BASE}/pointer#f=${TOKEN}`);
  await p.waitForSelector('[data-testid=fixed-refused]', { timeout: 20000 }).catch(() => {});
  const t = await bodyText(p);
  check(t.includes(`Position non reçue (refusée ou introuvable). ${ALT_SANS}`) && !/tablette/i.test(t), 'B10) localisation refusée, aucune tablette : seul « Ajoutez votre intervention à la main. »');
  await ctx.close();
}

// ── B8 · le scanner de l'appli ouvre le QR fixe ─────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.addInitScript(([k, v, ik]) => { localStorage.setItem(k, v); localStorage.setItem(ik, '1'); }, [AUTH_KEY, JSON.stringify(KARIM), INFO_KEY('u-karim')]);
  await ctx.addInitScript((text) => {
    // Caméra simulée + lecteur de QR simulé : il « voit » le QR fixe imprimé.
    window.BarcodeDetector = class { async detect() { return [{ rawValue: text }]; } };
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => {
        const c = document.createElement('canvas'); c.width = 320; c.height = 240;
        const g = c.getContext('2d'); g.fillStyle = '#333'; g.fillRect(0, 0, 320, 240);
        setInterval(() => { g.fillStyle = `hsl(${Date.now() % 360},50%,50%)`; g.fillRect(0, 0, 20, 20); }, 100);
        return c.captureStream(10);
      };
    }
  }, `https://bemexo.com/pointer#f=${TOKEN}`);
  const fn = [];
  const D = {
    users: [{ ...u('u-karim', 'Karim', 'Benali'), email: 'karim@exemple.fr' }], companies: [{ ...COMPANY }], worksites: [W1, AUTRE],
    planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], documents: [], time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [],
  };
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: KARIM.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}'); fn.push(body);
      if (body.action === 'ticket') return r.fulfill({ status: 404, json: { error: `Le QR fixe n’est pas disponible pour l’instant. ${ALT_NEUTRE}`, code: 'fixed_unavailable' } });
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    // QR fixe actif : company_has_kiosk répond oui (la ligne « fixe » compte).
    if (url.pathname === '/rest/v1/rpc/company_has_kiosk') return r.fulfill({ json: true });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', '');
    const rows = filterRows(D[t] || [], url.searchParams);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`${BASE}/poseur`);
  await p.waitForSelector('[data-testid=scan-open]', { timeout: 20000 }).catch(() => {});
  check(await p.locator('[data-testid=scan-open]').count() === 1, 'B8) QR fixe actif (company_has_kiosk = oui) : l’icône du scanner s’affiche');
  await p.click('[data-testid=scan-open]');
  await p.waitForURL(/\/pointer/, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  check(fn.some((c) => c.action === 'ticket' && c.f === TOKEN), `B8) le scanner de l’appli lit le QR fixe et ouvre /pointer#f=… (ticket avec f : ${fn.some((c) => c.f === TOKEN)})`);
  await ctx.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
