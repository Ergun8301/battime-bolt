// Tests du cœur de la borne de pointage QR.
// Lancer : npm test   (Node ≥ 22.18 : exécute le .ts directement)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkScan, codeForStep, deriveTotpKey, distanceM, isAsleep, randomHex, randomPairingCode,
  scanUrl, stepAt, verifyCode, KIOSK_STEP_SECONDS,
} from '../supabase/functions/_shared/kiosk-core.ts';

const NOW = Date.UTC(2026, 8, 29, 6, 2, 30); // 08:02:30 à Paris
const MIN = KIOSK_STEP_SECONDS * 1000;
const COMPANY = 'c-1';

async function setup() {
  const secret = randomHex(32);
  const key = await deriveTotpKey(secret);
  const device = { company_id: COMPANY, revoked_at: null, totp_key: key, latitude: 48.8566, longitude: 2.3522 };
  const base = {
    device, kioskEnabled: true, user: { company_id: COMPANY, is_active: true },
    code: await codeForStep(key, stepAt(NOW)), nowMs: NOW, lastScanAtMs: null, requireGps: false, position: null,
  };
  return { secret, key, device, base };
}

test('tablette = serveur : la clé dérivée et le code sont identiques des deux côtés', async () => {
  const secret = randomHex(32);
  // La tablette dérive la clé depuis son secret ; le serveur a stocké la même dérivation.
  const tabletKey = await deriveTotpKey(secret);
  const serverKey = await deriveTotpKey(secret);
  assert.equal(tabletKey, serverKey);
  assert.notEqual(tabletKey, secret, 'la clé ne doit pas être le secret');
  const code = await codeForStep(tabletKey, stepAt(NOW));
  assert.match(code, /^\d{8}$/);
  assert.equal(await verifyCode(serverKey, code, NOW), true);
});

test('le code change à chaque minute', async () => {
  const { key } = await setup();
  const a = await codeForStep(key, stepAt(NOW));
  const b = await codeForStep(key, stepAt(NOW) + 1);
  assert.notEqual(a, b);
});

test('tolérance ±1 pas : accepté juste avant / juste après', async () => {
  const { key } = await setup();
  const code = await codeForStep(key, stepAt(NOW));
  assert.equal(await verifyCode(key, code, NOW + MIN), true);
  assert.equal(await verifyCode(key, code, NOW - MIN), true);
});

test('code expiré refusé (2 pas plus tard)', async () => {
  const { base } = await setup();
  const r = await checkScan({ ...base, nowMs: NOW + 2 * MIN });
  assert.deepEqual(r, { ok: false, reason: 'code_invalid' });
});

test('code d\'une autre borne refusé', async () => {
  const { base } = await setup();
  const other = await deriveTotpKey(randomHex(32));
  const r = await checkScan({ ...base, code: await codeForStep(other, stepAt(NOW)) });
  assert.deepEqual(r, { ok: false, reason: 'code_invalid' });
});

test('code mal formé refusé', async () => {
  const { base } = await setup();
  for (const code of ['', '1234', 'abcdefgh', '123456789']) {
    assert.deepEqual(await checkScan({ ...base, code }), { ok: false, reason: 'code_invalid' });
  }
});

test('scan valide accepté', async () => {
  const { base } = await setup();
  assert.deepEqual(await checkScan(base), { ok: true, distance: null });
});

test('borne révoquée refusée, même avec un code valide', async () => {
  const { base, device } = await setup();
  const r = await checkScan({ ...base, device: { ...device, revoked_at: '2026-09-29T06:00:00Z' } });
  assert.deepEqual(r, { ok: false, reason: 'revoked' });
});

test('autre entreprise refusée (et rien n\'est dit sur la borne)', async () => {
  const { base, device } = await setup();
  const r = await checkScan({ ...base, user: { company_id: 'c-2', is_active: true } });
  assert.deepEqual(r, { ok: false, reason: 'other_company' });
  // Même révoquée, un étranger n'apprend pas qu'elle l'est.
  const r2 = await checkScan({ ...base, device: { ...device, revoked_at: 'x' }, user: { company_id: 'c-2', is_active: true } });
  assert.deepEqual(r2, { ok: false, reason: 'other_company' });
});

test('compte archivé refusé', async () => {
  const { base } = await setup();
  assert.deepEqual(await checkScan({ ...base, user: { company_id: COMPANY, is_active: false } }), { ok: false, reason: 'other_company' });
});

test('borne inconnue refusée', async () => {
  const { base } = await setup();
  assert.deepEqual(await checkScan({ ...base, device: null }), { ok: false, reason: 'device_unknown' });
});

test('interrupteur éteint : tout est refusé', async () => {
  const { base } = await setup();
  assert.deepEqual(await checkScan({ ...base, kioskEnabled: false }), { ok: false, reason: 'kiosk_off' });
});

test('double scan dans la minute refusé, accepté après', async () => {
  const { base } = await setup();
  assert.deepEqual(await checkScan({ ...base, lastScanAtMs: NOW - 20_000 }), { ok: false, reason: 'duplicate' });
  assert.equal((await checkScan({ ...base, lastScanAtMs: NOW - 61_000 })).ok, true);
});

test('option GPS : position demandée, < 200 m accepté, > 200 m refusé', async () => {
  const { base } = await setup();
  const gps = { ...base, requireGps: true };
  assert.deepEqual(await checkScan(gps), { ok: false, reason: 'need_position' });
  const near = await checkScan({ ...gps, position: { lat: 48.8570, lng: 2.3525 } });
  assert.equal(near.ok, true);
  const far = await checkScan({ ...gps, position: { lat: 48.8666, lng: 2.3522 } });
  assert.deepEqual(far, { ok: false, reason: 'too_far' });
});

test('option GPS désactivée : aucune position demandée', async () => {
  const { base } = await setup();
  assert.equal((await checkScan({ ...base, requireGps: false, position: null })).ok, true);
});

test('distance haversine plausible', () => {
  const d = distanceM({ lat: 48.8566, lng: 2.3522 }, { lat: 48.8666, lng: 2.3522 });
  assert.ok(d > 1100 && d < 1120, String(d));
});

test('veille : plage simple, plage qui passe minuit, sans horaires', () => {
  const at = (h, m = 0) => new Date(2026, 8, 29, h, m);
  assert.equal(isAsleep('06:00', '20:00', at(5, 59)), true);
  assert.equal(isAsleep('06:00', '20:00', at(6, 0)), false);
  assert.equal(isAsleep('06:00', '20:00', at(20, 0)), true);
  assert.equal(isAsleep('22:00', '06:00', at(23)), false);
  assert.equal(isAsleep('22:00', '06:00', at(12)), true);
  assert.equal(isAsleep(null, null, at(3)), false);
});

test('code d\'appairage : 6 chiffres', () => {
  for (let i = 0; i < 50; i++) assert.match(randomPairingCode(), /^\d{6}$/);
});

test('adresse du QR', () => {
  assert.equal(scanUrl('https://bemexo.com', 'abc', '12345678'), 'https://bemexo.com/pointer?b=abc&c=12345678');
});
