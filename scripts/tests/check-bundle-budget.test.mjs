// Test du script de budgets de poids (lot 5 « site rapide 1 ») : node --test scripts/tests/check-bundle-budget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { check, loadBudgets, parseTable, report } from '../check-bundle-budget.mjs';

// Tableau de « next build » tel quel (état d'avant le lot : /admin 766 kB, /poseur 544 kB).
const TABLE = fs.readFileSync(new URL('./fixtures/next-build-table.txt', import.meta.url), 'utf8');
const budgets = loadBudgets();
// Budgets d'essai maîtrisés : les vrais évoluent à chaque lot.
const B = {
  default: 150,
  shared: { mesure: 88, max: 95 },
  groupes: { '/apercu/*': { max: 300 } },
  routes: { '/': { mesure: 134, max: 139 }, '/admin': { mesure: 766, max: 776, objectif: 350 }, '/poseur': { mesure: 544, max: 554 }, '/borne': { mesure: 163, max: 168 } },
};

test('lecture : 27 routes, tailles en kB (B, kB, MB), préfixes ┌ ├ └, robots et sitemap ignorés', () => {
  const t = parseTable(TABLE);
  assert.equal(Object.keys(t.routes).length, 27);
  assert.equal(t.routes['/'], 134);
  assert.equal(t.routes['/admin'], 766);
  assert.equal(t.routes['/poseur'], 544);
  assert.equal(t.routes['/support'], 148);
  assert.equal(t.routes['/landing'], 90.8);
  assert.equal(t.routes['/suisse/enregistrement-temps-de-travail'], 96.8);
  assert.ok(!('/robots.txt' in t.routes) && !('/sitemap.xml' in t.routes));
});

test('lecture : le partagé est lu à part, les sous-lignes « chunks/… » et la légende sont ignorées', () => {
  const t = parseTable(TABLE);
  assert.equal(t.shared, 87.8);
  assert.ok(!Object.keys(t.routes).some((r) => r.includes('chunks')));
});

test('lecture : unités B, kB et MB, et sauts de ligne Windows', () => {
  const t = parseTable('┌ ○ /a   210 B   500 B\r\n├ ○ /b   1.41 kB   2.5 MB\r\n└ ƒ /c/[id]   0 B   120 kB\r\n+ First Load JS shared by all   1.2 MB\r\n');
  assert.deepEqual(t.routes, { '/a': 0.5, '/b': 2500, '/c/[id]': 120 });
  assert.equal(t.shared, 1200);
});

test('lecture : les codes de couleur du terminal ne gênent pas', () => {
  const colore = TABLE.split('\n').map((l) => `\x1b[1m${l}\x1b[22m`).join('\n').replace('/admin', '\x1b[36m/admin\x1b[39m');
  assert.deepEqual(parseTable(colore), parseTable(TABLE));
});

test('passe : le tableau d\'avant le lot tient dans des budgets à sa mesure', () => {
  const r = check(parseTable(TABLE), { ...B, routes: Object.fromEntries(Object.entries(parseTable(TABLE).routes).map(([k, v]) => [k, { mesure: v, max: Math.ceil(v) + 10 }])) });
  assert.equal(r.ok, true, r.erreurs.join(' | '));
  assert.deepEqual(r.erreurs, []);
  assert.deepEqual(r.avertissements, []);
});

test('échoue : /admin dépasse son budget (code de sortie 1 côté script)', () => {
  const t = parseTable(TABLE);
  t.routes['/admin'] = 790;
  const r = check(t, B);
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.some((e) => /^\/admin : 790\.0 kB pour un budget de 776 kB/.test(e)));
  assert.equal(r.lignes.find((l) => l.route === '/admin').statut, 'DÉPASSE');
  assert.match(report(r), /DÉPASSE .*\/admin/);
  assert.match(report(r), /BUDGET NON TENU/);
});

test('échoue : le JavaScript partagé dépasse son budget', () => {
  const t = parseTable(TABLE);
  t.shared = 101;
  const r = check(t, B);
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.some((e) => /partagé/.test(e)));
});

test('avertit sans échouer : une route grossit de plus de 10 kB par rapport à sa mesure', () => {
  const t = parseTable(TABLE);
  t.routes['/'] = 138; // +4 kB : rien
  const b = { ...B, routes: { ...B.routes, '/': { mesure: 120, max: 150 } } };
  const r = check(t, b);
  assert.equal(r.ok, true);
  assert.equal(r.lignes.find((l) => l.route === '/').statut, 'AVERT.');
  assert.ok(r.avertissements.some((a) => /^\/ : croissance de 18\.0 kB : à justifier dans la PR et à reporter dans bundle-budgets\.json/.test(a)));
});

test('route sans budget propre : plafond par défaut (150) et avertissement, jamais ignorée en silence', () => {
  const t = parseTable(TABLE);
  const r = check(t, B);
  const ligne = r.lignes.find((l) => l.route === '/connexion');
  assert.equal(ligne.max, 150);
  assert.equal(ligne.statut, 'AVERT.');
  assert.ok(r.avertissements.some((a) => /^\/connexion : route sans budget propre : ajoutez-la à scripts\/bundle-budgets\.json/.test(a)));
  // …et au-dessus du plafond par défaut, elle fait échouer.
  t.routes['/connexion'] = 151;
  assert.equal(check(t, B).ok, false);
});

test('groupe « /apercu/* » : un plafond commun pour les pages de démonstration', () => {
  const t = parseTable(TABLE);
  const r = check(t, B);
  const l = r.lignes.find((x) => x.route === '/apercu/assistant-salarie');
  assert.equal(l.max, 300);
  assert.equal(l.statut, 'OK');
  assert.ok(!r.avertissements.some((a) => a.startsWith('/apercu/')));
  t.routes['/apercu/assistant-salarie'] = 305;
  assert.equal(check(t, B).ok, false);
});

test('échoue : tableau absent, vide, ou sans /admin ni /poseur', () => {
  assert.equal(check(parseTable(''), B).ok, false);
  assert.equal(check(parseTable('Failed to compile.\n./app/x.tsx\nType error'), B).ok, false);
  const sansAdmin = parseTable(TABLE);
  delete sansAdmin.routes['/admin'];
  const r1 = check(sansAdmin, B);
  assert.equal(r1.ok, false);
  assert.ok(r1.erreurs.some((e) => /\/admin est absente/.test(e)));
  const sansPoseur = parseTable(TABLE);
  delete sansPoseur.routes['/poseur'];
  assert.ok(check(sansPoseur, B).erreurs.some((e) => /\/poseur est absente/.test(e)));
});

test('l\'objectif du plan est affiché mais ne bloque pas', () => {
  const r = check(parseTable(TABLE), B);
  assert.match(report(r), /objectif 350 kB \(encore 416\.0 kB\)/);
  assert.equal(r.ok, true);
});

test('bundle-budgets.json : /admin et /poseur ont un budget avec objectif, /connexion et /support ≤ 155, /borne et /pointer ≤ 170', () => {
  assert.equal(budgets.routes['/admin'].objectif, 350);
  assert.equal(budgets.routes['/poseur'].objectif, 300);
  assert.ok(budgets.routes['/admin'].max >= budgets.routes['/admin'].mesure);
  for (const r of ['/connexion', '/support']) assert.ok(budgets.routes[r].max <= 155, r);
  for (const r of ['/borne', '/pointer']) assert.ok(budgets.routes[r].max <= 170, r);
  assert.ok(budgets.groupes['/apercu/*'].max > 0);
  assert.ok(budgets.shared.max > budgets.shared.mesure);
});

// ─── En-têtes de cache (public/_headers) ─────────────────────────────────────
const HEADERS = fs.readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
const regles = HEADERS.split('\n').filter((l) => !l.startsWith('#')).join('\n').split(/\n(?=\S)/).map((b) => b.trim()).filter(Boolean);
const regle = (chemin) => regles.find((b) => b.split('\n')[0].trim() === chemin);

test('_headers : /_next/static/* immuable, un an', () => {
  const r = regle('/_next/static/*');
  assert.ok(r, 'règle /_next/static/* absente');
  assert.match(r, /Cache-Control: public, max-age=31536000, immutable/);
});

test('_headers : /fonts/* 30 jours, jamais immuable (noms de fichiers sans hash)', () => {
  const r = regle('/fonts/*');
  assert.ok(r, 'règle /fonts/* absente');
  assert.match(r, /max-age=2592000/);
  assert.doesNotMatch(r, /immutable/);
});

test('_headers : aucune règle sur le HTML, sur tout le site, ni sur sw.js', () => {
  const chemins = regles.map((b) => b.split('\n')[0].trim());
  assert.deepEqual(chemins.sort(), ['/_next/static/*', '/fonts/*']);
  for (const interdit of ['/*', '*.html', '/sw.js', '/cookies/*']) assert.ok(!chemins.includes(interdit), interdit);
});
