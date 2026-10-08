// Inscription avec une adresse qui a DÉJÀ un compte : la page le dit, avec
// « Se connecter » et « Mot de passe oublié », au lieu de « vérifiez vos e-mails ».
//
// Lancer : npm run build, puis
//   node scripts/tests/inscription-compte-existant.mjs out docs/captures-inscription
// Vraie page /inscription (export statique), Supabase Auth SIMULÉ (aucun vrai
// compte, aucun e-mail). Même principe que scripts/tests/salarie-lot14.mjs.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-inscription', PORT = '4231'] = process.argv;
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

// Réponses de POST /auth/v1/signup, comme Supabase les renvoie.
const user = (identities) => ({
  id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: '', email: 'patron@exemple.fr',
  phone: '', confirmation_sent_at: '2026-10-08T08:00:00Z', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, identities, created_at: '2026-10-08T08:00:00Z', updated_at: '2026-10-08T08:00:00Z', is_anonymous: false,
});
const identity = { identity_id: 'i1', id: '11111111-1111-4111-8111-111111111111', user_id: '11111111-1111-4111-8111-111111111111', provider: 'email', identity_data: { email: 'patron@exemple.fr', email_verified: false } };
const MODES = {
  // Adresse déjà inscrite ET confirmée : 200, identities vide, aucun e-mail.
  existant: { status: 200, body: user([]) },
  // Nouvelle adresse : 200, une identité, e-mail de confirmation envoyé.
  nouveau: { status: 200, body: user([identity]) },
  // Réglage Supabase qui renvoie une erreur au lieu de masquer.
  erreur: { status: 422, headers: { 'x-supabase-api-version': '2024-01-01' }, body: { code: 'user_already_exists', message: 'User already registered' } },
};
let mode = 'existant';
const signups = [];

let ok = 0, ko = 0;
const check = (cond, label) => { if (cond) { ok++; console.log(`  ✓ ${label}`); } else { ko++; console.log(`  ✗ ${label}`); } };

async function page(viewport) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/auth/v1/signup')) {
      signups.push(JSON.parse(r.request().postData() || '{}'));
      const m = MODES[mode];
      return r.fulfill({ status: m.status, headers: m.headers, contentType: 'application/json', body: JSON.stringify(m.body) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  // Aucune requête tierce (polices Google, mesure d'audience) pendant le test.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)(?!.*supabase\.co)/, (r) => r.abort());
  // Espion GA4 : la page appelle window.bxTrack('sign_up') pour un compte créé.
  await ctx.addInitScript(() => {
    window.__events = [];
    Object.defineProperty(window, 'bxTrack', { configurable: false, get: () => (n) => window.__events.push(n), set: () => {} });
  });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/inscription`);
  await p.waitForSelector('#company-name');
  return { ctx, p };
}
async function fill(p, email = 'patron@exemple.fr') {
  await p.fill('#company-name', 'Mister Kebab Grill');
  await p.fill('#firstname', 'Fatih');
  await p.fill('#lastname', 'Test');
  await p.fill('#signup-email', email);
  await p.fill('#signup-password', 'Bemexo2026Test');
}
const submit = async (p) => { await p.click('button[type=submit]'); await p.waitForSelector('.bt-exists, .bt-info, .bt-err'); };
const signUps = (p) => p.evaluate(() => window.__events.filter((n) => n === 'sign_up').length);

for (const [name, vp] of [['telephone', { width: 390, height: 844 }], ['ordinateur', { width: 1366, height: 860 }]]) {
  console.log(`\n── ${name} ──`);

  console.log('1. Adresse déjà inscrite et confirmée (200, identities vide)');
  mode = 'existant'; signups.length = 0;
  let { ctx, p } = await page(vp);
  await fill(p); await submit(p);
  const box = p.locator('.bt-exists');
  check(await box.isVisible(), 'encadré « compte existant » visible');
  check((await box.textContent()).includes('Un compte existe déjà avec cet e-mail.'), 'texte « Un compte existe déjà avec cet e-mail. »');
  check(!(await p.locator('.bt-info').count()), 'PAS de « Compte créé. Vérifiez votre email »');
  check(!(await p.locator('.bt-err').count()), 'pas d\'erreur rouge');
  check(await p.locator('.bt-exists a', { hasText: 'Se connecter' }).getAttribute('href') === '/connexion', 'bouton « Se connecter » → /connexion');
  check(await p.locator('.bt-exists a', { hasText: 'Mot de passe oublié' }).getAttribute('href') === '/mot-de-passe-oublie', 'bouton « Mot de passe oublié » → /mot-de-passe-oublie');
  check(signups.length === 1 && signups[0].email === 'patron@exemple.fr' && signups[0].data?.company_name === 'Mister Kebab Grill', 'un seul appel signUp, adresse et entreprise transmises');
  check(await signUps(p) === 0, 'aucun événement GA4 « sign_up » pour un doublon');
  check(await p.evaluate(() => document.activeElement?.textContent) === 'Se connecter', 'focus clavier sur « Se connecter »');
  check((await box.textContent()).includes('Salarié invité par votre employeur'), 'ligne pour le salarié invité');
  await box.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${SH}/1-compte-existant-${name}.png`, fullPage: false });

  console.log('2. On corrige l\'adresse : l\'encadré disparaît');
  await p.fill('#signup-email', 'autre@exemple.fr');
  check(!(await box.count()), 'encadré retiré dès que l\'adresse change');

  console.log('3. « Mot de passe oublié » ouvre la bonne page');
  await fill(p); await submit(p);
  await p.click('.bt-exists a:has-text("Mot de passe oublié")');
  await p.waitForURL(/\/mot-de-passe-oublie/);
  check(/\/mot-de-passe-oublie/.test(p.url()), 'page /mot-de-passe-oublie ouverte');
  await ctx.close();

  console.log('4. « Se connecter » ouvre la connexion');
  ({ ctx, p } = await page(vp));
  await fill(p); await submit(p);
  await p.click('.bt-exists a:has-text("Se connecter")');
  await p.waitForURL(/\/connexion/);
  check(/\/connexion/.test(p.url()), 'page /connexion ouverte');
  await ctx.close();

  console.log('5. Nouvelle adresse (200, une identité) : message habituel inchangé');
  mode = 'nouveau';
  ({ ctx, p } = await page(vp));
  await fill(p, 'nouveau@exemple.fr'); await submit(p);
  check((await p.locator('.bt-info').textContent()).startsWith('Compte créé. Vérifiez votre email'), '« Compte créé. Vérifiez votre email… » affiché');
  check(await signUps(p) === 1, 'un événement GA4 « sign_up » pour le compte créé');
  check(!(await p.locator('.bt-exists').count()), 'pas d\'encadré « compte existant »');
  await p.screenshot({ path: `${SH}/2-nouveau-compte-${name}.png`, fullPage: false });
  await ctx.close();

  console.log('6. Réponse en erreur « User already registered » : même encadré');
  mode = 'erreur';
  ({ ctx, p } = await page(vp));
  await fill(p); await submit(p);
  check(await p.locator('.bt-exists').isVisible(), 'encadré « compte existant » visible');
  check(!(await p.locator('.bt-err').count()), 'pas de message anglais ni d\'erreur rouge');
  await ctx.close();
}

await b.close(); srv.close();
console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
