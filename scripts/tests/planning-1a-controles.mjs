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
const capture = async (page, nom, plein = false) => { await page.evaluate(() => document.activeElement?.blur?.()); await page.mouse.move(2, 2); await page.waitForTimeout(300); await page.screenshot({ path: path.join(CAPTURES, nom), fullPage: plein }); };
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
  // Grille
  const grille = await page.evaluate(() => {
    const t = document.querySelector('.dzp-table'); const s = getComputedStyle(t); const th = document.querySelector('.dzp-th-nom');
    const auj = document.querySelector('.dzp-th-jour[data-auj]');
    return { fond: s.backgroundColor, bord: s.borderTopColor, rayon: s.borderTopLeftRadius, col: Math.round(th.getBoundingClientRect().width), auj: getComputedStyle(auj).backgroundColor, n: getComputedStyle(auj.querySelector('.dzp-jour__n')).fontSize, etiq: auj.querySelector('.dzp-etiq')?.innerText, sub: auj.querySelector('.dzp-jour__sub')?.innerText };
  });
  check(grille.fond === 'rgb(255, 253, 248)' && grille.bord === 'rgb(227, 218, 203)' && grille.rayon === '18px' && grille.col === 236 && grille.auj === 'rgb(255, 243, 204)' && grille.n === '24px' && grille.etiq === 'AUJ.' && /^\d+ interv\. · \d+ h$/.test(grille.sub || ''),
    `grille du 1a : carte #FFFDF8, bordure #E3DACB, rayon 18, colonne salarié 236 px, jeudi #FFF3CC, numéro 24 px, AUJ., « N interv. · N h » (${JSON.stringify(grille)})`);
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
  // Compteur → menu des chiffres sous la barre (comme aujourd'hui)
  await page.click('[data-testid=stat-waiting]'); await page.waitForTimeout(250);
  const menu = page.locator('[data-testid=menu-chiffres]');
  const pos = await menu.boundingBox();
  check(await menu.count() === 1 && pos && Math.round(pos.y) === 60 && await menu.locator('[data-testid=relance-row]').count() > 0, `un compteur ouvre le détail sous la barre noire, avec la liste « À relancer » (y = ${pos && pos.y})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(await menu.count() === 0, 'Échap ferme le détail des chiffres');
  check(erreurs.length === 0, `aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}

// ── Recherche (champ de la ligne de semaine) ─────────────────────────────────────────────────────────────────────────────────────
{
  const { page, ctx } = await ouvrir(1440, 900);
  await page.click('[data-testid=recherche-champ]');
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
  await page.click('[data-testid=haut-replier]'); await page.waitForTimeout(300);
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
    pastille: (document.querySelector('[data-testid=pastille-plein-ecran]')?.innerText || '').replace(/\s+/g, ' '),
    pos: (() => { const r = document.querySelector('[data-testid=pastille-plein-ecran]')?.getBoundingClientRect(); return r ? { droite: Math.round(innerWidth - r.right), bas: Math.round(innerHeight - r.bottom) } : null; })(),
  }));
  check(pe.reste.length === 0 && /^S-42 ← → ⤡ Quitter · Échap$/.test(pe.pastille) && pe.pos && pe.pos.droite === 20 && pe.pos.bas === 20,
    `⤢ : tout le haut est masqué, seule reste la pastille (« ${pe.pastille} », en bas à droite comme la planche 1a : ${JSON.stringify(pe.pos)})${pe.reste.length ? ` — restent : ${pe.reste.join(', ')}` : ''}`);
  await capture(page, '1a-pleinecran-1440.png');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=barre-semaine]').count() === 1 && await page.locator('[data-testid=pastille-plein-ecran]').count() === 0, 'Échap sort du plein écran');
  await page.keyboard.press('f'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=barre-noire]').count() === 0 && await page.locator('[data-testid=pastille-plein-ecran]').count() === 1, 'la touche F (hors champ) passe en plein écran');
  await page.click('[data-testid=quitter-plein-ecran]'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=barre-noire]').count() === 1, '« ⤡ Quitter · Échap » ramène le haut');
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
  await ctx.close();
}

// ── Tablette (834) : rien ne bouge (barre unique et grille 2a) ────────────────────────────────────────────────────────────────────
{
  const { page, ctx } = await ouvrir(834, 1112, { tactile: true });
  const t = await page.evaluate(() => ({ unique: !!document.querySelector('.dzp-barre2a'), semaine: !!document.querySelector('.dzp-semaine'), cartes: document.querySelectorAll('.dzp-table .dzp-carte').length, mise: document.querySelector('.dzp-bureau-desk')?.dataset.mise }));
  check(t.unique && !t.semaine && t.cartes > 10 && t.mise === '2a' && await hScroll(page) <= 0, `834 : la tablette garde la barre unique et la grille compacte 2a, sans défilement horizontal (${JSON.stringify(t)})`);
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
