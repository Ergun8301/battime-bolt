// Planning du bureau, planche d'essai TOUR 2 : contrôles et captures de l'étape TÉLÉPHONE + TABLETTE (/admin?ui=2).
//   2b « Bureau · téléphone » (390 × 844), 2c « Panneau sous 1024 px » (la fiche en feuille du bas), tablette 834 × 1194 (grille compacte 2a) ; 1024 × 768 : la fiche
//   en feuille sur l'ordinateur 1a (planning-1a-controles.mjs contrôle sa barre et sa grille).
//   node scripts/tests/planning-2b-controles.mjs <out> <dossier-de-captures> [port]
//   BASE_URL=http://localhost:3100 node scripts/tests/planning-2b-controles.mjs - <dossier>      (serveur de développement au lieu de out/)
//   PLANCHE_DIR=<dossier>  : sortie de `planche-essai-2a.mjs <dossier> --telephone` (planche-2b-jour.png, planche-2c.png) → écrit aussi
//                            compare-2b-telephone.png et compare-2c-feuille.png (planche | écran, même échelle).
// Données : bureau-sim.mjs, jeu « 2a » (les huit salariés et les cases du script de la planche), horloge figée au jeudi 15 octobre 2026, 9 h 30.
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';

const [,, OUT = 'out', CAPTURES = 'captures-planning-2a', PORT = '4432'] = process.argv;
const BASE = process.env.BASE_URL || null;
fs.mkdirSync(CAPTURES, { recursive: true });
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sim = await demarrer({ out: OUT, port: Number(PORT), base: BASE, jeu: '2a' });
const ouvrir = async (largeur, hauteur, opts = {}) => {
  sim.reinitialiser(); if (opts.avant) opts.avant(sim.D);
  const r = await sim.page({ ui: 2, largeur, hauteur, hasTouch: !!opts.tactile, attente: largeur < 768 ? '.dzp-m-carte' : '.dzp-table [data-testid=bubble]' });
  // L'astuce « Copier une case » (mémorisée une fois « Compris ») : on la referme pour que les captures montrent le planning.
  for (const id of ['copy-tip-ok-m', 'copy-tip-ok']) {
    const b = r.page.locator(`[data-testid=${id}]:visible`);
    if (await b.count()) { await b.first().click().catch(() => {}); await r.page.waitForTimeout(200); }
  }
  return r;
};
const capture = async (page, nom) => { await page.evaluate(() => document.activeElement?.blur?.()); await page.waitForTimeout(300); await page.screenshot({ path: path.join(CAPTURES, nom) }); };
const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** Cibles de toucher visibles dans une zone : taille réelle, prolongée par un ::after (zone de toucher sans changer le dessin) ; renvoie celles sous 44 px. */
const petitesCibles = (page, zone, sauf = null) => page.evaluate(([zone, sauf]) => {
  const out = [];
  for (const e of document.querySelectorAll(`${zone} button, ${zone} [role=button], ${zone} a[href], ${zone} input, ${zone} textarea`)) {
    if (sauf && e.closest(sauf)) continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || getComputedStyle(e).visibility === 'hidden') continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    const a = getComputedStyle(e, '::after');
    const ah = a.content && a.content !== 'none' && a.position === 'absolute' ? parseFloat(a.height) || 0 : 0;
    const aw = a.content && a.content !== 'none' && a.position === 'absolute' ? parseFloat(a.width) || 0 : 0;
    const h = Math.max(r.height, ah); const w = Math.max(r.width, aw);
    if (h < 43.5 || w < 43.5) out.push(`${(e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 24)} ${Math.round(w)}×${Math.round(h)}`);
  }
  return out;
}, [zone, sauf]);
const couleur = (page, sel, prop = 'backgroundColor') => page.locator(sel).first().evaluate((e, p) => getComputedStyle(e)[p], prop);

// ── 1440 : ce que la barre et « Plus ⋯ » offrent à l'ordinateur (la liste de référence du menu ☰) ─────────────────────────────
const fonctionsOrdinateur = [];
{
  const { page, ctx } = await ouvrir(1440, 900);
  // Ordinateur = maquette 1a : Clients, Salariés, Sélectionner, Exporter et la recherche sont dans la ligne de semaine ; Statistiques est un onglet de la barre noire.
  for (const lib of ['Clients', 'Salariés', 'Sélectionner', 'Exporter']) if (await page.locator('[data-testid=barre-semaine]').getByRole('button', { name: new RegExp(lib) }).count()) fonctionsOrdinateur.push(lib);
  if (await page.locator('[data-testid=barre-semaine] [data-testid=recherche-champ]').count()) fonctionsOrdinateur.push('Chercher');
  if (await page.locator('[data-testid=barre-noire] [data-testid=stat-stats]').count()) fonctionsOrdinateur.push('Statistiques');
  if (await page.locator('[data-testid=stat-waiting]').count()) fonctionsOrdinateur.push('Chiffres');
  if (await page.locator('[data-testid=barre-semaine] [aria-label="Semaine précédente"]').count()) fonctionsOrdinateur.push('Semaine précédente', 'Semaine suivante');
  await page.click('[data-testid=bar-plus]'); await page.waitForTimeout(200);
  for (const t of await page.locator('[data-testid=menu-plus] .dzp-menu__item:visible, [data-testid=menu-plus] .dzp-menu-essai button').allInnerTexts()) fonctionsOrdinateur.push(t.replace(/\s*(›|\d+|⌘P)\s*$/g, '').trim());
  await page.keyboard.press('Escape');
  await page.click('[data-testid=bar-compte]'); await page.waitForTimeout(200);
  for (const t of await page.locator('[data-testid=menu-compte] .dzp-menu__item').allInnerTexts()) fonctionsOrdinateur.push(t.trim());
  await ctx.close();
}
console.log(`fonctions de la barre, de « Plus ⋯ » et du compte à l'ordinateur : ${fonctionsOrdinateur.join(' | ')}`);

// ── 2b · 390 × 844 : Jour ───────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { page, ctx, erreurs } = await ouvrir(390, 844, { tactile: true });
  check(await hScroll(page) <= 0, `390 : aucun défilement horizontal (${await hScroll(page)} px)`);
  check(await page.locator('.dzp-bureau-desk').evaluate((e) => getComputedStyle(e).display) === 'none', '390 : la grille de l’ordinateur est cachée, le téléphone s’affiche');
  const tete = await page.locator('.dzp-m2-tete').evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, logo: e.querySelector('.dzp-logo')?.textContent, ronds: [...e.querySelectorAll('.dzp-m2-rond')].map((b) => `${b.textContent.trim().slice(0, 1)} ${Math.round(b.getBoundingClientRect().width)} ${getComputedStyle(b).borderRadius} ${getComputedStyle(b).backgroundColor}`) }));
  check(tete.bg === 'rgb(21, 18, 15)' && tete.logo === 'BEMEXO' && /^✦ 44 50% rgb\(255, 194, 26\)$/.test(tete.ronds[0] || '') && /^☰ 44 50%/.test(tete.ronds[1] || ''), `en-tête sombre : logo, ✦ jaune rond 44 px, ☰ rond 44 px (${JSON.stringify(tete)})`);
  const sem = (await page.locator('.dzp-m2-sem').innerText()).replace(/\s+/g, ' ');
  check(/^S-42 12–18 oct\.$/.test(sem), `S-42 et les dates : « ${sem} »`);
  const bascule = await page.locator('.dzp-m2-bascule button').evaluateAll((bs) => bs.map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}:${getComputedStyle(b).backgroundColor}`));
  check(bascule.length === 2 && bascule[0] === 'Jour:true:rgb(255, 194, 26)' && /^Semaine:false:rgba\(0, 0, 0, 0\)$/.test(bascule[1]), `bascule « Jour / Semaine », Jour en jaune (${bascule.join(' | ')})`);
  const jours = await page.locator('.dzp-m2-jours .dzp-m-jour').evaluateAll((bs) => bs.map((b) => `${b.innerText.replace(/\s+/g, ' ')}:${getComputedStyle(b).backgroundColor}`));
  check(jours.length === 7 && jours[3] === 'Jeu 15:rgb(255, 194, 26)' && jours[0] === 'Lun 12:rgb(37, 32, 27)', `bande des 7 jours, aujourd'hui (jeudi 15) en jaune (${jours.join(' | ')})`);
  const cartes = await page.locator('.dzp-m-carte').evaluateAll((cs) => cs.map((c) => ({ nom: c.querySelector('.dzp-m-nom')?.textContent, etat: c.querySelector('.dzp-m-etat')?.textContent, col: getComputedStyle(c.querySelector('.dzp-m-etat')).color, av: getComputedStyle(c.querySelector('.dzp-avatar')).width, bg: getComputedStyle(c).backgroundColor, r: getComputedStyle(c).borderRadius, ajout: !!c.querySelector('.dzp-m-ajouter') })));
  check(cartes.length === 8 && cartes.every((c) => c.bg === 'rgb(255, 253, 248)' && c.r === '18px' && c.av === '34px'), `8 cartes par salarié : fond #FFFDF8, rayon 18, avatar 34 px (${cartes.length})`);
  check(cartes.every((c) => /^(\d+ J EN ATTENTE|À JOUR)$/.test(c.etat || '')) && cartes.some((c) => /EN ATTENTE/.test(c.etat) && c.col === 'rgb(194, 65, 12)') && cartes.some((c) => c.etat === 'À JOUR' && c.col === 'rgb(23, 102, 63)'),
    `« N J EN ATTENTE » (orange) ou « À JOUR » (vert) : ${cartes.map((c) => `${c.nom} ${c.etat}`).join(', ')}`);
  check(cartes.filter((c) => c.ajout).length >= 6, `« + Ajouter un chantier » dans chaque carte sans absence (${cartes.filter((c) => c.ajout).length})`);
  const live = await page.locator('.dzp-m-carte', { hasText: 'Alex Test' }).locator('.dzp-mc').first().evaluate((e) => ({ t: e.innerText.replace(/\s+/g, ' '), bg: getComputedStyle(e).backgroundColor, bd: getComputedStyle(e).borderTopColor, l: getComputedStyle(e.querySelector('.dzp-mc__lisere')).width, lc: getComputedStyle(e.querySelector('.dzp-mc__lisere')).backgroundColor, h: e.getBoundingClientRect().height }));
  check(/^Villa Exemple ● depuis 07:45/.test(live.t) && live.bg === 'rgb(231, 246, 238)' && live.bd === 'rgb(47, 163, 107)' && live.l === '5px' && live.lc === 'rgb(47, 163, 107)' && live.h >= 50, `Alex : bulle « en direct » vert pâle, liseré vert de 5 px (${JSON.stringify(live)})`);
  const prevue = await page.locator('.dzp-m-carte', { hasText: 'Bruno Essai' }).locator('.dzp-mc').first().evaluate((e) => ({ t: e.innerText.replace(/\s+/g, ' '), bg: getComputedStyle(e).backgroundColor, bd: `${getComputedStyle(e).borderTopStyle} ${getComputedStyle(e).borderTopColor}`, lc: getComputedStyle(e.querySelector('.dzp-mc__lisere')).backgroundColor }));
  check(prevue.t === 'Maison Démo 08:00–17:00' && prevue.bg === 'rgb(255, 255, 255)' && prevue.bd === 'dashed rgb(156, 144, 126)' && prevue.lc === 'rgb(21, 18, 15)', `Bruno : prévue journée, fond blanc, pointillés #9C907E, liseré encre (${JSON.stringify(prevue)})`);
  const soir = await page.locator('.dzp-m-carte', { hasText: 'Chloé Exemple' }).locator('.dzp-mc').first().evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, lc: getComputedStyle(e.querySelector('.dzp-mc__lisere')).backgroundColor }));
  check(soir.bg === 'rgb(232, 220, 246)' && soir.lc === 'rgb(154, 111, 214)', `Chloé : soir, fond #E8DCF6, liseré #9A6FD6 (${JSON.stringify(soir)})`);
  const abs = await page.locator('.dzp-m-carte', { hasText: 'Dina Démo' }).locator('.dzp-m-absence').evaluate((e) => ({ t: e.innerText, h: e.getBoundingClientRect().height, bg: getComputedStyle(e).backgroundImage }));
  check(abs.t === 'ABSENT · MALADIE' && abs.h === 48 && /repeating-linear-gradient/.test(abs.bg), `Dina : absence rayée de 48 px « ABSENT · MALADIE » (${JSON.stringify(abs)})`);
  const petites = await petitesCibles(page, '.dzp-m2');
  check(petites.length === 0, `390 : toutes les cibles visibles font au moins 44 × 44 px (${petites.slice(0, 8).join(' | ')})`);
  await capture(page, '2b-jour-390.png');

  // Un autre jour de la bande
  await page.locator('.dzp-m2-jours .dzp-m-jour').nth(0).click(); await page.waitForTimeout(250);
  const alexLun = await page.locator('.dzp-m-carte', { hasText: 'Alex Test' }).locator('.dzp-mc').evaluateAll((es) => es.map((e) => `${e.dataset.etat}:${e.innerText.replace(/\s+/g, ' ')}:${getComputedStyle(e).backgroundColor}`));
  check(alexLun.length === 2 && alexLun[0] === 'envoyee:Villa Exemple ✓ 08:00–12:00 · 4h00:rgb(21, 18, 15)', `lundi : Alex a deux bulles envoyées sombres, heure jaune (${alexLun.join(' | ')})`);

  // Semaine : la mosaïque
  await page.click('[data-testid=m-vue-semaine]'); await page.waitForTimeout(300);
  const mos = await page.evaluate(() => ({
    bande: !!document.querySelector('.dzp-m2-jours'), cases: document.querySelectorAll('.dzp-mos__case').length, tetes: [...document.querySelectorAll('.dzp-mos__tete')].map((t) => t.innerText.replace(/\s+/g, '')),
    auj: getComputedStyle(document.querySelector('.dzp-mos__tete[data-auj]')).backgroundColor, p: document.querySelectorAll('.dzp-mos__p').length,
    envoyee: getComputedStyle(document.querySelector('.dzp-mos__p[data-etat=envoyee]')).backgroundColor, direct: getComputedStyle(document.querySelector('.dzp-mos__p[data-etat=en-cours]')).backgroundColor,
    abs: getComputedStyle(document.querySelector('.dzp-mos__p[data-etat=absence]')).backgroundImage, legende: document.querySelector('.dzp-mos__legende')?.innerText.replace(/\s+/g, ' '),
  }));
  check(!mos.bande && mos.cases === 56 && mos.tetes.join(',') === 'L12,M13,M14,J15,V16,S17,D18' && mos.auj === 'rgb(255, 194, 26)', `Semaine : mosaïque 8 × 7, en-têtes L 12 … D 18, jeudi en jaune, plus de bande des jours (${JSON.stringify({ c: mos.cases, t: mos.tetes })})`);
  check(mos.p >= 30 && mos.envoyee === 'rgb(21, 18, 15)' && mos.direct === 'rgb(47, 163, 107)' && /repeating-linear-gradient/.test(mos.abs) && /envoyée.*prévue matin.*après-midi.*en direct.*absent/.test(mos.legende), `une pastille par intervention (${mos.p}), envoyée encre, en direct vert, absence rayée, légende de la planche`);
  await capture(page, '2b-semaine-390.png');
  const petitesS = await petitesCibles(page, '.dzp-m2', '.dzp-mos');
  check(petitesS.length === 0, `Semaine : cibles ≥ 44 px hors des colonnes de la mosaïque (${petitesS.join(' | ')})`);
  await page.locator('.dzp-mos__case').nth(1).click(); await page.waitForTimeout(300); // Alex, mardi
  const apres = await page.evaluate(() => ({ vue: document.querySelector('[data-testid=planning-mobile]')?.dataset.vue, jour: document.querySelector('.dzp-m2-jours .dzp-m-jour[aria-pressed=true]')?.innerText.replace(/\s+/g, ' ') }));
  check(apres.vue === 'jour' && apres.jour === 'Mar 13', `toucher une colonne ouvre ce jour (${JSON.stringify(apres)})`);
  await page.click('[data-testid=m-vue-semaine]'); await page.waitForTimeout(200);
  await page.click('[data-testid=m-vue-jour]'); await page.waitForTimeout(200);
  check(await page.locator('.dzp-m2-jours').count() === 1 && await page.locator('.dzp-mos').count() === 0, 'la bascule revient en Jour');
  await page.locator('.dzp-m2-jours .dzp-m-jour').nth(3).click(); await page.waitForTimeout(200);

  // Le menu ☰ : toutes les fonctions de l'ordinateur
  await page.click('[data-testid=m-menu]'); await page.waitForTimeout(450);
  const menu = page.locator('.dzp-mm');
  const texte = (await menu.innerText()).replace(/\s+/g, ' ');
  const EQUIV = { Chercher: 'Chercher un salarié', Chiffres: 'Chiffres de la semaine', 'Semaine précédente': null, 'Semaine suivante': null, Réserves: 'Réserves de chantier', Sélectionner: 'Sélectionner des interventions' };
  const manquent = [];
  for (const f of fonctionsOrdinateur) {
    if (f === 'Semaine précédente' || f === 'Semaine suivante') { if (!(await menu.getByRole('button', { name: f }).count())) manquent.push(f); continue; }
    if (f === 'Chercher') { if (!(await menu.locator('[data-testid=mm-recherche]').count())) manquent.push(f); continue; }
    const cle = EQUIV[f] || f;
    if (!texte.toLowerCase().includes(cle.toLowerCase())) manquent.push(f);
  }
  check(fonctionsOrdinateur.length >= 20 && manquent.length === 0, `☰ donne accès aux ${fonctionsOrdinateur.length} fonctions de la barre, de « Plus ⋯ » et du compte${manquent.length ? ` — manquent : ${manquent.join(', ')}` : ''}`);
  check(await page.locator('[data-testid=m-assistant]').count() === 1, '✦ (Assistant) reste dans l’en-tête ; ⤢ (plein écran) n’a pas d’objet au téléphone, qui montre déjà le planning seul');
  const petitesM = await petitesCibles(page, '.dzp-mm');
  check(petitesM.length === 0, `menu ☰ : cibles ≥ 44 px (${petitesM.slice(0, 6).join(' | ')})`);
  await capture(page, '2b-menu-390.png');
  // les chiffres et leurs tuiles
  await page.click('[data-testid=mm-chiffres]'); await page.waitForTimeout(250);
  const tuiles = await menu.locator('.dzp-tuile').count();
  check(tuiles === 4 && await menu.locator('[data-testid=relance-row]').count() > 0, `les compteurs ouvrent les quatre tuiles du 1a, avec la liste « À relancer » (${tuiles})`);
  await page.click('[data-testid=mm-chiffres]'); await page.waitForTimeout(150);
  // pièces jointes
  await page.click('[data-testid=mm-pieces]'); await page.waitForTimeout(400);
  check(await menu.locator('[data-testid=liste-pieces]').count() === 1 && /Villa Exemple/i.test(await menu.locator('[data-testid=liste-pieces]').innerText()), 'Pièces jointes : la liste par chantier s’ouvre dans le menu');
  await page.click('[data-testid=mm-pieces]'); await page.waitForTimeout(150);
  // semaine suivante puis retour
  await menu.getByRole('button', { name: 'Semaine suivante' }).click(); await page.waitForTimeout(500);
  const s43 = (await menu.locator('.dzp-mm__sem').innerText()).replace(/\s+/g, ' ');
  await menu.getByRole('button', { name: 'AUJOURD’HUI' }).or(menu.getByRole('button', { name: "AUJOURD'HUI" })).click(); await page.waitForTimeout(500);
  const s42 = (await page.locator('.dzp-m2-sem').innerText()).replace(/\s+/g, ' ');
  check(/^S-43 19–25 oct\.$/.test(s43) && /^S-42/.test(s42), `semaine suivante (« ${s43} ») puis retour à la semaine actuelle (« ${s42} »)`);
  // recherche
  await page.fill('[data-testid=mm-recherche]', 'bruno'); await page.waitForTimeout(250);
  await page.keyboard.press('Enter'); await page.waitForTimeout(450);
  const noms = await page.locator('.dzp-m-carte .dzp-m-nom').allInnerTexts();
  check(noms.length === 1 && noms[0] === 'Bruno Essai' && /1 salarié pour « bruno »/i.test(await page.locator('[data-testid=m-filtre]').innerText()), `recherche « bruno » (dans ☰) : ne reste que Bruno Essai (${noms.join(', ')})`);
  await page.click('[data-testid=m-menu]'); await page.waitForTimeout(400);
  await page.fill('[data-testid=mm-recherche]', ''); await page.waitForTimeout(150);
  // Imprimer
  await page.click('[data-testid=mm-print]'); await page.waitForTimeout(500);
  const imp = page.locator('[data-testid=print-menu]');
  check(await imp.count() === 1 && await imp.isVisible() && (await imp.boundingBox()).width <= 390, 'Imprimer (☰) ouvre le menu d’impression, visible et dans l’écran');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  check(await page.locator('[data-testid=print-menu]').count() === 0, 'Échap ferme le menu d’impression');
  // Sélectionner
  await page.click('[data-testid=m-menu]'); await page.waitForTimeout(400);
  await page.click('[data-testid=mm-select]'); await page.waitForTimeout(400);
  check(await page.locator('[data-testid=sel-bar]').isVisible(), 'Sélectionner (☰) ouvre la barre de sélection');
  await page.click('[data-testid=sel-done]'); await page.waitForTimeout(250);
  check(erreurs.length === 0, `aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}

// ── 2c · la fiche d'une intervention en feuille du bas (390 et 1024) ─────────────────────────────────────────────────────────────
const feuille = async (page, largeur, hauteur, ouvrirBulle, nomCapture) => {
  await ouvrirBulle(); await page.waitForTimeout(600);
  const f = page.locator('[data-testid=fiche-intervention]');
  const g = await f.evaluate((e) => {
    const r = e.getBoundingClientRect(); const voile = document.querySelector('.dz-voile-fenetre');
    const poignee = getComputedStyle(e.querySelector('.dz-fenetre__poignee'), '::before');
    const ok = e.querySelector('.dzp-feuille__ok'); const ro = ok?.getBoundingClientRect();
    return {
      h: r.height, y: r.y, bas: r.bottom, w: r.width, rayon: getComputedStyle(e).borderTopLeftRadius, liser: getComputedStyle(e).borderTopColor + ' ' + getComputedStyle(e).borderTopWidth,
      voile: voile ? getComputedStyle(voile).backgroundColor : null, poignee: `${poignee.width} ${poignee.height} ${poignee.backgroundColor}`,
      kicker: e.querySelector('.dz-fenetre__kicker')?.innerText, titre: e.querySelector('.dz-fenetre__titre')?.innerText, sous: e.querySelector('.dz-fenetre__sous')?.innerText,
      fermer: e.querySelector('.dz-fenetre__fermer')?.getBoundingClientRect().width,
      onglets: [...e.querySelectorAll('.dzp-feuille__onglets button')].map((b) => b.innerText), heures: e.querySelector('[data-testid=fiche-heures]')?.innerText.replace(/\s+/g, ' '),
      heuresBg: e.querySelector('[data-testid=fiche-heures]') ? getComputedStyle(e.querySelector('[data-testid=fiche-heures]')).backgroundColor : null,
      presets: [...e.querySelectorAll('[data-testid=edit-time-preset]')].map((b) => b.innerText.trim()), note: e.querySelector('textarea')?.getAttribute('placeholder'),
      actions: [...e.querySelectorAll('[data-testid=edit-actions] button')].map((b) => b.innerText.trim()),
      ok: ok ? `${ok.innerText.trim()} ${getComputedStyle(ok).backgroundColor} ${Math.round(ro.height)} ${Math.round(window.innerHeight - ro.bottom)}` : null,
    };
  });
  const ratio = g.h / hauteur;
  check(Math.abs(ratio - 0.92) < 0.006 && Math.round(g.bas) === hauteur && g.w === largeur && g.rayon === '28px', `${largeur} : la fiche est une feuille du bas à 92 % de la hauteur (${Math.round(ratio * 1000) / 10} %), pleine largeur, rayon 28 (${JSON.stringify({ h: g.h, bas: g.bas, w: g.w, rayon: g.rayon })})`);
  check(g.voile === 'rgba(21, 18, 15, 0.45)' && /255, 194, 26.* 4px/.test(g.liser) && g.poignee === '44px 5px rgb(214, 203, 183)' && g.fermer === 44, `${largeur} : fond grisé (45 %), liseré jaune 4 px, poignée 44 × 5, ✕ de 44 px (${g.voile}, ${g.poignee})`);
  check(/^INTERVENTION · JEU 15 · ALEX TEST$/i.test(g.kicker || '') && g.titre === 'Villa Exemple' && g.sous === 'Fenêtres · Lyon', `${largeur} : titre de la planche (« ${g.kicker} », « ${g.titre} », « ${g.sous} »)`);
  check(g.onglets.length === 2 && /✎ Fiche/.test(g.onglets[0]) && /⧉ Documents/.test(g.onglets[1]), `${largeur} : onglets « ✎ Fiche » / « ⧉ Documents » (${g.onglets.join(' | ')})`);
  check(/^HEURES DÉCLARÉES En cours depuis 07:45 Pointage en direct$/i.test(g.heures || '') && g.heuresBg === 'rgb(231, 246, 238)', `${largeur} : bloc « Heures déclarées » vert « En cours depuis 07:45 » (${g.heures})`);
  check(g.presets.join(',') === 'Matin,Après-midi,Journée' && g.note === 'Note pour le poseur', `${largeur} : Horaire prévu, puces Matin / Après-midi / Journée, Note (${g.presets.join(', ')})`);
  check(/Copier vers un autre jour/.test(g.actions.join('|')) && /Dupliquer au lendemain/.test(g.actions.join('|')) && /Supprimer/.test(g.actions.join('|')), `${largeur} : mêmes actions (${g.actions.join(' | ')})`);
  check(/^Enregistrer rgb\(255, 194, 26\) 52 22$/.test(g.ok || ''), `${largeur} : « Enregistrer » jaune de 52 px collé en bas, sous le pouce (${g.ok})`);
  if (nomCapture) await capture(page, nomCapture);
  const petites = await petitesCibles(page, '[data-testid=fiche-intervention]');
  check(petites.length === 0, `${largeur} : cibles de la feuille ≥ 44 px (${petites.slice(0, 6).join(' | ')})`);
  // fermetures : ✕, fond, Échap
  await f.locator('.dz-fenetre__fermer').click(); await page.waitForTimeout(400);
  const parX = await f.count() === 0;
  await ouvrirBulle(); await page.waitForTimeout(600);
  await page.mouse.click(Math.round(largeur / 2), 20); await page.waitForTimeout(400);
  const parFond = await f.count() === 0;
  await ouvrirBulle(); await page.waitForTimeout(600);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const parEchap = await f.count() === 0;
  check(parX && parFond && parEchap, `${largeur} : la feuille se ferme par ✕ (${parX}), par le fond (${parFond}) et par Échap (${parEchap})`);
};
{
  const { page, ctx, erreurs } = await ouvrir(390, 844, { tactile: true });
  const bulle = () => page.locator('.dzp-m-carte', { hasText: 'Alex Test' }).locator('.dzp-m-bulle').first().click();
  await feuille(page, 390, 844, bulle, '2c-feuille-390.png');
  check(erreurs.length === 0, `390 : aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}
{
  const { page, ctx, erreurs } = await ouvrir(1024, 768, { tactile: true });
  check(await hScroll(page) <= 0, `1024 × 768 : aucun défilement horizontal (${await hScroll(page)} px)`);
  check(await page.locator('.dzp-table').isVisible() && await page.locator('[data-testid=barre-noire]').isVisible() && await page.locator('.dzp-semaine').isVisible(), '1024 × 768 : la grille de l’ordinateur (maquette 1a)');
  const bulle = () => page.locator('.dzp-table tbody tr').first().locator('.dzp-td').nth(3).locator('.dzp-prise').first().click();
  await feuille(page, 1024, 768, bulle, '2c-feuille-1024.png');
  check(erreurs.length === 0, `1024 : aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}
{
  const { page, ctx } = await ouvrir(1440, 900);
  await page.locator('.dzp-table tbody tr').first().locator('.dzp-td').nth(3).locator('.dzp-prise').first().click(); await page.waitForTimeout(600);
  const r = await page.locator('[data-testid=fiche-intervention]').boundingBox();
  check(r && Math.round(r.x + r.width) === 1440 && Math.round(r.y) === 0 && Math.round(r.height) === 900 && r.width <= 480, `1440 : la fiche reste le panneau latéral de droite (${r && `${Math.round(r.x)},${Math.round(r.width)}×${Math.round(r.height)}`})`);
  await ctx.close();
}

// ── Tablette 834 × 1194 : la grille de l'ordinateur, sans défilement horizontal ────────────────────────────────────────────────
{
  const { page, ctx, erreurs } = await ouvrir(834, 1194, { tactile: true });
  check(await hScroll(page) <= 0, `834 × 1194 : aucun défilement horizontal de page (${await hScroll(page)} px)`);
  const g = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=barre-noire]').getBoundingClientRect();
    const t = document.querySelector('.dzp-table').getBoundingClientRect();
    const deborde = [...document.querySelectorAll('[data-testid=barre-noire] *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5).length;
    return { barre: b.height, deborde, table: t.right, col: Math.round(document.querySelector('.dzp-th-nom').getBoundingClientRect().width), lignes: document.querySelectorAll('.dzp-table tbody tr').length, mobile: getComputedStyle(document.querySelector('.dzp-mobile')).display };
  });
  check(g.barre === 64 && g.deborde === 0 && g.table <= 834 && g.col === 176 && g.lignes === 8 && g.mobile === 'none', `834 : barre de 64 px sans débord, grille 2a (colonne 176 px, 8 salariés) dans l'écran (${JSON.stringify(g)})`);
  // Aucun mot coupé en plein milieu : dans la barre, les en-têtes et la grille, chaque retour à la ligne tombe sur une espace ; les absences ne sont pas tronquées ;
  // titres et horaires des cartes restent sur une ligne (« … » permis), comme à 1 024 px.
  const coupes = await page.evaluate(() => {
    const out = [];
    for (const zone of document.querySelectorAll('[data-testid=barre-noire], .dzp-table')) {
      const w = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.textContent; if (!t.trim() || n.parentElement?.offsetParent === null) continue;
        let haut = null;
        for (let i = 0; i < t.length; i++) {
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
          const b = [...r.getClientRects()].find((x) => x.width > 0); if (!b) continue;
          if (haut !== null && b.top > haut + 3 && /\S/.test(t[i]) && i > 0 && /\S/.test(t[i - 1]) && !/[-–·/]/.test(t[i - 1])) { out.push(t.trim().slice(0, 30)); break; }
          haut = b.top;
        }
      }
    }
    for (const b of document.querySelectorAll('.dzp-absence b')) if (b.scrollWidth > b.clientWidth + 1) out.push(`absence tronquée : ${b.textContent}`);
    for (const e of document.querySelectorAll('.dzp-carte__titre, .dzp-carte__heure')) { const r = e.getClientRects(); if (r.length && e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight || '16') * 1.6) out.push(`sur plusieurs lignes : ${e.textContent.slice(0, 24)}`); }
    return out;
  });
  check(coupes.length === 0, `834 : aucun mot coupé en plein milieu, absences entières, titres et horaires sur une ligne (${coupes.slice(0, 6).join(' | ')})`);
  await page.click('[data-testid=bar-plus]'); await page.waitForTimeout(250);
  const plus = (await page.locator('[data-testid=menu-plus]').innerText()).replace(/\s+/g, ' ');
  check(/Clients/.test(plus) && /Salariés/.test(plus) && /Sélectionner/.test(plus), '834 : Clients, Salariés et Sélectionner (retirés de la barre faute de place) sont dans « Plus ⋯ »');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await capture(page, '2a-tablette-834.png');
  const bulle = () => page.locator('.dzp-table tbody tr').first().locator('.dzp-td').nth(3).locator('.dzp-prise').first().click();
  await bulle(); await page.waitForTimeout(600);
  const r = await page.locator('[data-testid=fiche-intervention]').boundingBox();
  check(r && Math.abs(r.height / 1194 - 0.92) < 0.006 && Math.round(r.width) === 834, `834 : la fiche s'ouvre en feuille 2c (${r && Math.round(r.height)} px de haut)`);
  await page.keyboard.press('Escape');
  check(erreurs.length === 0, `834 : aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}

// ── Images « planche | écran » à la même échelle ───────────────────────────────────────────────────────────────────────────────
if (process.env.PLANCHE_DIR) {
  const paires = [
    ['planche-2b-jour.png', '2b-jour-390.png', 'compare-2b-telephone.png', 'Planche 2b « Bureau · téléphone » (cadre 390 × 844, coque comprise)', 'Écran /admin?ui=2 · 390 × 844 · jeu « 2a »'],
    ['planche-2c.png', '2c-feuille-390.png', 'compare-2c-feuille.png', 'Planche 2c « Panneau sous 1024 px »', 'Écran /admin?ui=2 · 390 × 844 · fiche d’Alex, jeudi'],
  ];
  for (const [p, e, sortie, lp, le] of paires) {
    const planche = path.resolve(process.env.PLANCHE_DIR, p); const ecran = path.resolve(CAPTURES, e);
    if (!fs.existsSync(planche) || !fs.existsSync(ecran)) { console.log(`(${p} ou ${e} absente : ${sortie} non écrite)`); continue; }
    const ctx = await sim.browser.newContext({ viewport: { width: 390 * 2 + 72, height: 844 + 72 } });
    const pg = await ctx.newPage();
    const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
    await pg.setContent(`<body style="margin:0;background:#C9B998;font:700 12px system-ui;display:flex;gap:24px;padding:0 24px 20px">
      <figure style="margin:0"><figcaption style="height:52px;display:flex;align-items:center">${lp}</figcaption><img src="${b64(planche)}" width="390" height="844"></figure>
      <figure style="margin:0"><figcaption style="height:52px;display:flex;align-items:center">${le}</figcaption><img src="${b64(ecran)}" width="390" height="844"></figure></body>`);
    await pg.screenshot({ path: path.join(CAPTURES, sortie) });
    await ctx.close();
    console.log(`${sortie} écrite`);
  }
}

await sim.fermer();
console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
