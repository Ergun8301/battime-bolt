// Lot 10 : « raccourcis juste après le scan ». /pointer pose un paramètre sur le
// lien AU TOUCHER, /poseur le lit UNE fois (dans un effet), l'efface de
// l'adresse, puis le consomme dans les trois minutes pour le même compte.
export type AfterScan = 'ajouter' | 'avant' | 'envoyer';
export type AfterScanParams = { a: AfterScan; h: string | null; u: string; t: number };
/** Âge maximal du paramètre (touché sur /pointer → lu sur /poseur). */
export const AFTER_SCAN_TTL_MS = 10 * 60 * 1000;
/** Délai maximal entre la lecture de l'adresse et le geste (le temps de charger la journée). */
export const AFTER_SCAN_USE_MS = 3 * 60 * 1000;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `h` = HH:MM Paris (ajouter : heure de fin du dernier pointage ; avant : heure d'arrivée) ; `u` = identifiant du compte qui a scanné. */
export function afterScanHref(a: AfterScan, nowMs: number, o: { h?: string | null; u: string }): string {
  const q = new URLSearchParams({ a, t: String(nowMs), u: o.u });
  if (o.h) q.set('h', o.h);
  return `/poseur?${q.toString()}`;
}

/** `search` = window.location.search. null = rien à faire (absent, inconnu, périmé, dans le futur, heure ou compte illisibles). */
export function parseAfterScan(search: string, nowMs: number): AfterScanParams | null {
  const p = new URLSearchParams(search);
  const a = p.get('a');
  if (a !== 'ajouter' && a !== 'avant' && a !== 'envoyer') return null;
  const t = Number(p.get('t'));
  if (!Number.isFinite(t) || t <= 0) return null;
  const age = nowMs - t;
  if (age < -60_000 || age > AFTER_SCAN_TTL_MS) return null;   // 60 s de tolérance si l'horloge recule d'un cran
  const u = p.get('u') ?? '';
  if (!UUID.test(u)) return null;
  const h = p.get('h');
  if (a !== 'envoyer' && !(h && HM.test(h))) return null;
  return { a, h: a === 'envoyer' ? null : h, u: u.toLowerCase(), t };
}

/** La plage proposée dans la fiche « + ». ajouter : [h, h+1 h] (passe minuit comme le « + » normal) ; avant : [h−1 h, h] ; null si h < 01:00 (on garde le « + » habituel). */
export function afterScanSpan(a: 'ajouter' | 'avant', h: string): { start: string; end: string } | null {
  const [hh, mm] = h.split(':').map(Number);
  const m = hh * 60 + mm;
  const f = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  if (a === 'ajouter') return { start: h, end: f((m + 60) % 1440) };
  return m >= 60 ? { start: f(m - 60), end: h } : null;
}
