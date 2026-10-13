// Tests de l'appairage en un geste (lot 11) : `npm run test:appairage` (Deno).
// Règles pures : code de vérification, identifiant de demande signé, leurres,
// seaux de débit, messages. La fonction elle-même est testée de bout en bout
// dans kiosk-function.check.ts (base simulée).
import {
  buildChoices, displayCodeFromBytes, formatDisplayCode, hammingDistance, isDeviceSecret, minutesLabel, normalizeDisplayCode,
  pairBucket, pairThrottleFull, pairThrottleNext, pairUrl, pickDecoys, ridBody, ridDecode, ridEncode, secretFingerprint,
  MAX_PAIR_ADMIN_OPS_PER_COMPANY, MAX_PAIR_REQUESTS_PER_BUCKET, PAIR_CLAIM_GRACE_MS, PAIR_CO_BUCKET_BASE, PAIR_CODE_ALPHABET,
  PAIR_FRAGMENT_RE, PAIR_REFUSAL_MESSAGES, PAIR_REPLACE_ALIVE_MS, PAIR_REPLAY_WINDOW_MS, PAIR_REQ_BUCKET_BASE, PAIR_REQUEST_TTL_MS,
  PAIR_RID_LENGTH, PAIR_THROTTLE_WINDOW_MS, SUPPORT_READONLY_MESSAGE,
} from './kiosk-pair.ts';
import { PAIR_STASH_RE } from '../../../lib/kiosk-pair-stash.ts';
import { toBase64Url } from './kiosk-code.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: unknown, msg: string) { if (!c) throw new Error(msg); }

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const bytes = (n: number, fill: (i: number) => number) => Uint8Array.from({ length: n }, (_, i) => fill(i));

Deno.test('constantes : durées et plafonds du contrat', () => {
  eq([PAIR_REQUEST_TTL_MS, PAIR_CLAIM_GRACE_MS, PAIR_REPLAY_WINDOW_MS, PAIR_REPLACE_ALIVE_MS, PAIR_THROTTLE_WINDOW_MS],
    [600_000, 180_000, 180_000, 900_000, 600_000], 'durées');
  eq([MAX_PAIR_REQUESTS_PER_BUCKET, MAX_PAIR_ADMIN_OPS_PER_COMPANY, PAIR_RID_LENGTH], [30, 20, 60], 'plafonds et longueur');
});

Deno.test('alphabet : 27 signes, aucun de 0 O 1 I L U S Z B', () => {
  eq(PAIR_CODE_ALPHABET.length, 27, '27 signes');
  eq(new Set(PAIR_CODE_ALPHABET).size, 27, 'sans doublon');
  for (const c of '0O1ILUSZB') ok(!PAIR_CODE_ALPHABET.includes(c), `« ${c} » est absent`);
});

Deno.test('displayCodeFromBytes : 6 signes de l’alphabet, déterministe, octets ≥ 243 écartés', () => {
  const a = displayCodeFromBytes(bytes(32, (i) => i * 7 % 243));
  eq(a.length, 6, '6 signes');
  ok([...a].every((c) => PAIR_CODE_ALPHABET.includes(c)), 'signes de l’alphabet');
  eq(displayCodeFromBytes(bytes(32, (i) => i * 7 % 243)), a, 'déterministe');
  // Les octets 0, 1, 2… donnent les signes dans l’ordre de l’alphabet.
  eq(displayCodeFromBytes(Uint8Array.from([0, 1, 2, 3, 4, 5])), PAIR_CODE_ALPHABET.slice(0, 6), 'octets 0 à 5');
  // 243 = 9 × 27 : le dernier octet accepté (242) donne le dernier signe, 243 et plus sont écartés.
  eq(displayCodeFromBytes(Uint8Array.from([242, 242, 242, 242, 242, 242])), 'YYYYYY', 'octet 242');
  eq(displayCodeFromBytes(Uint8Array.from([243, 255, 244, 0, 1, 2, 3, 4, 5])), PAIR_CODE_ALPHABET.slice(0, 6), 'octets ≥ 243 écartés (pas de biais)');
  let threw = false;
  try { displayCodeFromBytes(bytes(32, () => 250)); } catch { threw = true; }
  ok(threw, 'lève si 32 octets ne suffisent pas');
  // Sans biais : chaque signe sort autant de fois (9 octets chacun) sur les 243 octets acceptés.
  const count = new Map<string, number>();
  for (let b = 0; b < 243; b++) { const c = PAIR_CODE_ALPHABET[b % 27]; count.set(c, (count.get(c) || 0) + 1); }
  ok([...count.values()].every((n) => n === 9), 'répartition uniforme');
});

Deno.test('formatDisplayCode / normalizeDisplayCode : casse, espaces, tiret, signe étranger', () => {
  eq(formatDisplayCode('K7M4QX'), 'K7M 4QX', 'format');
  eq(normalizeDisplayCode('K7M 4QX'), 'K7M4QX', 'espace');
  eq(normalizeDisplayCode(' k7m-4qx '), 'K7M4QX', 'casse, tiret, espaces');
  eq(normalizeDisplayCode('K7M 4Q0'), '', 'le zéro n’est pas dans l’alphabet');
  eq(normalizeDisplayCode('K7M 4QO'), '', 'le O non plus');
  eq(normalizeDisplayCode('K7M 4Q€'), '', 'signe étranger');
  eq(normalizeDisplayCode(''), '', 'vide');
  eq(normalizeDisplayCode(formatDisplayCode('23AC9D')), '23AC9D', 'aller-retour');
});

Deno.test('hammingDistance : positions qui diffèrent', () => {
  eq(hammingDistance('K7M4QX', 'K7M4QX'), 0, 'identiques');
  eq(hammingDistance('K7M4QX', 'K7M4QY'), 1, 'une différence');
  eq(hammingDistance('K7M4QX', 'ACDEFG'), 6, 'toutes');
  eq(hammingDistance('K7M4QX', 'K7MAAA'), 3, 'trois');
});

Deno.test('pickDecoys : 3 leurres distincts, distance ≥ 3 avec le vrai et entre eux, complète s’il en manque', () => {
  const real = 'K7M4QX';
  // Candidats : un trop proche du vrai, un doublon, puis des bons.
  const cands = ['K7M4QY', 'ACDEFG', 'ACDEFG', 'ACDEFH', 'HJKMNP', 'RTVWXY', '234567', '89ACDE'];
  const d = pickDecoys(real, cands);
  eq(d, ['ACDEFG', 'HJKMNP', 'RTVWXY'], 'le premier de chaque, en ignorant les ressemblants et les doublons');
  for (const x of d) ok(hammingDistance(x, real) >= 3, `${x} loin du vrai`);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) ok(hammingDistance(d[i], d[j]) >= 3, 'leurres éloignés entre eux');
  // Pas assez de candidats éloignés : on complète avec les premiers restants (jamais le vrai, jamais un doublon).
  const poor = pickDecoys(real, ['K7M4QY', 'K7M4QZ', 'K7M4QX', 'K7M4QY', 'K7M4QW']);
  eq(poor.length, 3, 'toujours 3');
  eq(new Set(poor).size, 3, 'distincts');
  ok(!poor.includes(real), 'jamais le vrai code');
});

Deno.test('buildChoices : 4 codes distincts, le vrai au bon rang', () => {
  const decoys = ['ACDEFG', 'HJKMNP', 'RTVWXY'];
  for (let slot = 0; slot < 4; slot++) {
    const c = buildChoices('K7M4QX', decoys, slot);
    eq(c.length, 4, '4 codes');
    eq(new Set(c).size, 4, 'distincts');
    eq(c[slot], 'K7M4QX', `le vrai au rang ${slot}`);
    eq(c.filter((x) => x !== 'K7M4QX'), decoys, 'les leurres gardent leur ordre');
  }
});

Deno.test('identifiant de demande : aller-retour, 60 signes, version, longueur, alphabet', () => {
  const nonce = bytes(8, (i) => 10 + i);
  const sh = bytes(16, (i) => 100 + i);
  const exp = 1_800_000_000;
  const body = ridBody(exp, nonce, sh);
  eq(body.length, 29, 'corps de 29 octets');
  eq(body[0], 1, 'version 1');
  const mac = bytes(16, (i) => 200 + i);
  const rid = ridEncode(body, mac);
  eq(rid.length, 60, '60 caractères');
  ok(/^[A-Za-z0-9_-]{60}$/.test(rid), 'base64url');
  const d = ridDecode(rid)!;
  ok(d, 'décodé');
  eq([d.exp, [...d.body], [...d.mac]], [exp, [...body], [...mac]], 'exp, corps et signature');
  eq(d.sh, toBase64Url(sh), 'empreinte du secret en base64url');
  eq(d.sh.length, 22, '22 signes');
  // exp sur 32 bits, au-delà de 2^31 aussi.
  eq(ridDecode(ridEncode(ridBody(4_000_000_000, nonce, sh), mac))!.exp, 4_000_000_000, 'exp > 2^31');
  eq(ridDecode(rid.slice(0, 59)), null, '59 signes refusés');
  eq(ridDecode(rid + 'A'), null, '61 signes refusés');
  eq(ridDecode(rid.slice(0, 59) + '='), null, 'signe hors base64url refusé');
  eq(ridDecode(rid.slice(0, 10) + '+' + rid.slice(11)), null, '« + » refusé');
  const other = ridBody(exp, nonce, sh); other[0] = 2;
  eq(ridDecode(ridEncode(other, mac)), null, 'version ≠ 1 refusée');
  eq(ridDecode(''), null, 'vide');
});

Deno.test('PAIR_FRAGMENT_RE : accepte 60 signes, refuse le reste ; même expression que le stockage du bureau', () => {
  const ok60 = 'A'.repeat(30) + 'b_-9'.repeat(7) + 'cd';
  eq(ok60.length, 60, 'exemple de 60 signes');
  ok(PAIR_FRAGMENT_RE.test(`#borne=${ok60}`), '60 signes acceptés');
  ok(!PAIR_FRAGMENT_RE.test(`#borne=${ok60.slice(1)}`), '59 refusés');
  ok(!PAIR_FRAGMENT_RE.test(`#borne=${ok60}A`), '61 refusés');
  ok(!PAIR_FRAGMENT_RE.test(`#borne=${ok60}&x=1`), 'paramètre en plus refusé');
  ok(!PAIR_FRAGMENT_RE.test(`#Borne=${ok60}`), 'casse de « borne » exacte');
  ok(!PAIR_FRAGMENT_RE.test(`borne=${ok60}`), '« # » obligatoire');
  ok(!PAIR_FRAGMENT_RE.test(`#borne=${'='.repeat(60)}`), 'jamais de « = » dans l’identifiant (donc jamais « type= »)');
  eq(PAIR_STASH_RE.source, PAIR_FRAGMENT_RE.source, 'la copie du layout du bureau (lib/kiosk-pair-stash.ts) est identique');
});

Deno.test('pairUrl : /admin#borne=<identifiant>, sans double barre', () => {
  eq(pairUrl('https://bemexo.com', 'RID'), 'https://bemexo.com/admin#borne=RID', 'adresse');
  eq(pairUrl('https://bemexo.com///', 'RID'), 'https://bemexo.com/admin#borne=RID', 'barres finales retirées');
});

Deno.test('isDeviceSecret / secretFingerprint : 43 signes, empreinte stable de 22 signes', async () => {
  const secret = toBase64Url(bytes(32, (i) => i));
  eq(secret.length, 43, 'un secret de 32 octets = 43 signes');
  ok(isDeviceSecret(secret), 'secret valable');
  ok(!isDeviceSecret(secret.slice(1)), '42 signes refusés');
  ok(!isDeviceSecret(secret + 'A'), '44 signes refusés');
  ok(!isDeviceSecret(secret.slice(1) + '='), 'hors alphabet refusé');
  ok(!isDeviceSecret(null) && !isDeviceSecret(42) && !isDeviceSecret(undefined), 'pas une chaîne');
  const fp = await secretFingerprint(secret);
  eq(fp.length, 22, '22 signes');
  eq(await secretFingerprint(secret), fp, 'stable');
  ok(await secretFingerprint(secret.slice(0, 42) + 'Z') !== fp, 'un autre secret, une autre empreinte');
  // Valeur de référence : SHA-256("abc") commence par ba7816bf8f01cfea414140de5dae2223 → base64url de ces 16 octets.
  eq(await secretFingerprint('abc'), 'ungWv48Bz-pBQUDeXa4iIw', 'SHA-256 tronqué à 16 octets');
});

Deno.test('pairBucket : demandes anonymes 0-2047, bureau 2048-4095, jamais de recouvrement', () => {
  let minReq = Infinity, maxReq = -1, minCo = Infinity, maxCo = -1;
  for (const a of B64URL) for (const b of B64URL) {
    const h = `${a}${b}xxxxxxxx`;
    const r = pairBucket('req', h), c = pairBucket('co', h);
    minReq = Math.min(minReq, r); maxReq = Math.max(maxReq, r);
    minCo = Math.min(minCo, c); maxCo = Math.max(maxCo, c);
  }
  eq([minReq, maxReq], [0, 2047], 'req : 0 à 2047');
  eq([minCo, maxCo], [2048, 4095], 'co : 2048 à 4095');
  eq([PAIR_REQ_BUCKET_BASE, PAIR_CO_BUCKET_BASE], [0, 2048], 'bases');
  ok(maxReq < minCo, 'aucun recouvrement');
});

Deno.test('pairThrottleFull / pairThrottleNext : fenêtre de 10 min, plafond paramétré', () => {
  const t0 = Date.parse('2026-10-13T10:00:00Z');
  let row = pairThrottleNext(null, t0);
  eq(row, { hits: 1, window_start: '2026-10-13T10:00:00.000Z' }, 'premier coup');
  for (let i = 1; i < 30; i++) row = pairThrottleNext(row, t0 + i * 1000);
  eq(row.hits, 30, '30 coups dans la fenêtre');
  eq(row.window_start, '2026-10-13T10:00:00.000Z', 'la fenêtre ne bouge pas');
  ok(pairThrottleFull(row, t0 + 60_000, 30), 'plein à 30');
  ok(!pairThrottleFull(row, t0 + 60_000, 31), 'pas plein si le plafond est 31');
  ok(pairThrottleFull({ hits: 20, window_start: row.window_start }, t0 + 60_000, 20), 'plafond de 20 pour le bureau');
  ok(!pairThrottleFull({ hits: 19, window_start: row.window_start }, t0 + 60_000, 20), '19 sur 20 : pas plein');
  ok(!pairThrottleFull(row, t0 + 10 * 60_000, 30), 'après 10 min : plus plein');
  eq(pairThrottleNext(row, t0 + 10 * 60_000), { hits: 1, window_start: '2026-10-13T10:10:00.000Z' }, 'repart à 1 après 10 min');
  ok(!pairThrottleFull(null, t0, 30) && !pairThrottleFull(undefined, t0, 30), 'pas de ligne : pas plein');
  ok(!pairThrottleFull({ hits: 99, window_start: 'pas une date' }, t0, 30), 'date illisible : pas plein');
});

Deno.test('minutesLabel : « moins d’une minute » puis minutes arrondies', () => {
  eq(minutesLabel(0), 'moins d’une minute', '0 s');
  eq(minutesLabel(59), 'moins d’une minute', '59 s');
  eq(minutesLabel(60), '1 min', '60 s');
  eq(minutesLabel(119), '2 min', '119 s arrondi');
  eq(minutesLabel(600), '10 min', '10 min');
});

Deno.test('messages de refus : aucun texte vide, support_readonly identique côté serveur et navigateur', () => {
  for (const [code, msg] of Object.entries(PAIR_REFUSAL_MESSAGES)) ok(msg.trim().length > 10, `${code} : texte non vide`);
  eq(Object.keys(PAIR_REFUSAL_MESSAGES).sort(),
    ['pair_code_wrong', 'pair_request_expired', 'pair_request_invalid', 'pair_request_used', 'pair_throttled', 'replace_required', 'support_readonly'], 'les 7 refus du chemin');
  eq(PAIR_REFUSAL_MESSAGES.support_readonly, SUPPORT_READONLY_MESSAGE, 'support_readonly');
  eq(SUPPORT_READONLY_MESSAGE, 'Compte support BEMEXO : lecture seule. Utilisez le compte du patron pour associer une tablette.', 'texte exact');
});
