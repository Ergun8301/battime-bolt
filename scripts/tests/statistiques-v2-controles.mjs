// « Statistiques » v2 du bureau (planche docs/design-brief/designer-statistiques), mesurée sur le build, en /admin?ui=2.
//   npm run build && node scripts/tests/statistiques-v2-controles.mjs out docs/design-brief/integration/captures-statistiques-v2 4441
// Données : la base SIMULÉE de bureau-sim.mjs (8 salariés, semaine S-42, aujourd'hui = jeudi 15 octobre 2026, horloge figée ; la simulation
// répond [] à toute fonction SQL, donc my_worksite_labour ne chiffre rien : coût caché, sauf quand ce script lui donne des taux).
// Chaque contrôle imprime OK / ÉCHEC et sa mesure ; le script écrit stats-tiroir-1280.png et stats-vide-1280.png.
//   C1  accès : barre noire « Statistiques » (1280) et menu ☰ (360) ouvrent la page (niveau 1), jamais l'ancien popup ; ?ui=1 garde l'ancien popup
//   C2  totaux = planning : heures envoyées jour par jour = en-têtes de jour de la grille ; Σ semaine = bandeau « envoyées »
//   C3  totaux = ancien popup (CSV de paie, cockpit) sur la même semaine et le même mois : heures, sup, absences, oublis, par salarié
//   C4  Semaine / Mois / Année : titre, nombre de piliers, Aujourd'hui grisé puis actif
//   C5  pilier → tiroir (titre, 4 mini-tuiles, salariés) ; Échap le ferme, la page reste ouverte
//   C6  recherche : filtre en direct, « Aucun salarié ne correspond »
//   C7  fiche (niveau 2) : nom, tuiles du salarié, liste jour par jour, accordéon (une ligne à la fois), filtre par pilier, « ← Retour »
//   C8  coût caché sans taux (aucune trace, aucun message) ; avec taux : tuile, colonne COÛT, « — » pour un salarié sans taux
//   C9  période à venir : état « aucune donnée » + « Revenir à aujourd'hui » ; lecture en échec : « Impossible de charger », aucun chiffre
//   C10 aucun défilement horizontal à 360, 834 et 1280 (niveau 1, tiroir, fiche)
//   C11 lecture seule : aucune écriture pendant la visite
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';
const [,, OUT = 'out', SH = 'docs/design-brief/integration/captures-statistiques-v2', PORT = '4441'] = process.argv;
fs.mkdirSync(SH, { recursive: true });
let ok = 0, ko = 0;
const controle = (n, c, m) => { if (c) ok++; else ko++; console.log(`${c ? 'OK    ' : 'ÉCHEC '} (${n}) ${m}`); };
const sim = await demarrer({ out: OUT, port: Number(PORT) });
// Intégration bureau v2 : le téléphone du planning 2b remplace « .dzp-m-menu » par le rond ☰ [data-guide="bureau-nav.menu"] (même menu).
const MENU_TEL = '[data-guide="bureau-nav.menu"]:visible';
const ATTENTE_V2 = `.dzp-table .dzp-bulle:visible, .dzp-table [data-testid=bubble]:visible, ${MENU_TEL}`;
const PAGE = '[data-testid="stats-v2"]';
const pret = async (page) => { await page.waitForSelector(`${PAGE}[data-etat="ok"]`, { timeout: 20000 }); await page.waitForTimeout(900); };
const minutesDe = (txt) => { const m = /(\d+) h(?: (\d+))?/.exec(txt || ''); return m ? Number(m[1]) * 60 + Number(m[2] || 0) : 0; };
const lirePiliers = (page) => page.$$eval('[data-testid="sx-pilier"]', (l) => l.map((e) => ({ from: e.dataset.from, to: e.dataset.to, m: +e.dataset.minutes, s: +e.dataset.sup, a: +e.dataset.absences, o: +e.dataset.oublis })));
const lireLignes = (page) => page.$$eval('[data-testid="sx-ligne"]', (l) => l.map((e) => ({ id: e.dataset.uid, m: +e.dataset.minutes, s: +e.dataset.sup, a: +e.dataset.absences, o: +e.dataset.oublis })));
const debord = (page) => page.evaluate(() => {
  const sc = document.querySelector('[data-testid="sx-scroll"]');
  const root = document.querySelector('[data-testid="stats-v2"]');
  const large = [...root.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('[data-testid="sx-tiroir"][data-open="0"]'); }).map((e) => e.className || e.tagName).slice(0, 3);
  return { sc: sc.scrollWidth - sc.clientWidth, doc: document.documentElement.scrollWidth - innerWidth, large };
});

// ── C3 (référence) : l'ancien popup en ?ui=1, même semaine et même mois ─────────
const ref = {};
{
  const { page, ctx } = await sim.page({ ui: 1, largeur: 1440, hauteur: 900 });
  await page.click('[data-testid=stat-stats]');
  await page.waitForSelector('[data-testid=team-stats][data-loaded*="2026-10-01"]', { timeout: 20000 });
  const lire = () => page.evaluate(() => {
    const t = document.querySelector('[data-testid=stats-team]').dataset;
    const rows = [...document.querySelectorAll('[data-testid=stats-row]')].map((e) => ({ id: e.dataset.uid, m: +e.dataset.minutes, s: +e.dataset.overtime, a: +e.dataset.absences, o: +e.dataset.forgotten }));
    return { m: +t.minutes, s: +t.overtime, a: +t.absences, o: +t.forgotten, rows };
  });
  ref.mois = await lire();
  await page.click('[data-testid=stats-kind-week]');
  await page.waitForSelector('[data-testid=team-stats][data-loaded="2026-10-12|2026-10-18"]', { timeout: 20000 });
  ref.semaine = await lire();
  const v2 = await page.$(PAGE);
  controle(1, !v2, `?ui=1 : l'ancien popup s'ouvre (équipe ${ref.semaine.m} min sur la semaine), la page v2 absente : ${!v2}`);
  await ctx.close();
}

// ── 1280 × 900 ─────────────────────────────────────────────────────────────
{
  sim.log.writes.length = 0;
  const { page, ctx, erreurs } = await sim.page({ ui: 2, largeur: 1280, hauteur: 900, attente: ATTENTE_V2 });
  // C2 : les en-têtes de jour de la grille (heures envoyées) et le total de la barre.
  const grille = await page.$$eval('.dzp-table thead .dzp-jour__sub', (l) => l.map((e) => e.textContent || ''));
  const joursGrille = grille.map(minutesDe);
  // Intégration bureau v2 : l'en-tête de jour du planning 1a (planche 1a) affiche la CHARGE prévue arrondie à l'heure (« 5 interv. · 37 h »), plus les heures
  // envoyées de la grille v2b ; la référence devient alors : jours passés = heures envoyées arrondies, et Σ semaine = tuile « Heures envoyées » du bandeau.
  const mode1a = grille.some((t) => /interv\./.test(t));
  const tuileEnvoyees = mode1a ? Number((await page.textContent('[data-testid="stat-heures"] .dzp-total__n b').catch(() => '')) || NaN) : NaN;
  await page.click('[data-testid="stat-stats"]');
  await pret(page);
  const old = await page.$('[data-testid=team-stats]');
  const niv = await page.getAttribute(PAGE, 'data-niveau');
  controle(1, niv === '1' && !old, `?ui=2 : barre noire « Statistiques » → page plein écran niveau ${niv}, ancien popup absent : ${!old}`);

  const P = await lirePiliers(page);
  const sem = P.map((p) => p.m);
  if (mode1a) {
    const passes = P.map((p, i) => [p, i]).filter(([p]) => String(p.from).slice(0, 10) < '2026-10-15');
    const somme = sem.reduce((a, b) => a + b, 0);
    controle(2, P.length === 7 && joursGrille.length === 7 && passes.length === 3 && passes.every(([p, i]) => Math.round(p.m / 60) * 60 === joursGrille[i]) && Math.round(somme / 60) === tuileEnvoyees,
      `planning 1a : jours passés ${passes.map(([p]) => (p.m / 60).toFixed(2)).join(' · ')} h ≈ en-têtes ${passes.map(([, i]) => joursGrille[i] / 60).join(' · ')} h (arrondi à l'heure) ; Σ semaine ${(somme / 60).toFixed(2)} h = tuile « Heures envoyées » ${tuileEnvoyees} h`);
  } else controle(2, P.length === 7 && joursGrille.length === 7 && sem.every((m, i) => m === joursGrille[i]),
    `piliers ${sem.map((m) => (m / 60).toFixed(2)).join(' · ')} h = en-têtes de la grille ${joursGrille.map((m) => (m / 60).toFixed(2)).join(' · ')} h`);

  // C3 : mêmes totaux que l'ancien popup (= CSV de paie, cockpit).
  const L = await lireLignes(page);
  const tot = P.reduce((t, p) => ({ m: t.m + p.m, s: t.s + p.s, a: t.a + p.a, o: t.o + p.o }), { m: 0, s: 0, a: 0, o: 0 });
  const r = ref.semaine;
  const parSal = r.rows.every((x) => { const y = L.find((l) => l.id === x.id); return y && y.m === x.m && y.s === x.s && y.a === x.a && y.o === x.o; });
  controle(3, tot.m === r.m && tot.s === r.s && tot.a === r.a && tot.o === r.o && parSal && L.length === r.rows.length,
    `semaine : ${tot.m} min / sup ${tot.s} / abs ${tot.a} j / oublis ${tot.o} j = ancien popup ${r.m} / ${r.s} / ${r.a} / ${r.o} ; ${L.length} salariés, détail par salarié identique : ${parSal}`);
  const tuile = await page.textContent('[data-testid="sx-tuile-oublis"]');
  controle(3, tuile.includes(`${r.o}`) && tuile.includes('j à relancer'), `tuile « Oublis » : ${tuile.replace(/\s+/g, ' ').trim()}`);

  // C5 : pilier → tiroir ; Échap.
  await page.locator('[data-testid="sx-pilier"]').nth(1).click();
  await page.waitForTimeout(600);
  const t5 = await page.evaluate(() => {
    const pn = document.querySelector('[data-testid="sx-tiroir"]');
    return { open: pn.dataset.open, titre: pn.querySelector('.sx-pn__t')?.textContent, tuiles: pn.querySelectorAll('.sx-pt > div').length, lignes: pn.querySelectorAll('[data-testid="sx-tiroir-ligne"]').length, x: pn.getBoundingClientRect().left };
  });
  await page.screenshot({ path: path.join(SH, 'stats-tiroir-1280.png') });
  const d5 = await debord(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const apres = await page.evaluate(() => ({ open: document.querySelector('[data-testid="sx-tiroir"]').dataset.open, page: !!document.querySelector('[data-testid="stats-v2"]') }));
  controle(5, t5.open === '1' && t5.titre === 'Mardi 13 octobre' && t5.tuiles === 4 && t5.lignes === L.length && apres.open === '0' && apres.page,
    `clic sur « Mar » : tiroir « ${t5.titre} », ${t5.tuiles} mini-tuiles, ${t5.lignes} salariés, bord gauche ${Math.round(t5.x)} px ; Échap → tiroir fermé (${apres.open}), page ouverte : ${apres.page}`);

  // C6 : recherche.
  await page.fill('[data-testid="sx-recherche"]', 'cam');
  await page.waitForTimeout(200);
  const r6 = await page.$$eval('[data-testid="sx-ligne"]', (l) => l.map((e) => e.textContent));
  await page.fill('[data-testid="sx-recherche"]', 'zzz');
  await page.waitForTimeout(200);
  const aucun = await page.textContent('[data-testid="sx-aucun"]').catch(() => '');
  await page.fill('[data-testid="sx-recherche"]', '');
  controle(6, r6.length === 1 && /Camille/.test(r6[0]) && /zzz/.test(aucun), `« cam » → ${r6.length} ligne (${(r6[0] || '').slice(0, 20)}…) ; « zzz » → « ${aucun.trim()} »`);

  // C8 : coût caché (aucun taux renseigné : my_worksite_labour ne chiffre rien).
  const c8 = await page.evaluate(() => ({ tuile: !!document.querySelector('[data-testid="sx-cout"]'), entete: /COÛT/.test(document.querySelector('[data-testid="sx-classement"]').innerText), euro: /€|taux/i.test(document.querySelector('[data-testid="stats-v2"]').innerText) }));
  controle(8, !c8.tuile && !c8.entete && !c8.euro, `sans taux : ligne coût de la tuile ${c8.tuile ? 'PRÉSENTE' : 'absente'}, colonne COÛT ${c8.entete ? 'PRÉSENTE' : 'absente'}, aucun « € » ni message : ${!c8.euro}`);

  // C10 (1280) : niveau 1 et tiroir.
  const d1 = await debord(page);
  controle(10, d1.sc <= 0 && d1.doc <= 0 && d5.sc <= 0 && d1.large.length === 0, `1280 : débord ${d1.sc} px (page), ${d5.sc} px (tiroir ouvert), éléments hors écran : ${d1.large.join(', ') || 'aucun'}`);

  // C7 : fiche.
  await page.locator('[data-testid="sx-ligne"]', { hasText: 'Camille' }).click();
  await page.waitForTimeout(900);
  const f7 = await page.evaluate(() => ({
    niv: document.querySelector('[data-testid="stats-v2"]').dataset.niveau, nom: document.querySelector('[data-testid="sx-fiche-nom"]')?.textContent,
    jours: [...document.querySelectorAll('[data-testid="sx-jour"]')].map((e) => e.dataset.date),
    total: document.querySelector('[data-testid="sx-tuile-heures"] .sx-kpi__v b')?.textContent,
    piliers: [...document.querySelectorAll('[data-testid="sx-pilier"]')].reduce((t, e) => t + +e.dataset.minutes, 0),
  }));
  const camille = L.find((l) => l.id === 'u-camille');
  await page.locator('[data-testid="sx-jour"]').nth(1).locator('button').click();
  await page.waitForTimeout(200);
  const det1 = await page.$$eval('[data-testid="sx-jour-detail"]', (l) => l.map((e) => e.innerText.replace(/\s+/g, ' ')));
  await page.locator('[data-testid="sx-jour"]').nth(2).locator('button').click();
  await page.waitForTimeout(200);
  const det2 = await page.$$eval('[data-testid="sx-jour-detail"]', (l) => l.length);
  await page.screenshot({ path: path.join(SH, 'stats-fiche-1280.png') });
  await page.locator('[data-testid="sx-pilier"]').nth(0).click();
  await page.waitForTimeout(300);
  const filtre = await page.evaluate(() => ({ chip: document.querySelector('[data-testid="sx-filtre"]')?.textContent, jours: [...document.querySelectorAll('[data-testid="sx-jour"]')].map((e) => e.dataset.date), ouvert: document.querySelectorAll('[data-testid="sx-jour-detail"]').length }));
  const d7 = await debord(page);
  await page.click('[data-testid="sx-retour"]');
  await page.waitForTimeout(500);
  const retour = await page.getAttribute(PAGE, 'data-niveau');
  controle(7, f7.niv === '2' && f7.nom === 'Camille Démo' && f7.piliers === camille.m && f7.jours[0] === '2026-10-15' && f7.jours.length === 4 && det1.length === 1 && /MATIN|CRÉNEAU/.test(det1[0]) && det2 === 1
    && /Lundi 12 octobre/.test(filtre.chip || '') && filtre.jours.join() === '2026-10-12' && filtre.ouvert === 1 && retour === '1' && d7.sc <= 0,
    `fiche « ${f7.nom} » niveau ${f7.niv} : ${f7.total} h (${f7.piliers} min = classement ${camille.m}), jours ${f7.jours.join(' ')} ; détail « ${(det1[0] || '').slice(0, 70)}… », une ligne ouverte à la fois : ${det2 === 1} ; clic « Lun » → filtre « ${filtre.chip?.replace('✕', '').trim()} », jours ${filtre.jours.join()} (jour déplié : ${filtre.ouvert}) ; « ← Retour » → niveau ${retour}`);

  // C4 : Mois puis Année, puis Semaine.
  await page.click('[data-testid="sx-vue-mois"]'); await pret(page);
  const m4 = { titre: await page.textContent('[data-testid="sx-titre"]'), n: (await lirePiliers(page)).length };
  const Pm = await lirePiliers(page); const Lm = await lireLignes(page);
  const tm = Pm.reduce((t, p) => ({ m: t.m + p.m, s: t.s + p.s, a: t.a + p.a, o: t.o + p.o }), { m: 0, s: 0, a: 0, o: 0 });
  const rm = ref.mois;
  const parSalM = rm.rows.every((x) => { const y = Lm.find((l) => l.id === x.id); return y && y.m === x.m && y.s === x.s && y.a === x.a && y.o === x.o; });
  controle(3, tm.m === rm.m && tm.s === rm.s && tm.a === rm.a && tm.o === rm.o && parSalM, `mois : ${tm.m} min / sup ${tm.s} / abs ${tm.a} j / oublis ${tm.o} j = ancien popup ${rm.m} / ${rm.s} / ${rm.a} / ${rm.o} ; par salarié : ${parSalM}`);
  await page.click('[data-testid="sx-vue-annee"]'); await pret(page);
  const a4 = { titre: await page.textContent('[data-testid="sx-titre"]'), n: (await lirePiliers(page)).length };
  await page.click('[data-testid="sx-prec"]'); await pret(page);
  const a4p = { titre: await page.textContent('[data-testid="sx-titre"]'), auj: await page.getAttribute('[data-testid="sx-auj"]', 'aria-disabled') };
  await page.click('[data-testid="sx-auj"]'); await pret(page);
  await page.click('[data-testid="sx-vue-semaine"]'); await pret(page);
  const s4 = { titre: await page.textContent('[data-testid="sx-titre"]'), n: (await lirePiliers(page)).length, auj: await page.getAttribute('[data-testid="sx-auj"]', 'aria-disabled') };
  controle(4, m4.titre === 'Octobre 2026' && m4.n === 5 && a4.titre === 'Année 2026' && a4.n === 12 && a4p.titre === 'Année 2025' && a4p.auj === 'false' && s4.titre === 'Semaine 42' && s4.n === 7 && s4.auj === 'true',
    `Mois « ${m4.titre} » ${m4.n} piliers ; Année « ${a4.titre} » ${a4.n} piliers ; ← « ${a4p.titre} » (Aujourd'hui actif) ; Semaine « ${s4.titre} » ${s4.n} piliers (Aujourd'hui grisé)`);

  // C9 : période à venir → aucune donnée.
  await page.click('[data-testid="sx-suiv"]'); await pret(page);
  const v9 = await page.evaluate(() => ({ vide: !!document.querySelector('[data-testid="sx-vide"]'), tirets: [...document.querySelectorAll('.sx-kpi__v b')].every((b) => b.textContent === '—'), classement: !!document.querySelector('[data-testid="sx-classement"]'), anneau: !!document.querySelector('[data-testid="sx-anneau"]') }));
  await page.screenshot({ path: path.join(SH, 'stats-vide-1280.png') });
  await page.click('[data-testid="sx-revenir"]'); await pret(page);
  const t9 = await page.textContent('[data-testid="sx-titre"]');
  controle(9, v9.vide && v9.tirets && !v9.classement && !v9.anneau && t9 === 'Semaine 42', `semaine 43 : carte « aucune donnée » ${v9.vide}, tuiles « — » ${v9.tirets}, classement/anneau masqués ${!v9.classement && !v9.anneau} ; « Revenir à aujourd'hui » → ${t9}`);

  // C11 : lecture seule.
  const ecritures = sim.log.writes.filter((w) => w.m !== 'FN' || !/send-push/.test(w.t));
  controle(11, ecritures.length === 0, `écritures pendant la visite : ${ecritures.length} ${ecritures.slice(0, 3).map((w) => `${w.m} ${w.t}`).join(', ')}`);
  if (erreurs.length) console.log('erreurs de page :', erreurs.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── C8 (taux renseignés) : my_worksite_labour chiffre deux salariés ──────────
{
  const { page, ctx } = await sim.page({ ui: 2, largeur: 1280, hauteur: 900, attente: ATTENTE_V2 });
  await ctx.route('**/rest/v1/rpc/my_worksite_labour**', (r) => r.fulfill({ json: [
    { worksite_id: 'w', user_id: 'u-alex', worked_minutes: 1455, route_minutes: 0, paid_minutes: 1455, cost: 485, unpriced_minutes: 0 },
    { worksite_id: 'w', user_id: 'u-camille', worked_minutes: 1650, route_minutes: 0, paid_minutes: 1650, cost: 550, unpriced_minutes: 0 },
    { worksite_id: 'w', user_id: 'u-gabriel', worked_minutes: 1050, route_minutes: 0, paid_minutes: 1050, cost: 0, unpriced_minutes: 1050 },
  ] }));
  await page.click('[data-testid="stat-stats"]');
  await pret(page);
  const c = await page.evaluate(() => ({
    tuile: document.querySelector('[data-testid="sx-cout"]')?.innerText.replace(/\s+/g, ' '),
    entete: /COÛT/.test(document.querySelector('[data-testid="sx-classement"]').innerText),
    gabriel: document.querySelector('[data-testid="sx-ligne"][data-uid="u-gabriel"] .sx-cost')?.textContent,
    alex: document.querySelector('[data-testid="sx-ligne"][data-uid="u-alex"] .sx-cost')?.textContent,
  }));
  controle(8, /1\s?035 € · partiel/.test(c.tuile || '') && c.entete && c.gabriel === '—' && /485/.test(c.alex || ''), `avec taux : tuile « ${c.tuile} », colonne COÛT ${c.entete}, Alex ${c.alex}, Gabriel (sans taux) « ${c.gabriel} »`);
  await ctx.close();
}

// ── C9 (erreur) : la lecture des heures échoue ─────────────────────────────
{
  const { page, ctx } = await sim.page({ ui: 2, largeur: 1280, hauteur: 900, attente: ATTENTE_V2 });
  await ctx.route('**/rest/v1/time_entries**', (r) => (/worksite_id%2Cbreak_minutes|worksite_id,break_minutes/.test(r.request().url()) ? r.fulfill({ status: 500, json: { message: 'panne' } }) : r.fallback()));
  await page.click('[data-testid="stat-stats"]');
  await page.waitForSelector(`${PAGE}[data-etat="ko"]`, { timeout: 20000 });
  const e = await page.evaluate(() => ({ carte: document.querySelector('[data-testid="sx-erreur"]')?.innerText.replace(/\s+/g, ' '), tirets: [...document.querySelectorAll('.sx-kpi__v b')].every((b) => b.textContent === '—'), chiffres: !!document.querySelector('[data-testid="sx-pilier"], [data-testid="sx-ligne"]') }));
  controle(9, /Impossible de charger les statistiques/.test(e.carte || '') && /Réessayer/.test(e.carte || '') && e.tirets && !e.chiffres, `lecture en échec : « ${(e.carte || '').slice(0, 60)}… », tuiles « — » ${e.tirets}, aucun chiffre partiel ${!e.chiffres}`);
  await ctx.close();
}

// ── 360 (téléphone, menu ☰) et 834 (tablette) ─────────────────────────────
for (const [w, h] of [[360, 780], [834, 1112]]) {
  const { page, ctx } = await sim.page({ ui: 2, largeur: w, hauteur: h, attente: ATTENTE_V2, hasTouch: w < 400 });
  if (await page.locator(MENU_TEL).first().isVisible()) {
    await page.click(MENU_TEL); await page.waitForTimeout(400);
    await page.click('[data-testid="mm-stats"]');
  } else {
    // Tablette du planning 2a : « Statistiques » est dans « Plus ⋯ » (la barre unique n'a pas d'onglet).
    if (!(await page.locator('[data-testid="stat-stats"]:visible').count())) { await page.click('[data-guide="bureau-nav.plus"]:visible'); await page.waitForTimeout(400); }
    await page.click('[data-testid="stat-stats"]:visible');
  }
  await pret(page);
  const d = await debord(page);
  await page.locator('[data-testid="sx-pilier"]').nth(2).click(); await page.waitForTimeout(600);
  const dt = await debord(page);
  const pn = await page.evaluate(() => { const r = document.querySelector('[data-testid="sx-tiroir"]').getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.locator('[data-testid="sx-ligne"]').first().click(); await page.waitForTimeout(800);
  const df = await debord(page);
  const niv = await page.getAttribute(PAGE, 'data-niveau');
  controle(10, d.sc <= 0 && d.doc <= 0 && dt.sc <= 0 && df.sc <= 0 && niv === '2' && d.large.length === 0 && df.large.length === 0,
    `${w} : débord page ${d.sc} px, tiroir ${dt.sc} px (${w < 720 ? `feuille du bas, haut à ${pn.top} px, ${pn.h} px de haut` : `latéral ${pn.w} px`}), fiche ${df.sc} px ; hors écran : ${[...d.large, ...df.large].join(', ') || 'aucun'}`);
  if (w === 360) controle(1, true, '360 : menu ☰ « Statistiques » → page plein écran');
  await ctx.close();
}

console.log(`\n${ok} OK, ${ko} ÉCHEC`);
await sim.fermer();
process.exit(ko ? 1 : 0);
