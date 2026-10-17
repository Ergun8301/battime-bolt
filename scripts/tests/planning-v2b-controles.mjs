// Les 10 CONTRÔLES de la planche « Planning v2b · Couleur » (docs/design-brief/designer-planning-v2/README.md §7), mesurés sur le build, en /admin?ui=2.
//   npm run build && node scripts/tests/planning-v2b-controles.mjs out docs/design-brief/integration/captures-planning-v2b 4431
// Données : la base SIMULÉE de bureau-sim.mjs (équivalente à la planche : 8 salariés, tous les états — prévue, sans horaire, en cours, à envoyer, envoyée,
// ajoutée par le salarié, retirée, absences, réunion, tâches, heures hors planning —, semaine S-42, aujourd'hui = jeudi 15 octobre 2026, horloge figée).
// Chaque contrôle imprime OK / ÉCHEC et sa mesure ; le script finit par les captures (1440 × 900, 1024 × 768, fiche, téléphone).
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';
const [,, OUT = 'out', SH = 'docs/design-brief/integration/captures-planning-v2b', PORT = '4431'] = process.argv;
fs.mkdirSync(SH, { recursive: true });
let ok = 0, ko = 0;
const controle = (n, c, m) => { if (c) ok++; else ko++; console.log(`${c ? 'OK    ' : 'ÉCHEC '} (${n}) ${m}`); };
const sim = await demarrer({ out: OUT, port: Number(PORT) });
const ATTENTE = '.dzp-table .dzp-bulle';

// ── 1440 × 900 ─────────────────────────────────────────────────────────────
{
  const { page, ctx, erreurs } = await sim.page({ ui: 2, largeur: 1440, hauteur: 900, attente: ATTENTE });
  await page.mouse.move(2, 2); await page.waitForTimeout(300);

  // (1) 8 salariés visibles sans défiler, une ligne chacun.
  const r1 = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.dzp-table tbody tr')];
    const noms = rows.map((tr) => tr.querySelector('.dzp-nom'));
    return {
      n: rows.length, scrollY: window.scrollY, h: innerHeight,
      bas: Math.max(...rows.map((tr) => tr.getBoundingClientRect().bottom)),
      uneLigne: noms.every((e) => e && e.getBoundingClientRect().height <= parseFloat(getComputedStyle(e).lineHeight) + 1),
    };
  });
  controle(1, r1.n === 8 && r1.scrollY === 0 && r1.bas <= r1.h && r1.uneLigne, `1440×900 : ${r1.n} salariés, bas de la dernière ligne à ${Math.round(r1.bas)} px (fenêtre ${r1.h} px), sans défiler, nom sur une ligne : ${r1.uneLigne}`);

  // (2) Bulle : 2 lignes au plus, aucune étiquette en majuscules.
  const r2 = await page.evaluate(() => {
    const bulles = [...document.querySelectorAll('.dzp-table .dzp-bulle')];
    const trop = []; const maj = [];
    for (const b of bulles) {
      const tops = new Set();
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement; const s = getComputedStyle(el);
        if (s.display === 'none') continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top));
        if (s.textTransform === 'uppercase' || /[A-ZÀ-Ý]{3,}/.test(n.textContent)) maj.push(n.textContent.trim());
      }
      if (tops.size > 2 || b.getBoundingClientRect().height > 42) trop.push(`${b.innerText.replace(/\s+/g, ' ')} (${tops.size} lignes, ${Math.round(b.getBoundingClientRect().height)} px)`);
    }
    return { n: bulles.length, trop, maj, hMax: Math.max(...bulles.map((b) => b.getBoundingClientRect().height)) };
  });
  controle(2, r2.n > 20 && r2.trop.length === 0 && r2.maj.length === 0, `${r2.n} bulles, hauteur max ${Math.round(r2.hMax)} px, plus de 2 lignes : ${r2.trop.length} ${r2.trop.slice(0, 2).join(' | ')}, étiquettes en majuscules : ${r2.maj.length} ${r2.maj.slice(0, 3).join(', ')}`);

  // (3) « à envoyer » seulement sur les bulles rouges ; aucun autre mot d'état dans la grille.
  const r3 = await page.evaluate(() => {
    const g = document.querySelector('.dzp-table');
    const mots = [...g.querySelectorAll('*')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && /à envoyer/i.test(n.textContent)));
    const horsRouge = mots.filter((e) => !e.closest('.dzp-bulle[data-etat="a-envoyer"]'));
    const rouges = g.querySelectorAll('.dzp-bulle[data-etat="a-envoyer"]').length;
    const reste = g.innerText.replace(/à envoyer/gi, '');
    const autres = reste.match(/\b(envoy\w*|prévu\w*|en cours|ajouté\w*|retiré\w*|pas d.heures\w*|en attente|à jour|réserve\w*|clos)\b/gi) || [];
    return { mots: mots.length, horsRouge: horsRouge.length, rouges, autres };
  });
  controle(3, r3.mots === r3.rouges && r3.horsRouge === 0 && r3.autres.length === 0, `« à envoyer » écrit ${r3.mots} fois pour ${r3.rouges} bulles rouges (hors bulle rouge : ${r3.horsRouge}), autres mots d'état dans la grille : ${r3.autres.length ? r3.autres.join(', ') : 'aucun'}`);

  // (4) Aucun « + » visible au repos, aucun « + ajouter ».
  const r4 = await page.evaluate(() => {
    const zone = document.querySelector('.dzp-bureau-desk'); const vus = [];
    const w = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.includes('+')) continue;
      const el = n.parentElement; const b = el.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' && el.checkVisibility()) vus.push(n.textContent.trim());
    }
    return { vus, ajouter: /\+\s*ajouter/i.test(zone.innerText) };
  });
  controle(4, r4.vus.length === 0 && !r4.ajouter, `« + » visibles au repos : ${r4.vus.length} ${r4.vus.slice(0, 3).join(' | ')} ; « + ajouter » : ${r4.ajouter ? 'présent' : 'absent'}`);

  // (5) Aujourd'hui : un seul repère (rond jaune) ; pas de colonne teintée, pas de badge.
  const r5 = await page.evaluate(() => {
    const ths = [...document.querySelectorAll('.dzp-table thead th')];
    const iAuj = ths.findIndex((th) => th.hasAttribute('data-auj'));
    const jaune = (e) => getComputedStyle(e).backgroundColor === 'rgb(255, 194, 26)';
    const ronds = [...document.querySelectorAll('.dzp-table thead *')].filter(jaune);
    const teinte = (e) => getComputedStyle(e).backgroundColor;
    const autre = iAuj === 1 ? 2 : 1;
    const thTeinte = teinte(ths[iAuj]) !== teinte(ths[autre]);
    const casesTeintees = [...document.querySelectorAll('.dzp-table tbody tr')].filter((tr) => { const td = tr.children; return teinte(td[iAuj]) !== teinte(td[autre]) && !td[iAuj].hasAttribute('data-clos') && !td[autre].hasAttribute('data-clos'); }).length;
    const badge = /\bAUJ|aujourd.hui/i.test(document.querySelector('.dzp-table').innerText);
    return { iAuj, ronds: ronds.map((e) => e.className + ':' + e.textContent), thTeinte, casesTeintees, badge };
  });
  controle(5, r5.iAuj === 4 && r5.ronds.length === 1 && /dzp-jour__n:15/.test(r5.ronds[0]) && !r5.thTeinte && r5.casesTeintees === 0 && !r5.badge, `aujourd'hui = colonne ${r5.iAuj} (jeudi) ; repères jaunes dans l'en-tête : ${r5.ronds.join(', ')} ; en-tête teinté : ${r5.thTeinte} ; cases teintées : ${r5.casesTeintees} ; badge : ${r5.badge}`);

  // (6) Bandeau : aucune valeur 0 affichée (replié, puis déplié).
  const zero = /(^|[\s(·])0(?=[\s)·]|\s?h\b|$)/;
  const replie = await page.locator('[data-testid=bandeau-replie]').innerText().catch(() => '');
  await page.getByRole('button', { name: /Déplier/ }).click(); await page.waitForTimeout(300);
  const deplie = await page.locator('[data-testid=bandeau]').innerText().catch(() => '');
  // (7, déplié) « à relancer » écrit une seule fois même déplié.
  const fois7d = ((await page.locator('body').innerText()).match(/à relancer|en attente/gi) || []).length;
  await page.screenshot({ path: path.join(SH, 'planning-v2b-1440-deplie.png') });
  await page.getByRole('button', { name: /Replier/ }).click(); await page.waitForTimeout(300);
  controle(6, !!replie && !!deplie && !zero.test(replie) && !zero.test(deplie), `bandeau replié « ${replie.replace(/\s+/g, ' ').trim()} » ; déplié « ${deplie.replace(/\s+/g, ' ').trim().slice(0, 140)}… » : aucune valeur 0`);

  // (7) « jours en attente » / « journées à relancer » écrit une seule fois à l'écran.
  const texte = await page.locator('body').innerText();
  const fois7 = (texte.match(/jours? en attente|journées? à relancer/gi) || []).length;
  controle(7, fois7 === 1 && fois7d === 1, `« journées à relancer » / « jours en attente » : ${fois7} fois (bandeau replié) ; « à relancer » / « en attente » bandeau déplié : ${fois7d} fois`);

  // (8) Aucun élément en JetBrains Mono ni letter-spacing > 0 sur le planning.
  const r8 = await page.evaluate(() => {
    const mono = []; const espace = [];
    for (const e of document.querySelectorAll('.dz-planning-v2b, .dz-planning-v2b *')) {
      const s = getComputedStyle(e);
      if (/JetBrains|monospace/i.test(s.fontFamily)) mono.push(e.className || e.tagName);
      if (s.letterSpacing !== 'normal' && parseFloat(s.letterSpacing) > 0) espace.push(`${e.className || e.tagName} ${s.letterSpacing}`);
    }
    return { n: document.querySelectorAll('.dz-planning-v2b *').length, mono, espace };
  });
  controle(8, r8.mono.length === 0 && r8.espace.length === 0, `${r8.n} éléments du planning : JetBrains Mono ${r8.mono.length} ${r8.mono.slice(0, 3).join(', ')} ; letter-spacing > 0 : ${r8.espace.length} ${r8.espace.slice(0, 3).join(', ')}`);

  // (10) Jaune plein : logo, onglet actif (fond jaune à 12 %, texte jaune), Exporter, rond d'aujourd'hui ; v2b autorise aussi l'anneau de sélection et le coin « ajoutée par le salarié ».
  const r10 = await page.evaluate(() => {
    const J = 'rgb(255, 194, 26)'; const pleins = []; const textes = [];
    for (const e of document.querySelectorAll('.dzp-bureau-desk *')) {
      if (!e.checkVisibility()) continue;
      const s = getComputedStyle(e);
      const plein = s.backgroundColor === J || /255, 194, 26\)/.test(s.backgroundImage) || (s.borderTopColor === J && parseFloat(s.borderTopWidth) >= 4) || /255, 194, 26\)/.test(s.boxShadow);
      if (plein) pleins.push(e.className);
      if (s.color === J && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) textes.push(`${e.className}:${e.textContent.trim().slice(0, 12)}`);
    }
    return { pleins, textes };
  });
  const permis = (k) => /dzp-logo|^b$|dzp-bouton--jaune|dzp-jour__n|dzp-bulle__coin/.test(k) || k === '';
  const hors = r10.pleins.filter((k) => !permis(k));
  const parType = r10.pleins.reduce((a, k) => { const t = /dzp-bulle__coin/.test(k) ? 'coin « ajoutée par le salarié »' : /dzp-jour__n/.test(k) ? 'rond d’aujourd’hui' : /dzp-bouton--jaune/.test(k) ? 'Exporter' : 'logo'; a[t] = (a[t] || 0) + 1; return a; }, {});
  controle(10, hors.length === 0 && parType['Exporter'] === 1 && parType['rond d’aujourd’hui'] === 1 && parType['logo'] === 1, `jaune plein au repos : ${Object.entries(parType).map(([k, v]) => `${k} ×${v}`).join(', ')} ; hors liste : ${hors.length ? hors.join(', ') : 'aucun'} ; texte jaune (pas un fond) : ${r10.textes.join(', ')}`);

  // Sélection : l'anneau jaune (autorisé par v2b) n'apparaît qu'en mode « Sélectionner ».
  await page.locator('[data-testid=bar-select]').click(); await page.waitForTimeout(300);
  await page.locator('.dzp-table .dzp-bulle-wrap[data-sel="off"] .dzp-prise').first().click({ force: true }); await page.waitForTimeout(300);
  const anneau = await page.evaluate(() => { const b = document.querySelector('.dzp-bulle-wrap[data-sel="on"] .dzp-bulle'); return b ? getComputedStyle(b).boxShadow : ''; });
  console.log(`       info : anneau de sélection (mode « Sélectionner » seulement) = ${anneau}`);
  await page.locator('[data-testid=sel-done]').click(); await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(SH, 'planning-v2b-1440.png') });
  // Fiche d'une intervention (une bulle rouge « à envoyer »).
  await page.locator('.dzp-table .dzp-bulle[data-etat="a-envoyer"]').first().click(); await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SH, 'planning-v2b-fiche-1440.png') });
  const fiche = await page.locator('[data-testid=fiche-intervention]').innerText().catch(() => '');
  console.log(`       info : fiche ouverte « ${fiche.replace(/\s+/g, ' ').slice(0, 160)}… »`);
  if (erreurs.length) console.log('       erreurs de page :', erreurs.join(' | '));
  await ctx.close();
}

// ── 1024 × 768 ─────────────────────────────────────────────────────────────
{
  sim.reinitialiser();
  const { page, ctx } = await sim.page({ ui: 2, largeur: 1024, hauteur: 768, attente: ATTENTE });
  await page.mouse.move(2, 2); await page.waitForTimeout(300);
  // (9) À 1024 px : aucune ligne de texte ne passe à la ligne (barres, en-têtes, bulles, colonne salarié).
  const r9 = await page.evaluate(() => {
    const zones = ['.dzp-noire', '.dzp-semaine', '.dzp-replie', '.dzp-table thead', '.dzp-table .dzp-bulle', '.dzp-td-nom', '.dzp-table .dzp-absence', '.dzp-table .dzp-reunion', '.dzp-table .dzp-taches'];
    const casse = []; let n = 0;
    for (const z of zones) for (const racine of document.querySelectorAll(z)) {
      const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (!t.textContent.trim() || !t.parentElement.checkVisibility()) continue;
        n++;
        const rg = document.createRange(); rg.selectNodeContents(t);
        const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (tops.size > 1) casse.push(`${z} « ${t.textContent.trim().slice(0, 30)} »`);
      }
    }
    return { n, casse, large: document.documentElement.scrollWidth };
  });
  controle(9, r9.casse.length === 0 && r9.large <= 1024, `1024 px : ${r9.n} lignes de texte mesurées, passées à la ligne : ${r9.casse.length} ${r9.casse.slice(0, 3).join(' | ')} ; largeur de page ${r9.large} px`);
  await page.screenshot({ path: path.join(SH, 'planning-v2b-1024.png') });
  await ctx.close();
}

// ── Téléphone (390 × 844) : capture seulement ───────────────────────────────
{
  sim.reinitialiser();
  const { page, ctx } = await sim.page({ ui: 2, largeur: 390, hauteur: 844, hasTouch: true, attente: '.dzp-m-carte' });
  const large = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`       info : téléphone 390 px, largeur de page ${large} px${large > 390 ? ' (DÉBORDE)' : ' (aucun défilement horizontal)'}`);
  await page.screenshot({ path: path.join(SH, 'planning-v2b-telephone-390.png'), fullPage: false });
  await ctx.close();
}

await sim.fermer();
console.log(`\n${ok} OK / ${ko} ÉCHEC (sur 10 contrôles)`);
process.exit(ko ? 1 : 0);
