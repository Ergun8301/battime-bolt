import { assertEquals } from 'jsr:@std/assert@1';
import {
  addressKey, amountsFrom, btpDays, btpRecap, dayZoneText, distanceKm, emptyAmounts, hasAmounts, limitsFrom, zoneFor,
  DEFAULT_LIMITS_KM, type BtpContext,
} from './btp-zones.ts';

Deno.test('zones par défaut : 1A 0-5, 1B 5-10, 2 10-20 … 5 40-50, au-delà grand déplacement', () => {
  assertEquals(zoneFor(0), '1A');
  assertEquals(zoneFor(5), '1A');
  assertEquals(zoneFor(5.1), '1B');
  assertEquals(zoneFor(10), '1B');
  assertEquals(zoneFor(19.9), '2');
  assertEquals(zoneFor(30), '3');
  assertEquals(zoneFor(35), '4');
  assertEquals(zoneFor(50), '5');
  assertEquals(zoneFor(50.1), 'GD');
});

Deno.test('limites personnalisées : croissantes, six valeurs, sinon refusées', () => {
  assertEquals(limitsFrom([0, 10, 20, 30, 40, 50]), [0, 10, 20, 30, 40, 50]);
  assertEquals(zoneFor(3, [0, 10, 20, 30, 40, 50]), '1B');
  assertEquals(limitsFrom(['5', '10,5', 20, 30, 40, 60]), [5, 10.5, 20, 30, 40, 60]);
  assertEquals(limitsFrom([5, 5, 20, 30, 40, 50]), null);
  assertEquals(limitsFrom([5, 10, 20]), null);
  assertEquals(limitsFrom([-1, 10, 20, 30, 40, 50]), null);
  assertEquals(limitsFrom(null), null);
});

Deno.test('distance à vol d\'oiseau : Paris (Notre-Dame) → Versailles (château) ≈ 17,6 km', () => {
  const km = distanceKm({ lat: 48.8530, lng: 2.3499 }, { lat: 48.8049, lng: 2.1204 });
  assertEquals(km > 17 && km < 18, true);
  assertEquals(zoneFor(km, DEFAULT_LIMITS_KM), '2');
});

Deno.test('montants : vides par défaut, tout ce qui n\'est pas un montant ≥ 0 disparaît', () => {
  assertEquals(hasAmounts(amountsFrom({})), false);
  assertEquals(hasAmounts(amountsFrom(null)), false);
  const a = amountsFrom({ trajet: { '1A': '0,79', '2': -3, x: 4 }, transport: { GD: 9, '5': 6 }, panier: 11.5 });
  assertEquals(a.trajet, { '1A': 0.79 });
  assertEquals(a.transport, { '5': 6 }); // grand déplacement : autre régime, pas de montant ici
  assertEquals(a.panier, 11.5);
});

Deno.test('clé d\'adresse : espaces et casse ignorés', () => {
  assertEquals(addressKey({ address: ' 8  Bd du Port ', postal_code: '80000', city: 'AMIENS' }), '8 bd du port 80000 amiens');
  assertEquals(addressKey({}), '');
});

const ctx = (): BtpContext => ({
  limits: [...DEFAULT_LIMITS_KM],
  origin: { lat: 48.8530, lng: 2.3499 },
  geo: new Map([
    ['pres', { lat: 48.8530, lng: 2.3799 }], // ≈ 2,2 km
    ['loin', { lat: 48.8049, lng: 2.1204 }], // ≈ 17,6 km
    ['introuvable', null],
  ]),
  roles: new Map([['ouvrier', 'worker'], ['chef', 'lead'], ['patron', 'admin']]),
  amounts: emptyAmounts(),
});

Deno.test('journée : la zone la plus lointaine du jour ; le bureau n\'a pas de zone ; un chantier non placé = à vérifier', () => {
  const days = btpDays([
    { id: '1', user_id: 'ouvrier', work_date: '2026-10-19', worksite_id: 'pres', meal_allowance: false },
    { id: '2', user_id: 'ouvrier', work_date: '2026-10-19', worksite: { id: 'loin' }, meal_allowance: true },
    { id: '3', user_id: 'ouvrier', work_date: '2026-10-20', worksite_id: 'introuvable' },
    { id: '4', user_id: 'chef', work_date: '2026-10-19', worksite_id: 'pres' },
    { id: '5', user_id: 'patron', work_date: '2026-10-19', worksite_id: 'loin' },
    { id: '6', user_id: 'inconnu', work_date: '2026-10-19', worksite_id: 'loin' },
  ], ctx());
  assertEquals(dayZoneText(days.get('ouvrier|2026-10-19')), '2');
  assertEquals(days.get('ouvrier|2026-10-19')?.panier, true);
  assertEquals(dayZoneText(days.get('ouvrier|2026-10-20')), 'À vérifier');
  assertEquals(dayZoneText(days.get('chef|2026-10-19')), '1A');
  assertEquals(days.has('patron|2026-10-19'), false);
  assertEquals(days.has('inconnu|2026-10-19'), false);
});

Deno.test('sans point de départ : rien n\'est deviné, tout est à vérifier', () => {
  const c = ctx(); c.origin = null;
  const days = btpDays([{ id: '1', user_id: 'ouvrier', work_date: '2026-10-19', worksite_id: 'pres' }], c);
  assertEquals(dayZoneText(days.get('ouvrier|2026-10-19')), 'À vérifier');
});

Deno.test('récapitulatif : jours par zone, paniers par jour coché, montants seulement s\'ils sont remplis', () => {
  const c = ctx();
  const lines = [
    { id: '1', user_id: 'ouvrier', work_date: '2026-10-19', worksite_id: 'loin', meal_allowance: true },
    { id: '2', user_id: 'ouvrier', work_date: '2026-10-19', worksite_id: 'loin', meal_allowance: true },
    { id: '3', user_id: 'ouvrier', work_date: '2026-10-20', worksite_id: 'pres' },
    { id: '4', user_id: 'ouvrier', work_date: '2026-10-21', worksite_id: 'introuvable', meal_allowance: true },
  ];
  const sans = btpRecap(btpDays(lines, c), c.amounts)[0];
  assertEquals(sans.days, { '2': 1, '1A': 1 });
  assertEquals(sans.aVerifier, 1);
  assertEquals(sans.paniers, 2);
  assertEquals([sans.trajet, sans.transport, sans.panier], [null, null, null]);

  const a = amountsFrom({ trajet: { '1A': 0.79, '2': 2.89 }, panier: 11.5 });
  const avec = btpRecap(btpDays(lines, c), a)[0];
  assertEquals(avec.trajet, 3.68);
  assertEquals(avec.transport, null);
  assertEquals(avec.panier, 23);
});
