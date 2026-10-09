// Lot 3 — la couleur d'une intervention selon son CRÉNEAU (matin / après-midi /
// soir). Pur, sans réglage, sans base : la couleur se lit sur l'horaire écrit sur
// la bulle (« la couleur suit l'horaire »). Partagé par le bureau (admin-planning),
// la borne (kiosk-week-grid) et la feuille imprimée (planning-print).
//
// Des SEUILS, pas des horaires exacts : les deux « Après-midi » de l'appli
// (13:30–17:00 de lib/time-input.ts et de l'Assistant, 13:00–17:00 de lib/slot.ts)
// tombent dans le même créneau. Ne pas reprendre lib/slot.ts : il ne reconnaît
// que des paires exactes.

export type DayPart = 'matin' | 'apres-midi' | 'soir';
export const NOON = 12 * 60;
export const EVENING = 18 * 60;
/** Au moins 2 h dans DEUX créneaux = journée entière (08–17, 10–14, 16–22) : reste blanche. */
export const SPAN_MIN = 120;

/** « 08:00 », « 8:00 », « 08:00:00 » → minutes ; tout le reste → null. */
export function toMinutes(t?: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((t || '').trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}

const at = (x: number): DayPart => (x < NOON ? 'matin' : x < EVENING ? 'apres-midi' : 'soir');

/**
 * Le créneau d'un horaire prévu. null = sans horaire (bulle blanche) ;
 * 'journee' = au moins 2 h dans deux créneaux (bulle blanche aussi : teinter
 * 08–17 en « matin » laisserait croire l'après-midi libre).
 */
export function dayPartOf(start?: string | null, end?: string | null): DayPart | 'journee' | null {
  const s = toMinutes(start);
  if (s === null) return null;
  const e = toMinutes(end);
  if (e === null || e <= s) return at(s); // RDV « 14:00 » (ou fin illisible) : le début décide
  const ov = [[0, NOON], [NOON, EVENING], [EVENING, 24 * 60]]
    .map(([a, b]) => Math.max(0, Math.min(e, b) - Math.max(s, a)));
  if (ov.filter((m) => m >= SPAN_MIN).length >= 2) return 'journee';
  // Le créneau qui porte le plus de minutes ; à égalité, le plus tôt (11–13 = matin).
  return (['matin', 'apres-midi', 'soir'] as const)[ov.indexOf(Math.max(...ov))];
}

/** Libellé de la borne (kiosk-board.ts plannedHours) : « 14:00 » ou « 14:00–18:00 ». */
export const dayPartOfLabel = (h?: string | null) => {
  const [a, b] = (h || '').split(/[–-]/);
  return dayPartOf(a, b);
};

// Trois teintes douces. Aucune n'est jaune (aujourd'hui, sélection) ni verte
// (réservé au pointage en direct). Une seule encre pour le texte secondaire : la
// couleur actuelle des sous-lignes (#6E6A63) et des heures (#9a948a) passerait
// sous 4,5:1 sur une teinte (contrastes vérifiés dans day-part.test.ts).
export const DAY_PART_INK = '#57524A';
export const DAY_PARTS = [
  { key: 'matin', label: 'Matin', hint: 'avant 12 h', bg: '#DAEDFB', edge: '#2B5B91' },
  { key: 'apres-midi', label: 'Après-midi', hint: '12 h – 18 h', bg: '#FDE3CA', edge: '#8A4A12' },
  { key: 'soir', label: 'Soir', hint: 'après 18 h', bg: '#DFCCEE', edge: '#5E4589' },
] as const;

export interface DayPartTint { key: DayPart; bg: string; ink: string }

/** La teinte d'une bulle, ou null (journée entière, sans horaire) → fond blanc. */
export function dayPartTint(start?: string | null, end?: string | null): DayPartTint | null {
  const k = dayPartOf(start, end);
  const d = DAY_PARTS.find((x) => x.key === k);
  return d ? { key: d.key, bg: d.bg, ink: DAY_PART_INK } : null;
}

/** Même chose depuis le libellé « 14:00–18:00 » que la borne affiche déjà. */
export const dayPartTintFromLabel = (h?: string | null): DayPartTint | null => {
  const [a, b] = (h || '').split(/[–-]/);
  return dayPartTint(a, b);
};
