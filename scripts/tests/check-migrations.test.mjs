// Test du contrôle d'historique des migrations (lot 0) : node --test scripts/tests/check-migrations.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compare, parseHistory, loadFiles, loadHistorique, report } from '../check-migrations.mjs';

// Historique relevé en production le 11/10/2026 (sortie de l'outil Supabase, telle quelle).
const prod = parseHistory(fs.readFileSync(new URL('./fixtures/historique-prod-2026-10-11.json', import.meta.url), 'utf8'));
// Les fichiers jusqu'au lot 0 inclus : les lots suivants ajouteront les leurs.
const files = loadFiles().filter((f) => f.version <= '20261011090000');
const hist = loadHistorique();

test('production du 11/10 : seul le lot 0 reste à appliquer, aucune inscription inconnue', () => {
  const r = compare(files, prod, hist);
  assert.deepEqual(r.aAppliquer.map((f) => f.name), ['lot0_fermeture_pointages_oublies']);
  assert.deepEqual(r.inconnus, []);
  assert.equal(r.alias.length, 8);
  assert.equal(r.connusSansInscription.length, 2);
  assert.equal(r.connusSansFichier.length, 10);
  assert.ok(r.ok.some((f) => f.name === 'lot6_formations'), 'lots 4 à 7 inscrits par Cowork (D1)');
  assert.ok(r.doublons.some((d) => d.name === 'etape10_envoi_comptable'));
  assert.match(report(r), /À APPLIQUER : 1\n\s+20261011090000_lot0_fermeture_pointages_oublies\.sql/);
});

test('une fois le lot 0 inscrit sous son nom : plus rien à appliquer', () => {
  const r = compare(files, [...prod, { version: '20261011090000', name: 'lot0_fermeture_pointages_oublies' }], hist);
  assert.equal(r.aAppliquer.length, 0);
  assert.equal(r.inconnus.length, 0);
});

test('un nouveau fichier non inscrit est signalé, une inscription inconnue aussi', () => {
  const extra = [...files, { version: '20261012090000', name: 'lot99_essai', file: '20261012090000_lot99_essai.sql' }];
  const r = compare(extra, [...prod, { version: '1', name: 'faite_a_la_main' }], hist);
  assert.ok(r.aAppliquer.some((f) => f.name === 'lot99_essai'));
  assert.deepEqual(r.inconnus.map((x) => x.name), ['faite_a_la_main']);
});

test('lecture : sortie de l’outil Supabase, tableau JSON, CSV, texte', () => {
  assert.deepEqual(parseHistory('{"migrations":[{"version":"20261010210000","name":"lot6_formations"}]}'), [{ version: '20261010210000', name: 'lot6_formations' }]);
  assert.deepEqual(parseHistory('[{"version":1,"name":"a"}]'), [{ version: '1', name: 'a' }]);
  assert.deepEqual(parseHistory('version,name\n20261010210000,lot6_formations\n'), [{ version: '20261010210000', name: 'lot6_formations' }]);
  assert.deepEqual(parseHistory('20261010210000 | lot6_formations\nlot5_journal_relances'), [
    { version: '20261010210000', name: 'lot6_formations' }, { version: '', name: 'lot5_journal_relances' }]);
  assert.deepEqual(parseHistory('  '), []);
});
