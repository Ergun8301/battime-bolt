// Lot « Heures et objectifs » (PR A) : heures 00:00 → 23:45, roulette dans la liste, objectif hebdo par salarié sous le nom.
//   npm run build && node scripts/tests/heures-objectifs.mjs out docs/captures-heures-objectifs 4471 apres
//   (avec un build de main dans out-avant : … out-avant docs/captures-heures-objectifs 4472 avant → captures seulement, sans contrôles)
// Base SIMULÉE de bureau-sim.mjs (jeudi 15 octobre 2026, 09:30 ; aucune vraie base, aucun e-mail). Bruno a 17 h dans sa fiche, les autres l'horaire de l'entreprise.
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';
const [,, OUT = 'out', SH = 'docs/captures-heures-objectifs', PORT = '4471', NOM = 'apres'] = process.argv;
const controles = NOM !== 'avant';
fs.mkdirSync(SH, { recursive: true });
let ok = 0, ko = 0;
const check = (c, m) => { if (!controles) return; if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sim = await demarrer({ out: OUT, port: Number(PORT) });
const preparer = () => { sim.reinitialiser(); sim.D.user_payroll = [{ user_id: 'u-bruno', company_id: 'c0000000-0000-0000-0000-0000000000b1', weekly_hours: 17 }]; };
const img = (n) => path.join(SH, `${n}-${NOM}.png`);

// ── 1. Ordinateur : la colonne des noms ─────────────────────────────────────
preparer();
{
  const { page, ctx, erreurs } = await sim.page({ ui: 2, largeur: 1440, hauteur: 900 });
  await page.locator('.dzp-table').screenshot({ path: img('1-planning-ordi'), clip: undefined });
  // Gros plan des noms : haut replié, sans défiler (la barre collante ne recouvre rien).
  await page.click('[data-testid=haut-replier]').catch(() => {}); await page.mouse.move(2, 500); await page.waitForTimeout(400);
  const b = await page.locator('.dzp-table tbody tr').first().boundingBox();
  await page.screenshot({ path: img('1b-noms-ordi'), clip: { x: Math.max(0, b.x), y: b.y, width: 560, height: Math.min(560, 900 - b.y) } });
  await page.click('[data-testid=haut-deplier]').catch(() => {}); await page.waitForTimeout(300);
  if (controles) {
    const lignes = await page.locator('.dzp-td-nom').evaluateAll((els) => els.map((e) => ({ nom: e.querySelector('.dzp-nom')?.textContent, prevu: e.querySelector('[data-testid=objectif-prevu]')?.textContent || '', pointe: e.querySelector('[data-testid=objectif-pointe]')?.textContent || '', phrase: e.querySelector('.sr-only')?.textContent || '', deborde: e.scrollWidth > e.clientWidth + 1 })));
    console.log(lignes.slice(0, 3));
    check(lignes.length === 8 && lignes.every((l) => /^Prévu .+ \/ (35|17) h/.test(l.prevu)), 'chaque salarié : « Prévu N / objectif h »');
    const bruno = lignes.find((l) => l.nom?.startsWith('Bruno'));
    check(/\/ 17 h/.test(bruno?.prevu || ''), `Bruno : objectif de sa fiche (17 h) → « ${bruno?.prevu} »`);
    check(lignes.filter((l) => !l.nom?.startsWith('Bruno')).every((l) => /\/ 35 h/.test(l.prevu)), 'les autres : 35 h (entreprise / défaut)');
    check(lignes.some((l) => /manque \d/.test(l.prevu)) && lignes.some((l) => /\+ \d/.test(l.prevu) || /objectif atteint/.test(l.prevu)) || lignes.some((l) => /manque \d/.test(l.prevu)), 'écart à l’objectif écrit en mots (« manque … » / « + … »)');
    check(lignes.some((l) => /^Pointé .+écart [−+]?\d/.test(l.pointe)), 'ligne « Pointé N h · écart ±N h » quand la semaine a commencé');
    check(lignes.every((l) => !l.deborde), 'rien ne déborde de la colonne des noms (1 440 px)');
    const coupes = await page.locator('.dzp-obj__l > span').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    check(coupes.length === 0, `une ligne chacune, rien de coupé par « … » (1 440 px) ${coupes.join(' | ')}`);
    check(lignes.every((l) => l.phrase.startsWith('Prévu')), 'phrase complète pour les lecteurs d’écran');
    const petits = await page.locator('.dzp-obj__l').evaluateAll((els) => els.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 11).length);
    check(petits === 0, 'texte ≥ 11 px');
  }
  // 1 024 px : la colonne est plus étroite
  await page.setViewportSize({ width: 1024, height: 800 }); await page.waitForTimeout(600);
  await page.click('[data-testid=haut-replier]').catch(() => {}); await page.mouse.move(2, 500); await page.waitForTimeout(400);
  const b2 = await page.locator('.dzp-table tbody tr').first().boundingBox();
  await page.screenshot({ path: img('1c-noms-1024'), clip: { x: Math.max(0, b2.x), y: b2.y, width: 440, height: Math.min(440, 800 - b2.y) } });
  if (controles) {
    const deb = await page.locator('.dzp-td-nom').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    check(deb === 0, 'rien ne déborde à 1 024 px');
    const coupes = await page.locator('.dzp-obj__l > span').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    check(coupes.length === 0, `rien de coupé par « … » à 1 024 px ${coupes.join(' | ')}`);
  }
  check(erreurs.length === 0, `aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}

// ── 2. Fenêtre d'ajout : liste 00:00 → 23:45, ouverture sur 07:00, roulette, trackpad, fin avant début ──
preparer();
{
  const { page, ctx } = await sim.page({ ui: 2, largeur: 1440, hauteur: 900 });
  // Une case vide (Hugo n'a rien le mardi ?) : la première case sans bulle.
  await page.locator('.dzp-case:not([data-ferme]):not(:has(.dzp-bulle-wrap, .dzp-bulle, button))').first().click();
  await page.waitForSelector('[data-testid=add-time-start]', { timeout: 8000 });
  await page.waitForTimeout(400);
  await page.locator('[data-testid=add-time-start-list]').click();
  await page.waitForTimeout(500);
  const liste = page.locator('[data-testid=add-time-start-options]');
  await page.screenshot({ path: img('2-liste-ouverte') });
  if (controles) {
    const items = await liste.locator('[data-v]').evaluateAll((els) => els.map((e) => e.getAttribute('data-v')));
    check(items[0] === '00:00' && items[items.length - 1] === '23:45' && items.length === 96, `liste 00:00 → 23:45 au quart d’heure (${items.length} heures)`);
    const visible = await liste.evaluate((l) => { const r = l.getBoundingClientRect(); return [...l.querySelectorAll('[data-v]')].filter((e) => { const b = e.getBoundingClientRect(); return b.top >= r.top - 1 && b.bottom <= r.bottom + 1; }).map((e) => e.getAttribute('data-v')); });
    check(visible.includes('07:00'), `ouverte sur 07:00 sans heure saisie (vues : ${visible[0]} → ${visible[visible.length - 1]})`);
    // Roulette de la souris
    const avant = await liste.evaluate((l) => l.scrollTop);
    const fen = await page.evaluate(() => ({ y: window.scrollY, d: document.querySelector('[role=dialog]')?.scrollTop ?? 0 }));
    const lb = await liste.boundingBox();
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.mouse.wheel(0, 240); await page.waitForTimeout(400);
    const apresRoulette = await liste.evaluate((l) => l.scrollTop);
    const fen2 = await page.evaluate(() => ({ y: window.scrollY, d: document.querySelector('[role=dialog]')?.scrollTop ?? 0 }));
    check(apresRoulette > avant + 100, `roulette : la liste défile (${avant} → ${apresRoulette} px)`);
    check(fen2.y === fen.y && fen2.d === fen.d, 'roulette : la page et la fenêtre derrière ne bougent pas');
    // Trackpad : petits pas successifs, vers le haut
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -15); await page.waitForTimeout(30); }
    await page.waitForTimeout(300);
    const apresTrackpad = await liste.evaluate((l) => l.scrollTop);
    check(apresTrackpad < apresRoulette - 60, `trackpad (petits pas) : la liste remonte (${apresRoulette} → ${apresTrackpad} px)`);
    // Bout de liste : la roulette ne fait pas défiler la page derrière
    await page.mouse.wheel(0, 99999); await page.waitForTimeout(400);
    const fen3 = await page.evaluate(() => ({ y: window.scrollY, d: document.querySelector('[role=dialog]')?.scrollTop ?? 0 }));
    check(fen3.y === fen.y && fen3.d === fen.d, 'au bout de la liste, la page derrière ne défile toujours pas');
    check(await page.locator('[data-v="23:45"]').isVisible(), 'on atteint 23:45 à la roulette');
  }
  await page.screenshot({ path: img('2b-liste-roulette') });
  // Choisir 22:00 puis une fin à 06:00 : message clair
  await page.locator('[data-v="22:00"]').click();
  await page.locator('[data-testid=add-time-end]').fill('6h'); await page.locator('[data-testid=add-time-end]').press('Tab');
  await page.waitForTimeout(300);
  await page.screenshot({ path: img('2c-fin-avant-debut') });
  if (controles) {
    const err = await page.locator('[data-testid=add-time-error]').innerText().catch(() => '');
    check(/La fin doit être après le début \(22:00 → 06:00\).*minuit/.test(err), `fin avant début : message clair (« ${err} »)`);
    // Une heure de nuit tapée est acceptée (02:15) ; la liste rouverte se place sur l'heure saisie
    await page.locator('[data-testid=add-time-start]').fill('2h15'); await page.locator('[data-testid=add-time-start]').press('Tab');
    await page.locator('[data-testid=add-time-end]').fill('5h'); await page.locator('[data-testid=add-time-end]').press('Tab');
    await page.waitForTimeout(200);
    check(!(await page.locator('[data-testid=add-time-error]').count()), '02:15 → 05:00 (la nuit) accepté');
    await page.locator('[data-testid=add-time-start-list]').click(); await page.waitForTimeout(400);
    const vis = await page.locator('[data-testid=add-time-start-options]').evaluate((l) => { const r = l.getBoundingClientRect(); return [...l.querySelectorAll('[data-v]')].filter((e) => { const b = e.getBoundingClientRect(); return b.top >= r.top - 1 && b.bottom <= r.bottom + 1; }).map((e) => e.getAttribute('data-v')); });
    check(vis.includes('02:15'), `liste rouverte sur l’heure saisie (02:15 ; vues ${vis[0]} → ${vis[vis.length - 1]})`);
  }
  await ctx.close();
}

// ── 3. Téléphone : le doigt dans la liste, et l'objectif sous le nom ─────────
preparer();
{
  const { page, ctx, erreurs } = await sim.page({ ui: 2, largeur: 390, hauteur: 844, hasTouch: true });
  await page.screenshot({ path: img('3-planning-telephone') });
  if (controles) {
    const t = await page.locator('.dzp-m-carte [data-testid=objectif]').allInnerTexts();
    check(t.length >= 6 && t.every((x) => /Prévu/.test(x)), `téléphone : objectif sous chaque nom (${t[0]?.replace(/\n/g, ' · ')})`);
    const deb = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check(!deb, 'téléphone : pas de défilement horizontal');
  }
  const vide = page.locator('.dzp-m-carte .dzp-m-ajouter').first();
  if (await vide.count()) {
    await vide.click();
    try {
      await page.waitForSelector('[data-testid=add-time-start-list]', { timeout: 6000 });
      await page.locator('[data-testid=add-time-start-list]').tap(); await page.waitForTimeout(500);
      const liste = page.locator('[data-testid=add-time-start-options]');
      const lb = await liste.boundingBox();
      const avant = await liste.evaluate((l) => l.scrollTop);
      const cdp = await ctx.newCDPSession(page);
      // Un vrai glissé du doigt (touchstart → touchmove × 12 → touchend), vers le haut.
      const X = Math.round(lb.x + lb.width / 2), Y = Math.round(lb.y + lb.height / 2);
      const fen = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => d.scrollTop).join(','));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: X, y: Y }] });
      for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: X, y: Y - i * 10 }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(600);
      check(fen === await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => d.scrollTop).join(',')), 'doigt : la fenêtre derrière ne bouge pas');
      const apres = await liste.evaluate((l) => l.scrollTop);
      check(apres > avant + 60, `doigt : la liste défile (${avant} → ${apres} px)`);
      await page.screenshot({ path: img('3b-liste-doigt') });
    } catch (e) { check(false, `doigt : fenêtre d’ajout introuvable (${e.message.split('\n')[0]})`); }
  } else check(false, 'téléphone : bouton d’ajout introuvable');
  check(erreurs.length === 0, `téléphone : aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}

// ── 4. Fiche salarié : « Heures par semaine » visible et modifiable ──────────
preparer();
{
  const { page, ctx } = await sim.page({ ui: 2, largeur: 1440, hauteur: 900 });
  await page.getByRole('button', { name: /^Salariés/ }).first().click(); await page.waitForTimeout(800);
  await page.locator('[data-guide="bureau-salaries.nom"]', { hasText: 'Bruno' }).first().click(); await page.waitForTimeout(1200);
  const champ = page.locator('[data-testid=fiche-heures-semaine]');
  if (await champ.count()) {
    await champ.scrollIntoViewIfNeeded();
    await page.screenshot({ path: img('4-fiche-heures-semaine') });
    if (controles) {
      check(await champ.isEditable(), 'fiche : « Heures par semaine » visible et modifiable');
      check((await champ.inputValue()) === '17', `fiche : valeur de Bruno lue (${await champ.inputValue()})`);
    }
  } else {
    await page.screenshot({ path: img('4-fiche-heures-semaine') });
    check(false, 'fiche : champ « Heures par semaine » introuvable');
  }
  await ctx.close();
}

await sim.fermer();
if (controles) { console.log(`\n${ok} ✅  ${ko} ❌`); process.exit(ko ? 1 : 0); }
