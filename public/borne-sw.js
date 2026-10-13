// Service worker de la BORNE (lot 30) — pour qu'une tablette relancée SANS
// réseau ouvre quand même la borne. Il n'a rien à voir avec public/sw.js
// (notifications push, portée « / »), qu'il ne touche pas et ne remplace pas.
//
// PORTÉE : « /borne » seulement (enregistré par la page /borne, nulle part
// ailleurs — lib/kiosk-offline.ts). Le fichier est à la racine, pas dans
// /borne/ : une portée « /borne/ » (avec barre) ne contiendrait pas la page
// « /borne » elle-même, et il faudrait un en-tête serveur pour l'élargir.
//
// CE QU'IL FAIT
//   · La PAGE (le HTML de /borne) : RÉSEAU D'ABORD. En ligne, la tablette a
//     toujours la page neuve du dernier déploiement — jamais une page périmée
//     (c'est l'avertissement de public/sw.js). Le réseau a 4 s pour répondre ;
//     passé ce délai, ou sans réseau, ou si le serveur répond autre chose qu'une
//     page (5xx, 404…), la dernière bonne page est servie (le réseau continue en arrière-plan et la remet à
//     jour). Sans réseau ET sans copie : un petit écran « Pas de réseau —
//     reprise automatique » qui recharge tout seul au retour du réseau.
//   · Les FICHIERS DE CODE (/_next/static/…, dont le nom porte l'empreinte du
//     contenu : jamais modifiés sous le même nom) : CACHE D'ABORD.
//   · Les POLICES, le logo et les scripts de cookies (/fonts/, /cookies/, les
//     deux logos, les icônes) : cache d'abord, remis à jour en arrière-plan.
//   · À chaque bonne page reçue, les fichiers qu'elle cite sont mis en cache
//     d'avance : la borne est complète même avant son premier rechargement.
//
// CE QU'IL NE FAIT JAMAIS
//   · toucher à une demande d'une autre origine (Supabase, statistiques…) ou
//     qui n'est pas un GET : elles passent directement par le navigateur,
//     comme si ce fichier n'existait pas. Aucun appel à une fonction Supabase,
//     aucune réponse de jeton, de QR ou de planning n'est donc jamais gardée ;
//   · garder la page avec son adresse complète : la copie est rangée sous
//     « /borne » seul (jamais « ?code=… »).
//
// VERSION : changer VERSION si ce fichier change de stratégie. Les caches des
// anciennes versions sont retirés à l'activation (c'est la SEULE suppression
// de ce fichier, et elle ne vise que les caches « bx-borne-… »).
//
// POUR LE RETIRER d'une tablette : publier ici un fichier dont l'activation
// appelle `self.registration.unregister()` — voir docs/borne-robuste-lot30.md.
'use strict';

const VERSION = 1;
const CACHE_PREFIX = 'bx-borne-';
const PAGE_CACHE = CACHE_PREFIX + 'page-v' + VERSION;
const ASSET_CACHE = CACHE_PREFIX + 'assets-v' + VERSION;
const PAGE_URL = '/borne';
/** Le réseau a ce temps pour répondre avant qu'on serve la copie. */
const NAV_TIMEOUT_MS = 4000;
/** Au-delà, les fichiers que la dernière page ne cite plus sont retirés. */
const MAX_ASSETS = 160;
/** Fichiers fixes de la borne, hors du HTML (non versionnés). */
const SHELL = [
  '/fonts/fonts.css', '/bemexo-wordmark-light.svg', '/bemexo-wordmark-dark.svg',
  '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/borne.webmanifest',
];
const MAX_REFS = 80;

// ── Règles pures (testées sans navigateur : voir « module.exports » en bas) ─────

function isBornePage(path) {
  return path === PAGE_URL || path === PAGE_URL + '/';
}
function isStaticAsset(path) {
  return path.indexOf('/_next/static/') === 0;
}
function isShellAsset(path) {
  return path.indexOf('/fonts/') === 0 || path.indexOf('/cookies/') === 0 || SHELL.indexOf(path) !== -1;
}

/**
 * Que fait-on de cette demande ? 'page' | 'static' | 'shell' | null (= on n'y
 * touche pas). Autre origine, autre méthode que GET, navigation hors /borne,
 * demande de données de la page (« ?_rsc= ») : null.
 */
function classify(method, url, mode, origin) {
  if (method !== 'GET') return null;
  if (url.origin !== origin) return null;
  if (mode === 'navigate') return isBornePage(url.pathname) ? 'page' : null;
  if (url.search.indexOf('_rsc=') !== -1) return null;
  if (isStaticAsset(url.pathname)) return 'static';
  if (isShellAsset(url.pathname)) return 'shell';
  return null;
}

/** Les fichiers qu'une page HTML de la borne cite (code, styles, polices, cookies), dédoublonnés. */
function refsFromHtml(html) {
  const out = [];
  const add = (p) => { if (out.indexOf(p) === -1 && out.length < MAX_REFS && (isStaticAsset(p) || isShellAsset(p))) out.push(p); };
  const attr = /\b(?:src|href)\s*=\s*["'](\/[^"'#?]*)/gi;
  let m;
  while ((m = attr.exec(html)) !== null) { if (m[1].indexOf('//') !== 0) add(m[1]); }
  // Les fichiers cités seulement dans les données de la page (« static/chunks/… »).
  const flight = /static\/(?:chunks|css|media)\/[A-Za-z0-9_.\-/]+?\.(?:js|css|woff2?)/g;
  while ((m = flight.exec(html)) !== null) add('/_next/' + m[0]);
  return out;
}

/** Les polices que fonts.css cite (url(/fonts/….woff2)). */
function fontsFromCss(css) {
  const out = [];
  const re = /url\(\s*["']?(\/fonts\/[A-Za-z0-9_.\-]+)["']?\s*\)/g;
  let m;
  while ((m = re.exec(css)) !== null) { if (out.indexOf(m[1]) === -1) out.push(m[1]); }
  return out;
}

// ── Réseau et caches ────────────────────────────────────────────────────────────

const isGoodPage = (res) =>
  res.status === 200 && res.type === 'basic' && /text\/html/i.test(res.headers.get('content-type') || '');
const isGoodFile = (res) => res.ok && res.type === 'basic';

/** L'écran sans réseau ni copie : se recharge tout seul dès que la borne répond. */
function offlinePage() {
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">'
    + '<meta name="theme-color" content="#15120F"><title>BEMEXO Borne</title>'
    + '<style>html,body{margin:0;height:100%;background:#15120F;color:#F2EDE3;font-family:system-ui,sans-serif}'
    + 'main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center}'
    + 'h1{margin:0;font-size:clamp(24px,5vw,40px);font-weight:900}p{margin:0;color:#a59c86;font-weight:600;font-size:clamp(15px,2.4vw,19px)}</style></head>'
    + '<body><main role="status"><h1>Pas de réseau — reprise automatique</h1>'
    + '<p>La borne s’ouvrira dès que la tablette retrouvera internet.</p></main>'
    + '<script>(function(){var go=function(){location.reload()};addEventListener("online",go);'
    + 'setInterval(function(){fetch("' + PAGE_URL + '",{cache:"no-store"}).then(function(r){if(r.ok)go()}).catch(function(){})},15000)})()</script>'
    + '</body></html>';
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** Met en cache d'avance les fichiers cités par le HTML de la page, et retire ceux qu'elle ne cite plus (au-delà d'un plafond). */
async function precacheFromHtml(html, extra) {
  const cache = await caches.open(ASSET_CACHE);
  const wanted = refsFromHtml(html).concat(SHELL, extra || []);
  const keep = {};
  const one = async (path) => {
    keep[path] = true;
    if (await cache.match(path, { ignoreVary: true })) return;
    try {
      const res = await fetch(path);
      if (isGoodFile(res)) {
        await cache.put(path, res.clone());
        if (path === '/fonts/fonts.css') {
          // Les polices citées par la feuille : mises en cache avec elle.
          const fonts = fontsFromCss(await res.text());
          await Promise.all(fonts.map(one));
        }
      }
    } catch (e) { /* hors ligne ou fichier absent : la prochaine bonne page réessaiera */ }
  };
  await Promise.all(wanted.map(one));
  // Plafond : si le cache a trop grossi (anciennes versions du site), on ne garde que ce que la page cite.
  const keys = await cache.keys();
  if (keys.length > MAX_ASSETS) {
    for (const req of keys) {
      const p = new URL(req.url).pathname;
      if (!keep[p]) await cache.delete(req);
    }
  }
}

/** Réseau d'abord, copie de secours (voir l'en-tête du fichier). */
async function pageResponse(event) {
  const cache = await caches.open(PAGE_CACHE);
  const cached = await cache.match(PAGE_URL, { ignoreVary: true });
  const writes = [];
  const network = fetch(event.request).then((res) => {
    if (isGoodPage(res)) {
      // La copie est rangée sous « /borne » seul, jamais sous l'adresse demandée (« ?code=… »).
      const forCache = res.clone();
      const forRefs = res.clone();
      writes.push(cache.put(PAGE_URL, forCache).then(() => forRefs.text()).then((html) => precacheFromHtml(html)).catch(() => {}));
    }
    return res;
  }, () => null);
  // Le service worker reste éveillé jusqu'à la fin des écritures.
  event.waitUntil(network.then(() => Promise.all(writes)));

  if (!cached) {
    const res = await network;
    return res || offlinePage();
  }
  const timeout = new Promise((resolve) => { setTimeout(() => resolve('timeout'), NAV_TIMEOUT_MS); });
  const first = await Promise.race([network, timeout]);
  // Une vraie réponse (2xx, ou la redirection que le navigateur suivra) : on la sert. Réseau muet, trop lent,
  // panne (5xx), page introuvable (404) : la dernière bonne page. Une page d'erreur ne remplace jamais la borne.
  if (first && first !== 'timeout' && (first.ok || first.type === 'opaqueredirect')) return first;
  return cached;
}

/** /_next/static : jamais modifié sous le même nom → cache d'abord. */
async function staticResponse(event) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(event.request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(event.request);
  if (isGoodFile(res)) event.waitUntil(cache.put(event.request, res.clone()).catch(() => {}));
  return res;
}

/** Polices, logos, cookies : cache d'abord, remis à jour en arrière-plan. */
async function shellResponse(event) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(event.request, { ignoreVary: true });
  const refresh = fetch(event.request).then((res) => {
    if (isGoodFile(res)) return cache.put(event.request, res.clone()).then(() => res, () => res);
    return res;
  }, () => null);
  if (hit) { event.waitUntil(refresh); return hit; }
  const res = await refresh;
  return res || Response.error();
}

// ── Cycle de vie ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      // La borne est prête hors ligne dès l'installation, sans attendre un second chargement.
      const res = await fetch(PAGE_URL, { cache: 'reload' });
      if (isGoodPage(res)) {
        const cache = await caches.open(PAGE_CACHE);
        await cache.put(PAGE_URL, res.clone());
        await precacheFromHtml(await res.text());
      }
    } catch (e) { /* installation hors ligne : le premier bon chargement remplira les caches */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Les caches des anciennes versions de CE fichier (et eux seuls) sont retirés.
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.indexOf(CACHE_PREFIX) === 0 && n !== PAGE_CACHE && n !== ASSET_CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  const kind = classify(req.method, url, req.mode, self.location.origin);
  if (kind === 'page') event.respondWith(pageResponse(event));
  else if (kind === 'static') event.respondWith(staticResponse(event));
  else if (kind === 'shell') event.respondWith(shellResponse(event));
  // Toute autre demande : pas de respondWith, le navigateur la traite seul.
});

// Pour les tests (Node / Deno) : les règles pures, sans service worker.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classify, refsFromHtml, fontsFromCss, isBornePage, isStaticAsset, isShellAsset, PAGE_CACHE, ASSET_CACHE, CACHE_PREFIX, NAV_TIMEOUT_MS };
}
