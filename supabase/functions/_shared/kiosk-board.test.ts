// Lot 9 — planning de la semaine sur la borne : `deno test -A supabase/functions/_shared/kiosk-board.test.ts`
import {
  buildBoard, hashStr, isKioskBoard, parisWeek, plannedHours, PALETTE_COUNT,
  type BoardInput, type BoardPlanning,
} from './kiosk-board.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

// Des identifiants qui RESSEMBLENT à ceux de la base : aucun ne doit ressortir.
const U_KARIM = '11111111-1111-4111-8111-111111111111';
const U_JULIE = '22222222-2222-4222-8222-222222222222';
const U_AUTRE_BOITE = '99999999-9999-4999-8999-999999999999';
const W_DUPONT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const W_MARTIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const W_AUTRE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const W_AILLEURS = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const W_HORS_BOITE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

// Jeudi 1er octobre 2026, 10:00 à Paris.
const NOW = Date.parse('2026-10-01T08:00:00Z');

let seq = 0;
const plan = (p: Partial<BoardPlanning> & { user_id: string; work_date: string }): BoardPlanning & Record<string, unknown> => ({
  id: `0000000${++seq}-0000-4000-8000-00000000000${seq % 10}`,
  worksite_id: null, estimated_start: null, estimated_end: null, absence_type: null,
  position: null, created_at: `2026-09-20T08:00:0${seq % 10}Z`,
  // Des colonnes que la fonction ne lit pas, glissées pour prouver qu'elles ne ressortent pas.
  notes: 'Code portail 1234, Mme Dupont malade', company_id: 'c-1',
  ...p,
});

function input(extra: Partial<BoardInput> = {}): BoardInput {
  seq = 0;
  return {
    nowMs: NOW,
    users: [
      { id: U_JULIE, first_name: 'Julie', last_name: 'Bernard', email: 'julie@exemple.fr' } as BoardInput['users'][number],
      { id: U_KARIM, first_name: 'Karim', last_name: 'Haddad' },
    ],
    worksites: [
      { id: W_DUPONT, client_name: 'Villa Dupont', city: 'Lyon' },
      { id: W_MARTIN, client_name: 'Cuisine Martin', city: null },
      { id: W_AUTRE, client_name: 'Autre', city: 'Saisie à la main' },
      { id: W_AILLEURS, client_name: 'Dépôt Vénissieux', city: 'Vénissieux' },
    ],
    planning: [
      plan({ user_id: U_KARIM, work_date: '2026-10-01', worksite_id: W_MARTIN, estimated_start: '14:00:00', estimated_end: '18:00:00', position: 1 }),
      plan({ user_id: U_KARIM, work_date: '2026-10-01', worksite_id: W_DUPONT, estimated_start: '07:30:00', estimated_end: '12:00:00', position: 0 }),
      plan({ user_id: U_KARIM, work_date: '2026-10-02', worksite_id: W_AUTRE, estimated_start: '09:00:00' }),
      plan({ user_id: U_JULIE, work_date: '2026-09-29', absence_type: 'maladie' }),
      plan({ user_id: U_JULIE, work_date: '2026-09-29', worksite_id: W_DUPONT }),
      plan({ user_id: U_JULIE, work_date: '2026-10-01', worksite_id: W_DUPONT, estimated_start: '08:00:00', estimated_end: '17:00:00' }),
    ],
    sessions: [],
    ...extra,
  };
}

Deno.test('Lot 9 borne : semaine de Paris, du lundi au dimanche (bords et changements d’heure)', () => {
  const w = parisWeek(NOW);
  eq([w.today, w.week_start, w.days[0], w.days[6]], ['2026-10-01', '2026-09-28', '2026-09-28', '2026-10-04'], 'jeudi');
  eq(w.days.length, 7, 'sept jours');
  // Lundi 00:30 à Paris = dimanche 22:30 UTC : déjà la nouvelle semaine.
  eq(parisWeek(Date.parse('2026-09-27T22:30:00Z')).week_start, '2026-09-28', 'lundi minuit et demi');
  // Dimanche 23:30 à Paris : encore la même semaine.
  const sun = parisWeek(Date.parse('2026-10-04T21:30:00Z'));
  eq([sun.today, sun.week_start], ['2026-10-04', '2026-09-28'], 'dimanche soir');
  // Passage à l'heure d'hiver (dimanche 25 octobre 2026).
  eq(parisWeek(Date.parse('2026-10-25T22:30:00Z')).week_start, '2026-10-19', 'dimanche 23:30 (UTC+1)');
  const mon = parisWeek(Date.parse('2026-10-25T23:30:00Z'));
  eq([mon.today, mon.week_start, mon.days[6]], ['2026-10-26', '2026-10-26', '2026-11-01'], 'lundi 00:30 après le changement d’heure');
  // Semaine qui contient le passage à l'heure d'été (dimanche 28 mars 2027).
  eq(parisWeek(Date.parse('2027-03-24T12:00:00Z')).days, ['2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26', '2027-03-27', '2027-03-28'], 'heure d’été');
  // Semaine à cheval sur deux années.
  eq(parisWeek(Date.parse('2026-12-31T12:00:00Z')).days[6], '2027-01-03', 'nouvel an');
});

Deno.test('Lot 9 borne : liste blanche — aucun identifiant, note, motif, e-mail ni heure faite', () => {
  const b = buildBoard(input({
    sessions: [{ user_id: U_KARIM, worksite_id: W_DUPONT, planning_id: null, work_date: '2026-10-01', started_at: '2026-10-01T05:42:00Z',
      total_minutes: 480, email: 'karim@exemple.fr' } as unknown as BoardInput['sessions'][number]],
  }));
  const s = JSON.stringify(b);
  ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s), `un uuid est sorti : ${s}`);
  for (const bad of ['notes', 'Code portail', 'absence_type', 'maladie', 'Maladie', 'email', '@', 'total_minutes', 'user_id', 'worksite_id', 'planning_id', 'company_id', 'position', 'created_at', 'started_at']) {
    ok(!s.includes(bad), `« ${bad} » ne doit pas sortir : ${s}`);
  }
  eq(Object.keys(b).sort(), ['absences', 'days', 'live_extra', 'slots', 'today', 'week_start', 'workers'], 'clés de premier niveau');
  eq(Object.keys(b.workers[0]).sort(), ['first_name', 'k', 'last_name', 'tint'], 'clés d’un salarié');
  eq(Object.keys(b.slots[0]).sort(), ['color', 'date', 'hours', 'live', 'sub', 'title', 'w'], 'clés d’une bulle');
  eq(Object.keys(b.absences[0]).sort(), ['date', 'w'], 'clés d’une absence');
  ok(isKioskBoard(b), 'forme reconnue par la borne');
  ok(!isKioskBoard({ revoked: false, planning: [] }), 'une réponse « sync » n’est pas un planning');
});

Deno.test('Lot 9 borne : contenu des bulles, ordre, absence neutre, couleurs du bureau', () => {
  const b = buildBoard(input());
  eq(b.workers.map((w) => `${w.k} ${w.first_name} ${w.last_name}`), ['w0 Julie Bernard', 'w1 Karim Haddad'], 'ordre reçu (prénom), clés locales');
  eq(b.workers[1].tint, hashStr(U_KARIM) % PALETTE_COUNT, 'teinte d’avatar = empreinte du salarié');
  const karimJeudi = b.slots.filter((s) => s.w === 'w1' && s.date === '2026-10-01');
  eq(karimJeudi.map((s) => [s.title, s.sub, s.hours]), [['Villa Dupont', 'Lyon', '07:30–12:00'], ['Cuisine Martin', null, '14:00–18:00']], 'position puis création ; ville ou rien');
  eq(karimJeudi[0].color, hashStr(W_DUPONT) % PALETTE_COUNT, 'couleur = celle du chantier au bureau');
  eq(b.slots.find((s) => s.w === 'w1' && s.date === '2026-10-02')?.hours, '09:00', 'rendez-vous : une seule heure');
  eq(b.absences, [{ w: 'w0', date: '2026-09-29' }], 'une absence, sans motif');
  eq(b.slots.some((s) => s.w === 'w0' && s.date === '2026-09-29'), false, 'une case d’absence ne montre pas de bulle');
  eq(plannedHours(null, '18:00:00'), null, 'sans début : pas d’horaire');
  // Sans chantier : « Chantier », couleur de la ligne (comme paletteFor du bureau).
  const nu = plan({ user_id: U_KARIM, work_date: '2026-10-03' });
  const b2 = buildBoard({ ...input(), planning: [nu] });
  eq([b2.slots[0].title, b2.slots[0].color], ['Chantier', hashStr(nu.id) % PALETTE_COUNT], 'ligne sans chantier');
});

Deno.test('Lot 9 borne : « Autre » reste « Autre », jamais la note', () => {
  const b = buildBoard(input());
  const autre = b.slots.find((s) => s.w === 'w1' && s.date === '2026-10-02')!;
  eq([autre.title, autre.sub], ['Autre', null], 'titre « Autre », pas de ville saisie à la main');
  ok(!JSON.stringify(b).includes('Mme Dupont'), 'la note n’apparaît nulle part');
});

Deno.test('Lot 9 borne : les lignes d’une autre entreprise ne passent pas', () => {
  const b = buildBoard(input({
    planning: [
      ...input().planning,
      plan({ user_id: U_AUTRE_BOITE, work_date: '2026-10-01', worksite_id: W_DUPONT, estimated_start: '06:00:00' }),
      plan({ user_id: U_KARIM, work_date: '2026-10-01', worksite_id: W_HORS_BOITE, estimated_start: '19:00:00' }),
      plan({ user_id: U_KARIM, work_date: '2026-10-08', worksite_id: W_DUPONT, estimated_start: '07:00:00' }),
    ],
    sessions: [{ user_id: U_AUTRE_BOITE, worksite_id: W_DUPONT, planning_id: null, work_date: '2026-10-01', started_at: '2026-10-01T05:00:00Z' }],
  }));
  eq(b.workers.length, 2, 'seulement les salariés de l’entreprise');
  eq(b.slots.some((s) => s.hours === '06:00'), false, 'salarié d’une autre entreprise : ignoré');
  eq(b.slots.some((s) => s.hours === '19:00'), false, 'chantier d’une autre entreprise : ignoré');
  eq(b.slots.some((s) => s.date === '2026-10-08'), false, 'hors de la semaine : ignoré');
  eq([b.live_extra.length, b.slots.some((s) => s.live)], [0, false], 'chrono d’un inconnu : ignoré');
});

Deno.test('Lot 9 borne : « en cours depuis » — aujourd’hui seulement, sur la bonne bulle', () => {
  const base = input();
  const dupontKarim = base.planning[1];
  // planning_id d'abord.
  let b = buildBoard({ ...base, sessions: [{ user_id: U_KARIM, worksite_id: W_MARTIN, planning_id: dupontKarim.id, work_date: '2026-10-01', started_at: '2026-10-01T05:42:00Z' }] });
  eq(b.slots.filter((s) => s.live).map((s) => [s.w, s.title, s.live]), [['w1', 'Villa Dupont', '07:42']], 'bulle du planning_id');
  // Puis le même chantier.
  b = buildBoard({ ...base, sessions: [{ user_id: U_KARIM, worksite_id: W_MARTIN, planning_id: null, work_date: '2026-10-01', started_at: '2026-10-01T05:42:00Z' }] });
  eq(b.slots.filter((s) => s.live).map((s) => s.title), ['Cuisine Martin'], 'bulle du même chantier');
  // Chantier hors planning : jamais « la première bulle », une ligne à part.
  b = buildBoard({ ...base, sessions: [{ user_id: U_KARIM, worksite_id: W_AILLEURS, planning_id: null, work_date: '2026-10-01', started_at: '2026-10-01T05:42:00Z' }] });
  eq(b.slots.some((s) => s.live), false, 'aucune bulle désignée par défaut');
  eq(b.live_extra, [{ w: 'w1', date: '2026-10-01', title: 'Dépôt Vénissieux', since: '07:42' }], 'chantier pointé à part');
  // Chantier inconnu (supprimé, autre entreprise) : « Chantier ».
  b = buildBoard({ ...base, sessions: [{ user_id: U_KARIM, worksite_id: W_HORS_BOITE, planning_id: null, work_date: '2026-10-01', started_at: '2026-10-01T05:42:00Z' }] });
  eq(b.live_extra.map((x) => x.title), ['Chantier'], 'nom inconnu → « Chantier »');
  // Un chrono resté ouvert d'un autre jour : rien.
  b = buildBoard({ ...base, sessions: [{ user_id: U_JULIE, worksite_id: W_DUPONT, planning_id: null, work_date: '2026-09-30', started_at: '2026-09-30T06:00:00Z' }] });
  eq([b.slots.some((s) => s.live), b.live_extra.length], [false, 0], 'hier : pas « en cours »');
  // Jamais la bulle d'un collègue.
  b = buildBoard({ ...base, sessions: [{ user_id: U_JULIE, worksite_id: W_DUPONT, planning_id: dupontKarim.id, work_date: '2026-10-01', started_at: '2026-10-01T06:15:00Z' }] });
  eq(b.slots.filter((s) => s.live).map((s) => [s.w, s.title, s.live]), [['w0', 'Villa Dupont', '08:15']], 'Julie : sa propre bulle (même chantier), pas celle de Karim');
});

Deno.test('Lot 9 borne : même empreinte de couleur que le bureau (planning-bubble.tsx)', async () => {
  const src = await Deno.readTextFile(new URL('../../../components/planning-bubble.tsx', import.meta.url));
  const m = src.match(/export function hashStr\(s: string\): number \{([\s\S]*?)\n\}/);
  ok(!!m, 'hashStr introuvable dans planning-bubble.tsx');
  // Le corps est du JavaScript pur : on l'exécute tel quel.
  const office = new Function('s', m![1]) as (s: string) => number;
  for (const s of [U_KARIM, W_DUPONT, W_AUTRE, 'x', '', 'Villa Dupont — Lyon']) eq(hashStr(s), office(s), `empreinte de « ${s} »`);
  ok(/CHANTIER_PALETTES: ChantierPalette\[\] = \[(\s*\{[^}]*\},?){7}\s*\]/.test(src), `le bureau a ${PALETTE_COUNT} couleurs`);
});
