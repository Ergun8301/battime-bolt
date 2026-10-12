// Lancer : node scripts/tests/mode-essai-lot6.mjs out docs/captures-ia-v2 [port] (après npm run build).
// Lot 6 — bandeau « Mode essai » : visible AVANT d'envoyer quoi que ce soit, dans
//   1) l'assistant du bureau (/admin), 2) l'assistant du salarié (/poseur),
//   3) l'écran de lecture d'un bulletin (fiche salarié → « Coût réel »).
// Règle de prudence : tant que la formule est inconnue (fonction qui ne répond pas,
// ancienne version encore déployée, réponse sans « formule »), le bandeau est
// AFFICHÉ ; seul « payant » le retire. La demande de statut ({ statut: true }) ne
// porte aucune question et n'est jamais une demande à l'IA.
// Base simulée : aucune vraie base, aucune vraie fonction.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/captures-ia-v2', PORT = '4199'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const TEXTE = 'Mode essai (Gemini gratuit) : données fictives uniquement. Google peut relire et réutiliser ce que vous envoyez.';
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const CO = 'c0000000-0000-0000-0000-000000000001';
const USERS = [
  { id: 'u-admin', company_id: CO, first_name: 'Paul', last_name: 'Martin', role: 'admin', email: 'paul@exemple.fr', is_active: true, created_at: '2026-01-01' },
  { id: 'u-sam', company_id: CO, first_name: 'Sam', last_name: 'Test', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' },
];
const D = {
  users: USERS,
  companies: [{ id: CO, name: 'Entreprise Test', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, colleagues_planning_visible: true }],
  worksites: [{ id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true }],
  planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [],
  push_subscriptions: [], payslip_figures: [], company_cost_settings: [],
};
const sessionFor = (uid, email) => {
  const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: uid, email, aud: 'authenticated', role: 'authenticated' } };
};
// Ce que répond la fonction à la demande de statut :
//   'essai' | 'payant' → { formule } ; 'ancienne' → ce que fait une fonction d'avant le lot 6 (400, pas de formule) ;
//   'panne' → connexion coupée ; 'bizarre' → une formule que l'écran ne connaît pas.
let STATUT = 'essai';
const vus = []; // { fn, body } de chaque appel de fonction
const REPONSE = { answer: 'Bonjour.', links: [], remaining: 40 };
const statut = (fn, body, r) => {
  if (STATUT === 'panne') return r.abort('failed');
  if (STATUT === 'ancienne') return r.fulfill({ status: 400, json: { error: 'Posez une question.' } });
  if (STATUT === 'bizarre') return r.fulfill({ json: { formule: 'gratuit-illimite' } });
  return r.fulfill({ json: { formule: STATUT } });
};
const setup = async (ctx, uid, email) => {
  const session = sessionFor(uid, email);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); let body = null; try { body = req.postDataJSON(); } catch { body = null; }
    if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (u.pathname.startsWith('/functions/v1/')) {
      const fn = u.pathname.replace('/functions/v1/', '');
      vus.push({ fn, body });
      if (body?.statut === true) return statut(fn, body, r);
      if (fn === 'worker-assistant') return r.fulfill({ json: { kind: 'answer', answer: 'Bonjour.', remaining: 19, formule: 'essai' } });
      if (fn === 'assistant') return r.fulfill({ json: { ...REPONSE, formule: STATUT === 'payant' ? 'payant' : 'essai' } });
      return r.fulfill({ json: {} });
    }
    if (u.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = u.pathname.replace('/rest/v1/', '');
    let rows = D[t] || [];
    for (const [k, v] of u.searchParams) { if (v.startsWith('eq.')) { const val = v.slice(3); rows = rows.filter((x) => !(k in x) || String(x[k]) === val); } }
    const acc = req.headers()['accept'] || '';
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, json: rows.length ? rows[0] : { id: 'new-1' } });
    if (acc.includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
};

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const banner = (p) => p.locator('[data-testid=mode-essai]');
const verbatim = async (p) => (await banner(p).count()) === 1 && (await banner(p).innerText()).trim() === TEXTE;
const pageErrors = [];

// ═══ 1) Bureau ═══════════════════════════════════════════════════════════════
async function bureau(mode, attendu, nom) {
  STATUT = mode; vus.length = 0;
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx, 'u-admin', 'paul@exemple.fr');
  const p = await ctx.newPage(); p.on('pageerror', (e) => pageErrors.push(e.message));
  await p.goto(`http://localhost:${PORT}/admin`); await p.waitForTimeout(2200);
  await p.click('[data-testid="bar-assistant"]'); await p.waitForSelector('[data-testid=assistant-panel]'); await p.waitForTimeout(900);
  const visible = (await banner(p).count()) === 1;
  check(visible === attendu, `1) bureau · ${nom} : bandeau ${attendu ? 'AFFICHÉ' : 'masqué'} avant tout envoi`);
  if (attendu) check(await verbatim(p), `1) bureau · ${nom} : texte exact, mot pour mot`);
  const st = vus.filter((v) => v.fn === 'assistant');
  check(st.length === 1 && st[0].body?.statut === true && !('question' in st[0].body) && !('file' in st[0].body), `1) bureau · ${nom} : une seule demande de statut, sans question ni fichier (${st.length})`);
  return { p, ctx };
}
{
  const { p, ctx } = await bureau('essai', true, 'formule essai');
  await p.locator('[data-testid=assistant-panel]').screenshot({ path: `${SH}/20-bandeau-essai-bureau.png` });
  // Après une réponse de la fonction, le bandeau est toujours là ; envoyer ne le retire pas.
  await p.fill('.as-bar textarea', 'Bonjour'); await p.click('button[aria-label="Envoyer"]'); await p.waitForTimeout(900);
  check(await verbatim(p), '1) bureau · le bandeau reste après l’envoi (formule essai)');
  await ctx.close();
}
for (const [mode, nom] of [['ancienne', 'ancienne fonction encore déployée'], ['panne', 'fonction injoignable'], ['bizarre', 'formule inconnue']]) {
  const { ctx } = await bureau(mode, true, nom); await ctx.close();
}
{
  const { p, ctx } = await bureau('payant', false, 'formule payant');
  await p.locator('[data-testid=assistant-panel]').screenshot({ path: `${SH}/21-sans-bandeau-payant-bureau.png` });
  await ctx.close();
}
// Bandeau affiché dès l'ouverture, même si la réponse du statut tarde (jamais « rien d'abord, bandeau ensuite »).
{
  STATUT = 'essai'; vus.length = 0;
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx, 'u-admin', 'paul@exemple.fr');
  await ctx.route('**/functions/v1/assistant', async (r) => { await new Promise((x) => setTimeout(x, 2500)); return r.fallback(); }, { times: 1 });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/admin`); await p.waitForTimeout(2200);
  await p.click('[data-testid="bar-assistant"]'); await p.waitForSelector('[data-testid=assistant-panel]'); await p.waitForTimeout(300);
  check((await banner(p).count()) === 1, '1) bureau : statut encore en attente → bandeau déjà affiché');
  await ctx.close();
}

// ═══ 2) Salarié ══════════════════════════════════════════════════════════════
async function salarie(mode, attendu, nom, vp = { width: 390, height: 844 }, shot) {
  STATUT = mode; vus.length = 0;
  const ctx = await b.newContext({ viewport: vp, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile: true, hasTouch: true });
  await setup(ctx, 'u-sam', 'sam@exemple.fr');
  const p = await ctx.newPage(); p.on('pageerror', (e) => pageErrors.push(e.message));
  await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector('.bt-total', { timeout: 25000 }).catch(() => {}); await p.waitForTimeout(1200);
  await p.locator('[data-testid=dock-assistant]').click(); await p.waitForSelector('[data-testid=assistant-panel]', { timeout: 10000 }); await p.waitForTimeout(900);
  check(((await banner(p).count()) === 1) === attendu, `2) salarié · ${nom} : bandeau ${attendu ? 'AFFICHÉ' : 'masqué'} avant tout envoi`);
  if (attendu) check(await verbatim(p), `2) salarié · ${nom} : texte exact, mot pour mot`);
  const st = vus.filter((v) => v.fn === 'worker-assistant');
  check(st.length === 1 && st[0].body?.statut === true && !('text' in st[0].body), `2) salarié · ${nom} : une seule demande de statut, sans texte (${st.length})`);
  if (shot) await p.locator('[data-testid=assistant-panel]').screenshot({ path: `${SH}/${shot}` });
  await ctx.close();
}
await salarie('essai', true, 'formule essai', undefined, '22-bandeau-essai-salarie-390.png');
await salarie('ancienne', true, 'ancienne fonction encore déployée');
await salarie('panne', true, 'fonction injoignable');
await salarie('payant', false, 'formule payant');

// ═══ 3) Lecture d'un bulletin (fiche salarié → « Coût réel ») ════════════════
async function bulletin(mode, attendu, nom, shot) {
  STATUT = mode; vus.length = 0;
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx, 'u-admin', 'paul@exemple.fr');
  const p = await ctx.newPage(); p.on('pageerror', (e) => pageErrors.push(e.message));
  await p.goto(`http://localhost:${PORT}/admin`); await p.waitForTimeout(2200);
  await p.locator('.bt-pl-segbtn', { hasText: 'Salariés' }).first().click(); await p.waitForTimeout(500);
  await p.locator('[role=dialog] button', { hasText: 'Sam Test' }).first().click(); await p.waitForSelector('[data-testid=real-cost]', { timeout: 10000 }); await p.waitForTimeout(900);
  const carte = p.locator('[data-testid=real-cost]');
  const visible = (await carte.locator('[data-testid=mode-essai]').count()) === 1;
  check(visible === attendu, `3) bulletin · ${nom} : bandeau ${attendu ? 'AFFICHÉ' : 'masqué'} avant le dépôt du moindre fichier`);
  if (attendu) check((await carte.locator('[data-testid=mode-essai]').innerText()).trim() === TEXTE, `3) bulletin · ${nom} : texte exact, mot pour mot`);
  const st = vus.filter((v) => v.fn === 'payslip-read');
  check(st.length === 1 && st[0].body?.statut === true && !('file_base64' in st[0].body), `3) bulletin · ${nom} : une seule demande de statut, sans fichier (${st.length})`);
  if (shot) await carte.screenshot({ path: `${SH}/${shot}` });
  await ctx.close();
}
await bulletin('essai', true, 'formule essai', '23-bandeau-essai-bulletin.png');
await bulletin('ancienne', true, 'ancienne fonction encore déployée');
await bulletin('panne', true, 'fonction injoignable');
await bulletin('payant', false, 'formule payant');

// ═══ 4) Démo de la lecture de bulletin (aperçu) : pas de fonction, bandeau quand même ═══
{
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/apercu/cout-salarie?demo=cout`); await p.waitForSelector('[data-testid=real-cost]', { timeout: 15000 }); await p.waitForTimeout(500);
  check((await p.locator('[data-testid=real-cost] [data-testid=mode-essai]').count()) === 1, '4) aperçu (démo) : bandeau affiché, sans fonction à interroger');
  await ctx.close();
}

check(pageErrors.length === 0, `aucune erreur de page${pageErrors.length ? ` : ${pageErrors.join(' | ')}` : ''}`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
