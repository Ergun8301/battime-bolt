// `deno test supabase/functions/_shared/pause.test.ts` (npm run test:pause)
// Lot 3bis — la pause : ce qu'on tape, ce qu'on affiche, la règle de longueur.
import {
  formatPause, formatPauseInput, parsePauseInput, pauseError, pauseFits, readPauseInput,
  PAUSE_BARE_DIGIT, PAUSE_BARE_DIGIT_VOUS, PAUSE_MAX_MINUTES, PAUSE_QUICK, PAUSE_TOO_LONG, PAUSE_UNREADABLE,
} from './pause.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

Deno.test('les puces, la borne et le message de la base', () => {
  eq([...PAUSE_QUICK], [0, 15, 30, 45, 60, 90, 120], '0 / 15 / 30 / 45 min / 1 h / 1 h 30 / 2 h');
  eq(PAUSE_MAX_MINUTES, 720, '12 h au plus');
  // Même octets que office_correct_entry (migration 20261009120000, ligne 138).
  eq(PAUSE_TOO_LONG, 'La pause doit être plus courte que la journée.', 'texte exact du SQL');
});

Deno.test('ce qu’on tape : h:mm, h, minutes', () => {
  const cases: [string, number][] = [
    ['1:15', 75], ['1h15', 75], ['1H15', 75], ['1h15min', 75], ['1h', 60], ['2 h', 120], ['1h30', 90], ['1 h 30', 90],
    ['0:45', 45], ['45', 45], ['45 min', 45], ['45mn', 45], ['90', 90], ['0', 0], ['0:00', 0], ['1,15', 75], ['1.30', 90],
    ['720', 720], ['12:00', 720], ['10', 10], ['5 min', 5], ['30 minutes', 30], ['1 minute', 1],
    ['1 heure', 60], ['1 heure 15', 75], ['2 heures', 120], ['  1:15  ', 75],
  ];
  for (const [t, m] of cases) eq(parsePauseInput(t), m, `« ${t} »`);
});

Deno.test('ce qui est refusé, et pourquoi', () => {
  for (const t of ['', '  ', null, undefined]) eq(readPauseInput(t as string), { kind: 'empty' }, `vide : ${JSON.stringify(t)}`);
  for (const t of ['abc', '1:5', '1h5', '1,5', '1:75', '-15', '1:15:00', '1h75', 'h30', '1.5h']) {
    eq(parsePauseInput(t), null, `« ${t} » refusé`);
    eq(readPauseInput(t), { kind: 'bad', message: PAUSE_UNREADABLE }, `« ${t} » : « Durée non comprise »`);
  }
  for (const t of ['721', '13:00', '20h']) eq(readPauseInput(t), { kind: 'bad', message: PAUSE_TOO_LONG }, `« ${t} » : plus de 12 h`);
  // Un chiffre seul : une heure ou une minute ? Refusé, avec l'exemple.
  for (const t of ['1', '4', '9', '05']) {
    eq(parsePauseInput(t), null, `« ${t} » nu refusé`);
    eq(readPauseInput(t), { kind: 'bad', message: PAUSE_BARE_DIGIT }, `« ${t} » : « Écris 1:00… »`);
  }
  eq(PAUSE_BARE_DIGIT, 'Écris 1:00 pour une heure, ou 5 min.', 'message exact (salarié)');
  eq(readPauseInput('4', true), { kind: 'bad', message: PAUSE_BARE_DIGIT_VOUS }, 'bureau / Assistant : vouvoiement');
  eq(parsePauseInput('4 min'), 4, '« 4 min » : l’unité lève le doute');
});

Deno.test('affichage', () => {
  const cases: [number, string][] = [[0, '0 min'], [15, '15 min'], [45, '45 min'], [60, '1 h'], [75, '1 h 15'], [90, '1 h 30'], [120, '2 h'], [125, '2 h 05'], [600, '10 h'], [-5, '0 min']];
  for (const [m, s] of cases) eq(formatPause(m), s, `formatPause(${m})`);
  eq(formatPauseInput(75), '1:15', 'Autre pré-rempli : 1:15');
  eq(formatPauseInput(20), '0:20', 'Autre pré-rempli : 0:20');
  eq(formatPauseInput(0), '0:00', '0:00');
});

Deno.test('la règle : plus courte que la ligne', () => {
  eq(pauseFits(0, 60), true, '0 sur 1 h');
  eq(pauseFits(45, 60), true, '45 min sur 1 h');
  eq(pauseFits(59, 60), true, '59 min sur 1 h');
  eq(pauseFits(60, 60), false, '1 h sur 1 h : refusé');
  eq(pauseFits(-1), false, 'négative');
  eq(pauseFits(30.5), false, 'minutes entières seulement');
  eq(pauseFits(45), true, 'ligne inconnue : seule la borne de 12 h compte');
  eq(pauseFits(721), false, 'plus de 12 h');
  eq(pauseFits(120, 480), true, 'nuit 22:00–06:00 (8 h) : 2 h acceptées');
  eq(pauseFits(0, 0), true, 'pas de pause : toujours valable');
  eq(pauseError(45, 60), null, 'pas d’erreur');
  eq(pauseError(60, 60), PAUSE_TOO_LONG, 'trop longue : message de la base');
  eq(pauseError(30.5, 600), PAUSE_UNREADABLE, 'pas un nombre de minutes');
});
