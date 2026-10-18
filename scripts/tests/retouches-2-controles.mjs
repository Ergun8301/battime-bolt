// Retouches 2 du bureau v2 (retours d'Ergun sur la préview), mesurées sur le build, en /admin?ui=2 :
//   npm run build && node scripts/tests/retouches-2-controles.mjs out [dossier-images] [port]
// 1. plein écran : un seul bouton rond de 40 px (top 12, right 14), la semaine dans la case « SALARIÉ », ← → au clavier, rien sur la grille, pas au téléphone ;
// 2. LA croix commune : 36 px à l'ordinateur, 44 px au toucher, dans l'en-tête, centrée sur le titre, sans chevaucher le titre ni le contenu (toutes les fenêtres ouvertes ici) ;
// 3. Exporter : bascule « Toute l'équipe | Un salarié » en haut du panneau, la liste sur place, rien de verrouillé ;
// 4. tiroir Clients : « Autre lieu », « Lieu non listé : le salarié le précise », ligne d'aide, « + Nouveau client ou lieu » (la valeur en base reste « Autre ») ;
// 5. « Plus ⋯ » entier à l'écran (1440 × 900, 1280 × 800, 1024 × 768), sans défilement ; la page ne défile pas tant qu'un menu est ouvert ;
// 7. compteur « à relancer » : haut déplié → aucune seconde série de tuiles, la tuile signalée (sa liste y est toujours) ; replié → le panneau, aucun texte coupé ;
// Retouches 3 (adaptations, voir docs/REPRISE.md) : le lien du bas « Un seul salarié ? » d'Exporter est retiré (doublon de la bascule du haut) ; la tuile
// « À relancer » montre toujours sa liste (plus d'état déplié / replié) et l'anneau dure 1,2 s ; « Versions du planning » n'est plus dans « Plus ⋯ ».
// 8. un clic dehors ferme un menu, un panneau ; il RÉDUIT l'assistant en pastille (conversation gardée).
// Base SIMULÉE de bureau-sim.mjs (jeu « 2a », jeudi 15 octobre 2026, horloge figée ; aucune vraie base).
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';

const [,, OUT = 'out', SH = '', PORT = '4481'] = process.argv;
if (SH) fs.mkdirSync(SH, { recursive: true });
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sim = await demarrer({ out: OUT, port: Number(PORT), jeu: '2a' });
const pause = (page, ms = 400) => page.waitForTimeout(ms);
const image = async (page, nom) => { if (SH) await page.screenshot({ path: path.join(SH, `${nom}.png`) }); };
const ouvrir = async (largeur, hauteur, tactile = false) => {
  sim.reinitialiser();
  const r = await sim.page({ ui: 2, largeur, hauteur, hasTouch: tactile, attente: largeur < 768 ? '.dzp-m-carte' : '.dzp-table' });
  for (const id of ['copy-tip-ok-m', 'copy-tip-ok']) { const b = r.page.locator(`[data-testid=${id}]:visible`); if (await b.count()) { await b.first().click().catch(() => {}); await pause(r.page, 200); } }
  r.page.on('dialog', (d) => d.accept());
  return r;
};
const fermerCtx = async (r) => { await r.ctx.close(); };

/** La croix de la fenêtre du dessus : taille, chevauchements (titre et tout autre texte, champ ou bouton de la fenêtre), alignement sur la 1re ligne du titre. */
const croix = (page) => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const d = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(vis).pop();
  if (!d) return null;
  const x = d.querySelector('.dz-hb-fermer, .dz-fenetre__fermer, .sx-pn__x') || [...d.children].find((e) => e.tagName === 'BUTTON' && /absolute/.test(e.className));
  const t = d.querySelector('h2');
  if (!x || !t) return { sans: !x ? 'croix' : 'titre', nom: (t?.innerText || d.getAttribute('data-testid') || '').slice(0, 40) };
  const rx = x.getBoundingClientRect();
  // Le TEXTE d'un élément (ses lignes), la boîte d'un champ ou d'un bouton : un titre qui laisse sa place à la croix ne la « touche » pas.
  const boites = (e) => { if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.tagName)) return [e.getBoundingClientRect()]; const g = document.createRange(); g.selectNodeContents(e); return [...g.getClientRects()].filter((b) => b.width > 0); };
  const inter = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const rng = document.createRange(); const tn = [...t.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()) || t; rng.selectNodeContents(tn);
  const l1 = rng.getClientRects()[0] || t.getBoundingClientRect();
  const autres = [...d.querySelectorAll('h2, p, span, b, small, li, label, input, textarea, select, button, a, [role="tab"]')]
    .filter((e) => e !== x && !x.contains(e) && !e.contains(x) && vis(e) && (e.children.length === 0 || /^(INPUT|TEXTAREA|SELECT|BUTTON|H2)$/.test(e.tagName)))
    .filter((e) => boites(e).some((b) => inter(b, rx))).map((e) => `${e.tagName.toLowerCase()} « ${(e.innerText || e.value || '').trim().slice(0, 24)} »`);
  return {
    nom: t.innerText.trim().slice(0, 40), w: Math.round(rx.width), h: Math.round(rx.height),
    surTitre: boites(t).some((b) => inter(rx, b)), autres, ecart: Math.round(Math.abs((rx.top + rx.height / 2) - (l1.top + l1.height / 2))),
    bord: getComputedStyle(x).borderTopWidth, dedans: rx.left >= d.getBoundingClientRect().left && rx.right <= d.getBoundingClientRect().right + 0.5,
  };
});
const verifierCroix = async (page, nom, taille) => {
  await pause(page, 600);
  const m = await croix(page);
  if (!m || m.sans) { check(false, `${nom} : fenêtre ${m ? `sans ${m.sans} (${m.nom})` : 'absente'}`); return; }
  check(m.w === taille && m.h === taille, `${nom} « ${m.nom} » : croix ${m.w} × ${m.h} px (attendu ${taille}), bordure ${m.bord}`);
  check(!m.surTitre && m.autres.length === 0, `${nom} : la croix ne chevauche ni le titre ni le contenu${m.autres.length ? ` (${m.autres.join(', ')})` : ''}`);
  check(m.ecart <= 6 && m.dedans, `${nom} : croix dans l'en-tête, centrée sur la ligne du titre (écart ${m.ecart} px)`);
};
/** Un clic « dans le vide » : sur le logo de la barre noire (aucune action). */
const dehors = async (page) => { const b = await page.locator('.dzp-logo:visible').first().boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await pause(page, 300); };
const echap = async (page, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await pause(page, 300); } };
const plus = async (page, id) => { await page.locator('[data-testid=bar-plus]:visible').first().click(); await pause(page, 300); await page.locator(`[data-testid=${id}]`).click(); await pause(page, 900); };

// ═════════════ 1. Plein écran ═════════════
for (const [l, h, tactile] of [[1440, 900, false], [1024, 768, false], [834, 1112, true]]) {
  const r = await ouvrir(l, h, tactile); const { page } = r;
  await page.click('[data-testid=bar-plein-ecran]'); await pause(page, 400);
  const pe = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=quitter-plein-ecran]'); const rb = b.getBoundingClientRect();
    const g = document.querySelector('.dzp-table').getBoundingClientRect(); const th = document.querySelector('.dzp-th-nom');
    const s = getComputedStyle(b);
    return { w: Math.round(rb.width), h: Math.round(rb.height), top: Math.round(rb.top), droite: Math.round(innerWidth - rb.right), rond: s.borderRadius, fond: s.backgroundColor,
      bord: s.borderTopWidth, titre: b.getAttribute('title'), sousGrille: g.top >= rb.bottom, gauche: rb.left >= g.right || g.top >= rb.bottom,
      nav: !!th?.querySelector('[data-testid=pe-semaine]'), s: th?.querySelector('.dzp-pe-nav__s')?.textContent, fleches: [...(th?.querySelectorAll('.dzp-pe-nav button') || [])].map((x) => Math.round(x.getBoundingClientRect().width)),
      ancienne: !!document.querySelector('.dzp-pastille-pe'), barre: !!document.querySelector('[data-testid=barre-noire]'), texte: b.innerText.trim() };
  });
  check(pe.w === 40 && pe.h === 40 && pe.top === 12 && pe.droite === 14 && pe.rond === '50%', `plein écran ${l} : bouton rond ${pe.w} × ${pe.h}, top ${pe.top}, right ${pe.droite}`);
  check(pe.fond === 'rgb(251, 248, 242)' && pe.bord === '1px' && pe.titre === 'Quitter le plein écran (Échap)' && pe.texte === '', `plein écran ${l} : blanc cassé, bordure fine, icône seule, infobulle « ${pe.titre} »`);
  check(!pe.ancienne && !pe.barre, `plein écran ${l} : plus de pastille noire ni de barre`);
  check(pe.sousGrille, `plein écran ${l} : le bouton ne chevauche pas la grille`);
  check(pe.nav && pe.s === 'S-42' && pe.fleches.every((w) => w === 28) && pe.fleches.length === 2, `plein écran ${l} : « ‹ S-42 › » dans la case SALARIÉ (flèches ${pe.fleches.join(', ')} px)`);
  if (l === 1440) await image(page, 'pleinecran-1440');
  await page.locator('[data-testid=pe-semaine] button[aria-label="Semaine suivante"]').click(); await pause(page, 500);
  check((await page.locator('.dzp-pe-nav__s').innerText()) === 'S-43', `plein écran ${l} : › passe à S-43`);
  await page.keyboard.press('ArrowLeft'); await pause(page, 500);
  check((await page.locator('.dzp-pe-nav__s').innerText()) === 'S-42', `plein écran ${l} : ← du clavier revient à S-42`);
  await page.keyboard.press('Escape'); await pause(page, 300);
  check(await page.locator('[data-testid=quitter-plein-ecran]').count() === 0, `plein écran ${l} : Échap le quitte`);
  await page.keyboard.press('ArrowRight'); await pause(page, 400);
  check(!(await page.evaluate(() => /S-43/.test(document.querySelector('[data-testid=barre-semaine], [data-testid=barre-noire]')?.innerText || ''))), `plein écran ${l} : hors plein écran, → ne change pas la semaine`);
  await fermerCtx(r);
}
{ // Téléphone : pas de plein écran
  const r = await ouvrir(390, 844, true); const { page } = r;
  await page.keyboard.press('f'); await pause(page, 300);
  check(await page.locator('[data-plein-ecran]').count() === 0 && await page.locator('[data-testid=quitter-plein-ecran]:visible').count() === 0, 'téléphone 390 : pas de plein écran (F ne fait rien)');
  await fermerCtx(r);
}

// ═════════════ 2 et 3. Croix commune, bascule d'Exporter ═════════════
{
  const r = await ouvrir(1440, 900); const { page } = r;
  // Exporter l'équipe (panneau) : bascule en haut
  await page.click('[data-testid=bar-export]'); await pause(page, 900);
  await verifierCroix(page, 'Exporter 1440', 36);
  const b = await page.evaluate(() => {
    const p = document.querySelector('[data-testid=team-export]'); const seg = p.querySelector('[data-testid=export-bascule]');
    const periode = [...p.querySelectorAll('.dz-hb-nom')].find((e) => e.textContent === 'Période');
    return { seg: !!seg, textes: seg ? [...seg.querySelectorAll('button')].map((x) => `${x.innerText}:${x.getAttribute('aria-pressed')}`) : [], avant: seg && periode ? seg.getBoundingClientRect().bottom <= periode.getBoundingClientRect().top : false,
      haut: seg ? Math.round(seg.getBoundingClientRect().top) : -1 };
  });
  check(b.seg && b.textes.join(' | ') === 'Toute l’équipe:true | Un salarié:false' || b.textes.join(' | ') === "Toute l'équipe:true | Un salarié:false", `Exporter : bascule « ${b.textes.join(' | ')} »`);
  check(b.avant && b.haut < 140, `Exporter : la bascule est EN HAUT du panneau (y = ${b.haut}), avant « Période »`);
  await image(page, 'exporter-bascule-1440');
  const w0 = sim.log.writes.length; const q0 = sim.log.requetes.length;
  await page.click('[data-testid=export-bascule-salarie]'); await pause(page, 500);
  const l = await page.evaluate(() => ({ n: document.querySelectorAll('[data-testid=team-export] [data-testid=export-salaries] li').length, fen: document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
    titre: document.querySelector('[data-testid=team-export] h2')?.innerText, periode: !!document.querySelector('[data-testid=team-export] [data-testid=export-recap], [data-testid=team-export] [data-testid=export-sans-periode]') }));
  check(l.n >= 5 && l.fen === 1 && !l.periode, `Exporter › Un salarié : ${l.n} salariés sur place, ${l.fen} fenêtre (aucune de plus), titre « ${l.titre} »`);
  await verifierCroix(page, 'Exporter · Un salarié 1440', 36);
  await image(page, 'exporter-un-salarie-1440');
  await page.locator('[data-testid=team-export] [data-testid=export-salaries] li button').first().click(); await pause(page, 1200);
  const verrou = sim.log.writes.slice(w0).filter((w) => w.m !== 'GET');
  const rpc = sim.log.requetes.slice(q0).filter((x) => /rpc\/.*(lock|verrou|export)/i.test(x));
  check(verrou.length === 0 && rpc.length === 0, `Exporter › Un salarié › choix : rien n'est écrit ni verrouillé (${verrou.length} écriture(s), ${rpc.length} appel(s) de verrou)`);
  check(await page.locator('[data-testid=team-export]').count() === 0 && await page.locator('[role="dialog"]').count() >= 1, 'Exporter › Un salarié › choix : le panneau laisse place à la fiche du salarié');
  await verifierCroix(page, 'Fiche salarié (Feuille d’heures) 1440', 36);
  await echap(page, 2);
  // Retouches 3 : le lien du bas « Un seul salarié ? » (qui ouvrait l'ancienne fenêtre « Exporter un salarié ») n'existe plus : la bascule du haut suffit.
  await page.click('[data-testid=bar-export]'); await pause(page, 800);
  check(await page.locator('[data-testid=export-one-worker]').count() === 0, 'Exporter : plus de lien du bas « Un seul salarié ? » (retouches 3 : doublon de la bascule)');
  await echap(page);
  // Clôture du mois (question)
  await page.click('[data-testid=bar-export]'); await pause(page, 800);
  const clo = page.locator('[data-testid^=cloturer-]').first();
  if (await clo.count()) {
    await clo.click(); await pause(page, 700);
    await verifierCroix(page, 'Clôture 1440', 36);
    // 8. un clic à côté d'une question vaut « Annuler »
    await page.mouse.click(20, 450); await pause(page, 500);
    check(await page.locator('[data-testid=closure-confirm]').count() === 0, 'clic dehors : la question « Clôturer … ? » se ferme (Annuler)');
  }
  await echap(page, 2);
  // Fiche d'une intervention
  await page.locator('.dzp-table .dzp-bulle, .dzp-table .dzp-carte').first().click(); await pause(page, 800);
  await verifierCroix(page, 'Fiche intervention 1440', 36);
  await echap(page);
  // Salariés, Clients (fiche, nouveau), Réserves, Coût chantiers, Réglages, Borne, Versions
  await page.locator('[data-guide="bureau-nav.salaries"]:visible').first().click(); await pause(page, 800);
  await verifierCroix(page, 'Salariés 1440', 36);
  await page.locator('[role="dialog"] .dz-l3-ligne button, [role="dialog"] button:has-text("Gabriel")').first().click().catch(() => {}); await pause(page, 900);
  await verifierCroix(page, 'Fiche salarié 1440', 36);
  await echap(page, 2);
  await page.locator('[data-guide="bureau-nav.clients"]:visible').first().click(); await pause(page, 500);
  await page.locator('[data-guide="bureau-clients.nouveau"]:visible').first().click(); await pause(page, 800);
  await verifierCroix(page, 'Nouveau client 1440', 36);
  await echap(page);
  await page.locator('[data-guide="bureau-nav.clients"]:visible').first().click(); await pause(page, 500);
  await page.locator('[data-guide="bureau-clients.crayon"]:visible').nth(1).click(); await pause(page, 900);
  await verifierCroix(page, 'Fiche client 1440', 36);
  await echap(page);
  check(await page.evaluate(async () => { document.querySelector('[data-testid=bar-plus]')?.click(); await new Promise((r) => setTimeout(r, 300)); const n = document.querySelectorAll('[data-testid=corner-versions]').length; document.querySelector('[data-testid=bar-plus]')?.click(); return n; }) === 0, 'Plus ⋯ : plus de « Versions du planning » (retouches 3)');
  await pause(page, 300);
  for (const [id, nom] of [['menu-reserves', 'Réserves'], ['bar-cost', 'Coût chantiers'], ['bar-kiosk', 'Borne'], ['menu-traces', 'Interventions supprimées']]) {
    await page.locator('[data-testid=bar-plus]:visible').first().click(); await pause(page, 300);
    if (!(await page.locator(`[data-testid=${id}]`).count())) { await echap(page); continue; }
    await page.locator(`[data-testid=${id}]`).click(); await pause(page, 1000);
    await verifierCroix(page, `${nom} 1440`, 36);
    await echap(page);
  }
  await page.locator('[data-testid=bar-compte]').click(); await pause(page, 300);
  await page.locator('[data-guide="bureau-nav.reglages"]:visible').first().click(); await pause(page, 1000);
  await verifierCroix(page, 'Réglages 1440', 36);
  await echap(page);
  await fermerCtx(r);
}
{ // Téléphone : 44 px de zone tactile
  const r = await ouvrir(390, 844, true); const { page } = r;
  await page.locator('button[aria-label="Menu"]:visible').first().click(); await pause(page, 700);
  await verifierCroix(page, 'Menu ☰ 390', 44);
  await image(page, 'telephone-menu-390');
  await echap(page);
  await page.locator('.dzp-m-carte .dzp-bulle, .dzp-m-carte [data-testid*=bulle], .dzp-m-carte button').first().click().catch(() => {}); await pause(page, 900);
  if (await page.locator('[role="dialog"]').count()) { await verifierCroix(page, 'Fiche intervention 390', 44); await echap(page); }
  await fermerCtx(r);
}

// ═════════════ 4. Tiroir Clients : « Autre lieu » ═════════════
{
  const r = await ouvrir(1440, 900); const { page } = r;
  await page.locator('[data-guide="bureau-nav.clients"]:visible').first().click(); await pause(page, 500);
  const t = await page.locator('[data-testid=tiroir-clients]').innerText();
  check(/Autre lieu/.test(t) && /Lieu non listé : le salarié le précise/.test(t), 'tiroir Clients : « Autre lieu » et « Lieu non listé : le salarié le précise »');
  check(!/Chantier non listé/.test(t) && !/^Autre$/m.test(t), 'tiroir Clients : plus de « Autre — Chantier non listé, le salarié le nomme »');
  check(/Ajoutez aussi vos lieux fixes : bureau, atelier, restaurant…/.test(t), 'tiroir Clients : ligne d\'aide sous la recherche');
  check(/\+ Nouveau client ou lieu/.test(t), 'tiroir Clients : « + Nouveau client ou lieu »');
  check(sim.D.worksites.some((w) => w.client_name === 'Autre'), 'la valeur en base reste « Autre » (affichage seulement)');
  await image(page, 'clients-autre-lieu');
  // 8. clic dehors ferme le tiroir
  await page.mouse.click(1200, 600); await pause(page, 300);
  check(await page.locator('[data-testid=tiroir-clients]').count() === 0, 'clic dehors : le tiroir Clients se ferme');
  await fermerCtx(r);
}

// ═════════════ 5. « Plus ⋯ » entier à l'écran, page bloquée ═════════════
for (const [l, h] of [[1440, 900], [1280, 800], [1024, 768]]) {
  const r = await ouvrir(l, h); const { page } = r;
  await page.evaluate(() => window.scrollTo(0, 120)); await pause(page, 200);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.locator('[data-testid=bar-plus]:visible').first().click(); await pause(page, 400);
  const m = await page.evaluate(() => {
    const e = document.querySelector('[data-testid=menu-plus]'); const r = e.getBoundingClientRect();
    const items = [...e.querySelectorAll('.dzp-menu__item')].filter((x) => x.offsetParent).map((x) => Math.round(x.getBoundingClientRect().height));
    const cols = new Set([...e.querySelectorAll('.dzp-menu__col')].map((x) => Math.round(x.getBoundingClientRect().left))).size;
    const coupes = [...e.querySelectorAll('.dzp-menu__item')].filter((x) => x.offsetParent && x.scrollWidth > x.clientWidth + 1).map((x) => x.innerText);
    return { coupes, haut: Math.round(r.top), bas: Math.round(r.bottom), g: Math.round(r.left), d: Math.round(r.right), vh: innerHeight, vw: innerWidth, defile: e.scrollHeight > e.clientHeight + 1, items, cols,
      over: getComputedStyle(e).overscrollBehaviorY, bloque: getComputedStyle(document.documentElement).overflowY };
  });
  check(m.haut >= 0 && m.bas <= m.vh && m.g >= 0 && m.d <= m.vw, `Plus ⋯ ${l} × ${h} : entier à l'écran (${m.g}–${m.d} × ${m.haut}–${m.bas})`);
  check(!m.defile, `Plus ⋯ ${l} × ${h} : aucune barre de défilement dans le menu`);
  check(m.coupes.length === 0, `Plus ⋯ ${l} × ${h} : aucun libellé coupé${m.coupes.length ? ` (${m.coupes.join(', ')})` : ''}`);
  check(m.cols === 3 && m.items.every((x) => x >= 40) && m.items.filter((x) => x > 41).length <= 1, `Plus ⋯ ${l} × ${h} : 3 colonnes, lignes de 40 px (${m.items.join(", ")} ; un libellé long peut tenir sur 2 lignes)`);
  check(m.over === 'contain' && m.bloque === 'hidden', `Plus ⋯ ${l} × ${h} : overscroll-behavior ${m.over}, page bloquée (${m.bloque})`);
  const bx = await page.locator('[data-testid=menu-plus]').boundingBox();
  await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.mouse.wheel(0, 600); await pause(page, 400);
  check(await page.evaluate(() => window.scrollY) === y0, `Plus ⋯ ${l} × ${h} : la molette au-dessus du menu ne fait pas défiler la page`);
  if (l === 1440) await image(page, 'plus-menu-1440');
  if (l === 1024) await image(page, 'plus-menu-1024');
  // 8. clic dehors
  await page.mouse.click(30, h - 40); await pause(page, 300);
  check(await page.locator('[data-testid=menu-plus]').count() === 0 && await page.evaluate(() => getComputedStyle(document.documentElement).overflowY) !== 'hidden', `Plus ⋯ ${l} : un clic dehors le ferme et débloque la page`);
  if (l === 1440) {
    // Menu du compte et menu des chiffres : même règle
    await page.locator('[data-testid=bar-compte]').click(); await pause(page, 300);
    const y1 = await page.evaluate(() => window.scrollY);
    const cb = await page.locator('[data-testid=menu-compte]').boundingBox();
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.mouse.wheel(0, 600); await pause(page, 300);
    check(await page.evaluate(() => window.scrollY) === y1 && await page.evaluate(() => getComputedStyle(document.documentElement).overflowY) === 'hidden', 'menu du compte : la page ne défile pas');
    await page.mouse.click(30, h - 40); await pause(page, 300);
    check(await page.locator('[data-testid=menu-compte]').count() === 0, 'menu du compte : un clic dehors le ferme');
  }
  await fermerCtx(r);
}

// ═════════════ 7. Compteur « à relancer » ═════════════
{
  const r = await ouvrir(1440, 900); const { page } = r;
  const n = await page.locator('[data-testid=stat-waiting]').count();
  check(n === 1, 'compteur « à relancer » présent dans la barre noire');
  if (n) {
    await page.click('[data-testid=stat-waiting]'); await pause(page, 250);
    const d = await page.evaluate(() => ({ tuiles: document.querySelectorAll('[data-testid=stat-heures]').length, menu: document.querySelectorAll('[data-testid=menu-chiffres]').length,
      liste: !!document.querySelector('[data-testid=bandeau] [data-testid=stat-relance] [data-testid=relance-panel]'), eclat: !!document.querySelector('[data-testid=bandeau] [data-testid=stat-relance][data-eclat]'),
      bloque: getComputedStyle(document.documentElement).overflowY }));
    check(d.tuiles === 1 && d.menu === 0, `déplié + clic sur le compteur : aucun second jeu de tuiles (${d.tuiles} tuile « heures », ${d.menu} panneau superposé)`);
    check(d.liste && d.eclat, 'déplié : la tuile À relancer (sa liste y est toujours) est signalée par l\'anneau jaune');
    await image(page, 'compteur-deplie-1440');
    await pause(page, 1300);
    check(!(await page.locator('[data-eclat]').count()), 'déplié : l\'anneau jaune disparaît après 1,2 s');
    await dehors(page);
    check(await page.locator('[data-testid=bandeau] [data-testid=relance-panel]').count() === 1, 'clic dehors : la liste de la tuile reste (aucun état déplié / replié)');
    // Replié : le panneau des tuiles, sans texte coupé
    await page.click('[data-testid=haut-replier]'); await pause(page, 400);
    await page.click('[data-testid=stat-waiting]'); await pause(page, 400);
    const p = await page.evaluate(() => {
      const m = document.querySelector('[data-testid=menu-chiffres]'); if (!m) return null;
      const coupes = [...m.querySelectorAll('.dzp-barre__l, .dzp-barre__n, .dzp-tuile__k, .dzp-tuile__s, .dzp-total__s')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().width > e.parentElement.getBoundingClientRect().width + 1)
        .map((e) => e.textContent.trim());
      return { coupes, l: [...m.querySelectorAll('.dzp-barre__l')].map((e) => e.textContent.trim()).join(' '), bloque: getComputedStyle(document.documentElement).overflowY };
    });
    check(!!p, 'replié + clic sur le compteur : le panneau des tuiles s\'ouvre');
    if (p) {
      check(p.coupes.length === 0, `replié : aucun texte coupé dans le panneau${p.coupes.length ? ` (${p.coupes.join(' / ')})` : ''} ; jours « ${p.l} »`);
      check(p.bloque === 'hidden', 'replié : la page ne défile pas tant que le panneau est ouvert');
    }
    await image(page, 'compteur-replie-1440');
    await dehors(page);
    check(!(await page.locator('[data-testid=menu-chiffres]').count()), 'clic dehors : le panneau des chiffres se ferme');
    await page.click('[data-testid=haut-deplier]'); await pause(page, 300);
  }
  // 8. Un panneau (Exporter) : clic sur le voile → fermé
  await page.click('[data-testid=bar-export]'); await pause(page, 800);
  await page.mouse.click(200, 450); await pause(page, 500);
  check(await page.locator('[data-testid=team-export]').count() === 0, 'clic dehors : le panneau « Exporter » se ferme');
  // 8. L'assistant : clic dehors → pastille, conversation gardée
  await r.ctx.route('**/functions/v1/assistant', (x) => x.fulfill({ json: { answer: 'Vous avez 8 salariés.', links: [], remaining: 42 } }));
  await page.click('[data-testid=bar-assistant]'); await page.waitForSelector('[data-testid=assistant-panel] textarea', { timeout: 15000 });
  await page.fill('[data-testid=assistant-panel] textarea', 'Combien de salariés ?'); await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=assistant-panel] .as-bot', { timeout: 15000 }); await pause(page, 400);
  const xa = await page.evaluate(() => { const x = document.querySelector('[data-testid=assistant-panel] .as-x').getBoundingClientRect(); return { w: Math.round(x.width), h: Math.round(x.height) }; });
  check(xa.w === 36 && xa.h === 36, `assistant : croix ${xa.w} × ${xa.h} px`);
  await dehors(page); await pause(page, 200);
  const a = await page.evaluate(() => ({ pastille: !!document.querySelector('[data-testid=assistant-pastille]'), cache: getComputedStyle(document.querySelector('[data-testid=assistant-panel]')).visibility === 'hidden' }));
  check(a.pastille && a.cache, 'clic dehors : l\'assistant se RÉDUIT en pastille ✦ (pas fermé)');
  await image(page, 'assistant-clic-dehors');
  await page.click('[data-testid=assistant-pastille]'); await pause(page, 500);
  check(/Combien de salariés/.test(await page.locator('[data-testid=assistant-panel]').innerText()), 'pastille : l\'assistant se rouvre, conversation intacte');
  await fermerCtx(r);
}

{ // 7 (suite). Replié à 1024 × 768 : le panneau des chiffres sans texte coupé, les noms de la liste « À relancer » visibles
  const r = await ouvrir(1024, 768); const { page } = r;
  await page.click('[data-testid=haut-replier]'); await pause(page, 400);
  await page.click('[data-testid=stat-waiting]'); await pause(page, 400);
  const p = await page.evaluate(() => {
    const m = document.querySelector('[data-testid=menu-chiffres]'); if (!m) return null;
    const coupes = [...m.querySelectorAll('.dzp-barre__l, .dzp-barre__n')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim());
    const noms = [...m.querySelectorAll('[data-testid=relance-panel] .bt-pl-sp-who')].map((e) => Math.round(e.getBoundingClientRect().width));
    return { coupes, noms };
  });
  check(!!p && p.coupes.length === 0, `replié 1024 : chiffres et jours des barres entiers${p?.coupes.length ? ` (coupés : ${p.coupes.join(' ')})` : ''}`);
  check(!!p && p.noms.length > 0 && p.noms.every((w) => w >= 40), `replié 1024 : noms de la liste « À relancer » lisibles (${p?.noms.join(', ')} px)`);
  await image(page, 'compteur-replie-1024');
  await fermerCtx(r);
}
{ // 2 (suite). Téléphone : le « ‹ » d'un panneau (Salariés) à gauche, dans l'écran, 44 px
  const r = await ouvrir(390, 844, true); const { page } = r;
  await page.locator('button[aria-label="Menu"]:visible').first().click(); await pause(page, 700);
  await page.locator('[role=dialog] button:has-text("Salariés")').first().click(); await pause(page, 1000);
  const b = await page.evaluate(() => { const x = [...document.querySelectorAll('.dz-hb-panneau .dz-hb-fermer')].pop(); if (!x) return null; const r = x.getBoundingClientRect(); return { g: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), vis: r.right <= innerWidth && r.left >= 0 }; });
  check(!!b && b.vis && b.g === 20 && b.w === 44 && b.h === 44, `téléphone : « ‹ » de Salariés visible à gauche (x ${b?.g}, ${b?.w} × ${b?.h} px)`);
  await fermerCtx(r);
}

await sim.fermer();
console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
