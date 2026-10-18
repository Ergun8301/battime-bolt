// Contrôles du LOT 3, PARTIE B du design du bureau (planche docs/design-brief/designer-bureau : ST03 à ST09, RG01 à RG17, XM05, XM06, XM08, XM12 à XM14),
// mesurés sur le build, en /admin?ui=2, avec la base SIMULÉE de bureau-sim.mjs (aucune vraie base, aucun e-mail, aucun paiement).
//   npm run build && node scripts/tests/bureau-lot3b-controles.mjs out <dossier-des-captures-écran> 4441
// Pour chaque fenêtre : elle s'ouvre par son point d'entrée existant, elle se ferme (✕ et Échap), ses actions appellent les MÊMES écritures qu'en v1
// (même table, même fonction serveur, même RPC : lu dans le journal des requêtes du banc), ses états vides et ses refus s'affichent, et aucune page
// ne défile en largeur à 390, 834 et 1440 px. Le script finit par les captures « écran » (comparées à la planche par captures-lot3b.mjs).
import fs from 'node:fs'; import path from 'node:path';
import { demarrer, NOW, CLIENTS, PERSONNES } from './bureau-sim.mjs';
const [,, OUT = 'out', SH = '', PORT = '4441'] = process.argv;
if (SH) fs.mkdirSync(SH, { recursive: true });
let ok = 0, ko = 0;
const check = (c, m) => { if (c) ok++; else ko++; console.log(`${c ? 'OK    ' : 'ÉCHEC '} ${m}`); };
const sim = await demarrer({ out: OUT, port: Number(PORT) });
const CO = sim.D.companies[0].id;
const iso = (d) => d.toISOString();
const plusMin = (m) => new Date(NOW.getTime() + m * 60000);

// ── Données propres à ce lot (ajoutées au banc commun, sans le modifier) ───────────────────────────────────────────────
function preparer({ kiosque = false, tablette = false, support = false, essaiFini = false, depenses = true, plans = true } = {}) {
  sim.reinitialiser();
  const D = sim.D; const c = D.companies[0];
  c.kiosk_enabled = kiosque; c.support_enabled = support;
  if (essaiFini) c.trial_ends_at = '2026-10-01T10:00:00Z';
  if (tablette) D.kiosks.push({ id: 'k-tab', company_id: CO, created_at: '2026-10-02T08:00:00Z', last_seen_at: iso(plusMin(-20)), kind: 'tablette', revoked_at: null });
  if (depenses) D.worksite_expenses.push({ id: 'ex1', company_id: CO, worksite_id: CLIENTS.VE.id, spent_on: '2026-10-14', category: 'location', label: 'Location nacelle', supplier: null, amount: 380 });
  D.planning_versions = [
    { id: 'pv1', company_id: CO, week_start: '2026-10-12', number: 1, kind: 'initial', created_by: null, created_at: '2026-10-12T06:00:00Z', request: null, note: null, cells: [] },
    { id: 'pv2', company_id: CO, week_start: '2026-10-12', number: 2, kind: 'manuel', created_by: 'u-admin', created_at: '2026-10-12T06:15:00Z', request: null, note: null, cells: [] },
  ];
  D.traces = [
    { id: 'tr1', company_id: CO, object_table: 'planning', object_id: 'x1', action: 'supprimee', user_id: 'u-hugo', actor_id: 'u-admin', origin: 'ecran', created_at: '2026-10-15T12:02:00Z', work_date: '2026-10-15',
      before: { user_id: 'u-hugo', work_date: '2026-10-15', worksite_id: CLIENTS.RT.id, estimated_start: '08:00:00', estimated_end: '17:00:00' }, after: null },
  ];
  D.subscription_plans = plans ? [
    { code: 'equipe', label: 'Équipe', stripe_price_id: 'price_e', amount_eur: 29, min_workers: 1, max_workers: 5, sort: 1, active: true },
    { code: 'entreprise', label: 'Entreprise', stripe_price_id: 'price_n', amount_eur: 59, min_workers: 6, max_workers: 15, sort: 2, active: true },
    { code: 'groupe', label: 'Groupe', stripe_price_id: 'price_g', amount_eur: 109, min_workers: 16, max_workers: 40, sort: 3, active: true },
  ] : [];
  D.support_grants = []; D.support_access_log = [{ id: 'sl1', company_id: CO, at: '2026-10-02T08:14:00Z', event: 'entre', actor_label: 'Agent L.', detail: null }];
}
const LABOUR = [
  { worksite_id: CLIENTS.VE.id, user_id: 'u-alex', worked_minutes: 5640, route_minutes: 190, paid_minutes: 5640, cost: 3290, unpriced_minutes: 0 },
  { worksite_id: CLIENTS.MD.id, user_id: 'u-eli', worked_minutes: 3120, route_minutes: 0, paid_minutes: 3120, cost: 1820, unpriced_minutes: 0 },
  { worksite_id: CLIENTS.RT.id, user_id: 'u-bruno', worked_minutes: 1860, route_minutes: 0, paid_minutes: 1860, cost: 0, unpriced_minutes: 1860 },
];
async function routes(ctx, { labour = LABOUR, labourKo = false, tracesKo = false } = {}) {
  await ctx.route('**/rest/v1/rpc/my_worksite_labour**', (r) => (sim.log.requetes.push('POST /rest/v1/rpc/my_worksite_labour'), labourKo ? r.fulfill({ status: 500, json: { message: 'panne' } }) : r.fulfill({ json: labour })));
  if (tracesKo) await ctx.route('**/rest/v1/traces?**', (r) => (r.request().method() === 'GET' && /select=\*/.test(r.request().url()) ? r.fulfill({ status: 500, json: { message: 'panne' } }) : r.fallback()));
  await ctx.route('**/functions/v1/kiosk', async (r) => {
    const b = JSON.parse(r.request().postData() || '{}');
    sim.log.writes.push({ m: 'FN', t: '/functions/v1/kiosk', action: b.action });
    if (b.action === 'create_pairing') return r.fulfill({ json: { code: '482913', pairing_id: 'pp1', expires_at: iso(plusMin(10)) } });
    if (b.action === 'revoke') { sim.D.kiosks = sim.D.kiosks.filter((k) => k.id !== b.kiosk_id); return r.fulfill({ json: { revoked: 1 } }); }
    if (b.action === 'fixed_status') return r.fulfill({ json: { available: true, enabled: false, kiosk_enabled: true, has_tablet: sim.D.kiosks.length > 0 } });
    if (b.action === 'pair_lookup') return r.fulfill({ json: { company_name: 'Entreprise Test', choices: ['47', '12', '85', '30'], age_s: 40, replaces: { alive: true, seen_ago_s: 600 } } });
    return r.fulfill({ json: {} });
  });
}
const writes = (pred) => sim.log.writes.filter(pred).length;
const req = (re) => sim.log.requetes.filter((x) => re.test(x)).length;
const hscroll = (page) => page.evaluate(() => {
  const corps = [...document.querySelectorAll('.dz-fenetre__corps, .dz-l3-page')].map((e) => e.scrollWidth - e.clientWidth);
  return { doc: document.documentElement.scrollWidth - innerWidth, corps: corps.length ? Math.max(...corps) : 0 };
});
const fenetre = (page, id) => page.locator(`[data-testid="${id}"]`);
async function fermerX(page, id) { await fenetre(page, id).locator('.dz-fenetre__fermer').first().click(); await page.waitForTimeout(450); return (await fenetre(page, id).count()) === 0; }
async function fermerEchap(page, id) { await page.keyboard.press('Escape'); await page.waitForTimeout(450); return (await fenetre(page, id).count()) === 0; }
async function plus(page, item) { await page.locator('[data-testid=bar-plus]').click(); await page.waitForTimeout(250); await page.locator(`[data-testid=${item}]`).click(); await page.waitForTimeout(900); }
async function reglages(page) { await page.locator('.dzp-compte__btn').click(); await page.waitForTimeout(250); await page.getByRole('button', { name: 'Réglages de l’entreprise' }).or(page.getByRole('button', { name: "Réglages de l'entreprise" })).first().click(); await page.waitForTimeout(1000); }
async function capture(page, nom) { if (SH) await page.screenshot({ path: path.join(SH, `${nom}.png`) }); }
async function largeurs(nom, ouvrir, id, opts = {}) {
  for (const [w, h] of [[390, 844], [834, 1112], [1440, 900]]) {
    preparer(opts.prep);
    const { page, ctx } = await sim.page({ ui: 2, largeur: w, hauteur: h, hasTouch: w < 1024, attente: w < 768 ? '[data-testid=planning-mobile]' : (w < 1024 ? '.dzp-table [data-testid=bubble]:visible' : undefined) }); // intégration : la tablette garde la grille 2a (planning 2b : téléphone sous 768 px)
    await routes(ctx, opts.routes);
    await ouvrir(page, w);
    const vu = (await fenetre(page, id).count()) > 0;
    const hs = await hscroll(page);
    check(vu && hs.doc <= 0 && hs.corps <= 0, `${nom} à ${w} px : ouverte, défilement horizontal page ${hs.doc} px, fenêtre ${hs.corps} px`);
    if (w === 390 && id !== 'subscribe-dialog') {
      const plein = await fenetre(page, id).evaluate((e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; }).catch(() => null);
      if (opts.pleinEcran) check(!!plein && plein.h >= 840 && plein.w >= 389, `${nom} au téléphone : page plein écran (${plein?.w} × ${plein?.h})`);
      if (opts.tel) await capture(page, opts.tel);
    }
    await ctx.close();
  }
}
// Intégration bureau v2 : au téléphone (planning 2b), le menu ☰ est le rond de l'en-tête (aria-label « Menu ») ; à la tablette (768–1 023 px, barre unique 2a),
// pas de ☰ : la ligne est dans « Plus ⋯ », et Réglages dans le menu du compte, comme à l'ordinateur.
const mobileMenu = async (page, libelle) => {
  const rond = page.locator('button[aria-label="Menu"]:visible');
  if (await rond.count()) { await rond.first().click(); await page.waitForTimeout(500); await page.locator('.dzp-mm button:visible', { hasText: libelle }).first().click(); await page.waitForTimeout(1000); return; }
  if (/^Réglages/.test(libelle)) return reglages(page);
  await page.locator('[data-testid=bar-plus]:visible').first().click(); await page.waitForTimeout(250);
  await page.locator('[data-testid=menu-plus] button:visible', { hasText: libelle }).first().click(); await page.waitForTimeout(1000);
};
const ouvreur = (desk, mob) => async (page, w) => { if (w < 1024) await mob(page); else await desk(page); };

// ═════ ST03, ST04 · Coût chantiers ═══════════════════════════════════════════════════════════════════════════════════════
{
  preparer();
  const { page, ctx, erreurs } = await sim.page({ ui: 2 });
  await routes(ctx);
  await plus(page, 'bar-cost');
  const f = fenetre(page, 'cout-v2');
  check(await f.count() === 1, 'ST03 Plus ⋯ › Coût chantiers ouvre le panneau v2 (data-testid cout-v2)');
  const lignes = await f.locator('[data-testid=cout-ligne]').allInnerTexts();
  check(lignes.length === 3 && /Villa Exemple/.test(lignes.join('|')), `ST03 trois chantiers au tableau : ${lignes.map((x) => x.split('\n')[0]).join(', ')}`);
  const rt = lignes.find((x) => /Résidence Test/.test(x)) || '';
  check(/taux manquant : coût incomplet/i.test(rt) && /≥/.test(rt), 'ST03 coût incomplet : « taux manquant : coût incomplet » et total « ≥ … »');
  check(await f.getByText('Coût incomplet').count() >= 1, 'ST03 encadré « Coût incomplet » (taux horaire manquant)');
  check((await f.locator('.dz-l3-seg button[aria-pressed=true]').innerText()).trim() === 'Ce mois', 'ST03 période « Ce mois » choisie par défaut (pastilles Ce mois / Cette semaine / Créneau)');
  const n0 = req(/rpc\/my_worksite_labour/);
  await f.locator('.dz-l3-seg button', { hasText: 'Cette semaine' }).click(); await page.waitForTimeout(600);
  check(req(/rpc\/my_worksite_labour/) > n0, 'ST03 « Cette semaine » relit my_worksite_labour (même lecture qu’en v1)');
  await f.locator('[data-testid=cout-ligne] button[aria-expanded]').first().click(); await page.waitForTimeout(300);
  check(await f.locator('.dz-l3-cout__detail').count() === 1, 'ST03 une ligne se déplie (main-d’œuvre par salarié, dépenses)');
  await capture(page, 'impl-ST03');
  // ST04
  await f.locator('[data-testid=cout-ajouter]').click(); await page.waitForTimeout(500);
  const d = fenetre(page, 'cout-depense');
  check(await d.count() === 1, 'ST04 « + Ajouter une dépense » ouvre la fenêtre « Ajouter une dépense »');
  await d.locator('input[placeholder^="Ex"]').fill('Location nacelle'); await d.locator('input[inputmode=decimal]').fill('380,00');
  await capture(page, 'impl-ST04');
  const w0 = writes((x) => x.m === 'POST' && x.t === 'worksite_expenses');
  await d.locator('[data-testid=cout-depense-ajouter]').click(); await page.waitForTimeout(900);
  const post = sim.log.writes.filter((x) => x.m === 'POST' && x.t === 'worksite_expenses').pop();
  check(writes((x) => x.m === 'POST' && x.t === 'worksite_expenses') === w0 + 1 && post?.rows?.[0]?.amount === 380 && post?.rows?.[0]?.label === 'Location nacelle',
    `ST04 « Ajouter » écrit dans worksite_expenses (addExpense, comme en v1) : ${JSON.stringify(post?.rows?.[0] ?? null)}`);
  check(await fermerEchap(page, 'cout-depense') && await f.count() === 1, 'ST04 Échap ferme la fenêtre de la dépense, le panneau reste');
  // suppression d'une dépense : window.confirm, comme en v1
  page.once('dialog', (dl) => dl.accept());
  await f.locator('[data-testid=cout-ligne] button[aria-expanded="false"]').first().click().catch(() => {});
  const villa = f.locator('[data-testid=cout-ligne]', { hasText: 'Villa Exemple' });
  if (!(await villa.locator('.dz-l3-cout__detail').count())) await villa.locator('button[aria-expanded]').click();
  await page.waitForTimeout(300);
  const del0 = writes((x) => x.m === 'DELETE' && x.t === 'worksite_expenses');
  await villa.locator('.dz-l3-icone').first().click(); await page.waitForTimeout(700);
  check(writes((x) => x.m === 'DELETE' && x.t === 'worksite_expenses') === del0 + 1, 'ST03 la corbeille d’une dépense supprime dans worksite_expenses (avec la même confirmation)');
  check(await fermerX(page, 'cout-v2'), 'ST03 ✕ ferme le panneau');
  await plus(page, 'bar-cost'); check(await fermerEchap(page, 'cout-v2'), 'ST03 Échap ferme le panneau');
  check(erreurs.length === 0, `ST03 aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}
{ // états : vide, refus
  preparer({ depenses: false });
  const { page, ctx } = await sim.page({ ui: 2 });
  await routes(ctx, { labour: [] });
  await plus(page, 'bar-cost');
  check(await page.locator('[data-testid=cout-vide]').count() === 1, 'ST03 état vide : « Aucune heure déclarée ni dépense sur cette période. »');
  await ctx.close();
  preparer();
  const b = await sim.page({ ui: 2 });
  await routes(b.ctx, { labourKo: true });
  await plus(b.page, 'bar-cost');
  check(await b.page.locator('[data-testid=cout-v2] [role=alert]', { hasText: 'Chiffres illisibles' }).count() === 1, 'ST03 refus de lecture : « Chiffres illisibles… mieux vaut rien qu’un coût faux » (aucun chiffre)');
  await b.ctx.close();
}
await largeurs('ST03 / XM06 Coût chantiers', ouvreur((p) => plus(p, 'bar-cost'), (p) => mobileMenu(p, 'Coût chantiers')), 'cout-v2', { pleinEcran: true, tel: 'impl-XM06' });

// ═════ ST05 à ST08 · Versions du planning ═════════════════════════════════════════════════════════════════════════════
{
  preparer();
  const { page, ctx, erreurs } = await sim.page({ ui: 2 });
  await routes(ctx);
  await plus(page, 'corner-versions');
  const f = fenetre(page, 'versions-dialog');
  check(await f.count() === 1 && await f.locator('.dz-fenetre__titre').innerText() === 'Versions du planning', 'ST05 Plus ⋯ › Versions du planning ouvre le panneau v2');
  check(await f.locator('[data-testid=versions-item]').count() === 2, 'ST05 deux versions listées (V1, V2)');
  await capture(page, 'impl-ST05');
  const k0 = writes((x) => x.m === 'POST' && x.t === 'planning_versions');
  await f.locator('[data-testid=versions-keep]').click(); await page.waitForTimeout(800);
  check(writes((x) => x.m === 'POST' && x.t === 'planning_versions') === k0 + 1, '« Garder cette version » (bas du panneau) écrit dans planning_versions (saveVersion, comme en v1)');
  await f.locator('[data-testid=versions-view]').last().click(); await page.waitForTimeout(1200);
  const prev = await f.locator('[data-testid=versions-preview]').innerText().catch(() => '');
  check(/Revenir à la V|Rien à changer/.test(prev), `ST06 « Voir » montre l’aperçu de la version, rien n’est écrit : « ${prev.replace(/\s+/g, ' ').slice(0, 90)}… »`);
  if (await f.locator('[data-testid=versions-chiffres]').count()) check(true, 'ST07 chiffres REMISES / RETIRÉES / GARDÉES de l’aperçu');
  await capture(page, 'impl-ST07');
  const conf = f.locator('[data-testid=versions-confirm]');
  if (await conf.count()) {
    const n = sim.log.writes.length;
    await conf.click(); await page.waitForTimeout(1500);
    check(sim.log.writes.length > n, 'ST07 « Revenir à la V… » lance le retour (restoreVersion : version gardée d’abord, puis le planning)');
    await capture(page, 'impl-ST08');
  }
  check(await fermerX(page, 'versions-dialog'), 'ST05 ✕ ferme le panneau');
  await plus(page, 'corner-versions'); check(await fermerEchap(page, 'versions-dialog'), 'ST05 Échap ferme le panneau');
  check(erreurs.length === 0, `ST05 aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
  preparer(); sim.D.planning_versions.splice(0);
  const b = await sim.page({ ui: 2 });
  await routes(b.ctx);
  // la table est là (versionsAvailable) mais vide pour cette semaine
  sim.D.planning_versions.push({ id: 'pv-autre', company_id: CO, week_start: '2026-09-28', number: 1, kind: 'initial', created_by: null, created_at: '2026-09-28T06:00:00Z', request: null, note: null, cells: [] });
  await plus(b.page, 'corner-versions');
  check(await b.page.locator('[data-testid=versions-empty]').count() === 1, 'ST05 état vide : « Aucune version pour cette semaine… »');
  await b.ctx.close();
}
await largeurs('ST05 / XM13 Versions du planning', ouvreur((p) => plus(p, 'corner-versions'), (p) => mobileMenu(p, 'Versions du planning')), 'versions-dialog', { pleinEcran: true, tel: 'impl-XM13' });

// ═════ ST09 · Interventions supprimées ou décalées ═══════════════════════════════════════════════════════════════════
{
  preparer();
  const { page, ctx, erreurs } = await sim.page({ ui: 2 });
  await routes(ctx);
  await plus(page, 'menu-traces');
  const f = fenetre(page, 'traces-dialog');
  check(await f.count() === 1 && /LECTURE SEULE/i.test(await f.locator('.dz-fenetre__kicker').innerText()), 'ST09 Plus ⋯ › Interventions supprimées ou décalées ouvre le panneau v2 (« PLUS ⋯ · LECTURE SEULE »)');
  check(await f.locator('[data-testid=traces-item]').count() === 1, 'ST09 la suppression du jour est listée');
  await capture(page, 'impl-ST09');
  const n0 = req(/rest\/v1\/traces/);
  await f.locator('.bt-tr-seg button', { hasText: 'Mois' }).click(); await page.waitForTimeout(700);
  check(req(/rest\/v1\/traces/) > n0 && /octobre/i.test(await f.locator('[data-testid=traces-period]').innerText()), 'ST09 « Mois » relit les traces du mois (même lecture)');
  const n1 = req(/rest\/v1\/traces/);
  await f.locator('[data-testid=traces-worker]').selectOption('u-hugo'); await page.waitForTimeout(600);
  check(req(/rest\/v1\/traces/) > n1, 'ST09 filtre « Salarié » relit les traces (même lecture, user_id)');
  check(await fermerX(page, 'traces-dialog'), 'ST09 ✕ ferme le panneau');
  await plus(page, 'menu-traces'); check(await fermerEchap(page, 'traces-dialog'), 'ST09 Échap ferme le panneau');
  check(erreurs.length === 0, `ST09 aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
  preparer(); sim.D.traces = [{ id: 'old', company_id: CO, object_table: 'planning', object_id: 'o', action: 'supprimee', user_id: 'u-hugo', actor_id: 'u-admin', origin: 'ecran', created_at: '2026-01-02T10:00:00Z', work_date: '2026-01-02', before: {}, after: null }];
  const b = await sim.page({ ui: 2 }); await routes(b.ctx);
  await plus(b.page, 'menu-traces');
  check(await b.page.locator('[data-testid=traces-empty]').count() === 1, 'ST09 état vide : « Rien de supprimé ni de décalé sur cette période. »');
  await b.ctx.close();
  preparer();
  const c = await sim.page({ ui: 2 }); await routes(c.ctx, { tracesKo: true });
  await plus(c.page, 'menu-traces');
  check(await c.page.locator('[data-testid=traces-dialog] [role=alert]', { hasText: 'Impossible de charger la liste' }).count() === 1, 'ST09 refus de lecture : « Impossible de charger la liste. » + Réessayer');
  await c.ctx.close();
}
await largeurs('ST09 / XM14 Interventions supprimées', ouvreur((p) => plus(p, 'menu-traces'), (p) => mobileMenu(p, 'Interventions supprimées')), 'traces-dialog', { pleinEcran: true, tel: 'impl-XM14' });

// ═════ RG01 à RG06 · Réglages de l'entreprise ══════════════════════════════════════════════════════════════════════════
{
  preparer({ kiosque: true, support: true });
  const { page, ctx, erreurs } = await sim.page({ ui: 2 });
  await routes(ctx);
  await reglages(page);
  const f = fenetre(page, 'reglages-v2');
  check(await f.count() === 1 && /COMPTE/i.test(await f.locator('.dz-fenetre__kicker').innerText()), 'RG01 menu du compte › Réglages de l’entreprise ouvre le panneau v2 (760 px, « COMPTE »)');
  const larg = await f.evaluate((e) => Math.round(e.getBoundingClientRect().width));
  check(larg === 760, `RG01 panneau de ${larg} px (dossier : 760 px pour Réglages)`);
  check(await f.locator('.bt-set-sec').count() === 4, 'RG01 quatre rubriques : Entreprise, Heures & paie, Borne & pointage, Notifications & support');
  check(await f.locator('[data-testid=set-traces]').isHidden(), 'RG01 le lien « Interventions supprimées ou décalées » n’est plus dans les Réglages (README §1, doublon retiré ; Plus ⋯ et menu ☰ seulement)');
  await capture(page, 'impl-RG01');
  // RG06 : logo trop lourd (même contrôle que v1 : 2 Mo)
  await f.locator('input[type=file]').setInputFiles({ name: 'logo-hd.png', mimeType: 'image/png', buffer: Buffer.alloc(3 * 1024 * 1024, 1) });
  await page.waitForTimeout(300);
  check(/Logo trop lourd/.test(await f.locator('.bt-set-err').innerText().catch(() => '')), 'RG06 logo de 3 Mo refusé : « Logo trop lourd (2 Mo maximum). » (même contrôle qu’en v1)');
  await capture(page, 'impl-RG06');
  await f.locator('[data-testid=set-sec-paie] .bt-set-sec-btn').click(); await page.waitForTimeout(250);
  await f.locator('[data-testid=set-sec-entreprise] .bt-set-sec-btn').click(); await page.waitForTimeout(250);
  check(await f.locator('[data-testid=set-sec-paie] [role=region]').isVisible(), 'RG02 « Heures & paie » se déplie (horaire, majorations, route, comptable)');
  await capture(page, 'impl-RG02');
  await f.locator('[data-testid=set-sec-paie] .bt-set-sec-btn').click();
  await f.locator('[data-testid=set-sec-borne] .bt-set-sec-btn').click(); await page.waitForTimeout(250);
  await capture(page, 'impl-RG03');
  await f.locator('[data-testid=set-sec-borne] .bt-set-sec-btn').click();
  await f.locator('[data-testid=set-sec-notif] .bt-set-sec-btn').click(); await page.waitForTimeout(500);
  await capture(page, 'impl-RG04');
  // RG16 : Support BEMEXO
  await f.locator('[data-testid=support-autoriser]').click(); await page.waitForTimeout(500);
  const s = fenetre(page, 'support-fenetre');
  check(await s.count() === 1 && await s.locator('.dz-l3-seg button').count() === 3, 'RG16 « Autoriser… » ouvre « Autoriser le support BEMEXO » (1 heure, 24 heures, 7 jours)');
  await s.locator('.dz-l3-seg button', { hasText: '7 jours' }).click();
  await capture(page, 'impl-RG16');
  const g0 = req(/rpc\/support_grant/);
  await s.locator('[data-testid=support-grant]').click(); await page.waitForTimeout(800);
  check(req(/rpc\/support_grant/) === g0 + 1, 'RG16 « Autoriser 7 jours » appelle la RPC support_grant (même appel qu’en v1)');
  if (await s.count()) check(await fermerEchap(page, 'support-fenetre'), 'RG16 Échap ferme la fenêtre du support');
  // Enregistrer : même écriture (update_company_info)
  const e0 = req(/rpc\/update_company_info/);
  await f.locator('.bt-set-save').click(); await page.waitForTimeout(900);
  check(req(/rpc\/update_company_info/) === e0 + 1, 'RG01 « Enregistrer » appelle update_company_info (saveCompanySettings, comme en v1)');
  if (await f.count()) await fermerX(page, 'reglages-v2');
  await reglages(page);
  check(await fermerX(page, 'reglages-v2'), 'RG01 ✕ ferme le panneau');
  await reglages(page); check(await fermerEchap(page, 'reglages-v2'), 'RG01 Échap ferme le panneau');
  check(erreurs.length === 0, `RG01 aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}
await largeurs('RG01 / XM08 Réglages', ouvreur(reglages, (p) => mobileMenu(p, 'Réglages de l')), 'reglages-v2', { pleinEcran: true, tel: 'impl-XM08', prep: { kiosque: true } });

// ═════ RG07 à RG11 · Borne de pointage ═══════════════════════════════════════════════════════════════════════════════
{
  preparer({ kiosque: true });
  const { page, ctx, erreurs } = await sim.page({ ui: 2 });
  await routes(ctx);
  await plus(page, 'bar-kiosk'); await page.waitForTimeout(800);
  const f = fenetre(page, 'borne-v2');
  check(await f.count() === 1, 'RG07 Plus ⋯ › Borne ouvre le panneau v2 « Borne de pointage »');
  check(/Aucune tablette reliée/.test(await f.locator('[data-testid=ka-status-text]').innerText()), 'RG07 état « Aucune tablette reliée »');
  check((await f.locator('[data-testid=ka-code]').innerText()).replace(/\D/g, '') === '482913', 'RG07 le code de secours vient de la fonction kiosk (create_pairing), comme en v1');
  await capture(page, 'impl-RG07');
  await f.locator('[data-testid=kf-head]').click().catch(() => {}); await page.waitForTimeout(300);
  await f.locator('[data-testid=kf-enable]').click().catch(() => {}); await page.waitForTimeout(300);
  check(await f.locator('[data-testid=kf-confirm]').count() === 1, 'RG11 « Activer le QR fixe… » demande confirmation avant (même confirmation qu’en v1)');
  await capture(page, 'impl-RG11');
  check(await fermerX(page, 'borne-v2'), 'RG07 ✕ ferme le panneau');
  await plus(page, 'bar-kiosk'); check(await fermerEchap(page, 'borne-v2'), 'RG07 Échap ferme le panneau');
  check(writes((x) => x.t === '/functions/v1/kiosk' && x.action === 'cancel_pairing') >= 1, 'RG07 fermer périme le code (cancel_pairing, comme en v1)');
  check(erreurs.length === 0, `RG07 aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
}
{
  preparer({ kiosque: true, tablette: true });
  const { page, ctx } = await sim.page({ ui: 2 });
  await routes(ctx);
  await plus(page, 'bar-kiosk'); await page.waitForTimeout(900);
  const f = fenetre(page, 'borne-v2');
  check(/Tablette reliée — vue il y a 20 min/.test(await f.locator('[data-testid=ka-status-text]').innerText()), 'RG09 « Tablette reliée — vue il y a 20 min »');
  await capture(page, 'impl-RG09');
  await f.locator('[data-testid=ka-disconnect]').click(); await page.waitForTimeout(500);
  const q = fenetre(page, 'ka-disconnect-confirm');
  check(await q.count() === 1 && await q.locator('.dz-fenetre__titre').innerText() === 'Déconnecter la tablette ?', 'RG10 « Déconnecter la tablette » ouvre la question en fenêtre');
  await capture(page, 'impl-RG10');
  check(await fermerEchap(page, 'ka-disconnect-confirm') && await f.count() === 1, 'RG10 Échap ferme la question, le panneau reste (rien n’est envoyé)');
  check(writes((x) => x.action === 'revoke') === 0, 'RG10 aucune déconnexion sans confirmation');
  await f.locator('[data-testid=ka-disconnect]').click(); await page.waitForTimeout(400);
  await fenetre(page, 'ka-disconnect-confirm').locator('[data-testid=ka-disconnect-yes]').click(); await page.waitForTimeout(900);
  check(writes((x) => x.action === 'revoke') === 1 && /Aucune tablette reliée/.test(await f.locator('[data-testid=ka-status-text]').innerText()), 'RG10 « Déconnecter » appelle kiosk revoke (comme « Oui, déconnecter » en v1), l’état suit');
  await ctx.close();
}
await largeurs('RG07 / XM05 Borne', ouvreur((p) => plus(p, 'bar-kiosk'), (p) => mobileMenu(p, 'Borne')), 'borne-v2', { pleinEcran: true, tel: 'impl-XM05', prep: { kiosque: true, tablette: true } });
{ // RG08 : arrivée par /admin#borne=…
  preparer({ kiosque: true, tablette: true });
  const { page, ctx: c2 } = await sim.page({ ui: 2 });
  await routes(c2);
  await page.goto('about:blank'); await page.goto(`http://localhost:${PORT}/admin?ui=2#borne=${"r".repeat(60)}`); await page.waitForTimeout(4000);
  const f = fenetre(page, 'associer-v2');
  check(await f.count() === 1, 'RG08 /admin#borne=… ouvre « Associer cette tablette ? » en fenêtre v2');
  check(await f.locator('[data-testid=kpc-choice]').count() === 4 && await f.locator('[data-testid=kpc-alive]').count() === 1, 'RG08 quatre codes à toucher et l’avertissement « la tablette actuelle est en service » (pair_lookup)');
  await capture(page, 'impl-RG08');
  check(await fermerX(page, 'associer-v2'), 'RG08 ✕ ferme la fenêtre');
  await c2.close();
}

// Intégration bureau v2 : la barre noire du planning 1a n'a plus la pastille « Essai · S'abonner » ; « S'abonner » est en tête de « Plus ⋯ » (même onSubscribe).
async function abonner(page) {
  if (!(await page.locator('button:visible', { hasText: /abonner/ }).count())) { await page.locator('[data-testid=bar-plus]:visible').first().click(); await page.waitForTimeout(300); }
  await page.locator('button:visible', { hasText: /abonner/ }).first().click();
}
// ═════ RG12 à RG15 · Abonnement (le paiement ne change pas : même fonction stripe-checkout) ═══════════════════════════
{
  preparer();
  const { page, ctx, erreurs } = await sim.page({ ui: 2 });
  await routes(ctx);
  await page.locator('.dzp-noire button', { hasText: 'S’abonner' }).or(page.locator('.dzp-noire button', { hasText: "S'abonner" })).first().click({ timeout: 3000 }).catch(async () => { await page.evaluate(() => window.dispatchEvent(new Event('x'))); });
  await page.waitForTimeout(900);
  const f = fenetre(page, 'subscribe-dialog');
  if (!(await f.count())) await abonner(page);
  await page.waitForTimeout(700);
  check(await fenetre(page, 'subscribe-dialog').count() === 1, 'RG12 « S’abonner » ouvre « Choisissez votre abonnement » (fenêtre v2)');
  check(await f.locator('.bt-sub-card').count() === 3 && await f.locator('.bt-sub-card.off').count() === 1 && await f.locator('.bt-sub-card.reco').count() === 1, 'RG12 trois forfaits lus en base : « trop petit » grisé, le recommandé en noir');
  await capture(page, 'impl-RG12');
  const s0 = writes((x) => x.m === 'FN' && /stripe-checkout/.test(x.t));
  await f.locator('.bt-sub-card.reco .bt-sub-btn').click(); await page.waitForTimeout(900);
  check(writes((x) => x.m === 'FN' && /stripe-checkout/.test(x.t)) === s0 + 1, 'RG12 « Choisir ce forfait » appelle la MÊME fonction stripe-checkout (paiement inchangé)');
  check(/Réponse inattendue du paiement/.test(await f.locator('.bt-sub-err').innerText().catch(() => '')), 'RG12 refus : sans adresse de paiement, le message d’erreur existant s’affiche');
  check(await fermerEchap(page, 'subscribe-dialog'), 'RG12 Échap ferme la fenêtre');
  check(erreurs.length === 0, `RG12 aucune erreur de page (${erreurs.join(' | ')})`);
  await ctx.close();
  preparer({ plans: false });
  const b = await sim.page({ ui: 2 }); await routes(b.ctx);
  await abonner(b.page); await b.page.waitForTimeout(800);
  check(await fenetre(b.page, 'subscribe-dialog').locator('.bt-sub-card').count() === 0, 'RG12 état vide : aucun forfait actif, aucune carte (rien d’inventé)');
  await b.ctx.close();
}
for (const [w, h, nom] of [[1440, 900, 'impl-RG13'], [390, 844, 'impl-XM12'], [834, 1112, null]]) { // RG13, XM12 : essai fini (blocage en aperçu / local)
  preparer({ essaiFini: true });
  const { page, ctx } = await sim.page({ ui: 2, largeur: w, hauteur: h, hasTouch: w < 1024, attente: '[data-testid=blocage-v2]' });
  await routes(ctx);
  await page.waitForTimeout(800);
  check(await page.locator('[data-testid=blocage-v2] h1').innerText() === 'Votre essai gratuit est terminé.' && await page.locator('[data-testid=blocage-v2] .bt-sub-card').count() === 3, `RG13 ${w} px : écran de blocage v2 (titre, trois forfaits)`);
  const hs = await hscroll(page);
  check(hs.doc <= 0 && hs.corps <= 0, `RG13 ${w} px : aucun défilement horizontal (page ${hs.doc} px)`);
  if (nom) await capture(page, nom);
  await ctx.close();
}
{ // RG15 : retour du paiement
  preparer();
  const { page, ctx } = await sim.page({ ui: 2 });
  await routes(ctx);
  await page.goto(`http://localhost:${PORT}/admin?ui=2&subscribed=1`); await page.waitForTimeout(1200);
  check(await page.locator('[data-testid=activation-v2]').count() === 1, 'RG15 ?subscribed=1 : « Activation de votre abonnement… » en v2 (même attente du statut)');
  await capture(page, 'impl-RG15');
  await ctx.close();
}

// ═════ RG17 · Mode support (bandeau) ═══════════════════════════════════════════════════════════════════════════════
{
  preparer();
  const { page, ctx } = await sim.page({ ui: 2 });
  await routes(ctx);
  await ctx.route('**/rest/v1/rpc/support_enter**', (r) => r.fulfill({ json: [{ company_id: CO }] }));
  await page.evaluate(([co]) => sessionStorage.setItem('bemexo-support', JSON.stringify({ staffId: 'u-admin', companyId: co, name: 'Entreprise Test', expiresAt: '2026-10-15T14:40:00Z' })), [CO]);
  await page.reload(); await page.waitForTimeout(2500);
  const b = page.locator('[data-testid=support-banner]');
  const fond = await b.evaluate((e) => getComputedStyle(e).backgroundColor).catch(() => '');
  check(await b.count() === 1 && fond === 'rgb(255, 194, 26)' && /lecture seule/.test(await b.innerText()), `RG17 bandeau « Mode support · lecture seule » en jaune (fond ${fond})`);
  await capture(page, 'impl-RG17');
  await ctx.close();
}

// ═════ v1 sans drapeau : aucune fenêtre v2 ═════════════════════════════════════════════════════════════════════════
{
  preparer({ kiosque: true });
  const { page, ctx } = await sim.page({ ui: 1 });
  await routes(ctx);
  await page.locator('[data-testid=bar-cost], [data-testid=menu-cost]').first().click().catch(() => {});
  await page.waitForTimeout(900);
  check(await page.locator('.dz-l3').count() === 0, 'v1 (?ui=1) : aucune fenêtre du lot 3 B (classe dz-l3) dans la page');
  const css = await page.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /dz-l3/.test(r.cssText)); } catch { return false; } }));
  check(!css, 'v1 : la feuille lot3b-v2.css n’est pas chargée (morceau différé)');
  await ctx.close();
}

console.log(`\n${ok} OK, ${ko} ÉCHEC`);
console.log(`personnes du banc : ${PERSONNES.length}`);
await sim.fermer();
process.exit(ko ? 1 : 0);
