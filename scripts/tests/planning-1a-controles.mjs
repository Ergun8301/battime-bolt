// Planning du bureau, ORDINATEUR (1 024 px et plus) = maquette 1a de la planche d'essai (« Bureau · ordinateur 1440 », cockpit et envoyées sombres allumés) :
// contrôles et captures de /admin?ui=2. Remplace planning-2a-controles.mjs (la barre unique 2a reste celle de la tablette, contrôlée par planning-2b-controles.mjs).
//   node scripts/tests/planning-1a-controles.mjs <out> <dossier-de-captures> [port]
//   BASE_URL=http://localhost:3100 node scripts/tests/planning-1a-controles.mjs - <dossier>      (serveur de développement au lieu de out/)
//   PLANCHE_DIR=<dossier>  : sortie de `planche-essai-2a.mjs <dossier> --1a` (planche-1a-1440.png) → écrit aussi compare-1a-1440.png (planche | écran déplié, même échelle).
// Données : bureau-sim.mjs, jeu « 2a » (les huit salariés et les cases du script de la planche), horloge figée au jeudi 15 octobre 2026, 9 h 30.
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';

const [,, OUT = 'out', CAPTURES = 'captures-planning-1a', PORT = '4433'] = process.argv;
const BASE = process.env.BASE_URL || null;
fs.mkdirSync(CAPTURES, { recursive: true });
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sim = await demarrer({ out: OUT, port: Number(PORT), base: BASE, jeu: '2a' });
const fermerAstuce = async (page) => {
  for (const id of ['copy-tip-ok-m', 'copy-tip-ok']) {
    const b = page.locator(`[data-testid=${id}]:visible`);
    if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(200); }
  }
};
const ouvrir = async (largeur, hauteur, opts = {}) => {
  sim.reinitialiser(); if (opts.avant) opts.avant(sim.D);
  const r = await sim.page({ ui: 2, largeur, hauteur, hasTouch: !!opts.tactile, attente: largeur < 768 ? '.dzp-m-carte' : '.dzp-table [data-testid=bubble]' });
  await fermerAstuce(r.page);
  return r;
};
const recharger = async (page) => { await page.reload(); await page.waitForSelector('.dzp-table [data-testid=bubble]', { timeout: 25000 }); await page.waitForTimeout(1200); };
const capture = async (page, nom, plein = false, garderFocus = false) => { if (!garderFocus) await page.evaluate(() => document.activeElement?.blur?.()); await page.mouse.move(2, 2); await page.waitForTimeout(300); await page.screenshot({ path: path.join(CAPTURES, nom), fullPage: plein }); };
/** Tuile « Heures envoyées » : rien ne dépasse de la tuile (barres, chiffres, jours), aucun libellé coupé, titre sur une ligne. */
const tuile = (page) => page.evaluate(() => {
  const t = document.querySelector('[data-testid=bandeau] [data-testid=stat-heures]'); if (!t) return null;
  const r = t.getBoundingClientRect(); const pd = parseFloat(getComputedStyle(t).paddingRight);
  const dehors = [...t.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > r.right - pd + 0.5 || b.left < r.left - 0.5); }).map((e) => e.className || e.tagName);
  const coupes = [...t.querySelectorAll('.dzp-barre__l, .dzp-barre__n')].filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent);
  const k = t.querySelector('.dzp-tuile__k'); const kr = document.createRange(); kr.selectNodeContents(k);
  const lignes = new Set([...kr.getClientRects()].map((x) => Math.round(x.top))).size;
  return { dehors: dehors.slice(0, 4), coupes, titre: k.textContent, lignesTitre: lignes, titreEntier: k.scrollWidth <= k.clientWidth + 0.5 };
});
const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** Textes qui passent à la ligne dans une zone : un nœud texte dont les boîtes de ligne n'ont pas toutes le même haut. */
const retours = (page, sel, sauf = null) => page.evaluate(([s, sauf]) => {
  const out = [];
  for (const zone of document.querySelectorAll(s)) {
    const w = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement; if (!el || el.offsetParent === null || (sauf && el.closest(sauf))) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const tops = [...new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)))];
      if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 3) out.push(n.textContent.trim().slice(0, 40));
    }
  }
  return out;
}, [sel, sauf]);
/** Ce qui dépasse à droite de l'écran dans une zone (rien ne doit). */
const debords = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(`${s} *`)].filter((e) => e.offsetParent !== null && e.getBoundingClientRect().right > window.innerWidth + 0.5).map((e) => e.className || e.tagName).slice(0, 5), sel);
/** Les éléments de la ligne de semaine, dans l'ordre du document : libellé, boîte. */
const ligne = (page) => page.evaluate(() => {
  const L = document.querySelector('[data-testid=barre-semaine]');
  if (!L) return [];
  return [...L.querySelectorAll('.dzp-semaine__t, button, .dzp-recherche, .dzp-sep')].filter((e) => !e.closest('.dzp-recherche') || e.matches('.dzp-recherche')).filter((e) => !e.closest('.dzp-menu'))
    .filter((e) => e.offsetParent !== null)
    .map((e) => { const r = e.getBoundingClientRect(); const t = e.matches('.dzp-recherche') ? `[${e.querySelector('input').placeholder}]` : e.matches('.dzp-sep') ? '|' : (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(); return { t, x: Math.round(r.x * 10) / 10, y: Math.round(r.y), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, d: Math.round(r.right * 10) / 10 }; });
});

// Mesures de la planche 1a rendue (planche-essai-2a.mjs --1a, 1440 px) : position et largeur de chaque bouton de la ligne de semaine.
const PLANCHE_LIGNE = [
  ['Semaine précédente', 317, 44], ['Semaine suivante', 367, 44], ["Aujourd'hui", 417, 111.6], ['[Chercher', 548, 236.8], ['Clients', 805, 80.9],
  ['Salariés', 894, 118.5], ['Sélectionner', 1020, 119.1], ['Plus ⋯', 1165, 80.2], ['↓ Exporter', 1253, 111.2], ['Planning en plein écran', 1372, 44],
];

// ── 1440 × 900, déplié : barre noire, ligne de semaine, bandeau, grille ─────────────────────────────────────────────────────────
{
  const { page, ctx, erreurs } = await ouvrir(1440, 900);
  const barre = await page.locator('[data-testid=barre-noire]').boundingBox();
  check(barre && Math.round(barre.height) === 60 && Math.round(barre.y) === 0, `barre noire de 60 px en haut (${barre && barre.height} px)`);
  const noire = await page.evaluate(() => [...document.querySelectorAll('[data-testid=barre-noire] .dzp-logo, [data-testid=barre-noire] .dzp-onglet, [data-testid=barre-noire] .dzp-n-compteur, [data-testid=barre-noire] .dzp-assistant, [data-testid=barre-noire] .dzp-compte__btn')]
    .map((e) => ({ t: (e.innerText || '').replace(/\s+/g, ' ').trim(), x: Math.round(e.getBoundingClientRect().x), h: Math.round(e.getBoundingClientRect().height) })));
  const txt = noire.map((e) => e.t).join(' | ');
  check(/^BEMEXO \| Planning \| Statistiques \| \d+ j à relancer \| 1 congé en attente \| 3 pièces \| 1 Réserves \| ✦ Assistant \| ET Entreprise Test ▾$/.test(txt) && noire.every((e, i) => i === 0 || e.x > noire[i - 1].x),
    `barre noire dans l'ordre de la planche : logo, Planning / Statistiques, compteurs, ✦ Assistant, compte (${txt})`);
  check(noire.filter((e) => /relancer|congé|pièces|Réserves/.test(e.t)).every((e) => e.h === 36) && noire.find((e) => /Assistant/.test(e.t))?.h === 38, 'compteurs de 36 px, « ✦ Assistant » de 38 px (planche)');
  const elems = await ligne(page);
  const libs = elems.map((e) => e.t.replace(/^SEMAINE ACTUELLE S-42 12 – 18 octobre 2026$/, 'SEMAINE'));
  const attendu = ['SEMAINE', '←', '→', "Aujourd'hui", '[Chercher un salarié, un chantier…]', 'Clients', 'Salariés 1', 'Sélectionner', '|', 'Plus ⋯ 1', '↓ Exporter', '⤢'];
  check(libs.join(' / ') === attendu.join(' / ') && elems.every((e, i) => i === 0 || e.x > elems[i - 1].x), `ligne de semaine dans l'ordre exact de la planche (${libs.join(' / ')})`);
  const trous = elems.slice(1).map((e, i) => ({ de: libs[i], a: libs[i + 1], g: Math.round((e.x - elems[i].d) * 10) / 10 }));
  const grands = trous.filter((t) => t.g > 24);
  check(grands.length === 0, `aucun trou de plus de 24 px entre deux éléments voisins (écarts : ${trous.map((t) => t.g).join(', ')} px)`);
  const boites = await page.evaluate(() => [...document.querySelectorAll('[data-testid=barre-semaine] button, [data-testid=barre-semaine] .dzp-recherche')].filter((e) => !e.closest('.dzp-menu') && !e.closest('.dzp-recherche') || e.matches('.dzp-recherche'))
    .map((e) => { const r = e.getBoundingClientRect(); return { t: e.matches('.dzp-recherche') ? `[${e.querySelector('input').placeholder}` : (e.getAttribute('aria-label') || e.innerText).replace(/\s+/g, ' ').trim(), x: r.x, w: r.width, h: r.height }; }));
  const ecarts = PLANCHE_LIGNE.map(([t, x, w]) => { const b = boites.find((e) => e.t.startsWith(t)); return b ? { t, dx: Math.round((b.x - x) * 10) / 10, dw: Math.round((b.w - w) * 10) / 10, h: b.h } : { t, manque: true }; });
  check(ecarts.every((e) => !e.manque && Math.abs(e.dx) <= 2 && Math.abs(e.dw) <= 2 && e.h === 44), `au pixel près de la planche 1a (x et largeur à ±2 px, hauteur 44) : ${ecarts.map((e) => (e.manque ? `${e.t} absent` : `${e.t} ${e.dx >= 0 ? '+' : ''}${e.dx}/${e.dw >= 0 ? '+' : ''}${e.dw}`)).join(', ')}`);
  const tailles = await page.evaluate(() => {
    const st = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
    return { s: st('.dzp-semaine__s')?.fontSize, p: st('.dzp-semaine__p')?.fontSize, k: st('[data-testid=barre-semaine] .dzp-kicker')?.fontSize, exp: st('[data-testid=barre-semaine] [data-testid=bar-export]')?.backgroundColor,
      badge: st('[data-testid=barre-semaine] .dzp-badge')?.backgroundColor, plus: st('.dzp-pastille-plus')?.backgroundColor, champ: st('.dzp-recherche')?.borderTopColor };
  });
  check(tailles.s === '40px' && tailles.p === '17px' && tailles.k === '10.5px' && tailles.exp === 'rgb(255, 194, 26)' && tailles.badge === 'rgb(255, 194, 26)' && tailles.plus === 'rgb(229, 57, 53)' && tailles.champ === 'rgb(227, 218, 203)',
    `tailles et couleurs du HTML de 1a : S-42 40 px, dates 17 px, kicker 10,5 px, Exporter jaune, pastille Salariés jaune, pastille Plus rouge, champ bordé #E3DACB (${JSON.stringify(tailles)})`);
  // Bandeau de chiffres (quatre tuiles) et « Replier ▴ »
  const bandeau = await page.evaluate(() => ({ tuiles: document.querySelectorAll('[data-testid=bandeau] .dzp-tuile').length, barres: document.querySelectorAll('[data-testid=bandeau] .dzp-barre').length, replier: document.querySelector('[data-testid=haut-replier]')?.innerText }));
  check(bandeau.tuiles === 4 && bandeau.barres === 7 && bandeau.replier === 'Replier ▴', `bandeau du 1a : 4 tuiles (dont les 7 barres de la semaine) et « Replier ▴ » (${JSON.stringify(bandeau)})`);
  const t1440 = await tuile(page);
  check(t1440 && t1440.dehors.length === 0 && t1440.coupes.length === 0 && t1440.lignesTitre === 1 && t1440.titreEntier, `1440 : tuile « Heures envoyées » sans débordement (barres et « D 18 » dedans), titre sur une ligne (${JSON.stringify(t1440)})`);
  // Grille
  const grille = await page.evaluate(() => {
    const t = document.querySelector('.dzp-table'); const s = getComputedStyle(t); const th = document.querySelector('.dzp-th-nom');
    const auj = document.querySelector('.dzp-th-jour[data-auj]');
    return { fond: s.backgroundColor, bord: s.borderTopColor, rayon: s.borderTopLeftRadius, col: Math.round(th.getBoundingClientRect().width), auj: getComputedStyle(auj).backgroundColor, n: getComputedStyle(auj.querySelector('.dzp-jour__n')).fontSize, etiq: auj.querySelector('.dzp-etiq')?.innerText, sub: auj.querySelector('.dzp-jour__sub')?.innerText };
  });
  check(grille.fond === 'rgb(255, 253, 248)' && grille.bord === 'rgb(227, 218, 203)' && grille.rayon === '18px' && grille.col === 200 && grille.auj === 'rgb(255, 243, 204)' && grille.n === '24px' && grille.etiq === 'AUJ.' && /^\d+ interv\. · \d+ h$/.test(grille.sub || ''),
    `grille du 1a : carte #FFFDF8, bordure #E3DACB, rayon 18, colonne salarié 200 px (retouche, au lieu de 236), jeudi #FFF3CC, numéro 24 px, AUJ., « N interv. · N h » (${JSON.stringify(grille)})`);
  // Retouches (point 6) : l'en-tête dit « SALARIÉ », sans « ? » ; l'astuce est un petit lien au bout de la légende.
  const tete = await page.evaluate(() => ({ t: document.querySelector('.dzp-th-nom').innerText.trim(), aide: document.querySelectorAll('.dzp-table thead [data-testid=copy-tip-help], .dzp-table thead .bt-cp-help').length }));
  check(tete.t === 'SALARIÉ' && tete.aide === 0, `en-tête de la colonne : « SALARIÉ », sans « ? » (${JSON.stringify(tete)})`);
  const lien = page.locator('[data-testid=legende] [data-testid=legende-astuce] [data-testid=copy-tip-help]');
  const lienInfo = await lien.evaluate((e) => ({ t: getComputedStyle(e, '::before').content, nom: e.getAttribute('aria-label'), dernier: !e.closest('.dzp-legende__astuce').nextElementSibling })).catch(() => null);
  check(!!lienInfo && /Astuce : copier une case/.test(lienInfo.t) && lienInfo.dernier && /copier une case/.test(lienInfo.nom || ''), `« Astuce : copier une case » au bout de la légende (${JSON.stringify(lienInfo)})`);
  await lien.click(); await page.waitForTimeout(250);
  check(await page.locator('[data-testid=copy-tip]').isVisible(), 'le lien rouvre la même aide qu’avant (astuce « Copier une case »)');
  await page.evaluate(() => window.scrollTo(0, 0));
  await fermerAstuce(page); await page.waitForTimeout(150);
  const apresCompris = await page.evaluate(() => ({ y: Math.round(window.scrollY), focus: document.activeElement?.dataset.testid }));
  check(apresCompris.y === 0 && apresCompris.focus === 'copy-tip-help', `« Compris » : le focus va au lien de la légende sans faire sauter la page (${JSON.stringify(apresCompris)})`);
  // Retouches (point 4) : bulles compactes, une ligne par étiquette et par horaire (texte complet en infobulle) ; « 11 / 35 h » sur la ligne de la jauge.
  const r4 = await retours(page, '.dzp-table .dzp-etiquette, .dzp-table .dzp-bulle__heure');
  const sansTitre = await page.evaluate(() => [...document.querySelectorAll('.dzp-table .dzp-etiquette, .dzp-table .dzp-bulle__heure')].filter((e) => e.title !== e.textContent).length);
  check(r4.length === 0 && sansTitre === 0, `bulles : étiquettes et horaires sur une ligne (coupés par « … »), texte complet en infobulle (${r4.slice(0, 4).join(' | ')}${sansTitre ? ` · ${sansTitre} sans infobulle` : ''})`);
  const heuresL = await page.evaluate(() => [...document.querySelectorAll('.dzp-td-nom .dzp-heures')].map((h) => { const j = h.querySelector('.dzp-jauge').getBoundingClientRect(); const t = h.querySelector('.dzp-heures__t').getBoundingClientRect(); return { meme: Math.abs((j.top + j.bottom) / 2 - (t.top + t.bottom) / 2) < 6 && t.left > j.right, t: h.querySelector('.dzp-heures__t').innerText }; }));
  check(heuresL.length === 8 && heuresL.every((x) => x.meme && /^[\d.]+ \/ 35 h$/.test(x.t)), `« N / 35 h » sur la même ligne que la jauge, à droite (${heuresL.slice(0, 2).map((x) => x.t).join(', ')})`);
  const envoyee = await page.locator('.dzp-table .dzp-bulle[data-etat=envoyee]').first().evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, h: getComputedStyle(e.querySelector('.dzp-bulle__heure')).color, txt: e.querySelector('.dzp-bulle__heure').innerText, b: e.querySelector('.dzp-bulle__bande').getBoundingClientRect().width, r: getComputedStyle(e).borderTopLeftRadius }));
  check(envoyee.bg === 'rgb(21, 18, 15)' && envoyee.h === 'rgb(255, 194, 26)' && /^✓ \d\d:\d\d–\d\d:\d\d · \dh\d\d$/.test(envoyee.txt) && envoyee.b === 5 && envoyee.r === '12px', `bulle envoyée sombre, heure jaune « ✓ 08:00–12:00 · 4h00 », liseré 5 px, rayon 12 (${JSON.stringify(envoyee)})`);
  const etats = await page.evaluate(() => [...new Set([...document.querySelectorAll('.dzp-table .dzp-bulle')].map((e) => e.dataset.etat))].sort());
  check(['a-envoyer', 'ajoutee', 'en-cours', 'envoyee', 'prevue', 'retiree'].every((x) => etats.includes(x)) && await page.locator('.dzp-table .dzp-reunion').count() > 0, `états de la planche dessinés (${etats.join(', ')}, réunion)`);
  check(await page.locator('.dzp-table .dzp-absence').count() >= 6 && await page.locator('.dzp-table .dzp-vide').count() > 10 && await page.locator('[data-testid=legende][data-toujours]').isVisible(), 'absences rayées, cases vides « + », légende posée sous la grille');
  const r = await retours(page, '[data-testid=barre-noire], [data-testid=barre-semaine]');
  check(r.length === 0, `1440 : rien ne passe à la ligne dans la barre noire ni dans la ligne de semaine (${r.join(' | ')})`);
  await capture(page, '1a-deplie-1440.png');
  await capture(page, '1a-deplie-1440-entier.png', true);

  // Plus ⋯ : tout ce que la planche ne montre pas dans la ligne
  await page.click('[data-testid=bar-plus]'); await page.waitForTimeout(200);
  const plus = (await page.locator('[data-testid=menu-plus]').innerText()).replace(/\s+/g, ' ');
  const attendues = ['Réserves', 'Pièces jointes', 'Coût chantiers', 'Envoyer par e-mail', 'Imprimer', 'Versions du planning', 'Interventions supprimées ou décalées', 'Légende', 'S\'abonner'];
  const manquent = attendues.filter((x) => !plus.includes(x));
  check(manquent.length === 0 && !/Statistiques/.test(plus), `« Plus ⋯ » contient ${attendues.join(', ')} (Statistiques est l'onglet de la barre noire)${manquent.length ? ` — manquent : ${manquent.join(', ')}` : ''}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(await page.locator('[data-testid=menu-plus]').count() === 0, 'Échap ferme « Plus ⋯ »');
  // Compteur, haut DÉPLIÉ (retouches 2) : aucun panneau par-dessus le bandeau ; la liste « À relancer » se déplie DANS sa tuile (le panneau sous la barre
  // noire reste pour le haut replié : voir plus bas et retouches-2-controles.mjs).
  await page.click('[data-testid=stat-waiting]'); await page.waitForTimeout(250);
  const menu = page.locator('[data-testid=menu-chiffres]');
  const dansTuile = page.locator('[data-testid=bandeau] [data-testid=stat-relance] [data-testid=relance-row]');
  check(await menu.count() === 0 && await dansTuile.count() > 0, `haut déplié : un compteur déplie la liste « À relancer » dans sa tuile, sans panneau superposé (${await dansTuile.count()} ligne(s))`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(await dansTuile.count() === 0, 'Échap replie la liste de la tuile');
  await page.click('[data-testid=haut-replier]'); await page.waitForTimeout(250);
  await page.click('[data-testid=stat-waiting]'); await page.waitForTimeout(250);
  const pos = await menu.boundingBox();
  check(await menu.count() === 1 && pos && Math.round(pos.y) === 60 && await menu.locator('[data-testid=relance-row]').count() > 0, `haut replié : un compteur ouvre le détail sous la barre noire, avec la liste « À relancer » (y = ${pos && pos.y})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(await menu.count() === 0, 'Échap ferme le détail des chiffres');
  await page.click('[data-testid=haut-deplier]'); await page.waitForTimeout(250);
  check(erreurs.length === 0, `aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}

// ── Recherche (champ de la ligne de semaine) ─────────────────────────────────────────────────────────────────────────────────────
{
  const { page, ctx } = await ouvrir(1440, 900);
  await page.click('[data-testid=recherche-champ]');
  // Retouches (point 2) : pas de rectangle de focus dans la pilule ; le focus se voit sur la pilule elle-même (liseré fin, arrondi).
  const focus = await page.evaluate(() => { const i = document.activeElement; const s = getComputedStyle(i); const p = getComputedStyle(i.closest('.dzp-recherche')); return { champ: i.dataset.testid, outline: s.outlineStyle, ombre: s.boxShadow, bord: s.borderTopStyle, pBord: p.borderTopColor, pOmbre: p.boxShadow, pRayon: p.borderTopLeftRadius }; });
  check(focus.champ === 'recherche-champ' && focus.outline === 'none' && focus.ombre === 'none' && focus.bord === 'none' && focus.pBord === 'rgb(21, 18, 15)' && focus.pOmbre !== 'none' && focus.pRayon === '999px',
    `recherche au focus : champ interne sans contour ni outline, liseré #15120F + anneau doux sur la pilule arrondie (${JSON.stringify(focus)})`);
  await capture(page, '1a-recherche-focus-1440.png', false, true);
  await page.keyboard.type('bruno'); await page.waitForTimeout(250);
  const n1 = await page.locator('.dzp-table tbody tr .dzp-nom').allInnerTexts();
  check(n1.length === 1 && n1[0] === 'Bruno Essai', `« bruno » ne garde que Bruno Essai (${n1.join(', ')})`);
  await capture(page, '1a-recherche-1440.png');
  await page.fill('[data-testid=recherche-champ]', 'atelier'); await page.waitForTimeout(250);
  const n2 = await page.locator('.dzp-table tbody tr .dzp-nom').allInnerTexts();
  check(n2.length === 3 && n2.includes('Alex Test') && n2.includes('Chloé Exemple'), `« atelier » garde les salariés qui ont Atelier Fictif dans leur semaine (${n2.join(', ')})`);
  await page.fill('[data-testid=recherche-champ]', 'zzz'); await page.waitForTimeout(250);
  check(await page.locator('[data-testid=recherche-vide]').count() === 1, 'aucun résultat : la grille le dit');
  await page.keyboard.press('f'); await page.waitForTimeout(150);
  check(await page.locator('[data-testid=barre-noire]').count() === 1, 'la touche F dans le champ ne passe pas en plein écran');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check(await page.locator('.dzp-table tbody tr').count() === 8, 'Échap dans le champ efface la recherche : les 8 salariés reviennent');
  await ctx.close();
}

// ── « Replier ▴ » / « Déplier ▾ », mémorisé ────────────────────────────────────────────────────────────────────────────────────
{
  const { page, ctx, erreurs } = await ouvrir(1440, 900);
  // Retouches (point 1) : « Replier ▴ » et « Déplier ▾ » sont au MÊME endroit, dans la barre noire, juste avant « ✦ Assistant », même pilule.
  const bouton = (id) => page.evaluate((id) => {
    const b = document.querySelector(`[data-testid=${id}]`); if (!b) return null;
    const r = b.getBoundingClientRect(); const s = getComputedStyle(b); const suivant = b.nextElementSibling;
    return { dansBarre: !!b.closest('[data-testid=barre-noire]'), droite: Math.round(r.right), h: Math.round(r.height), avantAssistant: suivant?.dataset.testid === 'bar-assistant', bord: s.borderTopColor, fond: s.backgroundColor, couleur: s.color, rayon: s.borderTopLeftRadius, t: b.innerText };
  }, id);
  const avantRepli = await bouton('haut-replier');
  check(!!avantRepli && avantRepli.dansBarre && avantRepli.avantAssistant && avantRepli.t === 'Replier ▴' && await page.locator('.dzp-cockpit button:not(.dzp-tuile):not(.dzp-tuile__ouvrir), [data-testid=barre-semaine] [data-testid=haut-replier]').count() === 0,
    `« Replier ▴ » est dans la barre noire, juste avant « ✦ Assistant » ; plus rien sous la ligne de semaine (${JSON.stringify(avantRepli)})`);
  await page.click('[data-testid=haut-replier]'); await page.mouse.move(2, 500); await page.waitForTimeout(300);
  const apresRepli = await bouton('haut-deplier');
  check(!!apresRepli && apresRepli.dansBarre && apresRepli.avantAssistant && apresRepli.droite === avantRepli.droite && apresRepli.h === avantRepli.h
    && ['bord', 'fond', 'couleur', 'rayon'].every((k) => apresRepli[k] === avantRepli[k]),
    `« Déplier ▾ » au même endroit (bord droit ${apresRepli && apresRepli.droite} = ${avantRepli && avantRepli.droite} px) et dans le même style (${JSON.stringify(apresRepli)})`);
  const replie = await page.evaluate(() => ({
    semaine: !!document.querySelector('[data-testid=barre-semaine]'), bandeau: !!document.querySelector('[data-testid=bandeau]'),
    compact: (document.querySelector('[data-testid=semaine-compacte]')?.innerText || '').replace(/\s+/g, ' '),
    loupe: document.querySelector('[data-testid=barre-noire] [data-testid=bar-recherche]')?.getBoundingClientRect().height,
    exporter: document.querySelector('[data-testid=barre-noire] [data-testid=bar-export]')?.getBoundingClientRect().height,
    deplier: document.querySelector('[data-testid=haut-deplier]')?.innerText, deplierH: document.querySelector('[data-testid=haut-deplier]')?.getBoundingClientRect().height,
    fleche: document.querySelector('[data-testid=semaine-compacte] .dzp-b-fleche')?.getBoundingClientRect().height,
  }));
  check(!replie.semaine && !replie.bandeau, '« Replier ▴ » masque d’un coup la ligne de semaine et le bandeau de chiffres');
  check(/^← S-42 12–18 oct\. →$/.test(replie.compact) && replie.loupe === 38 && replie.exporter === 38 && replie.deplier === 'Déplier ▾' && replie.deplierH === 38 && replie.fleche === 36,
    `la barre noire reprend, compacts (style 2a : 36 / 38 px), « ${replie.compact} », la loupe, Exporter et « ${replie.deplier} » (${JSON.stringify(replie)})`);
  const lignes = await page.evaluate(() => [...document.querySelectorAll('.dzp-table tbody tr')].map((tr) => tr.getBoundingClientRect().bottom));
  const entieres = lignes.filter((b) => b <= 900).length;
  check(entieres >= 8, `replié : 8 salariés entiers à 1440 × 900 (${entieres} lignes entières, la 8e finit à ${Math.round(lignes[7] || 0)} px)`);
  await capture(page, '1a-replie-1440.png');
  // la loupe de la barre repliée filtre aussi
  await page.click('[data-testid=bar-recherche]'); await page.waitForTimeout(150);
  const focusLoupe = await page.evaluate(() => { const i = document.activeElement; const s = getComputedStyle(i); const p = getComputedStyle(i.closest('.dzp-loupe__champ')); return { champ: i.dataset.testid, outline: s.outlineStyle, ombre: s.boxShadow, pilule: p.boxShadow }; });
  check(focusLoupe.champ === 'recherche-champ' && focusLoupe.outline === 'none' && focusLoupe.ombre === 'none' && /rgba\(255, 194, 26/.test(focusLoupe.pilule),
    `loupe repliée au focus : aucun contour sur le champ interne, anneau jaune doux sur la pilule (${JSON.stringify(focusLoupe)})`);
  await page.keyboard.type('bruno'); await page.waitForTimeout(250);
  check((await page.locator('.dzp-table tbody tr').count()) === 1, 'replié : la loupe filtre la grille (même filtre)');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await recharger(page);
  check(await page.locator('[data-testid=barre-semaine]').count() === 0 && await page.locator('[data-testid=haut-deplier]').count() === 1, 'le choix « replié » est gardé après rechargement');
  await page.click('[data-testid=haut-deplier]'); await page.waitForTimeout(300);
  check(await page.locator('[data-testid=barre-semaine]').count() === 1 && await page.locator('[data-testid=bandeau]').count() === 1 && await page.locator('[data-testid=semaine-compacte]').count() === 0, '« Déplier ▾ » remet la ligne de semaine et le bandeau');
  await recharger(page);
  check(await page.locator('[data-testid=barre-semaine]').count() === 1, 'le choix « déplié » est gardé après rechargement');
  check(erreurs.length === 0, `aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}

// ── Plein écran : ⤢ ou F, Échap ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { page, ctx, erreurs } = await ouvrir(1440, 900);
  await page.click('[data-testid=bar-plein-ecran]'); await page.waitForTimeout(250);
  const pe = await page.evaluate(() => ({
    reste: ['[data-testid=barre-noire]', '[data-testid=barre-semaine]', '[data-testid=bandeau]', '[data-testid=haut-replier]', '.dzp-astuce'].filter((s) => document.querySelector(s)),
    // Retouches 2 : la pastille noire (S-42 ← → « ⤡ Quitter · Échap ») est devenue un seul bouton rond de 40 px ; la semaine est dans la case « SALARIÉ ».
    pastille: document.querySelector('[data-testid=quitter-plein-ecran]')?.getAttribute('aria-label') || '',
    semaine: (document.querySelector('.dzp-th-nom [data-testid=pe-semaine]')?.innerText || '').replace(/\s+/g, ' '),
    pos: (() => { const r = document.querySelector('[data-testid=quitter-plein-ecran]')?.getBoundingClientRect(); return r ? { droite: Math.round(innerWidth - r.right), bas: Math.round(innerHeight - r.bottom) } : null; })(),
  }));
  check(pe.reste.length === 0 && pe.pastille === 'Quitter le plein écran (Échap)' && pe.semaine === '‹ S-42 ›' && pe.pos && pe.pos.droite === 14,
    `⤢ : tout le haut est masqué, seul reste le bouton rond « ${pe.pastille} » ; « ${pe.semaine} » dans la case SALARIÉ${pe.reste.length ? ` — restent : ${pe.reste.join(', ')}` : ''}`);
  const peHaut = await page.evaluate(() => {
    const p = document.querySelector('[data-testid=quitter-plein-ecran]').getBoundingClientRect(); const th = document.querySelector('.dzp-table thead').getBoundingClientRect(); const leg = document.querySelector('[data-testid=legende]').getBoundingClientRect();
    return { haut: Math.round(p.top), droite: Math.round(innerWidth - p.right), basPastille: Math.round(p.bottom), hautGrille: Math.round(th.top), legende: Math.round(leg.top) };
  });
  check(peHaut.haut === 12 && peHaut.droite === 14 && peHaut.basPastille <= peHaut.hautGrille && peHaut.legende >= peHaut.basPastille,
    `plein écran : bouton rond EN HAUT à droite (top 12, right 14), au-dessus de l'en-tête des jours, sans masquer la grille ni la légende (${JSON.stringify(peHaut)})`);
  await capture(page, '1a-pleinecran-1440.png');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=barre-semaine]').count() === 1 && await page.locator('[data-testid=quitter-plein-ecran]').count() === 0, 'Échap sort du plein écran');
  await page.keyboard.press('f'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=barre-noire]').count() === 0 && await page.locator('[data-testid=quitter-plein-ecran]').count() === 1, 'la touche F (hors champ) passe en plein écran');
  await page.click('[data-testid=quitter-plein-ecran]'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=barre-noire]').count() === 1, 'le bouton rond « Quitter le plein écran » ramène le haut');
  check(erreurs.length === 0, `aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}

// ── Compteurs à 0 masqués ────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { page, ctx } = await ouvrir(1440, 900, { avant: (D) => { D.leave_requests.length = 0; D.documents.length = 0; } });
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid=compteurs] > *')].map((e) => e.dataset.testid));
  check(!ids.includes('compteur-conges') && !ids.includes('compteur-pieces') && ids.includes('stat-waiting'), `compteurs à 0 masqués (restent : ${ids.join(', ')})`);
  await ctx.close();
}

// ── 1024 × 768 : aucun texte qui passe à la ligne, rien qui dépasse (déplié puis replié) ────────────────────────────────────────
const ZONES = '[data-testid=barre-noire], [data-testid=barre-semaine], [data-testid=bandeau], .dzp-table thead, .dzp-td-nom, .dzp-table [data-testid=bubble], .dzp-absence, .dzp-reunion';
{
  const { page, ctx, erreurs } = await ouvrir(1024, 768);
  const r = await retours(page, ZONES);
  check(r.length === 0, `1024 déplié : aucun texte qui passe à la ligne (${r.slice(0, 6).join(' | ')})`);
  const d = await debords(page, '[data-testid=barre-noire], [data-testid=barre-semaine], [data-testid=bandeau]');
  check(d.length === 0 && await hScroll(page) <= 0, `1024 déplié : rien ne dépasse à droite, pas de défilement horizontal (${d.join(', ')})`);
  const elems = await ligne(page);
  const trous = elems.slice(1).map((e, i) => Math.round((e.x - elems[i].d) * 10) / 10);
  check(trous.every((g) => g <= 24 && g >= 0), `1024 : ligne de semaine sans trou ni chevauchement (écarts : ${trous.join(', ')} px)`);
  const t1024 = await tuile(page);
  check(t1024 && t1024.dehors.length === 0 && t1024.coupes.length === 0, `1024 : tuile « Heures envoyées » sans débordement, aucun libellé de barre coupé (${JSON.stringify(t1024)})`);
  check(Math.round(await page.evaluate(() => document.querySelector('.dzp-th-nom').getBoundingClientRect().width)) === 176, '1024 : colonne salarié de 176 px (comme avant)');
  const repli1024 = await page.evaluate(() => { const b = document.querySelector('[data-testid=haut-replier]'); const n = document.querySelector('[data-testid=barre-noire]').getBoundingClientRect(); const r = b?.getBoundingClientRect(); return r ? { dansBarre: !!b.closest('[data-testid=barre-noire]'), dedans: r.right <= n.right && r.top >= n.top && r.bottom <= n.bottom } : null; });
  check(!!repli1024 && repli1024.dansBarre && repli1024.dedans, `1024 : « Replier ▴ » tient dans la barre noire (${JSON.stringify(repli1024)})`);
  await capture(page, '1a-1024.png');
  await page.click('[data-testid=haut-replier]'); await page.waitForTimeout(300);
  const r2 = await retours(page, ZONES);
  const d2 = await debords(page, '[data-testid=barre-noire]');
  check(r2.length === 0 && d2.length === 0 && await hScroll(page) <= 0, `1024 replié : barre noire compacte sans retour à la ligne ni débord (${[...r2, ...d2].slice(0, 6).join(' | ')})`);
  await capture(page, '1a-replie-1024.png');
  check(erreurs.length === 0, `1024 : aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}
{
  const { page, ctx } = await ouvrir(1280, 800);
  const r = await retours(page, '[data-testid=barre-noire], [data-testid=barre-semaine]');
  const d = await debords(page, '[data-testid=barre-noire], [data-testid=barre-semaine]');
  check(r.length === 0 && d.length === 0 && await hScroll(page) <= 0, `1280 : barre et ligne de semaine sur une ligne, sans débord (${[...r, ...d].slice(0, 6).join(' | ')})`);
  const t1280 = await tuile(page);
  check(t1280 && t1280.dehors.length === 0 && t1280.coupes.length === 0 && t1280.lignesTitre === 1 && t1280.titreEntier, `1280 : tuile « Heures envoyées » sans débordement, titre sur une ligne (${JSON.stringify(t1280)})`);
  check(Math.round(await page.evaluate(() => document.querySelector('.dzp-th-nom').getBoundingClientRect().width)) === 200, '1280 : colonne salarié de 200 px');
  await ctx.close();
}

// ── Tablette (834) : rien ne bouge (barre unique et grille 2a) ────────────────────────────────────────────────────────────────────
{
  const { page, ctx } = await ouvrir(834, 1112, { tactile: true });
  const t = await page.evaluate(() => ({ unique: !!document.querySelector('.dzp-barre2a'), semaine: !!document.querySelector('.dzp-semaine'), cartes: document.querySelectorAll('.dzp-table .dzp-carte').length, mise: document.querySelector('.dzp-bureau-desk')?.dataset.mise }));
  check(t.unique && !t.semaine && t.cartes > 10 && t.mise === '2a' && await hScroll(page) <= 0, `834 : la tablette garde la barre unique et la grille compacte 2a, sans défilement horizontal (${JSON.stringify(t)})`);
  await page.click('[data-testid=bar-plein-ecran]'); await page.waitForTimeout(250);
  const peT = await page.evaluate(() => { const p = document.querySelector('[data-testid=quitter-plein-ecran]').getBoundingClientRect(); const th = document.querySelector('.dzp-table thead').getBoundingClientRect(); return { haut: Math.round(p.top), droite: Math.round(innerWidth - p.right), dessus: p.bottom <= th.top }; });
  check(peT.haut === 12 && peT.droite === 14 && peT.dessus, `834 : plein écran, bouton rond en haut à droite (top 12, right 14) au-dessus de l'en-tête des jours (${JSON.stringify(peT)})`);
  await ctx.close();
}
{
  const { page, ctx } = await ouvrir(390, 844, { tactile: true });
  const tel = await page.evaluate(() => ({ bouton: [...document.querySelectorAll('[data-testid=bar-plein-ecran]')].some((e) => e.getBoundingClientRect().width > 0) }));
  await page.keyboard.press('f'); await page.waitForTimeout(200);
  const pastilleVue = await page.evaluate(() => [...document.querySelectorAll('[data-testid=quitter-plein-ecran]')].some((e) => e.getBoundingClientRect().width > 0));
  check(!tel.bouton && !pastilleVue, `390 : pas de plein écran au téléphone (ni bouton ⤢, ni pastille, même avec la touche F) (${JSON.stringify({ ...tel, pastilleVue })})`);
  await ctx.close();
}

// ── Assistant BEMEXO : un bouton d'action (« Salariés → ») ou un lien « ouvrir: » réduit le panneau en pastille ✦ ; la conversation reste ──────
/** Ouvre l'assistant (réponse simulée de la fonction `assistant`), pose une question, attend la réponse avec son bouton. */
const assistantRepond = async (page, ctx, lien) => {
  await ctx.route('**/functions/v1/assistant', (r) => r.fulfill({ json: { answer: 'La liste de vos salariés est dans « Salariés ».', links: [lien], remaining: 42 } }));
  await page.click('[data-testid=bar-assistant]');
  await page.waitForSelector('[data-testid=assistant-panel] textarea', { timeout: 15000 });
  await page.fill('[data-testid=assistant-panel] textarea', 'Où sont mes salariés ?');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=assistant-panel] .as-links button', { timeout: 15000 });
};
const etatAssistant = (page) => page.evaluate(() => {
  const p = document.querySelector('[data-testid=assistant-panel]'); const s = p ? getComputedStyle(p) : null;
  const pa = document.querySelector('[data-testid=assistant-pastille]'); const r = pa?.getBoundingClientRect();
  const fen = [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getBoundingClientRect().width > 0);
  const pr = p?.getBoundingClientRect();
  const chevauche = !!pr && s.visibility !== 'hidden' && fen.some((d) => { const b = d.getBoundingClientRect(); return b.left < pr.right && b.right > pr.left; });
  return {
    panneauVisible: !!p && s.visibility !== 'hidden' && s.opacity !== '0', messages: document.querySelectorAll('[data-testid=assistant-panel] .as-bot, [data-testid=assistant-panel] .as-me').length,
    pastille: r ? { l: Math.round(r.width), h: Math.round(r.height), droite: Math.round(innerWidth - r.right), bas: Math.round(innerHeight - r.bottom), fond: getComputedStyle(pa).backgroundColor, point: !!pa.querySelector('.dz-as-pastille-v2__point') } : null,
    fenetres: fen.length, salaries: fen.some((d) => /Salariés/.test(d.innerText)), chevauche,
  };
});
{
  const { page, ctx, erreurs } = await ouvrir(1440, 900);
  await assistantRepond(page, ctx, { label: 'Salariés', action: 'salaries' });
  const avant = await etatAssistant(page);
  await page.click('[data-testid=assistant-panel] .as-links button'); await page.waitForTimeout(600);
  const apres = await etatAssistant(page);
  check(avant.panneauVisible && !apres.panneauVisible && apres.salaries && !apres.chevauche,
    `« Salariés → » : la fenêtre Salariés s'ouvre seule, le panneau de l'assistant se réduit (plus de chevauchement) (${JSON.stringify({ avant: avant.panneauVisible, apres })})`);
  check(!!apres.pastille && apres.pastille.l === 48 && apres.pastille.h === 48 && apres.pastille.droite === 20 && apres.pastille.bas === 20 && apres.pastille.fond === 'rgb(255, 194, 26)' && !apres.pastille.point,
    `pastille ✦ de 48 px, jaune, en bas à droite (${JSON.stringify(apres.pastille)})`);
  await capture(page, '1a-assistant-salaries-1440.png');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const ferme = await etatAssistant(page);
  check(ferme.fenetres === 0 && !ferme.panneauVisible && !!ferme.pastille, `fermer la fenêtre ne rouvre pas l'assistant : la pastille reste (${JSON.stringify(ferme)})`);
  await page.click('[data-testid=assistant-pastille]'); await page.waitForTimeout(400);
  const repris = await etatAssistant(page);
  check(repris.panneauVisible && repris.messages === avant.messages && !repris.pastille, `un clic sur la pastille rouvre le panneau, conversation intacte (${repris.messages} messages)`);
  // Lien « ouvrir: » (registre d'ouverture, inchangé) : même réduction.
  await page.fill('[data-testid=assistant-panel] textarea', 'Ouvre les salariés');
  await ctx.unroute('**/functions/v1/assistant');
  await ctx.route('**/functions/v1/assistant', (r) => r.fulfill({ json: { answer: 'Voici la liste.', links: [{ label: 'Ouvrir la liste des salariés', action: 'ouvrir:salaries.liste' }], remaining: 41 } }));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=assistant-panel] .as-links button').length >= 2, null, { timeout: 15000 });
  await page.locator('[data-testid=assistant-panel] .as-links button').last().click(); await page.waitForTimeout(600);
  const ouvrir2 = await etatAssistant(page);
  check(!ouvrir2.panneauVisible && ouvrir2.salaries && !!ouvrir2.pastille, `lien « ouvrir:salaries.liste » : même réduction en pastille (${JSON.stringify(ouvrir2)})`);
  check(erreurs.length === 0, `assistant : aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}
{
  // Une réponse arrive pendant que le panneau est réduit : petit point sur la pastille ; il disparaît à la réouverture.
  const { page, ctx } = await ouvrir(1440, 900);
  await assistantRepond(page, ctx, { label: 'Salariés', action: 'salaries' });
  await ctx.unroute('**/functions/v1/assistant');
  await ctx.route('**/functions/v1/assistant', async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.fulfill({ json: { answer: 'Autre réponse.', links: [], remaining: 40 } }); });
  await page.fill('[data-testid=assistant-panel] textarea', 'Et les congés ?');
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.locator('[data-testid=assistant-panel] .as-links button').first().click(); await page.waitForTimeout(300);
  const sansPoint = await etatAssistant(page);
  await page.waitForTimeout(2200);
  const avecPoint = await etatAssistant(page);
  await page.click('[data-testid=assistant-pastille]'); await page.waitForTimeout(400);
  const rouvert = await etatAssistant(page);
  check(!!sansPoint.pastille && !sansPoint.pastille.point && !!avecPoint.pastille && avecPoint.pastille.point && rouvert.panneauVisible && !rouvert.pastille,
    `réponse non lue pendant la réduction : point sur la pastille, effacé à la réouverture (${JSON.stringify({ avant: sansPoint.pastille, apres: avecPoint.pastille })})`);
  await ctx.close();
}
{
  // Mouvement réduit : pas d'animation (ni sur le panneau, ni sur la pastille).
  const { page, ctx } = await ouvrir(1440, 900);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await assistantRepond(page, ctx, { label: 'Salariés', action: 'salaries' });
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=assistant-panel]')).transitionDuration);
  await page.click('[data-testid=assistant-panel] .as-links button'); await page.waitForTimeout(300);
  const animP = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=assistant-pastille]')).animationName);
  check(/^0s(, 0s)*$/.test(anim) && animP === 'none', `prefers-reduced-motion : aucune animation (${anim} · ${animP})`);
  await ctx.close();
}
{
  // Sans ?ui=2 : le bureau d'avant, aucune pastille (l'assistant reste ouvert à côté de la fenêtre, comme aujourd'hui).
  sim.reinitialiser();
  const { page, ctx } = await sim.page({ ui: null, largeur: 1440, hauteur: 900 });
  await assistantRepond(page, ctx, { label: 'Salariés', action: 'salaries' });
  await page.click('[data-testid=assistant-panel] .as-links button'); await page.waitForTimeout(600);
  const v1 = await etatAssistant(page);
  check(v1.panneauVisible && !v1.pastille, `sans ?ui=2 : comportement d'avant, panneau visible et aucune pastille (${JSON.stringify(v1)})`);
  await ctx.close();
}

// ── Image « planche | écran déplié » à la même échelle ───────────────────────────────────────────────────────────────────────────
if (process.env.PLANCHE_DIR) {
  const planche = path.resolve(process.env.PLANCHE_DIR, 'planche-1a-1440.png');
  const ecran = path.resolve(CAPTURES, '1a-deplie-1440-entier.png');
  if (fs.existsSync(planche) && fs.existsSync(ecran)) {
    const dims = (f) => { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
    const p = dims(planche); const e = dims(ecran);
    const ctx = await sim.browser.newContext({ viewport: { width: 2904, height: Math.max(p.h, e.h) + 52 } });
    const pg = await ctx.newPage();
    const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
    await pg.setContent(`<body style="margin:0;background:#C9B998;font:700 15px system-ui;display:flex;align-items:flex-start;gap:24px;padding:0">
      <figure style="margin:0"><figcaption style="height:52px;display:flex;align-items:center;padding-left:12px">Planche 1a « Bureau · ordinateur 1440 » (cockpit et envoyées sombres allumés)</figcaption><img src="${b64(planche)}" width="${p.w}" height="${p.h}"></figure>
      <figure style="margin:0"><figcaption style="height:52px;display:flex;align-items:center;padding-left:12px">Écran /admin?ui=2 · 1440 px, déplié · données simulées du jeu « 2a »</figcaption><img src="${b64(ecran)}" width="${e.w}" height="${e.h}"></figure></body>`);
    await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(CAPTURES, 'compare-1a-1440.png') });
    await ctx.close();
    console.log('compare-1a-1440.png écrite');
  } else console.log(`(pas de planche dans ${planche} : compare-1a-1440.png non écrite)`);
}
fs.rmSync(path.join(CAPTURES, '1a-deplie-1440-entier.png'), { force: true });

await sim.fermer();
console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
