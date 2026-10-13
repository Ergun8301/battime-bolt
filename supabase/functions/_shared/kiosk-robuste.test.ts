// Lot 30 (borne robuste) — règles pures : `npm run test:borne-robuste` (Deno).
//   · l'état de l'écran envoyé par la tablette (liste blanche, taille, types) ;
//   · les phrases du bureau (récent / périmé / absent) ;
//   · le rechargement de nuit (plage, calme, une seule fois par nuit, heure d'été) ;
//   · la version de l'appli (empreinte des fichiers de la borne) ;
//   · le service worker de la borne (ce qu'il touche, ce qu'il ne touche jamais).
import {
  CLIENT_STATE_FRESH_MS, CLIENT_STATE_MAX_BYTES, kioskNotices, parseClientState, sinceLabel,
  NOTICE_INSTALL, NOTICE_WAKE,
} from './kiosk-client-state.ts';
import {
  NIGHT_CHECK_MS, NIGHT_IDLE_MS, inNightWindow, nightReloadVerdict, parseNightMarker, type NightInput, type NightMarker,
} from './kiosk-night-reload.ts';
import { buildVersion, scriptSrcsFromHtml, versionFromHtml } from './kiosk-version.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: unknown, msg: string) { if (!c) throw new Error(msg); }

// ── 1) L'état de l'écran : liste blanche ────────────────────────────────────

const GOOD = { wake: 'held', standalone: true, fullscreen: false, online: true, version: 'a3f09c1d' };

Deno.test('client_state — un état complet passe tel quel, dans un ordre fixe', () => {
  eq(parseClientState(GOOD), GOOD, 'état complet');
  eq(parseClientState({ version: 'a3f09c1d', online: true, wake: 'denied', fullscreen: false, standalone: false }),
    { wake: 'denied', standalone: false, fullscreen: false, online: true, version: 'a3f09c1d' }, 'ordre fixe, quel que soit l’ordre reçu');
});

Deno.test('client_state — un état partiel passe ; les trois valeurs du verrou d’écran', () => {
  eq(parseClientState({ wake: 'unsupported' }), { wake: 'unsupported' }, 'verrou seul');
  eq(parseClientState({ standalone: false }), { standalone: false }, 'icône seule');
  for (const w of ['held', 'denied', 'unsupported']) eq(parseClientState({ wake: w })?.wake, w, `wake ${w}`);
});

Deno.test('client_state — champs inconnus : ignorés, jamais gardés (pas de texte libre)', () => {
  const r = parseClientState({ ...GOOD, token: 'secret-jeton', seed: 'graine', note: 'texte libre', lat: 45.7, nested: { a: 1 } });
  eq(r, GOOD, 'seuls les cinq champs connus sont gardés');
  ok(!JSON.stringify(r).includes('secret') && !JSON.stringify(r).includes('graine') && !JSON.stringify(r).includes('libre'), 'rien d’autre n’est conservé');
  eq(parseClientState({ note: 'texte libre', token: 'x' }), null, 'aucun champ connu : rejeté');
});

Deno.test('client_state — champ connu mal formé : l’objet entier est rejeté', () => {
  for (const bad of [
    { wake: 'peut-etre' }, { wake: 1 }, { wake: true }, { wake: null }, { wake: 'HELD' }, { wake: ['held'] },
    { standalone: 'true' }, { standalone: 1 }, { standalone: null }, { fullscreen: 'oui' }, { online: 0 },
    { version: 12345678 }, { version: '' }, { version: 'x'.repeat(25) }, { version: 'a b' }, { version: '<script>' },
    { version: 'a3f09c1d\n' }, { version: 'é' }, { version: { a: 1 } },
    { ...GOOD, wake: 'bad' }, { ...GOOD, version: 'a b' },
  ]) eq(parseClientState(bad), null, `rejeté : ${JSON.stringify(bad)}`);
});

Deno.test('client_state — pas un objet, ou trop gros : rejeté sans être lu', () => {
  for (const bad of [null, undefined, 'texte', 42, true, [], [GOOD], () => 1]) eq(parseClientState(bad), null, `rejeté : ${String(bad)}`);
  eq(parseClientState({}), null, 'objet vide');
  const big: Record<string, unknown> = { ...GOOD };
  for (let i = 0; i < 200; i++) big[`k${i}`] = 'x'.repeat(20);
  eq(parseClientState(big), null, 'objet de plusieurs milliers de signes : rejeté même avec des champs valables');
  eq(parseClientState({ ...GOOD, blob: 'x'.repeat(5000) }), null, 'un seul gros champ inconnu : rejeté');
  const loop: Record<string, unknown> = { wake: 'held' }; loop.self = loop;
  eq(parseClientState(loop), null, 'objet circulaire : rejeté sans lever');
});

Deno.test('client_state — « __proto__ » et consorts ne polluent rien', () => {
  const evil = JSON.parse('{"__proto__":{"wake":"held"},"constructor":{"wake":"held"},"standalone":true}');
  eq(parseClientState(evil), { standalone: true }, 'seul standalone passe');
  eq(({} as Record<string, unknown>).wake, undefined, 'Object.prototype intact');
  eq(parseClientState(JSON.parse('{"__proto__":{"wake":"held"}}')), null, 'sans champ propre connu : rejeté');
});

Deno.test('client_state — l’objet écrit tient toujours dans la borne de la base', () => {
  const r = parseClientState(GOOD);
  ok(r && JSON.stringify(r).length <= CLIENT_STATE_MAX_BYTES, `taille ${JSON.stringify(r).length} ≤ ${CLIENT_STATE_MAX_BYTES}`);
  ok(CLIENT_STATE_MAX_BYTES <= 256, 'même borne que la contrainte kiosks_client_state_forme (256 octets)');
  eq(parseClientState({ version: 'a'.repeat(24), wake: 'unsupported', standalone: false, fullscreen: false, online: false })?.version?.length, 24, 'version de 24 signes : acceptée');
});

// ── 2) Les phrases du bureau ────────────────────────────────────────────────

// Mardi 13 octobre 2026, 15:00 à Paris (13:00 UTC, heure d'été).
const NOW = Date.parse('2026-10-13T13:00:00Z');
const minAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

Deno.test('bureau — état récent : verrou refusé ou non pris en charge → « l’écran peut s’éteindre »', () => {
  for (const wake of ['denied', 'unsupported']) {
    const n = kioskNotices({ client_state: { wake, standalone: true }, client_state_at: minAgo(2) }, NOW);
    eq(n.map((x) => x.id), ['wake'], `wake ${wake}`);
    eq(n[0].text, NOTICE_WAKE, 'phrase');
    ok(n[0].help === true, 'avec un bouton « Voir comment »');
  }
  eq(NOTICE_WAKE, 'L’écran de la tablette peut s’éteindre : réglez Verrouillage auto sur Jamais.', 'texte exact');
  eq(kioskNotices({ client_state: { wake: 'held', standalone: true }, client_state_at: minAgo(1) }, NOW), [], 'verrou tenu et icône installée : rien');
});

Deno.test('bureau — état récent : icône non installée → « ouvrez la borne depuis l’icône installée »', () => {
  const n = kioskNotices({ client_state: { wake: 'held', standalone: false }, client_state_at: minAgo(3) }, NOW);
  eq(n.map((x) => x.id), ['install'], 'install');
  eq(n[0].text, NOTICE_INSTALL, 'phrase');
  eq(NOTICE_INSTALL, 'Ouvrez la borne depuis l’icône installée.', 'texte exact');
  eq(kioskNotices({ client_state: { wake: 'denied', standalone: false }, client_state_at: minAgo(3) }, NOW).map((x) => x.id), ['wake', 'install'], 'les deux, dans cet ordre');
  eq(kioskNotices({ client_state: { wake: 'held' }, client_state_at: minAgo(3) }, NOW), [], 'standalone non renseigné : on ne dit rien (inconnu n’est pas faux)');
  eq(kioskNotices({ client_state: { fullscreen: false, online: true, version: 'a3f09c1d' }, client_state_at: minAgo(3) }, NOW), [], 'plein écran / en ligne / version : jamais une phrase');
});

Deno.test('bureau — état périmé : « Tablette hors ligne depuis … », rien d’autre', () => {
  const n = kioskNotices({ client_state: { wake: 'denied', standalone: false }, client_state_at: minAgo(16) }, NOW);
  eq(n.map((x) => x.id), ['offline'], 'seule phrase');
  eq(n[0].text, 'Tablette hors ligne depuis 14:44', 'heure de Paris du dernier état reçu (12:44 UTC = 14:44 à Paris)');
  ok(!!n[0].hint && !n[0].help, 'une précision, pas de bouton');
});

Deno.test('bureau — la limite de « récent » : 15 minutes', () => {
  eq(CLIENT_STATE_FRESH_MS, 15 * 60_000, 'quinze minutes (la tablette se signale toutes les 5)');
  const st = { wake: 'denied', standalone: false };
  eq(kioskNotices({ client_state: st, client_state_at: new Date(NOW - CLIENT_STATE_FRESH_MS + 1000).toISOString() }, NOW).map((x) => x.id), ['wake', 'install'], '14 min 59 s : récent');
  eq(kioskNotices({ client_state: st, client_state_at: new Date(NOW - CLIENT_STATE_FRESH_MS).toISOString() }, NOW).map((x) => x.id), ['offline'], '15 min pile : périmé');
});

Deno.test('bureau — jamais d’état : rien (ancienne page, fonction ou migration pas en ligne)', () => {
  eq(kioskNotices({}, NOW), [], 'aucune colonne');
  eq(kioskNotices({ client_state: null, client_state_at: null }, NOW), [], 'colonnes NULL');
  eq(kioskNotices({ client_state: { wake: 'denied' }, client_state_at: null }, NOW), [], 'état sans date');
  eq(kioskNotices({ client_state: { wake: 'denied' }, client_state_at: 'pas une date' }, NOW), [], 'date illisible');
  eq(kioskNotices({ client_state: null, client_state_at: minAgo(1) }, NOW), [], 'date sans état, récente');
  eq(kioskNotices({ client_state: 'garbage', client_state_at: minAgo(1) }, NOW), [], 'état non valable, récent : rien');
  eq(kioskNotices({ client_state: { wake: 'bad' }, client_state_at: minAgo(1) }, NOW), [], 'état mal formé, récent : rien');
  eq(kioskNotices({ client_state: null, client_state_at: minAgo(60) }, NOW).map((x) => x.id), ['offline'], 'date ancienne : hors ligne (la date seule suffit)');
});

Deno.test('bureau — horloge du bureau en retard sur le serveur : jamais un âge négatif', () => {
  const future = new Date(NOW + 3 * 60_000).toISOString();
  eq(kioskNotices({ client_state: { wake: 'denied' }, client_state_at: future }, NOW).map((x) => x.id), ['wake'], 'état « du futur » : récent');
});

Deno.test('bureau — « depuis … » : aujourd’hui, hier, plus ancien (heure de Paris)', () => {
  eq(sinceLabel(Date.parse('2026-10-13T12:32:00Z'), NOW), 'depuis 14:32', 'aujourd’hui');
  eq(sinceLabel(Date.parse('2026-10-12T19:05:00Z'), NOW), 'depuis hier 21:05', 'hier');
  eq(sinceLabel(Date.parse('2026-10-11T19:05:00Z'), NOW), 'depuis le 11 oct. à 21:05', 'plus ancien');
  // Minuit à Paris : 22:00 UTC la veille en été.
  eq(sinceLabel(Date.parse('2026-10-12T22:30:00Z'), NOW), 'depuis 00:30', 'après minuit à Paris, c’est aujourd’hui');
  // Heure d'hiver : 13:00 UTC = 14:00 à Paris.
  eq(sinceLabel(Date.parse('2026-12-01T10:15:00Z'), Date.parse('2026-12-01T13:00:00Z')), 'depuis 11:15', 'heure d’hiver');
});

// ── 3) Le rechargement de nuit ──────────────────────────────────────────────

const iso = (s: string) => Date.parse(s);
const CALM = 11 * 60_000;
const base = (nowMs: number, extra: Partial<NightInput> = {}): NightInput =>
  ({ nowMs, online: true, visible: true, idleMs: CALM, busy: false, marker: null, ...extra });
// 14 oct. 2026, heure d'été (UTC+2) : 02:00 Paris = 00:00 UTC.
const N = (hhmmParis: string) => iso(`2026-10-14T${String(Number(hhmmParis.slice(0, 2)) - 2).padStart(2, '0')}:${hhmmParis.slice(3)}:00Z`);

Deno.test('nuit — la plage fermée : 02:00 inclus, 04:00 exclu (heure de Paris)', () => {
  eq(inNightWindow('01:59'), false, '01:59'); eq(inNightWindow('02:00'), true, '02:00'); eq(inNightWindow('03:59'), true, '03:59');
  eq(inNightWindow('04:00'), false, '04:00'); eq(inNightWindow('12:00'), false, 'midi'); eq(inNightWindow('23:30'), false, '23:30');
  eq(nightReloadVerdict(base(iso('2026-10-13T23:59:00Z'))), { reload: false, why: 'hors_plage' }, '01:59 Paris');
  eq(nightReloadVerdict(base(iso('2026-10-14T00:00:00Z'))), { reload: true, day: '2026-10-14' }, '02:00 Paris');
  eq(nightReloadVerdict(base(iso('2026-10-14T01:59:00Z'))), { reload: true, day: '2026-10-14' }, '03:59 Paris');
  eq(nightReloadVerdict(base(iso('2026-10-14T02:00:00Z'))), { reload: false, why: 'hors_plage' }, '04:00 Paris');
});

Deno.test('nuit — heure d’hiver : toujours 02:00–04:00 à Paris, pas en UTC', () => {
  eq(nightReloadVerdict(base(iso('2026-11-14T01:30:00Z'))), { reload: true, day: '2026-11-14' }, '02:30 Paris (UTC+1)');
  eq(nightReloadVerdict(base(iso('2026-11-14T00:30:00Z'))), { reload: false, why: 'hors_plage' }, '01:30 Paris');
  eq(nightReloadVerdict(base(iso('2026-11-14T03:30:00Z'))), { reload: false, why: 'hors_plage' }, '04:30 Paris');
});

Deno.test('nuit — jamais pendant un pointage : chaque condition, seule, suffit à empêcher', () => {
  const t = N('03:00');
  eq(nightReloadVerdict(base(t, { online: false })), { reload: false, why: 'hors_ligne' }, 'hors ligne');
  eq(nightReloadVerdict(base(t, { visible: false })), { reload: false, why: 'cachee' }, 'page cachée');
  eq(nightReloadVerdict(base(t, { busy: true })), { reload: false, why: 'occupee' }, 'QR / confirmation / appairage à l’écran');
  eq(nightReloadVerdict(base(t, { idleMs: NIGHT_IDLE_MS - 1 })), { reload: false, why: 'actif_recent' }, 'toucher il y a 9 min 59 s');
  eq(nightReloadVerdict(base(t, { idleMs: 0 })), { reload: false, why: 'actif_recent' }, 'toucher à l’instant');
  eq(nightReloadVerdict(base(t, { idleMs: NIGHT_IDLE_MS })), { reload: true, day: '2026-10-14' }, '10 min pile de calme : permis');
  eq(NIGHT_IDLE_MS, 10 * 60_000, 'dix minutes');
  eq(NIGHT_CHECK_MS, 60_000, 'une question par minute');
});

Deno.test('nuit — une seule fois par nuit, sans boucle', () => {
  const marker: NightMarker = { day: '2026-10-14', at: N('03:00') };
  eq(nightReloadVerdict(base(N('03:01'), { marker })), { reload: false, why: 'deja_fait' }, 'même jour de Paris : déjà fait');
  eq(nightReloadVerdict(base(N('03:59'), { marker })), { reload: false, why: 'deja_fait' }, 'jusqu’à la fin de la plage');
  eq(nightReloadVerdict(base(iso('2026-10-15T00:30:00Z'), { marker })), { reload: true, day: '2026-10-15' }, 'le lendemain : de nouveau permis');
  // Simulation d'une journée entière, une question par minute : exactement UN rechargement.
  let m: NightMarker | null = null; let reloads = 0;
  for (let t = iso('2026-10-14T00:00:00Z') - 6 * 3600_000; t < iso('2026-10-14T00:00:00Z') + 42 * 3600_000; t += 60_000) {
    const v = nightReloadVerdict(base(t, { marker: m }));
    if (v.reload) { reloads++; m = { day: v.day, at: t }; }
  }
  eq(reloads, 2, 'sur 48 h (deux nuits, 14 et 15 oct.) : un rechargement par nuit, jamais deux');
  let m2: NightMarker | null = null; let nights = 0;
  for (let t = iso('2026-10-14T00:00:00Z'); t < iso('2026-10-14T00:00:00Z') + 24 * 3600_000; t += 60_000) {
    const v = nightReloadVerdict(base(t, { marker: m2 }));
    if (v.reload) { nights++; m2 = { day: v.day, at: t }; }
  }
  eq(nights, 1, 'sur une nuit complète : exactement un');
});

Deno.test('nuit — hors ligne toute la nuit : aucune tentative ; le réseau revient à 03:30 : une tentative', () => {
  let m: NightMarker | null = null; let tries = 0;
  for (let t = N('02:00'); t < N('04:00'); t += 60_000) {
    const online = t >= N('03:30');
    const v = nightReloadVerdict(base(t, { online, marker: m }));
    if (v.reload) { tries++; m = { day: v.day, at: t }; }
  }
  eq(tries, 1, 'une seule tentative, après le retour du réseau');
});

Deno.test('nuit — le marqueur du stockage : lecture sûre', () => {
  eq(parseNightMarker('{"day":"2026-10-14","at":1760400000000}'), { day: '2026-10-14', at: 1760400000000 }, 'valide');
  for (const bad of [null, undefined, '', '{}', 'pas du json', '{"day":"hier"}', '{"day":20261014}', '[]', 'null', '{"day":"2026-10-14x"}']) {
    eq(parseNightMarker(bad as string | null | undefined), null, `ignoré : ${String(bad)}`);
  }
});

// ── 4) La version de l'appli ────────────────────────────────────────────────

const HTML = (page: string, extra = '', shared = '6825-79f2aaaaaaaaaaaa') => `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/_next/static/css/2b6d3227552170ff.css" data-precedence="next"/>
<script src="/_next/static/chunks/webpack-11a74969070152a4.js" async=""></script>
<script src="/_next/static/chunks/main-app-8684f186f476de43.js" async=""></script>
<script src="/_next/static/chunks/app/layout-4cb7fbe93e602ed3.js" async=""></script>
<script src="/_next/static/chunks/app/borne/page-${page}.js" async=""></script>
<script src="/_next/static/chunks/6097-b6d9c8bc9e121be7.js" async=""></script>
<script src="/_next/static/chunks/${shared}.js" async=""></script>
<script src="/_next/static/chunks/polyfills-42372ed130431b0a.js" nomodule=""></script>
<script src="/cookies/bemexo-consent.js" data-ga-id="G-X" defer=""></script>${extra}
</head><body></body></html>`;

Deno.test('version — 8 signes hexadécimaux, stable, et elle change quand la page de la borne change', () => {
  const a = versionFromHtml(HTML('16b946fa55520278'));
  ok(/^[0-9a-f]{8}$/.test(a), `forme (${a})`);
  eq(versionFromHtml(HTML('16b946fa55520278')), a, 'stable');
  ok(versionFromHtml(HTML('aaaaaaaaaaaaaaaa')) !== a, 'autre empreinte du code de la page : autre version');
});

Deno.test('version — un déploiement qui ne change QU\'UN morceau partagé (supabase-js, react-dom, fournisseur de session…) change la version', () => {
  // Constat d'une relecture : deux builds identiques sauf une constante de components/auth-provider.tsx ne changent
  // que le morceau partagé « 6825-<empreinte> » du HTML ; avec seulement 4 fichiers comptés, la version restait la même
  // et la borne gardait l'ancien code indéfiniment.
  const avant = versionFromHtml(HTML('16b946fa55520278', '', '6825-79f2aaaaaaaaaaaa'));
  const apres = versionFromHtml(HTML('16b946fa55520278', '', '6825-8b8bbbbbbbbbbbbb'));
  ok(avant !== apres, `morceau partagé modifié : ${avant} → ${apres}`);
  // Un morceau partagé de plus (ou de moins) change aussi la version.
  ok(versionFromHtml(HTML('16b946fa55520278', '<script src="/_next/static/chunks/9999-ffffffffffffffff.js" async=""></script>')) !== avant, 'morceau initial ajouté : autre version');
  // La feuille de style compte.
  const css = HTML('16b946fa55520278').replace('2b6d3227552170ff', '3c7e4338663281aa');
  ok(versionFromHtml(css) !== avant, 'autre feuille de style : autre version');
  // Attributs dans un autre ordre pour la feuille de style.
  eq(versionFromHtml(HTML('16b946fa55520278').replace('<link rel="stylesheet" href="/_next/static/css/2b6d3227552170ff.css" data-precedence="next"/>', '<link data-precedence="next" href="/_next/static/css/2b6d3227552170ff.css" rel="stylesheet">')), avant, 'ordre des attributs sans effet');
});

Deno.test('version — ni l’ordre, ni les doublons, ni un script d’hébergeur, ni un chargement différé, ni les polyfills ne la changent', () => {
  const a = versionFromHtml(HTML('16b946fa55520278'));
  const sans = (frag: string) => versionFromHtml(HTML('16b946fa55520278', frag));
  eq(sans('<script src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>'), a, 'script d’hébergeur');
  eq(sans('<script src="/_next/static/chunks/1283.0d33fe0e7f4d9014.js" async=""></script>'), a, 'chargement différé (nom avec un point : jamais dans la page au démarrage)');
  eq(sans('<script src="/_next/static/chunks/polyfills-ffffffffffffffff.js" nomodule=""></script>'), a, 'polyfills (la page ne les charge pas dans un navigateur récent)');
  eq(sans('<script src="/_next/static/media/e4af272ccee01ff0-s.p.woff2"></script><link rel="preload" href="/fonts/archivo-latin.woff2" as="font"/>'), a, 'polices');
  eq(sans('<link rel="icon" href="/favicon.svg"/><link rel="manifest" href="/borne.webmanifest"/>'), a, 'autres liens');
  const urls = ['/_next/static/css/2b6d3227552170ff.css', '/_next/static/chunks/app/borne/page-16b946fa55520278.js', '/_next/static/chunks/webpack-11a74969070152a4.js', '/_next/static/chunks/6097-b6d9c8bc9e121be7.js',
    '/_next/static/chunks/6825-79f2aaaaaaaaaaaa.js', '/_next/static/chunks/main-app-8684f186f476de43.js', '/_next/static/chunks/app/layout-4cb7fbe93e602ed3.js'];
  eq(buildVersion(urls), a, 'autre ordre');
  eq(buildVersion([...urls.map((u) => `https://bemexo.com${u}?v=1`), ...urls, '/_next/static/chunks/polyfills-42372ed130431b0a.js']), a, 'adresses absolues, requêtes, doublons');
});

Deno.test('version — inconnue (chaîne vide) quand les fichiers attendus manquent', () => {
  eq(buildVersion([]), '', 'aucun script');
  eq(versionFromHtml('<html><body>Application indisponible</body></html>'), '', 'page d’erreur');
  eq(buildVersion(['/static/js/bundle.js', '/_next/static/chunks/pages/_app.js', '/_next/static/chunks/polyfills-42372ed130431b0a.js']), '', 'serveur de développement, polyfills seuls');
  eq(scriptSrcsFromHtml('<script src="/a.js"></script><script>inline()</script><SCRIPT SRC=\'/b.js\'></SCRIPT>'), ['/a.js', '/b.js'], 'extraction des src (guillemets simples, majuscules)');
});

// ── 5) Le service worker de la borne ────────────────────────────────────────

const SW_URL = new URL('../../../public/borne-sw.js', import.meta.url);
const SW_TEXT = Deno.readTextFileSync(SW_URL);
// Le fichier est chargé tel quel, avec un « self » factice : ses règles pures sortent par module.exports.
interface SwApi {
  classify: (method: string, url: URL, mode: string, origin: string) => 'page' | 'static' | 'shell' | null;
  refsFromHtml: (html: string) => string[];
  fontsFromCss: (css: string) => string[];
  PAGE_CACHE: string; ASSET_CACHE: string; CACHE_PREFIX: string; NAV_TIMEOUT_MS: number;
  handlers: Record<string, unknown>;
}
const SW: SwApi = (() => {
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  const handlers: Record<string, unknown> = {};
  const fakeSelf = { addEventListener: (t: string, f: unknown) => { handlers[t] = f; }, location: { origin: 'https://bemexo.com' } };
  new Function('self', 'module', SW_TEXT)(fakeSelf, mod);
  return { ...(mod.exports as Omit<SwApi, 'handlers'>), handlers };
})();
const O = 'https://bemexo.com';
const cls = (method: string, url: string, mode = 'cors') => SW.classify(method, new URL(url), mode, O);

Deno.test('service worker — la page /borne est servie réseau d’abord ; rien d’autre en navigation', () => {
  eq(cls('GET', `${O}/borne`, 'navigate'), 'page', '/borne');
  eq(cls('GET', `${O}/borne?code=123456`, 'navigate'), 'page', '/borne?code=… (la copie sera rangée sous /borne seul)');
  eq(cls('GET', `${O}/borne/`, 'navigate'), 'page', '/borne/');
  for (const p of ['/', '/admin', '/poseur', '/pointer', '/connexion', '/borne-sw.js', '/borne.webmanifest', '/bornes', '/borne/autre', '/landing']) {
    eq(cls('GET', `${O}${p}`, 'navigate'), null, `navigation vers ${p} : jamais touchée`);
  }
});

Deno.test('service worker — le code et les polices : cache ; le reste de /borne : rien', () => {
  eq(cls('GET', `${O}/_next/static/chunks/app/borne/page-16b946fa55520278.js`), 'static', 'code');
  eq(cls('GET', `${O}/_next/static/css/2b6d3227552170ff.css`), 'static', 'style');
  eq(cls('GET', `${O}/_next/static/media/e4af272ccee01ff0-s.p.woff2`), 'static', 'police Next');
  eq(cls('GET', `${O}/fonts/fonts.css`), 'shell', 'fonts.css');
  eq(cls('GET', `${O}/fonts/archivo-latin.woff2`), 'shell', 'police');
  eq(cls('GET', `${O}/bemexo-wordmark-light.svg`), 'shell', 'logo');
  eq(cls('GET', `${O}/cookies/cookieconsent.umd.js`), 'shell', 'cookies');
  eq(cls('GET', `${O}/borne.webmanifest`), 'shell', 'manifeste');
  for (const p of ['/_next/data/x/borne.json', '/api/x', '/videos/demo-16x9.mp4', '/sw.js', '/borne-sw.js', '/borne?_rsc=abc', '/_next/static/chunks/a.js?_rsc=1']) {
    eq(cls('GET', `${O}${p}`), null, `${p} : le navigateur s’en charge seul`);
  }
});

Deno.test('service worker — JAMAIS un appel Supabase, une autre origine, ni autre chose qu’un GET', () => {
  for (const u of [
    'https://sdperbcquvneohotjono.supabase.co/functions/v1/kiosk', 'https://sdperbcquvneohotjono.supabase.co/rest/v1/kiosks?select=*',
    'https://sdperbcquvneohotjono.supabase.co/auth/v1/token', 'https://www.googletagmanager.com/gtag/js', 'https://fonts.googleapis.com/css2',
    'https://bemexo.com.evil.example/_next/static/chunks/a.js', 'http://bemexo.com/_next/static/chunks/a.js',
  ]) {
    eq(cls('GET', u), null, `${u} (GET) : non touché`);
    eq(cls('GET', u, 'navigate'), null, `${u} (navigation) : non touché`);
    eq(cls('POST', u), null, `${u} (POST) : non touché`);
  }
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    eq(cls(m, `${O}/_next/static/chunks/a.js`), null, `${m} sur un fichier de code : non touché`);
    eq(cls(m, `${O}/borne`, 'navigate'), null, `${m} sur /borne : non touché`);
  }
});

Deno.test('service worker — ce que la page cite est mis en cache d’avance', () => {
  const html = HTML('16b946fa55520278', `<link rel="stylesheet" href="/_next/static/css/2b6d3227552170ff.css"/><link rel="stylesheet" href="/cookies/cookieconsent.css"/>
    <link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font"/><link rel="manifest" href="/borne.webmanifest"/>
    <link rel="icon" href="//cdn.exemple.org/x.png"/><a href="/admin">x</a><img src="https://autre.exemple/logo.png"/>
    <script>self.__next_f.push([1,"...static/chunks/app/borne/page-16b946fa55520278.js..."]);self.__next_f.push([1,"static/chunks/8202-68929ebe4cb9d4f7.js"])</script>`);
  const refs: string[] = SW.refsFromHtml(html);
  for (const must of ['/_next/static/chunks/webpack-11a74969070152a4.js', '/_next/static/chunks/app/borne/page-16b946fa55520278.js', '/_next/static/css/2b6d3227552170ff.css',
    '/_next/static/media/e4af272ccee01ff0-s.p.woff2', '/cookies/cookieconsent.css', '/cookies/bemexo-consent.js', '/borne.webmanifest', '/_next/static/chunks/8202-68929ebe4cb9d4f7.js']) {
    ok(refs.includes(must), `cité : ${must}`);
  }
  ok(!refs.includes('/admin') && !refs.some((r: string) => r.includes('exemple')) && !refs.includes('/borne'), 'ni une autre page, ni une autre origine, ni la page elle-même');
  eq(new Set(refs).size, refs.length, 'sans doublon');
  ok(refs.length <= 80, 'plafonné');
  eq(SW.fontsFromCss("@font-face{src:url(/fonts/archivo-latin.woff2) format('woff2')}@font-face{src:url('/fonts/jetbrains-mono-latin.woff2')}@font-face{src:url(https://x.org/a.woff2)}@font-face{src:url(/fonts/archivo-latin.woff2)}"),
    ['/fonts/archivo-latin.woff2', '/fonts/jetbrains-mono-latin.woff2'], 'polices de fonts.css');
});

Deno.test('service worker — le fichier : cycle de vie, versions de cache, aucun lien avec le push ni avec Supabase', () => {
  eq(Object.keys(SW.handlers).sort(), ['activate', 'fetch', 'install'], 'trois écouteurs : install, activate, fetch (ni push, ni notificationclick)');
  const code = SW_TEXT.split('\n').filter((l: string) => !l.trim().startsWith('//')).join('\n');
  ok(!/supabase/i.test(code), 'le code ne cite jamais Supabase');
  ok(!/showNotification|PushManager|pushsubscription|notificationclick/i.test(code), 'aucune notification (c’est public/sw.js)');
  ok(!/\.(put|add|addAll)\([^)]*\bPOST\b/i.test(code), 'rien n’est rangé pour un POST');
  ok(/^bx-borne-page-v\d+$/.test(SW.PAGE_CACHE) && /^bx-borne-assets-v\d+$/.test(SW.ASSET_CACHE) && SW.PAGE_CACHE.startsWith(SW.CACHE_PREFIX) && SW.ASSET_CACHE.startsWith(SW.CACHE_PREFIX), 'caches versionnés, préfixe bx-borne-');
  ok(/n\.indexOf\(CACHE_PREFIX\) === 0 && n !== PAGE_CACHE && n !== ASSET_CACHE/.test(SW_TEXT), 'à l’activation, seuls les anciens caches « bx-borne-… » sont retirés');
  eq((SW_TEXT.match(/caches\.delete|cache\.delete/g) || []).length, 2, 'deux suppressions seulement : anciens caches à l’activation, plafond du cache de fichiers');
  eq(SW.NAV_TIMEOUT_MS, 4000, 'le réseau a 4 s pour répondre avant la copie');
  const push = Deno.readTextFileSync(new URL('../../../public/sw.js', import.meta.url));
  ok(/addEventListener\('push'/.test(push) && !/borne/i.test(push.split('\n').filter((l: string) => !l.trim().startsWith('//')).join('\n')), 'public/sw.js (push) est intact : il ne sait rien de la borne');
});

Deno.test('service worker — garde-fous : cache illisible, plafond du cache, redirection de l’hébergeur (le comportement réel est testé en navigateur)', () => {
  const code = SW_TEXT.split('\n').filter((l: string) => !l.trim().startsWith('//')).join('\n');
  // Un cache qui lève ne doit jamais empêcher d'ouvrir la borne en ligne : chaque respondWith retombe sur le réseau.
  ok(/respondWith\(pageResponse\(event\)\.catch\(/.test(code) && /respondWith\(staticResponse\(event\)\.catch\(/.test(code) && /respondWith\(shellResponse\(event\)\.catch\(/.test(code), 'les trois respondWith ont un repli sur le réseau');
  eq((code.match(/caches\.open\(/g) || []).length, 5, 'caches.open : 3 lectures protégées, précache, installation');
  eq((code.match(/catch \(e\) \{ cache = null; (?:hit|cached) = null;? ?(?:cached = null; )?\}/g) || []).length, 3, 'les trois lectures de cache sont dans un try/catch');
  // Le plafond du cache ne retire jamais les polices (fonts.css déjà en cache n'est pas relu : ses polices ne sont pas dans « keep »).
  ok(/if \(!keep\[p\] && !isShellAsset\(p\)\) await cache\.delete\(req\)/.test(code), 'le plafond garde les fichiers fixes (polices, logos, cookies)');
  // Une réponse redirigée ne se garde pas comme page, et l'installation va chercher la page à son adresse finale.
  ok(/!res\.redirected/.test(code) && /res\.redirected && res\.url\) res = await fetch\(res\.url/.test(code), 'pas de copie redirigée ; page finale récupérée à l’installation');
});

Deno.test('page de la borne — le service worker ne s’enregistre que sur le site construit, jamais sous `next dev`', () => {
  const lib = Deno.readTextFileSync(new URL('../../../lib/kiosk-offline.ts', import.meta.url));
  const fn = lib.slice(lib.indexOf('export function registerBorneServiceWorker'));
  ok(fn.indexOf("process.env.NODE_ENV !== 'production'") > 0 && fn.indexOf("process.env.NODE_ENV !== 'production'") < fn.indexOf('.register('), 'garde NODE_ENV avant register()');
});
