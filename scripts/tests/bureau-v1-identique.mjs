// Preuve que le bureau d'AVANT n'a pas bougé : depuis la bascule (bureau v2 par défaut), le bureau d'avant s'ouvre par `?ui=1` (porte de secours) ; son HTML
// (branche, `?ui=1`) est IDENTIQUE à celui d'un build de la base d'avant la bascule (sans paramètre) (octet pour octet, une fois les seuls
// identifiants générés par le navigateur retirés). Deux builds : le build de la base (origin/claude/bureau-lot1) et celui de la branche.
//   node scripts/tests/bureau-v1-identique.mjs <build-de-la-base> <build-de-la-branche> [port]
// Mêmes données simulées, même horloge figée (bureau-sim.mjs). Étapes comparées : le planning à 1440 px, à 1024 px, au téléphone (390 px), la fenêtre d'une intervention
// (ordinateur), le menu ☰ ouvert (téléphone), le menu du compte, la liste « Clients ».
import fs from 'node:fs';
import { demarrer } from './bureau-sim.mjs';
const [,, BASE, BRANCHE, PORT = '4701'] = process.argv;
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };

async function releves(out, port, ui = null) {
  const sim = await demarrer({ out, port });
  const r = {};
  const normalise = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/ id="[^"]*"/g, '').replace(/aria-(labelledby|describedby|controls)="[^"]*"/g, '').replace(/\bradix-[:\w-]+/g, 'radix');
  const prendre = async (page, cle, sel = 'body') => { r[cle] = normalise(await page.evaluate((s) => { const e = document.querySelector(s); return e ? e.outerHTML : ''; }, sel)); };
  for (const [nom, largeur, hauteur, tactile] of [['1440', 1440, 900, false], ['1024', 1024, 768, false], ['390', 390, 844, true]]) {
    sim.reinitialiser();
    const { page, ctx } = await sim.page({ ui, largeur, hauteur, hasTouch: tactile, attente: tactile ? '.bt-pl-m-card' : '.bt-pl-gridwrap .bt-pl-grab' }); // au téléphone, la grille d'ordinateur est cachée : on attend une carte visible
    await prendre(page, `planning-${nom}`, '.bt-admin');
    if (nom === '1440') {
      await page.locator('.bt-pl-acct').first().click(); await page.waitForTimeout(400); await prendre(page, 'compte', '.bt-admin'); await page.mouse.click(10, 500); await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'Clients', exact: true }).click().catch(() => page.locator('.bt-pl-segbtn', { hasText: 'Clients' }).click()); await page.waitForTimeout(400); await prendre(page, 'clients', '.bt-admin'); await page.mouse.click(1300, 700); await page.waitForTimeout(300);
      await page.locator('.bt-pl-grab').first().click(); await page.waitForTimeout(700); await prendre(page, 'intervention', 'body');
    }
    if (nom === '390') { await page.locator('button[aria-label="Menu"]').first().click(); await page.waitForTimeout(700); await prendre(page, 'menu-390', 'body'); }
    await ctx.close();
  }
  await sim.fermer();
  return r;
}
const a = await releves(BASE, Number(PORT));
const b = await releves(BRANCHE, Number(PORT) + 1, 1); // la branche : le bureau d'avant par `?ui=1`
for (const cle of Object.keys(a)) {
  const egal = a[cle] === b[cle] && a[cle].length > 500;
  check(egal, `${cle} : HTML identique à la base (${a[cle].length} octets)`);
  if (!egal) { fs.writeFileSync(`/tmp/diff-${cle}-base.html`, a[cle]); fs.writeFileSync(`/tmp/diff-${cle}-branche.html`, b[cle]); }
}
console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
