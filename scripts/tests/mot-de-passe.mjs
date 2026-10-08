// Mot de passe : règle simplifiée (8 caractères, 1 chiffre, 1 caractère spécial),
// coches vertes sous le champ, bouton œil sur chaque champ mot de passe.
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

async function page(url, viewport = { width: 390, height: 844 }) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const u = new URL(r.request().url()); const m = r.request().method();
    calls.push({ m, path: u.pathname, body: r.request().postData() });
    if (u.pathname.endsWith('/auth/v1/signup')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...user, identities: [{ id: UID, provider: 'email' }] }) });
    if (u.pathname.endsWith('/auth/v1/user')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
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
check(JSON.stringify(await states(p, wrapSel)) === '["non","non","non"]', 'champ vide : 3 conditions, aucune cochée');
const labels = await p.$$eval(`${wrapSel} .pw-rules li`, (lis) => lis.map((li) => li.textContent));
check(labels[0].startsWith('8 caractères minimum') && labels[1].startsWith('Au moins 1 chiffre') && labels[2].startsWith('Au moins 1 caractère spécial'), 'libellés : 8 caractères, 1 chiffre, 1 caractère spécial');
check(!labels.join(' ').toLowerCase().includes('majuscule') && !labels.join(' ').includes('12'), 'plus de majuscule ni de 12 caractères');
await p.fill('#signup-password', 'fatih');
check(JSON.stringify(await states(p, wrapSel)) === '["non","non","non"]', '« fatih » : rien de coché');
await p.fill('#signup-password', 'fatih2024');
check(JSON.stringify(await states(p, wrapSel)) === '["oui","oui","non"]', '« fatih2024 » : longueur et chiffre cochés, pas le caractère spécial');
await p.fill('#signup-password', 'Bétonnière2');
check(JSON.stringify(await states(p, wrapSel)) === '["oui","oui","non"]', '« Bétonnière2 » : une lettre accentuée ne compte pas comme caractère spécial');
await p.fill('#signup-password', 'Fatih.2024');
check(JSON.stringify(await states(p, wrapSel)) === '["oui","oui","oui"]', '« Fatih.2024 » : les 3 coches vertes');
const color = await p.$eval(`${wrapSel} .pw-rules li[data-ok="oui"]`, (li) => getComputedStyle(li).color);
check(color === 'rgb(31, 122, 77)', 'coche remplie en vert');
await eyeToggles(p, '#signup-password', 'inscription');
await p.fill('#signup-password', 'fatih.2024');
await p.screenshot({ path: `${SH}/1-inscription-regle-telephone.png`, fullPage: true });

console.log('2. Inscription : envoi refusé sans caractère spécial, accepté avec');
await p.fill('#company-name', 'Test'); await p.fill('#firstname', 'Fatih'); await p.fill('#lastname', 'Test'); await p.fill('#signup-email', 'patron@exemple.fr');
calls.length = 0;
await p.fill('#signup-password', 'fatih2024');
await p.click('button[type=submit]');
await p.waitForSelector('.bt-err');
check((await p.textContent('.bt-err')).includes('caractère spécial'), 'message : il manque un caractère spécial');
check(!calls.some((c) => c.path.endsWith('/signup')), 'aucune requête d\'inscription envoyée');
await p.fill('#signup-password', 'fatih.2024');
await p.click('button[type=submit]');
await p.waitForSelector('.bt-info');
const sent = calls.find((c) => c.path.endsWith('/signup'));
check(!!sent && JSON.parse(sent.body).password === 'fatih.2024', '« fatih.2024 » (sans majuscule) : inscription envoyée');
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
check(JSON.stringify(await states(p, newSel)) === '["non","non","non"]', 'nouveau mot de passe : 3 conditions affichées');
check(await p.locator('div:has(> div > #confirm-new-password) .pw-rules').count() === 0, 'confirmation : pas de liste (une seule suffit)');
await eyeToggles(p, '#new-password', 'nouveau mot de passe');
await eyeToggles(p, '#confirm-new-password', 'confirmation');
await p.fill('#new-password', 'Fatih.2024');
check(JSON.stringify(await states(p, newSel)) === '["oui","oui","oui"]', '« Fatih.2024 » : 3 coches vertes');
await p.fill('#confirm-new-password', 'Fatih.2024');
await p.screenshot({ path: `${SH}/2-nouveau-mot-de-passe-telephone.png`, fullPage: true });
await p.click('button[type=submit]');
await p.waitForTimeout(800);
const put = calls.find((c) => c.m === 'PUT' && c.path.endsWith('/auth/v1/user'));
check(!!put && JSON.parse(put.body).password === 'Fatih.2024', 'mot de passe envoyé au serveur');
check(await p.locator('text=Mot de passe réinitialisé').count() === 1, 'message « Mot de passe réinitialisé ! »');
await ctx.close();

console.log('5. Lien d\'invitation : même champ');
({ ctx, p } = await page(`/connexion#access_token=${jwt}&refresh_token=r&expires_in=3600&token_type=bearer&type=invite`));
await p.waitForSelector('#new-password');
check(await p.locator('div:has(> div > #new-password) .pw-rules li').count() === 3, 'création du mot de passe : 3 conditions');
check((await p.textContent('label[for=new-password]')).trim() === 'Créer un mot de passe', 'invitation : libellé « Créer un mot de passe »');
await p.fill('#new-password', 'abc');
await p.fill('#confirm-new-password', 'abc');
await p.click('button[type=submit]');
await p.waitForSelector('.bt-err');
check((await p.textContent('.bt-err')).includes('au moins 8 caractères'), 'trop court : message en français');
await ctx.close();

console.log('6. Pointage QR (/pointer) : bouton œil');
({ ctx, p } = await page('/pointer?k=borne&c=123456'));
await p.waitForSelector('#kx-pass');
await eyeToggles(p, '#kx-pass', 'pointage QR');
await ctx.close();

console.log('7. Ordinateur : inscription');
({ ctx, p } = await page('/inscription', { width: 1366, height: 860 }));
await p.waitForSelector('#signup-password');
await p.fill('#signup-password', 'Fatih.2024');
await p.locator('#signup-password').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${SH}/3-inscription-regle-ordinateur.png` });
check(JSON.stringify(await states(p, wrapSel)) === '["oui","oui","oui"]', 'ordinateur : 3 coches vertes');
await ctx.close();

await b.close(); srv.close();
console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
