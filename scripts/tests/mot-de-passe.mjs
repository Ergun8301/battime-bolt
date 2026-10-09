// Mot de passe : règle simplifiée (8 caractères, 1 lettre, 1 chiffre, 1 caractère spécial),
// coches vertes sous le champ, bouton œil sur chaque champ mot de passe, exemple neutre
// « Ex. Soleil-Mars-27 » (aucun nom de client) ; après « Créer mon mot de passe » ou
// « Réinitialiser », connexion directe (sinon message + e-mail déjà rempli) ;
// page « Mot de passe oublié » au même design.
//
// Lancer : npm run build, puis
//   node scripts/tests/mot-de-passe.mjs out docs/captures-mot-de-passe
// Vraies pages (export statique), Supabase SIMULÉ (aucun vrai compte, aucun e-mail).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-mot-de-passe', PORT = '4251'] = process.argv;
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

let ok = 0, ko = 0;
const check = (cond, label) => { if (cond) { ok++; console.log(`  ✓ ${label}`); } else { ko++; console.log(`  ✗ ${label}`); } };

const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '22222222-2222-4222-8222-222222222222';
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: now + 3600, aal: 'aal1' })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'salarie@exemple.fr', app_metadata: {}, user_metadata: {}, identities: [{ id: UID, provider: 'email' }], created_at: '2026-10-08T08:00:00Z' };
const calls = [];
let memeMotDePasse = false; // le serveur répond « same_password » au changement de mot de passe
let profil = 'vide'; // lecture du rôle après le nouveau mot de passe : 'vide' | 'admin' | 'worker' | 'erreur'
let recoverRefus = false; // « mot de passe oublié » : le serveur répond « patientez »

async function page(url, viewport = { width: 390, height: 844 }) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const u = new URL(r.request().url()); const m = r.request().method();
    calls.push({ m, path: u.pathname, body: r.request().postData() });
    if (u.pathname.endsWith('/auth/v1/signup')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...user, identities: [{ id: UID, provider: 'email' }] }) });
    if (u.pathname.endsWith('/auth/v1/user') && m === 'PUT' && memeMotDePasse) return r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' }) });
    if (u.pathname.endsWith('/auth/v1/user')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    if (u.pathname.endsWith('/auth/v1/recover')) return recoverRefus
      ? r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 45 seconds.' }) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (u.pathname.endsWith('/rest/v1/users') && m === 'GET') {
      if (profil === 'erreur') return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'panne' }) });
      const rows = profil === 'vide' ? [] : [{ role: profil }];
      const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? (rows[0] ?? null) : rows) });
    }
    if (u.pathname.endsWith('/functions/v1/kiosk')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: 'tk', kiosk_name: 'Borne' }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)(?!.*supabase\.co)/, (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}${url}`);
  return { ctx, p };
}
const states = (p, sel) => p.$$eval(`${sel} .pw-rules li`, (lis) => lis.map((li) => li.getAttribute('data-ok')));
const eyeToggles = async (p, inputSel, label) => {
  const input = p.locator(inputSel);
  const eye = p.locator(`${inputSel} + button.pw-eye`);
  check(await input.getAttribute('type') === 'password', `${label} : masqué au départ`);
  check(await eye.getAttribute('aria-label') === 'Afficher le mot de passe', `${label} : bouton œil « Afficher le mot de passe »`);
  await eye.click();
  check(await input.getAttribute('type') === 'text' && await eye.getAttribute('aria-pressed') === 'true', `${label} : l'œil affiche le mot de passe`);
  check(await eye.getAttribute('aria-label') === 'Masquer le mot de passe', `${label} : puis « Masquer le mot de passe »`);
  await eye.click();
  check(await input.getAttribute('type') === 'password', `${label} : l'œil le masque de nouveau`);
};

console.log('1. Inscription : règle sous le champ, coches au fur et à mesure');
let { ctx, p } = await page('/inscription');
await p.waitForSelector('#signup-password');
const wrapSel = 'div:has(> div > #signup-password)';
check(JSON.stringify(await states(p, wrapSel)) === '["non","non","non","non"]', 'champ vide : 4 conditions, aucune cochée');
const labels = await p.$$eval(`${wrapSel} .pw-rules li`, (lis) => lis.map((li) => li.textContent));
check(labels[0].startsWith('8 caractères minimum') && labels[1].startsWith('Au moins 1 lettre') && labels[2].startsWith('Au moins 1 chiffre') && labels[3].startsWith('Au moins 1 caractère spécial'), 'libellés : 8 caractères, 1 lettre, 1 chiffre, 1 caractère spécial');
check(!labels.join(' ').toLowerCase().includes('majuscule') && !labels.join(' ').includes('12'), 'plus de majuscule ni de 12 caractères');
await p.fill('#signup-password', 'soleil');
check(JSON.stringify(await states(p, wrapSel)) === '["non","oui","non","non"]', '« soleil » : seule la lettre est cochée');
await p.fill('#signup-password', 'soleil2027');
check(JSON.stringify(await states(p, wrapSel)) === '["oui","oui","oui","non"]', '« soleil2027 » : tout coché sauf le caractère spécial');
await p.fill('#signup-password', 'Bétonnière2');
check(JSON.stringify(await states(p, wrapSel)) === '["oui","oui","oui","non"]', '« Bétonnière2 » : une lettre accentuée ne compte pas comme caractère spécial');
await p.fill('#signup-password', '12/05/1990');
check(JSON.stringify(await states(p, wrapSel)) === '["oui","non","oui","oui"]', '« 12/05/1990 » : pas de lettre, la case reste vide (le serveur le refuserait)');
await p.fill('#signup-password', 'Soleil-Mars-27');
check(JSON.stringify(await states(p, wrapSel)) === '["oui","oui","oui","oui"]', '« Soleil-Mars-27 » : les 4 coches vertes');
const color = await p.$eval(`${wrapSel} .pw-rules li[data-ok="oui"]`, (li) => getComputedStyle(li).color);
check(color === 'rgb(31, 122, 77)', 'coche remplie en vert');
await eyeToggles(p, '#signup-password', 'inscription');
await p.fill('#signup-password', 'soleil-mars-27');
await p.screenshot({ path: `${SH}/1-inscription-regle-telephone.png`, fullPage: true });

console.log('2. Inscription : envoi refusé sans caractère spécial, accepté avec');
await p.fill('#company-name', 'Test'); await p.fill('#firstname', 'Jean'); await p.fill('#lastname', 'Test'); await p.fill('#signup-email', 'patron@exemple.fr');
calls.length = 0;
await p.fill('#signup-password', 'soleil2027');
await p.click('button[type=submit]');
await p.waitForSelector('.bt-err');
check((await p.textContent('.bt-err')).includes('caractère spécial'), 'message : il manque un caractère spécial');
check(!calls.some((c) => c.path.endsWith('/signup')), 'aucune requête d\'inscription envoyée');
await p.fill('#signup-password', '12/05/1990');
await p.click('button[type=submit]');
await p.waitForFunction(() => document.querySelector('.bt-err')?.textContent.includes('une lettre'));
check(!calls.some((c) => c.path.endsWith('/signup')), '« 12/05/1990 » : refusé avant l\'envoi (il manque une lettre)');
await p.fill('#signup-password', 'soleil-mars-27');
await p.click('button[type=submit]');
await p.waitForSelector('.bt-info');
const sent = calls.find((c) => c.path.endsWith('/signup'));
check(!!sent && JSON.parse(sent.body).password === 'soleil-mars-27', '« soleil-mars-27 » (sans majuscule) : inscription envoyée');
await ctx.close();

console.log('3. Connexion : bouton œil, pas de règle (mot de passe déjà choisi)');
({ ctx, p } = await page('/connexion'));
await p.waitForSelector('#login-password');
await eyeToggles(p, '#login-password', 'connexion');
check(await p.locator('div:has(> div > #login-password) .pw-rules').count() === 0, 'pas de liste de conditions sur la connexion');
check(await p.getAttribute('#login-password', 'autocomplete') === 'current-password', 'le gestionnaire de mots de passe peut remplir le champ');
await ctx.close();

console.log('4. Lien « mot de passe oublié » : nouveau mot de passe avec coches et œil');
calls.length = 0;
({ ctx, p } = await page(`/connexion#access_token=${jwt}&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery`));
await p.waitForSelector('#new-password');
const newSel = 'div:has(> div > #new-password)';
check((await p.textContent('label[for=new-password]')).trim() === 'Nouveau mot de passe' && (await p.textContent('button[type=submit]')).trim() === 'Réinitialiser', 'libellés « Nouveau mot de passe » et « Réinitialiser »');
check(JSON.stringify(await states(p, newSel)) === '["non","non","non","non"]', 'nouveau mot de passe : 4 conditions affichées');
check(await p.locator('div:has(> div > #confirm-new-password) .pw-rules').count() === 0, 'confirmation : pas de liste (une seule suffit)');
await eyeToggles(p, '#new-password', 'nouveau mot de passe');
await eyeToggles(p, '#confirm-new-password', 'confirmation');
await p.fill('#new-password', 'Soleil-Mars-27');
check(JSON.stringify(await states(p, newSel)) === '["oui","oui","oui","oui"]', '« Soleil-Mars-27 » : 4 coches vertes');
await p.fill('#confirm-new-password', 'Soleil-Mars-27');
await p.screenshot({ path: `${SH}/2-nouveau-mot-de-passe-telephone.png`, fullPage: true });
await p.click('button[type=submit]');
await p.waitForTimeout(800);
const put = calls.find((c) => c.m === 'PUT' && c.path.endsWith('/auth/v1/user'));
check(!!put && JSON.parse(put.body).password === 'Soleil-Mars-27', 'mot de passe envoyé au serveur');
await p.waitForSelector('[data-testid=login-notice]', { timeout: 6000 });
check((await p.textContent('[data-testid=login-notice]')).trim() === 'Mot de passe modifié ✅ Connectez-vous', 'profil illisible : « Mot de passe modifié ✅ Connectez-vous »');
check(await p.inputValue('#login-email') === 'salarie@exemple.fr', 'l’e-mail est déjà rempli');
await ctx.close();

console.log('4 bis. Réinitialiser (bureau) : connexion directe sur le planning');
profil = 'admin'; calls.length = 0;
({ ctx, p } = await page(`/connexion#access_token=${jwt}&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery`));
await p.waitForSelector('#new-password');
await p.fill('#new-password', 'Soleil-Mars-27'); await p.fill('#confirm-new-password', 'Soleil-Mars-27');
await p.click('button[type=submit]');
await p.waitForSelector('[data-testid=password-saved]');
check((await p.textContent('[data-testid=password-saved]')).includes('Mot de passe modifié ✅'), 'message « Mot de passe modifié ✅ »');
await p.waitForURL('**/admin', { timeout: 8000 }).catch(() => {});
check(new URL(p.url()).pathname.replace(/\.html$/, '') === '/admin', `arrivée directe sur /admin (${new URL(p.url()).pathname})`);
await ctx.close();

console.log('5. Lien d\'invitation : même champ');
({ ctx, p } = await page(`/connexion#access_token=${jwt}&refresh_token=r&expires_in=3600&token_type=bearer&type=invite`));
await p.waitForSelector('#new-password');
check(await p.locator('div:has(> div > #new-password) .pw-rules li').count() === 4, 'création du mot de passe : 4 conditions');
check((await p.textContent('label[for=new-password]')).trim() === 'Créer un mot de passe', 'invitation : libellé « Créer un mot de passe »');
await p.fill('#new-password', 'abc');
await p.fill('#confirm-new-password', 'abc');
await p.click('button[type=submit]');
await p.waitForSelector('.bt-err');
check((await p.textContent('.bt-err')).includes('au moins 8 caractères'), 'trop court : message en français');
check(await p.getAttribute('#new-password', 'placeholder') === 'Ex. Soleil-Mars-27', 'exemple neutre « Ex. Soleil-Mars-27 » (création)');
profil = 'worker';
await p.fill('#new-password', 'Soleil-Mars-27'); await p.fill('#confirm-new-password', 'Soleil-Mars-27');
await p.click('button[type=submit]');
await p.waitForSelector('[data-testid=password-saved]');
check((await p.textContent('[data-testid=password-saved]')).includes('Mot de passe créé ✅'), 'message « Mot de passe créé ✅ »');
await p.waitForURL('**/poseur', { timeout: 8000 }).catch(() => {});
check(new URL(p.url()).pathname.replace(/\.html$/, '') === '/poseur', `salarié : arrivée directe sur « Ma journée » (${new URL(p.url()).pathname})`);
await ctx.close();

console.log('5 ter. Invitation, profil en panne : message + e-mail rempli');
profil = 'erreur';
({ ctx, p } = await page(`/connexion#access_token=${jwt}&refresh_token=r&expires_in=3600&token_type=bearer&type=invite`));
await p.waitForSelector('#new-password');
await p.fill('#new-password', 'Soleil-Mars-27'); await p.fill('#confirm-new-password', 'Soleil-Mars-27');
await p.click('button[type=submit]');
await p.waitForSelector('[data-testid=login-notice]', { timeout: 6000 });
check((await p.textContent('[data-testid=login-notice]')).trim() === 'Mot de passe créé ✅ Connectez-vous', '« Mot de passe créé ✅ Connectez-vous »');
check(await p.inputValue('#login-email') === 'salarie@exemple.fr', 'l’e-mail est déjà rempli');
profil = 'vide';
await ctx.close();

console.log('5 bis. Mot de passe oublié, puis le même mot de passe qu\'avant');
memeMotDePasse = true;
({ ctx, p } = await page(`/connexion#access_token=${jwt}&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery`));
await p.waitForSelector('#new-password');
await p.fill('#new-password', 'Soleil-Mars-27');
await p.fill('#confirm-new-password', 'Soleil-Mars-27');
await p.click('button[type=submit]');
await p.waitForSelector('.bt-err');
const errMeme = await p.textContent('.bt-err');
check(errMeme.includes('déjà votre mot de passe actuel') && !errMeme.includes('Mot de passe refusé'), 'message « C’est déjà votre mot de passe actuel », pas la règle');
memeMotDePasse = false;
await ctx.close();

console.log('6. Pointage QR (/pointer) : bouton œil');
({ ctx, p } = await page('/pointer?k=borne&c=123456'));
await p.waitForSelector('#kx-pass');
await eyeToggles(p, '#kx-pass', 'pointage QR');
await ctx.close();

console.log('7. Ordinateur : inscription');
({ ctx, p } = await page('/inscription', { width: 1366, height: 860 }));
await p.waitForSelector('#signup-password');
await p.fill('#signup-password', 'Soleil-Mars-27');
await p.locator('#signup-password').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${SH}/3-inscription-regle-ordinateur.png` });
check(JSON.stringify(await states(p, wrapSel)) === '["oui","oui","oui","oui"]', 'ordinateur : 4 coches vertes');
check(await p.getAttribute('#signup-password', 'placeholder') === 'Ex. Soleil-Mars-27', 'exemple neutre « Ex. Soleil-Mars-27 » (inscription)');
await ctx.close();

console.log('8. « Mot de passe oublié » : même design, e-mail repris, messages en français');
({ ctx, p } = await page('/connexion'));
await p.waitForSelector('#login-email');
await p.fill('#login-email', 'jean@exemple.fr');
check((await p.getAttribute('a.bt-forgot', 'href')) === '/mot-de-passe-oublie', '« Oublié ? » : lien fixe, sans l’e-mail dans l’adresse');
await p.click('a.bt-forgot');
await p.waitForSelector('#reset-email');
check(!p.url().includes('jean') && !p.url().includes('%40'), 'l’e-mail n’apparaît pas dans l’adresse de la page');
check(await p.locator('.bt-auth .bt-card .bt-logo-badge').count() === 1, 'même carte et même logo que « Réinitialiser le mot de passe »');
check((await p.textContent('h1')).trim() === 'Mot de passe oublié', 'titre accentué « Mot de passe oublié »');
check(await p.locator('svg circle[r="10"]').count() === 0, 'plus d’icône horloge');
check((await p.textContent('label[for=reset-email]')).trim() === 'E-mail' && (await p.textContent('button[type=submit]')).trim() === 'Envoyer le lien', 'libellés « E-mail » et « Envoyer le lien »');
check(await p.inputValue('#reset-email') === 'jean@exemple.fr', 'l’e-mail est déjà rempli');
await p.screenshot({ path: `${SH}/4-mot-de-passe-oublie-telephone.png`, fullPage: true });
recoverRefus = true;
await p.click('button[type=submit]');
await p.waitForSelector('.bt-err');
check((await p.textContent('.bt-err')).includes('Patientez une minute'), 'refus « patientez » traduit en français');
recoverRefus = false; calls.length = 0;
await p.click('button[type=submit]');
await p.waitForSelector('[data-testid=reset-sent]');
const rec = calls.find((c) => c.path.endsWith('/auth/v1/recover'));
check(!!rec && JSON.parse(rec.body).email === 'jean@exemple.fr', 'demande envoyée pour la bonne adresse');
const sentTxt = await p.textContent('[data-testid=reset-sent]');
check(sentTxt.includes('E-mail envoyé ✅') && sentTxt.includes('24'), '« E-mail envoyé ✅ … valable 24 h »');
await p.screenshot({ path: `${SH}/5-mot-de-passe-oublie-envoye.png`, fullPage: true });
await ctx.close();

console.log('9. Aucun nom de client dans les écrans d’accès');
for (const url of ['/inscription', '/connexion', '/mot-de-passe-oublie', '/pointer?k=borne&c=123456']) {
  ({ ctx, p } = await page(url));
  await p.waitForTimeout(500);
  // Champs mot de passe : seul exemple possible, l'exemple neutre (aucun prénom
  // ni nom de client) ; sinon des points (champ « confirmer », connexion).
  const exemples = await p.$$eval('input[type=password], input[autocomplete$=password]', (els) => els.map((e) => e.getAttribute('placeholder') || ''));
  check(exemples.every((e) => e === '' || e === 'Ex. Soleil-Mars-27' || /^•+$/.test(e)), `${url} : champs mot de passe, seul exemple « Ex. Soleil-Mars-27 » (${exemples.join(' | ') || 'aucun champ'})`);
  await ctx.close();
}
await b.close(); srv.close();
console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
