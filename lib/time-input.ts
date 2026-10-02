// Lot 11 — saisie d'heure SIMPLE (plus de roulette) : on tape « 14h », « 14h30 »,
// « 14:30 », « 1430 », « 8 », « midi »… ou on choisit dans une liste au quart
// d'heure. Fonctions pures, sans dépendance (testées dans lib/time-input.test.ts).

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Texte tapé → 'HH:MM', '' (vide = pas d'heure) ou null (incompréhensible).
 * Jamais de supposition sur l'après-midi : « 2 » reste 02:00 (on n'invente pas).
 */
export function parseTimeInput(raw: string): string | null {
  const t = (raw || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return '';
  if (/^midi$/.test(t)) return '12:00';
  if (/^minuit$/.test(t)) return '00:00';
  let h: number; let m = 0;
  let r = /^(\d{1,2})\s*(?:h|:|\.|,)\s*(\d{1,2})?\s*(?:min)?$/.exec(t);
  if (r) { h = Number(r[1]); m = r[2] ? Number(r[2].length === 1 ? `${r[2]}0` : r[2]) : 0; }
  else if ((r = /^(\d{3,4})$/.exec(t))) { const s = r[1].padStart(4, '0'); h = Number(s.slice(0, 2)); m = Number(s.slice(2)); }
  else if ((r = /^(\d{1,2})$/.exec(t))) { h = Number(r[1]); }
  else return null;
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null;
  return `${pad(h)}:${pad(m)}`;
}

/** Les quarts d'heure proposés dans la liste (05:00 → 22:00). */
export const QUARTER_HOURS: string[] = (() => {
  const out: string[] = [];
  for (let h = 5; h <= 22; h++) for (const m of [0, 15, 30, 45]) { if (h === 22 && m > 0) break; out.push(`${pad(h)}:${pad(m)}`); }
  return out;
})();

/** Les entrées de la liste qui commencent par ce qui est tapé (« 14 » → 14:00, 14:15…). */
export function filterQuarterHours(typed: string): string[] {
  const t = (typed || '').trim().replace(/h$/i, '');
  if (!/^\d{1,2}$/.test(t)) return QUARTER_HOURS;
  const h = pad(Number(t));
  const hits = QUARTER_HOURS.filter((q) => q.startsWith(h));
  return hits.length ? hits : QUARTER_HOURS;
}

/** Préréglages en un toucher (mêmes valeurs que l'Assistant : fr-langue dayPart). */
export const TIME_PRESETS = [
  { label: 'Matin', debut: '08:00', fin: '12:00' },
  { label: 'Après-midi', debut: '13:30', fin: '17:00' },
  { label: 'Journée', debut: '08:00', fin: '17:00' },
] as const;
