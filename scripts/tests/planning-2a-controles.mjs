// Planning du bureau, planche d'essai 2a (« Bureau · barre unique + plein écran ») : contrôles et captures de l'étape ORDINATEUR (/admin?ui=2).
//   node scripts/tests/planning-2a-controles.mjs <out> <dossier-de-captures> [port]
//   BASE_URL=http://localhost:3100 node scripts/tests/planning-2a-controles.mjs - <dossier>      (serveur de développement au lieu de out/)
//   PLANCHE_DIR=<dossier>  : dossier de planche-essai-2a.mjs (planche-2a-1440.png) → écrit aussi compare-2a-1440.png (planche | écran, même échelle).
// Données : bureau-sim.mjs, jeu « 2a » (les huit salariés et les cases du script de la planche), horloge figée au jeudi 15 octobre 2026, 9 h 30.
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';

const [,, OUT = 'out', CAPTURES = 'captures-planning-2a', PORT = '4431'] = process.argv;
const BASE = process.env.BASE_URL || null;
fs.mkdirSync(CAPTURES, { recursive: true });
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sim = await demarrer({ out: OUT, port: Number(PORT), base: BASE, jeu: '2a' });
const ouvrir = async (largeur, hauteur, opts = {}) => {
  sim.reinitialiser(); if (opts.avant) opts.avant(sim.D);
  const r = await sim.page({ ui: 2, largeur, hauteur, hasTouch: !!opts.tactile, attente: largeur < 1024 ? '.dzp-m-carte' : '.dzp-table .dzp-carte' });
  // L'astuce « Copier une case » (carte flottante du lot 1, mémorisée une fois « Compris ») : on la referme pour que les captures montrent le planning.
  const compris = r.page.getByRole('button', { name: 'Compris', exact: true });
  if (await compris.count()) { await compris.first().click().catch(() => {}); await r.page.waitForTimeout(200); }
  return r;
};
const capture = async (page, nom) => { await page.mouse.move(2, 2); await page.waitForTimeout(250); await page.screenshot({ path: path.join(CAPTURES, nom) }); };
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

// ── 1440 × 900 : la barre, la grille, les compteurs ──────────────────────────────────────────────
{
  const { page, ctx, erreurs } = await ouvrir(1440, 900);
  const barre = await page.locator('[data-testid=barre-noire]').boundingBox();
  check(barre && Math.round(barre.height) === 64 && Math.round(barre.y) === 0, `barre unique de 64 px en haut (${barre && barre.height} px)`);
  check(await page.locator('.dzp-semaine, [data-testid=bandeau], [data-testid=bandeau-replie]').count() === 0, 'plus de seconde barre ni de bandeau de chiffres');
  const ordre = await page.evaluate(() => [...document.querySelectorAll('[data-testid=barre-noire] .dzp-logo, [data-testid=barre-noire] .dzp-b-semaine, [data-testid=barre-noire] .dzp-b-compteurs, [data-testid=barre-noire] .dzp-b-actions')].map((e) => e.className.split(' ')[0]));
  check(ordre.join(',') === 'dzp-logo,dzp-b-semaine,dzp-b-compteurs,dzp-b-actions', `ordre de la barre : logo, semaine, compteurs, actions (${ordre.join(', ')})`);
  const actions = await page.evaluate(() => [...document.querySelectorAll('.dzp-b-actions > *')].map((e) => { const b = e.matches('button') ? e : e.querySelector('button'); return (b?.getAttribute('aria-label') || b?.textContent || '').trim().replace(/\s+/g, ' '); }));
  check(/^Chercher.*Clients.*Salariés.*Sélectionner.*Plus ⋯.*↓ Exporter.*Assistant.*Plein écran.*Entreprise Test/.test(actions.join(' | ')), `actions dans l'ordre : loupe, Clients, Salariés, Sélectionner, Plus ⋯, ↓ Exporter, ✦, ⤢, avatar (${actions.join(' | ')})`);
  const semaine = (await page.locator('.dzp-b-semaine').innerText()).replace(/\s+/g, ' ');
  check(/← S-42 12–18 oct\. → ACTUELLE/.test(semaine), `semaine : « ${semaine} »`);
  const compteurs = (await page.locator('.dzp-b-compteurs').innerText()).replace(/\s+/g, ' ').trim();
  check(/j\s*à relancer/.test(compteurs) && /1\s*congé/.test(compteurs) && /3\s*pièces/.test(compteurs) && /1\s*réserve/.test(compteurs), `compteurs : « ${compteurs} »`);
  const export_ = await page.locator('[data-testid=bar-export]').evaluate((e) => getComputedStyle(e).backgroundColor);
  check(export_ === 'rgb(255, 194, 26)', `« ↓ Exporter » jaune plein (${export_})`);
  const lignes = await page.evaluate(() => [...document.querySelectorAll('.dzp-table tbody tr')].map((tr) => tr.getBoundingClientRect().bottom));
  const visibles = lignes.filter((b) => b <= 900).length;
  check(visibles >= 8, `8 salariés visibles à 1440 × 900 (${visibles} lignes entières, la 8e finit à ${Math.round(lignes[7] || 0)} px)`);
  const grille = await page.evaluate(() => {
    const t = document.querySelector('.dzp-table'); const s = getComputedStyle(t); const th = document.querySelector('.dzp-th-nom');
    return { fond: s.backgroundColor, bord: s.borderTopColor, rayon: s.borderTopLeftRadius, col: Math.round(th.getBoundingClientRect().width) };
  });
  check(grille.fond === 'rgb(255, 253, 248)' && grille.bord === 'rgb(227, 218, 203)' && grille.rayon === '16px' && grille.col === 220, `grille : carte #FFFDF8, bordure #E3DACB, rayon 16, colonne salarié 220 px (${JSON.stringify(grille)})`);
  const entete = (await page.locator('.dzp-th-nom').innerText()).replace(/\s+/g, ' ');
  check(/SALARIÉ \d+ h envoyées/.test(entete), `en-tête « ${entete} »`);
  const auj = await page.locator('.dzp-th-jour[data-auj]').evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, sh: getComputedStyle(e).boxShadow, n: getComputedStyle(e.querySelector('.dzp-jour__n')).fontSize, w: getComputedStyle(e.querySelector('.dzp-jour__n')).fontWeight, j: e.querySelector('.dzp-jour__jauge').getBoundingClientRect().height }));
  check(auj.bg === 'rgb(255, 243, 204)' && /255, 194, 26/.test(auj.sh) && auj.n === '21px' && auj.w === '900' && auj.j === 4, `jour d'aujourd'hui : fond #FFF3CC, liseré jaune, numéro 900 21 px, jauge 4 px (${JSON.stringify(auj)})`);
  const envoyee = await page.locator('.dzp-carte[data-etat=envoyee]').first().evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, h: getComputedStyle(e.querySelector('.dzp-carte__heure')).color, l: e.querySelector('.dzp-carte__lisere').getBoundingClientRect().width, t: getComputedStyle(e.querySelector('.dzp-carte__titre')).fontSize, txt: e.innerText }));
  check(envoyee.bg === 'rgb(21, 18, 15)' && envoyee.h === 'rgb(255, 194, 26)' && envoyee.l === 4 && envoyee.t === '12.5px' && /✓ \d\d:\d\d–\d\d:\d\d · \dh\d\d/.test(envoyee.txt), `bulle envoyée sombre, heure jaune « ✓ 08:00–12:00 · 4h00 », liseré 4 px (${JSON.stringify(envoyee)})`);
  const etats = await page.evaluate(() => [...new Set([...document.querySelectorAll('.dzp-table .dzp-carte')].map((e) => e.dataset.etat))].sort());
  check(['a-envoyer', 'ajoutee', 'en-cours', 'envoyee', 'prevue', 'retiree', 'reunion'].every((x) => etats.includes(x)), `les sept états de la planche sont dessinés (${etats.join(', ')})`);
  check(await page.locator('.dzp-table .dzp-absence').count() >= 6 && await page.locator('.dzp-table .dzp-vide').count() > 10, 'absences rayées et cases vides « + » en pointillés');
  const jauge = await page.locator('.dzp-td-nom .dzp-jauge span').first().evaluate((e) => ({ h: e.parentElement.getBoundingClientRect().height, bg: getComputedStyle(e).backgroundImage }));
  check(jauge.h === 5 && /255, 194, 26.*255, 138, 61/.test(jauge.bg), `barre de progression 5 px, dégradé #FFC21A → #FF8A3D (${JSON.stringify(jauge)})`);
  await capture(page, '2a-1440.png');

  // Plus ⋯ : toutes les fonctions qui ne sont plus dans la barre
  await page.click('[data-testid=bar-plus]'); await page.waitForTimeout(200);
  const plus = (await page.locator('[data-testid=menu-plus]').innerText()).replace(/\s+/g, ' ');
  const attendues = ['Réserves', 'Pièces jointes', 'Coût chantiers', 'Statistiques', 'Envoyer par e-mail', 'Imprimer', 'Versions du planning', 'Interventions supprimées ou décalées', 'Légende', 'S\'abonner'];
  const manquent = attendues.filter((x) => !plus.includes(x));
  check(manquent.length === 0, `« Plus ⋯ » contient ${attendues.join(', ')}${manquent.length ? ` — manquent : ${manquent.join(', ')}` : ''}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(await page.locator('[data-testid=menu-plus]').count() === 0, 'Échap ferme « Plus ⋯ »');

  // Menu des chiffres : s'ouvre au clic sur un compteur, se ferme par Échap et au clic dehors
  await page.click('[data-testid=stat-waiting]'); await page.waitForTimeout(250);
  const menu = page.locator('[data-testid=menu-chiffres]');
  const tuiles = await menu.locator('.dzp-tuile').count();
  const posMenu = await menu.boundingBox();
  check(tuiles === 4 && posMenu && Math.round(posMenu.y) === 64, `menu des chiffres ouvert sous la barre : 4 tuiles du 1a (${tuiles}, y = ${posMenu && posMenu.y})`);
  check(await menu.locator('[data-testid=relance-row]').count() > 0 && await menu.locator('.dzp-barre').count() === 7, 'tuile « À relancer » avec la liste ; tuile sombre avec les 7 barres');
  await capture(page, '2a-chiffres-ouverts-1440.png');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(await menu.count() === 0, 'Échap ferme le menu des chiffres');
  await page.click('[data-testid=compteur-conges]'); await page.waitForTimeout(200);
  check(await menu.count() === 1, 'un autre compteur l’ouvre aussi');
  await page.click('[data-testid=barre-noire] .dzp-logo'); await page.waitForTimeout(200);
  check(await menu.count() === 0, 'un clic dehors (sur le logo) ferme le menu des chiffres');

  // Recherche
  await page.click('[data-testid=bar-recherche]'); await page.waitForTimeout(150);
  check(await page.locator('[data-testid=recherche-champ]').evaluate((e) => e === document.activeElement), 'la loupe s’ouvre en champ, curseur dedans');
  await page.keyboard.type('bruno'); await page.waitForTimeout(250);
  const n1 = await page.locator('.dzp-table tbody tr .dzp-nom').allInnerTexts();
  check(n1.length === 1 && n1[0] === 'Bruno Essai', `« bruno » ne garde que Bruno Essai (${n1.join(', ')})`);
  await capture(page, '2a-recherche-1440.png');
  await page.fill('[data-testid=recherche-champ]', 'atelier'); await page.waitForTimeout(250);
  const n2 = await page.locator('.dzp-table tbody tr .dzp-nom').allInnerTexts();
  check(n2.length === 3 && n2.includes('Alex Test') && n2.includes('Chloé Exemple'), `« atelier » garde les salariés qui ont Atelier Fictif dans leur semaine (${n2.join(', ')})`);
  await page.keyboard.press('f'); await page.waitForTimeout(150);
  check(await page.locator('[data-testid=barre-noire]').count() === 1, 'la touche F dans le champ ne passe pas en plein écran');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check(await page.locator('.dzp-table tbody tr').count() === 8, 'Échap dans le champ efface la recherche : les 8 salariés reviennent');

  // Plein écran
  await page.click('[data-testid=barre-noire] .dzp-logo'); await page.waitForTimeout(150);
  await page.click('[data-testid=bar-plein-ecran]'); await page.waitForTimeout(250);
  const pe = await page.evaluate(() => ({ barre: !!document.querySelector('[data-testid=barre-noire]'), pastille: !!document.querySelector('[data-testid=pastille-plein-ecran]'), txt: document.querySelector('[data-testid=pastille-plein-ecran]')?.innerText.replace(/\s+/g, ' ') }));
  check(!pe.barre && pe.pastille && /S-42 ← → ⤡ Quitter · Échap/.test(pe.txt || ''), `⤢ : la barre est masquée, seule la pastille reste (« ${pe.txt} »)`);
  await capture(page, '2a-pleinecran-1440.png');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=barre-noire]').count() === 1 && await page.locator('[data-testid=pastille-plein-ecran]').count() === 0, 'Échap sort du plein écran');
  await page.keyboard.press('f'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=barre-noire]').count() === 0, 'la touche F (hors champ) passe en plein écran');
  await page.click('[data-testid=quitter-plein-ecran]'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=barre-noire]').count() === 1, '« ⤡ Quitter · Échap » ramène la barre');
  check(erreurs.length === 0, `aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}

// ── Compteurs à 0 masqués ────────────────────────────────────────────────────────────────────────
{
  const { page, ctx } = await ouvrir(1440, 900, { avant: (D) => { D.leave_requests.length = 0; D.documents.length = 0; } });
  const ids = await page.evaluate(() => [...document.querySelectorAll('.dzp-b-compteurs > *')].map((e) => e.dataset.testid));
  check(!ids.includes('compteur-conges') && !ids.includes('compteur-pieces') && ids.includes('stat-waiting'), `compteurs à 0 masqués (restent : ${ids.join(', ')})`);
  await ctx.close();
}

// ── 1024 : aucun texte ne passe à la ligne ───────────────────────────────────────────────────────
{
  const { page, ctx } = await ouvrir(1024, 768);
  const barre = await page.locator('[data-testid=barre-noire]').boundingBox();
  const deborde = await page.evaluate(() => { const b = document.querySelector('[data-testid=barre-noire]'); return [...b.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5).map((e) => e.className || e.tagName).slice(0, 5); });
  check(barre && Math.round(barre.height) === 64 && deborde.length === 0, `1024 : barre de 64 px, rien ne dépasse à droite (${deborde.join(', ')})`);
  const r = await retours(page, '[data-testid=barre-noire], .dzp-table thead, .dzp-td-nom, .dzp-carte, .dzp-absence');
  check(r.length === 0, `1024 : aucun texte qui passe à la ligne (${r.slice(0, 6).join(' | ')})`);
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(hScroll <= 0, `1024 : pas de défilement horizontal (${hScroll} px)`);
  await capture(page, '2a-1024.png');
  await ctx.close();
}
{
  const { page, ctx } = await ouvrir(1440, 900);
  const r = await retours(page, '[data-testid=barre-noire], .dzp-table thead, .dzp-td-nom, .dzp-carte, .dzp-absence', '.dzp-carte__tag');
  check(r.length === 0, `1440 : aucun texte qui passe à la ligne hors étiquettes, qui vont sur deux lignes comme la planche (${r.slice(0, 6).join(' | ')})`);
  await ctx.close();
}

// ── Téléphone (étape suivante) : seulement « pas cassé » ─────────────────────────────────────────
{
  const { page, ctx } = await ouvrir(390, 844, { tactile: true });
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(hScroll <= 0 && await page.locator('.dzp-m-carte').count() > 0, `390 : le téléphone s'affiche, pas de défilement horizontal (${hScroll} px)`);
  await ctx.close();
}
{
  const { page, ctx } = await ouvrir(834, 1112, { tactile: true });
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(hScroll <= 0 && await page.locator('.dzp-m-carte').count() > 0, `834 (tablette) : la disposition téléphone s'affiche, pas de défilement horizontal (${hScroll} px)`);
  await ctx.close();
}

// ── Image « planche | écran » à la même échelle ──────────────────────────────────────────────────
if (process.env.PLANCHE_DIR) {
  const planche = path.resolve(process.env.PLANCHE_DIR, 'planche-2a-1440.png');
  const ecran = path.resolve(CAPTURES, '2a-1440.png');
  if (fs.existsSync(planche)) {
    const ctx = await sim.browser.newContext({ viewport: { width: 2904, height: 952 } });
    const pg = await ctx.newPage();
    const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
    await pg.setContent(`<body style="margin:0;background:#C9B998;font:700 15px system-ui;display:flex;gap:24px;padding:0">
      <figure style="margin:0"><figcaption style="height:52px;display:flex;align-items:center;padding-left:12px">Planche 2a (Essai nouveau design Bemexo, réglages par défaut)</figcaption><img src="${b64(planche)}" width="1440" height="900"></figure>
      <figure style="margin:0"><figcaption style="height:52px;display:flex;align-items:center;padding-left:12px">Écran /admin?ui=2 · 1440 × 900 · données simulées du jeu « 2a »</figcaption><img src="${b64(ecran)}" width="1440" height="900"></figure></body>`);
    await pg.screenshot({ path: path.join(CAPTURES, 'compare-2a-1440.png') });
    await ctx.close();
    console.log('compare-2a-1440.png écrite');
  } else console.log(`(pas de planche dans ${planche} : compare-2a-1440.png non écrite)`);
}

await sim.fermer();
console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
