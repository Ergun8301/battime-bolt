// Invitations en attente (bureau) : une ligne repliée au-dessus du planning.
//
// Lancer : npm run build, puis
//   node scripts/tests/invitations-admin.mjs out docs/captures-invitations
// Vraie page /admin (export statique), Supabase SIMULÉ AVEC ÉTAT : aucun vrai
// compte, aucun e-mail. Noms fictifs uniquement.
//
//  1) arrivée : UNE ligne « 15 salariés n’ont pas encore activé leur compte · Voir
//     la liste », repliée ; le planning est visible tout de suite ;
//  2) liste : « Envoyer l’invitation » (jamais envoyée) / « Invitée le JJ/MM » +
//     « Renvoyer » ; envoi d'une ligne → invite-worker avec la bonne adresse ;
//  3) ✕ → confirmation (annuler = rien ; OK = révocation de CETTE adresse) ;
//  4) « Envoyer toutes les invitations » → « Envoyer 15 e-mails ? » ; annuler = zéro
//     envoi ; OK = un envoi par adresse non envoyée, puis « Renvoyer toutes… » ;
//  5) une erreur au 3e envoi arrête l'envoi groupé et le dit ;
//  6) PRÉVIEW (127.0.0.1) : envois et suppressions simulés, AUCUN appel serveur ;
//  7) 1 invitation : singulier, pas de bouton groupé ; 0 : rien ;
//  8) téléphone : rien ne déborde.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/captures-invitations', PORT = '4431'] = process.argv;
fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
// « app.bemexo.test » = une adresse de PRODUCTION pour l'appli (ni localhost, ni préview).
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--host-resolver-rules=MAP app.bemexo.test 127.0.0.1'] });
const PROD = `http://app.bemexo.test:${PORT}`;
const PREVIEW = `http://127.0.0.1:${PORT}`;

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('  ✓', m); } else { ko++; console.log('  ✗', m); } };
const ddmm = (d) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }).format(d);

// ─── Base simulée ────────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const PRENOMS = ['Jean', 'Paul', 'Luc', 'Marc', 'Léo', 'Hugo', 'Noah', 'Théo', 'Éric', 'Yves', 'René', 'Guy', 'Rémi', 'Loïc', 'Axel'];
const inv = (i, extra = {}) => ({ id: `inv-${i}`, company_id: CO, email: `salarie${i}@exemple.fr`, phone: null, first_name: PRENOMS[i % 15], last_name: `Exemple${i}`, role: 'worker', token: `t${i}`, created_at: '2026-10-08T09:35:00Z', expires_at: '2099-01-01T00:00:00Z', accepted_at: null, created_by: 'u-admin', ...extra });
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const COMPANY = { id: CO, name: 'Menuiserie Exemple', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2099-01-01', weekly_hours: 35 };
let SLOW_SEND = null; let D; let SENT; let log; let FAIL_ON = null; let seq = 0; let RPC_MODE = 'ok'; // 'ok' | 'lent' | 'erreur'
const reset = (invitations, sent = {}) => {
  D = { users: [u('u-admin', 'Anne', 'Bureau', 'admin'), u('u-w1', 'Sam', 'Atelier'), u('u-w2', 'Zoé', 'Chantier')], companies: [{ ...COMPANY }], worksites: [], planning: [], time_entries: [], invitations };
  SENT = { ...sent }; log = { sends: [], revokes: [], rpc: 0 }; FAIL_ON = null; RPC_MODE = 'ok';
};

const nowS = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: nowS + 86400, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: nowS + 86400, expires_in: 86400, token_type: 'bearer', user: { id: 'u-admin', email: 'bureau@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    let neg = false; let w = v; if (w.startsWith('not.')) { neg = true; w = w.slice(4); }
    const dot = w.indexOf('.'); const op = w.slice(0, dot); const val = w.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k]; let r = true;
      if (op === 'eq') r = String(cur) === val;
      else if (op === 'neq') r = String(cur) !== val;
      else if (op === 'in') r = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      else if (op === 'gte') r = String(cur) >= val;
      else if (op === 'lte') r = String(cur) <= val;
      else if (op === 'gt') r = String(cur) > val;
      else if (op === 'lt') r = String(cur) < val;
      else if (op === 'is') r = val === 'null' ? cur == null : String(cur) === val;
      return neg ? !r : r;
    });
  }
  return rows;
};
const setup = async (ctx) => {
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname === '/functions/v1/invite-worker') {
      const body = JSON.parse(r.request().postData() || '{}');
      if (body.action === 'revoke') {
        log.revokes.push(body.email);
        D.invitations = D.invitations.filter((x) => x.email !== body.email);
        return r.fulfill({ json: { success: true, deleted_account: true } });
      }
      log.sends.push(body);
      // Comme le serveur corrigé : en cas d'échec, l'ancienne invitation RESTE ;
      // sinon elle est remplacée par une nouvelle (nouvel id).
      if (FAIL_ON === body.email) return r.fulfill({ status: 400, json: { error: 'email rate limit exceeded' } });
      if (body.email === SLOW_SEND) await new Promise((res) => setTimeout(res, 2500));
      const old = D.invitations.find((x) => x.email === body.email);
      D.invitations = D.invitations.filter((x) => x.email !== body.email);
      D.invitations.push({ ...(old || {}), id: `re-${++seq}`, email: body.email, first_name: body.first_name, last_name: body.last_name, company_id: body.company_id, created_at: new Date().toISOString(), accepted_at: null, expires_at: '2099-01-01T00:00:00Z' });
      SENT[body.email] = new Date().toISOString();
      return r.fulfill({ json: { success: true } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname === '/rest/v1/rpc/pending_invitations_sent_at') {
      log.rpc++;
      if (RPC_MODE === 'erreur') return r.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function' } });
      if (RPC_MODE === 'lent') await new Promise((res) => setTimeout(res, 2500));
      return r.fulfill({ json: D.invitations.filter((x) => !x.accepted_at).map((x) => ({ email: x.email, invited_at: SENT[x.email] || null })) });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', ''); D[t] = D[t] || [];
    const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    if (m !== 'GET' && m !== 'HEAD') return r.fulfill({ json: [] });
    const all = filterRows(D[t], url.searchParams);
    if (single) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const rows = all.slice(off, lim ? off + Number(lim) : undefined);
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
  });
};

// Fenêtres de confirmation : on lit le texte, puis on répond selon `answer`.
let answer = 'dismiss'; let dialogs = [];
const open = async (base, w = 1366, h = 860, mobile = false) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(mobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await setup(ctx); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  p.on('dialog', async (d) => { dialogs.push(d.message()); if (answer === 'accept') await d.accept(); else await d.dismiss(); });
  await p.goto(`${base}/admin`);
  await p.waitForSelector(mobile ? '.bt-pl-m-card, .bt-pl-mobile' : '.bt-pl-table', { timeout: 20000 });
  await p.waitForTimeout(1200);
  return { ctx, p };
};
const rows = (p) => p.locator('[data-testid=inv-row]:visible');
const rowOf = (p, email) => p.locator(`[data-testid=inv-row][data-email="${email}"]:visible`);
const toastText = async (p) => (await p.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

console.log('1. Arrivée sur /admin : une seule ligne repliée, planning visible');
reset(Array.from({ length: 15 }, (_, i) => inv(i + 1)));
let { ctx, p } = await open(PROD);
const bar = p.locator('[data-testid=pending-invitations]:visible');
check(await bar.count() === 1, 'le bloc des invitations est là');
check((await p.locator('[data-testid=inv-count]:visible').innerText()).trim() === '15 salariés n’ont pas encore activé leur compte', '« 15 salariés n’ont pas encore activé leur compte »');
check((await p.locator('[data-testid=inv-toggle]:visible').innerText()).trim() === 'Voir la liste', '« Voir la liste »');
check(await rows(p).count() === 0, 'repliée par défaut : aucune ligne de salarié affichée');
const barBox = await bar.boundingBox();
check(barBox && barBox.height <= 48, `une seule ligne (hauteur ${barBox && Math.round(barBox.height)} px)`);
const gridTop = await p.evaluate(() => { const t = document.querySelector('.bt-pl-table tbody tr'); return t ? t.getBoundingClientRect().top : 9999; });
check(gridTop < 860 - 120, `planning visible sans défiler (1re ligne à ${Math.round(gridTop)} px)`);
check(!(await p.content()).includes('Invitations en attente'), 'plus de bandeau jaune « Invitations en attente »');
await p.screenshot({ path: `${SH}/1-replie-ordinateur.png` });

console.log('2. Liste dépliée : jamais envoyées → « Envoyer l’invitation »');
await p.click('[data-testid=inv-toggle]:visible');
await p.waitForSelector('[data-testid=inv-row]:visible');
await until(async () => log.rpc > 0);
check(await rows(p).count() === 15, '15 lignes');
check(await p.locator('[data-testid=inv-send]:visible', { hasText: 'Envoyer l’invitation' }).count() === 15, '15 × « Envoyer l’invitation »');
check(await p.locator('[data-testid=inv-when]:visible').count() === 0, 'aucune date « Invitée le » (rien n’est parti)');
check((await p.locator('[data-testid=inv-send-all]:visible').innerText()).trim() === 'Envoyer toutes les invitations', 'bouton « Envoyer toutes les invitations »');
check((await p.locator('[data-testid=inv-toggle]:visible').innerText()).trim() === 'Masquer la liste', 'le lien devient « Masquer la liste »');
await p.screenshot({ path: `${SH}/2-liste-ordinateur.png` });

console.log('3. « Envoyer toutes les invitations » : confirmation, annuler = rien');
answer = 'dismiss'; dialogs = [];
await p.click('[data-testid=inv-send-all]:visible');
await p.waitForTimeout(400);
check(dialogs.length === 1 && dialogs[0].startsWith('Envoyer 15 e-mails ?'), `confirmation « Envoyer 15 e-mails ? » (${JSON.stringify(dialogs[0] || '').slice(0, 60)})`);
check(log.sends.length === 0, 'annuler : aucun envoi');

console.log('4. Envoi d’une seule ligne');
const first = 'salarie1@exemple.fr';
await rowOf(p, first).locator('[data-testid=inv-send]:visible').click();
await until(async () => (await rowOf(p, first).locator('[data-testid=inv-when]:visible').count()) === 1);
check(log.sends.length === 1 && log.sends[0].email === first && log.sends[0].company_id === CO && log.sends[0].first_name === 'Paul', 'un seul envoi, à la bonne adresse, bonne entreprise');
check((await rowOf(p, first).locator('[data-testid=inv-when]:visible').innerText()).trim() === `Invitée le ${ddmm(new Date())}`, `« Invitée le ${ddmm(new Date())} »`);
check((await rowOf(p, first).locator('[data-testid=inv-send]:visible').innerText()).trim() === 'Renvoyer', 'le bouton devient « Renvoyer »');
check((await toastText(p)).includes('Invitation envoyée à Paul Exemple1'), 'message « Invitation envoyée à … »');
check((await p.locator('[data-testid=inv-send-all]:visible').innerText()).trim() === 'Envoyer les 14 invitations non envoyées', 'groupé : « Envoyer les 14 invitations non envoyées »');

console.log('5. ✕ : confirmation avant de supprimer');
const second = 'salarie2@exemple.fr';
answer = 'dismiss'; dialogs = [];
await rowOf(p, second).locator('[data-testid=inv-remove]:visible').click();
await p.waitForTimeout(300);
check(dialogs.length === 1 && dialogs[0].startsWith('Supprimer l’invitation de Luc Exemple2 ?'), 'confirmation « Supprimer l’invitation de Luc Exemple2 ? »');
check(log.revokes.length === 0 && await rowOf(p, second).count() === 1, 'annuler : rien n’est supprimé');
answer = 'accept'; dialogs = [];
await rowOf(p, second).locator('[data-testid=inv-remove]:visible').click();
await until(async () => (await rowOf(p, second).count()) === 0);
check(log.revokes.length === 1 && log.revokes[0] === second, 'OK : révocation de CETTE adresse seulement');
check((await p.locator('[data-testid=inv-count]:visible').innerText()).trim() === '14 salariés n’ont pas encore activé leur compte', 'le compte passe à 14');

console.log('6. Envoi groupé confirmé : une fois chaque adresse non envoyée');
answer = 'accept'; dialogs = []; log.sends = [];
await p.click('[data-testid=inv-send-all]:visible');
let sawProgress = false;
await until(async () => { const t = await p.locator('[data-testid=inv-send-all]:visible').innerText().catch(() => ''); if (/Envoi \d+\/13…/.test(t)) sawProgress = true; return log.sends.length === 13 && !/Envoi/.test(t); }, 20000);
check(dialogs.length === 1 && dialogs[0].startsWith('Envoyer 13 e-mails ?'), 'confirmation « Envoyer 13 e-mails ? »');
const emails = log.sends.map((s) => s.email);
check(emails.length === 13 && new Set(emails).size === 13 && !emails.includes(first) && !emails.includes(second), '13 envois, chacun une fois, ni la ligne déjà envoyée ni la supprimée');
check(sawProgress, 'progression visible « Envoi n/13… »');
await until(async () => (await toastText(p)).includes('13 invitations envoyées'));
check((await toastText(p)).includes('13 invitations envoyées ✅'), 'message « 13 invitations envoyées ✅ »');
await until(async () => (await p.locator('[data-testid=inv-when]:visible').count()) === 14);
check(await p.locator('[data-testid=inv-when]:visible').count() === 14, 'les 14 lignes affichent « Invitée le … »');
check((await p.locator('[data-testid=inv-send-all]:visible').innerText()).trim() === 'Invitations envoyées à l’instant' && await p.locator('[data-testid=inv-send-all]:visible').isDisabled(), 'juste après : « Invitations envoyées à l’instant », rien à renvoyer en double');
await p.screenshot({ path: `${SH}/3-apres-envoi-ordinateur.png` });
await ctx.close();

console.log('7. Déjà invitée (date connue) : « Invitée le JJ/MM » + « Renvoyer »');
reset([inv(1), inv(2), inv(3)], { 'salarie2@exemple.fr': '2026-10-06T09:00:00Z' });
({ ctx, p } = await open(PROD));
await p.click('[data-testid=inv-toggle]:visible');
await until(async () => (await p.locator('[data-testid=inv-when]:visible').count()) === 1);
check((await rowOf(p, 'salarie2@exemple.fr').innerText()).includes('Invitée le 06/10'), '« Invitée le 06/10 »');
check((await rowOf(p, 'salarie2@exemple.fr').locator('[data-testid=inv-send]:visible').innerText()).trim() === 'Renvoyer', '« Renvoyer » sur la ligne déjà envoyée');
check((await p.locator('[data-testid=inv-send-all]:visible').innerText()).trim() === 'Envoyer les 2 invitations non envoyées', 'groupé : seulement les 2 non envoyées');

console.log('8. Erreur au 3e envoi : on s’arrête et on le dit');
await ctx.close();
reset(Array.from({ length: 5 }, (_, i) => inv(i + 1)));
FAIL_ON = 'salarie3@exemple.fr';
({ ctx, p } = await open(PROD));
await p.click('[data-testid=inv-toggle]:visible'); await p.waitForSelector('[data-testid=inv-row]:visible');
answer = 'accept'; dialogs = [];
await p.click('[data-testid=inv-send-all]:visible');
await until(async () => (await toastText(p)).includes('Échec'), 15000);
const err = await toastText(p);
check(log.sends.length === 3, `arrêt à la première erreur (${log.sends.length} appels sur 5)`);
check(err.includes('2 invitations envoyées sur 5') && err.includes('Échec pour Marc Exemple3') && err.includes('Les 2 suivantes n’ont pas été envoyées'), 'message : 2 sur 5, qui a échoué, les 2 suivantes non envoyées');
await p.waitForTimeout(800);
check((await p.locator('[data-testid=inv-count]:visible').innerText()).trim() === '5 salariés n’ont pas encore activé leur compte' && await rowOf(p, 'salarie3@exemple.fr').count() === 1, 'la personne en échec reste dans la liste (5 salariés)');
check((await p.locator('[data-testid=inv-send-all]:visible').innerText()).trim() === 'Envoyer les 3 invitations non envoyées', 'reprise : « Envoyer les 3 invitations non envoyées » (pas les 2 déjà parties)');
await ctx.close();

console.log('9. PRÉVIEW : envois et suppressions simulés, aucun appel serveur');
reset(Array.from({ length: 15 }, (_, i) => inv(i + 1)));
({ ctx, p } = await open(PREVIEW));
await p.click('[data-testid=inv-toggle]:visible'); await p.waitForSelector('[data-testid=inv-row]:visible');
check((await p.locator('[data-testid=inv-sim]:visible').innerText()).includes('aucun e-mail ne part'), 'bandeau « Préview : … aucun e-mail ne part »');
await until(async () => log.rpc > 0);
check(log.rpc > 0, 'la lecture des dates d’envoi est faite (lecture seule)');
await rowOf(p, first).locator('[data-testid=inv-send]:visible').click();
await until(async () => (await toastText(p)).includes('simulé'));
check((await toastText(p)).includes('envoi simulé') && log.sends.length === 0, 'envoi d’une ligne : simulé, zéro appel');
answer = 'accept';
await rowOf(p, second).locator('[data-testid=inv-remove]:visible').click();
await p.waitForTimeout(700);
check(log.revokes.length === 0 && await rowOf(p, second).count() === 1, '✕ confirmé : simulé, rien supprimé');
await p.click('[data-testid=inv-send-all]:visible');
await until(async () => (await toastText(p)).includes('envois simulés'), 15000);
check(log.sends.length === 0 && log.revokes.length === 0, 'envoi groupé : simulé, zéro appel serveur');
await p.screenshot({ path: `${SH}/4-preview-simulation.png` });
await ctx.close();

console.log('9 bis. Deux invitations pour la même adresse (envoi en cours ailleurs) : une seule ligne');
// La plus ANCIENNE arrive en premier : la liste garde quand même la plus récente.
reset([inv(1), inv(2), inv(1, { id: 'inv-1-bis', email: 'Salarie1@Exemple.fr', first_name: 'Jeanne', created_at: '2026-10-09T08:00:00Z' })]);
({ ctx, p } = await open(PROD));
check((await p.locator('[data-testid=inv-count]:visible').innerText()).trim() === '2 salariés n’ont pas encore activé leur compte', '3 lignes en base, 2 personnes : « 2 salariés… »');
await p.click('[data-testid=inv-toggle]:visible'); await p.waitForSelector('[data-testid=inv-row]:visible');
check(await rows(p).count() === 2, 'une seule ligne par personne');
check((await rows(p).allInnerTexts()).some((t) => t.includes('Jeanne')) && !(await rows(p).allInnerTexts()).some((t) => t.includes('Paul Exemple1')), 'c’est la plus récente qui est montrée');
await ctx.close();

console.log('10. Singulier, et rien quand tout le monde est actif');
reset([inv(7)]);
({ ctx, p } = await open(PROD));
check((await p.locator('[data-testid=inv-count]:visible').innerText()).trim() === '1 salarié n’a pas encore activé son compte', '« 1 salarié n’a pas encore activé son compte »');
await p.click('[data-testid=inv-toggle]:visible'); await p.waitForSelector('[data-testid=inv-row]:visible');
check(await p.locator('[data-testid=inv-send-all]:visible').count() === 0, 'pas de bouton groupé pour une seule invitation');
await ctx.close();
reset([]);
({ ctx, p } = await open(PROD));
check(await p.locator('[data-testid=pending-invitations]:visible').count() === 0, 'aucune invitation : aucune ligne');
await ctx.close();

console.log('10 bis. Dates d’envoi lentes puis illisibles : jamais d’envoi groupé à l’aveugle');
reset(Array.from({ length: 4 }, (_, i) => inv(i + 1)), { 'salarie1@exemple.fr': '2026-10-06T09:00:00Z' });
RPC_MODE = 'lent';
({ ctx, p } = await open(PROD));
await p.click('[data-testid=inv-toggle]:visible'); await p.waitForSelector('[data-testid=inv-row]:visible');
const allBtn = p.locator('[data-testid=inv-send-all]:visible');
check(await allBtn.isDisabled() && (await allBtn.innerText()).includes('Lecture des dates d’envoi'), 'pendant la lecture : bouton groupé désactivé « Lecture des dates d’envoi… »');
check(await p.locator('[data-testid=inv-send]:visible').first().isDisabled(), 'pendant la lecture : boutons de ligne désactivés');
await until(async () => !(await allBtn.isDisabled()), 6000);
check((await allBtn.innerText()).trim() === 'Envoyer les 3 invitations non envoyées', 'dates lues : « Envoyer les 3 invitations non envoyées »');
await ctx.close();
reset(Array.from({ length: 4 }, (_, i) => inv(i + 1)));
RPC_MODE = 'erreur';
({ ctx, p } = await open(PROD));
await p.click('[data-testid=inv-toggle]:visible'); await p.waitForSelector('[data-testid=inv-row]:visible');
await p.waitForSelector('[data-testid=inv-dates-ko]:visible');
check((await p.locator('[data-testid=inv-dates-ko]:visible').innerText()).includes('Dates d’envoi indisponibles'), 'lecture impossible : « Dates d’envoi indisponibles »');
check(await p.locator('[data-testid=inv-send-all]:visible').isDisabled(), 'lecture impossible : envoi groupé désactivé');
check((await p.locator('[data-testid=inv-send]:visible').first().innerText()).trim() === 'Envoyer / renvoyer', 'lecture impossible : bouton de ligne « Envoyer / renvoyer »');
RPC_MODE = 'ok';
await p.locator('[data-testid=inv-dates-ko]:visible button').click();
await until(async () => (await p.locator('[data-testid=inv-dates-ko]:visible').count()) === 0 && !(await p.locator('[data-testid=inv-send-all]:visible').isDisabled()));
check((await p.locator('[data-testid=inv-send-all]:visible').innerText()).trim() === 'Envoyer toutes les invitations', '« Réessayer » : dates lues, envoi groupé disponible');
await ctx.close();

console.log('10 ter. Un seul envoi à la fois, même en passant de l’ordinateur au téléphone');
reset(Array.from({ length: 3 }, (_, i) => inv(i + 1)));
SLOW_SEND = 'salarie1@exemple.fr';
({ ctx, p } = await open(PROD));
await p.click('[data-testid=inv-toggle]:visible'); await p.waitForSelector('[data-testid=inv-row]:visible');
await until(async () => !(await p.locator('[data-testid=inv-send]:visible').first().isDisabled()));
await rowOf(p, 'salarie1@exemple.fr').locator('[data-testid=inv-send]:visible').click(); // envoi lent (2,5 s)
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(300);
await p.click('[data-testid=inv-toggle]:visible'); await p.waitForSelector('[data-testid=inv-row]:visible');
check(await p.locator('[data-testid=inv-send]:visible').first().isDisabled(), 'l’autre exemplaire (téléphone) est bloqué pendant l’envoi');
await until(async () => log.sends.length === 1 && !(await p.locator('[data-testid=inv-send]:visible').first().isDisabled()), 6000);
check(log.sends.length === 1, 'un seul envoi parti');
SLOW_SEND = null;
await ctx.close();

console.log('11. Téléphone : rien ne déborde');
reset(Array.from({ length: 15 }, (_, i) => inv(i + 1)), { 'salarie4@exemple.fr': '2026-10-06T09:00:00Z' });
({ ctx, p } = await open(PROD, 390, 844, true));
const mBar = p.locator('[data-testid=pending-invitations]:visible');
check(await mBar.count() === 1, 'la ligne est visible sur téléphone');
const mBox = await mBar.boundingBox();
check(mBox && mBox.height <= 72, `ligne compacte (hauteur ${mBox && Math.round(mBox.height)} px)`);
const noScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check(await noScroll(), 'pas de défilement horizontal (repliée)');
await p.screenshot({ path: `${SH}/5-replie-telephone.png` });
await p.click('[data-testid=inv-toggle]:visible'); await p.waitForSelector('[data-testid=inv-row]:visible');
await until(async () => (await p.locator('[data-testid=inv-when]:visible').count()) === 1);
check(await noScroll(), 'pas de défilement horizontal (dépliée)');
const overflow = await p.evaluate(() => [...document.querySelectorAll('[data-testid=inv-row]')].some((row) => {
  const r = row.getBoundingClientRect();
  return [...row.querySelectorAll('button, span, b')].some((e) => { const x = e.getBoundingClientRect(); return x.width > 0 && (x.right > r.right + 1 || x.left < r.left - 1); });
}));
check(!overflow, 'aucun bouton ni texte ne dépasse de sa ligne');
await p.screenshot({ path: `${SH}/6-liste-telephone.png` });
await ctx.close();

await b.close(); srv.close();
console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
