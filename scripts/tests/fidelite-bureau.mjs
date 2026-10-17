// Preuve de FIDÉLITÉ du planning du bureau v2 (/admin?ui=2) à la planche du designer : mêmes données de démonstration, deux rendus côte à côte.
//   npm run build && node scripts/tests/fidelite-bureau.mjs out docs/design-brief/integration/captures-bureau 4421
//   SEULEMENT=<regex sur le nom d'image> n'en joue qu'une partie.
// 1. La planche (docs/design-brief/designer-bureau/…dc.html, DONNÉES NON FIABLES) est servie depuis son dossier, SANS RÉSEAU (React vient de node_modules), et on photographie l'écran voulu (PL01…).
// 2. L'implémentation (build `out/`) tourne sur la base SIMULÉE de bureau-sim.mjs (jeudi 15 octobre 2026, semaine S-42), horloge figée.
// 3. Une image « planche | implémentation » par écran (JPEG), puis des MESURES sur l'implémentation : cibles ≥ 40 px au pointeur / 44 px au toucher, texte ≥ 11 px,
//    contrastes (4,5:1 ; 3:1 pour le grand texte), contour de focus ≥ 2 px. Chaque contrôle imprime ✅ / ❌.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { demarrer, CHROME } from './bureau-sim.mjs';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [,, OUT = 'out', SH = 'docs/design-brief/integration/captures-bureau', PORT = '4421'] = process.argv;
const SEULEMENT = process.env.SEULEMENT ? new RegExp(process.env.SEULEMENT) : null;
// node_modules du dépôt (ou du dépôt parent quand on travaille dans un worktree imbriqué).
const NM = (() => { let d = RACINE; for (let i = 0; i < 6; i++) { if (fs.existsSync(path.join(d, 'node_modules/react/umd'))) return path.join(d, 'node_modules'); d = path.dirname(d); } return path.join(RACINE, 'node_modules'); })();
fs.mkdirSync(SH, { recursive: true });
const DESIGNER = path.join(RACINE, 'docs/design-brief/designer-bureau');
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };

// ── 1. La planche, hors réseau ──────────────────────────────────────────────
const srvPlanche = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const f = path.join(DESIGNER, p === '/' ? 'BEMEXO Bureau - Dossier.dc.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' });
    // Les contrôles d'intégrité des scripts de React (18.3.1 sur unpkg) ne vaudraient pas pour les fichiers du dépôt : retirés dans la COPIE servie.
    r.end(f.endsWith('support.js') ? fs.readFileSync(f, 'utf8').replace(/s\.integrity = [A-Za-z_]+;/g, '') : fs.readFileSync(f));
  } else { r.writeHead(404); r.end(); }
});
await new Promise((r) => srvPlanche.listen(Number(PORT) + 50, r));
const browser = await chromium.launch({ executablePath: CHROME });
const bloquees = [];
async function photographierPlanche(id) {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
  await ctx.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.startsWith(`http://localhost:${Number(PORT) + 50}`)) return r.continue();
    if (u.includes('react@18.3.1/umd/react.production')) return r.fulfill({ path: path.join(NM, 'react/umd/react.production.min.js'), contentType: 'text/javascript' });
    if (u.includes('react-dom@18.3.1/umd/react-dom.production')) return r.fulfill({ path: path.join(NM, 'react-dom/umd/react-dom.production.min.js'), contentType: 'text/javascript' });
    bloquees.push(u); return r.abort(); // aucune requête sortante
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${Number(PORT) + 50}/?ecran=${id}`); await p.waitForTimeout(2500);
  // Polices de production (public/fonts) : les largeurs de texte sont celles de l'application.
  await p.addStyleTag({ content: fs.readFileSync(path.join(RACINE, 'public/fonts/fonts.css'), 'utf8').replace(/url\(\/?fonts\//g, `url(file://${RACINE}/public/fonts/`) + ' div[style*="position:sticky"]{display:none!important}' });
  await p.waitForTimeout(500);
  const f = path.join(SH, `.planche-${id}.png`);
  const el = p.locator(`[id="${id}"] [data-bx]`).first();
  // Téléphone : le cadre dessiné a 10 px de liseré ; on ne garde que l'écran.
  const cible = /^(PM|XM|HM)/.test(id) ? el.locator(':scope > div').first() : el;
  await cible.screenshot({ path: f, animations: 'disabled' });
  await ctx.close(); return f;
}

// ── 2. Mesures sur l'implémentation ─────────────────────────────────────────
async function mesurer(page, nom, { tactile, racine }) {
  const r = await page.evaluate(({ tactile, racine }) => {
    const cible = tactile ? 44 : 40;
    const zone = document.querySelector(racine) || document.body;
    const visible = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 1 && b.height > 1 && !e.closest('.sr-only') && s.visibility !== 'hidden' && s.display !== 'none' && b.bottom > 0 && b.top < innerHeight; };
    const petites = [];
    zone.querySelectorAll('button, a[href], [role=button], input:not([type=hidden]), select, textarea').forEach((e) => {
      if (!visible(e)) return;
      const b = e.getBoundingClientRect();
      // Les cases à cocher de la sélection sont une partie d'une cible plus grande (la bulle, la ligne, l'en-tête) : leur zone de toucher est celle du parent.
      if (e.matches('.dzp-case-sel, .dzp-m-case')) return;
      // La zone cliquable peut dépasser le dessin (pseudo-élément ::after de 40 / 44 px) : c'est elle qui compte.
      const ps = getComputedStyle(e, '::after'); const pw = ps.content !== 'none' && ps.position === 'absolute' ? Math.min(parseFloat(ps.width) || 0, parseFloat(ps.height) || 0) : 0;
      if (Math.max(Math.min(b.width, b.height), pw) < cible - 0.5) petites.push(`${(e.textContent || e.getAttribute('aria-label') || e.className).trim().slice(0, 28)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    });
    const textes = [];
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const rgba = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
    const fond = (e) => { let n = e; let acc = null; while (n && n.nodeType === 1) { const c = rgba(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { if (c.a >= 0.99) return c.c; acc = acc || c; } n = n.parentElement; } return acc ? acc.c : [255, 255, 255]; };
    const trop = []; const bas = [];
    zone.querySelectorAll('*').forEach((e) => {
      if (!visible(e)) return;
      const aTexte = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (!aTexte) return;
      const s = getComputedStyle(e); const fs = parseFloat(s.fontSize);
      if (fs < 10.95) bas.push(`${e.textContent.trim().slice(0, 24)} ${fs}px`);
      const fg = rgba(s.color); if (!fg) return;
      const bg = fond(e); const op = parseFloat(s.opacity);
      const f = fg.c.map((v, i) => Math.round(v * fg.a * op + bg[i] * (1 - fg.a * op)));
      const l1 = lum(f), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const grand = fs >= 24 || (fs >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
      if (ratio < (grand ? 3 : 4.5)) trop.push(`${e.textContent.trim().slice(0, 24)} ${ratio.toFixed(2)}:1 (${Math.round(fs)}px)`);
      textes.push(1);
    });
    return { petites, bas, trop, n: textes.length };
  }, { tactile, racine });
  check(r.petites.length === 0, `${nom} : cibles ≥ ${tactile ? 44 : 40} px${r.petites.length ? ` — hors règle : ${r.petites.slice(0, 6).join(' | ')}` : ''}`);
  check(r.bas.length === 0, `${nom} : texte ≥ 11 px${r.bas.length ? ` — ${r.bas.slice(0, 5).join(' | ')}` : ''}`);
  check(r.trop.length === 0, `${nom} : contrastes (${r.n} textes lus)${r.trop.length ? ` — sous la règle : ${r.trop.slice(0, 6).join(' | ')}` : ''}`);
}
async function mesurerFocus(page, nom) {
  const r = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    r.push(await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); return { t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20), w: parseFloat(s.outlineWidth), st: s.outlineStyle }; }));
  }
  const vus = r.filter(Boolean);
  const sans = vus.filter((x) => !(x.w >= 2 && x.st !== 'none'));
  check(vus.length >= 4 && sans.length === 0, `${nom} : contour de focus ≥ 2 px sur ${vus.length} éléments tabulés${sans.length ? ` — sans contour : ${sans.map((x) => x.t).join(' | ')}` : ''}`);
}

// ── 3. Composition « planche | implémentation » ─────────────────────────────
async function composer(nom, fPlanche, fImpl) {
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 1400 } });
  const p = await ctx.newPage();
  const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  await p.setContent(`<body style="margin:0;background:#222;font-family:sans-serif;color:#fff"><div style="display:flex;gap:12px;align-items:flex-start;padding:10px">
    <div><div style="font:700 13px monospace;margin-bottom:4px">PLANCHE</div><img id="a" src="${b64(fPlanche)}" style="display:block"></div>
    <div><div style="font:700 13px monospace;margin-bottom:4px">IMPLÉMENTATION</div><img id="b" src="${b64(fImpl)}" style="display:block"></div></div></body>`);
  await p.waitForTimeout(200);
  const dims = await p.evaluate(() => [document.getElementById('a').naturalWidth, document.getElementById('a').naturalHeight, document.getElementById('b').naturalWidth, document.getElementById('b').naturalHeight]);
  // Les grandes images sont réduites (largeur totale ≤ 2 000 px) : une image lisible mais légère.
  const k = Math.min(1, 1960 / (dims[0] + dims[2]));
  await p.addStyleTag({ content: `#a{width:${Math.round(dims[0] * k)}px}#b{width:${Math.round(dims[2] * k)}px}` });
  const largeur = Math.round((dims[0] + dims[2]) * k) + 44; const hauteur = Math.round(Math.max(dims[1], dims[3]) * k) + 50;
  await p.setViewportSize({ width: largeur, height: hauteur });
  await p.waitForTimeout(100);
  const sortie = path.join(SH, `${nom}.jpg`);
  await p.screenshot({ path: sortie, type: 'jpeg', quality: 68 });
  await ctx.close();
  const ko_ = fs.statSync(sortie).size / 1024;
  check(ko_ < 400, `${nom}.jpg : image de ${Math.round(ko_)} ko`);
}

// ── 4. Les écrans ──────────────────────────────────────────────────────────
const sim = await demarrer({ out: OUT, port: Number(PORT), base: process.env.BASE || null });
const CAS = [];
const cas = (nom, planche, taille, prepare, opts = {}) => CAS.push({ nom, planche, taille, prepare, opts });
const clic = (page, sel) => page.locator(sel).first().click();
const attendre = (page, ms = 500) => page.waitForTimeout(ms);
const DESK = { largeur: 1440, hauteur: 900 };

cas('PL01-semaine-1440', 'PL01', { ...DESK, hauteur: 1180 }, async () => {}, { mesures: true, focus: true });
cas('PL01-semaine-1024', 'PL01', { largeur: 1024, hauteur: 768 }, async () => {}, { mesures: true });
cas('PL02-replie-legende', 'PL02', { ...DESK, hauteur: 1180 }, async (p) => { await clic(p, '.dzp-replier'); await attendre(p); await clic(p, '[data-testid=legende-ouvrir]'); await p.mouse.move(5, 5); await p.evaluate(() => window.scrollTo(0, 99999)); await attendre(p, 300); });
cas('PL04-semaine-cloturee', 'PL04', { ...DESK, hauteur: 1180 }, async (p) => { await p.getByRole('button', { name: 'Semaine précédente' }).click(); await attendre(p, 700); await p.getByRole('button', { name: 'Semaine précédente' }).click(); await attendre(p, 1200); });
cas('PL05-plus', 'PL05', DESK, async (p) => { await clic(p, '[data-testid=bar-plus]'); await attendre(p); });
cas('PL06-compte', 'PL06', DESK, async (p) => { await clic(p, '.dzp-compte__btn'); await attendre(p); });
cas('PL13-ajouter', 'PL13', DESK, async (p) => { await p.locator('.dzp-td', { has: p.locator('.dzp-vide') }).nth(0).locator('.dzp-case').click(); await attendre(p, 700); });
cas('PL17-fiche', 'PL17', DESK, async (p) => { await p.locator('[data-bub="a-jeu2"] .dzp-prise').click(); await attendre(p, 700); }, { mesures: true, racine: '[data-testid=fiche-intervention]' });
cas('PL22-deplacer', 'PL22', { ...DESK, hauteur: 1500 }, async (p) => {
  const b = p.locator('[data-bub="a-lun2"] .dzp-prise'); const bb = await b.boundingBox();
  const cible = p.locator('.dzp-td').nth(25); const cb = await cible.boundingBox();
  await p.mouse.move(bb.x + 40, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 55, bb.y + 25, { steps: 4 }); await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 12 }); await attendre(p, 300);
}, { fin: async (p) => { await p.mouse.up(); } });
cas('PL23-copier', 'PL23', { ...DESK, hauteur: 1500 }, async (p) => {
  const b = p.locator('[data-bub="a-lun1"] .dzp-prise'); const bb = await b.boundingBox();
  const cible = p.locator('.dzp-td').nth(27); const cb = await cible.boundingBox();
  await p.mouse.move(bb.x + 40, bb.y + 20); await p.keyboard.down('Control'); await p.mouse.down(); await p.mouse.move(bb.x + 55, bb.y + 25, { steps: 4 }); await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 12 }); await attendre(p, 300);
}, { fin: async (p) => { await p.keyboard.press('Escape'); await p.mouse.up(); await p.keyboard.up('Control'); } });
cas('PL26-glisser-client', 'PL26', { ...DESK, hauteur: 1500 }, async (p) => {
  await p.getByRole('button', { name: 'Clients', exact: true }).click(); await attendre(p, 500);
  const l = p.locator('.dzp-client').nth(1); const lb = await l.boundingBox();
  const cible = p.locator('.dzp-td').nth(26); const cb = await cible.boundingBox();
  await p.mouse.move(lb.x + 100, lb.y + 20); await p.mouse.down(); await p.mouse.move(lb.x + 120, lb.y + 30, { steps: 4 }); await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 12 }); await attendre(p, 300);
}, { fin: async (p) => { await p.keyboard.press('Escape'); await p.mouse.up(); } });
cas('PL27-client-refuse-absence', 'PL27', { ...DESK, hauteur: 1500 }, async (p) => {
  await p.getByRole('button', { name: 'Clients', exact: true }).click(); await attendre(p, 500);
  const l = p.locator('.dzp-client').nth(1); const lb = await l.boundingBox();
  const cible = p.locator('tbody tr').nth(3).locator('.dzp-td').nth(3); const cb = await cible.boundingBox();
  await p.mouse.move(lb.x + 100, lb.y + 20); await p.mouse.down(); await p.mouse.move(lb.x + 120, lb.y + 30, { steps: 4 }); await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 12 }); await attendre(p, 300);
}, { fin: async (p) => { await p.keyboard.press('Escape'); await p.mouse.up(); } });
cas('PL31-selection', 'PL31', DESK, async (p) => { await clic(p, '[data-testid=bar-select]'); await attendre(p, 400); await p.locator('[data-bub="a-jeu2"] .dzp-prise').click({ force: true }); await p.locator('[data-bub="b-jeu2"] .dzp-prise').click({ force: true }); await attendre(p, 300); });
cas('PL32-selection-verrou', 'PL32', DESK, async (p) => { await clic(p, '[data-testid=bar-select]'); await attendre(p, 400); await p.locator('[data-bub="a-lun1"] .dzp-prise').click({ force: true }); await attendre(p, 300); });
cas('PL34-statut', 'PL34', DESK, async (p) => { await p.locator('.dzp-nom-btn').nth(1).click(); await attendre(p, 700); });
cas('PL40-imprimer', 'PL40', DESK, async (p) => { await clic(p, '[data-testid=bar-print]'); await attendre(p, 500); });
cas('PM01-jour-390', 'PM01', { largeur: 390, hauteur: 844, tactile: true }, async () => {}, { mesures: true, racine: '.dzp-mobile', tactile: true });
cas('PM03-menu-390', 'PM03', { largeur: 390, hauteur: 844, tactile: true }, async (p) => { await p.getByRole('button', { name: 'Menu', exact: true }).click(); await attendre(p, 700); }, { mesures: true, racine: '.dzp-mm', tactile: true });
cas('PM04-legende-390', 'PM04', { largeur: 390, hauteur: 844, tactile: true }, async (p) => { await p.getByRole('button', { name: 'Menu', exact: true }).click(); await attendre(p, 600); await clic(p, '[data-testid=mm-legende]'); await p.evaluate(() => document.querySelector('.dzp-mm__corps')?.scrollTo(0, 9999)); await attendre(p, 300); });
cas('PM05-intervention-390', 'PM05', { largeur: 390, hauteur: 844, tactile: true }, async (p) => { await p.locator('.dzp-m-bulle').nth(1).click(); await attendre(p, 700); });
cas('PM09-selection-390', 'PM09', { largeur: 390, hauteur: 844, tactile: true }, async (p) => { await clic(p, '[data-testid=m-select]'); await attendre(p, 400); await p.locator('.dzp-m-bulle').nth(1).click({ force: true }); await attendre(p, 300); });

for (const c of CAS) {
  if (SEULEMENT && !SEULEMENT.test(c.nom)) continue;
  sim.reinitialiser();
  const { page, ctx, erreurs } = await sim.page({ ui: 2, largeur: c.taille.largeur, hauteur: c.taille.hauteur, hasTouch: !!c.taille.tactile, attente: c.taille.tactile ? '.dzp-m-carte' : '.dzp-table .dzp-bulle' });
  await c.prepare(page);
  const f = path.join(SH, `.impl-${c.nom}.png`);
  await page.screenshot({ path: f });
  if (c.opts.mesures) await mesurer(page, c.nom, { tactile: !!c.opts.tactile, racine: c.opts.racine || '.dzp-bureau-desk' });
  if (c.opts.fin) await c.opts.fin(page);
  if (c.opts.focus) { await page.mouse.move(5, 5); await mesurerFocus(page, c.nom); }
  check(erreurs.length === 0, `${c.nom} : aucune erreur de page${erreurs.length ? ` (${erreurs[0]})` : ''}`);
  await ctx.close();
  try {
    const fp = await photographierPlanche(c.planche);
    await composer(c.nom, fp, f);
  } catch (e) { check(false, `${c.nom} : planche ${c.planche} — ${e.message}`); }
}
// ── 5. PARCOURS : ce que fait le planning v2 (mêmes écritures et mêmes fenêtres que l'ancien), sur la base simulée ─────────────────────
async function parcours() {
  console.log('\n══ PARCOURS ══');
  const w0 = () => sim.log.writes.length;
  const ecrits = (n, t) => sim.log.writes.slice(n).filter((x) => x.t === t);
  const NEUF = async (o = {}) => { sim.reinitialiser(); return sim.page({ ui: 2, largeur: 1440, hauteur: 1500, ...o }); };

  // P1 menus, Échap, fenêtres
  {
    const { page: p, ctx, erreurs } = await NEUF();
    await clic(p, '[data-testid=bar-plus]'); await attendre(p, 300);
    check(await p.locator('[data-testid=menu-plus]').isVisible(), 'P1 « Plus ⋯ » ouvre le menu');
    check((await p.locator('[data-testid=menu-plus]').innerText()).includes('Coût chantiers'), 'P1 « Plus ⋯ » contient « Coût chantiers »');
    await p.keyboard.press('Escape'); await attendre(p, 200);
    check(await p.locator('[data-testid=menu-plus]').count() === 0, 'P1 Échap referme « Plus ⋯ »');
    await clic(p, '.dzp-compte__btn'); await attendre(p, 200);
    check(await p.locator('[data-testid=menu-compte]').isVisible() && (await p.locator('[data-testid=menu-compte]').innerText()).includes('Réglages de l\'entreprise') && (await p.locator('[data-testid=menu-compte]').innerText()).includes('Déconnexion'), 'P1 menu du compte : Réglages de l’entreprise et Déconnexion');
    check(!/Formations|e-mail/i.test(await p.locator('[data-testid=menu-compte]').innerText()), 'P1 menu du compte : plus de Formations ni d’« Envoyer par e-mail » (un seul accès : « Plus ⋯ »)');
    await p.keyboard.press('Escape'); await attendre(p, 200);
    check(await p.locator('[data-testid=menu-compte]').count() === 0, 'P1 Échap referme le menu du compte');
    await clic(p, '[data-testid=bar-plus]'); await clic(p, '[data-testid=bar-cost]'); await attendre(p, 800);
    check(await p.locator('[data-testid=cr-hours]').count() === 1 || await p.locator('[role=dialog]').count() >= 1, 'P1 « Coût chantiers » ouvre sa fenêtre');
    await p.keyboard.press('Escape'); await attendre(p, 300);
    await p.getByRole('button', { name: 'Statistiques', exact: true }).click(); await attendre(p, 1000);
    check(await p.locator('[data-testid=team-stats]').count() === 1, 'P1 l’onglet « Statistiques » ouvre les statistiques de l’équipe');
    await p.keyboard.press('Escape'); await attendre(p, 300);
    await p.getByRole('button', { name: /^Salariés/ }).click(); await attendre(p, 700);
    const sal = await p.locator('[role=dialog]').first().innerText();
    check(/Nouveau salarié/.test(sal) && /Importer/.test(sal) && /Demandes de congé/.test(sal), 'P1 « Salariés » : nouveau salarié, importer, demandes de congé');
    check(await p.locator('[data-testid=pending-invitations]').count() === 1, 'P1 « Salariés » porte les invitations en attente (plus de ligne sous la barre)');
    check(await p.locator('[data-testid=salaries-trainings]').count() === 0, 'P1 « Salariés » : plus de « Formations » (doublon retiré)');
    check(await p.locator('[data-testid=pending-invitations]').count() === 1 && await p.locator('.dzp-semaine [data-testid=pending-invitations]').count() === 0, 'P1 aucune ligne d’invitations sous la barre');
    await p.keyboard.press('Escape'); await attendre(p, 300);
    await p.getByRole('button', { name: /^Réserves/ }).click(); await attendre(p, 800);
    check(await p.locator('[data-testid=reserves-report]').count() === 1, 'P1 « Réserves » ouvre le registre');
    await p.keyboard.press('Escape'); await attendre(p, 300);
    await clic(p, '[data-testid=bar-export]'); await attendre(p, 800);
    check(await p.locator('[data-testid=team-export]').count() === 1, 'P1 « Exporter » ouvre l’export de l’équipe');
    await p.keyboard.press('Escape'); await attendre(p, 300);
    await clic(p, '[data-testid=bar-print]'); await attendre(p, 400);
    check(await p.locator('[data-testid=print-menu]').isVisible(), 'P1 l’icône imprimer ouvre le menu d’impression');
    await p.keyboard.press('Escape'); await attendre(p, 200);
    check(erreurs.length === 0, `P1 aucune erreur de page${erreurs.length ? ` (${erreurs[0]})` : ''}`);
    await ctx.close();
  }

  // P2 bandeau : panneaux, replier / déplier (gardé), semaine
  {
    const { page: p, ctx } = await NEUF();
    await clic(p, '[data-testid=stat-waiting]'); await attendre(p, 400);
    check(await p.locator('[data-testid=relance-panel]').isVisible() && await p.locator('[data-testid=relance-row]').count() >= 3, 'P2 « À relancer » ouvre la liste des salariés à relancer');
    await p.keyboard.press('Escape'); await attendre(p, 200);
    check(await p.locator('[data-testid=relance-panel]').count() === 0, 'P2 Échap referme la liste');
    await clic(p, '[data-testid=stat-docs]'); await attendre(p, 800);
    check(/pièces jointes/i.test(await p.locator('.dzp-panneau-stat').innerText()), 'P2 « Pièces » ouvre le détail des pièces');
    await p.keyboard.press('Escape'); await attendre(p, 200);
    await clic(p, '.dzp-replier'); await attendre(p, 300);
    check(await p.locator('[data-testid=bandeau-replie]').isVisible() && (await p.locator('[data-testid=bandeau-replie]').boundingBox()).height <= 60, 'P2 « Replier ▴ » : le bandeau tient sur une ligne');
    await p.reload(); await p.waitForSelector('.dzp-table .dzp-bulle', { timeout: 20000 }); await attendre(p, 1500);
    check(await p.locator('[data-testid=bandeau-replie]').count() === 1, 'P2 le choix replié est gardé après rechargement');
    await clic(p, '.dzp-deplier'); await attendre(p, 300);
    check(await p.locator('[data-testid=bandeau]').count() === 1, 'P2 « Déplier ▾ » rend les 5 tuiles');
    const sem = async () => (await p.locator('.dzp-semaine__s').innerText()).trim();
    await p.getByRole('button', { name: 'Semaine précédente' }).click(); await attendre(p, 700);
    check(await sem() === 'S-41', `P2 ← : semaine précédente (${await sem()})`);
    await p.getByRole('button', { name: 'Semaine suivante' }).click(); await attendre(p, 500);
    await p.getByRole('button', { name: 'Semaine suivante' }).click(); await attendre(p, 700);
    check(await sem() === 'S-43', `P2 → : semaine suivante (${await sem()})`);
    await clic(p, '.dzp-pilule--noire'); await attendre(p, 600);
    check(await sem() === 'S-42' && /SEMAINE ACTUELLE/i.test(await p.locator('.dzp-kicker').first().innerText()), 'P2 « Aujourd’hui » revient à la semaine actuelle');
    await ctx.close();
  }

  // P3 fiche : enregistrer, supprimer, annuler
  {
    const { page: p, ctx } = await NEUF();
    let w = w0();
    await p.locator('[data-bub="a-ven"] .dzp-prise').click(); await attendre(p, 600);
    check(await p.locator('[data-testid=fiche-intervention]').isVisible(), 'P3 cliquer une bulle ouvre la fiche (panneau latéral)');
    await p.locator('.dzp-fiche__note').fill('code portail 4321');
    await p.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await attendre(p, 900);
    const up = ecrits(w, 'planning').filter((x) => x.m === 'PATCH');
    check(up.length === 1 && up[0].ids[0] === 'a-ven' && up[0].body.notes === 'code portail 4321', `P3 « Enregistrer » : un PATCH planning avec la note (${JSON.stringify(up.map((x) => x.body))})`);
    check(await p.locator('[data-testid=fiche-intervention]').count() === 0, 'P3 la fiche se referme après l’enregistrement');
    w = w0();
    await p.locator('[data-bub="a-ven"] .dzp-prise').click(); await attendre(p, 600);
    await clic(p, '[data-testid=edit-delete]'); await attendre(p, 1000);
    const del = ecrits(w, 'planning').filter((x) => x.m === 'DELETE');
    check(del.length === 1 && del[0].ids[0] === 'a-ven', 'P3 « Supprimer » : un DELETE de la case seule');
    check(await p.locator('[data-testid=undo-card]').isVisible(), 'P3 la carte « Annuler » apparaît');
    await p.click('[data-testid=undo-close]'); await attendre(p, 200);
    await ctx.close();
  }

  // P4 sélection
  {
    const { page: p, ctx } = await NEUF();
    await clic(p, '[data-testid=bar-select]'); await attendre(p, 300);
    check(await p.locator('[data-testid=sel-bar]').isVisible() && /0 sélectionnée/.test(await p.locator('[data-testid=sel-count]').innerText()), 'P4 « Sélectionner » : la barre du bas, 0 sélectionnée');
    check(await p.locator('[data-testid=sel-delete]').isDisabled(), 'P4 « Supprimer (0) » est inactif');
    await p.locator('[data-bub="a-jeu2"] .dzp-prise').click({ force: true }); await attendre(p, 200);
    check(/1 sélectionnée/.test(await p.locator('[data-testid=sel-count]').innerText()), 'P4 cocher une intervention libre : 1 sélectionnée');
    const w = w0();
    await p.locator('[data-bub="a-lun1"] .dzp-prise').click({ force: true }); await attendre(p, 300);
    check(/1 sélectionnée/.test(await p.locator('[data-testid=sel-count]').innerText()) && (await p.locator('[data-bub="a-lun1"]').getAttribute('data-sel')) === 'lock', 'P4 une intervention aux heures envoyées est verrouillée (« – »), pas cochée');
    check(ecrits(w, 'planning').length === 0, 'P4 aucune écriture pendant la sélection');
    await clic(p, '[data-testid=sel-done]'); await attendre(p, 300);
    check(await p.locator('[data-testid=sel-bar]').count() === 0, 'P4 « Terminer » ferme la sélection');
    await ctx.close();
  }

  // P5 glisser : client posé / refusé, déplacement refusé, copie
  {
    const { page: p, ctx } = await NEUF();
    const lignes = p.locator('tbody tr');
    const cellule = (lig, j) => lignes.nth(lig).locator('.dzp-td').nth(j);
    const centre = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height - 14 }; };
    const glisser = async (de, vers, { touche = null, apres = null } = {}) => {
      const a = await de.boundingBox(); const z = await centre(vers);
      await p.mouse.move(a.x + a.width / 2, a.y + 18); if (touche) await p.keyboard.down(touche); await p.mouse.down();
      await p.mouse.move(a.x + a.width / 2 + 12, a.y + 24, { steps: 4 }); await p.mouse.move(z.x, z.y, { steps: 14 }); await attendre(p, 250);
      const vu = apres ? await apres() : null; await p.mouse.up(); if (touche) await p.keyboard.up(touche); await attendre(p, 900); return vu;
    };
    await clic(p, '[data-testid=bar-select]'); await clic(p, '[data-testid=sel-done]');
    let w = w0();
    await p.getByRole('button', { name: 'Clients', exact: true }).click(); await attendre(p, 400);
    await glisser(p.locator('.dzp-client').nth(1), cellule(2, 5));
    const posts = ecrits(w, 'planning').filter((x) => x.m === 'POST');
    check(posts.length === 1 && posts[0].rows[0].user_id === 'u-camille' && posts[0].rows[0].work_date === '2026-10-17', `P5 un client lâché sur une case libre : un POST planning (${posts.length})`);
    w = w0();
    await p.getByRole('button', { name: 'Clients', exact: true }).click(); await attendre(p, 400);
    const vu = await glisser(p.locator('.dzp-client').nth(1), cellule(3, 1), { apres: async () => p.locator('.dzp-cible-msg').first().innerText().catch(() => '') });
    check(/Refusé : absent/.test(vu || ''), `P5 un client au-dessus d’une absence : « ${vu} » avant le lâcher`);
    check(ecrits(w, 'planning').length === 0, 'P5 …et rien n’est écrit au lâcher');
    w = w0();
    await glisser(p.locator('[data-bub="a-lun1"] .dzp-prise'), cellule(0, 5));
    check(ecrits(w, 'planning').length === 0, 'P5 une intervention aux heures envoyées ne se déplace pas (zéro écriture)');
    w = w0();
    await glisser(p.locator('[data-bub="a-ven"] .dzp-prise'), cellule(1, 6), { touche: 'Control' });
    const cp = ecrits(w, 'planning');
    check(cp.length >= 1 && cp[0].m === 'POST' && cp[0].rows[0].user_id === 'u-bruno', `P5 Ctrl + glisser : une COPIE (POST) chez Bruno (${cp.map((x) => x.m).join(', ')})`);
    await ctx.close();
  }

  // P6 téléphone
  {
    const { page: p, ctx, erreurs } = await sim.page({ ui: 2, largeur: 390, hauteur: 844, hasTouch: true, attente: '.dzp-m-carte' });
    const titre = async () => (await p.locator('.dzp-m-titre-jour').innerText()).trim().toLowerCase();
    check(/jeudi 15 octobre/.test(await titre()), `P6 le jour affiché est aujourd’hui (${await titre()})`);
    await p.locator('.dzp-m-jour').nth(0).click(); await attendre(p, 400);
    check(/lundi 12 octobre/.test(await titre()), `P6 toucher « Lun 12 » change de jour (${await titre()})`);
    await p.locator('.dzp-m-jour').nth(3).click(); await attendre(p, 300);
    await p.getByRole('button', { name: 'Menu', exact: true }).click(); await attendre(p, 600);
    const menu = await p.locator('.dzp-mm').innerText();
    for (const l of ['Salariés', 'Chantiers', 'Demandes de congé', 'Réserves de chantier', 'Coût chantiers', 'Statistiques', 'Exporter', 'Sélectionner des interventions', 'Réglages de l\'entreprise', 'Légende', 'Déconnexion']) check(menu.includes(l), `P6 le menu ☰ contient « ${l} »`);
    await clic(p, '[data-testid=mm-legende]'); await attendre(p, 200);
    check(await p.locator('[data-testid=legende-mobile]').isVisible(), 'P6 « Légende » se déplie dans le menu ☰ (nouveau, PM04)');
    await p.keyboard.press('Escape'); await attendre(p, 500);
    const w = w0();
    await p.locator('.dzp-m-bulle').nth(1).click(); await attendre(p, 600);
    check(await p.locator('[data-testid=fiche-intervention]').isVisible(), 'P6 toucher une bulle ouvre la fiche (feuille du bas)');
    await p.keyboard.press('Escape'); await attendre(p, 300);
    await clic(p, '[data-testid=m-select]'); await attendre(p, 300);
    check(await p.locator('[data-testid=sel-bar]').isVisible() && await p.locator('[data-testid=sel-all-day]').isVisible() && !(await p.locator('[data-testid=sel-all]').isVisible()), 'P6 « Sélectionner » : « Tout sélectionner » concerne le JOUR affiché');
    check(ecrits(w, 'planning').length === 0, 'P6 aucune écriture en lisant');
    check(erreurs.length === 0, `P6 aucune erreur de page${erreurs.length ? ` (${erreurs[0]})` : ''}`);
    await ctx.close();
  }
}
if (!SEULEMENT || SEULEMENT.test('PARCOURS')) await parcours();
check(bloquees.length === 0 || bloquees.every((u) => /fonts\.(googleapis|gstatic)|unpkg/.test(u)), `la planche ne sort pas sur le réseau (${bloquees.length} requête(s) refusée(s))`);
for (const f of fs.readdirSync(SH)) if (f.startsWith('.')) fs.unlinkSync(path.join(SH, f));
console.log(`\n${ok} ✅ / ${ko} ❌`);
await sim.fermer(); srvPlanche.close(); await browser.close();
process.exit(ko ? 1 : 0);
