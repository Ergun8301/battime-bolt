// Tests du QR fixe imprimable (lot 12) : `npm run test:qr-fixe` (Deno).
// Règles pures : distance, marge de précision, rayon, jeton signé.
import { createHmac } from 'node:crypto';
import {
  checkFixedPosition, distanceM, fixedQrRef, fixedQrSignature, fixedQrToken, fixedQrUrl, parsePosition, parseRadius,
  safeEqual, splitFixedToken,
  FIXED_QR_ALTERNATIVE, FIXED_QR_MARGIN_MAX_M, FIXED_QR_RADIUS_DEFAULT_M, FIXED_QR_SCAN_MAX_ACCURACY_M, FIXED_REFUSAL_MESSAGES,
} from './fixed-qr.ts';
import { schemaMissing, ticketThrottled, MAX_TICKET_FAILURES_PER_IP } from './kiosk-rules.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: unknown, msg: string) { if (!c) throw new Error(msg); }

// Un dépôt fictif à Lyon ; 1 m vers le nord ≈ 1 / 111 195 degré de latitude.
const REF = { lat: 45.7578, lng: 4.832 };
const north = (m: number) => ({ lat: REF.lat + m / 111195, lng: REF.lng });

Deno.test('distance : haversine juste à quelques mètres près', () => {
  eq(Math.round(distanceM(REF, REF)), 0, 'même point');
  ok(Math.abs(distanceM(REF, north(150)) - 150) < 0.5, `150 m au nord (${distanceM(REF, north(150))})`);
  ok(Math.abs(distanceM(REF, north(1000)) - 1000) < 1, '1 km au nord');
  // Paris – Lyon ≈ 392 km à vol d'oiseau.
  const d = distanceM({ lat: 48.8566, lng: 2.3522 }, { lat: 45.764, lng: 4.8357 });
  ok(d > 388_000 && d < 396_000, `Paris – Lyon ≈ 392 km (${Math.round(d / 1000)} km)`);
  // Vers l'est aussi (la longitude rétrécit avec la latitude).
  const east = { lat: REF.lat, lng: REF.lng + 200 / (111195 * Math.cos(REF.lat * Math.PI / 180)) };
  ok(Math.abs(distanceM(REF, east) - 200) < 1, '200 m à l’est');
});

Deno.test('zone : rayon + marge liée à la précision (plafonnée à 100 m)', () => {
  const R = FIXED_QR_RADIUS_DEFAULT_M;
  eq(R, 200, 'rayon par défaut : 200 m');
  eq(checkFixedPosition(REF, R, { ...north(150), accuracy: 20 }), 'ok', '150 m, ± 20 m : dans la zone');
  eq(checkFixedPosition(REF, R, { ...north(215), accuracy: 20 }), 'ok', '215 m, ± 20 m : dans la zone grâce à la marge');
  eq(checkFixedPosition(REF, R, { ...north(225), accuracy: 20 }), 'out_of_zone', '225 m, ± 20 m : hors zone');
  eq(checkFixedPosition(REF, R, { ...north(250), accuracy: 60 }), 'ok', '250 m, ± 60 m : dans la zone (200 + 60)');
  eq(checkFixedPosition(REF, R, { ...north(270), accuracy: 60 }), 'out_of_zone', '270 m, ± 60 m : hors zone');
  eq(checkFixedPosition(REF, R, { ...north(295), accuracy: 140 }), 'ok', '295 m, ± 140 m : marge plafonnée à 100 m → 300 m');
  eq(checkFixedPosition(REF, R, { ...north(310), accuracy: 140 }), 'out_of_zone', '310 m, ± 140 m : au-delà de 300 m');
  eq(FIXED_QR_MARGIN_MAX_M, 100, 'marge plafonnée à 100 m');
  eq(checkFixedPosition(REF, R, { ...north(10), accuracy: FIXED_QR_SCAN_MAX_ACCURACY_M + 1 }), 'position_imprecise', '± 151 m : trop imprécise, même tout près');
  eq(checkFixedPosition(REF, R, { ...north(10), accuracy: null }), 'position_imprecise', 'précision inconnue : trop imprécise');
  eq(checkFixedPosition(REF, R, null), 'position_missing', 'pas de position (refus, introuvable)');
  eq(checkFixedPosition(null, R, { ...north(10), accuracy: 5 }), 'fixed_no_point', 'point de référence pas posé');
  eq(checkFixedPosition(REF, 1000, { ...north(950), accuracy: 30 }), 'ok', 'rayon 1 000 m : 950 m accepté');
  eq(checkFixedPosition(REF, 100, { ...north(150), accuracy: 30 }), 'out_of_zone', 'rayon 100 m : 150 m refusé');
});

Deno.test('position reçue : nombres valides seulement ; rayon de 100 à 1 000 m', () => {
  eq(parsePosition({ lat: 45.7, lng: 4.8, accuracy: 12 }), { lat: 45.7, lng: 4.8, accuracy: 12 }, 'position normale');
  eq(parsePosition({ lat: '45.7', lng: '4.8', accuracy: '12' }), { lat: 45.7, lng: 4.8, accuracy: 12 }, 'en texte : convertie');
  eq(parsePosition({ lat: 45.7, lng: 4.8 }), { lat: 45.7, lng: 4.8, accuracy: null }, 'sans précision : précision inconnue');
  eq(parsePosition({ lat: 45.7, lng: 4.8, accuracy: -3 }), { lat: 45.7, lng: 4.8, accuracy: null }, 'précision négative : inconnue');
  for (const bad of [{}, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: 'x', lng: 1 }, { lat: null, lng: 1 }, { lat: NaN, lng: 1 }, { lat: Infinity, lng: 1 }]) {
    eq(parsePosition(bad as Record<string, unknown>), null, `refusée : ${JSON.stringify(bad)}`);
  }
  eq([parseRadius(100), parseRadius(200), parseRadius('500'), parseRadius(1000)], [100, 200, 500, 1000], 'rayons acceptés');
  eq([parseRadius(99), parseRadius(1001), parseRadius(150.5), parseRadius('x'), parseRadius(null)], [null, null, null, null, null], 'rayons refusés');
});

Deno.test('jeton : HMAC(clé serveur, id, sel), non stocké, régénérable', async () => {
  const id = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0';
  const tok = await fixedQrToken('cle-serveur', id, 'fixe.sel1');
  // Calcul indépendant (node:crypto) : ce que ferait n'importe quel autre serveur.
  const ref = createHmac('sha256', 'cle-serveur').update(`bemexo-fixed-qr|${id}|fixe.sel1`).digest('base64url');
  eq(tok, `${id}.${ref}`, 'jeton = id.signature (base64url, sans « = »)');
  eq(splitFixedToken(tok), { id, sig: ref }, 'découpé');
  ok(safeEqual(splitFixedToken(tok)!.sig, await fixedQrSignature('cle-serveur', id, 'fixe.sel1')), 'signature vérifiée');
  ok(!safeEqual(ref, await fixedQrSignature('cle-serveur', id, 'fixe.sel2')), 'autre sel (régénéré) : l’ancienne signature ne vaut plus');
  ok(!safeEqual(ref, await fixedQrSignature('autre-cle', id, 'fixe.sel1')), 'autre clé serveur : refusée');
  ok(!safeEqual(ref, await fixedQrSignature('cle-serveur', '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f1', 'fixe.sel1')), 'autre id : refusé');
  for (const bad of ['', 'abc', `${id}.court`, `pas-un-id.${ref}`, `${id}.${ref}x`, `${id}.${ref.slice(0, -1)}!`, `${id}${ref}`]) {
    eq(splitFixedToken(bad), null, `forme refusée : ${bad.slice(0, 30)}`);
  }
  ok(!safeEqual('abc', 'abd') && !safeEqual('abc', 'abcd') && safeEqual('abc', 'abc'), 'comparaison en temps constant');
  eq(fixedQrUrl('https://bemexo.com/', tok), `https://bemexo.com/pointer#f=${tok}`, 'adresse : /pointer#f=… (fragment, jamais envoyé au serveur du site)');
  eq(fixedQrRef(id), 'E1F0', 'référence courte imprimée : 4 caractères');
  // La graine du QR qui change chaque minute (kiosk-code.ts) n'a rien à voir.
  const seedLike = createHmac('sha256', 'cle-serveur').update(`bemexo-kiosk-seed|${id}|fixe.sel1`).digest('base64url');
  ok(seedLike !== ref, 'jeton du QR fixe ≠ graine d’une tablette (préfixes différents)');
});

Deno.test('messages : chaque refus propose l’autre moyen ; plafond de ticket ; migration absente', () => {
  for (const k of ['fixed_unavailable', 'fixed_invalid', 'fixed_revoked', 'fixed_no_point', 'position_missing', 'position_imprecise', 'out_of_zone'] as const) {
    ok(FIXED_REFUSAL_MESSAGES[k].endsWith(FIXED_QR_ALTERNATIVE), `${k} : « ${FIXED_QR_ALTERNATIVE} »`);
  }
  eq(FIXED_QR_ALTERNATIVE, 'Scannez la tablette, ou ajoutez votre intervention à la main.', 'phrase demandée');
  eq([ticketThrottled(MAX_TICKET_FAILURES_PER_IP - 1), ticketThrottled(MAX_TICKET_FAILURES_PER_IP)], [false, true], `ticket : ${MAX_TICKET_FAILURES_PER_IP} QR refusés depuis une adresse → plafond`);
  eq(['42703', '42P01', 'PGRST204', 'PGRST205', '23505', 'PGRST202'].map((code) => schemaMissing({ code })), [true, true, true, true, false, false], 'colonne / table absente reconnue');
  eq(schemaMissing(null), false, 'pas d’erreur : rien d’absent');
});
