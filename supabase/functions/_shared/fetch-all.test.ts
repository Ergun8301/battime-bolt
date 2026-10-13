// `deno test supabase/functions/_shared/fetch-all.test.ts` (npm run test:pagination)
// Lot 29 — la lecture paginée s'arrête sur une page plus courte que la taille demandée.
import { fetchAllPaged, MAX_ROWS_ASSUMED, PAGE_SIZE } from '../../../lib/fetch-all.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

/** Table simulée de `total` lignes numérotées ; `cap` = plafond serveur (« Max rows »). */
function table(total: number, cap = MAX_ROWS_ASSUMED) {
  const calls: [number, number][] = [];
  const build = (from: number, to: number) => {
    calls.push([from, to]);
    const n = Math.max(0, Math.min(to, total - 1) - from + 1);
    return Promise.resolve({ data: Array.from({ length: Math.min(n, cap) }, (_, i) => from + i), error: null });
  };
  return { build, calls };
}

const lire = async (total: number, cap?: number) => {
  const t = table(total, cap);
  const rows = await fetchAllPaged<number>(t.build);
  return { rows, requetes: t.calls.length };
};

Deno.test('le pas reste sous le plafond serveur supposé', () => {
  eq(PAGE_SIZE < MAX_ROWS_ASSUMED, true, 'PAGE_SIZE < MAX_ROWS_ASSUMED');
});

Deno.test('nombre de requêtes : 0 → 1, 3 → 1, 499 → 1, 500 → 2, 501 → 2, 1203 → 3', async () => {
  for (const [total, attendu] of [[0, 1], [3, 1], [499, 1], [500, 2], [501, 2], [1203, 3]] as const) {
    const r = await lire(total);
    eq(r.requetes, attendu, `${total} lignes : requêtes`);
    eq(r.rows.length, total, `${total} lignes : toutes récupérées`);
  }
});

Deno.test('ordre conservé et pages jointives (on avance de rows.length)', async () => {
  const t = table(1203);
  const rows = await fetchAllPaged<number>(t.build);
  eq(rows, Array.from({ length: 1203 }, (_, i) => i), 'ordre');
  eq(t.calls, [[0, 499], [500, 999], [1000, 1499]], 'bornes');
});

Deno.test('prudence : une page courte de 50, 100 ou 200 lignes (plafond supposé) en redemande une', async () => {
  for (const total of [50, 100, 200]) {
    const r = await lire(total);
    eq(r.requetes, 2, `${total} lignes : 2 requêtes`);
    eq(r.rows.length, total, `${total} lignes`);
  }
});

Deno.test('plafond serveur réglé à 100 : toutes les lignes sont récupérées', async () => {
  for (const total of [0, 7, 100, 250, 1203]) {
    const r = await lire(total, 100);
    eq(r.rows.length, total, `${total} lignes avec plafond 100`);
    eq(r.rows, Array.from({ length: total }, (_, i) => i), `${total} lignes : ordre`);
  }
});

Deno.test('page plus longue que demandé : erreur (range ignoré)', async () => {
  let msg = '';
  try {
    await fetchAllPaged<number>(() => Promise.resolve({ data: Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i), error: null }));
  } catch (e) { msg = (e as Error).message; }
  eq(msg.includes('plus de lignes que demandé'), true, 'erreur explicite');
});

Deno.test('erreur de lecture : propagée', async () => {
  let err: unknown = null;
  try { await fetchAllPaged<number>(() => Promise.resolve({ data: null, error: { message: 'boom' } })); } catch (e) { err = e; }
  eq((err as { message: string }).message, 'boom', 'erreur propagée');
});
