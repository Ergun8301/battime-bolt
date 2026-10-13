// Lot 30 — « borne robuste » : la fenêtre « Borne » du bureau (components/kiosk-admin.tsx).
// Lancer : node scripts/tests/borne-robuste-bureau.mjs out docs/captures-borne-robuste-lot30 42501 (après npm run build).
//
//  1) État RÉCENT (moins de 15 min) : « L'écran de la tablette peut s'éteindre : réglez
//     la mise en veille (verrouillage automatique) sur Jamais » (verrou refusé ou non pris en charge), « Ouvrez la
//     borne depuis l'icône installée » (pas installée) ; rien quand tout va bien.
//  2) État PÉRIMÉ : « Tablette hors ligne depuis HH:MM » (hier, date…) et rien d'autre.
//  3) État ABSENT (ancienne page, fonction ou migration pas en ligne) : rien, comme avant.
//  4) Le temps qui passe et les relectures de 5 s font apparaître / disparaître les phrases.
//  5) Repli : colonnes absentes (42703) ou pas ouvertes (42501) → aucune phrase, aucune
//     erreur, la lecture d'avant, et UNE requête par relecture ensuite.
//  6) « Voir comment » ouvre l'aide d'installation ; 390 px sans défilement horizontal ;
//     boutons de 44 px ; zone annoncée aux lecteurs d'écran ; focus visible.
//  7) Mode support (lecture seule) : mêmes phrases, aucun code, aucune écriture.
// La fonction `kiosk` est simulée (ctx.route) ; la base aussi.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import('playwright-core')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs'));
const [,, OUT = 'out', SH = 'docs/captures-borne-robuste-lot30', PORT_ARG = '42501'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT_ARG), r));
const BASE = `http://localhost:${srv.address().port}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

// ── Données fictives ────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const NOW = new Date('2026-10-13T13:00:00Z'); // mardi 13 octobre 2026, 15:00 à Paris
const COMPANY = { id: CO, name: 'Martin Menuiserie', ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 };
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const nowS = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwtFor = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: nowS + 36000, aal: 'aal1' })}.sig`;
const SESSION = { access_token: jwtFor('u-admin'), refresh_token: 'r', expires_at: nowS + 36000, expires_in: 36000, token_type: 'bearer', user: { id: 'u-admin', email: 'paul@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const AUTH_KEY = 'sb-sdperbcquvneohotjono-auth-token';
const iso = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60e3).toISOString();
/** Une tablette : « vue il y a `seen` min » ; son état (ou rien) reçu il y a `at` min. */
const kiosk = ({ seen = 2, state = undefined, at = undefined, id = 'k-1' } = {}) => ({
  id, company_id: CO, revoked_at: null, kind: 'tablette', created_at: iso(3 * 24 * 60), last_seen_at: iso(seen),
  ...(state !== undefined ? { client_state: state, client_state_at: at === undefined ? iso(2) : at } : {}),
});
const NO_STATE = (k) => { const { client_state, client_state_at, ...rest } = k; return rest; };
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => { if (!(k in x)) return true; const cur = x[k]; if (op === 'eq') return String(cur) === val; if (op === 'is') return val === 'null' ? cur == null : String(cur) === val; return true; });
  }
  return rows;
};

/**
 * La fenêtre « Borne » du bureau. `cols` : ce que la base « connaît » —
 * 'all' (migration passée), 'kind' (pas les colonnes du lot 30), 'base' (ni kind ni lot 30), 'forbidden' (42501 sur les colonnes
 * du lot 30), 'error' (panne 500).
 */
async function bureau({ width = 390, height = 844, kiosks = [kiosk()], cols = 'all', support = false, open = true, isMobile = true } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile, hasTouch: isMobile, serviceWorkers: 'block' });
  await ctx.clock.install({ time: NOW });
  const S = { D: { users: [u('u-admin', 'Paul', 'Martin', 'admin')], companies: [{ ...COMPANY }], worksites: [], planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [], kiosks, kiosk_settings: [] }, reads: [], fn: [], writes: 0 };
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [AUTH_KEY, JSON.stringify(SESSION)]);
  if (support) await ctx.addInitScript((v) => { sessionStorage.setItem('bemexo-support', JSON.stringify(v)); }, { staffId: 'u-admin', companyId: CO, name: 'Martin Menuiserie', expiresAt: '2030-01-01T10:00:00Z' });
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: SESSION.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/kiosk')) { const body = JSON.parse(r.request().postData() || '{}'); S.fn.push(body); return r.fulfill({ status: 400, json: { error: 'Action inconnue' } }); }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: url.pathname.endsWith('/support_enter') ? [{ name: 'Martin Menuiserie', expires_at: '2030-01-01T10:00:00Z' }] : [] });
    const t = url.pathname.replace('/rest/v1/', '');
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD') { S.writes++; return r.fulfill({ status: 201, json: {} }); }
    let rows = S.D[t] || [];
    if (t === 'kiosks') {
      const select = url.searchParams.get('select') || '*';
      const wanted = select.split(',').map((c) => c.trim());
      S.reads.push(select);
      const err = (code, message) => r.fulfill({ status: code === '42501' ? 403 : code === 'XX000' ? 500 : 400, json: { code, message } });
      if (cols === 'error') return err('XX000', 'panne');
      const lot30 = wanted.some((c) => c === 'client_state' || c === 'client_state_at');
      if (cols === 'forbidden' && lot30) return err('42501', 'permission denied for table kiosks');
      if ((cols === 'kind' || cols === 'base') && lot30) return err('42703', 'column kiosks.client_state does not exist');
      if (cols === 'base' && wanted.includes('kind')) return err('42703', 'column kiosks.kind does not exist');
      rows = filterRows(rows, url.searchParams).map((k) => (select === '*' ? k : Object.fromEntries(wanted.filter((c) => c in k).map((c) => [c, k[c]]))));
      return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
    }
    rows = filterRows(rows, url.searchParams);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { pageErrors.push(e.message); console.log('   [erreur page]', e.message); });
  await p.goto(`${BASE}/admin`);
  if (open) {
    await p.waitForSelector('.bt-pl-m-ibtn[aria-label=Menu], [data-testid=bar-kiosk]', { state: 'visible', timeout: 15000 }).catch(() => {});
    if (await p.locator('[data-testid=bar-kiosk]').isVisible().catch(() => false)) await p.click('[data-testid=bar-kiosk]');
    else {
      await p.locator('.bt-pl-m-ibtn[aria-label=Menu]').first().click();
      await sleep(500);
      await p.click('[data-testid=mm-kiosk]');
    }
    await p.waitForSelector('[data-testid=ka-status]', { timeout: 10000 }).catch(() => {});
    await sleep(900);
  }
  const ff = async (ms) => { await p.clock.fastForward(ms); await sleep(500); };
  return { ctx, p, S, ff };
}
const notices = (p) => p.locator('[data-testid=ka-notices] li').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid').replace('ka-notice-', ''), text: e.querySelector('.kh-txt')?.textContent || '', hint: e.querySelector('.kh-hint')?.textContent || '', button: !!e.querySelector('button') }))).catch(() => []);
const hscroll = (p) => p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d.scrollWidth - d.clientWidth <= 1 && document.documentElement.scrollWidth <= innerWidth; });
const WAKE = 'L’écran de la tablette peut s’éteindre : réglez la mise en veille (verrouillage automatique) sur « Jamais ».';
const INSTALL = 'Ouvrez la borne depuis l’icône installée.';

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 1) état récent');
{
  const { ctx, p, S } = await bureau({ kiosks: [kiosk({ state: { wake: 'denied', standalone: false, fullscreen: false, online: true, version: 'a3f09c1d' }, at: iso(2) })] });
  const n = await notices(p);
  check(n.length === 2 && n[0].id === 'wake' && n[0].text === WAKE && n[1].id === 'install' && n[1].text === INSTALL, `1) verrou refusé + pas installée : les deux phrases, dans cet ordre (${n.map((x) => x.id).join(', ')})`);
  check(n.every((x) => x.button), '1) chacune a un bouton « Voir comment »');
  check((await p.locator('[data-testid=ka-status-text]').innerText()).startsWith('Tablette reliée — vue il y a 2 min'), '1) la ligne « Tablette reliée — vue il y a 2 min » est inchangée');
  const sizes = await p.locator('[data-testid=ka-notices] button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), name: e.textContent.trim() }; }));
  check(sizes.length === 2 && sizes.every((s) => s.h >= 44 && s.w >= 44 && s.name === 'Voir comment'), `1) boutons « Voir comment » de 44 px au moins (${sizes.map((s) => `${s.w}×${s.h}`).join(', ')})`);
  check(await hscroll(p), '1) 390 px : aucun défilement horizontal');
  const names = await p.locator('[data-testid=ka-notices] button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(names.length === 2 && new Set(names).size === 2 && names.every((n) => /^Voir comment : /.test(n)) && /écran de la tablette allumé/.test(names[0]) && /icône installée/.test(names[1]),
    `1) les deux boutons ont un nom accessible DISTINCT, qui commence par le texte visible (${names.join(' | ')})`);
  const region = await p.locator('[data-testid=ka-notices]').evaluate((e) => ({ role: e.getAttribute('role'), label: e.getAttribute('aria-label') }));
  check(region.role === 'status' && /tablette/i.test(region.label), `1) zone annoncée aux lecteurs d’écran (role=status, « ${region.label} »)`);
  check(await p.locator('[data-testid=ka-notices] .kh-ic').evaluateAll((els) => els.every((e) => e.getAttribute('aria-hidden') === 'true')), '1) l’icône est décorative (aria-hidden) : le sens est dans la phrase');
  // Les phrases ne dépendent pas d'une couleur : le texte entier est lisible, sans pastille seule.
  check(await p.locator('[data-testid=ka-notices]').evaluate((e) => e.innerText.replace(/\s+/g, ' ').includes('la mise en veille (verrouillage automatique) sur « Jamais »')), '1) la consigne « mise en veille (verrouillage automatique) sur Jamais » est écrite en clair, avec des mots qui valent pour iPad ET Android');
  await p.screenshot({ path: `${SH}/bureau-etat-ecran-390x844.png` });
  check(S.fn.filter((c) => !/^fixed_/.test(c.action)).length === 0, '1) aucun appel à la fonction kiosk pour lire l’état (lecture sous RLS seulement ; seul fixed_status, la section QR fixe du lot 12, appelle la fonction)');
  // Clavier : le bouton est atteignable et son focus se voit.
  await p.locator('[data-testid=ka-notice-help-wake]').focus();
  await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab'); // focus « au clavier » (c'est lui que :focus-visible montre)
  const ring = await p.locator('[data-testid=ka-notice-help-wake]').evaluate((e) => { const c = getComputedStyle(e); return { w: parseFloat(c.outlineWidth), st: c.outlineStyle }; });
  check(ring.st !== 'none' && ring.w >= 2, `1) le focus au clavier se voit (contour ${ring.w} px ${ring.st})`);
  // « Voir comment » ouvre l'aide d'installation.
  check(await p.locator('[data-testid=ka-install]').evaluate((e) => e.open) === false, '1) l’aide « Installer la tablette » est repliée au départ');
  await p.click('[data-testid=ka-notice-help-wake]');
  await sleep(400);
  const help = await p.locator('[data-testid=ka-install]').evaluate((e) => ({ open: e.open, text: e.innerText.replace(/\s+/g, ' ') }));
  check(help.open && /mise en veille de l’écran sur « Jamais »/.test(help.text) && /iPad : Réglages › Luminosité et affichage › verrouillage automatique/.test(help.text) && /Android : Paramètres › Affichage › Mise en veille de l’écran/.test(help.text), '1) « Voir comment » ouvre l’aide (étape « mise en veille de l’écran sur Jamais », avec le chemin iPad ET le chemin Android)');
  check(await p.locator('[data-testid=ka-install] summary').isVisible() && await p.locator('[data-testid=ka-install] ol li').first().isVisible(), '1) … et elle est visible à l’écran');
  await p.click('[data-testid=ka-install] summary'); await sleep(200);
  check(await p.locator('[data-testid=ka-install]').evaluate((e) => e.open) === false, '1) l’aide se referme toujours avec son titre');
  await ctx.close();
}
for (const [label, st, expect] of [
  ['verrou non pris en charge, icône installée', { wake: 'unsupported', standalone: true }, ['wake']],
  ['verrou tenu, pas installée', { wake: 'held', standalone: false }, ['install']],
  ['verrou tenu, installée, plein écran', { wake: 'held', standalone: true, fullscreen: true, online: true, version: 'a3f09c1d' }, []],
  ['seulement la version et le plein écran', { fullscreen: false, version: 'a3f09c1d' }, []],
  ['standalone non renseigné (inconnu n’est pas faux)', { wake: 'held' }, []],
]) {
  const { ctx, p } = await bureau({ kiosks: [kiosk({ state: st, at: iso(1) })] });
  const n = await notices(p);
  check(JSON.stringify(n.map((x) => x.id)) === JSON.stringify(expect), `1) ${label} : ${expect.length ? expect.join(' + ') : 'aucune phrase'} (${n.map((x) => x.id).join(', ') || 'rien'})`);
  if (!expect.length) check(await p.locator('[data-testid=ka-notices]').count() === 0, '1) … et la zone n’existe même pas (aucun vide laissé dans la fenêtre)');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 2) état périmé : « hors ligne depuis … » et rien d’autre');
for (const [label, at, expected] of [
  ['20 min', iso(20), 'Tablette hors ligne depuis 14:40'],
  ['15 min pile', iso(15), 'Tablette hors ligne depuis 14:45'],
  ['hier (26 h)', iso(26 * 60), 'Tablette hors ligne depuis hier 13:00'],
  ['3 jours', iso(3 * 24 * 60), 'Tablette hors ligne depuis le 10 oct. à 15:00'],
]) {
  const { ctx, p } = await bureau({ kiosks: [kiosk({ seen: 20, state: { wake: 'denied', standalone: false }, at })] });
  const n = await notices(p);
  check(n.length === 1 && n[0].id === 'offline' && n[0].text === expected, `2) ${label} : « ${n[0]?.text} »`);
  check(n[0]?.hint === 'Réseau coupé ou écran éteint.' && !n[0]?.button, `2) ${label} : une précision, pas de bouton (rien à régler)`);
  if (label === '20 min') {
    check(!/s’éteindre|icône installée/.test(await p.locator('[data-testid=ka-notices]').innerText()), '2) l’état périmé ne dit plus « l’écran peut s’éteindre » ni « icône » (plus vrai)');
    await p.screenshot({ path: `${SH}/bureau-hors-ligne-390x844.png` });
  }
  await ctx.close();
}
{
  const { ctx, p } = await bureau({ kiosks: [kiosk({ seen: 1, state: { wake: 'held' }, at: iso(0.5) })] });
  check((await notices(p)).length === 0, '2) 30 s : rien');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 3) état absent : la fenêtre est celle d’avant');
for (const [label, k, cols] of [
  ['colonnes NULL (migration passée, tablette jamais vue avec la nouvelle page)', kiosk({ seen: 3, state: null, at: null }), 'all'],
  ['colonnes absentes de la ligne (ancienne lecture)', kiosk({ seen: 3 }), 'all'],
  ['état sans date', kiosk({ seen: 3, state: { wake: 'denied' }, at: null }), 'all'],
  ['état illisible mais récent', kiosk({ seen: 3, state: 'pas un objet', at: iso(1) }), 'all'],
  ['tablette muette depuis 2 jours, jamais d’état', kiosk({ seen: 2 * 24 * 60, state: null, at: null }), 'all'],
]) {
  const { ctx, p } = await bureau({ kiosks: [k], cols });
  check((await notices(p)).length === 0 && await p.locator('[data-testid=ka-notices]').count() === 0, `3) ${label} : aucune phrase`);
  check(/^Tablette reliée — vue/.test(await p.locator('[data-testid=ka-status-text]').innerText()), '3) … « Tablette reliée — vue … » comme avant');
  await ctx.close();
}
{
  const { ctx, p } = await bureau({ kiosks: [] });
  check(await p.locator('[data-testid=ka-notices]').count() === 0 && /Aucune tablette reliée/.test(await p.locator('[data-testid=ka-status-text]').innerText()), '3) aucune tablette reliée : rien');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 4) le temps passe, les relectures de 5 s');
{
  const { ctx, p, S, ff } = await bureau({ kiosks: [kiosk({ state: { wake: 'denied', standalone: true }, at: iso(14) })] });
  check((await notices(p)).map((x) => x.id).join() === 'wake', '4) état de 14 min : « l’écran peut s’éteindre »');
  await ff(2 * 60e3);
  check((await notices(p)).map((x) => x.id).join() === 'offline', '4) 2 min plus tard (16 min) : la phrase devient « Tablette hors ligne depuis … » toute seule');
  // La tablette se signale de nouveau, verrou tenu : plus rien à dire.
  const k = S.D.kiosks[0];
  k.client_state = { wake: 'held', standalone: true }; k.client_state_at = new Date(NOW.getTime() + 2 * 60e3 + 1000).toISOString(); k.last_seen_at = k.client_state_at;
  await ff(6000);
  check((await notices(p)).length === 0, '4) la tablette est revenue, verrou tenu : plus aucune phrase (relecture de 5 s)');
  k.client_state = { wake: 'denied', standalone: true }; k.client_state_at = new Date(NOW.getTime() + 2 * 60e3 + 8000).toISOString();
  await ff(6000);
  check((await notices(p)).map((x) => x.id).join() === 'wake', '4) le verrou est de nouveau refusé : la phrase revient (relecture de 5 s)');
  check(S.fn.filter((c) => !/^fixed_/.test(c.action)).length === 0, '4) toujours aucun appel à la fonction kiosk (hors fixed_status)');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 5) repli : colonnes absentes, pas ouvertes, panne');
for (const [cols, label, levels] of [['kind', 'migration du lot 30 pas passée (colonnes du lot 12 présentes)', 2], ['base', 'ni lot 12 ni lot 30', 3], ['forbidden', 'colonnes présentes mais pas ouvertes (42501)', 2]]) {
  const { ctx, p, S, ff } = await bureau({ cols, kiosks: [kiosk({ seen: 3, state: { wake: 'denied' }, at: iso(1) })] });
  check((await notices(p)).length === 0, `5) ${label} : aucune phrase`);
  check(/^Tablette reliée — vue/.test(await p.locator('[data-testid=ka-status-text]').innerText()) && await p.locator('[data-sonner-toast]').count() === 0, '5) … la fenêtre marche comme avant, sans message d’erreur');
  const first = S.reads.length;
  check(first === levels, `5) première lecture : ${first} requête(s) (on descend d’un cran à la fois : ${S.reads.map((r) => r.split(',').length).join(' → ')} colonnes)`);
  await ff(6000); await ff(6000);
  const later = S.reads.length - first;
  check(later === 2 && S.reads.slice(first).every((r) => r === S.reads[first - 1]), `5) relectures de 5 s : UNE requête chacune, sur les colonnes qui répondent (${later} relectures)`);
  check(pageErrors.length === 0, '5) aucune erreur JavaScript');
  await ctx.close();
}
{
  const { ctx, p } = await bureau({ cols: 'error', kiosks: [kiosk()] });
  check((await notices(p)).length === 0 && pageErrors.length === 0, '5) panne de lecture (500) : aucune phrase, aucune erreur JavaScript');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 6) tablette (1024×768) et petit téléphone (360×640)');
{
  const { ctx, p } = await bureau({ width: 1024, height: 768, isMobile: false, kiosks: [kiosk({ state: { wake: 'unsupported', standalone: false }, at: iso(3) })] });
  const n = await notices(p);
  check(n.length === 2, '6) 1024×768 : les deux phrases');
  check(await hscroll(p), '6) 1024×768 : aucun défilement horizontal');
  await p.screenshot({ path: `${SH}/bureau-etat-ecran-1024x768.png` });
  await ctx.close();
}
{
  const { ctx, p } = await bureau({ width: 360, height: 640, kiosks: [kiosk({ state: { wake: 'denied', standalone: false }, at: iso(3) })] });
  check(await hscroll(p), '6) 360×640 : aucun défilement horizontal');
  const fits = await p.locator('[data-testid=ka-notices] li').evaluateAll((els) => els.every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
  check(fits, '6) 360×640 : les phrases tiennent dans l’écran');
  await p.click('[data-testid=ka-notice-help-install]'); await sleep(500);
  check(await p.locator('[data-testid=ka-install]').evaluate((e) => e.open) && await p.locator('[data-testid=ka-install] summary').isVisible(), '6) 360×640 : « Voir comment » ouvre l’aide et la montre');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── 7) mode support (lecture seule)');
{
  const { ctx, p, S } = await bureau({ support: true, kiosks: [kiosk({ state: { wake: 'denied', standalone: false }, at: iso(2) })] });
  check((await notices(p)).length === 2, '7) mode support : les mêmes phrases (information, rien à écrire)');
  check(await p.locator('[data-testid=ka-support-note]').count() === 1 && await p.locator('[data-testid=ka-code-block]').count() === 0, '7) … « Mode support : lecture seule », aucun code');
  check(S.fn.filter((c) => ['create_pairing', 'revoke', 'settings'].includes(c.action)).length === 0 && S.writes === 0, '7) aucune écriture');
  await ctx.close();
}

await b.close(); srv.close();
console.log('\ncaptures :', fs.readdirSync(SH).filter((f) => f.endsWith('.png')).join(', '));
console.log(`\n${ok} ok, ${ko} échec(s) ; erreurs de page : ${pageErrors.length}`);
process.exit(ko || pageErrors.length ? 1 : 0);
