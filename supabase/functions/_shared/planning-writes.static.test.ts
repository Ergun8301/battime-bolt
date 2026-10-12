// Test STATIQUE (lecture du source) : les écritures partagées avec l'Assistant salarié n'ajoutent AUCUNE clé au corps des
// requêtes d'avant. `postal_code` (colonne que les migrations du dépôt ne créent pas) et `gap_before` ne partent que s'ils sont fournis :
// le bureau (admin-planning, assistant bureau) et la saisie manuelle gardent un corps de requête identique octet pour octet.
//   npm run test:planning-writes
const lire = (f: string) => Deno.readTextFile(new URL(f, import.meta.url)).then((t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''));
const ok = (c: boolean, msg: string) => { if (!c) throw new Error(msg); };

Deno.test('createWorksite : postal_code seulement s’il est fourni (jamais une clé nulle dans les appels du bureau)', async () => {
  const src = await lire('../../../lib/planning-writes.ts');
  const insert = src.slice(src.indexOf("from('worksites').insert("), src.indexOf('.select().single()'));
  ok(insert.includes('...(t(w.postal_code) ? { postal_code: t(w.postal_code) } : {})'), 'clé conditionnelle attendue');
  ok(!/postal_code:\s*t\(/.test(insert.replace('{ postal_code: t(w.postal_code) }', '')), 'AUCUNE clé « postal_code: t(… » nue');
  ok(/postal_code\?: string \| null/.test(src), 'champ optionnel');
});

Deno.test('insertWorkerEntry : gap_before seulement s’il est fourni', async () => {
  const src = await lire('../../../lib/worker-entry.ts');
  const row = src.slice(src.indexOf('const row = {'), src.indexOf('let { error }'));
  ok(row.includes('...(pending.gap_before ? { gap_before: pending.gap_before } : {})'), 'clé conditionnelle attendue');
  ok(!/\n\s*gap_before:/.test(row), 'aucune clé gap_before nue');
});

Deno.test('Assistant : aucun nouveau .delete() côté navigateur (le saver et les exécuteurs gardent les leurs) et rien dans worker-multi', async () => {
  for (const f of ['./worker-multi.ts', '../../../lib/worker-worksite.ts', '../../../components/worker-multi-card.tsx', './worker-multi-run.ts']) {
    ok(!/from\(['"][a-z_]+['"]\)\s*\.delete\(/.test(await lire(f)), `${f} ne supprime rien en base`);
  }
});
