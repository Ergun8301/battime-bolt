// Lot 3 — couleur des bulles selon le créneau (matin / après-midi / soir).
//   npm run test:creneaux
import { DAY_PART_INK, DAY_PARTS, dayPartOf, dayPartOfLabel, dayPartTint, dayPartTintFromLabel, toMinutes } from './day-part.ts';
import { dayPart } from './fr-langue.ts';
import { TIME_PRESETS } from '../../../lib/time-input.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

Deno.test('créneau d’un horaire prévu (seuils 12 h et 18 h, 2 h dans deux créneaux = journée)', () => {
  const CASES: [string | null | undefined, string | null | undefined, string | null][] = [
    ['08:00:00', '12:00:00', 'matin'],
    ['13:30', '17:00', 'apres-midi'],
    ['13:00', '17:00', 'apres-midi'],
    ['14:00', null, 'apres-midi'],
    ['11:59', null, 'matin'],
    ['12:00', null, 'apres-midi'],
    ['17:59', null, 'apres-midi'],
    ['18:00', null, 'soir'],
    ['18:00', '22:00', 'soir'],
    ['07:00', '13:00', 'matin'],
    ['11:00', '13:00', 'matin'], // égalité 60 / 60 → le plus tôt
    ['11:00', '15:00', 'apres-midi'],
    ['16:00', '19:00', 'apres-midi'],
    ['17:00', '20:00', 'soir'],
    ['10:30', '14:00', 'apres-midi'],
    ['08:00', '17:00', 'journee'],
    ['10:00', '14:00', 'journee'],
    ['16:00', '22:00', 'journee'],
    ['12:00', '12:00', 'apres-midi'], // fin = début (sortie oubliée) : seul le début compte
    ['09:00:00', '09:00:00', 'matin'],
    ['18:30', '18:30', 'soir'],
    // Fin avant le début = poste de nuit, coupé à minuit.
    ['22:00', '06:00', 'soir'],
    ['17:00:00', '00:30:00', 'soir'], // 1 h l'après-midi, 6 h le soir
    ['17:00', '00:00', 'soir'],
    ['18:00', '00:30', 'soir'],
    ['16:00', '02:00', 'journee'], // 2 h l'après-midi + 6 h le soir : blanc
    ['09:00', '08:00', 'journee'], // 09:00 → minuit
    ['8:00', '12:00', 'matin'],
    [null, null, null],
    [undefined, undefined, null],
    ['', '12:00', null],
    ['abc', null, null],
    ['24:00', null, null],
  ];
  for (const [s, e, want] of CASES) eq(dayPartOf(s, e), want, `${s ?? '∅'} → ${e ?? '∅'}`);
  eq(toMinutes(' 08:30:00 '), 510, 'espaces et secondes tolérés');
  eq(toMinutes('7:75'), null, 'minutes impossibles');
});

Deno.test('libellé de la borne « 14:00 » / « 08:00–17:00 »', () => {
  eq(dayPartOfLabel('14:00'), 'apres-midi', '« 14:00 »');
  eq(dayPartOfLabel('08:00–17:00'), 'journee', 'tiret demi-cadratin');
  eq(dayPartOfLabel('18:00-21:00'), 'soir', 'trait d’union');
  eq(dayPartOfLabel('17:00–00:30'), 'soir', 'nuit sur la borne');
  eq(dayPartOfLabel(null), null, 'sans horaire');
  eq(dayPartTintFromLabel('08:00–12:00')?.key, 'matin', 'teinte depuis le libellé');
  eq(dayPartTintFromLabel('08:00–17:00'), null, 'journée entière : pas de teinte');
});

Deno.test('mêmes créneaux que les préréglages et l’Assistant', () => {
  const want: Record<string, string> = { Matin: 'matin', 'Après-midi': 'apres-midi', Journée: 'journee' };
  for (const p of TIME_PRESETS) eq(dayPartOf(p.debut, p.fin), want[p.label], `préréglage « ${p.label} »`);
  for (const [phrase, w] of [['demain matin', 'matin'], ['cet après-midi', 'apres-midi'], ['toute la journée', 'journee']] as const) {
    const d = dayPart(phrase);
    ok(!!d, `Assistant : « ${phrase} » sans horaire`);
    eq(dayPartOf(d!.debut, d!.fin), w, `Assistant : « ${phrase} »`);
  }
});

// ─── Couleurs : contraste WCAG et écart perçu (CIE76), calculés ici ─────────────
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const lab = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin);
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ].map((t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
};
const dE = (a: string, b: string) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

Deno.test('teintes lisibles : titre ≥ 7:1, sous-ligne et heures ≥ 4,5:1', () => {
  for (const d of DAY_PARTS) {
    ok(contrast('#15120F', d.bg) >= 7, `${d.label} : titre ${contrast('#15120F', d.bg).toFixed(2)}`);
    ok(contrast(DAY_PART_INK, d.bg) >= 4.5, `${d.label} : encre ${contrast(DAY_PART_INK, d.bg).toFixed(2)}`);
  }
  eq(dayPartTint('08:00', '12:00'), { key: 'matin', bg: '#DAEDFB', ink: DAY_PART_INK }, 'teinte du matin');
  eq(dayPartTint('08:00', '17:00'), null, 'journée : blanc');
  eq(dayPartTint(null, null), null, 'sans horaire : blanc');
});

Deno.test('teintes distinctes entre elles, du blanc, du jour J et du vert « en cours »', () => {
  for (let i = 0; i < DAY_PARTS.length; i++) {
    const a = DAY_PARTS[i];
    for (let j = i + 1; j < DAY_PARTS.length; j++) ok(dE(a.bg, DAY_PARTS[j].bg) >= 15, `${a.label} / ${DAY_PARTS[j].label} : ΔE ${dE(a.bg, DAY_PARTS[j].bg).toFixed(1)}`);
    ok(dE(a.bg, '#FFFFFF') >= 10, `${a.label} / blanc : ΔE ${dE(a.bg, '#FFFFFF').toFixed(1)}`);
    ok(dE(a.bg, '#FFF6DB') >= 8, `${a.label} / jour J : ΔE ${dE(a.bg, '#FFF6DB').toFixed(1)}`);
    for (const g of ['#E7F6EE', '#EEF9F2']) ok(dE(a.bg, g) >= 10, `${a.label} / vert ${g} : ΔE ${dE(a.bg, g).toFixed(1)}`);
  }
});
