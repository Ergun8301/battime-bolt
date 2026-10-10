// `deno test supabase/functions/_shared/office-edits.test.ts` (npm run test:bureau-regles)
// Lot 2 — le bureau corrige une journée envoyée (motif, pause, panier, route)
// ou la renvoie au salarié. Les mêmes règles que `office_correct_entry`.
import { changedAfterReturn, changedKeys, diffLabels, frozenLabel, jourMois, precheck, pushBody, reasonOk, REASON_MAX, REASON_MIN, stateOf } from './office-edits.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

const LIGNE = { start_time: '08:00:00', end_time: '17:00:00', break_minutes: 0, meal_allowance: false, gap_before: null, status: 'submitted' };
const form = (o: Partial<{ start_time: string; end_time: string; break_minutes: number; meal_allowance: boolean; gap_before: 'route' | 'pause' | null | '' }> = {}) =>
  ({ start_time: '08:00', end_time: '17:00', break_minutes: 0, meal_allowance: false, gap_before: '' as const, ...o });

Deno.test('motif : 3 à 500 caractères (bornes comprises)', () => {
  eq(REASON_MIN, 3, 'minimum');
  eq(REASON_MAX, 500, 'maximum');
  eq(reasonOk('ok'), false, '2 caractères : refusé');
  eq(reasonOk('  ok  '), false, 'les espaces ne comptent pas');
  eq(reasonOk('oui'), true, '3 caractères : accepté');
  eq(reasonOk('x'.repeat(500)), true, '500 caractères : accepté');
  eq(reasonOk('x'.repeat(501)), false, '501 caractères : refusé');
  eq(precheck(LIGNE, { break_minutes: 30 }, [], 'ok'), 'Indiquez un motif (3 caractères au moins).', 'précontrôle : motif trop court');
  eq(precheck(LIGNE, { break_minutes: 30 }, [], 'x'.repeat(501)), 'Motif trop long (500 caractères au plus).', 'précontrôle : motif trop long');
});

Deno.test('ce qui a changé : une heure ne part que si son HH:MM change', () => {
  eq(changedKeys(LIGNE, form()), {}, 'rien touché : rien ne part');
  eq(changedKeys({ ...LIGNE, start_time: '08:07:00' }, form({ start_time: '08:07' })), {}, 'pointée à la minute, rouverte telle quelle : rien ne part');
  eq(changedKeys(LIGNE, form({ break_minutes: 30 })), { break_minutes: 30 }, 'pause seule');
  eq(changedKeys(LIGNE, form({ end_time: '16:30' })), { end_time: '16:30' }, 'fin seule (le début ne part pas)');
  eq(changedKeys(LIGNE, form({ meal_allowance: true })), { meal_allowance: true }, 'panier ajouté');
  eq(changedKeys({ ...LIGNE, meal_allowance: null }, form()), {}, 'panier null = non coché');
  eq(changedKeys(LIGNE, form({ gap_before: 'route' })), { gap_before: 'route' }, 'route avant');
  eq(changedKeys({ ...LIGNE, gap_before: 'pause' }, form({ gap_before: '' })), { gap_before: null }, '« — » efface la réponse');
  eq(changedKeys({ ...LIGNE, break_minutes: null }, form({ break_minutes: 0 })), {}, 'pause null = 0');
});

Deno.test('précontrôle : les refus du serveur, dits avant l’appel', () => {
  const M = 'pause oubliée';
  eq(precheck(LIGNE, {}, [], M), 'Rien n\'a changé.', 'rien à changer (même texte que le serveur)');
  eq(precheck(LIGNE, { break_minutes: 30 }, [], M), null, 'pause 30 min : accepté');
  eq(precheck(LIGNE, { break_minutes: 540 }, [], M), 'La pause doit être plus courte que la journée.', 'pause = durée de la ligne : refusée');
  eq(precheck(LIGNE, { break_minutes: 539 }, [], M), null, 'pause d’une minute de moins : acceptée');
  eq(precheck(LIGNE, { break_minutes: -5 }, [], M), 'La pause doit être plus courte que la journée.', 'pause négative');
  eq(precheck(LIGNE, { end_time: '08:00' }, [], M), 'Le début et la fin sont identiques.', 'début = fin');
  eq(precheck({ ...LIGNE, start_time: '22:00', end_time: '06:00' }, { break_minutes: 60 }, [], M), null, 'nuit 22:00–06:00 (8 h) : pause 1 h acceptée');
  eq(precheck({ ...LIGNE, start_time: '22:00', end_time: '06:00' }, { break_minutes: 480 }, [], M), 'La pause doit être plus courte que la journée.', 'nuit : pause de 8 h refusée');
  eq(precheck(LIGNE, { gap_before: 'trajet' as never }, [], M), 'Avant ce chantier : route ou pause.', 'route ou pause, rien d’autre');
});

Deno.test('précontrôle : chevauchement (1 minute tolérée), seulement si les heures bougent', () => {
  const M = 'erreur de saisie';
  const autre = [{ start: '17:00', end: '19:00' }];
  eq(precheck(LIGNE, { end_time: '17:30' }, autre, M), 'Ces heures chevauchent 17:00–19:00 du même jour.', '17:30 chevauche 17:00–19:00');
  eq(precheck(LIGNE, { end_time: '17:01' }, autre, M), null, 'une minute de recouvrement : tolérée');
  eq(precheck(LIGNE, { start_time: '12:00' }, [{ start: '07:00', end: '12:00' }], M), null, 'bout à bout (12:00) : pas de chevauchement');
  eq(precheck(LIGNE, { start_time: '11:00' }, [{ start: '07:00', end: '12:00' }], M), 'Ces heures chevauchent 07:00–12:00 du même jour.', 'début avancé sur la ligne du matin : refusé');
  eq(precheck(LIGNE, { start_time: '07:00' }, [{ start: '06:00', end: '06:00' }], M), null, 'une ligne « fin à compléter » (début = fin) ne bloque pas');
  eq(precheck(LIGNE, { break_minutes: 30 }, [{ start: '12:00', end: '18:00' }], M), null, 'heures inchangées : la pause passe même si la ligne en chevauchait déjà une autre');
});

Deno.test('ce qui a changé, en mots de chantier', () => {
  const avant = { start_time: '08:00', end_time: '17:00', break_minutes: 0, meal_allowance: false, gap_before: null, status: 'submitted' };
  eq(diffLabels(avant, { ...avant, end_time: '16:30' }), ['8h00–17h00 → 8h00–16h30'], 'fin');
  eq(diffLabels(avant, { ...avant, break_minutes: 30 }), ['pause 0 → 30 min'], 'pause');
  eq(diffLabels(avant, { ...avant, meal_allowance: true }), ['panier ajouté'], 'panier ajouté');
  eq(diffLabels({ meal_allowance: true }, { meal_allowance: false }), ['panier retiré'], 'panier retiré (journal partiel d’une autre ligne)');
  eq(diffLabels(avant, { ...avant, gap_before: 'route' }), ['avant : — → route'], 'route');
  eq(diffLabels({ ...avant, gap_before: 'pause' }, { ...avant, gap_before: 'route' }), ['avant : pause → route'], 'pause → route');
  eq(diffLabels(avant, { ...avant, end_time: '16:30', break_minutes: 30, meal_allowance: true, gap_before: 'pause' }),
    ['8h00–17h00 → 8h00–16h30', 'pause 0 → 30 min', 'panier ajouté', 'avant : — → pause'], 'tout à la fois, dans l’ordre de la fiche');
  eq(diffLabels(avant, { ...avant, status: 'draft' }), [], 'un renvoi (statut seul) n’est pas une correction');
  eq(diffLabels({ start_time: '08:07:00', end_time: '17:00:00' }, { start_time: '08:07', end_time: '17:00' }), [], 'secondes ignorées');
});

Deno.test('la notification : quoi, quand, pourquoi', () => {
  eq(jourMois('2026-10-08'), '8 octobre', 'date lisible');
  eq(jourMois('2026-08-01'), '1 août', 'accents');
  eq(pushBody({ kind: 'correction', date: '2026-10-08', labels: ['pause 0 → 30 min'], reason: 'pause oubliée' }),
    'Le bureau a corrigé ta journée du 8 octobre : pause 0 → 30 min. Motif : « pause oubliée »', 'correction');
  eq(pushBody({ kind: 'correction', date: '2026-10-08', labels: ['pause 0 → 30 min', 'panier ajouté'], reason: ' pause oubliée ' }),
    'Le bureau a corrigé ta journée du 8 octobre : pause 0 → 30 min, panier ajouté. Motif : « pause oubliée »', 'plusieurs changements');
  eq(pushBody({ kind: 'return', date: '2026-10-08', reason: 'il manque le chantier de l’après-midi' }),
    'Le bureau t\'a renvoyé ta journée du 8 octobre : « il manque le chantier de l’après-midi ». Corrige si besoin, puis renvoie-la.', 'renvoi');
  const long = pushBody({ kind: 'return', date: '2026-10-08', reason: 'x'.repeat(500) });
  eq(long.includes('…') && long.length < 260, true, 'un motif de 500 caractères est raccourci dans la notification');
});

Deno.test('renvoi : ce qu’il a figé, et ce que le salarié a changé après', () => {
  const fige = { start_time: '08:00', end_time: '17:00', break_minutes: 0, meal_allowance: true, gap_before: null, status: 'submitted' };
  eq(frozenLabel(fige), 'était 8h00–17h00 · pause 0 min · panier', 'ce que le renvoi a figé');
  eq(frozenLabel({ ...fige, meal_allowance: false, break_minutes: 30, gap_before: 'route' }), 'était 8h00–17h00 · pause 30 min · avant : route', 'pause et route');
  eq(frozenLabel({ status: 'submitted' }), '', 'journal partiel : rien à dire');
  const ligne = (o: Record<string, unknown> = {}) => ({ start_time: '08:00:00', end_time: '17:00:00', break_minutes: 0, meal_allowance: true, gap_before: null, status: 'submitted', ...o });
  eq(changedAfterReturn(fige, ligne()), [], 'renvoyée telle quelle : rien');
  eq(changedAfterReturn(fige, ligne({ end_time: '12:00:00' })), ['8h00–17h00 → 8h00–12h00'], 'fin changée après le renvoi');
  eq(changedAfterReturn(fige, ligne({ break_minutes: 45, meal_allowance: false })), ['pause 0 → 45 min', 'panier retiré'], 'pause et panier');
  eq(changedAfterReturn(fige, ligne({ start_time: '08:00:59' })), [], 'secondes ignorées');
  eq(stateOf(ligne({ gap_before: 'trajet', break_minutes: null })), { start_time: '08:00', end_time: '17:00', break_minutes: 0, meal_allowance: true, gap_before: null }, 'état lisible, valeurs inconnues neutralisées');
});
