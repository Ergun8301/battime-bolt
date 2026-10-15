// Test du budget CSS : node --test scripts/tests/check-css-budget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, feuillesDe, mesure, poidsDe } from '../check-css-budget.mjs';

const HTML = '<head><link rel="stylesheet" href="/_next/static/css/a.css" data-precedence="next"/><link rel="stylesheet" href="/fonts/fonts.css"/><link rel="preload" href="/_next/static/css/z.css" as="style"/><link rel="stylesheet" href="/_next/static/css/b.css"/></head>';

test('lecture : seules les feuilles Next, dans l’ordre du document ; les polices et les préchargements sont ignorés', () => {
  assert.deepEqual(feuillesDe(HTML), ['/_next/static/css/a.css', '/_next/static/css/b.css']);
});

test('mesure : additionne le gzip des feuilles d’une page exportée', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'css-budget-'));
  fs.mkdirSync(path.join(dir, '_next/static/css'), { recursive: true });
  const css = '.a{color:red}'.repeat(2000);
  fs.writeFileSync(path.join(dir, '_next/static/css/a.css'), css);
  fs.writeFileSync(path.join(dir, '_next/static/css/b.css'), css);
  fs.writeFileSync(path.join(dir, 'poseur.html'), HTML);
  const m = mesure('/poseur', dir);
  assert.equal(m.feuilles.length, 2);
  assert.ok(Math.abs(m.gz - 2 * poidsDe(Buffer.from(css)).gz) < 1e-9);
  assert.throws(() => mesure('/absente', dir), /introuvable/);
});

test('contrôle : sous le budget OK, au-dessus erreur, grosse croissance avertissement', () => {
  const budgets = { css: { routes: { '/poseur': { mesure: 10, max: 20 } } } };
  assert.equal(check({ '/poseur': { gz: 12, brut: 50 } }, budgets).ok, true);
  const r = check({ '/poseur': { gz: 21, brut: 90 } }, budgets);
  assert.equal(r.ok, false);
  assert.match(r.erreurs[0], /budget de 20 kB/);
  const w = check({ '/poseur': { gz: 15, brut: 60 } }, budgets);
  assert.equal(w.ok, true);
  assert.equal(w.avertissements.length, 1);
  assert.equal(check({}, budgets).ok, false);
  assert.equal(check({}, {}).ok, false);
});
