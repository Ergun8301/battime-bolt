// Tests de la borne de pointage : `npm run test:kiosk` (Deno).
import { createHmac } from 'node:crypto';
import {
  codeAt, codeForStep, deriveSeed, fromBase64Url, scanUrl, sha256Hex, stepAt,
  toBase64Url, verifyCode, KIOSK_DIGITS,
} from './kiosk-code.ts';
import {
  arrivalPlace, checkScan, decideAction, isAsleep, isClosedError, pairThrottled, parisDate, parisLongDate, rpcMissing,
  MAX_PAIR_FAILURES_GLOBAL, MAX_PAIR_FAILURES_PER_IP, REFUSAL_MESSAGES, type ScanContext,
} from './kiosk-rules.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

const enc = new TextEncoder();

Deno.test('RFC 6238 — vecteurs officiels HMAC-SHA-256, 8 chiffres, pas de 30 s', async () => {
  const seed = enc.encode('12345678901234567890123456789012');
  const vectors: [number, string][] = [
    [59, '46119246'], [1111111109, '68084774'], [1111111111, '67062674'],
    [1234567890, '91819424'], [2000000000, '90698825'], [20000000000, '77737706'],
  ];
  for (const [t, expected] of vectors) {
    eq(await codeForStep(seed, stepAt(t * 1000, 30), 8), expected, `T=${t}`);
  }
});

Deno.test('RFC 6238 — vecteurs officiels HMAC-SHA-1 (même algorithme, autre hachage)', async () => {
  const seed = enc.encode('12345678901234567890');
  eq(await codeForStep(seed, stepAt(59_000, 30), 8, 'SHA-1'), '94287082', 'T=59');
  eq(await codeForStep(seed, stepAt(1111111109_000, 30), 8, 'SHA-1'), '07081804', 'T=1111111109');
});

/** Implémentation indépendante (node:crypto) : ce que ferait un autre appareil. */
function referenceCode(seed: Uint8Array, nowMs: number): string {
  const step = Math.floor(nowMs / 1000 / 60);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha256', new Uint8Array(Buffer.from(seed))).update(new Uint8Array(counter)).digest();
  const o = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 10 ** 8).padStart(8, '0');
}

Deno.test('La tablette et le serveur donnent le même code', async () => {
  // La tablette reçoit la graine en base64url à l'appairage et la décode.
  const serverSeed = await deriveSeed('cle-serveur', 'kiosk-1', 'sel-1');
  const tabletSeed = fromBase64Url(toBase64Url(serverSeed));
  for (const t of [Date.UTC(2026, 8, 29, 6, 30), Date.UTC(2026, 11, 31, 23, 59, 59), Date.now()]) {
    const tablet = await codeAt(tabletSeed, t);
    eq(tablet.length, KIOSK_DIGITS, 'longueur');
    eq(tablet, referenceCode(serverSeed, t), 'même code que l’implémentation de référence');
    eq(await verifyCode(serverSeed, tablet, t), 0, 'le serveur accepte le code de la tablette');
  }
});

Deno.test('Tolérance ±1 pas, code expiré refusé', async () => {
  const seed = await deriveSeed('cle-serveur', 'kiosk-1', 'sel-1');
  const t = Date.UTC(2026, 8, 29, 8, 0, 30);
  const code = await codeAt(seed, t);
  eq(await verifyCode(seed, code, t + 60_000), -1, 'une minute plus tard : accepté');
  eq(await verifyCode(seed, code, t - 60_000), 1, 'horloge de la tablette en avance : accepté');
  eq(await verifyCode(seed, code, t + 120_000), null, 'deux minutes plus tard : refusé');
  eq(await verifyCode(seed, code, t + 3_600_000), null, 'une heure plus tard : refusé');
  eq(await verifyCode(seed, '1234', t), null, 'mauvaise longueur');
  eq(await verifyCode(seed, 'abcdefgh', t), null, 'pas des chiffres');
});

Deno.test('Graine : propre à chaque borne, change au réappairage, inconnue sans la clé serveur', async () => {
  const a = toBase64Url(await deriveSeed('cle', 'k1', 's1'));
  eq(a, toBase64Url(await deriveSeed('cle', 'k1', 's1')), 'déterministe');
  if (a === toBase64Url(await deriveSeed('cle', 'k2', 's1'))) throw new Error('deux bornes, même graine');
  if (a === toBase64Url(await deriveSeed('cle', 'k1', 's2'))) throw new Error('nouveau sel, même graine');
  if (a === toBase64Url(await deriveSeed('autre-cle', 'k1', 's1'))) throw new Error('clé serveur ignorée');
  const t = Date.UTC(2026, 8, 29, 8, 0);
  eq(await verifyCode(await deriveSeed('cle', 'k2', 's1'), await codeAt(await deriveSeed('cle', 'k1', 's1'), t), t), null,
    'le code d’une borne ne vaut pas pour une autre');
});

Deno.test('Empreinte et adresse du QR', async () => {
  eq(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 connu');
  eq(scanUrl('https://bemexo.com/', 'abc-123', '01234567'), 'https://bemexo.com/pointer?k=abc-123&c=01234567', 'adresse');
});

const base = (): ScanContext => ({
  kiosk: { id: 'k1', company_id: 'c1', revoked_at: null },
  companyKioskEnabled: true,
  user: { company_id: 'c1', is_active: true },
  lastPunchAt: null,
  nowMs: Date.UTC(2026, 8, 29, 7, 0),
});

Deno.test('Contrôles avant pointage', () => {
  eq(checkScan(base()), null, 'cas normal accepté');
  eq(checkScan({ ...base(), kiosk: null }), 'kiosk_unknown', 'borne inconnue');
  eq(checkScan({ ...base(), kiosk: { ...base().kiosk!, revoked_at: '2026-09-29T06:00:00Z' } }), 'kiosk_revoked', 'borne retirée refusée');
  eq(checkScan({ ...base(), companyKioskEnabled: false }), 'kiosk_disabled', 'interrupteur éteint');
  eq(checkScan({ ...base(), user: { company_id: 'c2', is_active: true } }), 'wrong_company', 'autre entreprise refusée');
  eq(checkScan({ ...base(), user: { company_id: 'c1', is_active: false } }), 'user_inactive', 'compte archivé');
  eq(checkScan({ ...base(), lastPunchAt: new Date(base().nowMs - 30_000).toISOString() }), 'double_scan', 'double scan < 1 min');
  eq(checkScan({ ...base(), lastPunchAt: new Date(base().nowMs - 61_000).toISOString() }), null, 'scan après 1 min accepté');
});

Deno.test('Lot 11 : plus aucun contrôle GPS', async () => {
  // Une ancienne page peut encore envoyer une position ou l'option : sans effet.
  const legacy = { ...base(), requireGps: true, position: { lat: 43.3, lng: 5.4, accuracy: 5 } } as unknown as ScanContext;
  eq(checkScan(legacy), null, 'option GPS d’une ancienne page ignorée : scan accepté');
  const codes = Object.keys(REFUSAL_MESSAGES);
  eq(codes.filter((c) => /gps/i.test(c)), [], 'aucun refus « GPS » possible');
  const rules = await import('./kiosk-rules.ts') as Record<string, unknown>;
  eq(['withinRadius', 'distanceM', 'GPS_RADIUS_M'].filter((k) => k in rules), [], 'plus de calcul de distance');
});

Deno.test('Lot 11 : essais de code d’appairage — 10 par adresse, plus de 60 en tout', () => {
  eq([MAX_PAIR_FAILURES_PER_IP, MAX_PAIR_FAILURES_GLOBAL], [10, 60], 'plafonds');
  eq(pairThrottled(0, 0), false, 'aucun échec');
  eq(pairThrottled(9, 9), false, '9 échecs depuis cette adresse : encore permis');
  eq(pairThrottled(10, 10), true, '10 échecs depuis cette adresse : refusé');
  eq(pairThrottled(0, 60), false, '60 échecs en tout : encore permis');
  eq(pairThrottled(0, 61), true, 'plus de 60 échecs en tout : refusé, quelle que soit l’adresse');
});

Deno.test('Lot 11 : l’arrivée va sur le chantier prévu quand il est unique', () => {
  const AUTRE = 'w-autre', VILLA = 'w-villa', ECOLE = 'w-ecole';
  eq(arrivalPlace(AUTRE, true, [{ id: 'p1', worksite_id: VILLA, estimated_start: '08:00' }]),
    { worksiteId: VILLA, planningId: 'p1' }, 'tablette « Autre », un chantier prévu → ce chantier');
  eq(arrivalPlace(AUTRE, true, [{ id: 'pm', worksite_id: VILLA, estimated_start: '13:30' }, { id: 'am', worksite_id: VILLA, estimated_start: '08:00' }]),
    { worksiteId: VILLA, planningId: 'am' }, 'deux créneaux sur le même chantier = un chantier → le premier créneau');
  eq(arrivalPlace(AUTRE, true, [{ id: 'p1', worksite_id: VILLA }, { id: 'p2', worksite_id: ECOLE }]),
    { worksiteId: AUTRE, planningId: null }, 'deux chantiers prévus → « Autre » (comme avant)');
  eq(arrivalPlace(AUTRE, true, []), { worksiteId: AUTRE, planningId: null }, 'rien de prévu → « Autre »');
  eq(arrivalPlace(AUTRE, true, [{ id: 'pa', worksite_id: AUTRE }]), { worksiteId: AUTRE, planningId: 'pa' }, 'prévu sur « Autre » → « Autre », avec son créneau');
  eq(arrivalPlace(ECOLE, false, [{ id: 'p1', worksite_id: VILLA }]), { worksiteId: ECOLE, planningId: null }, 'ancienne borne sur un chantier → ce chantier');
  eq(arrivalPlace(ECOLE, false, [{ id: 'p1', worksite_id: ECOLE }]), { worksiteId: ECOLE, planningId: 'p1' }, 'borne sur le chantier prévu → avec le créneau');
  eq(arrivalPlace(null, true, [{ id: 'p1', worksite_id: VILLA }]), { worksiteId: VILLA, planningId: 'p1' }, 'borne sans lieu → le chantier prévu');
  eq(arrivalPlace(null, true, [{ id: 'p1', worksite_id: VILLA, estimated_start: '13:00' }, { id: 'p2', worksite_id: ECOLE, estimated_start: '08:00' }]),
    { worksiteId: ECOLE, planningId: 'p2' }, 'borne sans lieu, deux chantiers → le premier de la journée (règle d’avant)');
  eq(arrivalPlace(null, true, [{ id: 'abs', worksite_id: null }]), null, 'aucun lieu possible → null (« Prévenez le bureau »)');
});

Deno.test('Lot 11 : heures clôturées (mois ou salarié), date longue de l’en-tête', () => {
  eq(REFUSAL_MESSAGES.month_closed, 'Heures clôturées par le bureau.', 'message');
  eq(isClosedError('Ce mois est clôturé'), true, 'mois clôturé');
  eq(isClosedError('Heures clôturées jusqu’au 15/10 pour ce salarié'), true, 'clôture du salarié');
  eq(isClosedError('Mois cloture'), true, 'sans accent');
  eq(isClosedError('duplicate key'), false, 'autre erreur');
  eq(isClosedError(null), false, 'pas de message');
  eq(parisLongDate(Date.UTC(2026, 9, 1, 7, 30)), 'Jeudi 1 octobre', 'jeudi 1er octobre 2026');
  eq(parisLongDate(Date.UTC(2026, 9, 1, 22, 30)), 'Vendredi 2 octobre', 'minuit et demi à Paris = le lendemain');
});

Deno.test('Arrivée ou départ : même règle que l’appli', () => {
  eq(decideAction(null, '2026-09-29'), 'arrival', 'rien en cours → arrivée');
  eq(decideAction({ work_date: '2026-09-29' }, '2026-09-29'), 'departure', 'en cours aujourd’hui → départ');
  eq(decideAction({ work_date: '2026-09-28' }, '2026-09-29'), 'stale_session', 'oublié d’hier → pas de fermeture à l’aveugle');
  eq(parisDate(Date.UTC(2026, 8, 28, 22, 30)), '2026-09-29', 'minuit et demi à Paris = le 29');
});

Deno.test('Lot 9 : départ par finish_active_session, ancien chemin si la fonction manque', () => {
  eq(rpcMissing({ code: 'PGRST202' }), true, 'PostgREST : fonction absente du cache de schéma');
  eq(rpcMissing({ code: '42883' }), true, 'PostgreSQL : fonction inconnue');
  eq(rpcMissing({ code: 'BT001' }), false, 'un vrai refus n’est pas une fonction manquante');
  eq(rpcMissing({ code: 'P0001' }), false, 'mois clôturé, etc.');
  eq(rpcMissing(null), false, 'pas d’erreur');
  if (/quart d/i.test(REFUSAL_MESSAGES.too_short)) throw new Error(`message trop court non neutre : ${REFUSAL_MESSAGES.too_short}`);
});

Deno.test('Veille hors des horaires d’ouverture', () => {
  eq(isAsleep('05:59', '06:00', '20:00'), true, 'avant l’ouverture');
  eq(isAsleep('06:00', '06:00', '20:00'), false, 'à l’ouverture');
  eq(isAsleep('20:00', '06:00', '20:00'), true, 'à la fermeture');
  eq(isAsleep('23:00', '22:00', '06:00'), false, 'plage de nuit');
  eq(isAsleep('12:00', '22:00', '06:00'), true, 'plage de nuit, en journée');
  eq(isAsleep('03:00', null, null), false, 'sans horaires : jamais');
});

Deno.test('Mode démo : seulement sur une preview, jamais sur bemexo.com', async () => {
  const { isPreviewHost } = await import('../../../lib/hosting.ts');
  const g = globalThis as unknown as { window?: unknown };
  const at = (hostname: string) => { g.window = { location: { hostname } }; return isPreviewHost(); };
  try {
    eq(at('bemexo.com'), false, 'production');
    eq(at('www.bemexo.com'), false, 'production www');
    eq(at('bemexo.pages.dev'), false, 'production Cloudflare');
    eq(at('battime.netlify.app'), false, 'production Netlify');
    eq(at('feat-borne-qr.bemexo.pages.dev'), true, 'preview Cloudflare');
    eq(at('deploy-preview-110--battime.netlify.app'), true, 'preview Netlify');
  } finally {
    delete g.window;
  }
});
