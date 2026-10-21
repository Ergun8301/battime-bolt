// Parcours « secrétaire » du bureau v2 (retouches 3) : les gestes réels l'un après l'autre, sur le build, en /admin?ui=2, à 1440 et à 390 px.
//   npm run build && node scripts/tests/parcours-secretaire.mjs out [dossier-images] [port]
// Après CHAQUE geste, l'état visible est relu et vérifié :
//   · un seul panneau ouvert (fenêtres et feuilles Radix, menus Plus ⋯ / compte / chiffres, liste des pièces, tiroir Clients, menu Imprimer, assistant déplié) ;
//   · aucune superposition de doublons (deux jeux de tuiles, deux fois la même fenêtre, deux fois le même message) ;
//   · le défilement de la page inchangé quand le geste ne demande pas de défiler ;
//   · les messages passagers (carte « Fait — … · Annuler », retours Sonner) qui disparaissent seuls : 6 s avec « Annuler », 3,5 s sinon, en pause au survol.
// Gestes : chaque compteur (haut déplié puis replié), clic sur la tuile « À relancer », chaque ligne de « Plus ⋯ », du menu du compte et du menu ☰,
// Exporter dans les deux modes, copier une intervention puis attendre le message, l'assistant puis un écran ouvert depuis l'assistant, clic dehors,
// plein écran aller-retour, recherche. Base SIMULÉE de bureau-sim.mjs (jeu « 2a », jeudi 15 octobre 2026, horloge pilotée ; aucune vraie base).
// Retouches 4 : les quatre tuiles compactes (≤ 170 px à 1440, largeurs égales à ±1 px, 2 × 2 à la tablette), aucune liste visible au repos ; clic sur la tuile
// « À relancer » → liste déroulante JUSTE SOUS la tuile (tuile inchangée), refermée par un 2e clic, Échap ou un clic dehors ; compteur déplié → la même liste ;
// jeu « 2a-relances » (15 salariés à relancer) : la liste reste bornée (≈ 5 lignes), défile seule, la page ne bouge pas.
// Adaptations (comportement des retouches 3 remplacé) : « liste toujours visible, 2 lignes, + N autres » → aucune liste au repos, liste déroulante au clic ;
// « anneau jaune 1,2 s » du compteur déplié → la liste déroulante ; « Échap ne plie rien » → Échap ferme la liste (d'abord elle, puis le panneau ou la feuille).
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';

const [,, OUT = 'out', SH = '', PORT = '4521'] = process.argv;
if (SH) fs.mkdirSync(SH, { recursive: true });
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sim = await demarrer({ out: OUT, port: Number(PORT), jeu: '2a' });
const pause = (page, ms = 400) => page.waitForTimeout(ms);
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s*⌘P$/, '');
// « Envoyer par e-mail » se cache pour la session quand la fonction d'envoi manque (lot 19, components/staff-email-dialog.tsx) : c'est le cas de la base simulée.
const EMAIL = /Envoyer par e-mail/;
const image = async (page, nom) => { if (SH) await page.screenshot({ path: path.join(SH, `${nom}.png`) }); };

const REPONSE = {
  answer: 'Voici la liste des salariés. Vous pouvez aussi revenir à une version précédente du planning.',
  links: [{ label: 'Salariés', action: 'ouvrir:salaries.liste' }, { label: 'Versions du planning', action: 'ouvrir:planning.versions' }, { label: 'Me guider', action: 'guide:versions' }],
  remaining: 42,
};
const ouvrir = async (largeur, hauteur, tactile = false) => {
  sim.reinitialiser();
  const r = await sim.page({ ui: 2, largeur, hauteur, hasTouch: tactile, attente: largeur < 768 ? '.dzp-m-carte' : '.dzp-table' });
  for (const id of ['copy-tip-ok-m', 'copy-tip-ok']) { const b = r.page.locator(`[data-testid=${id}]:visible`); if (await b.count()) { await b.first().click().catch(() => {}); await pause(r.page, 200); } }
  await r.ctx.route('**/functions/v1/assistant', (x) => x.fulfill({ json: REPONSE }));
  r.page.on('dialog', (d) => d.dismiss());
  await r.page.evaluate(() => window.scrollTo(0, 0));
  return r;
};

/** L'état visible de l'écran. */
const etat = (page) => page.evaluate(() => {
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const nom = (e) => e.getAttribute('data-testid') || (e.querySelector('h2')?.innerText || '').trim().slice(0, 40) || e.getAttribute('aria-label') || 'fenêtre';
  const ouverts = [];
  for (const e of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) if (vis(e) && e.getAttribute('data-state') !== 'closed') ouverts.push(nom(e));
  for (const id of ['menu-plus', 'menu-compte', 'menu-chiffres', 'liste-pieces', 'tiroir-clients', 'print-menu']) for (const e of document.querySelectorAll(`[data-testid=${id}]`)) if (vis(e) && !e.closest('[role="dialog"]')) ouverts.push(id);
  const a = document.querySelector('[data-testid=assistant-panel]'); if (vis(a)) ouverts.push('assistant');
  const compte = (sel) => [...document.querySelectorAll(sel)].filter(vis).length;
  const titres = [...document.querySelectorAll('[role="dialog"] h2, [role="alertdialog"] h2')].filter(vis).map((h) => h.innerText.trim());
  const toasts = [...document.querySelectorAll('[data-sonner-toast]')].filter(vis).map((t) => t.innerText.replace(/\s+/g, ' ').trim());
  return {
    ouverts, y: Math.round(window.scrollY),
    doublons: [
      ...(compte('[data-testid=stat-heures]') > 1 ? [`${compte('[data-testid=stat-heures]')} tuiles « Heures envoyées »`] : []),
      ...(compte('[data-testid=stat-relance]') > 1 ? [`${compte('[data-testid=stat-relance]')} tuiles « À relancer »`] : []),
      ...(compte('[data-testid=export-bascule]') > 1 ? ['deux bascules Exporter'] : []),
      ...titres.filter((t, i) => t && titres.indexOf(t) !== i).map((t) => `fenêtre « ${t} » en double`),
      ...toasts.filter((t, i) => toasts.indexOf(t) !== i).map((t) => `message « ${t.slice(0, 30)} » en double`),
      ...(compte('[data-testid=undo-card]') > 1 ? ['deux cartes « Annuler »'] : []),
    ],
    toasts, undo: compte('[data-testid=undo-card]'), pastille: !!document.querySelector('[data-testid=assistant-pastille]'),
  };
});
/** Vérifie l'état après un geste : au plus `max` panneaux ouverts (et lesquels, si `attendu`), aucun doublon, le défilement inchangé (`y` attendu). */
const apres = async (page, geste, { max = 1, attendu = null, y = null } = {}) => {
  const e = await etat(page);
  check(e.ouverts.length <= max && (!attendu || e.ouverts.some((o) => attendu.test(o))), `${geste} : ${e.ouverts.length} panneau ouvert (${e.ouverts.join(', ') || 'aucun'})${attendu ? ` — attendu ${attendu}` : ''}`);
  check(e.doublons.length === 0, `${geste} : aucune superposition de doublons${e.doublons.length ? ` (${e.doublons.join(' ; ')})` : ''}`);
  if (y !== null) check(e.y === y, `${geste} : la page n'a pas défilé (y = ${e.y}, attendu ${y})`);
  return e;
};
const echap = async (page, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await pause(page, 300); } };
const fermerTout = async (page) => { for (let i = 0; i < 4; i++) { if ((await etat(page)).ouverts.length === 0) return; await echap(page); } };
const dehors = async (page) => { const b = await page.locator('.dzp-logo:visible, .dzp-m2-tete').first().boundingBox(); await page.mouse.click(b.x + 8, b.y + 8); await pause(page, 400); };
const boite = async (page, sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), t: e.innerText.replace(/\s+/g, ' ').trim() }; });
/** Retouches 4 : les quatre tuiles d'un jeu (bandeau ou menu des chiffres) : largeur et hauteur (au dixième), position. */
const tuiles = (page, jeu) => page.evaluate((s) => [...document.querySelectorAll(`${s} > .dzp-tuile`)].map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.testid, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, x: Math.round(r.left), y: Math.round(r.top) }; }), jeu);
/** Ce qui est visible de listes dans un jeu de tuiles au repos : lignes de noms ou liste déroulante (il n'en faut aucune). */
const repos = (page, jeu) => page.evaluate((s) => [...document.querySelectorAll(`${s} [data-testid=liste-deroulante], ${s} .bt-pl-sp-row, ${s} [data-testid=relance-panel]`)].filter((e) => e.getClientRects().length > 0).length, jeu);
/** La liste déroulante ouverte sous une tuile : position par rapport à la tuile, taille, défilement, première ligne ; null si fermée. */
const deroulant = (page, sel) => page.evaluate((s) => {
  const t = document.querySelector(s); const l = t?.querySelector('[data-testid=liste-deroulante]'); if (!l) return null;
  const tr = t.getBoundingClientRect(); const lr = l.getBoundingClientRect(); const li = l.querySelector('.dzp-deroulant__liste');
  const rangs = [...li.querySelectorAll('.bt-pl-sp-row')]; const p = rangs[0];
  const sonde = document.elementFromPoint(lr.left + lr.width / 2, lr.bottom - 8);
  return {
    ecart: Math.round(lr.top - tr.bottom), gauche: Math.round(lr.left - tr.left), w: Math.round(lr.width), tw: Math.round(tr.width), h: Math.round(lr.height),
    hl: Math.round(li.clientHeight), sh: li.scrollHeight, n: rangs.length, ligneH: p ? Math.round(p.getBoundingClientRect().height) : 0, overscroll: getComputedStyle(li).overscrollBehaviorY,
    dessus: !!sonde && l.contains(sonde), tous: !!l.querySelector('[data-testid=relance-tous]'),
    premiere: p ? { t: p.innerText.replace(/\s+/g, ' ').trim(), relancer: !!p.querySelector('[data-testid=relance-btn], [data-testid=relance-done]'), jours: /^[a-zé]{3}\.? \d+/.test((p.querySelector('.sub')?.innerText || '').trim()) } : null,
  };
}, sel);

// ═════════════ ORDINATEUR 1440 ═════════════
{
  const r = await ouvrir(1440, 900); const { page } = r;
  await apres(page, '1440 · arrivée', { max: 0, y: 0 });
  check(await page.locator('[data-testid=legende]').count() === 0, '1440 · la légende n’est plus posée sous la grille');
  await page.click('[data-testid=bar-legende]'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=legende]').isVisible(), '1440 · le petit « ⓘ » de la barre ouvre la légende');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);

  // ── Les quatre tuiles (retouches 4) : compactes (170 px au plus), même largeur (±1 px), aucune liste de noms au repos ──
  const tuile = '[data-testid=bandeau] [data-testid=stat-relance]';
  const m0 = await tuiles(page, '[data-testid=bandeau]');
  check(m0.length === 4 && m0.every((x) => x.h <= 170), `1440 · tuiles compactes : ${m0.map((x) => x.h).join(' / ')} px de haut (170 au plus)`);
  check(Math.max(...m0.map((x) => x.w)) - Math.min(...m0.map((x) => x.w)) <= 1, `1440 · quatre largeurs égales à ±1 px (${m0.map((x) => x.w).join(' / ')} px)`);
  check(await repos(page, '[data-testid=bandeau]') === 0, '1440 · au repos : aucune liste visible dans les tuiles (ni noms, ni liste déroulante)');
  const t0 = await boite(page, `${tuile} .dzp-tuile__corps`);
  check(/^À RELANCER \d+ journées? \d+ salariés? concernés?$/.test(t0.t), `tuile À relancer : titre, chiffre, une ligne (« ${t0.t} »)`);
  // Clic sur la tuile → la liste déroulante JUSTE SOUS la tuile, par-dessus la grille ; la tuile ne change ni de taille ni de forme
  await page.locator(`${tuile} .dzp-tuile__corps`).click(); await pause(page, 400);
  const d1 = await deroulant(page, tuile);
  const t1 = await boite(page, `${tuile} .dzp-tuile__corps`);
  await apres(page, 'clic sur la tuile À relancer', { max: 0, y: 0 });
  check(!!d1 && d1.ecart >= 0 && d1.ecart <= 12 && d1.gauche >= -4 && d1.gauche <= 2 && d1.w >= d1.tw - 1 && d1.w <= d1.tw + 120, `clic sur la tuile : liste déroulante juste sous la tuile, de sa largeur ou un peu plus (écart ${d1?.ecart} px, ${d1?.w} px pour une tuile de ${d1?.tw})`);
  check(!!d1 && d1.dessus, 'liste déroulante : par-dessus la grille (rien ne la recouvre)');
  check(t1.h === t0.h && t1.w === t0.w && (await tuiles(page, '[data-testid=bandeau]')).every((x, i) => x.h === m0[i].h && x.w === m0[i].w), `clic sur la tuile : aucune tuile ne change de taille (${t0.w} × ${t0.h} → ${t1.w} × ${t1.h})`);
  check(!!d1 && d1.premiere && /\d+ j/.test(d1.premiere.t) && d1.premiere.relancer && d1.premiere.jours, `une ligne par salarié : nom, jours, « N j », « Relancer » (« ${d1?.premiere?.t} »)`);
  check(!!d1 && d1.tous, '« Voir tous dans Salariés » en bas de la liste');
  await image(page, 'parcours-relancer-ouvert-1440');
  await page.locator(`${tuile} .bt-pl-sp-who`).first().click({ force: true }); await pause(page, 500);
  await apres(page, 'clic sur un nom de la liste (n’ouvre rien)', { max: 0, y: 0 });
  // Fermetures : recliquer sur la tuile, Échap, clic dehors
  await page.locator(`${tuile} .dzp-tuile__corps`).click(); await pause(page, 300);
  check(!(await deroulant(page, tuile)), 'recliquer sur la tuile : la liste se ferme');
  await page.locator(`${tuile} .dzp-tuile__corps`).click(); await pause(page, 300);
  await echap(page);
  check(!(await deroulant(page, tuile)) && await page.locator('[data-testid=bandeau]').count() === 1, 'Échap : la liste se ferme (le bandeau reste)');
  await page.locator(`${tuile} .dzp-tuile__corps`).click(); await pause(page, 300);
  await dehors(page);
  check(!(await deroulant(page, tuile)), 'clic dehors : la liste se ferme');
  await apres(page, 'liste refermée', { max: 0, y: 0 });
  // « Voir tous dans Salariés » : la liste se ferme, Salariés s'ouvre
  await page.locator(`${tuile} .dzp-tuile__corps`).click(); await pause(page, 300);
  await page.click(`${tuile} [data-testid=relance-tous]`); await pause(page, 900);
  await apres(page, '« Voir tous dans Salariés »', { attendu: /Salari|salaries|equipe|panneau/i, y: 0 });
  check(!(await deroulant(page, tuile)), '« Voir tous dans Salariés » : la liste déroulante est fermée');
  await fermerTout(page);
  // En direct et Absents : leur liste au clic quand il y a des noms
  for (const id of ['stat-direct', 'stat-absents']) {
    const sel = `[data-testid=bandeau] [data-testid=${id}]`;
    const bouton = await page.locator(`${sel} button.dzp-tuile__corps`).count();
    if (!bouton) { check(true, `${id} : personne à montrer, aucun clic`); continue; }
    await page.locator(`${sel} .dzp-tuile__corps`).click(); await pause(page, 300);
    const d = await deroulant(page, sel);
    check(!!d && d.ecart >= 0 && d.ecart <= 12 && d.n > 0, `${id} : sa liste déroulante sous la tuile (${d?.n} nom(s) ; « ${d?.premiere?.t} »)`);
    await echap(page);
    check(!(await deroulant(page, sel)), `${id} : Échap la ferme`);
  }
  // Le graphique des heures : jours entiers (« L 12 » ou la lettre seule), rien de coupé ; barres de 40 px au plus
  const jours = await page.evaluate(() => [...document.querySelectorAll('[data-testid=bandeau] .dzp-barre__l, [data-testid=bandeau] .dzp-barre__n')].map((e) => ({ t: e.innerText.trim(), coupe: e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().width > e.parentElement.getBoundingClientRect().width + 1 })));
  const etiquettes = jours.filter((j, i) => i % 2).map((j) => j.t);
  check(jours.length === 14 && jours.every((j) => !j.coupe), `1440 · graphique : étiquettes entières (${etiquettes.join(' ')})`);
  check(etiquettes.join(' ') === 'L 12 M 13 M 14 J 15 V 16 S 17 D 18', '1440 · graphique : la place suffit, « L 12 » (la lettre seule seulement quand la colonne est trop étroite)');
  const hb = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[data-testid=bandeau] .dzp-barre__b')].map((e) => e.getBoundingClientRect().height)));
  check(hb <= 41 && hb >= 30, `1440 · graphique : barres d'environ 40 px (la plus haute : ${Math.round(hb)} px)`);

  // ── Compteurs, haut DÉPLIÉ : « à relancer » ouvre la MÊME liste déroulante sous la tuile ──
  if (await page.locator('[data-testid=stat-waiting]').count()) {
    await page.click('[data-testid=stat-waiting]'); await pause(page, 300);
    const d2 = await deroulant(page, tuile);
    const t2 = await boite(page, `${tuile} .dzp-tuile__corps`);
    await apres(page, 'déplié · compteur « à relancer »', { max: 0, y: 0 });
    check(!!d2 && d2.ecart >= 0 && d2.ecart <= 12 && d2.n === d1?.n && t2.h === t0.h && t2.w === t0.w, `déplié · compteur : la même liste déroulante sous la tuile, la tuile inchangée (${d2?.n} ligne(s), ${t2.w} × ${t2.h})`);
    check(await page.locator('[data-testid=stat-waiting]').getAttribute('aria-expanded') === 'true' && await page.locator('[data-testid=menu-chiffres]').count() === 0, 'déplié · compteur : aria-expanded, aucun panneau des tuiles par-dessus');
    await image(page, 'parcours-compteur-deplie-1440');
    await page.click('[data-testid=stat-waiting]'); await pause(page, 300);
    check(!(await deroulant(page, tuile)), 'déplié · 2e clic sur le compteur : la liste se ferme');
    await apres(page, 'déplié · compteur « à relancer », 2e clic', { max: 0, y: 0 });
    // Défilement doux jusqu'à la tuile quand elle n'est pas à l'écran (fenêtre basse)
    await page.setViewportSize({ width: 1440, height: 480 }); await page.evaluate(() => window.scrollTo(0, 260)); await pause(page, 300);
    await page.click('[data-testid=stat-waiting]'); await pause(page, 900);
    const vue = await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { haut: Math.round(b.top), bas: Math.round(b.bottom) }; }, tuile);
    check(vue.bas <= 480 && vue.haut >= 0 && !!(await deroulant(page, tuile)), `déplié · fenêtre basse : la page défile doucement jusqu'à la tuile, sa liste ouverte (haut ${vue.haut}, bas ${vue.bas})`);
    await echap(page);
    await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(() => window.scrollTo(0, 0)); await pause(page, 300);
  }
  for (const [id, re] of [['compteur-conges', /Salari|salaries/i], ['compteur-pieces', /liste-pieces/], ['compteur-reserves', /serves|reserves/i]]) {
    if (!(await page.locator(`[data-testid=${id}]`).count())) continue;
    await page.click(`[data-testid=${id}]`); await pause(page, 900);
    await apres(page, `déplié · ${id}`, { attendu: re, y: 0 });
    await fermerTout(page);
    await apres(page, `déplié · ${id} refermé`, { max: 0, y: 0 });
  }

  // ── Compteurs, haut REPLIÉ ──
  await page.click('[data-testid=haut-replier]'); await pause(page, 400);
  if (await page.locator('[data-testid=stat-waiting]').count()) {
    await page.click('[data-testid=stat-waiting]'); await pause(page, 400);
    await apres(page, 'replié · compteur « à relancer »', { attendu: /menu-chiffres/, y: 0 });
    const mc = '[data-testid=menu-chiffres] [data-testid=stat-relance]';
    const mr = await tuiles(page, '[data-testid=menu-chiffres]');
    check(mr.length === 4 && mr.every((x) => x.h <= 170) && Math.max(...mr.map((x) => x.w)) - Math.min(...mr.map((x) => x.w)) <= 1 && await repos(page, '[data-testid=menu-chiffres]') === 0,
      `replié · panneau des tuiles compact aussi : ${mr.map((x) => `${x.w} × ${x.h}`).join(' / ')}, aucune liste au repos`);
    await page.locator(`${mc} .dzp-tuile__corps`).click(); await pause(page, 300);
    const dr = await deroulant(page, mc);
    check(!!dr && dr.ecart >= 0 && dr.ecart <= 12 && dr.n > 0 && (await tuiles(page, '[data-testid=menu-chiffres]')).every((x, i) => x.h === mr[i].h), `replié · clic sur la tuile : la même liste déroulante sous la tuile (${dr?.n} ligne(s)), tuiles inchangées`);
    await apres(page, 'replié · liste déroulante ouverte', { attendu: /menu-chiffres/, y: 0 });
    await echap(page);
    check(!(await deroulant(page, mc)) && await page.locator('[data-testid=menu-chiffres]').count() === 1, 'replié · Échap ferme d’abord la liste déroulante (le panneau reste)');
    const coupes = await page.evaluate(() => [...document.querySelectorAll('[data-testid=menu-chiffres] .dzp-barre__l, [data-testid=menu-chiffres] .dzp-barre__n')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    check(coupes.length === 0, `replié · graphique : rien de coupé${coupes.length ? ` (${coupes.join(' ')})` : ''}`);
    await page.click('[data-testid=stat-waiting]'); await pause(page, 400);
    await apres(page, 'replié · compteur, 2e clic (referme)', { max: 0, y: 0 });
    await page.click('[data-testid=stat-waiting]'); await pause(page, 400);
    await dehors(page);
    await apres(page, 'replié · clic dehors', { max: 0, y: 0 });
  }
  // Les trois autres compteurs : le MÊME geste que haut déplié (leur liste), jamais le panneau des tuiles qui ne les montre pas.
  for (const [id, re] of [['compteur-conges', /Salari|salaries/i], ['compteur-pieces', /liste-pieces/], ['compteur-reserves', /serves|reserves/i]]) {
    if (!(await page.locator(`[data-testid=${id}]`).count())) continue;
    await page.click(`[data-testid=${id}]`); await pause(page, 900);
    await apres(page, `replié · ${id}`, { attendu: re, y: 0 });
    await fermerTout(page);
  }
  await page.click('[data-testid=haut-deplier]'); await pause(page, 400);

  // ── Chaque ligne de « Plus ⋯ » : le menu se ferme, UNE cible s'ouvre, la page ne défile pas ──
  await page.click('[data-testid=bar-plus]'); await pause(page, 300);
  const lignesPlus = await page.locator('[data-testid=menu-plus] button:visible').allInnerTexts();
  const libelles = lignesPlus.map((t) => t.replace(/\s+/g, ' ').replace(/[\s›\d]+$/, '').trim());
  check(!libelles.some((l) => /Légende|Versions du planning/.test(l)), `Plus ⋯ : ni « Légende » ni « Versions du planning » (${libelles.join(' | ')})`);
  await image(page, 'parcours-plus-1440');
  await echap(page);
  for (let i = 0; i < libelles.length; i++) {
    await page.evaluate(() => window.scrollTo(0, 0)); await pause(page, 150);
    await page.click('[data-testid=bar-plus]'); await pause(page, 300);
    const cible = page.locator('[data-testid=menu-plus] button:visible', { hasText: new RegExp(`^${esc(libelles[i])}`) }).first();
    if (!(await cible.count())) {
      const vus = (await page.locator('[data-testid=menu-plus] button:visible').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
      check(EMAIL.test(libelles[i]), `Plus ⋯ › ${libelles[i]} : la ligne n'est plus dans le menu (${vus.join(' | ')})${EMAIL.test(libelles[i]) ? ' — attendu : la base simulée n\'a pas la fonction d\'envoi, la ligne se cache pour la session (lot 19)' : ''}`);
      await fermerTout(page); continue;
    }
    await cible.click(); await pause(page, 1000);
    const e = await apres(page, `Plus ⋯ › ${libelles[i]}`, { y: 0 });
    check(!e.ouverts.includes('menu-plus') && e.ouverts.length === 1, `Plus ⋯ › ${libelles[i]} : le menu est fermé, sa cible est ouverte (${e.ouverts.join(', ')})`);
    await fermerTout(page);
  }
  // ── Menu du compte (Déconnexion non jouée) ──
  await page.click('[data-testid=bar-compte]'); await pause(page, 300);
  await apres(page, 'menu du compte', { attendu: /menu-compte/, y: 0 });
  await page.locator('[data-testid=menu-compte] button', { hasText: 'Réglages' }).click(); await pause(page, 1000);
  const ec = await apres(page, 'compte › Réglages', { y: 0 });
  check(!ec.ouverts.includes('menu-compte') && ec.ouverts.length === 1, `compte › Réglages : le menu est fermé, Réglages ouvert (${ec.ouverts.join(', ')})`);
  await fermerTout(page);

  // ── Exporter, deux modes ──
  await page.click('[data-testid=bar-export]'); await pause(page, 900);
  await apres(page, 'Exporter (toute l’équipe)', { attendu: /team-export/, y: 0 });
  check(await page.locator('[data-testid=export-one-worker]').count() === 0 && !/Un seul salarié \?/.test(await page.locator('[data-testid=team-export]').innerText()), 'Exporter : plus de lien « Un seul salarié ? » en bas (la bascule du haut suffit)');
  const accesSalarie = await page.locator('[data-testid=team-export] button', { hasText: /salarié/i }).allInnerTexts();
  check(accesSalarie.length === 1 && /^Un salarié$/.test(accesSalarie[0].trim()), `Exporter : un seul accès à l’export d’un salarié (${accesSalarie.join(' | ')})`);
  await image(page, 'parcours-exporter-1440');
  await page.click('[data-testid=export-bascule-salarie]'); await pause(page, 500);
  await apres(page, 'Exporter › Un salarié', { attendu: /team-export/, y: 0 });
  check(await page.locator('[data-testid=team-export] [data-testid=export-salaries] li').count() >= 5, 'Exporter › Un salarié : la liste sur place');
  await page.click('[data-testid=export-bascule-equipe]'); await pause(page, 400);
  await apres(page, 'Exporter › Toute l’équipe', { attendu: /team-export/, y: 0 });
  await page.mouse.click(200, 450); await pause(page, 500);
  await apres(page, 'Exporter · clic dehors', { max: 0, y: 0 });

  // ── Copier une intervention (Ctrl + glisser, Alex : vendredi → samedi) puis attendre la carte « Annuler » ──
  const ligne = page.locator('.dzp-table tbody tr', { has: page.locator('.dzp-nom', { hasText: 'Alex Test' }) }).first();
  const src = ligne.locator('td').nth(5).locator('[data-bub]').first();
  const dst = ligne.locator('td').nth(6);
  const a = await src.boundingBox(); const z = await dst.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.keyboard.down('Control'); await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 4, { steps: 4 }); await page.mouse.move(z.x + z.width / 2, z.y + z.height - 12, { steps: 14 });
  await pause(page, 200); await page.mouse.up(); await page.keyboard.up('Control'); await pause(page, 900);
  await page.mouse.move(700, 120);
  const u0 = await etat(page);
  const texteCarte = u0.undo ? (await page.locator('[data-testid=undo-card]').innerText()).replace(/\s+/g, ' ') : '';
  check(u0.undo === 1 && /Fait — Intervention copiée/.test(texteCarte) && /Annuler/.test(texteCarte), `copie : la carte « ${texteCarte.slice(0, 60)} » apparaît`);
  check(sim.D.planning.some((p) => p.user_id === 'u-at' && p.work_date === '2026-10-17'), 'copie : la case est écrite (Alex, samedi 17)');
  await apres(page, 'copie', { max: 0, y: 0 });
  check(await page.locator('[data-testid=undo-card] [data-testid=undo-close]').count() === 1, 'copie : une croix permet de fermer plus tôt');
  await image(page, 'parcours-toast-0s');
  await page.clock.fastForward(4000); await pause(page, 200);
  check((await etat(page)).undo === 1, 'copie : la carte est encore là à 4 s (« Annuler » : 6 s)');
  await page.locator('[data-testid=undo-card]').hover(); await page.clock.fastForward(5000); await pause(page, 200);
  check((await etat(page)).undo === 1, 'copie : au survol, la minuterie est en pause (encore là à 9 s)');
  await page.mouse.move(700, 120); await page.clock.fastForward(2100); await pause(page, 300);
  const u1 = await etat(page);
  check(u1.undo === 0, 'copie : la carte disparaît seule (2 s restantes après la sortie du pointeur)');
  await image(page, 'parcours-toast-7s');
  // Une 2e copie (vers le dimanche), sans survol : partie à 6 s
  const z2 = await ligne.locator('td').nth(7).boundingBox(); Object.assign(a, await src.boundingBox());
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.keyboard.down('Control'); await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 4, { steps: 4 }); await page.mouse.move(z2.x + z2.width / 2, z2.y + z2.height - 12, { steps: 14 });
  await pause(page, 200); await page.mouse.up(); await page.keyboard.up('Control'); await pause(page, 900); await page.mouse.move(700, 120);
  const e2 = await etat(page); const u2 = e2.undo; if (!u2) console.log('   (2e copie : messages', e2.toasts.join(' / '), ')');
  await page.clock.fastForward(6200); await pause(page, 300);
  const u3 = await etat(page);
  check(u2 === 1 && u3.undo === 0, `copie (2e) : sans survol, la carte part seule après 6 s (avant ${u2}, après ${u3.undo}${u3.toasts.length ? ` ; ${u3.toasts.join(' / ')}` : ''})`);
  // « Dupliquer au lendemain » (fenêtre de modification, Bruno : vendredi → samedi) : retour Sonner, 3,5 s, croix
  await page.locator('.dzp-table tbody tr', { has: page.locator('.dzp-nom', { hasText: 'Bruno Essai' }) }).first().locator('td').nth(5).locator('[data-bub]').first().click(); await pause(page, 900);
  const dup = page.locator('[role=dialog] button', { hasText: 'Dupliquer au lendemain' });
  if (await dup.count()) {
    await dup.first().click(); await pause(page, 1000); await page.mouse.move(700, 600);
    const s0 = await etat(page);
    check(s0.toasts.length === 1 && /copiée/i.test(s0.toasts[0]), `Dupliquer au lendemain : un retour « ${s0.toasts[0] || '—'} »`);
    check(await page.locator('[data-sonner-toast] [data-close-button]').count() === 1, 'retour Sonner : une croix pour fermer plus tôt');
    await page.clock.fastForward(3000); await pause(page, 150);
    check((await etat(page)).toasts.length === 1, 'retour Sonner : encore là à 3 s');
    await page.clock.fastForward(900); await pause(page, 700);
    check((await etat(page)).toasts.length === 0, 'retour Sonner : parti seul à 3,5 s');
    await fermerTout(page);
  } else check(false, 'Dupliquer au lendemain : bouton introuvable dans la fenêtre de modification');

  // ── Assistant, puis un écran ouvert depuis l'assistant ──
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-testid=bar-assistant]'); await page.waitForSelector('[data-testid=assistant-panel] textarea', { timeout: 15000 });
  await apres(page, 'assistant ouvert', { attendu: /assistant/, y: 0 });
  await page.fill('[data-testid=assistant-panel] textarea', 'Qui est dans l’équipe ?'); await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=assistant-panel] .as-bot', { timeout: 15000 }); await pause(page, 500);
  const liens = await page.locator('[data-testid=assistant-panel] .as-links button').allInnerTexts();
  check(liens.length === 1 && /Salariés/.test(liens[0]), `assistant : aucun bouton vers « Versions du planning » (boutons : ${liens.join(' | ')})`);
  await page.locator('[data-testid=assistant-panel] .as-links button', { hasText: 'Salariés' }).click(); await pause(page, 1200);
  const ea = await apres(page, 'assistant › Salariés', { attendu: /Salari|salaries/i, y: 0 });
  check(ea.pastille && !ea.ouverts.includes('assistant'), 'assistant › Salariés : l’assistant se réduit en pastille, l’écran est seul');
  await fermerTout(page);
  await page.click('[data-testid=assistant-pastille]'); await pause(page, 500);
  await apres(page, 'pastille : l’assistant revient', { attendu: /assistant/, y: 0 });
  await dehors(page); await pause(page, 300);
  const ed = await apres(page, 'assistant · clic dehors', { max: 0, y: 0 });
  check(ed.pastille, 'assistant · clic dehors : réduit en pastille (conversation gardée)');
  await page.click('[data-testid=assistant-pastille]'); await pause(page, 400);
  await page.locator('[data-testid=assistant-panel] .as-x').click(); await pause(page, 400);
  await apres(page, 'assistant fermé', { max: 0, y: 0 });

  // ── Clic dehors : Plus ⋯, tiroir Clients, menu du compte ──
  for (const [sel, nom] of [['[data-testid=bar-plus]', 'Plus ⋯'], ['[data-guide="bureau-nav.clients"]:visible', 'tiroir Clients'], ['[data-testid=bar-compte]', 'menu du compte']]) {
    await page.locator(sel).first().click(); await pause(page, 400);
    await apres(page, `${nom} ouvert`, { y: 0 });
    await page.mouse.click(1300, 700); await pause(page, 400);
    await apres(page, `${nom} · clic dehors`, { max: 0, y: 0 });
  }

  // ── Plein écran aller-retour ──
  await page.click('[data-testid=bar-plein-ecran]'); await pause(page, 400);
  await apres(page, 'plein écran', { max: 0, y: 0 });
  check(await page.locator('[data-testid=barre-noire]').count() === 0 && await page.locator('[data-testid=quitter-plein-ecran]').count() === 1, 'plein écran : la grille seule, un bouton pour sortir');
  await page.click('[data-testid=quitter-plein-ecran]'); await pause(page, 400);
  await apres(page, 'plein écran › retour', { max: 0, y: 0 });
  check(await page.locator('[data-testid=barre-noire]').count() === 1 && await page.locator('[data-testid=bandeau]').count() === 1, 'retour : barre noire et bandeau revenus, une seule fois');

  // ── Recherche ──
  await page.fill('[data-testid=recherche-champ]', 'bruno'); await pause(page, 300);
  check((await page.locator('.dzp-table tbody tr .dzp-nom').allInnerTexts()).join() === 'Bruno Essai', 'recherche « bruno » : Bruno seul');
  await apres(page, 'recherche', { max: 0, y: 0 });
  await page.locator('[data-testid=recherche-champ]').press('Escape'); await pause(page, 300);
  check(await page.locator('.dzp-table tbody tr').count() === 8, 'Échap efface la recherche');
  await apres(page, 'recherche effacée', { max: 0, y: 0 });
  await r.ctx.close();
}

// ═════════════ 1440 · 15 SALARIÉS À RELANCER (jeu « 2a-relances ») : la liste déroulante reste bornée et défile seule ═════════════
{
  sim.reinitialiser('2a-relances');
  const r = await ouvrir(1440, 900); const { page } = r;
  const tuile = '[data-testid=bandeau] [data-testid=stat-relance]';
  const m = await tuiles(page, '[data-testid=bandeau]');
  const s = (await page.locator(`${tuile} .dzp-tuile__s`).innerText()).trim();
  check(s === '15 salariés concernés' && m.every((x) => x.h <= 170) && await repos(page, '[data-testid=bandeau]') === 0, `15 à relancer · la tuile reste compacte, sans noms (« ${s} », ${m.map((x) => x.h).join(' / ')} px)`);
  await page.locator(`${tuile} .dzp-tuile__corps`).click(); await pause(page, 400);
  const d = await deroulant(page, tuile);
  check(!!d && d.n === 15, `15 à relancer · une ligne par salarié dans la liste (${d?.n})`);
  check(!!d && d.hl >= 4 * d.ligneH && d.hl <= 6 * d.ligneH && d.h <= 360, `15 à relancer · hauteur bornée : ${d?.hl} px de lignes (≈ ${d ? (d.hl / d.ligneH).toFixed(1) : '?'} lignes de ${d?.ligneH} px), ${d?.h} px en tout`);
  check(!!d && d.sh > d.hl + 10 && d.overscroll === 'contain' && d.tous, `15 à relancer · le reste défile dans la liste seulement (${d?.sh} px de contenu, overscroll ${d?.overscroll}), « Voir tous dans Salariés » en bas`);
  check(!!d && d.ecart >= 0 && d.ecart <= 12 && d.dessus, '15 à relancer · juste sous la tuile, par-dessus la grille');
  await image(page, 'parcours-relancer-15-1440');
  const box = await page.locator(`${tuile} .dzp-deroulant__liste`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300); await pause(page, 300);
  const w1 = await page.evaluate((s) => ({ l: Math.round(document.querySelector(`${s} .dzp-deroulant__liste`).scrollTop), y: Math.round(scrollY) }), tuile);
  await page.mouse.wheel(0, 3000); await pause(page, 400);
  const w2 = await page.evaluate((s) => { const l = document.querySelector(`${s} .dzp-deroulant__liste`); return { bas: Math.abs(l.scrollHeight - l.clientHeight - l.scrollTop) <= 2, y: Math.round(scrollY) }; }, tuile);
  check(w1.l > 0 && w1.y === 0 && w2.bas && w2.y === 0, `15 à relancer · la molette fait défiler la liste (${w1.l} px), jamais la page (y = ${w1.y} puis ${w2.y}, même au bout de la liste)`);
  await page.locator(`${tuile} .dzp-tuile__corps`).click(); await pause(page, 300);
  check(!(await deroulant(page, tuile)), '15 à relancer · recliquer sur la tuile : fermée');
  await page.locator(`${tuile} .dzp-tuile__corps`).click(); await pause(page, 300); await echap(page);
  check(!(await deroulant(page, tuile)), '15 à relancer · Échap : fermée');
  await page.locator(`${tuile} .dzp-tuile__corps`).click(); await pause(page, 300); await dehors(page);
  check(!(await deroulant(page, tuile)), '15 à relancer · clic dehors : fermée');
  await page.click('[data-testid=stat-waiting]'); await pause(page, 300);
  const d2 = await deroulant(page, tuile);
  check(!!d2 && d2.n === 15 && d2.hl === d.hl, `15 à relancer · compteur (haut déplié) : la même liste déroulante (${d2?.n} lignes, ${d2?.hl} px)`);
  await apres(page, '15 à relancer · compteur', { max: 0, y: 0 });
  await r.ctx.close();
  sim.reinitialiser('2a');
}

// ═════════════ TABLETTE 834 (contrôle de cohérence : mêmes règles que l'ordinateur) ═════════════
{
  const r = await ouvrir(834, 1112, true); const { page } = r;
  await page.click('[data-testid=bar-legende]'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid=legende]').isVisible(), '834 · le petit « ⓘ » de la barre ouvre la légende (plus sous la grille)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // Retouches 4 : le panneau des tuiles en 2 × 2, quatre largeurs égales, aucune liste au repos ; la tuile « À relancer » ouvre sa liste sous elle.
  if (await page.locator('[data-testid=stat-waiting]:visible').count()) {
    await page.locator('[data-testid=stat-waiting]:visible').click(); await pause(page, 500);
    const m = await tuiles(page, '[data-testid=menu-chiffres]');
    const xs = new Set(m.map((x) => x.x)).size; const ys = new Set(m.map((x) => x.y)).size;
    check(m.length === 4 && xs === 2 && ys === 2 && Math.max(...m.map((x) => x.w)) - Math.min(...m.map((x) => x.w)) <= 1 && await repos(page, '[data-testid=menu-chiffres]') === 0,
      `834 · tuiles en 2 × 2, largeurs égales, aucune liste au repos (${m.map((x) => `${x.w} × ${x.h}`).join(' / ')})`);
    await image(page, 'parcours-tuiles-834');
    const mc = '[data-testid=menu-chiffres] [data-testid=stat-relance]';
    await page.locator(`${mc} .dzp-tuile__corps`).click(); await pause(page, 300);
    const d = await deroulant(page, mc);
    const vw = await page.evaluate(() => innerWidth);
    check(!!d && d.ecart >= 0 && d.ecart <= 12 && d.n > 0 && await page.locator(`${mc} .dzp-deroulant`).evaluate((e, w) => e.getBoundingClientRect().right <= w && e.getBoundingClientRect().left >= 0, vw),
      `834 · « À relancer » : sa liste déroulante sous la tuile, entière à l'écran (${d?.n} ligne(s))`);
    await echap(page);
    check(!(await deroulant(page, mc)) && await page.locator('[data-testid=menu-chiffres]').count() === 1, '834 · Échap ferme d’abord la liste (le panneau reste)');
    await fermerTout(page);
  }
  for (const [id, re] of [['stat-waiting', /menu-chiffres/], ['compteur-conges', /Salari|salaries/i], ['compteur-pieces', /liste-pieces/], ['compteur-reserves', /serves|reserves/i]]) {
    if (!(await page.locator(`[data-testid=${id}]:visible`).count())) continue;
    await page.locator(`[data-testid=${id}]:visible`).click(); await pause(page, 900);
    await apres(page, `834 · ${id}`, { attendu: re, y: 0 });
    await fermerTout(page);
  }
  await page.locator('[data-testid=bar-plus]:visible').click(); await pause(page, 300);
  const t = (await page.locator('[data-testid=menu-plus]').innerText()).replace(/\s+/g, ' ');
  check(!/Légende|Versions du planning/.test(t), `834 · Plus ⋯ : ni Légende ni Versions (${t})`);
  await r.ctx.close();
}

// ═════════════ TÉLÉPHONE 390 ═════════════
{
  const r = await ouvrir(390, 844, true); const { page } = r;
  await apres(page, '390 · arrivée', { max: 0, y: 0 });
  await page.click('[data-testid=m-menu]'); await pause(page, 700);
  const items = (await page.locator('.dzp-mm button.dzp-mm__item:visible, .dzp-mm [data-testid=mm-chiffres]:visible').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/[\s›\d]+$/, '').trim());
  check(!items.some((l) => /Versions du planning/.test(l)), `menu ☰ : plus de « Versions du planning » (${items.join(' | ')})`);
  await image(page, 'parcours-menu-390');
  await echap(page);
  for (let i = 0; i < items.length; i++) {
    if (/Déconnexion/.test(items[i])) continue;
    await page.evaluate(() => window.scrollTo(0, 0)); await pause(page, 150);
    await page.click('[data-testid=m-menu]'); await pause(page, 700);
    const cible = /^CHIFFRES/i.test(items[i]) ? page.locator('.dzp-mm [data-testid=mm-chiffres]:visible') : page.locator('.dzp-mm button.dzp-mm__item:visible', { hasText: new RegExp(`^${esc(items[i])}`) }).first();
    if (!(await cible.count())) { check(EMAIL.test(items[i]), `☰ › ${items[i]} : la ligne n'est plus dans le menu${EMAIL.test(items[i]) ? ' — attendu : fonction d\'envoi absente de la base simulée (lot 19)' : ''}`); await fermerTout(page); continue; }
    await cible.click(); await pause(page, 1100);
    const e = await apres(page, `☰ › ${items[i]}`, { y: 0 });
    check(e.ouverts.length <= 1 && !e.ouverts.some((o) => /^Menu$/.test(o)) && (await page.locator('.dzp-mm:not(.dzp-mm--feuille)[data-state=open]').count()) === 0, `☰ › ${items[i]} : le menu est fermé avant sa cible (${e.ouverts.join(', ') || 'mode sélection'})`);
    if (/Légende/.test(items[i])) { check(await page.locator('[data-testid=legende-mobile]:visible').count() === 1, '☰ › Légende : une petite feuille, sans défiler la page'); await image(page, 'parcours-legende-390'); }
    if (/Chiffres/.test(items[i])) {
      check(await page.locator('[data-testid=mm-feuille-chiffres] .dzp-tuile').count() === 4 && await repos(page, '[data-testid=mm-feuille-chiffres]') === 0, '☰ › Chiffres : les quatre tuiles empilées dans une feuille, aucune liste au repos');
      const mc = '[data-testid=mm-feuille-chiffres] [data-testid=stat-relance]';
      await page.locator(`${mc} .dzp-tuile__corps`).click(); await pause(page, 300);
      const d = await deroulant(page, mc);
      check(!!d && d.ecart >= 0 && d.ecart <= 12 && d.n > 0, `☰ › Chiffres › À relancer : sa liste déroulante sous la tuile (${d?.n} ligne(s))`);
      await image(page, 'parcours-chiffres-relance-390');
      await echap(page);
      check(!(await deroulant(page, mc)) && await page.locator('[data-testid=mm-feuille-chiffres]').count() === 1, '☰ › Chiffres : Échap ferme d’abord la liste, la feuille reste');
    }
    if (/Pièces/.test(items[i])) check(await page.locator('[data-testid=mm-feuille-pieces] [data-testid=liste-pieces]').count() === 1, '☰ › Pièces jointes : la liste dans une feuille');
    if (/Sélectionner/.test(items[i])) { const fin = page.locator('[data-testid=sel-done]:visible'); if (await fin.count()) await fin.click(); await pause(page, 300); }
    await fermerTout(page);
  }
  // Exporter, deux modes
  await page.click('[data-testid=m-menu]'); await pause(page, 600);
  await page.click('[data-testid=mm-export]'); await pause(page, 900);
  await apres(page, '390 · Exporter', { attendu: /team-export/, y: 0 });
  check(await page.locator('[data-testid=export-one-worker]').count() === 0, '390 · Exporter : plus de lien du bas');
  await page.click('[data-testid=export-bascule-salarie]'); await pause(page, 400);
  await apres(page, '390 · Exporter › Un salarié', { attendu: /team-export/, y: 0 });
  await fermerTout(page);
  // Copier (fiche du téléphone › Dupliquer au lendemain) puis attendre le retour
  await page.locator('.dzp-m-carte', { hasText: 'Bruno Essai' }).locator('.dzp-m-bulle').first().click().catch(() => {}); await pause(page, 900);
  const dup = page.locator('[role=dialog] button', { hasText: 'Dupliquer au lendemain' });
  if (await dup.count()) {
    await dup.first().click(); await pause(page, 1000);
    const s0 = await etat(page);
    check(s0.toasts.length === 1, `390 · Dupliquer au lendemain : un retour (« ${s0.toasts[0] || '—'} »)`);
    await page.clock.fastForward(3900); await pause(page, 700);
    check((await etat(page)).toasts.length === 0, '390 · le retour part seul à 3,5 s');
  } else check(false, '390 · Dupliquer au lendemain introuvable');
  await fermerTout(page);
  // Assistant puis un écran depuis l'assistant
  await page.click('[data-testid=m-assistant]'); await page.waitForSelector('[data-testid=assistant-panel] textarea', { timeout: 15000 });
  await page.fill('[data-testid=assistant-panel] textarea', 'Qui est dans l’équipe ?'); await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=assistant-panel] .as-bot', { timeout: 15000 }); await pause(page, 500);
  const liens = await page.locator('[data-testid=assistant-panel] .as-links button').allInnerTexts();
  check(liens.length === 1, `390 · assistant : aucun bouton vers Versions (${liens.join(' | ')})`);
  await page.locator('[data-testid=assistant-panel] .as-links button').first().click(); await pause(page, 1200);
  await apres(page, '390 · assistant › Salariés', { attendu: /Salari|salaries/i, y: 0 });
  await fermerTout(page);
  await apres(page, '390 · fin', { max: 0 });
  await r.ctx.close();
}

await sim.fermer();
console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
