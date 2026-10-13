// Lot 10 : une intervention saisie face au pointage EN COURS (le chrono).
//
// Le chrono n'a pas de fin tant qu'il tourne : une ligne ajoutée à la main qui
// le recouvre n'était vue qu'à l'envoi de la journée, qui restait alors
// bloquée. Ici on le voit AVANT d'écrire, et on dit s'il est possible de
// terminer le pointage à l'heure où l'intervention commence.
//
// Fonctions pures, importées par le navigateur ET par Deno. `day-hours.ts` (qui
// sert aussi à l'Assistant et au bureau) n'est volontairement pas modifié.
import { OVERLAP_TOLERANCE, findOverlap, interval, toMin, type Span } from './day-hours.ts';

/** Heure et date de Paris d'un instant, sans « 24:05 » (hourCycle h23) et sans dépendre du fuseau du téléphone. */
export function parisClock(at: string | number | Date): { date: string; hm: string } {
  const d = new Date(at);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hh = g('hour') === '24' ? '00' : g('hour');
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hm: `${hh}:${g('minute')}` };
}

/** Pourquoi on ne peut pas terminer le pointage à l'heure de début de l'intervention. */
export type LiveClashWhy = 'before' | 'future' | 'collision' | 'unavailable';

export type LiveClash =
  | null                                                   // pas de chevauchement : on enregistre comme avant
  | { can: 'finish'; at: string }                          // on peut terminer le pointage à `at` (HH:MM)
  | { can: 'fix'; why: LiveClashWhy; with?: Span & { editable?: boolean } };

/**
 * L'intervention saisie chevauche-t-elle le pointage EN COURS, et peut-on
 * résoudre ça en terminant le pointage à l'heure où elle commence ?
 *
 * Le chrono est une plage OUVERTE [début, +∞[ : il n'a pas de fin tant qu'il
 * tourne. Toutes les heures sont celles de Paris, du MÊME jour (l'appelant ne
 * traite que le chrono du jour de Paris affiché).
 *  · pas de chevauchement (> OVERLAP_TOLERANCE) → null ;
 *  · 'before'      — elle commence au plus tard 1 min après le début du chrono :
 *                    terminer à cette heure annulerait le pointage (le serveur
 *                    efface un chrono dont la fin n'est pas après le début) ;
 *  · 'future'      — elle commence après maintenant : on ne termine pas dans le futur ;
 *  · 'collision'   — [début du chrono, son début à elle] chevaucherait une ligne
 *                    déjà notée : on remplacerait un blocage par un autre ;
 *  · 'unavailable' — tout le reste serait possible, mais `finish_active_session`
 *                    n'existe pas encore sur ce serveur ;
 *  · sinon         — { can: 'finish', at: début de l'intervention }.
 * Le hors ligne n'est PAS traité ici : l'appelant n'ouvre pas l'alerte sans réseau.
 */
export function liveClash(i: {
  span: Span;                                   // l'intervention saisie
  liveStart: string;                            // début du chrono, HH:MM Paris
  now: string;                                  // maintenant, HH:MM Paris
  others: (Span & { editable?: boolean })[];    // les autres lignes vivantes du jour (sans celle qu'on édite)
  finishAvailable: boolean;                     // false = RPC absente (déjà constatée)
}): LiveClash {
  const live = toMin(i.liveStart);
  const [, end] = interval(i.span);
  if (end <= live + OVERLAP_TOLERANCE) return null;
  const start = toMin(i.span.start);
  if (start <= live + OVERLAP_TOLERANCE) return { can: 'fix', why: 'before' };
  if (start > toMin(i.now)) return { can: 'fix', why: 'future' };
  const clash = findOverlap({ start: i.liveStart, end: i.span.start }, i.others);
  if (clash) return { can: 'fix', why: 'collision', with: clash };
  if (!i.finishAvailable) return { can: 'fix', why: 'unavailable' };
  return { can: 'finish', at: i.span.start.slice(0, 5) };
}
