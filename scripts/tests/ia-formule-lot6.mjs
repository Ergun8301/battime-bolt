// Lancer : node scripts/tests/ia-formule-lot6.mjs out docs/captures-ia-v2 [port] (après npm run build).
// Lot 6 — formule IA (essai / payant) : AUCUN bandeau à l'écran, une ligne pour le support seul.
// À la demande d'Ergun, le bandeau « Mode essai (Gemini gratuit) : données fictives uniquement… »
// est retiré. Ce harnais prouve que :
//   0) le texte n'existe plus nulle part dans le site construit (dossier `out`) ;
//   1) l'assistant du bureau (/admin), 2) l'assistant du salarié (/poseur),
//      3) l'écran de lecture d'un bulletin (fiche salarié → « Coût réel »),
//      4) les aperçus (démos) n'affichent RIEN de relatif à la formule, quelle que soit
//      la réponse de la fonction : essai, payant, formule inconnue, ancienne fonction
//      (400, pas de « formule »), fonction injoignable ; et ils ne demandent même plus la
//      formule ({ statut: true }) ;
//   5) la formule reste lue par `iaFormule` (lib/ia-formule.ts) : la console du SUPPORT
//      BEMEXO (/support), une fois le compte support vérifié (support_is_staff + double
//      vérification aal2), montre « IA : formule essai / payant / inconnue » et RIEN d'autre
//      (pas de compteur) ; un patron, un salarié ou un support sans double vérification ne
//      la voient jamais et la fonction n'est alors pas interrogée.
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

// Tout ce qui ressemblerait au bandeau retiré (texte, mot-clé de test, avertissement Google).
const INTERDIT = /Mode essai|Gemini gratuit|Google peut relire|réutiliser ce que vous envoyez|mode-essai/i;
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const CO = 'c0000000-0000-0000-0000-000000000001';
const USERS = [
  { id: 'u-admin', company_id: CO, first_name: 'Paul', last_name: 'Martin', role: 'admin', email: 'paul@exemple.fr', is_active: true, created_at: '2026-01-01' },
  { id: 'u-sam', company_id: CO, first_name: 'Sam', last_name: 'Test', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' },
  { id: 'u-support', company_id: CO, first_name: 'Ergun', last_name: 'Support', role: 'admin', email: 'support@bemexo.com', is_active: true, created_at: '2026-01-01' },
];
const D = {
  users: USERS,
  companies: [{ id: CO, name: 'Entreprise Test', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, colleagues_planning_visible: true }],
  worksites: [{ id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true }],
  planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [],
  push_subscriptions: [], payslip_figures: [], company_cost_settings: [],
};
// aal : niveau de la session (aal2 = double vérification passée) ; factors : le support a un facteur TOTP vérifié.
const sessionFor = (uid, email, aal = 'aal1') => {
  const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 36000, aal, amr: [{ method: 'password', timestamp: now }] })}.sig`;
  const factors = uid === 'u-support' ? [{ id: 'f-totp', factor_type: 'totp', status: 'verified', friendly_name: 'BEMEXO support' }] : undefined;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: uid, email, aud: 'authenticated', role: 'authenticated', ...(factors ? { factors } : {}) } };
};
// Ce que répond la fonction à la demande de statut :
//   'essai' | 'payant' → { formule } ; 'ancienne' → ce que fait une fonction d'avant le lot 6 (400, pas de formule) ;
//   'panne' → connexion coupée ; 'bizarre' → une formule que personne ne connaît.
let STATUT = 'essai';
let STAFF = false; // réponse de support_is_staff
const vus = []; // { fn, body } de chaque appel de fonction
const rest = []; // chemin de chaque requête REST / RPC (pour prouver qu'aucun compteur n'est lu)
const statut = (fn, body, r) => {
  if (STATUT === 'panne') return r.abort('failed');
  if (STATUT === 'ancienne') return r.fulfill({ status: 400, json: { error: 'Posez une question.' } });
  if (STATUT === 'bizarre') return r.fulfill({ json: { formule: 'gratuit-illimite' } });
  return r.fulfill({ json: { formule: STATUT } });
};
const setup = async (ctx, uid, email, aal = 'aal1') => {
  const session = sessionFor(uid, email, aal);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); let body = null; try { body = req.postDataJSON(); } catch { body = null; }
    if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (u.pathname.startsWith('/functions/v1/')) {
      const fn = u.pathname.replace('/functions/v1/', '');
      vus.push({ fn, body });
      if (body?.statut === true) return statut(fn, body, r);
      // Une vraie réponse : la fonction joint toujours sa formule (interne), l'écran ne l'affiche pas.
      if (fn === 'worker-assistant') return r.fulfill({ json: { kind: 'answer', answer: 'Bonjour.', remaining: 19, formule: STATUT === 'payant' ? 'payant' : 'essai' } });
      if (fn === 'assistant') return r.fulfill({ json: { answer: 'Bonjour.', links: [], remaining: 40, formule: STATUT === 'payant' ? 'payant' : 'essai' } });
      return r.fulfill({ json: {} });
    }
    rest.push(u.pathname);
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      if (u.pathname.endsWith('/support_is_staff')) return r.fulfill({ json: STAFF });
      return r.fulfill({ json: [] });
    }
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
const pageErrors = [];
const MODES = [['essai', 'formule essai'], ['payant', 'formule payant'], ['bizarre', 'formule inconnue'], ['ancienne', 'ancienne fonction encore déployée'], ['panne', 'fonction injoignable']];
const demandesDeStatut = () => vus.filter((v) => v.body?.statut === true);

/** Rien de relatif à la formule à l'écran : ni bandeau, ni texte d'avertissement (page entière, y compris le HTML caché). */
async function aucuneFormule(p, nom) {
  const bandeaux = await p.locator('[data-testid=mode-essai]').count();
  const texte = await p.locator('body').innerText();
  const html = await p.content();
  check(bandeaux === 0 && !INTERDIT.test(texte) && !INTERDIT.test(html) && !/formule/i.test(texte), `${nom} : aucun bandeau, aucun texte « Gemini gratuit / données fictives », aucune « formule » à l’écran`);
}
/** Le panneau ne demande plus la formule : aucune requête { statut: true }. */
const sansDemandeDeStatut = (nom) => check(demandesDeStatut().length === 0, `${nom} : aucune demande de statut (le panneau ne s’occupe plus de la formule), ${demandesDeStatut().length} vue(s)`);

// ═══ 0) Le site construit ne contient plus le bandeau ════════════════════════
{
  const trouves = [];
  const interdit = /Mode essai|Gemini gratuit|Google peut relire|mode-essai/;
  const parcourir = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { parcourir(f); continue; }
    if (!/\.(js|html|txt|css|json)$/.test(e.name)) continue;
    if (interdit.test(fs.readFileSync(f, 'utf8'))) trouves.push(path.relative(OUT, f));
  } };
  parcourir(OUT);
  check(trouves.length === 0, `0) site construit : plus aucun texte du bandeau${trouves.length ? ` (trouvé dans ${trouves.slice(0, 5).join(', ')})` : ''}`);
  check(!fs.existsSync('components/trial-banner.tsx'), '0) le composant du bandeau n’existe plus');
  check(/export async function iaFormule/.test(fs.readFileSync('lib/ia-formule.ts', 'utf8')), '0) lib/ia-formule.ts garde iaFormule (lue par le support)');
}

// ═══ 1) Bureau ═══════════════════════════════════════════════════════════════
async function bureau(mode, nom, { envoyer = true, shot } = {}) {
  STATUT = mode; vus.length = 0;
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx, 'u-admin', 'paul@exemple.fr');
  const p = await ctx.newPage(); p.on('pageerror', (e) => pageErrors.push(e.message));
  await p.goto(`http://localhost:${PORT}/admin`); await p.waitForTimeout(2200);
  await p.click('[data-testid="bar-assistant"]'); await p.waitForSelector('[data-testid=assistant-panel]'); await p.waitForTimeout(900);
  await aucuneFormule(p, `1) bureau · ${nom} (avant tout envoi)`);
  sansDemandeDeStatut(`1) bureau · ${nom}`);
  if (shot) await p.locator('[data-testid=assistant-panel]').screenshot({ path: `${SH}/${shot}` });
  if (envoyer) {
    // La réponse de la fonction porte sa formule (interne) : l'écran ne change pas.
    await p.fill('.as-bar textarea', 'Bonjour'); await p.click('button[aria-label="Envoyer"]'); await p.waitForTimeout(900);
    check((await p.locator('.as-bot').allInnerTexts()).some((t) => t.includes('Bonjour.')) || (await p.locator('[data-testid=assistant-panel]').innerText()).includes('Bonjour.'), `1) bureau · ${nom} : la réponse s’affiche`);
    await aucuneFormule(p, `1) bureau · ${nom} (après la réponse)`);
    check(vus.filter((v) => v.fn === 'assistant' && v.body?.question === 'Bonjour').length === 1, `1) bureau · ${nom} : la question part toujours à la fonction (le compteur serveur n’est pas touché)`);
  }
  await ctx.close();
}
for (const [mode, nom] of MODES) await bureau(mode, nom, { shot: mode === 'essai' ? '20-sans-bandeau-bureau.png' : undefined });

// ═══ 2) Salarié ══════════════════════════════════════════════════════════════
async function salarie(mode, nom, { vp = { width: 390, height: 844 }, shot } = {}) {
  STATUT = mode; vus.length = 0;
  const ctx = await b.newContext({ viewport: vp, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile: true, hasTouch: true });
  await setup(ctx, 'u-sam', 'sam@exemple.fr');
  const p = await ctx.newPage(); p.on('pageerror', (e) => pageErrors.push(e.message));
  await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector('.bt-total', { timeout: 25000 }).catch(() => {}); await p.waitForTimeout(1200);
  await p.locator('[data-testid=dock-assistant]').click(); await p.waitForSelector('[data-testid=assistant-panel]', { timeout: 10000 }); await p.waitForTimeout(900);
  await aucuneFormule(p, `2) salarié · ${nom} (avant tout envoi)`);
  sansDemandeDeStatut(`2) salarié · ${nom}`);
  if (shot) await p.locator('[data-testid=assistant-panel]').screenshot({ path: `${SH}/${shot}` });
  await p.fill('.as-bar textarea', 'Bonjour'); await p.click('button[aria-label="Envoyer"]'); await p.waitForTimeout(900);
  check((await p.locator('[data-testid=assistant-panel]').innerText()).includes('Bonjour.'), `2) salarié · ${nom} : la réponse s’affiche`);
  await aucuneFormule(p, `2) salarié · ${nom} (après la réponse)`);
  await ctx.close();
}
for (const [mode, nom] of MODES) await salarie(mode, nom, { shot: mode === 'essai' ? '22-sans-bandeau-salarie-390.png' : undefined });

// ═══ 3) Lecture d'un bulletin (fiche salarié → « Coût réel ») ════════════════
async function bulletin(mode, nom, shot) {
  STATUT = mode; vus.length = 0;
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx, 'u-admin', 'paul@exemple.fr');
  const p = await ctx.newPage(); p.on('pageerror', (e) => pageErrors.push(e.message));
  await p.goto(`http://localhost:${PORT}/admin`); await p.waitForTimeout(2200);
  await p.locator('.bt-pl-segbtn', { hasText: 'Salariés' }).first().click(); await p.waitForTimeout(500);
  await p.locator('[role=dialog] button', { hasText: 'Sam Test' }).first().click(); await p.waitForSelector('[data-testid=real-cost]', { timeout: 10000 }); await p.waitForTimeout(900);
  const carte = p.locator('[data-testid=real-cost]');
  check((await carte.count()) === 1 && (await carte.innerText()).includes('Coût réel'), `3) bulletin · ${nom} : la carte « Coût réel » est bien là`);
  check((await carte.locator('[data-testid=mode-essai]').count()) === 0 && !INTERDIT.test(await carte.innerText()), `3) bulletin · ${nom} : aucun bandeau avant le dépôt du moindre fichier`);
  await aucuneFormule(p, `3) bulletin · ${nom} (page entière)`);
  check(vus.filter((v) => v.fn === 'payslip-read').length === 0, `3) bulletin · ${nom} : la fonction de lecture n’est pas interrogée à l’ouverture`);
  sansDemandeDeStatut(`3) bulletin · ${nom}`);
  if (shot) await carte.screenshot({ path: `${SH}/${shot}` });
  await ctx.close();
}
for (const [mode, nom] of MODES) await bulletin(mode, nom, mode === 'essai' ? '23-sans-bandeau-bulletin.png' : undefined);

// ═══ 4) Aperçus (démos) : pas de fonction, pas de bandeau ════════════════════
{
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, locale: 'fr-FR' });
  const p = await ctx.newPage(); p.on('pageerror', (e) => pageErrors.push(e.message));
  vus.length = 0;
  await p.goto(`http://localhost:${PORT}/apercu/cout-salarie?demo=cout`); await p.waitForSelector('[data-testid=real-cost]', { timeout: 15000 }); await p.waitForTimeout(500);
  await aucuneFormule(p, '4) aperçu bulletin (démo)');
  await p.goto(`http://localhost:${PORT}/apercu/assistant?demo=assistant`); await p.waitForSelector('[data-testid=assistant-open]', { timeout: 15000 });
  await p.click('[data-testid=assistant-open]'); await p.waitForSelector('[data-testid=assistant-panel]'); await p.waitForTimeout(400);
  await aucuneFormule(p, '4) aperçu assistant du bureau (démo)');
  await p.goto(`http://localhost:${PORT}/apercu/assistant-salarie?demo=salarie`); await p.waitForSelector('[data-testid=assistant-open]', { timeout: 15000 });
  await p.click('[data-testid=assistant-open]'); await p.waitForSelector('[data-testid=assistant-panel]'); await p.waitForTimeout(400);
  await aucuneFormule(p, '4) aperçu assistant du salarié (démo)');
  check(vus.length === 0, '4) aperçus : aucune fonction interrogée');
  await ctx.close();
}

// ═══ 5) Console du support BEMEXO (/support) : la formule reste lue, par le support seul ═══
async function support({ uid, email, aal, staff, mode, nom, inside = false, shot, attendu }) {
  STATUT = mode; STAFF = staff; vus.length = 0; rest.length = 0;
  const ctx = await b.newContext({ viewport: { width: 700, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx, uid, email, aal);
  if (inside) {
    // Un support déjà « entré » chez un client (sessionStorage, voir lib/support.ts).
    await ctx.addInitScript((s) => { sessionStorage.setItem('bemexo-support', JSON.stringify(s)); },
      { staffId: uid, companyId: CO, name: 'Entreprise Test', expiresAt: new Date(Date.now() + 3600e3).toISOString() });
  }
  const p = await ctx.newPage(); p.on('pageerror', (e) => pageErrors.push(e.message));
  await p.goto(`http://localhost:${PORT}/support`); await p.waitForSelector('[data-testid=support-console]', { timeout: 15000 });
  await p.waitForFunction(() => !document.querySelector('[data-testid=support-console] .animate-spin'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const ligne = p.locator('[data-testid=support-ia]');
  if (attendu) {
    check((await ligne.count()) === 1 && (await ligne.innerText()).trim() === attendu, `5) support · ${nom} : « ${attendu} », et rien d’autre`);
    check(demandesDeStatut().length === 1 && demandesDeStatut()[0].fn === 'assistant' && JSON.stringify(demandesDeStatut()[0].body) === '{"statut":true}', `5) support · ${nom} : une seule demande de statut, sans question ni fichier (${demandesDeStatut().length})`);
    check(!rest.some((x) => /ai_project_usage|ai_bulletin_usage|assistant_context/.test(x)), `5) support · ${nom} : aucun compteur lu (réservé au service)`);
    check(!/\d/.test(await ligne.innerText()), `5) support · ${nom} : aucun chiffre sur la ligne`);
    if (shot) await p.locator('[data-testid=support-console]').screenshot({ path: `${SH}/${shot}` });
  } else {
    check((await ligne.count()) === 0 && !/formule/i.test(await p.locator('body').innerText()), `5) ${nom} : aucune ligne « IA : formule » à l’écran`);
    check(vus.length === 0, `5) ${nom} : aucune fonction d’IA interrogée (${vus.length})`);
  }
  await ctx.close();
}
await support({ uid: 'u-admin', email: 'paul@exemple.fr', aal: 'aal1', staff: false, mode: 'essai', nom: 'patron sur /support' });
await support({ uid: 'u-sam', email: 'sam@exemple.fr', aal: 'aal1', staff: false, mode: 'essai', nom: 'salarié sur /support' });
await support({ uid: 'u-admin', email: 'paul@exemple.fr', aal: 'aal2', staff: false, mode: 'essai', nom: 'patron avec double vérification, hors équipe support' });
await support({ uid: 'u-support', email: 'support@bemexo.com', aal: 'aal1', staff: true, mode: 'essai', nom: 'support sans double vérification' });
for (const [mode, nom, attendu] of [['essai', 'formule essai', 'IA : formule essai'], ['payant', 'formule payant', 'IA : formule payant'], ['bizarre', 'formule inconnue', 'IA : formule inconnue'],
  ['ancienne', 'ancienne fonction', 'IA : formule inconnue'], ['panne', 'fonction injoignable', 'IA : formule inconnue']]) {
  await support({ uid: 'u-support', email: 'support@bemexo.com', aal: 'aal2', staff: true, mode, nom, attendu, shot: mode === 'essai' ? '24-support-formule-essai.png' : undefined });
}
await support({ uid: 'u-support', email: 'support@bemexo.com', aal: 'aal2', staff: true, mode: 'payant', nom: 'support déjà entré chez un client · formule payant', inside: true, attendu: 'IA : formule payant' });

check(pageErrors.length === 0, `aucune erreur de page${pageErrors.length ? ` : ${pageErrors.join(' | ')}` : ''}`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
