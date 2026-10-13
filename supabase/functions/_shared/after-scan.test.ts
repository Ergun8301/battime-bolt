// `deno test supabase/functions/_shared/after-scan.test.ts` (npm run test:pointage-regles)
// Lot 10 — le paramètre posé par /pointer et lu par /poseur.
import { afterScanHref, afterScanSpan, parseAfterScan, AFTER_SCAN_TTL_MS } from './after-scan.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

const NOW = Date.UTC(2026, 9, 21, 8, 30);
const U = 'a0a0a0a0-1111-4222-8333-444455556666';
const q = (o: Record<string, string>) => `?${new URLSearchParams(o).toString()}`;
const ok = { a: 'ajouter', t: String(NOW - 60_000), u: U, h: '17:07' };

Deno.test('parseAfterScan : cas valides', () => {
  eq(parseAfterScan(q(ok), NOW), { a: 'ajouter', h: '17:07', u: U, t: NOW - 60_000 }, 'ajouter');
  eq(parseAfterScan(q({ ...ok, a: 'avant', h: '08:02' }), NOW)?.a, 'avant', 'avant');
  eq(parseAfterScan(q({ a: 'envoyer', t: ok.t, u: U }), NOW)?.h, null, 'envoyer sans h accepté');
  eq(parseAfterScan(q({ ...ok, t: String(NOW - 9 * 60_000) }), NOW)?.a, 'ajouter', 't de 9 min');
  eq(parseAfterScan(q({ ...ok, u: U.toUpperCase() }), NOW)?.u, U, 'compte en majuscules ramené en minuscules');
  eq(parseAfterScan(q({ ...ok, foo: 'bar' }), NOW)?.a, 'ajouter', 'paramètre étranger ignoré');
});

Deno.test('parseAfterScan : tout le reste est ignoré', () => {
  eq(parseAfterScan('', NOW), null, 'adresse sans paramètre');
  eq(parseAfterScan(q({ ...ok, a: 'supprimer' }), NOW), null, 'a inconnu');
  eq(parseAfterScan(q({ ...ok, a: 'AJOUTER' }), NOW), null, 'a en majuscules');
  const { t: _t, ...sansT } = ok;
  eq(parseAfterScan(q(sansT), NOW), null, 't absent');
  eq(parseAfterScan(q({ ...ok, t: 'abc' }), NOW), null, 't illisible');
  eq(parseAfterScan(q({ ...ok, t: '0' }), NOW), null, 't = 0');
  eq(parseAfterScan(q({ ...ok, t: String(NOW - AFTER_SCAN_TTL_MS - 1) }), NOW), null, 't périmé');
  eq(parseAfterScan(q({ ...ok, t: String(NOW - 11 * 60_000) }), NOW), null, 't de 11 min');
  eq(parseAfterScan(q({ ...ok, t: String(NOW + 61_000) }), NOW), null, 't dans le futur de plus d’une minute');
  eq(parseAfterScan(q({ ...ok, t: String(NOW + 30_000) }), NOW)?.a, 'ajouter', 't dans le futur de 30 s toléré');
  const { u: _u, ...sansU } = ok;
  eq(parseAfterScan(q(sansU), NOW), null, 'u absent');
  eq(parseAfterScan(q({ ...ok, u: 'karim' }), NOW), null, 'u pas un UUID');
  const { h: _h, ...sansH } = ok;
  eq(parseAfterScan(q(sansH), NOW), null, 'ajouter sans h');
  eq(parseAfterScan(q({ ...ok, h: '25:00' }), NOW), null, 'h = 25:00');
  eq(parseAfterScan(q({ ...ok, h: '8:00' }), NOW), null, 'h = 8:00');
  eq(parseAfterScan(q({ ...ok, a: 'avant', h: '' }), NOW), null, 'avant avec h vide');
});

Deno.test('afterScanHref → parseAfterScan : aller-retour', () => {
  const href = afterScanHref('avant', NOW, { h: '08:02', u: U });
  eq(href.startsWith('/poseur?'), true, 'adresse /poseur');
  eq(parseAfterScan(href.slice('/poseur'.length), NOW + 5_000), { a: 'avant', h: '08:02', u: U, t: NOW }, 'aller-retour');
  eq(afterScanHref('envoyer', NOW, { u: U }).includes('h='), false, 'envoyer : pas de h');
});

Deno.test('afterScanSpan : la plage proposée', () => {
  eq(afterScanSpan('ajouter', '17:07'), { start: '17:07', end: '18:07' }, 'ajouter 17:07');
  eq(afterScanSpan('ajouter', '23:30'), { start: '23:30', end: '00:30' }, 'ajouter 23:30 passe minuit');
  eq(afterScanSpan('avant', '08:30'), { start: '07:30', end: '08:30' }, 'avant 08:30');
  eq(afterScanSpan('avant', '01:00'), { start: '00:00', end: '01:00' }, 'avant 01:00');
  eq(afterScanSpan('avant', '00:30'), null, 'avant 00:30 : on garde le « + » habituel');
});
