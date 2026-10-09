// `deno test supabase/functions/_shared/copy-slot.test.ts` (npm run test:copie-planning)
// Lot 2 (d) — glisser avec Ctrl / Alt pour copier : les refus d'une case cible.
import { copyRefusal, targetRefusal } from './copy-slot.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

const OPEN = { absent: false, monthClosed: false, workerClosed: false };
const MATIN = { id: 'matin', worksite_id: 'salle', estimated_start: '08:00:00', estimated_end: '12:00:00' };
const JOUR = { id: 'jour', worksite_id: 'depot', estimated_start: '08:00:00', estimated_end: '17:00:00' };
const SANS = { id: 'sans', worksite_id: 'salle', estimated_start: null, estimated_end: null };
const code = (r: { code: string } | null) => r?.code ?? null;

Deno.test('case cible : absence, mois clôturé, salarié clôturé — dans cet ordre', () => {
  eq(targetRefusal(OPEN), null, 'case libre : rien à dire');
  eq(targetRefusal({ absent: true, monthClosed: true, workerClosed: true })?.message, 'Absent ce jour-là : rien n’a été copié.', 'l’absence d’abord');
  eq(targetRefusal({ absent: false, monthClosed: true, workerClosed: true })?.message, 'Mois clôturé : rien n’a été copié.', 'puis le mois');
  eq(targetRefusal({ absent: false, monthClosed: false, workerClosed: true })?.message, 'Heures clôturées pour ce salarié : rien n’a été copié.', 'puis le salarié');
  eq(targetRefusal({ ...OPEN, absent: true }, 'déplacé')?.message, 'Absent ce jour-là : rien n’a été déplacé.', 'même règle pour un déplacement, dit comme tel');
  eq(targetRefusal({ ...OPEN, monthClosed: true }, 'déplacé')?.code, 'month_closed', 'code stable');
});

Deno.test('copie : la case passe avant tout le reste', () => {
  eq(code(copyRefusal(MATIN, [MATIN], { ...OPEN, absent: true })), 'absent', 'absent ET doublon : « absent »');
  eq(code(copyRefusal(MATIN, [JOUR], { ...OPEN, monthClosed: true })), 'month_closed', 'mois clôturé ET chevauchement : « mois clôturé »');
  eq(code(copyRefusal(MATIN, [MATIN], { ...OPEN, workerClosed: true })), 'worker_closed', 'salarié clôturé ET doublon : « salarié clôturé »');
});

Deno.test('copie : doublon exact (même chantier, mêmes heures ; sans heures = sans heures)', () => {
  eq(copyRefusal(MATIN, [MATIN], OPEN)?.message, 'Déjà prévu dans cette case.', 'dans sa propre case : toujours un doublon');
  eq(code(copyRefusal(MATIN, [{ ...MATIN, id: 'x', estimated_start: '08:00', estimated_end: '12:00' }], OPEN)), 'duplicate', '« 08:00 » = « 08:00:00 »');
  eq(code(copyRefusal(SANS, [{ ...SANS, id: 'y' }], OPEN)), 'duplicate', 'sans heures des deux côtés : doublon');
  eq(copyRefusal(SANS, [{ ...SANS, id: 'y', worksite_id: 'depot' }], OPEN), null, 'autre chantier sans heures : permis');
  eq(copyRefusal(SANS, [MATIN], OPEN), null, 'même chantier, l’un prévu à 08:00–12:00, l’autre sans heures : permis');
  eq(copyRefusal({ ...MATIN, estimated_end: null }, [MATIN], OPEN), null, 'même début, fin différente (aucune) : pas un doublon');
  eq(code(copyRefusal({ ...MATIN, estimated_end: null }, [{ ...MATIN, id: 'z', estimated_end: null }], OPEN)), 'duplicate', 'début seul identique des deux côtés : doublon');
});

Deno.test('copie : heures prévues qui se chevauchent', () => {
  eq(copyRefusal(MATIN, [JOUR], OPEN)?.message, 'Chevauche 08:00–17:00 déjà prévu ce jour-là.', '08–12 sur 08–17 : refusé, en disant lequel');
  eq(code(copyRefusal(JOUR, [MATIN], OPEN)), 'overlap', '08–17 sur 08–12 : refusé aussi');
  const APREM = { id: 'aprem', worksite_id: 'salle', estimated_start: '13:30:00', estimated_end: '17:00:00' };
  eq(copyRefusal(APREM, [MATIN], OPEN), null, 'même chantier matin + après-midi : permis');
  eq(copyRefusal({ ...APREM, estimated_start: '12:00:00' }, [MATIN], OPEN), null, 'bout à bout (12:00) : permis');
  eq(copyRefusal({ ...APREM, estimated_start: '11:59:00' }, [MATIN], OPEN), null, '1 min de contact tolérée (comme le lot 9)');
  eq(code(copyRefusal({ ...APREM, estimated_start: '11:58:00' }, [MATIN], OPEN)), 'overlap', '2 min : refusé');
  eq(copyRefusal(MATIN, [{ ...JOUR, estimated_end: null }], OPEN), null, 'une case d’en face sans fin n’a pas d’heures à chevaucher');
  eq(copyRefusal(SANS, [JOUR], OPEN), null, 'une copie sans heures ne chevauche rien');
  const NUIT = { id: 'nuit', worksite_id: 'salle', estimated_start: '22:00:00', estimated_end: '06:00:00' };
  eq(code(copyRefusal({ ...MATIN, estimated_start: '05:00:00', estimated_end: '23:00:00' }, [NUIT], OPEN)), 'overlap', 'passage de minuit compris');
});

Deno.test('copie : une absence dans la liste n’est jamais une intervention à comparer', () => {
  const conge = { id: 'conge', worksite_id: 'salle', absence_type: 'conge', estimated_start: '08:00:00', estimated_end: '12:00:00' };
  eq(copyRefusal(MATIN, [conge], OPEN), null, 'ligne d’absence ignorée (c’est le drapeau « absent » qui refuse)');
});
